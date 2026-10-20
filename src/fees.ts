import { transaction, type Db } from './db.ts';
import {
  STATIONS,
  weatherExtraFeeCents,
  type City,
  type VehicleType,
  type WeatherObservation,
  type WeatherRule,
} from './domain.ts';
import { baseFeeExists, baseFeeNotFound, weatherNotFound } from './errors.ts';

export type RegionalBaseFee = {
  id: number;
  city: City;
  vehicleType: VehicleType;
  feeCents: number;
  validFrom: number;
  validTo: number | null;
};

const BASE_FEE_COLUMNS = `id, city, vehicle_type AS vehicleType, fee_cents AS feeCents,
  valid_from AS validFrom, valid_to AS validTo`;

export function calculateDeliveryFeeCents(
  db: Db,
  city: City,
  vehicleType: VehicleType,
  at: Date,
): number {
  const ms = at.getTime();

  const baseFee = db
    .prepare(
      `SELECT fee_cents AS feeCents FROM regional_base_fee
       WHERE city = ? AND vehicle_type = ?
         AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)`,
    )
    .get(city, vehicleType, ms, ms) as { feeCents: number } | undefined;
  if (!baseFee) throw baseFeeNotFound(city, vehicleType, at);

  const observation = db
    .prepare(
      `SELECT station_name AS stationName, wmo_code AS wmoCode, air_temperature AS airTemperature,
         wind_speed AS windSpeed, phenomenon, observed_at AS observedAt
       FROM weather_observation
       WHERE station_name = ? AND observed_at <= ?
       ORDER BY observed_at DESC LIMIT 1`,
    )
    .get(STATIONS[city], ms) as WeatherObservation | undefined;
  if (!observation) throw weatherNotFound(city, at);

  const rules = (
    db
      .prepare(
        `SELECT condition, phenomenon_group AS phenomenonGroup, min_value AS minValue,
           max_value AS maxValue, fee_cents AS feeCents, forbidden
         FROM weather_rule
         WHERE vehicle_type = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)`,
      )
      .all(vehicleType, ms, ms) as (Omit<WeatherRule, 'forbidden'> & {
      forbidden: number;
    })[]
  ).map((rule) => ({ ...rule, forbidden: rule.forbidden === 1 }));

  return baseFee.feeCents + weatherExtraFeeCents(rules, observation);
}

export function listActiveBaseFees(db: Db): RegionalBaseFee[] {
  return db
    .prepare(
      `SELECT ${BASE_FEE_COLUMNS} FROM regional_base_fee
       WHERE valid_to IS NULL ORDER BY city, vehicle_type`,
    )
    .all() as RegionalBaseFee[];
}

function findActiveBaseFee(db: Db, city: City, vehicleType: VehicleType) {
  return db
    .prepare(
      `SELECT ${BASE_FEE_COLUMNS} FROM regional_base_fee
       WHERE city = ? AND vehicle_type = ? AND valid_to IS NULL`,
    )
    .get(city, vehicleType) as RegionalBaseFee | undefined;
}

function insertBaseFee(
  db: Db,
  city: City,
  vehicleType: VehicleType,
  feeCents: number,
  validFrom: number,
): RegionalBaseFee {
  return db
    .prepare(
      `INSERT INTO regional_base_fee (city, vehicle_type, fee_cents, valid_from)
       VALUES (?, ?, ?, ?) RETURNING ${BASE_FEE_COLUMNS}`,
    )
    .get(city, vehicleType, feeCents, validFrom) as RegionalBaseFee;
}

export function createBaseFee(
  db: Db,
  city: City,
  vehicleType: VehicleType,
  feeCents: number,
  now = Date.now(),
): RegionalBaseFee {
  if (findActiveBaseFee(db, city, vehicleType)) {
    throw baseFeeExists(city, vehicleType);
  }
  return insertBaseFee(db, city, vehicleType, feeCents, now);
}

export function updateBaseFee(
  db: Db,
  city: City,
  vehicleType: VehicleType,
  feeCents: number,
  now = Date.now(),
): RegionalBaseFee {
  return transaction(db, () => {
    const current = findActiveBaseFee(db, city, vehicleType);
    if (!current) throw baseFeeNotFound(city, vehicleType, new Date(now));
    db.prepare('UPDATE regional_base_fee SET valid_to = ? WHERE id = ?').run(
      now,
      current.id,
    );
    return insertBaseFee(db, city, vehicleType, feeCents, now);
  });
}
