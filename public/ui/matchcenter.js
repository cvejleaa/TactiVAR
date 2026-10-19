// Broadcast Match Center (docs/spec.md §5–6): de 4 kampe i runden, live-afspilning af
// din kamp, tidslinje, statistik, karakterark og TactiVAR Avisen. Karakterer for
// modstandere vises kun som stjerner (engine/visibility.js).
import { h } from './dom.js';
import { starsEl } from './labels.js';
import { viewRatingEntry } from '../engine/visibility.js';

export const REPORT_FILTERS = [['all', 'Alle hændelser'], ['tactic', 'Kun taktik'], ['key', 'Kun nøglemomenter']];
const KEY_TYPES = new Set(['GOAL', 'HEADER_GOAL', 'VAR_GOAL', 'VAR_NO_GOAL', 'INJURY', 'SUB', 'TRIGGER', 'END', 'HALFTIME']);
const ICON = { GOAL: '⚽', HEADER_GOAL: '⚽', VAR_GOAL: '📺', VAR_NO_GOAL: '📺', INJURY: '🚑', SUB: '🔄', TRIGGER: '📋', FOUL: '🟨' };

export function filterEvents(events, filter) {
  if (filter === 'tactic') return events.filter((e) => e.category === 'TACTIC' || e.type === 'TRIGGER');
  if (filter === 'key') return events.filter((e) => KEY_TYPES.has(e.type));
  return events;
}

function statsRows(m, st) {
  const pct = Math.round((st.hPoss / (st.hPoss + st.aPoss)) * 100);
  const rows = [
    ['Boldbesiddelse', `${pct}%`, `${100 - pct}%`],
    ['Vundne taktiske dueller', st.hTacticSuccess, st.aTacticSuccess],
    ['Afslutninger', st.hShots, st.aShots],
    ['Skud på mål', st.hOnTarget, st.aOnTarget],
    ['Expected goals (xG)', st.hXg.toFixed(2), st.aXg.toFixed(2)],
    ['Vundne luftdueller', st.hAerialWon, st.aAerialWon],
    ['VAR-tjek', st.hVarChecks, st.aVarChecks],
    ['Frispark / skader', `${st.hFouls} / ${st.hInjuries}`, `${st.aFouls} / ${st.aInjuries}`],
  ];
  return h('table', { class: 'mstats', id: 'match-stats' }, h('thead', {}, h('tr', {}, h('th', {}, m.homeName), h('th', {}, ''), h('th', {}, m.awayName))),
    h('tbody', {}, rows.map(([l, a, b]) => h('tr', {}, h('td', {}, String(a)), h('th', {}, l), h('td', {}, String(b))))));
}

function timeline(events) {
  return h('div', { class: 'timeline', id: 'timeline' }, h('div', { class: 'tl-half' }),
    events.filter((e) => e.plot).map((e) => h('span', { class: 'tl-mark ' + (e.isHome ? 'home' : 'away'), style: { left: `${(e.min / 90) * 100}%` }, title: `${e.min}' ${e.label}` }, ICON[e.type] || '•')));
}

// Spilletid: "90'" for hele kampen, ellers ind–ud.
export const minutes = (e) => (e.minIn <= 1 && e.minOut === 90 ? "90'" : `${e.minIn <= 1 ? 0 : e.minIn}'–${e.minOut}'`);

function ratingsTable(list, isOwn, title) {
  const rows = list.map((e) => viewRatingEntry(e, isOwn)).sort((a, b) => (b.rating ?? b.stars) - (a.rating ?? a.stars));
  return h('div', { class: 'ratings' }, h('h4', {}, title),
    h('table', {}, h('tbody', {}, rows.map((e) => h('tr', { class: e.isMotM ? 'motm' : '' },
      h('td', {}, `#${e.shirtNumber} ${e.shortName}`), h('td', { class: 'muted' }, minutes(e)),
      h('td', {}, [e.goals ? '⚽'.repeat(e.goals) : '', e.assists ? '🅰'.repeat(e.assists) : '', e.saves ? `🧤${e.saves}` : '', e.aerialWins ? `✈${e.aerialWins}` : '', e.yellowCard ? '🟨' : '', e.injured ? '🚑' : '', e.isMotM ? '👑' : ''].join(' ')),
      h('td', { class: 'rating' }, isOwn ? e.rating.toFixed(1) : starsEl(e.stars)),
      isOwn ? h('td', { class: 'xp' }, `+${e.gainedCounterXp} 🧠`) : null)))));
}

export function renderGazette(g, myTeamId) {
  if (!g) return null;
  // Rundens spiller går gennem visibility.js: modstandere vises kun med stjerner.
  const pr = g.playerOfTheRound ? viewRatingEntry(g.playerOfTheRound, g.playerOfTheRound.teamId === myTeamId) : null;
  const feats = pr ? [pr.goals ? `${pr.goals} mål` : '', pr.assists ? `${pr.assists} oplæg` : '', pr.saves ? `${pr.saves} redninger` : ''].filter(Boolean).join(' • ') : '';
  return h('div', { class: 'panel gazette', id: 'gazette' }, h('h3', {}, '📰 TactiVAR Avisen'),
    h('p', {}, `Runden bød på ${g.totalGoals} scoringer og ${g.totalVarChecks} VAR-tjek på tværs af de 4 stadions. ${g.myResult}`),
    pr ? h('p', { id: 'player-of-round' }, h('strong', {}, '🏆 Rundens spiller: '), `#${pr.shirtNumber} ${pr.shortName} (${pr.teamName}) – `, 'rating' in pr ? `karakter ${pr.rating.toFixed(1)}` : starsEl(pr.stars), feats ? ` • ${feats}` : '') : null,
    g.goalOfTheRound ? h('p', {}, h('strong', {}, '🚀 Rundens mål: '), g.goalOfTheRound.desc) : null,
    !g.goalOfTheRound && g.defensiveAction ? h('p', {}, h('strong', {}, '🛡 Rundens defensive aktion: '), `#${g.defensiveAction.shirtNumber} ${g.defensiveAction.shortName} (${g.defensiveAction.teamName}) holdt nullet.`) : null);
}

// mc = { round, matches, gazette, viewIdx, filter, shownCount, playing }
export function renderMatchCenter({ mc, myTeamId, on }) {
  const m = mc.matches[mc.viewIdx];
  const all = m.events;
  const shown = mc.playing ? all.slice(0, mc.shownCount) : all;
  const last = shown.at(-1) || all[0];
  const isOwnSide = (side) => (side === 'home' ? m.homeId : m.awayId) === myTeamId;
  const feed = filterEvents(shown, mc.filter).slice().reverse();
  return h('div', { class: 'panel matchcenter', id: 'match-center' },
    h('div', { class: 'row' }, h('h3', {}, `📺 Match Center – runde ${mc.round}`),
      mc.playing ? h('button', { class: 'mini', id: 'skip', onclick: on.skip }, '⚡ Spring til slutfløjt') : null,
      h('button', { class: 'mini', id: 'close-mc', onclick: on.close }, '✕ Luk')),
    mc.playing ? h('div', { class: 'muted', id: 'booked-note' }, 'Runden er allerede bogført og gemt – tabellen og truppen er opdateret, også hvis du lukker siden nu.') : null,
    h('div', { class: 'cards', id: 'match-cards' }, mc.matches.map((x, i) => h('button', { class: 'matchcard' + (i === mc.viewIdx ? ' active' : ''), disabled: mc.playing && i !== 0, onclick: () => on.view(i) },
      // Under afspilning afsløres de andre kampes resultater ikke før slutfløjt.
      mc.playing ? (i === 0 ? `${x.homeName} ${last.hG}-${last.aG} ${x.awayName}` : `${x.homeName} – ${x.awayName}`) : `${x.homeName} ${x.homeGoals}-${x.awayGoals} ${x.awayName}${x.ratings.motm ? ` 👑 ${x.ratings.motm.shortName}` : ''}`))),
    h('div', { class: 'scoreboard', id: 'scoreboard' },
      h('div', {}, h('strong', {}, m.homeName), h('div', { class: 'muted' }, m.homeTacticStr)),
      h('div', { class: 'score' }, h('div', { id: 'score' }, `${last.hG} - ${last.aG}`), h('div', { class: 'muted', id: 'minute' }, mc.playing ? `${last.min}'` : 'Slut')),
      h('div', { class: 'right' }, h('strong', {}, m.awayName), h('div', { class: 'muted' }, m.awayTacticStr))),
    timeline(shown),
    last.varMsg && mc.playing ? h('div', { class: 'varbanner' }, `📺 VAR: ${last.varMsg}`) : null,
    h('div', { class: 'mc-grid' },
      h('div', {}, h('div', { class: 'toolbar' }, REPORT_FILTERS.map(([v, l]) => h('button', { class: 'mini' + (mc.filter === v ? ' active' : ''), onclick: () => on.filter(v) }, l))),
        h('div', { class: 'feed', id: 'feed' }, feed.map((e) => h('div', { class: `ev ${e.category.toLowerCase()} ${e.type.toLowerCase()}` }, h('span', { class: 'ev-min' }, `${e.min}'`), e.text)))),
      h('div', {}, statsRows(m, last.stats),
        mc.playing ? null : ratingsTable(m.ratings.home, isOwnSide('home'), `${m.homeName} – karakterer`),
        mc.playing ? null : ratingsTable(m.ratings.away, isOwnSide('away'), `${m.awayName} – karakterer`))),
    mc.playing ? null : renderGazette(mc.gazette, myTeamId));
}
