// v3.16 Test Manager: kampens spor mod et ORAKEL – ikke mod sporets egne regler. trace.test.mjs tjekker sporets form (31
// billeder, 7–11 spillere, scoreren i billedet) og ændrer man koordinatsystemet, spejlingen, hvilket billede et øjeblik
// tegnes med, hvem der er skytten eller hvilke hændelser der har et billede, består den stadig (~40 af 57 mutationer i
// optageren overlevede). Her er orakler, der ikke er optagerens egen kode:
//  - livePositions (positions.js) regnet i testen: grundbilleder og øjeblikke skal være holdenes form, spejlet for udeholdet;
//  - øjebliksbilledet (ev.snapshot, bygget af snapshot() og testet i snap-ui/var-front): sporets øjeblik for samme mål
//    skal være det samme billede (spillere, bold, VAR-justeringen af skytten) i fælles koordinater;
//  - referatet: skytten står i teksten og i sit holds billede, dødbolde har intet billede, kontra tegner det tabende hold i angrebsform.
// Orakel-vinduet: før det første røde kort/Hvis-Så-skift (formationen skifter) står spillerne i slot-rækkefølge efter
// holdets tactics – skift (SUB) og haltende spillere ændrer ikke pladsen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch, VAR_BEHIND } from '../../public/engine/match.js';
import { VAR_RULES } from '../../public/engine/match-rules.js';
import { livePositions } from '../../public/engine/positions.js';

// Fælles koordinater: hjemmeholdet angriber mod y 0; udeholdet spejles (100 − x, 100 − y)
const cm = (side, [x, y]) => (side === 'h' ? [Math.round(x), Math.round(y)] : [Math.round(100 - x), Math.round(100 - y)]);
const shape = (team, side, ctx) => livePositions(team.tactics, ctx).map((p) => cm(side, [p.x, p.y]));
const same = (pts, exp, skip = []) => pts.length === exp.length && pts.every((q, i) => skip.includes(q[0]) || (q[1] === exp[i][0] && q[2] === exp[i][1]));
const otherSide = (s) => (s === 'h' ? 'a' : 'h');
const tagOf = (e) => `#${e.shirtNumber} ${e.shortName}`;
const stopOf = (m) => Math.min(91, ...m.events.filter((e) => e.type === 'RED' || e.type === 'TRIGGER').map((e) => e.min));
const forceVar = (r) => ({ ...r, chance: (p) => (p === VAR_RULES.GOAL_CHECK_P ? true : p === VAR_RULES.GOAL_FOUL_SHARE ? false : r.chance(p)) });
function league(s) { const L = createLeague(createRng(s)); return { L, home: L.teams[s % 8], away: L.teams[(s + 3) % 8] }; }
const bots = (n) => { const out = []; for (let s = 1; s <= n; s++) { const { home, away } = league(s); out.push({ s, home, away, m: simulateMatch(home, away, createRng(s * 31)) }); } return out; };
const DATA = bots(80);   // 80 seedede kampe mellem to botter (deles af testene herunder – kun læsning)

test('grundbillederne er holdenes form: afspark begge i blok; ellers holdet med bolden i angrebsform (bolden som sidebelastning), modstanderen i blok mod den spejlede bold', () => {
  let ok = 0, poss = { h: 0, a: 0 };
  for (const { s, home, away, m } of DATA) {
    const T = { h: home, a: away }, stop = stopOf(m);
    for (const f of m.trace.frames.filter((x) => x.t * 3 < stop)) {
      if (!f.poss) { assert.ok(same(f.h, shape(home, 'h', { attacking: false, ballX: 50 })) && same(f.a, shape(away, 'a', { attacking: false, ballX: 50 })), `seed ${s} afspark`); ok++; continue; }
      const att = f.poss, def = otherSide(att), bx = att === 'h' ? f.ball[0] : 100 - f.ball[0];
      assert.equal(f.ball[1], 50, `seed ${s} t ${f.t}: bolden på midterlinjen`);
      assert.ok(same(f[att], shape(T[att], att, { attacking: true, ballX: bx })), `seed ${s} t ${f.t}: ${att} har bolden (ballX ${bx})`);
      assert.ok(same(f[def], shape(T[def], def, { attacking: false, ballX: 100 - bx })), `seed ${s} t ${f.t}: ${def} forsvarer`);
      ok++; poss[att]++;
    }
  }
  assert.ok(ok > 1500 && poss.h > 400 && poss.a > 400, `data: ${ok} billeder, bolden ${JSON.stringify(poss)}`);
});

// Øjeblikket: holdet med afslutningen i sin form (i angreb med bolden på sidebelastningen x, eventuelt med en løber), modstanderen
// i blok mod den spejlede bold – eller, hvis afslutningen er en kontra (bolden blev tabt i angrebet), det tabende hold i angrebsform
// og kontraholdet i blok med bolden på midten (positions.js). Skytten og oplægsgiveren kan stå på "deres" sted (moves) og springes over.
function variantOf(T, mo) {
  const att = mo.side, def = otherSide(att), skip = [mo.scorer, mo.assist];
  for (let x = 0; x <= 100; x++) if (same(mo[att], shape(T[att], att, { attacking: true, ballX: x }), skip) && same(mo[def], shape(T[def], def, { attacking: false, ballX: 100 - x }), skip)) return 'open';
  for (let r = 1; r < 11; r++) for (let x = 0; x <= 100; x++) if (same(mo[att], shape(T[att], att, { attacking: true, ballX: x, runner: r }), skip) && same(mo[def], shape(T[def], def, { attacking: false, ballX: 100 - x }), skip)) return 'open';
  if (same(mo[att], shape(T[att], att, { attacking: false, ballX: 50 }), skip) && same(mo[def], shape(T[def], def, { attacking: true, ballX: 50 }), skip)) return 'caught';
  return null;
}
test('afslutningens øjeblik: holdenes form fra den rigtige side – en kontra tegner det tabende hold i angrebsform (og kun en kontra)', () => {
  const n = { open: 0, caught: 0, sure: 0, counterSure: 0 };
  for (const { s, home, away, m } of DATA) {
    const T = { h: home, a: away }, stop = stopOf(m);
    for (const mo of m.trace.moments.filter((x) => x.t * 3 < stop)) {
      const v = variantOf(T, mo), e = m.events[mo.ev];
      assert.ok(v, `seed ${s}: ${mo.kind} t ${mo.t} (${mo.side}) er ikke holdenes form`);
      const gp = m.goalsPool.find((g) => g.min === e.min && e.text.includes(g.scorer));
      const counter = /kontra/i.test(e.label) || /kontraens/.test(e.text) || gp?.kind === 'COUNTER';
      const open = (e.type === 'SAVE' && /^(Redning|Hovedstød reddet)$/.test(e.label)) || (gp && gp.kind !== 'COUNTER') || (e.type === 'MISS' && e.label === 'Blokeret' && !/kontraens/.test(e.text));
      if (counter) { assert.equal(v, 'caught', `seed ${s}: kontra ${e.label}: ${e.text}`); n.counterSure++; }
      if (open) { assert.equal(v, 'open', `seed ${s}: åbent spil ${e.label}: ${e.text}`); n.sure++; }
      n[v]++;
    }
  }
  assert.ok(n.open > 250 && n.caught > 25 && n.sure > 150 && n.counterSure > 25, JSON.stringify(n));
});

test('skytten: han står i teksten, hører til det hold, øjeblikket tilhører, og står i dets billede; målet tæller for det hold', () => {
  const kinds = {};
  for (const { s, m } of DATA) {
    const who = new Map([...m.ratings.home.map((e) => [e.playerId, { e, side: 'h' }]), ...m.ratings.away.map((e) => [e.playerId, { e, side: 'a' }])]);
    for (const mo of m.trace.moments) {
      const e = m.events[mo.ev], w = who.get(mo.shooter);
      kinds[mo.kind] = (kinds[mo.kind] ?? 0) + 1;
      assert.ok(w, `seed ${s}: ${mo.kind} uden skytte`);
      assert.equal(w.side, mo.side, `seed ${s}: ${mo.kind} – skytten ${w.e.shortName} hører til det andet hold`);
      assert.ok(mo[mo.side].some((q) => q[0] === mo.shooter), `seed ${s}: ${mo.kind} – skytten står ikke i sit holds billede`);
      if (['SAVE', 'MISS', 'GOAL', 'HEADER_GOAL'].includes(mo.kind)) assert.ok(e.text.includes(tagOf(w.e)), `seed ${s}: ${tagOf(w.e)} ikke i "${e.text}"`);
      if (mo.scorer) {
        assert.equal(mo.scorer, mo.shooter);
        assert.equal(e.isHome, mo.side === 'h', `seed ${s}: målet tæller for ${mo.side}`);
        if (mo.assist != null) { assert.notEqual(mo.assist, mo.scorer); assert.equal(who.get(mo.assist)?.side, mo.side, 'oplægget er fra samme hold'); assert.ok(mo[mo.side].some((q) => q[0] === mo.assist)); }
      }
    }
  }
  assert.ok(kinds.SAVE > 80 && kinds.MISS > 100 && kinds.GOAL > 80 && kinds.HEADER_GOAL > 15 && kinds.VAR_CHECK > 10 && kinds.OFFSIDE_FLAG >= 3 && kinds.VAR_NO_GOAL >= 4, JSON.stringify(kinds));
});

test('afslutninger uden mål ligger ved målet (y 20 for hjemmeholdet, y 80 for udeholdet – spejlet), målet i feltets pletter', () => {
  const nogoal = new Set(['SAVE', 'MISS', 'OFFSIDE_FLAG', 'VAR_CHECK', 'VAR_NO_GOAL']);
  let n = 0;
  for (const { s, m } of DATA) for (const mo of m.trace.moments) {
    if (nogoal.has(mo.kind)) { assert.deepEqual(mo.ball, mo.side === 'h' ? [50, 20] : [50, 80], `seed ${s}: ${mo.kind}`); n++; }
    else assert.ok(mo.side === 'h' ? mo.ball[1] <= 40 : mo.ball[1] >= 60, `seed ${s}: ${mo.kind} bold ${mo.ball} (${mo.side})`);
  }
  assert.ok(n > 250, `data: ${n}`);
});

test('dødbolde har intet billede: straffe, frispark og hjørner (også hjørnet efter et indlæg), mål i åbent spil har', () => {
  const SET = new Set(['PENALTY', 'FREEKICK', 'CORNER', 'SETPIECE']);
  let setSaves = 0, openGoals = 0, setGoals = 0;
  for (const { s, m } of DATA) {
    const has = new Set(m.trace.moments.map((x) => x.ev));
    m.events.forEach((e, i) => {
      const prev = m.events[i - 1]?.stats ?? {};
      const moved = (k) => (e.stats[`h${k}`] + e.stats[`a${k}`]) > ((prev[`h${k}`] ?? 0) + (prev[`a${k}`] ?? 0));
      if (['SAVE', 'MISS'].includes(e.type) && (/STRAFFESPARK/.test(e.text) || moved('Corners') || moved('FreeKicks') || moved('Penalties'))) { assert.ok(!has.has(i), `seed ${s}: dødbold har fået et billede: ${e.text}`); setSaves++; }
      if (e.type === 'GOAL' || e.type === 'HEADER_GOAL') {
        const gp = m.goalsPool.find((g) => g.min === e.min && e.text.includes(g.scorer));
        if (!gp) return;
        if (SET.has(gp.kind)) { assert.ok(!has.has(i), `seed ${s}: dødboldsmål (${gp.kind}) har fået et billede`); setGoals++; }
        else { assert.ok(has.has(i), `seed ${s}: ${gp.kind}-mål uden billede: ${e.text}`); openGoals++; }
      }
    });
  }
  assert.ok(setSaves >= 25 && openGoals > 80 && setGoals >= 10, `data: dødbolde ${setSaves}, mål i åbent spil ${openGoals}, dødboldsmål ${setGoals}`);
});

// Øjebliksbilledet (📍) er bygget uafhængigt af sporet – det samme mål skal give det samme billede i fælles koordinater.
// Dit hold både som hjemme og ude (spejlingen), og med VAR tvunget på hvert mål, så skytten flyttes bag den tjekkede (VAR_BEHIND).
test('sporets øjeblik for et mål = øjebliksbilledet (📍): spillere, bold og VAR-justeringen af skytten – hjemme og ude, mål for og imod', () => {
  const near = (a, b) => Math.abs(a - b) <= 0.51;
  const n = { for: 0, against: 0, away: 0, shifted: 0, caught: 0 };
  for (const force of [false, true]) for (const awayGame of [false, true]) for (let s = 1; s <= 45; s++) {
    const L = createLeague(createRng(s)), me = L.teams[0], opp = L.teams[1];
    const rng = force ? forceVar(createRng(s * 11)) : createRng(s * 11), m = awayGame ? simulateMatch(opp, me, rng) : simulateMatch(me, opp, rng);
    const mine = awayGame ? 'a' : 'h', conv = ([x, y]) => (mine === 'h' ? [x, y] : [100 - x, 100 - y]);
    m.events.forEach((e, i) => {
      if (!e.snapshot) return;
      const mo = m.trace.moments.find((x) => x.ev === i);
      assert.ok(mo, `seed ${s}: mål ${i} har et øjebliksbillede men intet øjeblik`);
      const sn = e.snapshot, tag = `seed ${s}${force ? ' VAR' : ''}${awayGame ? ' ude' : ''} ${e.min}'`;
      assert.equal(sn.attacking, mo.side === mine, tag);
      const pts = mo[mine];
      assert.equal(pts.length, sn.pts.length, tag);
      for (const [id, x, y] of sn.pts) {
        const q = pts.find((p) => p[0] === id), [cx, cy] = conv([x, y]);
        assert.ok(q && near(q[1], cx) && near(q[2], cy), `${tag}: ${id} er ${JSON.stringify(q)}, øjebliksbilledet ${[cx, cy]}`);
      }
      const [bx, by] = conv(sn.ball);
      assert.ok(near(mo.ball[0], bx) && near(mo.ball[1], by), `${tag}: bold ${mo.ball} mod ${[bx, by]}`);
      assert.equal(mo.scorer, sn.attacking ? sn.scorer : mo.scorer, tag);
      if (sn.attacking) { assert.equal(mo.assist ?? null, sn.assist, tag); n.for++; } else n.against++;
      if (awayGame) n.away++;
      if (/foran #\d+ .+? stod ikke offside/.test(e.text) && sn.attacking) n.shifted++;
      const gp = m.goalsPool.find((g) => g.min === e.min && e.text.includes(g.scorer));
      if (gp?.kind === 'COUNTER') n.caught++;
    });
  }
  assert.ok(n.for > 40 && n.against > 30 && n.away > 40 && n.shifted >= 3 && n.caught >= 5, JSON.stringify(n));
});

// ---------- VAR_BEHIND i sporet (bogstavelige tal) ----------
// Samme opstilling som var-pinned.test.mjs ("billedet ved et VAR-tjek af en holdkammerat"): angriberne (plads 9/10) står på y 14 i
// angrebsform, skytten (plads 5, FIN 20) trækkes til y 32 − 16 = 16 – to foran ham, så den forreste tjekkes, og skytten rykkes til
// 14 + VAR_BEHIND = 18 med bolden. Står han allerede længere tilbage (y 48 → 32), rykkes han ikke. Som hjemmehold og som udehold
// (spejlet: y 82 / 68, x 60).
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return { next: () => nextValue, int: (a) => a, pick: (arr) => arr[0],
    chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const f = script[p]; return typeof f === 'function' ? f(n) : !!f; } };
}
function arena() {
  const L = createLeague(createRng(1)), [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) {
      p.skills = SK(10); p.aerialPower = 10; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 };
      p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0; p.freshness = 100;
    }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0;
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
    Object.assign(t.tactics.phases.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL', offBallRuns: 'NORMAL' });
    Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: 'MID_BLOCK', offsideTrap: 'OFF', tacklingIntensity: 'NORMAL' });
    Object.assign(t.tactics.phases.phase3_transition, { onBallWon: 'KEEP_POSSESSION', onBallLost: 'DROP_BACK' });
  }
  return { H, A };
}
const slotOf = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
function behind(shooterY, awayShooter) {
  const a = arena(), X = awayShooter ? a.A : a.H, Y = awayShooter ? a.H : a.A;
  X.tactics.customCoords = { ...Object.fromEntries([1, 2, 3, 4, 6, 7, 8].map((j) => [j, { x: 50, y: 95 }])), 9: { x: 5, y: 20 }, 10: { x: 95, y: 20 }, 5: { x: 40, y: shooterY } };
  for (const p of Y.squad) p.skills.positioning = 20;   // løbene vindes ikke – almindelig afslutning
  for (const p of X.squad) p.skills.finishing = 1;
  slotOf(X, 5).skills.finishing = 20; slotOf(Y, 0).skills.goalkeeping = 1;
  for (let i = 1; i <= 10; i++) { slotOf(X, i).counterTactics.vsTrapLong = 40; slotOf(X, i).varProfile.varPulse = 30; }
  // Holdet med skytten har bolden (udeholdet skal have et stærkere midtfelt, ellers får hjemmeholdet den ved lige styrke)
  for (let i = 1; i <= 10; i++) for (const k of ['passing', 'ballControl']) slotOf(Y, i).skills[k] = 1;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (n) => n < 1, [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: false }, 0.5));
  const gi = m.events.findIndex((e) => e.type === 'GOAL');
  return { a, X, m, gi, mo: m.trace.moments.find((x) => x.ev === gi) };
}
test('VAR_BEHIND i sporet: skytten rykkes bag den tjekkede (y 16 → 18) og bolden med; allerede længere tilbage rykkes han ikke – som hjemmehold', () => {
  const near = behind(32, false), far = behind(48, false);
  for (const r of [near, far]) { assert.ok(r.gi > 0 && r.mo, 'data: målet har et øjeblik'); assert.equal(r.mo.side, 'h'); assert.equal(r.mo.scorer, slotOf(r.X, 5).id); assert.match(r.m.events[r.gi].text, /VAR: målet står – #\d+ .+ foran/); }
  const at = (r, i) => r.mo.h.find((q) => q[0] === slotOf(r.X, i).id).slice(1);
  assert.deepEqual([at(near, 5), at(near, 9), at(near, 10)], [[40, 18], [5, 14], [95, 14]]);
  assert.deepEqual(near.mo.ball, [40, 18]);
  assert.deepEqual(at(far, 5), [40, 32]);
  assert.deepEqual(far.mo.ball, [40, 32]);
  // …og øjebliksbilledet (📍) siger det samme
  assert.deepEqual(near.m.events[near.gi].snapshot.ball, [40, 18]);
});
test('VAR_BEHIND ved grænsen: står skytten allerede PRÆCIS 4 bag den tjekkede (y 18), rykkes han ikke og bolden bliver på målpletten (50, 20 / spejlet 50, 80)', () => {
  const home = behind(34, false), away = behind(34, true);
  assert.deepEqual(home.mo.h.find((q) => q[0] === slotOf(home.X, 5).id).slice(1), [40, 18]);
  assert.deepEqual(home.mo.ball, [50, 20], 'ikke flyttet → bolden på pletten, ikke ved skytten');
  assert.deepEqual(home.m.events[home.gi].snapshot.ball, [50, 20], '📍 gør det samme');
  assert.deepEqual(away.mo.a.find((q) => q[0] === slotOf(away.X, 5).id).slice(1), [60, 82]);
  assert.deepEqual(away.mo.ball, [50, 80]);
});
test('VAR_BEHIND i sporet: som udehold er billedet spejlet (x 60, y 82 i stedet for 18; 68 i stedet for 32)', () => {
  const near = behind(32, true), far = behind(48, true);
  for (const r of [near, far]) { assert.ok(r.gi > 0 && r.mo, 'data: målet har et øjeblik'); assert.equal(r.mo.side, 'a'); assert.equal(r.mo.scorer, slotOf(r.X, 5).id); assert.match(r.m.events[r.gi].text, /VAR: målet står – #\d+ .+ foran/); }
  const at = (r, i) => r.mo.a.find((q) => q[0] === slotOf(r.X, i).id).slice(1);
  assert.deepEqual([at(near, 5), at(near, 9), at(near, 10)], [[60, 82], [95, 86], [5, 86]]);
  assert.deepEqual(near.mo.ball, [60, 82]);
  assert.deepEqual(at(far, 5), [60, 68]);
  assert.deepEqual(far.mo.ball, [60, 68]);
});
