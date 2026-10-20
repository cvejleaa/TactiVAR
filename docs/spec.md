# TactiVAR Manager – spec og opgørelse

Kilde: Gemini-samtalen "Fodboldmanagerspil på Firebase" (PDF på Drive, fil-id
`1n1NvhqCifrnMJ7AFOdsdYhUmigw1BWO8`, 396 sider, v1.0 → v2.5b, 20 prompts).
Koden i PDF'en er afskåret ved ca. 150 tegn pr. linje, så den kan ikke
kopieres — spillet genimplementeres ud fra denne spec. Tal citeres fra
kilden; hvor Geminis prosa og kode er uenige, står KODENS værdi, og
prosaens i parentes.

Status pr. element: **med** (trin 1-paritet), **rettet** (med, men fejl i
v2.5b rettes), **tabt** (lovet af Gemini, men mangler i v2.5b — bygges som
egen PR), **udskudt** (trin 2 eller senere), **udeladt** (bevidst, med
begrundelse).

## 1. Liga og kalender

| Element | Værdi | Status |
|---|---|---|
| Liga | "TactiVAR Superligaen", id `league_div_1`, `seasonNumber: 1`, `footballYear: 1` | med |
| Hold | 8: eget hold "Bibamus United" (index 0) + 7 bots: FC Vejleå, Ølstykke IF, Lyngby Tacticians, Nordkysten BK, Furesø Boldklub, Kronborg United, "Ros…" (resten afskåret — fx Roskilde) | med |
| Hold-id | `team_div1_N` | med |
| Runde | 4 kampe pr. runde, alle simuleres med fuld motor | med |
| Stilling | sejr 3, uafgjort 1; sortering point → målforskel; kolonner K/V/U/T/Mål/VAR(±)/Point; klik på hold = scout | med |
| Kampprogram | 14 runder Berger-program hjemme/ude (`public/engine/schedule.js`, v3.11): alle møder alle én gang hjemme og én gang ude, runde 8–14 er runde 1–7 spejlet, højst 2 hjemme/ude i træk. Holdrækkefølgen blandes pr. liga (seedet af spillerne, ikke ligaens rng). Ingen modstandervælger; din kamp står først i runden. Ingen hjemmebanefordel – hjemme/ude er kun, hvor kampen spilles | med |
| Sæson | Efter sæsonens runde 14 arkiveres tabel, mester, din placering, topscorer og din bedste (flest kåringer, så mål) i `league.seasons`; tabel og sæsonstatistik nulstilles, `seasonNumber` +1, `seasonStartRound`/`statsFromRound` = næste runde. Spillere, friskhed og ligaens forløb bevares. Aldring kommer med træningen | med (v3.11) |
| Kalender | 3 kampe/uge tir/tor/søn, fredag træning+økonomi, sæson = 5 uger, fodboldår = 2 sæsoner, +1 år alder pr. fodboldår | udskudt |
| Klubkasse | 5.000.000 kr. | med (vises; ingen økonomi endnu) |

## 2. Spillere

- Trup 18: #1–11 start (`lineupSlots`), #12–18 bænk.
- Blueprint: #1 GK STARTER, #2–3 DEF STARTER, #4 DEF STAR, #5 DEF, #6–7 MID
  STARTER, #8 MID STAR, #9 ATT STARTER, #10–11; bænk #12 GK ROTATION, #13 DEF
  ROTATION, #14 DEF TALENT, #15 MID ROTATION, #16–18 (afskåret: fordel MID/ATT
  TALENT/ROTATION).
- Rolle-tiers: STAR 24–28 år, evner 11–15, arketype-chance 0,75 · TALENT 17–19
  år, 6–10, chance 0,55 · ROTATION 21–28 år, 7–11 · STARTER 21–27 år, 9–13
  (begge chance 0,25 – kildens kode; prosaen sagde 0,30).
- 9 evner (1–20): `pace, stamina, strength, ballControl, passing, finishing,
  positioning, intercepting, goalkeeping`, vægtet efter kæde (GK goalkeeping
  base+2, andre 1–2; finishing for ikke-ATT 2–9). `rollStat` er
  trekantsfordelt og klemt til 1–20.
- **Naturlig position (v3.8)**, offentlig: MV (GK), CB, Back (FB), CM, Kant (WM), OM (AM),
  ANG (ST). Truppen: 2 MV; forsvar 3 CB + 3 Back; midtbane 3 CM + 2 Kant + 1 OM; angreb 3 ANG
  + 1 Kant – fordelt pr. trøjenummer, så standard-11'eren passer til 4-4-2 (#2/#5 Back,
  #3/#4 CB, #6/#10 Kant, #7/#8 CM, #9/#11 ANG; bænk #13 CB, #14 Back, #15 CM, #16 OM, #17 ANG,
  #18 Kant). Positionen afgør kun højden; løbet i kampen følger PLADSEN (§6), og motoren
  vælger stadig spillere efter kæde. Tildeles aldrig ud fra evner (de er private).
- Højde (brugerens dokument "Spillerhøjde i Superligaen": ligasnit ≈184 cm, trupper
  182,9–187,5, 169–201). Fra v3.8 pr. naturlig position efter dokumentets tabel: midte MV 194
  (spænd 188–201), CB 190 (184–198), ANG 186,5 (178–196), CM/OM 183,5 (175–192), Back/Kant 175,5
  (169–183) + holdprofil −1,5…+3 cm; tre terninger −3..3 (ANG og CM/OM −4..4), klemt til
  positionens spænd. Ligasnit målt ≈184,3, spredning i hele truppen ≥6 (brugeren: ikke alle tæt
  på snittet). (v3.7 var pr. kæde: MV 192, FOR 186, MID 179,5, ANG 181.)
  Skema 3→4 brugte v3.7's tabel (frosset i `HEIGHT_V37`); skema 4→5 se §7.
  Springkraft 1–20.
- **Luftduel** `aerialPower = round(heightScore·0,35 + jump·0,35 +
  strength·0,15 + positioning·0,15)`, `heightScore = clamp(1..20,
  round((cm−166)·0,70))` (v3.7: nulpunkt 166 – højde-scoren på niveau med kildens 168 ved
  snit 186). Mellemregningen vises på spillerkortet.
- **VAR-profil (skjult for alle, også ejer)**: cynicism 4–18, theatre 3–18,
  varPulse baseMin−1..baseMax+2. Vises som "??" — "Afsløres gennem kampe".
- Unikt kortnavn pr. hold: "M. Jensen".
- Løn `sum²·10`/uge, værdi `sum²·150` (sum = de 9 evner).
- Øvrige felter: `freshness` (100), `injuryMatchesLeft`, `lastRating`,
  `ratingSum`, `ratingGames`, `publicStars`, `counterTactics`,
  `matchReportClues[]`.

### Arketyper (låst 🔒 / aktiv 🔓 når alle `unlockReq` er opfyldt)
GK: Sweeper Keeper ("Bryder dybe stikninger uden for feltet"), Penalty Killer
("Psykisk overtag ved straffe og VAR-straffespark") · DEF: Offside Maestro
("+20% til hele bagkædens timing ved VAR-offside"), Luftens Konge ("+25% i
alle hovedstødsdueller i begge felter") · MID: Regista ("Slår pasninger
direkte fra Fase 1 til Fase 3"), Pressing Monster ("Mister 50% mindre energi
ved Højt Gegenpress") · ATT: VAR-Line Ghost ("Vinder 80% af alle
millimeter-tætte VAR-offside-kendelser"), Target Man ("Dominerer lange bolde
og høje indlæg med hovedet"). Krav-tallene er afskåret i kilden (synligt:
goalkeeping 12, positioning 13, passing 13, positioning 12) — fastsættes i
koden og testes. **Status:** med som visning; arketypernes effekt i motoren
er **udskudt** (v2.5b bruger dem ikke).

### Scouting-clues (beskrivende sprog, ALDRIG tal)
højde ≥190 og spring ≥13 → hjørnespark-clue · theatre ≥14 → "teatralsk fald",
≤6 → "utroligt ærlig" · cynicism ≥14 → "knopperne forrest" · varPulse ≥14 →
"2 cm på den rigtige side", ≤8 → "en hel meter offside" · ellers neutral.
Clues opstår i kampe. **Rettet:** v2.5b gemmer clues på modstanderens
spillerobjekt; de skal ligge hos den der observerer.

## 3. Hvem ser hvad (anti-spionage)
- Kampstatistikken i Match Center (v3.10.1: også frispark i skudafstand, hjørnespark, straffe (mål)
  og gule kort) er tal fra én kamp, hvor hver hændelse står i referatet – offentlig for begge hold.
  Kun SÆSONsummer, der følger en skjult indstilling, er private (§8b).
- Offentligt: navn ("F. Efternavn" på banen), rygnummer, kæde, naturlig position, alder, højde, friskhed, skadesstatus 🚑, stjerner (★☆☆☆☆–★★★★★), holdets startformation. Intet andet om andre holds taktik (brugerens beslutning, afviger bevidst fra v2.5): ingen faser, planer, Hvis-Så-regler eller "typisk stil" – heller ikke i ligatabellen, kamphovedet, det taktiske oplæg eller referatet. Et modstanderholds Hvis-Så-skift vises kun som "omorganiserer sig". Referatet navngiver kun dine egne taktikvalg. (Trin 1 lægger teksterne i motoren med det menneskestyrede hold som seer; trin 2 skal gøre dem seer-afhængige.)
- Kun ejer: 9 evner, spring, luftduel, arketype, løn/værdi, kasse, de præcise fasevalg og Hvis-Så-regler,
  eksakt karakter, mod-kunnen.
- Ingen: VAR-profil (kun via clues).
- Modstandere vises med "🔒 ??"; sortering på skjulte kolonner hos et
  modstanderhold afvises; skift til bot-hold nulstiller sortering.
- Referat og clues må ALDRIG indeholde en modstanders tal (v1.7-fejlen "FIN: 7").
- I trin 1 er det kosmetisk (alt ligger i browseren). Reel beskyttelse kræver
  server-motor — **udskudt** til trin 2.

## 4. Taktik
- Koordinater: kilden har kun målmand og bagkæde (resten afskåret); de øvrige
  pladser er fastsat i samme stil i `public/engine/formations.js`.
- 10 formationer: 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2, 5-4-1, 4-1-4-1,
  4-4-1-1, 4-3-1-2 (x/y i %, rolle GK/LB/CB/RB/LWB/RWB/CDM/CM/LM/RM/CAM/…).
- Træk og slip "Rolle-Anker & Frit Træk": GK (slot 0) kan ikke trækkes,
  modstanderens brikker kan ikke flyttes, klem x 8–92 og y 8–82,
  `MAX_ANCHOR_RADIUS = 28` → over det "⚠ Ude af zone (-20%)" (rød), ellers
  "✅ Custom Pos". Stiplet anker-cirkel under træk. `customCoords[slot]`.
  Formationsskift og "↺ Nulstil Træk" nulstiller.
- Byt: klik spiller 1, klik spiller 2 (også start ⇄ bænk, "🔁 Byt").
- Plan A/B/C: A 4-4-2, B 4-3-3, C 5-4-1.
- Faser: Fase 1 passingStyle SHORT/BALANCED/DIRECT_LONG, attackFocus
  CENTRAL/HIGH_CROSSES/LOW_CUTBACKS, offBallRuns FEW/NORMAL/MANY ("Løb uden bold", v3.9 – dit hold
  starter på Normal, bots efter profil: gegenpres Mange, lav blok Få, ellers Normal; synlig
  hjælpetekst under Fase 1 og Fase 3) · Fase 2 pressingHeight
  LOW_BLOCK/MID_BLOCK/HIGH_GEGENPRESS, offsideTrap OFF/NORMAL/EXTREME_VAR_LINE,
  tacklingIntensity CAUTIOUS/NORMAL/AGGRESSIVE · Fase 3 onBallWon
  FAST_COUNTER/KEEP_POSSESSION, onBallLost COUNTER_PRESS_5S/DROP_BACK.
- Hvis-Så: maks 5 one-shot. Betingelse "Bagud med mindst N mål", "Foran med
  mindst N mål" (N = 1–5) eller "Uafgjort" (skema 2; skema 1's "Foran med 1"
  betød præcis 1 og er migreret til "mindst 1" – brugerens ønske om selv at
  angive antal mål). Mål: en formation (med `slotRemapping`) ELLER en af holdets
  planer A/B/C – så skiftes formation, trukne positioner og faser; spillerne
  beholder pladserne, og de aktive regler kører videre (planens egne regler
  bruges ikke midt i kampen). Skift til den plan, der allerede spilles, gør
  intet. Den aktive plan holdes lig med live-taktikken. Reglerne kører for
  begge hold.
- Bot-hold har hver sin taktiske profil (`BOT_TACTICAL_PROFILES`).

## 5. Kampmotor (v2.5b)
Tick hvert 3. minut (1..90).
- Boldbesiddelse: midtbanens (PAS+BAL) + Mod·0,03 + rnd·8 (mod rnd·7,5).
- Fase-duel 48 %: opbygning PAS+BAL+rnd·7 mod pres INT+POS·0,85+STA·0,35+rnd·7,
  + Mod·0,05, sten-saks-papir: SHORT slår LOW_BLOCK, DIRECT_LONG slår HIGH_GEGENPRESS,
  HIGH_GEGENPRESS slår SHORT, LOW_BLOCK slår CENTRAL (+3).
  **Afviger fra kilden (v3.6, brugerens fund):** kildens pres INT+STA·0,6 og Mod·0,03 gav
  opbygningen 96,8 % af duellerne. Nu (efter mod-kunnen-puljen og de nye højder,
  `node tools/measure-duels.mjs 100`) ca. 59 % med ligaens taktikker, ca. 53 % neutralt
  og 71–77 % med den rigtige mod-stil. Vinder forsvaret duellen, er bolden tabt:
  ingen chance for angriberen i samme tick (1,76 → ca. 1,4 mål pr. kamp; hovedstødsmål
  uændret ca. 0,05 pr. kamp med både gamle og nye højder ved N = 100). v3.8 (højde pr.
  position): høje bolde i feltet tages af en midtstopper, når holdet har en på banen (den
  trukne forsvarer afgør hvilken – ingen ekstra terning); ellers gav backs på ≈175 cm 0,14
  hovedstødsmål pr. kamp. Målt N = 100: 1,41 mål og 0,09 hovedstød (v3.7.1: 1,41 / 0,07). Referatet skrives fra brugerens hold: ✅/❌ efter om DIN
  taktik virkede, kun dine egne valg navngives; pause-analysen tæller dine dueller.
- Positions-vurdering 25 %: ude af zone (>28) −0,45 karakter (presspiller
  +0,35), ellers +0,40.
- Offside-fælde 45 % hvis ikke OFF. Offside-fælde og omstilling nævnes kun i teksten for dit eget hold; hos modstandere står blot "fanges offside" / "erobrer bolden". Offside giver frispark – ingen kontra (bolden er død).
- **Kontra (v3.9)** – én rigtig mekanisme (det tidligere COUNTER-label er fjernet). Efter vundet
  pres (ikke offside) og efter en opsnappet dribletur: p = {Få 0,03, Normal 0,08, Mange 0,22}
  (taberens løb uden bold) · taberens "Ved boldtab" (Genpres 0,6 / Fald tilbage 1) · vinderens
  "Ved erobring" (Lynkontra 1,8 / Hold på bolden 0,4) · (1 + 0,05 pr. LB/RB/LWB/RWB-plads ved
  Mange), afrundet til 3 decimaler (`counterChance`). Findes på alle trin – én kontra røber intet.
  Afslutning: vinderens angriber FIN + rnd·8 + 4 mod MV GK + rnd·8; mål = COUNTER, og oplægsgiveren i
  teksten får assist (v3.10).
  "Hold på bolden" uden kontra giver holdets næste opbygning +2. Genpres koster km ·1,04 for alle
  markspillere (friskhed). Tekster kun for dit hold: Lynkontra + kontra "Din lynkontra sættes
  straks i gang", uden "… løber ind i et organiseret forsvar"; Hold + kontra "Dit hold ser hullet
  og går direkte", uden "Dit hold falder til ro på bolden"; taber du på Mange: "Din RWB … er højt
  oppe efter sit løb". Modstanderens indstilling nævnes aldrig.
- Frispark 6 % (−0,35): heraf skade 40 % (1–3 kampe, auto-indskiftning fra bænken, intet kort),
  ellers taktisk frispark med gult kort. Fra v3.10 desuden gult kort på 21 % af de "stille" frispark
  (Superligaen ≈ 2 gule pr. hold pr. kamp) – se Dødbolde.
- Chance 30 % (v3.9: Få 26 %, Normal 30 %, Mange 36 %); xG 0,13–0,35 pr. afslutning. Høje bolde 55 % ved
  HIGH_CROSSES: `aerial + rnd·6 > forsvarer.aerial + gk·0,4 + rnd·…`.
- VAR-tjek ved roll < 0,22: `varPulse + vsTrapLong·0,025 + rnd·6 > forsvarer.POS + rnd·…`.
- Afslutning: `FIN + rnd·8 > GK + rnd·8` (v3.9 havde en målmandsfordel på 5; v3.10 fjerner den –
  brugeren: "Bliver der scoret for lidt nu" – mod Superliga-niveau).
- **Dødbolde (v3.10**, brugeren: "mål på hovedstød, straffe eller dødbolde. Antallet af frispark"):
  kun til holdet med bolden i en tick uden boldtab. Straffespark 1,1 % pr. tick: holdets bedste FIN,
  `FIN·friskhed + rnd·8 + 2,3 > MV·friskhed + rnd·8`. Frispark i skudafstand 6,1 %: 37 % direkte
  skud (bedste FIN+PAS, MV +4; FREEKICK), ellers indlæg fra bedste PAS til en af de tre bedste i
  luften – også stopperne (SETPIECE). Hjørnespark 90 % efter en redning eller clearet høj bold (CORNER).
  Dødbolds-luftduellen er den samme som i åbent spil, med forsvaret +0,5. "Stille" frispark 58 % pr.
  tick tælles uden hændelse. Gult kort kun ved det taktiske frispark (skade-frisparkets tekst nævner
  intet kort). Kontramål giver assist til den nævnte oplægsgiver; kontra-afslutningen får +4.
  **Målt** (`node tools/measure-duels.mjs 100`): 2,80 mål pr. kamp (Superligaen ≈ 2,8; v3.9 1,44),
  23 % af målene på dødbolde, 0,27 straffe pr. kamp (77 % scoret), 4,2 hjørnespark, 20,9 frispark,
  2,1 gule kort pr. hold pr. kamp (Superligaen ≈ 2).
- **Fuldtids-analyse (v3.10**, brugeren: "Ved pausen får jeg information om hvordan min opbygning har
  klaret sig, men det får jeg ikke af vide ved fuldtid"): kun din kamp – besiddelse, afslutninger,
  opbygning og pres for hele kampen, dødbolde (frispark i skudafstand, hjørne, straffe) og frispark
  begået/tilkendt, samt løb uden bold og kontraer imod (erstatter v3.9's separate linje).
- **Løb uden bold (v3.9**, brugeren: "Alle kan være med til at løbe i position og afhængig af hvor
  man er på banen kan det blive til en dribletur, en aflevering (incl. tværaflevering) eller skud.
  Beslutningen kan også blive påvirket af spillerens evner til skud eller aflevering"). I den
  almindelige afslutning (ikke høje bolde/VAR) trækkes en løber blandt de 10 markspillere efter
  pladsens vægt (Få/Normal/Mange): ST/CF 3/3/3, LM/RM/LW/RW/CAM 2/2,5/3, CM/CDM 1/1,5/2,5,
  LB/RB/LWB/RWB 0,2/0,8/2, CB 0,05/0,1/0,3. Løbet: (POS + PAC·0,5)·friskhed + rnd·8 + {−3/0/+4}
  mod forsvarerens (POS + INT·0,5)·friskhed + rnd·8 + (Få hos forsvaret: +5 – flere bag bolden).
  Tabt → almindelig afslutning som før. Vundet → beslutning efter zone (pladsen 20 frem: kant
  x < 28/> 72, dybt y ≥ 60, højt y ≤ 35, ellers mellem) og evner over 6: skud FIN·{kant 1, dybt
  0,6, mellem 1,5, højt 3}, aflevering PAS·{3/2,5/1,5/1} (·1,3 fra kanten ved dine lave
  cutbacks), dribletur (PAC+BAL)/2·{2/0,5/1,5/1}. Skud: LONGSHOT (højt oppe COMBINATION).
  Aflevering: modtager ST/CAM/CM afslutter, løberen får oplæg; fra kanten CUTBACK. Dribletur:
  (PAC+BAL)·friskhed + rnd·8 mod (POS + STR·0,5)·friskhed + rnd·8 + 3 – vundet DRIBBLE, tabt =
  opsnapning (intet skud, kontra-tjek). Afslutningen efter et vundet løb får +2 (v3.9: +3,5). Kun DINE løb
  fortælles ("✅ #3 … løber sig fri på kanten og lægger den tværs til #9"); modstanderens mål
  beskrives som før. `freeRuns`/`freeRunsWon` er private ("2/3 fri" i dit karakterark), og en
  linje ved slutfløjt opsummerer dit holds løb og kontraer imod i alt. Mange koster km ·1,03 og
  HI ·1,08 for LB/RB/LWB/RWB/CM/CDM/ST/CF, Få ·0,98/·0,94.
  **Målt** (`node tools/measure-duels.mjs 300 loeb`, 2400 kampe pr. linje, netto mål pr. kamp for
  hold med indstillingen): mod Hold på bolden Mange +0,08, Normal +0,03, Få +0,02; mod Lynkontra
  Få −0,01, Normal −0,05, Mange −0,14. Genpres: kontramål imod 0,04 mod 0,06. Ligaen 1,44 mål pr.
  kamp (N = 100; v3.8 1,41). Ingen indstilling vinder over alt (balance.test.mjs).
  **v3.10-kalibrering** (efter 2,8 mål pr. kamp): kontra p {0,03/0,08/0,22}, genpres ·0,6, kontra
  +4, løbsbonus +2, Få-dækning +5. Målt (`… 300 loeb`, netto pr. kamp): mod Hold på bolden Mange
  +0,10, Normal −0,06, Få −0,12; mod Lynkontra Få −0,09, Normal −0,16, Mange −0,31; genpres 40 %
  færre kontramål imod.
- Spillere vælges efter rolle i formationen (forsvar CB/LB/RB/LWB/RWB, midt
  CDM/CM/LM/RM/CAM, angreb resten).
- Referat 30–40 hændelser: 📋 taktisk oplæg 1', pause-analyse 45', slutfløjt;
  filtre Alle / Kun taktik / Kun nøglemomenter. Klubnavn på alle VAR-kendelser.
- Statistik (8 linjer): boldbesiddelse, taktikdueller, afslutninger, på mål,
  xG, luftdueller, VAR, skader/frispark. Tidslinje 90 min: mål, VAR, skader,
  kort, triggere.
- Live-afspilning 420 ms/hændelse eller lyn-simulering. 4 kampkort pr. runde.
- **Rettet (fejl i v2.5b):** auto-indskiftning ændrer `lineupSlots`
  permanent; skadet spiller heles −1 i samme runde (1-kamps skade forsvinder);
  der gemmes før stilling/karakterer er opdateret; avis og kampvælger vises
  ikke efter live-afspilning; motoren skal være deterministisk ved givet seed.

## 6. Karakterer, MotM, avis
- Start 6,5 (±0,15), klemt 3,5–10,0. Hovedstødsmål +1,35, VAR-mål +1,30, mål
  +1,25, oplæg +0,55, redning +0,50 (skytte +0,10), annulleret VAR-mål −0,40
  (forsvarer +0,45), vundet luftduel +0,40, mål imod forsvarer −0,35 / GK
  −0,25, clean sheet +0,50 til GK/CB/LB/RB (karakteren; i statistikken tæller clean sheet
  kun for målmanden – §8b).
- Deltagerliste med minutter (også skadede og indskiftere).
- Eget hold eksakt karakter; modstandere 1–5 stjerner af karakter + støj
  ±0,22: ≥8,35 = 5, ≥7,25 = 4, ≥6,15 = 3, ≥5,15 = 2, ellers 1. Sortering på
  Vurd for modstandere bruger stjerner.
- MotM 👑 = højeste karakter.
- Avis: 🏆 Rundens Spiller (højeste karakter på tværs), 🚀 Rundens Mål, ingen mål →
  Rundens Defensive Aktion; kort klumme. **v3.7** (brugeren: "avisen er stadig kedelig, og
  rundens mål er altid VAR-dramatik"): en overskrift pr. kamp (3 varianter pr. udfald),
  😮 Rundens overraskelse (fra runde 3: vinderen ≥3 pladser og ≥3 point under taberen før
  runden), 🏃 Dit holds løber (kun eget hold – km/topfart er private).
- **Måltyper (v3.7)**, afgjort ét sted pr. mål og brugt i referat, observation og avis (oplæg/🅰 kun
  for typer med oplægsgiver):
  LONGSHOT og DRIBBLE (vægtet af FIN / PAC+BAL, intet oplæg), COMBINATION, CUTBACK (kun af DIT
  holds LOW_CUTBACKS; for andre hold tilfældige 12 % – anti-spionage), HEADER, VAR. Fra v3.9
  afgør et vundet løb uden bold typen (se §5), og COUNTER kommer kun fra en rigtig kontra. Mindst 3 tekster pr. type (clues.js). Fælles skala 0–20
  (`goalSpectacle`); målt: langskud 36 %, VAR 22 %, dribletur 20 %, kontra 8 % … af
  rundens mål (`node tools/measure-duels.mjs 40 saeson`; efter friskheds-kalibreringen: langskud
  38 %, dribletur 22 %, VAR 19 %; før vandt VAR altid). Bevidst: at en
  modstanders mål kaldes "dribletur"/"langskud" røber svagt fart/afslutning – på linje med de
  eksisterende ord i describeFinish. v3.9-skala: CUTBACK 8 + PAS·0,3, DRIBBLE 9 + (PAC+BAL)·0,17,
  COUNTER 5,5 + PAC·0,2, VAR 5,5 + rnd·5; målt (`… 60 saeson`): kontra 24 %, VAR 21 %, hovedstød
  14 %, cutback 13 %, dribletur 12 %, langskud 8 %, kombination 7 % – ingen type over 30 %
  (v3.8: langskud 37 %). Langskud er blevet sjældnere med målmandsfordelen.
  **v3.10:** nye typer PENALTY (3 + rnd·3 – sjældent rundens flotteste), FREEKICK (11 + FIN·0,3 +
  rnd·4), CORNER og SETPIECE (4 + luft·0,35 + rnd·4); HEADER er nu kun åbent spil. Målt (`… 60
  saeson`): langskud 22 %, frispark 20 %, dribletur 19 %, cutback 17 %, hjørnespark 8 %, hovedstød
  4 %, kombination 3 %, kontra 3 %, frisparksindlæg 2 %, VAR 2 % – ingen type over 30 %.
- **Løbedistance og topfart (v3.7; pr. plads fra v3.8)** pr. karakter: km/90 = basis for den
  PLADS (formationsrolle), spilleren står på – også en indskifter (dokumentets "fysisk
  belastning"): CM/CDM 11,8 · LWB/RWB/LM/RM/LW/RW 11,0 · CAM/CF 10,8 · LB/RB 10,6 · ST 10,0 ·
  CB 9,5 · MV 5,5 (uden rolle: kædens plads – FOR = CB, MID = CM, ANG = ST) · (0,9 + STA·0,01) · pres (gegenpres 1,06, lav blok 0,96) · støj ±4 % ·
  min/90; topfart 25 + PAC·0,45 ± 1 (MV −3), mindst 10 min. Private (RATING_PRIVATE_FIELDS);
  spillerkortet viser km pr. 90 min og bedste topfart for alle hans kampe (nulstilles ikke ved sæsonskifte).
- **Højintenst løb (v3.7.1**, brugeren: "hvor stor en andel af deres løb der er højintense løb"):
  andel (over ca. 20 km/t) = (rolle-basis WB/kant 13, LB/RB 11, ST 11, CAM/CF 10, CM/CDM 8, CB 5,
  MV 2 % (v3.7.1 pr. kæde: MV 2/FOR 7/MID 9/ANG 11) + (PAC−10)·0,4) · pres (gegenpres 1,15, lav blok
  0,9) · (0,8 + 0,2·friskhed/100) ± 1, klemt 1–20 % (topdivisioner ≈7–12 % for markspillere;
  målt med `node tools/measure-duels.mjs 20 saeson`, v3.8 – hele kampe: CM 12,1 km / 8,9 % HI,
  WB/kant 11,2 / 13,8, CAM/CF 11,3 / 10,9, Back 10,9 / 12,2, ANG 10,0 / 11,6, CB 9,7 / 5,5,
  MV 5,6 / 2,2 – dokumentets rækkefølge: CM længst, wingbacks/kanter flest HI, CB færrest).
  Vises som "N % HI" i karakterarket, "N % højintenst" for dit holds løber og sæsonandelen på
  spillerkortet (egen nævner `hiDistSum`, så v3.7.0-ligaer ikke viser for lavt). Ingen andel under
  10 min spilletid. Privat (røber fart og pres). Bund 1 % (en målmand ligger på ≈2 %).
- **Rundens mål viser kampen** (v3.7.1, brugeren: "hvilken kamp var dette i?"): hvert mål får
  `matchIdx` (ældre runder findes via kampens navn); linket – i Liga- og Kamp-fanen – åbner
  kampen, markerer målet i referatet og ruller frem til det.
- **Friskhed (v3.7**, brugeren: "kun 3 af mine spillere der har under 100%"; kilden
  −max(4, 14 − STA/2) + 8 straks): kampen koster round(km · (1,5 − STA·0,03)) ± 2 (støj, så
  STA ikke kan regnes baglæns); restitution 41 % af det, der mangler op til 100 (v3.10.1 –
  brugeren efter 17 runder: "næsten alle mine spillere er langt nede i friskhed", valgt ≈80 %;
  v3.7–v3.10: 35 %) (bænk +15 oveni), bund 50. Ligevægt for en fast starter ≈ 100 − 1,44·pris:
  CM ≈80 % (før ≈75 %), MV ≈88 % (QC:
  med fast +5 endte alle på 50, og rotation blev en afgift). Virker i kampen: bidrag i duel,
  afslutning (også målmand) og luftduel · (0,75 + 0,25·friskhed/100) – 50 % ≈ 12,5 % svagere.
  Bots hviler en starter under 70 % for en frisk (≥85 %) bænkspiller i samme kæde, højst 2
  svagere. Målt over 10 runder (`… 30 saeson`): startelleverne ≈85 % i snit (v3.10: ≈81 %).

## 7. Mod-kunnen (v2.2b)
- `counterTactics {vsPress, vsLowBlock, vsTrapLong}`, start
  `round((alder−16)·1,2 + POS·0,8) + rnd(−8..+8)`, klemt 5–45, snit ≈18–20
  (v3.6, brugeren: "startværdierne skal sænkes"; kilden 2,2/1,5/±10, 12–75, snit ≈33).
- **Pulje (v3.6, brugeren: "man kan ikke være god imod alt"):** summen af de tre er
  højst 100 (`COUNTER_POOL`; QC: 120 tillod 40·40·40, det brugeren kaldte for højt). Overskud betales af den stil, der ikke blev trænet,
  derefter af den sekundære, hver ned til bunden; derefter af den trænede selv.
  Spillerkortet viser "Erfaring brugt: X/100 – ved fuld pulje glemmer han …"; 🧠 Mod sorterer på den bedste af de tre.
- Mod en modstander = primær·0,65 + sekundær·0,35 (afledt af modstanderens
  pres, offside-fælde, pasningsstil, angrebsfokus); default 15 (før 25).
  VAR-linje-bonus = vsTrapLong·0,045 (før ·0,025 – samme effekt på den lavere skala).
- XP pr. kamp = `round(min/90·(2 + 0,5·taktikdueller + (mål?1:0)))`, klemt 1–5;
  primær +XP, sekundær +floor(XP·0,5), øvrige −1; bund 15 (≥26 år) ellers 5.
  (v3.6, brugeren: "for hurtigt"; kilden gav 4–16, +60 %, −3, bund 25/12 – en
  starter gik fra ~45 til ~70 på 3 runder.)
- Skema 3 (v3.6) migrerer eksisterende ligaer: mod-kunnen ×0,55 ind i puljen,
  højde −5 cm. Skema 4 (v3.7) lægger højderne om efter rang i hver kæde til Superliga-
  fordelingen (`heightAtQuantile`) – −5 cm-trinnet gælder altså ikke længere i sidste ende;
  scouting- og referattekster med cm følger med. Skema 5 (v3.8): hver spiller får en naturlig
  position – pr. hold og kæde efter højde (de højeste bliver CB/ANG, de laveste Back/Kant, den
  midterste MID-spiller OM, som BLUEPRINT's forhold; `assignPositions`) – og højden lægges om
  efter rang i positionen over hele ligaen (`heightAtQuantile(position)`). Bevidst: en kort
  luftspiller i forsvaret bliver Back og ca. 10 cm lavere.
- UI (brugerens valg, afviger fra v2.5): kolonne 🧠Mod viser spillerens tre
  egne værdier "gegenpress · lav blok · VAR-linje" (sorterer på gennemsnittet;
  "??" for modstandere) – ingen samlet % mod en bestemt modstander, da den kan
  bruges til at regne modstanderens stil ud. 3 mod-barer på spillerkortet, lilla
  +XP-badge. Motoren bruger stadig mod-kunnen mod modstanderens stil.

## 8. Regneark (scouting-matrix)
21 kolonner: Pos/#, Spiller, Kæde, Natur (naturlig position, v3.8), Alder, Frisk/🚑, Højde (offentlige), Spring, ✈Luft,
PAC, STA, STR, BAL, PAS, FIN, POS, INT, GK, Gns, ⭐Vurd, 🧠Mod, Arketype/Note,
Byt. Klik = sortér, igen = vend; nyt klik på tal-kolonne starter faldende.
Standard: start-slot 0–10, bænk 100+rygnr. Heatmap 15–20 smaragd, 12–14
lyseblå, 8–11 hvid, 1–7 grå. Filtre Alle/Start-11/Bænk/GK/DEF/MID/ATT. "⤢ Bred
visning". Sortering på kopi med `origIdx`.

## 8b. Statistik på Liga-fanen (v3.10)
Brugeren: "Jeg vil gerne have noget statistik med på liga siden af al mulig slags". Nederst på
Liga-fanen, fire sammenfoldede sektioner (skjult under afspilning, ligesom avisen). Fra v3.10.1
(brugeren: "noget rod og ikke til at læse") er hver spillerliste en lille tabel – placering · #nr
navn · kort holdnavn (fuldt i title) · værdi – i højst tre kolonner, uden ombrud; dit hold markeret
med grøn kant:
1. **Spillere** (top 5): mål, oplæg, Kampens spiller, hovedstøds-, straffe- og dødboldmål, clean
   sheets (kun målmanden – plads 0, så også en MV skiftet ind ved skade; v3.11, brugeren: "Det er
   kun målmanden der får Clean sheet" – 0 imod, mindst 59 spilleminutter, en starter har 89), gule kort, bedste vurdering (offentlige stjerner for alle).
2. **Holdtal**: bold %, frispark begået/tilkendt, gule kort, straffe (mål), dødboldmål, clean sheets.
3. **Ligaens forløb** (indeværende sæson, v3.11): mål pr. runde (søjler), måltyper, største sejr, målrigeste kamp.
4. **Dit hold (privat)**: afslutninger, xG, hjørnespark, frispark i skudafstand, hovedstødsmål,
   kontramål for/imod, VAR-tjek; pr. spiller kampe, snit, km/90, % HI, frie løb, friskhed.
Tællere: `public/engine/stats.js` (pr. spiller fladt på spilleren, pr. hold på tabelrækken,
`league.history` med loft 60). **Tælles fra `league.statsFromRound`** – en liga fra før v3.10
tæller fra næste runde (ældre runder er ikke gemt); hver sektion viser "fra runde N".
**Anti-spionage** (`viewTeamStats` i visibility.js, QC): sæsonsummer lægger støjen sammen væk, så
holdtal, der følger en skjult indstilling (skud/xG ~ løb uden bold, kontraer ~ omstilling/genpres,
hjørne/VAR ~ høje bolde), vises kun for dit eget hold. Spillerlisterne er offentlige (alt står i
referaterne).

## 9. Noter og persistens
- Private manager-noter pr. spiller-id (også modstandere), ikon i tabellen.
- localStorage, auto-gem ved hver ændring, overlever F5, **synlig gem-status
  med klokkeslæt** og knappen "💾 Gem nu" (kvitteringen var svaret på
  klagen "nulstiller ved refresh"). "🎲 Nulstil & Rul Ny Liga" kræver bekræftelse.
- **En ny version må aldrig slette ligaen.** Hvert skema-bump har en additiv
  migrering (nye felter får standardværdier, som v2.5b's
  `sanitizeLeagueData`). Kan data ikke migreres: de rå data lægges i en
  backup-nøgle, FØR der tilbydes ny liga, og fejlen vises. Hver PR, der
  ændrer skemaet, tilføjer et fixture gemt af den forrige version og en
  test, der indlæser det med truppen intakt. Skema 1 → 2 (v3.4, Hvis-Så) og
  2 → 3 (v3.6, mod-kunnen-pulje og højde), 3 → 4 (v3.7, Superliga-højder), 4 → 5 (v3.8,
  naturlig position og højde pr. position), 5 → 6 (v3.11, kampprogram: den hidtidige tabel
  arkiveres som "Sæson 1 (uden program)", sæson 2 starter med program og nulstillet
  sæsonstatistik; programmet bygges deterministisk af holdenes rækkefølge) – fixtures
  `tests/fixtures/save-schema1.json` … `save-schema5.json`, `save-v3.9.json`, `save-v3.10.1.json`
  (gemt af den live v3.10.1).
- Eksport/import af hele spillet som JSON-fil (backup og flytning mellem
  browsere/domæner).
- Gamle data fra vejleaa.dk kan ikke flyttes (localStorage er bundet til
  domænet, og der ligger intet i Firestore) — den nye version starter med en
  ny liga. Eksport/import gør fremtidige flytninger mulige.

## 9b. Regressionsnet — hvert punkt, der er faldet af før, har en test
| Faldt af (kilde) | Test |
|---|---|
| Spillerne forsvinder (v1.3, v1.7, v2.2, v2.5) | e2e: 8×18 spillere efter F5; e2e: ingen konsolfejl; `npm run check` |
| Alder-kolonnen overskrevet (v1.1) | e2e: regnearkets kolonneoverskrifter i rækkefølge |
| Stat-barer, fase 1–3, frit træk skåret væk (v1.1) | e2e: spillerkort viser 9 barer; 3 fase-paneler; træk flytter brik |
| Taktik nulstilles ved F5 (v1.2) | e2e: træk + fasevalg overlever genindlæsning |
| Rå `${…}` på spillerkortet (v1.2) | e2e: ingen `${` eller `undefined` i DOM |
| Hvid-på-hvid i hold-dropdown (v1.5) | CSS `select option` + e2e: beregnet farve ≠ baggrund |
| Modstander-tal i referat (v1.6) | unit + e2e: ingen modstanderevner som tal i referat/clues/avis |
| Hvis-Så, skader/auto-indskift, clean sheet, minutter, clues, restitution, journalistens begrundelse (v2.3b-komprimeringen) | unit pr. mekanik på seedet kamp |
| "Virker lokalt, ikke efter deploy" | deploy.yml: live-tjek af version + e2e-smoke mod tactivar.web.app |

## 10. Tabte funktioner (lovet, mangler i v2.5b) — én PR hver
Rækkefølge efter Spilførerens gennemgang: journalisten er den mest gentagne
klage (v2.0, v2.2, v2.3, v2.5), og MotM-balancen skal før den, ellers bliver
avisens hovedperson altid målmanden.

1. Taktiske/træthedsbaserede udskiftninger (dårligste efter energi·0,1 +
   karakter, maks 3 pr. hold INKLUSIVE skadesskift — prosaens "5" er forkert) som `SUB`-hændelse 🔄 på tidslinjen.
2. MotM-balance: afslutning uden mål 35 % blokeret (forsvarer +0,30), 30 %
   forbi, 35 % redning (+0,22); mål +1,45, oplæg +0,75, taktisk gennembrud
   +0,40; MotM-vægt = karakter + 0,35·mål + 0,20·oplæg + 0,10·dueller − GK-fradrag;
   GK redning +0,32, efter 3 redninger +0,15, −0,40 pr. mål imod.
3. Journalist-klumme i 4 afsnit på ligasiden efter hver runde (hovedhistorie,
   de øvrige kampe, rundens spiller/mål med begrundelse). Klummen vurderer
   hvert holds taktik og drysser de samme beskrivende hints som referatet —
   aldrig tal.
4. Kampstempel `[Runde X • A x-y B • min • karakter]` + kamphistorik pr. spiller + rundetæller.
5. 🔬 Motor-Røntgen: pause/trin-afspilning, hver hændelse viser sin
   beregning — **kun med egne spilleres tal**; modstanderens side vises som
   beskrivelse. Anti-spionage-test kræves.
6. Taktisk rutine/rust pr. hold og spiller: +10–14 % ved brug, −5–7 % ubrugt,
   `TEAM_FORMATION_MEMORY_CAP = 230`, bænk-bund 60 %, trigger til rusten
   formation (<50 %) advarer; barometer Skarp 80–100 / Indkøring 55–79 /
   Rusten <55; kolonne "Rut".
7. ~~Kampprogram: 14 runder Berger hjemme/ude.~~ Med i v3.11 (§1).

## 10b. Layout (skal bevares, selv uden Tailwind)
Mørkt tema (#0f172a, paneler slate-900, lilla VAR-accent, smaragd for gode
tal). Topbar: klubvælger, "▶ Spil runde N af 14 mod X (hjemme/ude)" efter programmet
og "🔍 X" (åbner modstanderens trup til scouting), gem-status, gem/eksport/import/ny
liga. Under topbaren fire faner (v3.5, brugerens valg); den valgte fane gemmes i
`ui.tab` (ukendt værdi → Trup, intet skemaskift):
- **Trup** (opstilling, v3.6): klubhoved, regnearket i fuld bredde (ingen sidelæns
  scroll, egen lodret scroll ved 46 %), derunder bane + bænkrække | spillerkort.
  Ét fælles byt-valg: startes i regnearket, på banen eller på bænken og afsluttes
  hvor som helst af de tre.
- **Taktik**: bane + bænkrække (klik bænk → klik brik = skift ind) | spillerkort
  + formation/planer/faser/Hvis-Så. 2 kolonner, 1 under 900 px.
- **Kamp**: Match Center for igangværende eller seneste runde (tom tilstand før
  runde 1). ▶ skifter hertil. Karakterark side om side: opstillingsorden med
  pladsen efter navnet (naturlig kæde i parentes ved afvigelse, indskiftere
  "ind på X"), minibane "Startopstilling" med karakter/stjerner, ikoner med
  mouse-over + forklaring under (touch).
- **Liga**: tabel ("sæson N, efter X af 14 runder"), sidste rundes resultater (klik =
  referatet i Kamp), kampprogrammet (næste runde i den rækkefølge, ▶ spiller den; "Dit
  program" med 14 linjer H/U, modstander og din score først; hele programmet og tidligere
  sæsoner sammenfoldet) og avis; klik på et hold åbner det i Trup. Under afspilning
  skjules resultater, program, statistik og avis, og det siges, at tabellen allerede er opdateret.
Modstanderes stjerner: udfyldte i guld, tomme dæmpet.

## 11. Udeladt / udskudt
- **Firestore-seeder + API-nøgle-modal** (udeladt i trin 1): seederen skrev
  hemmeligheder fra klienten til en database i "test mode" (åben for alle).
  Trin 2 erstatter den med Auth + regler + committet `firebase-config.js`.
- **Login, ejerskab (`ownerUid`), bot-overtagelse, noter i Firestore**
  (udskudt, trin 2). Datamodellen `teams_public / teams_private /
  teams_secrets` + `manager_notes/{uid}` er udgangspunktet.
- **Server-motor** (udskudt): reel hemmeligholdelse kræver Cloud Functions
  (Blaze-plan) — besluttes i trin 2.
- **Uge-hjul, træning, økonomi, transfermarked, aldring, arketype-unlock over
  tid** (udskudt — aldrig bygget i kilden).
- **Tailwind via CDN** (udeladt): erstattes af egen `style.css`.
- **"0 backslashes / 0 backticks"-reglen** (udeladt): den fandtes kun pga.
  one.com-editoren. Erstattes af DOM-API/`textContent` i stedet for HTML-strenge.

## 12. Geminis egen statusliste for v2.5 holdt op mod koden
Brugeren fik af Gemini et overblik, hvor alt stod som "✅ Færdig". Holdt op
mod v2.5b-koden:

| Påstand | Virkelighed i v2.5b | Status her |
|---|---|---|
| 3-lags anti-spionage (public/private/secrets) | kun visning i klienten; Firestore åben i test mode | med (visning), reel beskyttelse udskudt |
| Arketyper "låses op når evne-kravet er trænet op" | ingen træning findes; låsning afgøres kun ved fødsel | udskudt (Fredagstræning) |
| "Kun bedste spiller på banen tæller ved hold-bonus" | arketyper påvirker ikke motoren | udskudt (Fredagstræning-PR) |
| Mod-kunnen +4–16 %, −3 % rust | afviger (v3.6, brugerens valg: 1–5, −1) | med, langsommere |
| 1 sæson = 5 uger (14 runder), 3 kampe/uge | 14-runders program og sæsonslut (v3.11); ingen ugedage | delvis (v3.11) |
| Skader med auto-indskiftning | findes, men med fejl (§5 "Rettet") | rettet |
| Klumme om runden | kun én kort sætning | §10.3 |

## 13. Køreplan efter §10 (Geminis "næste skridt", som brugeren har set)
1. **Sæson-hjul** (Geminis løsning 1, slås sammen med §10.7): fast
   14-runders Berger-program ("Runde 1 af 14 (Tirsdag): Bibamus United vs. FC
   Vejleå"), fredagstræning af valgt evne pr. kæde, talenters udvikling,
   arketype-unlock med rapport, tilskuerindtægt minus ugeløn, sæsonskift og
   aldring (+1 år pr. 2 sæsoner).
2. **Transfermarked & talent-akademi**: ugentlig pulje, kun offentlige data +
   clues, bud fra dig og bots, salg fra bænken.
3. **Login & bot-overtagelse** (trin 2): Firebase Auth, "Fair-Start", kamp-
   simulering i Cloud Function kl. 20:00 (kræver Blaze-planen).
