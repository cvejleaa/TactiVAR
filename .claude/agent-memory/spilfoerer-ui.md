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

## v3.32.2 VAR-øjeblikket (2026-11-06) – scripts scratchpad/ui3322b/play.mjs (port 5340), billeder ui3322b/
- Løst og målt (gå ikke efter igen): "1 - 0 ?" synlig over rammen (sc top 220/210, ramme 306/296); nyt mål lukker rammen (0-5 i 73');
  kendelsen med hold + farve ("❌ Roskilde Rovers' mål annulleret" grøn, eget annulleret rød); filterrække 466/416 > rammens bund 458/408;
  pause tjek→kendelse ~2,1 s; "Vis kendelsen ›" 44 px; siden hopper ikke.
- Åbent: ét-trins kendelser (VAR_RED UPGRADED, VAR_PEN AWARDED) lukkes af deres EGEN følge-hændelse (RED/GOAL, CLOSES varmoment.js)
  → rammen står ~0,4 s (7167→7544 ms); zonen 152 px ved 390 er et tomt hul under tidslinjen i kampe uden VAR (126 px luft); rammens indhold maks 117 px af 152 (4 linjer offside, 6 VAR-kampe ved 390). Anbefalet: behold fast zone, fyld den.

## Efter-gennemgang v3.32.3 Samspil på Taktik (2026-11-06) – scripts scratchpad/ui3323/{play,p2}.mjs (port 5370), billeder ui3323/
- Godt (gå ikke efter igen): fokus-streger + naboringe virker ved 390/1366/1920; teksten i ord, stærkeste først, "Kender også … (bænk)";
  ingen sidefejl efter 1/5/10 runder.
- Fundet: "ca. 1 kampe" (chemistry.js:255/259); udelukket/skadet NABO står "stærkt" uden mærke (status kun for den valgte, :251);
  forhåndsvisning for en udelukket/skadet starter er rød (−2 for hver bænkspiller) skønt motoren skifter ham ud alligevel (match.js:3);
  R1 = "±0" i hver række (støj); 390: tal "−4"/"+1 −5" uden forklaring (title kan ikke ses ved tryk), #pick-msg fast 94–150 px
  dækker 4 bænkrækker (y 626–720); beskeden op til 55 ord, "– samspil tæller kun, når de står som naboer" hver gang.

## Efter-gennemgang v3.33.0 Pladsen følger dybden på midten (2026-11-06) – scripts scratchpad/ui3330/{play,p2,p3}.mjs (port 5470), billeder ui3330/
- Godt (gå ikke efter igen): live-etiketten skifter ved grænserne (y52 "→ DM-/CM-plads", 46 CM, 39 CM-/OM, 34 OM, 56 DM) ved 390 og 1366;
  title "CM→DM (DM-plads) – …", Plads-cellen "CM→DM ⚠ −2,5 %" + title; arkets liste "CM→DM"/"CM→OM", mellemzone y52 = "CM"; ingen sidefejl.
- Fundet: live-etiketten siger pladsen, ikke prisen for HAM (−2,5 % først efter slip) og har "Ude af zone"-rødt (#fecaca, ingen CSS for
  .kind-live); CM trukket ned ved DM'en: 390 flag-overlap 129×12 px + flaget skåret −4 px (brik 218 px bred i 324 px bane), 1366 23×15;
  referatet "for langt fra sin DM-zone" ved y80 / "OM-zone" ved y12 (match.js:1361 cp.role = effektiv rolle; ringen er om CM-ankeret);
  arkets minibane siger "CM P. Bach" ved ankeret, listen under "CM→DM" (matchcenter.js:121-122 bruger coords.r, ikke e.place).

## Plan v3.33.1 (2026-11-07) – rapport på Hjem, 👋-varsel, "dine spillere"; scripts scratchpad/ui3331/{play,m2,m3}.mjs (port 5500-5502)
- Målt: rapporten 274 px (1366) / 533 px (390); Tag op/Lad gå 23 px; Hjem ved sæsonslut: todo y339 (1366) / y387 (390).
- Sæson 1: 0 pensioner i HELE ligaen (retireChance 0 for alle) – varslet ses tidligst sæson 2; kræver doktoreret alder i test.
- Ingen transfervindue mellem R10 og sæsonskiftet (WINDOW_ROUNDS [1,8]) – varslet kan ikke handles med salg.
- card.js:25 "overvejer at stoppe" skønt udfaldet er afgjort (career.js:219). Foreslået "stopper efter sæsonen" overalt.
- 👋 i Trup-navnecellen: 119 → 152 px ved 390 (hele kolonnen), 100 → 119 ved 1366; rækkehøjde uændret 44/25.
- #my-players: Kampe-td venstrestillet under centreret th (style.css:123 .standings td:nth-child(2)); 552 px i 324 ved 390,
  korte overskrifter → 324. km/HI/fri løb findes IKKE pr. sæson i matchLog (LOG career.js:138) – kræver nye s-felter.

## Efter-gennemgang v3.33.1 sæsonrapport på Hjem + 👋 + "Dit hold" sæson (2026-11-07) – scripts scratchpad/ui3331/{play,p2,p3}.mjs (port 5530), billeder ui3331/
- Godt (gå ikke efter igen): rapporten øverst på Hjem (h3 y164 ved 390), ▶ i bjælken; "Svar ↑" ruller til tilbuddene; Tag op/Lad gå 44 px ved 390;
  👋 i Trup (4/4) + "· 👋 = stopper efter sæsonen", kortets tekst med halv værdi/løn; Klub "📋 Sæsonrapport – sæson 1 ›"; "fra R10" efter migrering;
  ⓘ 44 px ved 390; rapporten væk efter S2R1.
- Fundet: Hjem-linjen 👋 (131 px ved 390) linker til Trup, ikke markedet, og "vinduet er åbent til runde 8" = sidste chance (varsel R7, vindue lukker R8);
  Klubs "Til salg i ligaen" (club.js ~128) uden 👋 (public-club :157 har det); "Snit" = karakter 7,7 i Dit hold, men 4,0 stjerner i "⭐ Bedste snit"
  for samme spiller (stats.js:87); karrieren kun i tr-title ("når du holder over") – umulig på touch, navne "N. Jako…" ved 390;
  1366: "Lad gå" brydes til egen linje (23 px); ≥2 karrierestop i 18-mandstrup → 0 tilbud (season.js:300-307, klub-område);
  rapporten = 8–10 admin-punkter, ingen sæsonens spiller/topscorer/forventning.
- Fixture save-v3.33.0 har gammel seenVersion → notice 4230 ord (artefakt, ikke rigtige brugere).
