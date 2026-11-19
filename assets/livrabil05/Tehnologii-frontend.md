# Tehnologii frontend

Coloana **Sursă** arată de unde vine fiecare alegere: `SDD` înseamnă decizie deja documentată, iar `Nou` înseamnă alegere făcută în această etapă. Versiunile sunt cele stabile la data de 5 noiembrie 2026.

## Suita pe scurt

| Strat | Tehnologie |
|---|---|
| Limbaj și framework | TypeScript 6 cu React 19 |
| Build | Vite 8 |
| PWA și offline | vite-plugin-pwa cu Workbox, IndexedDB |
| Rute | React Router 7, cu rute protejate pe rol |
| Date de la server | TanStack Query și client generat din specificația OpenAPI |
| Stilizare | CSS Modules și variabile CSS |
| Componente | Radix UI, Lucide, pictograme proprii pentru sporturi |
| Limbă | i18next, română și engleză |
| Funcții speciale | QR, scanare cu camera, hartă, grafice |
| Testare | Vitest, Testing Library, MSW, Playwright, axe, Lighthouse CI |

## Limbaj, framework și build

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| React | 19.x | Interfața utilizatorilor și panoul de administrare | Un singur cod de întreținut pentru ambele | UI-01, UI-08 | SDD |
| TypeScript | 6.x | Limbajul aplicației | Același limbaj ca pe server; versiunea 7 nu este încă suportată de typescript-eslint | NFR-13 | SDD |
| Vite | 8.x | Serverul de dezvoltare și build-ul | Rapid, împarte codul pe rute; ținta de build se poate seta la Safari 16 | NFR-01, NFR-15 | Nou |

## PWA și funcționare offline

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| vite-plugin-pwa, Workbox | 2.x, 7.x | Manifestul, service worker-ul și actualizarea aplicației | Generează ce e necesar pentru instalarea pe telefon | UI-09, NFR-15 | SDD (PWA), Nou (bibliotecă) |
| idb-keyval (IndexedDB) | 6.x | Păstrează local ultima rezervare și `qr_token` | QR-ul se desenează pe telefon, deci se afișează și fără internet | UI-09, FR-03 | SDD (cerință), Nou (bibliotecă) |

## Rute și date de la server

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| React Router | 7.x | Ecranele aplicației și rutele `/admin`, protejate pe rol | Panoul și scanerul se încarcă doar când sunt deschise | UI-08, NFR-01 | SDD (rute protejate), Nou (bibliotecă) |
| @hey-api/openapi-ts | 0.99.x | Generează tipurile și clientul din `openapi.yaml` | Dacă API-ul se schimbă, diferențele apar la compilare | NFR-13 | Nou |
| TanStack Query | 5.x | Cache și reîncărcarea datelor de la server | Grila se actualizează fără reîncărcarea paginii când sosește `slot-changed` | FR-09, NFR-01 | Nou |
| react-hook-form, zod | 7.x, 4.x | Formulare și validare, mai ales în panoul de administrare | Puține redesenări, reguli de validare într-un singur loc | FR-39, FR-40, FR-46 | Nou |
| date-fns | 4.x | Date și ore în română și engleză | Are limba română și se include doar ce se folosește | FR-09, UI-07 | Nou |

## Interfață

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| CSS Modules, variabile CSS | incluse în Vite | Stilizare, mod întunecat și paleta sportivă | Funcționează pe iOS 16; temele se schimbă din variabile | UI-01, UI-04, UI-05, UI-07 | Nou |
| CSS Scroll Snap | nativ în browser | Banda orizontală de sloturi, glisabilă | Nu cere o bibliotecă și merge pe toate browserele cerute | UI-03 | Nou |
| Radix UI | 1.x | Dialoguri, meniuri și selectoare accesibile | Oferă accesibilitate de la tastatură, fără un stil impus | NFR-07, UI-05 | Nou |
| Lucide | 1.x | Pictogramele interfeței | Open-source, se include doar ce se folosește | UI-05 | Nou |
| Pictograme SVG proprii | – | Pictogramele mari ale sporturilor | Identitate vizuală proprie; se aleg după câmpul `icon` din API | FR-06, UI-05, NFR-14 | Nou |
| Inter, găzduit local | 5.x (pachet @fontsource-variable/inter) | Fontul sans-serif unic al aplicației | Are diacritice românești; nu trimite cereri către un serviciu extern | UI-05 | SDD (un singur font), Nou (alegere) |
| i18next, react-i18next | 26.x, 17.x | Comutarea între română și engleză | Soluție standard pentru React; erorile din API au deja ambele limbi | UI-07 | Nou |

## Funcții specifice CampusSport

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| qrcode.react | 4.x | Afișarea codului QR al rezervării | Desenează local, deci funcționează offline | FR-03, UI-09 | Nou |
| @zxing/browser | 0.2.x | Scanarea QR cu camera, pentru personal | `BarcodeDetector` nu există în Firefox și în Safari sub 17 | FR-03, FR-15, SYS-03 | Nou |
| EventSource | nativ în browser | Primirea evenimentelor `slot-changed` | Ruta SSE este publică, deci nu are nevoie de antet de autentificare | FR-09, SRS 8.3.4 | SDD |
| Push API, Notifications API | native în browser | Înregistrarea dispozitivului și primirea notificărilor | Nu cer o aplicație nativă | FR-31, FR-34, FR-35 | SDD |
| Leaflet, react-leaflet, OpenStreetMap | 1.x, 5.x | Harta din fișa resursei | Open-source, fără licență comercială | FR-08 | Nou |
| Recharts | 3.x | Graficele din rapoartele de administrare | Bazat pe componente React; se încarcă doar în panou | FR-44 | Nou |

## Testare și calitate

| Tehnologie | Versiune | Rol | De ce | Cerințe | Sursă |
|---|---|---|---|---|---|
| Vitest, Testing Library | 5.x, 16.x | Teste de componente și de logică | Folosesc aceeași configurare ca Vite | NFR-13 | Nou |
| MSW | 3.x | Simularea API-ului în teste și în dezvoltare | Frontend-ul poate avansa înainte ca serverul să fie gata | NFR-13 | Nou |
| Playwright | 1.x | Teste de flux pe Chromium, Firefox și WebKit, la 360 px | Verifică fluxul de rezervare în 3 pași | FR-11, UI-01, NFR-15 | Nou |
| axe (@axe-core/playwright) | 4.x | Verificarea automată a accesibilității | Găsește o parte din problemele WCAG 2.1 AA, restul se verifică manual | NFR-07 | Nou |
| Lighthouse CI | 0.16.x, rulat separat în CI | Controlul timpului de încărcare | Semnalează depășirea țintei de 2 secunde pe 4G | NFR-01 | Nou |
| ESLint, typescript-eslint, Prettier | 10.x, 8.x, 3.x | Reguli de cod și formatare | Cod uniform în toată echipa | NFR-13 | Nou |

## Suport pe browsere

SRS cere Android 10+ și iOS 16+ (NFR-15, SYS-01). Această limită a influențat direct suita:

| Funcție | Limită | Consecință |
|---|---|---|
| Notificări push pe iOS | Doar de la iOS 16.4 și doar dacă aplicația este instalată pe ecranul principal | Aplicația îndeamnă utilizatorii de iOS să o instaleze; email și SMS rămân canale de rezervă (FR-36) |
| Tailwind CSS 4 | Cere Safari 16.4 și Firefox 128 | Nu este folosit, ca să nu fie excluse dispozitivele cu iOS 16.0–16.3 |
| `BarcodeDetector` | Lipsește în Firefox și în Safari sub 17 | Scanarea se face cu ZXing |
| Ținta de build | Vite țintește implicit Safari 16.4 | Se setează explicit `build.target` la `safari16` |

## Alternative respinse

| Alternativă | Motiv |
|---|---|
| Aplicații native iOS și Android | Cost dublu de dezvoltare și instalare obligatorie din magazin (SDD 2.3). |
| Next.js | Randarea pe server nu este necesară: aplicația este un PWA static care vorbește cu API-ul din NestJS. |
| Tailwind CSS 4 | Exclude iOS 16.0–16.3, deși SRS cere iOS 16+. |
| Material UI și biblioteci similare | Stilul lor impus se potrivește greu cu identitatea sportivă cerută în UI-05. |
| Redux | Majoritatea datelor vin de la server, iar TanStack Query le gestionează deja. |
| Google Maps | Are costuri de utilizare, iar SDD 2.2 cere un buget limitat. |
| openapi-typescript | Versiunea actuală nu suportă TypeScript 6. |

## Decizii rămase deschise

| Decizie | Ce depinde de ea | Cine decide |
|---|---|---|
| Limita minimă reală pentru iOS: 16.0 sau 16.4 | La 16.4 ar dispărea problema push, iar Tailwind ar redeveni o opțiune | Echipa, împreună cu administrația bazei sportive |
| Furnizorul de hartă | Serverele publice OpenStreetMap au reguli de utilizare și primesc adresa IP a vizitatorului; alternativa este un link către o aplicație de hărți | Echipa de dezvoltare |
| Cine scanează QR-ul | Accesul la ecranul de scanare depinde de rolul „personal”, încă nedefinit în SDD | Coordonatorul, împreună cu echipa |
| Modul kiosk de la intrare (SRS 8.3.2) | Este opțional; ar cere un ecran dedicat pe tabletă | Administrația bazei sportive |

## Verificarea compatibilității

Pachetele npm din această pagină au fost instalate împreună, fără conflicte de versiuni. Excepție face Lighthouse CI, care are o nepotrivire între propriile dependențe, așa că nu intră în dependențele proiectului și se rulează separat în CI. Clientul a fost generat din `openapi.yaml`, iar un exemplu minim care folosește suita a trecut de compilare și de build cu ținta Safari 16. În acest exemplu, codul inițial are aproximativ 195 kB comprimat, iar scanerul, harta și graficele se încarcă separat, la cerere.

Aplicația nu a rulat încă pe dispozitive reale. Funcționarea pe iOS 16, timpul de încărcare pe 4G și conformitatea WCAG urmează să fie confirmate în etapa de implementare.
