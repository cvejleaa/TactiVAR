// v3.24.1 (Test Manager): den udskudte ungdomsmaskine – tag op ved sæsonslut, hold til vindue w+2, sælg. Kør: node tools/measure-youth-flip.mjs
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import * as T from '../public/engine/transfers.js';
import { takeYouth, dropYouth } from '../public/state/actions.js';
function run(seed, take) {
  const L = createLeague(createRng(seed)), rng = createRng(seed * 3);
  for (let r = 0; r < 14; r++) commitRound(L, playRound(L, rng), rng);
  const me = L.teams.find((t) => !t.isBot), w = T.windowOf(L);
  const ids = me.youthOffers.map((y) => y.id);
  for (const id of ids) { if (take) takeYouth(me, id, L); else dropYouth(me, id); }
  let sold = 0, n = 0;
  while (T.windowOf(L) !== w + 2) commitRound(L, playRound(L, rng), rng);
  if (take) for (const id of ids) {
    const p = me.squad.find((x) => x.id === id);
    if (!p) continue;
    T.setListed(L, me, id, true);
    const o = (L.offers ?? []).find((x) => x.playerId === id);
    if (o) { const err = T.acceptOffer(L, me, id); if (!err) { sold += o.price; n++; } }
  }
  return { cash: me.cashBalance, sold, n };
}
for (const seed of [1, 2, 3, 4]) {
  const a = run(seed, true), b = run(seed, false);
  console.log(seed, JSON.stringify(a), JSON.stringify(b), a.cash - b.cash);
}
