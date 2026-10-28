// v3.24.0 – Test Manager: virkningens STØRRELSE, målt på selve duellerne (ikke på mål). Mål/kamp er for støjende til at skelne en
// halveret eller fordoblet vægt fra den rigtige (tools/measure-chemistry.mjs effect, N 800, faste seeds: samlet spænd fast − fremmede
// 0,074 ved ½ × vægtene, 0,181 ved 1 ×, 0,250 ved 2 × – standardfejl ca. 0,07), og løbsduellens bidrag til mål (±0,02) forsvinder helt
// i støjen. Opbygnings- og løbsduellernes vundne andel (ownReports.buildWon/build, runsWon/runs) er derimod direkte og følsom.
// Alt er seedet og uden klokke: samme tal hver gang (ikke flaky) – men et ændret rng-forbrug i motoren flytter tallene med ca. ±1,3 point
// (build) / ±3 point (løb); bånd og kommentarer skal så regnes om med `node tests/unit/chemistry-v3240-effect.test.mjs` (printer tallene).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch, CHEM_EFFECT } from '../../public/engine/match.js';
import { CHEM_TOP, STRANGER, CHEM_BASE, pairKey } from '../../public/engine/chemistry.js';

const force = (t, v) => { const ids = t.squad.map((p) => p.id), c = {}; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) c[pairKey(ids[i], ids[j])] = [v, 0]; t.chemistry = c; };
// Hold A (menneskestyret – kun dem har ownReports) mod B; ét hold tvunget til v, det andet på ligaens snit. Andel i % med to decimaler.
function rates(K, who) {
  const out = {};
  for (const [lab, v] of [['fremmede', STRANGER], ['ref', CHEM_BASE], ['fast', CHEM_TOP]]) {
    let n = 0, won = 0;
    for (let s = 1; s <= K; s++) {
      const L = createLeague(createRng(s * 17)), A = L.teams[s % 8], B = L.teams[(s + 3) % 8];
      A.isBot = false; B.isBot = false;
      force(A, who === 'build' ? v : CHEM_BASE); force(B, who === 'build' ? CHEM_BASE : v);   // opbygningen: A's egne par; løbet: forsvarerens (B's) par
      A.squad.reverse(); B.squad.reverse();   // truppens rækkefølge ≠ pladsernes: ellers kan en læsning af truppen i stedet for banens elleve ikke ses (mutant m_chemAt_squad overlevede)
      const r = simulateMatch(A, B, createRng(s * 101 + (who === 'build' ? 1 : 2)), { chemRef: CHEM_BASE }).ownReports[A.id];
      if (who === 'build') { n += r.build; won += r.buildWon; } else { n += r.runs; won += r.runsWon; }
    }
    out[lab] = { n, rate: Math.round((won / n) * 10000) / 100 };
  }
  return out;
}

test('effekt: vægtene er præcis 0,3 (opbygning) og 3 (løb) – en halveret/fordoblet konstant er rød uden at vente på støjen', () => {
  assert.deepEqual({ ...CHEM_EFFECT }, { build: 0.3, run: 3 });
});

test('effekt, opbygning: A\'s andel vundne opbygninger stiger med hans samspil – fremmede 54,6 · snit 57,6 · fast 60,4 % (400 kampe); spænd 5,8 pt (½ × → 3,0 · 2 × → 10,6 · 0 → 0)', () => {
  const r = rates(400, 'build');
  assert.ok(r.fremmede.n > 2500 && r.ref.n > 2500 && r.fast.n > 2500, 'data: tusindvis af opbygninger pr. linje ' + JSON.stringify(r));
  const spread = r.fast.rate - r.fremmede.rate;
  assert.ok(r.fremmede.rate < r.ref.rate && r.ref.rate < r.fast.rate, JSON.stringify(r));
  assert.ok(spread >= 4.5 && spread <= 7.5, `spænd ${spread.toFixed(2)} pt (rigtigt 5,8; halveret 3,0 og fordoblet 10,6 er uden for) – ${JSON.stringify(r)}`);
});

test('effekt, løbsduel: forsvarerens samspil flytter løberens chance for at komme fri – fremmede 51,5 · snit 38,8 · fast 29,0 % (400 kampe); spænd 22,5 pt (½ × → 12,5 · 2 × → 41,8 · 0 → 0)', () => {
  const r = rates(400, 'run');
  assert.ok(r.fremmede.n > 700 && r.ref.n > 700 && r.fast.n > 700, 'data ' + JSON.stringify(r));
  const spread = r.fremmede.rate - r.fast.rate;
  assert.ok(r.fremmede.rate > r.ref.rate + 5 && r.ref.rate > r.fast.rate + 5, JSON.stringify(r));
  assert.ok(spread >= 17 && spread <= 29, `spænd ${spread.toFixed(2)} pt (rigtigt 22,5; halveret 12,5 og fordoblet 41,8 er uden for) – ${JSON.stringify(r)}`);
});

if (import.meta.url === `file://${process.argv[1]}`) { console.log('build', JSON.stringify(rates(400, 'build'))); console.log('run', JSON.stringify(rates(400, 'run'))); }
