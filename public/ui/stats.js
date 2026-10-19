// Statistik på Liga-fanen (v3.10, brugeren: "Jeg vil gerne have noget statistik med på liga siden
// af al mulig slags" – og "mål på hovedstød, straffe eller dødbolde. Antallet af frispark").
// Fire sammenfoldede sektioner nederst. Hvem ser hvad afgøres i engine/visibility.js.
import { h } from './dom.js';
import { starsEl } from './labels.js';
import { viewPlayer, viewTeamStats } from '../engine/visibility.js';
import { runStats } from '../engine/stats.js';
import { GOAL_KIND_LABEL } from '../engine/gazette.js';

const TOP = 5;
const since = (league) => `fra runde ${league.statsFromRound ?? 1}`;
// Hvilke sektioner er foldet ud – huskes mellem gen-tegninger (ellers lukkede de ved hvert klik).
const openSecs = new Set(['stats-players']);
const section = (id, title, ...body) => h('details', { class: 'stats-sec', id, open: openSecs.has(id),
  ontoggle: (e) => { if (e.target.open) openSecs.add(id); else openSecs.delete(id); } }, h('summary', {}, title), ...body);

function playerLists(league, myTeamId) {
  // Hver spiller set med seerens rettigheder: private felter er helt fraværende.
  const all = league.teams.flatMap((t) => t.squad.map((p) => ({ v: viewPlayer(p, t.id === myTeamId), team: t })));
  const list = (title, key, unit = '') => {
    const rows = all.filter(({ v }) => (v[key] ?? 0) > 0).sort((a, b) => b.v[key] - a.v[key] || b.v.sGames - a.v.sGames).slice(0, TOP);
    return h('div', { class: 'stat-list', dataset: { key } }, h('h4', {}, title),
      rows.length ? h('ol', {}, rows.map(({ v, team }) => h('li', { class: team.id === myTeamId ? 'mine' : '' },
        h('span', {}, `#${v.shirtNumber} ${v.shortName}`), h('span', { class: 'muted' }, ` ${team.name}`), h('strong', {}, ` ${v[key]}${unit}`))))
        : h('p', { class: 'muted' }, 'Ingen endnu.'));
  };
  // "Bedste snit": offentlige stjerner for alle (eksakte karakterer ville røbe andre hold).
  const starRows = all.filter(({ v }) => v.publicStars > 0 && (v.sGames ?? 0) > 0).sort((a, b) => b.v.publicStars - a.v.publicStars || b.v.sGames - a.v.sGames).slice(0, TOP);
  return h('div', { class: 'stat-grid' },
    list('⚽ Topscorere', 'sGoals'), list('🅰 Flest oplæg', 'sAssists'), list('👑 Kampens spiller', 'sMotm'),
    list('🗣 Hovedstødsmål', 'sHeaderGoals'), list('🎯 Straffemål', 'sPenaltyGoals'), list('🧱 Dødboldmål', 'sSetPieceGoals'),
    list('🧤 Clean sheets', 'sCleanSheets'), list('🟨 Gule kort', 'sYellow'),
    h('div', { class: 'stat-list', dataset: { key: 'publicStars' } }, h('h4', {}, '⭐ Bedste vurdering (hele sæsonen)'),
      starRows.length ? h('ol', {}, starRows.map(({ v, team }) => h('li', { class: team.id === myTeamId ? 'mine' : '' }, h('span', {}, `#${v.shirtNumber} ${v.shortName}`), h('span', { class: 'muted' }, ` ${team.name} `), starsEl(v.publicStars))))
        : h('p', { class: 'muted' }, 'Ingen endnu.')));
}

function teamTable(league, myTeamId) {
  const rows = league.leagueMetadata.standings.map((s) => viewTeamStats(s, s.teamId === myTeamId));
  const per = (r, k) => (r.sMatches ? (r[k] / r.sMatches) : 0);
  return h('div', { class: 'tablewrap-x' }, h('table', { class: 'standings', id: 'team-stats' },
    h('thead', {}, h('tr', {}, ['Hold', 'Bold %', 'Frispark begået', 'Frispark tilkendt', '🟨', 'Straffe for (scoret)', 'Dødboldmål', 'Hovedstødsmål', 'Clean sheets'].map((x) => h('th', {}, x)))),
    h('tbody', {}, rows.map((r) => h('tr', { class: r.teamId === myTeamId ? 'mine' : '' },
      h('td', {}, r.teamName), h('td', {}, r.sMatches ? Math.round(per(r, 'possSum')) : '–'), h('td', {}, r.fouls), h('td', {}, r.foulsWon), h('td', {}, r.yellows),
      h('td', {}, `${r.penalties} (${r.penaltyGoals})`), h('td', {}, r.setPieceGoals), h('td', {}, r.headerGoals), h('td', {}, r.cleanSheets))))));
}

function leagueFlow(league) {
  const hist = league.history || [];
  if (!hist.length) return h('p', { class: 'muted' }, 'Kommer efter første runde.');
  const max = Math.max(1, ...hist.map((r) => r.goals));
  const kinds = {};
  for (const r of hist) for (const [k, v] of Object.entries(r.kinds || {})) kinds[k] = (kinds[k] ?? 0) + v;
  const goals = hist.reduce((a, r) => a + r.goals, 0), matches = hist.reduce((a, r) => a + r.matches, 0), sp = hist.reduce((a, r) => a + r.setPiece, 0);
  const biggest = hist.map((r) => r.biggest).filter(Boolean).sort((a, b) => b.diff - a.diff)[0];
  const most = hist.map((r) => r.most).filter(Boolean).sort((a, b) => b.goals - a.goals)[0];
  return h('div', {},
    h('p', { id: 'flow-summary' }, `${goals} mål i ${matches} kampe (${(goals / Math.max(1, matches)).toFixed(2)} pr. kamp) · ${goals ? Math.round(sp / goals * 100) : 0} % på dødbolde.`),
    h('div', { class: 'round-bars', id: 'round-bars' }, hist.map((r) => h('div', { class: 'round-bar', title: `Runde ${r.round}: ${r.goals} mål` },
      h('span', { class: 'rb-label' }, `R${r.round}`), h('span', { class: 'rb-fill', style: { width: `${Math.round(r.goals / max * 100)}%` } }), h('span', { class: 'rb-val' }, String(r.goals))))),
    h('h4', {}, 'Måltyper'),
    h('ul', { id: 'goal-kinds' }, Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => h('li', {}, `${k === 'HEADER' ? 'Hovedstød (åbent spil)' : GOAL_KIND_LABEL[k] ?? k}: ${v} (${Math.round(v / Math.max(1, goals) * 100)} %)`))),
    biggest ? h('p', {}, `Største sejr: ${biggest.label}`) : null,
    most ? h('p', {}, `Målrigeste kamp: ${most.label}`) : null);
}

function myTeam(league, myTeamId) {
  const team = league.teams.find((t) => t.id === myTeamId);
  const s = viewTeamStats(league.leagueMetadata.standings.find((r) => r.teamId === myTeamId), true);
  const n = Math.max(1, s.sMatches);
  return h('div', {},
    h('p', { id: 'my-team-stats' }, s.sMatches
      ? `Fra runde ${league.statsFromRound ?? 1}, pr. kamp: ${(s.shots / n).toFixed(1)} afslutninger (${(s.onTarget / n).toFixed(1)} på mål), xG ${(s.xg / n).toFixed(2)}, ${(s.corners / n).toFixed(1)} hjørnespark, ${(s.freeKicks / n).toFixed(1)} frispark i skudafstand. I alt: kontramål ${s.counterGoals} for / ${s.counterGoalsAgainst} imod, ${s.varChecks} VAR-tjek.`
      : 'Kommer efter første runde.'),
    h('div', { class: 'tablewrap-x' }, h('table', { class: 'standings', id: 'my-players' },
      h('thead', {}, h('tr', {}, ['Spiller', `Kampe (fra R${league.statsFromRound ?? 1})`, 'Snit (sæson)', 'km/90 (sæson)', '% HI (sæson)', `Fri (fra R${league.statsFromRound ?? 1})`, 'Friskhed'].map((x) => h('th', {}, x)))),
      h('tbody', {}, team.squad.map((p) => { const r = runStats(p); return h('tr', {},
        h('td', {}, `#${p.shirtNumber} ${p.shortName}`), h('td', {}, p.sGames), h('td', {}, p.ratingGames ? (p.ratingSum / p.ratingGames).toFixed(1) : '–'),
        h('td', {}, r.km90 != null ? r.km90.toFixed(1) : '–'), h('td', {}, r.hiPct != null ? `${r.hiPct} %` : '–'),
        h('td', {}, p.freeRunsSum ? `${p.freeRunsWonSum}/${p.freeRunsSum}` : '–'), h('td', {}, `${p.freshness} %`)); })))),
    h('p', { class: 'muted' }, `Kun du ser disse tal – de røber evner og dine taktiske valg. Kampe og frie løb tælles fra runde ${league.statsFromRound ?? 1}; snit, km og HI gælder hele sæsonen.`));
}

export function renderStats({ league, myTeamId }) {
  return h('div', { class: 'panel stats', id: 'stats' }, h('h3', {}, '📊 Statistik'),
    section('stats-players', `Spillere (${since(league)})`, playerLists(league, myTeamId)),
    section('stats-teams', `Holdtal (${since(league)})`, teamTable(league, myTeamId), h('p', { class: 'muted' }, 'Bold % er snit pr. kamp. Afslutninger, xG, hjørnespark, kontraer og VAR-tjek ses kun for dit eget hold (under "Dit hold") – summeret over sæsonen kunne de røbe et holds taktik.')),
    section('stats-flow', `Ligaens forløb (${since(league)})`, leagueFlow(league)),
    section('stats-mine', `Dit hold (privat, ${since(league)})`, myTeam(league, myTeamId)));
}
