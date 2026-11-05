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
- Kortets skrift: #card-best og marketbox-label 16 px, .log-row 14,4 px, resten 12,8 px (style.css:59 dækker ikke dem).
- "🤝 Holdets samarbejde" (matchcenter.js:168) = kombinationer i kampen, forveksles med 🤝 Samspil.
- Fuldtid "🛡️ ... luftdueller vundet 0 af 0" i næsten alle runder – tom tilstand; hører under backlog #6.

## F1 (v3.28.0, 2026-11-02) – spillet 5 runder i worktree, scripts scratchpad/ui-f1/play.mjs + chk.mjs
- Godt: Hjem lander rigtigt efter Forbered (scrollY 0), "Før du spiller"-listen klar, pille på Taktik vælger brikken.
- Mit fund: `#to-home` står nederst på Kamp (y≈3300 af 3340 på 1366, ≈5800 af 5900 på 390); den synlige næste handling
  er topbarens lille ▶, der spiller direkte. Foreslået flyttet op under resultatet.
- Mobil: lille ▶ = "▶ 3 ⛔1" (ordet Runde skjult); med 3 piller bliver 🔍-linket "FC…" og knappen har ingen modstander.
- Modstander "Nr. 3" før runde 1 (alle 0 point); form "V U T" uden farve/forklaring.

## F2 (v3.29.0, 2026-11-02) – spillet 7 runder + køb, scripts scratchpad/ui-f2b/play.mjs (1366/390) + mid.mjs (1024)
- Godt: Trup-række åbner (1 klik), ◀ ▶ bevarer rulning (scrollTop 250 → 250), træning i panelet, køb → kvittering + "Se X i din trup ›".
- Mine S-fund: brikkens lilla ring (.token.selected = selectedPlayerId, pitch.js:37) står på sidst klikkede, ikke panelets spiller;
  byt-beskeden står 2× ved ≥ 1200 (liste + panel, under en ANDEN spillers navn); kvitteringen viser døde ◀ ▶.
- Backlog-forslag: 390-arket 591 px (top 196) – byt med åbent ark umuligt, ▶ Spil dækket; 1024 px: panelet (left 614) dækker
  listens navne (padding først ≥ 1200); 1366 Trup: regnearket 1112 i 880 px – højre kolonner kræver vandret rul.

## Fravalgt
- Brugeren 2026-11-02: klik på egen brik/række på Taktik = byt (ikke kort); kortet via ⓘ; panelet kun Trup+Taktik.
- "– det holdt ikke mod jer" efter nederlag – valgt i v3.21.2; rejs kun hvis brugeren klager.

## Plan v3.30.0 (2026-11-02) – ▲ i Trup + egen Træning-fane; scripts scratchpad/ui-trn/{m,g,f,w}.mjs
- Målt: Alsidig (standard) = 0 +1 i 12 runder (trainingReport.gains tom hver runde, devTally 0); Teknik for alle: bedste "~9 rd",
  10/18 "> 1 sæson". ▲ bliver sjælden → Træning-fanen skal have en fremadrettet tom tilstand.
- ▲ kolliderer med sorteringspilen (matrix.js:89 ' ▲'/' ▼'); foreslog grønt "+1" i stedet. FIN-kolonnen står x=661 i 324 px
  ved 390 → markér også i Spiller-cellen.
- 7 faner: "Træning" 48 px i 56 px knap (390), 51 px (360) – passer; < 340 px løber det over.
- Hjem-linjens indhold var i 3/8 runder KUN "1 nyt stærkt par" → "Træning ›" leder til samspil; foreslog Taktik dér.

## Plan danske pladskoder (2026-11-03) – script scratchpad/pos/m2.mjs (bytter tekst i DOM, måler)
- Foreslået: MV VB HB MS VKB HKB DM CM VM HM OM VK HK SA ANG (CF=skyggeangriber; ikke "HA" – H=højre). Én tabel i motoren.
- Målt: plads uændret – Taktik "CDM ⚠ −2,5 %" 89 px → "DM ⚠ −2,5 %" 80 px i 96 px kolonne (390); Kamp ingen overlap.
- Taktik-brikken viser IKKE koden (kun title, pitch.js:38). Karakterarket viser rå kæde "RWB (DEF)" (lineup.js:14).

## Efter-gennemgang v3.32.1 (2026-11-05) – scripts scratchpad/ui3321/{play,t2}.mjs, billeder ui3321/shots
- Godt (gå ikke efter igen): Kamp 390 5058 → 1760 px, 1366 2706 → 1169; ▶-rækken y 560/456 (før under folden); Send kampen i ⋯ Mere;
  fanerne 44 px ved 390; Trup 44 px rækker, sticky + fade virker; Hjem "Se kampen ›" → scrollY 0, fane replay.
- Fundet: #rp-play og referatfiltre 23 px ved 390; banen skæres af bjælken (1366×900: 1012 vs 851; 390: 122 af 428 px synlige);
  #mc-ft = resultat+boldbesiddelse, neutral farve, gentager analysen ved siden af; Taktik første select y 1699 (390) / 1024 (1366),
  fit-help 113 px + list-help + pitch-help står stadig åbne.
