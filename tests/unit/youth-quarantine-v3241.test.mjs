// v3.24.1 (Spilfører økonomi, rundtur 2): en ungdomsspiller, der rykkes op ved sæsonslut, kunne sættes til salg og sælges i samme
// vindue – ≈ 725.000 kr. pr. sæson uden løn og uden kampe (4 af 4 seeds). Nu: samme karantæne som et køb (lastMove = vinduet), både
// når du tager et tilbud og når truppen fyldes op til 18 automatisk. Før rettelsen: saleBlock = null og buddet kunne tages → rødt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound } from '../../public/engine/season.js';
import { windowOf, saleBlock, setListed, acceptOffer } from '../../public/engine/transfers.js';
import { takeYouth } from '../../public/state/actions.js';

const own = (L) => L.teams.find((t) => !t.isBot);
function toSeasonEnd(seed, prep = () => {}) {
  const L = createLeague(createRng(seed)), rng = createRng(seed * 3);
  for (let r = 0; r < 13; r++) commitRound(L, playRound(L, rng), rng);
  prep(L);
  commitRound(L, playRound(L, rng), rng);
  return { L, rng };
}

test('et ungdomstilbud, du tager op, kan ikke sælges i samme eller næste vindue – først i vinduet derefter', () => {
  for (const seed of [1, 2, 3, 4]) {
    const { L, rng } = toSeasonEnd(seed), me = own(L), w = windowOf(L);
    assert.ok(w != null && me.youthOffers.length > 0, `data: vinduet er åbent og der er tilbud (seed ${seed})`);
    const y = me.youthOffers[0];
    assert.equal(takeYouth(me, y.id, L), null);
    assert.equal(me.squad.find((p) => p.id === y.id).lastMove, w);
    assert.equal(saleBlock(L, me, y), `${y.shortName} kom til klubben i dette eller sidste vindue – kan handles igen ved sæsonslut før sæson ${(w + 2) / 2}.`);
    // forsøget fra rundturen: sæt til salg og tag et bud – intet salg
    setListed(L, me, y.id, true);
    assert.ok(acceptOffer(L, me, y.id), 'intet salg');
    assert.ok(me.squad.some((p) => p.id === y.id), `han er stadig i truppen (seed ${seed})`);
    // næste vindue (runde 8): stadig karantæne; vinduet derefter: fri
    while (windowOf(L) !== w + 1) commitRound(L, playRound(L, rng), rng);
    assert.ok(saleBlock(L, me, me.squad.find((p) => p.id === y.id)), 'vindue w + 1: karantæne');
    while (windowOf(L) !== w + 2) commitRound(L, playRound(L, rng), rng);
    assert.equal(saleBlock(L, me, me.squad.find((p) => p.id === y.id)), null, 'vindue w + 2: kan sælges');
  }
});

test('truppen fyldt op til 18 ved sæsonslut: også de automatisk optagne har karantæne – botternes ungdom er urørt', () => {
  const { L } = toSeasonEnd(6, (L) => { const me = own(L); me.squad.filter((p) => !me.tactics.lineupSlots.includes(p.id)).slice(0, 3).forEach((p) => { p.age = 36; }); });
  const me = own(L), w = windowOf(L), forced = L.turnoverReport.youthTaken.filter((y) => y.teamId === me.id).map((y) => me.squad.find((p) => p.id === y.id));
  assert.equal(forced.length, 3, 'data: tre pensioneret, tre tvunget op');
  assert.ok(forced.every((p) => p.lastMove === w && saleBlock(L, me, p)));
  const botYouth = L.turnoverReport.youthTaken.filter((y) => y.teamId !== me.id);
  assert.ok(botYouth.length > 0, 'data: botterne tog ungdom op');
  assert.ok(botYouth.every((y) => L.teams.find((t) => t.id === y.teamId).squad.find((p) => p.id === y.id).lastMove == null), 'botterne: uændret');
});
