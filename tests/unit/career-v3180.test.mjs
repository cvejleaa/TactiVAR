// v3.18.0 – livsløb, økonomi og transfers: skema 7 (migreringen fra v3.17.0), unikke navne og backups
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { parseSave, loadGame, backupRaw, backupKeys, BACKUP_PREFIX, BACKUP_KEEP, SAVE_KEY, SCHEMA_VERSION } from '../../public/state/storage.js';
import { publicWage, publicValue, initialPotential, uniquifyNames, derivedRng } from '../../public/engine/career.js';
import { viewPlayer, canSeeField } from '../../public/engine/visibility.js';

const R9 = fs.readFileSync(new URL('../fixtures/save-v3.17.0.json', import.meta.url), 'utf8');
const R13 = fs.readFileSync(new URL('../fixtures/save-v3.17.0-r13.json', import.meta.url), 'utf8');
const names = (L) => L.teams.flatMap((t) => t.squad.map((p) => p.shortName));
const dupes = (L) => { const n = names(L); return n.length - new Set(n).size; };

test('migrering 6 → 7 (gem fra v3.17.0, runde 9): truppen og alle felter intakte, ingen ældes, nye felter er der', () => {
  const raw = JSON.parse(R9);
  assert.equal(raw.schemaVersion, 6); assert.equal(SCHEMA_VERSION, 8);   // v3.20.0: 7 → 8 kører bagefter (migrate-v3200)
  const r = parseSave(R9);
  assert.ok(r.ok, r.error); assert.equal(r.migratedFrom, 6);
  const L = r.state.league, old = raw.league;
  assert.equal(L.leagueMetadata.round, 9);
  L.teams.forEach((t, i) => {
    assert.equal(t.squad.length, 18);
    t.squad.forEach((p, j) => {
      const o = old.teams[i].squad[j];
      assert.equal(p.id, o.id); assert.equal(p.age, o.age, 'ingen ældes ved migreringen'); assert.deepEqual(p.skills, o.skills);
      assert.equal(p.sGames, o.sGames); assert.equal(p.ratingGames, o.ratingGames);
      assert.equal(p.trainingFocus, 'GENERAL'); assert.deepEqual(p.dev, {}); assert.deepEqual(p.matchLog, []);
      assert.equal(p.careerGames, o.ratingGames);
      assert.ok(Number.isFinite(p.potential) && p.potential >= 4 && p.potential <= 19);
      assert.ok(!('marketValue' in p), 'markedsværdien efter evnerne er væk (QC F5)');
      assert.equal(p.weeklyWage, publicWage(p), 'én lønmodel (QC B6)');
    });
    assert.equal(t.matchBench.length, 7); assert.ok(t.matchBench.every((id) => !t.tactics.lineupSlots.includes(id)));
    assert.equal(t.matchBenchAuto, true); assert.deepEqual(t.listed, []); assert.deepEqual(t.youthOffers, []);
  });
  assert.deepEqual([L.transferLog, L.retired, L.offers], [[], [], []]);
  assert.equal(Object.values(r.state.notes)[0], 'Notat fra v3.17.0 – skal overleve migreringen');
  // Potentialet er deterministisk: to indlæsninger giver samme tal
  const again = parseSave(R9).state.league;
  assert.deepEqual(again.teams.flatMap((t) => t.squad.map((p) => p.potential)), L.teams.flatMap((t) => t.squad.map((p) => p.potential)));
});

test('migreringen omdøber navne-dubletter på tværs af holdene – dit hold beholder sine – og retter teksterne (referat, spejder-indtryk)', () => {
  const raw = JSON.parse(R9), oldL = raw.league;
  assert.ok(dupes(oldL) > 0, `data: ${dupes(oldL)} dubletter i v3.17.0-gemmet`);
  const L = parseSave(R9).state.league;
  assert.equal(dupes(L), 0);
  const me = L.teams.find((t) => !t.isBot), oldMe = oldL.teams.find((t) => !t.isBot);
  assert.deepEqual(me.squad.map((p) => p.shortName), oldMe.squad.map((p) => p.shortName), 'dit hold beholder navnene');
  const renamed = L.teams.flatMap((t, i) => t.squad.map((p, j) => ({ p, from: oldL.teams[i].squad[j].shortName }))).filter(({ p, from }) => p.shortName !== from);
  assert.ok(renamed.length >= 1);
  const text = JSON.stringify(L.lastRound) + JSON.stringify(L.seasons);
  let mentioned = 0;
  for (const { p, from } of renamed) {
    // den gamle "#nr navn" står ikke mere – medmindre en anden spiller med samme nummer bar navnet (tvetydig)
    const other = L.teams.flatMap((t) => t.squad).some((q) => q !== p && q.shirtNumber === p.shirtNumber && q.shortName === from);
    if (!other) assert.ok(!text.includes(`#${p.shirtNumber} ${from}`), `${from} står stadig`);
    if (text.includes(`#${p.shirtNumber} ${p.shortName}`)) mentioned++;
    const book = Object.values(L.scouting)[0][p.id] ?? [];
    assert.ok(book.every((s) => !s.includes(from) || from.includes(p.shortName)), `spejder-indtryk for ${p.shortName}`);
  }
  assert.ok(mentioned >= 1, 'data: mindst én omdøbt spiller nævnes i referatet med sit nye navn');
});

test('nye ligaer: alle kortnavne unikke (20 ligaer), løn efter offentlige data, ingen markedsværdi; uniquifyNames tjekker også de endnu ikke gennemgåede', () => {
  for (let s = 1; s <= 20; s++) {
    const L = createLeague(createRng(s));
    assert.equal(dupes(L), 0, `seed ${s}`);
    for (const p of L.teams.flatMap((t) => t.squad)) { assert.equal(p.weeklyWage, publicWage(p)); assert.ok(!('marketValue' in p)); }
  }
  // Et nyt navn må ikke ramme et navn længere fremme: med to F-navne ledige skal den nye aldrig blive "B. B"
  const t = (isBot, ...n) => ({ isBot, squad: n.map((s, i) => ({ id: `${s}${i}`, shirtNumber: i, shortName: s, name: s })) });
  const teams = [t(false, 'A. A'), t(true, 'A. A'), t(true, 'B. B')];
  const rng = { next: () => 0 };   // første fornavn/efternavn → "M. Jensen" osv.; tjekket mod alle
  uniquifyNames(teams, rng, ['Bo'], ['B']);
  const all = teams.flatMap((x) => x.squad.map((p) => p.shortName));
  assert.equal(new Set(all).size, 3, all.join(','));
});

test('offentlig værdi og løn: kun stjerner (eller tier) og alder – ens for to spillere med samme offentlige felter og forskellige evner', () => {
  const base = { roleTier: 'STARTER', age: 25, careerGames: 10, publicStars: 3, line: 'MID', skills: { passing: 5 } };
  const a = { ...base, skills: { passing: 3 } }, b = { ...base, skills: { passing: 19 }, weeklyWage: 1, potential: 19 };
  assert.equal(publicValue(a), publicValue(b)); assert.equal(publicWage(a), publicWage(b));
  assert.equal(publicValue(base), 1200000);                           // 3★ · 1,0
  assert.equal(publicValue({ ...base, age: 33 }), 425000);            // 1,2 mio. · 0,35 = 420.000 → 425.000
  assert.equal(publicValue({ ...base, careerGames: 2 }), 1200000, 'under 3 kampe: tier STARTER = 3★');
  assert.equal(publicValue({ ...base, careerGames: 2, roleTier: 'STAR' }), 2400000);
  assert.equal(publicWage(base), 72000);                              // 6 %
});

test('synlighed: potentiale er hemmeligt (også for ejeren), træningsfokus kun for ejeren, kamptal offentlige', () => {
  const p = createLeague(createRng(3)).teams[1].squad[0];
  assert.ok(!('potential' in viewPlayer(p, true)) && !('potential' in viewPlayer(p, false)));
  assert.ok('trainingFocus' in viewPlayer(p, true) && !('trainingFocus' in viewPlayer(p, false)));
  assert.equal(canSeeField('potential', true), false); assert.equal(canSeeField('trainingFocus', false), false);
  assert.ok('careerGames' in viewPlayer(p, false));
  assert.equal(initialPotential(p), initialPotential(structuredClone(p)), 'deterministisk');
});

// Browserens lager med length/key/removeItem (som localStorage)
function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, map: m };
}
test(`backups: højst ${BACKUP_KEEP}, de ældste ryddes før der skrives; samme tekst som den nyeste giver ingen ny – tre fejlede genindlæsninger bevarer backuppen fra før`, () => {
  const s = store();
  for (let i = 1; i <= 5; i++) backupRaw(s, `gem ${i}`, 1000 + i);
  assert.deepEqual(backupKeys(s), [1003, 1004, 1005].map((n) => BACKUP_PREFIX + n));
  assert.equal(backupRaw(s, 'gem 5', 2000), BACKUP_PREFIX + 1005, 'samme tekst som den nyeste: ingen ny');
  assert.equal(backupKeys(s).length, 3);
  // Et ødelagt gem genindlæst tre gange: kun én backup af det, og den fra før er der stadig
  const t = store({ [BACKUP_PREFIX + 1]: 'før migreringen', [SAVE_KEY]: '{ødelagt' });
  for (let i = 0; i < 3; i++) assert.equal(loadGame(t).status, 'error');
  assert.equal(backupKeys(t).length, 2);
  assert.equal(t.getItem(BACKUP_PREFIX + 1), 'før migreringen');
});

// ---------- Kamptruppen 11 + 7 (commit 2) ----------
const { matchBenchOf, reservesOf, autoMatchBench, BENCH_SIZE } = await import('../../public/engine/career.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const act = await import('../../public/state/actions.js');
const { generatePlayer } = await import('../../public/engine/generator.js');
// En trup på 20: to ekstra (en forsvarer og en angriber) – reserver, når bænken er udtaget
function bigTeam(seed = 4) {
  const L = createLeague(createRng(seed)), T = L.teams[0], rng = createRng(99);
  T.squad.push(generatePlayer(rng, 'DEF', 'ROTATION', 19, 0, new Set(), 0, 'CB', 'plr_x1'), generatePlayer(rng, 'ATT', 'ROTATION', 20, 0, new Set(), 0, 'ST', 'plr_x2'));
  return { L, T };
}
test('kamptruppen: med 18 spillere er bænken de 7 ikke-startere (som før); med 20 udtages 7 – 1 MV og mindst 2 FOR, 2 MID, 1 ANG', () => {
  const L = createLeague(createRng(4)), t = L.teams[0];
  assert.deepEqual(matchBenchOf(t).map((p) => p.id), t.squad.filter((p) => !t.tactics.lineupSlots.includes(p.id)).map((p) => p.id));
  assert.deepEqual(reservesOf(t), []);
  const { T } = bigTeam();
  autoMatchBench(T);
  const b = matchBenchOf(T), lines = (l) => b.filter((p) => p.line === l).length;
  assert.equal(b.length, BENCH_SIZE); assert.equal(reservesOf(T).length, 2);
  assert.ok(lines('GK') >= 1 && lines('DEF') >= 2 && lines('MID') >= 2 && lines('ATT') >= 1, b.map((p) => p.line).join(','));
  assert.ok(b.every((p) => !T.tactics.lineupSlots.includes(p.id)));
  // En skadet tages ikke med, når en rask kan
  const inj = b.find((p) => p.line === 'DEF'); inj.injuryMatchesLeft = 3;
  autoMatchBench(T); assert.ok(!matchBenchOf(T).includes(inj));
});
test('kamptruppen i kampen: en reserve kommer aldrig ind – heller ikke ved skader og træthed (30 kampe)', () => {
  let subs = 0;
  for (let s = 1; s <= 30; s++) {
    const { L, T } = bigTeam(s);
    T.subsLimit = 95; autoMatchBench(T);
    const res = new Set(reservesOf(T).map((p) => p.id));
    const m = simulateMatch(T, L.teams[1], createRng(s * 7));
    for (const e of m.ratings.home) if (e.minIn > 0) { subs++; assert.ok(!res.has(e.playerId), `seed ${s}: reserven ${e.shortName} kom ind`); }
    assert.ok(m.ratings.home.every((e) => !res.has(e.playerId)), 'reserverne er ikke på karakterarket');
  }
  assert.ok(subs >= 30, `data: ${subs} indskiftninger`);
});
test('bænken og opstillingen overlapper aldrig: byt starter ⇄ bænk, reserve ⇄ bænk (din udtagelse slår automatikken fra), "Udtag automatisk"', () => {
  const { T } = bigTeam(); autoMatchBench(T);
  const st = T.tactics.lineupSlots[5], bn = T.matchBench[0], res = reservesOf(T)[0].id;
  act.swapPlayers(T, st, bn);
  assert.ok(T.tactics.lineupSlots.includes(bn) && T.matchBench.includes(st) && !T.matchBench.includes(bn));
  assert.ok(act.swapBench(T, res, T.matchBench[1])); assert.ok(T.matchBench.includes(res)); assert.equal(T.matchBenchAuto, false);
  assert.equal(act.swapBench(T, T.tactics.lineupSlots[0], T.matchBench[2]), false, 'en starter er ingen reserve');
  assert.ok(T.matchBench.every((id) => !T.tactics.lineupSlots.includes(id)));
  act.setAutoBench(T); assert.equal(T.matchBenchAuto, true); assert.equal(T.matchBench.length, 7);
});
test('udtagelsen: minimum pr. kæde slår stjernerne (MV med 1★ tages med frem for en 4★ ekstra); med 18 tæller en forældet matchBench ikke', () => {
  const { T } = bigTeam(); const on = new Set(T.tactics.lineupSlots), cand = T.squad.filter((p) => !on.has(p.id));
  for (const p of cand) Object.assign(p, { careerGames: 10, publicStars: 4 });
  const gk = cand.find((p) => p.line === 'GK'), mid = cand.filter((p) => p.line === 'MID');
  gk.publicStars = 1; mid.forEach((p) => { p.publicStars = 1; });
  autoMatchBench(T);
  const b = matchBenchOf(T);
  assert.ok(b.includes(gk), 'MV med'); assert.ok(b.filter((p) => p.line === 'MID').length >= Math.min(2, mid.length), 'to MID med');
  // 18 spillere og en bænk-liste, der peger på en starter (fx efter en direkte ændring af opstillingen): alle 7 ikke-startere
  const L = createLeague(createRng(5)), t = L.teams[0];
  t.matchBench = [t.tactics.lineupSlots[3], ...t.matchBench.slice(1)];
  assert.deepEqual(matchBenchOf(t).map((p) => p.id), t.squad.filter((p) => !t.tactics.lineupSlots.includes(p.id)).map((p) => p.id));
});
