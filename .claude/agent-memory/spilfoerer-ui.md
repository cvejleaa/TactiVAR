# Hukommelse – spilfoerer-ui

Oprettet 2026-10-27 (v3.22.1). Den fælles backlog er `docs/backlog.md`; skriv her kun det, der hjælper DIG næste gang:
fund der er rettet (så du ikke finder dem igen), hvad brugeren har valgt fra, og målinger med deres tal.

## Rettet (gå ikke efter dem igen)
- v3.21.2 klummen (din kamp i overskriften, ægte comebacks, færre gentagelser); v3.22.0 Kampens tal under heat map'et
  (kun dit hold, dueller kun i listen); v3.20.1 layout (afspilning til venstre, statistik og referat til højre).

## Rundtur 2026-10-27 (v3.22.1, sæson 1: nr. 3, 20 point) – foreslået, ikke rettet endnu
- Avisens overskrift om DIN kamp kun i 5/14 runder (R1,3,4,5,11): STORY.upset 90/late 60 slår dit resultat, der ingen
  story har (column.js:56, :301). R8 5-0-sejr fik "Overraskelse: Lyngby slog Furesø"; sæsonslut fik en overraskelse.
- Referatets duel-linje gentages ordret: "X spiller sig igennem din mellemblok – presset når ikke frem." 9× i R3, 13× i R10
  (match.js:1315-1316).
- Nederlag uden "hvorfor": R3 12 % bold, 0-30 i skud – fuldtids-analysen er én talmur, peger ikke på indstillingen.
- Sæsonslut: rapporten er administrativ (præmie, løn, alder); "din sæson" er én linje i avis-banneret.
- Avisen står både på Kamp (app.js:402 via matchcenter.js:314) og Liga (app.js:413); Kamp-fanen 5720 px høj ved 390 px.
- "– det holdt ikke mod jer" efter nederlag (R7, R9) læses som "I stoppede dem" – valgt bevidst i v3.21.2; rejs kun igen
  hvis brugeren klager.
- Mobil 390 px: intet vandret overløb (målt med eget playwright-script mod tools/serve.mjs).
