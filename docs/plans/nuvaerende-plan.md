# NU (7/11): v3.33.1 – Sæsonrapporten på Hjem, varsel om karrierestop og sæsontal i "Dit hold" (brugerens ønsker 6/11, backlog 000.3)

Brugeren 6/11 aften:
- A) "sæsonrapport skal være på enten Hjem eller Klub, da den vedrører min klub" → valgt: HJEM.
- B) "Jeg synes ikke jeg er blevet advaret om at en spiller ville stoppe karrieren, det skal være med, og markeres på trup siden" →
  👋 i Trup + linje på Hjem; valgt 7/11: varsel FRA RUNDE 7 (mens vinduet før runde 8 er åbent), og hans VÆRDI FALDER (karrierestoppet
  er offentligt).
- C) Statistik "dine spillere": "2 spillere … har 0 kampe, men alligevel har fået karakter, har løbet km, og så er der ingen forklaring på
  hvad 'Fri (sæson)' betyder" → valgt 7/11: NYE SÆSONFELTER, så alle kolonner er for sæsonen.

GEMMEFORMATET ÆNDRES (skema 9 → 10): brugeren spørges før udrulning.

## Plan-gennemgangen (QC opus, Spilfører UI, Spilfører klub, Spilfører økonomi, Arkitekt – 7/11), indarbejdet
### D0 Planfilerne
- v3.33.0 flyttet øverst i `tidligere-planer.md` ("live 7/11, e2e mod live 859/859"); denne plan her.

### D1 Gemmeformat 10 (engine, ingen UI)
- `PLAYER_SEASON_FIELDS` += `sDistanceSum, sMinutesSum, sHiKmSum, sHiDistSum` (standard i sanitize, nulstilling og arkiv
  `lastSeasonStats` ved sæsonslut gratis); `OWNER_FIELDS` += de fire (private som `freeRunsSum`). Optælles ved siden af `distanceSum`.
  `runStats(p, scope)` – 'career' eller 'season' – ÉN formel.
- Markør `league.runStatsFromRound`: ny liga 1, migreringen `md.round + 1`; arkiveres som `runStatsFrom`; vises via `fromK(league, key)`.
- Karrierestop-flaget `p.retiring` (offentligt): sættes i sæsonens runde 7 (`RETIRE_WARN_ROUND` 10 → 7) FØR vinduet åbner =
  `willRetire(p, sæson)` for alle hold; ryddes ved sæsonskiftet; migreringen sætter det for et gem med ≥ 7 spillede runder i sæsonen.
  Kortet, Trup, Hjem og prisen læser KUN flaget.
- `SCHEMA_VERSION` 10, `MIGRATIONS[9]`; fixture `tests/fixtures/save-v3.33.0.json` (lavet med bc5b1fb – `tools/make-save-v3330.mjs`).

### D2 Værdifald (Spilfører økonomi)
- `publicValue` = `baseValue` · 0,5 (`RETIRE_VALUE`; 7 af 14 runder tilbage) for en spiller med `retiring`; `publicWage` fra `baseValue` –
  lønnen falder IKKE (ellers genforhandlede et køb den til det halve). Bots i trin 3 ("forstærk tyndeste kæde") springer ham over; i trin 2
  (under minimum) må de købe ham. Lønloftet på fuld løn.
- Tekster: kortet (egne) "👋 Stopper efter sæsonen – værdi X kr. (halv: 7 af 14 runder tilbage). Løn uændret Y kr. pr. runde."; køb fra
  bot "han stopper efter sæsonen: 7 runder for prisen"; Til salg "(X kr. · 👋 stopper)".

### D3 Statistik-tabellen "Dit hold" = sæsonen
- Kolonner "Spiller | Kampe | Snit | km/90 | HI % | Fri løb | Friskhed", perioden én gang over tabellen; Snit fra kamphistorikken i
  sæsonen; km/HI fra sæsonfelterne (med "fra R{k}"); "–" i alle sæsonkolonner uden sæsonkampe; karrieren i title; ⓘ-forklaring under
  tabellen. Talkolonner højrestillet (CSS-fejlen `.standings td:nth-child(2)` begrænset til ligatabellen). I rapportens periode den
  afsluttede sæson. "⭐ Vurd" i Trup/Taktik siger "(karriere)".

### D4 Varslet i Trup + Hjem
- 👋 efter navnet i Trup (alle hold – offentligt), forklaring i Trup-hjælpen; markeringen følger den VISTE runde under afspilning.
- Hjem "Før du spiller": info-række (tæller ikke som opgave) "👋 Stopper efter sæsonen: … – vinduet er åbent til runde 8" / "– find en
  afløser ved sæsonslut"; "… og N mere" over 3; "Trup ›". Kortet: "Stopper efter sæsonen".

### D5 Sæsonrapporten på Hjem
- Flyttet fra Liga til Hjem (efter afspilnings-vagten), øverst i hovedkolonnen; overskrift "📋 Sæson N er slut – nr. X af 8";
  ungdomstilbuddene først; "Svar ↑" i "Før du spiller"; Klub får "📋 Sæsonrapport ›" i samme periode (ét prædikat).

### D6 Udgivelse
- NEWS '3.33.1', `version.js` 3.33.1, spec, backlog 000.3 → Lavet (000.4 VAR bliver v3.33.2).
