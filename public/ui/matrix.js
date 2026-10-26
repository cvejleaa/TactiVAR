// Regneark/scouting-matrix (docs/spec.md §8). Modstanderes skjulte kolonner vises som
// "🔒 ??" og kan ikke sorteres (synlighed afgøres i engine/visibility.js).
import { h, dec, LOCK, select } from './dom.js';
import { LINE, POSITION, POSITION_FULL, starsEl } from './labels.js';
import { canSeeField } from '../engine/visibility.js';
import { FORMATIONS } from '../engine/formations.js';
import { COUNTER_KEYS } from '../engine/counter.js';
import { matchBenchOf, FOCUS } from '../engine/career.js';

// Mod-kunnen vises som spillerens tre egne værdier – ikke som én % mod en bestemt
// modstander, for den kunne bruges til at regne modstanderens stil ud (brugerens valg).
// Sorteres på den bedste af de tre: med puljen (v3.6) har alle fuldt erfarne samme sum.
const modBest = (p) => Math.max(...COUNTER_KEYS.map((k) => p.counterTactics[k]));

const avgSkill = (p) => Object.values(p.skills).reduce((a, b) => a + b, 0) / 9;
const avgRating = (p) => (p.ratingGames ? p.ratingSum / p.ratingGames : 0);

// field = det felt synligheden afgøres på; num = tal-kolonne (starter faldende ved sortering).
export const COLUMNS = [
  { key: 'pos', label: 'Pos/#', title: 'Plads i opstillingen / rygnummer', field: 'shirtNumber', value: (p, c) => { const s = c.slotOf(p); return s >= 0 ? s : 100 + p.shirtNumber; } },
  { key: 'name', label: 'Spiller', field: 'shortName', value: (p) => p.shortName, text: true },
  { key: 'line', label: 'Kæde', field: 'line', value: (p) => ['GK', 'DEF', 'MID', 'ATT'].indexOf(p.line) },
  { key: 'natpos', label: 'Natur', title: 'Naturlig position (offentlig) – afgør højden. Løbet i kampen følger den plads, spilleren står på (Pos/#)', field: 'position', value: (p) => ['GK', 'CB', 'FB', 'CM', 'AM', 'WM', 'ST'].indexOf(p.position) },
  { key: 'age', label: 'Alder', field: 'age', value: (p) => p.age, num: true },
  { key: 'fresh', label: 'Frisk/🚑', title: 'Friskhed i % – en træt spiller yder mindre (75 % ≈ 6 %, 50 % ≈ 12,5 % svagere i dueller, afslutninger og luftdueller). En kamp koster efter løbet distance; man kommer sig hurtigere, jo mere træt man er; bænken +15 ekstra – 🚑 = skadet (antal kampe)', field: 'freshness', value: (p) => (p.injuryMatchesLeft > 0 ? -p.injuryMatchesLeft : p.freshness), num: true },
  { key: 'height', label: 'Højde', field: 'heightCm', value: (p) => p.heightCm, num: true },
  { key: 'jump', label: 'Spring', field: 'jumpingPower', value: (p) => p.jumpingPower, num: true, heat: true },
  { key: 'aerial', label: '✈ Luft', title: 'Samlet luftduel/hovedstød', field: 'aerialPower', value: (p) => p.aerialPower, num: true, heat: true },
  ...[['pace', 'PAC', 'Fart'], ['stamina', 'STA', 'Udholdenhed'], ['strength', 'STR', 'Styrke'], ['ballControl', 'BAL', 'Boldkontrol'], ['passing', 'PAS', 'Pasning'], ['finishing', 'FIN', 'Afslutning'], ['positioning', 'POS', 'Positionering'], ['intercepting', 'INT', 'Erobring'], ['goalkeeping', 'GK', 'Målmandsspil']]
    .map(([k, label, title]) => ({ key: k, label, title, field: 'skills', value: (p) => p.skills[k], num: true, heat: true })),
  { key: 'avg', label: 'Gns', title: 'Gennemsnit af de 9 kerne-evner', field: 'skills', value: avgSkill, num: true, fmt: (v) => dec(v, 1) },
  { key: 'rating', label: '⭐ Vurd', title: 'Eget hold: gennemsnitlig karakter. Modstandere: stjerner', field: 'publicStars', value: (p, c) => (c.isOwn ? avgRating(p) : p.publicStars), num: true },
  { key: 'train', label: '🏋️ Træning', title: 'Træningsfokus (kun dit hold) – gælder, til du ændrer det. Vælg på spillerkortet, eller sæt det for de viste spillere herover', field: 'trainingFocus', value: (p) => Object.keys(FOCUS).indexOf(p.trainingFocus) },
  { key: 'mod', label: '🧠 Mod', title: 'Mod-kunnen: mod gegenpress / mod lav blok / mod VAR-linje & lange bolde (sorterer på den bedste)', field: 'counterTactics', value: modBest, num: true },
];

// v3.18.0: truppen er 18–25 – "Alle (N)" sættes ved visningen; Reserver = hverken startere eller på kamptruppens bænk
export const FILTERS = [['all', 'Alle'], ['start', 'Start-11'], ['bench', 'Bænk'], ['reserve', 'Reserver'], ['GK', 'MÅL'], ['DEF', 'FOR'], ['MID', 'MID'], ['ATT', 'ANG']];

const heatClass = (v) => (v >= 15 ? 'heat-4' : v >= 12 ? 'heat-3' : v >= 8 ? 'heat-2' : 'heat-1');

export function renderMatrix({ team, isOwn, ui, notes, onSort, onSelect, onSwap, onFilter, onBlocked, onFocusMany = null }) {
  const slotOf = (p) => team.tactics.lineupSlots.indexOf(p.id);
  const ctx = { team, isOwn, slotOf };
  const roles = FORMATIONS[team.tactics.baseFormation];
  // Vagten mod "sort-spoofing": en skjult kolonne kan aldrig være sorteringsnøgle for en
  // seer, der ikke må se den – uanset hvad UI-tilstanden siger.
  const wanted = COLUMNS.find((c) => c.key === ui.sortCol) || COLUMNS[0];
  const col = canSeeField(wanted.field, isOwn) ? wanted : COLUMNS[0];
  const desc = col === wanted ? ui.sortDesc : false;
  const benchIds = new Set(matchBenchOf(team).map((p) => p.id));
  const rows = team.squad
    .filter((p) => {
      const s = slotOf(p);
      switch (ui.filter) {
        case 'start': return s >= 0;
        case 'bench': return s < 0 && benchIds.has(p.id);
        case 'reserve': return s < 0 && !benchIds.has(p.id);
        case 'GK': case 'DEF': case 'MID': case 'ATT': return p.line === ui.filter;
        default: return true;
      }
    })
    .map((p) => ({ p, v: col.value(p, ctx) }))
    .sort((a, b) => {
      const d = col.text ? String(a.v).localeCompare(String(b.v), 'da') : a.v - b.v;
      return (desc ? -d : d) || a.p.shirtNumber - b.p.shirtNumber;
    });

  const head = h('tr', {}, COLUMNS.map((c) => {
    const allowed = canSeeField(c.field, isOwn);
    return h('th', {
      title: c.title || c.label, class: (c.key === col.key ? 'sorted ' : '') + (allowed ? 'sortable' : 'locked'),
      onclick: () => (allowed ? onSort(c) : onBlocked(c)),
    }, c.label, c.key === col.key ? (desc ? ' ▼' : ' ▲') : '');
  }), h('th', {}, 'Arketype/Note'), isOwn ? h('th', {}, 'Byt') : null);

  const body = rows.map(({ p }) => {
    const s = slotOf(p);
    const cells = COLUMNS.map((c) => {
      const cls = c.key === col.key ? 'sorted' : '';
      if (!canSeeField(c.field, isOwn)) return h('td', { class: cls + ' lockcell' }, LOCK);
      if (c.key === 'pos') return h('td', { class: cls + (s >= 0 ? ' starter' : ' benchnum') }, s >= 0 ? `${roles[s].r} #${p.shirtNumber}` : `${benchIds.has(p.id) ? 'BÆNK' : 'RES'} #${p.shirtNumber}`);
      if (c.key === 'line') return h('td', { class: cls }, h('span', { class: 'chip' }, LINE[p.line]));
      if (c.key === 'natpos') return h('td', { class: cls, title: POSITION_FULL[p.position] ?? '' }, POSITION[p.position] ?? '–');
      if (c.key === 'fresh') return h('td', { class: cls }, p.injuryMatchesLeft > 0 ? h('span', { class: 'injury' }, `🚑 ${p.injuryMatchesLeft}`) : `${p.freshness}%`);
      if (c.key === 'height') return h('td', { class: cls }, `${p.heightCm} cm`);
      if (c.key === 'rating') return h('td', { class: cls }, isOwn ? (avgRating(p) ? dec(avgRating(p), 1) : '–') : starsEl(p.publicStars));
      if (c.key === 'train') return h('td', { class: cls + ' traincell' }, FOCUS[p.trainingFocus]?.label ?? FOCUS.GENERAL.label);
      if (c.key === 'mod') return h('td', { class: cls + ' modcell', title: 'Mod gegenpress / lav blok / VAR-linje & lange bolde' }, COUNTER_KEYS.map((k) => p.counterTactics[k]).join(' · '));
      const v = c.value(p, ctx);
      return h('td', { class: cls + (c.heat ? ' ' + heatClass(v) : '') }, c.fmt ? c.fmt(v) : v);
    });
    const arch = isOwn && p.archetype ? h('span', { class: p.archetype.isUnlocked ? 'arch on' : 'arch' }, (p.archetype.isUnlocked ? '🌟 ' : '🔒 ') + p.archetype.name) : null;
    const note = notes[p.id]?.trim() ? h('span', { class: 'note-flag', title: 'Du har en note' }, '📝') : null;
    return h('tr', { class: (ui.selectedPlayerId === p.id ? 'selected ' : '') + (ui.swapId === p.id ? 'swapping' : ''), dataset: { pid: p.id }, onclick: () => onSelect(p) },
      cells, h('td', {}, arch, note),
      isOwn ? h('td', {}, h('button', { class: 'mini', title: 'Byt: vælg to spillere', onclick: (e) => { e.stopPropagation(); onSwap(p); } }, '🔁')) : null);
  });

  return h('div', { class: 'panel' },
    h('div', { class: 'toolbar' }, FILTERS.filter(([v]) => v !== 'reserve' || team.squad.length > 18).map(([v, label]) => h('button', { class: 'mini' + (ui.filter === v ? ' active' : ''), onclick: () => onFilter(v) }, v === 'all' ? `${label} (${team.squad.length})` : label)),
      // Massehandling (Spilfører): fokus for de spillere, filteret viser – fx Reserver eller MID
      isOwn && onFocusMany ? select('', [['', `🏋️ Sæt træning for de viste (${rows.length}) …`], ...Object.entries(FOCUS).map(([k, f]) => [k, f.label])],
        (k) => { if (k) onFocusMany(rows.map((r) => r.p.id), k); }, { id: 'focus-many', class: 'mini' }) : null),
    h('div', { class: 'tablewrap' }, h('table', { id: 'matrix', class: 'matrix' }, h('thead', {}, head), h('tbody', {}, body))));
}
