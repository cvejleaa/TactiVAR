# Hukommelse – spilfoerer-oekonomi

Oprettet 2026-10-27 (v3.22.1). Den fælles backlog er `docs/backlog.md`; skriv her kun det, der hjælper DIG næste gang:
fund der er rettet (så du ikke finder dem igen), hvad brugeren har valgt fra, og målinger med deres tal.

## Rettet (gå ikke efter dem igen)
- v3.21.1 transferlåsen: salg ved 18 spillere (ungdomsspiller ind), køb der sænker lønnen, fritstilling, højst 2 salg pr.
  vindue, ungdom i karantæne (KUN refillYouth – se åbent fund 1), alt vist pr. runde.
## Brugerens valg
- "Ungdomsspiller ind" og "Køb der sænker lønnen" (v3.21.1).
- Transfers: vinduer + FAST PRIS, ingen forhandling (spec §2 "Transfers"). Foreslå ikke bud/forhandling – justér inden for fast pris.

## I backloggen fra rundtur 1 (v3.22.1): nr. 7 køb-udvikl-sælg, 11 kontrakter, 13 pris/stjerner, 18 marked, 20 indtægtsvalg.

## Rundtur 2026-10-28 (v3.24.0) – foreslået (scripts i scratchpad/oek: youthflip.mjs, cash.mjs, market.mjs)
1. Ungdomsflip: takeYouth (state/actions.js:43) sætter ingen lastMove → tag 2 ungdom ved sæsonslut, sælg straks: 350k+375k
   pr. sæson, 4/4 seeds, 0 kr. løn. Skal lukkes før nr. 7 hæver buddene.
2. Botmarkedet dør: passiv 3 seeds × 5 sæsoner: 0 transfers i S1–S3 (alle seeds), bot-trupper 18→20→21→22 af ungdom,
   trin 3 i openWindow kræver <22 og en sælger med overskud (aldrig samtidig). Botkasse snit 5,0 → 1,8–3,3 mio (min ≈ 0);
   din (18 mand) 4,4–6,2. NB lifecycle.txt i rundturens materiale viste 7–27 transfers – ikke genskabt af mig (4 4 passiv: 0–2).
3. Værdi i hele stjerner (career.js:41/48): 10 af 18 egne til præcis 1,2 mio; en stjerne over 0,5-grænsen fordobler lønnen →
   lønhop +39 %/+31 % (seed 2/3, S1) og −1 % i browserrunden. Glidende værdi efter valueStars.
4. Scouting som køb af viden: corr(vist ★, nøglesnit) 0,64–0,73; pris 1.925k dækker nøglesnit 9,7–15,3.
- Samspil (v3.24.0) ændrer ikke økonomien målbart (spec: alle fremmede −0,12 mål/kamp; lifecycle ±0,025). measure-lifecycle
  måler nøglesnit, ikke point – kan ikke se samspil.
- Til klub: ungdomstilbud er ens i alle ligaer (derivedRng('youth', season, team.id), season.js:257 – samme navne i 4 seeds).
