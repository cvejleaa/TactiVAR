// v3.33.1 (brugerens ønsker 6/11): karrierestoppet varsles fra runde 7 (p.retiring – offentligt, værdien halv, lønnen uændret), sæsonens
// løbetal (sDistanceSum …) og gemmeformat 10 (MIGRATIONS[9], fixture save-v3.33.0.json lavet med bc5b1fb). Sæson 1 har ingen 31+:
// alderen sættes i gemmet (felt 34 = sikker), og en 31-årig, der IKKE stopper, må ikke få 👋.
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
const { parseSave, serialize, SCHEMA_VERSION } = await import('../../public/state/storage.js');
const { willRetire, publicValue, baseValue, publicWage, RETIRE_WARN_ROUND, RETIRE_VALUE } = await import('../../public/engine/career.js');
const { askPrice, buyPlayer, openWindow, windowOf, isStarter } = await import('../../public/engine/transfers.js');
const { viewPlayer } = await import('../../public/engine/visibility.js');
const { runStats } = await import('../../public/engine/stats.js');
const { renderMatrix } = await import('../../public/ui/matrix.js');
const { renderHome } = await import('../../public/ui/home.js');
const { renderCard } = await import('../../public/ui/card.js');
const { seasonReportShown } = await import('../../public/ui/season-report.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (root, id) => all(root, (e) => e.id === id || e.attrs.id === id)[0] ?? null;
const own = (L) => L.teams.find((t) => !t.isBot);
const players = (L) => L.teams.flatMap((t) => t.squad);
const play = (L, rng, n) => { for (let i = 0; i < n; i++) commitRound(L, playRound(L, rng), rng); };

// En ny liga gennem gemmet (som appen), med en sikker (34) og en 31-årig, der ikke stopper, på dit hold – og en sikker hos en bot
function world(seed = 7) {
  const L = parseSave(serialize({ league: createLeague(createRng(seed)), notes: {}, ui: {} })).state.league;
  const me = own(L), bot = L.teams.find((t) => t.isBot), fld = me.squad.filter((p) => p.line !== 'GK');
  const sure = fld.at(-1); sure.age = 34;
  const stay = fld.slice(0, -1).find((p) => { const a = p.age; p.age = 31; if (!willRetire(p, 1)) return true; p.age = a; return false; });
  const botSure = bot.squad.filter((p) => p.line !== 'GK').at(-1); botSure.age = 34;
  return { L, me, bot, sure, stay, botSure, rng: createRng(seed * 13) };
}

test('gemmeformat 10: fixture fra v3.33.0 (runde 9) migreres – markør, sæsonens løbetal på 0, 👋 = willRetire for netop de spillere, rundtur', () => {
  const RAW = fs.readFileSync(new URL('../fixtures/save-v3.33.0.json', import.meta.url), 'utf8'), raw = JSON.parse(RAW);
  assert.equal(raw.schemaVersion, 9);
  const rawAll = raw.league.teams.flatMap((t) => t.squad);
  assert.ok(raw.league.leagueMetadata.round + 1 - raw.league.seasonStartRound >= RETIRE_WARN_ROUND, 'data: sæsonens runde ≥ 7 er spillet');
  assert.ok(rawAll.some((p) => p.distanceSum > 0), 'data: der er løbet km');
  assert.ok(rawAll.every((p) => p.retiring === undefined && p.sDistanceSum === undefined), 'data: v3.33.0 kendte ikke felterne');
  assert.ok(rawAll.some((p) => p.line !== 'GK' && p.age >= 31 && willRetire(p, 1)), 'data: mindst én markspiller ≥ 31, der stopper');
  assert.ok(rawAll.some((p) => p.age >= 31 && !willRetire(p, 1)), 'data: en 31+-spiller, der IKKE stopper');
  const r = parseSave(RAW);
  assert.ok(r.ok, r.error);
  assert.equal(SCHEMA_VERSION, 10);
  assert.equal(r.migratedFrom, 9);
  const L = r.state.league;
  assert.equal(L.runStatsFromRound, raw.league.leagueMetadata.round + 1, 'sæsonens løbetal tælles fra næste runde ("fra R10")');
  for (const p of players(L)) {
    assert.deepEqual([p.sDistanceSum, p.sMinutesSum, p.sHiKmSum, p.sHiDistSum], [0, 0, 0, 0]);
    assert.equal(p.retiring, willRetire(p, L.leagueMetadata.seasonNumber), p.shortName);
  }
  const flagged = players(L).filter((p) => p.retiring).map((p) => p.id).sort();
  assert.deepEqual(flagged, rawAll.filter((p) => willRetire(p, 1)).map((p) => p.id).sort());
  assert.ok(flagged.length >= 2);
  assert.ok(players(L).some((p) => p.age >= 31 && !p.retiring), 'en 31-årig, der ikke stopper, får intet flag');
  // karrieren er urørt
  const a = rawAll.find((p) => p.distanceSum > 0);
  assert.equal(players(L).find((p) => p.id === a.id).distanceSum, a.distanceSum);
  const back = parseSave(serialize(r.state));
  assert.ok(back.ok, back.error);
  assert.equal(back.migratedFrom, null);
  assert.deepEqual(players(back.state.league).filter((p) => p.retiring).map((p) => p.id).sort(), flagged);
  assert.equal(back.state.league.runStatsFromRound, L.runStatsFromRound);
});

test('migreringen før sæsonens runde 7 og lige efter sæsonslut: intet 👋 (vinduet før runde 8 er ikke nået)', () => {
  const RAW = JSON.parse(fs.readFileSync(new URL('../fixtures/save-v3.33.0.json', import.meta.url), 'utf8'));
  for (const round of [6, 14]) {
    const d = structuredClone(RAW);
    d.league.leagueMetadata.round = round;
    if (round === 14) d.league.seasonStartRound = 15;   // lige efter sæsonslut: 0 runder spillet i den nye sæson
    const r = parseSave(JSON.stringify(d));
    assert.ok(r.ok, r.error);
    assert.equal(players(r.state.league).filter((p) => p.retiring).length, 0, `runde ${round}`);
    assert.ok(players(r.state.league).some((p) => willRetire(p, 1)), 'data: der ER spillere, der ville stoppe');
  }
});

const W = world();
const snap = (L) => new Map(players(L).map((p) => [p.id, p.retiring]));
play(W.L, W.rng, RETIRE_WARN_ROUND - 1);
const afterSix = snap(W.L);
const distBefore = new Map(players(W.L).map((p) => [p.id, [p.distanceSum, p.sDistanceSum]]));
play(W.L, W.rng, 1);

test('runde 7 sætter 👋 for alle hold FØR vinduet – ikke i runde 6; en 31-årig, der ikke stopper, får det ikke', () => {
  assert.equal(RETIRE_WARN_ROUND, 7);
  assert.ok([...afterSix.values()].every((v) => !v), 'efter runde 6: intet flag');
  assert.ok(W.sure.retiring && W.botSure.retiring, 'de sikre (34) – dit hold og en bot – er markeret efter runde 7');
  assert.equal(W.stay.age, 31);
  assert.equal(W.stay.retiring, false, 'den 31-årige, der ikke stopper');
  for (const p of players(W.L)) assert.equal(!!p.retiring, willRetire(p, 1), p.shortName);
  assert.ok(windowOf(W.L) != null, 'vinduet før runde 8 er åbent, mens 👋 står');
  assert.ok(viewPlayer(W.botSure, false).retiring, 'flaget er offentligt (modstanderens kort/Trup)');
});

test('sæsonens løbetal: tælles ved siden af karrierens (samme km i runden), nulstilles ved sæsonslut og arkiveres', () => {
  const ran = players(W.L).filter((p) => p.distanceSum > distBefore.get(p.id)[0]);
  assert.ok(ran.length > 20, 'data: spillere løb i runden');
  for (const p of ran) assert.ok(Math.abs((p.distanceSum - distBefore.get(p.id)[0]) - (p.sDistanceSum - distBefore.get(p.id)[1])) < 1e-9, p.shortName);
  const p = ran[0];
  assert.ok(p.sMinutesSum > 0 && p.sHiDistSum > 0 && runStats(p, 'season').km90 > 0);
  // en spiller med karriere-km men ingen sæson: sæsonens runStats er null
  assert.equal(runStats({ distanceSum: 50, minutesSum: 450, hiKmSum: 4, hiDistSum: 20, sDistanceSum: 0, sMinutesSum: 0 }, 'season').km90, null);
  assert.equal(runStats({ distanceSum: 50, minutesSum: 450 }, 'career').km90, 10);
  const L = structuredClone(W.L), q = players(L).find((x) => x.id === p.id);
  endSeason(L, L.leagueMetadata.round, true);
  assert.equal(q.sDistanceSum, 0);
  assert.equal(q.distanceSum, p.distanceSum, 'karrieren nulstilles ikke');
  assert.equal(L.lastSeasonStats.players[p.id].sDistanceSum, p.sDistanceSum, 'arkivet har sæsonens km');
  assert.equal(L.runStatsFromRound, L.leagueMetadata.round + 1);
  assert.equal(L.seasons.at(-1).runStatsFrom, 1, 'ny liga: fra sæsonens runde 1');
  assert.equal(createLeague(createRng(3)).runStatsFromRound, 1);
});

test('værdifald (Spilfører økonomi): en 31-årig starter, der stopper, koster 525.000 i vinduet (før 1.050.000) – lønnen 36.000 (ikke 18.000)', () => {
  const L = structuredClone(W.L), me = own(L);
  const cands = L.teams.filter((t) => t.isBot).flatMap((t) => t.squad.filter((p) => p.line !== 'GK' && isStarter(t, p)).map((p) => ({ t, p })));
  const setup = (p, retire) => { p.age = 31; p.careerGames = 7; p.valueStars = 3; p.retiring = retire; };
  const go = cands.find(({ p }) => { const a = p.age; p.age = 31; const r = willRetire(p, 1); p.age = a; return r; });
  const stays = cands.find((c) => c !== go);
  setup(go.p, true); setup(stays.p, false);
  assert.ok(windowOf(L) != null);
  assert.equal(baseValue(go.p), 650000);
  assert.equal(publicValue(go.p), 325000, `RETIRE_VALUE ${RETIRE_VALUE}`);
  assert.equal(askPrice(go.t, go.p), 525000, 'gammel regel: 1.050.000');
  assert.equal(askPrice(stays.t, stays.p), 1050000, 'en ikke-stopper i samme vindue: fuld pris');
  assert.equal(publicWage(go.p), 36000);
  me.cashBalance = 9000000;
  const err = buyPlayer(L, me, go.p.id);
  assert.equal(err, null, err);
  const bought = me.squad.find((p) => p.id === go.p.id);
  assert.equal(bought.weeklyWage, 36000, 'lønnen falder ikke ved købet (halv: 18.000)');
  assert.equal(me.finance.ledger.at(-1).transfers, -525000);
});

test('botterne forstærker (vinduets trin 3) aldrig med en, der stopper – uden flaget køber de', () => {
  // Trin 3 i praksis (alle botter starter 2/6/6/4 – den tyndeste kæde er MV, og ingen har MV i overskud): køberen A får en ekstra MV
  // (tyndest bliver FOR), sælgeren B to ekstra forsvarere (8 > minimum + 1). Kun A har råd (over 2 mio.)
  const run = (retire) => {
    const L = structuredClone(W.L), [A, B] = L.teams.filter((t) => t.isBot);
    const clone = (t, line, k) => { const p = structuredClone(t.squad.find((x) => x.line === line && !isStarter(t, x))); Object.assign(p, { id: `${p.id}_x${k}`, shortName: `X${k}. Klon`, shirtNumber: 90 + k, lastMove: undefined }); t.squad.push(p); };
    clone(A, 'GK', 1); clone(B, 'DEF', 2); clone(B, 'DEF', 3);
    for (const t of L.teams) { if (t.isBot) t.cashBalance = t === A ? 9000000 : 1000000; for (const p of t.squad) p.retiring = retire && !isStarter(t, p); }
    const n0 = L.transferLog.length;
    openWindow(L);
    return L.transferLog.slice(n0).filter((e) => e.kind === 'buy');
  };
  const control = run(false);
  assert.ok(control.length >= 1, 'data: trin 3 handler i dette vindue (kontrol uden flag)');
  assert.equal(run(true).length, 0, 'alle ikke-startere stopper: ingen forstærkning');
});

test('Trup: 👋 efter navnet for alle hold (offentligt) – ikke for den 31-årige, der bliver, og ikke mens runde 7 afspilles', () => {
  const draw = (team, isOwn, shown) => renderMatrix({ team, isOwn, ui: { sortCol: 'pos', sortDesc: false, filter: 'all', gains: new Map(), gainRound: 7, retiringShown: shown }, notes: {}, onSort() {}, onSelect() {}, onFilter() {}, onBlocked() {} });
  const tagOf = (root, id) => all(all(root, (e) => e.tag === 'tr' && e.dataset.pid === id)[0], (e) => e.className === 'retiring-tag')[0] ?? null;
  const mine = draw(own(W.L), true, true);
  assert.equal(tagOf(mine, W.sure.id)?.textContent, '👋');
  assert.equal(tagOf(mine, W.sure.id).attrs.title, 'Stopper efter sæsonen (34 år)');
  assert.equal(tagOf(mine, W.stay.id), null, 'den 31-årige, der ikke stopper');
  assert.equal(all(mine, (e) => e.className === 'retiring-tag').length, own(W.L).squad.filter((p) => p.retiring).length);
  assert.equal(tagOf(draw(W.bot, false, true), W.botSure.id)?.textContent, '👋', 'en modstanders spiller (offentligt)');
  assert.equal(all(draw(own(W.L), true, false), (e) => e.className === 'retiring-tag').length, 0, 'under afspilningen af runde 7');
});

test('kortet: "Stopper efter sæsonen" med værdi og uændret løn (dit hold) – modstanderens uden tal', () => {
  const ownCard = renderCard({ player: W.sure, team: own(W.L), isOwn: true, scouting: [], note: '', onNote() {}, retiring: true });
  const t = byId(ownCard, 'card-retiring').textContent;
  assert.ok(t.startsWith('👋 Stopper efter sæsonen (34 år) – værdi ') && t.includes('(halv: 7 af 14 runder tilbage). Løn uændret '), t);
  assert.ok(!t.includes('overvejer'), 'udfaldet er afgjort');
  const opp = renderCard({ player: viewPlayer(W.botSure, false), team: W.bot, isOwn: false, scouting: [], note: '', onNote() {}, retiring: true });
  assert.equal(byId(opp, 'card-retiring').textContent, `👋 ${W.botSure.shortName} stopper efter sæsonen (34 år).`);
});

test('Hjem: 👋-linjen er info – tæller ikke i "N ting", "Holdet er klar" står; "… og N mere"; vinduet/afløseren; Trup ›', () => {
  const calls = [];
  const on = { trup: () => calls.push('trup'), youth() {}, kamp() {}, liga() {}, klub() {}, traening() {}, taktik() {}, opp() {}, fix() {}, paper() {} };
  const ps = [4, 9, 11, 15].map((n) => ({ shirtNumber: n, shortName: `S${n}`, line: 'FOR', age: 31 + (n % 3) }));
  const base = { club: { name: 'Mit', cash: 100, delta: null }, last: null, place: 3, ended: false, roundsPlayed: 7, next: { k: 8, of: 14, name: 'Bot', home: true, place: 2, form: [] },
    issues: [], youth: 0, training: null, table: [], playing: false, on };
  const r = renderHome({ ...base, retiring: { players: ps.slice(0, 1), windowOpen: true, windowTo: 8 } });
  assert.equal(byId(r, 'home-retiring').textContent, '👋Stopper efter sæsonen: #4 S4 (FOR, 32 år) – vinduet er åbent til runde 8Trup ›');
  assert.ok(byId(r, 'home-ready'), '"Holdet er klar" står stadig');
  assert.ok(!byId(r, 'home-todo').textContent.includes('ting'), 'ingen antal-pille');
  calls.length = 0; all(byId(r, 'home-retiring'), (e) => e.tag === 'button')[0].on.click(); assert.deepEqual(calls, ['trup']);
  const many = renderHome({ ...base, retiring: { players: ps, windowOpen: false, windowTo: 9 } });
  assert.equal(byId(many, 'home-retiring').textContent, '👋Stopper efter sæsonen: #4 S4 (FOR, 32 år) · #9 S9 (FOR, 31 år) · #11 S11 (FOR, 33 år) … og 1 mere – find en afløser ved sæsonslutTrup ›');
  assert.equal(byId(renderHome({ ...base, retiring: { players: [], windowOpen: true, windowTo: 8 } }), 'home-retiring'), null);
  // under afspilning: ingen "Før du spiller" – heller ikke 👋
  assert.equal(byId(renderHome({ ...base, playing: true, retiring: { players: ps, windowOpen: true, windowTo: 8 } }), 'home-retiring'), null);
});

test('sæsonrapporten: ÉT prædikat for Hjem og Klub – kun lige efter sæsonslut for netop den sæson', () => {
  const L = { turnoverReport: { season: 1 }, seasons: [{ seasonNumber: 1 }], leagueMetadata: { round: 14 }, seasonStartRound: 15 };
  assert.equal(seasonReportShown(L), true);
  assert.equal(seasonReportShown({ ...L, leagueMetadata: { round: 15 } }), false, 'runde 1 i den nye sæson er spillet');
  assert.equal(seasonReportShown({ ...L, turnoverReport: { season: 0 } }), false, 'en gammel rapport');
  assert.equal(seasonReportShown({ ...L, turnoverReport: undefined }), false);
  // Hjem kalder report() efter afspilnings-vagten: aldrig under afspilningen
  let called = 0;
  const on = { kamp() {}, liga() {}, klub() {}, traening() {}, taktik() {}, opp() {}, fix() {}, paper() {}, youth() {}, trup() {} };
  const base = { club: { name: 'Mit', cash: 1, delta: null }, last: null, place: 3, ended: true, roundsPlayed: 0, next: { k: 1, of: 14, name: 'Bot', home: true, place: 2, form: [] }, issues: [], youth: 2, training: null, table: [], on,
    report: () => { called++; const d = new FakeEl('div'); d.setAttribute('id', 'season-report'); return d; } };
  assert.equal(byId(renderHome({ ...base, playing: true }), 'season-report'), null);
  assert.equal(called, 0, 'rapporten bygges ikke under afspilningen');
  const home = renderHome({ ...base, playing: false });
  assert.ok(byId(home, 'season-report'));
  const main = all(home, (e) => e.className === 'home-main')[0];
  assert.equal(main.children[0].id, 'season-report', 'øverst i hovedkolonnen – over "Sidste runde"');
});
