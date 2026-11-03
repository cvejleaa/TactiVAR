# NU (3/11): v3.31.1: ▶ Spil runde i bunden på alle faner – med opstillingens tegn

## Context
Brugeren (3/11, skærmbilleder af v3.30.0): "spil knappen er placeret forskelligt på de enkelte faner, og det er forvirrende".
I dag: stor grøn Spil-bjælke i bunden kun på Hjem og Taktik (`BAR_TABS = ['hjem','taktik']`, public/app.js:43); på Trup,
Træning, Kamp, Liga, Klub og ⚙ en lille ▶ i topbaren (`renderControls`, app.js:372–383) med tegnene "⛔1 ⚠3" (`#mini-warn`).
Bjælkens piller vises i dag kun på Taktik (`renderPlayBar`, app.js:388–405; Hjem har listen lige over).
Brugerens valg: "Bunden af alle faner, men med info om problemer i opstillingen som der er på den lille knap".

## Ændringen
1. Spil-bjælken på ALLE faner (de 7 + ⚙): `BAR_TABS` fjernes (bjælken altid), den lille ▶ i topbaren fjernes helt
   (`mini-play`, `#mini-warn`, `.mini-lbl/.mini-num` + CSS).
2. Bjælkens tegn på alle faner: pillerne (`issueGroups()`) vises på alle faner, ikke kun Taktik – samme regler som i dag
   (>3 grupper → "N ting"; præcis 3 på smal skærm → tæller). Et klik løser stadig på Taktik (`fixIssue(ids,'taktik')`).
   Hjem: OGSÅ pillerne i bjælken (brugeren 3/11: "Ja, også på Hjem") – selv om listen står på siden.
3. 🔍 modstanderen: som i dag (ikke på Hjem; ellers ja). ▶ står altid yderst til højre (samme x på alle faner).
4. Under afspilning: knappen er slået fra og uden tegn (som i dag på Hjem/Taktik).
5. Kortpanelet (Trup/Taktik) står over bjælken (bruger allerede `--bar-h`); på ≤600 px dækker arket bjælken som i dag.
   `body.has-bar` (sidens bundmargen) gælder nu altid.
6. Spec §10b, NEWS, version 3.31.1.

## Tests
- e2e: på hver af de 7 faner + ⚙ ved 1366 og 390: præcis ét `#play-round` i `#playbar`, intet i topbaren; ▶'s højre kant ens på
  alle faner; tegnene i bjælken = samme som Taktiks (antal og slags) – med data (en udelukket + trætte); under afspilning slået fra.
- Tilpas de eksisterende mini-play-tjek (F1-blokken: "den lille ▶ i topbaren på Trup/…", `#mini-warn`) og panel-tjek "Trup (uden
  Spil-bjælke)".
- Mutationer: bjælken væk på én fane; piller kun på Taktik; mini-▶ tilbage.

## RETTET efter QC (opus) og Spilfører UI (afløser planen ovenfor, hvor de er uenige)
1. Hjem: pillerne også i bjælken (brugeren). Tælleren ("N ting"/smal tæller) på Hjem RULLER til `#home-todo` (i dag `showTab('hjem')`
   = intet synligt + sletter `view.notice`); fra andre faner: Hjem med listen synlig (e2e: klik fra Liga → `#home-todo` i synsfeltet).
   Vend e2e run.mjs:103 (Hjem uden piller).
2. Tælleren (>3 grupper, eller 3 på smal skærm) viser slags kompakt som den lille knap gjorde: "⛔2 🚑1 🟨1" (antal SPILLERE pr. slags,
   ISSUE_ORDER) – "N ting" står i title. Brugerens krav: "info om problemer som på den lille knap". Mål at modstanderens navn stadig
   står ved 390 (run.mjs:2864).
3. Under afspilning: knappen slået fra med "📺 Runde N spilles …" (ingen næste modstander, ingen piller) – lukker backlog l.187–188.
4. Tekster: pillens title "Stil selv om på 📋 Taktik" (ikke "her på Taktik", app.js:396); app.js:602 "▶ Spil runde nederst".
   Kommentarer (app.js:42, 283, 369, 386; index.html:13; style.css:273/288/295/350) og spec §10b (1043–1044, 1052–1058, 1084–1085, 1103).
5. `html { overflow-y: scroll }`, så bjælken (fixed, left/right 0) er lige bred på korte og lange sider (▶ hopper ellers ~15 px på
   Windows/Linux). `has-bar` sættes stadig i renderNow – fejlsiden er uden bjælke (run.mjs:293).
6. Kamp efter fløjtet: intet 🔍 i bjælken (toHomeLine har "Forbered ›") – `.no-opp` ligesom Hjem.
7. Tests: alle mini-▶-referencer (run.mjs:81, 115, 277, 1077–1081, 1753–1754, 1765–1766, 2243, 2811, 2822) skrives om mod `#playbar`
   – paritetstjekkene ERSTATTES af bjælketjek på Trup og Liga, med fixturet ⛔1 ⚠2 🟨1. run.mjs:829: arkets bund = bjælkens top
   ved 601 px, arket dækker bjælken ≤600. ▶'s højre kant ens på alle 8 faner × 1366/390 (+ Kamp efter fløjtet, Hjem).
   Mobil: sidste række i Trup kan rulles fri af bjælken (390×667). CSS fjernes: style.css:286–287, 349, 356.
8. Accepteret: scout-bjælken viser dine numre i pillerne (som på Taktik i dag); ▶ står sidst i tab-rækkefølgen.

# Del 2 af v3.31.1: dansk på spillerkortet (brugeren 3/11: "nogle gange er der sneget sig engelske betegnelser ind")
Opgørelse (Explore-agent): engelsk kun i særpræg-tabellen (generator.js:18–31), unlock-nøglerne (card.js:41) og stil-navnene (counter.js:3, 53, 57).
Brugerens valg: danske positionskoder · "gegenpres" med småt overalt · Observationer + Erfaring mod stilarter.
1. **Særpræg vises fra tabellen efter id** (`ARCHETYPES` i generator.js), ikke fra den kopi, der er gemt på spilleren (generator.js:210):
   card.js:40 og matrix.js:118 → eksisterende ligaer får de nye navne UDEN migrering (gemmeformatet uændret; fixture save-schema4 skal
   vise det nye navn). Navne: Feje-målmand, Straffedræber, Offside-mester, Regista (spilfordeler), Presmonster, VAR-linjens spøgelse,
   Target Man → "Fyrtårn" (opspilspunkt); beskrivelserne: "50 %", "højt gegenpres".
2. **Unlock-kravet** gennem `SKILL_NAME` (+ jumpingPower → "Spring"): "Låses op ved: Udholdenhed 14, Erobring 12". Alle 9 nøgler dækket.
3. **Stilnavne** (counter.js:3, 53, 57; labels.js:15; matrix.js:39, 114): "Mod gegenpres", "Mod lav blok", "Mod VAR-linje og lange bolde";
   i referatet "Gegenpres + VAR-linje". "gegenpres" (ét s, småt) OVERALT i UI (labels.js:15, app.js:135/178, tactics.js:18, match.js:198-tekster).
   Kun viste tekster – interne nøgler (fx 'GEGENPRESS') røres ikke.
4. **Positioner** (labels.js:9): "Offensiv midtbane (OM)", "Defensiv midtbane (DM)", "Central midtbane (CM)", "Kant (…)", "Angriber (ANG)",
   "Back/kantback (dybe kantpladser)" – samme korte former som `POSITION` (labels.js:8). Følger med i season-report.js:34, pitch.js:38,
   lineup-list.js:51/55, matrix.js:110 (de bruger tabellen).
5. **Overskrifter**: "🕵️ Observationer" (card.js:52, 55) og "🧠 Erfaring mod stilarter" (card.js:38, matchcenter.js:74, matrix.js:39).
6. Småt: "Friskhed 92 %" (card.js:24), "VAR-puls", "startspiller: +60 %" (card.js:118).
7. Tests: engine.test.mjs:351 (privatlivs-regex) opdateres til de nye stavemåder i SAMME ændring – ellers tjekker den intet;
   run.mjs:1171 (positionstekst), v3163-gaps.test.mjs:316 (VAR-profil). Ny test: kortet for en spiller med hvert særpræg + en fra
   save-schema4 – ingen af de gamle engelske ord står (negativ liste: Pressing Monster, Target Man, Sweeper Keeper, Penalty Killer,
   Offside Maestro, Line Ghost, Playmaker, stamina, intercepting, jumpingPower, ballControl, Gegenpress, CAM, CDM, Scouting).
   Mutation: særpræget vist fra spillerens kopi → rød på save-schema4-testen.
8. spec.md (særpræg-listen, stilnavne) ⇄ koden.

---
Tidligere planer: [tidligere-planer.md](tidligere-planer.md)
