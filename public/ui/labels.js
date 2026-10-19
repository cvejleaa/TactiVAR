// Danske visningsnavne for motorens værdier.
export const LINE = { GK: 'MÅL', DEF: 'FOR', MID: 'MID', ATT: 'ANG' };
// Naturlig position (v3.8) med tavlens ord; den fulde betegnelse står i title.
export const POSITION = { GK: 'MV', CB: 'CB', FB: 'Back', CM: 'CM', WM: 'Kant', AM: 'OM', ST: 'ANG' };
export const POSITION_FULL = { GK: 'Målmand', CB: 'Midtstopper', FB: 'Back/wingback (LB/RB/LWB/RWB)', CM: 'Central/defensiv midtbane (CM/CDM)', WM: 'Kant (LM/RM/LW/RW)', AM: 'Offensiv midtbane (CAM/CF)', ST: 'Angriber (ST)' };
export const PHASE_OPTIONS = {
  passingStyle: [['SHORT', 'Korte pasninger'], ['BALANCED', 'Balanceret'], ['DIRECT_LONG', 'Direkte lange bolde']],
  attackFocus: [['CENTRAL', 'Centralt'], ['HIGH_CROSSES', 'Høje indlæg'], ['LOW_CUTBACKS', 'Lave cutbacks']],
  pressingHeight: [['LOW_BLOCK', 'Lav blok'], ['MID_BLOCK', 'Mellemblok'], ['HIGH_GEGENPRESS', 'Højt gegenpress']],
  offsideTrap: [['OFF', 'Ingen offside-fælde'], ['NORMAL', 'Normal linje'], ['EXTREME_VAR_LINE', 'Ekstrem VAR-linje']],
  tacklingIntensity: [['CAUTIOUS', 'Forsigtig'], ['NORMAL', 'Normal'], ['AGGRESSIVE', 'Aggressiv']],
  onBallWon: [['FAST_COUNTER', 'Lynkontra'], ['KEEP_POSSESSION', 'Hold på bolden']],
  onBallLost: [['COUNTER_PRESS_5S', 'Genpres i 5 sek.'], ['DROP_BACK', 'Fald tilbage']],
};
export const CONDITIONS = [['TRAILING', 'Bagud med mindst'], ['LEADING', 'Foran med mindst'], ['DRAW', 'Uafgjort']];
export const MARGINS = [1, 2, 3, 4, 5].map((n) => [String(n), `${n} mål`]);
export const SKILL_LABELS = [
  ['Fysik & luft', [['pace', 'Fart'], ['stamina', 'Udholdenhed'], ['strength', 'Styrke']]],
  ['Teknik', [['ballControl', 'Boldkontrol'], ['passing', 'Pasning'], ['finishing', 'Afslutning']]],
  ['Taktik & defensiv', [['positioning', 'Positionering'], ['intercepting', 'Erobring'], ['goalkeeping', 'Målmandsspil']]],
];
export const stars = (n) => (n > 0 ? '★'.repeat(n) + '☆'.repeat(5 - n) : '–');
// Samme tekst som stars(), men udfyldte stjerner i guld og tomme dæmpet, så de kan læses.
export function starsEl(n) {
  const el = document.createElement('span');
  el.className = 'stars';
  el.title = n > 0 ? `${n} af 5 stjerner` : 'Ingen kampe endnu';
  if (!(n > 0)) { el.textContent = '–'; return el; }
  const on = document.createElement('span'); on.className = 'star-on'; on.textContent = '★'.repeat(n);
  const off = document.createElement('span'); off.className = 'star-off'; off.textContent = '☆'.repeat(5 - n);
  el.append(on, off);
  return el;
}
export const kr = (n) => n.toLocaleString('da-DK') + ' kr.';
