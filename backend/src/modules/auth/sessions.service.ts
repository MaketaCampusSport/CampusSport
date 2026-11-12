import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { KV_STORE } from '../../common/kv/kv-store';
import type { KvStore } from '../../common/kv/kv-store';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import type { Role } from '../../database/enums';

export const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth';

interface StoredSession {
  userId: string;
  secretHash: string;
  admin: boolean;
  /** Epoch ms; absolute for admins (8 h), sliding for everyone else (30 days). */
  expiresAt: number;
}

export interface IssuedSession {
  userId: string;
  token: string;
  expiresAt: number;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('base64url');
}

/**
 * Refresh tokens (SDD 8.1): opaque `<sessionId>.<secret>` in an HttpOnly cookie, stored hashed in Redis,
 * rotated on every use.
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(KV_STORE) private readonly kv: KvStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private ttlMs(admin: boolean): number {
    return admin
      ? this.config.jwt.refreshTtlAdminHours * 3_600_000
      : this.config.jwt.refreshTtlMemberDays * 86_400_000;
  }

  async create(user: { id: string; role: Role }, expiresAt?: number): Promise<IssuedSession> {
    const admin = user.role === 'admin';
    const sessionId = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const exp = expiresAt ?? Date.now() + this.ttlMs(admin);
    const ttlSeconds = Math.max(1, Math.ceil((exp - Date.now()) / 1000));
    const stored: StoredSession = { userId: user.id, secretHash: hashSecret(secret), admin, expiresAt: exp };
    await this.kv.set(`refresh:${sessionId}`, stored, ttlSeconds);
    await this.kv.sadd(`user-sessions:${user.id}`, sessionId, Math.ceil(this.ttlMs(false) / 1000));
    return { userId: user.id, token: `${sessionId}.${secret}`, expiresAt: exp };
  }

  /** Consumes the presented token and issues a new one; `null` if invalid, reused or expired. */
  async rotate(
    token: string | undefined,
    role: (userId: string) => Promise<Role | null>,
  ): Promise<IssuedSession | null> {
    const parsed = this.parse(token);
    if (!parsed) return null;
    const stored = await this.kv.take<StoredSession>(`refresh:${parsed.sessionId}`);
    if (!stored || !this.matches(stored, parsed.secret) || stored.expiresAt <= Date.now()) return null;
    await this.kv.srem(`user-sessions:${stored.userId}`, parsed.sessionId);
    const currentRole = await role(stored.userId);
    if (!currentRole) return null;
    return this.create({ id: stored.userId, role: currentRole }, stored.admin ? stored.expiresAt : undefined);
  }

  async revoke(token: string | undefined): Promise<void> {
    const parsed = this.parse(token);
    if (!parsed) return;
    const stored = await this.kv.take<StoredSession>(`refresh:${parsed.sessionId}`);
    if (stored) await this.kv.srem(`user-sessions:${stored.userId}`, parsed.sessionId);
  }

  async revokeAll(userId: string): Promise<void> {
    const ids = await this.kv.smembers(`user-sessions:${userId}`);
    await this.kv.del(...ids.map((id) => `refresh:${id}`), `user-sessions:${userId}`);
  }

  cookieOptions(expiresAt?: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'strict',
      path: COOKIE_PATH,
      ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
    };
  }

  setCookie(res: Response, session: IssuedSession): void {
    res.cookie(REFRESH_COOKIE, session.token, this.cookieOptions(session.expiresAt));
  }

  clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private parse(token: string | undefined): { sessionId: string; secret: string } | null {
    if (!token) return null;
    const [sessionId, secret] = token.split('.');
    return sessionId && secret ? { sessionId, secret } : null;
  }

  private matches(stored: StoredSession, secret: string): boolean {
    const a = Buffer.from(stored.secretHash);
    const b = Buffer.from(hashSecret(secret));
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
