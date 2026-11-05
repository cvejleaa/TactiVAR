# Designkritik af TactiVAR (live v3.31.2) – 5/11

Tre uafhængige gennemgange med `/design:design-critique` (computer 1366 px, mobil 390 px, tilgængelighed og konsistens),
lavet ud fra 30 skærmbilleder af alle faner efter 2 spillede runder. De er IKKE lavet af UI-Spilføreren. Kontrasten er regnet ud fra `public/style.css`.

## Samlet: det, alle tre peger på
1. **Forklaringstekst kvæler kontrollerne.**
   - Taktik: faserne, Hvis-Så og udskiftninger begynder ca. 1070 px nede. Under hver fase står 3–6 linjer (på mobil ca. 25) grå tekst. Taktik er 3777 px ≈ 5 skærme på mobil.
   - Træning, Kamp, Klub og kortet har samme problem.
   - Forslag: én kort linje synlig, resten bag "ⓘ Sådan virker det". Det er F4's plan, og det rammer klagen "for mange informationer klemt sammen" direkte.
2. **Kamp: afspilningen ligger under folden.**
   - Over den står: næste-runde-linjen, "📤 Send kampen" med advarselstekst, kampvælgeren, stillingen og intro-tekst.
   - Kamp er ca. 2700 px med 10+ sektioner.
   - Forslag: banen og ▶ på første skærm, og underfaner Afspilning / Statistik / Referat / Karakterer. "Send kampen" flyttes ind i en ⋯-menu.
3. **Brede tabeller på mobil.**
   - Trup er skåret af uden tegn på, at der er mere. Det gælder også Træning, Klub-regnskabet og Kamp-statistikken.
   - Forslag: én regel for alle brede tabeller: sticky første kolonne, fade/skygge i højre kant og færre kolonner (kolonnesæt, F5).
4. **Berøringsflader på mobil.** Trup-rækkerne er ca. 25 px høje, og en række er den eneste måde at åbne spillerkortet. Forslag: `min-height: 44px` på knapper, piller, links og tabelrækker ved ≤ 600 px, og "Klik" → "Tryk".
5. **Farverne betyder for mange ting.**
   - Lilla = aktiv fane, valgt filter, overskrifter, avisens overskrifter og den valgte spiller.
   - Grøn = dit hold, hovedknappen, de bedste værdier (heat), "Gemt" og "Bænk".
   - Forslag: lilla kun til "valgt", grøn kun til "dit hold" og handlingen.
6. **Kontrast:** næsten alle par klarer AA. Disse gør ikke:
   - `.heat-1` (#64748b, lave evner i Trup) = 3,6:1 → forslag #8b9ab0;
   - tomme stjerner `.star-off` (#475569) = 2,25:1. ★ og ☆ skelnes kun på farve.
7. **Gentagelser:** klubpanelet på Hjem og Trup gentager topbaren. Klub har to forskellige "Lønbudget"-tal, og den vigtigste værdi ("Denne sæson forventet: −965.000 kr.") står som almindelig brødtekst.
8. **Småting:**
   - "🚑 #11" i bjælken uden tekst;
   - Trups "Mod" (23 · 28 · 20) uden forklaring;
   - kortpanelet på 1366 skærer tabellen af til højre, og dets sidste linje ligger bag bjælken;
   - Liga-tabellen er strakt over 1300 px;
   - Træning har kolonner, hvor alle har samme værdi.

## Det, der virker (alle tre)
- Hjem er rolig og har én opgave: "Før du spiller runde N".
- Bundnavigationen og Spil-bjælken sidder, hvor tommelfingeren når.
- Paletten fra F0 holder AA for næsten alt.
- Piller bruger både tekst/emoji og farve.
- Liga-tabellen passer til mobilen.

## Prioriteret forslag (samlet)
1. Forklaringer bag "ⓘ" på Taktik, Kamp, Træning, Klub og kortet (F4).
2. Kamp-underfaner med afspilningen på første skærm.
3. Én regel for brede tabeller på mobil og 44 px berøringsflader.
4. Farvesemantik (lilla og grøn) og kontrast (heat-1, tomme stjerner).
5. Fjern gentagelser: klubpanel, de to lønbudgetter, nøgletallet i Klub.

---

## Gennemgang 1 – computer (1366 px)

### Overall Impression
Hjem shows the right way to do it. It's calm, it gives you one task ("Før du spiller runde 3 · 1 ting") and it puts one action in the bottom bar. The other tabs go the opposite way. Taktik, Kamp and Liga each put three or four tasks on one long page, and the controls you came for sit below the fold under long paragraphs of explanation. The complaint about "for mange informationer klemt sammen" is mostly about **explanatory text and stacked sections**. The data itself is not the main problem.

### Usability
| Fund | Alvor | Anbefaling |
|---|---|---|
| **Taktik**: the actual decisions (formation, Fase 1–3, Hvis-Så, udskiftninger) start at about y=1070 (`1366-taktik-full.png`). Under each phase is a grey paragraph of 3–6 lines, so the controls drown in prose. The first screen is only the line-up. | 🔴 | Collapse each phase's explanation into an "ⓘ Sådan virker det" toggle, or show it as a tooltip on the selected value. Show only a short consequence line under each dropdown (e.g. "Lynkontra: flere kontraer"). Consider sub-tabs: "Opstilling" and "Spillestil". |
| **Kamp**: the playback pitch is cut off at the fold, and its controls (▶ Afspil, 1×, Højdepunkter) only appear at about y=1030 (`1366-kamp.png` / `-full.png`). The tab's main task, watching the match, needs a scroll. | 🔴 | Put the pitch and controls in the first screen. Move the stats table below or into a tab ("Afspilning / Statistik / Referat / Karakterer"). Above the playback, the pitch only needs the score and the timeline. |
| **Kamp**: one long page holds the match centre, four match tabs, the timeline, 16 stat rows, the commentary, two heat maps, "samarbejde", two line-up pitches, two rating tables and a legend paragraph (≈2700 px). | 🔴 | Split it into internal tabs. The commentary and ratings are each a reason to visit on their own, so they shouldn't share one scroll. |
| **Træning**: 18 rows with almost identical values ("Alsidig", "-2 (0)", "> 1 sæson", "0,0") and an empty "Sidste runde" column (`1366-traening-full.png`). The columns carry hardly any information, while the useful thing (who has potential) is hidden in "Skøn" grey text. | 🟡 | Sort by or highlight "Skøn" (e.g. a ▲▲▲ marker). Hide "Næste +1" and "Sidste runde" while all values are the same, or replace them with one summary line. The summary line at the top already works well, so build on it. |
| **Trup + kort**: when the card is open, the table is cut off on the right ("Mod" is cut at "23 · 28 ·"; Værdi/Løn/Note disappear) and the card's last line sits behind the bottom bar (`1366-kort.png`). | 🟡 | Let the card push the table (sticky first columns plus horizontal scroll), or show it as an overlay with a dimmed background. Give the card `padding-bottom` equal to the bar's height. |
| **Trup**: 24 columns, all at the same weight. "Mod" ("23 · 28 · 20") is a cryptic triple with no key, and Pos/Kæde/Natur are three position columns side by side (`1366-trup.png`). | 🟡 | Add column groups (Fysik / Teknik / Taktik) with a thin divider, or a view switch (Overblik / Evner / Økonomi). Explain "Mod" in the column header's tooltip. |
| **Liga**: the table, avisen, results, next round, program and statistics are on one page of ≈2900 px (`1366-liga-full.png`). | 🟡 | Add sub-tabs, e.g. "Tabel & runde / Avisen / Statistik". The table and next round fit on the first screen. |
| **Klub**: two different "Lønbudget" figures (in the table: "kan bruge 125.859 kr. mere pr. runde"; in the footnote: "598.859 kr. pr. runde"). "Denne sæson forventet: −965.000 kr." appears as unstyled body text even though it is the most important number on the tab (`1366-klub-full.png`). | 🟡 | Show the expected result for the season as a key figure next to the club funds (as on Hjem). Merge the two lønbudget figures into "598.859 budget · 473.000 brugt · 125.859 fri". |
| **Bottom bar**: the "🚑 #11" chip on the left has no text. You have to know that it means an injury. | 🟢 | Write "🚑 1 skadet" or "#11 G. Dahl skadet", and make it a link to Taktik. |
| **Taktik**: #11 G. Dahl is shown as red/injured in the start-11, while Hjem says "erstattes automatisk". It's unclear whether you need to do anything. | 🟢 (usikker if intended) | Repeat Hjem's text by the red marker on the pitch ("erstattes automatisk af …"). |
| **Kamp header**: "📤 Send kampen", a developer/debug feature with an explanatory sentence, sits right next to the main heading. | 🟢 | Move it into a ⋯ menu or into settings. |

### Visual Hierarchy
- **Hjem** (`1366-hjem.png`): the eye goes to "Nordkysten BK 1 – 1 Bibamus United", then "Nr. 6 ↓1", then the green button. That is the right order. The top card ("Bibamus United / Dit hold") takes a full row to say something the header already says. Klubkasse is underlined like a link, which makes it look like something you should click.
- **Trup**: the purple position cells and the green/blue numbers draw the eye, so the "heat map" works. But the names are no stronger than the numbers, and the header card "Bibamus United – dit hold" pushes the table down by about 90 px for no reason.
- **Taktik**: the green pitch dominates, which is fine. Names on the pitch are crossed by the connecting lines ("V. Rasmussen", "S. Møller"), and the "Samspil mellem naboer" legend is cut behind the bottom bar on the first screen.
- **Kamp**: "1 – 1" is clearly the focal point. Next, though, the eye lands on the purple match tab and the stats table, not on the playback. In the stats table the values sit at x≈586 and x≈1206, so the eye has to cross 600 px of empty space for each comparison.
- **Liga**: the table is spread across the full 1300 px. The "Hold" header is centred while the team names are left-aligned, and the columns K…P float far apart. Avisen has paragraph spacing like body text in a document, so it uses a lot of height for 6 sentences.
- **Klub**: every value is bold at the same weight. Nothing stands out, and the key figure is not bold at all.

### Consistency
| Element | Problem | Anbefaling |
|---|---|---|
| Purple (`--lilla`) | It means active tab, selected filter, "viewing" outline in the table, the match centre border, section headings ("DIN KAMP") and the selected player all at once. | Reserve purple for "valgt/aktiv". Use neutral colours or text colour for headings. |
| Green (`--grøn`) | It is used for your own team, the main button, the best values (heat-4), "Gemt" and "Bænk"-labels. | Keep green for "dit hold" and the action. Use a different shade for heat-4. |
| Team header card | Hjem says "Dit hold", Trup says "– dit hold", and the other tabs have no header card. | Remove it on Trup, or make it one shared component with useful content (e.g. form and position). |
| Name alignment | Trup and Taktik left-align names, Træning centres them, and the Liga header is centred over left-aligned names. | Left-align text columns everywhere and right-align numbers. |
| Position names | "MÅL/FOR/MID/ANG" (kæde), "MV/VB/MS…" (plads) and "Back/Kant/CM" (natur) appear side by side. On the card it reads "FOR • Midtstopper (MS)". | Choose one primary position notation per view and put the others in a tooltip. |
| Link vs button | Navigation appears as underlined links ("Se kampen ›", "Taktik ›", "Hele tabellen ›") and as chip buttons ("Forbered ›" in Kamp is a link, "Plan A" is a button). | Mostly consistent. Just make Klubkasse on Hjem a non-link, or keep it a link but drop the underline. |
| Opponent link in the bottom bar | It is missing on Hjem but present on all the other tabs. | Show it everywhere, or nowhere. |

### Accessibility
- Contrast (calculated from `style.css`): `--dæmpet #94a3b8` on panel = 6.6:1, which is OK. `.heat-1 #64748b` (low stat values in Trup) = **3.6:1**, below 4.5:1 for 12–14 px text. `--lilla #9333ea` used as text on the panel = **3.2:1** (whether the section headings use exactly this token is usikker). They look lighter in the image. White on purple buttons = 5.4:1, which is OK.
- Text size: `--fs-1` is 12 px and is used for card text, tables, explanations and h4. `--fs-graf` is 10 px. The legend under Kamp and the timeline icons are hard to read at 1366 px.
- Click targets: filter chips (Alle/MÅL/FOR…) and "Plan A/B/C" are about 22–24 px high. That's acceptable with a mouse but tight. The ⓘ icons in Taktik are about 20 px.
- Colour alone carries meaning in the Trup heat map, in the T/T form badges (red only), and for injured players on the pitch (red token). The 🚑 icon helps in the list, but the pitch only shows red.

### What Works Well
- **Hjem** is a proper "hvad skal jeg nu"-screen: last result, "1 ting" before the next round, the next opponent and a compact table excerpt.
- The **bottom bar** with "▶ Spil runde 3 af 14 · Kronborg United (hjemme)" is clear, present everywhere, and has a precise label.
- **Trup** fits all 18 players and all columns without scrolling at 1366. The heat-map colours make strengths visible at a glance, which suits a Hattrick/FM player.
- The **Taktik** split between pitch and list is the right model, and the filters are consistent across Trup, Træning and Taktik.
- **The Træning summary line** ("Ingen +1 efter runde 2 · nærmest et +1: …") is exactly the kind of interpretation more tabs should have.
- The **spillerkort** with ◀ ▶ navigation, and the air-duel formula shown openly, is consistent with the game's transparency.

### Priority Recommendations
1. **Move explanatory text behind "ⓘ"** on Taktik and Kamp (and in the Klub footnotes). This is the biggest single fix for the "klemt sammen" complaint, and it brings Taktik's controls up towards the first screen.
2. **Add internal sub-tabs on Kamp and Liga** (Kamp: Afspilning / Statistik / Referat / Karakterer; Liga: Tabel & runde / Avisen / Statistik), so each view does one job and the playback controls are visible without scrolling.
3. **Fix the card panel in Trup**: the table shouldn't be cut off silently, and the card's bottom shouldn't hide behind the bar (`1366-kort.png`).
4. **Let Træning show only what differs**: hide columns while all values are the same, and highlight "Skøn" and potential.
5. **Tighten the colour semantics and contrast**: purple only for "valgt", green only for "dit hold" and the action. Raise `.heat-1` to at least 4.5:1, and give the Klub key figure (season result) the same treatment as Klubkasse on Hjem.

Screenshots: `/tmp/claude-0/-home-user/29d556b6-1bea-50b1-99e2-61e6f81a2c1f/scratchpad/crit/shots/1366-*.png`. Colour values and the contrast check come from `/home/user/TactiVAR/public/style.css` (lines 4–9 and 68).
## Gennemgang 2 – mobil (390 px)

### Overall Impression
Rammen virker. Bundnavigationen og Spil-bjælken ligger hvor tommelfingeren når, Hjem er velordnet, og Liga-tabellen passer til skærmen. Problemet er siderne under rammen. Taktik, Kamp og Liga er 5–7 skærmhøjder lange og fyldt med 12 px forklaringstekst, og Trup, Træning, Klub og Kamp har tabeller, der skæres af i højre side uden at vise, at man kan rulle vandret. Det er præcis "for mange informationer klemt sammen".

### Usability

| Fund | Alvor | Anbefaling |
|---|---|---|
| **Kamp: afspilningen ligger under folden.** Første skærm har næste-runde-banner, "Send kampen" med en advarselstekst på to linjer, fire kampknapper stablet lodret (ca. 200 px), stilling, hændelsesstrimmel og en intro til afspilningen. Selve banen begynder først ved y≈680 (390-kamp.png). Siden er 5058 px, cirka 7 skærme med 726 px synligt indhold. | 🔴 | Gør de fire kampe til én vandret rulle-række af chips (én linje). Flyt "Send kampen" og dens advarsel ned i en ⋯-menu, og fjern intro-teksten eller fold den ind bag ⓘ. Målet er, at banen og ▶ Afspil står på første skærm. |
| **Taktik: forklaringstekst fylder mere end kontrollerne.** Under Fase 1 står et afsnit på ca. 25 linjer i 12 px, og det samme gentager sig under Fase 2, Fase 3, Hvis-Så og Udskiftninger (crops/taktik1.png, 390-taktik-full.png, 3777 px ≈ 5 skærme). Kontrollerne, dvs. fire dropdowns pr. fase, drukner i teksten. | 🔴 | Vis kun en kort linje under hver dropdown om, hvad det valgte gør (fx "Centralt: flere løb gennem midten"). Resten kan foldes ind bag "Forklar ›" eller lægges i et ark. En erfaren FM/Hattrick-spiller har ikke brug for en lærebog ved hvert klik. |
| **Trup: tabellen skæres af uden tegn på vandret rulning.** Kolonnen "Frisk/" er halvt skåret væk, og kolonnerne til højre for den kan ikke ses (390-trup.png). Ingen skygge, fade eller pil viser, at der er mere. | 🔴 | Giv `.tablewrap` en fade eller skygge i højre kant, når der er mere at rulle, og lås Pos- og Spiller-kolonnen fast (sticky). På ≤600 px kan man også vise en mobil-kolonneliste (Pos · Spiller · Natur · Frisk) og flytte resten til kortet. |
| **Trup: rækkerne er ca. 24 px høje** (18 rækker på y 222–662) og er den eneste vej til spillerkortet. Det er på grænsen af WCAG 2.5.8 (24 px) og langt under de 44 px, som projektet selv bruger til knapper. | 🟡 | Gør rækkerne mindst 40–44 px høje på ≤600 px. Der er plads, fordi siden kun er én skærm lang (390-trup-full.png = 844 px). |
| **Træning: Friskhed-kolonnen er skåret af** ("Friskhe", "-2 (0)" mod kanten), og 18 dropdowns står efter hinanden. Første skærm går med en tæt status-sætning og to forklaringsafsnit (390-traening-full.png). | 🟡 | Flyt forklaringen bag ⓘ. Lad "Sæt fokus for de viste (18)" stå øverst som den primære handling, og lad tabellen nøjes med Spiller · Fokus · Frisk og droppe Kæde, som filter-chipsene allerede dækker. |
| **Klub: Regnskab pr. runde skæres af** (Løn "473.00…", 390-klub-full.png). Nøgle/værdi-tabellen har lange værdier, der brydes over 2–3 linjer, og en løs 12 px-linje ("Lønbudget: 598.859 kr. … Præmier: 1. 1,5 · 2. 1,1 · …") står uden ramme mellem tabellerne. | 🟡 | Vis værdien som et stort tal og forklaringen i en dæmpet linje under: "473.000 kr. / runde" og under den "1.419.000 kr. pr. uge". Gør regnskabet til kort pr. runde eller lås Runde-kolonnen. Præmierækken hører hjemme under Liga eller bag ⓘ. |
| **Spillerkortet: lukkeknappen og ◀ ▶ står øverst i arket** (y≈225, 390-kort.png), altså uden for tommelfingerens naturlige område. Arket fylder 70vh. | 🟡 | Tilføj et greb øverst og luk ved at trække ned (usikkert om det findes allerede, for jeg kan ikke se et greb). Overvej at lægge ◀ ▶ nederst i arket. |
| **Spillerkortet: Sæson-tabellen** er en smal venstrekolonne med tom plads til højre. Formlen "Højde-score 20 (197 cm) × 0,35 = 7,00 · Spring 11 × 0,35 …" ligner udviklertekst (390-kort.png). | 🟡 | Læg sæsontallene i en vandret række af små nøgletal (Kampe 2 · Min 180 · Snit 6,8 · 🟨 1). Fold formlen ind bag "Hvordan regnes det?" og vis kun "Luftduel 15/20". |
| **Taktik: banen fylder hele første skærm, og spillerlisten og formationen ligger under folden** (390-taktik.png). Navnene på banen brydes ("M. / Rasmussen"). Samspilsforklaringen fylder 5 linjer under banen. | 🟡 | Gør banen lavere på mobil (fx 60 % af højden) eller sæt faner over den: Bane · Liste · Faser. Samspilsforklaringen kan blive en lille forklaring på én linje. |
| **Ord til mus på en berøringsskærm:** "Klik på en spiller …" (Trup og Taktik), "Træk = justér position · Klik på en brik …". | 🟢 | Skriv "Tryk" på ≤600 px, eller brug et neutralt ord ("Vælg en spiller"). |
| **Spil-bjælken: "🚑 #11"-pillen.** Det er usikkert, om den kan trykkes. Knappen afkortes til "Kronborg United…". | 🟢 | Kan pillen ikke trykkes, så gør den trykbar (åbn Taktik eller kortet), eller fjern den. Den samme advarsel står allerede på Hjem under "Før du spiller". |

### Visual Hierarchy
- **Hjem (390-hjem.png):** Det rigtige fanger øjet. Resultatet "1 – 1", "Nr. 6 ↓1" og den grønne ▶ Spil runde. Klubkassen "4.828.870 kr." konkurrerer dog, fordi den er det største blå, understregede element på første skærm. Gør den til almindelig tekst, og lad hele kortet være linket.
- **Kamp (390-kamp.png):** Øjet lander på den lilla kampknap og stillingen. Derefter kommer tekst, og det, man kom for (afspilningen), ligger under folden. Referatet (crops/kamp2.png) blander tidsstempler, emoji, [MÆRKATER] og en analyse på 10 linjer i én strøm, så de vigtige hændelser ikke skiller sig ud. Giv mål og kort et tungere udtryk, og læg FULDTIDS-ANALYSE i sit eget kort.
- **Taktik:** Læseflowet er bane, så liste, så seks lange fieldsets, alle med samme vægt. Ingen af dem fortæller, hvad der er vigtigst at ændre.
- **Liga (390-liga.png):** Tabellen er klar, og egen række er fremhævet i grønt. Avisoverskriften i 20 px+ er stærk og rigtig. Siden er 4627 px. Program og Statistik er foldet ind med ▶/▼, og det er godt. Det samme mønster mangler i Kamp og Taktik.
- Overordnet bærer tekst al forklaringen. Den fylder i dag mere visuel vægt end tallene og kontrollerne.

### Consistency

| Element | Problem | Anbefaling |
|---|---|---|
| Forklaringstekst | Liga folder ind (▶ Hele programmet, ▼ Spillere), men Taktik, Træning, Kamp og Klub viser alt foldet ud. | Brug samme mønster overalt: en kort linje synlig og resten bag "Forklar ›" eller `<details>`. |
| Brede tabeller | Liga-tabellen passer. Trup, Træning, Klub-regnskab, Kamp-statistik ("Bibamus Unite") og Kamp-spillerlisten (stjerner skåret af, crops/kamp3.png) skæres af, hver på sin måde. | Én regel: på ≤600 px passer tabellen, eller den har en sticky første kolonne og en fade i kanten. |
| Kamp-opstillingsbane | Den lille bane med stjerner skæres af i højre side ("VKB" halv, crops/kamp3.png), mens Taktik-banen passer. | Skalér den til bredden, som Taktik-banen gør. |
| Lilla | Lilla bruges både til "hvor du er" (aktiv fane, filter) og til Match Center-rammen og overskriften "DIN KAMP" i avisen. | Hold lilla til markering og brug neutral overskriftsfarve. Jf. paletreglen i style.css l. 2–3. |
| Links | Nogle handlinger er blå understregede tekstlinks ("Se kampen ›", "Taktik ›", "Hele tabellen ›"), andre er knapper. | Gør de primære handlinger på Hjem til knapper eller hele kortet trykbart. Tekstlinks er ca. 18 px høje. |

### Accessibility
- **Kontrast:** Den dæmpede tekst (#94a3b8 på #131c2e) giver ca. 6,7:1, og grøn #10b981 på panelet giver ca. 6:1. Begge er OK. Hvis "DIN KAMP" (390-liga.png) bruger `--lilla` #9333ea direkte på panelet, er kontrasten ca. 3:1 og dumper AA for normal tekst. Det er usikkert, for farven er aflæst på skærmbilledet. Brug i så fald en lysere lilla (fx #c084fc).
- **Berøringsflader:** Bundfanerne (56 px), Spil-knappen (44 px), kortets ◀ ▶ ✕ (44 px) og ⓘ i listen (44 px) er gode. For små er Trup-rækkerne (ca. 24 px), tekstlinks på Hjem (ca. 18 px), filter-chips og `button.mini` (fs-1 og lille padding, ca. 28–30 px) og Kamps afspilningsknapper ⏮ ⏭ 1× (ca. 28 px, crops/kamp1.png).
- **Læsbarhed:** Tabeller og al hjælpetekst er 12 px (`--fs-1`), og navnene på banen er 10 px (`--fs-graf`). Lange 12 px-afsnit i dæmpet grå (Taktik) er tunge at læse på telefon. Hjælpetekst bør være mindst 14 px, eller den bør være kortere.
- **Fast plads:** Bundfaner (57 px) plus Spil-bjælken (ca. 61 px) giver ca. 118 px, svarende til 14 % af 844 px. Det er acceptabelt, og topbjælken ruller væk på mobil, hvilket er et godt valg. Bjælken kunne skjules, mens man ruller ned, og komme tilbage, når man ruller op. Det giver ca. 60 px mere på de lange sider.

### What Works Well
- Bundnavigationen med ikon og tekst, 56 px høj, med 7 lige brede faner og tydelig aktiv markering. Topbjælken er statisk på mobil.
- ▶ Spil runde ligger altid i tommelfingerzonen og er tydeligt grøn. Den eneste grønne handling på skærmen.
- Hjem er ordnet som "hvad skal jeg gøre nu": sidste runde, så "Før du spiller (1 ting)", så næste kamp. Det er den rigtige rækkefølge.
- Liga-tabellen passer til 390 px uden rulning, egen række er fremhævet, og Statistik og Program er foldet ind.
- Spillerkortet som ark fra bunden med 44 px-knapper, og spil-bjælken skjules, mens arket er åbent.
- Træningens dropdowns og formularfelter er 16 px på mobil, så iOS ikke zoomer ind (style.css l. 245).

### Priority Recommendations
1. **Fold forklaringerne ind overalt (Taktik, Træning, Kamp, Klub, kortet).** Lad én kort linje stå synlig og læg resten bag "Forklar ›". Det rammer brugerens klage direkte og gør Taktik og Kamp flere skærme kortere.
2. **Kamp: få afspilningen op på første skærm.** Gør kampvælgeren til én vandret chip-række, flyt "Send kampen" og advarslen ud af vejen, og fjern intro-teksten.
3. **Én regel for brede tabeller på ≤600 px:** sticky første kolonne, fade eller skygge i højre kant, og færre kolonner (Trup, Træning, Klub-regnskab, Kamp-statistik og Kamp-spillerliste).
4. **Trup-rækkerne skal være mindst 44 px høje,** og "Klik" skal hedde "Tryk" på berøringsskærm. Det er den hyppigste handling i spillet: at åbne et spillerkort.
5. **Spillerkortet:** sæsontallene skal stå som en kompakt nøgletals-række, formlerne bag "Hvordan regnes det?", og arket skal kunne lukkes ved at trække ned.

Gennemgået: skærmbillederne `390-*.png` i /tmp/claude-0/-home-user/29d556b6-1bea-50b1-99e2-61e6f81a2c1f/scratchpad/crit/shots og mine udsnit af de lange sider i /tmp/claude-0/-home-user/29d556b6-1bea-50b1-99e2-61e6f81a2c1f/scratchpad/crit/crops. Målene er tjekket mod /home/user/TactiVAR/public/style.css (l. 1–9, 296–360, 400–416).
## Gennemgang 3 – tilgængelighed og konsistens

### Overall Impression
Farvesystemet er i god stand: næsten alle tekstpar ligger over AA, og F0's ene palet kan ses. Problemerne ligger tre andre steder. Mange berøringsflader er under 44 px på mobil. Skalaen i 12 px bærer hele regnearkene. Og lilla og grøn bruges til flere ting end paletten selv lover. Det er de to sidste, der giver følelsen af "for meget klemt sammen".

### Usability
| Fund | Alvor | Anbefaling |
|---|---|---|
| Trup og Taktik (390-trup.png, 390-taktik.png): rækkerne åbner spillerkortet, men er cirka 25 px høje. Det er rækkens eneste trykflade i Trup, og man rammer let nabospilleren. Taktik har ⓘ på 44 px (`.lp-info`), Trup har ingen tilsvarende knap. | 🔴 | Giv rækkerne mindst 40–44 px på ≤ 600 px (`td { padding-block }`), eller brug Taktiks ⓘ-knap i Trup også. |
| Filterknapperne (Alle/MÅL/FOR/MID/ANG, Start-11/Bænk) er cirka 30 px. Udregning: padding .3rem×2 + 14×1,35 + kant ≈ 30,5 px. `button.mini` er cirka 23 px og pille-knapperne cirka 22 px. Gælder 390-trup.png, 390-traening.png, 390-taktik.png og "Alle hændelser/Kun taktik" i 390-kamp-full.png. | 🟡 | Sæt `min-height: 44px` på `button` og `button.pill` under 600 px, som det allerede er gjort for `#play-round` og `.cp-nav`. |
| Tekstlinks som "Se kampen ›", "Taktik ›", "Hele tabellen ›" og "Forbered ›" har kun skrifthøjde, cirka 18 px (390-hjem.png, 390-kamp.png). | 🟡 | Giv `.linklike` `padding-block: .6rem` (eller `display:inline-block; min-height:44px`) på mobil. |
| Trup på 390 (390-trup.png): den vandrette rulning skærer kolonneoverskriften "Frisk/🚑" over midt i ordet, og skadesmærket "🚑 2" bliver halvt. Ud over den svage kant er der intet, der viser, at tabellen kan rulles videre. | 🟡 | Tilføj en skyggegradient i højre kant af `.tablewrap`, og overvej at sætte Pos og Spiller fast (sticky) i rulningen. |
| ⚙-knappen i topbaren er cirka 24–32 px. Udregning: 16 px × line-height 1 + .2rem×2. Kan ses i 390-hjem.png. | 🟢 | `min-width/min-height: 44px` på `button.gear` på mobil. |
| Match Center: teksten ved "Send kampen" er forskellig på de to bredder. 1366-kamp.png viser "Gemmer kampen med et kort id …", 390-kamp.png viser "⚠ Gengivelsen mangler (fx fuldt browserlager)". | usikker | Formentlig forskellig tilstand ved de to optagelser. Tjek, at advarslen ikke er en fejl på mobil. |

### Visual Hierarchy
- **Hjem** (1366-hjem.png, 390-hjem.png): øjet går først til den grønne "▶ Spil runde 3"-knap og derefter til resultatet. Det er den rigtige rækkefølge. Men holdnavnet "Bibamus United" står tre gange: i topbaren, i klubpanelet ("Dit hold") og i resultatet. På 390 bruger klubpanelet ~90 px på at gentage topbaren.
- **Trup** (1366-trup.png): i tabellen fanger den lilla Pos-kolonne øjet først. Den er lilla, fordi kolonnen er sorteret (`th.sorted, td.sorted` #251453), ikke fordi den er valgt. Derefter springer de grønne og blå tal i øjnene på kryds og tværs. Navnene ligger i hvid fed 12 px og konkurrerer med 9 farvede evne-kolonner, og overskriften "Bibamus United – dit hold" tager et helt panel uden indhold.
- **Klub** (1366-klub.png): de vigtige tal er fede i tabellen. Under tabellen følger løse linjer i 12 px ("Lønbudget: 598.859 kr. …", "Sæsonen indtil nu", "Billetter …"), der hverken står i tabel eller har en overskrift. Hierarkiet falder fra hinanden netop dér.
- **Kamp** (1366-kamp.png): stillingen 1–1 i 28 px er rigtigt betonet. Men den lilla hold-knap, de fire kamp-knapper og "Send kampen" står på samme linje som overskriften, og hændelseslisten under statistikken er i 12 px.
- **Liga** (1366-liga.png): tabellen er klar. Avisens sektionsoverskrifter i lilla versaler ("DIN KAMP") virker som links, fordi lilla ellers betyder "hvor du er".

### Consistency
| Element | Problem | Anbefaling |
|---|---|---|
| Evnenavne | Trup bruger engelske forkortelser (PAC, STA, STR, BAL, PAS, FIN, POS, INT, GK), men "Spring" og "Luft" på dansk. Kortet (1366-kort.png) bruger "Fart, Udholdenhed, Styrke, Boldkontrol …", og Træning skriver "POS 0,0 · INT 0,0" og "GK". Samme evne har altså tre navne. | Brug danske forkortelser alle steder (FAR, UDH, STY, BLD, PAS, AFS, POS, ERO, MÅL), med det fulde navn som `title`. Mobilen har ikke hover, så sæt også en forklaring i hjælpen. |
| Lilla | Paletten siger "lilla = hvor du er". I praksis betyder lilla også sorteret kolonne (Trup), aktiv filterknap, lilla rammer på Match Center og avisens overskrifter (`#a78bfa`). | Giv den sorterede kolonne en neutral tone (fx `--panel-2`) og avisens overskrifter `--dæmpet` eller hvid. |
| Grøn | Paletten siger "grøn = handling/ok". Men grøn er også "mit hold" i tabellerne (Hjem og Liga: `.standings tr.mine`), startspillernes Pos (Trup), højeste heat-trin og ingen-skade-tilstand. | Vis "mit hold" med lilla omrids eller baggrund, som "viewing" allerede gør. Så har Liga kun én markering af eget hold i stedet for to (grøn tekst + lilla linje i 1366-liga.png). |
| Filterrækker | Trup har "Alle (18)" med tal plus "Start-11/Bænk". Taktik og Træning har "Alle" uden tal. Træning har desuden en select "Sæt fokus for de viste (18) …" i samme række. | Brug samme komponent med tal alle tre steder. |
| Links til modstanderen | Hjem: "🔍 Se Kronborg United – kun offentlige data ›". Spil-bjælken: "🔍 Kronborg United" uden ›. Kamp: "Forbered ›". Hjem: "Taktik ›". | Én formulering og ét mønster (tekst + ›). "Forbered ›" og "Taktik ›" ser ud til at føre samme sted hen; ensret dem (usikker på destinationen). |
| Pille vs. mærke vs. chip | `.pill`, `.form-pill`, `.listed-tag`, `td.gain::after` og `.chip` (Kæde-kolonnen: MÅL/FOR) er fem næsten ens komponenter med hver sin padding og line-height (1,25–1,5). | Saml dem i én `.pill` med størrelses- og farvemodifikatorer. |
| Emoji | ⭐ betyder både "Vurd" og opnået arketype (🌟); 💼 er både fanen Klub og klubkassen; 📺 er både fanen Kamp og "Referat"-links; 🟨 og 🟥 står alene som rækkenavne i kortets statistik (1366-kort.png). Fanerne har emoji på desktop og mobil, men panelernes overskrifter har kun emoji nogle steder ("📋" mangler på Taktik-panelet). | Én betydning pr. emoji. Rækkenavne skal have tekst ("🟨 Gule kort"). |
| Positioner | Pos bruger danske forkortelser (MV, VB, MS, CM, HM), men Natur blander "Back", "Kant", "MS" og "ANG". Kæde-chippen "ANG" står ved siden af Natur "ANG". | Ensret til én vokabular, og forklar Natur vs. Pos i hjælpen. |
| Klubøkonomi | "Lønbudget" står to gange med to forskellige tal: "125.859 kr. mere pr. runde" i tabellen og "598.859 kr. pr. runde" under den. Sæsonen hedder både "forventet −965.000" og "prognose 3.864.000" (1366-klub.png). | Ét tal pr. begreb, og afklar forskellen mellem kasse og resultat. |

### Accessibility
**Kontrast** (WCAG 2.1, udregnet fra `:root` i style.css; AA kræver 4,5:1 for normal tekst og 3:1 for UI-grafik):

| Par | Forhold | AA |
|---|---|---|
| `--tekst` #f1f5f9 / `--bg` #0b1220 | 17,09 | ✔ |
| `--tekst` / `--panel` #131c2e | 15,54 | ✔ |
| `.muted` `--dæmpet` #94a3b8 / `--bg` · `--panel` · `--panel-2` | 7,30 · 6,64 · 5,79 | ✔ |
| Links `--blå` #7dd3fc / `--panel` | 10,21 | ✔ |
| Knap aktiv: hvid / `--lilla` #9333ea (også VAR-badge) | 5,38 | ✔ |
| Primær knap #052e16 / `--grøn` #10b981 | 5,88 | ✔ |
| `--grøn` som tekst / `--panel` (mit hold, Gemt) | 6,71 | ✔ |
| `--rød` #ef4444 / `--panel` (↓1) | 4,53 | ✔ (lige på grænsen) |
| pill-ok / pill-ban / pill-injury / pill-tired / pill-info | 9,09 / 7,82 / 8,26 / 9,61 / 8,91 | ✔ |
| form-V / form-U / form-T | 9,09 / 5,79 / 7,82 | ✔ |
| **heat-1 #64748b / `--panel`** (Trup-tal under 8, `.lockcell`) | **3,58** | ✘ ved 12 px |
| **heat-1 / sorteret kolonne #251453** | **3,39** | ✘ |
| **`.star-off` #475569 / `--panel`** (Rundens bedste ★, Trup-stjerner) | **2,25** | ✘ (også under 3:1 for grafik) |
| Knapflade `--panel-2` / `--panel` | 1,15 | ✘ 1.4.11 (knappen kan kun kendes på teksten) |
| Kant `--kant` / `--panel` · `--bg` | 1,32 · 1,46 | ✘ for inputfelter og selects |
| Lilla fane-streg / `--panel` | 3,16 | ✔ (grafik) |
| Deaktiveret (opacity .5) ≈ 2,64 | – | undtaget, men svært at læse |

Udregningen ligger i `/tmp/claude-0/-home-user/29d556b6-1bea-50b1-99e2-61e6f81a2c1f/scratchpad/cr.py`.

**Farve som eneste betydningsbærer:**
- Heat-skalaen i Trup (1366-trup.png, `heatClass` i ui/matrix.js:49): fire trin, kun farvet. Kun trin 4 er også fed. Trin 2 (8–11) er #f8fafc, altså samme farve som al anden tekst, så "middel" kan ikke skelnes fra kolonner uden farve (Alder, Højde). Grøn #34d399 mod blå #7dd3fc er begge lyse og kan forveksles ved deuteranopi (usikker; ikke simuleret).
- ★★★★★ fyldt mod tom skelnes kun på farve, og den tomme har 2,25:1.
- Tabellernes "mit hold" vises kun med grøn tekst (Hjem). På Liga er der også en lilla linje.
- V/U/T-pillerne har bogstavet som tekst ✔. Dit program viser stillingen i tekst ✔. Pilen ↓1 har symbol ✔.
- Banen (390-taktik.png): skadet brik er rød fyldning (#881337, hvid tekst 9,57:1), men det ses kun på farven. Listen har til gengæld 🚑.

**Skriftstørrelser:** Fem trin (12/14/16/20/28) er godt. Men 12 px (`--fs-1`) bærer hele Trup, Liga-tabellen, kampreferatet (`.feed`), Klubs løse linjer og mobilens fanenavne. `--fs-graf` 10 px bruges til navne på banen (390-taktik.png: "M. Rasmussen" knækker over to linjer) og afspilningsbrikkerne. Det er for småt til læsning på telefon.

**Fokus:** style.css har ingen `:focus-visible`-regler. Chromiums standardring virker formentlig, men den er ikke testet mod mørk lilla og grøn (usikker). Fanerne på desktop er `button` med gennemsigtig baggrund ✔. Spillerkortets ◀ ▶ ✕ har `aria-label` ✔. Gemte kortoverskrifter er visuelt skjulte, men findes for skærmlæsere ✔.

### What Works Well
- Paletten er samlet i `:root` med semantiske navne (`--aktiv/--ok/--advarsel/--fejl`), og næsten alle tekstpar ligger langt over AA.
- Pillerne har lys tekst på mørk tonet baggrund (7,8–9,6:1) og bruger både tekst/emoji og farve.
- Mobilen har en fast bundnavigation med 56 px høje faner. Spil-knappen er 44 px og over navigationen. Spillerkortets knapper og Taktiks ⓘ er bevidst 44 px ved ≤ 600 px.
- Inputs bliver 16 px ved ≤ 900 px, så iOS ikke zoomer ind.
- Spillerkortet som ark fra bunden på mobil og panel fra højre på desktop er konsekvent, og regnearket står til venstre for panelet (1366-kort.png).
- Hjem svarer faktisk på "hvad skal jeg nu": Før du spiller, næste kamp, tabeludsnit.

### Priority Recommendations
1. **Berøringsflader på mobil:** `min-height: 44px` for `button`, `button.pill`, `.linklike` og tabelrækkerne i Trup og Træning ved ≤ 600 px. Det er den største daglige gevinst på telefonen (390-trup.png, 390-traening.png, 390-hjem.png).
2. **Heat-skalaen må ikke kun være farve:** heat-1 skal op over 4,5:1 (fx #8b9ab0 i stedet for #64748b). Giv heat-2 en egen tone, eller lad den være neutral og mærk kun yderpunkterne (fed for 15+, dæmpet for under 8). Fyldte stjerner skal kunne skelnes fra tomme ved form (☆ mod ★) eller med tal ("4/5").
3. **Ét vokabular for evner og positioner** på Trup, Træning, kortet og Taktik: danske forkortelser med `title`, og en forklaring i hjælpen. Det letter direkte klagen over "for mange informationer".
4. **Hold lilla og grøn til det, paletten lover:** sorteret kolonne neutral, "mit hold" i lilla i stedet for grøn, og avisens overskrifter ikke lilla. Så betyder farverne én ting hver, og tabellerne bliver roligere.
5. **Mindre gentagelse og mindre 12 px på mobil:** fjern klubpanelet på Hjem og Trup (topbaren har navnet), saml Klubs løse linjer i tabellen med ét tal pr. begreb, og hæv referat-feed og fanenavne til 14 px. Hold `--fs-graf` til tal på brikker, ikke navne.