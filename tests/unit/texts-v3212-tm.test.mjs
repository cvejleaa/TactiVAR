// v3.21.2 Test Manager: de nye måltekster (clues.js) – genitiv via gen() (navn på -s/-x/-z får apostrof) og antal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGoal, GOAL_TEXTS, gen } from '../../public/engine/clues.js';

const render = (kind, j, s, a) => describeGoal(kind, s, a, 50, { next: () => (j + 0.5) / GOAL_TEXTS[kind].length });

// tools/measure-setpiece-takers.mjs: smaafund-v3170 hævder `self === 0`, men en tæller, der aldrig kan tælle, giver også 0 – bevis at den KAN (alle tre skabeloner,
// tageren i genitiv, navn på -s) og at den ikke tæller, når tager og skytte er forskellige.
test('dødboldtager-målingen: tageren læses i alle tre skabeloner (også genitiv), og self tæller kun når tager = skytte', async () => {
  const { classifyLine, roleMapOf } = await import('../../tools/measure-setpiece-takers.mjs');
  const R = (shirtNumber, shortName, role) => ({ shirtNumber, shortName, role });
  const role = roleMapOf([R(7, 'Jens Hansen', 'LM'), R(5, 'Per Hans', 'CB'), R(9, 'Ole Nielsen', 'ST')]);
  const A = '#7 Jens Hansen', B = '#5 Per Hans', C = '#9 Ole Nielsen';
  const L1 = (t, s, sp = 'hjørnespark') => `MÅÅÅL PÅ ${sp.toUpperCase()}! ${t} slår ${sp}et ind, og ${s} (190 cm) header bolden ind – et nik.`;
  const L2 = (t, s, sp = 'frispark') => `MÅÅÅL PÅ ${sp.toUpperCase()}! ${s} (190 cm) kommer højest på ${gen(t)} ${sp} og header bolden ind – et nik.`;
  const L3 = (t, s, sp = 'hjørnespark') => `MÅÅÅL PÅ ${sp.toUpperCase()}! ${gen(t)} ${sp} finder ${s} (190 cm), der header bolden ind – et nik.`;
  for (const [i, L] of [L1, L2, L3].entries()) {
    assert.deepEqual(classifyLine(L(A, C), role), { role: 'LM', self: false }, `skabelon ${i + 1}: tager ${A}`);
    assert.deepEqual(classifyLine(L(B, C), role), { role: 'CB', self: false }, `skabelon ${i + 1}: tager på -s ${B} (genitiv "${gen(B)}")`);
    assert.deepEqual(classifyLine(L(C, A), role), { role: 'ST', self: false }, `skabelon ${i + 1}`);
    assert.deepEqual(classifyLine(L(A, A), role), { role: 'LM', self: true }, `skabelon ${i + 1}: tager = skytte`);
    assert.deepEqual(classifyLine(L(B, B), role), { role: 'CB', self: true }, `skabelon ${i + 1}: tager = skytte, navn på -s`);
  }
  assert.equal(classifyLine('MÅÅÅL! #9 Ole Nielsen (190 cm) header bolden ind efter oplæg fra #7 Jens Hansen – et nik.', role), null, 'åbent spil: ingen tager');
  assert.equal(classifyLine(L1('#4 Ukendt Mand', C), role).role, undefined, 'tager uden for karakterlisten');
});

test('måltekster: kombination og cutback har seks hver (v3.21.2; før tre), alle forskellige', () => {
  for (const k of ['COMBINATION', 'CUTBACK']) {
    assert.equal(GOAL_TEXTS[k].length, 6, k);
    assert.equal(new Set(GOAL_TEXTS[k].map((_, j) => render(k, j, 'SSS', 'AAA'))).size, 6, k);
  }
});

test('måltekster: oplægsgiverens genitiv er gen() i alle tekster – "Hans\'" (ikke "Hanss"), "Pers"', () => {
  for (const kind of Object.keys(GOAL_TEXTS)) {
    for (let j = 0; j < GOAL_TEXTS[kind].length; j++) {
      const s = render(kind, j, '#9 Skytte', '#7 Hans'), p = render(kind, j, '#9 Skytte', '#7 Per');
      assert.doesNotMatch(s, /Hanss/, `${kind}[${j}]: ${s}`);
      assert.doesNotMatch(p, /Per'/, `${kind}[${j}]: ${p}`);
      // en tekst med oplægsgiverens genitiv har "#7 Pers" for Per – og så skal Hans stå som "#7 Hans'"
      if (p.includes('#7 Pers')) assert.ok(s.includes("#7 Hans'") && !s.includes('#7 Hanss'), `${kind}[${j}]: ${s}`);
    }
  }
  // de nye tekster, der bruger genitiv, findes (ellers er løkken ovenfor tom)
  const withGen = ['COMBINATION', 'CUTBACK'].flatMap((k) => GOAL_TEXTS[k].map((_, j) => render(k, j, '#9 S', '#7 Per')).filter((t) => t.includes('#7 Pers')));
  assert.equal(withGen.length, 2, withGen.join(' | '));
  assert.equal(gen('#7 Hans'), "#7 Hans'");
});
