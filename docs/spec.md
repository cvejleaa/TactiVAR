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
- Offentligt: navn ("F. Efternavn" på banen), rygnummer, kæde, naturlig position, alder, højde, friskhed, skadesstatus 🚑, stjerner (★☆☆☆☆–★★★★★), holdets startformation. Intet andet om andre holds taktik (brugerens beslutning, afviger bevidst fra v2.5): ingen faser, planer, Hvis-Så-regler eller "typisk stil" (undtagelse fra v3.14, brugerens valg: klummen må gætte på et holds stil ud fra dets seneste OFFENTLIGE kampe – resultat, kamptal fra referatet, måltyper; buddet tager gennemsnittet af skud, hjørner, besiddelse og kontra-/dødbolds-/hovedstødsmål over op til 3 kampe – en accepteret lækage, da hver kamp kan åbnes enkeltvis – men navngiver aldrig en indstilling og påstår intet om pres; klummen ser kun kampene gennem `publicFacts` (column.js), aldrig tekst, labels, private karakterfelter eller andres kamprapport – bevist med en kanarie-test; en bots spillede indstillinger gemmes ikke længere i `endState`) – heller ikke i ligatabellen, kamphovedet, det taktiske oplæg eller referatet. Et modstanderholds Hvis-Så-skift vises kun som "omorganiserer sig". Referatet navngiver kun dine egne taktikvalg. Fra v3.12 (brugerens valg) følger chancetypen hvert holds eget angrebsfokus – man kan selv regne ud, at et hold slår mange indlæg eller cutbacks, men ordvalget navngiver aldrig indstillingen. Det gælder også fuldtids-analysens "🛡️ Dit felt: modstanderens cutbacks stoppet X af Y, luftdueller vundet …" – tal fra én kamp, som referatet allerede viser (som "kontraer imod i alt"), en bevidst og accepteret lækage. Ligeså (v3.13): minuttet for en bots træthedsskift plus den offentlige friskhed røber lidt om botens løb og STA over mange kampe; teksten nævner aldrig friskhed eller grænse, og botens grænse er skjult (lockboxen i Taktik). (Trin 1 lægger teksterne i motoren med det menneskestyrede hold som seer; trin 2 skal gøre dem seer-afhængige.)
- Øjebliksbilledet ved mål (v3.12.1) gemmer kun DIT holds positioner – de afslører dit pres og dine løb, ikke modstanderens. Ved et modstandermål vises dit forsvar og bolden, aldrig modstanderens spillere eller scorerens plads. Accepteret: hvem der modtager bolden afhænger af hvert holds levende positioner (pres, løb), så over mange kampe kan man statistisk ane et holds indstilling – på linje med løbe-vægtene fra v3.9.
- **Kampens spor og 2D-afspilningen (v3.16) – den største bevidste undtagelse** (brugerens valg 2026-10-24: "I spillet for
  alle" – begge hold fuldt synlige): afspilningen efter slutfløjt viser begge holds placeringer i hvert tick og ved hver
  afslutning, og sporet ligger i den gemte runde. Den afslører dermed modstanderens pres (lav blok trækker holdet ned),
  løb uden bold (flere fremme), trukne pladser og minuttet for et Hvis-Så-skift – langt mere end de enkelte lækager ovenfor.
  Security Reviewer v3.16: det afslører også den enkelte modstanders vundne løb uden bold (løberen står RUN_STEP længere
  fremme i afslutningens øjeblik end i tick'ets grundbillede – ≈2/3 af `freeRunsWon` kan tælles op), som ellers er privat
  (visibility.js). Accepteret under samme valg; et spor med forkert form i en gemt fil slettes (sanitize.js `isValidTrace`).
  Accepteret af brugeren; skal gøres seer-afhængig sammen med resten i trin 2. Heat map'et viser kun modstanderen groft
  (andel i tredjedele) – et PRÆSENTATIONSVALG (brugerens), ikke anti-spionage: en senere gennemgang skal ikke "lukke" det.
  Klummen læser ikke sporet (`publicFacts`). Øjebliksbilledet 📍 er uændret (dit hold); dets mål-imod-tekst henviser til
  afspilningen for begge hold – samme formel, så de to billeder ikke modsiger hinanden.
- Kun ejer: 9 evner, spring, luftduel, arketype, løn/værdi, kasse, de præcise fasevalg og Hvis-Så-regler,
  eksakt karakter, mod-kunnen.
- Ingen: VAR-profil (kun via clues og VAR-kendelser i referatet – v3.15.1: varPulse, theatre og cynicism afgør VAR's
  kendelser som lodtrækninger, så én kendelse ikke afslører spillerens trin).
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
- Hvis-Så: maks 8 one-shot (v3.13; før 5). Betingelse "Bagud med mindst N mål", "Foran med
  mindst N mål" (N = 1–5), "Uafgjort" eller (v3.13) "Uanset stilling" (skema 2; skema 1's "Foran med 1"
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
  Afslutning: vinderens hurtigste nær målet (`receiver` efter PAC i forsvarsformen, v3.12.1; før altid angriberen) FIN + rnd·8 + 3 (v3.10–v3.12: +4) mod MV GK + rnd·8; mål = COUNTER, og oplægsgiveren i
  teksten får assist (v3.10).
  "Hold på bolden" uden kontra giver holdets næste opbygning +2. Genpres koster km ·1,04 for alle
  markspillere (friskhed). Tekster kun for dit hold: Lynkontra + kontra "Din lynkontra sættes
  straks i gang", uden "… løber ind i et organiseret forsvar"; Hold + kontra "Dit hold ser hullet
  og går direkte", uden "Dit hold falder til ro på bolden"; taber du på Mange: "Din RWB … er højt
  oppe efter sit løb". Modstanderens indstilling nævnes aldrig.
- Frispark 6 % (−0,35): heraf skade 40 % (1–3 kampe, auto-indskiftning fra bænken, intet gult kort – men 7 % direkte rødt, v3.15),
  ellers taktisk frispark med gult kort. Fra v3.10 desuden gult kort på 21 % af de "stille" frispark
  (Superligaen ≈ 2 gule pr. hold pr. kamp) – se Dødbolde.
- **Røde kort (v3.15**, Spilførerens sæsongennemgang: 0 røde og 8 dobbelt-gule på en sæson): andet gule kort giver rødt
  (en spiller med gult kort holder igen – kun `SECOND_YELLOW_P` = 17 % af hans kortværdige frispark giver kortet);
  direkte rødt kun ved den grove tackling, der skader en modspiller (`DIRECT_RED_P` = 7 %). Den udviste forlader banen
  uden indskiftning (pladsen er tom; aldrig under 7 mand), karakter −1, og kan ikke blive Kampens/Rundens spiller.
  Ti mand: hver spiller svagere i duellerne (`SHORT_PER_MAN` = 4 % pr. manglende mand – gennemsnit og lodtrækning mærker
  det ellers ikke) og hurtigere træt (`SHORT_DRAIN`). Målt (`measureCards`): ≈ 0,16 røde og ≈ 4,1 gule pr. kamp; ti
  mand scorer 1,06 og lukker 1,93 ind pr. 90 min (elleve: ≈ 1,4). Ingen karantæne endnu (kommer med trup/økonomi).
  Kortene gemmes ét sted (karakterarket: `yellows` 0–2, `red`); kamptal, holdtal og sæsonstatistik (`sRed`) regnes derfra.
- **Træthedsskift spredes (v3.15**, brugerens valg): højst `FATIGUE_SUBS_AT_ONCE` = 3 ad gangen (også i pausen; flere trætte bruger flere pauser);
  grænsen gælder fortsat uanset minut, og dit hold får besked, når en træt spiller må vente.
- Chance 30 % (v3.9: Få 26 %, Normal 30 %, Mange 36 %; v3.12.1: Få 28,5 %); xG 0,13–0,35 pr. afslutning.
- **Angrebsfokus afgør chancens type (v3.12**, brugeren: "Jeg har sat mit hold til cutbacks, og
  alligevel er der ikke en eneste reference til cutbacks i referatet … min modstander vinder 11
  luftdueller"). For ALLE hold (brugerens valg); teksten om en modstander navngiver aldrig
  indstillingen. `FOCUS_SHARE`: høje indlæg 52 % indlæg, lave cutbacks 38 % cutbacks, ellers giver
  direkte lange bolde 15 % høje bolde (før tvang DIRECT_LONG 55 % op i luften uanset fokus). Resten:
  en afslutning (løb uden bold / almindeligt skud). VAR er ikke en chancetype (v3.15.1) – se "VAR som i virkeligheden".
  VAR-tjekket (v3.14.1, brugeren: "VAR på et mål af en midtbanespiller med 5 spillere længere fremme") gælder
  offside for en af de `VAR_FRONT` = 2 forreste: står skytten bagved, tjekkes hans forreste holdkammerat ("#8 skød, og
  #9 foran ham stod ikke offside" / "#9 stod offside og var med i situationen"), og øjebliksbilledet viser skytten,
  hvor han skød fra (aldrig foran den tjekkede, `VAR_BEHIND`), og den tjekkede, hvor han stod – forrest (v3.14.2).
- **VAR som i virkeligheden (v3.15.1**, brugeren: "nogle gange tjekker for offside selv om der ikke scores og andre for
  røde kort, andre igen for om der er straffespark"; før var VAR en chancetype: 22 % af chancerne, 0,50 annullerede mål og
  60 % af skuddene på mål). Chancen afgøres først; VAR tjekker situationen bagefter. Tallene i `match-rules.js` (`VAR_RULES`,
  `MISS_P`) – lodtrækninger, aldrig afhængige af modstanderens indstillinger (§3):
  - **Mål** (afslutning, kontra, hovedstød – også på dødbold): 13,1 % tjekkes synligt, FØR målet bogføres. Referatet:
    "📺 Bolden er i nettet – men VAR kigger på det: stod #9 offside? …" med stillingen talt op, så målet ("📺 VAR: målet
    står – …") eller "MÅLET ANNULLERES!" med stillingen tilbage. Offside (den forreste, som ovenfor; varPulse +
    vsTrapLong·0,045 mod forsvarerens POS) eller 27 % frispark i opspillet (skyttens cynicism). Et annulleret mål tæller
    ingen steder (mål, skud på mål, karakter for mål, Rundens mål); den tjekkede −0,40, forsvareren +0,45.
  - **Straffe**: 26 % tjekkes – filmning (den fældedes theatre; annulleret → gult kort for filmning) eller 31 % offside i
    opspillet; kendelsen falder før straffen tælles. Referatet (Spilfører): "Dommeren peger på pletten … Men VAR tjekker …",
    så kendelsen (VAR_NO_PEN) eller sparket med "📺 VAR: straffesparket står". Rødt kort ligeså: kortet vises, VAR tjekker,
    så udvisningen eller VAR_NO_RED. En cutback (bolden spillet tilbage) tjekkes kun for frispark, aldrig offside. VAR kalder dommeren ud til et straffespark, han ikke så (0,23 % pr. tick).
  - **Rødt kort** (kun direkte, IFAB): 53 % tjekkes (ikke når spilleren allerede har gult – et gult ville også give rødt) –
    den kyniske beholder oftere kortet, ellers bliver det gult; en grov
    tackling uden kort kan opgraderes (4,1 %, oftere for den kyniske).
  - **Linjedommerens flag** (ikke VAR, Spilfører): en afslutning, der ikke går ind, kan være offside (4,3 %) – intet skud på
    mål, intet hjørne, ikke i VAR-tjek.
  - **Forbi** (Spilfører: 67 % på mål – Superligaen ≈ 33–35 %): et skud, der ikke går ind, går forbi/over/på stolpen eller
    blokeres med 62 % (blokeret 66 %, heraf hjørne 88 %; v3.16: 60 → 66 % for at holde hjørnesparkene efter de koblede linjer).
  - **VAR ±** i stillingen: kun kendelser, VAR ændrede – annulleret mål −1 og annulleret straffe −1 for angriberen,
    VAR-straffe +1, rødt trukket tilbage +1 og opgraderet −1 for holdet, der begik frisparket; et godkendt tjek 0 (før +1).
  - Målt (`node tools/measure-duels.mjs 1500 var`; før → efter): mål 2,79 → 2,79, skud på mål 60 % → 39 %, annullerede
    0,50 → 0,16, VAR-tjek 1,09 → ≈0,5 pr. kamp, hjørnespark 3,8 → 3,1. Kalibreret: KEEPER_EDGE 3 → 0,3 og langskud
    min(FIN + 8, 13) → min(FIN + 8, 10) (ellers blev langskud 19 % af målene). Angribernes andel 53 % → 61 % (målene
    afgøres nu af afslutningen, ikke af en VAR-duel uden afslutning – Spilfører: "angriberen scorer næsten aldrig i åbent
    spil"); over dokumentets 44–56 % – bevidst, til næste sæsongennemgang.
- **Modtageren står hvor bolden kommer (v3.12**, brugeren: "den spiller der var nærmest hvor bolden
  blev spillet hen"): modtageren trækkes med vægt exp(−afstand/16)·(10 + evne) (`receiver`): skytten
  nær feltet (50, 20) eller på feltets kant (50, 32; 45 %) efter FIN, hovedstødsspilleren nær feltets
  midte (50, 16) efter luft, cutbackens afslutter ved straffesparkspletten (50, 28) efter FIN,
  kantspilleren ude på kanten (12/88, 30) efter PAC+BAL. Dødbolde: en af de tre bedste i luften.
- **Spillerne rykker med i kampen (v3.12.1**, brugeren: "'Spillerne står på deres plads, de bevæger
  sig ikke under kampen.' Vi måler hvor langt de løber i kampen … løbe uden bold"). Positionerne
  regnes pr. tick ét sted (`positions.js`, `livePositions`) ud fra pladsen (formation eller trukket):
  med bolden rykker holdet frem (CB 14, LB/RB/LWB/RWB 20, midtbane 16, angreb 6), løb uden bold
  skubber løbe-rollerne (LB/RB/LWB/RWB/CM/CDM/ST/CF – de samme som løber flere km) {Få −2, Mange +6}
  frem, og en spiller, der har vundet sit løb, står yderligere 12 frem; ingen længere frem end y = 8.
  Uden bolden ligger holdet efter sit pres (lav blok alle 10 tilbage, højt gegenpres midtbane og
  angreb 12 frem). Hele holdet forskydes mod boldsiden (x + (boldX − 50)·0,3). MV står fast.
  Gemmes ikke (regnes pr. tick). Langskud = skytten står uden for feltet (y ≥ 24; v3.16: y ≥ 30 med koblede linjer) i øjeblikket;
  skuddets værdi er min(FIN + 8, 13) (`longshotBonus`; v3.15.1: loftet 10): midtbanen (FIN ≈ 5) får tid og plads, men på
  afstand er ingen bedre end 13, så en god afslutter står bedre i feltet (QC: med fast +7 scorede en
  angriber uden for feltet ≈ 90 %). Inde i feltet kombination eller dribletur efter evnerne.
  Kontraens skytte vælges i forsvarsformen (holdet har lige vundet bolden) efter PAC.
  Bevidst forskel: løberens zone i teksten ("på kanten/dybt/bag forsvaret", `runZone`) regnes fra
  pladsen + 20 frem, mens tegningen rykker ham ADVANCE + 12 – brikken kan stå lidt anderledes end ordet.
  **Målt pr. formation** (`node tools/measure-duels.mjs 400 formation`, hold 0 mod 4-4-2, mål for/imod):
  4-4-2 1,44/1,22 · 4-4-1-1 1,50/1,22 · 4-3-3 1,52/1,09 · 4-2-3-1 1,12/1,49 · 3-5-2 1,05/1,94 · 4-4-2 med
  ST trukket til y 32 1,48/1,24 (med fast +7: 4-4-1-1 1,78 og trukket ST 1,64 – båndet i
  balance.test.mjs). Kendt følge: 4-2-3-1 og 3-5-2 scorer færre end i v3.12.0 (1,27/1,26), fordi
  spilleren nær målet her ofte er en midtbanespiller med lav afslutning – en sag for en senere version.
- **Målfordeling (v3.12.1**, dokumentet "Spillerhøjde i Superligaen", afsnit om mål: angreb 45–50 %,
  midtbane 30–35 %, forsvar 15–20 %; åbent spil inkl. langskud 60–65 %, dødbolde 25–30 %, kontra
  8–12 %, langskud 8–10 %). Målt (`node tools/measure-duels.mjs 150 maal`): 2,95 mål pr. kamp (v3.13: 3,00);
  åbent spil 62 % (heraf langskud 8 %), kontra 12 %, dødbolde 26 %; angreb 54 %, midtbane 27 %,
  forsvar 19 % (v3.12.0: angreb 75 %, midtbane 15 %, forsvar 10 %, kontra 19 %, langskud 4 %).
  Typerne ligger i dokumentets intervaller; kæderne er 3–4 point fra (angreb over, midtbane under) –
  tæt på, ikke inde i. Kalibreret: KEEPER_EDGE 3,5 (v3.13: 3), CROSS_EDGE 2, SETPIECE_DEF_EDGE 3,75, cutback +8,
  kontra +3 (v3.10: +4), EDGE_SHARE 0,5, langskud min(FIN + 8, 13) (v3.15.1: KEEPER_EDGE 0,3, loft 10; v3.16: kanten
  efter modstanderens pres – EDGE_BY_PRESS).
  Båndet ligger i balance.test.mjs. Brugt fra dokumentet: kæde- og typefordelingen. Ikke brugt:
  enkeltspillernes tal (beskriver Superligaens spillere, ikke spillets).
- **Øjebliksbillede ved mål (v3.12.1**, brugerens valg "Også på minibanen ved mål"): et mål i åbent
  spil (GOAL, HEADER_GOAL; VAR_GOAL i gem fra før v3.15.1) i en kamp med dit hold gemmer `snapshot` = DIT holds 11
  positioner i øjeblikket (`pts: [[spiller-id, x, y] …]`), bolden og – når I scorer – scorer og
  oplægsgiver. Også kontramål (dit hold står da i angrebsform – det mistede bolden fremme). Ved
  solo-mål (langskud, dribletur) står bolden ved skytten. 📍 ved målet i referatet (efter slutfløjt,
  forklaret i ikonforklaringen) viser det på minibanen i karakterarket; "↩ Startopstilling" går
  tilbage. Ingen 📍 på dødbolde (positionerne der er ikke regnet). Ved modstanderens mål vises kun
  dit forsvar og bolden (§3). Ældre runder uden snapshot viser startopstillingen som før.
- **Luftduellen i to trin (v3.12**; før vandt angriberen ≈ 4 % i åbent spil mod CB + keeperens
  evne·0,38, og en vundet duel var altid mål): 1) `luft·friskhed + rnd·6 (+2 i åbent spil; v3.12: +1) >
  CB.luft·friskhed + rnd·6 + (dødbold 3,75 (v3.12: 4,5) | lav blok 1)`; 2) `luft·friskhed + rnd·8 > MV·friskhed +
  rnd·8` – ellers redning (skud på mål). Clearet høj bold → hjørnespark 35 % (efter en
  redning 90 %). Dit hold får kilden nævnt ("Dit indlæg"/"Din lange bold").
- **Cutback (v3.12)**: kantspilleren `(PAC+BAL)·friskhed + rnd·8` mod den nærmeste back (v3.16, koblede linjer: eller kanten, der
  er faldet med hjem – den, der står nærmest på hans side)
  `(PAC+POS)·friskhed + rnd·8 − 2 + kantpres` (højt gegenpres +3, lav blok −2 – modgiften); lukket
  kant = ingen afslutning (hjørnespark 35 %), ellers afslutning med +8 (v3.12: +5) og oplæg til kantspilleren.
  Tekst: "✅ #11 X når baglinjen og lægger den lavt tilbage til #9 Y" for dit hold; for andre neutral
  ("↩️ … spiller bolden tilbage i feltet" / "🛡️ #2 Z lukker kanten mod …").
- **Målt v3.12** (`node tools/measure-duels.mjs 100 fokus`): pr. pasningsstil ligger de tre fokus
  netto inden for ca. 0,15 af hinanden; cutbacks ≈ 1,1 pr. kamp ved lave cutbacks (stoppet 19/30/55 %
  mod lav blok/mellemblok/højt gegenpres), angriberen vinder ≈ 43 % af de åbne luftdueller (33 % mod
  lav blok); ligaen 2,82 mål pr. kamp, 23 % hovedstød (åbent spil + dødbolde), 21 % dødbolde (`… 100`);
  Rundens mål (`… 30 saeson`): cutback 24 %, frispark 22 %, langskud 17 %, dribletur 11 %, hovedstød
  10 % … – ingen over 30 %; friskheden uændret (startelleven ≈ 85 %).
  **v3.12.1** (`… 100 fokus`): fokus pr. pasningsstil inden for 0,19 netto; angriberen vinder ≈ 50 %
  af de åbne luftdueller (≈ 40 % mod lav blok); cutbacks stoppet ≈ 20/32/54 % (målt før v3.16 – med koblede linjer lukker også en hjemfalden kant; se `… fokus`) mod lav blok/mellemblok/
  højt gegenpres. Løb (`… 300 loeb`, netto pr. kamp): mod Hold på bolden Mange +0,16, Normal +0,01,
  Få −0,00; mod Lynkontra Få −0,00, Normal −0,01, Mange −0,04. Få og Normal ligger nu inden for
  målestøjen (≈ 0,05) af hinanden – Få's fordel er færre kontraer imod (0,03 mod 0,08) og mindre slid.
  Ligaen 2,85 mål pr. kamp, 26 % dødbolde, hovedstød 22 % (`… 100`). Rundens mål (`… 30 saeson`):
  frispark 22 %, cutback 22 %, langskud 20 %, dribletur 13 %, hovedstød 12 % … – ingen over 30 %;
  friskheden uændret (startelleven 85 %).
  **v3.13** (`… 30 saeson`): langskud 27 %, cutback 19 %, frispark 16 %, hovedstød 16 %, dribletur 9 %
  (v3.12.1: 13 % – trætte spillere og KEEPER_EDGE 3; båndet sænket fra 9 til 8 %).
- VAR-tjek: se "VAR som i virkeligheden" (v3.15.1; før en chancetype ved roll < 0,22).
- Afslutning: `FIN + rnd·8 > GK + rnd·8 + 0,3` (v3.15.1: 0,3 – VAR-chancetypens mål skulle erstattes; v3.9 havde en målmandsfordel på 5; v3.10 fjernede den;
  v3.12 gav 3 tilbage, v3.12.1 3,5 – kalibreret til målfordelingen ovenfor; v3.13 3, fordi målmændene
  taber mindst friskhed i kampen – ellers faldt målene til ≈ 2,5).
- **Dødbolde (v3.10**, brugeren: "mål på hovedstød, straffe eller dødbolde. Antallet af frispark"):
  kun til holdet med bolden i en tick uden boldtab. Straffespark 1,1 % pr. tick: holdets bedste FIN,
  `FIN·friskhed + rnd·8 + 2,3 > MV·friskhed + rnd·8`. Frispark i skudafstand 6,1 %: 37 % direkte
  skud (bedste FIN+PAS, MV +4; FREEKICK), ellers indlæg fra bedste PAS til en af de tre bedste i
  luften – også stopperne (SETPIECE). Hjørnespark 90 % efter en redning, 35 % efter en clearet høj bold
  eller lukket kant (CORNER, v3.12). Dødbolds-luftduellen er den samme som i åbent spil, med forsvaret
  +3,75 (v3.12.1; v3.12 +4,5; før +0,5 og keeper-tillæg). "Stille" frispark 58 % pr.
  tick tælles uden hændelse. Gult kort kun ved det taktiske frispark (skade-frisparkets tekst nævner
  intet kort). Kontramål giver assist til den nævnte oplægsgiver; kontra-afslutningen får +3 (v3.12.1; før +4).
  **Målt** (`node tools/measure-duels.mjs 100`): 2,80 mål pr. kamp (Superligaen ≈ 2,8; v3.9 1,44),
  23 % af målene på dødbolde, 0,27 straffe pr. kamp (77 % scoret), 4,2 hjørnespark, 20,9 frispark,
  2,1 gule kort pr. hold pr. kamp (Superligaen ≈ 2).
- **Fuldtids-analyse (v3.10**, brugeren: "Ved pausen får jeg information om hvordan min opbygning har
  klaret sig, men det får jeg ikke af vide ved fuldtid"): kun din kamp – besiddelse, afslutninger,
  opbygning og pres for hele kampen, dødbolde (frispark i skudafstand, hjørne, straffe) og frispark
  begået/tilkendt, samt løb uden bold og kontraer imod (erstatter v3.9's separate linje). Fra v3.12
  desuden "⚔️ Angreb (dit fokus · din pasningsstil): N cutbacks (M mål, B stoppet ved kanten), H høje
  bolde (V vundne luftdueller, K hovedstødsmål)" og "🛡️ Dit felt: modstanderens cutbacks stoppet L af
  C, luftdueller vundet X af Y" (cutbacks fra løb på kanten tælles med).
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

### Kampens spor, 2D-afspilning og heat map (v3.16)
Brugeren: "et heat map for kampen, både for holdet, men også for den enkelte spiller … en 2d simulering af kampen … så vi
bedre kan kontrollere spil motoren".
- **Sporet** `m.trace = { v: 1, frames, moments }` (match.js "Kampens spor"): 31 grundbilleder (t 0 = afspark, t = tick =
  minut/3) efter tick'ets duel – `{ t, poss, ball, h: [[id, x, y]…], a, lost?, run?, offside? }` – og et øjeblik pr. afslutning
  i åbent spil og kontra (mål, redning, forbi/blokeret, linjedommerens flag, VAR-tjek, annulleret mål) med skytte, scorer og
  oplæg. Dødbolde (straffe, frispark, hjørne) har bevidst intet billede. Ét koordinatsystem: hjemmeholdet angriber mod y 0,
  udeholdet spejles; heltal. Kun aflæsning – intet rng-træk, ingen skrivning i `seen`/`seenX` (fingeraftryk af 20 kampe,
  trace-golden.test.mjs). Ca. 18 KB pr. kamp; gemmes kun i seneste runde (`lastRound`), så ældre runder og gem fra før
  v3.16 viser "Ingen afspilning".
- **Kontrolværktøjet** `node tools/trace-invariants.mjs [N]`: regler (31 billeder, 7–11 spillere, på banen = arkets skift og
  udvisninger, scoreren og spillerne i øjeblikkene, bolden ved skytten) og motor-viden: hvor målscorerne stod pr. måltype
  og hvor ofte holdets forreste stod bag modstanderens sidste forsvarer (før de koblede linjer ≈100 %, nu 0 %).
- **Koblede linjer (v3.16**, Spilførerens sæsongennemgang i afspilningen: angriberne stod altid langt offside, forsvarende
  angribere ved modstanderens mål, kontramål fra midterlinjen, "langskud" fra hjørneflaget; brugeren valgte "ret linjerne
  først"). `coupledPositions` (positions.js) oven på holdenes egen form (`livePositions`, uændret) – ét sted, som
  modtagervalget, VAR-forreste, langskud, 📍 og sporet læser (match.js `shapes` → `seen`):
  - holdet med bolden står på eller bag offside-linjen = modstanderens sidste markspiller (+1), undtagen løberen, der har
    vundet sit løb (RUN_STEP frem – sluppet igennem). Udviste spilleres pladser tæller ikke som linjen;
  - holdet uden bold rykker som en blok, så de forreste står PRESS_GAP foran boldholdets bageste (lav blok 20, mellemblok
    10, højt gegenpres 2; angreb hele vejen, midtbane det halve, forsvar ikke – QC: et hårdt loft gjorde presset ens).
    Ikke ved en kontra: det fangede hold står fremme;
  - kontraens skytte løber COUNTER_RUN 24 mod målet fra sin plads; oplægsgiveren er aldrig skytten;
  - den almindelige afslutning: kun spillere inden for SHOT_REACH 28 af skudstedet skyder (Spilfører: en stopper skød fra
    egen halvdel; 18 og 25 vendte målfordelingen og modgift-båndene) – langskud fra skudafstand også ved redning og forbi;
  - langskud = skytten står på y ≥ LONGSHOT_Y 30 (før 24 – angriberne står nu på linjen ≈28), også efter et vundet løb
    (før efter zonen); en kantløber skyder sjældnere selv (DECISION_ZONE.SHOT.WIDE 1 → 0,3);
  - afslutning fra kanten efter modstanderens pres (`EDGE_BY_PRESS`: lav blok 0,75, mellem 0,5, højt 0,35 – Spilfører:
    "lav blok lukker feltet: de skyder udefra");
  - ét billede pr. øjeblik (QC): positionerne er afleveringens øjeblik; i afslutningens billede står skytten i feltet
    (y ≤ SHOT_BOX_Y 12, x 30–70; langskud y 30–38, x 20–80), og i et offside-billede står den tjekkede på den side af
    linjen, VAR-kendelsen siger (kendelsen er stadig lodtrækningen). Afsparksbilledet: begge hold i egen halvdel.
- **Formationerne i billedet (v3.16.1**, brugeren: "2 spillere stående lige oven i hinanden … 7 spillere på midterlinjen ved
  start … ingen udvikling i starten af kampen … ingen heat map for modstander"):
  - sammenpresning i stedet for klemning (`squeeze`): de, der står foran målet for linjen/presset eller inden for
    SQUEEZE_SPAN 12 af det, mappes lineært ind i [mål, mål + 12]; resten står. Rækkefølgen bevares. Holdet uden bold beholder
    mindst MIN_DEPTH 18 fra forreste til bageste (boldholdet ikke – dets forreste må aldrig forbi linjen);
  - to fra samme hold nærmere end MIN_APART 6 skubbes fra hinanden på tværs; en fra boldholdet (også løberen) nærmere end 6
    ved en modspiller (også målmanden) træder til siden – kun x, så linjen og offside er uændrede; ved en erobring træder
    det fangede holds angriber til siden fra boldholdets målmand (ændrer kun 📍-billederne, ikke kampene);
  - afsparket (`kickoffPositions`): forsvarsformen presset ind i egen halvdel med forreste på KICKOFF_Y 53 (højst KICKOFF_OWN
    51, også hvis dybden ellers ville skubbe ham over midten);
  - grundbilledet pr. tick tages efter duellen (før afslutningerne, ingen nye træk): ingen duel → bolden hos opspilleren,
    holdene forskudt efter hans side; opbygning vundet → bolden spillet frem til angriberen på linjen (`run`; v3.16.1 Spilfører: ikke et løb alene mod keeperen); pres vundet → det
    erobrende hold i sin kontraform, bolden hos presseren (`lost`; også "ude af zone"); offside-fælde → angriberen foran
    linjen (`offside`). `poss` er tick'ets besiddelse; spillerne er dem på banen ved tick'ets start;
  - motoren måler som v3.16.0 (150 sæsoner: 2,90 mål, langskud 7 %, angreb 66 %); bånd og billedregler i
    tests/unit/replay-shapes.test.mjs (hvert rødt mod v3.16.0);
  - v3.16.2 (brugeren: "minut 24 og 27 er ens i 2d"): ville et billede uden duel være identisk med forrige, står bolden
    hos holdets forsvarer nærmest opspilleren (holdet spiller den rundt bagfra) – kun boldholderen skifter, formen er den
    samme (en tegneregel, ingen motorviden; ingen træk, kampene uændrede). Efter en duel må to billeder være ens
    (underteksten siger udfaldet);
  - afspilningens ene tegnede trin (v3.16.2, replay.js `shotEnd`, brugeren: "Man ser aldrig bolden nærme sig målmanden"):
    efter hvert mål, redning og forbi flytter kun bolden sig (1,1 s) derhen, referatets linje siger – i nettet ved siden
    af målmanden, ind til ham, hos den blokerer, referatet nævner (ellers forsvareren nærmest skytten), på stolpen i
    målets forkant, over overliggeren (bolden vokser og toner ud – set ovenfra lå punktet ellers i nettet) eller forbi den
    fjerne stolpe. Brikkerne står som i øjeblikket, også når man går baglæns ind i trinnet. Målet er tegnet (x 44–56). VAR-tjek, annulleret mål og flag har intet sådant trin. 🎬 viser
    afslutningen og standser på udfaldet;
  - modstanderens grove kort: 3 × 3 felter set fra din side (`zones`, procent pr. felt, målmanden ude) med hans afslutninger
    (`zoneShots`).
  Målt (`… 150 maal`, `… 1500 var`, 800 kampe pr. pres; før → efter): mål 2,80 → 2,79, langskud 12 → 8 %, angreb 61 →
  62 %, midtbane 24 → 22 %, kontra 13 → 10 %; mål imod lav blok 1,34 → 1,35, langskud imod lav blok 10 → 8 % (gegenpres
  12 → 7 %). Hjørnespark holdt med MISS_BLOCK_SHARE 0,66. Med SHOT_REACH (sidst): mål 2,8 → 2,87, langskud ≈ 6,5 % (under
  dokumentets 8–10 % – stopperne skød langskud før; bevidst), angreb 65 %, mål imod lav blok 1,38, langskud imod lav blok 7 %
  mod gegenpres 5 %.
- **2D-afspilningen** (Kamp-fanen, kun efter slutfløjt – den levende afspilning af referatet er uændret, så intet afsløres
  før tid): taktiktavle med begge hold og bolden, ▶/⏸, ⏮ ⏭ trin, 1×/2×/4×, ⭐ Højdepunkter (kun afslutningerne); 🎬 ved en
  afslutning i referatet springer dertil. Rolige tick 0,7 s, afslutninger 2,6 s med referatets linje som undertekst
  (Spilfører). Bolden flytter først, spillerne glider efter; ingen opfundne mellembilleder – undtagen afslutningens udfald (v3.16.2),
  der er tegnet ud fra referatets linje. Et grundbillede viser
  stillingen fra FØR tick'ets hændelser.
- **Heat map** (karakterarket, dit hold): 🔥 viser holdets tæthed (6 × 9 felter, uden målmand) af grundbilleder og
  øjeblikke, og et klik på en spiller hans – med hans afslutninger efter udfald (⚽ mål, reddet, forbi, offside, annulleret,
  🅰 oplæg; Spilfører: positionerne alene er "der hvor du satte ham"). Modstanderen: "Tyngdepunkt (groft)" i tredjedele og (v3.16.1) et 3 × 3 zone-kort
  med "Deres mål" øverst og "Dit mål" nederst (i rundens andre kampe "Modstanderens mål", uden "din side").
  Afspilningens undertekst siger for hvert grundbillede, hvordan duellen gik (har bolden / spiller sig frem til angriberen / erobrer /
  offside).
  Kendt begrænsning: kun seneste runde (en sum over sæsonen er et senere ønske).

## 6. Karakterer, MotM, avis
- Start 6,5 (±0,15), klemt 3,5–10,0 – fra v3.15 først til sidst (justeringerne summeres uden loft, så overskud fra mål
  ikke tabes); vundet taktisk duel/pres +0,20 (`DUEL_BONUS`, før +0,35). Kampens og Rundens spiller rangeres ens
  (`motmOrder`: karakter, så mål·2 + oplæg), og en udvist kan ikke vinde. Resultatet tæller: sejr +0,4, nederlag −0,4
  (`RESULT_BONUS`), og redninger ud over 4 giver kun det halve (Spilfører: en målmand på det tabende hold vandt Kampens og
  Rundens spiller tre runder i træk). Målt (600 kampe): Kampens spiller fra det tabende hold 15 % → 2,5 %, målmand 32 % → 23 %.
  Målmanden svækkes også af ti mand (forenkling). Hovedstødsmål +1,35, mål
  +1,25, oplæg +0,55, redning +0,50 (skytte +0,10), forbi 0, annulleret mål for offside −0,40 til den tjekkede
  (forsvarer +0,45; v3.15.1 – VAR-mål +1,30 fandtes til v3.15.0), annulleret for frispark −0,30, filmning −0,30, straffe
  annulleret for offside −0,20 til den tjekkede, linjedommerens flag −0,10 til den offside / +0,20 til forsvareren, blokering +0,10, vundet luftduel +0,40, mål imod forsvarer −0,35 / GK
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
  LONGSHOT (fra v3.12.1: skytten står uden for feltet, §5; før vægtet af FIN) og DRIBBLE (vægtet af PAC+BAL), begge uden oplæg, COMBINATION, CUTBACK (fra v3.12 kun fra
  en rigtig cutback – hændelsen eller et vundet løb på kanten, der ender i en aflevering – for alle
  hold; før: DIT holds LOW_CUTBACKS 42 % af almindelige mål, andre tilfældige 12 %), HEADER, VAR (kun i gem fra før
  v3.15.1 – nye mål får aldrig typen VAR; tekster og label beholdes til gamle gem). Fra v3.9
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
  **v3.12** (`… 30 saeson`): se målingen i §5; ingen type over 30 % (båndet i balance.test.mjs).
- **Klummen (v3.14**, brugeren: "avisen er stadig kedelig"; `column.js`): avisen er en klumme, bygget VED VISNING
  for den, der ser (brugeren: afsnit 1 "skal varieres så det er den indlogget spillers hold det indeholder"):
  overskrift efter rundens største historie (overraskelse, comeback, sent drama, stime brudt, din store sejr);
  1) **Din kamp** – resultat, drama og højst 2 sætninger om dine valg med belæg fra din kamprapport (`ownReport`,
  gemt ved kampen: den spillede taktik og dueltallene – samme objekt som fuldtids-analysen); 2) **De øvrige kampe**
  – fed overskrift pr. kamp (klik = referatet) og én sætning (comeback, sent mål eller stil-gæt); 3) **Rundens
  spiller og mål** – begrundet i offentlige handlinger (mål, oplæg, redninger, luftdueller), link til målet;
  4) **Formen** – overraskelsen, stimer på 3+ og toppen; 5) **Næste runde** – din modstander, hans form og et bud på
  hans stil ud fra hans seneste 1–3 kampe (gennemsnit, se §3) (offentlige tal i runde-historikken, `facts`), og runden efter følger
  journalisten op på, om buddet holdt. Ingen tilfældighed (samme runde → samme klumme); varianter rykker videre fra
  runde til runde; ingen hel sætning mere end 3 gange på en sæson (column.test.mjs). Gamle gem får også en klumme
  (bygges af de gemte kampe); dit holds løber og sæsonslut står som før.
  Sandhedsregler (QC v3.14): "sejrsmålet" kun når vinderen scorede sidst fra uafgjort i 80.+ (ikke et
  reduceringsmål); en årsag til et kontramål imod kun med belæg (mange løb uden bold i din spillede taktik); stil-gættet
  "indlæg og hjørner" kræver hovedstød i mindst halvdelen af målene eller 7+ hjørner; et ikke-udført Hvis-Så-skift
  tæller ikke som omorganisering; ved sæsonslut står mesteren, og ingen stime fra den gamle sæson i optakten.
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
  svagere; fra v3.13 under botens udskiftningsgrænse + 10 for en bænkspiller på mindst grænsen + 15.
  Målt over 10 runder (`… 30 saeson`): startelleverne ≈85 % i snit (v3.10: ≈81 %).
- **Friskhed i kampen (v3.13**, brugeren: "Friskhed skal ændre sig i løbet af kampen, ellers en stamina
  ikke så vigtig en evne"; `freshness.js`). Prisen ovenfor ændrer sig næsten ikke med STA (højt STA løber
  flere km: CM STA 6 ≈ 15, STA 16 ≈ 13). I kampen taber spilleren pladsens grund-km · pres · løb uden
  bold · genpres · (2,2 − 0,08·STA, mindst 0,3) point pr. 90 min (CM STA 6 ≈ 20, STA 10 ≈ 16,5, STA 16
  ≈ 11, målmand ≈ 7,7), og hvert tabt point gør ham 0,6 % svagere oven i friskheden før kampen (20 point
  → 12 %). Friskheden EFTER kampen regnes som før (km-prisen). Målt (`node tools/measure-duels.mjs 30
  skift`, 600 kampe, alle markspillere STA 6 mod 16, ingen skift): netto 0,24 mod 0,90 mål pr. kamp –
  forskellen 0,66 (før v3.13: 0,30 mod 0,77 = 0,47; STA tæller også i presset); i sidste kvarter 0,06 mod
  0,17 (før 0,04 mod 0,13). Bevidst: et point tabt I kampen koster 0,6 %, et point friskhed fra før kampen
  0,25 % – "friskhed i kampen" i skiftteksten er derfor ikke helt samme skala som friskheden i Trup.
- **Udskiftninger (v3.13**; `match-rules.js`, "skal kunne defineres af systemadministrator, men skal som
  udgangspunkt følge FIFA/UEFAs regler for turneringer"): 5 skift i højst 3 pauser (IFAB Law 3);
  flere skift i samme tick er én pause, halvlegen (45') er gratis; skadesskift tæller med. Udeladt:
  hjernerystelses- og forlængelses-skift. Holdets grænse `team.subsLimit` (Taktik, 50–85 %, 0 = fra;
  dit hold 70 %, bots 65/70/75 efter profil): i hvilket som helst minut (brugeren: "uanset hvor langt
  man er kommet i kampen") skiftes de under grænsen – fra v3.15 højst 3 ad gangen, også i pausen –, lavest først, mod den bedste friske
  (≥ grænsen + 5) i samme kæde; bruges pausen, tages også dem ≤ 5 over grænsen med. Målmanden skiftes
  kun ved skade. Dit hold får besked, når grænsen ikke kan følges (skift/pauser brugt, ingen frisk på
  bænken), og efter kampen, hvor meget friskhed de udskiftede sparede. Hvis-Så kan også være en
  udskiftning (spiller ud/ind efter id; første tick fra minuttet); bænkspillere i dine regler bruges
  ikke til træthedsskift; Taktik advarer straks, når en regel ikke passer til opstillingen. Afviger fra
  kilden (§10.1 "energi·0,1 + karakter"): vi vælger efter friskhed i kampen alene – managerens grænse
  er en friskhedsgrænse. Intet træthedsskift i sidste tick (90'). Målt (`… 30 skift`): 2,8 skift pr. hold
  pr. kamp (træthed 2,4, skade 0,3), ≈ 80 % efter pausen (de 20 % før er især hold med højt pres og
  skadesskift); 2,75 mål pr. kamp over en sæson (runde 1, alle friske: 3,00 – `… 150 maal`);
  startelleverne ≈ 86 % efter 10 runder; "kunne ikke skifte" 0,5 pr. kamp for dit hold. ▶-advarslen
  følger grænsen (markspillere). Bånd i balance.test.mjs.

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

Slutstilling (v3.14.3, brugeren: "man kan derfor ikke længere se slutstillingen for sæsonen"): efter sæsonens sidste
runde, indtil første runde i den nye sæson er spillet, viser Liga-fanens tabel "slutstilling, sæson N" med mesteren
(fra `league.seasons`); derefter ligger den under "Tidligere sæsoner". Langskud (v3.14.3): i billedet står skytten højst
på `LONGSHOT_FAR` = 38 (skudafstand). Med dit holds løb (✅) slutter målteksten kort; den fulde beskrivelse er Rundens mål.

## 8b. Statistik på Liga-fanen (v3.10)
Fra v3.14.1 (brugeren: "Statistik skal tælle for sæsonen og ikke siden en eller anden runde") står sæsonen i
overskrifterne ("Spillere (sæson 2)"); runder vises sæson-relativt. Kun et gem, der var midt i en sæson, da
statistikken kom, mangler sæsonens første runder (de er ikke gemt) – det siges i én linje, og fra næste sæson tæller
hele sæsonen.
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

1. ~~Taktiske/træthedsbaserede udskiftninger~~ Med i v3.13 (§5 "Udskiftninger"): 5 skift i 3 pauser efter
   IFAB (kildens "maks 3" var den gamle regel), valgt efter friskhed i kampen – ikke kildens energi·0,1 + karakter.
2. MotM-balance: afslutning uden mål 35 % blokeret (forsvarer +0,30), 30 %
   forbi, 35 % redning (+0,22); mål +1,45, oplæg +0,75, taktisk gennembrud
   +0,40; MotM-vægt = karakter + 0,35·mål + 0,20·oplæg + 0,10·dueller − GK-fradrag;
   GK redning +0,32, efter 3 redninger +0,15, −0,40 pr. mål imod.
3. ~~Journalist-klumme~~ Med i v3.14 (§6 "Klummen"). Oprindelig tekst: Journalist-klumme i 4 afsnit på ligasiden efter hver runde (hovedhistorie,
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
