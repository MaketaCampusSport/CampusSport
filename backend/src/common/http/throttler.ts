import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModuleOptions } from '@nestjs/throttler';
import { bearerToken } from '../auth/jwt-auth.guard';

/** Default limit for every route; stricter limits are set per route with @Throttle (e.g. bookings: 10/min). */
export const THROTTLER_OPTIONS: ThrottlerModuleOptions = {
  throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
};

/** Per-user tracking when a bearer token is present (SDD 8.1: "10 rezervări/minut per utilizator"), else per IP. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const token = bearerToken(req as { headers: Record<string, string | undefined> });
    if (token) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
        if (typeof payload.sub === 'string') return `user:${payload.sub}`;
      } catch {
        // fall through to IP
      }
    }
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
