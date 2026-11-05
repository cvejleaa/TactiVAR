// Spillerlisten ved banen på Taktik (v3.19.0, brugeren: "spillerliste ved banen" – opstillingen samlet ét sted).
// Start-11 (pladsens rolle), Bænk (kamptruppens 7) og Reserver; klik på en brik filtrerer listen til spillerens kæde, så
// kolonnerne er kædens 3 nøgle-evner og kan sorteres. Kolonnerne og synligheden er regnearkets (COLUMNS + canSeeField) –
// én vagt mod sortering på skjulte data for modstandere (QC).
import { h, dec, LOCK } from './dom.js';
import { LINE, POSITION, POSITION_FULL, starsEl, outLabel, OUT_TITLE, fitCost, FIT_HELP, roleLabel, archetypeOf, archIcon, archReqText } from './labels.js';
import { canSeeField } from '../engine/visibility.js';
import { FORMATIONS, slotFitOf, slotKindText, slotPosition } from '../engine/formations.js';
import { matchBenchOf, reservesOf, KEY_SKILLS, keyAvg } from '../engine/career.js';
import { COLUMNS, heatClass, avgRating } from './matrix.js';

const col = (k) => COLUMNS.find((c) => c.key === k);
const KEY_COL = { key: 'keyavg', label: 'Nøgle', title: 'Snit af kædens 3 nøgle-evner', field: 'skills', value: (p) => keyAvg(p), num: true, fmt: (v) => dec(v, 1) };
export const LIST_LINES = [['all', 'Alle'], ['GK', 'MÅL'], ['DEF', 'FOR'], ['MID', 'MID'], ['ATT', 'ANG']];
// Kolonnerne efter filteret: kædens 3 nøgle-evner, eller nøglesnittet under "Alle"
export const listColumns = (line) => [col('fresh'), col('rating'), ...(line && line !== 'all' ? KEY_SKILLS[line].map(col) : [KEY_COL])];

// Listens rækker (ren – unit-testet): kolonner, sorteringsnøgle og de tre sektioner. Start-11 står i pladsernes orden; bænk og
// reserver sorteres. Vagten: en skjult kolonne er ALDRIG sorteringsnøgle – heller ikke når sorteringen er valgt på dit eget hold og
// følger med til et modstanderhold (Test Manager v3.19.0).
export function listRows({ team, isOwn, ui }) {
  const line = ui.listLine ?? 'all', cols = listColumns(line);
  const slotOf = (p) => team.tactics.lineupSlots.indexOf(p.id), ctx = { team, isOwn, slotOf };
  const wanted = cols.find((c) => c.key === ui.listSort) ?? null;
  const sortCol = wanted && canSeeField(wanted.field, isOwn) ? wanted : null;
  const sorted = (list) => (sortCol ? list.slice().sort((a, b) => (sortCol.value(b, ctx) - sortCol.value(a, ctx)) * (ui.listSortAsc ? -1 : 1) || a.shirtNumber - b.shirtNumber) : list);
  const keep = (p) => line === 'all' || p.line === line;
  const starters = team.tactics.lineupSlots.map((id) => team.squad.find((p) => p.id === id)).filter(Boolean);
  return { line, cols, ctx, sortCol, starters: starters.filter(keep), bench: sorted(matchBenchOf(team)).filter(keep), reserves: sorted(reservesOf(team)).filter(keep), benchAll: matchBenchOf(team).length, reservesAll: reservesOf(team).length };
}

// v3.29.0 (kortpanelet): onInfo = ⓘ forrest i navnecellen åbner spillerkortet – et klik på rækken er stadig byt (brugerens valg), så ⓘ
// stopper klikket (som #auto-bench) og rører hverken byttet eller beskeden. ui.cardId = panelets spiller (omrids, kun mens det er åbent);
// onPickCard = "Se kort ›" i byt-beskeden, kun mens et byt er i gang (ui.swapId).
export function renderLineupList({ team, isOwn, ui, onPick, onSort, onBlocked, onLine, onAutoBench, msg = '', onInfo = null, onPickCard = null }) {
  const { line, cols, ctx, sortCol, starters, bench, reserves, benchAll, reservesAll } = listRows({ team, isOwn, ui });
  const roles = FORMATIONS[team.tactics.baseFormation], slotOf = ctx.slotOf;
  const kindOf = (s) => (s >= 0 ? slotKindText(roles[s].r, slotPosition(team.tactics, s).y) : null);
  const cell = (c, p) => {
    if (!canSeeField(c.field, isOwn)) return h('td', { class: 'lockcell' }, LOCK);
    if (c.key === 'fresh') return h('td', {}, outLabel(p) ? h('span', { class: 'injury', title: OUT_TITLE }, outLabel(p)) : `${p.freshness}%`);   // v3.27.0: 🚑/⛔
    if (c.key === 'rating') return h('td', {}, isOwn ? (avgRating(p) ? dec(avgRating(p), 1) : '–') : starsEl(p.publicStars));
    const v = c.value(p, ctx);
    return h('td', { class: c.heat ? heatClass(v) : '' }, c.fmt ? c.fmt(v) : v);
  };
  // Arketypen (v3.31.2, brugeren 3/11: "arketype markeringen med på taktik siden"): samme mærke som Trups kolonne – KUN dit hold
  // (archetype er privat, OWNER_FIELDS; samme vagt som matrix.js). ≥ 900 px en dæmpet linje under navnet, < 900 px kun ikonet (CSS)
  const archMark = (p) => {
    const a = isOwn ? archetypeOf(p.archetype) : null;
    if (!a) return null;
    const tip = `Arketype: ${a.name} – ${a.description}${a.isUnlocked ? ' (låst op)' : ` · ${archReqText(a, p)}`}`;
    return [h('span', { class: 'lp-arch-ico', title: tip, 'aria-label': tip }, ` ${archIcon(a)}`), h('div', { class: 'lp-arch muted', title: tip }, `${archIcon(a)} ${a.name}`)];
  };
  const row = (p, kind) => {
    const s = slotOf(p), place = kind === 'start' ? roleLabel(roles[s].r) : kind === 'bench' ? 'Bænk' : 'Res', fit = kind === 'start' ? slotFitOf(team.tactics, s, p.position) : 1;
    return h('tr', { class: `lp-row ${kind}-p` + (ui.swapId === p.id ? ' active' : '') + (ui.cardId === p.id ? ' carded' : '') + (outLabel(p) ? ' injured' : '') + (p.banMatches > 0 ? ' banned' : ''), dataset: { pid: p.id },
      title: isOwn ? (kind === 'reserve' ? 'Reserve – ikke med i kampen. Klik og så en bænkspiller (eller en brik) for at tage ham med.' : 'Klik og så en anden spiller (her eller på banen) for at bytte') : '',
      onclick: () => onPick(p) },
    h('td', { class: 'lp-place' + (fit < 1 ? ' off-pos' : ''), title: fit < 1 ? `Naturlig: ${POSITION_FULL[p.position]} – på ${place}${kindOf(s) ? ` (${kindOf(s)})` : ''} koster det ${fitCost(fit)} i dueller` : '' }, place, fit < 1 ? ` ⚠ ${fitCost(fit)}` : ''),
    // ⓘ: tegnet står i CSS (::before), så cellens tekst stadig er "#7 Navn"
    h('td', {}, onInfo ? h('button', { class: 'lp-info', type: 'button', dataset: { pid: p.id }, title: 'Åbn spillerkortet', 'aria-label': `Spillerkort: #${p.shirtNumber} ${p.shortName}`, onclick: (e) => { e.stopPropagation(); onInfo(p); } }) : null, h('span', { class: 'lp-name' }, `#${p.shirtNumber} ${p.shortName}`), archMark(p)),
    // Kæde · naturlig position i alle tre sektioner (QC B4: så man kan se, hvem på bænken der passer)
    h('td', { title: POSITION_FULL[p.position] ?? '' }, h('span', { class: 'chip' }, LINE[p.line]), ` ${POSITION[p.position] ?? ''}`), cols.map((c) => cell(c, p)));
  };
  const head = h('tr', {}, h('th', {}, 'Plads'), h('th', {}, 'Spiller'), h('th', { title: 'Kæde · naturlig position' }, 'Kæde/pos'), cols.map((c) => {
    const allowed = canSeeField(c.field, isOwn);
    return h('th', { class: (sortCol?.key === c.key ? 'sorted ' : '') + (allowed ? 'sortable' : 'locked'), title: c.title || c.label, onclick: () => (allowed ? onSort(c) : onBlocked(c)) }, c.label);
  }));
  const section = (title, list, kind, extra = null, id = null) => [
    h('tr', { class: 'lp-sec', id }, h('th', { colspan: 3 + cols.length }, title, extra)),
    ...list.map((p) => row(p, kind))];
  const auto = isOwn && onAutoBench ? h('button', { class: 'mini', id: 'auto-bench', disabled: team.matchBenchAuto !== false, onclick: (e) => { e.stopPropagation(); onAutoBench(); } },
    team.matchBenchAuto !== false ? '✓ Udtages automatisk før hver runde' : '↺ Udtag automatisk') : null;
  return h('div', { class: 'panel lineup-list', id: 'lineup-list' },
    h('div', { class: 'toolbar' }, LIST_LINES.map(([v, l]) => h('button', { class: 'mini' + (line === v ? ' active' : ''), onclick: () => onLine(v) }, l))),
    msg ? h('div', { class: 'notice' + (ui.swapId ? ' pick-live' : ''), id: 'pick-msg' }, msg, onPickCard && ui.swapId ? [' ', h('button', { class: 'linklike', id: 'pick-card', onclick: () => onPickCard(ui.swapId) }, 'Se kort ›')] : null) : null,
    h('div', { class: 'tablewrap' }, h('table', { class: 'matrix lp-table', id: 'lineup-table' }, h('thead', {}, head),
      h('tbody', { id: 'bench' }, [...section('Start-11', starters, 'start'), ...section(`Bænk (${benchAll} udtaget)`, bench, 'bench', auto),
        ...(reservesAll ? section(`Reserver (${reservesAll})`, reserves, 'reserve', null, 'reserves') : [])]))),
    isOwn ? h('div', { class: 'muted help', id: 'list-help' }, 'ⓘ ved navnet = spillerkortet · Klik på to spillere (i listen eller på banen) = byt · Bænk og så reserve = tag reserven med i kampen · Træk en brik = justér positionen')
      : onInfo ? h('div', { class: 'muted help', id: 'list-help' }, 'Klik på en spiller (eller ⓘ) for at åbne spillerkortet') : null,
    h('div', { class: 'muted help', id: 'fit-help' }, FIT_HELP));
}
