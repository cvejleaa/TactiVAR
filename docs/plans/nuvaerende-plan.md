# NU (6/11): v3.32.2 – VAR-øjeblikket + spilfornemmelse (køens punkt 1; brugeren 6/11: "Lad os komme videre")

## Context
- Brugerens valg 5/11 (eksterne forslag): "VAR Monitor: ærlig ramme nu" – ingen taktisk årsag, for motoren bruger ikke taktik i VAR – og "Game feel".
- I dag: `varbanner` (`ui/matchcenter.js:352`) står ét tick (420 ms). Et annulleret mål, et rødt kort eller dit mål er en linje som alle andre.
- Motoren gemmer kun `events[].var = { kind, verdict }` (`engine/match.js:680, 1055, 1065, 1464, 1474`) – og kendelsen står allerede på tjek-hændelsen. Navne findes kun i teksten.
- Måling (scratchpad, skal over i `tools/measure-duels.mjs … var`): 0,48 VAR-hændelser pr. kamp, 0,15 annullerede mål pr. kamp, 60 % af kampene uden VAR. Andelen af DINE kampe med et VAR-øjeblik måles og skrives i spec (QC: tallet "hver 4.–5." var ikke målt).

## Plan-gennemgangen (Arkitekt, QC opus, Spilfører UI, Spilfører motor – 6/11), indarbejdet
### D1 Motor – kun data (`engine/match.js`, `tools/fingerprint.mjs`)
- `var.cast = { checked, line?, victim?, other? }` med spiller-**id'er** (ikke navne: `fixNameTexts` (`storage.js:157`) retter kun objekter med id/shortName; navne slås op i `m.ratings.home/away` som `playerSpan`, `matchcenter.js:333`). Pr. gren (Spilfører motor):
  - Mål/OFFSIDE (`:680`): `checked = o.off` (ikke nødvendigvis skytten), `other = o.other` (kun da er han "forreste"), `line = defender` (den forsvarer, duellen afgøres mod – IKKE en ny beregning).
  - Mål/FOUL (`:680`, også tvunget ved hjørne/cutback `noOffside`): `checked = skytten`, `victim = defender`. Ingen `line`.
  - Straffe/OFFSIDE (`:1065`): `checked = o.off`, `line = fouler`. Straffe/DIVE: `checked = fouled`. Straffe/AWARDED (`:1055`): `checked = fouled`, `victim`-feltet bruges ikke; `line` ingen; fælderen som `fouler`.
  - RED (`:1464`, `:1474`): `checked = fouler`.
- Ingen `rng`-kald, ingen ny `rng.pick`: felterne tages fra variabler, der findes.
- `cast` i `VIEW_KEYS` (`tools/fingerprint.mjs:12`): `NOPROSE_400`/`GOLDEN_TRACES_20` står STILLE (beviset for "ingen ny tilfældighed"); `GOLDEN` (`trace-golden.test.mjs:13`) og `GOLDEN_RESULTS_400` (`trace-golden-broad.test.mjs:24`) opdateres med kommentaren "kun visning (var.cast) – noprose uændret".
- `sanitize.js`: ugyldig `var.cast` (ikke-streng id) smides væk ved import. Gamle kampe uden `cast` → log uden navne.
- Udvid `tests/unit/var-check.test.mjs` (`after()`, regex-parserne): `cast.checked`/`line` matcher navnene i teksten; hjørnemål med tjek: `kind === 'FOUL'` og ingen `line`.

### D2 Rammen + loggen (`ui/varmoment.js` ny, rene funktioner; `ui/matchcenter.js`)
- `varSequence(events, i)`: tabel pr. `kind`/`verdict` (ikke "næste GOAL"):
  - to-trins: VAR_CHECK → GOAL/HEADER_GOAL (STANDS) eller VAR_NO_GOAL; VAR_PEN (STANDS/OVERTURNED) → straffesparket (GOAL/SAVE) eller VAR_NO_PEN; VAR_RED (CONFIRMED/DOWNGRADED) → RED eller VAR_NO_RED. Kendelses-hændelsen er den næste hændelse.
  - ét-trins: VAR_PEN/AWARDED og VAR_RED/UPGRADED er selv kendelsen → INGEN pause.
- `varLog(seq, reached)`: linjer af kind/verdict/cast + navne fra ratings – ALDRIG `ev.text` (heller ikke for gamle kampe), aldrig taktik, cynisme, teater eller "fælden virkede". Kendelseslinjen KUN når kendelses-hændelsen er vist (`reached`). Ord (motorens egne):
  - "📺 VAR tjekker: offside?" / "skub i opspillet?" / "filmning?" / "rødt kort?"
  - "#9 Hansen tjekkes for offside" (+ "– forreste mand", kun når `other`); "afgjort mod #4 Bergs placering"; ved FOUL "mod #4 Berg"
  - "❌ Målet annulleret" / "✅ Målet står" / "✅ Straffen står" / "❌ Ingen straffe" / "🟥 Rødt står" / "🟨 Rødt bliver gult" / "📺 Straffe til …" / "🟥 Gult bliver rødt"
- Test "intet uden for data": en Proxy-hændelse kaster ved adgang til andet end type/var/isHome (QC) – loggen kan ikke læse teksten.
- Rammen er et overlay over stillingen og tidslinjen (skubber ikke siden), `role="status"`, puls på "VAR"-mærket. Den står fra tjekket til kendelsen + 5 tick (≈ 2 s – Spilfører UI: 2 tick var for kort til en linje). Under tjekket vises stillingen nedtonet med "?", fordi målet allerede er talt op (`hG++` før `addEv`).
- Fast `<div id="live-status" aria-live="polite">` i `index.html` (ved `#fejlboks`): skrives kun ved tjekket og ved kendelsen.

### D3 Pausen (`app.js`)
- I det eksisterende `setInterval` (`app.js:813`): `mc.hold` tick springes over. `VAR_HOLD_TICKS = 4` (≈ 1,7 s ekstra; tjek→kendelse ≥ 1500 ms mod før 420 ms). Ingen ekstra `setTimeout` – så ⚡/`finishPlayback`, `openMatchCenter` og `dropMatchView` stopper den af sig selv (QC: tjek alle tre).
- Knappen "Vis kendelsen ›" i rammen (`mc.hold = 0`), ≥ 44 px ved 390 – og `#skip` også ≥ 44 px ved 390 (i dag 23 px). Fokus gendannes efter id.

### D4 Spilfornemmelse (CSS + klasser)
- Rystelse af stillingen ved dit holds ENDELIGE mål (GOAL/HEADER_GOAL efter en evt. kendelse – aldrig på VAR_CHECK) og ved det endelige RED (aldrig VAR_RED/VAR_NO_RED). Intet selvmål i motoren.
- Flash ved annulleret mål: rød, når DIT mål annulleres; grøn, når modstanderens (samme farve = samme betydning, Spilfører UI/QC).
- Én gang pr. hændelse: et `Set` af viste fx-indeks i `mc` (et filterklik under afspilning tegner igen i samme tick og må ikke afspille igen) – ren funktion `fxFor(last, idx, seen, own)` med unit-test. Animationer ≤ 400 ms, så `renderMc` (genskaber hvert tick) ikke skærer dem over; pulsen med negativ `animation-delay` fra `mc.varT0`.
- `@media (prefers-reduced-motion: reduce)`: ingen rystelse, ingen puls; flash → statisk kant i samme farve. Første `@keyframes` i style.css.

### D5 Lyd (`ui/sound.js`, Web Audio uden filer)
- Fløjt ved kampstart og slutfløjt, bip ved VAR-tjek, kort jubel ved dit mål. FRA som standard; nøgle `tactivar_sound` (try/catch som `state/replay.js`) – ikke i ligaen, intet skema-bump, ingen fixture.
- Kontakten 🔇/🔊 i Match Centers række ved ⚡ (`matchcenter.js:339`), ≥ 44 px ved 390, synlig under og efter afspilning – IKKE i ⚙ (CLAUDE.md 0b: ⚙ er "sjældne og farlige handlinger", `app.js:428`). Én kontakt.
- `AudioContext` oprettes/genoptages i klikket (▶ Spil runde, kontakten) – ellers holder autoplay-reglen den tavs. Ingen lyd, når man ikke står på Kamp. ⚡ stopper ventende lyde, højst ét slutfløjt. Mangler `AudioContext` → ingen lyd, ingen fejlboks.

### D6 Måling, spec, noter
- `tools/measure-duels.mjs … var`: + andel kampe uden VAR og andel af DIT holds kampe med et VAR-øjeblik.
- Spec §5 "VAR som i virkeligheden" (`docs/spec.md:327-353`: `var.cast`), §5 live (`:482`: pausen), §10b (rammen, lyden). NEWS, `version.js` 3.32.2, backlog.
- **Bevidst udeladt:** loggen står kun live – efter fløjt (og efter ⚡) læses VAR i referatets egen linje, som allerede navngiver spillerne. Firestore-regler/upload: `firestore.rules:19` ser kun størrelsen; ca. 60 B pr. VAR-hændelse.

## Verifikation
- unit: varSequence/varLog på tvungne rigtige kampe (`forced()` i `var-check.test.mjs`) i hver gren (annulleret offside, offside står, foul, hjørne uden line, straffe står/dive/awarded, rødt confirmed/downgraded/upgraded); kendelsen står IKKE på tjek-tick'et; ét-trins uden pause; Proxy-testen; fxFor én gang og rigtig farve; hold-tælleren (tjek→kendelse ≥ 1500 ms, før 420); NOPROSE_400 uændret.
- e2e (deterministisk): lyd fra som standard (stub `AudioContext` – aldrig oprettet), kontakten ved ⚡ huskes over genindlæsning og ligaens gem er uændret, ingen fejlboks uden `AudioContext`; CSS: uden `reduce` er `animation-name` ≠ none på rystelse/flash/puls, med `reducedMotion: 'reduce'` none; `#skip` og kontakten ≥ 44 px ved 390.
- Mutationer, der skal give rødt: kendelsen vist på tjek-tick'et; kendelsen byttet; `line` udeladt; `other` ignoreret ("forreste" altid); pause på ét-trins; pausen fjernet; fx hvert tick; rystelse på VAR_CHECK; flashfarve byttet; reduced-motion-reglen fjernet; lyd tændt som standard; `cast` ude af VIEW_KEYS.
