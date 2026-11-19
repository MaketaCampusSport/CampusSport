# Ghid de testare a front-end-ului pe propria mașină

Ghidul pornește de la zero. Front-end-ul are două moduri:

| Mod | Comandă | Ce îți trebuie |
|---|---|---|
| **Cu serverul real** (implicit) | `npm run dev` din rădăcina proiectului | Node.js 24, PostgreSQL 18, baza creată cu `npm run setup` (vezi `../INSTALL.md`). Redis și Keycloak nu sunt necesare. |
| **Demo, fără backend** | `npm run dev:mock` | Doar Node.js. Un server simulat (MSW) răspunde în browser, cu date demo. |

## 1. Ce îți trebuie

| Program | Versiune | Cum verifici |
|---|---|---|
| Node.js | 24 LTS (front-end-ul singur merge și cu 20.19+) | `node -v` |
| npm | vine cu Node | `npm -v` |
| PostgreSQL | 18, doar pentru modul cu serverul real | `psql -V` |
| Un browser modern | Chrome, Edge, Firefox sau Safari 16+ | – |

## 2. Instalare și pornire

**Cu serverul real**, din rădăcina depozitului:

```bash
npm install          # instalează rulatorul de scripturi
npm run setup        # backend + frontend + baza de date cu datele de exemplu
npm run dev          # API pe :3000, aplicația pe :5173
```

**Demo**, doar în `frontend/`:

```bash
npm install
npm run dev:mock
```

Deschide **<http://localhost:5173>**. Utilizatorii ajung în aplicația mobilă (`/user`), administratorii în panou (`/admin`).

## 3. Autentificare

### Cu serverul real
- Pe **/login** și pe **/admin/login** există panoul **Autentificare de dezvoltare**: alege un utilizator din datele de exemplu (Ion Popescu – student, Maria Ionescu – profesor, Ana Rusu – extern, Andrei Rusu – admin). Serverul emite o sesiune reală, deci reîncărcarea paginii (F5) te păstrează autentificat.
- Panoul există doar când API-ul rulează cu `NODE_ENV=development` și `DEV_LOGIN=true` (implicit în `backend/.env.example`).
- Fără Redis, sesiunile stau în memoria API-ului: dacă repornești API-ul, te autentifici din nou.
- **SSO real** (Keycloak, cu Docker): butonul „Continuă cu contul universității” / „Autentificare cu SSO universitar”. Administratorii trec apoi prin **/auth/2fa** (cod TOTP; se configurează cu `npm run admin:enroll-totp -- <email>` în `backend/`).
- **Extern:** fila *Extern* pe /login → email → codul primit. Fără Mailpit, codul din email apare în jurnalul API-ului, iar codul SMS tot acolo.

### În demo (`dev:mock`)
- Alege un cont din panoul de dezvoltare sau apasă SSO: utilizatorii intră ca student, administratorii trec prin pasul TOTP cu codul **123456**.
- Codurile OTP pentru externi sunt tot **123456**.
- Datele demo se resetează la reîncărcare; sesiunea rămâne până închizi fila.

## 4. Aplicația utilizatorilor (`/user`)

- **Acasă:** salutul, cota lunii (doar studenți), sporturile din catalog și următoarea rezervare cu butonul galben pentru QR.
- **Caută:** alege sportul și ziua (7 zile). Orele sunt afișate în fusul bazei (Europe/Chisinau). Sloturile:
  - *Liber* → **Continuă** deschide confirmarea;
  - *Listă de așteptare* (ocupat) → butonul devine **Intră pe lista de așteptare**;
  - *Rezervarea mea*, *Curs EF*, *Ocupat* nu se pot selecta.
  Grila se actualizează singură (SSE `slot-changed` și la 30 s).
- **Confirmă:** data, ora, participanții (dacă resursa are capacitate > 1), cota rămasă. Dacă slotul tocmai s-a ocupat (409), poți intra pe lista de așteptare din mesaj. Cota epuizată afișează mesajul dedicat.
- **Gata:** codul QR semnat de server, **Adaugă în calendar** descarcă `.ics`-ul de la server.
- **Rezervări:** Viitoare / Istoric, cod QR, calendar, **Anulează** (spune dacă intrarea a fost restituită). Sus apar listele de așteptare (acceptă oferta / renunță).
- **Profil:** datele contului, cota, notificările (push, email, SMS, limba mesajelor), limba și tema aplicației, deconectare, ștergerea contului. Exportul datelor (GDPR) apare ca indisponibil: serverul răspunde încă 501.
- Adresele se pot deschide direct și supraviețuiesc unui F5 (ex. `/user/search?sport=…&date=…`).

## 5. Panoul de administrare (`/admin`), pagină cu pagină

### Panou (FR-43, UI-08)
- Indicatori (rezervări și ocupare calculate din grilă, check-in-uri, neprezentări) și grila resurselor pe ore, cu titularii.
- **Blocare de urgență:** **Blochează** pe un rând → motiv → **Blochează acum**. Notificarea arată câte rezervări s-au anulat și câți utilizatori au fost anunțați; banda de urgență permite deblocarea.

### Rezervări
- Filtre după resursă, zi și stare, paginare. **Anulează** cere un motiv; titularul primește notificare, iar intrarea studentului se restituie.

### Resurse (FR-39)
- Selectează o resursă; editezi în panoul din dreapta: tip, locație, fotografie, capacitate, dotări, sporturi, program săptămânal, durata slotului, acces extern.
- **Validare dotări (FR-07):** un sport fără dotările cerute blochează salvarea.
- Programul are un singur interval pentru zilele bifate; pentru resursele cu ore diferite pe zile apare un avertisment.

### Sporturi (NFR-14)
- **Sport nou** și editare (denumiri RO/EN, pictogramă, dotări necesare). Contractul nu are ștergere.

### Blocări (FR-40…42)
- Lista blocărilor (curente și viitoare / istoric), **Blocare planificată** (mentenanță), **Deblochează**, raportul de livrare (anunțați / livrați / eșuați, pe canale).
- Blocările recurente nu sunt încă suportate de server (501), deci formularul nu le oferă.

### Orar EF (FR-42) și Evenimente (FR-44)
- Paginile există, dar afișează „încă indisponibil pe server”: rutele răspund 501. Butoanele de trimitere sunt dezactivate (`SERVER_READY` în fiecare pagină).

### Anunțuri
- Resursa și/sau intervalul, mesajul RO (și EN opțional). După trimitere vezi câți utilizatori au fost anunțați.

### Rapoarte (FR-45)
- Luna, ocuparea pe ore și pe resurse, neprezentări, rezervări pe categorii, utilizatori la limită. **CSV** descarcă raportul de la server. PDF-ul nu este încă implementat pe server.

### Reguli (FR-46)
- Valorile BR-01…BR-08; o valoare în afara limitelor blochează salvarea. Modificarea apare în *Jurnal audit*.

### Jurnal audit
- Filtre după administrator, entitate și perioadă, paginare, export CSV (generat în browser din toate paginile filtrului).

### Utilizatori (FR-05)
- Caută, filtrează după rol și stare. **Suspendă** (durată și motiv), **Reactivează**.

### Check-in (FR-03 / FR-15)
- Scanează QR-ul rezervării cu camera (HTTPS sau `localhost`) sau lipește conținutul codului (`<id>.<nonce>.<semnătură>`). Mesaje pentru cod invalid, check-in deja făcut, rezervare inactivă sau în afara ferestrei −10 / +15 min.
- Pentru un test complet: rezervă ca student pentru ziua curentă, deschide QR-ul din *Rezervări*, copiază conținutul și verifică-l ca admin.

### Contul meu (NFR-08)
- Datele sesiunii și comanda pentru configurarea TOTP pe server.

## 6. Teme, limbă, accesibilitate
- Panou: meniul din stânga-jos (**Limbă**, **Aspect**). Aplicația: **Profil**.
- Tastatură: `Tab` / `Shift+Tab`, `Esc` închide ferestrele, `Enter`/`Space` activează butoanele. Primul `Tab` arată „Sari la conținut” în panou.
- Panoul: de la 1366×768 (SYS-02). Aplicația: coloană de telefon, centrată pe ecranele mari.

## 7. Teste automate

```bash
npm run typecheck     # tipurile TypeScript
npm test              # Vitest + MSW
npm run build         # build de producție (fără mock-uri)
npm run build:demo    # build static cu serverul simulat inclus
npm run api:generate  # regenerează src/api/generated din assets/livrabil05/openapi.yaml
```

Testele acoperă validările, maparea tipurilor din contract, exportul CSV, paritatea traducerilor RO/EN (inclusiv `member.*.json`), tema, contractul API pe serverul simulat (rutele adminului, autentificarea, blocarea de urgență, check-in), fluxul de rezervare al studentului (rezervă → listă → 409 → anulare → cotă restituită), orele în fusul bazei peste schimbarea de oră și accesibilitatea structurală (axe).

## 8. Configurare

- `.env.development` (implicit pentru `npm run dev`): `VITE_USE_MOCKS=false`, cererile `/api/*` trec prin proxy-ul Vite spre `VITE_API_PROXY_TARGET` (implicit `http://localhost:3000`). Așa cookie-ul HttpOnly de refresh funcționează pe aceeași origine.
- `.env.mock` (pentru `npm run dev:mock`) și `.env.demo` (pentru `build:demo`): serverul simulat.
- Suprascrierile locale merg în **`.env.development.local`** (ignorat de git). Fișierele `.env` se citesc doar la pornire.

## 9. Probleme frecvente

| Simptom | Cauză / soluție |
|---|---|
| „Serverul nu răspunde” pe ecranul de autentificare | API-ul nu rulează pe :3000. Pornește totul cu `npm run dev` din rădăcină. |
| Panoul de dezvoltare spune că serverul nu permite autentificarea | Setează `NODE_ENV=development` și `DEV_LOGIN=true` în `backend/.env`, apoi repornește API-ul. |
| Te întoarce la login după repornirea API-ului | Fără Redis, sesiunile sunt în memoria API-ului. Autentifică-te din nou. |
| Pagina afișează „501” sau „încă indisponibil” | Ruta nu e încă implementată pe server (lista în `backend/README.md`). |
| Portul 5173 e ocupat | `npm run dev -- --port 5174` (și actualizează `PWA_URL` în `backend/.env`). |
| În demo, pagina e goală și consola arată `mockServiceWorker.js` | Fișierul e în `public/`; în Firefox privat service worker-ul poate fi blocat: folosește o fereastră normală. |
