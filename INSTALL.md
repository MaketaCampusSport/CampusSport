# Installing and running CampusSport

This guide sets up the backend (`backend/`) and the web app (`frontend/`) on a development machine. The main path below uses local installs without Docker. Docker is optional and covered near the end.

## Quick start

With Node.js 24 and PostgreSQL 18 installed, and `backend/.env` configured (section 3):

```bash
npm install          # repo root: installs the script runner (concurrently)
npm run setup        # installs backend + frontend, creates and seeds the database
npm run dev          # API on :3000 and the web app on :5173, in one terminal
```

Open http://localhost:5173 and sign in with an example user and the password `parola123`, or create an account (section 8). Redis is not needed for this.

| Root script | What it does |
|---|---|
| `npm run dev` | API (`backend`, watch mode) and web app (`frontend`, Vite) together |
| `npm run dev:all` | The same plus the worker (needs Redis) |
| `npm run dev:api` / `npm run dev:web` | Only one of them |
| `npm run dev:mock` | Only the web app, with the built-in mock server (no backend) |
| `npm run setup` | `install:all` + `db:setup` |
| `npm run build` / `typecheck` / `test` | Run in both packages |

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
| Sign-in, sessions and one-time codes, kept in API memory (lost on restart) | Sharing sessions between several API instances |
| `/health` answers `degraded` | |

Without Redis the API logs `Redis is not reachable: using an in-memory KvStore` once at startup. This fallback exists only outside production.

To install Redis on Windows, pick one:

- **WSL (Ubuntu):** `sudo apt install redis-server`, then `sudo service redis-server start`. Windows reaches it at `localhost:6379`.
- **Memurai:** a Redis-compatible Windows service. Install it and keep the default port 6379.

## 2. Get the code and install dependencies

```bash
git clone https://github.com/MaketaCampusSport/CampusSport.git
cd CampusSport
npm install          # root script runner
npm run install:all  # backend/ and frontend/
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

Instead of the five `DB_*` lines you can set a single `DATABASE_URL=postgres://user:password@localhost:5432/CampusSport`; it takes precedence. Every other value has a working default for development (Redis on `localhost:6379`, Mailpit, development secrets). `.env` is ignored by Git, so never commit it.

## 4. Create the database

```bash
cd backend
npm run db:setup     # or, from the root: npm run setup
```

This command:

- creates the database if it doesn't exist;
- applies the schema from `assets/livrabil05/baza-de-date/schema-postgresql.sql`;
- loads the example data from the API specification: 4 sports, 5 resources and 4 users.

| Example user | Role |
|---|---|
| Ion Popescu | student |
| Maria Ionescu | teacher |
| Andrei Rusu | admin |
| Ana Rusu | external |

You can run it again at any time: it only adds what is missing and resets the example rows.

## 5. Start the API and the web app

From the repo root, `npm run dev` starts both. To start only the API:

```bash
cd backend
npm run start:dev
```

- API: http://localhost:3000/api/v1
- Swagger UI: http://localhost:3000/api/docs
- Health: http://localhost:3000/health returns `{"status":"ok"}`, or `"degraded"` without Redis

- Web app: http://localhost:5173 (students, teachers and externals at `/user`, administrators at `/admin`)

The web app's dev server forwards `/api` to the API (`VITE_API_PROXY_TARGET` in `frontend/.env.development`), so the browser talks to one origin and the HttpOnly refresh cookie works. To change it locally, put overrides in `frontend/.env.development.local`.

For a production-like start without watch mode, run `npm run build`, then `npm start`.

## 6. Start the worker (needs Redis)

In a second terminal:

```bash
cd backend
npm run start:worker:dev
```

The worker sends notifications, offers freed slots to the waiting list, marks no-shows and creates the monthly partitions. Its metrics are at http://localhost:9101/metrics.

## 7. Call the API

Most routes need a bearer token. Real sign-in is `POST /api/v1/auth/login` with email and password (see section 8). For local testing, generate tokens for the example users:

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

## 8. Sign-in

**Email and password.** Everyone signs in with email and password on http://localhost:5173/login (`POST /api/v1/auth/login`). Administrators use the same form on `/admin/login`; there is no second step. The **Cont nou** tab creates an account (`POST /api/v1/auth/register`) with the role **student** or **teacher**; external and admin accounts can't be created this way. The seeded example users all have the password `parola123`:

| Role | Email |
|---|---|
| student | `ion.popescu@student.example.edu` |
| teacher | `maria.ionescu@example.edu` |
| admin | `andrei.rusu@example.edu` |
| external | `ana.rusu@example.com` |

A database created before this change needs `npm run db:setup` once: it applies the `PasswordAuth` migration (the `password_hash` column) and sets the example passwords. Without it, registration fails with a 500 error.

**Development sign-in.** When `NODE_ENV=development` and `DEV_LOGIN` is not `false`, the API still exposes `GET /api/v1/auth/dev/users` and `POST /api/v1/auth/dev/login {"email": …}` (outside the contract, hidden from Swagger, 404 elsewhere). The login pages no longer show the panel that used them.

**Disabled:** university SSO (Keycloak/OIDC), administrator 2FA (TOTP) and external sign-in with OTP codes. Their code is commented out, not deleted.

## 9. Tests

```bash
cd backend
npm test             # unit and controller tests
npm run spec:check   # the API matches assets/livrabil05/openapi.json
npm run test:e2e     # the whole app against PostgreSQL, using the database <DB_NAME>_test
npm run lint && npm run typecheck

cd ../frontend
npm test             # Vitest, against the mock server
npm run typecheck
```

`test:e2e` creates `<DB_NAME>_test` next to your database and **drops and recreates its schema** on every run. It refuses any database whose name doesn't end in `_test`.

## 10. With Docker (optional)

### The whole application in containers (repo root)

The root `docker-compose.yml` runs everything: PostgreSQL, Redis, the migrations and the example data (one-shot `migrate` and `seed` services), the API, the worker, and Caddy serving the built web app with `/api` proxied to the API. Mailpit (profile `mail`) is optional. Keycloak (profile `sso`) is commented out with SSO.

```bash
cp .env.docker.example .env        # demo mode on http://localhost; read the comments in the file
docker compose up -d --build       # first build takes a few minutes
docker compose ps                  # migrate and seed show "exited (0)", the rest "healthy"/"running"
```

- Web app: http://localhost (Development sign-in on `/login` and `/admin/login`)
- Mailpit: http://127.0.0.1:8025

`.env` switches between **demo** (`NODE_ENV=development`, `DEV_LOGIN=true`, `SEED_EXAMPLE_DATA=true`) and **production** (`production`, `false`, `false`). In demo mode the example users sign in with `parola123`; don't seed example data in production. Ports 80 and 443 must be free. To reload the example data: `docker compose run --rm seed`. To start from an empty database: `docker compose down -v`.

For a VPS with a domain and HTTPS, use the Ansible playbooks in [`ansible/`](ansible/README.md): they prepare the server and write this `.env` for you.

### Development infrastructure only (`backend/`)

From `backend/`:

```bash
docker compose up -d postgres redis mailpit             # infrastructure only, then follow sections 4–7
docker compose --profile app up -d --build              # also the API and the worker in containers
docker compose --profile monitoring up -d               # Prometheus :9090, Grafana :3001 (admin/admin), Loki
```

Docker Compose reads `backend/.env`, and a `$` inside a value (for example in a password) is treated as a variable. Escape it as `$$`, or use Docker only for services that don't need that value.

## 11. Ports

| Port | Service |
|---|---|
| 3000 | API |
| 5173 | Web app (Vite dev server, `npm run dev`) |
| 80 / 443 | Web app in the container stack (Caddy) |
| 9101 | Worker metrics |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 1025 / 8025 | Mailpit SMTP / web UI |
| 9090 / 3001 / 3100 | Prometheus / Grafana / Loki |

## 12. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `password authentication failed` on `db:setup` | Check `DB_USER` / `DB_PASSWORD` in `backend/.env`. |
| `/health` shows `"redis":"down"`, Redis warnings in the log | Redis isn't running. The API still works, with sessions in memory; start Redis for the worker. |
| The web app says "The server is not answering" on sign-in | The API isn't running on :3000. Start both with `npm run dev` from the root. |
| Development sign-in panel says the server does not allow it | Set `NODE_ENV=development` and `DEV_LOGIN=true` in `backend/.env`, then restart the API. |
| Signed out after restarting the API | Without Redis, sessions live in API memory. Sign in again. |
| Registration answers 500 ("A apărut o eroare") | The database lacks `users.password_hash`. Run `npm run db:setup` in `backend/`. |
| Requests answer `501 NOT_IMPLEMENTED` | The route exists but isn't implemented yet; the list is in `backend/README.md`. |
| `401 UNAUTHENTICATED` in Postman | Tokens expire after 12 h. Run `npm run dev:token -- --postman` again and re-import the environment. |
| `npx jest` fails with "Must use import to load ES Module" | Use `npm test`, which starts Jest with the flags NestJS 12 needs. |
| `EADDRINUSE :3000` | Another process uses the port. Stop it, or set `PORT=3001` in `.env`. |
