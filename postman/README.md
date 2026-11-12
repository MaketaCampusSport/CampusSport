# Postman collection

| File | What it is |
|---|---|
| `CampusSport.postman_collection.json` | All 60 operations of `livrabil05/openapi.yaml`, in 9 folders (one per API tag). |
| `CampusSport.postman_environment.json` | Environment template: `baseUrl` and empty tokens. |
| `CampusSport-local.postman_environment.json` | Created by `npm run dev:token -- --postman`, with real tokens. Ignored by Git. |
| `generate-collection.mjs` | Rebuilds the collection from the spec: `node postman/generate-collection.mjs`. |

## Use

1. Start the API (see `../INSTALL.md`).
2. Run `cd backend && npm run dev:token -- --postman`.
3. In Postman, choose **Import**, select the collection and `CampusSport-local.postman_environment.json`, then select that environment.
4. Run a folder's requests from top to bottom.

## How it works

- **Tokens:** each request already sends the right token for the spec's `x-min-role`. Public routes send none, admin routes send `{{adminToken}}`, and user routes send `{{studentToken}}`. The waitlist requests run as the teacher, so they can queue for the slot the student booked. Refresh and logout use the `refresh_token` cookie instead of a token.
- **Dates:** a collection script fills `{{date}}`, `{{slotStart}}` and the other date variables with a weekday two days ahead, in the facility's time zone (Europe/Chisinau). That way bookings always fall inside the open hours and the booking window. Set a variable with the same name in the environment to override it.
- **IDs:** the IDs of created objects are saved automatically, so the requests after them work: "Creează o rezervare" saves `bookingId`, the waitlist signup saves `waitlistId`, and so on. The seeded IDs (court, hall, basketball, student) are preset.
- **Checks:** each request checks that the server didn't answer 5xx. The requests marked *Not implemented yet* in their description expect `501`.
- **Safety:** "Șterge contul și datele personale" (`DELETE /me`) really deletes the external example user, so it is skipped unless you set the collection variable `allowDelete` to `true`. Running the folders also creates a sport ("Handbal") and a resource ("Teren baschet 3") on each run. `npm run db:setup` resets the example rows but doesn't delete these extra ones; delete them from the admin side or the database if you want a clean catalog.

## Known limitations locally

- **SSO:** `sso/login` and `sso/callback` need a reachable identity provider (Keycloak); otherwise they answer 500.
- **External sign-in:** `external/register`, `external/login` and `external/verify` need Redis.
- **Live updates:** `stream/availability` is a Server-Sent Events stream; Postman shows events as they arrive, and you stop it by cancelling the request.
