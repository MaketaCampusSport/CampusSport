import type { TFunction } from 'i18next';
import { ApiError } from '@/api/http';

/** Mesajul serverului (`message_ro` / `message_en`, ales de http.ts) sau unul generic. */
export function errorMessage(error: unknown, t: TFunction): string {
  return error instanceof ApiError ? error.message : t('errors.generic');
}

/** Serverul încă răspunde 501 NOT_IMPLEMENTED (cod temporar, în afara enumerării din contract). */
export function isNotImplemented(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 501 || error.code === 'NOT_IMPLEMENTED');
}
