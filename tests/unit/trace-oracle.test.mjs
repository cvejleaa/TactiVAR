// v3.16 Test Manager: kampens spor mod et ORAKEL – ikke mod sporets egne regler. trace.test.mjs tjekker sporets form (31
// billeder, 7–11 spillere, scoreren i billedet) og ændrer man koordinatsystemet, spejlingen, hvilket billede et øjeblik
// tegnes med, hvem der er skytten eller hvilke hændelser der har et billede, består den stadig (~40 af 57 mutationer i
// optageren overlevede). Her er orakler, der ikke er optagerens egen kode:
//  - coupledPositions (positions.js, v3.16 koblede linjer) regnet i testen: grundbilleder og øjeblikke skal være holdenes
//    placering i forhold til modstanderen, spejlet for udeholdet (før v3.16: livePositions for hvert hold for sig);
//  - øjebliksbilledet (ev.snapshot, bygget af snapshot() og testet i snap-ui/var-front): sporets øjeblik for samme mål
//    skal være det samme billede for alle andre end skytten; skytten er 📍's klemt ind i feltet, bolden ved ham (v3.16);
//  - spec'ens tal (§5 "Koblede linjer") bogstaveligt: feltet y ≤ 12 / x 30–70, langskud y 30–38 / x 20–80, linjen ±1;
//  - referatet: skytten står i teksten og i sit holds billede, dødbolde har intet billede, kontra tegner det tabende hold i angrebsform.
// Orakel-vinduet: før det første røde kort/Hvis-Så-skift (formationen skifter) står spillerne i slot-rækkefølge efter
// holdets tactics – skift (SUB) og haltende spillere ændrer ikke pladsen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch, VAR_BEHIND, COUNTER_RUN } from '../../public/engine/match.js';
import { VAR_RULES } from '../../public/engine/match-rules.js';
import { livePositions, coupledPositions, kickoffPositions } from '../../public/engine/positions.js';

// Fælles koordinater: hjemmeholdet angriber mod y 0; udeholdet spejles (100 − x, 100 − y)
const cm = (side, [x, y]) => (side === 'h' ? [Math.round(x), Math.round(y)] : [Math.round(100 - x), Math.round(100 - y)]);
const same = (pts, exp, skip = []) => pts.length === exp.length && pts.every((q, i) => skip.includes(q[0]) || (q[1] === exp[i][0] && q[2] === exp[i][1]));
const otherSide = (s) => (s === 'h' ? 'a' : 'h');
const tagOf = (e) => `#${e.shirtNumber} ${e.shortName}`;
const stopOf = (m) => Math.min(91, ...m.events.filter((e) => e.type === 'RED' || e.type === 'TRIGGER').map((e) => e.min));
const forceVar = (r) => ({ ...r, chance: (p) => (p === VAR_RULES.GOAL_CHECK_P ? true : p === VAR_RULES.GOAL_FOUL_SHARE ? false : r.chance(p)) });
function league(s) { const L = createLeague(createRng(s)); return { L, home: L.teams[s % 8], away: L.teams[(s + 3) % 8] }; }
const bots = (n) => { const out = []; for (let s = 1; s <= n; s++) { const { home, away } = league(s); out.push({ s, home, away, m: simulateMatch(home, away, createRng(s * 31)) }); } return out; };
const DATA = bots(80);   // 80 seedede kampe mellem to botter (deles af testene herunder – kun læsning)

// Grundbillederne (v3.16.1 – tickFrame, tegnet EFTER duellen; spec §5 "Koblede linjer"): afspark = begge hold i forsvarsform
// presset sammen ind i egen halvdel (kickoffPositions – positions.js' tal er bogstaveligt bevist i coupled-gaps), bolden på midten.
// Ellers holdenes placering i forhold til modstanderen – coupledPositions(boldholdet, modstanderen, bolden som sidebelastning) – og
// bolden HOS en spiller, efter duellens udfald (flaget på billedet):
//  - intet flag (ingen duel / opbygningen uden løb): ballX = opspillerens levende x (en markspiller hos holdet med bolden), bolden hos ham;
//  - run (opbygningen vandt): som ovenfor, men angriberen (runner) er sluppet RUN_STEP frem, bolden hos ham;
//  - lost (presset vandt): forsvaret har bolden i caught-formen (ballX spejlet), bolden hos presseren (en af dets markspillere);
//  - offside (fælden): som run, men angriberen tegnes lige foran linjen (line − 3) – han springes over her (skubbet på tværs).
// Oraklet prøver alle pladser som opspiller/løber/presser og kræver, at præcis billedet og bolden passer. (Før v3.16.1: bolden på
// midterlinjen (y 50) ved holdets seneste chance – angriberne og bolden stod stille mellem chancerne.)
const kickoff = (team, side) => kickoffPositions(team.tactics).map((p) => cm(side, [p.x, p.y]));
const coupled = (T, att, ctx) => { const r = coupledPositions(T[att].tactics, T[otherSide(att)].tactics, ctx); return { line: r.line, [att]: r.ball.map((p) => cm(att, [p.x, p.y])), [otherSide(att)]: r.opp.map((p) => cm(otherSide(att), [p.x, p.y])) }; };
const xOf = (team, i) => livePositions(team.tactics, { attacking: true, ballX: 50 })[i].x;
function frameKind(T, f) {
  const att = f.poss, def = otherSide(att), fits = (exp, own, i, skip = []) => same(f[att], exp[att], skip) && same(f[def], exp[def], skip) && f.ball[0] === exp[own][i][0] && f.ball[1] === exp[own][i][1];
  for (let pm = 1; pm < 11; pm++) {
    const bx = xOf(T[att], pm);
    if (!f.run && !f.lost && !f.offside && fits(coupled(T, att, { ballX: bx }), att, pm)) return 'none';
    for (let r = 1; r < 11; r++) {
      if (f.run && fits(coupled(T, att, { ballX: bx, runner: r }), att, r)) return 'run';
      if (f.offside) {
        const exp = coupled(T, att, { ballX: bx, runner: r }), id = f[att][r]?.[0];
        // den fangede står lige foran linjen (y i egne koordinater line − 3) – x skubbet væk fra forsvareren, så kun y tjekkes
        const ownY = att === 'h' ? f.ball[1] : 100 - f.ball[1];
        if (same(f[att], exp[att], [id]) && same(f[def], exp[def]) && f[att][r][1] === f.ball[0] && f[att][r][2] === f.ball[1] && ownY === exp.line - 3) return 'offside';
      }
    }
    if (f.lost) for (let pr = 1; pr < 11; pr++) if (fits(coupled(T, def, { ballX: 100 - bx, caught: true }), def, pr)) return 'lost';
  }
  return null;
}
test('grundbillederne er holdenes form efter duellen: afspark begge sammenpresset i egen halvdel; ellers koblede linjer med bolden hos opspilleren, løberen, presseren eller den offside-fangede', () => {
  let ok = 0, kick = 0; const poss = { h: 0, a: 0 }, kinds = { none: 0, run: 0, lost: 0, offside: 0 };
  for (const { s, home, away, m } of DATA) {
    const T = { h: home, a: away }, stop = stopOf(m);
    for (const f of m.trace.frames.filter((x) => x.t * 3 < stop)) {
      if (!f.poss) {
        assert.deepEqual(f.ball, [50, 50], `seed ${s} afspark: bolden på midten`);
        assert.ok(same(f.h, kickoff(home, 'h')) && same(f.a, kickoff(away, 'a')), `seed ${s} afspark`);
        assert.ok(f.h.slice(1).every((q) => q[2] >= 53) && f.a.slice(1).every((q) => q[2] <= 47), `seed ${s} afspark: egen halvdel (KICKOFF_Y 53)`);
        ok++; kick++; continue;
      }
      const k = frameKind(T, f);
      assert.ok(k, `seed ${s} t ${f.t}: ${f.poss} har bolden (${JSON.stringify({ run: f.run, lost: f.lost, offside: f.offside, ball: f.ball })}) – ikke holdenes form`);
      ok++; poss[f.poss]++; kinds[k]++;
    }
  }
  assert.ok(ok > 1500 && kick >= 80 && poss.h > 400 && poss.a > 400 && kinds.none > 500 && kinds.run > 100 && kinds.lost > 100 && kinds.offside > 5,
    `data: ${ok} billeder, afspark ${kick}, bolden ${JSON.stringify(poss)}, ${JSON.stringify(kinds)}`);
});

// Øjeblikket (v3.16): positionerne er AFLEVERINGENS øjeblik – coupledPositions for holdet med afslutningen (bolden på
// sidebelastningen x, eventuelt med en løber RUN_STEP fremme) og modstanderen (.opp) – eller, hvis afslutningen er en kontra
// (bolden blev tabt i angrebet), caught: kontraholdet i forsvarsform (skytten COUNTER_RUN fremme), det tabende hold i
// angrebsform. Springes over: i afslutningens billede skytten (rykket ind i feltet) og oplægsgiveren (moves); i et offside-
// billede den tjekkede (står på linjen – testet herunder). Skytten i et offside-billede er IKKE rykket og springes ikke over.
const ownOf = (side, [x, y]) => (side === 'h' ? [x, y] : [100 - x, 100 - y]);
const PASS = new Set(['VAR_CHECK', 'VAR_NO_GOAL', 'OFFSIDE_FLAG']);
// Den tjekkede i et offside-billede ud fra referatet (positivt genkendt: navnet i teksten) – null ved et frispark-tjek.
function checkedOf(m, mo) {
  const e = m.events[mo.ev], ids = new Map(m.ratings[mo.side === 'h' ? 'home' : 'away'].map((r) => [tagOf(r), r.playerId]));
  const id = (re, str) => { const t = str.match(re); assert.ok(t && ids.has(t[1]), `tjekket spiller ikke fundet i "${str}"`); return ids.get(t[1]); };
  if (mo.kind === 'OFFSIDE_FLAG') return { id: /han stod offside/.test(e.text) ? mo.shooter : id(/– (#\d+ .+?) \(.+?\) stod offside/, e.text), offside: true };
  if (mo.kind === 'VAR_CHECK') return e.var.kind === 'OFFSIDE' ? { id: id(/stod (#\d+ .+?) offside\?/, e.text), offside: e.var.verdict === 'OVERTURNED' } : null;
  return /skubbede/.test(e.text) ? null : { id: id(/annulleret – (#\d+ .+)$/, e.label), offside: true };
}
function variantOf(T, m, mo) {
  const att = mo.side, def = otherSide(att);
  const skip = PASS.has(mo.kind) ? [checkedOf(m, mo)?.id] : [mo.shooter, mo.assist];
  const fits = (exp) => same(mo[att], exp[att], skip) && same(mo[def], exp[def], skip);
  for (let x = 0; x <= 100; x++) if (fits(coupled(T, att, { ballX: x }))) return 'open';
  for (let r = 1; r < 11; r++) for (let x = 0; x <= 100; x++) if (fits(coupled(T, att, { ballX: x, runner: r }))) return 'open';
  if (fits(coupled(T, att, { caught: true, ballX: 50 }))) return 'caught';
  for (let r = 1; r < 11; r++) if (fits(coupled(T, att, { caught: true, ballX: 50, runner: r, step: COUNTER_RUN }))) return 'caught';
  return null;
}
test('afslutningens øjeblik: holdenes form fra den rigtige side – en kontra tegner det tabende hold i angrebsform (og kun en kontra)', () => {
  const n = { open: 0, caught: 0, sure: 0, counterSure: 0 };
  for (const { s, home, away, m } of DATA) {
    const T = { h: home, a: away }, stop = stopOf(m);
    for (const mo of m.trace.moments.filter((x) => x.t * 3 < stop)) {
      const v = variantOf(T, m, mo), e = m.events[mo.ev];
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

// Bolden ved skytten (v3.16, Spilfører: bolden stod på en fast plet, mens skytten stod ved hjørneflaget). Skytten i
// afslutningens billede (mål, redning, forbi): i feltet (egne koordinater y ≤ 12, x 30–70 – SHOT_BOX_Y), et langskud fra
// skudafstand (y 30–38, x 20–80, mærket long), en skytte bag en VAR-tjekket holdkammerat mindst VAR_BEHIND bag ham (ikke
// klemt). I et offside-billede (VAR-tjek, annulleret, flag) står den tjekkede på linjen = modstanderens sidste markspiller:
// 1 foran ved offside, 1 bag (ONSIDE_GAP) når målet står. Tallene er spec'ens (§5 "Koblede linjer") – bogstaveligt her.
test('afslutningens billede: bolden ved skytten, skytten i feltet (y ≤ 12, x 30–70) eller langskud (y 30–38, x 20–80) – spejlet for udeholdet; offside-billedet: den tjekkede på linjen ±1 efter kendelsen', () => {
  const n = { box: 0, long: 0, behind: 0, onside: 0, offside: 0, pass: 0, away: 0, spot: 0 };
  for (const { s, m } of DATA) for (const mo of m.trace.moments) {
    const e = m.events[mo.ev], tag = `seed ${s}: ${mo.kind} ${e.min}' (${mo.side})`, sh = mo[mo.side].find((q) => q[0] === mo.shooter);
    if (!sh) { assert.deepEqual(mo.ball, mo.side === 'h' ? [50, 20] : [50, 80], `${tag}: uden skytte på banen → målpletten`); n.spot++; continue; }
    assert.deepEqual(mo.ball, [sh[1], sh[2]], `${tag}: bolden ved skytten`);
    const [x, y] = ownOf(mo.side, [sh[1], sh[2]]);
    if (mo.side === 'a') n.away++;
    if (PASS.has(mo.kind)) {
      assert.equal(mo.long, undefined, tag); n.pass++;
      const c = checkedOf(m, mo);
      if (!c) continue;
      const def = mo[otherSide(mo.side)].slice(1).map((q) => ownOf(mo.side, [q[1], q[2]])[1]), line = Math.min(...def);
      const cq = mo[mo.side].find((q) => q[0] === c.id), cy = ownOf(mo.side, [cq[1], cq[2]])[1];
      assert.equal(cy, c.offside ? line - 1 : line + 1, `${tag}: den tjekkede ${c.offside ? 'offside' : 'onside'} – linjen ${line}`);
      n[c.offside ? 'offside' : 'onside']++;
      continue;
    }
    const gp = m.goalsPool.find((g) => g.min === e.min && e.text.includes(g.scorer));
    if (gp) assert.equal(!!mo.long, gp.kind === 'LONGSHOT', `${tag}: long ⇔ langskudsmål (${gp.kind})`);
    const fr = mo.scorer && e.text.match(/VAR: målet står – (#\d+ .+?) foran #\d+ .+? stod ikke offside/);
    if (fr) {
      const id = m.ratings[mo.side === 'h' ? 'home' : 'away'].find((r) => tagOf(r) === fr[1]).playerId, cq = mo[mo.side].find((q) => q[0] === id);
      assert.ok(y >= ownOf(mo.side, [cq[1], cq[2]])[1] + VAR_BEHIND, `${tag}: skytten (y ${y}) mindst ${VAR_BEHIND} bag den tjekkede`);
      n.behind++;
    } else if (mo.long) { assert.ok(x >= 20 && x <= 80 && y >= 30 && y <= 38, `${tag}: langskud fra (${x}, ${y})`); n.long++; }
    else { assert.ok(x >= 30 && x <= 70 && y <= 12, `${tag}: skytten i feltet, står (${x}, ${y})`); n.box++; }
  }
  assert.ok(n.box > 250 && n.long > 15 && n.behind >= 1 && n.offside >= 10 && n.onside >= 5 && n.pass > 20 && n.away > 150 && n.spot < 5, `data: ${JSON.stringify(n)}`);
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

// Øjebliksbilledet (📍) er bygget uafhængigt af sporet og er uændret i v3.16 (afleveringens øjeblik, bolden på pletten). Sporet
// tegner derimod AFSLUTNINGENS øjeblik (QC: to øjeblikke): for alle andre end skytten er det samme billede i fælles koordinater;
// skytten er 📍's skytte klemt ind i feltet (x 30–70, y ≤ 12) eller til skudafstand (langskud: x 20–80, y 30–38) – og står han bag
// en VAR-tjekket holdkammerat, er han 📍's skytte (begge rykker ham VAR_BEHIND bag den tjekkede, ingen klemmer). Bolden i sporet
// står ved skytten. Dit hold både som hjemme og ude (spejlingen), og med VAR tvunget på hvert mål.
const clampShot = ([x, y], long) => (long ? [Math.min(80, Math.max(20, x)), Math.min(38, Math.max(30, y))] : [Math.min(70, Math.max(30, x)), Math.min(y, 12)]);
test('sporets øjeblik for et mål = øjebliksbilledet (📍) for alle andre end skytten; skytten = 📍-skytten i feltet/på skudafstand (eller VAR-rykket som i 📍), bolden ved ham – hjemme og ude, mål for og imod', () => {
  const near = (a, b) => Math.abs(a - b) <= 0.51;
  const n = { for: 0, against: 0, away: 0, shifted: 0, caught: 0, moved: 0, long: 0 };
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
      const behind = sn.attacking && /foran #\d+ .+? stod ikke offside/.test(e.text);
      for (const [id, x, y] of sn.pts) {
        const q = pts.find((p) => p[0] === id);
        let [cx, cy] = conv([x, y]);
        if (sn.attacking && id === sn.scorer && !behind) {
          [cx, cy] = conv(clampShot([x, y], mo.long));
          if (!near(cx, conv([x, y])[0]) || !near(cy, conv([x, y])[1])) n.moved++;
        }
        assert.ok(q && near(q[1], cx) && near(q[2], cy), `${tag}: ${id}${id === sn.scorer ? ' (skytten)' : ''} er ${JSON.stringify(q)}, forventet ${[cx, cy]}`);
      }
      // Bolden ved skytten (i 📍 på pletten – undtagen solo-mål og VAR-rykket)
      const sh = mo[mo.side].find((q) => q[0] === mo.scorer);
      assert.ok(sh, tag);
      assert.deepEqual(mo.ball, [sh[1], sh[2]], `${tag}: bolden ved skytten`);
      assert.equal(mo.scorer, sn.attacking ? sn.scorer : mo.scorer, tag);
      if (sn.attacking) { assert.equal(mo.assist ?? null, sn.assist, tag); n.for++; } else n.against++;
      if (mo.long) n.long++;
      if (awayGame) n.away++;
      if (behind) n.shifted++;
      const gp = m.goalsPool.find((g) => g.min === e.min && e.text.includes(g.scorer));
      if (gp?.kind === 'COUNTER') n.caught++;
    });
  }
  assert.ok(n.for > 40 && n.against > 30 && n.away > 40 && n.shifted >= 3 && n.caught >= 5 && n.moved > 20 && n.long >= 3, JSON.stringify(n));
});

// ---------- VAR_BEHIND i sporet (bogstavelige tal) ----------
// Samme opstilling som var-pinned.test.mjs ("billedet ved et VAR-tjek af en holdkammerat"), med koblede linjer (v3.16):
// modstanderens sidste markspiller står på y 27 (i angribernes koordinater), så angriberne (plads 9/10, rå 14) står på linjen 27 + 1 = 28.
// v3.16.1 (sammenpresning): skytten (plads 5, FIN 20, x 46 – 8 fra stopperen på 38, så han ikke skubbes på tværs) står rå på C − 16 og
// mappes fra [14, 40] til [28, 40]: koblet = 28 + (C − 30)·12/26. To står foran ham, så den forreste tjekkes, og skytten rykkes til
// 28 + VAR_BEHIND = 32 med bolden – ikke ind i feltet (uden VAR_BEHIND: y 12). Står han allerede længere tilbage (C 52 → rå 36 → 38,2 → 38,
// et langskud), rykkes han ikke. Som hjemmehold og som udehold (spejlet: y 68 / 62, x 54).
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
// cx/cy: skyttens plads (customCoords); varOn: VAR tjekker målet (offside → en holdkammerat foran); saved: keeperen redder.
function shotAt(cx, cy, awayShooter, { varOn = true, saved = false } = {}) {
  const a = arena(), X = awayShooter ? a.A : a.H, Y = awayShooter ? a.H : a.A;
  X.tactics.customCoords = { ...Object.fromEntries([1, 2, 3, 4, 6, 7, 8].map((j) => [j, { x: 50, y: 95 }])), 9: { x: 5, y: 20 }, 10: { x: 95, y: 20 }, 5: { x: cx, y: cy } };
  for (const p of Y.squad) p.skills.positioning = 20;   // løbene vindes ikke – almindelig afslutning
  for (const p of X.squad) p.skills.finishing = 1;
  slotOf(X, 5).skills.finishing = 20; slotOf(Y, 0).skills.goalkeeping = saved ? 20 : 1;
  for (let i = 1; i <= 10; i++) { slotOf(X, i).counterTactics.vsTrapLong = 40; slotOf(X, i).varProfile.varPulse = 30; }
  // Holdet med skytten har bolden (udeholdet skal have et stærkere midtfelt, ellers får hjemmeholdet den ved lige styrke)
  for (let i = 1; i <= 10; i++) for (const k of ['passing', 'ballControl']) slotOf(Y, i).skills[k] = 1;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (n) => n < 1, [VAR_RULES.GOAL_CHECK_P]: varOn, [VAR_RULES.GOAL_FOUL_SHARE]: false }, 0.5));
  const gi = m.events.findIndex((e) => e.type === 'GOAL'), id = slotOf(X, 5).id;
  return { a, X, m, gi, mo: m.trace.moments.find((x) => x.ev === gi), first: m.trace.moments.find((x) => x.shooter === id), id };
}
const behind = (shooterY, awayShooter) => shotAt(46, shooterY, awayShooter);
test('VAR_BEHIND i sporet: skytten rykkes bag den tjekkede (koblet y 29 → 32) og bolden med – ikke ind i feltet; allerede længere tilbage (38) rykkes han ikke – som hjemmehold', () => {
  const near = behind(32, false), far = behind(52, false);
  for (const r of [near, far]) { assert.ok(r.gi > 0 && r.mo, 'data: målet har et øjeblik'); assert.equal(r.mo.side, 'h'); assert.equal(r.mo.scorer, slotOf(r.X, 5).id); assert.match(r.m.events[r.gi].text, /VAR: målet står – #\d+ .+ foran/); }
  const at = (r, i) => r.mo.h.find((q) => q[0] === slotOf(r.X, i).id).slice(1);
  // near: C 32 → rå 16 → 28 + 2·12/26 = 28,9 → 29 < 32 → rykket til 32
  assert.deepEqual([at(near, 5), at(near, 9), at(near, 10)], [[46, 32], [5, 28], [95, 28]]);
  assert.deepEqual(near.mo.ball, [46, 32]);
  assert.equal(near.mo.long, undefined, 'ikke et langskud (koblet y 29 < 30)');
  assert.deepEqual(at(far, 5), [46, 38]);
  assert.deepEqual(far.mo.ball, [46, 38]);
  assert.equal(far.mo.long, true, 'koblet y 38 ≥ LONGSHOT_Y 30');
  // …og øjebliksbilledet (📍) siger det samme
  assert.deepEqual(near.m.events[near.gi].snapshot.ball, [46, 32]);
  assert.deepEqual(near.m.events[near.gi].snapshot.pts.find((q) => q[0] === slotOf(near.X, 5).id).slice(1), [46, 32]);
});
// Grænsen: C 36 / 38 / 41 → rå 20 / 22 / 25 → koblet 30,8 → 31 / 31,7 → 32 / 33,1 → 33 (med C 47–49 som før v3.16.1 stod alle tre på 36–37).
test('VAR_BEHIND ved grænsen: koblet y 31 rykkes til 32 (= 28 + 4), PRÆCIS 32 bliver, 33 bliver – hjemme og spejlet ude (68, 68, 67)', () => {
  const y = (r, side) => r.mo[side].find((q) => q[0] === slotOf(r.X, 5).id).slice(1);
  assert.deepEqual([36, 38, 41].map((c) => y(behind(c, false), 'h')), [[46, 32], [46, 32], [46, 33]]);
  assert.deepEqual([36, 38, 41].map((c) => behind(c, false).mo.ball), [[46, 32], [46, 32], [46, 33]]);
  assert.deepEqual([36, 38, 41].map((c) => y(behind(c, true), 'a')), [[54, 68], [54, 68], [54, 67]]);
  assert.deepEqual([36, 38, 41].map((c) => behind(c, true).mo.ball), [[54, 68], [54, 68], [54, 67]]);
});
test('VAR_BEHIND i sporet: som udehold er billedet spejlet (x 54, y 68 i stedet for 32; 62 i stedet for 38; angriberne 72)', () => {
  const near = behind(32, true), far = behind(52, true);
  for (const r of [near, far]) { assert.ok(r.gi > 0 && r.mo, 'data: målet har et øjeblik'); assert.equal(r.mo.side, 'a'); assert.equal(r.mo.scorer, slotOf(r.X, 5).id); assert.match(r.m.events[r.gi].text, /VAR: målet står – #\d+ .+ foran/); }
  const at = (r, i) => r.mo.a.find((q) => q[0] === slotOf(r.X, i).id).slice(1);
  assert.deepEqual([at(near, 5), at(near, 9), at(near, 10)], [[54, 68], [95, 72], [5, 72]]);
  assert.deepEqual(near.mo.ball, [54, 68]);
  assert.deepEqual(at(far, 5), [54, 62]);
  assert.deepEqual(far.mo.ball, [54, 62]);
});

// ---------- Skytten i afslutningens billede (bogstavelige tal, uden VAR) ----------
// Samme opstilling uden VAR-tjek. Skyttens plads i afleveringens øjeblik (rå y = kunde-y − 16, presset sammen fra [14, 40] til [28, 40])
// flyttes i afslutningens billede: en almindelig afslutning ind i feltet (y ≤ 12, x 30–70), et langskud (koblet y ≥ 30) til skudafstand
// (y 30–38, x 20–80) – også ved en REDNING (QC v3.16: kun målet var klemt). Kunde-y 52 → rå 36 → 38,2 → 38; 60 → rå 44 (bag 40, urørt)
// → loftet 38; 32 → rå 16 → 29. 📍 er afleveringens øjeblik og er uændret: ved den almindelige afslutning står skytten dér (44, 29 – x
// skubbet 6 fra stopperen på (38, 27)) og bolden på målpletten (50, 20) – sporet: (44, 12) med bolden.
test('skytten i afslutningens billede: kantløberen ved hjørneflaget skyder langskud fra x 20/80, langt tilbage fra y 38, i feltet fra (30–70, 12) – mål og redning, hjemme og spejlet ude', () => {
  const cases = [   // [kunde-x, kunde-y] → [hjemme, ude (spejlet)], long
    [[5, 52], [[20, 38], [80, 62]], true], [[95, 52], [[80, 38], [20, 62]], true], [[40, 60], [[40, 38], [60, 62]], true],
    [[40, 32], [[44, 12], [56, 88]], false], [[5, 32], [[30, 12], [70, 88]], false], [[95, 32], [[70, 12], [30, 88]], false],
  ];
  for (const [[cx, cy], exp, long] of cases) for (const away of [false, true]) for (const saved of [false, true]) {
    const r = shotAt(cx, cy, away, { varOn: false, saved }), mo = r.first, tag = `(${cx}, ${cy})${away ? ' ude' : ''}${saved ? ' redning' : ' mål'}`;
    assert.ok(mo, `data: ${tag} har et øjeblik`);
    assert.equal(mo.kind, saved ? 'SAVE' : 'GOAL', tag);
    assert.equal(mo.side, away ? 'a' : 'h', tag);
    assert.deepEqual(mo[mo.side].find((q) => q[0] === r.id).slice(1), exp[away ? 1 : 0], tag);
    assert.deepEqual(mo.ball, exp[away ? 1 : 0], `${tag}: bolden ved skytten`);
    assert.equal(mo.long, long || undefined, tag);
  }
  // 📍 for dit mål (hjemme): den almindelige afslutning i afleveringens øjeblik, langskuddet ved skytten (solo-mål)
  const plain = shotAt(40, 32, false, { varOn: false }).m, ls = shotAt(5, 52, false, { varOn: false }).m;
  const sn = (m) => { const e = m.events.find((x) => x.type === 'GOAL'); return [e.snapshot.ball, e.snapshot.pts.find((q) => q[0] === e.snapshot.scorer).slice(1)]; };
  assert.deepEqual(sn(plain), [[50, 20], [44, 29]]);
  assert.deepEqual(sn(ls), [[20, 38], [20, 38]]);
});
