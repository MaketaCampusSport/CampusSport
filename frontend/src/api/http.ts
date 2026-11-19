import i18n from '@/i18n';
import { API_BASE } from './config';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
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

let accessToken: string | null =
  import.meta.env.DEV && import.meta.env.VITE_DEV_TOKEN ? String(import.meta.env.VITE_DEV_TOKEN) : null;

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
  try {
    const data = (await res.json()) as {
      code?: string;
      message?: string | { ro?: string; en?: string };
      message_ro?: string;
      message_en?: string;
      details?: unknown;
    };
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
  return new ApiError(res.status, message, code, details);
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { access_token?: string; accessToken?: string; token?: string };
      const nextToken = data.access_token ?? data.accessToken ?? data.token ?? null;
      if (!nextToken) return false;
      setAccessToken(nextToken);
      return true;
    } catch {
      return false;
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
    const refreshed = await tryRefreshToken();
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