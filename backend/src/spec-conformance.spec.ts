import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { IS_PUBLIC_KEY, ROLES_KEY } from './common/auth/decorators';
import { AdminController } from './modules/admin/admin.controller';
import { AdminUsersController } from './modules/auth/admin-users.controller';
import { AuthController } from './modules/auth/auth.controller';
import { MeController } from './modules/auth/me.controller';
import { AvailabilityController } from './modules/availability/availability.controller';
import { BlocksController } from './modules/blocks/blocks.controller';
import {
  AdminBookingsController,
  BookingsController,
  MyBookingsController,
  PublicBookingLinksController,
} from './modules/bookings/bookings.controller';
import { AdminCatalogController, CatalogController } from './modules/catalog/catalog.controller';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { WaitlistController } from './modules/waitlist/waitlist.controller';

const CONTROLLERS = [
  AuthController,
  MeController,
  AdminUsersController,
  CatalogController,
  AdminCatalogController,
  AvailabilityController,
  BookingsController,
  PublicBookingLinksController,
  MyBookingsController,
  AdminBookingsController,
  WaitlistController,
  NotificationsController,
  BlocksController,
  AdminController,
];

/** Operations authenticated by the refresh cookie instead of a bearer token (security: refreshCookie). */
const COOKIE_AUTH = new Set(['refreshSession', 'logout']);

interface SpecOperation {
  operationId: string;
  'x-min-role': string;
}
type Spec = { paths: Record<string, Record<string, SpecOperation>> };

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function operations(doc: Spec): Map<string, string> {
  const ops = new Map<string, string>();
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS)
      if (item[method]) ops.set(item[method].operationId, `${method.toUpperCase()} ${path}`);
  }
  return ops;
}

/** livrabil05/openapi.json is the contract; the implementation must expose exactly its operations. */
describe('API conformance with livrabil05/openapi.json', () => {
  const spec: Spec = JSON.parse(readFileSync(join(__dirname, '../../livrabil05/openapi.json'), 'utf8'));
  let app: INestApplication;
  let generated: Spec;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: CONTROLLERS })
      .useMocker(() => ({}))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    generated = SwaggerModule.createDocument(app, {
      openapi: '3.0.3',
      info: { title: 't', version: '1' },
    }) as unknown as Spec;
  });
  afterAll(() => app.close());

  it('implements all 60 operations with the same method and path', () => {
    const expected = operations(spec);
    const actual = operations(generated);
    expect(expected.size).toBe(60);
    const missing = [...expected]
      .filter(([id, route]) => actual.get(id) !== route)
      .map(([id, route]) => `${id}: ${route} (got ${actual.get(id) ?? 'nothing'})`);
    const extra = [...actual].filter(([id]) => !expected.has(id)).map(([id, route]) => `${id}: ${route}`);
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('protects every route as x-min-role requires', () => {
    const reflector = new Reflector();
    const expectedRoles = new Map<string, string>();
    for (const item of Object.values(spec.paths)) {
      for (const method of METHODS)
        if (item[method]) expectedRoles.set(item[method].operationId, item[method]['x-min-role']);
    }
    const problems: string[] = [];
    let checked = 0;
    for (const controller of CONTROLLERS) {
      const proto = controller.prototype as unknown as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        if (Reflect.getMetadata('method', handler) === undefined) continue;
        const operationId: string | undefined = Reflect.getMetadata(
          'swagger/apiOperation',
          handler,
        )?.operationId;
        if (!operationId) {
          problems.push(`${controller.name}.${name} has no operationId`);
          continue;
        }
        const isPublic =
          reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler as never, controller]) ?? false;
        const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler as never, controller]) ?? [];
        const minRole = expectedRoles.get(operationId);
        let ok: boolean;
        if (minRole === 'public' || COOKIE_AUTH.has(operationId)) ok = isPublic;
        else if (minRole === 'admin' || minRole === 'student')
          ok = !isPublic && roles.length === 1 && roles[0] === minRole;
        else ok = !isPublic && roles.length === 0; // utilizator, titular, titular / personal: ownership checked in services
        checked++;
        if (!ok) problems.push(`${operationId}: x-min-role ${minRole}, public=${isPublic}, roles=[${roles}]`);
      }
    }
    expect(problems).toEqual([]);
    expect(checked).toBe(60);
  });
});
