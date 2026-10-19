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
Merge til `main` → CI → `deploy.yml` deployer hosting og regler og tjekker,
at versionen i `public/version.js` er live. Kræver repo-secret
`FIREBASE_SERVICE_ACCOUNT` (JSON-nøgle til en servicekonto i projektet
`tactivar` med rollen "Firebase Admin"). Mangler den, fejler deploy-jobbet
(rødt), så det aldrig ser grønt ud uden at være deployet. Efter deploy køres
e2e-testen som smoke-test mod tactivar.web.app.

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
| `.claude/agents/domaene-raadgiver.md` | HELE rollen — omdøb den gerne til noget produktnært (i spillet hed den Spilfører) |
| `.claude/commands/eftersyn.md` | hvad koster penge (punkt 1), og hvad en rolig periode er |

Skabelonen må gerne starte uudfyldt — rollerne virker fra dag ét og bliver
skarpere, efterhånden som felterne udfyldes og deres hukommelse i
`.claude/agent-memory/` vokser. (Reglerne for hukommelsen og modelvalget står
i `CLAUDE.md`, så de overlever, når denne README skrives om.)

