# NU (7/11): v4-programmet – trin 1+2: measure-tactics + 00 VAR læser taktikken (= v4.0.0)

Programmet (23 PR'er, "v4 STOR", "kør løs" – brugeren 7/11): `docs/plans/v4-forslag.md`. Denne fil holder det igangværende trin.

## Trin 1 – tools/measure-tactics.mjs (S)
Parret sweep af ét taktikvalg ad gangen (fokus, fælde/linje, pres, formation) for dit hold mod 7 botter, hjemme + ude, N seeds, ± SE,
mod en anden rod (worktree) – generaliserer harnesset i `tools/measure-central.mjs` (`sammenlign <rod> --par P`) til `tools/lib/paired.mjs`.
Sweep også modstanderens fokus/pres. Udskriver H/U/U, mål pr. kvarter, førerens skudandel før/efter 60', scorer pr. rolle.
Bevis: mod main (v3.33.1) gengives Cutbacks 1,479 / Centralt 1,334 / fælde fra 1,395 inden for ± SE.

## Trin 2 – 00 VAR læser taktikken + kalibrering (M) → version 4.0.0
Se backlog 00 + 000.4 og `docs/plans/v4-forslag.md` trin 2. Plan-gennemgang: Spilfører motor + QC før byg.
