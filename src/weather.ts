import cron from 'node-cron';
import { XMLParser } from 'fast-xml-parser';
import { transaction, type Db } from './db.ts';
import { STATIONS, type WeatherObservation } from './domain.ts';

type RawStation = {
  name: string;
  wmocode?: string;
  airtemperature?: string;
  windspeed?: string;
  phenomenon?: string;
};

const parser = new XMLParser({
  // Keep every value a string: WMO codes have leading zeros ("06411").
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => name === 'station',
});

const numberOrNull = (value: string | undefined) =>
  value ? Number(value) : null;

/** Parses the Estonian Environment Agency observations XML. */
export function parseObservations(xml: string): WeatherObservation[] {
  const doc = parser.parse(xml) as {
    observations?: { timestamp?: string; station?: RawStation[] };
  };
  const timestamp = doc.observations?.timestamp;
  const stations = doc.observations?.station;
  if (!timestamp || !stations) {
    throw new Error('Weather API returned an empty response');
  }

  const observedAt = Number(timestamp) * 1000;
  return stations.map((station) => ({
    stationName: station.name,
    wmoCode: station.wmocode ?? '',
    airTemperature: numberOrNull(station.airtemperature),
    windSpeed: numberOrNull(station.windspeed),
    phenomenon: station.phenomenon || null,
    observedAt,
  }));
}

/** Fetches the latest observations and stores one row per supported city's station. */
export async function importWeather(db: Db, url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`Weather API responded with ${response.status}`);
  }

  const wanted = new Set(Object.values(STATIONS));
  const observations = parseObservations(await response.text()).filter(
    (observation) => wanted.has(observation.stationName),
  );

  // OR IGNORE: re-importing the same timestamp (e.g. after a restart) is a no-op.
  const insert = db.prepare(
    `INSERT OR IGNORE INTO weather_observation
       (station_name, wmo_code, air_temperature, wind_speed, phenomenon, observed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  transaction(db, () => {
    for (const o of observations) {
      insert.run(
        o.stationName,
        o.wmoCode,
        o.airTemperature,
        o.windSpeed,
        o.phenomenon,
        o.observedAt,
      );
    }
  });

  console.info(
    `Imported ${observations.length} weather observations from ${new Date(observations[0]?.observedAt ?? Date.now()).toISOString()}`,
  );
  if (observations.length < wanted.size) {
    console.warn(
      `Expected ${wanted.size} stations, received ${observations.length}`,
    );
  }
}

/**
 * Imports now, then hourly at HH:15. A failed import is logged and skipped,
 * so previously stored observations stay available.
 */
export function scheduleWeatherImport(db: Db, url: string) {
  const run = () =>
    importWeather(db, url).catch((error: unknown) => {
      console.warn('Weather import failed:', error);
    });
  void run();
  return cron.schedule('15 * * * *', run);
}
