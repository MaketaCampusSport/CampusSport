# Baza de date CampusSport

Sarcina 9.6. Am ales o bază de date **relațională**, PostgreSQL, conform SDD 2.3: garanția „zero rezervări suprapuse” vine dintr-o constrângere a bazei de date, pe care un sistem NoSQL nu o oferă.

| Fișier | Rol |
|---|---|
| `datamodeler-import.ddl` | Modelul pentru Oracle SQL Developer Data Modeler, din care rezultă diagrama ERD. |
| `schema-postgresql.sql` | Schema reală a aplicației, pentru PostgreSQL 15 sau mai nou. |

## De ce sunt două fișiere

Data Modeler 19.4 importă DDL doar din Oracle, DB2 și SQL Server, nu din PostgreSQL. Fișierul de import descrie aceleași 12 tabele și 19 chei străine, scrise în dialect Oracle. Are doar caractere ASCII, ca diacriticele să nu se strice la import.

## Import în Data Modeler

1. Deschide `datamodeler.exe`.
2. Alege **File → Import → DDL File** și selectează `datamodeler-import.ddl`.
3. La baza de date, alege cea mai nouă versiune Oracle din listă. Pachetul tău conține Oracle Database 12c.
4. Importă într-un model relațional nou și aplică modificările în fereastra de comparare.
5. Se deschide diagrama relațională, cu cele 12 tabele și relațiile dintre ele. Dacă tabelele sunt suprapuse, folosește **Layout → Auto Layout** din meniul diagramei.

**Pentru ERD:** alege **Design → Engineer to Logical Model** ca să obții modelul logic cu entități. Pentru Confluence, salvează imaginea diagramei din **File → Print Diagram**.

## Corespondența tipurilor

Diagrama arată tipurile Oracle, iar comentariile coloanelor indică tipul real unde diferă.

| PostgreSQL | În Data Modeler |
|---|---|
| `uuid` | `VARCHAR2(36)` |
| `text` | `VARCHAR2(n)` |
| `timestamptz` | `TIMESTAMP WITH TIME ZONE` |
| `tstzrange` (`period`, `offered_period`) | două coloane, `*_start` și `*_end` |
| `jsonb`, `text[]` | `CLOB` |
| `boolean` | `NUMBER(1)` cu `CHECK` |

Nu se pot reprezenta în Data Modeler și există doar în `schema-postgresql.sql`:

- constrângerea de excludere `no_overlap` (FR-12), menționată în comentariul tabelului `occupancy`;
- indexul GiST și indexul unic parțial de pe `waitlist`, care împiedică înscrierile duble;
- partiționarea lunară pentru `notifications` și `audit_log`;
- triggerul care face `audit_log` doar pentru inserare;
- valorile implicite din `settings` (SRS 9.2).

## Diferențe față de SDD 5.1

**O corectură.** Regula din SDD 5.2, `CHECK (kind = 'booking') = (user_id IS NOT NULL)`, contrazice SDD 5.3, care pune `user_id` pe NULL la anonimizare. Am adăugat `anonymized_at` și am schimbat regula: o rezervare are titular sau este anonimizată.

**Coloane adăugate**, pentru că o cerință sau API-ul din acest livrabil au nevoie de ele:

| Tabel | Coloane | Motiv |
|---|---|---|
| `users` | `email_verified_at`, `phone_verified_at` | Verificarea externilor (FR-02) |
| `users` | `totp_secret` | 2FA pentru administratori (NFR-08) |
| `users` | `calendar_token` | Abonamentul iCal personal (FR-17) |
| `users` | `notification_preferences` | Canale preferate (FR-37, SRS 9.3) |
| `users` | `last_active_at` | Ștergerea conturilor externe inactive (SDD 5.3) |
| `resources` | `external_access_windows` | Intervalele pentru externi (FR-04) |
| `occupancy` | `participants_count` | Rezervare pentru echipă (FR-18) |
| `occupancy` | `sport_id` | Cota per sport, dacă se activează (FR-25) |
| `occupancy` | `anonymized_at`, `created_at` | Anonimizare (SDD 5.3) și evidență |
| `waitlist` | `offer_expires_at`, `offered_resource_id`, `offered_period` | Oferta curentă, inclusiv la abonări (FR-33) |
| `waitlist` | `created_at` | Ordinea după ora înscrierii (SDD 7.2) |
| `notifications` | `block_id` | Contorul „anunțați / livrați” (SDD 7.3) |
| `notifications` | `created_at` | Cheia de partiționare, mereu completată, spre deosebire de `sent_at` |

Codurile OTP, tokenurile de reîmprospătare și previzualizările de import nu au tabele: stau temporar în Redis.

**De decis:** dacă limita de 4 intrări se aplică separat pe sport (SRS 9.7), cheia primară din `monthly_quota` trebuie să includă și `sport_id`.

## Ce a fost verificat

- **`schema-postgresql.sql`:** a rulat pe PostgreSQL 18.6 în PGlite (Postgres embedded), cu 40 de scenarii trecute, printre care suprapuneri, slot eliberat după anulare, anonimizare și ștergere de cont.
- **`datamodeler-import.ddl`:** cu bibliotecile din Data Modeler 19.4, separatorul de instrucțiuni a găsit toate cele 124 de instrucțiuni, iar gramatica Oracle nu a raportat erori.
- **Între fișiere:** un script a confirmat aceleași tabele, coloane, obligativități și chei străine.

## Ce nu a fost verificat

- **Importul complet în interfața Data Modeler** nu a rulat, pentru că acel cod are nevoie de aplicația deschisă. Dacă o instrucțiune este respinsă, apare în jurnalul de import.
- **Cereri simultane reale:** PGlite are o singură conexiune, iar Docker nu rula. Testul cu 100 de cereri simultane (NFR-04) rămâne pentru un server PostgreSQL real.
- **Execuția pe un server Oracle:** nu este necesară, fișierul servește doar pentru modelare.
