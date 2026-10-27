// v3.21.1 – transfer-låsen (brugeren: "Jeg kan ikke sælge fordi jeg kun har 18 spillere, men kan heller ikke købe fordi jeg har brugt
// mit lønbudget. Denne måde låser mig for meget som manager"): salg ved 18 henter en ungdomsspiller, dine 2 salg pr. vindue, fritstil,
// og lønloftet efter et salg = din løn før vinduets første salg (QC: lønnen stiger aldrig i forhold til før salget).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { setListed, acceptOffer, releasePlayer, buyPlayer, marketInfo, wageCap, wageRoom, openWindow, needsYouth, SALES_PER_WINDOW } from '../../public/engine/transfers.js';
import { publicWage, weeklyWages, wageBudget, LINE_MIN } from '../../public/engine/career.js';

const fresh = (s = 8) => createLeague(createRng(s));
const own = (L) => L.teams.find((t) => !t.isBot);
const reserve = (t, line) => t.squad.find((p) => p.line === line && !t.tactics.lineupSlots.includes(p.id));
// Til salg i en bot: billigste reserve (købbar) – og lønnen over budgettet med 'over' kr./uge
const cheapest = (L, me) => L.teams.filter((t) => t.isBot).flatMap((t) => t.squad.filter((p) => !t.tactics.lineupSlots.includes(p.id)).map((p) => ({ t, p }))).sort((a, b) => publicWage(a.p) - publicWage(b.p))[0];
const overBy = (me, over) => { me.squad[1].weeklyWage += wageBudget(me) - weeklyWages(me) + over; };

test('brugerens vej: 18 spillere, over lønbudgettet, ét bud – Sælg virker, truppen er stadig 18, og et køb for under den sparede løn lykkes', () => {
  const L = fresh(), me = own(L); me.cashBalance = 20000000;
  // Den dyreste markspiller (en reserve frigør for lidt: ungdomsspillerens løn trækkes fra – målt: 24.000 mod den billigste på 30.000)
  const sell = me.squad.filter((p) => p.line !== 'GK' && p !== me.squad[1]).sort((a, b) => b.weeklyWage - a.weeklyWage)[0];
  overBy(me, sell.weeklyWage + 100000);   // (salget løfter også budgettet: 2 % af prisen) så langt over, at du stadig er over efter salget (skærmbilledet: 30.837 pr. runde over)
  const { t, p: buy } = cheapest(L, me);
  assert.match(marketInfo(L, me, t, buy).reason, /lønbudget/, 'før: låst');
  setListed(L, me, sell.id, true);
  assert.equal(acceptOffer(L, me, sell.id), null);
  assert.equal(me.squad.length, 18);
  assert.ok(weeklyWages(me) > wageBudget(me), 'data: stadig over budgettet efter salget');
  assert.ok(publicWage(buy) <= wageRoom(L, me), `data: den billigste (${publicWage(buy)}) passer i loftet (${wageRoom(L, me)})`);
  assert.equal(buyPlayer(L, me, buy.id), null);
  assert.equal(me.squad.length, 19);
});

test('lønloftet: efter et salg må lønnen højst blive som før salget – ikke højere, heller ikke ved to køb (loftet er ét tal pr. vindue)', () => {
  const L = fresh(), me = own(L); me.cashBalance = 50000000;
  overBy(me, 50000);
  const before = weeklyWages(me), sell = reserve(me, 'DEF');
  setListed(L, me, sell.id, true); assert.equal(acceptOffer(L, me, sell.id), null);
  assert.equal(wageCap(L, me), before, 'loftet = lønnen før salget');
  assert.equal(wageRoom(L, me), before - weeklyWages(me));
  // Et køb, der ville løfte lønnen over loftet, afvises med sin egen grund
  const bot = L.teams[1], p = reserve(bot, 'ATT');
  const tooMuch = wageRoom(L, me) - publicWage(p) + 1000; me.squad[1].weeklyWage += tooMuch;
  assert.match(marketInfo(L, me, bot, p).reason, /højere end før dit salg/);
  me.squad[1].weeklyWage -= 1000;
  assert.equal(marketInfo(L, me, bot, p).reason, null, 'præcis op til loftet er tilladt');
});

test('under budgettet: uændret – loftet er budgettet, og et salg giver intet ekstra loft', () => {
  const L = fresh(), me = own(L);
  assert.ok(weeklyWages(me) < wageBudget(me), 'data: under budgettet');
  assert.equal(wageCap(L, me), wageBudget(me));
  const sell = reserve(me, 'DEF'); setListed(L, me, sell.id, true); acceptOffer(L, me, sell.id);
  assert.equal(wageCap(L, me), wageBudget(me), 'salget løftede ikke loftet over budgettet');
});

test('loftet nulstilles, når næste vindue åbner', () => {
  const L = fresh(), me = own(L); overBy(me, 50000);
  const sell = reserve(me, 'DEF'); setListed(L, me, sell.id, true); acceptOffer(L, me, sell.id);
  assert.ok(wageCap(L, me) > wageBudget(me));
  L.leagueMetadata.round = 7; openWindow(L);   // næste vindue (før runde 8)
  assert.equal(wageCap(L, me), wageBudget(me));
});

test(`dine salg: højst ${SALES_PER_WINDOW} pr. vindue (QC: uden 18-spærren ellers en pengemaskine) – også fritstilling tæller`, () => {
  const L = fresh(), me = own(L);
  const [a, b, c] = me.squad.filter((p) => !me.tactics.lineupSlots.includes(p.id) && p.line !== 'GK').slice(0, 3);
  setListed(L, me, a.id, true); assert.equal(acceptOffer(L, me, a.id), null);
  assert.equal(releasePlayer(L, me, b.id), null);
  assert.ok(!L.transferLog.some((e) => e.id === b.id && e.to !== null) && L.transferLog.some((e) => e.id === b.id && e.kind === 'release'));
  setListed(L, me, c.id, true);
  assert.ok(!L.offers.some((o) => o.playerId === c.id), 'intet bud efter 2 salg');
  assert.match(releasePlayer(L, me, c.id), /solgt 2/);
  assert.equal(me.squad.length, 18, 'begge salg ved 18 hentede en ungdomsspiller');
});

test('kædens minimum: sælger du en af to målmænd, kommer en ungdomsmålmand ind; needsYouth siger det før klikket', () => {
  const L = fresh(), me = own(L), gk = reserve(me, 'GK');
  assert.equal(me.squad.filter((p) => p.line === 'GK').length, LINE_MIN.GK);
  assert.equal(needsYouth(me, gk), true);
  assert.equal(releasePlayer(L, me, gk.id), null);
  assert.equal(me.squad.filter((p) => p.line === 'GK').length, LINE_MIN.GK);
  assert.ok(me.squad.some((p) => p.line === 'GK' && p.id.startsWith('plr_y')));
});

test('needsYouth: over 18 og over kædens minimum kommer ingen ungdomsspiller', () => {
  const L = fresh(), me = own(L);
  me.squad.push({ ...structuredClone(reserve(me, 'MID')), id: 'x1', shortName: 'X. X1', shirtNumber: 77 });
  assert.equal(needsYouth(me, reserve(me, 'MID')), false);
  const n = me.squad.length, p = reserve(me, 'MID');
  assert.equal(releasePlayer(L, me, p.id), null);
  assert.equal(me.squad.length, n - 1, 'ingen ungdomsspiller ved 19');
});
