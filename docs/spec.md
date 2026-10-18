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
| Kampprogram | 14 runder Berger-tabel hjemme/ude (v2.5b parrer altid i samme indeksrækkefølge, og eget hold er altid hjemme) | tabt |
| Kalender | 3 kampe/uge tir/tor/søn, fredag træning+økonomi, sæson = 5 uger, fodboldår = 2 sæsoner, +1 år alder pr. fodboldår | udskudt |
| Klubkasse | 5.000.000 kr. | med (vises; ingen økonomi endnu) |

## 2. Spillere

- Trup 18: #1–11 start (`lineupSlots`), #12–18 bænk.
- Blueprint: #1 GK STARTER, #2–3 DEF STARTER, #4 DEF STAR, #5 DEF, #6–7 MID
  STARTER, #8 MID STAR, #9 ATT STARTER, #10–11; bænk #12 GK ROTATION, #13 DEF
  ROTATION, #14 DEF TALENT, #15 MID ROTATION, #16–18 (afskåret: fordel MID/ATT
  TALENT/ROTATION).
- Rolle-tiers: STAR 24–28 år, evner 11–15, arketype-chance 0,75 · TALENT 17–19
  år, 6–10 · ROTATION 21–28 år, 7–11 · STARTER 21–27 år, 9–13, chance 0,30.
  (TALENT/ROTATION-chance afskåret: brug 0,15/0,20.)
- 9 evner (1–20): `pace, stamina, strength, ballControl, passing, finishing,
  positioning, intercepting, goalkeeping`, vægtet efter kæde (GK goalkeeping
  base+2, andre 1–2; finishing for ikke-ATT 2–9). `rollStat` er
  trekantsfordelt og klemt til 1–20.
- Højde: GK/DEF 181–198 cm, øvrige 172–195. Springkraft 1–20.
- **Luftduel** `aerialPower = round(heightScore·0,35 + jump·0,35 +
  strength·0,15 + positioning·0,15)`, `heightScore = clamp(1..20,
  round((cm−168)·0,70))`. Mellemregningen vises på spillerkortet.
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
- Offentligt: navn ("F. Efternavn" på banen), rygnummer, kæde, alder, højde, friskhed, skadesstatus 🚑, stjerner (★☆☆☆☆–★★★★★).
- Kun ejer: 9 evner, spring, luftduel, arketype, løn/værdi, kasse, taktik,
  eksakt karakter, mod-kunnen.
- Ingen: VAR-profil (kun via clues).
- Modstandere vises med "🔒 ??"; sortering på skjulte kolonner hos et
  modstanderhold afvises; skift til bot-hold nulstiller sortering.
- Referat og clues må ALDRIG indeholde en modstanders tal (v1.7-fejlen "FIN: 7").
- I trin 1 er det kosmetisk (alt ligger i browseren). Reel beskyttelse kræver
  server-motor — **udskudt** til trin 2.

## 4. Taktik
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
  CENTRAL/HIGH_CROSSES/LOW_CUTBACKS · Fase 2 pressingHeight
  LOW_BLOCK/MID_BLOCK/HIGH_GEGENPRESS, offsideTrap OFF/NORMAL/EXTREME_VAR_LINE,
  tacklingIntensity CAUTIOUS/NORMAL/AGGRESSIVE · Fase 3 onBallWon
  FAST_COUNTER/KEEP_POSSESSION, onBallLost COUNTER_PRESS_5S/DROP_BACK.
- Hvis-Så: maks 5 one-shot, betingelse TRAILING/LEADING_BY_1/DRAW, felter
  `{ruleId, minuteTrigger, condition, newFormation, slotRemapping[11]}`.
  Default 65' TRAILING → 3-4-3. **Rettet:** v2.5b logger kun skiftet og
  kører kun hjemmeholdets regler — de skal reelt skifte formation, for begge.
  UI til at redigere minut/betingelse/formation: med.
- Bot-hold har hver sin taktiske profil (`BOT_TACTICAL_PROFILES`).

## 5. Kampmotor (v2.5b)
Tick hvert 3. minut (1..90).
- Boldbesiddelse: midtbanens (PAS+BAL) + Mod·0,03 + rnd·8 (mod rnd·7,5).
- Fase-duel 48 %: opbygning PAS+BAL+rnd·7 mod pres INT+STA·0,6+rnd·7, + Mod·0,03,
  sten-saks-papir: SHORT slår LOW_BLOCK, DIRECT_LONG slår HIGH_GEGENPRESS,
  HIGH_GEGENPRESS slår SHORT, LOW_BLOCK slår CENTRAL (bonus afskåret: brug +3).
- Positions-vurdering 25 %: ude af zone (>28) −0,45 karakter (presspiller
  +0,35), ellers +0,40.
- Offside-fælde 45 % hvis ikke OFF. Kontra-tekst ved FAST_COUNTER.
- Frispark 6 % med gult kort (−0,35); heraf skade 40 %, 1–3 kampe, auto-
  indskiftning fra bænken.
- Chance 30 %; xG 0,13–0,35 pr. afslutning. Høje bolde 55 % ved
  HIGH_CROSSES: `aerial + rnd·6 > forsvarer.aerial + gk·0,4 + rnd·…`.
- VAR-tjek ved roll < 0,22: `varPulse + vsTrapLong·0,025 + rnd·6 > forsvarer.POS + rnd·…`.
- Afslutning: `FIN + rnd·8 > GK + rnd·8`.
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
  −0,25, clean sheet +0,50 til GK/CB/LB/RB.
- Deltagerliste med minutter (også skadede og indskiftere).
- Eget hold eksakt karakter; modstandere 1–5 stjerner af karakter + støj
  ±0,22: ≥8,35 = 5, ≥7,25 = 4, ≥6,15 = 3, ≥5,15 = 2, ellers 1. Sortering på
  Vurd for modstandere bruger stjerner.
- MotM 👑 = højeste karakter.
- Avis: 🏆 Rundens Spiller (højeste karakter på tværs), 🚀 Rundens Mål
  (`spectacleScore`: hovedstød aerial+(≥80'?5:2)+rnd·4, VAR-mål
  15+(≥80'?6:2)+rnd·4, ellers FIN+(≥80'?4:1)+rnd·5); ingen mål → Rundens
  Defensive Aktion; kort klumme.
- Restitution: startere `freshness − max(4, 14 − round(STA·0,5)) + 8`, klemt
  60–100; bænk +15.

## 7. Mod-kunnen (v2.2b)
- `counterTactics {vsPress, vsLowBlock, vsTrapLong}`, start
  `round((alder−16)·2,2 + POS·1,5) + rnd(−10..+11)`, klemt 12–75.
- Mod en modstander = primær·0,65 + sekundær·0,35 (afledt af modstanderens
  pres, offside-fælde, pasningsstil, angrebsfokus); default 25.
- XP pr. kamp = `round(min/90·(9 + 2·taktikdueller + (mål?2:0)))`, klemt 4–16;
  primær +XP, sekundær +round(XP·0,6), øvrige −3; bund 25 (≥26 år) ellers 12.
- UI: dropdown "Mål-Modstander", kolonne 🧠Mod ("??" og usorterbar for
  modstandere), 3 mod-barer, lilla +XP-badge.

## 8. Regneark (scouting-matrix)
20 kolonner: Pos/#, Spiller, Kæde, Alder, Frisk/🚑, Højde (offentlige), Spring, ✈Luft,
PAC, STA, STR, BAL, PAS, FIN, POS, INT, GK, Gns, ⭐Vurd, 🧠Mod, Arketype/Note,
Byt. Klik = sortér, igen = vend; nyt klik på tal-kolonne starter faldende.
Standard: start-slot 0–10, bænk 100+rygnr. Heatmap 15–20 smaragd, 12–14
lyseblå, 8–11 hvid, 1–7 grå. Filtre Alle/Start-11/Bænk/GK/DEF/MID/ATT. "⤢ Bred
visning". Sortering på kopi med `origIdx`.

## 9. Noter og persistens
- Private manager-noter pr. spiller-id (også modstandere), ikon i tabellen.
- localStorage, auto-gem ved hver ændring, overlever F5, **synlig gem-status
  med klokkeslæt** og knappen "💾 Gem Taktik Nu" (kvitteringen var svaret på
  klagen "nulstiller ved refresh"). "🎲 Nulstil & Rul Ny Liga" kræver bekræftelse.
- **En ny version må aldrig slette ligaen.** Hvert skema-bump har en additiv
  migrering (nye felter får standardværdier, som v2.5b's
  `sanitizeLeagueData`). Kan data ikke migreres: de rå data lægges i en
  backup-nøgle, FØR der tilbydes ny liga, og fejlen vises. Hver PR, der
  ændrer skemaet, tilføjer et fixture gemt af den forrige version og en
  test, der indlæser det med truppen intakt.
- Eksport/import af hele spillet som JSON-fil (backup og flytning mellem
  browsere/domæner).
- Gamle data fra vejleaa.dk kan ikke læses direkte (localStorage er bundet
  til domænet) — se §11 om Firestore-sync.

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
7. Kampprogram: 14 runder Berger hjemme/ude.

## 10b. Layout (skal bevares, selv uden Tailwind)
Mørkt tema (#0f172a, paneler slate-900, lilla VAR-accent, smaragd for gode
tal). To kolonner: regneark + spillerkort til venstre (7/12), formation,
bane og taktik til højre (5/12); "⤢ Bred visning" giver regnearket fuld
bredde. Topbar: klubvælger, gem-status, gem/nulstil. Mobil: én kolonne.

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
| Mod-kunnen +4–16 %, −3 % rust | stemmer | med |
| 1 sæson = 5 uger (14 runder), 3 kampe/uge | ingen kalender; man kan spille runde 1 uendeligt | §10.7 |
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
