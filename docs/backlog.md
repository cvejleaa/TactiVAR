# Backlog – det næste i TactiVAR

Fyldes af Spilførerne (`/spilfoerere`, `.claude/commands/spilfoerere.md`) og af brugerens ønsker. Når brugeren ikke har et
nyt ønske, tages det øverste punkt i "Næste" (CLAUDE.md, "Backloggen"). Et løst punkt flyttes til "Lavet" med version.
Format: **titel** · område · størrelse (S/M/L) · værdi (1–5) · belæg/kilde. 🗄 = rører gemmet (migrering – brugeren spørges). ⚖ = spillets retning – brugeren spørges.
Rangering: brugerens ønsker først, derefter værdi pr. størrelse. Første rundtur: 2026-10-27 (v3.22.1, sæson spillet i browseren
+ 3 sæsoner `measure-lifecycle`).

## Næste
Rundtur 2: 2026-10-28 (v3.24.0, sæson spillet i browseren + `measure-lifecycle` 5 seeds × 3 sæsoner; Spilførernes scripts i
scratchpad – et tal herfra skal måles igen med et committet værktøj, før det begrunder en ændring).
1. **Sig det, når et par bliver stærkt** · UI · S · 4 · samspillets belønning er tavs: første gang det nævnes er runde 8
   (fuldtid); legenden siger ved sæsonslut "Alle par har spillet sig sammen", mens 6 par er stærke. "🤝 Nyt stærkt par: #7 X –
   #8 Y" i opsamlingen efter runden (bånd før/efter som `swapChanges`); legenden tæller de stærke.
2. **Stabilitet skal kunne mærkes – i dag er rotation gratis** · klub + motor · M · 4 · brugeren 2026-10-28: "Ja, mærkbart" ·
   brugerens landstræner-ønske: fast hold mod 3 byttet hver 2. runde = 80,7 mod 77,7 i samspil ≈ 0,2 mål pr. sæson; "stærkt"
   kræver kun snit + 2,4, og et passivt hold står på 81–82 mod ligaens 80 i 3 sæsoner – samspil er i praksis kun en skat på køb.
   Faste par vokser over flere sæsoner, "stærkt" kræver ca. en sæson sammen; mål: et fast hold slår et roterende med 2–3 point
   pr. sæson (værktøj i `tools/`). Rummer det tidligere "kæder"-punkt.
3. **Offside-fælden: slået fra er bedst, Ekstrem = Normal** · motor · S/M · 4 · v3.24.0, 1120 kampe: Ingen fælde 1,590 point
   (+0,308 net), Normal 1,501 (+0,163), Ekstrem 1,501 (+0,169); fælden afgøres først, når presset har vundet bolden
   (match.js ca. 1339, kun `!== 'OFF'`), Ekstrem ændrer kun erfaringskategorien (counter.js:57). Fælden skal kunne vinde OG
   fejle; Ekstrem fanger oftere, men giver en fri mand.
4. **"Tacklinger" på Taktik-fanen gør ingenting** · motor · S/M · 4 · `tacklingIntensity` læses ingen steder i motoren (grep 0,
   igen 2026-10-28); 2000 kampe: samme mål, point og kort. Aggressiv: flere erobringer, men frispark, kort, straffe og skader.
5. **På mobil ligger spillerkortet 3.400 px under banen** · UI · S · 4 · 390 px: tryk på en brik scroller ikke; kortet (bedste
   makker, parrene) starter 3.437 px nede, Taktik er 4.253 px; parrets bånd står ellers kun i brikkens `title`, som ikke vises
   ved tryk. "Se kortet ↓" i beskeden – eller kortet lige under listen.
6. **Lave cutbacks er altid det rigtige valg** · motor · M · 5 · 1120 kampe pr. valg: Cutbacks 1,710 point (+0,499 net),
   Centralt 1,501, Høje indlæg 1,502 – Cutbacks bedst i alle 10 formationer (+0,12 til +0,28 point); en lav blok eller en
   femmandsbagkæde gør intet ved dem (`FOCUS_SHARE` match.js:103, `cutback()`). Mange i feltet dæmper cutbacks, højde belønner
   indlæg – det bedste fokus skal afhænge af modstanderen. Erstatter "Høje indlæg kan aldrig betale sig".
7. **Et nederlag forklarer, hvad der gik galt** · UI · M · 5 · runde 3 (0-1, 12 % bold): fuldtidsanalysen er én talmur – og
   viser tomme tal ("luftdueller vundet 0 af 0" i 13 af 14 runder). "Det virkede / Det virkede ikke" med højst 3 punkter, navn
   og link til indstillingen. Samspillets sætning hører hjemme her.
8. **Køb ung, udvikl, sælg skal kunne betale sig** · økonomi · M · 5 · passiv myVsBots 1,01–1,09 og 0 runder i minus, aktiv
   0,97–1,05 og op til 36 runder i minus; køb koster værdi × 1,3–1,6, bud 0,9–1,0 × værdi; værdien falder 23 % ved 22 år. Bud
   1,0–1,3 × værdi, når boten mangler i kæden; blødt aldersfald. `measure-lifecycle` skal også måle point/placering. Kræver nr. 10 først.
   v3.24.1 (Test Manager, `tools/measure-youth-flip.mjs`): en ungdomsspiller, taget op og holdt et år uden kampe, sælges
   for 1,0 × værdi – +576.000 kr. netto pr. sæson (4 af 4 seeds). En ubeprøvet ungdom skal ikke kunne sælges til fuld værdi.
9. **Værdien følger hele stjerner – holdet koster det samme, lønnen hopper** · økonomi · S · 4 · 10 af 18 egne spillere er
    præcis 1,2 mio. værd (nøglesnit 8,7–13,0); `starsForValue` runder til hele stjerner, `VALUE_BY_STARS` fordobles pr. stjerne
    (`career.js:41-48`) – en spiller over 2,5/3,5 fordobler lønnen (+31–39 % ved sæsonslut). Interpolér på `valueStars`.
    Rummer halvdelen af det tidligere "Prisen modsiger stjernerne"; resten: "Resten af sæsonen" i prognosen.
10. **Markedet går i stå: botterne fylder op til 22 med ungdom** · økonomi · S/M · 4 · passivt, 3 seeds × 5 sæsoner: 0
    transfers i sæson 1–3; bot-trupper 18 → 22, botternes kasse 5,0 → 1,8–3,3 mio., så de ikke kan byde. `openWindow` trin 3
    kræver en køber under 22 OG en sælger over minimum – aldrig sandt samtidig. Ungdom kun op til 20; en bot over 20 sælger sin
    svageste. Rummer "Et marked, ikke et katalog" (botter handler efter behov, handlerne i avisen).
11. **Kun angriberen scorer** · motor · M · 4 · 1141 mål: ST 64 % (Superligaen ca. 50 %), midtbane 16 % (ca. 30 %); 239 af 252
    kombinationsmål til angriberen; topscoreren 15,7 mål på 14 runder (ca. 1,1/kamp mod ca. 0,6), 44 % af holdets mål – 6 af 8
    sæsoner Roskildes eneste angriber i 5-4-1. Skytten er den nærmeste (`receiver`, match.js:1482); vægte efter rolle blandt dem,
    der kan nå stedet. 4-2-3-1 −0,29 og 4-1-4-1 −0,43 net mod 4-4-2 +0,21. Erstatter "Topscorer-koncentration".
12. **Din kamp er altid avisens overskrift** · UI · S · 3 · nu 11 af 14 overskrifter om dit hold (før 5); runde 8 (1-1) fik
    stadig "Overraskelse: Lyngby Tacticians slog Nordkysten BK" (`column.js` STORY). Undtagen mester før tid/sæsonslut.
13. **Almindelige skud, returbolde og hovedstød ser forkerte ud i afspilningen** · motor · S · 3 · "Et virvar foran mål" viser
    skytten alene ved målet (runde 4, 83'), et hovedstød i åbent spil med den eneste angriber i feltet og resten 20–35 m ude
    (runde 12, 90+1'). `trace-invariants`: 0 fejl i 56 kampe – fejlen er i billedet, ikke sporet.
14. **"Din sæson" i sæsonrapporten** · klub + UI · S/M · 4 · rapporten er ren administration; placering, kurve, bedste/værste
    kamp, sæsonens spiller og topscorer – alt fra historikken (`ui/season-report.js`).
15. **Bestyrelsens mål for sæsonen** · klub · M · 4 · 🗄 (lille felt) · midtbanen har noget at kæmpe for, men ingen siger det:
    nr. 4–6 efter runde 9 er 1,9 point fra naboen og flytter 1,8 pladser til slut (10 seeds × 2 sæsoner). Mål efter styrke,
    vist i Klub og Liga, fulgt i klummen, gjort op med bonus.
16. **Hjemmebane betyder ingenting** · motor + UI · S · 3 · brugeren 2026-10-28: "Ja, en lille fordel" · spec §1 og schedule.js:3:
    "Ingen hjemmebanefordel"; 560 kampe: hjemme 1,35 mål, ude 1,29, 43/20/37 % (Superligaen ca. 44/25/31 og +0,3 mål). En lille
    fordel i opbygning og dueller (ca. +0,25 net), sagt i referatet; spec og tekst rettes med.
17. **Stillingen ændrer kampen** · motor · M · 4 · førende efter 60' tager 58 % af skuddene (før 63 %); målene pr. kvarter er
    flade (239/256/234/237/268/244 – i virkeligheden flest til sidst); uafgjort 19,8 % (ca. 25 %). Føreren trækker sig,
    den bagudførende kaster folk frem.
18. **Ungdomsskønnet skiller ikke – og kampenes værdi er skjult** · klub + UI · S/M · 3 · 39 af 47 tilbud "har meget mere i sig",
    men potentialet bag ordet er 7,5–14,1 (`roomWords` ser kun på afstand til loftet); 40 % af væksten afhænger af kampe (≈ +2,3
    evnepoint pr. sæson for en 18-årig med fast plads), kortet siger "kampe giver også lidt". Skøn i tre trin efter loftet.
19. **Spillere på 24+ kan udvikle sig lidt** · klub · M · 4 · 🗄 · 45 af 45 på 24+ står ved loftet; sæson 2: 10 af 18 "tæt på
    sit loft". Loft +0,5–1,5 for 24–27-årige, flyttet af træning og minutter.
20. **Scouting du betaler for** · økonomi + UI · M · 4 · 🗄 (`league.scouting` findes) · en anden klubs kort: "Evner …: 🔒 ??";
    vist stjerne mod nøglesnit korrelerer 0,64–0,73; "★★★★★" bygger ofte på 1–2 kampe. "Scout ham – 50.000 kr." viser nøgleevner
    som bånd og et loft-skøn, højst 3 pr. vindue. Rører hvem-ser-hvad (`visibility.js`) – Security.
21. **Kontrakter og lønkrav** · økonomi · M · 3 · 🗄 · kortet viser "kontrakt: 🔒 ??", men kontrakter findes ikke. 1–3 sæsoner;
    udløb giver et valg. (Lønhoppet løses af nr. 10.)
22. **Referatet gentager samme sætning ordret** · UI · S · 3 · "Din balancerede opbygning bryder igennem" 10 gange i runde 3;
    mellemblok-linjen 7 gange i runde 12. 4–6 varianter (vary, intet rng), "for 5. gang i dag".
23. **Hjørnespark: for få og for dødelige** · motor · S · 3 · 3,1 pr. kamp (ca. 10); 7,3 % bliver mål i 560 kampe, 8,1 % i
    browser-sæsonen (ca. 3 %); midtstopperne scorede 102 af 155 hjørnemål. Ca. 3 × så mange, de fleste clearet.
24. **Botterne angriber kun i højre side** · motor + klub · S · 3 · 🗄 (botternes opstilling) · RW 0,33 mål/90 mod LW 0,07:
    generatoren fylder pladserne efter kæde. Kanterne efter fit.
25. **Spillerkortet: tre skriftstørrelser, kamplisten som rå data** · UI · S · 2 · `#card-best` 16 px ("Ingen særlig makker
    endnu" er kortets største tekst), resten 12,8 px (`style.css:59` dækker ikke `#card-chem`, `.marketbox`, `.matchlog`);
    "[Sæson 1, runde 14 • … • 90' • 7,4]". Én størrelse; "kar. 7,4" uden klammer.
26. **🤝 betyder to ting** · UI · S · 2 · "🤝 Holdets samarbejde" på Kamp (afleveringer i én kamp, `ui/matchcenter.js:168`)
    mod 🤝 Samspil (par over flere kampe). Omdøb til "🔗 Kombinationer i kampen".
27. **Hver sæson har samme kampprogram** · klub · S · 2 · sæson 2's program er sæson 1's (`generator.js:282`, ikke i
    `endSeason`). Bland rækkefølgen ved sæsonslut, seedet af sæsonnummeret; spec §1 med.
28. **Makkerpar får en historie: "41 kampe sammen"** · klub + UI · S/M · 3 · 🗄 (et tal pr. par) · kortet kan kun sige "stærkt",
    ikke hvor længe. Tæl fælles kampe; vis ved kort og salg, "Sæsonens par" i Din sæson.
29. **Spillerens historie pr. sæson** · klub · S/M · 3 · 🗄 · `matchLog` holder 28 kampe – en 17-målssæson er væk i sæson 3.
30. **Ét valg om indtægterne** · økonomi · M · 3 · 🗄 · TV og billetter er faste, ingen sponsor. Ved sæsonstart: sponsor
    fast/bonus eller billetpris lav/normal/høj.
31. **Avisen står to gange** · UI · S · 2 · hele avisen både på Kamp og Liga; Kamp-fanen 5720 px ved 390 px.
32. **Samspil for den, der faktisk spiller** · motor + UI · S · 2 · en skadet starter beholder sine streger på Taktik (set på
    `15-saesonslut-taktik.png`), mens kampen bruger afløserens par. Vis afløserens, eller sig det.
33. **Ét sted afgør "kun dit hold" på banen** · UI · S · 1 · Test Manager v3.24.0: `isOwn` vogtes både i `ui/pitch.js` og
    `app.js`. Saml vagten ét sted.
34. **Ungdomstilbuddene er ens i alle ligaer** · klub · S · 2 · `derivedRng('youth', season, team.id)` (`season.js:257`) har
    intet liga-seed – samme navne i 4 seeds. Seed med ligaen.
35. **Kamp-id: en anonym bruger kan fylde databasen** · drift · S · 3 · Security Reviewer v3.24.3: 120 dokumenter à 900 KB
    på 21 s, ingen grænse pr. bruger (loftet er nu 400.000 tegn). Slå Firebase App Check til på Firestore, før kamp-id bruges
    af andre end brugeren – og sæt budget-alarm, hvis projektet kommer på Blaze.

## Fravalgt / noteret
- "– det holdt ikke mod jer" efter et nederlag kan misforstås (UI) – bevidst valgt i v3.21.2 (QC); kun noteret.

## Lavet
- v3.24.1 ungdomsspillere, der rykkes op, har karantæne som et køb (salg straks lukket; holdt et år: se nr. 8) ·
  v3.24.0 samspil – virkning og visning (opbygning, løbsduel, streger, kort, køb/salg) · v3.23.0 samspil – data og
  migrering · v3.22.1 afleveringen før afslutningen (onside på linjen) · v3.22.0 Kampens tal · v3.21.2 klummen · v3.21.1 transferlåsen ·
  v3.21.0 spillerbevægelse
