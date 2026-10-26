// Statistik på Liga-fanen (v3.10, brugeren: "Jeg vil gerne have noget statistik med på liga siden
// af al mulig slags" – og "mål på hovedstød, straffe eller dødbolde. Antallet af frispark").
// Fire sammenfoldede sektioner nederst. Hvem ser hvad afgøres i engine/visibility.js.
import { h, dec } from './dom.js';
import { starsEl } from './labels.js';
import { viewPlayer, viewTeamStats } from '../engine/visibility.js';
import { runStats, PLAYER_SEASON_DEFAULTS, TEAM_STAT_FIELDS } from '../engine/stats.js';
import { seasonJustEnded } from '../engine/season.js';
import { GOAL_KIND_LABEL } from '../engine/gazette.js';

const TOP = 5;
// Statistikken gælder sæsonen (brugeren v3.14.1: "skal tælle for sæsonen og ikke siden en eller anden runde").
// Kun et gem, der var midt i en sæson, da statistikken kom (v3.10, sanitize.js), mangler sæsonens første runder –
// dem er der ingen spillertal for. Runden vises sæson-relativt (som "Spil runde 10 af 14").
export const statsFromK = (league) => Math.max(1, (league.statsFromRound ?? 1) - (league.seasonStartRound ?? 1) + 1);
const since = (league) => `sæson ${league.leagueMetadata.seasonNumber}${league.endedSeason ? ' – afsluttet' : ''}${statsFromK(league) > 1 ? `, fra runde ${statsFromK(league)}` : ''}`;
// Lige efter sæsonslut (v3.16.3): den afsluttede sæsons tal, til den nye sæsons runde 1 er spillet. Det er de SAMME
// visninger (viewPlayer/viewTeamStats, §3) på en kopi af ligaen, hvor tabellen er sæsonarkivets og spillernes
// sæsontal er league.lastSeasonStats. null = intet at vise (ingen sæson lige afsluttet, eller et arkiv fra før v3.16.3).
export function endedSeasonView(league) {
  const last = seasonJustEnded(league), saved = league.lastSeasonStats;
  if (!last || saved?.seasonNumber !== last.seasonNumber || !saved.players || typeof saved.players !== 'object') return null;
  if (!last.table.every((r) => TEAM_STAT_FIELDS.every((k) => Number.isFinite(r[k])))) return null;
  return { ...league, endedSeason: last,
    leagueMetadata: { ...league.leagueMetadata, seasonNumber: last.seasonNumber, standings: last.table },
    seasonStartRound: last.fromRound, statsFromRound: last.statsFrom ?? last.fromRound,
    teams: league.teams.map((t) => ({ ...t, squad: endedSquad(league, t, saved.players) })) };
}
// v3.18.0 (QC B1): truppen, som den var ved sæsonslut – fra øjebliksbilledet (hold, navn, nummer), så en spiller, der er stoppet
// eller har skiftet klub, står under det hold, han spillede for. Arkiver fra før v3.18.0 (uden t) bruger truppen nu.
function endedSquad(league, team, players) {
  const snap = Object.entries(players);
  if (!snap.some(([, v]) => v.t)) return team.squad.map((p) => ({ ...p, ...PLAYER_SEASON_DEFAULTS, ...players[p.id] }));
  const now = new Map(league.teams.flatMap((t) => t.squad.map((p) => [p.id, p])));
  return snap.filter(([, v]) => v.t === team.id).map(([id, { t, n, nr, ...stats }]) => ({ ...(now.get(id) ?? { id, publicStars: 0 }), shortName: n, shirtNumber: nr, ...PLAYER_SEASON_DEFAULTS, ...stats }));
}
// Lige efter sæsonslut uden den afsluttede sæsons tal (arkiv fra før v3.16.3) er den nye sæsons tal tomme –
// sig hvor den afsluttede sæson står (QC v3.14.3).
const endNote = (league) => { const last = seasonJustEnded(league);
  return last ? h('p', { class: 'muted', id: 'stats-season-over' }, `Sæson ${last.seasonNumber} er slut – slutstillingen står i tabellen ovenfor, og mester, topscorer og din bedste under "Tidligere sæsoner" i kampprogrammet.`) : null; };
const endedNote = (view) => h('p', { class: 'muted', id: 'stats-season-ended' }, `Sæson ${view.endedSeason.seasonNumber} – afsluttet. Tallene herunder er den afsluttede sæsons; den nye sæsons statistik starter, når dens første runde er spillet.`);
const gapNote = (league) => statsFromK(league) > 1 ? h('p', { class: 'muted', id: 'stats-gap' }, `Sæsonens runde ${statsFromK(league) === 2 ? '1' : `1–${statsFromK(league) - 1}`} blev spillet, før statistikken fandtes, og kan ikke tælles med. Fra næste sæson tæller hele sæsonen.`) : null;
// Hvilke sektioner er foldet ud – huskes mellem gen-tegninger (ellers lukkede de ved hvert klik).
const openSecs = new Set(['stats-players']);
const section = (id, title, ...body) => h('details', { class: 'stats-sec', id, open: openSecs.has(id),
  ontoggle: (e) => { if (e.target.open) openSecs.add(id); else openSecs.delete(id); } }, h('summary', {}, title), ...body);

// Holdnavnet uden "FC"/"IF"/"BK" o.l., så en række ikke brydes ("FC Vejleå" → "Vejleå").
const SHORT_DROP = new Set(['FC', 'IF', 'BK', 'United', 'Boldklub', 'Rovers', 'Tacticians']);
export const shortTeam = (name) => name.split(' ').filter((w) => !SHORT_DROP.has(w)).join(' ') || name;

// Én liste = én lille tabel: placering · #nr Navn · hold · værdi (højrestillet).
function listTable(title, key, rows, value, myTeamId) {
  return h('div', { class: 'stat-list', dataset: { key } }, h('h4', {}, title),
    rows.length ? h('table', { class: 'stat-table' }, h('tbody', {}, rows.map(({ v, team }, i) => h('tr', { class: team.id === myTeamId ? 'mine' : '' },
      h('td', { class: 'st-rank' }, `${i + 1}.`),
      h('td', { class: 'st-name', title: `#${v.shirtNumber} ${v.shortName}` }, `#${v.shirtNumber} ${v.shortName}`),
      h('td', { class: 'st-team', title: team.name }, shortTeam(team.name)),
      h('td', { class: 'st-val' }, value(v))))))
      : h('p', { class: 'muted' }, 'Ingen endnu.'));
}

function playerLists(league, myTeamId) {
  // Hver spiller set med seerens rettigheder: private felter er helt fraværende.
  const all = league.teams.flatMap((t) => t.squad.map((p) => ({ v: viewPlayer(p, t.id === myTeamId), team: t })));
  const top = (key) => all.filter(({ v }) => (v[key] ?? 0) > 0).sort((a, b) => b.v[key] - a.v[key] || b.v.sGames - a.v.sGames).slice(0, TOP);
  const list = (title, key) => listTable(title, key, top(key), (v) => String(v[key]), myTeamId);
  // "Bedste vurdering": offentlige stjerner for alle (eksakte karakterer ville røbe andre hold).
  const starRows = all.filter(({ v }) => v.publicStars > 0 && (v.sGames ?? 0) > 0).sort((a, b) => b.v.publicStars - a.v.publicStars || b.v.sGames - a.v.sGames).slice(0, TOP);
  return h('div', { class: 'stat-grid' },
    list('⚽ Topscorere', 'sGoals'), list('🅰 Flest oplæg', 'sAssists'), list('👑 Kampens spiller', 'sMotm'),
    list('🗣 Hovedstødsmål', 'sHeaderGoals'), list('🎯 Straffemål', 'sPenaltyGoals'), list('🧱 Dødboldmål', 'sSetPieceGoals'),
    list('🧤 Clean sheets', 'sCleanSheets'), list('🟨 Gule kort', 'sYellow'), list('🟥 Røde kort', 'sRed'),
    listTable('⭐ Bedste vurdering (alle kampe)', 'publicStars', starRows, (v) => starsEl(v.publicStars), myTeamId));
}

function teamTable(league, myTeamId) {
  const rows = league.leagueMetadata.standings.map((s) => viewTeamStats(s, s.teamId === myTeamId));
  const per = (r, k) => (r.sMatches ? (r[k] / r.sMatches) : 0);
  return h('div', { class: 'tablewrap-x' }, h('table', { class: 'standings', id: 'team-stats' },
    h('thead', {}, h('tr', {}, ['Hold', 'Bold %', 'Frispark begået', 'Frispark tilkendt', '🟨', '🟥', 'Straffe for (scoret)', 'Dødboldmål', 'Hovedstødsmål', 'Clean sheets'].map((x) => h('th', {}, x)))),
    h('tbody', {}, rows.map((r) => h('tr', { class: r.teamId === myTeamId ? 'mine' : '' },
      h('td', {}, r.teamName), h('td', {}, r.sMatches ? Math.round(per(r, 'possSum')) : '–'), h('td', {}, r.fouls), h('td', {}, r.foulsWon), h('td', {}, r.yellows), h('td', {}, r.reds ?? 0),
      h('td', {}, `${r.penalties} (${r.penaltyGoals})`), h('td', {}, r.setPieceGoals), h('td', {}, r.headerGoals), h('td', {}, r.cleanSheets))))));
}

function leagueFlow(league) {
  // Kun indeværende sæson (v3.11); afsluttede sæsoner står under Tidligere sæsoner.
  const hist = (league.history || []).filter((r) => r.round >= (league.seasonStartRound ?? 1));
  if (!hist.length) return h('p', { class: 'muted' }, 'Kommer efter sæsonens første runde.');
  const max = Math.max(1, ...hist.map((r) => r.goals));
  const kinds = {};
  for (const r of hist) for (const [k, v] of Object.entries(r.kinds || {})) kinds[k] = (kinds[k] ?? 0) + v;
  const goals = hist.reduce((a, r) => a + r.goals, 0), matches = hist.reduce((a, r) => a + r.matches, 0), sp = hist.reduce((a, r) => a + r.setPiece, 0);
  const biggest = hist.map((r) => r.biggest).filter(Boolean).sort((a, b) => b.diff - a.diff)[0];
  const most = hist.map((r) => r.most).filter(Boolean).sort((a, b) => b.goals - a.goals)[0];
  return h('div', {},
    h('p', { id: 'flow-summary' }, `${goals} mål i ${matches} kampe (${dec((goals / Math.max(1, matches)), 2)} pr. kamp) · ${goals ? Math.round(sp / goals * 100) : 0} % på dødbolde.`),
    h('div', { class: 'round-bars', id: 'round-bars' }, hist.map((r, _, __, k = r.round - (league.seasonStartRound ?? 1) + 1) => h('div', { class: 'round-bar', title: `Runde ${k}: ${r.goals} mål` },
      h('span', { class: 'rb-label' }, `R${k}`), h('span', { class: 'rb-fill', style: { width: `${Math.round(r.goals / max * 100)}%` } }), h('span', { class: 'rb-val' }, String(r.goals))))),
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
      ? `${since(league)[0].toUpperCase()}${since(league).slice(1)}, pr. kamp: ${dec((s.shots / n), 1)} afslutninger (${dec((s.onTarget / n), 1)} på mål), xG ${dec((s.xg / n), 2)}, ${dec((s.corners / n), 1)} hjørnespark, ${dec((s.freeKicks / n), 1)} frispark i skudafstand. I alt: kontramål ${s.counterGoals} for / ${s.counterGoalsAgainst} imod, ${s.varChecks} VAR-tjek.`
      : 'Kommer efter første runde.'),
    h('div', { class: 'tablewrap-x' }, h('table', { class: 'standings', id: 'my-players' },
      h('thead', {}, h('tr', {}, ['Spiller', `Kampe (${statsFromK(league) > 1 ? `fra R${statsFromK(league)}` : 'sæson'})`, 'Snit (i alt)', 'km/90 (i alt)', '% HI (i alt)', `Fri (${statsFromK(league) > 1 ? `fra R${statsFromK(league)}` : 'sæson'})`, 'Friskhed'].map((x) => h('th', {}, x)))),
      h('tbody', {}, team.squad.map((p) => { const r = runStats(p); return h('tr', {},
        h('td', {}, `#${p.shirtNumber} ${p.shortName}`), h('td', {}, p.sGames), h('td', {}, p.ratingGames ? dec((p.ratingSum / p.ratingGames), 1) : '–'),
        h('td', {}, r.km90 != null ? dec(r.km90, 1) : '–'), h('td', {}, r.hiPct != null ? `${r.hiPct} %` : '–'),
        h('td', {}, p.freeRunsSum ? `${p.freeRunsWonSum}/${p.freeRunsSum}` : '–'), h('td', {}, `${p.freshness} %`)); })))),
    h('p', { class: 'muted' }, `Kun du ser disse tal – de røber evner og dine taktiske valg. Kampe og frie løb tælles for ${since(league)}; snit, km og HI gælder alle hans kampe (de nulstilles ikke ved sæsonskifte).`));
}

export function renderStats({ league, myTeamId }) {
  let view = null, failed = null;
  try { view = endedSeasonView(league); if (view) return statsPanel(view, myTeamId, endedNote(view)); }
  catch (e) { failed = e; console.warn('Den afsluttede sæsons statistik kunne ikke vises', e); }
  // Ingen afsluttet sæson at vise – eller den kunne ikke vises: den nye sæsons tal (et gammelt arkiv vælter ikke fanen).
  return statsPanel(league, myTeamId, failed ? h('p', { class: 'muted', id: 'stats-season-failed' }, `Den afsluttede sæsons tal kunne ikke vises (${failed.message}).`) : null, endNote(league));
}

function statsPanel(league, myTeamId, ...notes) {
  return h('div', { class: 'panel stats', id: 'stats' }, h('h3', {}, '📊 Statistik'),
    section('stats-players', `Spillere (${since(league)})`, gapNote(league), ...notes, playerLists(league, myTeamId)),
    section('stats-teams', `Holdtal (${since(league)})`, teamTable(league, myTeamId), h('p', { class: 'muted' }, 'Bold % er snit pr. kamp. Afslutninger, xG, hjørnespark, kontraer og VAR-tjek ses kun for dit eget hold (under "Dit hold") – summeret over sæsonen kunne de røbe et holds taktik.')),
    section('stats-flow', `Ligaens forløb (${since(league)})`, leagueFlow(league)),
    section('stats-mine', `Dit hold (privat, ${since(league)})`, myTeam(league, myTeamId)));
}
