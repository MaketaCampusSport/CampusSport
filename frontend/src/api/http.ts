import i18n from '@/i18n';
import { API_BASE } from './config';
import type { User } from './generated';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  /** Corpul complet al erorii (ex. `waitlist_offer` la 409 SLOT_TAKEN). */
  readonly body?: Record<string, unknown>;

  constructor(status: number, message: string, code?: string, details?: unknown, body?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.body = body;
  }
}

type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

/** Tokenul de acces stă doar în memorie; la reîncărcare se reface din cookie-ul HttpOnly (POST /auth/refresh). */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

let unauthorizedHandler: (() => void) | null = null;

/** Înregistrat de aplicație: ce se întâmplă când serverul răspunde 401 (sesiune expirată). */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

/** Erorile serverului au message_ro și message_en – alegem limba curentă (cu fallback pentru MSW). */
async function toApiError(res: Response): Promise<ApiError> {
  let code: string | undefined;
  let message = res.statusText || `HTTP ${res.status}`;
  let details: unknown;
  let body: Record<string, unknown> | undefined;
  try {
    const data = (await res.json()) as {
      code?: string;
      message?: string | { ro?: string; en?: string };
      message_ro?: string;
      message_en?: string;
      details?: unknown;
    };
    body = data as Record<string, unknown>;
    code = data.code;
    details = data.details;
    const lang = i18n.language?.startsWith('en') ? 'en' : 'ro';

    if (data.message_ro || data.message_en) {
      message = (lang === 'en' ? data.message_en : data.message_ro) ?? data.message_ro ?? data.message_en ?? message;
    } else if (typeof data.message === 'string') {
      message = data.message;
    } else if (data.message) {
      message = data.message[lang] ?? data.message.ro ?? data.message.en ?? message;
    }
  } catch {
    /* corp non-JSON */
  }
  return new ApiError(res.status, message, code, details, body);
}

/** Răspunsul `Session` (POST /auth/refresh, /auth/login, /auth/register). */
export interface SessionPayload {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: User;
}

let refreshPromise: Promise<SessionPayload | null> | null = null;
let sessionListener: ((session: SessionPayload | null) => void) | null = null;

/** Înregistrat de aplicație: află de fiecare sesiune reîmprospătată sau pierdută. */
export function setSessionListener(fn: ((session: SessionPayload | null) => void) | null): void {
  sessionListener = fn;
}

/** POST /auth/refresh cu cookie-ul HttpOnly; o singură cerere în zbor. `null` = nu există sesiune. */
export function refreshSession(): Promise<SessionPayload | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as SessionPayload;
      if (!data.access_token) return null;
      setAccessToken(data.access_token);
      sessionListener?.(data);
      return data;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function send(method: string, path: string, opts: RequestOptions = {}, canRetry = true): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': i18n.language?.startsWith('en') ? 'en' : 'ro',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body,
      signal: opts.signal,
      credentials: 'include',
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, i18n.t('errors.network'), 'NETWORK');
  }

  if (res.status === 401 && canRetry && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return send(method, path, opts, false);
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/') && path !== '/me') {
      setAccessToken(null);
      unauthorizedHandler?.();
    }

    throw await toApiError(res);
  }
  return res;
}

async function json<T>(method: string, path: string, opts?: RequestOptions): Promise<T> {
  const res = await send(method, path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => json<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => json<T>('POST', path, { body, query }),
  put: <T>(path: string, body?: unknown) => json<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => json<T>('PATCH', path, { body }),
  delete: <T = void>(path: string) => json<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => json<T>('POST', path, { form }),
  /** Descărcare de fișiere (export CSV/PDF). */
  async blob(path: string, query?: Query): Promise<Blob> {
    const res = await send('GET', path, { query });
    return res.blob();
  },
};