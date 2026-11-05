# NU (5/11): v3.32.0 – Spring kan trænes (backlog 0c), derefter 📖 spilguide (0d)

## Context
- v3.31.2 er live (e2e mod live 677/677). Brugeren 5/11: "Lad os fortsætte nu"; valgte "Spring, then the guide".
- **0c, brugeren 3/11:** "Tobias kan blive luftens konge, men det kræver jumpingpower på 14, men jeg kan ikke se hans jumpingpower i sidebjælken. Og jeg kan ikke se hvordan jeg kan træne ham i det."
- I dag sættes `p.jumpingPower` i generatoren (generator.js:182) og ændres ALDRIG. Den er ikke i `p.skills`, så den udvikles hverken gennem `addXp` (career.js:171), sæsonvækst (career.js:234) eller aldersfald (career.js:228). Kortet viser den kun inde i luftduel-linjen (card.js:39). Trup har kolonnen "Spring" (matrix.js:33).
- **Brugerens valg:** Fysik træner Fart, Styrke OG Spring (som Teknik med to evner). Spring får en bjælke under "Fysik & luft". Kravet viser "Spring 13/14 – trænes med Fysik".

## Ændringen (v3.32.0)
1. **Motor (career.js):**
   - `FOCUS.PHYSICAL.skills = ['pace', 'strength', 'jumpingPower']`.
   - `addXp`, `trainingEstimate` og `focusSkills` håndterer `jumpingPower` ved at læse og skrive `p.jumpingPower` gennem én lille accessor (`skillVal`/`setSkill`), så der ikke spredes særtilfælde.
   - `rate` for Fysik afstemmes, så den samlede Fysik-fremgang pr. evne ikke bliver hurtigere end i dag. Det måles med `tools/measure-lifecycle.mjs` før og efter, plus en ny `tools/measure-jump.mjs`: Spring-fordelingen og luftduel-styrken (aerialPower) efter 0, 1, 3 og 5 sæsoner, passiv og aktiv profil, samt hvor mange der låser Luftens Konge og Fyrtårn op.
   - `aerialPower` regnes om efter træning. Det sker allerede i season.js:96 – efterprøv, at det sker efter træningen.
   - Aldersfaldet (career.js:228) tager Spring med som de øvrige fysiske evner, hvis de falder med alderen. Ellers ikke. Arkitekten afgør det ud fra koden.
2. **Kortet (card.js):** "Spring" som bjælke i "Fysik & luft" (samme bjælke og samme værdi som de andre).
   - Arketypens krav viser "Spring 13/14 – trænes med Fysik", altså nuværende/krav plus fokus for hver evne i kravet. Det gælder alle evner, ikke kun Spring, via én hjælper i labels.js `archReqText`.
   - Gælder samme sted på Trup og Taktik (title).
3. **Træning (training.js):** Fysik-rækkens fremdrift viser "Spring" sammen med Fart og Styrke, og skønnet for næste +1 tager Spring med.
4. **Gemmeformatet ændres IKKE**: `jumpingPower` findes allerede, og `dev.jumpingPower` er bare en ny nøgle i `dev`. Sanitize skal tillade nøglen, så efterprøv `PLAYER_DEFAULTS` og dev-rensningen. Et fixture fra v3.31.2 skal indlæses.
5. Golden/fingeraftryk: friske ligaer ændrer ikke kampe. Træning flytter først noget efter runder, så golden-hashes over sæsoner kan skifte, og ændringen forklares i testen.
6. Spec §5 (træning), §2 (arketyper), NEWS, version 3.32.0 og backlog (0c → Lavet).

## Arbejdsgang
1. **Plan-gennemgang** (parallelt): Arkitekt (genbrug, rækkefølge, aldersfald), Spilfører klub (rate og balance, mål før og efter) og QC (opus) på planen. Ret planen efter dem.
2. Byggeagent: kode, målinger, unit og e2e, commit.
3. TM og QC parallelt, derefter RM.
4. Draft-PR, grøn CI, rapport til brugeren, merge.
5. Live og e2e mod live.
6. **Derefter 0d** (spilguide: "📖 Sådan virker spillet" i ⚙ + "?" pr. fane) med egen plan, gennemgået af QC og Spilfører UI.

## Verifikation
- check, unit og e2e grønne lokalt og i CI.
- Mutationer, der skal give rødt:
  - Spring ude af `FOCUS.PHYSICAL`;
  - `addXp` skriver i `p.skills.jumpingPower` i stedet for `p.jumpingPower`;
  - kortet uden Spring-bjælke;
  - kravteksten uden nuværende værdi;
  - `aerialPower` ikke regnet om.
- Målingen viser, at en ung spiller på Fysik kan gå fra 13 til 14 i Spring inden for en sæson eller to, og at luftduel-balancen mellem holdene (myVsBots) ligger inden for ±0,05.
- Live: Tobias' kort viser Spring-bjælken og "Spring 13/14 – trænes med Fysik".

---
Tidligere planer: [tidligere-planer.md](tidligere-planer.md)
