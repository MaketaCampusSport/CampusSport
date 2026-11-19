# Stilul de cod al serverului CampusSport

Regulile de mai jos sunt cele urmate în `backend/`. Cele marcate **(automat)** sunt verificate de unelte, local și în CI; celelalte se verifică la code review.

## 1. Unelte

| Unealtă | Configurare | Comandă |
|---|---|---|
| Prettier **(automat)** | `.prettierrc`: ghilimele simple, virgulă finală, lățime 110 | `npm run format`, verificare cu `npx prettier --check "src/**/*.ts" "test/**/*.ts"` |
| ESLint **(automat)** | `eslint.config.mjs`: regulile recomandate pentru JS și TypeScript | `npm run lint` |
| TypeScript **(automat)** | `tsconfig.json`: `strict`, `noImplicitOverride`, `isolatedModules` | `npm run typecheck` |
| Sfârșit de linie **(automat)** | `.gitattributes`: LF în toate fișierele, inclusiv pe Windows | aplicat de Git |

Codul care nu trece aceste verificări nu intră în `main`.

## 2. Limba

- **Codul** (variabile, funcții, clase, comentarii) este în **engleză**.
- **Mesajele pentru utilizator** sunt în **română și engleză** (`message_ro`, `message_en`), ca în specificație.
- **Documentația proiectului** (`livrabil*/`) este în română.
- În comentarii, cerințele se citează cu identificatorul din SRS/SDD: `FR-12`, `NFR-04`, `BR-06`, `SDD 7.3`, `SRS 9.1`.

## 3. Denumiri

| Element | Convenție | Exemplu |
|---|---|---|
| Fișiere | kebab-case, cu sufixul rolului | `bookings.service.ts`, `booking-rules.ts`, `jwt-auth.guard.ts` |
| Clase | PascalCase, cu sufixul rolului | `BookingsService`, `CatalogController`, `BookingCreateDto` |
| Funcții și variabile | camelCase | `checkBookingRules`, `activeBookings` |
| Constante | UPPER_SNAKE_CASE | `DEFAULT_RULES`, `OTP_TTL_SECONDS` |
| Câmpuri JSON (DTO-uri) | snake_case, identic cu `openapi.yaml` | `resource_id`, `participants_count` |
| Proprietăți ale entităților | camelCase, mapate pe coloane snake_case | `fullName` ↔ `full_name` |
| `operationId` | identic cu `openapi.yaml` | `createBooking` |
| Coduri de eroare | identice cu `ErrorCode` din specificație | `SLOT_TAKEN`, `QUOTA_EXHAUSTED` |

Sufixele fișierelor: `.module.ts`, `.controller.ts`, `.service.ts`, `.dto.ts`, `.entity.ts`, `.spec.ts` (unitare), `.e2e-spec.ts` (end-to-end).

## 4. Organizarea codului

- **Un modul pentru fiecare zonă de domeniu**, în `src/modules/<nume>/`. Codul folosit de mai multe module stă în `src/common/` și nu conține reguli de business.
- **Controller-ele sunt subțiri.** Primesc DTO-ul validat și utilizatorul curent, apelează un serviciu și întorc rezultatul. Nu conțin SQL și nici reguli.
- **Logica pură stă separat de baza de date.** Regulile de rezervare (`booking-rules.ts`), grila de sloturi (`slots.ts`, `grid.ts`), mesajele (`messages.ts`) și alegerea alternativelor (`alternatives.ts`) sunt funcții fără efecte secundare, testate direct.
- **O regulă se scrie o singură dată.** De exemplu, `bookable` din grila de disponibilitate și `POST /bookings` folosesc aceeași funcție `checkBookingRules`, ca să nu dea rezultate diferite.
- **Conversia către JSON** se face în funcții dedicate (`toBookingResponse`, `toUserResponse`), lângă DTO-uri.
- **Efectele de după commit** (SSE, joburi) trec prin `OccupancyEventsService`, nu se apelează direct din fiecare serviciu.

## 5. API: DTO-uri, roluri, răspunsuri

- Fiecare corp de cerere și fiecare parametru de query are o clasă DTO cu decoratori `class-validator` și `@ApiProperty`. Câmpurile necunoscute sunt respinse.
- Pentru `PATCH`, DTO-ul se derivă cu `PartialType(...)` din DTO-ul de creare, nu se scrie de două ori.
- Fiecare rută are `@ApiOperation({ operationId })`, cu `operationId` exact ca în `openapi.yaml`.
- Rolul se declară cu decoratori, după `x-min-role`:

  | `x-min-role` | În cod |
  |---|---|
  | `public` | `@Public()` |
  | `admin`, `student` | `@Roles('admin')`, `@Roles('student')` |
  | `utilizator`, `titular` | implicit (guard-ul global cere autentificare) |

  Pentru `titular`, proprietatea se verifică în serviciu.
- O resursă care nu aparține apelantului răspunde `404`, nu `403`, ca să nu dezvăluie că există.
- Parametrii `{id}` trec prin `UuidParamPipe`: un identificator malformat răspunde tot `404`.
- Datele și orele se trimit în ISO 8601 cu decalajul fusului orar al bazei sportive, de exemplu `2026-11-12T18:00:00+02:00`.

## 6. Erori

- Toate erorile se aruncă cu `new AppException('<COD>')`. Codurile, statusurile HTTP și mesajele implicite RO/EN sunt în `common/errors/error-codes.ts`.
- Un mesaj se personalizează doar când ajută utilizatorul. De exemplu, la `QUOTA_EXHAUSTED` mesajul numește luna: „Ți-ai folosit intrările din noiembrie...”.
- Nu se trimit către client detalii interne (stack trace, mesaje SQL): filtrul global le înlocuiește cu `500 INTERNAL_ERROR` și le scrie doar în log.
- O rută încă neimplementată apelează `notImplemented()`, care răspunde `501 NOT_IMPLEMENTED`.

## 7. Baza de date și SQL

- **Schema nu se modifică din cod.** Orice schimbare pornește de la `livrabil05/baza-de-date/schema-postgresql.sql` și ajunge într-o migrare nouă.
- **Parametri, nu concatenare.** Valorile intră în SQL doar ca `$1`, `$2`...
- **O operație logică = o tranzacție.** Ce trebuie să reușească sau să eșueze împreună (de exemplu rezervarea și consumul cotei, sau blocarea și jurnalul de audit) se face în același `dataSource.transaction(...)`, transmițând `em` mai departe.
- **Concurența o rezolvă baza de date.** Suprapunerile se previn prin `no_overlap`, nu prin verificări în cod. Când e nevoie de ordine, se blochează explicit rândul (`FOR UPDATE`, `FOR NO KEY UPDATE`).
- **Reîncercări.** Tranzacțiile care pot intra în conflict se învelesc în `withTransientRetry` (`common/db/transient.ts`), care le repetă la `deadlock` sau `serialization failure`.
- **`UPDATE` / `DELETE ... RETURNING` se învelesc în `rowsOf()`.** TypeORM întoarce pentru ele `[rânduri, număr]`, nu doar rândurile.
- **Auditul.** Orice modificare făcută de un administrator scrie în `audit_log`, prin `AuditService.record(..., em)`, în aceeași tranzacție.

## 8. Timp, reguli și configurare

- **Timpul.** Zilele, lunile și orele se calculează în fusul orar al bazei sportive (`FACILITY_TIMEZONE`, Europe/Chisinau), cu `luxon` și funcțiile din `common/time.ts`, niciodată în UTC sau în fusul serverului. Altfel cota lunii sau grila zilei ar fi greșite în jurul miezului nopții și la trecerea la ora de vară.
- **Funcțiile care depind de oră** primesc `now` ca parametru, cu valoarea implicită `new Date()`. Astfel testele pot fixa ora.
- **Regulile de business** (cota, ferestrele, minutele de check-in etc.) se citesc din `SettingsService`; nu se scriu numere fixe în cod.
- **Secretele** vin doar din variabile de mediu. `.env` nu intră în Git, iar `.env.example` arată ce variabile există.

## 9. Securitate

- Codurile OTP și tokenurile de reîmprospătare se păstrează doar ca hash. Ele, ca și semnăturile codurilor QR, se compară cu `timingSafeEqual`.
- În cererile HTTP logate, tokenurile, cookie-urile, codurile OTP/TOTP și codurile QR sunt mascate (`common/logging.ts`). Mesajele de eroare din servicii identifică utilizatorul prin `id`, nu prin email.
- **Excepție temporară:** driverul de SMS pentru dezvoltare scrie în log numărul de telefon și textul mesajului, inclusiv codul OTP. Trebuie înlocuit cu furnizorul real înainte de producție.
- **De îmbunătățit:** secretul TOTP al administratorilor (`users.totp_secret`) este stocat necriptat.
- Redirecționările după autentificare acceptă doar căi din PWA (`safeReturnTo`), nu URL-uri externe.
- Răspunsurile care ar putea dezvălui dacă un cont există (de exemplu `POST /auth/external/login`) sunt identice în ambele cazuri.

## 10. Comentarii

- Un comentariu explică **de ce**, nu ce face codul: o regulă din specificație, o decizie, o capcană.
- Unde o regulă vine din SRS/SDD, comentariul citează identificatorul cerinței. Exemplu:

```ts
// FR-28: with the quota used up, a student may still take slots left free in the last 24 h.
```

- Clasele și funcțiile publice importante au un rând de documentare (`/** ... */`) care spune rolul lor.

## 11. Teste

- **Fiecare rută are cel puțin un test de controller**, construit cu `createTestApp` (`src/testing/test-app.ts`). Acesta rulează pipeline-ul real (prefix, validare, guard, filtru de erori) cu utilizatori de test (`student`, `teacher`, `admin`, `external`, `suspended`) și servicii simulate.
- **Datele de test sunt datele exemplu din specificație** (`database/seeds/example-data.ts`), nu valori inventate în fiecare test.
- Un test de controller verifică: răspunsul reușit, `401` fără autentificare, `403` pentru rolul greșit, `422` pentru date invalide și codurile de eroare specifice rutei.
- **Logica serviciilor** se testează cu o bază de date simulată. **Comportamentul care ține de PostgreSQL** (constrângeri, concurență, triggere, forma rezultatelor) se testează doar end-to-end, pe o bază reală.
- Numele testelor descriu comportamentul, cu codul de răspuns, de exemplu `'409 SLOT_TAKEN with the waitlist offer'`.
- Acoperirea minimă este 70% din linii (NFR-13) și este verificată în CI. Acum este 82%.

## 12. Git

- **O ramură pentru fiecare sarcină**, creată din `main`, cu prefix: `feat/`, `fix/`, `test/`, `docs/`, `chore/`.
- **Un commit după fiecare modificare medie sau mare.** Titlul este la imperativ, în engleză, sub 72 de caractere; corpul spune ce s-a schimbat și de ce. Exemplu: `Add waitlist, blocks, settings admin and audit log`.
- **Integrarea** se face cu `git merge --no-ff` în `main`, după ce trec lint, typecheck, testele și build-ul; apoi ramura se șterge.
- Formatarea automată pe tot codul se face într-un commit separat, ca istoricul să rămână ușor de citit.
