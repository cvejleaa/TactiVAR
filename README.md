# TactiVAR Manager

Fodboldmanager med VAR-tema: skjulte evner, scouting gennem kampreferater,
taktiktavle med træk og slip, og en liga på 8 hold. Spillet blev startet i
Gemini (v1.0–v2.5 som én `index.html` på vejleaa.dk) og genopbygges her som
en rigtig kodebase. Spec og opgørelse over kilden: [`docs/spec.md`](docs/spec.md).

- **Live:** https://tactivar.web.app (Firebase Hosting, projekt `tactivar`).
- **Gammel version:** vejleaa.dk/TacticVar er reserve, indtil den nye har
  samme funktioner. Dens "Upload/Sync til Firestore" virker ikke længere –
  bevidst: databasen stod åben for alle, og brugeren har bekræftet, at der
  ikke ligger data i den.

## Opbygning
- `public/` serveres som det er (intet build-trin): `index.html`,
  `errors.js` (synlig fejlboks), `app.js`, `version.js` (bumpes ved hver
  ændring af `public/` – CI kræver det), `engine/` (ren spillogik, ingen DOM,
  seedet tilfældighed). Planlagt: `state/` (gem/indlæs) og `ui/`.
- `tests/unit/` (node:test), `tests/e2e/` (Playwright mod en lokal server).
- `tools/check.mjs` (syntaks og imports), `tools/serve.mjs` (lokal server).
- `firestore.rules`: afviser alt i trin 1 – spillet gemmer i browseren.

## Deploy
Merge til `main` → CI → `deploy.yml` deployer hosting og Firestore-regler, tjekker at
versionen i `public/version.js` er live, at Firestore afviser ulogget adgang, og kører
e2e-testen som smoke-test mod https://tactivar.web.app. Mangler nøglen nedenfor, bliver
jobbet rødt med "Secret FIREBASE_SERVICE_ACCOUNT mangler – intet er deployet".

### Engangsopsætning: deploy-nøglen (ca. 5 minutter)
1. Gå til https://console.cloud.google.com/iam-admin/serviceaccounts?project=tactivar
   (log ind med den Google-konto, der ejer Firebase-projektet `tactivar`). Tjek øverst
   på siden, at projektet hedder **tactivar**.
2. Klik **"+ Opret servicekonto"** (Create service account).
   - Navn: `github-deploy` → **Opret og fortsæt**.
   - Rolle: søg efter og vælg **Firebase Admin** → **Fortsæt** → **Udfør**.
3. Klik på den nye konto (`github-deploy@tactivar.iam.gserviceaccount.com`) → fanen
   **Nøgler** (Keys) → **Tilføj nøgle** → **Opret ny nøgle** → vælg **JSON** →
   **Opret**. En `.json`-fil downloades.
   - Får du beskeden "Service account key creation is disabled", er nøgle-oprettelse
     slået fra af en organisationspolitik – sig til, så finder vi en anden vej.
4. Åbn https://github.com/cvejleaa/TactiVAR/settings/secrets/actions → **New
   repository secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT` (præcis sådan, store bogstaver).
   - Secret: åbn JSON-filen i en teksteditor, markér ALT (fra `{` til `}`), kopiér og
     indsæt. → **Add secret**.
5. Slet JSON-filen fra din computer (den giver fuld adgang til projektet).
6. Start deployet: https://github.com/cvejleaa/TactiVAR/actions/workflows/deploy.yml →
   **Run workflow** → branch `main` → **Run workflow**. Efter 1–2 minutter skal alle
   trin være grønne, og spillet ligger på https://tactivar.web.app.

### Engangsopsætning: kamp-id ("📤 Send kampen", v3.24.3)
Brugeren sender en kamp med et kort id (K-XXXX), som vi henter og spiller igen, når motoren justeres. Tre trin i
Firebase-konsollen for projektet **tactivar**:
1. **Authentication → Kom i gang → Sign-in method → Anonymous → Aktivér.** (Spillet logger anonymt ind, kun for at sende.)
2. **Project settings → General → Your apps → Web app** (opret en, hvis der ingen er; ingen hosting-opsætning nødvendig).
   Kopiér `apiKey` og sæt den i `public/firebase-config.js`: `export const FIREBASE = { apiKey: '…', projectId: 'tactivar' };`.
   Nøglen er offentlig pr. design (adgangen afgøres af `firestore.rules`). Begræns den i Google Cloud Console →
   APIs & Services → Credentials → nøglen: *Application restrictions* = HTTP referrers `https://tactivar.web.app/*`,
   *API restrictions* = Identity Toolkit API + Token Service API + Cloud Firestore API.
3. **Læse-nøgle til `tools/fetch-match.mjs`:** https://console.cloud.google.com/iam-admin/serviceaccounts?project=tactivar →
   **Opret servicekonto** `github-read` med rollen **Cloud Datastore Viewer** (kun læsning) → Nøgler → JSON. Læg indholdet i
   miljøvariablen `FIREBASE_READ_KEY` (Claude-miljøets indstillinger → Network secrets). Slet filen bagefter.

Hent en kamp: `node tools/fetch-match.mjs K-7F3Q --replay` (gemmer `kampe/K-7F3Q.json`, ignoreret af git).
Reglerne testes mod emulatoren med `npm run test:rules` (også i CI).

### Hvis deployet fejler
Åbn kørslen under Actions; trinnet "Diagnose af nøgle og rettigheder" viser kontoens
roller i projektet. Typiske årsager:
- **"database (default) does not exist"**: Firestore har ingen `(default)`-database
  (Gemini foreslog et eget navn). Firebase-konsollen → Firestore Database → opret en
  database med ID `(default)`, placering `eur3`.
- **Firebase Rules API ikke slået til**: åbn
  https://console.cloud.google.com/apis/library/firebaserules.googleapis.com?project=tactivar
  → **Aktivér**, og kør workflowet igen.
- **"Permission denied" / 403**: rollen mangler – tilføj **Firebase Admin** til
  servicekontoen under IAM (https://console.cloud.google.com/iam-admin/iam?project=tactivar).

## Kendt gæld
- `[TILPAS]` i `.claude/agents/` er kun delvist udfyldt (se tjeklisten).
- Hemmeligholdelse af modstandernes data er kun visuel, indtil trin 2
  (login + server-motor).

## Tilpasnings-tjekliste (det, `[TILPAS]` stadig markerer)

| Fil | Skal udfyldes |
|---|---|
| `.claude/agents/release-manager.md` | miljø/workflow-tabellen, sti → kræver-tabellen, lumske deploy-defaults |
| `.claude/agents/security-reviewer.md` | trusselsbilledet (hvem er den realistiske angriber?) og hvilke stier der udløser rollen |
| `.claude/agents/quality-control-manager.md` | projektets fælder, invarianter og delte flader |
| `.claude/agents/test-manager.md` | forretningskritiske områder og test-lagene |
| `.claude/agents/arkitekt.md` | projektets grundform (apps/miljøer, spejlede filer) og hvor adgang afgøres |
| `.claude/agents/spilfoerer-*.md` | de fire Spilførere (motor, økonomi, klub, UI) – udfyldt for TactiVAR; backloggen i `docs/backlog.md` |
| `.claude/commands/eftersyn.md` | hvad koster penge (punkt 1), og hvad en rolig periode er |

Skabelonen må gerne starte uudfyldt — rollerne virker fra dag ét og bliver
skarpere, efterhånden som felterne udfyldes og deres hukommelse i
`.claude/agent-memory/` vokser. (Reglerne for hukommelsen og modelvalget står
i `CLAUDE.md`, så de overlever, når denne README skrives om.)

