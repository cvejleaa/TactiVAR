// v3.18.0 (8): transfers – vinduer, fast pris, grænser, bud på dine spillere, botternes handler, kanarietest (B7)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound } from '../../public/engine/season.js';
import { windowOf, askPrice, buyPlayer, marketInfo, setListed, acceptOffer, declineOffer, openWindow, quarantined } from '../../public/engine/transfers.js';
import { publicValue, publicWage, weeklyWages, wageBudget } from '../../public/engine/career.js';

const fresh = (s = 8) => createLeague(createRng(s));
const own = (L) => L.teams.find((t) => !t.isBot);
const play = (L, n, seed = 2) => { const rng = createRng(seed); for (let i = 0; i < n; i++) commitRound(L, playRound(L, rng), rng); };
const reserve = (t, line) => t.squad.find((p) => p.line === line && !t.tactics.lineupSlots.includes(p.id));
// Sælgeren skal have over 18 for at sælge: ekstra spillere (kopier af en reserve) med egne id'er, navne og numre
const grow = (t, n, tag, line = 'ATT') => t.squad.push(...Array.from({ length: n }, (_, i) => ({ ...structuredClone(reserve(t, line) ?? starter(t, line)), id: `${tag}${i}`, shortName: `${tag.toUpperCase()}. G${i}`, shirtNumber: 60 + i })));
const starter = (t, line) => t.squad.find((p) => p.line === line && t.tactics.lineupSlots.includes(p.id));

test('vinduerne: åbent før sæsonens runde 1 og runde 8 – ellers lukket; id tæller 2 pr. sæson', () => {
  const L = fresh();
  assert.equal(windowOf(L), 2);
  play(L, 1); assert.equal(windowOf(L), null);
  play(L, 6); assert.equal(windowOf(L), 3);
  play(L, 1); assert.equal(windowOf(L), null);
  play(L, 6); assert.equal(windowOf(L), 4, 'efter sæsonslut: sæson 2, første vindue');
});

test('prisen: offentlig værdi · 1,3 – en starter · 1,6 – rundet til 25.000', () => {
  const L = fresh(), b = L.teams[1], r = reserve(b, 'MID'), s = starter(b, 'MID');
  assert.equal(askPrice(b, r), Math.round(publicValue(r) * 1.3 / 25000) * 25000);
  assert.equal(askPrice(b, s), Math.round(publicValue(s) * 1.6 / 25000) * 25000);
});

test('køb: spilleren flytter, kasserne følger prisen, lønnen genforhandles, nyt nummer ved behov, offentlig log', () => {
  const L = fresh(), me = own(L), b = L.teams[2]; grow(b, 2, 'g', 'MID');
  const p = reserve(b, 'MID'), price = askPrice(b, p);
  const cash = [me.cashBalance, b.cashBalance];
  assert.ok(me.squad.some((x) => x.shirtNumber === p.shirtNumber), 'data: nummeret er optaget hos dig');
  assert.equal(buyPlayer(L, me, p.id), null);
  assert.ok(me.squad.includes(p)); assert.ok(!b.squad.includes(p));
  assert.equal(me.cashBalance, cash[0] - price); assert.equal(b.cashBalance, cash[1] + price);
  assert.equal(me.finance.ledger.at(-1).transfers, -price); assert.equal(b.finance.ledger.at(-1).transfers, price);
  assert.equal(p.weeklyWage, publicWage(p)); assert.equal(p.lastMove, 2);
  assert.equal(new Set(me.squad.map((x) => x.shirtNumber)).size, me.squad.length);
  assert.deepEqual(L.transferLog.at(-1), { s: 1, r: 0, id: p.id, name: p.shortName, from: b.id, to: me.id, price, kind: 'buy' });
});

test('køb af en starter: sælgerens opstilling repareres med en fra samme kæde', () => {
  const L = fresh(), me = own(L), b = L.teams[3]; grow(b, 2, 'g', 'DEF');
  const p = starter(b, 'DEF'), slot = b.tactics.lineupSlots.indexOf(p.id);
  me.cashBalance = 50000000;
  assert.equal(buyPlayer(L, me, p.id), null);
  const repl = b.squad.find((x) => x.id === b.tactics.lineupSlots[slot]);
  assert.ok(repl); assert.equal(repl.line, 'DEF');
});

test('grænser: lukket vindue, karantæne, sælger på 18, minimum i kæden, 2 salg pr. vindue, fuld trup, penge, minus, lønbudget', () => {
  const L = fresh(), me = own(L), b = L.teams[4];
  me.cashBalance = 50000000;
  const p = reserve(b, 'MID');
  // sælger på 18 (frisk liga): ingen salg
  assert.match(marketInfo(L, me, b, p).reason, /kun 18/);
  b.squad.push(...[1, 2, 3].map((i) => ({ ...structuredClone(reserve(b, 'MID')), id: `x${i}`, shortName: `X. X${i}`, shirtNumber: 60 + i })));
  assert.equal(marketInfo(L, me, b, p).reason, null);
  // minimum i kæden: MV 2
  const gk = reserve(b, 'GK');
  assert.match(marketInfo(L, me, b, gk).reason, /for få i kæden/);
  // 2 salg pr. vindue
  assert.equal(buyPlayer(L, me, 'x1'), null); assert.equal(buyPlayer(L, me, 'x2'), null);
  assert.match(buyPlayer(L, me, 'x3'), /solgt 2/);
  // karantæne: den købte kan ikke sælges videre i dette eller næste vindue
  const x1 = me.squad.find((x) => x.id === 'x1');
  assert.ok(quarantined(x1, 2) && quarantined(x1, 3) && !quarantined(x1, 4));
  // køberens grænser
  const c = L.teams[5]; c.squad.push(...[1, 2].map((i) => ({ ...structuredClone(reserve(c, 'MID')), id: `y${i}`, shortName: `Y. Y${i}`, shirtNumber: 70 + i })));
  const q = reserve(c, 'MID');
  me.cashBalance = -1; assert.match(marketInfo(L, me, c, q).reason, /minus/);
  me.cashBalance = 1000; assert.match(marketInfo(L, me, c, q).reason, /ikke penge nok/);
  me.cashBalance = 50000000;
  const wageSave = me.squad.map((x) => x.weeklyWage); me.squad[0].weeklyWage = wageBudget(me);
  assert.match(marketInfo(L, me, c, q).reason, /lønbudget/);
  me.squad.forEach((x, i) => { x.weeklyWage = wageSave[i]; });
  while (me.squad.length < 25) me.squad.push({ ...structuredClone(me.squad[17]), id: `f${me.squad.length}` });
  assert.match(marketInfo(L, me, c, q).reason, /fuld/);
  // lukket vindue
  const L2 = fresh(); play(L2, 1);
  assert.match(marketInfo(L2, own(L2), L2.teams[1], reserve(L2.teams[1], 'MID')).reason, /lukket/);
});

test('til salg: en bot byder 0,9–1,0 · værdien i et åbent vindue; Sælg flytter spilleren; Afvis og Fjern sletter buddet', () => {
  const L = fresh(), me = own(L);
  me.squad.push(...[1, 2].map((i) => ({ ...structuredClone(reserve(me, 'MID')), id: `m${i}`, shortName: `M. M${i}`, shirtNumber: 80 + i })));
  const p = reserve(me, 'ATT');
  setListed(L, me, p.id, true);
  const o = L.offers.find((x) => x.playerId === p.id);
  assert.ok(o, 'bud');
  assert.ok(o.price >= publicValue(p) * 0.9 - 12500 && o.price <= publicValue(p) + 12500, String(o.price));
  const bot = L.teams.find((t) => t.id === o.to), cash = me.cashBalance;
  assert.equal(acceptOffer(L, me, p.id), null);
  assert.ok(bot.squad.includes(p)); assert.equal(me.cashBalance, cash + o.price); assert.ok(!me.listed.includes(p.id));
  const q = reserve(me, 'DEF'); setListed(L, me, q.id, true); assert.ok(L.offers.some((x) => x.playerId === q.id));
  declineOffer(L, me, q.id); assert.ok(!L.offers.some((x) => x.playerId === q.id)); assert.ok(me.listed.includes(q.id));
  setListed(L, me, q.id, false); assert.ok(!me.listed.includes(q.id));
});

test('dit hold på 18: et bud kan ikke accepteres; et lukket vindue giver ingen bud – buddene udløber ved næste runde', () => {
  const L = fresh(), me = own(L), p = reserve(me, 'MID');
  setListed(L, me, p.id, true);
  assert.match(acceptOffer(L, me, p.id), /kun 18/);
  play(L, 1);
  assert.deepEqual(L.offers, []);
  setListed(L, me, p.id, true);
  assert.deepEqual(L.offers, [], 'lukket vindue');
});

test('B5: dine spillere forsvinder aldrig automatisk – heller ikke i minus, når vinduet åbner', () => {
  const L = fresh(), me = own(L); me.cashBalance = -10000000;
  play(L, 7);
  assert.equal(me.squad.length, 18);
  assert.ok(!L.transferLog.some((e) => e.from === me.id));
});

test('botter i minus sælger eller fritstiller, til kassen er i plus eller truppen er 18', () => {
  const L = fresh(), b = L.teams[6];
  b.squad.push(...[1, 2, 3].map((i) => ({ ...structuredClone(reserve(b, 'MID')), id: `z${i}`, shortName: `Z. Z${i}`, shirtNumber: 90 + i })));
  b.cashBalance = -100000;
  play(L, 7);   // vinduet før runde 8 åbner
  assert.ok(b.cashBalance >= 0 || b.squad.length === 18, `${b.cashBalance} / ${b.squad.length}`);
  assert.ok(L.transferLog.some((e) => e.from === b.id));
});

test('B7 kanarie: skjulte data (evner, potentiale, løn) ændrer hverken pris, svar eller bud', () => {
  const run = (hide) => {
    const L = fresh(), me = own(L), b = L.teams[2];
    me.squad.push(...[1, 2].map((i) => ({ ...structuredClone(reserve(me, 'MID')), id: `m${i}`, shortName: `M. M${i}`, shirtNumber: 80 + i })));
    b.squad.push(...[1, 2].map((i) => ({ ...structuredClone(reserve(b, 'MID')), id: `k${i}`, shortName: `K. K${i}`, shirtNumber: 85 + i })));
    if (hide) for (const t of L.teams.filter((x) => x.isBot)) for (const p of t.squad) { for (const k of Object.keys(p.skills)) p.skills[k] = 20; p.potential = 20; p.varProfile.cynicism = 1; }
    const infos = b.squad.map((p) => marketInfo(L, me, b, p));
    setListed(L, me, reserve(me, 'ATT').id, true);
    return JSON.stringify({ infos, offers: L.offers });
  };
  assert.equal(run(true), run(false));
});

test('commitRound åbner vinduet efter runde 7 og ved sæsonslut (værdierne opdateres der)', () => {
  const L = fresh();
  play(L, 7); assert.equal(L.windowSales?.w, 3);
  play(L, 7); assert.equal(L.windowSales?.w, 4);
  const p = L.teams[1].squad.find((x) => x.careerGames >= 3);
  assert.ok(p.valueStars > 0);
});

test('lønbudgettet tæller den nye løn med: weeklyWages + løn ≤ budget', () => {
  const L = fresh(), me = own(L), b = L.teams[1];
  b.squad.push({ ...structuredClone(reserve(b, 'ATT')), id: 'w1', shortName: 'W. W1', shirtNumber: 66 });
  const p = b.squad.at(-1); me.cashBalance = 50000000;
  const room = wageBudget(me) - weeklyWages(me);
  me.squad[0].weeklyWage += room - publicWage(p) + 1000;   // 1.000 kr. for meget
  assert.match(marketInfo(L, me, b, p).reason, /lønbudget/);
  me.squad[0].weeklyWage -= 1000;
  assert.equal(marketInfo(L, me, b, p).reason, null);
});
