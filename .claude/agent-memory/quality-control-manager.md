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
- Avis/opsummeringer, der viser spillerdata, skal gennem visibility.js – ikke egne "isMine ? tal : stjerner".
- Filtre skal have paritet med kilden (fx "Kun taktik" viste ikke Hvis-Så-skift, fordi TRIGGER er HIGHLIGHT).
- Bogfør-før-afspil er rigtigt for data, men spoiler tabellen og de andre kampe – sig det i UI'et.
- Afledte referattekster, der forgrener sig på modstanderens indstillinger (offside-fælde, omstilling), lækker. Grep på `phases` i match.js ved hver ændring af tekster.

- Faner: en handling må ikke kræve en anden fane end den, dens hjælpetekst står i (v3.5: bænk under banen, kort i Taktik).

## v3.19.0 (Security-runden) – sanitize og fangede fejl
- En sanitize-reparation må kun fjerne det ugyldige, ikke hele objektet, når UI'et allerede tåler forældreløse id'er (træningsrapporten efter salg).
- "Endeligt tal" er ikke "gyldigt tal": tjek hvad rendereren gør med værdien (repeat, indeks) og klem til domænet (publicStars 0–5).
- At fange en fejl flytter den væk fra window.onerror, fejlboksen og e2e's pageerror – spørg, hvor den nu bliver synlig.
