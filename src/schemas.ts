import { z } from 'zod';
import { CITIES, VEHICLE_TYPES } from './domain.ts';

export const City = z.enum(CITIES).meta({ examples: ['TARTU'] });
export const VehicleType = z.enum(VEHICLE_TYPES).meta({ examples: ['BIKE'] });

const Euros = z
  .number()
  .nonnegative()
  .multipleOf(0.01)
  .meta({ description: 'Amount in euros', examples: [3.5] });

const Timestamp = z.iso
  .datetime({ offset: true })
  .meta({ examples: ['2026-10-15T09:00:00Z'] });

export const DeliveryFeeQuery = z.object({
  city: City,
  vehicleType: VehicleType,
  dateTime: Timestamp.optional().meta({
    description:
      'ISO 8601 timestamp to calculate the fee for; defaults to now.',
  }),
});

export const DeliveryFee = z.object({
  city: City,
  vehicleType: VehicleType,
  deliveryFee: Euros,
});

export const BaseFeeKey = z.object({ city: City, vehicleType: VehicleType });

export const CreateBaseFee = z.object({
  city: City,
  vehicleType: VehicleType,
  fee: Euros,
});

export const UpdateBaseFee = z.object({ fee: Euros });

export const BaseFee = z.object({
  id: z.int(),
  city: City,
  vehicleType: VehicleType,
  fee: Euros,
  validFrom: Timestamp,
  validTo: Timestamp.nullable(),
});

/** RFC 9457 problem details, extended with a stable `code` and field `errors`. */
export const Problem = z.object({
  type: z.string().meta({ examples: ['about:blank'] }),
  title: z.string(),
  status: z.int(),
  detail: z.string(),
  code: z.string().meta({ examples: ['VEHICLE_FORBIDDEN'] }),
  errors: z
    .array(z.object({ field: z.string(), message: z.string() }))
    .optional(),
});
