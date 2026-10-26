// v3.21.0 – spillerne bevæger sig i kampen (brugeren: "skal kortet passe til kilometerne, skal motoren flytte spillerne mere
// rundt i kampen … så må spillet også blive mere præcist"). positions.js driftAt + coupledPositions; måling i
// tools/measure-movement.mjs (samme kampe med og uden bevægelsen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { driftAt, coupledPositions, livePositions, DRIFT_AXES, MIN_DEPTH, ONSIDE_GAP, ROW_MAX } from '../../public/engine/positions.js';
import { FORMATIONS } from '../../public/engine/formations.js';
import { viewRatingEntry, RATING_PRIVATE_FIELDS } from '../../public/engine/visibility.js';

test('spillet sender aldrig drift: false – kun test-arenaerne gør', () => {
  for (const f of ['season.js', 'match.js']) assert.doesNotMatch(fs.readFileSync(new URL(`../../public/engine/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''), /drift\s*:\s*false/);
});

test('driftAt: en ren funktion af (seed, hold, plads, tick) – samme svar hver gang, andet tick eller hold giver et andet; uden drift og for målmanden ingen bevægelse', () => {
  const d = { seed: 77, team: 1, t: 5 };
  assert.deepEqual(driftAt(d, 'CM', 6), driftAt({ ...d }, 'CM', 6));
  assert.notDeepEqual(driftAt(d, 'CM', 6), driftAt({ ...d, t: 6 }, 'CM', 6));
  assert.notDeepEqual(driftAt(d, 'CM', 6), driftAt({ ...d, team: 2 }, 'CM', 6));
  assert.notDeepEqual(driftAt(d, 'CM', 6), driftAt({ ...d, seed: 78 }, 'CM', 6));
  assert.deepEqual(driftAt(null, 'CM', 6), [0, 0]); assert.deepEqual(driftAt(d, 'GK', 0), [0, 0]);
  // Glidende: et halvt tick flytter mindre end et helt (to bølger, perioder ≥ 2,5 tick)
  let half = 0, whole = 0;
  for (let t = 0; t < 30; t++) {
    const [a, b, c] = [t, t + 0.5, t + 1].map((k) => driftAt({ seed: 3, team: 1, t: k }, 'CM', 6));
    half += Math.hypot(b[0] - a[0], b[1] - a[1]); whole += Math.hypot(c[0] - a[0], c[1] - a[1]);
  }
  assert.ok(half < whole * 0.75, `halvt ${half.toFixed(1)} mod helt ${whole.toFixed(1)}`);
});

test('driftAt: udslaget følger rollen (CM > CB, backen mest i dybden) og holdets pres – ikke spilleren (ingen udholdenhed: modstanderens kort må ikke røbe den)', () => {
  const amp = (role, slot, phases = {}) => { let x = 0, y = 0; for (let s = 1; s <= 200; s++) for (let t = 0; t < 30; t += 3) { const [a, b] = driftAt({ seed: s, team: 1, t }, role, slot, phases); x = Math.max(x, Math.abs(a)); y = Math.max(y, Math.abs(b)); } return [x, y]; };
  const cm = amp('CM', 6), cb = amp('CB', 2), lb = amp('LB', 1);
  assert.ok(cm[0] > cb[0] * 2 && cm[1] > cb[1] * 2, `CM ${cm} mod CB ${cb}`);
  assert.ok(lb[1] > lb[0] * 2, `backen langs linjen: ${lb}`);
  // Aldrig mere end rollens akse × løb × pres (summen af bølgerne er højst 1); løb uden bold ændrer intet (udvandede løbene)
  const max = DRIFT_AXES.CM.map((a) => a * (11.8 / 10.6) * 1.2);
  const hi = amp('CM', 6, { phase2_defending: { pressingHeight: 'HIGH_GEGENPRESS' }, phase1_buildUp: { offBallRuns: 'MANY' } }), lo = amp('CM', 6, { phase2_defending: { pressingHeight: 'LOW_BLOCK' }, phase1_buildUp: { offBallRuns: 'FEW' } });
  assert.ok(hi[0] <= max[0] + 1e-9 && hi[1] <= max[1] + 1e-9, `${hi} ≤ ${max}`);
  assert.ok(hi[0] > lo[0] * 1.3 && hi[1] > lo[1] * 1.3, `gegenpres ${hi} mod lav blok ${lo}`);   // 1,2 / 0,85 = 1,41
  assert.deepEqual(amp('CM', 6, { phase1_buildUp: { offBallRuns: 'MANY' } }), amp('CM', 6, { phase1_buildUp: { offBallRuns: 'FEW' } }), 'løb uden bold: samme udslag');
  assert.equal(driftAt.length, 3, 'driftAt kender kun (drift, rolle, plads[, faser]) – ingen spiller');
  assert.doesNotMatch(driftAt.toString(), /stamina|skills|freshness/);
});

test('koblede linjer MED bevægelse (alle formationer × pres × boldside × 40 seeds): ingen oven i hinanden, dybden holder, ingen række over 5, boldholdet ikke forbi linjen, linjen er modstanderens dybeste', () => {
  const t = (f, p) => ({ baseFormation: f, customCoords: {}, phases: { phase1_buildUp: { offBallRuns: 'NORMAL' }, phase2_defending: { pressingHeight: p } } });
  const F = Object.keys(FORMATIONS);
  let n = 0, moved = 0;
  for (let k = 0; k < 40 * 9; k++) {
    const a = F[k % F.length], b = F[(k * 7 + 3) % F.length], p = ['LOW_BLOCK', 'MID_BLOCK', 'HIGH_GEGENPRESS'][k % 3], x = [12, 50, 88][Math.floor(k / 3) % 3];
    const dr = (team) => ({ seed: 1000 + k, team, t: k % 31 });
    const r = coupledPositions(t(a, p), t(b, p), { ballX: x, ballDrift: dr(1), oppDrift: dr(2) }), r0 = coupledPositions(t(a, p), t(b, p), { ballX: x });
    n++; if (JSON.stringify(r) !== JSON.stringify(r0)) moved++;
    const B = r.ball, O = r.opp.map((q) => ({ x: 100 - q.x, y: 100 - q.y })), all = [...B, ...O];
    for (let i = 0; i < 22; i++) for (let j = i + 1; j < 22; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= 4, `${a}/${b} ${p} x ${x} k ${k}: ${i} og ${j}`);
    for (const pts of [r.ball, r.opp]) {
      const ys = pts.slice(1).map((q) => q.y);
      assert.ok(Math.max(...ys) - Math.min(...ys) >= MIN_DEPTH, `dybde ${a}/${b} k ${k}`);
      assert.ok(Math.max(...ys.map((y) => ys.filter((z) => Math.abs(z - y) <= 3).length)) <= ROW_MAX, `række ${a}/${b} k ${k}: ${ys}`);
    }
    assert.ok(r.ball.slice(1).every((q) => q.y >= r.line + ONSIDE_GAP), `forbi linjen ${a}/${b} k ${k}`);
    assert.equal(r.line, 100 - Math.max(...r.opp.slice(1).map((q) => q.y)), 'linjen = modstanderens dybeste');
  }
  assert.ok(moved > n * 0.95, `data: bevægelsen flytter ${moved} af ${n}`);
});

test('bevægelsen: bredden i livePositions, dybden først efter sammenpresningen (rå y uændret, x flyttet)', () => {
  const tac = { baseFormation: '4-4-2', customCoords: {}, phases: {} }, dr = { seed: 5, team: 1, t: 4 };
  const a = livePositions(tac, { attacking: true, ballX: 50 }), b = livePositions(tac, { attacking: true, ballX: 50, drift: dr });
  assert.deepEqual(b.map((q) => q.y), a.map((q) => q.y));
  assert.ok(b.slice(1).some((q, i) => q.x !== a[i + 1].x)); assert.deepEqual(b[0], a[0], 'målmanden står');
});

// tools/measure-movement.mjs (40 kampe, dit hold hjemme, spillere med ≥ 85 min): uden bevægelsen (= v3.20.2) → med.
// CM-dækning 16,2 % → 27,8 %; rollernes rækkefølge i dækning mod km (rang over 6 roller) 0,26 → 0,71; egen andel af
// flytningen 0,20 → 0,49; spring billede → afslutning (median) 4 → 6. Båndene er røde på v3.20.2-tallene.
test('målt: kortet følger løbet – CM dækker 24–40 % af banen (før 16 %), rollernes rækkefølge følger km (≥ 0,5; før 0,26), uden rysten', async () => {
  const { measureMovement } = await import('../../tools/measure-movement.mjs');
  const { before, after } = await measureMovement(40);
  assert.ok(before.coverage.CM < 0.2, `data: før ${before.coverage.CM}`);
  assert.ok(after.coverage.CM >= 0.24 && after.coverage.CM <= 0.4, `CM ${after.coverage.CM}`);
  assert.ok(after.coverage.CM > after.coverage.CB * 1.5, `CM ${after.coverage.CM} mod CB ${after.coverage.CB}`);
  assert.ok(after.roleRank >= 0.5 && before.roleRank < 0.5, `rang ${after.roleRank} (før ${before.roleRank})`);
  assert.ok(after.ownShare <= 0.6, `egen andel af flytningen ${after.ownShare} – mere er rysten`);
  assert.ok(after.jumpMedian <= 8, `spring billede → afslutning ${after.jumpMedian}`);
});

test('🤼 er privat: modstanderens karakterlinje har hverken duels eller duelsWon – din har (Security Reviewer F2)', async () => {
  const { createRng } = await import('../../public/engine/rng.js');
  const { createLeague } = await import('../../public/engine/generator.js');
  const { simulateMatch } = await import('../../public/engine/match.js');
  const L = createLeague(createRng(3)), m = simulateMatch(L.teams[0], L.teams[1], createRng(9));
  const e = m.ratings.away.find((x) => x.duels > 0);
  assert.ok(e, 'data: en modstander med dueller');
  const theirs = viewRatingEntry(e, false), mine = viewRatingEntry(e, true);
  assert.ok(!('duels' in theirs) && !('duelsWon' in theirs), JSON.stringify(theirs));
  assert.equal(mine.duels, e.duels); assert.ok(RATING_PRIVATE_FIELDS.includes('duels') && RATING_PRIVATE_FIELDS.includes('duelsWon'));
  assert.ok(!Object.keys(m).includes('driftSeed') && m.driftSeed != null, 'driftSeed er ikke-optælleligt (gemmes ikke, F1)');
});
