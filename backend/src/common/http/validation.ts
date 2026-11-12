import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from '../errors/app.exception';

/** Flattens nested class-validator errors to `{ "field.sub": ["message", ...] }`. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of errors) {
    const path = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) out[path] = Object.values(e.constraints);
    if (e.children?.length) Object.assign(out, flattenValidationErrors(e.children, path));
  }
  return out;
}

/** Invalid input -> 422 VALIDATION_FAILED with `details.fields` (UnprocessableEntity in the spec). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) =>
      new AppException('VALIDATION_FAILED', { details: { fields: flattenValidationErrors(errors) } }),
  });
}
