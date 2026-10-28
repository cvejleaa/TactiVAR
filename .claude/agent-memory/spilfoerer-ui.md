# Hukommelse – spilfoerer-ui

Oprettet 2026-10-27 (v3.22.1). Den fælles backlog er `docs/backlog.md`; skriv her kun det, der hjælper DIG næste gang:
fund der er rettet (så du ikke finder dem igen), hvad brugeren har valgt fra, og målinger med deres tal.

## Rettet (gå ikke efter dem igen)
- v3.21.2 klummen; v3.22.0 Kampens tal under heat map'et; v3.20.1 layout (afspilning venstre, tal/referat højre).
- v3.24.0 samspil vist: streger + legende på Taktik, 🤝 pick-msg ved byt (app.js withChem), makker/par på kortet, salg/køb.

## Står i backloggen (foreslå ikke igen) – mine: #1 avis-overskrift, #6 nederlag forklarer, #12 gentagelser, #21 avis 2×
- #1 målt igen v3.24.0: overskrift om din kamp 11/14 (R4, R8, R10 ikke; R12 "mester før tid"). Mindre slemt end 5/14.
- #12 målt igen: "Din balancerede opbygning bryder igennem" 10× i R3; mellemblok-linjen 7× i R12.

## Rundtur 2026-10-28 (v3.24.0) – foreslået
- Intet øjeblik, når et par bliver stærkt (trainingSummary card.js:99 kun evner/skader); legenden siger stadig "Alle par har
  spillet sig sammen." med 6 gule streger (app.js:459).
- Mobil 390: spillerkortet (makker/par) ligger ca. 3.400 px under banen; klik på brik scroller ikke (scratchpad/ui-click.mjs).
- Kortets skrift: #card-best og marketbox-label 16 px, .log-row 14,4 px, resten 12,8 px (style.css:59 dækker ikke dem).
- "🤝 Holdets samarbejde" (matchcenter.js:168) = kombinationer i kampen, forveksles med 🤝 Samspil.
- Fuldtid "🛡️ ... luftdueller vundet 0 af 0" i næsten alle runder – tom tilstand; hører under backlog #6.

## Fravalgt
- "– det holdt ikke mod jer" efter nederlag – valgt i v3.21.2; rejs kun hvis brugeren klager.
