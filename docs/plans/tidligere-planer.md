# Tidligere planer (nyeste først – den nuværende står i [nuvaerende-plan.md](nuvaerende-plan.md))

# Tidligere (5/11): v3.32.1 – live 6/11 (e2e mod live 741/741): designkritikkens røde fund (R1–R5) – brugeren 5/11: "lad os tage de røde fra analysen med det samme"

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
1. **v3.32.2 "VAR-øjeblikket" + game feel** – ✔ lavet i v3.32.2 (plan: `nuvaerende-plan.md`; lyden står ved ⚡, ikke i ⚙ – plan-gennemgangen 6/11)
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

---

# Tidligere (5/11): v3.32.0 – Spring kan trænes (backlog 0c), derefter 📖 spilguide (0d)

## Context
- v3.31.2 er live (e2e mod live 677/677). Brugeren 5/11: "Lad os fortsætte nu"; valgte "Spring, then the guide".
- **0c, brugeren 3/11:** "Tobias kan blive luftens konge, men det kræver jumpingpower på 14, men jeg kan ikke se hans jumpingpower i sidebjælken. Og jeg kan ikke se hvordan jeg kan træne ham i det."
- I dag sættes `p.jumpingPower` i generatoren (generator.js:182) og ændres ALDRIG. Den er ikke i `p.skills`, så den udvikles hverken gennem `addXp` (career.js:171), sæsonvækst (career.js:234) eller aldersfald (career.js:228). Kortet viser den kun inde i luftduel-linjen (card.js:39). Trup har kolonnen "Spring" (matrix.js:33).
- **Brugerens valg:** Fysik træner Fart, Styrke OG Spring (som Teknik med to evner). Spring får en bjælke under "Fysik & luft". Kravet viser "Spring 13/14 – trænes med Fysik".

## Ændringen (v3.32.0)
1. **Motor (career.js):**
   - `FOCUS.PHYSICAL.skills = ['pace', 'strength', 'jumpingPower']`.
   - `addXp`, `trainingEstimate` og `focusSkills` håndterer `jumpingPower` ved at læse og skrive `p.jumpingPower` gennem én lille accessor (`skillVal`/`setSkill`), så der ikke spredes særtilfælde.
   - `rate` for Fysik afstemmes, så den samlede Fysik-fremgang pr. evne ikke bliver hurtigere end i dag. Det måles med `tools/measure-lifecycle.mjs` før og efter, plus en ny `tools/measure-jump.mjs`: Spring-fordelingen og luftduel-styrken (aerialPower) efter 0, 1, 3 og 5 sæsoner, passiv og aktiv profil, samt hvor mange der låser Luftens Konge og Fyrtårn op.
   - `aerialPower` regnes om efter træning. Det sker allerede i season.js:96 – efterprøv, at det sker efter træningen.
   - Aldersfaldet (career.js:228) tager Spring med som de øvrige fysiske evner, hvis de falder med alderen. Ellers ikke. Arkitekten afgør det ud fra koden.
2. **Kortet (card.js):** "Spring" som bjælke i "Fysik & luft" (samme bjælke og samme værdi som de andre).
   - Arketypens krav viser "Spring 13/14 – trænes med Fysik", altså nuværende/krav plus fokus for hver evne i kravet. Det gælder alle evner, ikke kun Spring, via én hjælper i labels.js `archReqText`.
   - Gælder samme sted på Trup og Taktik (title).
3. **Træning (training.js):** Fysik-rækkens fremdrift viser "Spring" sammen med Fart og Styrke, og skønnet for næste +1 tager Spring med.
4. **Gemmeformatet ændres IKKE**: `jumpingPower` findes allerede, og `dev.jumpingPower` er bare en ny nøgle i `dev`. Sanitize skal tillade nøglen, så efterprøv `PLAYER_DEFAULTS` og dev-rensningen. Et fixture fra v3.31.2 skal indlæses.
5. Golden/fingeraftryk: friske ligaer ændrer ikke kampe. Træning flytter først noget efter runder, så golden-hashes over sæsoner kan skifte, og ændringen forklares i testen.
6. Spec §5 (træning), §2 (arketyper), NEWS, version 3.32.0 og backlog (0c → Lavet).

## Arbejdsgang
1. **Plan-gennemgang** (parallelt): Arkitekt (genbrug, rækkefølge, aldersfald), Spilfører klub (rate og balance, mål før og efter) og QC (opus) på planen. Ret planen efter dem.
2. Byggeagent: kode, målinger, unit og e2e, commit.
3. TM og QC parallelt, derefter RM.
4. Draft-PR, grøn CI, rapport til brugeren, merge.
5. Live og e2e mod live.
6. **Derefter 0d** (spilguide: "📖 Sådan virker spillet" i ⚙ + "?" pr. fane) med egen plan, gennemgået af QC og Spilfører UI.

## Verifikation
- check, unit og e2e grønne lokalt og i CI.
- Mutationer, der skal give rødt:
  - Spring ude af `FOCUS.PHYSICAL`;
  - `addXp` skriver i `p.skills.jumpingPower` i stedet for `p.jumpingPower`;
  - kortet uden Spring-bjælke;
  - kravteksten uden nuværende værdi;
  - `aerialPower` ikke regnet om.
- Målingen viser, at en ung spiller på Fysik kan gå fra 13 til 14 i Spring inden for en sæson eller to, og at luftduel-balancen mellem holdene (myVsBots) ligger inden for ±0,05.
- Live: Tobias' kort viser Spring-bjælken og "Spring 13/14 – trænes med Fysik".

## RETTET efter Arkitekt, Spilfører klub og QC (opus) – afløser planen ovenfor, hvor de er uenige
**Rate:** Fysik beholder **0,07**. Raten gælder PR. EVNE (season.js:117), så Fart og Styrke går præcis som i dag, og Fysik giver
nu tre evner (samlet 0,21 – det største fokus, betalt med friskhed −4 og skaderisiko 0,007). Det skrives i spec §5.
Målt (klub): 17–23-årige går fra Spring 13 til 14 på median 18 runder, 92 % inden for to sæsoner (0,0467 ville give 54 %).

**Hvad der IKKE bygges:**
- Spring kommer IKKE i `p.skills`, `KEY_SKILLS`, potentiale/loft (roomOf/keyAvg) eller `seasonGrowth`.
- Ingen bot-træning af Spring.
- Ingen sanitize- eller migreringskode. `dev` har ingen whitelist (sanitize.js:103); det tjekkes med et fixture fra v3.31.2.
- Ingen ny aerialPower-genberegning. `afterSkillChange` (season.js:95) kaldes allerede via `onSkill`.

**Delopgaver (Arkitekten):**
- **D1 Motor:**
  - `skillOf(p, k)` og `setSkill(p, k, v)` i career.js, brugt i `addXp`, `trainingEstimate` og generator.js:160.
  - `FOCUS.PHYSICAL.skills = ['pace', 'strength', 'jumpingPower']` med rate 0,07.
  - `focusOfSkill(k)`: første fokus, der ikke er Alsidig og har evnen.
- **D2 Måling:** `tools/measure-jump.mjs` bygget på measure-lifecycle's løkke.
  - Mål før og efter med en profil, hvor alle på dit hold til og med 25 år træner Fysik.
  - Tal: Spring-fordeling, aerialPower mig mod botter, hovedstødsmål pr. kamp og antal oplåste Luftens Konge/Fyrtårn efter 0, 1, 3 og 5 sæsoner.
  - Båndet skrives med begge tal, så den gamle værdi giver rødt. Klub målte 1,033 → 1,064.
  - myVsBots kan ikke se Spring og bruges IKKE som mål.
- **D3 UI:**
  - `['jumpingPower', 'Spring']` i `SKILL_LABELS` "Fysik & luft" (labels.js:38). Så kommer `SKILL_NAME` med automatisk: rapport, gainWords, "nærmest et +1" og Trup-mærket. Særtilfældet i labels.js:23 fjernes.
  - Kortets bjælke: `bar(l, skillOf(p, k))` (card.js:36).
  - Træning:
    - `SHORT.jumpingPower = 'SPR'`.
    - Hvert fokusvalg viser sine evner fra `FOCUS[k].skills`, fx "Fysik – Fart, Styrke, Spring" (training.js:60/68).
  - Trup:
    - Spring-kolonnen (key 'jump' beholdes) får "+N"-mærket for 'jumpingPower'. matrix-gain-v3300.test.mjs:61–63 vendes.
    - Arketypecellen (matrix.js:118) får title med kravteksten.
  - Gns-kolonnens title: "Spring tæller ikke med".
- **D3 Kravteksten** `archReqText(a, p)` (labels.js). Kun ejerens spiller (vagterne card.js:32, lineup-list.js:49 og matrix):
  - Format: "Låses op ved: Styrke 13/13 ✓ · Spring 13/14 – trænes med Fysik".
  - Opfyldt krav: "Navn nu/krav ✓", uden fokus.
  - Træner han fokusset i forvejen: "– trænes med Fysik (det gør han nu)".
  - To mangler med samme fokus: "Styrke 12/13 · Spring 13/14 – begge trænes med Fysik".
  - Paritetstest: hver `unlockReq`-nøgle i alle ARCHETYPES har et fokus.
- **D4:**
  - Fixture `tests/fixtures/save-v3.31.2.json` (lavet med 3ad5949) og en indlæsningstest med `dev.jumpingPower`.
  - Spec §2, §5 og §13 (Spring trænes med Fysik og indgår ikke i nøglesnit eller Gns), NEWS, version 3.32.0 og backlog 0c → Lavet.
  - Ret de forventede tekster i e2e run.mjs:1182 (9 → 10 bjælker) og dansk-kort-v3311.test.mjs:41/45.
- **D5 Aldersfald, egen commit i samme PR:**
  - 'jumpingPower' i tier 2 sammen med 'strength' (career.js:221). `declineSkills` og `trainedSkills` læser via skillOf/setSkill. Faldet halveres for den, der træner Fysik.
  - Det er den ENESTE del, der må flytte golden-hashes over sæsoner. Ændringen forklares i testen.
  - Kør D2 og lifecycle-båndene igen.

**Golden:** D1–D4 må IKKE flytte nogen hash, fordi en frisk liga kun bruger Alsidig. Flytter en sig, er det en fejl.

**Efterprøv på Tobias' profil, ikke snittet:**
- `roomOf` klemmes til mindst 0,1, så en spiller tæt på sit loft får ca. 0,007/runde, altså over 100 runder.
- Kravteksten bruger `nextText`, når han træner fokusset: "(går langsomt: tæt på sit loft)".
- D2 måler også en 24–27-årig tæt på loftet.

## Næste efter v3.32.0 (brugeren 5/11, efter designkritikken `docs/design-kritik-2026-11-05.md`)
**v3.33.0 = 📖 spilguide + "ⓘ Sådan virker det"** i én udgivelse:
- Guiden "📖 Sådan virker spillet" ligger i ⚙ og har et afsnit pr. del. Tal kommer fra konstanterne.
- Forklaringsteksterne på Taktik, Kamp, Træning, Klub og kortet foldes ind. Én kort linje er synlig, resten står bag "ⓘ" og linker til guidens afsnit. Det er kritikkens nr. 1 og F4's hjælpedel.

**Derefter, i hver sin version:**
- Kamp-underfaner med afspilningen på første skærm og "Send kampen" i en ⋯-menu.
- Brede tabeller på mobil: sticky første kolonne og fade.
- Berøringsflader på mindst 44 px ved ≤ 600 px.
- Farvesemantik (lilla = valgt, grøn = dit hold/handling) og kontrast (heat-1 og ★/☆).
- Færre gentagelser: klubpanelet, de to lønbudgetter og Klubs nøgletal.

**Udfald:** merget som e02c07d (#75), v3.32.0 live (e2e mod live 682/682).

# Tidligere (3/11): v3.31.2: arketypen på Taktik, ærlige skøn for ungdommen og spillerens statistik på kortet (brugerens ønsker 3/11)

## Context
1. "Jeg vil gerne have arketype markeringen med på taktik siden" (skærmbillede: Trups "Arketype/Note" viser 🔒/✨ + navn; Taktik-listen intet).
2. "jeg har endnu ikke set en ungdomsspiller der ikke har betegnelsen 'har meget mere i sig'". Årsag (kode): `roomWords` (ui/card.js:84)
   bruger `roomOf` (career.js:164) = (potentiale − nøglesnit)/3 klemt til 0,1–1, med grænserne 0,6/0,3. Ungdom får
   potentiale = snit + 4 ± 2,5 (career.js:36) → roomOf 0,5–1 → ca. 94 % lander i "meget mere". Ordet skelner ikke.
3. "Jeg vil gerne have en spillers statistik for holdet opgjort i sidebjælken" (kortpanelet).

## Ændringen
1. **Arketype på Taktik** (ui/lineup-list.js): samme mærke som Trups kolonne (🔒 låst / ✨ låst op + navn fra `archetypeOf`, title =
   beskrivelse + krav) i spiller-cellen; brikkens title på banen nævner den. Ét ord overalt: "arketype" (brugerens ord) – v3.31.1's
   "særpræg" på kortet rettes tilbage. Kun dit hold (privat – OWNER_FIELDS 'archetype').
2. **Ungdommens skøn**: ordene efter plads i evne-POINT (potentiale − nøglesnit), fem trin så ungdommen spredes:
   < 0,5 "er tæt på sit loft" · < 1,5 "har lidt mere i sig" · < 3 "har mere i sig" · < 4,5 "har meget mere i sig" · ≥ 4,5 "kan blive
   meget god". Træningshastigheden (`roomOf`) røres ikke – kun ordet. Måling (committet script `tools/measure-youth-words.mjs`):
   fordelingen af ordene for ungdom/≤19/≤23/øvrige over 5 ligaer, før og efter; båndet skrives så den gamle (≈94 % ét ord) giver rødt.
   Ordene står samme sted som i dag (kort, Træning, sæsonrapportens ungdomstilbud).
3. **📊 Statistik for <hold> på kortet**: lille tabel øverst i "📜 Kampe"-afsnittet: Denne sæson · Sidste sæson · I alt (gemt historik):
   kampe, minutter, mål, assists, snitkarakter, 👑, 🟨/🟥 (målmand: + clean sheets). Kilde: `matchLog` filtreret på holdet (LOG.H/LOG.A)
   og sæson + s*-felterne (stats.js PLAYER_SEASON_FIELDS) for denne sæson. Modstanderens spiller: samme tabel UDEN karakter (viewPlayer
   – rating er privat). "I alt" siger tydeligt, hvor langt tilbage den går ("de sidste 2 sæsoner"), og careerGames som "kampe i karrieren".
4. NEWS, version 3.31.2, spec (§10b kortet, §5 skøn), backlog (0c+ → Lavet; ungdom/statistik som Lavet).

## Tests
- e2e: Taktik-listen viser 🔒/✨ + navn for en spiller med arketype (data), intet for en uden; ikke på et andet holds liste.
- unit: roomWords-grænserne (alle fem + kanterne); måletestens bånd (gammel fordeling rød).
- unit + e2e: statistik-tabellen med data (kendt matchLog: 2 sæsoner, to hold – kun dette holds kampe tælles), modstander uden snit.
- Mutationer: arketype vist for modstander; ordene tilbage til roomOf-grænserne; statistik der tæller kampe for et andet hold; snit vist
  for modstander.

## RETTET efter QC (opus), Spilfører UI og Spilfører klub – afløser planen ovenfor, hvor de er uenige
**Arketype på Taktik**
- Ikonerne er 🔒 låst / 🌟 låst op (som matrix.js:119 og card.js), IKKE ✨.
- ≥ 900 px: en lille dæmpet linje under navnet i spiller-cellen (lineup-list.js:53), fx "🔒 Regista (spilfordeler)".
  < 900 px: kun ikonet efter navnet (title/aria-label = navn + beskrivelse). Ingen ny kolonne og intet på banens brikker.
- Kun dit hold (samme vagt som matrix.js:118). e2e tjekker også et andet holds liste.
- "særpræg" → "arketype" på kortet (card.js:42, låseboksen card.js:49), i spec.md:73 og i testen dansk-kort-v3311.test.mjs:117.

**Skøn-ordene**
- `roomPoints(p) = potential − keyAvg` (career.js ved siden af `roomOf`). `roomWords(points)` bruges af ALLE tre kaldesteder:
  card.js:101, training.js:71 (i dag `e.room` = roomOf 0–1!) og season-report.js:34. Mutation: ét kaldested sender `roomOf`.
- Grænser i point: < 0,45 "er tæt på sit loft" (samme grænse som trainingEstimate's room ≤ 0,15, career.js:310) · < 1,5 "har lidt
  mere i sig" · < 3 "har mere i sig" · < 5,5 "har meget mere i sig" · ≥ 5,5 "har langt mere i sig". Topordet er relativt og lover ikke
  et niveau (klub: 4,5 gav 43 % topord, og 4,5 point over snit 7 er kun startniveau).
- Ungdomstilbuddet (season-report.js:34) viser også nøglesnittet ("snit 6,8 · skøn: har meget mere i sig"), så tilbuddene kan rangeres.
- Måling `tools/measure-youth-words.mjs` (committet): fordeling og potentialets spænd pr. ord for AL ungdom ved første syn (n ≈ 420,
  20 seeds) og for ≤19/≤23/øvrige efter 0/14/28 runder. Testbånd: intet ord over 60 % for ungdom ved første syn. Den gamle ≈ 91 %
  giver rødt.
- spec §5: ordet kan skifte efter et +1, så det afslører potentialet inden for ca. 1/3 point. Det er accepteret, fordi kun ejeren ser det.

**📊 Statistik på kortet**
- Placering: lige efter kortets hoved, før evne-bjælkerne (card.js:28–34). Brugeren leder "i sidebjælken"; 📜 Kampe ligger 784 px nede.
  📜 Kampe beholder stemplerne og karrierelinjen.
- To kolonner med sæsonnumre: "Sæson N" og "Sæson N−1". INGEN "I alt" (historikken er 28 kampe = to sæsoner). "N kampe i karrieren"
  står allerede.
- Rækker:
  - Kampe, Min., Mål, Oplæg og Snit (kun dit hold) fra `matchLog` filtreret på holdets indeks (LOG.H/LOG.A, `league.teams.indexOf`)
    og sæson, med samme `hideLog`-filter som 📜 Kampe, så runden der afspilles ikke spoiles.
  - 👑, 🟨 og 🟥 (målmand: clean sheets) findes ikke i matchLog:
    - Sæson N fra s*-felterne, kun når han ikke er skiftet i sæsonen (`lastMove` før sæsonens vindue), og "–" under afspilning.
    - Sæson N−1 fra `league.lastSeasonStats` filtreret på holdet (v.t; season.js:334, stats.js:36).
    - Ellers "–". Gemmeformatet ændres IKKE.
- Tom tilstand: "Ingen kampe for <hold> endnu". `careerGames > 0` men ingen gemte kampe (migrerede ligaer): "ikke gemt" – ikke 0.
- Modstander: samme tabel uden Snit (rating er privat).
- Kendt grænse (spec): mødte hans gamle klub den nye, kan en kamp tælles for den nye, fordi loggen ikke gemmer hans side.
  Det er med i testens data.
- Mobil 390: korte rækketekster og ingen vandret rul i panelet (e2e).

**Tests (tilføjet)**
- Paritet: for en spiller der ikke er skiftet, er tabellens kampe/mål for sæsonen = sGames/sGoals.
- Spoiler: med hideLog står rundens mål, 🟥 og 👑 ikke.
- Købt i runde 7: kun det nye holds kampe tælles, og 👑/🟨 er "–".
- Migreret liga: "ikke gemt".
- Mutationer: arketype vist for modstander; et kaldested med roomOf; tabellen uden holdfilter; Snit vist for modstander; s* vist for en
  købt spiller.

## PAUSE (brugeren 3/11): "vi holder pause med udviklingen efter 3.31.2 indtil jeg siger til"
Efter v3.31.2 er live (og e2e mod live er grønt) startes INTET nyt: ikke 0c (Spring), 0d (spilguide), F4 eller /spilfoerere –
heller ikke backlog-reglen "tag det øverste punkt". Kun svar på brugerens spørgsmål og fejlrettelser i det, der er udgivet, hvis
brugeren beder om det.

## TILLÆG: danske positionskoder overalt (brugeren 3/11: "Position codes only"). Evneforkortelserne PAC/STA/…/GK bliver som i dag.
Kodesæt (QC opus + Spilfører UI, kun visning – interne rolle-nøgler røres IKKE; de ligger i gemte data og motoren):
| GK→MV | CB→MS | LB/RB→VB/HB | LWB/RWB→VKB/HKB | CDM→DM | CM→CM | CAM→OM | CF→OM | LM/RM→VM/HM | LW/RW→VK/HK | ST→ANG |
- CF→OM (QC): ROLE_POSITION kobler CF til AM, så en angriber dér får "⚠" – pladskoden skal betyde netop den position. Ingen formation
  har både CF og CAM. Regel: falder en pladskode sammen med en positionskode, er det præcis den position, der passer på pladsen.
- Én tabel `ROLE_LABEL` i public/engine/formations.js (motoren bruger den i referatet), eksporteret videre af labels.js. Den dækker
  ALLE roller i FORMATIONS uden fallback til den engelske kode; en test går alle roller igennem.
- `POSITION.CB` 'CB'→'MS' og `POSITION_FULL.CB` → 'Midtstopper (MS)' (ellers "MS" og "FOR CB" i samme række, lineup-list.js:51/55,
  tactics.js Hvis-Så-valgene).
- Visningssteder:
  - ui/matrix.js:105 (Trup Pos/#);
  - ui/lineup-list.js:47/51 (Plads + title);
  - ui/pitch.js:38 (brikkens title – koden tilføjes IKKE på brikken);
  - ui/matchcenter.js:120–121 (minibanen);
  - ui/lineup.js:12–14 (placeLabel). Kæden går gennem LINE, så "DM (FOR)" og ikke "CDM (DEF)". Fallback for gamle runder (e.role, "SUB (DEF)") går også gennem tabellen;
  - engine/match.js:741 og :1352 (referatteksterne "Din LB …", "sin CDM-zone"). Gamle gemte referater beholder teksten – ingen migrering;
  - labels.js:20 "Venstre (VK/VB)" / "Højre (HK/HB)";
  - labels.js:50 FIT_HELP "(VB/HB/VKB/HKB/VM/HM)".

  Gamle NEWS-tekster står som historik.
- Tests, der asserter de engelske koder, rettes:
  - lineup.test.mjs:10–25;
  - wide-slots-tm-v3246:110–125;
  - heat-ui:238–245;
  - side-v3260-tm:302 og :317. Linje 317 er en FRAVÆRS-assertion – den skal flyttes til den nye tekst, ellers tester den intet;
  - run.mjs:1183, 1402, 1408, 1452, 1522–1538, 1558, 1618, 2278.

  Trace-golden kan skifte, hvis en gylden kamp har teksten fra match.js:1352. Forklar ændringen i testen.
- Ny test:
  - Render Trup, Taktik-listen, banens titler og Match Center for alle 10 formationer.
  - De danske koder skal stå, og `\b(LB|RB|LWB|RWB|CDM|CAM|LM|RM|LW|RW|ST|CF|CB)\b` må ikke stå nogen steder. GK er undtaget som evnekolonne.
  - Mutation: én kode tilbage til engelsk → rød.

## TILLÆG: QC-forbehold fra v3.31.1
- Bjælken ved 601–700 px: ▶ må ikke skubbes ud over højre kant med 3 piller + 🔍. e2e ved 601 og 667 px: ▶'s højre kant ≤ bredden.
  Ret, hvis rød (knappen må krympe/afkorte modstanderens navn som ≤600).
- Testen af `opponentTacticKeys().label` (dansk-kort-v3311.test.mjs:123–124) skal teste en tekst, der faktisk vises, eller fjernes.

**Udfald:** merget som 3ad5949 (#73), v3.31.2. Pause 3/11–5/11.

# Tidligere (3/11): v3.31.1: ▶ Spil runde i bunden på alle faner – med opstillingens tegn

## Context
Brugeren (3/11, skærmbilleder af v3.30.0): "spil knappen er placeret forskelligt på de enkelte faner, og det er forvirrende".
I dag: stor grøn Spil-bjælke i bunden kun på Hjem og Taktik (`BAR_TABS = ['hjem','taktik']`, public/app.js:43); på Trup,
Træning, Kamp, Liga, Klub og ⚙ en lille ▶ i topbaren (`renderControls`, app.js:372–383) med tegnene "⛔1 ⚠3" (`#mini-warn`).
Bjælkens piller vises i dag kun på Taktik (`renderPlayBar`, app.js:388–405; Hjem har listen lige over).
Brugerens valg: "Bunden af alle faner, men med info om problemer i opstillingen som der er på den lille knap".

## Ændringen
1. Spil-bjælken på ALLE faner (de 7 + ⚙): `BAR_TABS` fjernes (bjælken altid), den lille ▶ i topbaren fjernes helt
   (`mini-play`, `#mini-warn`, `.mini-lbl/.mini-num` + CSS).
2. Bjælkens tegn på alle faner: pillerne (`issueGroups()`) vises på alle faner, ikke kun Taktik – samme regler som i dag
   (>3 grupper → "N ting"; præcis 3 på smal skærm → tæller). Et klik løser stadig på Taktik (`fixIssue(ids,'taktik')`).
   Hjem: OGSÅ pillerne i bjælken (brugeren 3/11: "Ja, også på Hjem") – selv om listen står på siden.
3. 🔍 modstanderen: som i dag (ikke på Hjem; ellers ja). ▶ står altid yderst til højre (samme x på alle faner).
4. Under afspilning: knappen er slået fra og uden tegn (som i dag på Hjem/Taktik).
5. Kortpanelet (Trup/Taktik) står over bjælken (bruger allerede `--bar-h`); på ≤600 px dækker arket bjælken som i dag.
   `body.has-bar` (sidens bundmargen) gælder nu altid.
6. Spec §10b, NEWS, version 3.31.1.

## Tests
- e2e: på hver af de 7 faner + ⚙ ved 1366 og 390: præcis ét `#play-round` i `#playbar`, intet i topbaren; ▶'s højre kant ens på
  alle faner; tegnene i bjælken = samme som Taktiks (antal og slags) – med data (en udelukket + trætte); under afspilning slået fra.
- Tilpas de eksisterende mini-play-tjek (F1-blokken: "den lille ▶ i topbaren på Trup/…", `#mini-warn`) og panel-tjek "Trup (uden
  Spil-bjælke)".
- Mutationer: bjælken væk på én fane; piller kun på Taktik; mini-▶ tilbage.

## RETTET efter QC (opus) og Spilfører UI (afløser planen ovenfor, hvor de er uenige)
1. Hjem: pillerne også i bjælken (brugeren). Tælleren ("N ting"/smal tæller) på Hjem RULLER til `#home-todo` (i dag `showTab('hjem')`
   = intet synligt + sletter `view.notice`); fra andre faner: Hjem med listen synlig (e2e: klik fra Liga → `#home-todo` i synsfeltet).
   Vend e2e run.mjs:103 (Hjem uden piller).
2. Tælleren (>3 grupper, eller 3 på smal skærm) viser slags kompakt som den lille knap gjorde: "⛔2 🚑1 🟨1" (antal SPILLERE pr. slags,
   ISSUE_ORDER) – "N ting" står i title. Brugerens krav: "info om problemer som på den lille knap". Mål at modstanderens navn stadig
   står ved 390 (run.mjs:2864).
3. Under afspilning: knappen slået fra med "📺 Runde N spilles …" (ingen næste modstander, ingen piller) – lukker backlog l.187–188.
4. Tekster: pillens title "Stil selv om på 📋 Taktik" (ikke "her på Taktik", app.js:396); app.js:602 "▶ Spil runde nederst".
   Kommentarer (app.js:42, 283, 369, 386; index.html:13; style.css:273/288/295/350) og spec §10b (1043–1044, 1052–1058, 1084–1085, 1103).
5. `html { overflow-y: scroll }`, så bjælken (fixed, left/right 0) er lige bred på korte og lange sider (▶ hopper ellers ~15 px på
   Windows/Linux). `has-bar` sættes stadig i renderNow – fejlsiden er uden bjælke (run.mjs:293).
6. Kamp efter fløjtet: intet 🔍 i bjælken (toHomeLine har "Forbered ›") – `.no-opp` ligesom Hjem.
7. Tests: alle mini-▶-referencer (run.mjs:81, 115, 277, 1077–1081, 1753–1754, 1765–1766, 2243, 2811, 2822) skrives om mod `#playbar`
   – paritetstjekkene ERSTATTES af bjælketjek på Trup og Liga, med fixturet ⛔1 ⚠2 🟨1. run.mjs:829: arkets bund = bjælkens top
   ved 601 px, arket dækker bjælken ≤600. ▶'s højre kant ens på alle 8 faner × 1366/390 (+ Kamp efter fløjtet, Hjem).
   Mobil: sidste række i Trup kan rulles fri af bjælken (390×667). CSS fjernes: style.css:286–287, 349, 356.
8. Accepteret: scout-bjælken viser dine numre i pillerne (som på Taktik i dag); ▶ står sidst i tab-rækkefølgen.

# Del 2 af v3.31.1: dansk på spillerkortet (brugeren 3/11: "nogle gange er der sneget sig engelske betegnelser ind")
Opgørelse (Explore-agent): engelsk kun i særpræg-tabellen (generator.js:18–31), unlock-nøglerne (card.js:41) og stil-navnene (counter.js:3, 53, 57).
Brugerens valg: danske positionskoder · "gegenpres" med småt overalt · Observationer + Erfaring mod stilarter.
1. **Særpræg vises fra tabellen efter id** (`ARCHETYPES` i generator.js), ikke fra den kopi, der er gemt på spilleren (generator.js:210):
   card.js:40 og matrix.js:118 → eksisterende ligaer får de nye navne UDEN migrering (gemmeformatet uændret; fixture save-schema4 skal
   vise det nye navn). Navne: Feje-målmand, Straffedræber, Offside-mester, Regista (spilfordeler), Presmonster, VAR-linjens spøgelse,
   Target Man → "Fyrtårn" (opspilspunkt); beskrivelserne: "50 %", "højt gegenpres".
2. **Unlock-kravet** gennem `SKILL_NAME` (+ jumpingPower → "Spring"): "Låses op ved: Udholdenhed 14, Erobring 12". Alle 9 nøgler dækket.
3. **Stilnavne** (counter.js:3, 53, 57; labels.js:15; matrix.js:39, 114): "Mod gegenpres", "Mod lav blok", "Mod VAR-linje og lange bolde";
   i referatet "Gegenpres + VAR-linje". "gegenpres" (ét s, småt) OVERALT i UI (labels.js:15, app.js:135/178, tactics.js:18, match.js:198-tekster).
   Kun viste tekster – interne nøgler (fx 'GEGENPRESS') røres ikke.
4. **Positioner** (labels.js:9): "Offensiv midtbane (OM)", "Defensiv midtbane (DM)", "Central midtbane (CM)", "Kant (…)", "Angriber (ANG)",
   "Back/kantback (dybe kantpladser)" – samme korte former som `POSITION` (labels.js:8). Følger med i season-report.js:34, pitch.js:38,
   lineup-list.js:51/55, matrix.js:110 (de bruger tabellen).
5. **Overskrifter**: "🕵️ Observationer" (card.js:52, 55) og "🧠 Erfaring mod stilarter" (card.js:38, matchcenter.js:74, matrix.js:39).
6. Småt: "Friskhed 92 %" (card.js:24), "VAR-puls", "startspiller: +60 %" (card.js:118).
7. Tests: engine.test.mjs:351 (privatlivs-regex) opdateres til de nye stavemåder i SAMME ændring – ellers tjekker den intet;
   run.mjs:1171 (positionstekst), v3163-gaps.test.mjs:316 (VAR-profil). Ny test: kortet for en spiller med hvert særpræg + en fra
   save-schema4 – ingen af de gamle engelske ord står (negativ liste: Pressing Monster, Target Man, Sweeper Keeper, Penalty Killer,
   Offside Maestro, Line Ghost, Playmaker, stamina, intercepting, jumpingPower, ballControl, Gegenpress, CAM, CDM, Scouting).
   Mutation: særpræget vist fra spillerens kopi → rød på save-schema4-testen.
8. spec.md (særpræg-listen, stilnavne) ⇄ koden.

**Udfald:** merget som cd1887c (#72), v3.31.1.

# Tidligere (3/11): F3 – Hjem-indhold og avisen ét sted (v3.31.0)

## Context
- v3.30.0 er live (e2e mod live 590/590).
- Brugeren: "Ændringer markeres som nu. Næste er f3". "+N" i Trup bliver altså som i dag.
- F3 er trin 4 af brugerens UI-ombygning (backlog nr. 0): "F3 Hjem-indhold, avisen ét sted".
- I det valgte design (artefaktet EPcztoSQdrk6pK8Bsy3FeS):
  - Hjem viser sidste runde med kampens spiller, placering ↑↓, "Før du spiller runde N", næste kamp, en mini-tabel og "Avisen" med én overskrift og "Læs hele avisen ›". Linket fører til Liga.
  - Liga har avisen: "Kun her – før to steder".
- I dag står avisen (`renderGazette`, `#gazette`) både sidst i Kamp (`public/ui/matchcenter.js:338`) og på Liga (`public/app.js:595`).
- Hjem har det meste allerede (`public/ui/home.js`). Det mangler kampens spiller og avisens overskrift, og ved 1366 px er der ca. 300 px tomt under kortene.
- Spilfører UI's F1-noter (backlog l.183–187), som hører til her:
  - Formen som farvede V/U/T-piller.
  - En sejr på Hjem med kampens spiller 👑 og avisens overskrift.
  - Drop bjælkens 🔍 på Hjem, fordi den gentager næste kamp-kortet.
  - QC: "N ting" tæller grupper, mens ▶'s tegn tæller spillere.

## Genbrug, så intet bygges igen
- `columnNow()` (`app.js:207`) giver klummens `title`. Den falder selv tilbage til den gamle avis, så den er Hjems overskrift. Der skrives ingen ny overskriftsfunktion.
- `m.ratings.motm` findes allerede og bruges i referatet (`matchcenter.js:306`). Hjem tager navn og karakter derfra.
- Liste-, link- og fanemønstret i Hjem genbruges: `homeHandlers`/`on.liga`, og `showTab` + scroll til et element som "ændr i Træning ›" (v3.30.0).
- `tools/measure-ui.mjs` måler Hjem, Kamp og Liga ved 1366 og 390 px. Før- og eftertallene skrives i spec §10b.

## Ændringen
1. **Hjem (`public/ui/home.js`, `homeData()` i `app.js`):**
   - `#home-last` får "👑 Kampens spiller: G. Kristensen (8,1)" (`#home-motm`), men kun når kampen har en motm. Han er fra kampen, ikke nødvendigvis fra dit hold, og teksten siger, hvilket hold han spiller for.
   - Et nyt kort `#home-paper` "📰 Avisen":
     - Klummens titel efter sidste runde og knappen "Læs hele avisen ›" (`#home-paper-link`). Knappen åbner Liga og ruller til `#gazette`.
     - Før runde 1 og under afspilning vises kortet ikke, ligesom avisen.
     - Kortet ligger i højre kolonne (`.home-side`) under mini-tabellen, så de ca. 300 px udnyttes.
   - `#home-opp-form`: "seneste 3" bliver tre små piller (V grøn, U grå, T rød, med title "Vundet/Uafgjort/Tabt"). Bogstaverne er stadig teksten, så skærmlæsere og tests kan læse dem.
   - "N ting" i "Før du spiller" tæller det samme som ▶'s tegn (spillere), ikke grupper. Hvilken tæller der er rigtig, afgøres af QC på planen; de skal være ens.
   - Bjælkens 🔍 skjules på Hjem, fordi næste kamp-kortet allerede har linket. Den bliver på Taktik.
2. **Avisen ét sted (Liga):**
   - `renderGazette` fjernes fra Kamp (`matchcenter.js:338`).
   - I stedet står der én linje sidst i Kamp efter fløjtet: "📰 Rundens avis står på Liga ›" (`#kamp-paper-link`), med samme handler som Hjem.
   - Klummen bygges kun ét sted for Liga (`app.js:581`), og argumentet til `renderMatchCenter` fjernes.
   - Mål-of-runden-linket (`#goal-of-round-match`) virker allerede fra Liga, så det følger med uændret.
   - På Liga flyttes avisen op lige under tabellen, før "sidste runde" og programmet. Det er dér, "Læs hele avisen ›" lander. Liga får først underfaner i F6.
3. **Tekster og dokumentation:**
   - Spec §10b: Hjem, Kamp og Liga med før/efter-højder fra `measure-ui`.
   - NEWS og `public/version.js` 3.31.0.
   - Backlog nr. 0: F3 flyttes til Lavet, og de fire F1-noter krydses af.

## Tests
- **e2e:**
  - De ca. 6 Kamp-tjek af `#gazette` (run.mjs:1716, 2022, 2115, 2133, 2396–2397) flyttes til Liga.
  - Et positivt tjek: `#match-center` har ingen `#gazette`, men har `#kamp-paper-link`, og linket åbner Liga med `#gazette` i synsfeltet.
  - Hjem:
    - `#home-paper` viser netop klummens titel. Den er den samme tekst som `#col-title` på Liga.
    - Linket lander på `#gazette`.
    - Kortet findes ikke før runde 1 og ikke under afspilning.
  - `#home-motm` viser netop kampens motm med navn og karakter.
  - Formpillerne har den rigtige rækkefølge, de rigtige bogstaver og den rigtige klasse.
  - "N ting" er lig med ▶'s tal.
  - 🔍 vises ikke på Hjem, men vises på Taktik.
- **Unit (`home-f1-tm.test.mjs`):**
  - motm med og uden data, kortet med og uden titel, pillerne og tælleren.
  - Assertér på indholdet og på det, der ikke må stå ("undefined", tomt kort).
- **Mutationer, der skal give rødt:**
  - avisen tilbage i Kamp;
  - linket lander ikke på `#gazette`;
  - motm fra det forkerte hold eller felt;
  - tælleren tilbage til grupper;
  - kortet vist under afspilning.

## Arbejdsgang (CLAUDE.md)
1. QC (opus) og Spilfører UI på denne plan, parallelt. Arkitekten springes over, fordi filerne og genbruget er kortlagt ovenfor. Ret planen efter dem.
2. Kode → check, unit og e2e → commit.
3. TM og QC parallelt, derefter RM.
4. Draft-PR, grøn CI, rapport, merge, live og e2e mod live.

## Verifikation
- Lokalt og i CI er `npm run check`, `npm test` og `npm run test:e2e` grønne.
- Mutationerne ovenfor bliver røde.
- `measure-ui` før og efter: Kamp bliver kortere, og Hjem fylder 1366-højden uden tomrum. Tallene skrives i spec.
- Live:
  - Hjem viser 👑 og avisens overskrift.
  - "Læs hele avisen ›" lander på avisen på Liga.
  - Kamp har kun linket.

## RETTET efter QC (opus) og Spilfører UI – disse punkter afløser planen ovenfor, hvor de er uenige
1. **Kampens spiller gennem visibility:** `viewRatingEntry(motm, motm.teamId === mine.id)` (public/engine/visibility.js).
   Dit hold: "👑 Kampens spiller: #9 G. Kristensen · karakter 8,1". Modstanderen: "👑 Kampens spiller: #9 G. Kristensen (Brøndby IF)" –
   UDEN tal og uden stjerner (som avisen, matchcenter.js:236,250). Mutation `viewerOwnsTeam=true` skal blive rød (e2e/unit med en
   modstander-motm).
2. **Overskriften:** columnNow() returnerer null ved fejl (app.js:209) – det er renderGazette, der falder tilbage. Hjems tekst =
   klummens title, ellers `lr.gazette.headlines?.[0]` (samme som Ligas første `#headlines li`), ellers "Rundens avis". columnNow må
   IKKE kaldes under afspilning, og resultatet caches pr. lastRound.round, så fejlboksen (errors.js:6–9 fjerner ikke dubletter) kun
   får én linje, også når Liga og Hjem begge tegnes. Udvid fejl-scenariet (e2e ~l.2139) til Hjem: overskrift fra den gamle avis, én fejllinje.
3. **"N ting" forbliver GRUPPER** (QC): én række = én gruppe = ét link; Taktiks `#issue-count` er også grupper. Den lille ▶ tæller med
   vilje spillere. Ingen ændring – test i stedet at Hjems N = antal `.todo-row[data-kind]` = Taktiks N. Backlog-noten (l.187) lukkes
   med "bevidst forskellige enheder".
4. **Avis-linket i Kamp står ØVERST** i `.to-home` (toHomeLine, app.js:704), med overskriften: "… · Forbered › · 📰 «overskrift» ›"
   (`#kamp-paper-link`), samme betingelse som linjen (ikke under afspilning, kun seneste runde). Ingen linje nederst.
   `column`-argumentet fjernes både i Kamp-indholdet og i `matchCenterEl` (app.js:831). Ret kommentarerne i matchcenter.js:2 og
   app.js:207,773. e2e l.2022/2115 (`#match-center #goal-of-round-match`) bliver til: linket findes ikke i Kamp, men på Liga.
5. **Landing:** `#gazette { scroll-margin-top: calc(var(--top-h) + .5rem) }`; e2e: toppen af `#col-title` ligger under topbarens
   underkant (ikke kun "synlig"), ved 1366 og 390.
6. **🔍 skjules på Hjem**, og `#play-round` får `margin-left: auto`, så ▶ står samme sted på Hjem og Taktik. Ret e2e l.96.
7. **Formpiller:** synlig tekst "seneste 3 (ældste → nyeste)" før pillerne; pille-title fra modstanderens side ("<hold>: Vundet").
   Bogstaverne V/U/T er stadig tekst.
8. **`#home-paper` i venstre kolonne** (`.home-main`) under "Før du spiller" – det tomme felt er til venstre (venstre slutter y 408,
   højre y 537 ved 1366). Rækkefølge: resultat ↑↓ → 👑 → Før du spiller → 📰.
9. Dropper kravet "Hjem uden tomrum ved 1366". measure-ui før/efter i spec §10b (Kamp, Liga, Hjem ved 1366 og 390).
10. NEWS: "Avisen står nu kun på Liga – Hjem og Kamp viser rundens overskrift med et link".

## Status (3/11 06:50)
- Bygget og committet: d7c84e0. Lokalt check, unit 1381/1381 og e2e 618/618 grønne. Alle 8 mutationer gav rødt.
- PR cvejleaa/TactiVAR#71 er draft. CI er grøn på d7c84e0.
- TM og QC (opus) kører parallelt (workflow ws3oopqaa). Derefter RM, rapport til brugeren, merge, live og e2e mod live.

**Udfald:** merget som 3a01d01 (#71), v3.31.0.

# Tidligere (2/11 22:09): PR cvejleaa/TactiVAR#70 (v3.30.0) – CI grøn på 21c7be6, klar til merge

## Context
Alle roller er kørt, og deres fund er rettet:
- **TM:** del 1 og del 2 er bevist (59 og 43 mutanter; de nye tests er cherry-picket).
- **QC:** land med forbehold. Forbeholdene er rettet: tekster, 👥 på Hjem, "tilskuere" og NEWS.
- **RM:** GO, når CI er grøn.

Lokalt: unit 1373/1373 og e2e 587/587. CI "test" er success på 21c7be6. Rapporten til brugeren er givet.

## Skridt
1. Markér #70 klar og squash-merge med expectedHeadSha 21c7be65cfe0b9c14fcff248d22d74ede1975ab5. Squash-beskeden er på dansk, uden modelnavn og uden Co-Authored-By. Afmeld PR-aktiviteten.
2. Kør:
   1. `git fetch origin main && git checkout -B claude/busy-hawking-lpk4y5 origin/main && git branch --set-upstream-to=origin/claude/busy-hawking-lpk4y5`
   2. `git push --force-with-lease -u origin claude/busy-hawking-lpk4y5`
3. Vent, til CI på main og deploy.yml er grønne og `curl tactivar.web.app/version.js` viser 3.30.0. Kør derefter e2e mod live fra `$S/mut17`.
4. Ryd op i worktrees: `$S/qc-371`, `$S/tm-v3300a` og `$S/tm-v3300b`.
5. Fortæl brugeren, hvad der er live. Derefter F3 (Hjem og avisen) eller backlog 0b (sponsorater), efter brugerens ønske. Spørg, om "+N kun for sidste runde" føles for tyndt.

# Tidligere (2/11 aften): v3.30.0 – genoptag efter brugsgrænsen

## Context
v3.30.0 samler brugerens ønsker:
- Træning-fane og "+N" for sidste rundes +1 (del 1, committet som 371e6f6 og pushet med head 0966d54).
- Ærlige startstjerner og løn på 5,5 % af værdien.
- 9.000 tilskuere kan nås, og tilskuertallet vises på alle kampe.
- "💰 Til salg" i Trup.
- Backlog 0b om sponsorater.

Byggeagenten for del 2 (a10fb09bbf1edb491) og TM på del 1 stoppede, da brugsgrænsen blev ramt. Byggeagentens ukommitterede arbejde ligger i arbejdstræet (17 ændrede filer + `economy-v3300.test.mjs` + `tools/measure-*.mjs`). QC (opus) på del 1 er færdig: land med forbehold, intet blokerende.

## Skridt
1. **Genoptag byggeagenten** med SendMessage til a10fb09bbf1edb491: "fortsæt". Den gør del 2 færdig, kører check, unit og e2e og committer uden push. Lav ikke dens arbejde om.
2. **Kør TM igen på del 1** (`tm/v3.30.0a`, worktree `$S/tm-v3300a`, port 5111) parallelt med agenten. Resume workflow `wf_e1226384-912`: QC kommer fra cachen, og kun TM kører.
3. **Ret QC's forbehold for del 1** (tekster, efter agentens commit, så der ikke opstår konflikt):
   - `#trup-help`: "+N = antal +1 efter runde R". Ved `seasonJustEnded` med gains kommer en halv sætning om, hvorfor Trup ingen mærker har.
   - `#training-next`: "nærmest et +1: …" og "N træner stadig Alsidig".
   - De forældede kommentarer i `career.js:289` og `style.css:37`.
4. Cherry-pick TM's test-commits. Kør TM og QC på del 2 (commit først), derefter RM på hele udgivelsen.
5. Draft-PR "v3.30.0: …", subscribe, grøn CI. Rapportér rollerne til brugeren, merge, vent til live, kør e2e mod live, og ryd `$S/qc-371` op.

## Verifikation
- `npm run check`, `npm test` og `npm run test:e2e` er grønne.
- Mutation:
  - Fjern `att` på resultatet, og testen skal blive rød.
  - Sæt `WAGE_SHARE` tilbage til 0,06, og testen skal blive rød.
  - Sæt tilskuerkoefficienterne tilbage til 300/150/120, og 9.000-båndet skal blive rødt.
- `tools/measure-economy.mjs` skal give omkring 69 % sæsoner i overskud (5 ligaer × 10 sæsoner).
- Live:
  - 👥 tilskuertal står på resultatkortene og i referatet.
  - "💰 Til salg" står i Trup.

# Tidligere (2/11 16:10): PR cvejleaa/TactiVAR#69 (v3.29.1 + emulator-cache) – CI grøn på 674fcaf, klar til merge

## Status
- #68 (v3.29.0, F2) er merget (f6f609b). CI på main var rød i ét tjek: Spil-bjælken løb 20 px over ved 390 px med "Nordkysten BK (hjemme)". Fejlen er gammel (v3.28.0, `flex: 1 0 auto`) og afhænger af ligaens tilfældige navne. Deploy blev skipped, så live er stadig 3.28.0.
- #69, head 674fcaf:
  - 9899097: CI-cache af Firebase-emulatorerne. På 674fcaf står der i CI "Cache restored from key firebase-emulators-Linux-…", og advarslen er væk.
  - a909836: v3.29.1. Knappen må krympe, og kun navnet afkortes med "…". e2e tester med et langt og et kort navn.
  - 428cf5d og 674fcaf: Test Managers skærpede tjek (mellemrum før "·", "…", centrering) og TM's hukommelse.
- Roller:
  - QC: i orden, intet blokerende.
  - TM: rettelsen er bevist, og alle 3 overlevende huller er nu dækket.
  - RM: GO, når CI er grøn. Ingen migrering. Tilbagerulning sker kun via hosting, og der skal spørges først.
- Lokalt: e2e 554/554. Mutationen med den gamle CSS gav rødt (1 af 550). CI: regler 69/69 og e2e 554/554.

## Næste skridt
1. Markér #69 klar. Squash-merge med expectedHeadSha 674fcaf. Afmeld PR-aktiviteten.
2. Nulstil branchen til origin/main og push med `--force-with-lease`.
3. Vent på, at CI på main er grøn og deploy.yml er success, og at version.js viser 3.29.1 live. Kør derefter e2e mod live fra `$S/mut17`.
4. Rapportér til brugeren: F2 og 3.29.1 er live, og emulator-cachen virker.
5. Derefter F3 (Hjem og avisen ét sted).

# Tidligere (2/11 15:33): PR cvejleaa/TactiVAR#68 (v3.29.0, F2) – CI grøn på 5e35132, klar til merge + brugerens spørgsmål om emulator-cachen

## Status F2
- Rollerne er kørt (TM, QC opus, Spilfører UI, RM). Deres rettelser er i 5e35132, og alle 5 mutationer gav rødt.
- Lokalt: e2e 549/549, unit 1342/1342. CI check_suite er færdig uden fejl på 5e35132.

## Næste skridt F2
1. Bekræft check-run'et "test" = success på 5e35132.
2. Markér #68 klar. Squash-merge med expectedHeadSha 5e35132. Afmeld PR-aktiviteten.
3. Nulstil branchen til origin/main og push med `--force-with-lease`.
4. Vent på, at version.js viser 3.29.0 live. Kør derefter e2e mod live fra `$S/mut17`.
5. Rapportér til brugeren.

## Brugerens spørgsmål: "caching the /home/runner/.cache/firebase/emulators directory – hvordan gør vi det"
- Sådan virker det i dag: hver CI-kørsel henter Firestore-emulatorens jar (ca. 60 MB) igen i `npm run test:rules`. Der findes ingen `actions/cache` i nogen workflow.
- **Ændring i `.github/workflows/ci.yml`:** et nyt trin før "Firestore-regler (emulator)":
  ```yaml
  - name: Cache Firebase-emulatorerne
    uses: actions/cache@v4
    with:
      path: ~/.cache/firebase/emulators
      key: firebase-emulators-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      restore-keys: firebase-emulators-${{ runner.os }}-
  ```
  - Nøglen følger `package-lock.json`, så en ny firebase-tools-version, og dermed en ny emulator-version, giver en ny cache. Emulatoren henter selv en manglende version, så en gammel cache kan aldrig give en forkert emulator, kun et nyt download.
  - Cachen deles mellem PR og main: cachen fra main-push kan læses af PR'er.
- Det er kun CI, så der er ingen ændring i `public/`, ingen version-bump og intet deploy-indhold. `deploy.yml` bruger ikke emulatorer.
- **Roller:** QC og RM, en let gennemgang. Mutation er ikke relevant (konfiguration). Beviset er to CI-kørsler: den første skal vise "Cache not found … saved", den næste "Cache restored", og warning-linjen og downloadet skal være væk.
- Lille PR efter #68 er merget: draft, grøn CI, merge. Verificér derefter på næste kørsel, at cachen bliver ramt.

# Tidligere (2/11): F2 – spillerkortet som ét panel (v3.29.0)

## Kontekst
- F1 (v3.28.0) er live, e2e mod live 473/473. Brugeren: "fortsæt med F2".
- I dag tegnes `renderCard` (public/ui/card.js) i bunden af Trup (`trup-layout`, kort | træning) og Taktik (`section.tk-card`). På mobil ligger kortet ca. 3.400 px under banen (backlog nr. 5).
- Brugerens valg (2026-11-02):
  - Taktik: et klik betyder stadig byt. Kortet åbnes med et særskilt ⓘ.
  - Panelet kommer kun på Trup og Taktik.
- Fundet ved kortlægningen:
  - Ingen eksisterende overlay- eller Escape-mønstre at genbruge.
  - Der er altid en spiller valgt som standard, så der skal en særskilt åben-tilstand til.
  - `pickForSwap` vælger og bytter i ét kald.
  - Ca. 29 e2e-linjer bruger kortets id'er, flere af dem uden at klikke en spiller først.

## Design
- **Ét panel, ét sted i DOM:**
  - Ny rod `#cardpanel` i `public/index.html`, ved siden af `#playbar`, uden for `main#app`.
  - `renderCard` er uændret (signaturen bevares, så unit-testene består). Der kommer et hoved med "#nr Navn" og ✕ (`#card-close`).
  - `role="dialog"` og `aria-label`. Panelet er ikke-modalt, så man kan klikke en anden række og skifte kort.
- **Tilstand:**
  - `view.cardOpen` (gemmes ikke). `selectedPlayerId` bevares som i dag, også standardvalget.
  - Panelet vises kun når `cardOpen`, en spiller er valgt, og fanen er Trup eller Taktik.
  - Lukkes af ✕, Escape (én `keydown`-handler), `showTab`, `setViewTeam` og ny liga/import.
- **Åbnes af:**
  - Trup: et klik på en række i regnearket (`onSelect`). Det erstatter `scrollIntoView`.
  - Taktik:
    - et nyt ⓘ-knap på listens række (`.lp-info`, `data-pid`);
    - "Se kort ›" (`#pick-card`) i byt-beskeden (`pickMsg`);
    - på et andet hold: et klik på brik eller række (dér er der ingen byt).
  - Et klik på din egen brik eller række gør præcis det samme som i dag, og panelet åbnes ikke. Er panelet åbent, skifter det til den spiller, der klikkes på, men åbnes ikke af sig selv.
  - Den valgte række markeres lilla, med betydningen "hvor du er".
- **Layout:**
  - **Computer:** fast panel fra højre, `width: min(420px, 92vw)`. Toppen ligger under topbaren og scout-bjælken (`--top-h`), bunden over Spil-bjælken. Det har sin egen rulning, og z ligger mellem playbar (20) og tabbar (30).
  - **Mobil ≤ 600 px:** ark fra bunden over navigationen (`bottom: 57px + safe-area`), med `max-height` 70vh og rulning, og det dækker Spil-bjælken, mens det er åbent.
  - **Siderne:**
    - Trup: træningsoversigten får hele bredden.
    - Taktik: områderne bliver `"pitch list" "tactics tactics"`, og på mobil pitch, list, tactics.
- **Fokus og gentegning:**
  - Ved åbning får ✕ fokus. Ved lukning går fokus tilbage til det element, der åbnede panelet (ⓘ eller rækken).
  - Gentegningsvagten (app.js l.374–390, fokus i et felt) udvides til `#cardpanel`, så noten (`#note-input`) og `#focus-select` ikke mister fokus.
- **Uændret:**
  - Træning sættes kun på Trup (`#focus-select` kun når tab = trup).
  - Markedsboksen og køb ligger i kortet.
  - Klub er uændret.
  - Gemmet røres ikke.

## Filer
- **`public/app.js`:**
  - `view.cardOpen`, `openCard(pid, origin)`, `closeCard()` og en Escape-handler.
  - `renderNow` tegner `#cardpanel` og fjerner kortet fra `trup`- og `taktik`-layout.
  - `pickMsg` får "Se kort ›".
  - `showTab`, `setViewTeam`, ny liga og import lukker.
- **`public/ui/lineup-list.js`:** ⓘ-knap pr. række, `onInfo`.
- **`public/ui/card.js`:** et lille `renderCardPanel({ card, title, onClose })`.
- **`public/index.html`:** `#cardpanel`.
- **`public/style.css`:** panel og ark, `.trup-layout`/`.taktik-layout`, z-lag og safe-area.
- **`docs/spec.md` §10b:** kortpanelet, med målte højder før og efter (`tools/measure-ui.mjs`).
- NEWS, `public/version.js` 3.29.0, og backlog: nr. 0 F2 og nr. 5 til Lavet.

## Tests
- **e2e-hjælper `openCard(pid, pg)`:** de ca. 29 steder, der læser kortet, åbner det først. Hvor de gør det i dag uden klik, klikkes standardspilleren.
- **Nye tjek:**
  - Der findes aldrig mere end ét `#player-card`, og der står intet kort i `main#app`.
  - Trup-klik åbner, ✕ og Escape lukker, og fanen og fokus følger med.
  - Taktik:
    - et klik på din egen brik eller række åbner ikke, men bytter som før;
    - ⓘ og "Se kort ›" åbner;
    - et klik på en modstander åbner;
    - åbent panel og en ny brik viser den nye spiller.
  - Faneskift og holdskift lukker.
  - Noten beholder fokus under skrivning i panelet.
  - **1400 px:** panelet står til højre, uden vandret rulning, og dækker ikke Spil-bjælken.
  - **390 px:**
    - arket står over navigationen;
    - højst 70 % af højden;
    - ✕ er mindst 44 px;
    - ingen vandret rulning;
    - kortet kan ses uden at rulle siden. Backlog nr. 5's 3.400 px giver rødt.
  - `measure-ui`: Taktik og Trup bliver kortere (før og efter i spec).
- **Mutationer, der skal give rødt:**
  - et klik på egen brik åbner panelet;
  - Escape-handleren er fjernet;
  - `showTab` lukker ikke;
  - ⓘ mangler;
  - arkets `bottom` er 0 (bag navigationen);
  - gentegningsvagten mangler `#cardpanel`.

## Arbejdsgang
1. QC (opus) og Spilfører UI på denne plan. Ret planen efter dem.
2. Kode. Kør check, unit og e2e. Commit.
3. TM og QC parallelt, derefter RM.
4. Draft-PR, grøn CI, rapport til brugeren, merge.
5. Live og e2e mod live.
6. Derefter F3 (Hjem-indhold og avisen ét sted).

# Tidligere (2/11 12:51): v3.28.0 (UI F1) – PR cvejleaa/TactiVAR#67 har grøn CI (head e1a5a14), klar til merge

## Kontekst
- F1: ramme, 🏠 Hjem, Spil-bjælke og scout-bjælke. Brugerens UI-ombygning, trin 2 af F0–F6.
- Rollerne er kørt, og alle fund er rettet:
  - **QC:** B1 er rettet (🔍 fra Hjem på en frisk liga).
  - **TM:** 14 overlevende mutanter dræbes nu.
  - **Spilfører UI:** de 3 S-rettelser er lavet.
  - **RM:** NO-GO er afløst af rettelserne. Planen er version 3.28.0, ingen migrering og ingen ændrede regler.
- Seks mutationer af rettelserne er røde (M1 crasher med TimeoutError).
- Lokalt: e2e 472/472. CI "test" er success på e1a5a14.

## Næste skridt
1. Markér #67 klar, squash-merge med expectedHeadSha e1a5a14, og afmeld PR-aktiviteten.
2. Kør i /home/user/TactiVAR:
   1. `git fetch origin main && git checkout -B claude/busy-hawking-lpk4y5 origin/main && git branch --set-upstream-to=origin/claude/busy-hawking-lpk4y5`
   2. `git push --force-with-lease -u origin claude/busy-hawking-lpk4y5`
3. Vent på, at deploy.yml er grøn og version.js viser 3.28.0 live. Kør derefter e2e mod live fra `$S/mut17` (fetch main, checkout FETCH_HEAD, `BASE_URL=https://tactivar.web.app timeout 3000 node tests/e2e/run.mjs`).
4. Rapportér til brugeren, hvad der er live.
5. Næste fase er F2 (kortpanelet):
   1. Plan, gennemgået af QC (opus) og Spilfører UI.
   2. Kode og commit.
   3. TM og QC, derefter RM.
   4. PR og live.

   Derefter F3–F6, så nr. 41 og nr. 48.

# Tidligere (2/11): Spilletid, form og udelukkelse (backlog nr. 64, 41, 48) – tre versioner

## Kontekst
- Brugeren valgte "Spilletid, form og karantæne" som næste klynge og har besluttet:
  - **nr. 64, udelukkelse ("Strengere"):** rødt kort (to gule) giver 1 kamp, direkte rødt giver 2 kampe, og hvert 3. gule kort i sæsonen giver 1 kamp. Gælder alle hold. Udelukkelsen afsones over sæsonskiftet, og de gule kort nulstilles.
  - **nr. 48, form ("Spilletid og resultater"):** fast spilletid giver op til +5 % i kampen, bænk og reserve trækker ned mod −5 %. Sejre og gode karakterer løfter lidt, nederlag trækker ned. Formen er skjult og vises kun som ord på dit eget kort.
  - **nr. 41, udvikling ("Som backloggen"):** træningens effekt bliver 40 % + 60 % × andelen af spillede minutter i de seneste runder.
- I dag giver kort ingen udelukkelse, rotation og bænk koster intet, og en reserve udvikler sig næsten lige så hurtigt som en fast spiller.
- "Karantæne" er allerede brugt om transfers (`quarantined`/`lastMove`). Derfor hedder det "udelukket" og `p.banMatches`.
- "Form" kolliderer med `formOf` (holdets point) og `profile.form` (formation). Derfor hedder koden `sharpOf`/`SHARP_*`, og ordet "form" bruges kun i UI.

## Genbrug, så det ikke bygges igen (Arkitekten)
- `p.matchLog` har allerede minutter, resultat og karakter pr. kamp i to sæsoner, for alle hold. Spilletid og form regnes ud af den, så der kommer intet nyt felt og ingen skema-bump.
- `sYellow` tælles allerede (`stats.js:44`) og nulstilles i `endSeason`.
- Skademønsteret kan genbruges 1:1 til udelukkelse:
  - nedtælling i `season.js:213`;
  - `isAvailable` i `match.js:201`, som er den eneste port;
  - `pubScore` i `career.js:99`, som bruges af `autoMatchBench`/`bestEleven`/`repairLineup`;
  - `prepareSide`, der erstatter spilleren;
  - UI i `card.js`, `lineup-list.js`, `matrix.js` og `pitch.js`, samt CSS.
- Formfaktoren ganges ind i `ff()` (`match.js:520`) ved siden af `posF`.
- Golden-hashes er uændrede, så længe friske ligaer (tom `matchLog`, `banMatches` 0) giver præcis faktor 1, og den kun ganges på, når den er ≠ 1.

## v3.27.0: Udelukkelse (nr. 64)
- **Kode:**
  - `banMatches: 0` i `generator.js` og `sanitize.js` `PLAYER_DEFAULTS`.
  - `career.js`: `unavailable(p)` er den ene fælles vagt (skade eller udelukkelse). Desuden `BAN = { DIRECT: 2, SECOND_YELLOW: 1, YELLOW_EVERY: 3 }` og `pubScore` via `unavailable`.
  - `match.js`: `isAvailable = !unavailable`.
  - Noten i `prepareSide` følger årsagen ("er udelukket og erstattes").
  - Ny reserve-fallback, så en utilgængelig spiller aldrig spiller, heller ikke uden bænk.
  - Teksten i Hvis-Så-skift opdateres.
  - `season.js`: `bookBans` kører efter skadelinjen og før `bookMatchStats`. Rødt kort sætter `banMatches`, og et 3/6/9-kryds på `sYellow` lægges til. Nedtællingen sker sammen med skaderne. De gule kort bag et rødt kort tæller med i `sYellow`, som i dag.
  - `banMatches` kommer i `visibility` `PUBLIC_FIELDS`.
- **UI:**
  - Kortet viser "🟥 udelukket i N kamp(e)".
  - Spillerlisten, matrix og banen viser 🟥 N og klassen `.banned`.
  - Noten står i referatet.
- **Fixture:** `tests/fixtures/save-v3.26.1.json` (skema 9, fra den nuværende kode). Indlæsningstesten skal vise `banMatches` 0.
- **Tests:** `ban-v3270.test.mjs`:
  - direkte rødt giver 2 runder ude, gult/rødt giver 1;
  - 3., 6. og 9. gule kort giver hver 1, 2. og 4. giver ikke noget;
  - udelukkelsen afsones over sæsonskiftet;
  - erstatning og note;
  - botternes auto-udtagelse;
  - Hvis-Så med en udelukket;
  - replay-pakken (`replay-pack-v3243`).

  Mutation: ban-leddet i `unavailable` skal give rødt.
- **e2e:** en starter med `banMatches=1` vises med 🟥, mangler i karakterarket efter runden, nævnes i noten, og er fri igen runden efter.
- **Måling:** `tools/measure-bans.mjs` måler udelukkelser pr. hold pr. sæson, også pr. aggressivitet. Båndet skal blive rødt på 0.

## v3.28.0: Spilletid giver udvikling (nr. 41)
- `career.js`: `PLAY_WINDOW = 5` og `recentPlay(p, season, sRound)` → `{share, n, wins, losses, avgRt}` fra `matchLog`. Den kan krydse sæsonskiftet.
- `trainRound`: træningseffekten ganges med `(0.4 + 0.6 × share)`. Den kaldes efter `logMatch`. `MATCH_XP` og `seasonGrowth` er uændrede.
- `trainingEstimate(p, share)` på kortet og i `ui/training.js`, med teksten "spiller han ikke, træner han ca. halvt så hurtigt".
- **Tests og mål:**
  - Faktoren 0,4/0,7/1 og vinduet over sæsonskiftet. Mutation: `TRAIN_PLAY = 0`.
  - `training-v3180` og `turnover-v3180` opdateres.
  - `measure-lifecycle` kører passiv og aktiv. Båndene `keyRatio`/`youthStarter` flyttes med før/efter.
  - Ny sammenligning: ung der spiller mod ung reserve.

## v3.29.0: Form (nr. 48)
- **Beregning:** `sharpOf(p, at) = 0.05·(2·share−1) + 0.01·(sejre−nederlag)/n + 0.005·klem(snitkarakter−6)`, klemt til ±5 %. Med `n` = 0 er faktoren præcis 1.
- **I kampen:** `season`/`sRound` sendes med i `mopts` og dermed i replay-pakken. Faktorerne caches ved kampstart, og `ff()` ganger kun med en faktor ≠ 1.
- **Visning:** `visibility` `sharpWord` giver ordet kun på dit eget kort ("i topform / god form / normal / mangler kamptræning / rusten").
- **Måleværktøj:** `tools/measure-rotation.mjs` (også nr. 2's værktøj) sammenligner fast elleve med fuld rotation mod botter: point, målforskel og spænd. Testen `form-v3290.test.mjs` har et bånd, så fast minus rotation > X, og det gamle ≈ 0 giver rødt. Desuden måles spændet mellem top og bund.
- **Tests:** faktorens grænser, `n` = 0 giver 1, intet ord på modstanderens kort, replay giver samme kamp. Mutation: fjern faktoren i `ff`.

## Arbejdsgang pr. version (CLAUDE.md)
1. QC (opus) og de relevante Spilførere kører på planen:
   - v3.27.0: motor, klub, UI;
   - v3.28.0: klub, UI;
   - v3.29.0: motor, klub, UI.
2. Ret planen.
3. Kode, måling, unit, e2e.
4. Commit.
5. TM og QC parallelt, derefter RM.
6. Draft-PR, grøn CI, merge, live, e2e mod live.

Der er ingen skema-bump og ingen migrering: nye felter får standardværdier i sanitize. Hver version får spec §2/§3/§5/§9, NEWS og en version-bump.

## Risici
- Balance:
  - aggressive botter mister spillere;
  - formen kan forstærke de stærke hold.

  Begge måles.
- En bot må aldrig stille med 10 mand.
- Hvis-Så eller et gemt plan-skift må ikke sætte en udelukket ind.
- Replay af gamle pakker skal være uændret.

## Verifikation
- Unit og e2e er grønne lokalt og i CI.
- Mutationerne ovenfor bliver røde.
- Golden er uændret, og en eventuel ændring forklares.
- Live:
  - en udelukket spiller står med 🟥 og spiller ikke;
  - kortet viser formordet kun for dit eget hold;
  - træningsskønnet følger spilletiden.

# Tidligere (1/11 21:36): v3.26.0 er LIVE (e2e mod live 351/351). v3.26.1 = PR cvejleaa/TactiVAR#64, head 83569af – CI-suiten er færdig uden fejl
- Rollernes fund er rettet: schedule-testen, referatets løfte i sidste runde (mutation rød) og NEWS. RM: GO efter rettelserne.
## Næste skridt
1. Bekræft check-run'et "test" = success på 83569af. Markér #64 klar, squash-merge med expectedHeadSha 83569af, og afmeld PR-aktiviteten.
2. `git checkout -B claude/busy-hawking-lpk4y5 origin/main` og push med `--force-with-lease`.
3. Vent på version.js 3.26.1 live. Kør derefter e2e mod live fra `$S/mut17` (fetch origin main).
4. Rapportér til brugeren. Markér task #37 in_progress: nr. 41/48/64 via Arkitekt.

# Tidligere (1/11 20:23): v3.26.0 (nr. 39) – CI-suiten er færdig uden fejl på 319e96f (event check_suite.completed); bekræft check-run'et "test" = success, og merge derefter. Herefter v3.26.1 (brugerens to ønsker)

## Kontekst
- v3.26.0, angrib deres svage side:
  - TM har bevist ændringen: 89 + 23 mutanter, og testen af "flere backs" er en adfærdstest.
  - QC: ikke blokerende, og alle forbehold er rettet.
  - RM: GO, og betingelserne er opfyldt.
  - CI-checksuiten var grøn på 7a0b523. 319e96f er en kommentar plus et CLI-argument til measure-side, så motoren er uændret.
- Brugeren skrev to nye ønsker undervejs, som er klar som commit a785263 i worktree `$S/v3261` (detached, på d84cdb1):
  - "Truppen skal genvinde energien mellem 2 sæsoner": `seasonTurnover` sætter `p.freshness = 100` for alle hold. Skader løber videre.
  - "Dit holds løber … giver mig ikke noget brugbart": boksen er fjernet fra begge aviser (matchcenter.js). `RUNNER_BOX_KM` og `showRunner` er væk. measure-column og column-v3212 er tilpasset, og e2e kræver, at boksen ikke vises.
  - Version 3.26.1 med NEWS, og spec §2/§8 opdateret.
  - Mutationstestet: begge rettelser blev røde, da de blev fjernet.

## Næste skridt
1. Tjek, at CI er grøn på 319e96f. Markér #63 klar og squash-merge med expectedHeadSha 319e96f. Afmeld PR-aktiviteten.
2. Kør `git checkout -B claude/busy-hawking-lpk4y5 origin/main` og push med `--force-with-lease`.
3. Vent på, at version.js viser 3.26.0 live. Kør derefter e2e mod live fra `$S/mut17`.
4. v3.26.1:
   - Cherry-pick a785263 oven på den nye main. Ved konflikt i app.js (NEWS) eller version.js beholdes begge.
   - Kør `npm test` og e2e.
   - Kør TM + QC parallelt. Kør derefter RM: ingen skema-bump, og en rollback er sikker.
   - Draft-PR, subscribe, grøn CI, merge, live, e2e mod live.
5. Rapportér til brugeren.
6. Derefter nr. 41/48/64 (spilletid, form, karantæne) via Arkitekt. Bagefter nr. 50–52 (migrering, spørg før deploy).

# Tidligere (1/11 18:13): v3.25.0 (nr. 38, midtbanen giver bold) – PR #62 har grøn CI (head bee8685), klar til merge
- TM har bevist ændringen (41 af 42 mutanter; den sidste er ækvivalent). QC kan lande, og fundene er rettet. RM siger GO.
- Lokalt: e2e 340, unit grøn.

## Næste skridt
1. Markér #62 klar, squash-merge den med expectedHeadSha bee8685 og afmeld PR-aktiviteten.
2. Kør `git checkout -B claude/busy-hawking-lpk4y5 origin/main` og push med `--force-with-lease`.
3. Vent på, at version.js viser 3.25.0, og kør e2e mod live (mut17).
4. Rapportér til brugeren.
5. Derefter nr. 39 (v3.26.0, angrib deres svage side) efter planen i scratchpad/plan-38-39.md med reviewernes rettelser:
   - "Begge" vægtes svagt: GAIN 0,02, CAP 0,12, CHOICE 0,78.
   - Et fast valg giver deres back et lille tillæg, fordi holdet bliver forudsigeligt.
   - Kun styrede kantangreb tælles (cutback og indlæg).
   - Fuldtidsanalysen viser pr. side: antal, vundne og back-navn.
   - Dit felt viser din side med navn.
   - Referatet siger "fra venstre/højre kant".
   - Under fokus Centralt slås valget fra eller forklares.
   - Tekst: "Venstre (LW/LB) / Begge / Højre (RW/RB)".
6. Til sidst nr. 41/48/64 og derefter nr. 50–52 (spørg før migreringen).

# Tidligere (1/11 16:15): v3.24.6 – PR #60 har grøn CI (head 6b6d8c9), klar til merge

- Lokalt: e2e 337/337 og unit grøn efter rettelsen af overskrifts-testen.
- QC kan lande, Test Manager har bevist ændringen, og Release Manager siger GO.

## Næste skridt
1. Markér #60 klar, squash-merge den med expectedHeadSha 6b6d8c9 og afmeld PR-aktiviteten.
2. Kør `git checkout -B claude/busy-hawking-lpk4y5 origin/main` og push med `--force-with-lease`.
3. Vent på, at deploy.yml er grøn og `version.js` viser 3.24.6. Kør derefter e2e mod live fra worktree mut17.
4. Rapportér til brugeren:
   - kantpladser og kæde (3-5-2-målingen);
   - kamprapportens layout;
   - avisens overskrifter;
   - backlog nr. 38–67 fra Hattrick og F4Football.
5. Derefter, ud fra backloggen: brugeren vælger mellem forslagene mærket ⚖/🗄 (spørg). Ellers tages det øverste punkt.

# Tidligere (1/11): wingbacks i 3-5-2 – "uden for position" for kanter (brugerens spørgsmål)

## Kontekst
I 3-5-2 har brugeren to "MID Kant"-spillere (N. Petersen, A. Pedersen) på LWB/RWB. Begge får "⚠ Uden for position (−2,5 %)".
Hvorfor (public/engine/formations.js):
- `ROLE_POSITION`: LWB/RWB → `FB` (Back). LM/RM/LW/RW → `WM` (Kant).
- `NEAR` indeholder `FB-WM`, så en Kant på en wingback-plads er på en naboplads: 97,5 %. En Back ville passe 100 %.
- `lineOfRole(LWB)` = DEF. Pladsen er en forsvarsplads i motoren, også i 3-5-2. Der er ingen særskilt "wingback"-position.

Spillet regner altså med, at en wingback er en back, der går frem. En kant, der går tilbage, får nabo-prisen. Det er konsekvent, men i 3-5-2 bruges kanter ofte som wingbacks i virkeligheden.

## Brugerens præcisering (afløser planen nedenfor): pladsens DYBDE afgør, ikke rollenavnet
Brugeren skrev: "når det er en 3-5-2 opstilling, er det 5 midtbanespillere … derfor skal straffen til midtbanekanter ikke være der. wb er vel mere brugt i en 5-3-2 … Hvis jeg … trækker min wing længere tilbage så han mere er back end midtbanespiller, skal vi også have tilpasset straffen."

### Modellen (`public/engine/formations.js`, ét sted)
- En **kantplads** er rollerne LB/RB/LWB/RWB/LM/RM. Dens naturlige position afgøres af pladsens y. Det gælder også en flyttet plads (`customCoords`):
  - **y ≤ 55:** midtbane-kant. Kant 100 %, Back på naboplads 97,5 %.
  - **y ≥ 60:** back eller wingback. Back 100 %, Kant på naboplads 97,5 %.
  - **55 < y < 60:** overgangszone, hvor begge passer 100 %. Det giver ingen hop, når man trækker en spiller lidt.
- Hvad det betyder for formationerne:
  - 3-5-2 LWB/RWB (y 46) bliver midtbane-kant: dine to kanter passer, og en back får −2,5 %.
  - 5-3-2 og 5-4-1 LWB/RWB (y 64) er stadig back.
  - LB/RB (y 70) og LM/RM (y 36–46) er uændrede.
  - Trækker du en kant ned til y ≥ 60, bliver han back-pladsen, og en kant betaler −2,5 %. En back trukket op til y ≤ 55 betaler også.
- LW/RW (y 22) er uændret Kant. Kæden (`lineOfRole`) og motorens rolle-adfærd er uændret: kun prisen for at stå uden for position flyttes.
- Kode: `fitOf(position, role, y)` med y valgfri (uden y: rollens standard, som i dag). Én hjælper `slotFit(tactics, slot, position)` bruger y fra `slotPosition`. Kaldere:
  - `match.js` l. 29 (`slotFit`);
  - `ui/pitch.js` l. 35 og `ui/lineup-list.js` l. 43 (advarslen);
  - `state/actions.js` l. 88 (tælleren);
  - `career.js` l. 255 og `pickByFit` l. 70 (anker-y – botternes og "Stil op efter position").
- Tekster:
  - `FIT_HELP` (labels.js): "kantpladser: højt (midtbane) = kant, dybt (back/wingback) = back; træk en spiller, og prisen følger med".
  - Advarslen ved brikken nævner pladsens type: "kant-plads" / "back-plads".
  - Spec §5 opdateres.

### Måling og test
- Fingeraftrykket ændres, fordi 3-5-2-botternes LWB-fit ændres. Ændringen forklares i testen, og golden opdateres.
- `tools/measure-position.mjs` og balance for 3-5-2 før og efter (myVsBots, mål pr. kamp). 3-5-2 scorede i forvejen få (1,05/1,94), så den må ikke falde mere.
- Unit-tests:
  - 3-5-2 LWB: Kant 1, Back near.
  - 5-3-2 LWB: Back 1, Kant near.
  - y = 57 (overgangszonen): begge 1.
  - Trukket LM til y 65: Kant near.
  - LW: uændret.
- Mutation: tærsklerne flyttes, og testen skal blive rød.
- e2e: din skærm med 3-5-2 og kanter på wingback viser ingen ⚠. Træk ned → ⚠.
- Roller: Arkitekt springes over (filerne er kendt). Spilfører motor kører på målingen. TM, QC og RM kører på koden. Version 3.24.6 → PR → live.

## (Afløst) Brugerens første valg: "Kant passer også" (v3.24.6)
1. **`public/engine/formations.js` `fitOf`:** en Kant (`WM`) på LWB/RWB giver `FIT.own`. Ét sæt `WINGBACK = {LWB, RWB}` samme sted, og en kommentar med brugerens begrundelse.
   - `ROLE_POSITION` er uændret: LWB/RWB → FB. En back passer stadig 100 %.
   - `pickByFit` beholder kædens ×0,85: en MID-kant på en DEF-plads er stadig næstvalg ved automatisk opstilling. Dermed ændrer botternes opstillinger sig næsten ikke. Det skal måles.
2. **Tekster:**
   - `public/ui/labels.js`: `POSITION_FULL.WM` bliver "Kant (LM/RM/LW/RW, også LWB/RWB)", og FB "Back/wingback (LB/RB/LWB/RWB)".
   - `FIT_HELP` får "wingback (LWB/RWB): back eller kant = egen plads".
   - Spec §5 (ca. l. 183) ⇄ koden.
3. **Tests:**
   - Tilføj til `tests/unit/position-v3200.test.mjs`:
     - `fitOf('WM','LWB') === 1` og `fitOf('WM','RWB') === 1`;
     - `fitOf('WM','LB')` er stadig `near`;
     - `fitOf('FB','LM')` er stadig `near` (symmetrien er bevidst brudt: en back på kant er stadig nabo).
   - Tjek at NEAR-løkken (l. 15) ikke bruger LWB som `roleOf('FB')`.
   - e2e: brugerens skærm i 3-5-2 med en kant på LWB viser ingen "⚠ Uden for position".
4. **Måling:**
   - `tools/fingerprint.mjs` før og efter. Ændres noprose, forklares det med kommentar i `fingerprint.test.mjs`, og golden opdateres.
   - `tools/measure-position.mjs` / `measure-balance` for 3-5-2: myVsBots og formationens mål før og efter.
5. **Roller og udgivelse:** Spilfører motor kører på målingen. TM, QC og RM kører på koden. Version 3.24.6 med NEWS. Derefter PR → CI → merge → live → e2e mod live.

## Verifikation
- Unit og e2e er grønne.
- Mutation: fjern WINGBACK-undtagelsen, og testen skal blive rød.
- Fingeraftryk og balance er målt og forklaret.
- Live: "⚠ Uden for position" forsvinder for N. Petersen og A. Pedersen i brugerens 3-5-2.

## Beslutning (brugeren)
- **A: Lad reglen stå.** Forklaringen ved advarslen kommer til at sige det: "Kant på wingback-plads (LWB/RWB = back): −2,5 % – en back passer 100 %". Det er en ren tekstændring.
- **B: Wingback = både Back og Kant.** `fitOf(WM, LWB/RWB)` = 100 %. Små følger for balancen:
  - Gælder 3-5-2, 5-3-2 og 5-4-1 (BACK5 har LWB/RWB).
  - `arrangeByFit` og botternes opstilling kan flytte kanter dertil.
  - Kræver måling: `tools/measure-position.mjs` og fingeraftrykket ændres. Spec §5 og FIT_HELP skal rettes. QC og Spilfører motor og klub skal køres.

# Tidligere (1/11): kamp-id 3.24.4 – PR #58 har grøn CI og venter på brugerens Firebase-opsætning

## Kontekst
Brugeren har oprettet miljøvariablerne. Spørgsmålet er, hvad der mangler. Status er tjekket uden at ændre noget:
- `FIREBASE_READ_EMAIL` er sat (github-read@tactivar…).
- Nøglevariablen hedder **`FIREBASE_READ_PRIVATE_KAY`** (stavefejl). Den skal hedde `…_KEY`.
- Med værdien mappet til det rigtige navn virker nøglen: Google giver et token (200), og læsning af `matches/K-ZZZZ` giver 404. Servicekontoen og rollen er altså i orden.
- **Authentication er stadig ikke startet** i projektet tactivar: identitytoolkit svarer `CONFIGURATION_NOT_FOUND`. Så kan Anonymous heller ikke være slået til.
- PR #58 (v3.24.4, nøglen i `firebase-config.js`, head 618636c) har grøn CI. Release Manager sagde NO-GO, indtil Anonymous er slået til.

## Det skal brugeren gøre
1. Omdøb miljøvariablen `FIREBASE_READ_PRIVATE_KAY` → `FIREBASE_READ_PRIVATE_KEY`. Værdien skal ikke ændres.
2. Gå til Firebase-konsollen (tactivar) → Build → Authentication → **Get started** → Sign-in method → **Anonymous** → Enable → Save.
3. Skriv "Anonymous er slået til".

## Det gør jeg derefter
1. Tjek, at identitytoolkit ikke længere svarer CONFIGURATION_NOT_FOUND.
2. Markér #58 klar og squash-merge med expectedHeadSha 618636c. Afmeld PR-aktiviteten, og nulstil branchen til origin/main.
3. Vent på, at deploy er grøn og 3.24.4 er live. Kør e2e mod live.
4. Brugeren sender én kamp og giver mig id'et.
5. I en ny session (miljøvariablerne læses ved start) eller her med navnet mappet: `node tools/fetch-match.mjs K-XXXX --replay` → "identisk".

## Verifikation
- Token 200 og læsning 404 (gjort).
- Deploy er grøn med 403-tjekkene.
- Den rigtige kamp hentes og spilles igen identisk.

# Tidligere (28/10 20:40): v3.24.3 kamp-id – PR #57 med grøn CI, klar til merge

## Kontekst
Brugerens ønske: "gemme kampene i firebase med et id, så jeg kan referere til det når vi skal justere på motoren".
- PR cvejleaa/TactiVAR#57, head 03d6a37. CI (`test`: check, unit, regler mod emulator, e2e) er grøn.
- QC, Security Reviewer og Test Manager er kørt, og deres fund er rettet og modbevist med mutationer.
- Release Manager siger GO.
- Lokalt: unit 1244, e2e 335, regler 69.
- `public/firebase-config.js` er `null`. Knappen viser "ikke sat op endnu", og create-reglen kan ikke bruges, så længe Anonymous er slået fra.

## Næste skridt
1. Markér PR #57 klar, og squash-merge den med expectedHeadSha 03d6a37. Afmeld derefter PR-aktiviteten.
2. Kør `git checkout -B claude/busy-hawking-lpk4y5 origin/main` og push med `--force-with-lease`.
3. Vent på, at deploy.yml er grøn (version 3.24.3, ulogget tjek/x = 403, ulogget liste over matches = 403).
4. Vent på, at `version.js` viser 3.24.3 live. Kør derefter e2e mod live fra worktree `$S/mut17`.
5. Tjek med curl, at en ulogget create på `matches?documentId=K-ZZZZ` giver 403.
6. Fortæl brugeren, hvad der er live, og hvad brugeren selv skal gøre, i denne rækkefølge:
   1. Begræns web-nøglen til referrer `tactivar.web.app/*` og API'erne Identity Toolkit, Token Service og Firestore.
   2. Send apiKey. Jeg laver så v3.24.4: `firebase-config.js`, version og NEWS.
   3. Slå Anonymous til.
   4. Læg servicekontoens nøgle i `FIREBASE_READ_KEY`.
   5. Send én kamp. Jeg kører `fetch-match K-XXXX --replay`, og den skal give "identisk".

   Brugeren kan slå Anonymous fra, hvis der skal lukkes hurtigt for afsendelse.

## Derefter
- Målmandens karakter, task #33: vis "🧤 9, heraf 2 svære", og mål svære og lette redninger hver for sig.
- Stabilitet v3.25.0, task #30.
- Hjemmebane.

## Verifikation
- deploy.yml er grøn med begge 403-tjek.
- e2e mod live består.
- En ulogget create og en liste-læsning giver 403.

# Tidligere (28/10 18:28): v3.24.2 – PR #56 med grøn CI, klar til merge
- v3.24.1 er live. Node-vedligeholdet er live (PR #53, deploy grøn med firebase-tools 15.34.1 og Node 22.23.4).
- **v3.24.2 "Sig det, når et par bliver stærkt"**, head 68bad1b:
  - QC, TM og Release Manager har givet GO, og deres fund er rettet.
  - CI er grøn.
  - Lokalt: unit 1212 grønne (RM's kørsel), e2e 296/296.
- Næste skridt:
  1. Markér #56 klar.
  2. Squash-merge med expectedHeadSha 68bad1b.
  3. Afmeld PR-aktiviteten.
  4. Nulstil branchen til origin/main.
  5. Vent på, at version.js viser 3.24.2, og kør e2e mod live.
  6. Rapportér til brugeren.
- **Derefter:**
  - Dependabot-PR'erne #54 (setup-node 5 → 7) og #55 (checkout 5 → 7): læs dem, se CI, og vurdér dem. De rører deploy-kæden, så Release Manager skal kigge på dem før merge.
  - Backlog: flyt nr. 1 til Lavet. Næste punkt er nr. 1 "Stabilitet skal kunne mærkes", brugerens valg. Det er M-størrelse og større, så det går gennem Arkitekt og derefter QC (opus), Spilfører klub og motor.
  - Efter stabilitet: hjemmebane, også brugerens valg.

# Tidligere (28/10 15:45): v3.24.1 – ungdomsspillere kan sælges samme dag (backlog nr. 1), bygget, IKKE committet
## Kontekst
Spilførernes rundtur 2 (backlog-PR #51, CI grøn, ikke merget) fandt en pengemaskine:
- Tag ungdomstilbud ved sæsonslut, sæt dem til salg og tag buddene.
- Det giver ca. 725.000 kr. pr. sæson uden løn og uden kampe.
- Årsag: `takeYouth` satte ingen `lastMove`.

## Ændringen (lokalt, ukommitteret)
- `public/state/actions.js`: `takeYouth(team, id, league)` sætter `y.lastMove = windowOf(league)`. Ligaen er påkrævet, og alle kaldere er opdateret: `app.js`, to tests og `tools/measure-lifecycle.mjs`.
- `public/engine/season.js`: dit tvungne optag op til 18 får samme karantæne. Botternes ungdom er urørt.
- `public/engine/transfers.js`: karantæne-teksten hedder nu "kom til klubben i dette eller sidste vindue …", fordi den også gælder ungdom.
- Ny test `tests/unit/youth-quarantine-v3241.test.mjs` (2 tests, grøn): 4 seeds, salgsforsøget afvises, karantæne i vindue w og w+1, fri i w+2. Det tvungne optag er dækket, og botternes ungdom er uændret.
- `version.js` er sat til 3.24.1, med NEWS og spec (Transfers).
- Lokalt: e2e 289/289 og unit 1190 grønne. 2 tests er røde: `transfers-v3211-gaps.test.mjs:50, 90, 94` matcher `/skiftede klub/`.

## Resterende trin
1. Ret de tre regex i `transfers-v3211-gaps.test.mjs` til `/kom til klubben/`. Kør derefter `npm test` til 0 fejl.
2. Commit på `claude/busy-hawking-lpk4y5` oven på #51-commits. Merge først #51, så den nye PR kun bærer rettelsen.
3. Mutationstest selv på committet kode:
   - fjern `y.lastMove` i `takeYouth`;
   - fjern den i `seasonTurnover`.

   Begge skal give rødt.
4. Kør Test Manager og QC parallelt. Security er ikke nødvendig, fordi ændringen ikke rører, hvem der ser hvad.
5. Kør Release Manager. Skemaet er uændret, og `lastMove` er allerede et felt.
6. Draft-PR, grøn CI, merge, live 3.24.1, e2e mod live og rapport.
7. Derefter backlog nr. 2: "Sig det, når et par bliver stærkt".
8. Spørg brugeren om de to punkter mærket ⚖: nr. 3 "Stabilitet skal kunne mærkes" og nr. 17 "Hjemmebane".

# Tidligere (28/10 ca. 12:10): v3.24.0 er LIVE – e2e mod live 288/288
- PR #49 er merget (ea6059f), og branchen er nulstillet til origin/main.
- Næste skridt, uden at vente på et nyt ønske (CLAUDE.md "Backloggen"):
  1. `docs/backlog.md`:
     - Flyt nr. 1 (samspil) til "Lavet" som v3.23.0 + v3.24.0.
     - Tilføj nye punkter:
       - "Skadet starter: banen viser hans samspilsstreger, kampen afløserens";
       - "Kæder: samspil i hele kæden, ikke kun par";
       - "Samspil i Hvis-Så-skift";
       - "Dobbelte isOwn-vagter samles ét sted" (TM).
     - Commit (kun dokumentation), push, draft-PR, CI og merge.
  2. Kør `/spilfoerere`: de fire Spilførere gennemgår spillet efter den store udgivelse og fylder "Næste".
  3. Tag derefter det øverste punkt i "Næste" (i dag nr. 2, "overskrift om din kamp") gennem den sædvanlige arbejdsgang: Arkitekt → QC/Spilførere på planen → kode → TM/QC → RM → PR → live.

# Tidligere (28/10 11:13): PR #49 (v3.24.0) – CI grøn, mergeable, klar til merge
- Head 202519c. Test Manager og Release Manager (GO) er kørt, deres fund er rettet, og der er ingen blokerende fund.
- Næste skridt:
  1. Markér PR #49 klar.
  2. Squash-merge med expectedHeadSha 202519c.
  3. Afmeld PR-aktiviteten og slet check-in-påmindelsen trig_01GjpbF3Tuj77m9TbA3xEgop.
  4. `git checkout -B claude/busy-hawking-lpk4y5 origin/main` og push med `--force-with-lease`.
  5. Vent på, at version.js viser 3.24.0. Kør derefter e2e mod live og rapportér.
  6. Opdatér backloggen: nr. 1 → Lavet, og skriv kendte begrænsninger ind. Kør derefter `/spilfoerere`.

# Tidligere: PR-B (v3.24.0) er bygget og pushet (8dab2be), afventer Test Manager
## Kontekst
PR-A (v3.23.0) er live. PR-B (virkning og visning af samspil) ligger på `claude/busy-hawking-lpk4y5`:
- Commits: aeab8cf (virkning), 904804e (visning), 8dab2be (QC-rettelser).
- Lokalt: 1172 unit-tests består. E2e består (269–270 tjek; antallet svinger med den tilfældige liga, men det er de samme tjek).
- QC er færdig. Dens blokerende fund ("bedste makker" valgt blandt alle par) er rettet, og fund 2, 3, 4 og 7 med.
- Test Manager blev afbrudt, fordi containeren genstartede. Den har intet resultat.

## Resterende trin
1. **Test Manager igen** på 8dab2be. Den mutationstester i sin egen worktree og skal bl.a. dække QC's testhuller:
   - byt-beskedens eksakte tekst gennem appen (`withChem`);
   - Klub-linjerne `.market-chem` og `#for-sale-chem` i e2e;
   - effektbåndet med en øvre grænse, så et halveret `CHEM_EFFECT` giver rødt (spænd målt 0,11–0,21);
   - bestPartner-rettelsen modbevist (den gamle løkke over hele tabellen skal give rødt).
2. Ret og modbevis TM's fund. Commit og push.
3. **Release Manager** (ingen skemaændring, kun visning + virkning; tjek efter deploy).
4. Draft-PR → subscribe → grøn CI → klar → squash-merge med expectedHeadSha → afmeld → nulstil branchen til origin/main.
5. Vent på `version.js` = 3.24.0, kør e2e mod live, fortæl brugeren, hvad der er live.
6. Backlog: flyt nr. 1 (samspil) til "Lavet". Skriv kendte begrænsninger ind (skadet starter: banen viser hans streger, kampen afløserens; kæder). Kør `/spilfoerere` efter den store udgivelse.

# Tidligere: PR-A (v3.23.0) er klar til merge
- PR cvejleaa/TactiVAR#48, head 865eb20. CI er grøn. Rollerne har set PR'en:
  - **QC:** fund rettet.
  - **Test Manager:** fund rettet. Kampe og liga er identiske over 3 sæsoner, og 72 af 86 mutanter blev dræbt.
  - **Release Manager:** GO. Punkt A (synlig backup) er rettet med en kort besked ved migreringen 8 → 9 og et e2e-tjek.
- Ændring siden den godkendte plan, valgt af brugeren: samspil måles "i forhold til ligaen" (`leagueMetadata.chemRef`). Desuden er der et træk, LEAK 0,035, så faste par ender på ca. 86 og ikke 100. Seed 78 = botternes målte ligevægt (79,6).
- Næste skridt:
  1. Markér PR #48 klar og squash-merge med expectedHeadSha 865eb20. Afmeld derefter PR-aktiviteten.
  2. `git checkout -B claude/busy-hawking-lpk4y5 origin/main` og push med `--force-with-lease`.
  3. Vent på `version.js` 3.23.0, og kør e2e mod live.
  4. Fortæl brugeren, hvad der er live.
- Tilbagerulning er ikke en ren vej (v3.22.1 kan ikke læse skema 9). Fejl rettes fremad.
- **Derefter PR-B (v3.24.0):**
  - Virkningen måles mod `chemRef` med en skala, der er nogenlunde lige stor på begge sider. QC: med fremmede = 30 og ref ≈ 80 skal nævneren være `ref − 30` på minus-siden og `86 − ref` på plus-siden, så et fast par kan mærkes.
  - Hooks i løbsduellen (markør) og i opbygningen. Hver måles for sig med fortegn, og myVsBots skal ligge inden for ±0,05 for både passiv og aktiv køber.
  - Visningen som nedenfor.
  - Kør QC og Spilførerne på det konkrete PR-B-udkast, før koden skrives.

# Samspil (backlog nr. 1) – rettet plan efter Arkitekt, QC (opus) og Spilførerne for klub, motor og UI

## Kontekst
Brugerens ønske: en tidligere landstræner sætter vægt på, "hvordan spillerne arbejder/tænker sammen". Brugeren har godkendt, at samspil bygges først, og at gemmet migreres (med backup).

Arkitektens plan (scratchpad/plan-samspil-B.md) blev gennemgået af fem roller, og der kom tre afgørende fund:
- **Motor (målt, 1200 kampe pr. linje):**
  - Offside-fælden afgøres først, når presset allerede har vundet bolden. Et indspillet par der ville KOSTE ca. 0,13 mål/kamp. Fælden er desuden allerede i dag bedst slået fra; det står nu i backloggen som nr. 4.
  - Opbygnings-hooken var 2–3 gange for stejl og skæv: et nyt par −0,30, et fuldt par +0,04. Det ville blive en transferafgift.
- **Klub og QC:** med lineær vækst er faste par fulde ved runde 7. Derefter er stabilitet værdiløs, rotation er gratis, og udgangspunktet (BASE) ender ved ca. 85, så det hele bliver en ren afgift på køb.
- **QC og UI:** prisen for et køb vises ikke dér, hvor man køber. Desuden har "stærk" to grænser, seedet og nabolisten dækker ikke de samme par, og beskeden ved byt lander uden for skærmen på mobil.

## Modellen (`public/engine/chemistry.js`, ét sted)
- **Gemmet:** `team.chemistry = { "idA|idB": [samspil 0–100, sidste fælles runde] }`. Ordet er "samspil" overalt.
- **Nabopar:** par efter afstand i `FORMATIONS` (≤ 29). Målmanden indgår ikke. Hver markplads har mindst én nabo; findes ingen inden for 29, bruges den nærmeste. Det bevises med en golden-test over alle formationer.
- **Aftagende vækst (Klub):** `samspil += K · (100 − samspil) · fælles minutter/90`, start K ≈ 0,12.
  - En ny mand når holdets niveau på ca. 8 kampe.
  - En fast kerne vokser mod 99 over ca. 2 sæsoner.
  - Rotation koster hele sæsonen (84 mod 93).
- **Forfald:** kun efter 3+ runder uden fælles minutter, og ved salg/køb (parret slettes). Aldrig pr. hvilet kamp.
- **Udgangspunktet:**
  - **Seed:** ALLE par af markspillere i truppen sættes til BASE, både i en ny liga og ved migreringen.
  - **Fremmede:** `STRANGER = BASE − 30`. Prisen for et køb er altså kendt og begrænset.
  - **Kalibrering:** BASE måles som ligevægten for botternes rotation over 4 sæsoner. Målingen udskriver også, hvor stor en andel af parrene der ligger på 95 eller derover.
- **Virkning, symmetrisk omkring BASE:** `(samspil − BASE) / (samspil < BASE ? 30 : 100 − BASE)` ∈ [−1, 1], så et fremmed og et fuldt par flytter lige meget.
  - **Forsvar (Motor):** markørens værdi i løbsduellen ved centrale løb (match.js ca. 1491) får `+ RUN_CHEM · skala` ud fra hans nabopar. Et nyt midtstopperpar bliver løbet i ryggen. Fælden får ingen samspilsvirkning.
  - **Opbygning:** `build += BUILD_CHEM · skala` med BUILD_CHEM ≈ 1.
  - Der bruges intet ekstra rng-træk. Vagten er fingeraftrykket ved BASE (uændret). QC: at tælle rng-kald beviser intet og droppes.
- **Måling (`tools/measure-chemistry.mjs`):**
  - hver hook for sig, med fortegn: net(fuldt) > net(BASE) > net(fremmed);
  - skævhed højst 1,5;
  - samlet spænd fra fremmed til fuldt 0,10–0,20 mål/kamp;
  - myVsBots inden for ±0,05 for både en passiv profil og en aktiv køber (1 starter pr. vindue);
  - gemmets størrelse.
  - Båndene i testene skrives, så den gamle værdi (0) giver rødt.

## Visningen (lander SAMMEN med virkningen)
- **Ét sæt bånd (`CHEM_BANDS`) for alle tekster og farver:** fremmede · finder hinanden · spillet sammen · stærkt. Salgsadvarslen bruger "stærkt", samme grænse som stregen.
- **Taktik-banen:**
  - Streger mellem nabopladser i et SVG-lag med `pointer-events:none` under brikkerne. Tykkelse og stiplet linje viser båndet, ikke kun farve.
  - Under banen én linje: "Samspil: tyk = stærkt · tynd = finder hinanden · stiplet = fremmede – Svagest lige nu: Midtstopper-parret 23".
  - Kun på dit hold.
- **Ved byt:** beskeden står ved spillerlisten (`#pick-msg`) og sættes EFTER handlingen. Den viser højst 2 par, det største fald først, fx "Midtstopper-parret: samspil 78 → 48 (fremmede)".
- **Køb:** én linje i kortets købeboks (`#buy-terms`): "Ny i truppen: fremmed for alle – ca. 8 kampe før han har spillet sig ind".
- **Salg:** advarslen "⚠ stærkt samspil med #4 X og #6 Y" står ved "Til salg"-fluebenet på kortet og ved Sælg/Fritstil.
- **Spillerkortet (kun dit hold):**
  - "🤝 Bedste makker: #6 Y (samspil 84)" vises kun over BASE. Ellers står "ingen særlig makker endnu", eller "ny i truppen" for en fremmed.
  - Kortet lister også hans par med de nuværende naboer. Det er sådan, tallene kan læses på en telefon.
- **Referatet:**
  - Én sætning i fuldtidsanalysen med årsagen, ikke udfaldet: "Midtstopper-parret har kun samspil 23 – det gav plads til løb i ryggen".
  - En positiv sætning, når et stærkt par holdt.
  - Ingen klummetekst; QC: den ville gentage sig og bære et privat tal.
- **Parnavne:** fra én tabel (`PAIR_LABEL`), med én stavemåde: "Midtstopper-parret".

## Rækkefølge
1. **PR-A, data uden virkning** (v3.23.0, skema 8 → 9):
   - `chemistry.js`, seed i generatoren, migrering med backup, sanitize med loft, opdatering i `commitRound`, pruning i `move()`/`seasonTurnover`, samt `measure-chemistry base` til at låse BASE.
   - Fixture fra v3.22.1 og indlæsningstest. Testen beviser også, at hvert nabopar i fixturet har samspil = BASE.
   - Migreringsbeskeden nævner ikke samspil endnu.
2. **PR-B, virkning og visning** (v3.24.0): hooks, UI, tekster og spec §5/§3/§9. QC og Spilførerne gennemgår koden.
- Hver PR går gennem Test Manager, QC og Release Manager, derefter PR, grøn CI, merge og live.

## Verifikation
- Fingeraftrykket er uændret i begge PR'er (ved BASE).
- `measure-chemistry`-båndene holder, og myVsBots for den passive og den aktive profil ligger inden for ±0,05.
- Migreringstesten mod fixturet består.
- e2e tjekker streger og linjer på Taktik, købelinjen, salgsadvarslen og kortets makker.
- Til sidst kører `/saesongennemgang` (klub og motor).
