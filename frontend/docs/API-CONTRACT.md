# Alinierea front-end-ului la contractul API

Contractul este `assets/livrabil05/openapi.yaml` (60 de operații sub `/api/v1`). Front-end-ul nu mai folosește rute „presupuse”:

- tipurile se generează din contract în `src/api/generated/` (`npm run api:generate`, rezultatul se versionează);
- `src/api/client.ts` are o metodă pentru fiecare operație, cu JSON snake_case exact ca în specificație;
- serverul simulat (`src/mocks/*Handlers.ts`, `handlers.ts`) răspunde pe aceleași rute și cu aceleași forme, inclusiv corpurile de eroare `{ code, message_ro, message_en, details? }`.

Singurele rute în afara contractului sunt `GET /auth/dev/users` și `POST /auth/dev/login`: autentificarea de dezvoltare, care există doar când API-ul rulează cu `NODE_ENV=development` (altfel 404).

## Autentificare

| Pas | Rută |
|---|---|
| Pornire la încărcare | `POST /auth/refresh` (cookie HttpOnly `refresh_token`, path `/api/v1/auth`) → `Session` |
| Membri (student, profesor) | navigare la `GET /auth/sso/login?return_to=/user`; serverul revine la `return_to` cu cookie-ul setat |
| Administratori | același SSO, apoi serverul trimite la `/auth/2fa?challenge_id=…&return_to=…` → `POST /auth/2fa/verify` |
| Externi | `POST /auth/external/register` sau `/login` → `POST /auth/external/verify` |
| Ieșire | `POST /auth/logout` |

Tokenul de acces stă doar în memorie. La un `401`, `http.ts` încearcă o singură dată `POST /auth/refresh`; dacă nici acesta nu reușește, gărzile de rută trimit la `/login` sau `/admin/login`.

## Funcții ale machetelor care nu au rută în contract

Au fost scoase din interfață sau înlocuite. Dacă sunt necesare, se adaugă întâi în `assets/livrabil05/openapi.yaml`, apoi în backend și aici.

| Pagină | Ce lipsește |
|---|---|
| Sporturi | ștergerea unui sport |
| Resurse | indicatorul „blocată” vine din `GET /admin/blocks`; un singur interval orar pentru zilele bifate |
| Blocări | previzualizarea rezervărilor afectate, editarea, recurența (serverul răspunde 501), tipul „curățenie”, alegerea canalelor |
| Panou | variația față de săptămâna trecută; numărul de rezervări anulate în banda de urgență |
| Rapoarte | variațiile față de luna trecută; exportul PDF (501 pe server) |
| Jurnal audit | căutarea text liber; lista administratorilor vine din `GET /admin/users` |
| Utilizatori | coloana „neprezentări luna aceasta” |
| Anunțuri | istoricul, estimarea audienței, categoria, titlul și canalele |
| Check-in | resursa și ora în rezultat (`CheckInResult` are doar titularul, categoria și ora check-in-ului) |
| Evenimente | lista evenimentelor, recurența, previzualizarea conflictelor (rămâne confirmarea la `409 CONFLICTS_NEED_CONFIRMATION`) |
| Rezervări (admin) | numele titularului: contractul `Booking` nu îl are; se ia din grila zilei |
| Cont admin | configurarea TOTP din interfață (se face cu `npm run admin:enroll-totp`) |
| Profil utilizator | exportul datelor (`GET /me/export` răspunde 501) |

## Rute încă 501 pe server

Lista actuală este în `backend/README.md`. În interfață, paginile Orar EF și Evenimente sunt dezactivate (`SERVER_READY = false`), iar exportul PDF și exportul datelor personale apar ca indisponibile.
