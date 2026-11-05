# Livrabil 05: Proiectarea interfeței de comunicare cu serverul (REST API)

Sarcina 9.2, termen Lab 6. Specificația pornește din SRS și SDD-ul proiectului CampusSport.

## Fișiere

| Fișier | Rol |
|---|---|
| `openapi.yaml` | Sursa specificației, OpenAPI 3.0.3. Se deschide în Swagger Editor. |
| `openapi.json` | Aceeași specificație în JSON. |
| `CampusSport-API.pdf` | Documentul API de predat (86 de pagini). |
| `CampusSport-API.html` | Documentație Swagger UI navigabilă, funcționează offline. |
| `CampusSport-API-prezentare.pptx` | Prezentarea pentru coordonator: 8 slide-uri, cu note de vorbitor. |

Pentru a vedea specificația în editorul indicat în sarcină: pe <https://editor.swagger.io/>, alegeți **File → Import file** și selectați `openapi.yaml`.

## Conținut

60 de operații pe 55 de căi și 54 de scheme, grupate pe cele 9 module din SDD cap. 4:

- **22 de operații** sunt rutele din SDD 6.1 și 6.2.
- **38 de operații** sunt adăugate fiindcă SRS le cere, dar SDD nu le listează. Sunt marcate cu `x-sdd-route: false`.

Fiecare operație are rolul minim în `x-min-role` și cerințele acoperite în `x-srs`.

## Decizii de validat

1. **Rolul „personal”.** SDD cere „titular / personal” la check-in, dar `users.role` nu are această valoare. În specificație, personalul este un cont `admin`. Alternativa este un rol nou `staff`.
2. **Anulare cu sub 2 h înainte.** FR-14 limitează anularea gratuită, iar UC-02 anulează cu 1,5 h înainte. Anularea este permisă și eliberează slotul, dar intrarea rămâne consumată (`quota_refunded: false`).
3. **Blocare peste altă blocare.** `no_overlap` ar respinge o urgență peste o oră EF, iar SDD 7.3 anulează doar rezervări. Conform SRS 9.1, API-ul înlătură nivelul inferior (`superseded_blocks_count`) și răspunde cu `409` la același nivel sau la unul superior.
4. **Câmpuri peste SDD 5.1.** `external_access_windows` (FR-04), `participants_count` (FR-18) și `sport_id` opțional la rezervare, pentru cota per sport (FR-25).
5. **`GET /availability?sport=`.** Extinde ruta din SDD, care primește doar `resource`, ca fluxul „sport → slot → confirmare” să rămână la 3 pași (FR-11).
6. **2FA în aplicație.** `POST /auth/2fa/verify` presupune că al doilea pas este în CampusSport. Dacă furnizorul SSO îl face singur, ruta dispare.

Rămân deschise întrebările din SRS 9.7: furnizorul SSO, cota per sport, taxa pentru externi și bugetul de SMS. Domeniile din `servers` sunt orientative.

## Verificări făcute

- Swagger Editor 4.14.8, rulat local: 0 erori și 0 avertismente.
- `swagger-parser`: YAML și JSON valide.
- Redocly: valid, cu 8 avertismente de stil (fără licență, domenii `.example`, redirecționări fără răspuns 2xx sau 4xx).
- Script propriu: toate cele 22 de rute din SDD există, cele 46 de cerințe FR apar în `x-srs`, iar rolurile, securitatea și codurile de eroare sunt consecvente.

## Ce nu este verificat

- Specificația nu a fost încărcată în editorul găzduit `editor.swagger.io` (versiunea 5), ci doar în Swagger Editor 4 local.
- Prezentarea a fost verificată ca structură de fișier și printr-o replică HTML cu aceleași coordonate, nu în PowerPoint.
- Nu există server, deci comportamentul nu a fost testat. Timpii și testul cu 100 de cereri simultane rămân de verificat la implementare. Tot de aceea „Try it out” este dezactivat în `CampusSport-API.html`.

## Trasabilitate

FR-16, FR-31, FR-33, FR-34, FR-36 și NFR-03 sunt realizate în principal de worker (SDD 4.1). Operațiile de mai jos sunt cele prin care API-ul le declanșează sau le expune rezultatul.

| Cerință | Operații |
|---|---|
| FR-01 | `GET /auth/sso/login`, `GET /auth/sso/callback`, `GET /me` |
| FR-02 | `POST /auth/external/register`, `POST /auth/external/login`, `POST /auth/external/verify` |
| FR-03 | `POST /bookings`, `GET /bookings/{id}`, `POST /bookings/{id}/check-in` |
| FR-04 | `GET /resources`, `POST /admin/resources`, `PATCH /admin/resources/{id}` |
| FR-05 | `GET /admin/users`, `POST /admin/users/{id}/suspend`, `POST /admin/users/{id}/reactivate` |
| FR-06 | `GET /sports` |
| FR-07 | `GET /resources` |
| FR-08 | `GET /resources/{id}` |
| FR-09 | `GET /availability`, `GET /stream/availability` |
| FR-10 | `GET /availability`, `GET /stream/availability` |
| FR-11 | `GET /availability`, `POST /bookings` |
| FR-12 | `POST /bookings` |
| FR-13 | `POST /bookings`, `POST /waitlist` |
| FR-14 | `DELETE /bookings/{id}` |
| FR-15 | `POST /bookings/{id}/check-in` |
| FR-16 | `GET /bookings/{id}`, `POST /bookings/{id}/check-in` |
| FR-17 | `GET /bookings/{id}`, `GET /bookings/{id}/calendar.ics`, `GET /me/bookings`, `GET /me/calendar-feed`, `GET /calendar/{token}.ics` |
| FR-18 | `POST /bookings`, `POST /bookings/{id}/invitations`, `GET /invitations/{token}` |
| FR-19 | `POST /admin/schedule/import`, `POST /admin/schedule/import/{id}/confirm`, `POST /admin/schedule/classes`, `DELETE /admin/schedule/recurrences/{id}` |
| FR-20 | `GET /availability`, `POST /bookings`, `GET /admin/blocks`, `POST /admin/schedule/import/{id}/confirm`, `POST /admin/schedule/classes` |
| FR-21 | `POST /admin/events` |
| FR-22 | `POST /admin/blocks`, `POST /admin/schedule/import`, `POST /admin/schedule/import/{id}/confirm`, `POST /admin/schedule/classes`, `POST /admin/events` |
| FR-23 | `GET /availability`, `POST /bookings` |
| FR-24 | `GET /availability`, `POST /bookings`, `PUT /admin/settings` |
| FR-25 | `POST /bookings`, `GET /me/quota`, `PUT /admin/settings` |
| FR-26 | `GET /me/quota` |
| FR-27 | `DELETE /bookings/{id}`, `POST /admin/bookings/{id}/cancel`, `GET /me/quota` |
| FR-28 | `POST /bookings`, `GET /me/quota`, `POST /waitlist` |
| FR-29 | `POST /bookings`, `GET /me/quota` |
| FR-30 | `POST /waitlist`, `GET /me/waitlist`, `DELETE /waitlist/{id}` |
| FR-31 | `DELETE /bookings/{id}`, `POST /waitlist`, `POST /waitlist/{id}/accept`, `POST /me/push-subscriptions`, `DELETE /admin/blocks/{id}`, `DELETE /admin/schedule/recurrences/{id}` |
| FR-32 | `POST /waitlist/{id}/accept` |
| FR-33 | `DELETE /waitlist/{id}`, `POST /waitlist/{id}/accept` |
| FR-34 | `POST /me/push-subscriptions` |
| FR-35 | `PATCH /admin/bookings/{id}`, `POST /admin/bookings/{id}/cancel`, `POST /me/push-subscriptions`, `POST /admin/blocks`, `POST /admin/events` |
| FR-36 | `POST /me/push-subscriptions`, `PUT /me/notification-preferences`, `POST /admin/blocks` |
| FR-37 | `DELETE /me/push-subscriptions/{id}`, `GET /me/notification-preferences`, `PUT /me/notification-preferences` |
| FR-38 | `POST /admin/announcements` |
| FR-39 | `POST /admin/sports`, `PUT /admin/sports/{id}`, `POST /admin/resources`, `PATCH /admin/resources/{id}` |
| FR-40 | `POST /admin/blocks`, `DELETE /admin/blocks/{id}` |
| FR-41 | `POST /admin/blocks`, `GET /admin/blocks/{id}/delivery` |
| FR-42 | `GET /admin/blocks`, `POST /admin/blocks` |
| FR-43 | `GET /admin/bookings`, `GET /admin/dashboard` |
| FR-44 | `GET /admin/reports` |
| FR-45 | `POST /admin/users/{id}/suspend`, `POST /admin/users/{id}/reactivate`, `POST /admin/sports`, `PUT /admin/sports/{id}`, `POST /admin/resources`, `PATCH /admin/resources/{id}`, `PATCH /admin/bookings/{id}`, `POST /admin/bookings/{id}/cancel`, `POST /admin/blocks`, `DELETE /admin/blocks/{id}`, `POST /admin/schedule/import/{id}/confirm`, `POST /admin/schedule/classes`, `DELETE /admin/schedule/recurrences/{id}`, `POST /admin/events`, `POST /admin/announcements`, `PUT /admin/settings`, `GET /admin/audit-log` |
| FR-46 | `GET /admin/settings`, `PUT /admin/settings` |
| NFR-01 | `GET /availability`, `POST /bookings` |
| NFR-03 | `POST /admin/blocks`, `GET /admin/blocks/{id}/delivery` |
| NFR-04 | `POST /bookings` |
| NFR-08 | `GET /auth/sso/callback`, `POST /auth/2fa/verify`, `POST /auth/refresh`, `POST /auth/logout` |
| NFR-09 | `GET /bookings/{id}`, `DELETE /bookings/{id}`, `POST /bookings/{id}/check-in` |
| NFR-11 | `POST /auth/external/register`, `DELETE /me`, `GET /me/export` |
| NFR-14 | `POST /admin/sports`, `PUT /admin/sports/{id}`, `POST /admin/resources` |
