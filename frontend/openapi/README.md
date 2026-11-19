# OpenAPI

Contractul serverului este `../../assets/livrabil05/openapi.yaml`; `openapi-ts.config.ts` îl citește direct de acolo.

După orice schimbare a contractului:

1. `npm run api:generate` → regenerează `src/api/generated/` (se versionează).
2. `npm run typecheck` arată locurile din `src/api/client.ts` și din pagini care trebuie ajustate.
3. Actualizează serverul simulat (`src/mocks/`) la noile forme.

Vezi și `../docs/API-CONTRACT.md`.
