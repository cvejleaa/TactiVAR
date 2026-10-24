---
description: Spilføreren spiller en hel sæson i den rigtige side og læser alle referater og skærmbilleder
---

# Sæsongennemgang (brugeren 2026-10-23: "spilføreren skal køre en hel sæson igennem, læse alle referater og kigge
# på UI – på den måde slipper jeg måske for at skulle teste hver gang")

Kør før en udgivelse, der ændrer kampmotoren, referaterne, klummen eller Liga/Kamp-fanen – og når brugeren beder om det.

1. Spil sæsonen (lokal side, nuværende branch; `BASE_URL=https://tactivar.web.app` for den live):
   `node tools/season-walkthrough.mjs <scratchpad>/saeson` – 14 runder som en bruger (▶ Spil runde, ⏭).
   Mappen får pr. runde `NN-runde.md` (alle fire kampes referater kronologisk, kamptal, Liga-fanens tekst),
   `NN-kamp.png`, `NN-kamp-mal-billede.png` (første 📍), `NN-liga.png`, sæsonslut-billeder og `fejl.txt`.
2. Start **Spilføreren** (domaene-raadgiver) på mappen: læs ALLE 14 referatfiler og billederne; find tekster der er
   faktuelt forkerte for situationen, gentagelser (med antal), dårligt dansk, urealistisk fodbold (hvem scorer, hvorfra,
   tal der ikke hænger sammen), klummepåstande uden belæg og forvirrende UI. Rangér efter hvor meget det skader
   spiloplevelsen, citér ordret, og peg på årsagen i koden.
3. Rapportér fundene til brugeren og foreslå, hvad der rettes først. Rettelser går den normale vej (roller, PR).
