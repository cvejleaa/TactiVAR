// v3.16 koblede linjer (Spilførerens sæsongennemgang + QC): på taktiktavlen står ingen bag modstanderens sidste forsvarer
// (før: holdets forreste i ≈100 % af billederne med bolden – tools/trace-invariants.mjs), det forsvarende hold står foran
// boldholdets bagkæde, afslutteren står i feltet (langskud fra skudafstand foran målet), kontraens scorer er i feltet, og
// kontraens oplægsgiver er aldrig scoreren selv ("#7 fandt #7").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch, LONGSHOT_Y, LONGSHOT_FAR, LONGSHOT_X, SHOT_BOX_Y } from '../../public/engine/match.js';
import { checkTrace } from '../../tools/trace-invariants.mjs';

const games = [];
for (let s = 1; s <= 150; s++) { const L = createLeague(createRng(s)); games.push(simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31))); }
const own = (side, [id, x, y]) => (side === 'h' ? [id, x, y] : [id, 100 - x, 100 - y]);

test('grundbillederne: holdets forreste står aldrig bag modstanderens sidste markspiller (før ≈100 %), det forsvarende holds forreste aldrig bag boldholdets bageste', () => {
  let frames = 0, behind = 0, deep = 0;
  for (const m of games) {
    behind += checkTrace(m).finding.frontBehind;
    for (const f of m.trace.frames.filter((x) => x.poss)) {
      frames++;
      const bs = f.poss, ds = bs === 'h' ? 'a' : 'h';
      const ballDeepest = Math.max(...f[bs].slice(1).map((q) => own(bs, q)[2]));   // boldholdets bageste markspiller (egne koord.)
      const defFront = Math.min(...f[ds].slice(1).map((q) => own(ds, q)[2]));      // forsvarets forreste (egne koord.)
      if (defFront < 100 - ballDeepest) deep++;   // forsvarets forreste står bag boldholdets bageste = ved modstanderens mål
    }
  }
  assert.ok(frames > 4000, `data: ${frames}`);
  assert.equal(behind, 0, `forreste bag sidste forsvarer i ${behind} billeder`);
  assert.equal(deep, 0, `forsvarende angribere ved modstanderens mål i ${deep} billeder`);
});

test('afslutteren i feltet: mål (ikke langskud) med scoreren på højst SHOT_BOX_Y; langskud fra y 30–38 og x 20–80; kontramål i feltet', () => {
  assert.deepEqual([LONGSHOT_Y, LONGSHOT_FAR, SHOT_BOX_Y, ...LONGSHOT_X], [30, 38, 12, 20, 80]);
  let inBox = 0, longs = 0, counters = 0;
  for (const m of games) for (const mo of m.trace.moments.filter((x) => x.scorer)) {
    const e = m.events[mo.ev], g = m.goalsPool.find((x) => x.min === e.min && e.text.includes(x.scorer));
    const [, x, y] = own(mo.side, mo[mo.side].find((q) => q[0] === mo.scorer));
    if (g?.kind === 'LONGSHOT') { longs++; assert.ok(y >= 30 && y <= 38 && x >= 20 && x <= 80, `langskud (${x},${y})`); continue; }
    if (mo.behind) continue;
    if (g?.kind === 'COUNTER') counters++;
    const behindVar = m.events[mo.ev - 1]?.type === 'VAR_CHECK' && / foran #/.test(e.text);
    if (!behindVar) { inBox++; assert.ok(y <= SHOT_BOX_Y, `${g?.kind} (${x},${y}): ${e.text.slice(0, 80)}`); }
  }
  assert.ok(inBox > 200 && longs > 15 && counters > 15, `data: i feltet ${inBox}, langskud ${longs}, kontra ${counters}`);
});

test('kontraens oplæg: aldrig "#7 X fandt #7 X" – oplægsgiveren er en anden end scoreren', () => {
  let n = 0;
  for (const m of games) for (const g of m.goalsPool.filter((x) => x.kind === 'COUNTER')) { n++; assert.ok(!g.desc.includes(`${g.scorer} fandt ${g.scorer}`), g.desc); }
  for (const m of games) for (const e of m.ratings.home.concat(m.ratings.away)) if (e.goals && e.assists) { /* en spiller kan have både mål og oplæg i samme kamp – kun samme hændelse tælles ovenfor */ }
  assert.ok(n > 15, `data: ${n}`);
});
