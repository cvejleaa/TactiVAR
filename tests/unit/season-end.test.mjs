// v3.16.3 – sæsonslut og mester. (1) Mesterteksten siger, hvad der afgjorde det (sortStandings: point → målforskel →
// scorede mål), ens alle steder den står: avisen (begge udgaver), slutstillingen og Tidligere sæsoner. (2) Lige efter
// sæsonslut viser Liga-statistikken den afsluttede sæsons tal (mærket "afsluttet"), til den nye sæsons runde 1 er
// spillet – og slutstillingen har VAR ±. (3) Et gem fra v3.16.2 (tests/fixtures/save-v3.16.2.json, lavet med den
// uændrede kode: ny liga + 14 runder) har ingen af de nye felter: point-teksten, "–" i VAR ± og den gamle note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.on ||= {})[t] = f; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { playRound, commitRound, pairRound, championText } = await import('../../public/engine/season.js');
const { TEAM_STAT_FIELDS } = await import('../../public/engine/stats.js');
const { parseSave } = await import('../../public/state/storage.js');
const { renderStandings } = await import('../../public/ui/standings.js');
const { renderStats } = await import('../../public/ui/stats.js');
const { renderSchedule } = await import('../../public/ui/rounds.js');
const { renderGazette } = await import('../../public/ui/matchcenter.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const FIXTURE = fs.readFileSync(new URL('../fixtures/save-v3.16.2.json', import.meta.url), 'utf8');
const varCol = (el) => all(byId(el, 'standings'), (e) => e.tag === 'tr').slice(1).map((tr) => tr.children[7].textContent);
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const statList = (el, key) => all(el, (e) => e.dataset?.key === key)[0];
const listRows = (el, key) => all(statList(el, key), (e) => e.tag === 'tr').map((tr) => [tr.children[1].textContent, tr.children[3].textContent]);
const sectionTitle = (el, id) => all(byId(el, id), (e) => e.tag === 'summary')[0].textContent;

// En hel sæson med den nye kode. before = tabelrækkerne lige før sæsonslut (endSeason erstatter tabellen med en ny).
function fullSeason(seed) {
  const rng = createRng(seed), L = createLeague(rng);
  for (let r = 0; r < L.schedule.length - 1; r++) commitRound(L, playRound(L, rng), rng);
  const before = L.leagueMetadata.standings, players = L.teams.flatMap((t) => t.squad);
  const res = playRound(L, rng);
  commitRound(L, res, rng);
  return { L, rng, before, res, players };
}

// ---------- mesterteksten ----------
const row = (teamName, points, goalDiff, goalsFor) => ({ teamName, points, goalDiff, goalsFor });
const champ = (c, r) => ({ teamId: 'x', ...c, runnerUp: r });
const POINTS = champ(row('Alfa', 32, 5, 20), row('Beta', 29, 9, 30));
const GD = champ(row('Alfa', 29, 11, 21), row('Beta', 29, 8, 29));
const GF = champ(row('Alfa', 29, 8, 30), row('Beta', 29, 8, 22));
const OLD = { teamId: 'x', teamName: 'Alfa', points: 29 };   // arkiv fra før v3.16.3: ingen målforskel, ingen nr. 2

test('mesterteksten siger, hvad der afgjorde det: point, målforskel ("I" kun når du er nr. 2), scorede mål – gammelt arkiv: point', () => {
  assert.equal(championText(POINTS), 'Alfa er mester med 32 point');
  assert.equal(championText(POINTS, 2), 'Alfa er mester med 32 point', 'flere point: ingen "begge", selv når du er nr. 2');
  assert.equal(championText(GD, 2), 'Alfa er mester på målforskel – I endte begge på 29 point');
  assert.equal(championText(GD, 3), 'Alfa er mester på målforskel – Alfa og Beta endte begge på 29 point');
  assert.equal(championText(GD, 1), 'Alfa er mester på målforskel – Alfa og Beta endte begge på 29 point', 'du er mester: ikke "I"');
  assert.equal(championText(GD), 'Alfa er mester på målforskel – Alfa og Beta endte begge på 29 point');
  assert.equal(championText(GF, 2), 'Alfa er mester på flest scorede mål – I endte begge på 29 point og målforskel +8');
  assert.equal(championText(GF, 5), 'Alfa er mester på flest scorede mål – Alfa og Beta endte begge på 29 point og målforskel +8');
  assert.equal(championText(champ(row('Alfa', 29, -2, 22), row('Beta', 29, -2, 22)), 4), 'Alfa er mester – Alfa og Beta endte begge på 29 point, målforskel -2 og 22 scorede mål');
  // Gammelt arkiv – også med en nr. 2 på samme point, men uden målforskel – giver point-teksten
  assert.equal(championText(OLD, 2), 'Alfa er mester med 29 point');
  assert.equal(championText({ ...OLD, runnerUp: { teamName: 'Beta', points: 29 } }, 2), 'Alfa er mester med 29 point');
});

test('endSeason gemmer mesterens målforskel og scorede mål og nr. 2 – med en rigtig sæson, hvor det kan ses i tabellen', () => {
  const { L } = fullSeason(5), s = L.seasons[0], [a, b] = s.table;
  assert.ok(a.goalsFor > 0 && b.points > 0, 'data');
  assert.deepEqual(s.champion, { teamId: a.teamId, teamName: a.teamName, points: a.points, goalDiff: a.goalsFor - a.goalsAgainst, goalsFor: a.goalsFor,
    runnerUp: { teamName: b.teamName, points: b.points, goalDiff: b.goalsFor - b.goalsAgainst, goalsFor: b.goalsFor } });
});

test('mesterteksten står ens alle steder: avisen (klassisk og klumme), slutstillingen og Tidligere sæsoner – også for et gammelt arkiv', () => {
  for (const [c, myPos, text] of [[GD, 2, 'Alfa er mester på målforskel – I endte begge på 29 point'], [GF, 4, 'Alfa er mester på flest scorede mål – Alfa og Beta endte begge på 29 point og målforskel +8'], [OLD, 2, 'Alfa er mester med 29 point']]) {
    const end = { seasonNumber: 1, champion: c, myPos, topScorer: null };
    const g = { totalGoals: 3, totalVarChecks: 1, myResult: '', seasonEnd: end };
    assert.equal(byId(renderGazette(g, 'me'), 'season-end').textContent, `🏆 Sæson 1 er slut: ${text}. Du sluttede nr. ${myPos}. En ny sæson starter med nulstillet tabel – se Tidligere sæsoner på Liga-fanen.`);
    assert.equal(byId(renderGazette(g, 'me', null, [{}, {}, {}, {}], { title: 'T', sections: [] }), 'season-end').textContent, `🏆 Sæson 1 er slut: ${text}. Du sluttede nr. ${myPos}. En ny sæson starter med nulstillet tabel – se Tidligere sæsoner på Liga-fanen.`);
    // Slutstillingen og kampprogrammet på en liga lige efter sæsonslut
    const L = createLeague(createRng(4)), me = L.teams.find((t) => !t.isBot);
    const t = (team, points) => ({ teamId: team.id, teamName: team.name, played: 14, won: 0, drawn: 0, lost: 0, goalsFor: 10, goalsAgainst: 9, points });
    L.seasons = [{ seasonNumber: 1, fromRound: 1, toRound: 14, programmed: true, statsFrom: 1, table: L.teams.map((x) => t(x, 1)), champion: c, myPos, topScorer: null, myBest: null }];
    L.leagueMetadata.round = 14; L.seasonStartRound = 15; L.leagueMetadata.seasonNumber = 2;
    assert.equal(byId(renderStandings({ league: L, onPick: () => {}, viewTeamId: null }), 'standings-champion').textContent, `🏆 ${text}. Sæson 2 starter med næste runde.`);
    const past = byId(renderSchedule({ league: L, pairs: pairRound(L), myTeamId: me.id }), 'past-seasons');
    assert.equal(all(past, (e) => e.tag === 'p')[0].textContent, `🏆 ${text}. Din placering: nr. ${myPos}.`);
  }
});

// ---------- gem fra v3.16.2 ----------
test('gem fra v3.16.2 efter en hel sæson: indlæses uden migrering; slutstillingen har "–" i VAR ± og point-teksten, statistikken den gamle note', () => {
  const raw = JSON.parse(FIXTURE);
  assert.equal(raw.ui.seenVersion, '3.16.2'); assert.equal(raw.schemaVersion, 6);
  assert.ok(!('varNet' in raw.league.seasons[0].table[0]) && !('runnerUp' in raw.league.seasons[0].champion) && !('lastSeasonStats' in raw.league), 'gemt før v3.16.3');
  assert.ok(raw.league.lastRound.matches.every((m) => m.trace), 'seneste runde har trace');
  const r = parseSave(FIXTURE);
  assert.ok(r.ok, r.error); assert.equal(r.migratedFrom, 6);   // v3.18.0: kun livsløbs-migreringen (additiv)
  const L = r.state.league, last = L.seasons[0], me = L.teams.find((t) => !t.isBot);
  assert.equal(L.leagueMetadata.round, 14); assert.equal(L.seasonStartRound, 15);
  const el = renderStandings({ league: L, onPick: () => {}, viewTeamId: null });
  assert.match(byId(el, 'standings-title').textContent, /slutstilling, sæson 1$/);
  assert.deepEqual(varCol(el), last.table.map(() => '–'));
  assert.equal(byId(el, 'standings-champion').textContent, `🏆 ${last.champion.teamName} er mester med ${last.champion.points} point. Sæson 2 starter med næste runde.`);
  const past = byId(renderSchedule({ league: L, pairs: pairRound(L), myTeamId: me.id }), 'past-seasons');
  assert.match(all(past, (e) => e.tag === 'p')[0].textContent, new RegExp(`^🏆 ${last.champion.teamName} er mester med ${last.champion.points} point\\.`));
  // Statistikken: den nye sæsons (tomme) tal med den gamle note – fanen vælter ikke
  const st = renderStats({ league: L, myTeamId: me.id });
  assert.match(byId(st, 'stats-season-over').textContent, /^Sæson 1 er slut/);
  assert.equal(byId(st, 'stats-season-ended'), undefined);
  assert.equal(sectionTitle(st, 'stats-players'), 'Spillere (sæson 2)');
  assert.deepEqual(listRows(st, 'sGoals'), []);
  // … og der kan spilles videre: næste sæsonslut har de nye felter
  const rng = createRng(2);
  for (let i = 0; i < 14; i++) commitRound(L, playRound(L, rng), rng);
  assert.equal(L.seasons.length, 2);
  assert.ok(Number.isFinite(L.seasons[1].table[0].varNet) && L.seasons[1].champion.runnerUp, 'sæson 2 har de nye felter');
  assert.equal(L.lastSeasonStats.seasonNumber, 2);
  assert.ok(!varCol(renderStandings({ league: L, onPick: () => {}, viewTeamId: null })).includes('–'));
});

// ---------- ny liga: sæsonslut med tal ----------
test('sæsonslut: slutstillingen har hvert holds VAR ± (med fortegn), samme tal som tabellen havde – summen er 0', () => {
  const { L, before } = fullSeason(5), last = L.seasons[0];
  const el = renderStandings({ league: L, onPick: () => {}, viewTeamId: null });
  const exp = last.table.map((r) => signed(before.find((b) => b.teamId === r.teamId).varNet));
  assert.deepEqual(varCol(el), exp);
  assert.ok(exp.some((x) => x !== '0'), `data: nogen har VAR-netto ≠ 0 (${exp})`);
  // Den løbende tabel (samme helper): efter et par runder i sæson 2 står hvert holds VAR ± med fortegn
  const rng = createRng(77);
  for (let i = 0; i < 4; i++) commitRound(L, playRound(L, rng), rng);
  const live = renderStandings({ league: L, onPick: () => {}, viewTeamId: null });
  const names = all(byId(live, 'standings'), (e) => e.tag === 'tr').slice(1).map((tr) => tr.children[1].textContent);
  const liveExp = names.map((n) => signed(L.leagueMetadata.standings.find((r) => r.teamName === n).varNet));
  assert.deepEqual(varCol(live), liveExp);
  assert.ok(liveExp.some((x) => x !== '0'), `data: VAR-netto ≠ 0 i sæson 2 (${liveExp})`);
  assert.equal(last.table.reduce((a, r) => a + r.varNet, 0), 0, 'VAR ± går i nul over ligaen');
  for (const k of TEAM_STAT_FIELDS) for (const r of last.table) assert.equal(r[k], before.find((b) => b.teamId === r.teamId)[k], `${k} for ${r.teamName}`);
});

test('Liga-statistikken lige efter sæsonslut viser den afsluttede sæsons tal ("afsluttet") – og den nye sæsons efter dens runde 1', () => {
  const { L, rng } = fullSeason(5), last = L.seasons[0], me = L.teams.find((t) => !t.isBot);
  const st = renderStats({ league: L, myTeamId: me.id });
  assert.equal(sectionTitle(st, 'stats-players'), 'Spillere (sæson 1 – afsluttet)');
  assert.equal(sectionTitle(st, 'stats-teams'), 'Holdtal (sæson 1 – afsluttet)');
  assert.match(byId(st, 'stats-season-ended').textContent, /^Sæson 1 – afsluttet\./);
  assert.equal(byId(st, 'stats-season-over'), undefined);
  // Topscorerne: sæsonens topscorer (fra arkivet) står øverst med sine mål
  const top = listRows(st, 'sGoals');
  assert.ok(top.length >= 3, `topscorere: ${JSON.stringify(top)}`);
  assert.equal(top[0][1], String(last.topScorer.goals));
  assert.ok(top.some(([n]) => n === `#${last.topScorer.shirtNumber} ${last.topScorer.shortName}`), 'topscoreren er med');
  // Spillerne selv er nulstillet til den nye sæson – tallene kommer fra lastSeasonStats
  assert.ok(L.teams.every((t) => t.squad.every((p) => p.sGoals === 0)));
  const saved = Object.values(L.lastSeasonStats.players);
  assert.ok(saved.reduce((a, p) => a + (p.sGoals ?? 0), 0) > 20, 'data: sæsonens mål er gemt');
  // Holdtallene: dit holds frispark begået = arkivets
  const myRow = all(byId(st, 'team-stats'), (e) => e.tag === 'tr').find((tr) => tr.children[0].textContent === me.name);
  assert.equal(myRow.children[2].textContent, String(last.table.find((r) => r.teamId === me.id).fouls));
  assert.ok(last.table.find((r) => r.teamId === me.id).fouls > 0, 'data: frispark begået');
  // Næste runde (sæson 2, runde 1): den nye sæsons tal – ingen "afsluttet"
  commitRound(L, playRound(L, rng), rng);
  const st2 = renderStats({ league: L, myTeamId: me.id });
  assert.equal(sectionTitle(st2, 'stats-players'), 'Spillere (sæson 2)');
  assert.equal(byId(st2, 'stats-season-ended'), undefined);
  const top2 = listRows(st2, 'sGoals');
  assert.ok(top2.every(([, v]) => Number(v) <= 4), `én runde: højst få mål pr. spiller (${JSON.stringify(top2)})`);
  assert.notDeepEqual(top2, top);
});

test('kun den seneste sæson har de fulde tal: efter to sæsoner er sæson 1 skåret ned til tabellens faste felter', () => {
  const { L, rng } = fullSeason(9);
  for (let r = 0; r < L.schedule.length; r++) commitRound(L, playRound(L, rng), rng);
  const [s1, s2] = L.seasons;
  assert.deepEqual(Object.keys(s1.table[0]).sort(), ['drawn', 'goalsAgainst', 'goalsFor', 'lost', 'played', 'points', 'teamId', 'teamName', 'won']);
  assert.ok(s1.table.every((r) => !('varNet' in r) && !('shots' in r)));
  assert.ok(s2.table.every((r) => Number.isFinite(r.varNet) && TEAM_STAT_FIELDS.every((k) => Number.isFinite(r[k]))));
  assert.equal(L.lastSeasonStats.seasonNumber, 2);
  // Sæson 1's mester-felter er små og bliver (teksten)
  assert.ok(s1.champion.runnerUp && Number.isFinite(s1.champion.goalDiff));
});

test('et ødelagt sæsonarkiv vælter ikke Liga-statistikken: den nye sæsons tal, den gamle note og en synlig besked', () => {
  const { L } = fullSeason(5), me = L.teams.find((t) => !t.isBot);
  Object.defineProperty(L.lastSeasonStats, 'players', { get() { throw new Error('ødelagt'); } });
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try {
    const st = renderStats({ league: L, myTeamId: me.id });
    assert.equal(byId(st, 'stats-season-failed').textContent, 'Den afsluttede sæsons tal kunne ikke vises (ødelagt).');
    assert.match(byId(st, 'stats-season-over').textContent, /^Sæson 1 er slut/);
    assert.equal(sectionTitle(st, 'stats-players'), 'Spillere (sæson 2)');
    assert.equal(warned, 1);
  } finally { console.warn = warn; }
  // Et arkiv for en anden sæson end den lige afsluttede (fx efter en migrering) bruges ikke
  const { L: L2 } = fullSeason(6), me2 = L2.teams.find((t) => !t.isBot);
  L2.lastSeasonStats.seasonNumber = 7;
  assert.equal(sectionTitle(renderStats({ league: L2, myTeamId: me2.id }), 'stats-players'), 'Spillere (sæson 2)');
});
