// v3.26.0 (nr. 39, brugerens valg 2026-11-01 – Hattrick: "angrib deres svage side"): kantens side var et møntkast (match.js
// \`rng.next() < 0.5\`). Nu Venstre/Begge/Højre (phase1_buildUp.attackSide); Begge læner sig svagt mod den side, hvor jeres kant står
// stærkest mod deres back. Målt (tools/measure-side.mjs 140, 1960 kampe pr. celle): før 50 % venstre i alle; nu Begge 53 %
// (normal) / 57 % (deres højre back svag), Venstre 80 %, Højre 22 %.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureSide } from '../../tools/measure-side.mjs';
import { SIDE } from '../../public/engine/match.js';
import { PHASE_OPTIONS } from '../../public/ui/labels.js';
import { defaultTactics } from '../../public/engine/generator.js';
import { oppSideLine } from '../../public/engine/match.js';

test('valget findes: tre muligheder set fra eget hold, standard Begge for alle botter', () => {
  assert.deepEqual(PHASE_OPTIONS.attackSide.map(([v]) => v), ['LEFT', 'BOTH', 'RIGHT']);
  assert.equal(defaultTactics([]).phases.phase1_buildUp.attackSide, 'BOTH');
  assert.ok(SIDE.CHOICE > 0.7 && SIDE.CAP < 0.1, 'et fast valg styrer klart mere end Begge');
});

test('målt: Begge finder (lidt) deres svage back, et fast valg styrer siden – røde på møntkastets 50 %', async () => {
  const r = await measureSide(40);
  assert.ok(r['svag RB|BOTH'].left >= 0.54, `Begge mod svag højre back: ${r['svag RB|BOTH'].left} (før 0,50)`);
  assert.ok(r['svag RB|BOTH'].left > r['normal|BOTH'].left + 0.02, 'Begge flytter sig efter backen');
  assert.ok(r['normal|LEFT'].left >= 0.72 && r['normal|RIGHT'].left <= 0.28, `Venstre ${r['normal|LEFT'].left} / Højre ${r['normal|RIGHT'].left} (før 0,50)`);
  for (const k of Object.keys(r)) assert.ok(r[k].wide > 0.5, `${k}: kantangreb tælles (${r[k].wide} pr. kamp)`);
});

test('Dit felt pr. side: deres venstre er din højre; kun ved ≥ 2/3 og mindst 3 – ellers intet', () => {
  assert.equal(oppSideLine({ oppWideL: 6, oppWideR: 2, oppBackL: '#3 B. Hansen' }), ' · 6 af 8 kantangreb kom i din højre side (mod #3 B. Hansen)');
  assert.equal(oppSideLine({ oppWideL: 1, oppWideR: 4, oppBackR: null }), ' · 4 af 5 kantangreb kom i din venstre side');
  assert.equal(oppSideLine({ oppWideL: 3, oppWideR: 2 }), '', '3 af 5 er under 2/3');
  assert.equal(oppSideLine({ oppWideL: 2, oppWideR: 0 }), '', 'under 3 i alt');
});
