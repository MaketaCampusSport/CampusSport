# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

CampusSport is the booking system for a university sports facility. The docs are in Romanian, and the code identifiers are in English.

- `MA-Software Requirements Specifications …pdf` (SRS) and `MA-Software Design Descriptions …pdf` (SDD) hold the requirements (FR-xx, NFR-xx, BR-xx) and the design. Code comments cite them as `SDD 7.1`, `FR-12` and so on.
- `livrabil05/` is the source of truth for the server contract:
  - `openapi.yaml` describes 60 operations under `/api/v1`, with `x-min-role` (the minimum role) and `x-srs` (the requirements covered). `openapi.json` is the same spec in JSON, and the conformance test reads it.
  - `baza-de-date/schema-postgresql.sql` is the real DB schema. `datamodeler-import.ddl` is only an Oracle-dialect copy for drawing the ERD.
  - `Tehnologii-backend.md` is the agreed stack and versions. `README.md` lists the open design decisions.
- `backend/` is the NestJS implementation (API and worker). `backend/README.md` has setup, commands and the list of stubbed routes.

When the API or the schema changes, change `livrabil05/` deliberately; the backend follows it. Two tests enforce this:

- `src/spec-conformance.spec.ts` compares the controllers' operationId, method, path and guard with `openapi.json` and `x-min-role`.
- `src/database/schema-sync.spec.ts` keeps `backend/src/database/sql/0001_initial_schema.sql` byte-identical to the livrabil05 SQL. If you change one, copy it to the other.

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
npm run admin:enroll-totp -- <admin email> # prints the otpauth:// URI for 2FA
```

The e2e database is `TEST_DATABASE_URL`, otherwise `<DB_NAME>_test` derived from `.env`, otherwise Testcontainers. The setup refuses any database whose name doesn't end in `_test`. Docker Compose has profiles `app` (API and worker) and `monitoring` (Prometheus, Grafana, Loki, Alloy), plus Keycloak (users `student1`, `teacher1`, `admin1` / `parola123`) and Mailpit.

## Toolchain quirks

- NestJS 12, `openid-client` 6 and `otplib` 13 are **ESM-only**. The backend is **CommonJS** (`module: nodenext`) and loads them through Node 24's `require(esm)`, like the official Nest 12 CJS template. `openid-client` is loaded lazily with `import()`.
- Jest therefore runs as `node --experimental-vm-modules …/jest.js`, which the npm scripts already do. Plain `npx jest` fails with "Must use import to load ES Module".
- Inside Jest, `process.loadEnvFile` doesn't affect the sandboxed `process.env`. Use `util.parseEnv` (see `test/e2e-setup.ts`).
- TypeScript is pinned to `~6.0` (ts-jest supports `<7`). TS 6 defaults `types` to `[]`, so `tsconfig.json` lists them. Types used in decorated signatures must use `import type` (`isolatedModules` + `emitDecoratorMetadata`).
- `backend/.gitattributes` forces LF. The repo has `core.autocrlf=true`, so edit scripts that match `\n` can silently miss on files git checked out before that rule existed.
- BullMQ 6 rejects `:` in custom job ids, so ids use `_`.

## Architecture

- **Modular monolith (SDD 3.1):** one Nest module per SDD module under `src/modules/`. The same image has two entrypoints: `src/main.ts` (HTTP, prefix `api/v1` except `/health` and `/metrics`) and `src/worker.ts` (an application context with the processors in `src/worker/`). `src/app.setup.ts` is the shared HTTP pipeline (prefix, validation, error filter) that both `main.ts` and the tests use.
- **Config vs. rules:** `src/config/configuration.ts` holds infrastructure and secrets only (`APP_CONFIG` token). Business rules live in the `settings` table and are read on every request through `SettingsService` (SDD 2.1). Never hard-code them. `DEFAULT_RULES` mirrors the schema's defaults.
- **`occupancy` is the core.** Bookings and all block kinds share it, guarded by the `no_overlap` exclusion constraint on active rows. Double-booking prevention is that constraint, not application checks:
  - A `23P01` error maps to `409 SLOT_TAKEN` or `SLOT_BLOCKED`, with a `waitlist_offer`.
  - Concurrent conflicting inserts can raise `40P01` (deadlock) instead. Booking and block transactions are wrapped in `withTransientRetry` (`src/common/db/transient.ts`).
- **Booking rules** (SDD 7.1) are pure functions in `modules/bookings/booking-rules.ts`. Both `POST /bookings` and the availability grid's `bookable` flag use them, so the two must not diverge. Slot math (`modules/availability/slots.ts`) works in the facility time zone (`FACILITY_TIMEZONE`, Europe/Chisinau) with luxon, and is DST-safe.
- **After-commit side effects** go through `OccupancyEventsService`. It publishes SSE `slot-changed` events (Redis pub/sub, with an in-process fallback) and enqueues jobs via `JobsService`. Enqueueing is fire-and-forget with a timeout, so requests never block on Redis.
- **Raw SQL:** services use `em.query` heavily. TypeORM on PostgreSQL returns **`[rows, rowCount]` for UPDATE and DELETE**, even with RETURNING, so wrap those calls in `rowsOf()` (`src/common/db/rows.ts`). SELECT and INSERT return plain rows.
- **Short-lived state** (OTP codes, refresh sessions, SSO state, 2FA challenges) lives in Redis behind the `KvStore` interface. `MemoryKvStore` backs the tests.
- `notifications` and `audit_log` are partitioned monthly; the worker creates partitions ahead of time. `audit_log` is insert-only, enforced by a trigger. Admin mutations call `AuditService.record(…, em)` inside the same transaction.

## API conventions

- JSON uses `snake_case` like the spec. Entities use camelCase properties mapped to snake_case columns, and DTO mappers live next to the DTOs.
- Every error body is `{ code, message_ro, message_en, details? }`, built with `AppException(code)` from the catalogue in `common/errors/error-codes.ts`. Validation failures return `422 VALIDATION_FAILED` with `details.fields`.
- The global `JwtAuthGuard` protects every route. Use `@Public()` and `@Roles('admin' | 'student')` to match `x-min-role`. A malformed `{id}` gives 404, and so does a resource the caller doesn't own.
- Routes not implemented yet return `501 NOT_IMPLEMENTED` (a temporary code, not in the spec enum); `backend/README.md` lists them.
- Every endpoint has a controller test built with `createTestApp` (`src/testing/test-app.ts`), which runs the real pipeline with fake JWT callers. Tests use the spec's example data from `src/database/seeds/example-data.ts`. Service logic is tested against scripted databases. Anything that depends on real PostgreSQL behaviour belongs in `test/app.e2e-spec.ts`.

## Git workflow

Work on one branch per task, created from `main`, and commit after each medium or large change. Merge into `main` with `git merge --no-ff`, then delete the local branch. Don't push unless asked.
