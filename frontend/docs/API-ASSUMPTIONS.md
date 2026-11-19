# Rute API presupuse de front-end

SDD 6.1 definește doar o parte dintre rute. Cele de mai jos sunt **presupuse** de front-end și trebuie confirmate sau ajustate cu echipa de backend.
Implementarea lor este în `src/api/endpoints.ts`; tipurile în `src/api/types.ts`; simularea în `src/mocks/handlers.ts`.
Prefix: `/api/v1`. Autentificare: token de acces în memorie (`Authorization: Bearer`) + refresh prin cookie HttpOnly (`POST /auth/refresh`, **de confirmat**, nu e în SDD 6.1). Erori: `{ code, message }` (sau `message_ro`/`message_en`) cu statusul HTTP corespunzător. `401` pe o rută diferită de `/auth/*` și `/me` → front-end-ul trimite la login („sesiune expirată”). Validările eșuate (inclusiv cod TOTP greșit pe `/admin/2fa/confirm`) trebuie să răspundă **422**, nu 401.


| Metodă și rută | Scop | Notă |
|---|---|---|
| `GET /me` | Sesiunea curentă | 401 fără sesiune; `twoFactorVerified`, `expiresAt` (8 h) |
| `POST /auth/admin/totp` | Pasul 2 (TOTP) | corp `{ code }` |
| `POST /auth/logout` | Deconectare | |
| `GET /admin/resources` | Toate resursele, inclusiv inactive | `blocked` calculat de server |
| `POST/PATCH /admin/resources[/:id]` | Creare, editare, (re)activare | `PATCH { active }` |
| `GET /admin/dashboard?date=` | Grila zilei + indicatori + urgențe active | |
| `GET /admin/blocks` | Lista blocărilor + contoare pe stare | |
| `GET /admin/blocks/preview` | Câte rezervări se anulează | `resourceId, from, to, excludeBlockId` |
| `PATCH /admin/blocks/:id` | Editare blocare planificată | |
| `DELETE /admin/blocks/:id` | Deblocare (încheie acum) | |
| `GET /admin/blocks/:id/delivery` | Raport „anunțați / livrați” (SDD 7.3) | |
| `POST /admin/schedule/import/preview` | Previzualizare fișier orar | multipart `file`; întoarce `importId` |
| `POST /admin/schedule/classes/preview` | Previzualizare curs adăugat manual | |
| `GET /admin/events`, `POST /admin/events/preview` | Listă și conflicte | |
| `GET /admin/announcements`, `GET /admin/announcements/audience` | Istoric și „ajunge la N” | |
| `GET /admin/audit` | Jurnal paginat | `q, actorId, period, page, pageSize`; `format=csv` pentru export |
| `GET /admin/reports?month=&format=` | Export CSV/PDF | parametrul `format` este presupus |
| `POST /auth/refresh` | Reînnoiește tokenul de acces | cookie HttpOnly; răspuns `{ accessToken }` |
| `POST/PATCH/DELETE /admin/sports[/:id]` | CRUD sporturi (NFR-14) | corp `{ nameRo, nameEn, requiredEquipment[] }`; `DELETE` → 409 dacă o resursă folosește sportul |
| `GET /admin/users` | Căutare conturi | `q, role, status` |
| `POST /admin/users/:id/suspend` | Suspendare cont (FR-05) | corp `{ days, reason }` |
| `POST /admin/users/:id/reactivate` | Reactivare cont | |
| `POST /admin/check-in` | Check-in personal (FR-03/15) | corp `{ code }` (conținutul QR semnat); răspuns `CheckInResult` |
| `POST /admin/2fa/setup` | Pornește configurarea TOTP | răspuns `{ secret, otpauthUrl }` |
| `POST /admin/2fa/confirm` | Confirmă TOTP | corp `{ code }`; 422 dacă e greșit |

Rutele din SDD 6.1 folosite ca atare: `GET /auth/sso/login`, `GET /sports`, `POST /admin/blocks`, `POST /admin/schedule/import` (cu `importId`), `POST /admin/events`, `POST /admin/announcements`, `GET /admin/reports?month=`, `GET/PUT /admin/settings`.

## Contractul `GET/PUT /admin/settings`

Un obiect JSON cu **exact** câmpurile din `RuleSettings` (`src/api/types.ts`), camelCase:
`quotaMonthly, maxActiveFuture, quotaPerSport, windowTeacherDays, windowStudentDays, windowExternalHours, cancelBeforeHours, checkinBeforeMin, checkinAfterMin, noShowLimit, suspensionDays, waitlistOfferMinutes`.
Valori implicite din SRS: 4, 2, false, 14, 7, 24, 2, 10, 15, 3, 14, 10.

## Decizii de confirmat cu backend-ul

- **D2 – Setări:** `GET/PUT /admin/settings` întoarce/primește `RuleSettings` în camelCase (câmpurile de mai sus).
- **D3 – Autentificare:** token de acces în memorie + refresh prin cookie HttpOnly; `POST /auth/refresh` nu e în SDD 6.1.
- **D4 – Rute noi:** `/admin/sports`, `/admin/users`, `/admin/check-in`, `/admin/2fa/*` sunt presupuse de front-end (tabelul de mai sus).
- **D5 – Cota „per sport” (SDD 8.2):** comutatorul `quotaPerSport` există, dar valorile separate pe sport nu sunt implementate până nu se decide regula.