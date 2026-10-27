// v3.22.1 – afleveringen før afslutningen (brugeren: "når man ser spillet, så kommer bolden fra venstre ind til målscoreren, men
// oplægsmanden står bagved og til højre … hvis du har ret i det, så er målscorer offside, alle modstanderne er langt fremme").
// match.js momentAt: from = oplæggeren, recv = skyttens plads, da bolden blev spillet (onside på linjen); replay.js spiller
// bolden fra → recv → afslutningen. Kun sporet: kampene uændrede (fingerprint.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { replaySteps, passOf } from '../../public/ui/replay.js';
import { MIN_APART, ONSIDE_GAP } from '../../public/engine/positions.js';
import { isValidTrace } from '../../public/engine/sanitize.js';

const M = Array.from({ length: 200 }, (_, i) => { const s = i + 1, L = createLeague(createRng(s)); return simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31)); });
const COMBOS = new Set(['cb', 'run', 'cross', 'long']);
// Fælles koordinater: hjemme angriber mod y 0, ude mod y 100. "Fremad" for siden = mod modstanderens mål.
const fwd = (side, y) => (side === 'h' ? -y : y);

test('oplæggeren: målets oplæg, ellers afleveringens spiller i handlingsloggen – aldrig skytten, og han er på banen i billedet', () => {
  let goals = 0, shots = 0;
  for (const m of M) for (const o of m.trace.moments) {
    if (o.from == null) { assert.equal(o.recv, undefined, 'intet recv uden oplægger'); continue; }
    assert.notEqual(o.from, o.shooter);
    assert.ok(o[o.side].some((q) => q[0] === o.from), 'oplæggeren står i billedet');
    if (o.scorer) { assert.equal(o.from, o.assist); goals++; }
    else {
      const a = m.trace.acts.findLast((e) => e[0] === o.t * 3 && e[2] === o.side && e[4] === o.shooter && COMBOS.has(e[1]));
      assert.ok(a, `${o.kind} ${o.t * 3}': en kombination i loggen`); assert.equal(o.from, a[3]); shots++;
    }
  }
  assert.ok(goals > 200 && shots > 100, `data: ${goals} mål og ${shots} afslutninger med oplægger`);
  // Positivt: et mål med oplæg, hvor oplæggeren er på banen og ikke skytten, HAR from
  let withAssist = 0;
  for (const m of M) for (const o of m.trace.moments) if (o.scorer && o.assist && o.assist !== o.scorer && o[o.side].some((q) => q[0] === o.assist)) { withAssist++; assert.equal(o.from, o.assist); }
  assert.ok(withAssist > 200);
});

test('recv: skytten står onside PÅ linjen (forsvarets dybeste markspiller + ONSIDE_GAP), ikke oven i nogen (≥ MIN_APART), og afslutningen står fremme', () => {
  let n = 0, moved = 0;
  for (const m of M) for (const o of m.trace.moments) {
    if (!o.recv) continue;
    n++;
    const opp = o.side === 'h' ? 'a' : 'h', gk = m.ratings[opp === 'h' ? 'home' : 'away'].find((e) => e.role === 'GK')?.playerId;
    const deepest = Math.max(...o[opp].filter((q) => q[0] !== gk).map((q) => fwd(o.side, q[2])));
    assert.equal(fwd(o.side, o.recv[1]), deepest - ONSIDE_GAP, `${o.t * 3}': recv ${o.recv} på linjen (${deepest})`);
    const others = [...o.h, ...o.a].filter((q) => q[0] !== o.shooter);
    assert.ok(Math.min(...others.map((q) => Math.hypot(q[1] - o.recv[0], q[2] - o.recv[1]))) >= MIN_APART, `${o.t * 3}': recv oven i en anden`);
    const shot = o[o.side].find((q) => q[0] === o.shooter);
    assert.ok(fwd(o.side, shot[2]) > fwd(o.side, o.recv[1]), 'han løber ind'); assert.ok(Math.abs(shot[1] - o.recv[0]) <= 40);
    if (shot[1] !== o.recv[0]) moved++;
  }
  // Før QC-rettelsen stod 235 af 486 inden for MIN_APART af en anden spiller (skyttens bredde uændret)
  assert.ok(n > 400 && moved > 100, `data: ${n} afleveringer, ${moved} flyttet til siden`);
  assert.ok(M.every((m) => isValidTrace(m.trace)));
});

test('air: indlæg, lang bold og hovedstød – og ikke cutback/løb; et solo-mål har ingen oplægger', () => {
  let air = 0, ground = 0, solo = 0;
  for (const m of M) for (const o of m.trace.moments) {
    if (o.scorer && !o.assist) { solo++; assert.equal(o.from, undefined); }
    if (!o.from) continue;
    // afleveringen, der førte til afslutningen (et hjørnespark til samme skytte senere i minuttet tæller ikke – data seed 94, 30')
    const a = !o.scorer && m.trace.acts.find((e) => e[0] === o.t * 3 && e[2] === o.side && e[3] === o.from && e[4] === o.shooter && COMBOS.has(e[1]));
    const want = o.kind === 'HEADER_GOAL' || (a && (a[1] === 'cross' || a[1] === 'long'));
    assert.equal(!!o.air, !!want, `${o.kind} ${a?.[1]}`); if (want) air++; else ground++;
  }
  assert.ok(air > 50 && ground > 200 && solo > 20, `data: ${air} i luften, ${ground} langs jorden, ${solo} solo-mål`);
});

test('spor fra før v3.22.1 (uden from/recv/air): et mål med oplæg får oplæggeren og en onside-plads ud fra billedet', () => {
  let n = 0, same = 0;
  for (const m of M) for (const o of m.trace.moments.filter((x) => x.scorer && x.from)) {
    const { from, recv, air, ...old } = o, p = passOf(old), q = o[o.side].find((x) => x[0] === o.from);
    assert.deepEqual(p.from, [q[1], q[2]]); assert.equal(p.air, o.kind === 'HEADER_GOAL');
    if (o.recv) { assert.ok(p.recv); if (p.recv[1] === o.recv[1]) same++; n++; }
  }
  assert.ok(n > 150 && same >= n * 0.95, `data: ${same} af ${n} samme linje som motoren`);
  const o = M[0].trace.moments.find((x) => !x.scorer); const { from, recv, air, ...old } = o;
  assert.deepEqual(passOf(old), { from: null, recv: null, air: false }, 'en afslutning uden mål i et gammelt spor: ingen gætteri');
});

test('replaySteps: øjeblikkets trin bærer oplæggerens plads og recv; uden oplægger ingen', () => {
  let n = 0;
  for (const m of M.slice(0, 40)) for (const s of replaySteps(m.trace).filter((x) => x.kind === 'moment')) {
    const o = m.trace.moments.find((x) => x.ev === s.ev && x.t === s.t);
    if (!o.from) { assert.equal(s.from, null); assert.equal(s.recv, null); assert.equal(s.air, false); continue; }
    const q = o[o.side].find((p) => p[0] === o.from);
    assert.deepEqual(s.from, [q[1], q[2]]); assert.deepEqual(s.recv, o.recv ?? null); assert.equal(s.air, !!o.air); n++;
  }
  assert.ok(n > 40, `data: ${n}`);
});

test('gemmet: from skal være tekst og recv et punkt på banen', () => {
  const tr = structuredClone(M.find((m) => m.trace.moments.some((o) => o.recv)).trace), o = tr.moments.find((x) => x.recv);
  assert.ok(isValidTrace(tr));
  o.recv = [50, 120]; assert.equal(isValidTrace(tr), false);
  o.recv = [50, 50]; o.from = 7; assert.equal(isValidTrace(tr), false);
});
