// v3.15 Test Manager: straffen for ti mand – SHORT_DRAIN (hurtigere træt), SHORT_PER_MAN i boldbesiddelsen (begge sider)
// og i duellerne (ff), og at tiden med færre mand huskes, når der kommer endnu en udvisning (shortMins).
// Hver test styrer kampen med en scriptet rng (som fatigue.test.mjs): første frispark i 3. minut er en skade-tackling,
// der giver direkte rødt til forsvarsspilleren på pladsen efter målmanden (tackler = rækkens første forsvarer).
import { alignPositions } from './helpers/positions.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch as sim0 } from '../../public/engine/match.js';
// v3.21.0: pinnede koordinater og scriptede rng-træk – uden bevægelsen (opts.drift = false, kun test-arenaer)
const simulateMatch = (h, a, r, o = {}) => sim0(h, a, r, { drift: false, ...o });


function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return { next: () => nextValue, int: (a) => a, pick: (arr) => arr[0],
    chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(n) : !!s; } };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
function arena({ homeLimit = 70 } = {}) {
  const L = createLeague(createRng(1));
  const [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) { p.skills = SK(10); p.freshness = 100; p.injuryMatchesLeft = 0; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 }; }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = [];
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id); alignPositions(t);
    Object.assign(t.tactics.phases.phase1_buildUp, { offBallRuns: 'NORMAL' });
    Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: 'MID_BLOCK' });
    Object.assign(t.tactics.phases.phase3_transition, { onBallLost: 'DROP_BACK' });
  }
  H.subsLimit = homeLimit; A.subsLimit = 0;
  return { L, H, A };
}
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const subs = (m, home = true) => m.events.filter((e) => e.type === 'SUB' && e.isHome === home);
const reds = (m) => m.events.filter((e) => e.type === 'RED');

test('ti mand bliver hurtigere trætte (SHORT_DRAIN) – og tiden med færre mand huskes ved endnu en udvisning (shortMins)', () => {
  const minOf = (script, mutate = () => {}) => {
    const { H, A } = arena();
    const cm = slot(H, 6); cm.freshness = 87; cm.skills.stamina = 1; mutate(H);
    for (const b of H.squad.filter((p) => !H.tactics.lineupSlots.includes(p.id))) { b.freshness = 100; b.skills = SK(10); }
    const m = simulateMatch(H, A, stubRng(script));
    return { red: reds(m).map((e) => `${e.min}${e.isHome ? 'H' : 'A'}`), cm: subs(m).find((e) => e.text.includes(`#${cm.shirtNumber} ${cm.shortName} ud`))?.min ?? null };
  };
  // Hjemmeholdet begår frisparket (0.5 falsk → udeholdet er offer): 0.06 sand ved tick 0 og 9 (3. og 30. minut)
  const none = minOf({});
  const one = minOf({ 0.06: (n) => n === 0, 0.4: (n) => n === 0, 0.07: true });
  const two = minOf({ 0.06: (n) => n === 0 || n === 9, 0.4: true, 0.07: true });
  assert.deepEqual([none.red, one.red, two.red], [[], ['3H'], ['3H', '30H']]);
  // CM: STA 1, 87 %, tab 25,016 pr. 90 min; under 70 % kræver 17,0 point = 61 "effektive minutter" (t − 1 + 0,25 · minutter×manglende mand):
  //   ingen udvisning: t − 1 > 61,2 → 63'.   Én (3'): 1,25t − 1,75 > 61,2 → 51'.
  //   To (3' og 30'): 1,5t − 9,25 > 61,2 → 48'.   Uden de 27 minutter fra den første (shortMins): 54'.
  //   Uden minutterne siden seneste udvisning (kun shortMins): 57'.   SHORT_DRAIN 0 giver 63' i alle tre.
  assert.equal(none.cm, 63); assert.equal(one.cm, 51); assert.equal(two.cm, 48);
});

// Boldbesiddelse: hMid/aMid = snit af (aflevering + boldkontrol) · (1 − 0,04 · manglende mand). Med rul 0,5 er det
// hjemme 20 + 4 mod ude 20 + 3,75 – uafgjort mellem to ens hold går til hjemmeholdet. Hver side testes for sig:
// en fejl, der kun rammer hjemme- eller kun udeholdet, ændrer ét af forløbene (og ikke det andet).
test('ti mand mister bolden: hjemmeholdet med ti mand taber boldbesiddelsen fra 6. minut, udeholdet med ti mand ligeså', () => {
  const run = (script, tweak = () => {}) => {
    const { H, A } = arena({ homeLimit: 0 });
    tweak(A);
    const m = simulateMatch(H, A, stubRng(script));
    return { h: m.stats.hPoss, a: m.stats.aPoss, red: reds(m).map((e) => `${e.min}${e.isHome ? 'H' : 'A'}`) };
  };
  // Elleve mod elleve: hjemmeholdet har bolden hele kampen (20 + 4 ≥ 20 + 3,75): 10 + 30·3 = 100 mod 10
  assert.deepEqual(run({}), { h: 100, a: 10, red: [] });
  // Hjemme ti mand fra 3. minut: 19,2 + 4 < 23,75 → udeholdet har bolden i tick 6–90 (29 tick); hjemme har den kun i tick 3
  assert.deepEqual(run({ 0.06: (n) => n === 0, 0.4: true, 0.07: true }), { h: 13, a: 97, red: ['3H'] });
  // Ude: mellemfelt 10,2 + 10,2 = 20,4 → 24,15 slår hjemmes 24 – udeholdet har bolden hele kampen (10 + 90 mod 10)
  const better = (A) => { for (const p of A.squad) { p.skills.passing = 10.2; p.skills.ballControl = 10.2; } };
  assert.deepEqual(run({}, better), { h: 10, a: 100, red: [] });
  // Ude ti mand fra 3. minut (0.5 sand → hjemmeholdet er offer, udeholdet begår frisparket): 19,58 + 3,75 < 24 → hjemme overtager fra 6.
  assert.deepEqual(run({ 0.5: true, 0.06: (n) => n === 0, 0.4: true, 0.07: true }, better), { h: 97, a: 13, red: ['3A'] });
});

// Dueller: ff(p) = friskhed · (1 − 0,04 · manglende mand). Skytten alene i feltet mod en målmand (fatigue.test.mjs): rul 0,5 →
// FIN·ff + 4 mod MV·ff + 4 + 3; MV 8,5 → 15,5 (udeholdet har elleve mand, så målmandens ff er uberørt).
test('ti mand skyder dårligere: en skytte på 11,8 scorer hvert 3. minut med elleve mand (11,8 + 4 > 15,5) og aldrig efter udvisningen (11,3 + 4 < 15,5)', () => {
  const run = (script, fin) => {
    const { H, A } = arena({ homeLimit: 0 });
    H.tactics.customCoords = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }]));
    Object.assign(slot(H, 9).skills, { finishing: fin, stamina: 20 });
    for (const p of A.squad.slice(5, 9)) p.skills.intercepting = 1;
    slot(A, 0).skills.goalkeeping = 8.5;
    const m = simulateMatch(H, A, stubRng({ 0.48: true, 0.3: true, ...script }));
    return { goals: m.homeGoals, reds: reds(m).length, first: m.events.filter((e) => e.type === 'GOAL' && e.isHome).map((e) => e.min).slice(0, 3) };
  };
  const eleven = run({}, 11.8), ten = run({ 0.06: (n) => n === 0, 0.4: true, 0.07: true }, 11.8);
  assert.deepEqual([eleven.goals, eleven.reds], [30, 0], 'data: uden udvisning scorer han i hvert tick');
  assert.deepEqual([ten.goals, ten.reds], [0, 1], 'med ti mand (uden straffen ville han score 30 igen)');
});
