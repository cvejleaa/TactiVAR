// v3.16 Test Manager: kontrolværktøjet tools/trace-invariants.mjs (checkTrace) er selv testet. trace.test.mjs viser kun, at
// checkTrace giver INGEN fejl på 150 rigtige kampe – en kontrol, der aldrig melder fejl, består den også (14 mutationer i
// checkTrace overlevede: antal billeder, 7–11 spillere, dobbelt id, uden for banen, spillerne = arket, scoreren i billedet).
// Her: (1) hver regel melder fejl, når sporet ødelægges på netop den måde, og melder IKKE ved grænseværdierne; (2) skiftereglerne
// (træthedsskift sker før billedet, skadesskift efter) bundet mod rigtige kampe. trace.test.mjs' 150 kampe har KUN skadesskift
// (117 SUB, alle "Skadesskift") – træthedsskift kræver en udskiftningsgrænse på holdet, så den sættes her.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { checkTrace, traceReport } from '../../tools/trace-invariants.mjs';

function play(s, limit = 0) {
  const L = createLeague(createRng(s)), a = L.teams[s % 8], b = L.teams[(s + 3) % 8];
  if (limit) { a.subsLimit = limit; b.subsLimit = limit; }
  return simulateMatch(a, b, createRng(s * 31));
}
const errorsAfter = (m, f) => { const c = structuredClone(m); f(c); return checkTrace(c).errors; };
const tagOf = (e) => `#${e.shirtNumber} ${e.shortName}`;
const entry = (m, tag) => [...m.ratings.home, ...m.ratings.away].find((e) => tagOf(e) === tag);
const M = play(3);

test('kontrol: en uberørt kamp giver ingen fejl, et spor med forkert version/uden spor melder det', () => {
  assert.deepEqual(checkTrace(M).errors, []);
  assert.deepEqual(errorsAfter(M, (c) => { delete c.trace; }), ['intet spor (v 1)']);
  assert.deepEqual(errorsAfter(M, (c) => { c.trace.v = 2; }), ['intet spor (v 1)']);
});

test('billeder: 31 med t = 0…30 i rækkefølge – færre, flere eller en forkert t melder fejl', () => {
  assert.ok(errorsAfter(M, (c) => c.trace.frames.splice(5, 1)).some((e) => /^billeder:/.test(e)));
  assert.ok(errorsAfter(M, (c) => c.trace.frames.pop()).some((e) => /^billeder:/.test(e)));
  assert.ok(errorsAfter(M, (c) => c.trace.frames.push({ ...c.trace.frames.at(-1), t: 31 })).some((e) => /^billeder:/.test(e)));
  assert.ok(errorsAfter(M, (c) => { c.trace.frames[3].t = 99; }).some((e) => /^billeder:/.test(e)), 'en forkert t');
  assert.ok(errorsAfter(M, (c) => { [c.trace.frames[3], c.trace.frames[4]] = [c.trace.frames[4], c.trace.frames[3]]; }).some((e) => /^billeder:/.test(e)), 'byttet rækkefølge');
});

test('spillere pr. hold: 7–11 er tilladt, 6 og 12 melder fejl', () => {
  const spillere = (errs) => errs.filter((e) => /spillere$/.test(e));
  assert.deepEqual(spillere(errorsAfter(M, (c) => { c.trace.frames[4].h = c.trace.frames[4].h.slice(0, 6); })).length, 1, '6 spillere');
  assert.match(spillere(errorsAfter(M, (c) => { c.trace.frames[4].h = c.trace.frames[4].h.slice(0, 6); }))[0], /^t 4 h: 6 spillere$/);
  assert.deepEqual(spillere(errorsAfter(M, (c) => { c.trace.frames[4].a = c.trace.frames[4].a.slice(0, 7); })), [], '7 er stadig i orden');
  assert.deepEqual(spillere(errorsAfter(M, (c) => { c.trace.frames[4].a = c.trace.frames[4].a.slice(0, 11); })), [], '11 er i orden');
  const errs = errorsAfter(M, (c) => { c.trace.frames[4].a.push(['ekstra', 50, 50]); });
  assert.ok(errs.includes('t 4 a: 12 spillere'), '12 er for mange: ' + errs.join(' | '));
});

test('dobbelt id og uden for banen: meldes; selve kanten (0 og 100) er inden for', () => {
  assert.ok(errorsAfter(M, (c) => { c.trace.frames[4].h[2][0] = c.trace.frames[4].h[1][0]; }).includes('t 4 h: dobbelt id'));
  for (const [i, v] of [[1, 100.5], [1, -0.5], [2, 100.5], [2, -0.5]]) assert.ok(errorsAfter(M, (c) => { c.trace.frames[4].a[3][i] = v; }).includes('t 4 a: uden for banen'), `${i}=${v}`);
  const edge = errorsAfter(M, (c) => { c.trace.frames[4].a[3][1] = 0; c.trace.frames[4].a[3][2] = 100; c.trace.frames[4].a[4][1] = 100; c.trace.frames[4].a[4][2] = 0; });
  assert.deepEqual(edge.filter((e) => /uden for banen/.test(e)), [], 'kanten er inden for banen');
  const mo = M.trace.moments.find((x) => x.h.length && x.a.length);
  assert.ok(errorsAfter(M, (c) => { c.trace.moments.find((x) => x.ev === mo.ev).h[0][1] = 101; }).some((e) => new RegExp(`^øjeblik ${mo.kind} t ${mo.t}: uden for banen$`).test(e)), 'øjeblik, hjemme');
  assert.ok(errorsAfter(M, (c) => { c.trace.moments.find((x) => x.ev === mo.ev).a[0][2] = -1; }).some((e) => /^øjeblik .* uden for banen$/.test(e)), 'øjeblik, ude');
  const ok = errorsAfter(M, (c) => { const x = c.trace.moments.find((y) => y.ev === mo.ev); x.h[0][1] = 0; x.h[0][2] = 100; });
  assert.deepEqual(ok.filter((e) => /uden for banen/.test(e)), [], 'kanten i et øjeblik');
});

test('på banen = arket: en ukendt spiller i stedet for en kendt, en manglende spiller og en spiller mere end arket melder "på banen"', () => {
  const pb = (errs) => errs.filter((e) => /på banen/.test(e));
  const swapped = errorsAfter(M, (c) => { c.trace.frames[4].h[3][0] = 'ukendt'; });
  assert.deepEqual(pb(swapped), [`t 4 h: på banen 11, arket 11`], 'samme antal, forkert id');
  const missing = errorsAfter(M, (c) => { c.trace.frames[4].h.pop(); });
  assert.deepEqual(pb(missing), [`t 4 h: på banen 10, arket 11`], 'en spiller mangler (alle id\'er er kendte)');
  const extra = errorsAfter(M, (c) => { const f = c.trace.frames[4]; f.a.push(['ekstra', 50, 50]); });
  assert.ok(pb(extra).includes('t 4 a: på banen 12, arket 11'));
  assert.deepEqual(pb(errorsAfter(M, () => {})), []);
});

test('mål: scoreren skal stå i sit holds billede', () => {
  const mo = M.trace.moments.find((x) => x.scorer);
  assert.ok(mo, 'data: et mål');
  const errs = errorsAfter(M, (c) => { const x = c.trace.moments.find((y) => y.ev === mo.ev); x[x.side] = x[x.side].filter((q) => q[0] !== x.scorer); });
  assert.ok(errs.includes(`mål t ${mo.t}: scoreren står ikke i billedet`), errs.join(' | '));
  // Står han kun i det ANDRE holds billede, hjælper det ikke
  const other = errorsAfter(M, (c) => { const x = c.trace.moments.find((y) => y.ev === mo.ev); const o = x.side === 'h' ? 'a' : 'h'; x[o].push([x.scorer, 50, 50]); x[x.side] = x[x.side].filter((q) => q[0] !== x.scorer); });
  assert.ok(other.some((e) => /scoreren står ikke i billedet/.test(e)));
});

test('skiftereglerne: et træthedsskift sker FØR billedet i sit tick, et skadesskift EFTER – kontrollen kender begge og melder, hvis et billede bytter dem om', () => {
  let fat = 0, inj = 0;
  for (let s = 1; s <= 40 && (fat < 6 || inj < 6); s++) {
    const m = play(s, 85);
    assert.deepEqual(checkTrace(m).errors, [], `seed ${s} (udskiftningsgrænse 85)`);
    for (const e of m.events.filter((x) => x.type === 'SUB')) {
      const [subTag, outTag] = e.label.replace(/^🔄 /, '').split(' ind for '), sub = entry(m, subTag).playerId, out = entry(m, outTag).playerId, side = e.isHome ? 'h' : 'a';
      const has = (c, t, id) => c.trace.frames[t][side].some((q) => q[0] === id);
      const t = e.min / 3, injury = /Skadesskift/.test(e.text);
      const swap = (c, tt) => { const f = c.trace.frames[tt][side]; const a = f.find((q) => q[0] === sub), b = f.find((q) => q[0] === out); if (a) a[0] = out; if (b) b[0] = sub; };
      if (injury) {
        // billedet i skadens tick er taget FØR skaden: den skadede står endnu, indskifteren ikke; i næste billede omvendt
        assert.ok(has(m, t, out) && !has(m, t, sub), `seed ${s}: skadesskift ${e.min}' – skadet på banen, indskifter ikke`);
        if (t < 30) assert.ok(!has(m, t + 1, out) && has(m, t + 1, sub));
        assert.ok(checkTrace(structuredClone(m)).errors.length === 0);
        assert.ok(errorsAfter(m, (c) => swap(c, t)).length > 0, `seed ${s}: et billede med indskifteren et tick for tidligt skal melde fejl`);
        inj++;
      } else {
        // træthedsskiftet sker i starten af tick'et: indskifteren står allerede i billedet, den udskiftede ikke
        assert.ok(has(m, t, sub) && !has(m, t, out), `seed ${s}: træthedsskift ${e.min}' – indskifter på banen, den udskiftede ikke`);
        if (t > 0) assert.ok(has(m, t - 1, out) && !has(m, t - 1, sub));
        assert.ok(errorsAfter(m, (c) => swap(c, t)).length > 0, `seed ${s}: et billede med den udskiftede et tick for længe skal melde fejl`);
        fat++;
      }
    }
  }
  assert.ok(fat >= 6 && inj >= 6, `data: træthedsskift ${fat}, skadesskift ${inj}`);
});

test('fund og rapport: målene med billede tælles, billederne med bold er 30, rapporten giver ingen fejl og en størrelse', () => {
  const r = checkTrace(M);
  assert.equal(r.finding.goals, M.trace.moments.filter((x) => x.scorer).length);
  assert.equal(r.finding.frontFrames, 30);
  const rep = traceReport(6);
  assert.deepEqual(rep.errors, []);
  assert.ok(rep.bytesPerMatch > 3000 && rep.bytesPerMatch < 25000, `${rep.bytesPerMatch}`);
  assert.equal(rep.sum.frontFrames, 180);
});
