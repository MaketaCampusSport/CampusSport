# Tehnologii backend

Această pagină listează tehnologiile cu care va fi construit serverul CampusSport. Alegerile de bază vin din SDD, secțiunea 2.3, iar restul completează ce SDD lasă nespecificat, cum ar fi ORM-ul, testarea și bibliotecile.

Coloana **Sursă** arată de unde vine fiecare alegere: `SDD` înseamnă decizie deja documentată, iar `Nou` înseamnă alegere făcută în această etapă. Versiunile sunt cele stabile la data de 5 noiembrie 2026.

## Suita pe scurt

| Strat | Tehnologie |
|---|---|
| Limbaj și platformă | TypeScript 6 pe Node.js 24 LTS |
| Framework | NestJS 12, monolit modular |
| Bază de date | PostgreSQL 18, accesat prin TypeORM 1 |
| Coadă, joburi și cache | Redis 8 cu BullMQ 6 |
| Timp real | Server-Sent Events |
| Autentificare | OpenID Connect, JWT, OTP pentru externi, TOTP pentru administratori |
| Notificări | Web Push (VAPID), email, SMS prin API |
| Testare | Jest, Supertest, Testcontainers, k6 |
| Livrare | Docker, GitHub Actions |
| Monitorizare | Prometheus, Grafana, Loki |

## Platformă și API

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| Node.js | 24 LTS | Mediul de rulare pentru API și worker | Potrivit pentru I/O și timp real; versiunea LTS este suportată pe durata proiectului | SYS-04 | SDD |
| TypeScript | 6.x | Limbajul serverului | Același limbaj ca în clientul PWA, tipuri verificate la compilare | NFR-13 | SDD |
| NestJS (cu Express) | 12.x | Framework-ul serverului | Modulele sale corespund celor 9 module din SDD cap. 4 | NFR-13 | SDD |
| @nestjs/swagger | 12.x | Documentația OpenAPI generată din cod | Permite compararea codului cu specificația din livrabilul API | NFR-13 | Nou |
| class-validator, class-transformer | 0.15.x, 0.5.x | Validarea datelor de intrare | Se integrează direct cu NestJS și cu @nestjs/swagger | NFR-10 | Nou |

## Date

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| PostgreSQL | 18.x | Baza de date principală | Tranzacții, tipul `tstzrange` și constrângeri de excludere; suport până în noiembrie 2030 | FR-12, FR-13, NFR-04, SYS-05 | SDD |
| Extensia btree_gist | inclusă în PostgreSQL | Permite constrângerea `no_overlap` | Combină `resource_id` și `period` în același index GiST | FR-12 | SDD |
| TypeORM | 1.x | ORM-ul și migrările | Are tip `tstzrange` și decoratorul `@Exclusion`; integrare oficială cu NestJS | FR-12, NFR-10 | Nou |
| pg | 8.x | Driverul PostgreSQL | Driverul folosit de TypeORM pentru PostgreSQL | SYS-05 | Nou |
| pg_dump | inclus în PostgreSQL | Backup zilnic, păstrat 30 de zile, în altă locație | Simplu de automatizat pentru volumul inițial de 50 GB | NFR-12, SYS-07 | Nou |

## Procesare asincronă și timp real

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| Redis | 8.x | Coada de joburi, cache și distribuirea evenimentelor între instanțe | Compatibil cu BullMQ, cerut de arhitectura din SDD 8.2 | SYS-06 | SDD |
| BullMQ, @nestjs/bullmq | 6.x, 12.x | Joburile worker-ului: notificări, remindere, no-show, liste de așteptare | Are joburi programate și reîncercări, necesare în SDD 4.1 | FR-16, FR-31, FR-34, NFR-03 | SDD |
| ioredis | 5.x | Clientul Redis | Este versiunea compatibilă cu restul suitei | SYS-06 | Nou |
| Server-Sent Events (`@Sse` din NestJS) | inclus în NestJS | Actualizarea grilei de disponibilitate | Comunicarea este într-un singur sens, deci WebSocket nu este necesar | FR-09, SRS 8.3.4 | SDD |

## Autentificare și securitate

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| openid-client | 6.x | Login SSO, flux Authorization Code + PKCE | Implementează OpenID Connect, nu depinde de un anumit furnizor | FR-01 | SDD (protocol), Nou (bibliotecă) |
| @nestjs/jwt | 12.x | JWT de acces, valabil 15 minute | Modulul oficial NestJS | NFR-08 | SDD (protocol), Nou (bibliotecă) |
| otplib | 13.x | Al doilea pas pentru administratori (TOTP) | Standard compatibil cu aplicațiile de autentificare | NFR-08 | Nou |
| node:crypto | inclus în Node.js | Semnarea QR cu HMAC-SHA256 și generarea codurilor OTP | Nu adaugă o dependență suplimentară | FR-02, FR-03, NFR-09 | SDD (algoritm), Nou (bibliotecă) |
| helmet | 8.x | Antete HTTP de securitate | Protecție standard pentru aplicații Express | NFR-10 | Nou |
| @nestjs/throttler | 6.x | Limitarea cererilor, de exemplu 10 rezervări/minut | Modulul oficial NestJS | SDD 8.1 | Nou |

## Notificări

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| web-push | 3.x | Notificări push prin VAPID | Funcționează din browser, fără aplicație nativă | FR-31, FR-34, FR-35 | SDD (protocol), Nou (bibliotecă) |
| nodemailer | 10.x | Trimiterea emailurilor prin SMTP | Merge cu orice server de email sau furnizor tranzacțional | FR-34, FR-35 | SDD (protocol), Nou (bibliotecă) |
| API REST al furnizorului de SMS | de stabilit | Rezervă pentru urgențe și utilizatori fără push | Modul separat, ca furnizorul să poată fi schimbat | FR-36 | SDD |

## Fișiere și rapoarte

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| Multer (prin `@nestjs/platform-express`) | inclus în NestJS | Încărcarea fișierului cu orarul EF | Suport direct în NestJS | FR-19 | Nou |
| csv-parse, node-ical | 7.x, 0.27.x | Citirea orarului din CSV și iCal | Acoperă ambele formate cerute | FR-19 | Nou |
| rrule | 2.x | Extinderea orelor recurente pe semestru | Lucrează cu regulile RRULE din tabelul `recurrences` | FR-19, FR-42 | Nou |
| ical-generator | 11.x | Fișier `.ics` per rezervare și abonament personal | Generează formatul iCal cerut | FR-17 | Nou |
| csv-stringify, pdfkit | 6.x, 0.20.x | Exportul rapoartelor în CSV și PDF | Generează fișierele direct în Node.js, fără browser pe server | FR-44 | Nou |

## Testare

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| Jest | 30.x | Teste unitare și raport de acoperire | Inclus în șablonul NestJS; măsoară pragul de 70% | NFR-13 | Nou |
| Supertest | 7.x | Teste pe rutele API | Apelează serverul fără a-l publica în rețea | NFR-13 | Nou |
| Testcontainers | 12.x | PostgreSQL și Redis reale în teste | `no_overlap` nu poate fi verificată pe o bază de date simulată | NFR-04 | Nou |
| k6 | ultima versiune stabilă | Test cu 100 de cereri simultane și test de încărcare | Generează cererile concurente cerute de SRS | NFR-01, NFR-02, NFR-04 | Nou |

## Livrare și monitorizare

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| Docker | ultima versiune stabilă | Containere pentru API, worker și servicii | Medii identice în testare și producție | SYS-04, SYS-10 | SDD |
| GitHub Actions | serviciu | CI/CD: teste, imagini și livrare automată | Codul este deja pe GitHub | SYS-10 | Nou |
| Nginx | ultima versiune stabilă | Terminare TLS și fișierele statice ale PWA | Se folosește doar dacă găzduirea nu oferă un load balancer gestionat | NFR-08, SYS-08 | Nou |
| Prometheus, Grafana | ultimele versiuni stabile | Metrici și alertă dacă notificările întârzie peste 2 minute | Open-source, fără licență comercială obligatorie | SYS-09 | Nou |
| pino, nestjs-pino, Grafana Loki | 10.x, 5.x, ultima versiune stabilă | Loguri structurate și centralizate | Se vizualizează în același loc cu metricile | SYS-09 | Nou |
| @prometheus-io/client | 0.16.x | Expunerea metricilor din Node.js | Înlocuiește pachetul depreciat `prom-client` | SYS-09 | Nou |

## Alternative respinse

| Alternativă | Motiv |
|---|---|
| Baze de date NoSQL | Garanția anti-suprapunere ar trebui scrisă manual în cod (SDD 2.3). |
| Microservicii | Prea complicat de întreținut pentru o echipă mică; SDD 3.1 alege monolitul modular. |
| Prisma în locul TypeORM | Nu are `tstzrange` ca tip nativ, deci coloana centrală din `occupancy` ar depinde de SQL scris manual. |
| WebSocket în locul SSE | Grila doar primește actualizări; SSE este suficient și mai simplu (SDD 2.3). |
| RabbitMQ în locul Redis + BullMQ | Ar adăuga un serviciu în plus, iar Redis este deja necesar pentru evenimentele SSE. |
| Firebase Cloud Messaging în locul Web Push | SDD alege Web Push cu VAPID, care nu depinde de un singur furnizor. |

## Decizii rămase deschise

| Decizie | Ce depinde de ea | Cine decide |
|---|---|---|
| Furnizorul SSO și claim-ul pentru rol (SRS 9.7) | Configurarea `openid-client`; dacă 2FA rămâne în aplicație sau trece la furnizor | Departamentul IT |
| Furnizorul de SMS și bugetul (SRS 9.7) | Implementarea modulului SMS | Administrația bazei sportive |
| Găzduirea: cloud UE sau servere proprii | Load balancer, managerul de secrete și locația backupului | Departamentul IT |
| Redis sau Valkey | De confirmat dacă licența Redis 8 este acceptată; Valkey este alternativa, dar compatibilitatea cu BullMQ trebuie testată | Echipa de dezvoltare |

## Verificarea compatibilității

Pachetele npm din această pagină au fost instalate împreună, fără conflicte de versiuni, iar un exemplu minim cu NestJS, TypeORM și BullMQ, care definește constrângerea `no_overlap`, a fost compilat cu TypeScript 6. Compatibilitatea la rulare, inclusiv cu PostgreSQL 18 și Redis 8, urmează să fie confirmată de testele din etapa de implementare.
