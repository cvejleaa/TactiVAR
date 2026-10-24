// v3.16.1 – afspilningen skal ligne fodbold (brugeren efter v3.16.0: "2 spillere stående lige oven i hinanden …
// modstanderen har 7 spillere stående på midterlinjen ved start … ingen udvikling i starten af kampen … ingen heat map
// for modstander"). Hvert bånd er rødt mod v3.16.0 (tallene i kommentarerne: v3.16.0 → nu, 80 kampe).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { livePositions, coupledPositions, kickoffPositions, KICKOFF_Y } from '../../public/engine/positions.js';
import { FORMATIONS } from '../../public/engine/formations.js';
import { zones, zoneShots } from '../../public/engine/heatmap.js';

const N = 80;
const matches = [];
for (let s = 1; s <= N; s++) {
  const L = createLeague(createRng(s));
  matches.push(simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31)));
}
const frames = matches.flatMap((m) => m.trace.frames);
const outfield = (f, side) => f[side].slice(1);

test('ingen linje-kollaps: højst 5 markspillere fra samme hold inden for 3 i y (3-5-2s midtbane er 5) – v3.16.0: 1/3 af billederne, nu 0', () => {
  let bad = 0;
  for (const f of frames) for (const side of ['h', 'a']) {
    const ys = outfield(f, side).map((q) => q[2]);
    if (Math.max(...ys.map((y) => ys.filter((z) => Math.abs(z - y) <= 3).length)) > 5) bad++;
  }
  assert.equal(bad, 0);
});

test('holdets dybde: forreste til bageste markspiller mindst 18 i hvert billede (MIN_DEPTH)', () => {
  for (const f of frames) for (const side of ['h', 'a']) {
    const ys = outfield(f, side).map((q) => q[2]);
    assert.ok(Math.max(...ys) - Math.min(...ys) >= 18, `t ${f.t} ${side}: ${ys.join(',')}`);
  }
});

test('ingen brikker oven i hinanden: under 1 % af billederne har to spillere (begge hold) nærmere end 4 – v3.16.0: 96 % (2385 af 2480), nu < 1 %', () => {
  let bad = 0;
  for (const f of frames) {
    const all = [...f.h, ...f.a];
    if (all.some((p, i) => all.slice(i + 1).some((q) => Math.hypot(p[1] - q[1], p[2] - q[2]) < 4))) bad++;
  }
  assert.ok(bad / frames.length < 0.01, `${bad} af ${frames.length}`);
});

test('afsparket: alle i egen halvdel, og højst 4 fra et hold inden for 3 af midterlinjen – v3.16.0: 7 på y 52', () => {
  for (const m of matches) {
    const f = m.trace.frames[0];
    for (const side of ['h', 'a']) {
      const own = outfield(f, side).map((q) => (side === 'h' ? q[2] : 100 - q[2]));   // hjemme angriber mod y 0
      assert.ok(own.every((y) => y >= 50), `${side}: ${own.join(',')}`);
      assert.ok(own.filter((y) => y <= 53).length <= 4, `${side}: ${own.join(',')}`);
    }
  }
});

test('udvikling fra start: bolden flytter sig mellem de første fem tick (spredning i y ≥ 10 i snit) – v3.16.0: 0, nu ≈ 22', () => {
  let sum = 0;
  for (const m of matches) {
    const ys = m.trace.frames.slice(1, 6).map((f) => f.ball[1]), mu = ys.reduce((a, b) => a + b) / ys.length;
    sum += Math.sqrt(ys.reduce((a, y) => a + (y - mu) ** 2, 0) / ys.length);
  }
  assert.ok(sum / N >= 10, `${(sum / N).toFixed(1)}`);
});

test('grundbilledet følger duellen: bolden står ved en spiller – modstanderens ved en erobring (lost), ellers hos holdet med bolden', () => {
  let lost = 0, run = 0, none = 0, off = 0;
  for (const f of frames.filter((x) => x.poss)) {
    const other = f.poss === 'h' ? 'a' : 'h', holder = f.lost ? other : f.poss;
    assert.ok(f[holder].some((q) => q[1] === f.ball[0] && q[2] === f.ball[1]), `t ${f.t} ${f.lost ? 'lost' : f.run ? 'run' : 'none'}`);
    if (f.lost) lost++; else if (f.run) run++; else if (f.offside) off++; else none++;
    if (f.run || f.offside) {   // løberen er holdets forreste
      const me = f[f.poss].find((q) => q[1] === f.ball[0] && q[2] === f.ball[1]), up = f.poss === 'h';
      assert.ok(f[f.poss].slice(1).every((q) => (up ? q[2] >= me[2] : q[2] <= me[2])), `t ${f.t}: løberen er ikke forrest`);
    }
  }
  assert.ok(lost > 100 && run > 100 && none > 100 && off > 20, `${lost}/${run}/${none}/${off}`);   // alle slags findes i data
});

test('sammenpresningen bevarer formationen: ingen to fra samme hold bytter række i y (alle formationer × pres × boldside)', () => {
  const t = (f, p) => ({ baseFormation: f, customCoords: {}, phases: { phase1_buildUp: { offBallRuns: 'NORMAL' }, phase2_defending: { pressingHeight: p } } });
  for (const a of Object.keys(FORMATIONS)) for (const b of Object.keys(FORMATIONS)) for (const p of ['LOW_BLOCK', 'MID_BLOCK', 'HIGH_GEGENPRESS']) for (const x of [12, 50, 88]) {
    const k = coupledPositions(t(a, p), t(b, p), { ballX: x });
    const rawB = livePositions(t(a, p), { attacking: true, ballX: x }), rawO = livePositions(t(b, p), { attacking: false, ballX: 100 - x });
    for (const [raw, now] of [[rawB, k.ball], [rawO, k.opp]]) for (let i = 1; i < 11; i++) for (let j = 1; j < 11; j++) {
      if (raw[i].y < raw[j].y - 1) assert.ok(now[i].y <= now[j].y, `${a} mod ${b} ${p} x ${x}: ${i} (${raw[i].y}→${now[i].y}) foran ${j} (${raw[j].y}→${now[j].y})`);
    }
  }
});

test(`afsparkets form: forreste på KICKOFF_Y (${KICKOFF_Y}), bagkæden hvor den stod`, () => {
  const t = { baseFormation: '3-4-3', customCoords: {}, phases: { phase2_defending: { pressingHeight: 'MID_BLOCK' } } };
  const ys = kickoffPositions(t).slice(1).map((q) => q.y), raw = livePositions(t, { attacking: false }).slice(1).map((q) => q.y);
  assert.equal(Math.min(...ys), KICKOFF_Y);
  assert.equal(Math.max(...ys), Math.max(...raw));
});

test('modstanderens zone-kort set fra din side: hans angreb nederst, hans højre = din venstre, summen 1, målmanden ude', () => {
  // Udeholdet ('a') i fælles koordinater: hjemme angriber mod y 0, så ude angriber mod y 100. To punkter ved dit mål (y 90,
  // fælles), x 10 fælles = hans højre (hans egne koordinater x 90) = din venstre (kolonne 0); ét i hans egen tredjedel.
  const trace = { frames: [{ h: [], a: [[1, 50, 5], [2, 10, 90], [3, 10, 92], [4, 80, 10]] }], moments: [] };
  const z = zones(trace, 'a', 1);
  assert.deepEqual(z.map((r) => r.map((v) => +v.toFixed(3))), [[0, 0, 0.333], [0, 0, 0], [0.667, 0, 0]]);
  const shots = zoneShots({ frames: [], moments: [{ side: 'a', shooter: 2, kind: 'SAVE', t: 3, ev: 0, a: [[2, 30, 85]], h: [], ball: [30, 85] }] }, 'a');
  assert.deepEqual([shots[0].x, shots[0].y, shots[0].outcome], [30, 85, 'save']);   // fælles koordinater: ved dit mål nederst
});
