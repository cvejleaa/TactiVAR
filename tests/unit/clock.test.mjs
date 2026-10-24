// v3.16.4: rigtige minutter og tillægstid (public/engine/clock.js). Uret er et visningsfelt (e.clock = { m, plus }) og
// m.stoppage = [{ S, var }, { S, var }]; motoren regner stadig i tick à 3 minutter (e.min). Før uret (v3.16.3) stod hvert
// minut i referatet på e.min – altid deleligt med 3, ingen tillægstid, ingen pause på 45+S. Testene her er røde uden uret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.handlers = {}; this.hidden = false; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(k, f) { this.handlers[k] = f; }
  scrollIntoView() {}
  get id() { return this.attrs.id; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { FORMATIONS } = await import('../../public/engine/formations.js');
const { stoppageFor, assignClock, fmtMin, evMin, clockNum, tickClock, timelinePos, halfPos, inMinute, playerSpan, STOPPAGE_MAX } = await import('../../public/engine/clock.js');
const { renderMatchCenter, minutes } = await import('../../public/ui/matchcenter.js');
const { clearReplays } = await import('../../public/ui/replay.js');
const { buildColumn } = await import('../../public/engine/column.js');
const { parseSave } = await import('../../public/state/storage.js');
const { measureClock } = await import('../../tools/measure-clock.mjs');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id);
const cls = (e, c) => e.className.split(' ').includes(c);
const mcOf = (m, extra = {}) => ({ round: 1, matches: [m], gazette: { goalOfTheRound: null, totalGoals: 0, totalVarChecks: 0 }, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false, ...extra });
const on = { skip() {}, view() {}, snapshot() {}, openGoal() {}, filter() {}, heat() {}, replay() {} };
const render = (m, myTeamId, mc = {}) => { clearReplays(); return renderMatchCenter({ mc: mcOf(m, mc), myTeamId, on }); };
const isEnd = (e) => e.type === 'END' || e.type === 'FULLTIME';

// De samme 200 kampe som tools/measure-clock.mjs (seed s: hold s % 8 mod (s + 3) % 8, rng s · 31)
const N = 200;
const MATCHES = Array.from({ length: N }, (_, i) => {
  const s = i + 1, L = createLeague(createRng(s));
  return simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
});
const halves = (m) => {
  const ht = m.events.findIndex((e) => e.type === 'HALFTIME'), end = m.events.findIndex(isEnd);
  return { ht, end, first: m.events.slice(0, ht), second: m.events.slice(ht + 1, end) };
};

// ---------- 200 kampe ----------
test('data: 200 kampe, hver med pause og slutfløjt, ur på hver hændelse og stoppage for begge halvlege', () => {
  assert.equal(MATCHES.length, 200);
  for (const m of MATCHES) {
    const { ht, end } = halves(m);
    assert.ok(ht > 0 && end > ht, 'pause og slutfløjt');
    assert.ok(m.events.every((e) => e.clock && Number.isInteger(e.clock.m)), 'ur på hver hændelse');
    assert.equal(m.stoppage.length, 2);
  }
});

test('minutterne er ikke-faldende i hver halvleg (200 kampe) – også målt med tools/measure-clock.mjs', () => {
  let pairs = 0;
  for (const m of MATCHES) {
    const { first, second } = halves(m);
    for (const h of [first, second]) for (let i = 1; i < h.length; i++) { pairs++; assert.ok(clockNum(h[i].clock) >= clockNum(h[i - 1].clock), `${evMin(h[i - 1])} → ${evMin(h[i])}`); }
  }
  assert.ok(pairs > 5000, `data: ${pairs} par`);
  assert.equal(measureClock(N).falling, 0);
});

// 1000 kampe (seed 1–1000 som measure-clock): 43' er sjældent (0 i de første 200, 6 i 1000 – se rapporten), resten findes i 200.
test('alle minutter 1–90 forekommer (uden plus) over 1000 kampe; v3.16.3 havde kun 3, 6, …, 90 (+ 1 og 45)', () => {
  const seen = new Set();
  const more = Array.from({ length: 800 }, (_, i) => { const s = N + i + 1, L = createLeague(createRng(s)); return simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31)); });
  for (const m of [...MATCHES, ...more]) for (const e of m.events) if (!e.clock.plus && e.type !== 'HALFTIME' && !isEnd(e)) seen.add(e.clock.m);
  const missing = Array.from({ length: 90 }, (_, i) => i + 1).filter((x) => !seen.has(x));
  assert.deepEqual(missing, []);
  assert.ok([...seen].every((x) => x >= 1 && x <= 90), 'intet minut uden for 1–90');
});

test('andelen af minutter (uden plus) delelige med 3 er ≈ ⅓ – v3.16.3: 100 % (båndet 0,28–0,40 er rødt for den gamle værdi)', () => {
  let n = 0, d = 0;
  for (const m of MATCHES) for (const e of m.events) if (!e.clock.plus && e.type !== 'TACTIC_NOTE') { n++; if (e.clock.m % 3 === 0) d++; }
  assert.ok(d / n > 0.28 && d / n < 0.40, `${(d / n * 100).toFixed(1)} %`);
  const r = measureClock(N);
  assert.ok(r.div3 > 0.28 && r.div3 < 0.40, `measure-clock: ${r.div3}`);
});

test('"45+" kun i første halvleg og "90+" kun i anden; første halvleg 1–45, anden 46–90', () => {
  let plus1 = 0, plus2 = 0;
  for (const m of MATCHES) {
    const { first, second } = halves(m);
    for (const e of first) { assert.ok(e.clock.m >= 1 && e.clock.m <= 45, evMin(e)); if (e.clock.plus) { plus1++; assert.equal(e.clock.m, 45); } }
    for (const e of second) { assert.ok(e.clock.m >= 46 && e.clock.m <= 90, evMin(e)); if (e.clock.plus) { plus2++; assert.equal(e.clock.m, 90); } }
  }
  assert.ok(plus1 > 20 && plus2 > 20, `data: hændelser i tillægstid ${plus1} / ${plus2}`);
});

test('pausen står på 45+S1, slutfløjtet (og fuldtidsanalysen) på 90+S2 – S fra stoppageFor af halvlegens hændelser; ingen hændelse efter dem', () => {
  const seenS = new Set();
  for (const m of MATCHES) {
    const { ht, end, first, second } = halves(m), [S1, S2] = m.stoppage.map((x) => x.S);
    assert.deepEqual(m.stoppage, [stoppageFor(first), stoppageFor(second)]);
    assert.deepEqual(m.events[ht].clock, { m: 45, plus: S1 });
    for (const e of m.events.slice(end)) assert.deepEqual(e.clock, { m: 90, plus: S2 }, e.type);
    assert.ok(first.every((e) => clockNum(e.clock) <= 45 + S1), 'intet efter pausen i første halvleg');
    assert.ok(second.every((e) => clockNum(e.clock) <= 90 + S2), 'intet efter slutfløjtet');
    seenS.add(S1); seenS.add(S2);
  }
  assert.ok(seenS.size >= 5, `data: forskellige tillægstider ${[...seenS]}`);
});

// ---------- Hvis-Så ----------
// Reglens minut T falder ofte inde i et tick-vindue, der starter før T (fx T 5 → tick 6, vindue 4–6; T 89 → tick 90, vindue 88–90+S).
test('en Hvis-Så-regel (dit hold, minut 5, 14, 47, 59, 63, 66, 88, 89) står aldrig før sit minut på uret', () => {
  const Ts = [5, 14, 47, 59, 63, 66, 88, 89];
  let fired = 0, early = 0;
  for (let s = 1; s <= 80; s++) {
    const T = Ts[s % Ts.length], L = createLeague(createRng(s)), me = L.teams.find((t) => !t.isBot);
    const to = Object.keys(FORMATIONS).find((f) => f !== me.tactics.baseFormation);
    me.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: T, condition: 'ANY', margin: 1, newFormation: to, newPlan: null }];
    const m = simulateMatch(me, L.teams[(s % 7) + 1], createRng(s * 17));
    const rule = m.events.filter((e) => e.text?.includes(`[${me.name} • Hvis-Så]`));
    if (!rule.length) continue;
    fired++;
    // Skubbes reglens linje frem, skubbes de efterfølgende med (uret falder aldrig i en halvleg)
    const ht = m.events.findIndex((e) => e.type === 'HALFTIME');
    m.events.forEach((e, i) => { if (i > 0 && i !== ht + 1 && !isEnd(e)) assert.ok(clockNum(e.clock) >= clockNum(m.events[i - 1].clock), `seed ${s}: ${evMin(m.events[i - 1])} → ${evMin(e)}`); });
    for (const e of rule) {
      assert.ok(clockNum(e.clock) >= T, `seed ${s}: reglen i minut ${T} står på ${evMin(e)}`);
      if (Math.min(...rule.map((x) => x.min)) - 3 < T) early++;   // reglens tick-vindue begynder før T
    }
  }
  assert.ok(fired >= 60, `data: reglen udført i ${fired} kampe`);
  assert.ok(early > 0, 'data: mindst ét vindue begynder før reglens minut');
});

// ---------- stoppageFor ----------
const ev = (type, min = 30, o = {}) => ({ type, min, ...o });
test('stoppageFor: 1 + ½ pr. skifte-vindue (pause-skift tæller ikke) + ½ pr. mål + ¼ pr. kort + 1 pr. skade + 1 pr. VAR (+1 ved omstødt), op, loft 8, var ≤ S', () => {
  assert.deepEqual(stoppageFor([]), { S: 1, var: 0 }, 'tom halvleg: 1 minut');
  assert.deepEqual(stoppageFor([ev('INFO'), ev('SAVE'), ev('MISS')]), { S: 1, var: 0 }, 'andet tæller ikke');
  // Skifte-vinduer: tre skift i to vinduer = 2 · ½ → 2 (pr. skift: 1 + 1,5 → 3)
  assert.deepEqual(stoppageFor([ev('SUB', 60), ev('SUB', 60), ev('SUB', 72)]), { S: 2, var: 0 });
  assert.deepEqual(stoppageFor([ev('SUB', 60), ev('SUB', 66), ev('SUB', 72)]), { S: 3, var: 0 }, '3 vinduer: 1 + 1,5 → 3');
  assert.deepEqual(stoppageFor([ev('SUB', 45), ev('SUB', 45), ev('SUB', 45)]), { S: 1, var: 0 }, 'pause-skift (minut 45) tæller ikke');
  // Mål: ½ hver (GOAL og HEADER_GOAL)
  assert.deepEqual(stoppageFor([ev('GOAL')]), { S: 2, var: 0 });
  assert.deepEqual(stoppageFor([ev('GOAL'), ev('HEADER_GOAL'), ev('GOAL')]), { S: 3, var: 0 }, '1 + 1,5 → 3 (uden hovedstød: 2)');
  // Kort: ¼ hver – gult (FOUL med "Gult" i label), rødt og VAR-rødt; en forseelse uden kort tæller ikke
  assert.deepEqual(stoppageFor([ev('FOUL', 30, { label: 'Gult kort' })]), { S: 2, var: 0 }, '1,25 → 2');
  assert.deepEqual(stoppageFor([ev('FOUL', 30, { label: 'Frispark' }), ev('FOUL', 30)]), { S: 1, var: 0 }, 'forseelse uden kort');
  const fourCards = [ev('FOUL', 30, { label: 'Gult kort' }), ev('FOUL', 31, { label: 'Gult kort til X' }), ev('RED'), ev('VAR_RED')];
  assert.deepEqual(stoppageFor(fourCards), { S: 2, var: 0 }, '4 · ¼ = 1 → 2');
  assert.deepEqual(stoppageFor([...fourCards, ev('RED')]), { S: 3, var: 0 }, '5 · ¼ = 1,25 → 2,25 → 3');
  // Skade: 1
  assert.deepEqual(stoppageFor([ev('INJURY')]), { S: 2, var: 0 });
  assert.deepEqual(stoppageFor([ev('INJURY'), ev('INJURY')]), { S: 3, var: 0 });
  // VAR: 1 pr. tjek, +1 ved OVERTURNED/AWARDED/DOWNGRADED/UPGRADED; STANDS/CONFIRMED kun 1
  for (const verdict of ['STANDS', 'CONFIRMED']) assert.deepEqual(stoppageFor([ev('VAR_CHECK', 30, { var: { verdict } })]), { S: 2, var: 1 }, verdict);
  for (const verdict of ['OVERTURNED', 'AWARDED', 'DOWNGRADED', 'UPGRADED']) assert.deepEqual(stoppageFor([ev('VAR_NO_GOAL', 30, { var: { verdict } })]), { S: 3, var: 2 }, verdict);
  // Blandet: 1 + ½ (vindue) + ½ (mål) + ¼ (kort) + 1 (skade) + 2 (omstødt) = 5,25 → 6, heraf VAR 2
  assert.deepEqual(stoppageFor([ev('SUB', 60), ev('GOAL'), ev('FOUL', 30, { label: 'Gult kort' }), ev('INJURY'), ev('VAR_NO_GOAL', 70, { var: { verdict: 'OVERTURNED' } })]), { S: 6, var: 2 });
  // Loft 8 – og "heraf VAR" er højst totalen
  assert.equal(STOPPAGE_MAX, 8);
  assert.deepEqual(stoppageFor(Array.from({ length: 10 }, () => ev('INJURY'))), { S: 8, var: 0 }, 'loft: 11 → 8');
  assert.deepEqual(stoppageFor(Array.from({ length: 7 }, () => ev('INJURY'))), { S: 8, var: 0 }, 'præcis 8');
  assert.deepEqual(stoppageFor(Array.from({ length: 6 }, () => ev('INJURY'))), { S: 7, var: 0 }, 'under loftet');
  assert.deepEqual(stoppageFor(Array.from({ length: 5 }, () => ev('VAR_PEN', 30, { var: { verdict: 'AWARDED' } }))), { S: 8, var: 8 }, 'VAR 10 → højst S = 8');
});

// ---------- fmtMin / evMin / inMinute ----------
test('fmtMin, evMin (gamle hændelser uden ur: tick-minuttet) og inMinute', () => {
  assert.equal(fmtMin({ m: 7 }), "7'");
  assert.equal(fmtMin({ m: 45, plus: 3 }), "45+3'");
  assert.equal(fmtMin({ m: 90, plus: 0 }), "90'");
  assert.equal(fmtMin(null), '');
  assert.equal(evMin({ min: 42, clock: { m: 44 } }), "44'");
  assert.equal(evMin({ min: 42, clock: { m: 45, plus: 2 } }), "45+2'");
  assert.equal(evMin({ min: 42 }), "42'", 'gammel hændelse: tick-minuttet');
  assert.equal(evMin(undefined), "0'");
  assert.equal(inMinute({ m: 87 }), 'i 87. minut');
  assert.equal(inMinute({ m: 90, plus: 2 }), 'i tillægstiden');
});

// ---------- tickClock / timelinePos ----------
test('tickClock: grundbilledets minut = tick-vinduets start; uden stoppage t · 3', () => {
  const st = [{ S: 3, var: 0 }, { S: 2, var: 0 }];
  assert.deepEqual(tickClock(5, null), { m: 15 });
  assert.deepEqual(tickClock(0, st), { m: 0 });
  assert.deepEqual([1, 2, 3, 14].map((t) => tickClock(t, st).m), [1, 4, 7, 42]);
  assert.deepEqual([15, 16, 20, 30].map((t) => tickClock(t, st).m), [46, 48, 60, 88]);
  // Et grundbillede står aldrig efter sine hændelser: vinduets start ≤ hver hændelses ur i samme tick (200 kampe)
  let n = 0;
  for (const m of MATCHES) {
    const { ht } = halves(m);
    m.events.forEach((e, i) => {
      if (i === ht || isEnd(e) || e.min < 3) return;
      const t = e.min / 3;   // tick-hændelser står på 3, 6, …, 90 (t = billedets tick)
      if (!Number.isInteger(t)) return;
      n++; assert.ok(clockNum(tickClock(t, m.stoppage)) <= clockNum(e.clock), `${e.min} → ${evMin(e)} før ${fmtMin(tickClock(t, m.stoppage))}`);
    });
  }
  assert.ok(n > 5000, `data: ${n}`);
});

test('timelinePos: 45+3 står til venstre for 46\', halvlegsstregen mellem dem, 90+S2 yderst; uden ur e.min / 90', () => {
  const st = [{ S: 3, var: 0 }, { S: 4, var: 0 }];   // T = 97
  const p = (clock, min = 0) => timelinePos({ min, clock }, st);
  assert.equal(p({ m: 45, plus: 3 }), 48 / 97);
  assert.equal(p({ m: 46 }), 49 / 97);
  assert.ok(p({ m: 45, plus: 3 }) < halfPos(st) + 1e-12 && halfPos(st) < p({ m: 46 }), 'stregen mellem 45+3 og 46');
  assert.equal(halfPos(st), 48 / 97);
  assert.equal(p({ m: 90, plus: 4 }), 1);
  assert.equal(p({ m: 10 }), 10 / 97);
  assert.equal(timelinePos({ min: 45 }, st), 0.5, 'gammel hændelse uden ur');
  assert.equal(timelinePos({ min: 30, clock: { m: 31 } }, null), 30 / 90, 'gammel kamp uden stoppage');
  assert.equal(halfPos(null), 0.5);
});

// ---------- playerSpan / minutes ----------
test('playerSpan: ind/ud fra SUB-linjen, udvist/skadet fra linjen; to ens navne (#7 Jensen) på hvert hold skilles via e.min', () => {
  const home = [
    { playerId: 'h7', shirtNumber: 7, shortName: 'Jensen', minIn: 1, minOut: 60 },
    { playerId: 'h12', shirtNumber: 12, shortName: 'Holm', minIn: 60, minOut: 90 },
    { playerId: 'h9', shirtNumber: 9, shortName: 'Ras', minIn: 1, minOut: 33 },
    { playerId: 'h1', shirtNumber: 1, shortName: 'Bo', minIn: 1, minOut: 90 }];
  const away = [
    { playerId: 'a7', shirtNumber: 7, shortName: 'Jensen', minIn: 1, minOut: 72 },
    { playerId: 'a14', shirtNumber: 14, shortName: 'Berg', minIn: 72, minOut: 90 },
    { playerId: 'a3', shirtNumber: 3, shortName: 'Lund', minIn: 1, minOut: 18 }];
  const events = [
    { type: 'INJURY', min: 18, clock: { m: 17 }, text: '🚑 [Ude] #3 Lund bliver skadet efter en tackling fra #9 Ras (Hjem).' },
    { type: 'RED', min: 33, clock: { m: 31 }, text: '🟥 [Hjem] Direkte rødt kort til #9 Ras – han er udvist!' },
    { type: 'SUB', min: 60, clock: { m: 61 }, label: '🔄 #12 Holm ind for #7 Jensen', text: 'x' },
    { type: 'SUB', min: 72, clock: { m: 70 }, label: '🔄 #14 Berg ind for #7 Jensen', text: 'x' },
    { type: 'SUB', min: 80, label: '🔄 #1 Bo ind for #9 Ras', text: 'gammel linje uden ur' }];
  const h = playerSpan(events, home), a = playerSpan(events, away);
  assert.deepEqual(h.get('h7'), { out: { m: 61 } }, 'hjemme-Jensen ud i 60 (ikke udes 72)');
  assert.deepEqual(a.get('a7'), { out: { m: 70 } }, 'ude-Jensen ud i 72');
  assert.deepEqual(h.get('h12'), { in: { m: 61 } });
  assert.deepEqual(a.get('a14'), { in: { m: 70 } });
  assert.deepEqual(h.get('h9'), { out: { m: 31 } }, 'udvist: fra den røde linje (ikke skadelinjen, der nævner ham i minut 18)');
  assert.deepEqual(a.get('a3'), { out: { m: 17 } }, 'skadet: fra skadelinjen');
  assert.deepEqual(h.get('h1'), {}, 'hel kamp; linjen uden ur tæller ikke');
  // Karakterarkets kolonne efter uret – og tick-minutterne uden ur
  assert.equal(minutes(home[0], h.get('h7')), "0'–61'");
  assert.equal(minutes(home[1], h.get('h12')), "61'–90'");
  assert.equal(minutes(home[1]), "60'–90'", 'uden ur: tick-minuttet');
  assert.equal(minutes({ minIn: 42, minOut: 90 }, { in: { m: 45, plus: 2 } }), "45+2'–90'");
  assert.equal(minutes({ minIn: 1, minOut: 90 }, {}), "90'");
});

// ---------- Match Center: tillægstidslinjen ----------
const L4 = createLeague(createRng(4)), me4 = L4.teams.find((t) => !t.isBot);
const M4 = simulateMatch(me4, L4.teams[(4 % 7) + 1], createRng(4 * 13));
test('tillægstidslinjen i referatet: "⏱️ Tillægstid: S min (heraf X for VAR)." lige under halvlegens første hændelse i tillægstid (nyeste øverst)', () => {
  assert.deepEqual(M4.stoppage, [{ S: 8, var: 4 }, { S: 2, var: 0 }], 'data: VAR i første halvleg, ingen i anden');
  const el = render(M4, M4.homeId), feed = byId(el, 'feed')[0].children;
  const s0 = byId(el, 'stoppage-0'), s1 = byId(el, 'stoppage-1');
  assert.equal(s0.length, 1); assert.equal(s1.length, 1);
  assert.equal(s0[0].textContent, "45'⏱️ Tillægstid: 8 min (heraf 4 for VAR).");
  assert.equal(s1[0].textContent, "90'⏱️ Tillægstid: 2 min.", 'ingen "heraf" uden VAR');
  const { ht, end } = halves(M4);
  for (const [row, from, to] of [[s0[0], 0, ht], [s1[0], ht + 1, end]]) {
    const anchor = M4.events.slice(from, to + 1).find((e) => e.clock.plus);
    const i = feed.indexOf(row);
    assert.ok(i > 0, 'i referatet');
    assert.ok(feed[i - 1].textContent.startsWith(evMin(anchor)) && feed[i - 1].textContent.includes(anchor.text), `over linjen: ${evMin(anchor)}`);
    const below = feed[i + 1].textContent;
    assert.ok(!/^\d+\+/.test(below), `under linjen: ingen tillægstid (${below.slice(0, 20)})`);
  }
});

const game = (s) => { const L = createLeague(createRng(s)), me = L.teams.find((t) => !t.isBot); return simulateMatch(me, L.teams[(s % 7) + 1], createRng(s * 13)); };
// Første seed (≥ 1) med et hjemmemål i anden halvlegs tillægstid før slutfløjtet – data, ikke et fast seed (fordelingen i
// vinduet er en hash, så hvilket seed der rammer, kan ændre sig; testen kræver blot, at der findes et).
const stoppageGoal = () => {
  for (let s = 1; s < 400; s++) {
    const m = game(s), { end } = halves(m);
    const goal = m.events.find((e, i) => i < end && e.type === 'GOAL' && e.isHome && e.clock.m === 90 && e.clock.plus);
    const mo = goal && m.trace.moments.find((x) => x.ev === m.events.indexOf(goal) && x.side === 'h');
    if (mo) return { m, goal, mo, s };
  }
  return null;
};
const SG = stoppageGoal();
test('tillægstidslinjen: kom der en hændelse i tillægstiden (et mål i 90+x), står linjen under DEN – ikke under slutfløjtet', () => {
  assert.ok(SG, 'data: et hjemmemål i 90+x før slutfløjtet');
  const { m, goal } = SG;
  const el = render(m, m.homeId), feed = byId(el, 'feed')[0].children, row = byId(el, 'stoppage-1')[0];
  const i = feed.indexOf(row);
  assert.equal(row.textContent, `90'⏱️ Tillægstid: ${m.stoppage[1].S} min${m.stoppage[1].var ? ` (heraf ${m.stoppage[1].var} for VAR)` : ''}.`);
  // Linjen står under halvlegens FØRSTE tillægsminut-hændelse (nyeste øverst) – målet eller en hændelse før det
  const first = m.events.slice(halves(m).ht + 1).find((e) => e.clock.plus);
  assert.ok(feed[i - 1].textContent.startsWith(evMin(first)) && feed[i - 1].textContent.includes(first.text), 'over linjen: den første i tillægstiden');
  assert.ok(!feed[i - 1].textContent.includes('SLUTFLØJT'));
  assert.ok(!/^\d+\+/.test(feed[i + 1].textContent), 'under linjen: ordinær tid');
  assert.ok(m.events.indexOf(first) <= m.events.indexOf(goal));
});

test('tillægstidslinjen under live: ikke før ankeret er vist – derefter med', () => {
  const { ht } = halves(M4);
  const anchorIdx = M4.events.findIndex((e, i) => i <= ht && e.clock.plus);
  const before = render(M4, M4.homeId, { playing: true, shownCount: anchorIdx });
  assert.equal(byId(before, 'stoppage-0').length, 0);
  const after = render(M4, M4.homeId, { playing: true, shownCount: anchorIdx + 1 });
  assert.equal(byId(after, 'stoppage-0').length, 1);
  assert.equal(byId(after, 'stoppage-1').length, 0, 'anden halvlegs linje venter på sit anker');
  assert.equal(byId(after, 'minute')[0].textContent, evMin(M4.events[anchorIdx]), 'scoreboardets minut er urets');
});

test('scoreboard og tidslinje følger uret: halvlegsstregen på (45+S1)/T, mærkerne på timelinePos, titlen med evMin', () => {
  const el = render(M4, M4.homeId), tl = byId(el, 'timeline')[0];
  assert.equal(all(tl, (x) => cls(x, 'tl-half'))[0].style.left, `${((53 / 100) * 100).toFixed(1)}%`, 'S1 8, S2 2: 53 / 100');
  const marks = all(tl, (x) => cls(x, 'tl-mark')), plotted = M4.events.filter((e) => e.plot);
  assert.equal(marks.length, plotted.length);
  marks.forEach((x, i) => { assert.equal(x.style.left, `${(timelinePos(plotted[i], M4.stoppage) * 100).toFixed(1)}%`); assert.ok(x.attrs.title.startsWith(evMin(plotted[i]) + ' ')); });
});

// ---------- Heat map: prikkens minut og "på banen i X min" ----------
test('heat-prikkens titel er hændelsens minut (90+x – ikke tick\'ets start eller t·3)', () => {
  assert.ok(SG && SG.mo.t === 30, 'data: et mål i 90+x i sidste tick');
  const { m, goal } = SG, tick = fmtMin(tickClock(SG.mo.t, m.stoppage));
  assert.notEqual(evMin(goal), tick);
  const el = render(m, m.homeId, { heat: { playerId: null } });
  const titles = all(byId(el, 'heat-pitch')[0], (x) => cls(x, 'heat-shot')).map((d) => d.attrs.title);
  assert.ok(titles.includes(`${evMin(goal)} mål`), titles.join(' | '));
  assert.ok(!titles.includes(`${tick} mål`) && !titles.includes("90' mål"));
});

test('"på banen i X min" i heat-noten følger ind–ud-kolonnen (urets minutter)', () => {
  for (const [s, name, col, x] of [[11, 'A. Jørgensen', "77'–90'", 14], [37, 'S. Møller', "47'–90'", 44], [8, 'A. Jakobsen', "14'–90'", 77]]) {
    const m = game(s), e = m.ratings.home.find((r) => r.shortName === name);
    assert.ok(e, `data: ${name}`);
    const el = render(m, m.homeId, { heat: { playerId: e.playerId } });
    const row = all(el, (r) => r.tag === 'tr').find((r) => r.children[0].textContent.startsWith(`#${e.shirtNumber} ${e.shortName}`));
    assert.equal(row.children[1].textContent, col);
    assert.match(byId(el, 'heat-note')[0].textContent, new RegExp(`han var på banen i ${x} min `), `${name}: ${col} → ${x}`);
  }
});

// ---------- Klummen: sent mål efter uret ----------
const colM = (min, clock) => ({ homeId: 'h1', awayId: 'a1', homeName: 'Hjem', awayName: 'Ude', homeGoals: 2, awayGoals: 1, goalsPool: [],
  events: [{ min: 10, type: 'GOAL', isHome: true, hG: 1, aG: 0, clock: { m: 9 } }, { min: 40, type: 'GOAL', isHome: false, hG: 1, aG: 1, clock: { m: 41 } }, { min, type: 'GOAL', isHome: true, hG: 2, aG: 1, clock }] });
const late = (min, clock) => buildColumn({ matches: [colM(min, clock)], gazette: null, history: [], table: [], next: [], viewerTeamId: 'h1', round: 5 }).sections[0].paras[1];
test('klummen: sent mål afgøres på uret (79\' er ikke sent selv i tick 81; 80\' er sent selv i tick 78) – og "i tillægstiden"', () => {
  assert.equal(late(78, { m: 80 }), 'Sejrsmålet kom i 80. minut.');
  assert.notEqual(late(81, { m: 79 }), 'Sejrsmålet kom i 79. minut.');
  assert.ok(!/minut|tillægstiden/.test(late(81, { m: 79 }) ?? ''), 'ikke sent drama');
  assert.equal(late(90, { m: 90, plus: 3 }), 'Sejrsmålet kom i tillægstiden.');
  assert.equal(late(87, undefined), 'Sejrsmålet kom i 87. minut.', 'gammel hændelse uden ur: tick-minuttet');
});

// ---------- Gem fra før uret ----------
test('gem fra v3.16.2 (uden clock/stoppage): Kamp-fanen viser tick-minutterne uden fejl – ingen tillægstidslinje, ingen undefined/NaN', () => {
  const text = fs.readFileSync(new URL('../fixtures/save-v3.16.2.json', import.meta.url), 'utf8');
  assert.ok(!/"clock"|"stoppage"/.test(text), 'data: fixturen har intet ur');
  const r = parseSave(text);
  assert.ok(r.ok, r.error);
  const lr = r.state.league.lastRound, me = r.state.league.teams.find((t) => !t.isBot);
  assert.ok(lr.matches.length >= 1);
  lr.matches.forEach((m, i) => {
    clearReplays();
    const el = renderMatchCenter({ mc: { round: lr.round, matches: lr.matches, gazette: lr.gazette, viewIdx: i, filter: 'all', shownCount: Infinity, playing: false }, myTeamId: me.id, on });
    const rows = all(byId(el, 'feed')[0], (x) => cls(x, 'ev'));
    assert.equal(rows.length, m.events.length, 'én række pr. hændelse – ingen tillægstidslinje');
    assert.equal(byId(el, 'stoppage-0').length + byId(el, 'stoppage-1').length, 0);
    const mins = rows.map((x) => x.children[0].textContent);
    assert.deepEqual(mins, m.events.slice().reverse().map((e) => `${e.min}'`), 'tick-minutterne');
    assert.ok(mins.some((x) => x !== "0'" && Number(x.slice(0, -1)) % 3 === 0));
    assert.ok(!/undefined|NaN|null/.test(el.textContent), 'ingen undefined/NaN/null');
    const tl = byId(el, 'timeline')[0];
    assert.equal(all(tl, (x) => cls(x, 'tl-half'))[0].style.left, '50.0%');
    for (const x of all(tl, (y) => cls(y, 'tl-mark'))) assert.match(x.attrs.title, /^\d+' /);
    // Karakterarket: tick-minutter (ind–ud uden ur)
    for (const side of ['home', 'away']) for (const e of m.ratings[side]) if (e.minIn > 1 && e.minOut === 90) assert.ok(el.textContent.includes(`${e.minIn}'–90'`), `${e.shortName} ${e.minIn}'–90'`);
  });
});

// Ingen kamp uden pause får et ur (gamle/ufuldstændige referater)
test('assignClock uden pause gør intet og giver null', () => {
  const evs = [{ min: 3, type: 'INFO' }, { min: 6, type: 'GOAL' }];
  assert.equal(assignClock(evs), null);
  assert.ok(evs.every((e) => !('clock' in e)));
});

test('gem-vagt (RM v3.16.4): et ødelagt ur eller en ødelagt tillægstid slettes ved indlæsning – Kamp-fanen falder tilbage til tick-minutterne', async () => {
  const { isValidClock, isValidStoppage } = await import('../../public/engine/sanitize.js');
  assert.equal(isValidClock({ m: 45, plus: 3 }), true); assert.equal(isValidClock({ m: 7 }), true);
  for (const bad of [null, {}, { m: 91 }, { m: 3.5 }, { m: 45, plus: 9 }, { m: -1 }, { m: '7' }]) assert.equal(isValidClock(bad), false, JSON.stringify(bad));
  assert.equal(isValidStoppage([{ S: 3, var: 1 }, { S: 8, var: 8 }]), true);
  for (const bad of [[{}, null], [{ S: 3, var: 4 }, { S: 2, var: 0 }], [{ S: 9, var: 0 }, { S: 2, var: 0 }], [{ S: 3, var: 0 }], 'x']) assert.equal(isValidStoppage(bad), false, JSON.stringify(bad));
  const { serialize, parseSave } = await import('../../public/state/storage.js');
  const { playRound, commitRound } = await import('../../public/engine/season.js');
  const rng = createRng(4), L = createLeague(rng);
  commitRound(L, playRound(L, rng), rng);
  const m0 = L.lastRound.matches[0];
  m0.stoppage = [{}, null]; m0.events[3].clock = { m: 'x' };
  const back = parseSave(serialize({ league: L })), st = back.state ?? back, m = st.league.lastRound.matches[0];
  assert.equal(m.stoppage, undefined); assert.equal(m.events[3].clock, undefined);
  assert.ok(m.events[4].clock && isValidClock(m.events[4].clock), 'de gode ure står');
  assert.equal(evMin(m.events[3]), `${m.events[3].min}'`);
});
