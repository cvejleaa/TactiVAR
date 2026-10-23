// Test Manager v3.14.1: huller fundet ved mutation af sæson-relativ statistik (ui/stats.js) og "sæsonens runde" (ui/rounds.js).
// Forfatterens tests kører kun med seasonStartRound = 1 (eller udeladt), hvor global runde = sæsonens runde – så
// enhver mutation, der blander de to sammen (?? 0, global runde i kolonneoverskrifter, s.statsFrom uden fromRound), overlevede.
// Her: sæson 2, der startede i global runde 15 – runde 18 er sæsonens runde 4.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  get id() { return this.attrs.id; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { pairRound } = await import('../../public/engine/season.js');
const { renderStats, statsFromK } = await import('../../public/ui/stats.js');
const { renderSchedule } = await import('../../public/ui/rounds.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];

// En liga i sæson 2, der startede i global runde 15; statistikken tæller fra global runde `from`
function season2(from) {
  const L = createLeague(createRng(8)), me = L.teams[0];
  Object.assign(L, { seasonStartRound: 15, statsFromRound: from }); L.leagueMetadata.seasonNumber = 2;
  Object.assign(L.leagueMetadata.standings.find((r) => r.teamId === me.id), { sMatches: 4, shots: 50, onTarget: 20, xg: 6, corners: 22, freeKicks: 10, counterGoals: 3, counterGoalsAgainst: 2, varChecks: 9 });
  return { L, me, root: renderStats({ league: L, myTeamId: me.id }) };
}
const heads = (root) => all(byId(root, 'my-players'), (e) => e.tag === 'th').map((t) => t.textContent);
const titles = (root) => all(root, (e) => e.tag === 'summary').map((s) => s.textContent);

test('statsFromK: sæsonens runde, hvor spillertallene begynder (mindst 1; udeladte felter = runde 1)', () => {
  // Dræber: `seasonStartRound ?? 0` (gav 4 for {statsFromRound: 3}), `+ 1` væk, global runde.
  assert.equal(statsFromK({ statsFromRound: 3 }), 3);
  assert.equal(statsFromK({}), 1);
  assert.equal(statsFromK({ seasonStartRound: 15 }), 1);
  assert.equal(statsFromK({ statsFromRound: 15, seasonStartRound: 15 }), 1);
  assert.equal(statsFromK({ statsFromRound: 16, seasonStartRound: 15 }), 2);
  assert.equal(statsFromK({ statsFromRound: 18, seasonStartRound: 15 }), 4);
  // et gem fra v3.10, hvis statistik begyndte FØR den nuværende sæson: ikke under 1 (Math.max)
  assert.equal(statsFromK({ statsFromRound: 3, seasonStartRound: 15 }), 1);
});

test('sæson 2, statistik fra sæsonens runde 4: overskrifter, kolonner og noter siger RUNDE 4 – ikke global runde 18', () => {
  // Dræber: `fra R${league.statsFromRound}` i Kampe-/Fri-kolonnen (R18), `>= 1`, 'sæson'-teksten, gapNote-flytning/tekst.
  const { root } = season2(18);
  assert.deepEqual(titles(root).slice(0, 2), ['Spillere (sæson 2, fra runde 4)', 'Holdtal (sæson 2, fra runde 4)']);
  assert.deepEqual(heads(root), ['Spiller', 'Kampe (fra R4)', 'Snit (i alt)', 'km/90 (i alt)', '% HI (i alt)', 'Fri (fra R4)', 'Friskhed']);
  assert.match(byId(root, 'my-team-stats').textContent, /^Sæson 2, fra runde 4, pr\. kamp: 12\.5 afslutninger/);
  assert.ok(byId(root, 'stats-mine').textContent.endsWith('Kampe og frie løb tælles for sæson 2, fra runde 4; snit, km og HI gælder alle hans kampe (de nulstilles ikke ved sæsonskifte).'));
  // linjen om de manglende runder: præcis én, i spillere-sektionen, som afsnit — og ikke i de andre sektioner
  const gaps = all(root, (e) => e.attrs.id === 'stats-gap');
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].textContent, 'Sæsonens runde 1–3 blev spillet, før statistikken fandtes, og kan ikke tælles med. Fra næste sæson tæller hele sæsonen.');
  assert.equal(gaps[0].tag, 'p');
  assert.equal(all(byId(root, 'stats-players'), (e) => e.attrs.id === 'stats-gap').length, 1, 'i spillere-sektionen');
});

test('sæson 2, statistik fra sæsonens start (K = 1): "sæson" i kolonnerne og noterne, ingen linje om manglende runder', () => {
  // Dræber: `statsFromK > 1` → `>= 1` i overskrifterne ('fra R1'), 'sæson'-teksten i Kampe-/Fri-kolonnen, gapNote ved K = 1.
  const { root } = season2(15);
  assert.deepEqual(titles(root), ['Spillere (sæson 2)', 'Holdtal (sæson 2)', 'Ligaens forløb (sæson 2)', 'Dit hold (privat, sæson 2)']);
  assert.deepEqual(heads(root), ['Spiller', 'Kampe (sæson)', 'Snit (i alt)', 'km/90 (i alt)', '% HI (i alt)', 'Fri (sæson)', 'Friskhed']);
  assert.match(byId(root, 'my-team-stats').textContent, /^Sæson 2, pr\. kamp: 12\.5 afslutninger/);
  assert.ok(byId(root, 'stats-mine').textContent.endsWith('Kampe og frie løb tælles for sæson 2; snit, km og HI gælder alle hans kampe (de nulstilles ikke ved sæsonskifte).'));
  assert.equal(all(root, (e) => e.attrs.id === 'stats-gap').length, 0);
});

test('K = 2 (kun sæsonens runde 1 mangler): titel, kolonner og en linje om runde 1', () => {
  // Gem fra v3.10, opgraderet efter én spillet runde, rammer præcis dette. Teksten "runde 1–1" ses her (se rapporten) –
  // testen fastlåser derfor kun det, der er sikkert: K = 2 giver en note, og den nævner runde 1.
  const { root } = season2(16);
  assert.equal(titles(root)[0], 'Spillere (sæson 2, fra runde 2)');
  assert.equal(heads(root)[1], 'Kampe (fra R2)');
  const gap = byId(root, 'stats-gap');
  assert.ok(gap, 'noten findes ved K = 2');
  assert.equal(gap.textContent, 'Sæsonens runde 1 blev spillet, før statistikken fandtes, og kan ikke tælles med. Fra næste sæson tæller hele sæsonen.');   // ikke "1–1" (Test Manager)
});

// ---- rounds.js: "Spillertallene gælder fra sæsonens runde K" ----
test('tidligere sæsoner: sæsonens runde regnes fra sæsonens start (sæson fra global runde 7), ikke den globale', () => {
  // Dræber: `s.statsFrom` uden `- s.fromRound + 1` (forfatterens fixture har fromRound = 1, hvor begge giver 4),
  // `>=` i betingelsen (uden note ved statsFrom = fromRound), manglende statsFrom (gamle poster).
  const L = createLeague(createRng(9)), me = L.teams.find((t) => !t.isBot), bot = L.teams.find((t) => t.isBot);
  const row = (t, points) => ({ teamId: t.id, teamName: t.name, played: 14, won: 0, drawn: 0, lost: 0, goalsFor: points + 1, goalsAgainst: 3, points });
  const season = (n, fromRound, toRound, extra) => ({ seasonNumber: n, fromRound, toRound, programmed: true, table: [row(me, 30), row(bot, 25)], champion: { teamId: me.id, teamName: me.name, points: 30 }, myPos: 1, topScorer: null, myBest: null, ...extra });
  L.seasons = [
    season(1, 1, 6, { statsFrom: 1 }),            // statistik fra sæsonens første runde: ingen note (statsFrom = fromRound)
    season(2, 7, 20, { statsFrom: 10 }),          // global runde 10 = sæsonens runde 4
    season(3, 21, 34, { statsFrom: 22 }),         // global runde 22 = sæsonens runde 2
    season(4, 35, 48),                            // gammel post uden statsFrom: ingen note
    season(5, 49, 62, { statsFrom: 49 }),         // statsFrom = fromRound > 1: ingen note ('>=' ville give "runde 1")
  ];
  L.seasonStartRound = 63; L.leagueMetadata.round = 62; L.leagueMetadata.seasonNumber = 6;
  const past = byId(renderSchedule({ league: L, pairs: pairRound(L), myTeamId: me.id }), 'past-seasons');
  const ps = all(past, (e) => e.tag === 'p').map((x) => x.textContent), hs = all(past, (e) => e.tag === 'h4').map((x) => x.textContent);
  const champ = `🏆 Mester: ${me.name} (30 point). Din placering: nr. 1.`;
  assert.deepEqual(hs.map((h) => h.slice(0, 7)), ['Sæson 5', 'Sæson 4', 'Sæson 3', 'Sæson 2', 'Sæson 1']);
  assert.deepEqual(ps, [champ, champ, `${champ} Spillertallene gælder fra sæsonens runde 2.`, `${champ} Spillertallene gælder fra sæsonens runde 4.`, champ]);
});
