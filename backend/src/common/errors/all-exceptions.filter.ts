import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { AppException, ErrorBody } from './app.exception';
import { ErrorCode } from './error-codes';

/** PostgreSQL SQLSTATE for exclusion constraint violations (`no_overlap`). */
export const PG_EXCLUSION_VIOLATION = '23P01';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  501: 'NOT_IMPLEMENTED',
};

export function pgErrorCode(err: unknown): string | undefined {
  if (err instanceof QueryFailedError) return (err.driverError as { code?: string } | undefined)?.code;
  return (err as { code?: string } | undefined)?.code;
}

/** Maps every error to the spec's `{ code, message_ro, message_en, details? }` body. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const appError = this.toAppException(exception);
    for (const [name, value] of Object.entries(appError.headers)) res.setHeader(name, value);
    if (appError.getStatus() === 429 && !res.getHeader('Retry-After')) res.setHeader('Retry-After', '60');
    if (res.headersSent) return;
    res.status(appError.getStatus()).json(appError.body satisfies ErrorBody);
  }

  private toAppException(exception: unknown): AppException {
    if (exception instanceof AppException) return exception;
    if (exception instanceof HttpException) {
      const code =
        STATUS_TO_CODE[exception.getStatus()] ??
        (exception.getStatus() >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
      return new AppException(code);
    }
    if (pgErrorCode(exception) === PG_EXCLUSION_VIOLATION) {
      // Services translate this with context (SLOT_TAKEN vs SLOT_BLOCKED); this is the safe fallback.
      return new AppException('SLOT_TAKEN');
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return new AppException('INTERNAL_ERROR');
  }
}
