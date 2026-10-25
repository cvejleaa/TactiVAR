// v3.16.6 (M2): den haltende spiller på korpus – dit hold uden bænk, en spiller skadet i 9' (tools/measure-limp.mjs forced).
// Han løber ikke fri, tager ingen dødbolde og er derfor sjældent med i afslutningerne.
// Før M2 (400 kampe): 3 løb, 8 dødbolde, med i 86 af 854 afslutningslinjer (10,1 %); efter: 0, 0, 21 af 770 (2,7 %).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { forced } from '../../tools/measure-limp.mjs';

test('haltende (400 kampe): ingen løb, ingen dødbolde, med i højst 5 % af holdets afslutningslinjer (før 10,1 %)', () => {
  let matches = 0, runs = 0, sp = 0, touch = 0, total = 0;
  for (let s = 1; s <= 400; s++) {
    const L = createLeague(createRng(s * 97)), H = L.teams.find((t) => !t.isBot), A = L.teams[(s % 7) + 1];
    H.subsLimit = 0; H.tactics.conditionalRules = [];
    for (const p of H.squad) if (!H.tactics.lineupSlots.includes(p.id)) p.injuryMatchesLeft = 5;
    const m = simulateMatch(H, A, forced(createRng(s * 131), 'limp'));
    const inj = m.events.find((e) => e.min === 9 && /Ingen indskiftning/.test(e.text ?? ''));
    if (!inj) continue;
    matches++;
    const who = inj.text.match(/med (#\d+ .+) haltende/)[1];
    for (const e of m.events.filter((x) => x.min > 9)) {
      const t = e.text ?? '';
      if (t.includes(`✅ ${who} løber sig fri`) || t.includes(`❌ ${who} løber sig fri`)) runs++;
      if (t.includes(`${who} slår hjørnesparket`) || t.includes(`${who} tager straffen`) || (/STRAFFESPARK|FRISPARK/.test(t) && t.includes(`og ${who} sender`))) sp++;
      if (/^(⚽|🧤|❌|💨)/.test(t) && t.includes(`[${H.name}`)) { total++; if (t.includes(who)) touch++; }
    }
  }
  assert.ok(matches === 400 && total >= 500, `data: ${matches} kampe, ${total} afslutningslinjer`);
  assert.equal(runs, 0); assert.equal(sp, 0);
  assert.ok(touch / total < 0.05, `med i ${touch} af ${total}`);
});
