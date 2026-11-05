# NU (5/11): v3.32.1: designkritikkens røde fund (R1–R5) – brugeren 5/11: "lad os tage de røde fra analysen med det samme"

# Arkitekt-plan v3.32.1 – de fem røde (R1–R5)

Læst: README, CLAUDE.md, `docs/design-kritik-2026-11-05.md`, `public/app.js`, `ui/matchcenter.js`, `ui/replay.js`, `ui/tactics.js`, `ui/matrix.js`, `ui/lineup-list.js`, `ui/training.js`, `ui/stats.js`, `ui/rounds.js`, `ui/dom.js`, `style.css`, `tools/measure-ui.mjs`, relevante e2e-blokke i `tests/e2e/run.mjs`, backlog nr. 0 (F4/F5) og spec §10b. Gemmeformatet røres ikke: al ny tilstand ligger i `mc` (modulvariabel, app.js:35) og i et modul-`Set` – som `mc.filter` og `openSecs` i dag.

## 1. Det, der allerede findes (genbrugskatalog)

| Behov | Findes | Hvor |
|---|---|---|
| Fold-ind med husket åben-tilstand over gen-tegninger | `openSecs` + `section()` – `<details class="stats-sec">`, `ontoggle` skriver i et Set | `public/ui/stats.js:45-47` |
| Samme `<details>`-mønster uden hukommelse (lukker ved re-render) | `#full-schedule`, `#past-seasons`; `sentList` | `ui/rounds.js:40,42`; `ui/matchcenter.js:277` |
| Vandret rulle-wrapper (to kopier af samme regel) | `.tablewrap` og `.tablewrap-x` – identiske | `style.css:51` og `:121`; `.mc-stats` har sin egen kopi `:109` |
| "Færre kolonner på mobil" | `#for-sale-table .wide { display:none }` ≤ 600 px | `style.css:246` |
| 44 px-berøringsflader ≤ 600 px | `.cp-nav/.cp-close`, `.lp-info`, `#play-round` | `style.css:358,405-409` |
| ⓘ-knap der åbner noget (CSS-tegnet, `::before`) | `.lp-info` | `style.css:398-399`, `ui/lineup-list.js:61` |
| Underfane/filter-række med aktiv knap | `.toolbar` + `button.mini.active` (`on.filter`) | `ui/matchcenter.js:321`, `app.js:839`, `ui/matrix.js:127` |
| Afspilningens knapper (▶ 1× ⭐) | `.rp-controls` – står UNDER banen | `ui/replay.js:124-128`; banen `style.css:197` |
| Afspilningens element genbruges mellem tegninger (cache pr. trace) | `replayEl` cache | `ui/replay.js:101` |
| Kamp-visningens tilstand uden gem | `mc = { …, filter, heat, snap, focus }`, `lastRoundView()` | `app.js:35,47` |
| Sidehøjde pr. fane ved 1366/390 efter én runde | `measureUi()` | `tools/measure-ui.mjs:12-49` |
| Målinger før/efter dokumenteres | spec §10b | `docs/spec.md:1062-1069` |
| Hjælpetekster på Taktik (det der skal foldes) | `PHASES[i][3]`, Hvis-Så-help, `#subs-help` | `ui/tactics.js:14-21,77,82` |

Det, der IKKE findes og skal bygges nyt: (a) én fold-hjælper med hukommelse, som alle kan bruge (stats.js' `section()` er lokal), (b) "mere at rulle"-markeringen, (c) underfaner i Match Center, (d) sticky kolonne.

## 2. Delopgaverne i rækkefølge

### A. R4 – én regel for brede tabeller (genbruger + generaliserer)
Filer: `style.css`, `ui/dom.js`, `app.js`, `ui/stats.js`, `ui/standings.js`, `ui/matchcenter.js`.
1. Slå `.tablewrap-x` (`style.css:121`) sammen med `.tablewrap` (`:51`): søg/erstat `tablewrap-x` → `tablewrap` i `ui/stats.js:92,127` og `ui/standings.js:15,27`; `.mc-stats` (`:109`) får klassen `tablewrap` i `matchcenter.js:332` i stedet for sin egen overflow-regel. Én regel, tre steder mindre.
2. Ny hjælper i `ui/dom.js`: `markScrollable(root)` – sætter `data-more="ja"` på hver `.tablewrap`, hvor `scrollWidth > clientWidth + 1 && scrollLeft + clientWidth < scrollWidth - 1`, og hænger en `scroll`-lytter på wrapperen, der opdaterer. Kaldes ét sted efter tegning: `app.js:657` (efter `app.replaceChildren`) og i `renderMc` (`app.js:870`) + én `resize`-lytter. Markeringen er CSS: `.tablewrap[data-more="ja"] { box-shadow: inset -28px 0 20px -20px #000c }` (inset-skygge på rulle-elementet ruller ikke med indholdet, og cellerne er gennemsigtige – intet ekstra element).
3. Sticky første kolonne ≤ 600 px: `.tablewrap > table th:first-child, td:first-child { position: sticky; left: 0; background: var(--panel); z-index: 2 }` – med opak baggrund for `.sorted` (`:56` er halvgennemsigtig: brug `#251453`). Trup får også 2. kolonne (navnet) sticky med fast bredde på 1. kolonne (`#matrix td:first-child { width: 4.5rem }`, `:nth-child(2) { left: 4.5rem }`). Kun ≤ 600 px, så 1366-vagten (e2e 1719/1723: ingen sidelæns rul) er uændret.
Ikke med: kolonnesæt (F5) – det er en anden opgave med egen QC.
Bevis: e2e 390 px Trup: `#matrix`-wrapperen har `data-more="ja"` og `getComputedStyle(w).boxShadow !== 'none'`; efter `w.scrollLeft = w.scrollWidth` forsvinder begge; ved 1366 findes `data-more` ikke (sammen med den eksisterende vagt 1718-1723). Mutation: fjern `markScrollable`-kaldet → rød.

### B. R5 – 44 px trup-rækker (bygger nyt, 3 linjer)
Filer: `style.css` (≤ 600-blokken `:346-373`), `app.js:595`, e2e 395.
`@media (max-width:600px) { #matrix tbody td { height: 44px } }` (td-height er min-højde i tabeller; padding `:54` urørt). Hjælpelinjen `#trup-help` (`app.js:595`) fra "Klik på en spiller …" til "Vælg en spiller for at åbne spillerkortet" (neutralt ord, ingen media-query-tekst); e2e 395 opdateres. Øvrige "Klik" (`app.js:547`, `lineup-list.js:57,80`) lader jeg stå – de hører til guiden/F4.
Bevis: e2e 390 px: alle `#matrix tbody tr` ≥ 44 px; ved 1366 < 36 px (den gamle værdi ≈ 25 gør båndet rødt, hvis reglen lækker til desktop).

### C. R1 – ⓘ "Sådan virker det" på Taktik (generaliserer stats.js)
Filer: `ui/dom.js` (ny `fold`/`help`), `ui/stats.js:45-47`, `ui/tactics.js:14-21,65-67,77,82`, `style.css`.
1. Flyt `openSecs`+`section()` fra `stats.js:45-47` til `ui/dom.js` som `fold(id, summary, ...body, { open })` med ét modul-Set `openFolds`; `stats.js` kalder `fold` (default-åben `stats-players` bevares). `rounds.js:40,42` og `matchcenter.js:277` skiftes til `fold` i samme PR (de husker så også tilstanden – gratis).
2. `help({ id, short, long, link = null })` i `ui/dom.js`: `[p.muted.help-short(short), fold(id, 'ⓘ Sådan virker det', p.muted(long), link && button.linklike(link.text, link.onClick))]`. `link` er slottet til guiden (v3.33.0 sender `{ text: '📖 Læs mere i guiden ›', onClick }`) – ingen omskrivning, kun et argument.
3. `tactics.js`: `PHASES` får et 5. element `short` (én sætning pr. fase, fx Fase 1 "Fokus bestemmer chancetypen, pasningsstil vejen frem – Mange løb giver flere i feltet, men mere slid"); render `:65-67` bruger `help({ id: 'help-'+phase, short, long: help })`. VIGTIGT: det lange afsnit beholder klassen `phase-help` og `#subs-help` sit id – e2e 1561, 1590-1594, 1569 læser `textContent`, som også rummer lukket `<details>`-indhold → de tests rører vi ikke. Hvis-Så-hjælpen (`:77`) og `#subs-help` (`:82`) samme vej. `#fit-help` (`lineup-list.js:82`) kan tages med (samme hjælper, Taktik-højde) – valgfrit.
Bevis: e2e 390 px Taktik: `details.help-more` lukket ved start, `.phase-help` ikke synlig (`isVisible` false) men `textContent` intakt; åbn Fase 2, skift en select (re-render via `change()`) → stadig åben (mutation: fjern `ontoggle`-registreringen → rød); `node tools/measure-ui.mjs`: `taktik@390` 3777 → mål ≤ 2600, `taktik@1366` 1864 → mål ≤ 1500 (de nye tal skrives i spec §10b som før).

### D1. R2 – afspilningen på første skærm (genbruger A og C)
Filer: `ui/matchcenter.js:280-338`, `ui/replay.js:120-128`, `style.css:98-99,197,212`.
1. `.rp-controls` flyttes OVER banen (`replay.js:120-128`: rækkefølge titel → controls → pitch → caption). Intro-teksten (`:122`, "taktiktavle ud fra N øjebliksbilleder …") ind i `help({ short: '', long })` eller blot `fold('replay-help', 'ⓘ Om tavlen', …)`.
2. Banen må ikke fylde en skærm: `.rp-pitch { max-height: min(32rem, calc(100vh - 26rem)) }` (aspect-ratio afleder bredden; verificér i Chromium).
3. Kampvælgeren (`:306-308`) som én linje: `.cards` får `flex-wrap: nowrap` i en `.tablewrap`-wrapper (A's fade virker så også her). ≤ 600 px i dag ≈ 200 px lodret.
4. "📤 Send kampen" + advarsel + `sentList` (`:299-304`) ud af hovedrækken og ind i `fold('mc-more', '⋯ Mere', sendBox, sentList)` under underfanerne (eller nederst i panelet). `#send-note`/`#send-off` beholder id'er (e2e 2652/2709 læser textContent – virker lukket); upload-testene 2669-2700, der KLIKKER `#send-match`, skal først åbne `#mc-more > summary`.
Bevis (ny e2e i blokken 1970-1975, der alligevel skal skrives om): efter slutfløjt ved 1366×900 og 390×844 med `scrollY === 0`: `#rp-play`.bottom ≤ innerHeight − (playbar+nav), `#rp-pitch`.top < innerHeight − 200. `measure-ui`: `kamp@390` 5058 → mål ≤ 3800 alene fra D1.

### D2. R3 – underfaner Afspilning / Referat / Statistik / Karakterer (bygger nyt – mønster fra `on.filter`)
Filer: `app.js:47,582-584,612-614,812-817,828-855`, `ui/matchcenter.js:319-337`, `style.css`.
1. `lastRoundView` (`app.js:47`) får `pane: 'replay'`; `mcHandlers.pane = (p) => { mc ||= lastRoundView(...); mc.pane = p; renderMc(); }` – nøjagtig som `filter` (`:839`).
2. Kun efter fløjtet (`!mc.playing`): under tidslinjen én række `h('div', { class: 'mc-tabs', id: 'mc-tabs' })` med fire knapper `#mc-tab-replay/-feed/-stats/-ratings` (`button.mini.active`, `aria-pressed`). Brug IKKE klassen `.toolbar` her – e2e 2202 vælger `#match-center .toolbar button:nth-child(3).active` (referatets filter) og ville ramme underfanerne; giv filterrækken `id="feed-filters"` og ret selektoren.
3. Under afspilning: uændret (`mc-grid` med referat | statistik – e2e 1795 og 1801 står).
4. Pane-indhold: replay = `replayEl`; feed = filterrækken + `#feed`; stats = `statsRows` i `.tablewrap`; ratings = `.ratings-grid` + `legend()`. Krydshandlinger skal skifte pane, ellers virker eksisterende knapper tavst: `openGoal` (`app.js:812`) sætter `mc.pane = 'feed'` (e2e 2189 kræver `#goal-focus` synlig); 🎬 (`on.replay`, `:837`) → `mc.pane = 'replay'; renderMc(); replayJump(m, i)` (afspilningselementet er cachet, `replay.js:101`, så jump efter renderMc virker); 📍 (`on.snapshot`, `:838`) → `mc.pane = 'ratings'` før `scrollIntoView('#snap-pitch')`; `on.view` (`:831`) beholder pane.
5. CSS: `.mc-grid.after`-reglerne (`style.css:107-110`) bruges kun hvis D2 vælger "replay | referat" på ≥ 900 px (se usikkerheden); ellers slettes de.
Bevis: e2e-blok 1970-1975 omskrives: standard-pane efter fløjtet er Afspilning (`#rp-play` synlig, `#match-stats` ikke i DOM), klik `#mc-tab-stats` → `#match-stats` synlig; 1938-1962: klik `#mc-tab-feed`, så 🎬 → `#mc-tab-replay.active` og caption som før; 2007/2070-2085 (📍): via Referat-pane, forvent `#mc-tab-ratings.active` og `#snap-pitch`; 2092-2094, 2163-2175, 2177-2189 kører i deres pane. Mutation: fjern pane-skiftet i `openGoal` → 2189 rød. `measure-ui`: `kamp@1366` 2629 → mål ≤ 1400; `kamp@390` → mål ≤ 2000 (Afspilning som standard).

### E. Fælles: version, spec, nyhed
`public/version.js` → 3.32.1 (efter v3.32.0 er landet); `app.js:134` NEWS '3.32.1'; spec §10b (`docs/spec.md:1062-1069`) får før/efter-tallene fra `measure-ui` for Taktik, Kamp, Trup ved 1366/390 (spejlet fil – kræves af CLAUDE.md). `tools/measure-ui.mjs` udvides IKKE; e2e bærer y-målene.

## 3. Afhængigheder
- A → D1 (chip-rækken bruger `.tablewrap`+fade). C → D1 (intro-fold og ⋯-fold bruger `fold/help`). D1 → D2 (samme funktion i matchcenter.js; D2 omskriver e2e-blokken, D1 bygger den).
- B er uafhængig af alt. A og C kan bygges parallelt (A rører style.css/dom.js/app.js:657; C rører dom.js/tactics.js/stats.js – koordinér `ui/dom.js`).
- Hver delopgave er sin egen PR og lander uden at efterlade appen i stykker. Mindste version, der er værd at have i produktion: **A+B** (mobil-tabeller, ren CSS + 20 linjer JS). Størst værdi for brugerens klage: **C og D1**. D2 kan vente, hvis QC-på-plan er i tvivl om desktop-layoutet.

## 4. Udrulning
Én statisk app, intet gem-format, ingen regler: rækkefølgen er PR-rækkefølgen A, B, C, D1, D2, hver med grøn CI og version-bump. Tilbagerulning = forrige deploy. Intet, der kan fejle tavst i produktion, ud over e2e-smoke-testen efter deploy (deploy.yml).

## 5. Skåret væk (og prisen)
- Kolonnesæt/Overblik–Evner–Økonomi (F5), Taktik-underfaner Opstilling/Spillestil (F4's anden halvdel), Liga-underfaner: egne opgaver – prisen er, at Trup stadig har 24 kolonner på mobil (men nu synligt rullelige og med sticky navn).
- Lilla/grøn-semantik, `.heat-1`-kontrast, stjerner: gule fund. (`.heat-1` → `#8b9ab0` i `style.css:68` er dog én linje – kan tages med i A uden egen plan.)
- Træk-ned-lukning af arket, "Klik"→"Tryk" overalt, Klub/Træning-forklaringer bag ⓘ (`training.js:65-66`, `club.js:58`): samme `help()`-hjælper, egen lille PR efter C.
- Fjernelse af referatets indre rul (`.feed max-height`, `style.css:111`): kunne give mening i en egen Referat-pane, men v3.20.1 valgte den bevidst – QC afgør.
- VAR-monitor, radar-graf, OG-tags, PWA, lyd: ikke i v3.32.1 (brugeren bad om de røde først); backlog.

## 6. Største usikkerhed
D2 på ≥ 900 px: v3.20.1 blev til "afspilning til venstre, statistik og referat til højre", fordi brugeren klagede over tom plads lige efter kampen. En ren Afspilning-pane efterlader højre halvdel tom ved 1366. Min anbefaling: Afspilning-pane viser på ≥ 900 px afspilning | referat side om side (genbrug `.mc-grid.after` med `replay feed`), så 🎬-linkene står ved tavlen, mens Referat-panen stadig findes (fuld bredde, alle filtre) – det er en dublet på desktop, men samme funktion (`#feed` tegnes ét sted ad gangen, pane afgør hvor). QC-på-plan (opus) skal vælge mellem det og en tom højreside, FØR D2 bygges. Næststørste: `max-height` + `aspect-ratio` på `.rp-pitch` – skal prøves i Chromium, ellers sættes højden eksplicit via `height: min(…)` og `width: auto`.

Noter til hukommelseskataloget (kan ikke skrives nu – træet er låst af byggeagenten; føjes til `/home/user/TactiVAR/.claude/agent-memory/arkitekt.md` ved næste kørsel): `stats.js:45-47 openSecs/section` = fold med hukommelse; `.tablewrap`/`.tablewrap-x` dubletter; `mc`-objektet (app.js:35/47) er stedet for Kamp-tilstand uden gem; `measure-ui.mjs` måler sidehøjder; `replayEl` er cachet pr. trace; `.lp-info` er ⓘ-mønstret; `#for-sale-table .wide` er "færre kolonner på mobil".
## RETTET efter QC (opus) og Spilfører UI – afløser Arkitektens plan ovenfor, hvor de er uenige
**Kamp: tre underfaner**
- Fanerne er "🎬 Afspilning & referat" | "📊 Statistik" | "👥 Spillerne". "Spillerne" rummer opstillingerne, karakterarket, 📍, heat maps og forklaringen.
- På ≥ 900 px står afspilning og referat side om side (`.mc-grid.after`). Under 900 px står referatet under tavlen.
- Ingen fanerække under live-afspilning. Standard efter fløjtet er den første fane.
- `openReport` (fælles indgang for "Se kampen" og alle "Åbn referatet") ruller kun til `#feed` (`block: 'nearest'`).
- Den valgte fane gemmes i `mc.pane` og bevares, når man skifter mellem rundens kampe (kampvælgeren).
- `openMatchCenter` læser en `undefined` fane som standardfanen.
- Fokus sættes tilbage på `#mc-tab-<pane>` efter skiftet (tastatur).
- e2e 2136 tilpasses til fanerne.

**Kamp: fuldtids-linje (Spilfører UI)**
- En kort linje fra fuldtids-analysen står fast under stillingen og tidslinjen, uanset fane: resultatet plus den ene vigtigste ting fra `match.js:1659`.

**Kamp: banen**
- `max-height: clamp(16rem, 100svh - 26rem, 32rem)`.
- `#rp-caption` står mellem knapperne og banen.
- Knapperne står over banen.
- Intro-teksten ligger bag ⓘ.
- "📤 Send kampen" og listen over sendte kampe ligger i "⋯ Mere". De beholder id'erne, og e2e, der klikker `#send-match`, åbner først foldet.
- Kampvælgeren står på én linje med fade, og din egen kamp står forrest.
- Y-testene kører ved 390, 1366×768 og via Hjem "Se kampen ›".

**Brede tabeller (R4)**
- Fade laves med `mask-image` og `-webkit-mask-image`, IKKE inset box-shadow, som skjules af celler med baggrund.
- Sticky er opt-in med klasserne `stick-1`/`stick-2`, kun på `#matrix` (Pos + Spiller), `#training-table` (Spiller) og `#ledger` (Runde).
- `#match-stats` passer i bredden (`table-layout: fixed`).
- Sticky styres af `data-scroll` ("bredere end rammen"), ikke af ≤ 600 px og ikke af `data-more`.
- Sticky celler får uigennemsigtige udgaver af `.sorted`, `tr.swapping` og `tr.selected`.
- Bredden af den låste første kolonne måles i `markScrollable` og sættes som CSS-variabel.
- De låste kolonner må højst fylde 40 % af bredden. Ellers låses kun Spiller, og Pos står i samme celle.
- `markScrollable` køres til sidst i `render()`, efter kortpanelet, og i `fold()`'s `ontoggle`.

**Trup-rækker (R5)**
- `@media (max-width: 600px), (pointer: coarse) { #matrix tbody td { height: 44px } }`.
- Båndet: ved 390 ≥ 44 px, ved 1366 < 36 px.
- "Klik på en spiller …" bliver til "Vælg en spiller for at åbne spillerkortet".

**Taktik ⓘ (R1)**
- Den korte linje er højst ca. 70 tegn, så den står på én linje ved 390. Spilfører UI's udkast forkortes.
- `summary` får `min-height: 44px` ved ≤ 600 px.
- `aria-label` med fasens navn, fx "Sådan virker Fase 2".
- Testen kræver præcis 5 `details.help-more` på Taktik.
- `fold` med standard-åben husker "lukket" eksplicit.
- Linjer pr. valgt mulighed ("Lynkontra: flere kontraer …") kommer på backloggen. Motor-Spilføreren skal godkende dem.

# Køen efter v3.32.1 (brugerens valg 5/11 af de eksterne forslag – vurderet af Spilfører motor/UI og Release Manager)
1. **v3.32.2 "VAR-øjeblikket" + game feel**
   - **VAR-ramme under live-afspilning:** tv-ramme, puls og en ærlig log, bygget på `events[].var` og øjebliksbilledet: type, tjekket spiller, linjeholder og kendelse, fx "Tjekker offside – #9 er forreste – linjen holdes af #4 – kendelse".
   - Rammen kan springes over, og loggen må aldrig påstå en taktisk årsag.
   - **Rød flash**, når et mål annulleres.
   - **Rystelse** ved egne mål og røde kort, kun live og med respekt for `prefers-reduced-motion`.
   - **Valgfri lyd** (fløjt og VAR-bip via Web Audio), slået fra som standard, med kontakt i ⚙.
   - Rammen bygger videre på den eksisterende `varbanner` (`matchcenter.js:316`). VAR-tjek forekommer 0,46 gange pr. kamp (måling i scratchpad/m/varfreq.mjs, skal committes).
2. **v3.32.3 statisk**
   - OpenGraph-tags med absolut `og:image` (fil i `public/`, curl-tjek af MIME efter deploy).
   - `manifest.json` med `display: standalone` og ikoner i 192 og 512 px. INGEN service worker.
   - `no-cache` for manifest i `firebase.json`.
   - NEWS: "på iPhone: eksportér ligaen (⚙) før du føjer til hjemmeskærm – den har sit eget lager".
   - firebase.json-rewrite svarer 200 med HTML på manglende filer, så deploy-tjekket skal kontrollere MIME-typen.
3. **📖 spilguide + ⓘ-links** (v3.33.0, som besluttet). ⓘ fra v3.32.1 får linket.
4. **Spillerkortet: "Sammenlign med starteren på pladsen"** (M). Ingen radar.
5. **Backlog (motor, M–L):** VAR-tjekket skal læse offside-fælden og linjehøjden, så en taktisk årsag kan vises ærligt. Det kobler til fundet "Ekstrem = Normal".

---
Tidligere planer: [tidligere-planer.md](tidligere-planer.md)
