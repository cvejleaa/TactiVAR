// Regneark/scouting-matrix (docs/spec.md §8). Modstanderes skjulte kolonner vises som
// "🔒 ??" og kan ikke sorteres (synlighed afgøres i engine/visibility.js).
import { h, LOCK } from './dom.js';
import { LINE, stars } from './labels.js';
import { canSeeField } from '../engine/visibility.js';
import { FORMATIONS } from '../engine/formations.js';
import { masteryVs } from '../engine/counter.js';

const avgSkill = (p) => Object.values(p.skills).reduce((a, b) => a + b, 0) / 9;
const avgRating = (p) => (p.ratingGames ? p.ratingSum / p.ratingGames : 0);

// field = det felt synligheden afgøres på; num = tal-kolonne (starter faldende ved sortering).
export const COLUMNS = [
  { key: 'pos', label: 'Pos/#', title: 'Plads i opstillingen / rygnummer', field: 'shirtNumber', value: (p, c) => { const s = c.slotOf(p); return s >= 0 ? s : 100 + p.shirtNumber; } },
  { key: 'name', label: 'Spiller', field: 'shortName', value: (p) => p.shortName, text: true },
  { key: 'line', label: 'Kæde', field: 'line', value: (p) => ['GK', 'DEF', 'MID', 'ATT'].indexOf(p.line) },
  { key: 'age', label: 'Alder', field: 'age', value: (p) => p.age, num: true },
  { key: 'fresh', label: 'Frisk/🚑', title: 'Friskhed i % – 🚑 = skadet (antal kampe)', field: 'freshness', value: (p) => (p.injuryMatchesLeft > 0 ? -p.injuryMatchesLeft : p.freshness), num: true },
  { key: 'height', label: 'Højde', field: 'heightCm', value: (p) => p.heightCm, num: true },
  { key: 'jump', label: 'Spring', field: 'jumpingPower', value: (p) => p.jumpingPower, num: true, heat: true },
  { key: 'aerial', label: '✈ Luft', title: 'Samlet luftduel/hovedstød', field: 'aerialPower', value: (p) => p.aerialPower, num: true, heat: true },
  ...[['pace', 'PAC', 'Fart'], ['stamina', 'STA', 'Udholdenhed'], ['strength', 'STR', 'Styrke'], ['ballControl', 'BAL', 'Boldkontrol'], ['passing', 'PAS', 'Pasning'], ['finishing', 'FIN', 'Afslutning'], ['positioning', 'POS', 'Positionering'], ['intercepting', 'INT', 'Erobring'], ['goalkeeping', 'GK', 'Målmandsspil']]
    .map(([k, label, title]) => ({ key: k, label, title, field: 'skills', value: (p) => p.skills[k], num: true, heat: true })),
  { key: 'avg', label: 'Gns', title: 'Gennemsnit af de 9 kerne-evner', field: 'skills', value: avgSkill, num: true, fmt: (v) => v.toFixed(1) },
  { key: 'rating', label: '⭐ Vurd', title: 'Eget hold: gennemsnitlig karakter. Modstandere: stjerner', field: 'publicStars', value: (p, c) => (c.isOwn ? avgRating(p) : p.publicStars), num: true },
  { key: 'mod', label: '🧠 Mod', title: 'Mod-kunnen mod den valgte modstander', field: 'counterTactics', value: (p, c) => masteryVs(p, c.opponent), num: true },
];

export const FILTERS = [['all', 'Alle (18)'], ['start', 'Start-11'], ['bench', 'Bænk'], ['GK', 'MÅL'], ['DEF', 'FOR'], ['MID', 'MID'], ['ATT', 'ANG']];

const heatClass = (v) => (v >= 15 ? 'heat-4' : v >= 12 ? 'heat-3' : v >= 8 ? 'heat-2' : 'heat-1');

export function renderMatrix({ team, isOwn, opponent, ui, notes, onSort, onSelect, onSwap, onFilter, onBlocked }) {
  const slotOf = (p) => team.tactics.lineupSlots.indexOf(p.id);
  const ctx = { team, isOwn, opponent, slotOf };
  const roles = FORMATIONS[team.tactics.baseFormation];
  const col = COLUMNS.find((c) => c.key === ui.sortCol) || COLUMNS[0];
  const rows = team.squad
    .filter((p) => {
      const s = slotOf(p);
      switch (ui.filter) {
        case 'start': return s >= 0;
        case 'bench': return s < 0;
        case 'GK': case 'DEF': case 'MID': case 'ATT': return p.line === ui.filter;
        default: return true;
      }
    })
    .map((p) => ({ p, v: col.value(p, ctx) }))
    .sort((a, b) => {
      const d = col.text ? String(a.v).localeCompare(String(b.v), 'da') : a.v - b.v;
      return (ui.sortDesc ? -d : d) || a.p.shirtNumber - b.p.shirtNumber;
    });

  const head = h('tr', {}, COLUMNS.map((c) => {
    const allowed = canSeeField(c.field, isOwn);
    return h('th', {
      title: c.title || c.label, class: (c.key === col.key ? 'sorted ' : '') + (allowed ? 'sortable' : 'locked'),
      onclick: () => (allowed ? onSort(c) : onBlocked(c)),
    }, c.label, c.key === col.key ? (ui.sortDesc ? ' ▼' : ' ▲') : '');
  }), h('th', {}, 'Arketype/Note'), isOwn ? h('th', {}, 'Byt') : null);

  const body = rows.map(({ p }) => {
    const s = slotOf(p);
    const cells = COLUMNS.map((c) => {
      const cls = c.key === col.key ? 'sorted' : '';
      if (!canSeeField(c.field, isOwn)) return h('td', { class: cls + ' lockcell' }, LOCK);
      if (c.key === 'pos') return h('td', { class: cls + (s >= 0 ? ' starter' : ' benchnum') }, s >= 0 ? `${roles[s].r} #${p.shirtNumber}` : `BÆNK #${p.shirtNumber}`);
      if (c.key === 'line') return h('td', { class: cls }, h('span', { class: 'chip' }, LINE[p.line]));
      if (c.key === 'fresh') return h('td', { class: cls }, p.injuryMatchesLeft > 0 ? h('span', { class: 'injury' }, `🚑 ${p.injuryMatchesLeft}`) : `${p.freshness}%`);
      if (c.key === 'height') return h('td', { class: cls }, `${p.heightCm} cm`);
      if (c.key === 'rating') return h('td', { class: cls }, isOwn ? (avgRating(p) ? avgRating(p).toFixed(1) : '–') : stars(p.publicStars));
      if (c.key === 'mod') return h('td', { class: cls }, `${masteryVs(p, opponent)}%`);
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
    h('div', { class: 'toolbar' }, FILTERS.map(([v, label]) => h('button', { class: 'mini' + (ui.filter === v ? ' active' : ''), onclick: () => onFilter(v) }, label))),
    h('div', { class: 'tablewrap' }, h('table', { id: 'matrix', class: 'matrix' }, h('thead', {}, head), h('tbody', {}, body))));
}
