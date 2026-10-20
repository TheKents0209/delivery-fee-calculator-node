import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { Db } from './db.ts';
import { toCents, toEuros } from './domain.ts';
import { ApiError } from './errors.ts';
import {
  calculateDeliveryFeeCents,
  createBaseFee,
  listActiveBaseFees,
  updateBaseFee,
  type RegionalBaseFee,
} from './fees.ts';
import { openApiDocument } from './openapi.ts';
import {
  BaseFeeKey,
  CreateBaseFee,
  DeliveryFeeQuery,
  UpdateBaseFee,
  type BaseFee,
  type DeliveryFee,
} from './schemas.ts';

const toBaseFeeResponse = (fee: RegionalBaseFee): z.infer<typeof BaseFee> => ({
  id: fee.id,
  city: fee.city,
  vehicleType: fee.vehicleType,
  fee: toEuros(fee.feeCents),
  validFrom: new Date(fee.validFrom).toISOString(),
  validTo: fee.validTo === null ? null : new Date(fee.validTo).toISOString(),
});

const sendProblem: ErrorRequestHandler = (error, _req, res, _next) => {
  let problem: ApiError;
  if (error instanceof ApiError) {
    problem = error;
  } else if (error instanceof z.ZodError) {
    problem = new ApiError(
      400,
      'VALIDATION_FAILED',
      'Invalid request',
      'One or more fields are invalid',
      error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  } else if (
    error instanceof SyntaxError &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  ) {
    problem = new ApiError(
      400,
      'MALFORMED_JSON',
      'Malformed JSON',
      'Request body is not valid JSON',
    );
  } else {
    console.error(error);
    problem = new ApiError(
      500,
      'INTERNAL_ERROR',
      'Internal server error',
      'Something went wrong',
    );
  }

  res
    .status(problem.status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: problem.title,
      status: problem.status,
      detail: problem.message,
      code: problem.code,
      ...(problem.errors && { errors: problem.errors }),
    });
};

export function createApp(db: Db) {
  const app = express();
  app.use(express.json());

  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  app.get('/api/delivery-fee', (req, res) => {
    const { city, vehicleType, dateTime } = DeliveryFeeQuery.parse(req.query);
    const at = dateTime ? new Date(dateTime) : new Date();
    const cents = calculateDeliveryFeeCents(db, city, vehicleType, at);
    const body: z.infer<typeof DeliveryFee> = {
      city,
      vehicleType,
      deliveryFee: toEuros(cents),
    };
    res.json(body);
  });

  app.get('/api/regional-base-fees', (_req, res) => {
    res.json(listActiveBaseFees(db).map(toBaseFeeResponse));
  });

  app.post('/api/regional-base-fees', (req, res) => {
    const { city, vehicleType, fee } = CreateBaseFee.parse(req.body);
    const created = createBaseFee(db, city, vehicleType, toCents(fee));
    res.status(201).json(toBaseFeeResponse(created));
  });

  app.put('/api/regional-base-fees/:city/:vehicleType', (req, res) => {
    const { city, vehicleType } = BaseFeeKey.parse(req.params);
    const { fee } = UpdateBaseFee.parse(req.body);
    const updated = updateBaseFee(db, city, vehicleType, toCents(fee));
    res.json(toBaseFeeResponse(updated));
  });

  app.get('/docs', (_req, res) => {
    res.type('html').send(`<!doctype html>
      <html><head><title>Delivery Fee API</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
      <body><div id="ui"></div>
      <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
      <script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#ui' });</script>
      </body></html>`);
  });

  app.use((req, _res, next) => {
    next(
      new ApiError(
        404,
        'ROUTE_NOT_FOUND',
        'Not found',
        `${req.method} ${req.path} does not exist`,
      ),
    );
  });
  app.use(sendProblem);

  return app;
}
