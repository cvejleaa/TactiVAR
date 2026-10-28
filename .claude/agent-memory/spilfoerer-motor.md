# Hukommelse – spilfoerer-motor

Oprettet 2026-10-27 (v3.22.1). Den fælles backlog er `docs/backlog.md`; skriv her kun det, der hjælper DIG næste gang:
fund der er rettet (så du ikke finder dem igen), hvad brugeren har valgt fra, og målinger med deres tal.

## Rettet (gå ikke efter dem igen)
- v3.21.0 spillerne bevæger sig (kort ⇄ km); v3.22.1 afleveringen før afslutningen: skytten onside på linjen, bolden via
  oplæggeren (før stod 486 af 492 skytter efter en aflevering foran linjen i billedet).
## Brugerens valg
- Spillerbevægelse: "kun rolle og taktik" (ikke spillerens udholdenhed – modstanderens kort må ikke røbe den).

## Rundtur 2026-10-27 (v3.22.1, sæson i browseren + scripts i scratchpad, 400–2000 seedede kampe som fingerprint.mjs)
- Grundtal (600 kampe): 2,62 mål/kamp, H/U/U 45/36/19 %, 0-0 5,5 %, skud 24,3, på mål 9,3, gule 4,2, hjørner 3,5 (Superligaen ≈10).
  Browser-sæsonen: 142 mål/56 kampe (2,54), 12 straffe, 12 hjørnesparksmål af 175 hjørner (6,9 %; virkeligt ≈3 %), 0 selvmål.
- Foreslået (ikke i backlog før): Tacklinger læses ingen steder i motoren (identiske kampe Forsigtig/Normal/Aggressiv, 2000 kampe);
  ingen stillingseffekt (førende holds skudandel 62,9 % → 58,1 % efter 60', besiddelse 55,7 → 56,7 %; mål pr. 15 min flade
  279/263/282/239/231/276); hjørner sjældne men dødelige (hvert hjørne = et hovedstød, match.js:806); Høje indlæg domineret af
  cutbacks mod alle 7 bot-profiler; botternes RW/RM(4-2-3-1) er en angriber, LW en midtbane (generator formationPositions):
  RW 0,33 mål/90 vs LW 0,07, RWB 0,067 vs LWB 0,008.
- Backlog #3 (skud uden oplægger) ses også ved "virvar foran mål"/"returbold": skytten alene ved målet, alle andre 30 m ude (R4, R8).
- Gule kort: 1872 af ~1950 begrundes "for et frispark".

## Rundtur 2026-10-28 (v3.24.0) – scripts i scratchpad/m (sweep.mjs, form.mjs, perop.mjs, season.mjs, roles.mjs)
- Taktik-sweep (dit hold mod 7 botter hjemme/ude, 80 seeds = 1120 kampe, fælles seeds): standard 1,501 p/k net +0,163;
  Cutbacks 1,710 (+0,499) – bedst i 10 af 10 formationer (840 kampe hver, +0,12…+0,28 p/k); Høje indlæg 1,502 = Centralt.
  Offside OFF 1,590 (+0,308); EKSTREM = NORMAL (1,501; match.js:1339 læser kun !== 'OFF', counter.js:57 kun mod-kunnen).
  Hold på bolden −0,09 net; Mange løb flere mål begge veje. Pres/pasningsstil: fladt i snit, men tydelige matchups pr. bot (OK).
  Formationer (arrangeByFit): 4-4-2 +0,21, 5-3-2 +0,21, 4-2-3-1 −0,29, 4-1-4-1 −0,43 (truppen bygget til 4-4-2 – forbehold).
- Realisme 10 bot-sæsoner (560 kampe): 2,64 mål, H/U/U 43,2/19,8/37,0 (ingen hjemmebanefordel, schedule.js:3), mål pr. kvarter
  flade, skader 0,72/kamp, røde 0,14, straffe 0,28 (78 %), hjørner 3,8 (7,3 % mål; CB 102 af 155 hjørnemål).
- Hvem scorer (8 sæsoner, 1141 mål): ST 64 %, CB 14 %, CM 8 %, kant 6 %, OM 2 %; kombinationsmål 239/252 til ST (receiver nær
  skudstedet, match.js:1482). Topscorer 10–24 mål/14 runder (snit 15,7), 44 % af holdets mål; 5-4-1's eneste ST oftest.

## Plan-gennemgang samspil (2026-10-27, arkitektplan PR-B)
- Offside-fælden er en HANDICAP i dag: den udløses kun efter vundet pres (match.js:1325) og erstatter erobring+kontra.
  A/B 1200 kampe (scratchpad chem-measure.mjs, motor-kopi med TRAPP/BUILDB-globals): fælde OFF net +0,405, p=0,33 +0,333,
  p=0,45 +0,289, p=0,53 +0,207 (kontramål for 0,343/0,230/0,177/0,147; mål imod uændret ≈1,25–1,29). Højere fælde-p = dårligere.
- Opbygnings-bonus er stejl: build −1,8 → buildWon 52,7 %, net −0,012; +1,2 → 75,9 %, net +0,333 (basis 68 %, +0,289).
- Anbefalet: flyt fælde-hook'en til løbsduellens markør og skru BUILD_CHEM ned. Landet v3.24.0: build 0,3, run 3; fælden IKKE flyttet.
