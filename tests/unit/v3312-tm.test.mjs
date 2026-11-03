// v3.31.2 – Test Manager: mutanter, som forfatterens v3312.test.mjs lod overleve (hver tests mutation står ved testen).
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.classList = { add: (c) => { this.className += ' ' + c; }, toggle() {} }; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t), createElementNS: (ns, t) => new FakeEl(t) };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague, ARCHETYPES } = await import('../../public/engine/generator.js');
const { keyAvg, roomPoints, LOG } = await import('../../public/engine/career.js');
const { opponentTacticKeys } = await import('../../public/engine/counter.js');
const { renderCard, roomWords } = await import('../../public/ui/card.js');
const { renderLineupList } = await import('../../public/ui/lineup-list.js');
const { archReqText } = await import('../../public/ui/labels.js');
const { placeLabel } = await import('../../public/ui/lineup.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const cls = (e, c) => (' ' + e.className + ' ').includes(` ${c} `);
const fresh = (seed = 3) => { const L = createLeague(createRng(seed)); return { L, me: L.teams.find((t) => !t.isBot), opp: L.teams.find((t) => t.isBot) }; };
const ARCH = Object.fromEntries(Object.values(ARCHETYPES).flat().map((a) => [a.id, a]));

// [S, R, H, A, HG, AG, MIN, RT, ST, G, AS]
function scene() {
  const { L, me } = fresh(3);
  const M = L.teams.indexOf(me), A = L.teams.findIndex((t, i) => t.isBot && i !== M), B = L.teams.findIndex((t, i) => t.isBot && i !== M && i !== A);
  const p = me.squad.find((x) => x.line === 'MID');
  L.leagueMetadata.seasonNumber = 2;
  Object.assign(p, { careerGames: 40, sGames: 0, sMinutes: 0, sGoals: 0, sAssists: 0, sMotm: 0, sYellow: 0, sRed: 0, sCleanSheets: 0, lastMove: null });
  return { L, me, p, M, A, B };
}
const card = (s, o = {}) => renderCard({ player: o.player ?? s.p, team: s.me, isOwn: true, scouting: [], note: '', onNote() {}, teams: s.L.teams, season: 2, lastSeason: null, ...o });
const table = (el) => { const t = byId(el, 'card-stats-table'); if (!t) return null; const rows = all(t, (e) => e.tag === 'tr');
  return { head: rows[0].children.map((c) => c.textContent), rows: Object.fromEntries(rows.slice(1).map((r) => [r.children[0].textContent, r.children.slice(1).map((c) => c.textContent)])), rowEls: rows.slice(1) }; };

// Mutation: hideLog-filteret sammenligner kun runden (sæson-delen fjernet) → rød. Runde 3 findes i BEGGE sæsoner; kun [2,3] skjules.
test('hideLog skjuler netop (sæson, runde) – runde 3 i sæson 1 står stadig', () => {
  const s = scene();
  s.p.matchLog = [[1, 3, s.M, s.A, 2, 0, 90, 7.0, 4, 1, 0], [1, 4, s.A, s.M, 0, 1, 90, 6.0, 3, 0, 1], [2, 3, s.M, s.B, 1, 0, 90, 8.0, 4, 1, 0], [2, 4, s.B, s.M, 1, 1, 90, 6.0, 3, 0, 0]];
  const t = table(card(s, { hideLog: [2, 3] }));
  assert.deepEqual(t.rows.Kampe, ['1', '2'], 'sæson 2: kun runde 4; sæson 1: runde 3 OG 4');
  assert.deepEqual(t.rows.Mål, ['0', '1']);
});

// Mutation: seasonNumber-vagten på sidste sæsons øjebliksbillede fjernet → rød. Under afspilning af sæsonens SIDSTE runde er
// season = den afsluttede sæson (2) og lastSeasonStats ER den sæson (2) – kolonnen "Sæson 1" må ikke vise sæson 2's tal.
// Og et forældet billede (seasonNumber 5) hører ikke til nogen af kolonnerne.
test('lastSeasonStats med et andet sæsonnummer end kolonnen bruges ikke – også under afspilning af sidste runde', () => {
  const s = scene();
  s.p.matchLog = [[1, 1, s.M, s.A, 1, 0, 90, 7, 3, 0, 0], [2, 14, s.M, s.B, 2, 0, 90, 8, 4, 1, 0]];
  const snap = (n) => ({ seasonNumber: n, players: { [s.p.id]: { sMotm: 7, sYellow: 6, sRed: 5, t: s.me.id } } });
  let t = table(card(s, { hideLog: [2, 14], lastSeason: snap(2) }));
  assert.deepEqual([t.rows['👑'], t.rows['🟨'], t.rows['🟥']], [['–', '–'], ['–', '–'], ['–', '–']]);
  t = table(card(s, { lastSeason: snap(5) }));
  assert.deepEqual(t.rows['👑'][1], '–');
  t = table(card(s, { lastSeason: snap(1) }));
  assert.deepEqual([t.rows['👑'][1], t.rows['🟨'][1], t.rows['🟥'][1]], ['7', '6', '5'], 'data: det rigtige billede bruges');
});

// Mutation: "ikke i øjebliksbilledet" → null i stedet for 0 → rød. Billedet gemmer kun spillere med tal ≠ 0.
test('spiller, der ikke står i sidste sæsons billede (alle tal 0): 👑/🟨/🟥 = 0 – ikke "–"', () => {
  const s = scene();
  s.p.matchLog = [[1, 1, s.M, s.A, 1, 0, 90, 7, 3, 0, 0], [2, 1, s.M, s.B, 1, 0, 90, 7, 3, 0, 0]];
  const t = table(card(s, { lastSeason: { seasonNumber: 1, players: { andre: { sMotm: 1, t: s.me.id } } } }));
  assert.deepEqual([t.rows['👑'], t.rows['🟨'], t.rows['🟥']], [['0', '0'], ['0', '0'], ['0', '0']]);
  assert.equal(byId(card(s, { lastSeason: { seasonNumber: 1, players: {} } }), 'card-stats-note'), undefined, 'ingen "–": intet at forklare');
});

// Mutation: careerGames > 0 → >= 0 ("ikke gemt" for en spiller uden kampe) → rød
test('en spiller uden karrierekampe og uden log siger "Ingen kampe for <hold> endnu" – ikke "ikke gemt"', () => {
  const s = scene();
  for (const cg of [0, undefined]) {
    Object.assign(s.p, { matchLog: [], careerGames: cg });
    const el = card(s);
    assert.equal(byId(el, 'card-stats-empty').textContent, `Ingen kampe for ${s.me.name} endnu`, String(cg));
  }
  Object.assign(s.p, { matchLog: [], careerGames: 12 });
  assert.equal(byId(card(s), 'card-stats-empty').textContent, 'Kampene før kamphistorikken (v3.18) er ikke gemt');
});

// Mutationer: rows-filteret r.s >= 1 fjernet / >= 0 ("Sæson 0") → rød; season ?? 1 → ?? 2 → rød
test('første sæson: kun kolonnen "Sæson 1" (aldrig "Sæson 0"), og uden season-parameter regnes sæson 1', () => {
  const s = scene();
  s.p.matchLog = [[1, 1, s.M, s.A, 1, 0, 90, 7, 3, 1, 0], [1, 2, s.A, s.M, 0, 0, 60, 6, 3, 0, 0]];
  Object.assign(s.p, { sMotm: 1, sYellow: 2, sRed: 0 });
  for (const season of [1, undefined]) {
    const t = table(card(s, { season }));
    assert.deepEqual(t.head, ['', 'Sæson 1'], String(season));
    assert.deepEqual(t.rows.Kampe, ['2']); assert.deepEqual(t.rows['🟨'], ['2']);
    assert.ok(t.rows.Kampe.length === 1 && !JSON.stringify(t.head).includes('Sæson 0'));
  }
});

// Mutation: rated-filteret (kun kampe med karakter) fjernet → rød (snit 5 i stedet for 7,5). En kamp uden karakter tæller som kamp, ikke i snit.
test('Snit: kampe uden karakter (null) tæller som kamp men ikke i snittet', () => {
  const s = scene();
  s.p.matchLog = [[2, 1, s.M, s.A, 1, 0, 90, 7.0, 3, 0, 0], [2, 2, s.A, s.M, 0, 0, 90, null, 3, 0, 0], [2, 3, s.M, s.B, 1, 0, 90, 8.0, 3, 0, 0]];
  const t = table(card(s));
  assert.deepEqual(t.rows.Kampe, ['3', '0']); assert.deepEqual(t.rows.Snit, ['7,5', '–']);
});

// Mutation: 🧤 clean sheets i sæsonen læses fra sGames (3) i stedet for sCleanSheets (1) → rød
test('målmand: 🧤 i sæsonen er sCleanSheets, ikke sGames', () => {
  const s = scene(), gk = s.me.squad.find((x) => x.line === 'GK');
  gk.matchLog = [[2, 1, s.M, s.A, 1, 0, 90, 7, 3, 0, 0], [2, 2, s.A, s.M, 1, 1, 90, 6, 3, 0, 0], [2, 3, s.M, s.B, 0, 1, 90, 6, 3, 0, 0]];
  Object.assign(gk, { sGames: 3, sCleanSheets: 1, sMotm: 0, sYellow: 0, sRed: 0, lastMove: null, careerGames: 3 });
  assert.deepEqual(table(card(s, { player: gk })).rows['🧤'], ['1', '–']);
});

// Mutation: title på rækkeoverskrifterne fjernet → rød (👑/🟨/🟥/🧤 er ikke selvforklarende)
test('rækkernes forklaring (title): Snit, 👑, 🟨, 🟥, 🧤', () => {
  const s = scene(), gk = s.me.squad.find((x) => x.line === 'GK');
  gk.matchLog = [[2, 1, s.M, s.A, 1, 0, 90, 7, 3, 0, 0]];
  const titles = (el) => Object.fromEntries(all(byId(el, 'card-stats-table'), (e) => e.tag === 'tbody')[0].children.map((r) => [r.children[0].textContent, r.children[0].attrs.title]));
  assert.deepEqual(titles(card(s, { player: gk })), { Kampe: '', 'Min.': '', Mål: '', Oplæg: '', Snit: 'Snitkarakter (kun dit hold)', '👑': 'Kampens spiller', '🟨': 'Gule kort', '🟥': 'Røde kort', '🧤': 'Clean sheets' });
});

// ---------- skønnet ----------
// Mutationer: roomPoints uden fallback (?? 0) → "meget mere" ved manglende potentiale; abs → negativ plads bliver positiv
test('roomPoints: manglende potentiale = 0 (tæt på sit loft); potentiale under snittet er negativt, ikke numerisk', () => {
  const { me } = fresh();
  const p = { ...me.squad[4] };
  delete p.potential;
  assert.equal(roomPoints(p), 0); assert.equal(roomWords(roomPoints(p)), 'er tæt på sit loft');
  p.potential = keyAvg(p) - 4;
  assert.ok(roomPoints(p) < -3.9 && roomPoints(p) > -4.1, String(roomPoints(p)));
  assert.equal(roomWords(roomPoints(p)), 'er tæt på sit loft');
  const el = renderCard({ player: p, team: me, isOwn: true, scouting: [], note: '', onNote() {} });
  assert.ok(byId(el, 'train-estimate').textContent.startsWith(`Skøn: ${p.shortName} er tæt på sit loft · `));
});

// ---------- pladskoder i gamle referater ----------
// Mutationer: SUB (GK) / SUB (MID) ud af mønstret; ukendt rolle → "?" i stedet for den gemte tekst
test('placeLabel for gamle runder: alle fire indskifter-kæder, og en ukendt gemt rolle står uændret', () => {
  const E = (role) => ({ role, line: 'MID', minIn: 1, slot: undefined });
  assert.equal(placeLabel(E('SUB (GK)'), '4-4-2'), 'ind (MÅL)');
  assert.equal(placeLabel(E('SUB (DEF)'), '4-4-2'), 'ind (FOR)');
  assert.equal(placeLabel(E('SUB (MID)'), '4-4-2'), 'ind (MID)');
  assert.equal(placeLabel(E('SUB (ATT)'), '4-4-2'), 'ind (ANG)');
  assert.equal(placeLabel(E('Libero'), '4-4-2'), 'Libero');
  assert.equal(placeLabel(E('SUB (XX)'), '4-4-2'), 'SUB (XX)');
  assert.equal(placeLabel(E(undefined), '4-4-2'), undefined);
});

// ---------- arketypen på Taktik ----------
// Mutationer: mellemrum foran ikonet fjernet ("#7 Navn🔒"); title på linjen fjernet; ?? {} i archReqText fjernet (kaster)
test('arketype-mærket: ikonet sidder efter et mellemrum, linjen har samme title, og en låst arketype uden krav kaster ikke', () => {
  const { me } = fresh();
  const a = me.squad.find((p) => p.id === me.tactics.lineupSlots[5]);
  a.archetype = { ...ARCH.REGISTA, isUnlocked: false };
  delete a.archetype.unlockReq;
  assert.equal(archReqText(a.archetype), 'Låses op ved: ');
  const list = renderLineupList({ team: me, isOwn: true, ui: { listLine: 'all' }, onPick() {}, onSort() {}, onBlocked() {}, onLine() {}, onInfo() {} });
  const cell = all(list, (e) => e.tag === 'tr' && e.dataset.pid === a.id)[0].children[1];
  const ico = all(cell, (e) => cls(e, 'lp-arch-ico'))[0], line = all(cell, (e) => cls(e, 'lp-arch'))[0];
  assert.equal(ico.textContent, ' 🔒');
  assert.equal(line.attrs.title, ico.attrs.title);
  assert.ok(line.attrs.title.startsWith('Arketype: Regista (spilfordeler) – '), line.attrs.title);
  assert.ok(cell.textContent.startsWith(`#${a.shirtNumber} ${a.shortName} 🔒`), cell.textContent);
});

// ---------- opponentTacticKeys (refaktoreret v3.31.2: label fjernet, grenene skrevet om) ----------
// Uafhængigt orakel i tabelform for alle 81 kombinationer; mutationer i enhver gren → rød
test('opponentTacticKeys: alle 81 kombinationer mod et tabel-orakel; uden faser = vsPress/vsTrapLong; intet label-felt', () => {
  const PRESS = { HIGH_GEGENPRESS: 'vsPress', LOW_BLOCK: 'vsLowBlock', MID_BLOCK: null };
  const team = (pass, focus, press, trap) => ({ tactics: { phases: { phase1_buildUp: { passingStyle: pass, attackFocus: focus }, phase2_defending: { pressingHeight: press, offsideTrap: trap } } } });
  let n = 0;
  for (const press of Object.keys(PRESS)) for (const trap of ['OFF', 'NORMAL', 'EXTREME_VAR_LINE']) for (const pass of ['SHORT', 'BALANCED', 'DIRECT_LONG']) for (const focus of ['CENTRAL', 'HIGH_CROSSES', 'LOW_CUTBACKS']) {
    const lb = pass === 'DIRECT_LONG' || focus === 'HIGH_CROSSES';
    const primary = PRESS[press] ?? (lb ? 'vsTrapLong' : 'vsPress');
    const secondary = trap === 'EXTREME_VAR_LINE' || lb ? 'vsTrapLong' : press === 'LOW_BLOCK' ? 'vsLowBlock' : primary;
    assert.deepEqual(opponentTacticKeys(team(pass, focus, press, trap)), { primary, secondary }, [press, trap, pass, focus].join('/'));
    n++;
  }
  assert.equal(n, 81);
  assert.deepEqual(opponentTacticKeys(null), { primary: 'vsPress', secondary: 'vsTrapLong' });
  assert.deepEqual(opponentTacticKeys({ tactics: {} }), { primary: 'vsPress', secondary: 'vsTrapLong' });
});
