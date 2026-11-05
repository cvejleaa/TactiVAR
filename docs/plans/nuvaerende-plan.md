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

## RETTET efter Arkitekt, Spilfører klub og QC (opus) – afløser planen ovenfor, hvor de er uenige
**Rate:** Fysik beholder **0,07**. Raten gælder PR. EVNE (season.js:117), så Fart og Styrke går præcis som i dag, og Fysik giver
nu tre evner (samlet 0,21 – det største fokus, betalt med friskhed −4 og skaderisiko 0,007). Det skrives i spec §5.
Målt (klub): 17–23-årige går fra Spring 13 til 14 på median 18 runder, 92 % inden for to sæsoner (0,0467 ville give 54 %).

**Hvad der IKKE bygges:**
- Spring kommer IKKE i `p.skills`, `KEY_SKILLS`, potentiale/loft (roomOf/keyAvg) eller `seasonGrowth`.
- Ingen bot-træning af Spring.
- Ingen sanitize- eller migreringskode. `dev` har ingen whitelist (sanitize.js:103); det tjekkes med et fixture fra v3.31.2.
- Ingen ny aerialPower-genberegning. `afterSkillChange` (season.js:95) kaldes allerede via `onSkill`.

**Delopgaver (Arkitekten):**
- **D1 Motor:**
  - `skillOf(p, k)` og `setSkill(p, k, v)` i career.js, brugt i `addXp`, `trainingEstimate` og generator.js:160.
  - `FOCUS.PHYSICAL.skills = ['pace', 'strength', 'jumpingPower']` med rate 0,07.
  - `focusOfSkill(k)`: første fokus, der ikke er Alsidig og har evnen.
- **D2 Måling:** `tools/measure-jump.mjs` bygget på measure-lifecycle's løkke.
  - Mål før og efter med en profil, hvor alle på dit hold til og med 25 år træner Fysik.
  - Tal: Spring-fordeling, aerialPower mig mod botter, hovedstødsmål pr. kamp og antal oplåste Luftens Konge/Fyrtårn efter 0, 1, 3 og 5 sæsoner.
  - Båndet skrives med begge tal, så den gamle værdi giver rødt. Klub målte 1,033 → 1,064.
  - myVsBots kan ikke se Spring og bruges IKKE som mål.
- **D3 UI:**
  - `['jumpingPower', 'Spring']` i `SKILL_LABELS` "Fysik & luft" (labels.js:38). Så kommer `SKILL_NAME` med automatisk: rapport, gainWords, "nærmest et +1" og Trup-mærket. Særtilfældet i labels.js:23 fjernes.
  - Kortets bjælke: `bar(l, skillOf(p, k))` (card.js:36).
  - Træning:
    - `SHORT.jumpingPower = 'SPR'`.
    - Hvert fokusvalg viser sine evner fra `FOCUS[k].skills`, fx "Fysik – Fart, Styrke, Spring" (training.js:60/68).
  - Trup:
    - Spring-kolonnen (key 'jump' beholdes) får "+N"-mærket for 'jumpingPower'. matrix-gain-v3300.test.mjs:61–63 vendes.
    - Arketypecellen (matrix.js:118) får title med kravteksten.
  - Gns-kolonnens title: "Spring tæller ikke med".
- **D3 Kravteksten** `archReqText(a, p)` (labels.js). Kun ejerens spiller (vagterne card.js:32, lineup-list.js:49 og matrix):
  - Format: "Låses op ved: Styrke 13/13 ✓ · Spring 13/14 – trænes med Fysik".
  - Opfyldt krav: "Navn nu/krav ✓", uden fokus.
  - Træner han fokusset i forvejen: "– trænes med Fysik (det gør han nu)".
  - To mangler med samme fokus: "Styrke 12/13 · Spring 13/14 – begge trænes med Fysik".
  - Paritetstest: hver `unlockReq`-nøgle i alle ARCHETYPES har et fokus.
- **D4:**
  - Fixture `tests/fixtures/save-v3.31.2.json` (lavet med 3ad5949) og en indlæsningstest med `dev.jumpingPower`.
  - Spec §2, §5 og §13 (Spring trænes med Fysik og indgår ikke i nøglesnit eller Gns), NEWS, version 3.32.0 og backlog 0c → Lavet.
  - Ret de forventede tekster i e2e run.mjs:1182 (9 → 10 bjælker) og dansk-kort-v3311.test.mjs:41/45.
- **D5 Aldersfald, egen commit i samme PR:**
  - 'jumpingPower' i tier 2 sammen med 'strength' (career.js:221). `declineSkills` og `trainedSkills` læser via skillOf/setSkill. Faldet halveres for den, der træner Fysik.
  - Det er den ENESTE del, der må flytte golden-hashes over sæsoner. Ændringen forklares i testen.
  - Kør D2 og lifecycle-båndene igen.

**Golden:** D1–D4 må IKKE flytte nogen hash, fordi en frisk liga kun bruger Alsidig. Flytter en sig, er det en fejl.

**Efterprøv på Tobias' profil, ikke snittet:**
- `roomOf` klemmes til mindst 0,1, så en spiller tæt på sit loft får ca. 0,007/runde, altså over 100 runder.
- Kravteksten bruger `nextText`, når han træner fokusset: "(går langsomt: tæt på sit loft)".
- D2 måler også en 24–27-årig tæt på loftet.

---
Tidligere planer: [tidligere-planer.md](tidligere-planer.md)
