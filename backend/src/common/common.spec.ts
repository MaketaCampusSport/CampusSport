import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsString, Min } from 'class-validator';
import { QueryFailedError } from 'typeorm';
import { createTestApp, TestApp, TEST_USERS } from '../testing/test-app';
import type { AuthUser } from './auth/auth.types';
import { isSuspended } from './auth/auth.types';
import { CurrentUser, Public, Roles } from './auth/decorators';
import { AppException, notImplemented } from './errors/app.exception';
import { ERROR_CODES, ERRORS } from './errors/error-codes';
import { PageQueryDto, pageOf } from './http/pagination';

class EchoDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  count: number;
}

@Controller('probe')
class ProbeController {
  @Public()
  @Get('public')
  publicRoute(@CurrentUser() user?: AuthUser) {
    return { user_id: user?.id ?? null };
  }

  @Get('private')
  privateRoute(@CurrentUser() user: AuthUser) {
    return { user_id: user.id };
  }

  @Roles('admin')
  @Get('admin')
  adminRoute() {
    return { ok: true };
  }

  @Public()
  @Post('echo')
  echo(@Body() body: EchoDto) {
    return body;
  }

  @Public()
  @Get('page')
  page(@Query() q: PageQueryDto) {
    return pageOf(q, ['a'], 57);
  }

  @Public()
  @Get('errors/app')
  appError() {
    throw new AppException('QUOTA_EXHAUSTED', {
      message_ro: 'Ți-ai folosit cele 4 intrări din noiembrie.',
      message_en: 'You have used all 4 entries for November.',
    });
  }

  @Public()
  @Get('errors/http')
  httpError() {
    throw new NotFoundException();
  }

  @Public()
  @Get('errors/overlap')
  overlap() {
    throw new QueryFailedError('INSERT', [], Object.assign(new Error('conflicting key'), { code: '23P01' }));
  }

  @Public()
  @Get('errors/crash')
  crash() {
    throw new Error('boom');
  }

  @Public()
  @Get('errors/stub')
  stub() {
    notImplemented();
  }

  @Public()
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Get('limited')
  limited() {
    return { ok: true };
  }
}

describe('common HTTP layer', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [ProbeController] });
  });
  afterAll(() => t.close());

  describe('authentication (JwtAuthGuard)', () => {
    it('public route works anonymously', async () => {
      const res = await t.http().get('/api/v1/probe/public').expect(200);
      expect(res.body).toEqual({ user_id: null });
    });

    it('public route still identifies a caller with a valid token', async () => {
      const res = await t
        .http()
        .get('/api/v1/probe/public')
        .set('Authorization', await t.bearer('student'))
        .expect(200);
      expect(res.body.user_id).toBe(TEST_USERS.student.id);
    });

    it('protected route without token -> 401 UNAUTHENTICATED', async () => {
      const res = await t.http().get('/api/v1/probe/private').expect(401);
      expect(res.body).toEqual({
        code: 'UNAUTHENTICATED',
        message_ro: 'Te rugăm să te autentifici din nou.',
        message_en: 'Please sign in again.',
      });
    });

    it('protected route with a forged token -> 401', async () => {
      await t.http().get('/api/v1/probe/private').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    });

    it('protected route with a valid token -> 200', async () => {
      const res = await t
        .http()
        .get('/api/v1/probe/private')
        .set('Authorization', await t.bearer('teacher'))
        .expect(200);
      expect(res.body.user_id).toBe(TEST_USERS.teacher.id);
    });

    it('@Roles(admin): student -> 403 FORBIDDEN, admin -> 200', async () => {
      const res = await t
        .http()
        .get('/api/v1/probe/admin')
        .set('Authorization', await t.bearer('student'))
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
      await t
        .http()
        .get('/api/v1/probe/admin')
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
    });
  });

  describe('validation', () => {
    it('invalid body -> 422 VALIDATION_FAILED with field details', async () => {
      const res = await t.http().post('/api/v1/probe/echo').send({ name: 5, count: 0 }).expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(res.body.details.fields).sort()).toEqual(['count', 'name']);
    });

    it('unknown fields are rejected', async () => {
      const res = await t
        .http()
        .post('/api/v1/probe/echo')
        .send({ name: 'x', count: 1, extra: true })
        .expect(422);
      expect(res.body.details.fields.extra).toBeDefined();
    });

    it('valid body passes', async () => {
      await t
        .http()
        .post('/api/v1/probe/echo')
        .send({ name: 'x', count: 1 })
        .expect(201, { name: 'x', count: 1 });
    });
  });

  describe('pagination', () => {
    it('applies defaults page=1, page_size=20', async () => {
      const res = await t.http().get('/api/v1/probe/page').expect(200);
      expect(res.body).toEqual({ page: 1, page_size: 20, total: 57, items: ['a'] });
    });

    it('parses query values and rejects page_size > 100', async () => {
      const res = await t.http().get('/api/v1/probe/page?page=3&page_size=50').expect(200);
      expect(res.body).toMatchObject({ page: 3, page_size: 50 });
      await t.http().get('/api/v1/probe/page?page_size=101').expect(422);
    });
  });

  describe('error mapping', () => {
    it('AppException keeps code and custom messages', async () => {
      const res = await t.http().get('/api/v1/probe/errors/app').expect(422);
      expect(res.body).toEqual({
        code: 'QUOTA_EXHAUSTED',
        message_ro: 'Ți-ai folosit cele 4 intrări din noiembrie.',
        message_en: 'You have used all 4 entries for November.',
      });
    });

    it('Nest HttpException -> spec code', async () => {
      const res = await t.http().get('/api/v1/probe/errors/http').expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('no_overlap violation (23P01) -> 409 SLOT_TAKEN', async () => {
      const res = await t.http().get('/api/v1/probe/errors/overlap').expect(409);
      expect(res.body.code).toBe('SLOT_TAKEN');
    });

    it('unexpected error -> 500 INTERNAL_ERROR without internals', async () => {
      const res = await t.http().get('/api/v1/probe/errors/crash').expect(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('boom');
    });

    it('stubbed route -> 501 NOT_IMPLEMENTED', async () => {
      const res = await t.http().get('/api/v1/probe/errors/stub').expect(501);
      expect(res.body.code).toBe('NOT_IMPLEMENTED');
    });

    it('unknown route -> 404 NOT_FOUND', async () => {
      const res = await t.http().get('/api/v1/nope').expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('rate limiting', () => {
    it('-> 429 RATE_LIMITED with Retry-After after the limit', async () => {
      await t.http().get('/api/v1/probe/limited').expect(200);
      await t.http().get('/api/v1/probe/limited').expect(200);
      const res = await t.http().get('/api/v1/probe/limited').expect(429);
      expect(res.body.code).toBe('RATE_LIMITED');
      expect(res.headers['retry-after']).toBeDefined();
    });
  });
});

describe('error catalogue', () => {
  it('defines status and both messages for every code', () => {
    for (const code of ERROR_CODES) {
      expect(ERRORS[code].status).toBeGreaterThanOrEqual(400);
      expect(ERRORS[code].ro.length).toBeGreaterThan(0);
      expect(ERRORS[code].en.length).toBeGreaterThan(0);
    }
  });
});

describe('isSuspended', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  it('is true until suspended_until, false afterwards and for active users', () => {
    expect(isSuspended({ status: 'suspended', suspendedUntil: new Date('2026-11-26T00:00:00Z') }, now)).toBe(
      true,
    );
    expect(isSuspended({ status: 'suspended', suspendedUntil: new Date('2026-11-01T00:00:00Z') }, now)).toBe(
      false,
    );
    expect(isSuspended({ status: 'active', suspendedUntil: null }, now)).toBe(false);
  });
});
