// Ejefald (flyttet fra column.js v3.16.3 – "Roverss"/"Tacticianss" i referatet): "Aarhus'", "Kjærs".
export const gen = (n) => (/[sxz]$/i.test(n) ? `${n}'` : `${n}s`);
// Tal med ental/flertal (v3.16.7, Spilfører: "1 af 1 gange", "1 afslutninger", "1 cutbacks"): pl(1, 'gang', 'gange') → "1 gang"
export const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// Variant: hash af nøglerne + runden/minuttet – samme nøgler giver samme valg (intet rng-træk, så ingen kamp ændres),
// næste runde/minut rykker én videre, så den samme skabelon ikke kommer to gange i træk (QC N4, flyttet fra column.js).
export function pickBy(list, round, ...keys) {
  let h = 7;
  for (const k of keys) for (const ch of String(k)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return list[(h + (round | 0)) % list.length];
}

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

// Tre varianter pr. bånd (v3.16.7, Spilfører: "tårnhøj magtdemonstration" 22 og "kraftfuldt og veltimet" 18 gange på en sæson) –
// båndets betydning (scouting i ord) er den samme i alle tre; n vælges af kalderen (vary – intet rng).
export const HEADER_PROSE = Object.freeze({
  high: ['en tårnhøj magtdemonstration i luftrummet', 'et hovedstød fra en etage over alle andre', 'et nik, ingen i feltet kunne nå op til'],
  mid: ['et kraftfuldt og veltimet hovedstød', 'et solidt og velplaceret nik', 'et hårdt hovedstød med god timing'],
  low: ['et kluntet, men effektivt nik', 'et halvklodset nik, der alligevel gik ind', 'et skævt hovedstød, der fandt vej'],
});
export const headerBand = (aerialPower) => (aerialPower >= 15 ? HEADER_PROSE.high : aerialPower >= 11 ? HEADER_PROSE.mid : HEADER_PROSE.low);
export const describeHeader = (aerialPower) => headerBand(aerialPower)[0];   // båndets første variant (scouting-ordet; referatet bruger vary)

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
    (s, a) => `Et brag af et langskud: ${s} fik bolden et godt stykke uden for feltet og hamrede den op i det lange hjørne.`,
    (s, a) => `${s} prøvede lykken fra distancen – og bolden dalede ind under overliggeren.`,
    (s, a) => `Ingen så det komme: ${s} tog et træk og sendte et missil afsted fra langt ude.`,
  ],
  SCRAMBLE: [   // v3.17.0: halvchancen i feltet – en løs bold, intet oplæg
    (s, a) => `Bolden faldt løs i feltet, og ${s} var hurtigst og prikkede den ind.`,
    (s, a) => `Et virvar foran mål – ${s} fik foden til bolden, og den sneg sig ind.`,
    (s, a) => `${s} snappede en returbold i feltet og bragte den over stregen.`,
  ],
  DRIBBLE: [
    (s, a) => `En dribletur for historiebøgerne: ${s} snoede sig forbi tre mand og satte bolden roligt ind.`,
    (s, a) => `${s} tog sagen i egen hånd, driblede sig forbi sin mand og afsluttede selv.`,
    (s, a) => `Ren individuel klasse: ${s} vendte forsvareren rundt på en tallerken og scorede.`,
  ],
  COUNTER: [
    (s, a) => `Kontra: bolden blev erobret, ${a} sendte den i dybden, og ${s} løb fra alle og scorede.`,
    (s, a) => `Fra eget felt til mål på ti sekunder – ${a} satte ${s} i gang, og han sluttede kontraen af.`,
    (s, a) => `Omstilling i topklasse: ${a} fandt ${s}, der kom løbende og trillede den ind.`,
  ],
  CUTBACK: [
    (s, a) => `Lavt cutback: ${a} nåede baglinjen og lagde den tilbage til ${s}, der sparkede den ind.`,
    (s, a) => `${a} trak bolden tilbage fra baglinjen, og ${s} var på pletten.`,
    (s, a) => `Indøvet variant: cutback fra ${a}, førstegangsafslutning fra ${s}.`,
  ],
  COMBINATION: [
    (s, a) => `Kombinationsfodbold: ${a} spillede ${s} fri, og han sluttede sikkert af.`,
    (s, a) => `Tre hurtige afleveringer, og ${s} kunne score efter oplæg fra ${a}.`,
    (s, a) => `${a} og ${s} spillede 1-2, og ${s} gjorde det færdigt.`,
  ],
  PENALTY: [
    (s, a) => `Straffespark: ${a} blev fældet i feltet, og ${s} sendte målmanden den forkerte vej.`,
    (s, a) => `${s} var iskold fra pletten, efter at ${a} var blevet lagt ned i feltet.`,
    (s, a) => `Kold, rolig, mål: ${s} scorede på straffespark.`,
  ],
  FREEKICK: [
    (s, a) => `Et frispark for vitrineskabet: ${s} krøllede bolden over muren og op i hjørnet.`,
    (s, a) => `${s} sendte et frispark ind under overliggeren – målmanden nåede kun at se efter den.`,
    (s, a) => `Direkte frispark: ${s} fandt det lange hjørne fra 22 meter.`,
  ],
  CORNER: [
    (s, a) => `Hjørnespark: ${a} slog bolden ind, og ${s} stangede den i mål.`,
    (s, a) => `${s} vandt luftduellen på ${gen(a)} hjørnespark og headede ind.`,
    (s, a) => `Dødboldsstyrke: hjørnespark fra ${a}, hovedstød fra ${s}.`,
  ],
  SETPIECE: [
    (s, a) => `Frisparksindlæg: ${a} lagde bolden ind, og ${s} headede den i mål.`,
    (s, a) => `${s} kom først på ${gen(a)} frispark og nikkede ind.`,
    (s, a) => `Indøvet dødbold: frispark fra ${a}, hovedstød fra ${s}.`,
  ],
  HEADER: [
    (s, a) => `Et hovedstødsmål: efter et indlæg fra ${a} rejste ${s} sig over alle.`,
    (s, a) => `${s} stangede ${gen(a)} indlæg ind.`,
    (s, a) => `Luftherredømme: ${s} vandt duellen og headede ind.`,
  ],
  VAR: [
    // Skytten er ikke nødvendigvis den, VAR tjekkede for offside (v3.14.1) – teksten påstår intet om hans placering.
    (s, a) => `Ren VAR-dramatik: linjen holdt, og ${gen(s)} mål stod ved magt.`,
    (s, a) => `Nervepirrende minutter, før VAR godkendte ${gen(s)} scoring.`,
    (s, a) => `Centimeterafgørelse: VAR-linjen holdt, og ${gen(s)} mål tæller.`,
  ],
};
export const GOAL_KINDS = Object.keys(GOAL_TEXTS);
// used (v3.16.3, Spilfører: "missil fra langt ude" i 8 af 13 langskudsmål): en kamps brugte tekster – samme rng-træk som
// før (ingen kamp ændres), men er teksten brugt i kampen, tages den næste ubrugte. Minuttet står ikke i teksten (det står
// ved linjen – QC v3.16.3: en indlejret minut-angivelse modsiger urets minut).
export function describeGoal(kind, scorer, assister, min, rng, used = null) {
  const list = GOAL_TEXTS[kind] || GOAL_TEXTS.COMBINATION;
  let i = Math.min(list.length - 1, Math.floor(rng.next() * list.length));
  const key = (j) => `${kind}:${j}`;
  if (used) { for (let k = 0; k < list.length && used.has(key(i)); k++) i = (i + 1) % list.length; used.add(key(i)); }
  return list[i](scorer, assister);
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
    SCRAMBLE: 3 + finishing * 0.15 + r * 3,   // v3.17.0: et rodet mål er sjældent rundens flotteste
    HEADER: 5 + aerialPower * 0.4 + r * 4,
    PENALTY: 3 + r * 3,                        // v3.10: et straffespark er sjældent rundens flotteste
    FREEKICK: 11 + finishing * 0.3 + r * 4,
    CORNER: 4 + aerialPower * 0.35 + r * 4,
    SETPIECE: 4 + aerialPower * 0.35 + r * 4,
    VAR: 5.5 + r * 5,   // v3.9 (før 7 + …): færre langskud efter målmandsfordelen – VAR må ikke tage over igen
  }[kind] ?? 5;
  return Math.min(20, Math.round((base + late) * 10) / 10);
}
