# QC-hukommelse (TactiVAR)

- Skema-bump uden migrering = tabt liga ved hvert deploy. Spørg ved hver PR,
  der tilføjer felter til det gemte: indlæses forrige versions fixture?
- Brugerens kerneklage er "ting falder af efter deploy". Tjek hver PR mod
  regressionsnettet i docs/spec.md §9b — ikke kun mod PR'ens egen beskrivelse.
- Afledte strenge beregnet EFTER en mutation (fx kamphoved efter Hvis-Så-skifte)
  modsiger det, der blev vist før. Tjek hvornår et resumé beregnes.
- Bogføring skal have en idempotens-vagt (runde N kan kun bogføres når ligaen
  står på N−1) – dobbeltklik og genindlæsning midt i afspilning.
- Resultatobjekter må ikke bære skjulte tal ud til UI ufiltreret: alt der vises
  for en modstander går gennem engine/visibility.js (viewPlayer, viewRatingEntry).
- En knap i et panel, der kun vises i én tilstand (fx eget hold), forsvinder i den anden. Tjek at hver til/fra-knap kan slås fra igen i alle visninger.
