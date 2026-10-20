import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS regional_base_fee (
  id           INTEGER PRIMARY KEY,
  city         TEXT    NOT NULL CHECK (city IN ('TALLINN', 'TARTU', 'PARNU')),
  vehicle_type TEXT    NOT NULL CHECK (vehicle_type IN ('CAR', 'SCOOTER', 'BIKE')),
  fee_cents    INTEGER NOT NULL CHECK (fee_cents >= 0),
  valid_from   INTEGER NOT NULL,
  valid_to     INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_base_fee
  ON regional_base_fee (city, vehicle_type) WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS weather_rule (
  id               INTEGER PRIMARY KEY,
  condition        TEXT    NOT NULL CHECK (condition IN ('AIR_TEMPERATURE', 'WIND_SPEED', 'PHENOMENON')),
  phenomenon_group TEXT    CHECK ((condition = 'PHENOMENON') = (phenomenon_group IS NOT NULL)),
  vehicle_type     TEXT    NOT NULL CHECK (vehicle_type IN ('CAR', 'SCOOTER', 'BIKE')),
  min_value        REAL,
  max_value        REAL,
  fee_cents        INTEGER NOT NULL CHECK (fee_cents >= 0),
  forbidden        INTEGER NOT NULL CHECK (forbidden IN (0, 1)),
  valid_from       INTEGER NOT NULL,
  valid_to         INTEGER
);

CREATE TABLE IF NOT EXISTS weather_observation (
  id              INTEGER PRIMARY KEY,
  station_name    TEXT    NOT NULL,
  wmo_code        TEXT    NOT NULL,
  air_temperature REAL,
  wind_speed      REAL,
  phenomenon      TEXT,
  observed_at     INTEGER NOT NULL,
  UNIQUE (station_name, observed_at)
);
`;

const BASE_FEES = [
  ['TALLINN', 'CAR', 400],
  ['TALLINN', 'SCOOTER', 350],
  ['TALLINN', 'BIKE', 300],
  ['TARTU', 'CAR', 350],
  ['TARTU', 'SCOOTER', 300],
  ['TARTU', 'BIKE', 250],
  ['PARNU', 'CAR', 300],
  ['PARNU', 'SCOOTER', 250],
  ['PARNU', 'BIKE', 200],
] as const;

const WEATHER_RULES = (['BIKE', 'SCOOTER'] as const).flatMap((vehicle) => [
  ['AIR_TEMPERATURE', null, vehicle, null, -10, 100, 0],
  ['AIR_TEMPERATURE', null, vehicle, -10, 0, 50, 0],
  ['PHENOMENON', 'SNOW_OR_SLEET', vehicle, null, null, 100, 0],
  ['PHENOMENON', 'RAIN', vehicle, null, null, 50, 0],
  ['PHENOMENON', 'GLAZE', vehicle, null, null, 0, 1],
  ['PHENOMENON', 'HAIL', vehicle, null, null, 0, 1],
  ['PHENOMENON', 'THUNDER', vehicle, null, null, 0, 1],
  ...(vehicle === 'BIKE'
    ? [
        ['WIND_SPEED', null, vehicle, 10, 20, 50, 0],
        ['WIND_SPEED', null, vehicle, 20, null, 0, 1],
      ]
    : []),
]);

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function seed(db: Db) {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

  transaction(db, () => {
    if (count('regional_base_fee') === 0) {
      const insert = db.prepare(
        'INSERT INTO regional_base_fee (city, vehicle_type, fee_cents, valid_from) VALUES (?, ?, ?, 0)',
      );
      for (const row of BASE_FEES) insert.run(...row);
    }
    if (count('weather_rule') === 0) {
      const insert = db.prepare(
        `INSERT INTO weather_rule
           (condition, phenomenon_group, vehicle_type, min_value, max_value, fee_cents, forbidden, valid_from)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      );
      for (const row of WEATHER_RULES) insert.run(...row);
    }
  });
}

/** Opens (or creates) the database, applies the schema and seeds defaults into empty tables. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  seed(db);
  return db;
}
