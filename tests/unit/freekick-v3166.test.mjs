// v3.16.6 (M5): et frispark i samme tick som et kort eller en skade-tackling for samme hold er DEN forseelse – referatet
// nævner samme spiller ("Gult kort til X for et frispark" → "Frispark efter Xs forseelse"), og den tælles én gang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';

const TAG = /#\d+ [^\s(]+(?: [^\s(]+)?/;
// 1500 kampe: 10 frisparksmål efter et kort i samme minut, 94 uden; rød uden rettelsen (seed 32: kort til #10, frispark efter #3)
test('frisparket i samme minut som kortet for samme hold nævner kortets spiller', () => {
  let linked = 0, alone = 0;
  for (let s = 1; s <= 1500; s++) {
    const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const m = s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
    for (const e of m.events) {
      const fk = e.type === 'GOAL' && e.text.match(/FRISPARKSMÅL! Frispark efter (.+?)s? \((.+?)\) forseelse/);
      if (!fk) continue;
      const card = m.events.find((c) => c.min === e.min && c.type === 'FOUL' && /Gult kort til .+ for et frispark/.test(c.text) && c.text.startsWith(`🟨 [${fk[2]}]`));
      if (!card) { alone++; continue; }
      linked++;
      const carded = card.text.match(/Gult kort til (.+) for et frispark/)[1];
      assert.ok(fk[1].startsWith(carded), `seed ${s} ${e.min}': kort til ${carded}, frispark efter ${fk[1]}`);
    }
  }
  assert.ok(linked >= 3 && alone >= 30, `data: ${linked} frisparksmål efter et kort i samme minut, ${alone} uden`);
});
