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

## Kendte accepterede lækager (brugerens valg – skal ikke "lukkes")
- v3.16 kampens spor + 2D-afspilning: begge holds positioner for alle (§3). Heat map'ets grove modstander = præsentationsvalg.
- v3.16 UBENÆVNT konsekvens (rapporteret): sporet røber modstanderens VUNDNE løb uden bold pr. spiller (løberen står RUN_STEP
  12 længere fremme i afslutnings-øjeblikket end i samme ticks grundbillede; match.js ~1065 `seen = livePositions(..rctx)`).
  PoC: 43 af 64 private freeRunsWon fundet, 0 falske (12 seeds × 6 runder). Modsiger kommentaren match.js ~1048.

## PoC-mønstre der virker
- Motor-PoC: createLeague(createRng(seed)) + playRound/commitRound; dit hold = `!t.isBot`; modstanderside = 'h'/'a'.
- Rigtig browser: playwright-core fra node_modules, Chromium /opt/pw-browsers/chromium-1194/chrome-linux/chrome,
  tools/serve.mjs startServer(egen port), addInitScript sætter localStorage én gang (sessionStorage-flag), klik #tab-kamp,
  saml pageerror/dialog/requests. ~1 min for 5 varianter.
- Aflæsning af skjult tilstand fra positioner: sammenlign øjeblik mod samme ticks grundbillede (y i livePositions afhænger
  ikke af ballX) – forskydninger på præcis en konstant afslører motorens interne valg.
