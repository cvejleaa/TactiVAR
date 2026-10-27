---
description: De fire Spilførere (motor, økonomi, klub, UI) går hvert deres område igennem og fylder den fælles backlog
---

# Spilfører-rundtur (brugeren 2026-10-27: "jeg føler vi er gået lidt i stå med udviklingen, måske fordi jeg kommer med nye
# ønsker … 1 med fokus på spilmotor, 1 med fokus på økonomi, 1 med fokus på klubben og 1 med fokus på UI og den gode
# spilfornemmelse")

Kør når backloggen (`docs/backlog.md`) har færre end 3 åbne punkter i "Næste", efter en større udgivelse – og når brugeren
beder om det. Formålet er, at udviklingen ikke står stille mellem brugerens ønsker.

1. Spil en sæson, så alle har samme materiale: `node tools/season-walkthrough.mjs <scratchpad>/rundtur` (se
   `saesongennemgang.md`). Kør desuden `node tools/measure-lifecycle.mjs` (3 sæsoner) og gem udskriften i mappen.
2. Start de fire **parallelt** med mappen og `docs/backlog.md` (så de ikke foreslår det, der allerede står der):
   `spilfoerer-motor`, `spilfoerer-oekonomi`, `spilfoerer-klub`, `spilfoerer-ui` – hver i rundtur-tilstand (højst 5 punkter).
3. Saml i `docs/backlog.md`: dubletter slås sammen, hvert punkt får område, størrelse (S/M/L), værdi (1–5) og belæg.
   Prioritér efter værdi pr. størrelse; brugerens egne ønsker går altid forrest. Punkter, brugeren har valgt fra, kommer ikke
   tilbage.
4. Vis brugeren de 3–5 øverste i én kort liste og start på det første (efter CLAUDE.md – Arkitekt/QC/Spilfører på planen, når
   det er større end en rettelse). Spørg kun, hvis et punkt kræver en beslutning om spillets retning.
