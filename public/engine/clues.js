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
