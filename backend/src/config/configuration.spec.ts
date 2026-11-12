import { loadConfig } from './configuration';

describe('loadConfig', () => {
  it('uses development defaults when variables are missing', () => {
    const cfg = loadConfig({ NODE_ENV: 'development' });
    expect(cfg.port).toBe(3000);
    expect(cfg.jwt.accessTtlSeconds).toBe(900);
    expect(cfg.jwt.refreshTtlMemberDays).toBe(30);
    expect(cfg.jwt.refreshTtlAdminHours).toBe(8);
    expect(cfg.cookieSecure).toBe(false);
    expect(cfg.oidc.roleMap.faculty).toBe('teacher');
  });

  it('requires secrets in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('parses explicit values', () => {
    const cfg = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      JWT_ACCESS_SECRET: 'a',
      QR_HMAC_SECRET: 'b',
      PORT: '8080',
      OIDC_ROLE_MAP: '{"staff":"admin"}',
    });
    expect(cfg.port).toBe(8080);
    expect(cfg.cookieSecure).toBe(true);
    expect(cfg.oidc.roleMap).toEqual({ staff: 'admin' });
  });

  it('builds the database URL from DB_* parts and escapes the password', () => {
    const cfg = loadConfig({
      NODE_ENV: 'development',
      DB_USER: 'postgres',
      DB_PASSWORD: 'p@ss:word',
      DB_NAME: 'campussport',
      DB_PORT: '5433',
    });
    expect(cfg.databaseUrl).toBe('postgres://postgres:p%40ss%3Aword@localhost:5433/campussport');
  });

  it('prefers DATABASE_URL over DB_* parts', () => {
    const cfg = loadConfig({ NODE_ENV: 'development', DATABASE_URL: 'postgres://u:p@h/db', DB_USER: 'x', DB_NAME: 'y' });
    expect(cfg.databaseUrl).toBe('postgres://u:p@h/db');
  });

  it('rejects a non-numeric integer', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', PORT: 'abc' })).toThrow(/PORT/);
  });
});
