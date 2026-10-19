// Danske visningsnavne for motorens værdier.
export const LINE = { GK: 'MÅL', DEF: 'FOR', MID: 'MID', ATT: 'ANG' };
export const PHASE_OPTIONS = {
  passingStyle: [['SHORT', 'Korte pasninger'], ['BALANCED', 'Balanceret'], ['DIRECT_LONG', 'Direkte lange bolde']],
  attackFocus: [['CENTRAL', 'Centralt'], ['HIGH_CROSSES', 'Høje indlæg'], ['LOW_CUTBACKS', 'Lave cutbacks']],
  pressingHeight: [['LOW_BLOCK', 'Lav blok'], ['MID_BLOCK', 'Mellemblok'], ['HIGH_GEGENPRESS', 'Højt gegenpress']],
  offsideTrap: [['OFF', 'Ingen offside-fælde'], ['NORMAL', 'Normal linje'], ['EXTREME_VAR_LINE', 'Ekstrem VAR-linje']],
  tacklingIntensity: [['CAUTIOUS', 'Forsigtig'], ['NORMAL', 'Normal'], ['AGGRESSIVE', 'Aggressiv']],
  onBallWon: [['FAST_COUNTER', 'Lynkontra'], ['KEEP_POSSESSION', 'Hold på bolden']],
  onBallLost: [['COUNTER_PRESS_5S', 'Genpres i 5 sek.'], ['DROP_BACK', 'Fald tilbage']],
};
export const CONDITIONS = [['TRAILING', 'Bagud'], ['LEADING_BY_1', 'Foran med 1'], ['DRAW', 'Uafgjort']];
export const SKILL_LABELS = [
  ['Fysik & luft', [['pace', 'Fart'], ['stamina', 'Udholdenhed'], ['strength', 'Styrke']]],
  ['Teknik', [['ballControl', 'Boldkontrol'], ['passing', 'Pasning'], ['finishing', 'Afslutning']]],
  ['Taktik & defensiv', [['positioning', 'Positionering'], ['intercepting', 'Erobring'], ['goalkeeping', 'Målmandsspil']]],
];
export const stars = (n) => (n > 0 ? '★'.repeat(n) + '☆'.repeat(5 - n) : '–');
export const kr = (n) => n.toLocaleString('da-DK') + ' kr.';
