// Statistik-fanen (public/ui/stats.js) mod et minimalt DOM: hvert tal i listerne, tabellen,
// forløbet og "Dit hold" er sat til en kendt, FORSKELLIG værdi, så en ombyttet nøgle, kolonne,
// sortering eller grænse bliver rød (Test Manager v3.10 – e2e har kun én runde og tomme lister).
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
const { renderStats, shortTeam } = await import('../../public/ui/stats.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const cells = (tr) => tr.children.map((c) => c.textContent);

function world() {
  const L = createLeague(createRng(8));
  L.statsFromRound = 3;
  const me = L.teams[0], other = L.teams[1], third = L.teams[2];
  return { L, me, other, third };
}
const render = (L, me) => renderStats({ league: L, myTeamId: me.id });
const list = (root, key) => all(root, (e) => e.dataset.key === key)[0];
const items = (l) => all(l, (e) => e.tag === 'tr'); // v3.10.1: hver liste er en tabel – én række pr. spiller
const rowCells = (tr) => tr.children.map((c) => c.textContent);

test('statistik-fanen: fire sektioner, kun spillerne åben, "fra runde N" fra ligaen (1 uden felt)', () => {
  const { L, me } = world();
  let root = render(L, me);
  const secs = all(root, (e) => e.tag === 'details');
  assert.deepEqual(secs.map((s) => s.attrs.id), ['stats-players', 'stats-teams', 'stats-flow', 'stats-mine']);
  assert.deepEqual(secs.map((s) => s.attrs.open), ['', undefined, undefined, undefined]);
  assert.deepEqual(secs.map((s) => s.children[0].textContent), ['Spillere (fra runde 3)', 'Holdtal (fra runde 3)', 'Ligaens forløb (fra runde 3)', 'Dit hold (privat, fra runde 3)']);
  delete L.statsFromRound;
  root = render(L, me);
  assert.equal(all(root, (e) => e.tag === 'summary')[0].textContent, 'Spillere (fra runde 1)');
});

test('spillerlister: titel/nøgle pr. liste, top 5 efter værdi (lighed: flest kampe), kun > 0, eget hold markeret, tom liste siger det', () => {
  const { L, me, other } = world();
  const mine = me.squad, theirs = other.squad;
  // 7 spillere med mål: 9 (mit hold), 7, 7 (to kampe forskel), 5, 3, 2, 1 -> kun de 5 første
  const setG = (p, g, games) => { p.sGoals = g; p.sGames = games; };
  setG(mine[9], 9, 4); setG(theirs[9], 7, 3); setG(theirs[10], 7, 5); setG(mine[10], 5, 2); setG(theirs[8], 3, 2); setG(mine[8], 2, 2); setG(theirs[7], 1, 1);
  mine[5].sAssists = 4; theirs[5].sMotm = 2; theirs[6].sHeaderGoals = 3; mine[6].sPenaltyGoals = 1; mine[7].sSetPieceGoals = 6; theirs[3].sCleanSheets = 5; mine[3].sYellow = 8;
  const root = render(L, me);
  const lists = all(root, (e) => e.dataset.key && e.dataset.key !== 'publicStars');
  assert.deepEqual(lists.map((l) => [l.dataset.key, l.children[0].textContent]), [
    ['sGoals', '⚽ Topscorere'], ['sAssists', '🅰 Flest oplæg'], ['sMotm', '👑 Kampens spiller'], ['sHeaderGoals', '🗣 Hovedstødsmål'],
    ['sPenaltyGoals', '🎯 Straffemål'], ['sSetPieceGoals', '🧱 Dødboldmål'], ['sCleanSheets', '🧤 Clean sheets'], ['sYellow', '🟨 Gule kort']]);
  const top = items(list(root, 'sGoals'));
  // Fire celler: placering · #nr Navn · kort holdnavn · værdi (ingen ombrud – hver ting i sin egen celle)
  const sn = (t) => shortTeam(t.name);
  assert.deepEqual(top.map(rowCells), [
    ['1.', `#${mine[9].shirtNumber} ${mine[9].shortName}`, sn(me), '9'], ['2.', `#${theirs[10].shirtNumber} ${theirs[10].shortName}`, sn(other), '7'],
    ['3.', `#${theirs[9].shirtNumber} ${theirs[9].shortName}`, sn(other), '7'], ['4.', `#${mine[10].shirtNumber} ${mine[10].shortName}`, sn(me), '5'], ['5.', `#${theirs[8].shirtNumber} ${theirs[8].shortName}`, sn(other), '3']]);
  assert.equal(top[1].children[2].attrs.title, other.name, 'fuldt holdnavn i title');
  assert.deepEqual(top.map((li) => li.className), ['mine', '', '', 'mine', '']);
  // Hver anden liste viser præcis sin egen spiller med sin egen værdi
  const only = (key) => items(list(root, key)).map((li) => li.children.at(-1).textContent.trim());
  assert.deepEqual([only('sAssists'), only('sMotm'), only('sHeaderGoals'), only('sPenaltyGoals'), only('sSetPieceGoals'), only('sCleanSheets'), only('sYellow')], [['4'], ['2'], ['3'], ['1'], ['6'], ['5'], ['8']]);
  // Ingen data -> "Ingen endnu."
  const empty = render(world().L, world().me);
  assert.ok(all(empty, (e) => e.dataset.key === 'sGoals')[0].textContent.includes('Ingen endnu.'));
  assert.equal(items(list(empty, 'sGoals')).length, 0);
});

test('bedste vurdering: kun spillere med stjerner OG kampe, flest stjerner først (lighed: flest kampe)', () => {
  const { L, me, other } = world();
  const set = (p, stars, games) => { p.publicStars = stars; p.sGames = games; };
  set(me.squad[1], 3, 5); set(other.squad[1], 5, 1); set(other.squad[2], 5, 4); set(me.squad[2], 4, 0);   // sidste har ingen kampe i statistikken
  const root = render(L, me);
  const rows = items(list(root, 'publicStars'));
  assert.deepEqual(rows.map((li) => li.children[1].textContent), [`#${other.squad[2].shirtNumber} ${other.squad[2].shortName}`, `#${other.squad[1].shirtNumber} ${other.squad[1].shortName}`, `#${me.squad[1].shirtNumber} ${me.squad[1].shortName}`]);
  assert.deepEqual(rows.map((li) => li.className), ['', '', 'mine']);
  const starsCell = rows[0].children.at(-1).children[0];   // stjernerne står i værdicellen på samme række
  assert.equal(starsCell.attrs.title ?? starsCell.title, '5 af 5 stjerner');
});

test('holdtal: ni kolonner uden taktik-afslørende tal, alle hold, bold % = snit pr. kamp, straffe (mål), dit hold markeret', () => {
  const { L, me, other, third } = world();
  const row = (t) => L.leagueMetadata.standings.find((s) => s.teamId === t.id);
  Object.assign(row(me), { sMatches: 4, possSum: 210, fouls: 31, foulsWon: 27, yellows: 6, penalties: 5, penaltyGoals: 4, setPieceGoals: 7, cleanSheets: 2, shots: 99, corners: 88, xg: 77, varChecks: 66 });
  Object.assign(row(other), { sMatches: 3, possSum: 150, fouls: 12, foulsWon: 13, yellows: 1, penalties: 2, penaltyGoals: 1, setPieceGoals: 3, cleanSheets: 1, shots: 55, counterGoals: 44 });
  const root = render(L, me);
  const tbl = byId(root, 'team-stats');
  assert.deepEqual(all(tbl, (e) => e.tag === 'th').map((t) => t.textContent), ['Hold', 'Bold %', 'Frispark begået', 'Frispark tilkendt', '🟨', 'Straffe for (scoret)', 'Dødboldmål', 'Hovedstødsmål', 'Clean sheets']);
  const rows = all(tbl, (e) => e.tag === 'tr' && e.children[0].tag === 'td');
  assert.equal(rows.length, 8);
  const mineRow = rows.find((r) => r.className === 'mine'), otherRow = rows.find((r) => r.children[0].textContent === other.name);
  assert.equal(mineRow.children[0].textContent, me.name); assert.equal(rows.filter((r) => r.className === 'mine').length, 1);
  assert.deepEqual(cells(mineRow), [me.name, '53', '31', '27', '6', '5 (4)', '7', '0', '2']);          // 210/4 = 52,5 → 53
  assert.deepEqual(cells(otherRow), [other.name, '50', '12', '13', '1', '2 (1)', '3', '0', '1']);
  assert.deepEqual(cells(rows.find((r) => r.children[0].textContent === third.name)), [third.name, '–', '0', '0', '0', '0 (0)', '0', '0', '0']);   // ingen kampe: ingen bold-%
  const text = tbl.textContent;
  for (const hidden of ['99', '88', '77', '66', '55', '44']) assert.ok(!text.includes(hidden), `${hidden} er et privat holdtal`);
});

test('ligaens forløb: overskrift, søjler (bredde i forhold til rundens mål), måltyper sorteret med danske navne og procent, største sejr og målrigeste', () => {
  const { L, me } = world();
  L.history = [
    { round: 3, matches: 4, goals: 12, setPiece: 3, kinds: { LONGSHOT: 6, PENALTY: 2, CORNER: 1, COMBINATION: 3 }, biggest: { diff: 2, label: 'A 3-1 B' }, most: { goals: 5, label: 'C 3-2 D' } },
    { round: 4, matches: 4, goals: 6, setPiece: 1, kinds: { LONGSHOT: 3, FREEKICK: 1, COMBINATION: 2 }, biggest: { diff: 4, label: 'E 4-0 F' }, most: { goals: 4, label: 'G 2-2 H' } },
  ];
  const flow = render(L, me);
  assert.equal(byId(flow, 'flow-summary').textContent, '18 mål i 8 kampe (2.25 pr. kamp) · 22 % på dødbolde.');   // 4 af 18 = 22,2 %
  const bars = all(byId(flow, 'round-bars'), (e) => e.className === 'round-bar');
  assert.deepEqual(bars.map((b) => [b.attrs.title, b.children[0].textContent, b.children[1].style.width, b.children[2].textContent]), [['Runde 3: 12 mål', 'R3', '100%', '12'], ['Runde 4: 6 mål', 'R4', '50%', '6']]);
  const kinds = all(byId(flow, 'goal-kinds'), (e) => e.tag === 'li').map((li) => li.textContent);
  assert.deepEqual(kinds, ['Langskud: 9 (50 %)', 'Kombination: 5 (28 %)', 'Straffespark: 2 (11 %)', 'Hjørnespark: 1 (6 %)', 'Frispark: 1 (6 %)']);
  const ps = all(byId(flow, 'stats-flow'), (e) => e.tag === 'p').map((p) => p.textContent);
  assert.ok(ps.includes('Største sejr: E 4-0 F') && ps.includes('Målrigeste kamp: C 3-2 D'), ps.join(' | '));
  // Kun indeværende sæson (v3.11): ny sæson fra runde 4 → runde 3 hører til den afsluttede
  L.seasonStartRound = 4;
  const f2 = render(L, me);
  assert.equal(byId(f2, 'flow-summary').textContent, '6 mål i 4 kampe (1.50 pr. kamp) · 17 % på dødbolde.');
  assert.deepEqual(all(byId(f2, 'round-bars'), (e) => e.className === 'round-bar').map((b) => b.attrs.title), ['Runde 4: 6 mål']);
  L.seasonStartRound = 5;
  assert.equal(all(byId(render(L, me), 'stats-flow'), (e) => e.tag === 'p')[0].textContent, 'Kommer efter sæsonens første runde.');
  L.seasonStartRound = 1;
  // Ingen runder endnu
  L.history = [];
  assert.equal(all(byId(render(L, me), 'stats-flow'), (e) => e.tag === 'p')[0].textContent, 'Kommer efter sæsonens første runde.');
  // Ingen sejre (kun uafgjorte): ingen "Største sejr"-linje
  L.history = [{ round: 3, matches: 1, goals: 0, setPiece: 0, kinds: {}, biggest: null, most: { goals: 0, label: 'A 0-0 B' } }];
  assert.ok(!byId(render(L, me), 'stats-flow').textContent.includes('Største sejr'));
});

test('dit hold (privat): pr.-kamp-tal, sæsonsummer og spillertabellen med snit, km, HI, frie løb og friskhed – kun for mit hold', () => {
  const { L, me, other } = world();
  const s = L.leagueMetadata.standings.find((r) => r.teamId === me.id);
  Object.assign(s, { sMatches: 4, shots: 50, onTarget: 20, xg: 6, corners: 22, freeKicks: 10, headerGoals: 5, counterGoals: 3, counterGoalsAgainst: 2, varChecks: 9 });
  Object.assign(other.squad[0], { sGames: 9, freeRunsSum: 99 });
  const p = me.squad[4];
  Object.assign(p, { sGames: 3, ratingSum: 27, ratingGames: 4, minutesSum: 360, distanceSum: 42, hiKmSum: 3, hiDistSum: 12, freeRunsSum: 8, freeRunsWonSum: 3, freshness: 62 });
  const root = render(L, me);
  assert.equal(byId(root, 'my-team-stats').textContent, 'Fra runde 3, pr. kamp: 12.5 afslutninger (5.0 på mål), xG 1.50, 5.5 hjørnespark, 2.5 frispark i skudafstand. I alt: kontramål 3 for / 2 imod, 9 VAR-tjek.');
  const rows = all(byId(root, 'my-players'), (e) => e.tag === 'tr' && e.children[0].tag === 'td');
  assert.equal(rows.length, 18);
  assert.deepEqual(all(byId(root, 'my-players'), (e) => e.tag === 'th').map((t) => t.textContent), ['Spiller', 'Kampe (fra R3)', 'Snit (i alt)', 'km/90 (i alt)', '% HI (i alt)', 'Fri (fra R3)', 'Friskhed']);
  assert.deepEqual(cells(rows[4]), [`#${p.shirtNumber} ${p.shortName}`, '3', '6.8', '10.5', '25 %', '3/8', '62 %']);   // snit 27/4 = 6,75 → 6,8 · 42/360·90 = 10,5 km
  assert.deepEqual(cells(rows[5]).slice(1), [String(me.squad[5].sGames), '–', '–', '–', '–', `${me.squad[5].freshness} %`]);
  assert.ok(!byId(root, 'stats-mine').textContent.includes('99'), 'modstanderens spillere vises ikke');
  assert.ok(byId(root, 'stats-mine').textContent.endsWith('Kun du ser disse tal – de røber evner og dine taktiske valg. Kampe og frie løb tælles fra runde 3; snit, km og HI gælder alle hans kampe (de nulstilles ikke ved sæsonskifte).'));
  assert.ok(byId(root, 'stats-teams').textContent.endsWith('Bold % er snit pr. kamp. Afslutninger, xG, hjørnespark, kontraer og VAR-tjek ses kun for dit eget hold (under "Dit hold") – summeret over sæsonen kunne de røbe et holds taktik.'));
  // Før første runde
  const fresh = world();
  assert.equal(byId(render(fresh.L, fresh.me), 'my-team-stats').textContent, 'Kommer efter første runde.');
});

// v3.10.1 Test Manager: listetesten sammenlignede med shortTeam() selv, så ordlisten var ubevist (hvert ord kunne fjernes).
// Pinnet bogstaveligt for ALLE otte holdnavne + ord der ikke må fjernes + fallback til hele navnet.
test('shortTeam: fjerner FC/IF/BK/United/Boldklub/Rovers/Tacticians – og kun dem; aldrig et tomt navn', async () => {
  const { TEAM_NAMES } = await import('../../public/engine/generator.js');
  assert.deepEqual(TEAM_NAMES.map(shortTeam), ['Bibamus', 'Vejleå', 'Ølstykke', 'Lyngby', 'Nordkysten', 'Furesø', 'Roskilde', 'Kronborg']);
  assert.equal(shortTeam('Aalborg City Rangers'), 'Aalborg City Rangers');
  assert.equal(shortTeam('FC'), 'FC', 'tomt resultat → hele navnet');
  assert.equal(shortTeam('FC Rovers'), 'FC Rovers');
});
test('spillerlister: spillerens fulde navn og nummer står i title på navnecellen (afkortet tekst kan ikke ses)', () => {
  const { L, me } = world();
  const p = me.squad[3]; p.sGoals = 4; p.sGames = 4;
  const row = items(list(render(L, me), 'sGoals'))[0];
  assert.equal(row.children[1].attrs.title, `#${p.shirtNumber} ${p.shortName}`);
});
