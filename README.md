# Delivery Fee Calculator (Node.js)

Calculates food courier delivery fees from a regional base fee, the vehicle type
and the current weather, imported hourly from the Estonian Environment Agency.
A Node.js port of the Fujitsu trial task.

## Tech stack

Node.js 26 (runs TypeScript directly), Express 5, `node:sqlite`, Zod, Vitest,
ESLint (`typescript-eslint`), Prettier.

## Running

    npm install
    cp .env.example .env
    npm run dev

- API: <http://localhost:3000>
- OpenAPI document: <http://localhost:3000/openapi.json> (also committed as
  [`openapi.json`](openapi.json); regenerate with `npm run openapi`)
- API documentation via Swagger: <http://localhost:3000/docs>

Weather is imported on startup and then every hour at HH:15.

| Script            | What it does                               |
| ----------------- | ------------------------------------------ |
| `npm run dev`     | Start with file watching                   |
| `npm start`       | Start                                      |
| `npm test`        | Run the tests                              |
| `npm run check`   | Typecheck, lint, format check and tests    |
| `npm run openapi` | Regenerate `openapi.json` from the schemas |

## API

### Calculate delivery fee

    GET /api/delivery-fee?city=TARTU&vehicleType=BIKE
    GET /api/delivery-fee?city=TARTU&vehicleType=BIKE&dateTime=2026-10-15T09:00:00Z

```json
{ "city": "TARTU", "vehicleType": "BIKE", "deliveryFee": 4 }
```

### Manage regional base fees

    GET  /api/regional-base-fees
    POST /api/regional-base-fees                      {"city":"TARTU","vehicleType":"CAR","fee":3.5}
    PUT  /api/regional-base-fees/TARTU/CAR            {"fee":3.75}

Changing a fee expires the old row and starts a new one, so fees for past
`dateTime` values stay reproducible.

### Errors

Errors follow [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem
details (`application/problem+json`), with a stable `code` for clients and
per-field `errors` on validation failures:

```json
{
  "type": "about:blank",
  "title": "Vehicle forbidden",
  "status": 422,
  "detail": "Usage of selected vehicle type is forbidden",
  "code": "VEHICLE_FORBIDDEN"
}
```

| Status | Code                                                         |
| ------ | ------------------------------------------------------------ |
| 400    | `VALIDATION_FAILED`, `MALFORMED_JSON`                        |
| 404    | `BASE_FEE_NOT_FOUND`, `WEATHER_NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409    | `BASE_FEE_EXISTS`                                            |
| 422    | `VEHICLE_FORBIDDEN`                                          |

## Design

- **Money is stored as integer cents** to avoid rounding errors, the API
  returns euros though.
- **Fees and weather rules have validity windows** (`validFrom`, `validTo`)
  instead of being overwritten.
- **Weather rule ranges are `[min, max)`**: −10.0 °C falls in the −10…0 range,
  20.0 m/s wind forbids bikes.
- **Phenomena are grouped by priority** (glaze, hail, thunder, snow/sleet,
  rain), so "Light snow shower" counts as snow, not rain.
