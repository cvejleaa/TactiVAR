# Forslag: vejen til v4 (7/11 2026)

Grundlag: de fire Spilførere valgte hver deres bid af backloggen (målt mod v3.33.1, ikke antaget), og Arkitekten
skar det samlede til PR-trin, fandt det, der allerede findes i koden, og samlede gemmeformat-ændringerne.
Fuld udskrift: workflow `wf_b91be535-551` (journal i sessionen).

## Hvad v4 skal betyde

| Område | Løftet |
|---|---|
| Motor | Taktik er et valg, der afhænger af modstanderen og stillingen – ikke en opskrift. Cutbacks og "fælde fra" er ikke altid bedst, kampen ændrer sig, når man fører, hele holdet kan score, og bagefter kan man se, hvor kampen blev vundet. |
| Økonomi | Pengene giver valg over flere sæsoner: markedet handler igen, et talent kan udvikles og sælges uden en gratis genvej, minus har en pris, og kassen har noget at blive brugt på. |
| Klub | Hver sæson har et mål og en historie, man kan huske. |
| UI | Spillet forklarer sig selv og belønner: Taktik som én overskuelig skærm med en guide bag "?", hver kamp får en optakt og en forklaring bagefter, sæsonslut føles som et kapitel. |

## v4 KERNE – 14 PR'er, 20 backlogpunkter, 0 gemmeformat-bump

Tre baner, der rører hver sine filer og kan køre 2–3 ad gangen:

**Motor-banen (match.js – ét trin ad gangen, målt parret efter hvert trin)**
1. `tools/measure-tactics.mjs` – parret sweep af taktikvalg mod 7 botter + modstanderens indstillinger (generaliserer `measure-central`). Først, fordi intet motortrin kan bevises uden. (S)
2. **00 VAR læser taktikken + kalibrering** – brugerens ønske, fast først. Fælden kan vinde OG fejle, Ekstrem ≠ Normal, ca. 0,35 kendelser/kamp, nyt "mål godkendt efter VAR", ét-trins straffe med hold. Accept: "fælde fra" må ikke længere være bedst (i dag 1,395 mod 1,334 point). → **version 4.0.0** (M)
3. **16 Hjemmebane betyder lidt** – findes faktisk skjult i dag (`match.js:1348`, 8 mod 7,5), spec og kode siger "ingen". Navngives, skaleres, måles: H/U/U 38,6/21,9/39,5 → ca. 44/25/31. (S)
5. **6 Cutbacks er ikke altid bedst** – i dag 1,479 point mod 1,334/1,320 for de andre; mange i feltet dæmper cutbacks, højde belønner indlæg. Accept: intet fokus dominerer på tværs af 7 botter. (M)
6. **17 Stillingen ændrer kampen** – føreren tager i dag 57 % af skuddene efter 60'; Hattricks model (−9 % angreb/+7,5 % forsvar pr. måls føring). Accept: < 50 %, uafgjort 19,8 → ca. 25 %. (M)
8. **11 Hele holdet kan score** – ANG 63 % af målene (virkeligheden ca. 50 %); rollevægt i skytte-valget efter `RUN_WEIGHT`-mønstret. Accept: topscorer-andel 0,39 → ≤ 0,33. (M)

**Økonomi/klub-banen (career/transfers/season.js)**
9. **9 + 10 Markedet lever igen** – værdien glider (slet én `Math.round`), botterne over 20 sælger. I dag 2/0/0/1 transfers pr. sæson og alle bot-trupper låst på 22. (S+M)
10. **8 + 57 Køb ung, udvikl, sælg – og minus har en pris** – salgsgebyr efter tid i klubben (ubeprøvet ungdom giver i dag +604.000 kr./sæson gratis), bud 1,0–1,3 × værdi når boten mangler, 1 % rente og kreditgrænse. (M)
13. **27 + 34 Sæsonskiftet føles nyt** – nyt kampprogram hver sæson, ungdom seedet med ligaen. (S)

**UI-banen (ui/*)**
4. **7 + 40 + 22 Kampen forklarer sig selv** – "Det virkede / det virkede ikke" (højst 3 punkter med link til indstillingen) + fem bjælker dit hold mod hans pr. kæde. Data findes allerede (`ownReports`) – intet nyt felt. 22: referatet gentager ikke samme sætning 10 gange. (M)
7. **F4 + 0e + 0f Taktik i underfaner** – én linje pr. VALGT mulighed (kun det, motoren beviseligt gør efter trin 2–6), banen hel på første skærm. Taktik 3117 px ved 390 → mål < 2000. (M)
11. **42 + 43 + 12 Optakt og favorit** – favorit/udfordrer som ÉT tal (optakt, avis, fuldtid), din kamp som overskrift. (S/M)
12. **14 + 14b "Din sæson"** øverst i rapporten (placering, sæsonens spiller, topscorer, bedste/værste kamp) + de små fund fra v3.33.1. (S/M)
14. **0d 📖 Spilguide** – sidst, så den beskriver det, der ER landet; tal importeres fra konstanterne. (M)

Mindste udgave, der er værd at have i produktion: trin 1–4 (≈ 4 dage). Hele KERNE: ≈ 2 uger med 2–3 PR'er i flight, ≈ 3 uger sekventielt.

## v4 STOR – KERNE + 9 PR'er, 1 gemmeformat-bump

| Trin | Punkt | Hvorfor i STOR | Beslutning fra dig (⚖) |
|---|---|---|---|
| 15 | 0g Egentlig DM-opgave | usynlig for den, der ikke trækker en DM ned | – |
| 16 | 44 Hvis-Så "Ikke foran", rødt kort, skift én fase | får først værdi efter 17 | – |
| 17 | 15 Bestyrelsens mål – ÉT forventningstal (afledt af sidste sæson, bruges også af sponsor) | nyt tal på Hjem | hvad sker ved misset mål? (kun tekst/bonus – aldrig fyring) |
| 18 | 0b Sponsorvalg: Tryg / Balance / Præstation | dit ønske 2/11; uden stadion forværrer det "rig fra S7" | migreret gem midt i sæsonen får "Balance" indtil næste sæsonstart? |
| 19 | 52 Stadion i 3 trin | kassens eneste sink; snitkassen i S10 er 12,6 mio. | priser/trin |
| 20 | 14+29+55 Historik: spillerens sæsoner, kåringer, 🏛 Historie på Klub | **det ene bump 10 → 11** (bagfyldning fra kamphistorik, højst 2 sæsoner tilbage) | spørges før deploy |
| 21 | 41 + 19 Spilletid udvikler, 24+ vokser lidt | ⚖ | gulvet for reserver (bud: 40 % + 60 % efter minutter) |
| 22 | 2 + 28 Stabilitet kan mærkes, "41 kampe sammen" | efter 41, så rotation ikke straffes to gange | – |
| 23 | 50 En lille pokal | reelt L (SEASON_ROUNDS 14 steder, kamptype i kamphistorikken) – skæres først | format (8 hold, KF/SF/F) og om den koster friskhed |

STOR i alt: 23 PR'er, ≈ 4 uger parallelt / 5 sekventielt; pokalen alene ≈ 1 uge.

## Det, der IKKE bygges (fundet i koden)
- Nr. 1 "sig det når et par bliver stærkt" og nr. 31 "avisen to gange": **allerede lavet** (v3.24.2, v3.31.0) – flyttes til Lavet.
- Nr. 3 offside-fælden: samme mekanik som 00 – ét punkt, én måling.
- Nr. 36 dominans: dækket af v3.25.0 (×2,85 mod ×3,8 før; virkeligheden ca. ×2,5) – måles igen efter 6 og 17.
- Nr. 40's gemmeændring: bortfalder – rapporten pr. kæde gemmes allerede.
- Nr. 51 fans: dækkes af forventningstallet (15) + den tilskuerformel, der findes.

## Udskudt til v5 (Spilførernes egne fravalg, Arkitekten enig)
61 to rækker · 48 form/moral (samme håndtag som 2 – ét ad gangen) · 47 kampens indsats · 49 arketyper med effekt · 46 mandsopdækning · 60 individuelle løb · 53 ansatte · 21 kontrakter · 20 scouting · 65 udlån · 58 kontraktløs pulje · 59 bedrifter · 67 reservekamp · 63 navngivne taktikker · F5/F6 (Trup-kolonner, Liga/Klub-underfaner, marked med søgning).

## Arbejdsform
Hver PR går den sædvanlige vej (Spilførere + QC på planen → byg → TM/QC → RM → draft-PR → grøn CI → merge → live → e2e mod live).
Motortrinnene lander ét ad gangen og måles parret efter HVERT trin, så en ny dominerende strategi ikke kan gemme sig i summen.
De tre baner kan køre parallelt (forskellige filer); `season.js` deles og serialiseres.
