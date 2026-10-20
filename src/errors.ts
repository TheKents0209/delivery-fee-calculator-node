export type FieldError = { field: string; message: string };

/** An error that maps to an RFC 9457 problem response. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly errors: FieldError[] | undefined;

  constructor(
    status: number,
    code: string,
    title: string,
    detail: string,
    errors?: FieldError[],
  ) {
    super(detail);
    this.status = status;
    this.code = code;
    this.title = title;
    this.errors = errors;
  }
}

export const vehicleForbidden = () =>
  new ApiError(
    422,
    'VEHICLE_FORBIDDEN',
    'Vehicle forbidden',
    'Usage of selected vehicle type is forbidden',
  );

export const baseFeeNotFound = (city: string, vehicleType: string, at: Date) =>
  new ApiError(
    404,
    'BASE_FEE_NOT_FOUND',
    'Regional base fee not found',
    `No regional base fee for ${city} with ${vehicleType} at ${at.toISOString()}`,
  );

export const weatherNotFound = (city: string, at: Date) =>
  new ApiError(
    404,
    'WEATHER_NOT_FOUND',
    'Weather observation not found',
    `No weather observation for ${city} at or before ${at.toISOString()}`,
  );

export const baseFeeExists = (city: string, vehicleType: string) =>
  new ApiError(
    409,
    'BASE_FEE_EXISTS',
    'Regional base fee already exists',
    `${city} already has an active base fee for ${vehicleType}; update it instead`,
  );
