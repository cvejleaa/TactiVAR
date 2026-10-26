// 🏋️ Træningsoversigt i Trup (v3.19.0, brugeren: "en samlet oversigt" – og ikke fra Taktik). Én flade: fokus pr. spiller,
// prisen i friskhed, fremdrift, næste +1, skøn og "+1 sidste runde"; massehandling for de viste. Tallene fra trainingEstimate.
import { h, dec, select } from './dom.js';
import { LINE } from './labels.js';
import { FOCUS, validFocus, trainingEstimate } from '../engine/career.js';
import { SKILL_NAME, roomWords, nextText } from './card.js';

const SHORT = { pace: 'PAC', stamina: 'STA', strength: 'STR', ballControl: 'BAL', passing: 'PAS', finishing: 'FIN', positioning: 'POS', intercepting: 'INT', goalkeeping: 'GK' };

export function renderTrainingTable({ team, report = null, line = 'all', onLine, onFocus, onFocusMany }) {
  const rows = team.squad.filter((p) => line === 'all' || p.line === line);
  const gained = new Map();
  for (const g of report?.gains ?? []) gained.set(g.id, [...(gained.get(g.id) ?? []), g.skill]);
  const on = new Set(team.tactics.lineupSlots);
  return h('div', { class: 'panel training', id: 'training' },
    h('h3', {}, '🏋️ Træning'),
    h('p', { class: 'muted' }, 'Fokus gælder, til du ændrer det. Kampe giver også lidt i kædens nøgle-evner. Prisen er friskhed pr. runde (mindre for den, der har spillet).'),
    h('div', { class: 'toolbar' }, [['all', 'Alle'], ['GK', 'MÅL'], ['DEF', 'FOR'], ['MID', 'MID'], ['ATT', 'ANG']].map(([v, l]) => h('button', { class: 'mini' + (line === v ? ' active' : ''), onclick: () => onLine(v) }, l)),
      select('', [['', `Sæt fokus for de viste (${rows.length}) …`], ...Object.entries(FOCUS).map(([k, f]) => [k, f.label])], (k) => { if (k) onFocusMany(rows.map((p) => p.id), k); }, { id: 'focus-many', class: 'mini' })),
    h('div', { class: 'tablewrap' }, h('table', { class: 'matrix train-table', id: 'training-table' },
      h('thead', {}, h('tr', {}, ['Spiller', 'Kæde', 'Fokus', 'Friskhed', 'Fremdrift', 'Næste +1', 'Skøn', 'Sidste runde'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((p) => {
        const e = trainingEstimate(p, on.has(p.id)), g = gained.get(p.id) ?? [];
        return h('tr', { dataset: { pid: p.id } },
          h('td', {}, `#${p.shirtNumber} ${p.shortName}`), h('td', {}, h('span', { class: 'chip' }, LINE[p.line])),
          h('td', {}, select(e.key, Object.entries(FOCUS).filter(([k]) => validFocus(p, k)).map(([k, f]) => [k, f.label]), (k) => onFocus(p.id, k), { class: 'mini train-focus' })),
          h('td', { class: 'num' }, e.fresh > 0 ? `+${e.fresh}` : `${e.fresh} (${e.playedFresh})`),
          h('td', { class: 'train-prog' }, e.lines.map((l) => (l.top ? `${SHORT[l.skill]} 20` : `${SHORT[l.skill]} ${dec(l.dev, 1)}`)).join(' · ') || '–'),
          h('td', { title: nextText(e.next, e.why) }, e.key === 'REST' ? 'hviler' : e.next === Infinity ? '–' : e.next > 14 ? '> 1 sæson' : `~${e.next} rd`),
          h('td', { class: 'muted' }, roomWords(e.room)),
          h('td', { class: 'num' }, g.length ? g.map((s) => `+1 ${SKILL_NAME[s]}`).join(', ') : ''));
      })))));
}
