// Scouting-clues og beskrivende prosa. Reglen er absolut: skjulte og private evner beskrives
// med ORD, aldrig tal (v1.6-fejlen "FIN: 7" – docs/spec.md §2–3). Offentlige data (højde,
// rygnummer, minut) må gerne stå.

export function generateScoutingClues(shortName, varProfile, heightCm, jumpingPower) {
  const clues = [];
  if (heightCm >= 190 && jumpingPower >= 13) clues.push(`I træningskampen steg ${shortName} (${heightCm} cm) en hel etage over alle andre ved hjørnesparkene.`);
  if (varProfile.theatre >= 14) clues.push(`Dommeren måtte advare ${shortName} efter et teatralsk fald i feltet – VAR så ikke på det.`);
  else if (varProfile.theatre <= 6) clues.push(`${shortName} nægtede at smide sig i feltet trods et tydeligt hiv i trøjen – utroligt ærlig.`);
  if (varProfile.cynicism >= 14) clues.push(`Hård tackling med knopperne forrest fra ${shortName}! Kun en snæver VAR-vurdering holdt det på gult.`);
  if (varProfile.varPulse >= 14) clues.push(`${shortName} timede sit dybdeløb perfekt – 2 cm på den rigtige side af VAR-linjen.`);
  else if (varProfile.varPulse <= 8) clues.push(`${shortName} gik i panik ved offside-linjen og blev fanget en hel meter offside.`);
  if (clues.length === 0) clues.push(`${shortName} spillede en disciplineret kamp uden at tiltrække sig opmærksomhed fra VAR.`);
  return clues;
}

export function describeFinish(finishing) {
  if (finishing >= 15) return 'et sylskarpt hug helt oppe i trekanten – klinisk afslutning';
  if (finishing >= 11) return 'en kølig og velplaceret afslutning langs jorden';
  if (finishing >= 7) return 'et lidt heldigt og skævt træf, der alligevel fandt vej';
  return 'et klodset forsøg, der på mirakuløs vis gled ind';
}

export function describeHeader(aerialPower) {
  if (aerialPower >= 15) return 'en tårnhøj magtdemonstration i luftrummet';
  if (aerialPower >= 11) return 'et kraftfuldt og veltimet hovedstød';
  return 'et kluntet, men effektivt nik';
}

export function describeVarTiming(varPulse) {
  if (varPulse >= 14) return 'timede sit løb med iskold præcision';
  if (varPulse >= 9) return 'var lige akkurat på den rigtige side';
  return 'slap heldigt igennem på en millimeterafgørelse';
}

// ---------- Måltyper (v3.7, brugeren: "rundens mål er altid VAR-dramatik, det har endnu ikke
// været et flot langskud eller en god dribletur") ----------
// Hver type har mindst tre tekster, så avisen ikke gentager sig efter to runder.
const GOAL_TEXTS = {
  LONGSHOT: [
    (s, a, m) => `Et brag af et langskud i ${m}. minut: ${s} fik bolden 25 meter fra mål og hamrede den op i det lange hjørne.`,
    (s, a, m) => `${s} prøvede lykken fra distancen i ${m}. minut – og bolden dalede ind under overliggeren.`,
    (s, a, m) => `Ingen så det komme: ${s} tog et træk og sendte et missil afsted fra langt ude i ${m}. minut.`,
  ],
  DRIBBLE: [
    (s, a, m) => `En dribletur for historiebøgerne i ${m}. minut: ${s} snoede sig forbi tre mand og satte bolden roligt ind.`,
    (s, a, m) => `${s} tog sagen i egen hånd i ${m}. minut, driblede ind fra kanten og afsluttede selv.`,
    (s, a, m) => `Ren individuel klasse i ${m}. minut: ${s} vendte forsvareren rundt på en tallerken og scorede.`,
  ],
  COUNTER: [
    (s, a, m) => `Kontra i ${m}. minut: bolden blev erobret, ${a} sendte den i dybden, og ${s} løb fra alle og scorede.`,
    (s, a, m) => `Fra eget felt til mål på ti sekunder i ${m}. minut – ${s} sluttede kontraen af.`,
    (s, a, m) => `Omstilling i topklasse i ${m}. minut: ${a} fandt ${s}, der kom løbende og trillede den ind.`,
  ],
  CUTBACK: [
    (s, a, m) => `Lavt cutback i ${m}. minut: ${a} nåede baglinjen og lagde den tilbage til ${s}, der sparkede den ind.`,
    (s, a, m) => `${a} trak bolden tilbage fra baglinjen i ${m}. minut, og ${s} var på pletten.`,
    (s, a, m) => `Indøvet variant i ${m}. minut: cutback fra ${a}, førstegangsafslutning fra ${s}.`,
  ],
  COMBINATION: [
    (s, a, m) => `Kombinationsfodbold i ${m}. minut: ${a} spillede ${s} fri, og han sluttede sikkert af.`,
    (s, a, m) => `Tre hurtige afleveringer i ${m}. minut, og ${s} kunne score efter oplæg fra ${a}.`,
    (s, a, m) => `${a} og ${s} spillede væggen i ${m}. minut, og ${s} gjorde det færdigt.`,
  ],
  HEADER: [
    (s, a, m) => `Et hovedstødsmål i ${m}. minut: efter et indlæg fra ${a} rejste ${s} sig over alle.`,
    (s, a, m) => `${s} stangede ${a}s indlæg ind i ${m}. minut.`,
    (s, a, m) => `Luftherredømme i ${m}. minut: ${s} vandt duellen og headede ind.`,
  ],
  VAR: [
    (s, a, m) => `Ren VAR-dramatik i ${m}. minut: ${s} var lige akkurat på den rigtige side, og målet stod ved magt.`,
    (s, a, m) => `Nervepirrende minutter i ${m}. minut, før VAR godkendte ${s}s scoring.`,
    (s, a, m) => `Centimeterafgørelse i ${m}. minut: VAR-linjen frikendte ${s}, og målet tæller.`,
  ],
};
export const GOAL_KINDS = Object.keys(GOAL_TEXTS);
export function describeGoal(kind, scorer, assister, min, rng) {
  const list = GOAL_TEXTS[kind] || GOAL_TEXTS.COMBINATION;
  return list[Math.min(list.length - 1, Math.floor(rng.next() * list.length))](scorer, assister, min);
}

// Én fælles skala 0–20 for "Rundens mål": typen giver grundværdien, spilleren og minuttet
// resten. Et VAR-mål kan stadig vinde, men ikke altid (før 17–25 mod ≈12–20).
export function goalSpectacle(kind, { finishing = 10, pace = 10, ballControl = 10, aerialPower = 10, passing = 10 } = {}, min, rng) {
  const late = min >= 80 ? 3 : 0, r = rng.next();
  const base = {
    LONGSHOT: 10 + finishing * 0.25 + r * 4,
    DRIBBLE: 9 + (pace + ballControl) * 0.17 + r * 4,   // v3.9 (før 8 + ·0,15)
    COUNTER: 5.5 + pace * 0.2 + r * 4,   // v3.9: rigtige kontraer er hyppigere (før 7 + …)
    CUTBACK: 8 + passing * 0.3 + r * 4,   // v3.9: en flot tværaflevering kan nå avisen (før 6 + PAS·0,15)
    COMBINATION: 5 + passing * 0.2 + r * 4,
    HEADER: 5 + aerialPower * 0.4 + r * 4,
    VAR: 5.5 + r * 5,   // v3.9 (før 7 + …): færre langskud efter målmandsfordelen – VAR må ikke tage over igen
  }[kind] ?? 5;
  return Math.min(20, Math.round((base + late) * 10) / 10);
}
