# CampusSport backend

The NestJS server for CampusSport. It implements the API contract in [`../livrabil05/openapi.yaml`](../livrabil05/openapi.yaml) on the schema in [`../livrabil05/baza-de-date/schema-postgresql.sql`](../livrabil05/baza-de-date/schema-postgresql.sql), using the stack from [`../livrabil05/Tehnologii-backend.md`](../livrabil05/Tehnologii-backend.md).

One codebase runs as two processes:

- **API** (`src/main.ts`): REST and SSE under `/api/v1`, Swagger UI at `/api/docs`, `/health` and `/metrics`.
- **Worker** (`src/worker.ts`): BullMQ jobs for notifications, waitlist offers, no-shows, partitions and safety-net scans. Its metrics are served on `:9101/metrics`.

## Requirements

- Node.js 24 and PostgreSQL 18 (local install or `docker compose up -d postgres`).
- Redis 8 for queues, OTP codes, refresh sessions and SSE fan-out across instances. Without Redis the API still serves the catalog, availability, bookings, blocks and admin routes, and `/health` reports `degraded`. Login flows, refresh tokens and the worker need Redis.

## First run (local, no Docker)

```bash
cp .env.example .env        # set DB_USER, DB_PASSWORD, DB_NAME (or DATABASE_URL)
npm install
npm run db:setup            # creates the database if missing, applies the schema, seeds example data
npm run start:dev           # http://localhost:3000/api/docs
npm run start:worker:dev    # needs Redis
```

The seed adds the sports, resources and users from the spec's examples. Ion Popescu is the student, Maria Ionescu the teacher, Andrei Rusu the admin and Ana Rusu the external. Seeded members are linked to the first SSO login that uses the same email.

### Sign-in in development

- **SSO:** `docker compose up -d keycloak` starts a realm with `student1`, `teacher1` and `admin1` (password `parola123`). Open `/api/v1/auth/sso/login`.
- **Admin 2FA:** run `npm run admin:enroll-totp -- <admin email>`, then add the printed `otpauth://` URI to an authenticator app.
- **Externals:** `POST /auth/external/register`. In development the SMS code is printed in the log (SMS log driver) and the email goes to Mailpit (`docker compose up -d mailpit`, http://localhost:8025).

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit and controller tests, including the conformance check against `livrabil05/openapi.json` |
| `npm test -- <path or pattern>` | Runs one file, or use `-t "<name>"` for one test |
| `npm run test:cov` | Coverage (CI requires ≥ 70% lines, NFR-13) |
| `npm run test:e2e` | Whole app against a real PostgreSQL (see below) |
| `npm run spec:check` | Only the API conformance test |
| `npm run lint` / `npm run typecheck` / `npm run format` | Static checks |
| `npm run migration:run` / `migration:revert` / `seed` | Database |
| `npm run k6:prepare -- 100` then `k6 run k6/booking-concurrency.js` | NFR-04: 100 simultaneous bookings of one slot, exactly one succeeds |
| `k6 run k6/availability-load.js` | NFR-01/02: grid p95 < 2 s under load |
| `npm run k6:cleanup` | Removes the load-test users |

**E2E database.** The suite uses `TEST_DATABASE_URL`, otherwise `<DB_NAME>_test` next to the database in `.env`, otherwise a Testcontainers PostgreSQL. It drops and recreates the schema, so it refuses any database whose name doesn't end in `_test`.

## Docker

```bash
docker compose up -d postgres redis keycloak mailpit      # infrastructure
docker compose --profile app up -d --build                # + API and worker
docker compose --profile monitoring up -d                 # Prometheus :9090, Grafana :3001, Loki, Alloy
```

Prometheus alerts when the p95 notification lag exceeds 2 minutes (NFR-03), when grid or booking requests are slow (NFR-01), and when a target is down.

## Design notes

- **No double bookings.** Bookings and blocks live in `occupancy`, guarded by the `no_overlap` exclusion constraint. Concurrent inserts that collide can deadlock in PostgreSQL. The transaction is retried, so the losers get `409 SLOT_TAKEN` with a `waitlist_offer`.
- **Rules are data.** Quota, windows, cancellation and check-in times, no-show limits and waitlist timing live in `settings`. Every request reads them, so `PUT /admin/settings` takes effect immediately.
- **The schema comes from livrabil05.** The migration runs the SQL file verbatim, and a test keeps the copy in `src/database/sql` identical to it.
- **Errors** always have the form `{ code, message_ro, message_en, details? }`, with the codes from the spec.

## Implemented vs. not yet

All 60 operations of the spec exist, and `npm run spec:check` verifies paths, methods and roles.

These return `501 NOT_IMPLEMENTED`, a temporary code that isn't in the spec:

- `GET /me/export`
- iCal: `/bookings/{id}/calendar.ics`, `/me/calendar-feed`, `/calendar/{token}.ics`
- Team invitations: `POST /bookings/{id}/invitations`, `GET /invitations/{token}`
- Admin booking management: `GET /admin/bookings`, `PATCH /admin/bookings/{id}`, `POST /admin/bookings/{id}/cancel`
- PE schedule: `/admin/schedule/*`
- `POST /admin/events`
- `POST /admin/announcements`
- `GET /admin/dashboard` and `GET /admin/reports`
- Recurring blocks (`recurrence` in `POST /admin/blocks`)

Open decisions from livrabil05 and how this code handles them:

| Decision | Current behaviour |
|---|---|
| "Personal" at check-in | An `admin` account scans the QR code. |
| Cancellation less than 2 h before the start | Allowed. The slot is freed and the entry stays consumed. |
| Per-sport quota (SRS 9.7) | `monthly_quota_per_sport` must stay empty; the schema keys the quota by user and month only. |
| SMS provider | Not chosen yet; the log driver only prints messages. |
