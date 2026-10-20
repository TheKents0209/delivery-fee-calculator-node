import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';

let db: Db;
let server: Server;
let baseUrl: string;

beforeEach(() => {
  db = openDb(':memory:');
  server = createApp(db).listen(0);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterEach(() => {
  server.close();
});

const get = (path: string) => fetch(baseUrl + path);
const send = (method: string, path: string, body: unknown) =>
  fetch(baseUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

function observe(phenomenon: string) {
  db.prepare(
    `INSERT INTO weather_observation
       (station_name, wmo_code, air_temperature, wind_speed, phenomenon, observed_at)
     VALUES ('Tartu-Tõravere', '26242', 5, 3, ?, 0)`,
  ).run(phenomenon);
}

describe('GET /api/delivery-fee', () => {
  it('returns the fee in euros', async () => {
    observe('Light rain');
    const res = await get('/api/delivery-fee?city=TARTU&vehicleType=BIKE');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      city: 'TARTU',
      vehicleType: 'BIKE',
      deliveryFee: 3,
    });
  });

  it('returns a problem with field errors for invalid input', async () => {
    const res = await get('/api/delivery-fee?city=RIGA&vehicleType=BIKE');

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain(
      'application/problem+json',
    );
    expect(await res.json()).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'city' }],
    });
  });

  it('returns 422 when the vehicle is forbidden', async () => {
    observe('Glaze');
    const res = await get('/api/delivery-fee?city=TARTU&vehicleType=BIKE');

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'VEHICLE_FORBIDDEN' });
  });

  it('returns 404 without weather data', async () => {
    const res = await get('/api/delivery-fee?city=TARTU&vehicleType=CAR');

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'WEATHER_NOT_FOUND' });
  });
});

describe('regional base fees', () => {
  it('lists the nine seeded fees', async () => {
    const fees = (await (
      await get('/api/regional-base-fees')
    ).json()) as unknown[];
    expect(fees).toHaveLength(9);
  });

  it('updates a fee and uses it for new calculations', async () => {
    observe('Clear');
    const res = await send('PUT', '/api/regional-base-fees/TARTU/CAR', {
      fee: 4.25,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ fee: 4.25, validTo: null });
    const calc = await get('/api/delivery-fee?city=TARTU&vehicleType=CAR');
    expect(await calc.json()).toMatchObject({ deliveryFee: 4.25 });
  });

  it('rejects creating a second active fee', async () => {
    const res = await send('POST', '/api/regional-base-fees', {
      city: 'TARTU',
      vehicleType: 'CAR',
      fee: 1,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'BASE_FEE_EXISTS' });
  });

  it('rejects malformed JSON', async () => {
    const res = await fetch(`${baseUrl}/api/regional-base-fees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'MALFORMED_JSON' });
  });
});

it('serves the OpenAPI document', async () => {
  const doc = (await (await get('/openapi.json')).json()) as {
    openapi: string;
  };
  expect(doc.openapi).toBe('3.1.0');
});

it('returns a problem for unknown routes', async () => {
  const res = await get('/nope');
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ code: 'ROUTE_NOT_FOUND' });
});
