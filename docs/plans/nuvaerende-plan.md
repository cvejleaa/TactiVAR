# NU (6/11): v3.32.3 – Samspil på Taktik (brugerens ønske 6/11, backlog 000.1)

Brugeren 6/11: "Jeg kan ikke på taktik siden se, hvem den valgte spiller spiller godt sammen med, og er derved afskåret fra at
udnytte det når jeg sætter taktik." Kun UI + rene hjælpefunktioner – INGEN motorændring, intet nyt gemmefelt.

## Plan-gennemgangen (Arkitekt, QC opus, Spilfører UI, Spilfører klub – 6/11), indarbejdet
### D0 Planfilerne
- v3.32.2 flyttet øverst i `tidligere-planer.md` ("live 6/11, e2e mod live 786/786"); denne plan her.

### D1 Rene funktioner (`engine/chemistry.js`; unit `tests/unit/chemistry-v3323.test.mjs`)
- `lineupPairs(team, ref, slots = team.tactics.lineupSlots)` – bagudkompatibel.
- `partnersOf(team, ref, pid)`: `neighbours` = de LÆSTE nabopar (`playerPairs`/`readPairs` – angriber⇄angriber og målmanden udelades)
  stærkeste først; `weakest`; `others` = andre markspillere i truppen, han har spillet ved siden af (≥ "finder hinanden"), med
  `where` start|bænk|reserve – ikke hans naboer på banen (heller ikke angriber⇄angriber); `isGK`; `sameBand`. Manglende par = fremmede
  (`chemOf`) – ingen fallback til seedet. Et seedet par (holdets seed-runde, aldrig over 78) tæller ikke som "spillet sammen".
- `focusChemText(team, ref, pid)`: kun båndenes ord (BAND_WORD), aldrig 0–100-tal. Naboerne i ord + "svagest: …"; alle i samme bånd →
  "Alle hans naboer: <bånd> – samspil vokser kampe side om side (ca. N kampe til …)" (`gamesToSettle(ref, from, to)`); ingen stærke →
  "Ingen stærke par endnu – ca. N kampe mere side om side"; højst 2 "Kender også #8 X (stærkt, bænk) – samspil tæller kun, når de står
  som naboer"; målmand → "Målmanden indgår ikke i samspil."; skadet/udelukket markeret.
- `swapPreview(team, ref, a, b)` → `{ kind, up, down, changes }`: SAMME `act.pickForSwap` på en kopi af `lineupSlots`/`matchBench`,
  vurderet med `swapChanges`. Ligger i `state/actions.js` ved `pickForSwap` (ikke i chemistry.js): så findes byt-reglen ét sted, og
  motoren importerer ikke tilstandslaget. Paritet: `changes` = 🤝-beskeden efter selve byttet (`withChem`, app.js).

### D2 UI
- Fokus = `view.pitchSwapId` (valg = start byt) – ingen ny tilstand. På banen: hans linjer `.focus` (tykkere, uigennemsigtige – også
  "spillet sammen"), de andre dæmpet (`svg[data-focus]`, opacity .25); naboernes brikker en ring i båndets farve; lilla = kun valgt.
  Ingen overgang (tavlen tegnes om ved hvert klik), så reduceret bevægelse rammes ikke.
- Teksten i den eksisterende valgbesked `#pick-msg` (ikke en ny linje under banen); "Se kort ›" sidst. Kun eget hold.
- Byt-forhåndsvisning i Plads-cellen ("+2 −1", "−1", "±0"; title = beskeden efter byttet) – ingen ny kolonne, intet på banen; bænk ⇄
  reserve: ingen.
- Trykfelt ≥ 44 px om brikkerne ved ≤ 600 px (usynligt `::after`, tegningen 29 × 29 uændret).
- `chemLegend`, `#chem-weakest` og kortets "Bedste makker" uændret (begge nabo-baserede – teksten modsiger det ikke).

### D3 Docs og udgivelse
- spec §5 Visning · `public/version.js` 3.32.3 · NEWS '3.32.3' · backlog 000.1 → Lavet.

## Tests og mutationer
- Unit: varierede værdier (stærk bænk-tidligere-nabo, ST⇄ST stærkt, seedet ikke-nabo på 78, målmand, skadet og udelukket starter,
  manglende par, reserve); paritet preview ⇄ beskeden efter byttet for hvert klik fra 6 spillere.
- e2e "v3.32.3" (390 tap, 1366 klik): line.focus = hans læste par, de andre dæmpet (computed opacity), naboring, den præcise tekst,
  bænkrække uden fokus, modstanderhold uden samspil, preview = beskeden efter byttet, ±0 → ingen besked, trykfelt ≥ 44 ved 390, ikke ved 1366.
