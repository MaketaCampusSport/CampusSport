# CampusSport – front-end

Sistem de rezervare a bazei sportive universitare. Acest depozit conține:

- **Panoul de administrare (desktop)** – complet, în `src/features/admin`.
- **Aplicația pentru utilizatori (PWA mobilă)** – de adăugat în `src/features/user` (vezi acolo).

Pași de rulare și testare: **[GHID-TESTARE.md](GHID-TESTARE.md)**.

## Pornire rapidă

```bash
npm install
npm run dev        # http://localhost:5173/admin  (SSO demo, cod 123456)
```

## Stack (conform documentației tehnice)

React 18 · TypeScript 6.0 · Vite 8 (țintă Safari 16) · Tailwind CSS 3.4 · Zustand 5 · React Router 7 (import din `react-router`, rute lazy) · TanStack Query 5 · Radix UI · lucide-react · date-fns 4 · i18next (RO implicit, EN) · Recharts 3 · Vitest + Testing Library + MSW 2 · @hey-api/openapi-ts.

## Structura proiectului

```
src/
  api/          tipuri, client HTTP, endpoint-uri, chei TanStack Query
  app/          router, layout (bară laterală, meniu cont), pagini de eroare
  components/ui componente reutilizabile (Button, Modal, Field, Tabs…)
  features/
    admin/      auth, dashboard, resources, schedule, events, blocks,
                announcements, reports, rules, audit, shared, sports, users, checkin, account.
    user/       (rezervat pentru PWA-ul utilizatorilor)
  i18n/         ro.json, en.json
  lib/          date, format, CSV, validări (reguli partajate)
  mocks/        server simulat MSW (date demo, handlere)
  stores/       Zustand: UI/temă, toast, sesiune, wizard orar
  styles/       tokens de culoare (luminos/întunecat), Tailwind
docs/           API-ASSUMPTIONS.md
openapi/        loc pentru openapi.yaml (client generat)
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
| NFR-08 sesiune admin 8 h, SSO + TOTP | `auth/` |
| UI-07 mod întunecat, RO/EN | `styles/index.css`, `i18n/`, meniul contului |
| SYS-02 rezoluție minimă 1366×768 | layout desktop cu bară laterală fixă |
| NFR-14 sporturi și dotări → sports/ |
| FR-05 utilizatori, suspendare → users/ |
| FR-03/FR-15 check-in personal → checkin/ |

## Decizii și abateri (de citit)

1. **Font.** Machetele folosesc un font condensat; documentația cere Barlow. S-a urmat documentația. Titlurile folosesc clasa `.heading` (majuscule, extrabold); fontul se schimbă din `tailwind.config.ts` (`fontFamily.display`).
2. **Rute API „presupuse”.** SDD 6.1 nu listează toate rutele necesare ecranelor. Cele neprecizate sunt marcate `presupus` în `src/api/endpoints.ts` și enumerate în `docs/API-ASSUMPTIONS.md`.
3. **Actualizări live.** SDD prevede SSE pentru disponibilitate; panoul de administrare folosește *polling* la 30 s (raportul de trimitere: 1,5 s cât durează trimiterea). SSE se adaugă dacă backend-ul îl expune pentru admin.
4. **Client API.** Este scris de mână; se înlocuiește cu cel generat (`npm run api:generate`) când există `openapi/openapi.yaml`.
5. **Server simulat.** Datele demo sunt deterministe și se resetează la reîncărcare. Codul TOTP demo este `123456`. Raportul de livrare simulează 8 mesaje/secundă.
6. **Export PDF** în demo: fișier de demonstrație; PDF-ul real vine de la server.
7. **Aplicația pentru utilizatori** nu face parte din această livrare (cerută ulterior).
