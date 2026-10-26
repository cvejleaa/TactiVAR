# Security Reviewer – hukommelse

## Trusselsbilledet (trin 1, gældende indtil login i trin 2)
- Alt ligger i browseren (localStorage `tactivar_save`); `public/` laver INGEN netværkskald (grep fetch/firestore/XHR = 0),
  firestore.rules = deny-all. "Anti-spionage" er derfor visuel: en bruger kan altid læse alt i devtools. Fund om hvem-ser-hvad
  er sjældent blokerende i trin 1 – men skal navngives i docs/spec.md §3, så trin 2 ved hvad der skal gøres seer-afhængigt.
- Realistisk angriber nu: (a) spilleren selv, der aflæser en bots skjulte evner/indstillinger via UI'en; (b) en delt/importeret
  gemt fil (parseSave -> normalizeLeague). lastRound.matches[] normaliseres IKKE (events, ratings, trace) – en ødelagt fil
  vælter Kamp-fanen. Ikke vedvarende: app.js:40 nulstiller fanen til Trup ved indlæsning, og næste runde erstatter lastRound.
- XSS: DOM bygges kun med h() (textContent, setAttribute, CSSOM-style, dataset). Ingen HTML-sinks i public/ (innerHTML,
  insertAdjacentHTML, eval, cssText = 0). Bekræftet i Chromium v3.16: `<img onerror>` i et spiller-id = inert data-pid,
  `url(...)` i en koordinat afvises af CSSOM (style.left = ""), 0 eksterne kald.
- JSON-mulige crash-felter: objekt med egen `toString: 1` (-> "Cannot convert object to primitive" i dataset/String()),
  ikke-liste hvor koden itererer, tal uden for 0–100/NaN som array-indeks (heatGrid g[NaN]).

## Faste vagter at efterprøve (mutér i en kopi: `git archive <sha> | tar -x -C scratch/wt`, symlink node_modules)
- Klummen: tests/unit/column-canary.test.mjs har POSITIV tilladelsesliste på kampens nøgler -> ethvert nyt felt på kampen er
  automatisk forgiftet. Bevist v3.16: publicFacts læser m.trace -> rød 'KANARIE: trace'.
- "Kun efter slutfløjt" (matchcenter.js `mc.playing ? null : replayEl` og 🎬-knappen): begge dræbes af replay-ui.test.mjs.
- Private karakterfelter: visibility.js RATING_PRIVATE_FIELDS (freeRuns/freeRunsWon, km, topfart, HI, karakter).
- v3.19: viewTeam er TILLADELSESLISTE (TEAM_PUBLIC_FIELDS; tactics kun baseFormation/lineupSlots/customCoords). Spillerlistens
  sorteringsvagt = lineup-list.js listRows `sortCol` (dræbes af ui-v3190 test 2 – bevist). renderPublicClub kaster ved nøgler uden
  for TEAM_PUBLIC_FIELDS – men kun TOPNIVEAU, og funktionen får rå `league` (kan nå league.teams[..].cashBalance uden om vagten).
- e2e "ingen kasse" på klubsiden (run.mjs ~328: `replace(/\D/g,' ').split(' ').includes(String(cash))`) er TOM: kr() skriver
  "5.000.000 kr." -> kan aldrig matche. Bevist v3.19: kassen vist på siden -> ✅. Tjek om den er rettet.

## Robusthed (delt/importeret gem)
- v3.19 (A): én render-fejl gav hvid side uden faner. LUKKET senere: render() har nu try/catch -> renderFailed (bekræftet v3.21:
  duels {"toString":1} i gemt karakterlinje -> "Siden kunne ikke tegnes", 6 faner, ⚙ Admin kan nås). Fjendtlige tal-felter i
  lastRound.matches[].ratings (freeRuns, duels …) vælter stadig Kamp-fanen (matchcenter.js ~100-101 template-literal) – kendt klasse.
- sanitize.js typetjekker IKKE valueStars/publicStars/age/careerGames/roleTier eller league.trainingReport (gains: 5 -> Trup vælter,
  training.js:13; kan reddes via Admin, da træningstabellen bygges dovent).

## v3.21 (bevægelse, nearPick, duels, driftSeed) – efterprøvet
- driftSeed (match.js resultat, GEMMES i lastRound) = kamp 0's FØRSTE rå rng.next() i runden (prepareSide trækker intet) ->
  brute force 2^32 mulberry32 på 15 s -> 4 kandidater, én genskaber hele runden. Sporet alene bestemmer også driftSeed
  (par-forskelle i x for centrale spillere; rigtigt seed fundet, 0 falske i 2^20-vindue; naiv JS ~27 t for 2^31). Ufarligt i trin 1
  (gemmet rummer alt), men trin 2: rundens seed = hver lodtrækning kendt -> hvert offentligt udfald en ulighed på skjulte evner.
  Kommentaren "røber intet" er forkert. Fix: bevægelsens seed fra en UAFHÆNGIG kilde (+ server-salt i trin 2).
- nearPick vægt ff/d²: STA-signalet i VALGET er forsvindende (STA 4 mod 18: Δ 0,0085 pr. valg, ~2400 kampe selv hvis alle valg sås).
  Det store STA-signal i referatet er den GAMLE pres-duel (stamina·0,35): navngivne pres-sejre 0,34 -> 1,02 pr. kamp (også v3.20.2).
- Spredningen (driftAt) har ingen spiller-input; trace-oracle rekonstruerer alle grundbilleder af taktik + driftSeed + udfald.
- duels/duelsWon: viewRatingEntry-strip + isOwn-celle (to vagter, ingen test). Mutation af BEGGE: 382 unit + 254 e2e grønne,
  browser viser 🤼 for alle modstandere. Tjek om der er kommet en td.duel-check som 'fri'-checken (e2e ~474).
- Grenen flyttede sig to gange under v3.21-gennemgangen (3003be3 -> 036ca77 -> 02eaa61).

## Kendte accepterede lækager (brugerens valg – skal ikke "lukkes")
- v3.16 kampens spor + 2D-afspilning: begge holds positioner for alle (§3). Heat map'ets grove modstander = præsentationsvalg.
- v3.16 UBENÆVNT konsekvens (rapporteret): sporet røber modstanderens VUNDNE løb uden bold pr. spiller (løberen står RUN_STEP
  12 længere fremme i afslutnings-øjeblikket end i samme ticks grundbillede; match.js ~1065 `seen = livePositions(..rctx)`).
  PoC: 43 af 64 private freeRunsWon fundet, 0 falske (12 seeds × 6 runder). Modsiger kommentaren match.js ~1048.
- Afspilning: tabellen (og regnearkets ⭐ Vurd/alder/Værdi) er allerede opdateret under afspilning – brugerens valg. Klubsiden
  skjuler transfers/pensioner under afspilning fra 9d2faae (som Liga). Trupstørrelsen ses (som i Trup).
- Trin 2: `isOwn = !team.isBot` (app.js ~273) – alle ejer-flader (træning, Løn/rd, egen klub) følger den; skal være ownerUid.

## PoC-mønstre der virker
- NON-INTERFERENCE (stærkest til hvem-ser-hvad): byg gem A i node (createLeague+playRound/commitRound, serialize), B = A med
  botternes OWNER/SECRET-felter + kasse/regnskab/faser/listed forvansket; kør SAMME UI-trin i Chromium på A og B (sortér eget
  hold på skjulte kolonner, skift til bot, Taktik/Trup/Klub, klik) og diff #controls+#app outerHTML. Normalisér gem-tiden.
  Kontrol: fjern en vagt -> diff skal komme (lineup-list sortCol -> 59 forskelle). (Scratchpad-scripts overlever ikke sessionen – byg dem igen efter denne opskrift, ~80 linjer.)
- Grenen kan flytte sig under gennemgangen (v3.19: 709a3bf -> 9d2faae midt i) – tjek `git log` før rapporten, og kør igen.
- Motor-PoC: createLeague(createRng(seed)) + playRound/commitRound; dit hold = `!t.isBot`; modstanderside = 'h'/'a'.
- Rigtig browser: playwright-core fra node_modules, Chromium /opt/pw-browsers/chromium-1194/chrome-linux/chrome,
  tools/serve.mjs startServer(egen port), addInitScript sætter localStorage én gang (sessionStorage-flag), klik #tab-kamp,
  saml pageerror/dialog/requests. ~1 min for 5 varianter.
- Aflæsning af skjult tilstand fra positioner: sammenlign øjeblik mod samme ticks grundbillede (y i livePositions afhænger
  ikke af ballX) – forskydninger på præcis en konstant afslører motorens interne valg.
- Instrumentér en kopi af match.js (python str.replace + assert) med `globalThis.__np?.push(...)` i den funktion, der vælger – så
  kan valgets signal måles direkte (øvre grænse for angriberen). KONTROL: forstærk den mistænkte faktor (fx ff**25) -> skal ses.
- STA-angreb: samme seeds, ÉN bot-spillers STA 4 mod 18, sammenlign det brugeren ser (navne i referatet) – og samme kørsel på
  forrige version (git archive) for at skille nyt fra gammelt. Kontrol for spor-statistikker: pres-niveau LOW mod HIGH.
- Rundens seed fra et gemt rng-output: loop 2^32 med mulberry32-tempereringen (~15 s i node), verificér ved at genspille runden.
- Browser: alle rundens kampe via `#match-cards .matchcard:nth-child(i)`; tæl td.duel/🤼 pr. ratings-tabel og pr. fane.
- Hele unit-suiten tager > 10 min ved parallelle kørsler: kør i baggrund med lang timeout, eller kun filer der importerer modulet.
