// Test Manager v3.22.0 – Kampens tal: mutationer, som acts-v3220.test.mjs lod overleve (kun GOLDEN_TRACES_20 fangede dem).
// Svaghed i forfatterens test: den tæller kun SAMLET (n > 960, erobringer > 300, kombinationer > 300) og tjekker kun, at posten
// er på det rigtige HOLD – så en hel art (trap, tackle, flank, cb) kunne fjernes, 'long' blive til 'cross', corner/fk byttes og
// comboOk's 2-kode ændres med grøn suite. Her bindes hver post til en ANDEN kilde end loggen selv: referatets egne linjer
// (hændelsernes tekst og minut) og sporets øjeblikke (skytte, scorer, oplæg). Forventningen er skrevet med egne tekster.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { actsOf, COMBO_LABEL } from '../../public/engine/heatmap.js';
import { isValidTrace } from '../../public/engine/sanitize.js';

// dit hold (ikke-bot) mod en bot, hjemme/ude skiftevis – så "Dit indlæg"/"Din lange bold"-teksterne findes for én side
const N = 320;
const M = Array.from({ length: N }, (_, i) => { const s = i + 1, L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
  const m = s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131)); m.mine = s % 2 ? 'h' : 'a'; return m; });
const tagOf = (m) => { const t = new Map(); for (const e of [...m.ratings.home, ...m.ratings.away]) t.set(e.playerId, `#${e.shirtNumber} ${e.shortName}`); return (id) => t.get(id); };
const AERIAL = ['cross', 'long', 'corner', 'fk'];
const count = (pred) => M.reduce((n, m) => n + m.trace.acts.filter((a) => pred(a, m)).length, 0);

test('data: hver art findes i mængden (ellers er en fjernet art usynlig)', () => {
  const need = { press: 400, trap: 200, tackle: 6, flank: 6, cb: 40, run: 60, cross: 100, long: 10, corner: 300, fk: 70 };
  for (const [kind, min] of Object.entries(need)) assert.ok(count((a) => a[1] === kind) >= min, `${kind}: ${count((a) => a[1] === kind)} < ${min}`);
});

test('antal pr. art = antal linjer i referatet: pres, offside-fælde, tackling og lukket kant (en fjernet eller fordoblet post rammer)', () => {
  const pairs = [['press', 'Fase 2 pres virker'], ['trap', 'Offside-fælde virker'], ['tackle', 'Opsnappet'], ['flank', 'Kanten lukket']];
  for (const [kind, label] of pairs) {
    for (const m of M) assert.equal(m.trace.acts.filter((a) => a[1] === kind).length, m.events.filter((e) => e.label === label).length, `${kind} ↔ "${label}" (${m.homeName}–${m.awayName})`);
  }
});

test('hver erobring står på det rigtige minut med begge spillere nævnt i samme linje (og på det rigtige hold: hændelsens isHome = forsvarerens side)', () => {
  const lab = { press: 'Fase 2 pres virker', trap: 'Offside-fælde virker', tackle: 'Opsnappet', flank: 'Kanten lukket' };
  let n = 0;
  for (const m of M) { const T = tagOf(m);
    for (const [t, kind, s, a, b] of m.trace.acts.filter((x) => lab[x[1]])) {
      const ev = m.events.filter((e) => e.label === lab[kind] && e.min === t && e.isHome === (s === 'h') && e.text.includes(T(b)) && (kind === 'trap' ? true : e.text.includes(T(a))));
      assert.ok(ev.length >= 1, `${kind} ${t}' ${s}: ${T(a)} → ${T(b)} findes ikke i referatet`); n++;
    }
  }
  assert.ok(n > 1500, `data: ${n}`);
});

test('luftduel-kombinationer: udfaldet 0 = "Luftduel i feltet" (clearet), udfaldet 2 = et hovedstødsmål – antal og tekst pr. art (hjørne, frispark, indlæg/lang bold)', () => {
  let c0 = 0, g = { corner: 0, fk: 0, open: 0 };
  for (const m of M) { const T = tagOf(m), A = m.trace.acts.filter((x) => AERIAL.includes(x[1]));
    assert.equal(A.filter((x) => x[5] === 0).length, m.events.filter((e) => e.label === 'Luftduel i feltet').length, 'ok 0 ↔ Luftduel i feltet');
    assert.equal(A.filter((x) => x[5] === 2).length, m.events.filter((e) => e.type === 'HEADER_GOAL').length, 'ok 2 ↔ hovedstødsmål');
    for (const [t, kind, s, a, b, ok] of A) {
      if (ok === 0) { c0++;
        // flere linjer i samme minut kan ligne hinanden (indlæg → hjørne): artens EGEN tekst skal findes blandt kandidaterne
        const ev = m.events.filter((e) => e.label === 'Luftduel i feltet' && e.min === t && e.isHome !== (s === 'h') && e.text.includes(`foran ${T(b)}`));
        assert.ok(ev.length >= 1, `${kind} ${t}': clearet foran ${T(b)}`);
        const has = (txt) => ev.some((e) => e.text.includes(txt));
        if (kind === 'corner') assert.ok(has('Hjørnespark:'), 'corner: hjørnespark-teksten');
        if (kind === 'fk') assert.ok(has('Frisparksindlæg:'), 'fk: frisparksindlæg-teksten');
        if (s === m.mine && kind === 'cross') assert.ok(has('Dit indlæg:'), 'cross (dit hold): "Dit indlæg"');
        if (s === m.mine && kind === 'long') assert.ok(has('Din lange bold:'), 'long (dit hold): "Din lange bold"');
      }
      if (ok === 2) {
        const ev = m.events.filter((e) => e.type === 'HEADER_GOAL' && e.min === t && e.isHome === (s === 'h') && e.text.includes(T(b)) && e.text.includes(T(a)));
        assert.ok(ev.length >= 1, `${kind} ${t}': hovedstødsmålet nævner ${T(a)} og ${T(b)}`);
        const has = (txt) => ev.some((e) => e.text.includes(txt));
        if (kind === 'corner') { assert.ok(has('MÅÅÅL PÅ HJØRNESPARK'), 'corner'); g.corner++; }
        else if (kind === 'fk') { assert.ok(has('MÅÅÅL PÅ FRISPARK'), 'fk'); g.fk++; }
        else { assert.ok(has('efter oplæg fra'), 'cross/long: åbent spil'); g.open++; }
      }
    }
  }
  assert.ok(c0 > 300 && g.corner > 10 && g.fk > 2 && g.open > 15, `data: ${c0} clearet, mål ${JSON.stringify(g)}`);
});

test('cutback og løb: udfald 2 = målet med oplægget fra afleveringen; udfald 1 = afslutning uden mål fra den (comboOk-koderne for true og false)', () => {
  let goals = 0, shots = 0;
  for (const m of M) for (const [t, kind, s, a, b, ok] of m.trace.acts.filter((x) => x[1] === 'cb' || x[1] === 'run')) {
    assert.ok(ok === 1 || ok === 2, `${kind}: udfald ${ok}`);
    const mine = m.trace.moments.filter((x) => x.side === s && x.t === t / 3 && x.shooter === b);
    assert.ok(mine.length >= 1, `${kind} ${t}': skytten ${b}`);
    const goal = mine.find((x) => x.scorer === b && x.assist === a);
    if (ok === 2) { assert.ok(goal, `${kind} ${t}': mål med oplæg fra ${a}`); goals++; }
    else { assert.ok(!goal, `${kind} ${t}': udfald 1 er et mål`); shots++; }
  }
  assert.ok(goals > 30 && shots > 15, `data: ${goals} mål, ${shots} afslutninger`);
});

test('løbets aflevering kun når han spillede den: run-posten har altid to forskellige spillere og et lavt tilbage-/afleveringsmål (ikke solo)', () => {
  // en SHOT/DRIBBLE-løber er sin egen afslutter (a === b) – den post må ikke findes; kigger man på antallet: hver run-post skal have
  // en afslutning hos en ANDEN spiller end løberen (moment.shooter === b !== a)
  let n = 0;
  for (const m of M) for (const [t, kind, s, a, b] of m.trace.acts) if (kind === 'run') { n++; assert.notEqual(a, b); }
  assert.ok(n > 60, `data: ${n}`);
});

test('heatmap.actsOf: lukket kant tæller som erobring/tabt, og tab ligger hos modstanderens spiller – og kun hos ham', () => {
  const acts = [[5, 'flank', 'h', 'b1', 'w1', null], [6, 'tackle', 'h', 'b1', 'r1', null], [7, 'press', 'a', 'x1', 'b1', null], [8, 'flank', 'a', 'x2', 'b1', null], [9, 'trap', 'a', 'x3', 'b1', null]];
  assert.deepEqual(actsOf(acts, 'h', 'b1'), { won: 2, lost: 2, offside: 1, combos: [] });
  assert.deepEqual(actsOf(acts, 'a', 'w1'), { won: 0, lost: 1, offside: 0, combos: [] }, 'wingeren (udeholdet) tabte bolden til backen');
  assert.deepEqual(actsOf(acts, 'h', 'w1'), { won: 0, lost: 0, offside: 0, combos: [] }, 'hjemmesiden: w1 er ikke på banen – tabet er ikke hans');
  assert.deepEqual(actsOf(acts, 'a', 'x2'), { won: 1, lost: 0, offside: 0, combos: [] });
});

test('COMBO_LABEL: præcis disse seks arter og tekster (visningen læser dem)', () => {
  assert.deepEqual(COMBO_LABEL, { cb: 'cutback', run: 'løb og aflevering', cross: 'indlæg', long: 'lang bold', corner: 'hjørnespark', fk: 'frisparksindlæg' });
});

test('isValidTrace: grænserne ligger præcis (400 poster, minut 0–130, kendte arter, udfald null/0/1/2, 6 felter, heltalsminut)', () => {
  const base = structuredClone(M[0].trace); const ok = [1, 'press', 'h', 'a', 'b', null];
  const v = (acts) => isValidTrace({ ...base, acts });
  assert.ok(v([]), 'tom log'); assert.ok(v(Array(400).fill(ok)), '400 poster'); assert.equal(v(Array(401).fill(ok)), false, '401 poster');
  assert.ok(v([[0, 'press', 'h', 'a', 'b', null]]), 'minut 0'); assert.ok(v([[130, 'press', 'h', 'a', 'b', null]]), 'minut 130');
  assert.equal(v([[131, 'press', 'h', 'a', 'b', null]]), false, 'minut 131'); assert.equal(v([[-1, 'press', 'h', 'a', 'b', null]]), false);
  assert.equal(v([[1.5, 'press', 'h', 'a', 'b', null]]), false, 'minut skal være et heltal'); assert.equal(v([['1', 'press', 'h', 'a', 'b', null]]), false);
  // v3.22.0 (Security): tilladelsesliste over arterne i stedet for en længde – en kendt art er gyldig, en ukendt eller 'toString' ikke
  for (const k of ['press', 'trap', 'flank', 'tackle', 'cb', 'run', 'cross', 'long', 'corner', 'fk']) assert.ok(v([[1, k, 'h', 'a', 'b', null]]), k);
  for (const k of ['12345678', 'toString', 'pass']) assert.equal(v([[1, k, 'h', 'a', 'b', null]]), false, k);
  assert.equal(v([[1, 7, 'h', 'a', 'b', null]]), false, 'art skal være tekst'); assert.equal(v([[1, undefined, 'h', 'a', 'b', null]]), false);
  for (const o of [null, 0, 1, 2]) assert.ok(v([[1, 'cb', 'a', 'a', 'b', o]]), `udfald ${o}`);
  for (const o of [3, -1, '2', undefined, 0.5]) assert.equal(v([[1, 'cb', 'h', 'a', 'b', o]]), false, `udfald ${String(o)}`);
  assert.equal(v([[1, 'press', 'h', 'a', 'b', null, 'x']]), false, '7 felter'); assert.equal(v([[1, 'press', 'h', 'a', 'b']]), false, '5 felter');
  assert.equal(v([[1, 'press', 'x', 'a', 'b', null]]), false, 'side'); assert.equal(v([{ 0: 1, 1: 'press', 2: 'h', 3: 'a', 4: 'b', 5: null, length: 6 }]), false, 'et objekt med 6 felter er ingen liste (JSON kan give det)');
  assert.equal(v(null), false, 'acts: null'); assert.equal(v({}), false, 'acts: objekt');
});
