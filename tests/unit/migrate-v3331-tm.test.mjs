// Test Manager, v3.33.1: det forfatterens suite lod overleve – gemmeformat 9 → 10 for ALLE fixtures (ikke kun v3.33.0), grænserunden 7,
// sæsonnummeret i afledningen, 👋-flagets rækkefølge FØR vinduet, sæsonens løbetal pr. felt, prisafrunding og de tre visninger af 👋
// (købskortet, "dine spillere til salg", den offentlige klubside), som ingen test rørte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.on = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; }
  addEventListener(t, f) { this.on[t] = f; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { playRound, commitRound, endSeason } = await import('../../public/engine/season.js');
const { parseSave, serialize, loadGame, MIGRATIONS, SCHEMA_VERSION, SAVE_KEY } = await import('../../public/state/storage.js');
const { willRetire, publicValue, baseValue, RETIRE_WARN_ROUND } = await import('../../public/engine/career.js');
const { marketInfo, isStarter, windowOf } = await import('../../public/engine/transfers.js');
const { viewPlayer, viewTeam } = await import('../../public/engine/visibility.js');
const { renderCard } = await import('../../public/ui/card.js');
const { renderMarket, renderPublicClub } = await import('../../public/ui/club.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (root, id) => all(root, (e) => e.id === id || e.attrs.id === id)[0] ?? null;
const own = (L) => L.teams.find((t) => !t.isBot);
const players = (L) => L.teams.flatMap((t) => t.squad);
const FIX = new URL('../fixtures/', import.meta.url);
const FILES = fs.readdirSync(FIX).filter((f) => f.endsWith('.json')).sort();
const read = (f) => fs.readFileSync(new URL(f, FIX), 'utf8');
const NEW = ['retiring', 'sDistanceSum', 'sMinutesSum', 'sHiKmSum', 'sHiDistSum'];
const strip = (d) => { delete d.schemaVersion; delete d.league?.runStatsFromRound; for (const t of d.league?.teams ?? []) for (const p of t.squad ?? []) for (const k of NEW) delete p[k]; return d; };

test('9 → 10 er ren tilføjelse for ALLE fixtures: kør kæden til skema 9, så MIGRATIONS[9] – intet andet end de nye felter ændres', () => {
  assert.ok(FILES.length >= 19, `data: ${FILES.length} fixtures`);
  let n = 0;
  for (const f of FILES) {
    let d = JSON.parse(read(f));
    if (d.schemaVersion > 9) continue;
    for (let v = d.schemaVersion; v < 9; v++) d = MIGRATIONS[v](d);
    assert.equal(d.schemaVersion, 9, f);
    const before = strip(structuredClone(d)), out = MIGRATIONS[9](structuredClone(d));
    assert.equal(out.schemaVersion, 10, f);
    for (const p of players(out.league)) { assert.equal(typeof p.retiring, 'boolean', f); for (const k of NEW.slice(1)) assert.equal(p[k], 0, `${f} ${k}`); }
    assert.ok(Number.isInteger(out.league.runStatsFromRound), f);
    assert.deepEqual(strip(structuredClone(out)), before, `${f}: 9 → 10 ændrede andet end de nye felter`);
    n++;
    assert.ok(players(out.league).length >= 100, `data: ${f} har spillere`);
  }
  assert.ok(n >= 17, `data: ${n} fixtures kørt`);
});

test('ALLE fixtures indlæses til skema 10: markør = runde + 1, 👋 = (sæsonens runde ≥ 7) og willRetire for netop dét sæsonnummer, løbetal 0, karrierens km urørt', () => {
  let flaggedTotal = 0, early = 0, late = 0;
  for (const f of FILES) {
    const raw = JSON.parse(read(f)), r = parseSave(read(f));
    assert.ok(r.ok, `${f}: ${r.error}`);
    const L = r.state.league, md = L.leagueMetadata, played = md.round + 1 - L.seasonStartRound;
    assert.equal(r.migratedFrom, raw.schemaVersion >= 10 ? null : raw.schemaVersion, f);
    assert.equal(L.runStatsFromRound, md.round + 1, `${f}: løbetal tælles fra næste runde`);
    for (const p of players(L)) {
      assert.deepEqual([p.sDistanceSum, p.sMinutesSum, p.sHiKmSum, p.sHiDistSum], [0, 0, 0, 0], `${f} ${p.shortName}`);
      assert.equal(p.retiring, played >= RETIRE_WARN_ROUND && willRetire(p, md.seasonNumber ?? 1), `${f} ${p.shortName} (spillet ${played})`);
      if (p.retiring) flaggedTotal++;
    }
    if (played >= RETIRE_WARN_ROUND) late++; else early++;
    // karrieren er urørt (for de fixtures, der har den)
    const rawBy = new Map(raw.league.teams.flatMap((t) => t.squad).map((p) => [p.id, p]));
    for (const p of players(L)) { const o = rawBy.get(p.id); if (o?.distanceSum > 0) assert.equal(p.distanceSum, o.distanceSum, `${f} ${p.shortName}`); }
    const back = parseSave(serialize(r.state));
    assert.ok(back.ok && back.migratedFrom === null, f);
    assert.deepEqual(players(back.state.league).map((p) => [p.id, p.retiring, p.sDistanceSum]), players(L).map((p) => [p.id, p.retiring, p.sDistanceSum]), `${f}: rundtur`);
  }
  assert.ok(late >= 3 && early >= 10, `data: ${late} fixtures efter runde 7, ${early} før`);
  assert.ok(flaggedTotal >= 2, 'data: nogen er flagget');
});

test('grænserunden: sæsonens runde 6 spillet = intet 👋, runde 7 = 👋 – i sæson 1 (start 1) og sæson 2 (start 15, andet sæsonnummer i rng)', () => {
  const RAW = JSON.parse(read('save-v3.33.0.json'));
  // Sæson 1 i fixturet har kun få 31+: giv hver tredje 32, hver tredje 33 (sandsynlighed ½ / ¾) – så sæsonnummeret i den afledte rng kan ses
  RAW.league.teams.forEach((t) => t.squad.forEach((p, i) => { p.age = [32, 33, 28][i % 3]; }));
  const mk = (round, start, season) => { const d = structuredClone(RAW); d.league.leagueMetadata.round = round; d.league.seasonStartRound = start; d.league.leagueMetadata.seasonNumber = season; return parseSave(JSON.stringify(d)); };
  const flagged = (r) => players(r.state.league).filter((p) => p.retiring).map((p) => p.id).sort();
  const ids = (season) => RAW.league.teams.flatMap((t) => t.squad).filter((p) => willRetire(p, season)).map((p) => p.id).sort();
  assert.notDeepEqual(ids(1), ids(2), 'data: sæson 1 og 2 giver ikke de samme stoppere (ellers måler testen ikke sæsonnummeret)');
  assert.ok(ids(1).length >= 20 && ids(2).length >= 20 && ids(1).length < 150, 'data');
  for (const [start, season] of [[1, 1], [15, 2], [1, 2]]) {
    const six = mk(start + 5, start, season), seven = mk(start + 6, start, season);
    assert.ok(six.ok && seven.ok, six.error ?? seven.error);
    assert.deepEqual(flagged(six), [], `start ${start}: efter sæsonens runde 6`);
    assert.deepEqual(flagged(seven), ids(season), `start ${start}, sæson ${season}: efter sæsonens runde 7 = willRetire for netop dét sæsonnummer`);
    assert.equal(seven.state.league.runStatsFromRound, start + 7);
  }
});

test('beskadiget gem: uden liga, uden hold, hold uden trup – parseSave afviser/reparerer, men KASTER ikke (loadGame ville vise fejlsiden med backup)', () => {
  assert.equal(parseSave(JSON.stringify({ schemaVersion: 9 })).ok, false);
  assert.equal(parseSave(JSON.stringify({ schemaVersion: 9, league: {} })).ok, false);
  assert.equal(parseSave(JSON.stringify({ schemaVersion: 9, league: { teams: 'x' } })).ok, false);
  const d = JSON.parse(read('save-v3.33.0.json')); delete d.league.teams[3].squad; delete d.league.leagueMetadata.round;
  assert.doesNotThrow(() => parseSave(JSON.stringify(d)));
  const e = JSON.parse(read('save-v3.33.0.json')); delete e.league.teams[3].squad;
  assert.doesNotThrow(() => MIGRATIONS[9](e));
  const f = JSON.parse(read('save-v3.33.0.json')); f.league.leagueMetadata.round = 'ni';
  assert.doesNotThrow(() => MIGRATIONS[9](f));
  assert.equal(MIGRATIONS[9](f).league.runStatsFromRound, 1, 'ugyldig runde = 0 → markør 1');
});

test('sanitize: p.retiring er kun true/false – en importeret tekst, et tal eller null giver INTET 👋; true bevares', () => {
  const st = parseSave(read('save-v3.33.0.json')).state, ps = players(st.league);
  const keep = ps.find((p) => p.retiring);
  assert.ok(keep, 'data');
  const junk = [ps.find((p) => !p.retiring), ps.filter((p) => !p.retiring)[1], ps.filter((p) => !p.retiring)[2], ps.filter((p) => !p.retiring)[3]];
  [junk[0].retiring, junk[1].retiring, junk[2].retiring, junk[3].retiring] = ['ja', 1, null, 'false'];
  const back = parseSave(serialize(st));
  assert.ok(back.ok, back.error);
  const by = new Map(players(back.state.league).map((p) => [p.id, p.retiring]));
  for (const j of junk) assert.strictEqual(by.get(j.id), false, String(j.shortName));
  assert.strictEqual(by.get(keep.id), true);
});

test('loadGame: v3.33.0-gemmet migreres, backup = de RÅ data uændret (kan fortrydes), og et gem i skema 10 giver ingen ny backup/besked', () => {
  const RAW = read('save-v3.33.0.json'), mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] ?? null };
  mem.set(SAVE_KEY, RAW);
  const r = loadGame(storage);
  assert.equal(r.status, 'ok'); assert.equal(r.migratedFrom, 9);
  assert.ok(r.backupKey?.startsWith('tactivar_backup_'));
  assert.equal(storage.getItem(r.backupKey), RAW, 'backuppen er de rå skema-9-data');
  const again = loadGame({ ...storage, getItem: () => serialize(r.state) });
  assert.equal(again.migratedFrom, null); assert.equal(again.backupKey, null);
});

// ---------- ét fælles spil: 6 runder, så runde 7 ----------
function world(seed = 11) {
  const L = parseSave(serialize({ league: createLeague(createRng(seed)), notes: {}, ui: {} })).state.league;
  return { L, rng: createRng(seed * 7) };
}

test('sæsonens løbetal: ALLE fire felter følger karrierens fire (minutter, HI-km og HI-distance hver for sig) – og nulstilles + arkiveres hver for sig', () => {
  const { L, rng } = world();
  commitRound(L, playRound(L, rng), rng);
  const snap = () => new Map(players(L).map((p) => [p.id, [p.distanceSum, p.minutesSum, p.hiKmSum, p.hiDistSum, p.sDistanceSum, p.sMinutesSum, p.sHiKmSum, p.sHiDistSum]]));
  const b = snap();
  commitRound(L, playRound(L, rng), rng);
  let ran = 0, differ = 0;
  for (const p of players(L)) {
    const o = b.get(p.id), d = [p.distanceSum - o[0], p.minutesSum - o[1], p.hiKmSum - o[2], p.hiDistSum - o[3]], s = [p.sDistanceSum - o[4], p.sMinutesSum - o[5], p.sHiKmSum - o[6], p.sHiDistSum - o[7]];
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(d[i] - s[i]) < 1e-9, `${p.shortName} felt ${i}: karriere ${d[i]} ≠ sæson ${s[i]}`);
    if (d[0] > 0) { ran++; assert.ok(d[1] > 0, `${p.shortName} ${JSON.stringify(d)}`); if (d[3] > 0 && d[2] > 0 && new Set(d.slice(0, 3).map((x) => x.toFixed(6))).size === 3) differ++; }
  }
  assert.ok(ran > 20 && differ > 10, `data: ${ran} løb, ${differ} med forskellige km/minutter/HI-km (HI-distance = distance, når HI-data findes)`);
  const sample = players(L).find((p) => p.sHiKmSum > 0 && p.sMinutesSum > 0), keep = { d: sample.sDistanceSum, m: sample.sMinutesSum, hk: sample.sHiKmSum, hd: sample.sHiDistSum };
  const C = structuredClone(L), q = players(C).find((x) => x.id === sample.id);
  endSeason(C, C.leagueMetadata.round, true);
  assert.deepEqual([q.sDistanceSum, q.sMinutesSum, q.sHiKmSum, q.sHiDistSum], [0, 0, 0, 0]);
  const a = C.lastSeasonStats.players[sample.id];
  assert.deepEqual([a.sDistanceSum, a.sMinutesSum, a.sHiKmSum, a.sHiDistSum], [keep.d, keep.m, keep.hk, keep.hd]);
});

test('runde 7: 👋 sættes FØR vinduets handler – botterne forstærker ikke med stoppere (kontrol: samme opsætning uden stoppere handler)', () => {
  const run = (age) => {
    const { L, rng } = world(13);
    for (let i = 0; i < RETIRE_WARN_ROUND - 1; i++) commitRound(L, playRound(L, rng), rng);   // sæsonens runde 6 er spillet
    const [A, B] = L.teams.filter((t) => t.isBot);
    const clone = (t, line, k) => { const p = structuredClone(t.squad.find((x) => x.line === line && !isStarter(t, x))); Object.assign(p, { id: `${p.id}_x${k}`, shortName: `X${k}. Klon`, shirtNumber: 90 + k, lastMove: undefined }); t.squad.push(p); };
    clone(A, 'GK', 1); clone(B, 'DEF', 2); clone(B, 'DEF', 3);   // A tyndest i FOR, B har overskud i FOR (8 > 6 + 1)
    for (const t of L.teams) if (t.isBot) { t.cashBalance = t === A ? 20000000 : 1000000; if (t !== A) for (const p of t.squad) if (!isStarter(t, p)) p.age = age; }   // ALLE sælgerens reserver: 34 = sikker stopper
    const res = playRound(L, rng), n0 = L.transferLog.length;
    commitRound(L, res, rng);
    return { buys: L.transferLog.slice(n0).filter((e) => e.kind === 'buy'), L };
  };
  const stay = run(25), go = run(34);
  assert.ok(windowOf(stay.L) != null && windowOf(go.L) != null, 'vinduet er åbent efter sæsonens runde 7');
  assert.ok(stay.buys.length >= 1, 'data: uden stoppere køber A en forstærkning (kontrol)');
  assert.ok(players(go.L).filter((p) => p.age === 34 && p.retiring).length >= 5, 'data: reserverne er markeret');
  assert.equal(go.buys.length, 0, 'ingen køber en stopper: flaget stod, FØR vinduet åbnede');
});

test('publicValue: den halve værdi afrundes til hele 25.000 (en ulige 25.000-multipel halveres til …12.500 og runder OP), ikke-stoppere urørte', () => {
  const { L } = world(5), ps = players(L).slice(0, 60);
  let odd = 0;
  for (const p of ps) for (const age of [20, 25, 29, 32, 35]) for (const stars of [1, 2, 3, 4, 5]) {
    const q = { ...p, age, careerGames: 9, valueStars: stars, publicStars: stars }, base = baseValue(q);
    assert.equal(publicValue({ ...q, retiring: false }), base);
    const half = publicValue({ ...q, retiring: true });
    assert.equal(half % 25000, 0, `${stars}★ ${age} år: ${half}`);
    assert.equal(half, Math.max(25000, Math.round(base / 2 / 25000) * 25000), `${stars}★ ${age} år: base ${base}`);
    if ((base / 25000) % 2 === 1) odd++;
  }
  assert.ok(odd >= 20, `data: ${odd} ulige multipler`);
});

// ---------- visningerne af 👋, som ingen test rørte ----------
test('købskortet (modstanderens spiller i vinduet): "Pris … han stopper efter sæsonen: 7 runder for prisen." – kun for en stopper', () => {
  const { L } = world(3), bot = L.teams.find((t) => t.isBot), p = bot.squad.find((x) => x.line !== 'GK');
  const card = (retiring) => { const q = { ...p, retiring }; return renderCard({ player: viewPlayer(q, false), team: bot, isOwn: false, scouting: [], note: '', onNote() {}, market: { price: 525000, starter: false, wage: 36000, room: 90000, cashAfter: 1, reason: null, onBuy() {} } }); };
  assert.equal(byId(card(true), 'buy-retiring')?.textContent, 'Pris 525.000 kr. – han stopper efter sæsonen: 7 runder for prisen.');
  assert.equal(byId(card(false), 'buy-retiring'), null);
});

test('Klub: "dine spillere til salg" og den offentlige klubside viser 👋 for en stopper – og for ingen andre', () => {
  const { L } = world(3), me = own(L), bot = L.teams.find((t) => t.isBot);
  const a = me.squad.filter((x) => x.line !== 'GK')[0], b = me.squad.filter((x) => x.line !== 'GK')[1];
  a.retiring = true; b.retiring = false; me.listed = [a.id, b.id];
  const m = renderMarket({ league: L, team: me, playing: false, onAccept() {}, onDecline() {}, onUnlist() {} });
  const row = (id) => all(m, (e) => e.className === 'market-row' && e.dataset.pid === id)[0];
  assert.ok(row(a.id).textContent.includes(`(${publicValue(a).toLocaleString('da-DK')} kr. · 👋 stopper)`) || /· 👋 stopper\)/.test(row(a.id).textContent), row(a.id).textContent.slice(0, 80));
  assert.ok(!row(b.id).textContent.includes('👋'));
  const c = bot.squad[3], d = bot.squad[4]; c.retiring = true; d.retiring = false;
  const pc = renderPublicClub({ league: L, pub: viewTeam(bot, false), me, playing: false, onBuy() {}, onBack() {} });
  const tr = (id) => all(pc, (e) => e.tag === 'tr' && e.dataset.pid === id)[0];
  const tag = all(tr(c.id), (e) => e.className === 'retiring-tag')[0];
  assert.equal(tag?.textContent, ' 👋');
  assert.equal(tag.attrs.title, `Stopper efter sæsonen (${c.age} år) – værdien er halv`);
  assert.equal(all(tr(d.id), (e) => e.className === 'retiring-tag').length, 0);
  assert.equal(all(pc, (e) => e.className === 'retiring-tag').length, bot.squad.filter((x) => x.retiring).length);
});
