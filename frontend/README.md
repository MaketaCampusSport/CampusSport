# CampusSport – front-end

Sistem de rezervare a bazei sportive universitare. Acest depozit conține:

- **Aplicația pentru utilizatori (PWA mobilă)** – studenți, profesori și externi, în `src/features/user` (rute `/user/*`).
- **Panoul de administrare (desktop)** – în `src/features/admin` (rute `/admin/*`).
- **Autentificarea** – `src/features/auth` (`/login`, email și parolă) și `src/auth` (sesiune, gărzi de rută).

Ambele vorbesc cu serverul NestJS din `../backend` după contractul `assets/livrabil05/openapi.yaml`.

Pași de rulare și testare: **[GHID-TESTARE.md](GHID-TESTARE.md)**.

## Pornire rapidă

```bash
# din rădăcina depozitului: API + aplicație
npm install && npm run setup
npm run dev        # http://localhost:5173 – „Autentificare de dezvoltare” pe /login și /admin/login

# doar front-end-ul, cu serverul simulat
npm run dev:mock   # conturile demo au parola parola123
```

## Stack (conform documentației tehnice)

React 18 · TypeScript 6.0 · Vite 8 (țintă Safari 16) · Tailwind CSS 3.4 · Zustand 5 · React Router 7 (import din `react-router`, rute lazy) · TanStack Query 5 · Radix UI · lucide-react · date-fns 4 · i18next (RO implicit, EN) · Recharts 3 · Vitest + Testing Library + MSW 2 · @hey-api/openapi-ts.

## Structura proiectului

```
src/
  api/          client.ts (o metodă per operație din contract), generated/ (tipuri generate), http.ts, chei TanStack Query
  auth/         sesiunea (refresh la pornire) și gărzile RequireAdmin / RequireMember
  app/          router, layout (bară laterală, meniu cont), pagini de eroare
  components/ui componente reutilizabile (Button, Modal, Field, Tabs…)
  features/
    admin/      auth, dashboard, resources, schedule, events, blocks,
                announcements, reports, rules, audit, shared, sports, users, checkin, account.
    auth/       login și cont nou cu email și parolă (SSO, OTP extern și 2FA sunt comentate)
    user/       acasă, căutare, confirmare, rezervările mele, profil
  i18n/         ro.json, en.json (admin + comun), member.ro.json, member.en.json (aplicație + autentificare)
  lib/          date, format, CSV, validări (reguli partajate)
  mocks/        server simulat MSW pe rutele contractului (authHandlers, memberHandlers, handlers)
  stores/       Zustand: UI/temă, toast, sesiune, wizard orar
  styles/       tokens de culoare (luminos/întunecat), Tailwind
docs/           API-CONTRACT.md (alinierea la contract, funcții fără rută)
openapi/        cum se regenerează tipurile
```

## Cerințe din documentație acoperite

| Cerință | Unde |
|---|---|
| UI-08 buton de blocare de urgență pe fiecare resursă; FR-40/41 | `dashboard/DayGrid`, `blocks/EmergencyBlockDialog` |
| FR-39 gestionare resurse, FR-07 dotări obligatorii | `resources/`, `lib/validators.ts` |
| FR-42 import orar EF cu conflicte (SDD 7.4) | `schedule/` |
| FR-44 evenimente | `events/` |
| FR-43 panou live (reîmprospătare 30 s) | `dashboard/` |
| FR-45 audit + rapoarte, export CSV/PDF | `audit/`, `reports/` |
| FR-46 reguli BR-01…BR-07 configurabile | `rules/` |
| SDD 7.3 raport „anunțați / livrați” | `blocks/DeliveryReportCard`, `dashboard/EmergencyBanner` |
| NFR-07 WCAG AA | Radix, etichete aria, tabele alternative pentru grafice, focus vizibil, contrast verificat pe tokens |
| NFR-08 sesiune admin 8 h, email și parolă | `auth/` |
| UI-07 mod întunecat, RO/EN | `styles/index.css`, `i18n/`, meniul contului |
| SYS-02 rezoluție minimă 1366×768 | layout desktop cu bară laterală fixă |
| NFR-14 sporturi și dotări → sports/ |
| FR-05 utilizatori, suspendare → users/ |
| FR-03/FR-15 check-in personal → checkin/ |

## Decizii și abateri (de citit)

1. **Font.** Machetele folosesc un font condensat; documentația cere Barlow. S-a urmat documentația. Titlurile folosesc clasa `.heading`; fontul se schimbă din `tailwind.config.ts` (`fontFamily.display`).
2. **Contractul API este sursa de adevăr.** Funcțiile din machete fără rută în `openapi.yaml` au fost scoase sau înlocuite; lista este în `docs/API-CONTRACT.md`.
3. **Actualizări live.** Aplicația utilizatorilor ascultă SSE `slot-changed` (până la 3 resurse) și reîmprospătează la 30 s; panoul de administrare folosește *polling*.
4. **Ore.** Toate orele se afișează în fusul bazei (Europe/Chisinau), iar rezervarea trimite începutul exact al slotului primit de la server (corect și la schimbarea orei).
5. **Server simulat.** Datele demo sunt deterministe și se resetează la reîncărcare. Conturile demo au parola `parola123`.
6. **Rute încă 501 pe server** (orar EF, evenimente, PDF, export GDPR): paginile le arată ca indisponibile.
