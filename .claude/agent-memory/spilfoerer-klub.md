# Hukommelse – spilfoerer-klub

Oprettet 2026-10-27 (v3.22.1). Den fælles backlog er `docs/backlog.md`; skriv her kun det, der hjælper DIG næste gang:
fund der er rettet (så du ikke finder dem igen), hvad brugeren har valgt fra, og målinger med deres tal.

## Rundtur 1 (2026-10-27, v3.22.1, branch claude/busy-hawking-lpk4y5) – foreslået, ikke afgjort
1. Sæsonrapporten fortæller ikke sæsonen (ingen placering/topscorer/sæsonens spiller – står kun i Liga "Tidligere sæsoner").
2. Sæsonhistorik pr. spiller: kun `careerGames` overlever; matchLog cap 28 (career.js:17) → mål/oplæg glemmes efter 2 sæsoner.
3. Spillere 24+ kan ikke udvikle sig: `initialPotential` giver room 0 for >23 år (career.js:33–38), roomOf klemt til 0,1.
   Måling (scratchpad klub/room.mjs, 5 seeds, mit hold, fokus = kædens): 24+ 45/45 ved loftet, 0,00 evnepoint/spiller/sæson;
   20–23: 1,23; ≤19: 4,20. I sæsonens Trup: 10 af 18 "tæt på sit loft".
4. Ingen sæsonmål/forventning; præmiestigen 1.–8. = 1,4 mio. ≈ 2,5 runders løn (551.000/runde efter +31 %).
Samspil (backlog 1) er allerede i backloggen – foreslå ikke igen.
