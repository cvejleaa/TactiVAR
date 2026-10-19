# Test Manager – hukommelse

- e2e har hårdkodet port (tests/e2e/run.mjs PORT=5055): ret til privat port i worktree før kørsel; node_modules symlinkes fra hovedcheckoutet.
- Muter-harness: python-script med (navn, fil, fra, til)-liste, kør `npm test` + `npm run test:e2e`, `git checkout -- fil` mellem. ~10 s pr. mutation.
- Gentagen mønster: test kalder handlingen direkte (act.syncActivePreset) men intet tester at app.js change() faktisk kalder den -> fjern kaldet, suiten grøn. Tjek altid at "ledningen" er testet, ikke kun funktionen.
- Dobbelt vagt: migration + normalizeLeague/fixTactics normaliserer samme regel -> hver kan fjernes alene med grøn suite (kun begge sammen fanges).
- "Tom handling"-grene (same-check) og clone-vs-reference overlever typisk: assertér at intet event logges / at plan-objektet ikke aliaseres.
- DRAW-betingelse testet kun på lighed og "foran" -> `<=0` overlever; test også bagud.
