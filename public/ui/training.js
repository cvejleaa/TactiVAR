// 🏋️ Træning (v3.19.0 i Trup, brugeren: "en samlet oversigt" – v3.30.0 sin egen fane, brugeren: "træningen i en egen topfane").
// Én flade og det ENE sted, træningsfokus sættes: fokus pr. spiller, prisen i friskhed, fremdrift, næste +1, skøn og "sidste runde";
// massehandling for de viste. Tallene fra trainingEstimate. Fanen viser altid dit hold (app.js bygger den fra dit hold).
import { h, dec, select } from './dom.js';
import { LINE } from './labels.js';
import { FOCUS, validFocus, trainingEstimate, roomPoints, focusSkills } from '../engine/career.js';
import { SKILL_NAME, roomWords, nextText, ROOM_SCALE } from './card.js';

const SHORT = { pace: 'PAC', stamina: 'STA', strength: 'STR', ballControl: 'BAL', passing: 'PAS', finishing: 'FIN', positioning: 'POS', intercepting: 'INT', goalkeeping: 'GK', jumpingPower: 'SPR' };
// Fokusvalget med sine evner (v3.32.0): "Fysik – Fart, Styrke, Spring". Ét-evne-fokus med samme navn som evnen (Afslutning) står alene;
// Alsidig viser spillerens kædes nøgle-evner (p) eller "kædens nøgle-evner" (massehandlingen)
export const focusLabel = (k, p = null) => {
  const f = FOCUS[k], skills = f.skills ?? (p ? focusSkills(p, f) : null);
  if (!skills) return `${f.label} – kædens nøgle-evner`;
  const names = skills.map((s) => SKILL_NAME[s]);
  return !names.length || (names.length === 1 && names[0] === f.label) ? f.label : `${f.label} – ${names.join(', ')}`;
};

// Rapportens +1 pr. spiller (v3.30.0, én kilde for træningstabellen og Trup-regnearkets "+N"): Map(id → [evne, …]). Samme (id, evne)
// kan stå flere gange (addXp giver alle +1 i en runde), så listen tælles – den er ikke et ja/nej.
export function gainsByPlayer(report) {
  const m = new Map();
  for (const g of report?.gains ?? []) m.set(g.id, [...(m.get(g.id) ?? []), g.skill]);
  return m;
}
// "+2 Afslutning, +1 Fart" – evnerne talt sammen (før "+1 Afslutning, +1 Afslutning")
export function gainWords(skills) {
  const n = new Map();
  for (const s of skills) n.set(s, (n.get(s) ?? 0) + 1);
  return [...n].map(([s, k]) => `+${k} ${SKILL_NAME[s]}`).join(', ');
}

// Linjen øverst (v3.30.0, Spilfører UI: en tom runde må ikke ligne en fejl): "Ingen +1 efter runde R" når rapporten intet har for
// truppen, og altid hvem der er nærmest et +1 (trainingEstimate) og hvor mange der træner Alsidig
export function trainingNext(team, report, roundLabel) {
  const on = new Set(team.tactics.lineupSlots), known = new Set(team.squad.map((p) => p.id));
  let best = null;
  for (const p of team.squad) {
    const e = trainingEstimate(p, on.has(p.id));
    if (e.key === 'REST' || !(e.next < Infinity)) continue;
    const l = e.lines.find((x) => x.n === e.next);
    if (!best || e.next < best.n || (e.next === best.n && p.shirtNumber < best.p.shirtNumber)) best = { p, n: e.next, skill: l.skill };
  }
  const general = team.squad.filter((p) => trainingEstimate(p).key === 'GENERAL').length;
  const parts = [
    report && !report.gains.some((g) => known.has(g.id)) ? `Ingen +1 efter runde ${roundLabel}` : null,
    // samme ord som tabellens "Næste +1" (over 14 runder: "> 1 sæson")
    best ? `nærmest et +1: #${best.p.shirtNumber} ${best.p.shortName} ${SKILL_NAME[best.skill]} ${best.n > 14 ? 'om mere end en sæson' : `om ~${best.n} rd`}` : null,
    general ? `${general} træner stadig Alsidig` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  const txt = parts.join(' · ');
  return txt[0].toUpperCase() + txt.slice(1);
}

// selectedId (v3.30.0): spilleren, kortets "ændr i Træning ›" kom fra – rækken får samme lilla omrids som i regnearket
export function renderTrainingTable({ team, report = null, roundLabel = report?.round, line = 'all', onLine, onFocus, onFocusMany, msg = '', selectedId = null }) {
  const rows = team.squad.filter((p) => line === 'all' || p.line === line);
  const gained = gainsByPlayer(report);
  const on = new Set(team.tactics.lineupSlots);
  const next = trainingNext(team, report, roundLabel);
  return h('div', { class: 'panel training', id: 'training' },
    h('h3', {}, '🏋️ Træning'),
    next ? h('div', { id: 'training-next' }, next) : null,
    h('p', { class: 'muted' }, 'Fokus gælder, til du ændrer det. Kampe giver også lidt i kædens nøgle-evner. Prisen er friskhed pr. runde (mindre for den, der har spillet).'),
    h('p', { class: 'muted', id: 'room-scale' }, ROOM_SCALE + '.'),
    h('div', { class: 'toolbar' }, [['all', 'Alle'], ['GK', 'MÅL'], ['DEF', 'FOR'], ['MID', 'MID'], ['ATT', 'ANG']].map(([v, l]) => h('button', { class: 'mini' + (line === v ? ' active' : ''), onclick: () => onLine(v) }, l)),
      select('', [['', `Sæt fokus for de viste (${rows.length}) …`], ...Object.keys(FOCUS).map((k) => [k, focusLabel(k)])], (k) => { if (k) onFocusMany(rows.map((p) => p.id), k); }, { id: 'focus-many', class: 'mini' })),
    msg ? h('div', { class: 'notice', id: 'train-msg' }, msg) : null,
    h('div', { class: 'tablewrap' }, h('table', { class: 'matrix train-table', id: 'training-table' },
      h('thead', {}, h('tr', {}, [['Spiller'], ['Kæde'], ['Fokus'], ['Friskhed', 'Pr. runde – i parentes, når han har spillet'], ['Fremdrift'], ['Næste +1'], ['Skøn', ROOM_SCALE], ['Sidste runde']].map(([t, title]) => h('th', { title: title ?? '' }, t)))),
      h('tbody', {}, rows.map((p) => {
        const e = trainingEstimate(p, on.has(p.id)), g = gained.get(p.id) ?? [];
        return h('tr', { dataset: { pid: p.id }, class: selectedId === p.id ? 'selected' : null },
          h('td', {}, `#${p.shirtNumber} ${p.shortName}`), h('td', {}, h('span', { class: 'chip' }, LINE[p.line])),
          h('td', {}, select(e.key, Object.keys(FOCUS).filter((k) => validFocus(p, k)).map((k) => [k, focusLabel(k, p)]), (k) => onFocus(p.id, k), { class: 'mini train-focus' })),
          h('td', { class: 'num' }, e.fresh > 0 ? `+${e.fresh}` : `${e.fresh} (${e.playedFresh})`),
          h('td', { class: 'train-prog' }, e.lines.map((l) => (l.top ? `${SHORT[l.skill]} 20` : `${SHORT[l.skill]} ${dec(l.dev, 1)}`)).join(' · ') || '–'),
          h('td', { title: nextText(e.next, e.why) }, e.key === 'REST' ? 'hviler' : e.next === Infinity ? '–' : e.next > 14 ? '> 1 sæson' : `~${e.next} rd`),
          h('td', { class: 'muted' }, roomWords(roomPoints(p))),
          h('td', { class: 'num' }, gainWords(g)));
      })))));
}
