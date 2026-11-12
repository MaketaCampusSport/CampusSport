/**
 * Typed application configuration, read once from environment variables.
 * Business rules (quota, windows, ...) are NOT here: they live in the `settings` table (SDD 2.1).
 */
export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  publicApiUrl: string;
  pwaUrl: string;
  facilityTimezone: string;
  databaseUrl: string;
  redisUrl: string;
  cookieSecure: boolean;
  jwt: {
    accessSecret: string;
    accessTtlSeconds: number;
    refreshTtlMemberDays: number;
    refreshTtlAdminHours: number;
  };
  qrHmacSecret: string;
  oidc: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string;
    roleClaim: string;
    roleMap: Record<string, 'student' | 'teacher' | 'admin'>;
    allowInsecure: boolean;
  };
  totpIssuer: string;
  mail: { host: string; port: number; from: string };
  vapid: { publicKey: string; privateKey: string; subject: string };
  smsDriver: 'log';
}

function required(env: NodeJS.ProcessEnv, key: string, fallbackForDev?: string): string {
  const value = env[key];
  if (value !== undefined && value !== '') return value;
  if (env.NODE_ENV !== 'production' && fallbackForDev !== undefined) return fallbackForDev;
  throw new Error(`Missing required environment variable ${key}`);
}

function int(env: NodeJS.ProcessEnv, key: string, def: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${key} must be an integer`);
  return n;
}

function bool(env: NodeJS.ProcessEnv, key: string, def: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  return raw === 'true' || raw === '1';
}

/** DATABASE_URL wins; otherwise the URL is built from DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME. */
function databaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.DB_USER || env.DB_NAME) {
    const user = encodeURIComponent(required(env, 'DB_USER'));
    const password = encodeURIComponent(env.DB_PASSWORD ?? '');
    const host = env.DB_HOST ?? 'localhost';
    const port = int(env, 'DB_PORT', 5432);
    return `postgres://${user}:${password}@${host}:${port}/${required(env, 'DB_NAME')}`;
  }
  return required(env, 'DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/campussport');
}

const DEFAULT_ROLE_MAP = {
  student: 'student',
  teacher: 'teacher',
  faculty: 'teacher',
  staff: 'teacher',
  admin: 'admin',
} as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV ?? 'development') as AppConfig['env'];
  const isProd = nodeEnv === 'production';
  return {
    env: nodeEnv,
    port: int(env, 'PORT', 3000),
    publicApiUrl: env.PUBLIC_API_URL ?? 'http://localhost:3000',
    pwaUrl: env.PWA_URL ?? 'http://localhost:5173',
    facilityTimezone: env.FACILITY_TIMEZONE ?? 'Europe/Chisinau',
    databaseUrl: databaseUrl(env),
    redisUrl: required(env, 'REDIS_URL', 'redis://localhost:6379'),
    cookieSecure: bool(env, 'COOKIE_SECURE', isProd),
    jwt: {
      accessSecret: required(env, 'JWT_ACCESS_SECRET', 'dev-only-access-secret-change-me'),
      accessTtlSeconds: int(env, 'JWT_ACCESS_TTL_SECONDS', 15 * 60),
      refreshTtlMemberDays: int(env, 'REFRESH_TTL_MEMBER_DAYS', 30),
      refreshTtlAdminHours: int(env, 'REFRESH_TTL_ADMIN_HOURS', 8),
    },
    qrHmacSecret: required(env, 'QR_HMAC_SECRET', 'dev-only-qr-secret-change-me'),
    oidc: {
      issuer: env.OIDC_ISSUER ?? 'http://localhost:8080/realms/campussport',
      clientId: env.OIDC_CLIENT_ID ?? 'campussport-api',
      clientSecret: env.OIDC_CLIENT_SECRET ?? 'campussport-dev-secret',
      redirectUri: env.OIDC_REDIRECT_URI ?? 'http://localhost:3000/api/v1/auth/sso/callback',
      scope: env.OIDC_SCOPE ?? 'openid email profile',
      roleClaim: env.OIDC_ROLE_CLAIM ?? 'campussport_roles',
      roleMap: env.OIDC_ROLE_MAP ? JSON.parse(env.OIDC_ROLE_MAP) : { ...DEFAULT_ROLE_MAP },
      allowInsecure: bool(env, 'OIDC_ALLOW_INSECURE', !isProd),
    },
    totpIssuer: env.TOTP_ISSUER ?? 'CampusSport',
    mail: {
      host: env.SMTP_HOST ?? 'localhost',
      port: int(env, 'SMTP_PORT', 1025),
      from: env.SMTP_FROM ?? 'CampusSport <no-reply@campussport.example>',
    },
    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY ?? '',
      privateKey: env.VAPID_PRIVATE_KEY ?? '',
      subject: env.VAPID_SUBJECT ?? 'mailto:admin@campussport.example',
    },
    smsDriver: 'log',
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
