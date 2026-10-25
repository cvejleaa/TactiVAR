// v3.16.6: oplægsgiveren er aldrig målscoreren selv (Spilfører: "#7 fandt #7"). I de seedede kampe sker det ikke (0 af
// 4615 mål med oplæg i 3000 kampe – tools/measure-assist.mjs); det sker, når kæden er tyndet ud. Her tvinges det: dit hold
// stiller med én midtbanespiller og ingen angribere (fem pladser tomme og ingen bænk – angrebet lånes fra midten), så kontraens "anden midtbanespiller" ikke findes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';

const SOLO = new Set(['LONGSHOT', 'DRIBBLE', 'PENALTY', 'FREEKICK']);
const GOAL_EV = new Set(['GOAL', 'HEADER_GOAL', 'VAR_GOAL']);
const tag = (p) => `#${p.shirtNumber} ${p.shortName}`;

// 500 kampe: 36 mål med oplæg, 21 kontra; uden vagten rød (seed 48: kontra uden oplæg)
test('oplæg: med én midtbanespiller har hvert mål med oplæg en ANDEN oplægsgiver – i øjeblikket, i assist-tallet og i teksten', () => {
  let goals = 0, mineCounter = 0;
  for (let s = 1; s <= 500; s++) {
    const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const slots = me.tactics.lineupSlots, keep = new Set(slots);
    [6, 7, 8, 9, 10].forEach((i) => { keep.delete(slots[i]); slots[i] = null; });
    me.squad = me.squad.filter((p) => keep.has(p.id));
    const m = s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
    const goalEvs = m.events.filter((e) => GOAL_EV.has(e.type)), byId = new Map(me.squad.map((p) => [p.id, p]));
    for (const g of (m.trace?.moments ?? []).filter((x) => x.kind === 'GOAL')) {
      const pool = m.goalsPool[goalEvs.indexOf(m.events[g.ev])];
      if (!pool || SOLO.has(pool.kind) || !byId.has(g.scorer)) continue;
      goals++;
      assert.ok(g.assist && g.assist !== g.scorer, `seed ${s} ${pool.kind}: oplæg ${g.assist} ved ${g.scorer}`);
      // Dit holds løb ("… løber sig fri … og skyder.") fortæller løbet, ikke oplægget – kun teksterne med oplæg tjekkes
      if (!/løber sig fri/.test(pool.desc)) assert.ok(byId.has(g.assist) && pool.desc.includes(tag(byId.get(g.assist))), `seed ${s}: teksten nævner oplægsgiveren – ${pool.desc}`);
      if (pool.kind === 'COUNTER') mineCounter++;
    }
  }
  assert.ok(goals >= 30 && mineCounter >= 15, `data: ${goals} mål med oplæg for dit hold, heraf ${mineCounter} kontra`);
});
