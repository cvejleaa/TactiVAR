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
36. **Boldbesiddelse og skud ved dominans er for ekstreme** · motor · M · 3 · brugeren 2026-10-28: 36 skud ved 83 % bold (K-id-
    værktøjet kan nu hente sådan en kamp). Spilfører motor, 1344 målmandskampe: < 40 % bold 6,2 skud, > 70 % 23,5 (×3,8; virkeligheden
    ca. ×2,5); 3,7 % af holdkampene ≥ 80 % bold (maks 91 %), 1,6 % ≥ 30 skud. Skudeffektiviteten er normal (10,6 %). Loft over
    besiddelsen og en fladere kurve fra besiddelse til skud (match.js ca. l. 1274). Fingeraftryk før/efter.
37. **Referatet skelner ikke lette og svære redninger** · motor + UI · S · 2 · QC v3.24.5: en let redning kan stå som "tipper
    skuddet … ud til hjørnespark" (match.js ca. l. 939) og ligner en svær – brugeren kan ikke tælle "(2 svære)" efter i referatet.
    Mildere tekst for de lette eller tæl hjørne-tippet som svært. Ændrer fingeraftrykket (prosa eller karakter).

**Fra Hattrick-manualen og F4Football (2026-11-01, brugeren: "lad os holde tactiVAR op imod det, og lægge til vores opgaver hvor vi kan forbedre med inspiration i hattrick").** Spilførerne (motor, økonomi, klub, UI) og et udtræk af F4Football-skærmbillederne; dubletter slået sammen. Tal fra deres scratch-scripts skal måles igen med et committet værktøj, før de begrunder en ændring.
38. **Flere midtbanefolk skal give mere bold – med aftagende udbytte** · motor · M · 5 · ⚖ · Hattrick: midtbanen afgør chancemængden, trængsel giver bidragstab. TactiVAR: besiddelsen er et gennemsnit af midtbanen (match.js ca. l. 1274) – målt (scratch, skal måles med tools/): 4-3-3 54,0 %, 4-4-2 50,1 %, 4-1-4-1 48,0 % bold; en ekstra midtbanespiller koster bold. Summér med faldende vægt. Hænger sammen med nr. 11, 36 og 16.
39. **Angrib deres svage side** · motor + UI · M · 5 · 🗄 · Hattrick: angrebet går venstre/midt/højre mod forsvaret i samme zone. TactiVAR: kantens side er et møntkast (match.js ca. l. 961). Vægt efter egen kant mod deres back + valg Venstre/Begge/Højre; fuldtidsanalysen viser angreb pr. side. Gør nr. 6 modstanderafhængigt og nr. 24 (botternes højreslagside) udnytteligt.
40. **Holdets karakter pr. kæde efter kampen** · UI + motor · M · 5 · Hattrick: holdkarakterer for midtbane og venstre/central/højre i angreb og forsvar – "det er også disse karakterer, der betyder noget i selve udregningen". TactiVAR: kun spillerkarakterer (ui/matchcenter.js) og modstanderens zoner. Fem bjælker (midtbane, venstre, central, højre, dødbolde), dit hold mod hans, i ord, lavet af det motoren afgjorde (sporet). Sproget nr. 7 mangler – byg sammen med eller før nr. 7.
41. **Spilletid skal udvikle spilleren** · klub · M · 5 · ⚖ · Hattrick: ingen minutter giver ingen træning. TactiVAR: minutterne står for ca. 19 % af væksten i den trænede evne (career.js ca. l. 128–138, season.js ca. l. 112). Træning × (40 % + 60 % efter minutter), gulv for reserver. "Giv ungdommen minutter" bliver et valg mod at vinde.
42. **Optakt til næste kamp – én oversigt** · UI · S/M · 4 · Hattrick-managerens ritual: forbered dig på modstanderen før kampen. F4Football: dashboard med næste kamp, mini-tabel (dit hold markeret), seneste resultater og pokalstatus. TactiVAR: avisens bud på hans stil står på Kamp-fanen, ved ▶ kun "🔍 Navn". Hans sidste 3 resultater, stilbud, indbyrdes, favorit/udfordrer, vinduesstatus, kasse. Hvor (Taktik-top eller ny Oversigt) afgøres efter CLAUDE.md 0b; kun offentlige data (visibility.js).
43. **Favorit eller udfordrer – forventning før kampen** · UI · S · 3 · Hattrick: forventninger gør et resultat til en overraskelse eller skuffelse. TactiVAR: "overraskelse" kun bagefter i avisen (column.js). Favoritstatus (tabel + form) i optakten og ved fuldtid ("Sejr som udfordrer"). Samme beregning begge steder; tages med optakten, rører nr. 12.
44. **Hvis-Så: "Ikke foran", rødt kort og "skift én fase"** · motor + UI · S/M · 4 · 🗄 · Hattrick: betingelser på rødt kort/skade, handlinger positionsskift/ny ordre. F4Football: "Attack more … if we are not winning", "Red Card Action". TactiVAR: kun stilling og minut (match.js ruleConditionMet, labels.js), handlingerne skift/plan/formation – "ikke foran" koster to af 8 regler. Sanitize skal kende de nye værdier.
45. **Vælg anfører og dødboldsskytter** · motor + UI + klub · S/M · 4 · 🗄 · F4Football: lister i rækkefølge for anfører, frispark, hjørne og straffe. Hattrick: anførerens rutine og lederskab dæmper nervøsitet. TactiVAR vælger selv (straffe: bedste afslutning match.js ca. l. 996; frispark ca. l. 1049; hjørne ca. l. 815) og har ingen anfører (careerGames bruges kun i værdien, career.js ca. l. 48). Første raske på listen; tom liste = som i dag. Anførerens rutine dæmper kollaps efter mål imod.
46. **Mandsopdækning** · motor + UI · M · 4 · 🗄 · Hattrick: en forsvarer/defensiv midtbane følger én modstander og mister selv 50–65 % af sit bidrag. TactiVAR: dueller vælges efter nærhed (match.js receiver). Peg på deres stjerne: han møder opdækkeren med tillæg i dueller; opdækkeren tæller mindre i opbygning og løb. Botterne kan bruge den mod din topscorer (dæmper nr. 11).
47. **Kampens indsats: Giv alt / Normal / Spar kræfter** · motor + klub · M · 4 · ⚖ 🗄 · Hattrick: mere nu mod mindre bagefter gør sæsonen til en ressourceplan. TactiVAR har prisen i friskheden (freshness.js) men intet valg pr. kamp. Duelfaktor nu mod friskhedstab bagefter. Får mening med nr. 15 og en pokal.
48. **Form og moral – spilletid betyder noget** · klub + motor · M/L · 4 · 🗄 ⚖ · Hattrick: skjult baggrundsform, det betyder meget at have spillet. F4Football: moral overalt, startere 95–100, bænk 13–42. TactiVAR: ingen form eller moral – rotation og bænkning koster intet (samme problem som nr. 2). ±5 % i kampen, vist i ord kun på dit eget kort (visibility.js). Måles med et værktøj som nr. 2.
49. **Arketyperne skal virke – med en god og en dårlig side** · klub + motor · M · 4 · ⚖ · Hattrick: specialiteter med god og dårlig side, synlige som hændelser i referatet. TactiVAR: 53–62 af 144 har en arketype, 6–10 låst op, ingen effekt i match.js (spec §2: "udskudt"); kortet viser interne nøgler ("goalkeeping 12", ui/card.js ca. l. 36). Kravet for at låse op bliver et træningsmål.
50. **En lille pokal** · klub · M · 4 · 🗄 ⚖ · Hattrick: pokalen er en sæson ved siden af ligaen. F4Football: tre pokaler. TactiVAR: kun 14 ligarunder. 8 hold, kvartfinale/semifinale/finale efter runde 4/8/12; friskheden gør det til et valg mellem rotation og stabilitet; midterholdet får et andet mål. Præmiepenge fra økonomien.
51. **Fans med forventninger – ét tal med bestyrelsen** · økonomi + klub · M · 4 · 🗄 · Hattrick: forventningen sættes ved sæsonstart ud fra sidste sæson; over forventning stiger humøret og tilskuertallet. TactiVAR: tilskuertal kun fra placering og form, husker intet (career.js ca. l. 162). Forventning = sidste sæsons placering, fanhumør 1–5 → næste sæsons tilskuere ±15 %. Skal være ét tal med nr. 15, ikke to systemer.
52. **Stadion og faciliteter – noget at bruge kassen på** · økonomi · M/L · 4 · 🗄 ⚖ · Hattrick: stadion er den største langsigtede investering, med vedligehold. F4Football: udbygning i trin ("upgraded by 1000 seats, Time Remaining: 3 round(s)") og faciliteter med vedligehold. TactiVAR: tilskuere låst 4.000–9.000 (career.js GATE_BASE/GATE_MAX), kassen bruges kun til køb; målt: ligaens kasse falder til 53–66 % over 5 sæsoner. 3 udvidelsestrin med pris, vedligehold og tilbagebetalingstid. Efter fansene.
53. **Ansatte på sæsonkontrakt** · økonomi + klub + motor · M/L · 4 · 🗄 ⚖ · Hattrick: højst 4 ansatte på korte kontrakter, så klubben indrettes efter fasen. TactiVAR: ingen ansatte, fast træningsrate og skaderisiko. 2 pladser ved sæsonstart (assistenttræner, læge, fysioterapeut), 3 niveauer, løn pr. runde; effekterne måles i tools/.
54. **Egen avl 🏠** · klub + økonomi · S/M · 4 · 🗄 · Hattrick: en moderklubspiller får en bonus, der forsvinder ved salg. TactiVAR skelner ikke, og ungdom sælges med gevinst (nr. 8). Mærket 🏠; egen avl starter med højere samspil indbyrdes; forsvinder ved salg. Supplerer nr. 8 (egne talenter er mere værd for dig end for markedet).
55. **Klubbens historie: æresbog, rekorder og sæsonens kåringer** · klub + UI · M · 4 · 🗄 · Hattrick: bedrifter, trofæer, anciennitet. F4Football: sæsonens kåringer (topscorer, flest oplæg, MVP, bedste målmand/forsvarer/midtbane/angriber/unge spiller med kampe og snitkarakter). TactiVAR: "Tidligere sæsoner" ligger lukket under Kampprogram (ui/rounds.js), league.seasons gemmer kun tabel, mester, topscorer og dit holds bedste (season.js ca. l. 310). "🏛 Historie" under Klub: pokaler, placering pr. sæson, klubrekorder, top 5 kampe/mål, kåringer. Deler data med nr. 29; i samme migrering.
56. **Talentspejder – ungdom koster** · økonomi + klub · S/M · 3 · 🗄 · Hattrick: spejderen koster pr. uge, "de fleste … vil end ikke være gode nok". TactiVAR: ungdomstilbuddene er gratis hvert sæsonslut (season.js ca. l. 268) – halvdelen af pengemaskinen i nr. 8. Niveau 0/1/2 pr. sæson med pris pr. runde; højere niveau: ét tilbud mere, valg af kæde. Med nr. 18 og 34.
57. **Minus har en pris: renter og kreditgrænse** · økonomi · S · 3 · Hattrick: man kan bruge penge i minus med "heftige" renter og en tydelig grænse. TactiVAR: minus blokerer kun for køb (transfers.js ca. l. 50, ui/club.js); den aktive profil står op til 36 runder i minus uden pris (nr. 8). 1 % rente pr. runde i prognosen; køb ned til −1 mio. med renten vist før klikket.
58. **Kontraktløse spillere i en pulje** · økonomi · M · 3 · 🗄 · F4Football: "Teamless Players" (top 50 af 251). TactiVAR: fritstilling sletter spilleren (transfers.js releasePlayer → move(…, null)). Kan hentes i vinduet for løn uden transfersum; botterne kan bruge puljen. Hjælper nr. 10.
59. **Bedrifter: små mål ved siden af tabellen** · UI + klub · S/M · 3 · 🗄 ⚖ · Hattrick: mange parallelle mål. 15–20 bedrifter ("Slå mesteren", "5 kampe uden nederlag", "Egen ungdom scorer", "Et par spiller 40 kampe sammen"), nævnt efter runden og samlet i Historie. ⚖: kan blive et tjeklistespil.
60. **Individuelle løb pr. spiller** · motor + UI · M · 3 · 🗄 · Hattrick: offensiv/defensiv/mod midten pr. position. TactiVAR: løb uden bold er ét valg for hele holdet. Få/Normal/Mange pr. spiller med eksisterende vægte og km-pris. Trukne positioner dækker noget af det.
61. **To rækker med op- og nedrykning** · klub · L · 4 · 🗄 ⚖ · Hattrick: pyramide med kvalspil; F4Football: divisioner pr. land. TactiVAR: én liga for evigt. 1. division med 8 nye botter; nr. 1 op, nr. 8 ned, nr. 2/7 kval. Dyreste punkt – efter nr. 15.
62. **Tabellen viser bevægelse og form** · UI · S · 2 · F4Football: pil (↑/↔) pr. hold. TactiVAR: #/Hold/K/V/U/T/Mål/VAR/P (ui/standings.js). Pil og form i de seneste 5 – regnes af resultaterne, intet nyt felt.
63. **Navngivne taktikker** · UI · S/M · 2 · 🗄 · F4Football: Saved Tactics med Gem/Indlæs/Omdøb. TactiVAR: planerne hedder A/B/C (spec §4). Rører Hvis-Så-reglernes mål.

**Tillæg til punkter, der allerede står her (Hattrick/F4Football):**
- Nr. 17 (stillingen): Hattricks model – fra 2 måls føring −9 % angreb og +7,5 % forsvar pr. ekstra mål, med loft; rulles tilbage ved reducering; referatet siger "holdet trækker sig".
- Nr. 3, 4 og 6: Hattricks regel "hver taktik kræver noget og koster noget" (kontra virker kun for holdet, der er svagest på midten) er målestokken. F4Football har også Marking (Man/Zonal) ved nr. 4.
- Nr. 16 (hjemmebane): i Hattrick kommer fordelen gennem besiddelsen – én simpel knap, passer til det første punkt ovenfor.
- Nr. 23 (hjørner): Hattrick afgør dem på antallet af hovedstødsspillere hos begge hold.
- Nr. 15 (bestyrelsen): målet bygger på sidste sæson; står holdet stille, forventes "bare lidt mere" – og samme tal som fansene.
- Nr. 18 (ungdomsskøn): skønnet bliver skarpere for hver kamp, han spiller. Nr. 19 (24+): træning virker hele livet, bare langsommere.
- Nr. 8 (køb ung, sælg): salgsgebyr efter tid i klubben (fx 30 % ved 0 kampe → 0 efter en sæson), vist før salget – inden for fast pris.
- Nr. 20 (scouting): F4Football-rapporten bruger ord og halve stjerner pr. skjult træk med "scoutet af/den". Nr. 21 (kontrakter): tilbud med frist. Nr. 29: karriere, sæson, turnering, kåringer og transferhistorik. Nr. 30 (indtægter): sponsor fast pr. runde + sejrsbonus + bonus for sidste sæson, bygget oven på fansene.
- Fravalgt fra Hattrick/F4Football (bevidst): auktioner og autobud (brugeren valgte fast pris), modstanderens mentalitet i rapporten (§3 hemmelighed), vejr og formationserfaring (samspil og mod-kunnen dækker), landshold og ungdomsliga (socialt lag), billettyper, verbale karakterer i stedet for tal, trænerstab med evner pr. træningsprogram (for stor – ansatte-punktet tager kernen).

## Fravalgt / noteret
- "– det holdt ikke mod jer" efter et nederlag kan misforstås (UI) – bevidst valgt i v3.21.2 (QC); kun noteret.

## Lavet
- v3.24.1 ungdomsspillere, der rykkes op, har karantæne som et køb (salg straks lukket; holdt et år: se nr. 8) ·
  v3.24.0 samspil – virkning og visning (opbygning, løbsduel, streger, kort, køb/salg) · v3.23.0 samspil – data og
  migrering · v3.22.1 afleveringen før afslutningen (onside på linjen) · v3.22.0 Kampens tal · v3.21.2 klummen · v3.21.1 transferlåsen ·
  v3.21.0 spillerbevægelse
