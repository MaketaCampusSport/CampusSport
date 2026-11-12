import { INestApplication, ModuleMetadata, Provider, Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { configureApp } from '../app.setup';
import { AUTH_USER_LOADER, AuthUser, AuthUserLoader } from '../common/auth/auth.types';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { TokenService } from '../common/auth/token.service';
import { THROTTLER_OPTIONS, UserThrottlerGuard } from '../common/http/throttler';
import { APP_CONFIG, AppConfig, loadConfig } from '../config/configuration';
import { EXAMPLE_USERS } from '../database/seeds/example-data';

export const TEST_JWT_SECRET = 'test-secret';
export const TEST_CONFIG: AppConfig = loadConfig({ NODE_ENV: 'test', JWT_ACCESS_SECRET: TEST_JWT_SECRET });

/** Callers available in controller tests: the example users plus a suspended student. */
export const TEST_USERS = {
  student: toAuth(EXAMPLE_USERS.student),
  teacher: toAuth(EXAMPLE_USERS.teacher),
  admin: toAuth(EXAMPLE_USERS.admin),
  external: toAuth(EXAMPLE_USERS.external),
  suspended: {
    id: '0f9e8d7c-6b5a-4493-8271-605f4e3d2c1b',
    role: 'student',
    fullName: 'Vlad Suspendat',
    email: 'vlad@student.example.edu',
    status: 'suspended',
    suspendedUntil: new Date('2099-01-01T00:00:00Z'),
  },
} satisfies Record<string, AuthUser>;

export type TestCaller = keyof typeof TEST_USERS;

function toAuth(u: { id: string; role: AuthUser['role']; full_name: string; email: string }): AuthUser {
  return {
    id: u.id,
    role: u.role,
    fullName: u.full_name,
    email: u.email,
    status: 'active',
    suspendedUntil: null,
  };
}

class FakeAuthUserLoader implements AuthUserLoader {
  async load(userId: string): Promise<AuthUser | null> {
    return Object.values(TEST_USERS).find((u) => u.id === userId) ?? null;
  }
}

export interface TestApp {
  app: INestApplication;
  /** Supertest agent bound to the app; paths include the /api/v1 prefix. */
  http: () => ReturnType<typeof request>;
  /** `Authorization` header value for an example caller. */
  bearer: (caller: TestCaller) => Promise<string>;
  get: <T>(token: Type<T> | string | symbol) => T;
  close: () => Promise<void>;
}

/**
 * Builds a Nest app around the given controllers with the production HTTP pipeline (prefix, validation,
 * error filter, JWT guard, throttler); services are supplied as mocks by the test.
 */
export async function createTestApp(
  metadata: Pick<ModuleMetadata, 'controllers' | 'imports'> & { providers?: Provider[] },
): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      JwtModule.register({ secret: TEST_JWT_SECRET }),
      ThrottlerModule.forRoot(THROTTLER_OPTIONS),
      ...(metadata.imports ?? []),
    ],
    controllers: metadata.controllers ?? [],
    providers: [
      { provide: APP_CONFIG, useValue: TEST_CONFIG },
      { provide: AUTH_USER_LOADER, useClass: FakeAuthUserLoader },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: UserThrottlerGuard },
      TokenService,
      ...(metadata.providers ?? []),
    ],
  }).compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  const jwt = moduleRef.get(JwtService);

  return {
    app,
    http: () => request(app.getHttpServer()),
    bearer: async (caller) => {
      const u = TEST_USERS[caller];
      return `Bearer ${await jwt.signAsync({ sub: u.id, role: u.role, typ: 'access' })}`;
    },
    get: (token) => moduleRef.get(token as never),
    close: () => app.close(),
  };
}
