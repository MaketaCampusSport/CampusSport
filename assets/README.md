# Assets — diagrams and examples

Every image comes as **SVG** (sharp at any zoom, best for Markdown and the web) and **PNG** (for Word, PowerPoint, Confluence). The exceptions are the two HTML-based images, which are PNG only. All of them are generated from the text sources in [`src/`](src/), so edit the source rather than the image.

| Image | What it shows |
|---|---|
| [`01-system-architecture`](01-system-architecture.svg) | Users, PWA, the API and worker processes, PostgreSQL, Redis, SSO, notification channels, monitoring. |
| [`02-backend-modules`](02-backend-modules.svg) | The NestJS modules in `backend/src/modules`, grouped as domain / supporting / common, and how they depend on each other. |
| [`03-booking-sequence`](03-booking-sequence.svg) | `POST /bookings` step by step (SDD 7.1): guard, rules, insert, `no_overlap`, after-commit events, `201` or `409`. |
| [`04-database-erd`](04-database-erd.svg) | The 12 tables with their columns, keys, allowed values and the 19 foreign keys of `schema-postgresql.sql`. |
| [`05-occupancy-timeline.png`](05-occupancy-timeline.png) | One example day in `occupancy`: bookings, a PE class, an emergency “until further notice”, maintenance, cancelled history and a rejected overlapping request. |
| [`06-status-lifecycles`](06-status-lifecycles.svg) | The `occupancy.status` transitions of a booking, and the `waitlist.status` transitions. |
| [`07-block-algorithm`](07-block-algorithm.svg) | `POST /admin/blocks` (SDD 7.3) with the SRS 9.1 block hierarchy and the retry on a concurrent booking. |
| [`08-deployment`](08-deployment.svg) | The `docker-compose.yml` services, profiles (`app`, `monitoring`) and ports. |
| [`09-database-example-rows.png`](09-database-example-rows.png) | Example rows of `users`, `sports`, `resources`, `occupancy`, `monthly_quota`, `waitlist`, `settings`, `audit_log`, using the seed data and the same day as image 05. |

The livrabil05 ER diagrams exported from Oracle SQL Developer Data Modeler are in [`../livrabil05/baza-de-date/`](../livrabil05/baza-de-date/) (`Logical.png`, `Relational_1.png`).

## Regenerating

```bash
node assets/render.mjs
```

The script works like this:

- `src/*.mmd` (Mermaid) are rendered with `@mermaid-js/mermaid-cli`, fetched by `npx` on the first run.
- `src/*.html` pages are captured with headless Chrome or Edge; the capture size is in a `<!-- size: WxH -->` comment at the top of each page.
- The script uses an installed Chrome or Edge, and never downloads a browser. Set `CHROME_PATH` if the browser isn't found.

The colours and fonts are in `src/mermaid.config.json`.
