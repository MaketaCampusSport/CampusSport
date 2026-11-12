# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

CampusSport is the booking system for a university sports facility. The docs are in Romanian, and the code identifiers are in English.

- `MA-Software Requirements Specifications …pdf` (SRS) and `MA-Software Design Descriptions …pdf` (SDD) hold the requirements (FR-xx, NFR-xx) and the design. Code comments cite them as `SDD 7.1`, `FR-12` and so on.
- `livrabil05/` is the source of truth for the server contract:
  - `openapi.yaml` describes 60 operations under `/api/v1`. Each operation has `x-min-role` (the minimum role) and `x-srs` (the requirements it covers). `openapi.json` is generated from it.
  - `baza-de-date/schema-postgresql.sql` is the real DB schema. `datamodeler-import.ddl` is only an Oracle-dialect copy for drawing the ERD.
  - `Tehnologii-backend.md` is the agreed stack and library versions. `README.md` lists the open design decisions, such as "personal" at check-in being an `admin` account.
- `backend/` is the NestJS implementation (API and worker).

When the API or the schema changes, change `livrabil05/` deliberately. The backend follows it, not the other way round.

## Backend commands (run in `backend/`)

```bash
npm install
docker compose up -d postgres redis keycloak mailpit   # dev infrastructure
cp .env.example .env
npm run start:dev            # API on http://localhost:3000, Swagger UI at /api/docs, JSON at /api/docs-json
npm run start:worker:dev     # BullMQ worker (no HTTP)
npm run build                # nest build -> dist/
npm run typecheck
npm run lint
npm test                     # unit tests: src/**/*.spec.ts
npm test -- src/modules/health/health.controller.spec.ts   # one file
npm test -- -t "GET /health"                               # by test name
npm run test:e2e             # test/**/*.e2e-spec.ts, needs Docker (Testcontainers)
docker compose --profile app up -d --build                # API + worker in containers
```

Dev SSO is the Keycloak realm in `docker/keycloak/campussport-realm.json` (http://localhost:8080, Keycloak admin `admin`/`admin`). Test users are `student1`, `teacher1` and `admin1`, all with password `parola123`. Their role comes from the `campussport_roles` claim and is mapped by `OIDC_ROLE_MAP`. Mail sent in dev is visible in Mailpit at http://localhost:8025.

## Toolchain quirks

- NestJS 12 packages are **ESM-only**, and so are `openid-client` 6 and `otplib` 13. The backend itself is **CommonJS** (`module: nodenext`, no `"type": "module"`) and loads them through Node 24's `require(esm)`, which is what the official Nest 12 CJS template does. Relative imports therefore have no `.js` suffix.
- Because of that, Jest must run as `node --experimental-vm-modules …/jest.js`. The npm scripts already do this, so call `npm test` and not `npx jest`. Plain `npx jest` fails with "Must use import to load ES Module".
- TypeScript is pinned to `~6.0`. TS 7 is out, but ts-jest supports `<7` and the stack document specifies 6. TS 6 defaults `types` to `[]`, so `tsconfig.json` lists `node` and `jest` explicitly.

## Architecture

- **Modular monolith (SDD 3.1):** one Nest module per SDD chapter 4 module, under `src/modules/`. There are two entrypoints in the same image: `src/main.ts` (HTTP API; global prefix `api/v1`, except `/health` and `/metrics`) and `src/worker.ts` (an application context that only runs BullMQ processors such as notifications, reminders, no-show and waitlist offers).
- **Config vs. rules:** `src/config/configuration.ts` holds only infrastructure and secrets, read from env through the `APP_CONFIG` token. Business rules (quota, booking windows, cancel and check-in windows, no-show threshold) live in the DB `settings` table and are read on every request (SDD 2.1), so admins can change them without a redeploy. Never hard-code them.
- **Schema ownership:** the schema comes from migrations that apply `schema-postgresql.sql`. TypeORM runs with `synchronize: false`, and entities mirror the tables.
- **The `occupancy` table is the core.** Bookings and every kind of block (PE class, event, maintenance, emergency) share it, together with the `no_overlap` GiST exclusion constraint on `(resource_id, period)` for active rows. Double-booking prevention is that constraint (a pg `23P01` error, mapped to `409 SLOT_TAKEN`/`SLOT_BLOCKED`), not application-level checks. `period` is a `tstzrange`, exposed in JSON as `start`/`end`.
- `notifications` and `audit_log` are partitioned monthly. `audit_log` is insert-only and enforced by a trigger.

## API conventions (from livrabil05/openapi.yaml)

- JSON fields use `snake_case`, as the DB columns do.
- Every error body is `{ code, message_ro, message_en, details? }`, with a stable `code` from the spec's `ErrorCode` enum. Validation failures are `422 VALIDATION_FAILED`.
- A resource the caller doesn't own returns `404`, not `403`.
- Spec routes that aren't implemented yet still exist and return `501` with code `NOT_IMPLEMENTED`. This code is temporary and is not part of the spec enum.
- Every endpoint has a controller unit test that uses the example data from the spec.

## Git workflow

Work on one branch per task, created from `main`, and commit after each medium or large change. Merge into `main` with `git merge --no-ff`, then delete the local branch. Don't push unless asked.
