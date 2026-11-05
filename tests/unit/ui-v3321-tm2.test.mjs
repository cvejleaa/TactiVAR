// v3.32.1, Test Manager: LEDNINGEN til foldets hukommelse. Forfatterens test beviser fold() i isolation (samme id to gange); intet bevarer,
// at hver forbruger giver foldet et STABILT id – `id + Math.random()` i rounds/stats/matchcenter/replay/tactics holder suiten grøn, og
// så lukker foldet ved hver gentegning (brugeren åbner "Hele programmet", klikker, og det lukker igen).
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  querySelectorAll() { return []; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { renderSchedule } = await import('../../public/ui/rounds.js');
const { renderStats } = await import('../../public/ui/stats.js');
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');
const { renderTactics } = await import('../../public/ui/tactics.js');
const { clearReplays } = await import('../../public/ui/replay.js');
const { pairRound } = await import('../../public/engine/season.js');
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const isOpen = (d) => d.attrs.open === '' || d.open === true;
const toggle = (d) => { d.open = isOpen(d); d.children[0].listeners.click({}); d.open = !d.open; if (!d.open) delete d.attrs.open; d.listeners.toggle?.({ target: d }); };

// Tegn to gange: det, brugeren gør i det første billede (åbner/lukker foldet), skal stå i det andet
function remembers(draw, id, startsOpen = false) {
  const a = byId(draw(), id);
  assert.ok(a, `fold ${id} findes`); assert.equal(a.tag, 'details');
  assert.equal(isOpen(a), startsOpen, `${id}: start`);
  toggle(a);
  const b = byId(draw(), id);
  assert.ok(b, `fold ${id} findes igen (stabilt id)`); assert.equal(isOpen(b), !startsOpen, `${id}: husket over gentegning`);
  toggle(b);
  assert.equal(isOpen(byId(draw(), id)), startsOpen, `${id}: og tilbage`);
}

test('Liga: "Hele programmet" og "Tidligere sæsoner" husker åben/lukket over gentegning', () => {
  const L = createLeague(createRng(4)), me = L.teams.find((t) => !t.isBot);
  const t = (team) => ({ teamId: team.id, teamName: team.name, played: 14, won: 0, drawn: 0, lost: 0, goalsFor: 10, goalsAgainst: 9, points: 1 });
  L.seasons = [{ seasonNumber: 1, fromRound: 1, toRound: 14, programmed: true, statsFrom: 1, table: L.teams.map(t), champion: { teamId: L.teams[0].id, teamName: L.teams[0].name, points: 29 }, myPos: 2, topScorer: null, myBest: null }];
  L.leagueMetadata.round = 14; L.seasonStartRound = 15; L.leagueMetadata.seasonNumber = 2;
  const draw = () => renderSchedule({ league: L, pairs: pairRound(L), myTeamId: me.id });
  remembers(draw, 'full-schedule'); remembers(draw, 'past-seasons');
});

test('Statistik: hver af de fire sektioner husker sit eget valg – kun "Spillere" er åben fra start', () => {
  const L = createLeague(createRng(4)), me = L.teams.find((t) => !t.isBot);
  const draw = () => renderStats({ league: L, myTeamId: me.id });
  const ids = all(draw(), (e) => e.tag === 'details' && e.className.includes('stats-sec')).map((e) => e.attrs.id);
  assert.deepEqual(ids, ['stats-players', 'stats-teams', 'stats-flow', 'stats-mine']);
  assert.deepEqual(all(draw(), (e) => e.tag === 'details' && isOpen(e)).map((e) => e.attrs.id), ['stats-players'], 'kun Spillere er åben fra start');
  remembers(draw, 'stats-players', true);
  for (const id of ['stats-teams', 'stats-flow', 'stats-mine']) remembers(draw, id);
});

test('Kamp: "⋯ Mere", "📤 Sendte kampe" og afspilningens "ⓘ Om tavlen" husker valget, når kampcentret tegnes forfra', () => {
  const L = createLeague(createRng(3)), me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t.isBot);
  const m = simulateMatch(me, opp, createRng(103));
  const on = { snapshot() {}, view() {}, filter() {}, skip() {}, replay() {}, heat() {}, pane() {}, send() {}, copyId() {} };
  const draw = () => { clearReplays(); return renderMatchCenter({ mc: { round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false, pane: 'replay', sent: [{ id: 'K-1', label: 'x', replay: true }], canSend: false, sendWhy: 'x' }, myTeamId: me.id, on }); };
  remembers(draw, 'mc-more'); remembers(draw, 'sent-list'); remembers(draw, 'replay-help');
});

test('Taktik: de fem ⓘ husker hver sit valg over gentegning', () => {
  const L = createLeague(createRng(4)), team = L.teams[0];
  const draw = () => renderTactics({ team, isOwn: true, ui: { activePresetIndex: 0 }, on: new Proxy({}, { get: () => () => {} }) });
  for (const id of ['help-phase1_buildUp', 'help-phase2_defending', 'help-phase3_transition', 'help-rules', 'help-subs']) remembers(draw, id);
});

// ---------- brede tabeller: HVER ramme har .tablewrap (ellers ingen fade/rulning, og siden ruller sidelæns) ----------
const { renderStandings } = await import('../../public/ui/standings.js');
const parentOf = (root, el) => all(root, (e) => e.children.includes(el))[0];
const wrapOf = (root, id) => { const t = byId(root, id); assert.ok(t, `${id} findes`); const w = parentOf(root, t); assert.ok(w.className.split(' ').includes('tablewrap'), `${id} står i en .tablewrap`); return w; };

test('tabellerne står i en .tablewrap: stillingen (to varianter), holdtal, mine spillere', () => {
  const L = createLeague(createRng(4)), me = L.teams.find((t) => !t.isBot);
  wrapOf(renderStandings({ league: L, onPick: () => {}, viewTeamId: null }), 'standings');
  const L2 = createLeague(createRng(4)); L2.seasonStartRound = 15; L2.leagueMetadata.round = 14; L2.leagueMetadata.seasonNumber = 2;
  L2.seasons = [{ seasonNumber: 1, fromRound: 1, toRound: 14, programmed: true, statsFrom: 1, table: L2.teams.map((x) => ({ teamId: x.id, teamName: x.name, played: 14, won: 0, drawn: 0, lost: 0, goalsFor: 1, goalsAgainst: 1, points: 1 })), champion: { teamId: L2.teams[0].id, teamName: L2.teams[0].name, points: 29 }, myPos: 2, topScorer: null, myBest: null }];
  wrapOf(renderStandings({ league: L2, onPick: () => {}, viewTeamId: null }), 'standings');
  const st = renderStats({ league: L, myTeamId: me.id });
  wrapOf(st, 'team-stats');
});

test('Kamp under live-afspilning: referatet til venstre, statistikken til højre (rækkefølgen i .mc-grid) – og efter fløjtet står statistikken i sin egen fane', () => {
  const L = createLeague(createRng(3)), me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t.isBot);
  const m = simulateMatch(me, opp, createRng(103));
  const on = { snapshot() {}, view() {}, filter() {}, skip() {}, replay() {}, heat() {}, pane() {}, send() {}, copyId() {} };
  clearReplays();
  const live = renderMatchCenter({ mc: { round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount: 12, playing: true }, myTeamId: me.id, on });
  const grid = byId(live, 'mc-main');
  assert.equal(grid.children.length, 2);
  assert.equal(all(grid.children[0], (e) => e.attrs.id === 'feed').length, 1, 'venstre: referatet');
  assert.equal(all(grid.children[0], (e) => e.attrs.id === 'match-stats').length, 0);
  assert.equal(all(grid.children[1], (e) => e.attrs.id === 'match-stats').length, 1, 'højre: statistikken');
  assert.ok(grid.children[1].className.split(' ').includes('tablewrap'), 'statistikken i en .tablewrap (fade, hvis den skulle blive for bred)');
});
