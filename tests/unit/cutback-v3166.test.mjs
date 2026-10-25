// v3.16.6 (M4): "Dit felt: modstanderens cutbacks stoppet x af y" passer med referatet – hver af modstanderens cutbacks
// står som en linje: "↩️ [modstander] … spiller bolden tilbage i feltet." (kom han forbi) eller "🛡️ [dit hold] … lukker
// kanten mod …" (stoppet). Før stod modstanderens løbs-cutbacks kun i tallet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';

test('fuldtidsanalysens cutback-tal = antallet af cutback-linjer i referatet (modstanderens)', () => {
  let matches = 0, through = 0, total = 0;   // 300 kampe: 218 cutbacks, 179 forbi; rød uden linjen (seed 6: 1 + 1 ≠ 4)
  for (let s = 1; s <= 300; s++) {
    const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const m = s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
    const ft = m.events.find((e) => /Dit felt: modstanderens cutbacks stoppet/.test(e.text ?? ''));
    if (!ft) continue;
    const [, blocked, all] = ft.text.match(/cutbacks stoppet (\d+) af (\d+)/).map(Number);
    const thr = m.events.filter((e) => e.type === 'INFO' && e.text.startsWith(`↩️ [${opp.name}]`) && e.text.endsWith('spiller bolden tilbage i feltet.')).length;
    const closed = m.events.filter((e) => e.type === 'INFO' && e.text.startsWith(`🛡️ [${me.name}]`) && / lukker kanten mod /.test(e.text)).length;
    assert.equal(closed, blocked, `seed ${s}: stoppet`);
    assert.equal(thr + closed, all, `seed ${s}: ${thr} forbi + ${closed} stoppet ≠ ${all}`);
    matches++; total += all; through += thr;
  }
  assert.ok(matches >= 250 && total >= 150 && through >= 50, `data: ${matches} kampe, ${total} cutbacks, ${through} kom forbi`);
});
