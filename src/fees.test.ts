import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './db.ts';
import { STATIONS, type City, type VehicleType } from './domain.ts';
import { ApiError } from './errors.ts';
import { calculateDeliveryFeeCents, updateBaseFee } from './fees.ts';

const NOW = new Date('2026-10-15T09:00:00Z');

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
});

function observe(
  city: City,
  weather: {
    airTemperature?: number;
    windSpeed?: number;
    phenomenon?: string;
  },
  at = NOW,
) {
  db.prepare(
    `INSERT INTO weather_observation
       (station_name, wmo_code, air_temperature, wind_speed, phenomenon, observed_at)
     VALUES (?, '00000', ?, ?, ?, ?)`,
  ).run(
    STATIONS[city],
    weather.airTemperature ?? 10,
    weather.windSpeed ?? 0,
    weather.phenomenon ?? 'Clear',
    at.getTime(),
  );
}

const fee = (city: City, vehicleType: VehicleType, at = NOW) =>
  calculateDeliveryFeeCents(db, city, vehicleType, at);

function errorCode(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
  throw new Error('Expected an ApiError');
}

describe('calculateDeliveryFeeCents', () => {
  it('matches the example from the task: Tartu, bike, −2.1 °C, 4.7 m/s, light snow shower', () => {
    observe('TARTU', {
      airTemperature: -2.1,
      windSpeed: 4.7,
      phenomenon: 'Light snow shower',
    });
    expect(fee('TARTU', 'BIKE')).toBe(250 + 50 + 100);
  });

  it('charges cars only the regional base fee', () => {
    observe('TALLINN', {
      airTemperature: -20,
      windSpeed: 30,
      phenomenon: 'Glaze',
    });
    expect(fee('TALLINN', 'CAR')).toBe(400);
  });

  describe('air temperature ranges are [min, max)', () => {
    it.each([
      [-10.1, 100],
      [-10, 50],
      [-0.1, 50],
      [0, 0],
    ])('%d °C → +%d cents', (airTemperature, extra) => {
      observe('PARNU', { airTemperature });
      expect(fee('PARNU', 'SCOOTER')).toBe(250 + extra);
    });
  });

  describe('wind speed ranges are [min, max)', () => {
    it.each([
      [9.9, 0],
      [10, 50],
      [19.9, 50],
    ])('%d m/s → +%d cents', (windSpeed, extra) => {
      observe('PARNU', { windSpeed });
      expect(fee('PARNU', 'BIKE')).toBe(200 + extra);
    });

    it('forbids bikes from 20 m/s', () => {
      observe('PARNU', { windSpeed: 20 });
      expect(errorCode(() => fee('PARNU', 'BIKE'))).toBe('VEHICLE_FORBIDDEN');
    });

    it('ignores wind for scooters', () => {
      observe('PARNU', { windSpeed: 25 });
      expect(fee('PARNU', 'SCOOTER')).toBe(250);
    });
  });

  it.each(['Glaze', 'Hail', 'Thunder'])('forbids bikes in %s', (phenomenon) => {
    observe('TALLINN', { phenomenon });
    expect(errorCode(() => fee('TALLINN', 'BIKE'))).toBe('VEHICLE_FORBIDDEN');
  });

  it('uses the latest observation at or before the requested time', () => {
    observe(
      'TARTU',
      { phenomenon: 'Heavy rain' },
      new Date('2026-10-15T08:00:00Z'),
    );
    observe('TARTU', { phenomenon: 'Clear' }, new Date('2026-10-15T10:00:00Z'));
    expect(fee('TARTU', 'BIKE', NOW)).toBe(250 + 50);
  });

  it('fails when there is no observation yet', () => {
    expect(errorCode(() => fee('TARTU', 'BIKE'))).toBe('WEATHER_NOT_FOUND');
  });

  it('uses the base fee that was valid at the requested time', () => {
    observe('TARTU', {}, new Date('2026-01-01T00:00:00Z'));
    updateBaseFee(db, 'TARTU', 'CAR', 500, NOW.getTime());

    expect(fee('TARTU', 'CAR', new Date(NOW.getTime() - 1))).toBe(350);
    expect(fee('TARTU', 'CAR', NOW)).toBe(500);
  });
});
