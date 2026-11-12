import { HttpException } from '@nestjs/common';
import { ERRORS, ErrorCode } from './error-codes';

/** Error body from the spec (`Error` schema), optionally extended (e.g. `waitlist_offer`, `conflicts`). */
export interface ErrorBody {
  code: ErrorCode;
  message_ro: string;
  message_en: string;
  details?: Record<string, unknown>;
  [extra: string]: unknown;
}

export interface AppExceptionOptions {
  message_ro?: string;
  message_en?: string;
  details?: Record<string, unknown>;
  /** Extra top-level fields, e.g. `{ waitlist_offer }` for SlotConflictError. */
  extra?: Record<string, unknown>;
  /** Extra response headers, e.g. Retry-After. */
  headers?: Record<string, string>;
}

export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly headers: Record<string, string>;

  constructor(code: ErrorCode, options: AppExceptionOptions = {}) {
    const def = ERRORS[code];
    const body: ErrorBody = {
      code,
      message_ro: options.message_ro ?? def.ro,
      message_en: options.message_en ?? def.en,
      ...(options.details ? { details: options.details } : {}),
      ...(options.extra ?? {}),
    };
    super(body, def.status);
    this.code = code;
    this.headers = options.headers ?? {};
  }

  get body(): ErrorBody {
    return this.getResponse() as ErrorBody;
  }
}

/** Shorthand used by stubbed routes of the spec. */
export function notImplemented(): never {
  throw new AppException('NOT_IMPLEMENTED');
}
