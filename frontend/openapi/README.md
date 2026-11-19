# OpenAPI

Backend-ul (NestJS, `@nestjs/swagger`, NFR-13) publică specificația aici ca `openapi/openapi.yaml`.

Pași:
1. Copiază `openapi.yaml` în acest folder.
2. Rulează `npm run api:generate` → se generează clientul în `src/api/generated`.
3. Compară rutele generate cu `docs/API-ASSUMPTIONS.md`; rutele „presupuse” se confirmă sau se ajustează în `src/api/endpoints.ts`.

Până atunci, contractul front-end este `src/api/types.ts` + `src/api/endpoints.ts` + `docs/API-ASSUMPTIONS.md`.
