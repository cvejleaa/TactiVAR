# Test Manager – hukommelse

- e2e har hårdkodet port (tests/e2e/run.mjs PORT=5055): ret til privat port i worktree før kørsel; node_modules symlinkes fra hovedcheckoutet.
- Muter-harness: python-script med (navn, fil, fra, til)-liste, kør `npm test` + `npm run test:e2e`, `git checkout -- fil` mellem. ~10 s pr. mutation.
- Gentagen mønster: test kalder handlingen direkte (act.syncActivePreset) men intet tester at app.js change() faktisk kalder den -> fjern kaldet, suiten grøn. Tjek altid at "ledningen" er testet, ikke kun funktionen.
- Dobbelt vagt: migration + normalizeLeague/fixTactics normaliserer samme regel -> hver kan fjernes alene med grøn suite (kun begge sammen fanges).
- "Tom handling"-grene (same-check) og clone-vs-reference overlever typisk: assertér at intet event logges / at plan-objektet ikke aliaseres.
- DRAW-betingelse testet kun på lighed og "foran" -> `<=0` overlever; test også bagud.
- Negativ-assert på tekst (doesNotMatch) er tom, hvis grenen der producerer teksten aldrig kører i fixturet: MOD-KUNNEN-noten kræver pmM>=50, men friske ligaer (seed 1/7/42) har max ~52 på ét hold -> grenen kørte 0 gange, mutation der gen-indsætter "%" overlevede. Probe: tæl events der matcher den POSITIVE tekst; sæt data (counterTactics=90) i testen.
- e2e-regex på #player-card alene dækker ikke andre steder samme tal kunne stå (#opponent-bar): ret til hele body.
- Mod-kolonnen: rækkefølge/gennemsnit/sort kun format-testet (^\d+ · \d+ · \d+$) -> reverse/slice/sort-mutationer overlever. Assertér mod p.counterTactics.
- Hurtig harness (v3.6): 4 kopier af public/tests/tools i scratchpad (symlink node_modules), PORT-env i e2e, unit først og e2e kun hvis unit grøn: ~140 mutationer på ~13 min. Bash-værktøjet afviser heredoc med ${...}/backticks -> opret filer med Edit (tom old_string).
- v3.6 fase-duel: testene kører kun ÉN retning (angriberen taber alle 30 ticks). Vinder-grene af referattekster, bot-vs-bot-tekst, pressets halvdel af duelLog og pause-sætning nr. 2 overlever -> når en test gentager samme fixture, mutér den modsatte gren.
- Vægte testet med margin ±1 (24,75 vs 25,75): STYLE_BONUS 2/4 og MASTERY_WEIGHT 0/0,03/0,1 overlever (mod-kunnen er 25 for begge). Pin med tie: INT så build+bonus == press (>= vinder) og INT+1 taber; sæt counterTactics != 25.
- XP: gain=4 giver samme sekundær for 0,4/0,5/0,6 og round/floor/ceil -> brug gain 3/5. Tjek ledningen ratings.js xpFor(minutter, tacticWins, goals): alle tre kan nulstilles med grøn suite.
- e2e '.mine'-klasse testes kun hvor mit hold tilfældigvis står som a/hjemme -> asymmetriske mutationer overlever; test begge sider.
- Ækvivalent mutation: Math.max(1, rule.margin || 1) – ||1 skjuler max(0..) for margin 0; brug negativ margin (-2).
