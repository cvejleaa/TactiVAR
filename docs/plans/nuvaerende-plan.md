# NU (3/11): F3 – Hjem-indhold og avisen ét sted (v3.31.0)

## Context
- v3.30.0 er live (e2e mod live 590/590).
- Brugeren: "Ændringer markeres som nu. Næste er f3". "+N" i Trup bliver altså som i dag.
- F3 er trin 4 af brugerens UI-ombygning (backlog nr. 0): "F3 Hjem-indhold, avisen ét sted".
- I det valgte design (artefaktet EPcztoSQdrk6pK8Bsy3FeS):
  - Hjem viser sidste runde med kampens spiller, placering ↑↓, "Før du spiller runde N", næste kamp, en mini-tabel og "Avisen" med én overskrift og "Læs hele avisen ›". Linket fører til Liga.
  - Liga har avisen: "Kun her – før to steder".
- I dag står avisen (`renderGazette`, `#gazette`) både sidst i Kamp (`public/ui/matchcenter.js:338`) og på Liga (`public/app.js:595`).
- Hjem har det meste allerede (`public/ui/home.js`). Det mangler kampens spiller og avisens overskrift, og ved 1366 px er der ca. 300 px tomt under kortene.
- Spilfører UI's F1-noter (backlog l.183–187), som hører til her:
  - Formen som farvede V/U/T-piller.
  - En sejr på Hjem med kampens spiller 👑 og avisens overskrift.
  - Drop bjælkens 🔍 på Hjem, fordi den gentager næste kamp-kortet.
  - QC: "N ting" tæller grupper, mens ▶'s tegn tæller spillere.

## Genbrug, så intet bygges igen
- `columnNow()` (`app.js:207`) giver klummens `title`. Den falder selv tilbage til den gamle avis, så den er Hjems overskrift. Der skrives ingen ny overskriftsfunktion.
- `m.ratings.motm` findes allerede og bruges i referatet (`matchcenter.js:306`). Hjem tager navn og karakter derfra.
- Liste-, link- og fanemønstret i Hjem genbruges: `homeHandlers`/`on.liga`, og `showTab` + scroll til et element som "ændr i Træning ›" (v3.30.0).
- `tools/measure-ui.mjs` måler Hjem, Kamp og Liga ved 1366 og 390 px. Før- og eftertallene skrives i spec §10b.

## Ændringen
1. **Hjem (`public/ui/home.js`, `homeData()` i `app.js`):**
   - `#home-last` får "👑 Kampens spiller: G. Kristensen (8,1)" (`#home-motm`), men kun når kampen har en motm. Han er fra kampen, ikke nødvendigvis fra dit hold, og teksten siger, hvilket hold han spiller for.
   - Et nyt kort `#home-paper` "📰 Avisen":
     - Klummens titel efter sidste runde og knappen "Læs hele avisen ›" (`#home-paper-link`). Knappen åbner Liga og ruller til `#gazette`.
     - Før runde 1 og under afspilning vises kortet ikke, ligesom avisen.
     - Kortet ligger i højre kolonne (`.home-side`) under mini-tabellen, så de ca. 300 px udnyttes.
   - `#home-opp-form`: "seneste 3" bliver tre små piller (V grøn, U grå, T rød, med title "Vundet/Uafgjort/Tabt"). Bogstaverne er stadig teksten, så skærmlæsere og tests kan læse dem.
   - "N ting" i "Før du spiller" tæller det samme som ▶'s tegn (spillere), ikke grupper. Hvilken tæller der er rigtig, afgøres af QC på planen; de skal være ens.
   - Bjælkens 🔍 skjules på Hjem, fordi næste kamp-kortet allerede har linket. Den bliver på Taktik.
2. **Avisen ét sted (Liga):**
   - `renderGazette` fjernes fra Kamp (`matchcenter.js:338`).
   - I stedet står der én linje sidst i Kamp efter fløjtet: "📰 Rundens avis står på Liga ›" (`#kamp-paper-link`), med samme handler som Hjem.
   - Klummen bygges kun ét sted for Liga (`app.js:581`), og argumentet til `renderMatchCenter` fjernes.
   - Mål-of-runden-linket (`#goal-of-round-match`) virker allerede fra Liga, så det følger med uændret.
   - På Liga flyttes avisen op lige under tabellen, før "sidste runde" og programmet. Det er dér, "Læs hele avisen ›" lander. Liga får først underfaner i F6.
3. **Tekster og dokumentation:**
   - Spec §10b: Hjem, Kamp og Liga med før/efter-højder fra `measure-ui`.
   - NEWS og `public/version.js` 3.31.0.
   - Backlog nr. 0: F3 flyttes til Lavet, og de fire F1-noter krydses af.

## Tests
- **e2e:**
  - De ca. 6 Kamp-tjek af `#gazette` (run.mjs:1716, 2022, 2115, 2133, 2396–2397) flyttes til Liga.
  - Et positivt tjek: `#match-center` har ingen `#gazette`, men har `#kamp-paper-link`, og linket åbner Liga med `#gazette` i synsfeltet.
  - Hjem:
    - `#home-paper` viser netop klummens titel. Den er den samme tekst som `#col-title` på Liga.
    - Linket lander på `#gazette`.
    - Kortet findes ikke før runde 1 og ikke under afspilning.
  - `#home-motm` viser netop kampens motm med navn og karakter.
  - Formpillerne har den rigtige rækkefølge, de rigtige bogstaver og den rigtige klasse.
  - "N ting" er lig med ▶'s tal.
  - 🔍 vises ikke på Hjem, men vises på Taktik.
- **Unit (`home-f1-tm.test.mjs`):**
  - motm med og uden data, kortet med og uden titel, pillerne og tælleren.
  - Assertér på indholdet og på det, der ikke må stå ("undefined", tomt kort).
- **Mutationer, der skal give rødt:**
  - avisen tilbage i Kamp;
  - linket lander ikke på `#gazette`;
  - motm fra det forkerte hold eller felt;
  - tælleren tilbage til grupper;
  - kortet vist under afspilning.

## Arbejdsgang (CLAUDE.md)
1. QC (opus) og Spilfører UI på denne plan, parallelt. Arkitekten springes over, fordi filerne og genbruget er kortlagt ovenfor. Ret planen efter dem.
2. Kode → check, unit og e2e → commit.
3. TM og QC parallelt, derefter RM.
4. Draft-PR, grøn CI, rapport, merge, live og e2e mod live.

## Verifikation
- Lokalt og i CI er `npm run check`, `npm test` og `npm run test:e2e` grønne.
- Mutationerne ovenfor bliver røde.
- `measure-ui` før og efter: Kamp bliver kortere, og Hjem fylder 1366-højden uden tomrum. Tallene skrives i spec.
- Live:
  - Hjem viser 👑 og avisens overskrift.
  - "Læs hele avisen ›" lander på avisen på Liga.
  - Kamp har kun linket.

## RETTET efter QC (opus) og Spilfører UI – disse punkter afløser planen ovenfor, hvor de er uenige
1. **Kampens spiller gennem visibility:** `viewRatingEntry(motm, motm.teamId === mine.id)` (public/engine/visibility.js).
   Dit hold: "👑 Kampens spiller: #9 G. Kristensen · karakter 8,1". Modstanderen: "👑 Kampens spiller: #9 G. Kristensen (Brøndby IF)" –
   UDEN tal og uden stjerner (som avisen, matchcenter.js:236,250). Mutation `viewerOwnsTeam=true` skal blive rød (e2e/unit med en
   modstander-motm).
2. **Overskriften:** columnNow() returnerer null ved fejl (app.js:209) – det er renderGazette, der falder tilbage. Hjems tekst =
   klummens title, ellers `lr.gazette.headlines?.[0]` (samme som Ligas første `#headlines li`), ellers "Rundens avis". columnNow må
   IKKE kaldes under afspilning, og resultatet caches pr. lastRound.round, så fejlboksen (errors.js:6–9 fjerner ikke dubletter) kun
   får én linje, også når Liga og Hjem begge tegnes. Udvid fejl-scenariet (e2e ~l.2139) til Hjem: overskrift fra den gamle avis, én fejllinje.
3. **"N ting" forbliver GRUPPER** (QC): én række = én gruppe = ét link; Taktiks `#issue-count` er også grupper. Den lille ▶ tæller med
   vilje spillere. Ingen ændring – test i stedet at Hjems N = antal `.todo-row[data-kind]` = Taktiks N. Backlog-noten (l.187) lukkes
   med "bevidst forskellige enheder".
4. **Avis-linket i Kamp står ØVERST** i `.to-home` (toHomeLine, app.js:704), med overskriften: "… · Forbered › · 📰 «overskrift» ›"
   (`#kamp-paper-link`), samme betingelse som linjen (ikke under afspilning, kun seneste runde). Ingen linje nederst.
   `column`-argumentet fjernes både i Kamp-indholdet og i `matchCenterEl` (app.js:831). Ret kommentarerne i matchcenter.js:2 og
   app.js:207,773. e2e l.2022/2115 (`#match-center #goal-of-round-match`) bliver til: linket findes ikke i Kamp, men på Liga.
5. **Landing:** `#gazette { scroll-margin-top: calc(var(--top-h) + .5rem) }`; e2e: toppen af `#col-title` ligger under topbarens
   underkant (ikke kun "synlig"), ved 1366 og 390.
6. **🔍 skjules på Hjem**, og `#play-round` får `margin-left: auto`, så ▶ står samme sted på Hjem og Taktik. Ret e2e l.96.
7. **Formpiller:** synlig tekst "seneste 3 (ældste → nyeste)" før pillerne; pille-title fra modstanderens side ("<hold>: Vundet").
   Bogstaverne V/U/T er stadig tekst.
8. **`#home-paper` i venstre kolonne** (`.home-main`) under "Før du spiller" – det tomme felt er til venstre (venstre slutter y 408,
   højre y 537 ved 1366). Rækkefølge: resultat ↑↓ → 👑 → Før du spiller → 📰.
9. Dropper kravet "Hjem uden tomrum ved 1366". measure-ui før/efter i spec §10b (Kamp, Liga, Hjem ved 1366 og 390).
10. NEWS: "Avisen står nu kun på Liga – Hjem og Kamp viser rundens overskrift med et link".

## Status (3/11 06:50)
- Bygget og committet: d7c84e0. Lokalt check, unit 1381/1381 og e2e 618/618 grønne. Alle 8 mutationer gav rødt.
- PR cvejleaa/TactiVAR#71 er draft. CI er grøn på d7c84e0.
- TM og QC (opus) kører parallelt (workflow ws3oopqaa). Derefter RM, rapport til brugeren, merge, live og e2e mod live.

---
Tidligere planer: [tidligere-planer.md](tidligere-planer.md)
