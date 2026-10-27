# Backlog – det næste i TactiVAR

Fyldes af Spilførerne (`/spilfoerere`, `.claude/commands/spilfoerere.md`) og af brugerens ønsker. Når brugeren ikke har et
nyt ønske, tages det øverste punkt i "Næste" (CLAUDE.md, "Backloggen"). Et løst punkt flyttes til "Lavet" med version.
Format: **titel** · område · størrelse (S/M/L) · værdi (1–5) · belæg/kilde. 🗄 = rører gemmet (migrering – brugeren spørges).
Rangering: brugerens ønsker først, derefter værdi pr. størrelse. Første rundtur: 2026-10-27 (v3.22.1, sæson spillet i browseren
+ 3 sæsoner `measure-lifecycle`).

## Næste
1. **Samspil mellem par og kæder** · klub + motor · L · 5 · 🗄 · brugerens landstræner ("hvordan spillerne arbejder/tænker
   sammen"); plan fase B: par på nabopladser vokser med fælles minutter, falder ved salg/køb og langt fravær; virkning i
   offside-fælden og opbygningen, målt mod botterne; vist på Taktik-banen, i salgsdialogen, som "Bedste makker" og i referatet.
2. **Din kamp er altid avisens overskrift** · UI · S · 4 · kun 5 af 14 overskrifter handlede om dit hold; runde 8: du vandt
   5-0 ude, overskriften var "Overraskelse: Lyngby Tacticians slog Furesø Boldklub" (`column.js` STORY: andres overraskelse 90,
   dit almindelige resultat har ingen historie). Undtagen mester før tid/sæsonslut; de andres historier som underrubrik.
3. **"Tacklinger" på Taktik-fanen gør ingenting** · motor · S/M · 4 · `tacklingIntensity` læses ingen steder i motoren; 2000
   kampe: Forsigtig/Normal/Aggressiv giver præcis samme mål, point og kort. Aggressiv: flere erobringer, men flere frispark,
   kort, straffe imod og skader; kortet får en grund ("sen tackling"). Fingeraftrykket flytter sig (botterne bruger den).
4. **Offside-fælden slået fra er bedst** · motor · S/M · 4 · fælden afgøres først, når presset allerede har vundet bolden
   (match.js ca. 1325) og gør en erobring med kontra-chance om til en offside: OFF giver +0,405 net mål/kamp mod +0,289 for ON
   (1200 kampe, spilfoerer-motor 2026-10-27, scratchpad/chem-measure.mjs). Fælden skal kunne vinde OG fejle (en fri mand).
5. **Almindelige skud og returbolde ser forkerte ud i afspilningen** · motor · S · 4 · v3.22.1 rettede afleveringerne; et
   almindeligt skud står stadig foran en høj linje, og "Et virvar foran mål" viser skytten helt alene ved målet, mens de andre
   står ca. 30 m ude (runde 4, 56'; runde 8, 78').
6. **"Din sæson" i sæsonrapporten** · klub + UI · S/M · 4 · rapporten er ren administration (præmie, løn +31 %, ungdom);
   placeringen står kun i præmielinjen. Øverst: "Nr. 3 af 8 – 20 point, 10 efter mesteren", placering pr. runde, bedste og
   værste kamp, sæsonens spiller og topscorer – alt fra historikken (`ui/season-report.js`).
7. **Et nederlag forklarer, hvad der gik galt** · UI · M · 5 · runde 3 (0-1, 12 % bold, 0–30 i skud): fuldtidsanalysen er én
   talmur, og ingen steder står, at din mellemblok blev spillet igennem 9 af 13 gange (mest #8 N. Jakobsen). "Det virkede /
   Det virkede ikke" med højst 3 punkter, med navn og link til indstillingen (Taktik → Fase 2). Kun fakta, ikke råd.
8. **Køb ung, udvikl, sælg skal kunne betale sig** · økonomi · M · 5 · det bedste i økonomien er i dag at gøre ingenting:
   passiv myVsBots 1,01–1,09 og 0 runder i minus, aktiv 0,97–1,05 og op til 36 runder i minus (4 seeds × 5 sæsoner); køb
   koster værdi × 1,3–1,6, bud er 0,9–1,0 × værdi; værdien falder 23 % natten over ved 22 år. Bud 1,0–1,3 × værdi, når den
   bydende bot mangler spillere i kæden; blødt aldersfald 21 → 25. Mål, at det ikke bliver en pengemaskine.
9. **Stillingen ændrer kampen** · motor · M · 4 · førende hold efter 60': 62,9 % af skuddene før, 58,1 % efter (1000 kampe);
   målene er jævnt fordelt over kvartererne (Superligaen: flest i 76–90'). Fra ca. 60' trækker føreren sig, den bagudførende
   kaster folk frem ("Ølstykke kaster alt frem") – flere skud, mere kontra-risiko.
10. **Bestyrelsens mål for sæsonen** · klub · M · 4 · 🗄 (lille felt) · ingen sæsonmål og lidt på spil for et midterhold
   (1. til 8. plads = 1,4 mio. kr. ≈ 2,5 runders løn). Mål ud fra holdets styrkerangering ("top 4"), vist i Klub og Liga, fulgt
   i klummen, gjort op i sæsonrapporten med bonus/lønbudget.
11. **Spillere på 24+ kan udvikle sig lidt** · klub · M · 4 · 🗄 · 45 af 45 spillere på 24+ står ved loftet (0,00 evnepoint pr.
    sæson; 20–23: 1,23; ≤19: 4,20); træningen viser 10 af 18 "tæt på sit loft" – træning er betydningsløs for kernen. Loft
    +0,5–1,5 for 24–27-årige, flyttet lidt af målrettet træning og minutter. Mål mod botterne.
12. **Kontrakter og lønkrav** · økonomi · M · 4 · 🗄 · lønnen springer +31 % ved sæsonslut uden en beslutning; kortet viser
    "kontrakt: 🔒 ??", men kontrakter findes ikke. 1–3 sæsoner; udløb giver et lønkrav med valg (forlæng/sælg/lad gå), vist i
    Klub fra runde 10.
13. **Referatet gentager samme sætning ordret** · UI · S · 3 · "Lyngby Tacticians spiller sig igennem din mellemblok – presset
    når ikke frem." 13 gange i runde 10; "Din balancerede opbygning bryder igennem …" 16 gange på en sæson (`match.js` én skabelon
    pr. udfald). 4–6 varianter (vary, intet rng) og "for 5. gang i dag".
14. **Prisen modsiger stjernerne; prognosen er kun resten af sæsonen** · økonomi · S · 3 · 3.075.000 kr. for både ★★★★☆ og
    ★★★☆☆ (pris efter `valueStars`, kortet viser `publicStars` – 40–46 af 126 bot-spillere afviger); "Denne sæson forventet:
    −271.000 kr." ved siden af "+199.750 kr. indtil nu". Vis prisens grundlag; "Resten af sæsonen".
15. **Hjørnespark: for få og for dødelige** · motor · S · 3 · 3,1 pr. kamp (Superligaen ca. 10), 6,9 % bliver mål (ca. 3 %) –
    hvert hjørne er et hovedstød på mål. Ca. 3 × så mange (fra blokeringer/redninger), de fleste clearet.
16. **Botterne angriber kun i højre side** · motor + klub · S · 3 · 🗄 (botternes opstilling) · RW 0,33 mål/90 mod LW 0,07
    (600 kampe): generatoren fylder pladserne efter kæde, så LW får en midtbanespiller og RW en angriber. Kanterne efter fit.
17. **Topscorer-koncentration** · motor · M · 3 · brugeren: 18 mål på 14 kampe; rundtur: #11 M. Jørgensen 17 mål. Mål først
    (`tools/measure-shooters.mjs`), sammenlign med Superligaen.
18. **Høje indlæg kan aldrig betale sig** · motor · M · 3 · Cutbacks slår Høje indlæg mod alle 7 bot-profiler (fx mod 5-3-2 lav
    blok 1,48 mod 0,90 mål), også med en angriber på 193 cm. Indlæggets værdi efter luftstyrken i felterne.
19. **Et marked, ikke et katalog** · økonomi · M · 3 · 15 transfers i ligaen på 10 sæsoner, 0 i sæson 1; 123 spillere til salg
    til 12–14 faste priser. Botter handler efter behov, 1–2 "ikke til salg" pr. bot, handlerne i avisen. Mål myVsBots.
20. **Spillerens historie pr. sæson** · klub · S/M · 3 · 🗄 (valgfrit felt) · `matchLog` holder 28 kampe – en 17-målssæson er væk
    fra kortet i sæson 3. Én linje pr. sæson (kampe, mål, oplæg, snit, kampens spiller).
21. **Ét valg om indtægterne** · økonomi · M · 3 · 🗄 · TV og billetter er faste (4.960–7.390 af 9.000 tilskuere), ingen
    sponsor. Ved sæsonstart: sponsor fast/bonus eller billetpris lav/normal/høj.
22. **Avisen står to gange** · UI · S · 2 · hele avisen både nederst på Kamp-fanen og på Liga; Kamp-fanen er 5720 px høj ved
    390 px. Kamp-fanen viser kun "Din kamp" og et link.

## Fravalgt / noteret
- "– det holdt ikke mod jer" efter et nederlag kan misforstås (UI) – bevidst valgt i v3.21.2 (QC); kun noteret.

## Lavet
- v3.22.1 afleveringen før afslutningen (onside på linjen) · v3.22.0 Kampens tal · v3.21.2 klummen · v3.21.1 transferlåsen ·
  v3.21.0 spillerbevægelse
