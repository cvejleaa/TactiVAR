// v3.16: kampens spor (match.js "Kampens spor") – kontrolværktøjets regler (tools/trace-invariants.mjs) holder over mange
// kampe, også med mange udvisninger og skift; sporet er deterministisk og lille; afslutningerne har et billede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { CARD_RULES } from '../../public/engine/match-rules.js';
import { checkTrace } from '../../tools/trace-invariants.mjs';

const play = (s, wrap = (r) => r) => { const L = createLeague(createRng(s)); return simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], wrap(createRng(s * 31))); };

test('sporets regler holder over 150 kampe: 31 billeder, 7–11 spillere, på banen = arkets skift og udvisninger, scoreren i billedet', () => {
  let subs = 0, reds = 0, goals = 0;
  for (let s = 1; s <= 150; s++) {
    const m = play(s), r = checkTrace(m);
    assert.deepEqual(r.errors, [], `seed ${s}`);
    subs += m.events.filter((e) => e.type === 'SUB').length; reds += m.events.filter((e) => e.type === 'RED').length; goals += r.finding.goals;
  }
  assert.ok(subs > 80 && reds > 10 && goals > 200, `data: skift ${subs}, røde ${reds}, mål med billede ${goals}`);
});

test('mange udvisninger: den udviste forsvinder fra billedet efter sit minut, ingen indskiftning, aldrig under 7', () => {
  const force = (r) => ({ ...r, chance: (p) => (p === 0.06 || p === 0.4 || p === CARD_RULES.DIRECT_RED_P ? true : r.chance(p)) });
  let n = 0;
  for (let s = 1; s <= 15; s++) {
    const m = play(s, force);
    assert.deepEqual(checkTrace(m).errors, [], `seed ${s}`);
    for (const e of m.ratings.home.concat(m.ratings.away).filter((x) => x.red)) {
      const side = e.isHome ? 'h' : 'a';
      // Væk i alle billeder efter udvisningens minut – og med i billedet i selve minuttet (kortet kommer efter billedet)
      for (const f of m.trace.frames.filter((x) => x.t * 3 > e.minOut)) assert.ok(!f[side].some((q) => q[0] === e.playerId), `${e.shortName} t ${f.t} (udvist ${e.minOut}')`);
      if (e.minIn < e.minOut) assert.ok(m.trace.frames[e.minOut / 3][side].some((q) => q[0] === e.playerId), `${e.shortName} i minuttet ${e.minOut}`);
      n++;
    }
  }
  assert.ok(n >= 20, `data: ${n} udviste`);
});

test('afspark og tick: billede 0 uden bold (midten), derefter holdet med bolden; ét koordinatsystem (hjemme angriber mod y 0)', () => {
  const m = play(3), [f0, ...rest] = m.trace.frames;
  assert.equal(f0.poss, null); assert.deepEqual(f0.ball, [50, 50]);
  assert.ok(rest.every((f) => f.poss === 'h' || f.poss === 'a'));
  const gkH = f0.h[0], gkA = f0.a[0];
  assert.ok(gkH[2] > 85 && gkA[2] < 15, `målmændene i hver sin ende: ${gkH} / ${gkA}`);
  // Boldbesiddelsen i billederne følger kamptallet (hvert tick +3 til holdet med bolden; start 10)
  assert.equal(rest.filter((f) => f.poss === 'h').length * 3 + 10, m.stats.hPoss);
});

test('afslutningerne har et billede (mål, redning, forbi, VAR-tjek), dødbolde ikke; ingen øjebliksbilleder uden hændelse', () => {
  const kinds = {};
  for (let s = 1; s <= 40; s++) {
    const m = play(s);
    for (const mo of m.trace.moments) {
      kinds[mo.kind] = (kinds[mo.kind] ?? 0) + 1;
      assert.equal(m.events[mo.ev].type, mo.kind);
      assert.ok(mo.t === Math.round(m.events[mo.ev].min / 3), 'tick = hændelsens minut / 3');
    }
    // En straffe har intet billede (motoren regner ingen placering)
    for (const e of m.events.filter((x) => /STRAFFESPARK/.test(x.text))) assert.ok(!m.trace.moments.some((mo) => m.events[mo.ev] === e), e.text);
  }
  for (const k of ['GOAL', 'SAVE', 'MISS']) assert.ok((kinds[k] ?? 0) >= 20, `${k}: ${JSON.stringify(kinds)}`);
});

test('sporet er deterministisk og lille (under 25 KB pr. kamp – fire kampe i seneste runde)', () => {
  for (const s of [1, 2, 3]) {
    const a = JSON.stringify(play(s).trace), b = JSON.stringify(play(s).trace);
    assert.equal(a, b);
    assert.ok(a.length < 25000, `${a.length} tegn`);
  }
});
