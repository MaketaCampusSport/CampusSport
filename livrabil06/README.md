# Livrabil 06: Structura serverului și stilul de cod

Acest livrabil descrie serverul CampusSport, implementat în `backend/` pornind de la livrabilul 05: specificația API (`livrabil05/openapi.yaml`), schema bazei de date (`livrabil05/baza-de-date/schema-postgresql.sql`) și tehnologiile alese (`livrabil05/Tehnologii-backend.md`).

## Fișiere

| Fișier | Conținut |
|---|---|
| [`Structura-backend.md`](Structura-backend.md) | Organizarea codului: directoare, module, fluxul unei cereri, worker-ul, baza de date, testele, configurarea. |
| [`Stil-de-cod.md`](Stil-de-cod.md) | Regulile de scriere a codului: formatare, denumiri, DTO-uri, erori, SQL, timp, teste, Git. |

## Pe scurt

- **Arhitectura:** monolit modular în NestJS 12 (SDD 3.1), cu un modul pentru fiecare modul din SDD cap. 4. Același cod pornește în două procese: API-ul HTTP și worker-ul pentru joburi.
- **Dimensiune:** circa 8 400 de linii de TypeScript în `src/` (fără teste), 30 de fișiere de teste unitare și o suită end-to-end.
- **Acoperirea specificației:** toate cele 60 de operații din `openapi.yaml` există. 43 sunt implementate complet, iar 17 răspund temporar cu `501 NOT_IMPLEMENTED`. Lista lor este în `backend/README.md`.
- **Garanția anti-suprapunere** (FR-12, NFR-04) este constrângerea `no_overlap` din PostgreSQL. Testul cu 50 de rezervări simultane pe același slot produce exact una reușită și 49 de răspunsuri `409`.

## Cum se verifică

Din directorul `backend/`:

```bash
npm install
npm run lint && npm run typecheck   # stilul și tipurile
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm test                            # 299 de teste unitare și de controller
npm run spec:check                  # conformitatea cu livrabil05/openapi.json
npm run test:e2e                    # întreaga aplicație pe PostgreSQL 18 (baza *_test)
```

Toate verificările de mai sus rulează și în GitHub Actions (`.github/workflows/backend-ci.yml`), la fiecare modificare din `backend/` sau `livrabil05/`.

## Ce nu este acoperit aici

- Comportamentul care depinde de Redis (worker-ul, autentificarea SSO completă, codurile OTP, reîmprospătarea sesiunii) nu a fost rulat local, pentru că Redis nu este încă instalat. Codul are teste unitare cu Redis simulat.
- Imaginea Docker, workflow-ul CI și testele k6 sunt scrise, dar nu au fost încă rulate.
