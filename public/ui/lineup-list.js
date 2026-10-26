// Spillerlisten ved banen på Taktik (v3.19.0, brugeren: "spillerliste ved banen" – opstillingen samlet ét sted).
// Start-11 (pladsens rolle), Bænk (kamptruppens 7) og Reserver; klik på en brik filtrerer listen til spillerens kæde, så
// kolonnerne er kædens 3 nøgle-evner og kan sorteres. Kolonnerne og synligheden er regnearkets (COLUMNS + canSeeField) –
// én vagt mod sortering på skjulte data for modstandere (QC).
import { h, dec, LOCK } from './dom.js';
import { LINE, starsEl } from './labels.js';
import { canSeeField } from '../engine/visibility.js';
import { FORMATIONS } from '../engine/formations.js';
import { matchBenchOf, reservesOf, KEY_SKILLS, keyAvg } from '../engine/career.js';
import { COLUMNS, heatClass, avgRating } from './matrix.js';

const col = (k) => COLUMNS.find((c) => c.key === k);
const KEY_COL = { key: 'keyavg', label: 'Nøgle', title: 'Snit af kædens 3 nøgle-evner', field: 'skills', value: (p) => keyAvg(p), num: true, fmt: (v) => dec(v, 1) };
export const LIST_LINES = [['all', 'Alle'], ['GK', 'MÅL'], ['DEF', 'FOR'], ['MID', 'MID'], ['ATT', 'ANG']];
// Kolonnerne efter filteret: kædens 3 nøgle-evner, eller nøglesnittet under "Alle"
export const listColumns = (line) => [col('fresh'), col('rating'), ...(line && line !== 'all' ? KEY_SKILLS[line].map(col) : [KEY_COL])];

export function renderLineupList({ team, isOwn, ui, onPick, onSort, onBlocked, onLine, onAutoBench, msg = '' }) {
  const line = ui.listLine ?? 'all', cols = listColumns(line);
  const slotOf = (p) => team.tactics.lineupSlots.indexOf(p.id), ctx = { team, isOwn, slotOf }, roles = FORMATIONS[team.tactics.baseFormation];
  const wanted = cols.find((c) => c.key === ui.listSort) ?? null;
  const sortCol = wanted && canSeeField(wanted.field, isOwn) ? wanted : null;   // en skjult kolonne er aldrig sorteringsnøgle
  const sorted = (list) => (sortCol ? list.slice().sort((a, b) => (sortCol.value(b, ctx) - sortCol.value(a, ctx)) * (ui.listSortAsc ? -1 : 1) || a.shirtNumber - b.shirtNumber) : list);
  const keep = (p) => line === 'all' || p.line === line;
  const starters = team.tactics.lineupSlots.map((id) => team.squad.find((p) => p.id === id)).filter(Boolean);
  const cell = (c, p) => {
    if (!canSeeField(c.field, isOwn)) return h('td', { class: 'lockcell' }, LOCK);
    if (c.key === 'fresh') return h('td', {}, p.injuryMatchesLeft > 0 ? h('span', { class: 'injury' }, `🚑 ${p.injuryMatchesLeft}`) : `${p.freshness}%`);
    if (c.key === 'rating') return h('td', {}, isOwn ? (avgRating(p) ? dec(avgRating(p), 1) : '–') : starsEl(p.publicStars));
    const v = c.value(p, ctx);
    return h('td', { class: c.heat ? heatClass(v) : '' }, c.fmt ? c.fmt(v) : v);
  };
  const row = (p, kind) => {
    const s = slotOf(p), place = kind === 'start' ? roles[s].r : kind === 'bench' ? 'Bænk' : 'Res';
    return h('tr', { class: `lp-row ${kind}-p` + (ui.swapId === p.id ? ' active' : '') + (p.injuryMatchesLeft > 0 ? ' injured' : ''), dataset: { pid: p.id },
      title: isOwn ? (kind === 'reserve' ? 'Reserve – ikke med i kampen. Klik og så en bænkspiller (eller en brik) for at tage ham med.' : 'Klik og så en anden spiller (her eller på banen) for at bytte') : '',
      onclick: () => onPick(p) },
    h('td', { class: 'lp-place' }, place), h('td', {}, `#${p.shirtNumber} ${p.shortName}`), h('td', {}, h('span', { class: 'chip' }, LINE[p.line])), cols.map((c) => cell(c, p)));
  };
  const head = h('tr', {}, h('th', {}, 'Plads'), h('th', {}, 'Spiller'), h('th', {}, 'Kæde'), cols.map((c) => {
    const allowed = canSeeField(c.field, isOwn);
    return h('th', { class: (sortCol?.key === c.key ? 'sorted ' : '') + (allowed ? 'sortable' : 'locked'), title: c.title || c.label, onclick: () => (allowed ? onSort(c) : onBlocked(c)) }, c.label);
  }));
  const section = (title, list, kind, extra = null, id = null) => [
    h('tr', { class: 'lp-sec', id }, h('th', { colspan: 3 + cols.length }, title, extra)),
    ...list.filter(keep).map((p) => row(p, kind))];
  const bench = matchBenchOf(team), reserves = reservesOf(team);
  const auto = isOwn && onAutoBench ? h('button', { class: 'mini', id: 'auto-bench', disabled: team.matchBenchAuto !== false, onclick: (e) => { e.stopPropagation(); onAutoBench(); } },
    team.matchBenchAuto !== false ? '✓ Udtages automatisk før hver runde' : '↺ Udtag automatisk') : null;
  return h('div', { class: 'panel lineup-list', id: 'lineup-list' },
    h('div', { class: 'toolbar' }, LIST_LINES.map(([v, l]) => h('button', { class: 'mini' + (line === v ? ' active' : ''), onclick: () => onLine(v) }, l))),
    msg ? h('div', { class: 'notice', id: 'pick-msg' }, msg) : null,
    h('div', { class: 'tablewrap' }, h('table', { class: 'matrix lp-table' }, h('thead', {}, head),
      h('tbody', { id: 'bench' }, [...section('Start-11', starters, 'start'), ...section(`Bænk (${bench.length} udtaget)`, sorted(bench), 'bench', auto),
        ...(reserves.length ? section(`Reserver (${reserves.length})`, sorted(reserves), 'reserve', null, 'reserves') : [])]))),
    isOwn ? h('div', { class: 'muted help' }, 'Klik på to spillere (i listen eller på banen) = byt · Bænk og så reserve = tag reserven med i kampen · Træk en brik = justér positionen') : null);
}
