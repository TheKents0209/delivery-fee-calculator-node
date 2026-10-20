import { z } from 'zod';
import {
  BaseFee,
  BaseFeeKey,
  CreateBaseFee,
  DeliveryFee,
  DeliveryFeeQuery,
  Problem,
  UpdateBaseFee,
} from './schemas.ts';

const schema = (s: z.ZodType) => z.toJSONSchema(s, { io: 'input' });

const json = (s: z.ZodType) => ({
  'application/json': { schema: schema(s) },
});

const ok = (description: string, s: z.ZodType) => ({
  description,
  content: json(s),
});

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: schema(Problem) } },
});

const params = (
  s: z.ZodObject<Record<string, z.ZodType>>,
  location: 'query' | 'path',
) =>
  Object.entries(s.shape).map(([name, field]) => ({
    name,
    in: location,
    required: location === 'path' || !field.safeParse(undefined).success,
    schema: schema(field),
  }));

/** OpenAPI 3.1 document generated from the Zod schemas the routes validate with. */
export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Delivery Fee Calculator',
    version: '1.0.0',
    description:
      'Calculates food courier delivery fees from a regional base fee, vehicle type and the latest weather.',
  },
  paths: {
    '/api/delivery-fee': {
      get: {
        summary: 'Calculate delivery fee',
        description:
          'Regional base fee + weather extra fee, using the latest weather observation at or before `dateTime`.',
        parameters: params(DeliveryFeeQuery, 'query'),
        responses: {
          200: ok('Fee calculated', DeliveryFee),
          400: problem('Invalid parameters'),
          404: problem('No base fee or weather observation'),
          422: problem('Usage of selected vehicle type is forbidden'),
        },
      },
    },
    '/api/regional-base-fees': {
      get: {
        summary: 'List active regional base fees',
        responses: { 200: ok('Active base fees', z.array(BaseFee)) },
      },
      post: {
        summary: 'Create a regional base fee',
        requestBody: { required: true, content: json(CreateBaseFee) },
        responses: {
          201: ok('Created', BaseFee),
          400: problem('Invalid body'),
          409: problem('An active base fee already exists'),
        },
      },
    },
    '/api/regional-base-fees/{city}/{vehicleType}': {
      put: {
        summary: 'Change a regional base fee',
        description:
          'Expires the active fee and starts a new one from now; history is kept.',
        parameters: params(BaseFeeKey, 'path'),
        requestBody: { required: true, content: json(UpdateBaseFee) },
        responses: {
          200: ok('New active fee', BaseFee),
          400: problem('Invalid parameters or body'),
          404: problem('No active base fee'),
        },
      },
    },
  },
};
