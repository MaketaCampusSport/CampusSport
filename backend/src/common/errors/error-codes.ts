import { HttpStatus } from '@nestjs/common';

/**
 * Stable error codes from `ErrorCode` in livrabil05/openapi.yaml, plus two codes the spec does not list:
 * NOT_IMPLEMENTED (temporary, for stubbed routes) and INTERNAL_ERROR (unexpected failures).
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'OTP_INVALID',
  'EMAIL_ALREADY_USED',
  'ACCOUNT_SUSPENDED',
  'EXTERNAL_ACCESS_DENIED',
  'SLOT_TAKEN',
  'SLOT_BLOCKED',
  'QUOTA_EXHAUSTED',
  'ACTIVE_LIMIT_REACHED',
  'WINDOW_EXCEEDED',
  'OUTSIDE_OPENING_HOURS',
  'INVALID_SLOT',
  'RESOURCE_INACTIVE',
  'BOOKING_NOT_CANCELLABLE',
  'BOOKING_NOT_ACTIVE',
  'ALREADY_CHECKED_IN',
  'QR_INVALID',
  'CHECKIN_WINDOW_CLOSED',
  'ALREADY_ON_WAITLIST',
  'OFFER_TAKEN',
  'OFFER_EXPIRED',
  'BLOCK_CONFLICT',
  'CONFLICTS_NEED_CONFIRMATION',
  'SCHEDULE_FILE_INVALID',
  'NOT_IMPLEMENTED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

interface ErrorDefinition {
  status: HttpStatus;
  ro: string;
  en: string;
}

/** HTTP status (table "Coduri de eroare" in the spec) and default user-facing messages. */
export const ERRORS: Record<ErrorCode, ErrorDefinition> = {
  BAD_REQUEST: { status: 400, ro: 'Cererea nu este corectă.', en: 'The request is not valid.' },
  UNAUTHENTICATED: { status: 401, ro: 'Te rugăm să te autentifici din nou.', en: 'Please sign in again.' },
  OTP_INVALID: {
    status: 401,
    ro: 'Codul este greșit sau a expirat.',
    en: 'The code is wrong or has expired.',
  },
  FORBIDDEN: {
    status: 403,
    ro: 'Nu ai acces la această acțiune.',
    en: 'You do not have access to this action.',
  },
  ACCOUNT_SUSPENDED: {
    status: 403,
    ro: 'Contul tău este suspendat temporar.',
    en: 'Your account is temporarily suspended.',
  },
  NOT_FOUND: {
    status: 404,
    ro: 'Nu am găsit ce ai căutat.',
    en: 'We could not find what you were looking for.',
  },
  SLOT_TAKEN: {
    status: 409,
    ro: 'Slot ocupat. Vrei să intri pe lista de așteptare?',
    en: 'Slot taken. Would you like to join the waiting list?',
  },
  SLOT_BLOCKED: { status: 409, ro: 'Slotul este blocat.', en: 'This slot is blocked.' },
  EMAIL_ALREADY_USED: {
    status: 409,
    ro: 'Există deja un cont cu acest email.',
    en: 'An account with this email already exists.',
  },
  BOOKING_NOT_CANCELLABLE: {
    status: 409,
    ro: 'Rezervarea nu mai poate fi anulată.',
    en: 'This booking can no longer be cancelled.',
  },
  BOOKING_NOT_ACTIVE: { status: 409, ro: 'Rezervarea nu este activă.', en: 'This booking is not active.' },
  ALREADY_CHECKED_IN: { status: 409, ro: 'Check-in-ul a fost deja făcut.', en: 'Already checked in.' },
  ALREADY_ON_WAITLIST: {
    status: 409,
    ro: 'Ești deja pe lista de așteptare.',
    en: 'You are already on the waiting list.',
  },
  OFFER_TAKEN: { status: 409, ro: 'Locul a fost deja luat.', en: 'Someone else took this slot.' },
  BLOCK_CONFLICT: {
    status: 409,
    ro: 'Există deja o blocare de același nivel sau mai mare pe acest interval.',
    en: 'A block of the same or higher level already covers this period.',
  },
  CONFLICTS_NEED_CONFIRMATION: {
    status: 409,
    ro: 'Există rezervări suprapuse. Confirmă anularea lor.',
    en: 'Overlapping bookings exist. Confirm to cancel them.',
  },
  OFFER_EXPIRED: { status: 410, ro: 'Oferta a expirat.', en: 'The offer has expired.' },
  VALIDATION_FAILED: {
    status: 422,
    ro: 'Unele câmpuri nu sunt valide.',
    en: 'Some fields are not valid.',
  },
  QUOTA_EXHAUSTED: {
    status: 422,
    ro: 'Ți-ai folosit intrările din această lună.',
    en: 'You have used all your entries for this month.',
  },
  ACTIVE_LIMIT_REACHED: {
    status: 422,
    ro: 'Ai atins numărul maxim de rezervări active.',
    en: 'You have reached the maximum number of active bookings.',
  },
  WINDOW_EXCEEDED: {
    status: 422,
    ro: 'Nu poți rezerva atât de departe în viitor.',
    en: 'You cannot book that far in advance.',
  },
  EXTERNAL_ACCESS_DENIED: {
    status: 422,
    ro: 'Acest slot nu este disponibil pentru persoane externe.',
    en: 'This slot is not available to external users.',
  },
  OUTSIDE_OPENING_HOURS: {
    status: 422,
    ro: 'Slotul este în afara programului.',
    en: 'The slot is outside opening hours.',
  },
  INVALID_SLOT: {
    status: 422,
    ro: 'Ora aleasă nu este începutul unui slot.',
    en: 'The chosen time is not the start of a slot.',
  },
  RESOURCE_INACTIVE: {
    status: 422,
    ro: 'Resursa nu este disponibilă.',
    en: 'This resource is not available.',
  },
  QR_INVALID: { status: 422, ro: 'Codul QR nu este valid.', en: 'The QR code is not valid.' },
  CHECKIN_WINDOW_CLOSED: {
    status: 422,
    ro: 'Check-in-ul se poate face cu 10 minute înainte și până la 15 minute după început.',
    en: 'Check-in is open from 10 minutes before to 15 minutes after the start.',
  },
  SCHEDULE_FILE_INVALID: {
    status: 422,
    ro: 'Fișierul cu orarul nu este valid.',
    en: 'The schedule file is not valid.',
  },
  RATE_LIMITED: {
    status: 429,
    ro: 'Prea multe încercări. Mai încearcă peste un minut.',
    en: 'Too many attempts. Please try again in a minute.',
  },
  INTERNAL_ERROR: {
    status: 500,
    ro: 'A apărut o eroare. Te rugăm să încerci din nou.',
    en: 'Something went wrong. Please try again.',
  },
  NOT_IMPLEMENTED: {
    status: 501,
    ro: 'Această funcție nu este încă disponibilă.',
    en: 'This feature is not available yet.',
  },
};
