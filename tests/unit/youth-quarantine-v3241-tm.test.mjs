// Test Manager, v3.24.1: huller i youth-quarantine-v3241.test.mjs – de andre veje ud af klubben (fritstil, bud), sæson 2 (vinduets id
// følger sæsonnummeret), gemt-og-indlæst (lastMove overlever) og at den tvungne karantæne ikke kan fjernes ved et tilfælde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound } from '../../public/engine/season.js';
import { windowOf, saleBlock, setListed, acceptOffer, releasePlayer, quarantined, makeOffers, quarantineText } from '../../public/engine/transfers.js';
import { takeYouth } from '../../public/state/actions.js';
import { serialize, parseSave } from '../../public/state/storage.js';

const own = (L) => L.teams.find((t) => !t.isBot);
function seasons(seed, n) {   // n sæsoner spillet; stopper lige efter sæsonens sidste runde (vinduet ved sæsonslut er åbent)
  const L = createLeague(createRng(seed)), rng = createRng(seed * 3);
  for (let r = 0; r < 14 * n; r++) commitRound(L, playRound(L, rng), rng);
  return { L, rng };
}

test('fritstil af en ny ungdomsspiller afvises (tilbud taget op OG tvunget op): han er i truppen, intet logget, intet salg tælles', () => {
  const { L } = seasons(1, 1), me = own(L), y = me.youthOffers[0], w = windowOf(L);
  assert.ok(w != null && y, 'data');
  assert.equal(takeYouth(me, y.id, L), null);
  const log = (L.transferLog ?? []).length, sold = L.windowSales?.n?.[me.id] ?? 0, n = me.squad.length;
  const msg = releasePlayer(L, me, y.id);
  assert.equal(msg, quarantineText(y));
  assert.equal(me.squad.length, n); assert.ok(me.squad.some((p) => p.id === y.id));
  assert.equal((L.transferLog ?? []).length, log, 'intet logget');
  assert.equal(L.windowSales?.n?.[me.id] ?? 0, sold, 'salget tæller ikke');
  // tvunget optag: samme afvisning via fritstil
  const { L: L2 } = seasons(6, 1), m2 = own(L2);
  m2.squad.filter((p) => !m2.tactics.lineupSlots.includes(p.id)).slice(0, 3).forEach((p) => { p.age = 36; });
  const rng = createRng(18); // en ny sæson med pension: spil sæson 2 til sidst, så det tvungne optag sker
  for (let r = 0; r < 14; r++) commitRound(L2, playRound(L2, rng), rng);
  const forced = L2.turnoverReport.youthTaken.filter((t) => t.teamId === m2.id).map((t) => m2.squad.find((p) => p.id === t.id)).filter(Boolean);
  assert.ok(forced.length > 0 && windowOf(L2) != null, 'data: der er tvungne optag og vinduet er åbent');
  for (const p of forced) assert.match(releasePlayer(L2, m2, p.id), /kom til klubben/);
});

test('sæt til salg: ingen bud lægges på en ny ungdomsspiller – og et bud lagt før optaget kan ikke tages (ingen penge ind)', () => {
  const { L } = seasons(2, 1), me = own(L), y = me.youthOffers[0];
  takeYouth(me, y.id, L);
  setListed(L, me, y.id, true);
  assert.equal((L.offers ?? []).filter((o) => o.playerId === y.id).length, 0, 'intet bud på en spiller i karantæne');
  // tving et bud ind (som et gammelt bud ville ligge) – acceptOffer skal stadig afvise og ikke flytte penge
  const bot = L.teams.find((t) => t.isBot);
  (L.offers ||= []).push({ playerId: y.id, from: me.id, to: bot.id, price: 400000, w: windowOf(L) });
  const cash = me.cashBalance;
  assert.match(acceptOffer(L, me, y.id), /kom til klubben/);
  assert.equal(me.cashBalance, cash, 'ingen penge ind'); assert.ok(me.squad.some((p) => p.id === y.id));
  makeOffers(L, me);   // heller ikke et nyt vindues bud-runde
  assert.ok(L.offers.every((o) => o.playerId !== y.id || o.price === 400000));
});

test('sæson 2: karantænen følger vinduets id (sæsonnummer · 2 + halvdel) – ungdom efter sæson 2 er låst i vinduet og det næste, fri derefter', () => {
  const { L, rng } = seasons(3, 2), me = own(L), w = windowOf(L);
  assert.ok(w != null && me.youthOffers.length > 0, 'data');
  const y = me.youthOffers[0];
  assert.equal(takeYouth(me, y.id, L), null);
  const p = () => me.squad.find((x) => x.id === y.id);
  assert.equal(p().lastMove, w);
  assert.ok(saleBlock(L, me, p()), 'vindue w: låst');
  while (windowOf(L) !== w + 1) commitRound(L, playRound(L, rng), rng);
  assert.ok(saleBlock(L, me, p()), 'vindue w + 1: låst');
  while (windowOf(L) !== w + 2) commitRound(L, playRound(L, rng), rng);
  assert.equal(saleBlock(L, me, p()), null, 'vindue w + 2: fri');
});

test('grænsen i quarantined: lastMove = w og w − 1 er låst; w − 2 er fri; uden lastMove er han fri', () => {
  assert.equal(quarantined({ lastMove: 5 }, 5), true);
  assert.equal(quarantined({ lastMove: 5 }, 6), true);
  assert.equal(quarantined({ lastMove: 5 }, 7), false);
  assert.equal(quarantined({}, 7), false);
  assert.equal(quarantined({ lastMove: 0 }, 1), true, 'lastMove 0 er et vindue (ikke "ingen")');
});

test('gemt og indlæst: lastMove overlever, og den indlæste ungdomsspiller er stadig låst', () => {
  const { L } = seasons(4, 1), me = own(L), y = me.youthOffers[0], w = windowOf(L);
  takeYouth(me, y.id, L);
  const r = parseSave(serialize({ league: L, notes: {}, ui: { activePresetIndex: 0 } }));
  assert.ok(r.ok, r.error);
  const L2 = r.state.league, m2 = own(L2), p = m2.squad.find((x) => x.id === y.id);
  assert.equal(p.lastMove, w);
  assert.ok(saleBlock(L2, m2, p), 'låst efter indlæsning');
});

test('ungdomstilbud, du ikke tager op, får ingen lastMove – og et tilbud kan ikke tages to gange (ingen dobbelt karantæne/dublet)', () => {
  const { L } = seasons(5, 1), me = own(L), [a, b] = me.youthOffers;
  assert.equal(a.lastMove, undefined); assert.equal(b.lastMove, undefined);
  assert.equal(takeYouth(me, a.id, L), null);
  assert.match(takeYouth(me, a.id, L), /udløbet/);
  assert.equal(me.squad.filter((p) => p.id === a.id).length, 1);
  assert.equal(b.lastMove, undefined, 'det andet tilbud er urørt');
});
