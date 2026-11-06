# NU (6/11): v3.33.0 – Træk bestemmer pladsen også på midten (brugerens ønske 6/11, backlog 000.2)

Brugeren 6/11: "hvis jeg trak en spiller ud af en standardopstilling, så det f.eks. gik fra at være en cm til en dm, så skulle spillet
finde ud af det, og ikke give en straf til en dm spiller på den plads." Valgt: straf OG rolle følger. Ønsket var gået tabt – kun
kantreglen (v3.24.6) blev lavet.

## Plan-gennemgangen (Arkitekt, Spilfører motor, Spilfører klub, QC opus – 6/11), indarbejdet
### D0 Planfilerne
- v3.32.3 flyttet øverst i `tidligere-planer.md` ("live 6/11"); denne plan her.

### D1 Pladsen følger dybden (`engine/formations.js` – ét sted; alle kaldere får det gratis)
- Kun de centrale MIDTBANE-roller CDM, CM, CAM følger dybden (y = den tegnede plads). Zoner: y ≥ 54 DM; 51–53 mellemzone DM/CM (begge
  fulde); 41–50 CM; 38–40 mellemzone CM/OM; y ≤ 37 OM (skæringerne ligger på halve tal: 53,5 / 50,5 / 40,5 / 37,5). INTET anker skifter
  klasse (CDM 54–58, CM 44–50, CAM 34–36) – invarianttest over alle formationer.
- ÉN tabel `BOTH = { WIDE: [WM, FB], 'DM-CM': [DM, CM], 'CM-AM': [CM, AM] }`, som `fitOf`, `slotKindText` og `generator.js` slår op i.
- `slotKindText`: "DM-plads"/"CM-plads"/"OM-plads"/"DM-/CM-plads"/"CM-/OM-plads" – men null, når zonen er rollens egen position.
- `slotRoleOf(tactics, slot)` / `slotRoleAt(role, y)`: den effektive rolle (CDM/CM/CAM efter dybde; mellemzone = rollens eget navn, hvis
  hans position er en af de to, ellers CM; alle andre roller uændret).

### D2 Kampens rolle følger den tegnede plads (CDM/CM/CAM)
- `slotRoleOf` i: løbsgruppen (`RUN_GROUP`, match.js), bevægelsen (`positions.js` ADVANCE/RUNS_PUSH/DRIFT_AXES/driftAt), km og karakter-
  arkets rolle (`register`), "for langt fra sin X-zone"-teksten. `rolesOf`/midtbane-kæden uændret.
- Ærligt i spec og NEWS: DM og CM har samme opgaver i motoren i dag – CM→DM ændrer straf og bevægelse; CM→OM ændrer også løbsprofil.
- D2b: Hvis-Så plan-skift: `refit` med planens tegnede dybder (ys), før `customCoords` sættes. Et formationsskift nulstiller de tegnede
  positioner (står i spec).

### D3 UI og udgivelse
- Plads-cellen (`ui/lineup-list.js`), brikkens title og flag (`ui/pitch.js`) og karakterarket (`ui/lineup.js`, via den gemte rolle) viser
  den EFFEKTIVE plads ("CM→DM"). Under træk vises pladstypen live ("→ DM-plads") ud fra den trukne dybde.
- `FIT_HELP` og spec §5 skrevet om. NEWS '3.33.0' ("Pladsen følger dybden – spilleren gør ikke"; en CM, der allerede er trukket dybt,
  kan nu få ⚠ – brug "⇄ Stil op efter position"). `version.js` 3.33.0. Backlog: 000.2 → Lavet; nyt punkt "egentlig DM-opgave".

### D4 Måling (`tools/measure-central.mjs`)
- Dit hold mod 7 botter, begge baner, ≥ 150 seeds, mod forrige version (worktree af 4c149d9) og den nye. Scenarier: a) 4-2-3-1 med en CM
  på en CDM-plads (ankeret og trukket til y 48); b) 4-3-3 med DM'en på en CM-plads trukket til y 56; c) 4-2-3-1's OM trukket til y 46.
- Accept: netto pr. rettet spiller +0,02…+0,06 (0 på den gamle); ingen trukket opstilling slår den bedste utrukne med > +0,10 netto.
- Fingeraftrykkene (GOLDEN, GOLDEN_RESULTS_400, NOPROSE_400, GOLDEN_TRACES_20) uændrede byte for byte – ingen formation har en tegnet
  plads som standard, og ingen anker skifter klasse.

## Bevidst udeladt (med begrundelse)
- ST/CF/ANG følger ikke dybden: en falsk 9'er (ST trukket ned) skal forblive lovlig (`tools/measure-duels.mjs`).
- CB ⇄ DM følger ikke dybden: en stopper trukket frem er stadig en stopper i kæden og i dueller; DM'ens egentlige opgave findes ikke endnu.
- Kanterne i `slotRoleOf`: v3.24.6 holdt kampens rolle på rollenavnet bevidst (0,17 mål) – kun pris og kæde følger dybden dér.
- Kæden: CDM/CM/CAM er alle MID – `midCount`/`MID_EXTRA`/`possMids`, samspilsnaboerne (`chemistry.js`) og besiddelsen bliver på ankrene.
- En egentlig DM-opgave (bryder opbygningen) er ny mekanik → nyt backlog-punkt.

## Tests og mutationer
- Unit `tests/unit/central-slots-v3330.test.mjs`: bogstavelige tal ±0,5 ved 37/38/40/41/50/51/53/54, invarianten, `moveSlot` CM→56,
  `slotRoleOf`, BOTH i generator, Hvis-Så refit med ys, løbsgruppe og bevægelse.
- e2e "v3.33.0": træk en CM til ca. y 56 → brikkens flag/title og Plads-cellen siger DM-plads, en DM dér har ingen straf, tilbage igen →
  væk; live-etiket under træk; hvad der ikke må stå.

## Resultat (6/11)
- Målt (`node tools/measure-central.mjs sammenlign <rod for 4c149d9> N`, netto før → efter): a) +0,035 pr. rettet spiller (42 000 kampe);
  b) +0,009 (42 000 kampe – under båndet alene; samlet a+b +0,022); c) −0,004. Ankrene ens. Største gevinst over bedste utrukne: +0,024.
  Gemte spil: 3 trukne pladser i 18 fixtures, 0 skifter.
- Fingeraftrykkene uændrede. Mutationer: 26 af 27 røde; "generator: BOTH → WIDE" er en ækvivalent mutant (intet anker ligger i en
  central mellemzone – invarianten), "glid i dybden" var grøn og blev rettet ved at samle rollen ét sted (`driftOf`).
- Karakterarket: startens rolle gemmes som den tegnede plads ("CM→DM"); en indskifters tegnede dybde gemmes ikke (bevidst udeladt).
