import { vehicleForbidden } from './errors.ts';

export const CITIES = ['TALLINN', 'TARTU', 'PARNU'] as const;
export type City = (typeof CITIES)[number];

export const VEHICLE_TYPES = ['CAR', 'SCOOTER', 'BIKE'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const STATIONS: Record<City, string> = {
  TALLINN: 'Tallinn-Harku',
  TARTU: 'Tartu-Tõravere',
  PARNU: 'Pärnu',
};

/** In priority order: the first group whose keyword matches wins. */
export const PHENOMENON_GROUPS = [
  'GLAZE',
  'HAIL',
  'THUNDER',
  'SNOW_OR_SLEET',
  'RAIN',
] as const;
export type PhenomenonGroup = (typeof PHENOMENON_GROUPS)[number];

const KEYWORDS: Record<PhenomenonGroup, string[]> = {
  GLAZE: ['glaze'],
  HAIL: ['hail'],
  THUNDER: ['thunder'],
  SNOW_OR_SLEET: ['snow', 'sleet'],
  RAIN: ['rain', 'shower'],
};

export function phenomenonGroup(
  phenomenon: string | null,
): PhenomenonGroup | null {
  if (!phenomenon) return null;
  const text = phenomenon.toLowerCase();
  return (
    PHENOMENON_GROUPS.find((group) =>
      KEYWORDS[group].some((keyword) => text.includes(keyword)),
    ) ?? null
  );
}

export type WeatherObservation = {
  stationName: string;
  wmoCode: string;
  airTemperature: number | null;
  windSpeed: number | null;
  phenomenon: string | null;
  /** Epoch milliseconds. */
  observedAt: number;
};

export type WeatherRule = {
  condition: 'AIR_TEMPERATURE' | 'WIND_SPEED' | 'PHENOMENON';
  phenomenonGroup: PhenomenonGroup | null;
  /** Inclusive; null means unbounded. */
  minValue: number | null;
  /** Exclusive; null means unbounded. */
  maxValue: number | null;
  feeCents: number;
  forbidden: boolean;
};

function inRange(value: number | null, rule: WeatherRule): boolean {
  if (value === null) return false;
  return (
    (rule.minValue === null || value >= rule.minValue) &&
    (rule.maxValue === null || value < rule.maxValue)
  );
}

export function ruleMatches(
  rule: WeatherRule,
  observation: WeatherObservation,
): boolean {
  switch (rule.condition) {
    case 'AIR_TEMPERATURE':
      return inRange(observation.airTemperature, rule);
    case 'WIND_SPEED':
      return inRange(observation.windSpeed, rule);
    case 'PHENOMENON':
      return (
        rule.phenomenonGroup !== null &&
        rule.phenomenonGroup === phenomenonGroup(observation.phenomenon)
      );
  }
}

/** Sums the matching weather rules; throws if any of them forbids the vehicle. */
export function weatherExtraFeeCents(
  rules: WeatherRule[],
  observation: WeatherObservation,
): number {
  let total = 0;
  for (const rule of rules) {
    if (!ruleMatches(rule, observation)) continue;
    if (rule.forbidden) throw vehicleForbidden();
    total += rule.feeCents;
  }
  return total;
}

export const toCents = (euros: number) => Math.round(euros * 100);
export const toEuros = (cents: number) => cents / 100;
