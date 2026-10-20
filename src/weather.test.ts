import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObservations } from './weather.ts';

const observations = parseObservations(
  readFileSync(
    new URL('./fixtures/example-observation-data.xml', import.meta.url),
    'utf8',
  ),
);
const station = (name: string) => {
  const found = observations.find((o) => o.stationName === name);
  if (!found) throw new Error(`Station not in fixture: ${name}`);
  return found;
};

describe('parseObservations', () => {
  it('parses every station with the root timestamp', () => {
    expect(observations).toHaveLength(154);
    expect(observations[0]?.observedAt).toBe(1791961584 * 1000);
  });

  it('parses all fields of Tallinn-Harku', () => {
    expect(station('Tallinn-Harku')).toMatchObject({
      wmoCode: '26038',
      airTemperature: 7.3,
      windSpeed: 4.3,
      phenomenon: 'Overcast',
    });
  });

  it('handles station names with Estonian characters', () => {
    expect(station('Tartu-Tõravere').airTemperature).toBe(6.8);
    expect(station('Pärnu').windSpeed).toBe(8.3);
  });

  it('keeps the leading zero in WMO codes', () => {
    expect(station('Ardi').wmoCode).toBe('06411');
  });

  it('treats empty elements as missing values', () => {
    expect(station('Naissaare')).toMatchObject({
      airTemperature: null,
      phenomenon: null,
    });
  });

  it('rejects a response without stations', () => {
    expect(() => parseObservations('<observations/>')).toThrow(
      'empty response',
    );
  });
});
