# NU (3/11): v3.31.2: arketypen på Taktik, ærlige skøn for ungdommen og spillerens statistik på kortet (brugerens ønsker 3/11)

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

---
Tidligere planer: [tidligere-planer.md](tidligere-planer.md)
