# Installing and running CampusSport

This guide sets up the backend (`backend/`) on a development machine and lets you call the API from Swagger or Postman. The main path below uses local installs without Docker. Docker is optional and covered near the end.

## 1. Requirements

| Software | Version | Needed for |
|---|---|---|
| Node.js | 24 LTS | Building and running the API and the worker |
| PostgreSQL | 18 | The database (the schema uses `btree_gist`, which ships with PostgreSQL) |
| Redis | 8 (or a compatible server such as Memurai or Valkey) | The worker, sign-in codes and sessions, and live updates across instances. Optional for a first run. |
| Git | any | Getting the code |
| Postman or Swagger UI | any | Calling the API |

Check what you have:

```bash
node -v    # v24.x
psql -V    # 18.x (on Windows: "C:\Program Files\PostgreSQL\18\bin\psql" -V)
```

### What works without Redis

| Without Redis | Needs Redis |
|---|---|
| Catalog, availability, bookings, waitlist, blocks, settings, audit log | The worker: notifications, waitlist offers, no-show handling |
| `/health` answers `degraded` | Sign-in through SSO and by external one-time codes |
| | Refreshing sessions |

To install Redis on Windows, pick one:

- **WSL (Ubuntu):** `sudo apt install redis-server`, then `sudo service redis-server start`. Windows reaches it at `localhost:6379`.
- **Memurai:** a Redis-compatible Windows service. Install it and keep the default port 6379.

## 2. Get the code and install dependencies

```bash
git clone https://github.com/MaketaCampusSport/CampusSport.git
cd CampusSport/backend
npm install
```

## 3. Configure

```bash
cp .env.example .env
```

Edit `backend/.env`. The minimum is the database connection:

```ini
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-password
DB_NAME=CampusSport
```

Instead of the five `DB_*` lines you can set a single `DATABASE_URL=postgres://user:password@localhost:5432/CampusSport`; it takes precedence. Every other value has a working default for development (Redis on `localhost:6379`, Keycloak, Mailpit, development secrets). `.env` is ignored by Git, so never commit it.

## 4. Create the database

```bash
npm run db:setup
```

This command:

- creates the database if it doesn't exist;
- applies the schema from `livrabil05/baza-de-date/schema-postgresql.sql`;
- loads the example data from the API specification: 4 sports, 5 resources and 4 users.

| Example user | Role |
|---|---|
| Ion Popescu | student |
| Maria Ionescu | teacher |
| Andrei Rusu | admin |
| Ana Rusu | external |

You can run it again at any time: it only adds what is missing and resets the example rows.

## 5. Start the API

```bash
npm run start:dev
```

- API: http://localhost:3000/api/v1
- Swagger UI: http://localhost:3000/api/docs
- Health: http://localhost:3000/health returns `{"status":"ok"}`, or `"degraded"` without Redis

For a production-like start without watch mode, run `npm run build`, then `npm start`.

## 6. Start the worker (needs Redis)

In a second terminal:

```bash
cd backend
npm run start:worker:dev
```

The worker sends notifications, offers freed slots to the waiting list, marks no-shows and creates the monthly partitions. Its metrics are at http://localhost:9101/metrics.

## 7. Call the API

Most routes need a bearer token. Real sign-in goes through the university SSO (see section 8). For local testing, generate tokens for the example users:

```bash
cd backend
npm run dev:token                  # prints tokens for student, teacher, admin, external (valid 12 h)
npm run dev:token -- student       # just one
```

This command is for development only and refuses to run in production.

**Swagger:** open http://localhost:3000/api/docs, click **Authorize**, and paste a token.

**Postman:**

1. Write the tokens into a Postman environment:

   ```bash
   npm run dev:token -- --postman
   ```

   This creates `postman/CampusSport-local.postman_environment.json`, which Git ignores.
2. In Postman, choose **Import** and select `postman/CampusSport.postman_collection.json` and the environment file.
3. Select the **CampusSport local (with tokens)** environment.
4. Run the requests of a folder from top to bottom.

`postman/README.md` explains the collection.

## 8. Sign-in flows (optional)

These need Redis.

- **SSO with Keycloak** (needs Docker): run `docker compose up -d keycloak` in `backend/`. Then open http://localhost:3000/api/v1/auth/sso/login and sign in as `student1`, `teacher1` or `admin1` (password `parola123`).
- **Administrator 2FA:** run `npm run admin:enroll-totp -- <admin email>`, then scan the printed `otpauth://` URI with an authenticator app.
- **External users:** call `POST /api/v1/auth/external/register`. In development the SMS code is printed in the API log. The email code goes to SMTP on `localhost:1025`; `docker compose up -d mailpit` shows it at http://localhost:8025.

## 9. Tests

```bash
cd backend
npm test             # unit and controller tests
npm run spec:check   # the API matches livrabil05/openapi.json
npm run test:e2e     # the whole app against PostgreSQL, using the database <DB_NAME>_test
npm run lint && npm run typecheck
```

`test:e2e` creates `<DB_NAME>_test` next to your database and **drops and recreates its schema** on every run. It refuses any database whose name doesn't end in `_test`.

## 10. With Docker (optional)

From `backend/`:

```bash
docker compose up -d postgres redis keycloak mailpit    # infrastructure only, then follow sections 4–7
docker compose --profile app up -d --build              # also the API and the worker in containers
docker compose --profile monitoring up -d               # Prometheus :9090, Grafana :3001 (admin/admin), Loki
```

Docker Compose reads `backend/.env`, and a `$` inside a value (for example in a password) is treated as a variable. Escape it as `$$`, or use Docker only for services that don't need that value.

## 11. Ports

| Port | Service |
|---|---|
| 3000 | API |
| 9101 | Worker metrics |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 8080 | Keycloak |
| 1025 / 8025 | Mailpit SMTP / web UI |
| 9090 / 3001 / 3100 | Prometheus / Grafana / Loki |

## 12. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `password authentication failed` on `db:setup` | Check `DB_USER` / `DB_PASSWORD` in `backend/.env`. |
| `/health` shows `"redis":"down"`, repeated Redis warnings in the log | Redis isn't running. The API still works; start Redis for sign-in and the worker. |
| SSO routes answer 500 | The identity provider isn't reachable. Start Keycloak, or set the `OIDC_*` variables. |
| Requests answer `501 NOT_IMPLEMENTED` | The route exists but isn't implemented yet; the list is in `backend/README.md`. |
| `401 UNAUTHENTICATED` in Postman | Tokens expire after 12 h. Run `npm run dev:token -- --postman` again and re-import the environment. |
| `npx jest` fails with "Must use import to load ES Module" | Use `npm test`, which starts Jest with the flags NestJS 12 needs. |
| `EADDRINUSE :3000` | Another process uses the port. Stop it, or set `PORT=3001` in `.env`. |
