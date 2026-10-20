import { describe, expect, it } from 'vitest';
import { phenomenonGroup } from './domain.ts';

describe('phenomenonGroup', () => {
  it.each([
    ['Light snow shower', 'SNOW_OR_SLEET'], // "snow" outranks "shower"
    ['Moderate sleet', 'SNOW_OR_SLEET'],
    ['Light shower', 'RAIN'],
    ['Heavy rain', 'RAIN'],
    ['Glaze', 'GLAZE'],
    ['Hail', 'HAIL'],
    ['Thunderstorm', 'THUNDER'],
    ['Thunder with hail', 'HAIL'], // hail outranks thunder
    ['Clear', null],
    ['', null],
    [null, null],
  ])('%j → %s', (phenomenon, expected) => {
    expect(phenomenonGroup(phenomenon)).toBe(expected);
  });
});
