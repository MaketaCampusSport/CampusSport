# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

CampusSport is the booking system for a university sports facility. The docs are in Romanian, and the code identifiers are in English.

- `assets/MA-Software Requirements Specifications …pdf` (SRS) and `assets/MA-Software Design Descriptions …pdf` (SDD) hold the requirements (FR-xx, NFR-xx, BR-xx) and the design. Code comments cite them as `SDD 7.1`, `FR-12` and so on.
- `assets/livrabil05/` is the source of truth for the server contract:
  - `openapi.yaml` describes 64 operations under `/api/v1`, with `x-min-role` (the minimum role) and `x-srs` (the requirements covered). `openapi.json` is the same spec in JSON, and the conformance test reads it.
  - `baza-de-date/schema-postgresql.sql` is the real DB schema. `datamodeler-import.ddl` is only an Oracle-dialect copy for drawing the ERD.
  - `Tehnologii-backend.md` is the agreed stack and versions. `README.md` lists the open design decisions.
- `backend/` is the NestJS implementation (API and worker). `backend/README.md` has setup, commands and the list of stubbed routes.
- `frontend/` is the React PWA: the student/teacher/external app under `/user` and the admin panel under `/admin`. `frontend/GHID-TESTARE.md` is its testing guide.
- The root `package.json` only runs both packages (`concurrently`). `INSTALL.md` is the setup guide.
- Root `docker-compose.yml` + `.env.docker.example` + `docker/` (Caddyfile, Postgres init; the Keycloak realm templates are unused while SSO is disabled) run the whole app in containers; one `.env` switches demo/production. `backend/docker-compose.yml` is only dev infrastructure.
- `ansible/` installs that stack on a VPS (`site.yml` full install, `deploy.yml` update); see `ansible/README.md`. Secrets are generated into the git-ignored `ansible/secrets/<host>/`.

When the API or the schema changes, change `assets/livrabil05/` deliberately; the backend follows it. Two tests enforce this:

- `src/spec-conformance.spec.ts` compares the controllers' operationId, method, path and guard with `openapi.json` and `x-min-role`.
- `src/database/schema-sync.spec.ts` keeps `backend/src/database/sql/0001_initial_schema.sql` byte-identical to the livrabil05 SQL. If you change one, copy it to the other.

## Root commands

```bash
npm install && npm run setup   # install backend + frontend, db:setup
npm run dev                    # API :3000 + web :5173 (Vite proxies /api to the API)
npm run dev:all                # + worker (needs Redis)
npm run dev:mock               # web only, with the MSW mock server
npm run typecheck && npm test  # both packages
```

## Backend commands (run in `backend/`)

The user develops without Docker: local PostgreSQL 18, with Nest running on the host. Redis is not installed yet.

```bash
npm install
npm run db:setup             # create DB if missing + migrate + seed example data (uses .env DB_* or DATABASE_URL)
npm run start:dev            # API http://localhost:3000, Swagger /api/docs, JSON /api/docs-json
npm run start:worker:dev     # BullMQ worker (needs Redis); metrics on :9101/metrics
npm run lint && npm run typecheck && npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm test                                   # unit + controller tests
npm test -- src/modules/bookings           # one folder/file
npm test -- -t "SLOT_TAKEN"                # by test name
npm run spec:check                         # only the livrabil05 conformance test
npm run test:e2e                           # whole app on a real *_test database (resets its schema)
npm run admin:enroll-totp -- <admin email> # prints the otpauth:// URI for 2FA (unused: admin 2FA is disabled)
```

The e2e database is `TEST_DATABASE_URL`, otherwise `<DB_NAME>_test` derived from `.env`, otherwise Testcontainers. The setup refuses any database whose name doesn't end in `_test`. Docker Compose has profiles `app` (API and worker) and `monitoring` (Prometheus, Grafana, Loki, Alloy) and Mailpit (the Keycloak service is commented out).

## Frontend (run in `frontend/`)

```bash
npm run dev            # real API through the Vite proxy (.env.development)
npm run dev:mock       # MSW mock server in the browser (.env.mock); example accounts use password parola123
npm run typecheck && npm test && npm run build
npm run api:generate   # regenerate src/api/generated/ from assets/livrabil05/openapi.yaml (commit the output)
```

- `src/api/client.ts` is the only API layer: one method per spec operation, snake_case like the spec, typed with `src/api/generated`. Don't hand-write DTO types; add view-model mappers next to the pages.
- `src/api/http.ts` keeps the access token in memory; the session is restored on load with `POST /auth/refresh` (HttpOnly cookie, path `/api/v1/auth`). `src/auth/sessionStore.ts` holds the user; `src/auth/guards.tsx` has `RequireAdmin` / `RequireMember`.
- Sign-in is email + password: `POST /auth/login` (every role, admins included, no 2FA) and `POST /auth/register` (role `student` or `teacher` only). Both answer `Session` + the refresh cookie. `features/auth/PasswordForms.tsx` holds the forms used by `/login` and `/admin/login`.
- **SSO, admin 2FA and the external OTP flow are commented out, not deleted:** `oidc.service.ts`, `auth-flows.service.ts`, `otp.service.ts`, the handlers in `auth.controller.ts`, the `oidc` config, the operations in `openapi.yaml`, `TwoFactorPage.tsx`, the `/auth/2fa` route, and Keycloak in the compose files. The login pages also comment out the development-sign-in panel and the admin link. Restoring one means uncommenting it everywhere and regenerating `openapi.json`.
- Slot times are shown in the facility time zone (`features/user/lib.ts`, `FACILITY_TZ`); always send the slot's own ISO `start` back to the API.
- i18n: `src/i18n/ro.json`/`en.json` (admin + common) and `member.ro.json`/`member.en.json` (`user`, `login`, `auth`). `i18n.test.ts` checks parity, that every static key exists, and Romanian plurals (`_one/_few/_other`).
- MSW handlers: `mocks/authHandlers.ts`, `mocks/memberHandlers.ts`, `mocks/handlers.ts` (admin + catalog), registered in that order. Mock photos are `data:` URLs (`mocks/avatars.ts`). Upload tests must use Node's `File`/`FormData` (see `test/userManagement.test.tsx`), because jsdom's don't reach MSW. Keep them on the spec's paths and shapes. Tests sign in with `signInAs()` from `src/test/session.ts`.

## Toolchain quirks

- NestJS 12, `openid-client` 6 and `otplib` 13 are **ESM-only**. The backend is **CommonJS** (`module: nodenext`) and loads them through Node 24's `require(esm)`, like the official Nest 12 CJS template. `openid-client` is loaded lazily with `import()`.
- Jest therefore runs as `node --experimental-vm-modules …/jest.js`, which the npm scripts already do. Plain `npx jest` fails with "Must use import to load ES Module".
- Inside Jest, `process.loadEnvFile` doesn't affect the sandboxed `process.env`. Use `util.parseEnv` (see `test/e2e-setup.ts`).
- TypeScript is pinned to `~6.0` (ts-jest supports `<7`). TS 6 defaults `types` to `[]`, so `tsconfig.json` lists them. Types used in decorated signatures must use `import type` (`isolatedModules` + `emitDecoratorMetadata`).
- `backend/.gitattributes` forces LF. The repo has `core.autocrlf=true`, so edit scripts that match `\n` can silently miss on files git checked out before that rule existed.
- BullMQ 6 rejects `:` in custom job ids, so ids use `_`.
- **Running without Redis (development):** `RedisModule` pings Redis at startup and, outside production, falls back to `MemoryKvStore`, so sign-in works but sessions are lost when the API restarts. `MailService` prints undelivered emails to the log outside production.
- **Passwords:** `modules/auth/password.ts` hashes with `node:crypto` scrypt (`scrypt$N$r$p$salt$hash` in `users.password_hash`, selected only on demand). Login always runs one scrypt, also for unknown emails. The seed gives every example user `EXAMPLE_PASSWORD` (`parola123`) and keeps a password that was changed since. Migration `1764100000000-PasswordAuth` adds the column and drops `users_sso_ck` on databases created before it.
- **User administration and photos:** `POST/PATCH/DELETE /admin/users[/{id}]` (UsersService `createByAdmin`, `updateByAdmin`, `deleteByAdmin`; deletion reuses the DELETE /me anonymization). An admin can't delete themselves or drop their own admin role. An account referenced as `actor_id` in the insert-only `audit_log` can't be deleted (409 `USER_HAS_HISTORY`). Photos live in PostgreSQL (`user_avatars`, `AvatarsService`): multipart field `file`, type detected from the bytes (JPEG/PNG/WebP), at most 2 MB, served by the public `GET /users/{id}/avatar` with long-lived caching because `User.avatar_url` carries the version (`users.avatar_updated_at`). The PWA crops and shrinks photos to 512 px before uploading (`frontend/src/lib/image.ts`, `components/ui/AvatarPicker.tsx`).
- `/auth/register` and `/auth/login` allow 5 requests per minute per caller, also in controller tests: keep each `describe` at 5 calls or fewer.
- **Container stack:** `migrate` and `seed` are one-shot services that `api`/`worker` wait for; `seed` runs only when `SEED_EXAMPLE_DATA=true` (and passes `SEED_ALLOW_PRODUCTION`, which the seeder requires under `NODE_ENV=production`). Keycloak, its `web` network alias, the Caddy auth host and the Postgres init that created its database are commented out with SSO.
- **Windows dev server:** Vite binds `127.0.0.1` explicitly (Node resolves `localhost` to `::1` only); `VITE_DEV_HOST` overrides.
- **Development sign-in:** `DevAuthController` (`/api/v1/auth/dev/users`, `/auth/dev/login`) issues a real session for a seeded user. The login pages no longer show its panel (`DevLoginPanel` is commented out where it was used); tests still use it through `signInAs()`. It answers 404 unless `NODE_ENV=development` and `DEV_LOGIN` isn't `false`. It's outside the spec, hidden from Swagger, and deliberately not in the conformance test's controller list.

## Architecture

- **Modular monolith (SDD 3.1):** one Nest module per SDD module under `src/modules/`. The same image has two entrypoints: `src/main.ts` (HTTP, prefix `api/v1` except `/health` and `/metrics`) and `src/worker.ts` (an application context with the processors in `src/worker/`). `src/app.setup.ts` is the shared HTTP pipeline (prefix, validation, error filter) that both `main.ts` and the tests use.
- **Config vs. rules:** `src/config/configuration.ts` holds infrastructure and secrets only (`APP_CONFIG` token). Business rules live in the `settings` table and are read on every request through `SettingsService` (SDD 2.1). Never hard-code them. `DEFAULT_RULES` mirrors the schema's defaults.
- **`occupancy` is the core.** Bookings and all block kinds share it, guarded by the `no_overlap` exclusion constraint on active rows. Double-booking prevention is that constraint, not application checks:
  - A `23P01` error maps to `409 SLOT_TAKEN` or `SLOT_BLOCKED`, with a `waitlist_offer`.
  - Concurrent conflicting inserts can raise `40P01` (deadlock) instead. Booking and block transactions are wrapped in `withTransientRetry` (`src/common/db/transient.ts`).
- **Booking rules** (SDD 7.1) are pure functions in `modules/bookings/booking-rules.ts`. Both `POST /bookings` and the availability grid's `bookable` flag use them, so the two must not diverge. Slot math (`modules/availability/slots.ts`) works in the facility time zone (`FACILITY_TIMEZONE`, Europe/Chisinau) with luxon, and is DST-safe.
- **After-commit side effects** go through `OccupancyEventsService`. It publishes SSE `slot-changed` events (Redis pub/sub, with an in-process fallback) and enqueues jobs via `JobsService`. Enqueueing is fire-and-forget with a timeout, so requests never block on Redis.
- **Raw SQL:** services use `em.query` heavily. TypeORM on PostgreSQL returns **`[rows, rowCount]` for UPDATE and DELETE**, even with RETURNING, so wrap those calls in `rowsOf()` (`src/common/db/rows.ts`). SELECT and INSERT return plain rows.
- **Short-lived state** (refresh sessions; OTP codes, SSO state and 2FA challenges while those flows were enabled) lives in Redis behind the `KvStore` interface. `MemoryKvStore` backs the tests.
- `notifications` and `audit_log` are partitioned monthly; the worker creates partitions ahead of time. `audit_log` is insert-only, enforced by a trigger. Admin mutations call `AuditService.record(…, em)` inside the same transaction.

## API conventions

- JSON uses `snake_case` like the spec. Entities use camelCase properties mapped to snake_case columns, and DTO mappers live next to the DTOs.
- Every error body is `{ code, message_ro, message_en, details? }`, built with `AppException(code)` from the catalogue in `common/errors/error-codes.ts`. Validation failures return `422 VALIDATION_FAILED` with `details.fields`.
- The global `JwtAuthGuard` protects every route. Use `@Public()` and `@Roles('admin' | 'student')` to match `x-min-role`. A malformed `{id}` gives 404, and so does a resource the caller doesn't own.
- Routes not implemented yet return `501 NOT_IMPLEMENTED` (a temporary code, not in the spec enum); `backend/README.md` lists them.
- Every endpoint has a controller test built with `createTestApp` (`src/testing/test-app.ts`), which runs the real pipeline with fake JWT callers. Tests use the spec's example data from `src/database/seeds/example-data.ts`. Service logic is tested against scripted databases. Anything that depends on real PostgreSQL behaviour belongs in `test/app.e2e-spec.ts`.

## Git workflow

Don't commit, merge or push unless the user asks for it. Leave changes uncommitted for review. When asked to commit, use one branch per task (`feat/`, `fix/`, `docs/` ...) with a descriptive message, and merge into `main` with `--no-ff`.
