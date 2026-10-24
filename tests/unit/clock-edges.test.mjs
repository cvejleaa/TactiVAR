// v3.16.4 – Test Manager: hullerne i clock.test.mjs fundet ved mutation (public/engine/clock.js m.fl.). Hver test nævner den mutation,
// den dræber. Uret er et visningsfelt (e.clock = { m, plus }); motoren regner stadig i tick à 3 minutter (e.min).
import { test } from 'node:test';
import assert from 'node:assert/strict';

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
const { stoppageFor, assignClock, fmtMin, evMin, clockNum, tickClock, timelinePos, halfPos, inMinute, playerSpan } = await import('../../public/engine/clock.js');
const { renderMatchCenter, minutes } = await import('../../public/ui/matchcenter.js');
const { clearReplays, replayEl } = await import('../../public/ui/replay.js');
const { measureClock } = await import('../../tools/measure-clock.mjs');
const { buildColumn } = await import('../../public/engine/column.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id);
const cls = (e, c) => e.className.split(' ').includes(c);
const on = { skip() {}, view() {}, snapshot() {}, openGoal() {}, filter() {}, heat() {}, replay() {} };
const render = (m, myTeamId, mc = {}) => { clearReplays(); return renderMatchCenter({ mc: { round: 1, matches: [m], gazette: { goalOfTheRound: null, totalGoals: 0, totalVarChecks: 0 }, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false, ...mc }, myTeamId, on }); };
const isEnd = (e) => e.type === 'END' || e.type === 'FULLTIME';

// De samme 200 kampe som tools/measure-clock.mjs. "Rene" = uden Hvis-Så-linjer (minClock skubber dér hændelser ud af vinduet).
const MATCHES = Array.from({ length: 200 }, (_, i) => {
  const s = i + 1, L = createLeague(createRng(s));
  return simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
});
const CLEAN = MATCHES.filter((m) => !m.events.some((e) => /Hvis-Så/.test(e.text ?? '')));
const halves = (m) => { const ht = m.events.findIndex((e) => e.type === 'HALFTIME'), end = m.events.findIndex(isEnd); return { ht, end }; };
const startOf = (t, st) => clockNum(tickClock(t, st));   // tick t (1–30) → vinduets første minut (første halvleg 1–14, anden 15–30)
// Hændelsens tick: første halvleg ceil(min / 3), anden halvleg round(min / 3) (pause-tick'ets spil står efter pausen: 45 → tick 15)
const tickOf = (e, i, ht) => (i < ht ? Math.max(1, Math.ceil(e.min / 3)) : Math.max(15, Math.round(e.min / 3)));
const windowOfTick = (t, st) => [startOf(t, st), t === 14 ? 45 + st[0].S : t === 30 ? 90 + st[1].S : startOf(t + 1, st) - 1];

test('data: 180 af 200 kampe uden Hvis-Så (de rene), og ur på alle', () => {
  assert.ok(CLEAN.length >= 150, `rene kampe: ${CLEAN.length}`);
  assert.ok(CLEAN.every((m) => m.events.every((e) => e.clock)));
});

// ---------- vinduerne ----------
test('hver hændelse ligger INDEN FOR sit tick-vindue (start = tickClock, slut = næste vindues start − 1; sidste tick til 45+S1 / 90+S2) – og når toppen', () => {
  // Dræber: windowOf b = from i stedet for from − 1 (vinduerne overlapper med 1 minut), sidste tick strakt til base + S − 1, k === n → k > n.
  // Hvert vindue er 2–4 minutter; en hændelse i et forkert tick, eller ét minut uden for, er et brud.
  let n = 0; const top = [0, 0];
  for (const m of CLEAN) {
    const { ht, end } = halves(m), st = m.stoppage;
    m.events.forEach((e, i) => {
      if (i === ht || i >= end) return;
      const t = tickOf(e, i, ht), [lo, hi] = windowOfTick(t, st), c = clockNum(e.clock);
      n++;
      assert.ok(c >= lo && c <= hi, `tick ${t} (min ${e.min}): ${evMin(e)} uden for vinduet ${lo}–${hi}`);
      if (t === 14 && c === 45 + st[0].S) top[0]++;
      if (t === 30 && c === 90 + st[1].S) top[1]++;
    });
  }
  assert.ok(n > 5000, `data: ${n}`);
  // Sidste minut i tillægstiden bruges (23 / 27 i de rene kampe) – S − 1 som loft ville give 0
  assert.ok(top[0] >= 8 && top[1] >= 8, `data: hændelser på 45+S1 / 90+S2: ${top}`);
});

test('spredningen i vinduet: en hændelse alene i sit tick ligger på alle tre minutter i et 3-minutters vindue (≈ ⅓ hver) – v3.16.3 og "altid første minut": 100 % / 0 / 0', () => {
  // Dræber: hashOf → konstant (alle på vinduets første minut). Tal: 651 / 570 / 577 af 1798 alene-hændelser (36 / 32 / 32 %).
  const off = [0, 0, 0]; let singles = 0;
  for (const m of CLEAN) {
    const { ht, end } = halves(m), st = m.stoppage, groups = new Map();
    m.events.forEach((e, i) => { if (i === ht || i >= end) return; const t = tickOf(e, i, ht); (groups.get(t) ?? groups.set(t, []).get(t)).push(e); });
    for (const [t, g] of groups) {
      const [lo, hi] = windowOfTick(t, st);
      if (g.length === 1 && hi - lo + 1 === 3) { singles++; off[clockNum(g[0].clock) - lo]++; }
    }
  }
  assert.ok(singles > 1000, `data: ${singles}`);
  for (const [k, v] of off.entries()) assert.ok(v / singles > 0.26 && v / singles < 0.42, `minut ${k} i vinduet: ${(v / singles * 100).toFixed(1)} % (${off})`);
});

test('uret er en ren funktion af referatet: samme hændelser (uden ur) → samme ur og samme tillægstid, hver gang – intet Math.random, intet rng', () => {
  // Dræber: hashOf → Math.random (alle andre tests i clock.test.mjs består, for fordelingen er stadig jævn).
  for (const m of CLEAN.slice(0, 40)) {
    const strip = () => m.events.map((e) => { const c = { ...e }; delete c.clock; return c; });
    const a = strip(), b = strip(), sa = assignClock(a), sb = assignClock(b);
    assert.deepEqual(a.map((e) => e.clock), m.events.map((e) => e.clock), 'samme ur som i kampen');
    assert.deepEqual(b.map((e) => e.clock), a.map((e) => e.clock));
    assert.deepEqual(sa, m.stoppage); assert.deepEqual(sb, sa);
  }
});

test('et ur uden plus har ingen "plus"-nøgle (45 og 90 er ordinære minutter), og plus er altid ≥ 1 på 45 / 90', () => {
  // Dræber: asClock m >= base (45 → { m: 45, plus: 0 }); fmtMin skjuler plus 0, så kun den strukturelle assert ser det.
  let m45 = 0, m90 = 0;
  for (const m of MATCHES) for (const e of m.events) {
    if ('plus' in e.clock) { assert.ok(e.clock.plus >= 1, `plus ${e.clock.plus}`); assert.ok(e.clock.m === 45 || e.clock.m === 90); }
    else if (e.clock.m === 45) m45++; else if (e.clock.m === 90) m90++;
  }
  assert.ok(m45 > 5 && m90 > 5, `data: ${m45} hændelser på præcis 45', ${m90} på 90'`);
});

// ---------- assignClock på håndlavede referater ----------
const mk = (...specs) => specs.map(([type, min, extra]) => ({ type, min, ...(extra ?? {}) }));
const inj = (n, min = 80) => Array.from({ length: n }, () => ({ type: 'INJURY', min }));
test('assignClock: slutfløjtet kan hedde FULLTIME; hændelser efter det står på 90+S2, og de tæller ikke i tillægstiden (hverken 1. eller 2. halvleg)', () => {
  // Dræber: endIdx kun END; slice af halvlegene (anden halvleg løber til slutfløjtet, første til pausen).
  const evs = [...mk(['INFO', 3], ['GOAL', 6], ['HALFTIME', 45]), ...inj(7, 60), ...mk(['INFO', 90], ['FULLTIME', 90]), ...inj(7, 90), ...mk(['INFO', 90])];
  const st = assignClock(evs);
  assert.deepEqual(st, [{ S: 2, var: 0 }, { S: 8, var: 0 }], 'første halvleg: 1 mål; anden: 7 skader (efter slutfløjtet tæller ikke)');
  const ht = evs.findIndex((e) => e.type === 'HALFTIME'), end = evs.findIndex((e) => e.type === 'FULLTIME');
  assert.deepEqual(evs[ht].clock, { m: 45, plus: 2 });
  for (const e of evs.slice(end)) assert.deepEqual(e.clock, { m: 90, plus: 8 }, e.type);
  assert.ok(evs.slice(ht + 1, end).every((e) => e.clock.m >= 46 && clockNum(e.clock) <= 98));
});

test('assignClock uden slutfløjt: anden halvleg løber til listens slutning – og første halvleg røres ikke af slutfløjts-reglen', () => {
  // Dræber: endIdx < 0 ? events.length → ht + 1 (anden halvleg får aldrig ur); fjernet `endIdx >= 0 &&` (alle hændelser fra 0 sættes til 90+S).
  const evs = mk(['INFO', 3], ['GOAL', 6], ['HALFTIME', 45], ['INFO', 45], ['GOAL', 60], ['INFO', 90]);
  const st = assignClock(evs);
  assert.deepEqual(st, [{ S: 2, var: 0 }, { S: 2, var: 0 }]);
  assert.ok(evs.every((e) => e.clock), 'ur på alle');
  assert.ok(clockNum(evs[0].clock) <= 3 && clockNum(evs[1].clock) <= 6, 'første halvleg i sine vinduer');
  assert.deepEqual(evs[2].clock, { m: 45, plus: 2 });
  assert.ok(clockNum(evs[3].clock) >= 46 && clockNum(evs[3].clock) <= 48, 'pause-tick: 46–48');
  assert.ok(clockNum(evs[5].clock) >= 88 && clockNum(evs[5].clock) <= 92, `sidste tick: ${evMin(evs[5])}`);
});

test('assignClock: minClock løfter en hændelse til sit minut – og alle efterfølgende (også i senere tick) følger med, aldrig tilbage i tid', () => {
  // Dræber: minClock ignoreret; `prev` fjernet (efter en Hvis-Så-linje på 20 faldt næste tick tilbage til 7–9).
  const evs = mk(['INFO', 3], ['TRIGGER', 6], ['INFO', 6], ['INFO', 9], ['INFO', 12], ['HALFTIME', 45], ['INFO', 48], ['FULLTIME', 90]);
  assignClock(evs, new Map([[1, 20]]));
  assert.ok(clockNum(evs[0].clock) <= 3);
  assert.ok(clockNum(evs[1].clock) >= 20, `reglens linje på ${evMin(evs[1])}`);
  for (let i = 2; i <= 4; i++) assert.ok(clockNum(evs[i].clock) >= clockNum(evs[i - 1].clock), `${evMin(evs[i - 1])} → ${evMin(evs[i])}`);
  assert.ok(clockNum(evs[4].clock) >= 20);
  assert.ok(evs[6].clock.m >= 46, 'anden halvleg begynder forfra (46+) – første halvlegs forskydning følger ikke med over pausen');
  // Uden minClock står den samme linje i sit eget vindue (4–6)
  const free = mk(['INFO', 3], ['TRIGGER', 6], ['INFO', 6], ['INFO', 9], ['INFO', 12], ['HALFTIME', 45], ['INFO', 48], ['FULLTIME', 90]);
  assignClock(free);
  assert.ok(clockNum(free[1].clock) <= 6);
});

test('assignClock: 45 og 90 uden tillæg er { m } – uden plus-nøgle', () => {
  // Dræber: asClock m >= base. Tolv hændelser i sidste tick med minClock 45 / 90: den første lander præcis på 45 / 90.
  const first = [...mk(['INFO', 3]), ...Array.from({ length: 12 }, () => ({ type: 'INFO', min: 42 })), ...mk(['HALFTIME', 45], ['INFO', 48], ['INFO', 90], ['FULLTIME', 90])];
  const mc = new Map(first.map((e, i) => [i, 45]).filter(([i]) => i >= 1 && i <= 12));
  const st = assignClock(first, mc);
  assert.equal(st[0].S, 1);
  assert.deepEqual(first[1].clock, { m: 45 });
  const second = [...mk(['HALFTIME', 45]), ...Array.from({ length: 12 }, () => ({ type: 'INFO', min: 90 })), ...mk(['FULLTIME', 90])];
  const mc2 = new Map(second.map((e, i) => [i, 90]).filter(([i]) => i >= 1 && i <= 12));
  assignClock(second, mc2);
  assert.deepEqual(second[1].clock, { m: 90 });
});

// ---------- stoppageFor ----------
test('stoppageFor: VAR_GOAL tæller som mål (½); en VAR-linje uden .var tæller ikke; et ukendt udfald tæller 1', () => {
  // Dræber: VAR_GOAL fjernet fra målene (ét mål i tillægstiden: 1 + ½ → 2).
  assert.deepEqual(stoppageFor([{ type: 'VAR_GOAL', min: 30 }]), { S: 2, var: 0 });
  assert.deepEqual(stoppageFor([{ type: 'VAR_CHECK', min: 30 }]), { S: 1, var: 0 }, 'uden .var er det ingen VAR-gennemgang');
  assert.deepEqual(stoppageFor([{ type: 'VAR_CHECK', min: 30, var: { verdict: 'NOGET' } }]), { S: 2, var: 1 });
  assert.deepEqual(stoppageFor([{ type: 'VAR_GOAL', min: 30 }, { type: 'VAR_GOAL', min: 31 }, { type: 'GOAL', min: 33 }]), { S: 3, var: 0 }, '1 + 3 · ½ = 2,5 → 3');
});

// ---------- timelinePos / inMinute ----------
test('timelinePos: 45 uden tillæg er første halvleg; en hændelse uden min er 0; loft 1; uret slår e.min', () => {
  const st = [{ S: 3, var: 0 }, { S: 4, var: 0 }];
  assert.equal(timelinePos({ min: 99, clock: { m: 45 } }, st), 45 / 97, '45\' uden plus står før 46\'');
  assert.equal(timelinePos({ min: 99, clock: { m: 46 } }, st), 49 / 97);
  assert.equal(timelinePos({ min: 5, clock: { m: 90, plus: 9 } }, st), 1, 'højst 1');
  assert.equal(timelinePos({}, null), 0, 'gammel hændelse uden min og ur');
  assert.equal(timelinePos({ min: 200 }, null), 1, 'højst 1 også uden ur');
  assert.equal(timelinePos({ min: 30, clock: { m: 20 } }, st), 20 / 97, 'uret, ikke e.min');
});
test('inMinute: uden ur og uden minut "i 0. minut"; m 0 er "i 0. minut"', () => {
  assert.equal(inMinute(undefined), 'i 0. minut');
  assert.equal(inMinute({}), 'i 0. minut');
  assert.equal(inMinute({ m: 79, plus: 0 }), 'i 79. minut');
  assert.equal(inMinute({ m: 45, plus: 1 }), 'i tillægstiden', 'også 45+1 er tillægstid');
});

// ---------- playerSpan ----------
const P = (id, n, name, minIn, minOut) => ({ playerId: id, shirtNumber: n, shortName: name, minIn, minOut });
test('playerSpan: to hold med samme trøje+navn kommer ind på hvert sit minut; ind-linjer uden ur tæller ikke', () => {
  // Dræber: e.min === r.minIn fjernet (sidste "ind" overskriver begge).
  const events = [
    { type: 'SUB', min: 40, clock: { m: 41 }, label: '🔄 #8 Ny ind for #2 Hjemme', text: 'x' },
    { type: 'SUB', min: 70, clock: { m: 72 }, label: '🔄 #8 Ny ind for #3 Ude', text: 'x' }];
  const h = playerSpan(events, [P('h8', 8, 'Ny', 40, 90)]), a = playerSpan(events, [P('a8', 8, 'Ny', 70, 90)]);
  assert.deepEqual(h.get('h8'), { in: { m: 41 } }); assert.deepEqual(a.get('a8'), { in: { m: 72 } });
});
test('playerSpan: rødt kort vinder over skadelinjen i begge rækkefølger; en skadelinje på et andet minut eller uden hans navn tæller ikke; VAR_RED tæller', () => {
  // Dræber: RED overskriver ikke (!s.out), INJURY overskriver altid, INJURY uden min-/navnecheck, VAR_RED ikke genkendt.
  const ras = P('r', 9, 'Ras', 1, 33), red = { type: 'RED', min: 33, clock: { m: 32 }, text: '🟥 [Hjem] Direkte rødt kort til #9 Ras' };
  const hurt = (min, clk, who = '#9 Ras') => ({ type: 'INJURY', min, clock: { m: clk }, text: `🚑 [Ude] #3 Lund bliver skadet efter en tackling fra ${who}.` });
  assert.deepEqual(playerSpan([hurt(33, 30), red], [ras]).get('r'), { out: { m: 32 } }, 'skade FØR rødt: rødt vinder');
  assert.deepEqual(playerSpan([red, hurt(33, 33)], [ras]).get('r'), { out: { m: 32 } }, 'skade EFTER rødt: rødt bliver stående');
  assert.deepEqual(playerSpan([red, hurt(18, 17)], [ras]).get('r'), { out: { m: 32 } }, 'skade på et andet minut (nævner ham som tackler) tæller ikke');
  assert.deepEqual(playerSpan([hurt(33, 30, '#5 Andre')], [ras]).get('r'), {}, 'skadelinje uden hans navn');
  assert.deepEqual(playerSpan([{ ...red, text: '🟥 [Hjem] Direkte rødt kort til #4 Anden' }], [ras]).get('r'), {}, 'rødt kort til en anden');
  assert.deepEqual(playerSpan([{ ...red, type: 'VAR_RED', clock: { m: 34 } }], [ras]).get('r'), { out: { m: 34 } }, 'VAR_RED');
  const lund = P('l', 3, 'Lund', 1, 33);
  assert.deepEqual(playerSpan([{ type: 'INJURY', min: 33, clock: { m: 30 }, text: '🚑 [Ude] #3 Lund bliver skadet.' }], [lund]).get('l'), { out: { m: 30 } }, 'skadet: fra skadelinjen');
});
test('playerSpan: en udskiftning uden ur (gammel linje) giver intet ur – ikke undefined', () => {
  // Dræber: `if (!e.clock) continue` fjernet (s.out = undefined → { out: undefined }).
  const r = playerSpan([{ type: 'SUB', min: 80, label: '🔄 #1 Bo ind for #9 Ras', text: 'x' }], [P('r', 9, 'Ras', 1, 80)]).get('r');
  assert.deepEqual(r, {}); assert.ok(!('out' in r));
});

// ---------- minutes / "på banen i X min" ----------
test('minutes: skiftet ud i sidste tick (minOut 90) står som 90+x – ikke som "90\'"; uden ur som før', () => {
  // Dræber: `&& !s?.out` fjernet (en spiller skiftet ud i 90+2 stod som hel kamp).
  assert.equal(minutes({ minIn: 1, minOut: 90 }, { out: { m: 90, plus: 2 } }), "0'–90+2'");
  assert.equal(minutes({ minIn: 1, minOut: 61 }), "0'–61'");
  assert.equal(minutes({ minIn: 1, minOut: 61 }, { out: { m: 62 } }), "0'–62'");
  assert.equal(minutes({ minIn: 59, minOut: 90 }, { in: { m: 60 } }), "60'–90'");
});

const num = (s) => { const [m, p] = s.replace("'", '').split('+'); return Number(m) + Number(p ?? 0); };
test('"på banen i X min" i heat-noten = ind–ud-kolonnens minutter (også for spillere skiftet UD og både ind og ud) – 25 kampe', () => {
  // Dræber: minutesOn ignorerer s.out (kolonnen siger 0'–61', noten 60); ignorerer s.in; −1 fjernet.
  const seen = { outOnly: 0, inOnly: 0, both: 0 };
  for (const m of MATCHES.slice(0, 25)) {
    for (const e of m.ratings.home) {
      if (e.minIn <= 1 && e.minOut === 90) continue;
      const el = render(m, m.homeId, { heat: { playerId: e.playerId } });
      const row = all(el, (r) => r.tag === 'tr').find((r) => r.children[0].textContent.startsWith(`#${e.shirtNumber} ${e.shortName}`));
      const col = row.children[1].textContent, [a, b] = col.split('–'), from = a === "0'" ? 0 : num(a) - 1, to = num(b);
      const exp = to - from;
      if (exp >= 90) continue;
      const note = byId(el, 'heat-note')[0].textContent, mm = note.match(/han var på banen i (\d+) min /);
      assert.ok(mm, `${e.shortName} ${col}: ${note.slice(0, 120)}`);
      assert.equal(Number(mm[1]), exp, `${e.shortName} ${col}`);
      if (a === "0'") seen.outOnly++; else if (e.minOut === 90 && to === 90) seen.inOnly++; else seen.both++;
    }
  }
  assert.ok(seen.outOnly >= 3 && seen.inOnly >= 3, `data: ${JSON.stringify(seen)}`);
});

// ---------- klummen ----------
const cm = (o) => ({ homeId: 'h1', awayId: 'a1', homeName: 'Hjem', awayName: 'Ude', goalsPool: [], ...o });
const ev3 = (hG, aG, last) => [{ min: 10, type: 'GOAL', isHome: true, hG: 1, aG: 0, clock: { m: 9 } }, { min: 40, type: 'GOAL', isHome: false, hG: 1, aG: 1, clock: { m: 41 } }, last];
const col = (matches, viewer = 'h1', round = 5) => buildColumn({ matches, gazette: { totalGoals: 1 }, history: [], table: [], next: [], viewerTeamId: viewer, round });
test('klummen: et sent udemål i tillægstiden — "Det gjorde ondt: Ude afgjorde det i tillægstiden." (tabersiden), og sejrsmålet set fra udeholdet (Sejrsmålet kom i tillægstiden.)', () => {
  // Dræber: lateAt → "i ${lateMin}. minut" i "Det gjorde ondt"-grenen.
  const m = cm({ homeGoals: 1, awayGoals: 2, events: ev3(1, 2, { min: 90, type: 'GOAL', isHome: false, hG: 1, aG: 2, clock: { m: 90, plus: 3 } }) });
  assert.equal(col([m]).sections[0].paras[1], 'Det gjorde ondt: Ude afgjorde det i tillægstiden.');
  // Udeholdet var aldrig bagud (0-1, 1-1, 1-2): sejrsmål, ikke comeback
  const away = cm({ homeGoals: 1, awayGoals: 2, events: [{ min: 10, type: 'GOAL', isHome: false, hG: 0, aG: 1, clock: { m: 9 } }, { min: 40, type: 'GOAL', isHome: true, hG: 1, aG: 1, clock: { m: 41 } }, { min: 90, type: 'GOAL', isHome: false, hG: 1, aG: 2, clock: { m: 90, plus: 3 } }] });
  assert.equal(col([away], 'a1').sections[0].paras[1], 'Sejrsmålet kom i tillægstiden.');
  const m2 = cm({ homeGoals: 1, awayGoals: 2, events: ev3(1, 2, { min: 78, type: 'GOAL', isHome: false, hG: 1, aG: 2, clock: { m: 81 } }) });
  assert.equal(col([m2]).sections[0].paras[1], 'Det gjorde ondt: Ude afgjorde det i 81. minut.', 'urets minut, ikke tick 78');
});
test('klummen: de øvrige kampe og overskriften siger "i tillægstiden" for et sent mål på 90+x (alle tre noter, og historien)', () => {
  // Dræber: lateAt → lateMin i hver af de tre noter og i "Sent drama"-historien.
  const mine = cm({ homeGoals: 1, awayGoals: 0, events: [{ min: 10, type: 'GOAL', isHome: true, hG: 1, aG: 0, clock: { m: 9 } }] });
  const other = cm({ homeId: 'l1', awayId: 'l2', homeName: 'L1', awayName: 'L2', homeGoals: 2, awayGoals: 1, events: ev3(2, 1, { min: 90, type: 'GOAL', isHome: true, hG: 2, aG: 1, clock: { m: 90, plus: 2 } }) });
  const forms = new Set();
  for (let r = 1; r <= 12; r++) {
    const c = col([mine, other], 'h1', r), note = c.sections.find((s) => s.id === 'col-others').others[0].note;
    assert.match(note, /tillægstiden/, note); assert.doesNotMatch(note, /\. minut/, note);
    forms.add(note.replace('L1', 'X'));
    assert.equal(c.title, 'Sent drama: L1 afgjorde det i tillægstiden');
  }
  assert.deepEqual([...forms].sort(), ['Afgjort i tillægstiden.', 'Sejrsmålet faldt i tillægstiden.', 'X slog til sent – i tillægstiden.']);
});

// ---------- grundbilledet, spor uden ur ----------
test('heat-prikkens minut for en afslutning uden hændelse i referatet: tick-vinduets start (tickClock) – og uden stoppage (gammelt gem) t · 3', () => {
  // Dræber: shotMin-fallback → `${t * 3}'` (v3.16.3), og fallback uden stoppage.
  const m = MATCHES.find((x) => x.trace?.moments.some((mo) => mo.shooter != null && mo.side === 'h' && mo.kind === 'GOAL' && mo.t === 30)) ?? MATCHES.find((x) => x.trace?.moments.some((mo) => mo.shooter != null && mo.side === 'h' && mo.kind === 'GOAL'));
  const mo = m.trace.moments.find((x) => x.shooter != null && x.side === 'h' && x.kind === 'GOAL');
  const bare = structuredClone(m); bare.trace.moments.find((x) => x === bare.trace.moments[m.trace.moments.indexOf(mo)]).ev = null;
  const titles = (mm) => all(byId(render(mm, mm.homeId, { heat: { playerId: null } }), 'heat-pitch')[0], (x) => cls(x, 'heat-shot')).map((d) => d.attrs.title);
  assert.ok(titles(bare).includes(`${fmtMin(tickClock(mo.t, m.stoppage))} mål`), `${fmtMin(tickClock(mo.t, m.stoppage))} i ${titles(bare)}`);
  const old = structuredClone(bare); delete old.stoppage;
  assert.ok(titles(old).includes(`${mo.t * 3}' mål`), titles(old).join(' | '));
});

// ---------- tools/measure-clock.mjs: tallene i commit-teksten ----------
test('measure-clock: hvert tal (andel delelige med 3, rest mod 3, tillægstid, VAR-minutter, tyndeste/tykkeste minut) er det samme som en uafhængig optælling over de samme 200 kampe', () => {
  // Dræber: % 3 === 1 i stedet for 0, n tæller plus-hændelser med, forkert seed (s · 29), V[i] += x.S, avg(S[0]) to gange, min↔max,
  // 45/46 ikke udeladt i "tyndeste", mods fra minut 0. clock.test.mjs tjekker kun båndet 0,28–0,40 (en rest mod 3 er også ≈ ⅓).
  // Ikke dækket: `falling` (tælleren i measure-clock) kan ikke fyres af en hændelsesliste udefra – testen "ikke-faldende" tæller selv.
  const r = measureClock(200), perMin = Array(91).fill(0);
  let n = 0, d = 0; const S = [[], []], V = [0, 0];
  for (const m of MATCHES) {
    m.stoppage.forEach((x, i) => { S[i].push(x.S); V[i] += x.var; });
    for (const e of m.events) if (e.type !== 'HALFTIME' && !e.clock.plus && e.type !== 'TACTIC_NOTE') { n++; perMin[e.clock.m]++; if (e.clock.m % 3 === 0) d++; }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length, near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, `${msg}: ${a} ≠ ${b}`);
  near(r.div3, d / n, 'div3');
  [0, 1, 2].forEach((k) => near(r.mods[k], perMin.reduce((a, c, i) => a + (i >= 1 && i % 3 === k ? c : 0), 0) / n, `rest ${k}`));
  near(r.mods[0] + r.mods[1] + r.mods[2], 1, 'resterne giver 1');
  near(r.stoppage[0], avg(S[0]), 'tillægstid 1.'); near(r.stoppage[1], avg(S[1]), 'tillægstid 2.');
  assert.notEqual(r.stoppage[0], r.stoppage[1], 'data: halvlegene har ikke samme gennemsnit');
  near(r.varPerMatch[0], V[0] / 200, 'VAR 1.'); near(r.varPerMatch[1], V[1] / 200, 'VAR 2.');
  assert.ok(V[0] > 0 && V[1] > 0 && V[0] !== S[0].reduce((a, b) => a + b, 0), 'data: VAR-minutter ≠ tillægstid');
  assert.equal(r.min, Math.min(...S.flat())); assert.equal(r.max, Math.max(...S.flat()));
  const inner = perMin.map((c, i) => [i, c]).filter(([i]) => i >= 2 && i <= 89 && i !== 45 && i !== 46).map(([, c]) => c);
  assert.equal(r.thin, Math.min(...inner)); assert.equal(r.thick, Math.max(...inner));
  assert.deepEqual(r.perMin, perMin);
});

// ---------- playerSpan: flere hullede tilfælde ----------
test('playerSpan: en VAR-kendelse "rødt trukket tilbage til gult" (VAR_RED i et andet minut end hans udminut) og en skadelinje, der nævner ham som tackler, gør ham ikke til udgået', () => {
  // Dræber: `e.min === r.minOut` fjernet i RED/VAR_RED-grenen og i INJURY-grenen (en spiller på banen hele kampen fik et udminut midt i første halvleg).
  const stay = P('s', 9, 'Ras', 1, 90);
  const varRed = { type: 'VAR_RED', min: 30, clock: { m: 31 }, text: '📺 [Hjem] Dommeren viser #9 Ras det røde kort for tacklingen – men VAR tjekker situationen …' };
  const hurt = { type: 'INJURY', min: 18, clock: { m: 17 }, text: '🚑 [Ude] #3 Lund bliver skadet efter en tackling fra #9 Ras (Hjem).' };
  assert.deepEqual(playerSpan([varRed], [stay]).get('s'), {}, 'VAR_RED i minut 30, han spiller til 90');
  assert.deepEqual(playerSpan([hurt], [stay]).get('s'), {}, 'tackler i en skadelinje i minut 18, han spiller til 90');
  assert.deepEqual(playerSpan([varRed, hurt], [P('s', 9, 'Ras', 1, 70)]).get('s'), {}, 'udminut 70 uden en linje i minut 70');
});
test('playerSpan: #7 Jens og #7 Jensen (samme trøje, navn med samme begyndelse) i samme minut skilles – ud-linjen skal SLUTTE med hans navn', () => {
  // Dræber: endsWith → includes (Jens fik Jensens ud-linje).
  const events = [{ type: 'SUB', min: 60, clock: { m: 61 }, label: '🔄 #12 Holm ind for #7 Jensen', text: 'x' }];
  const sp = playerSpan(events, [P('j', 7, 'Jens', 1, 60), P('jn', 7, 'Jensen', 1, 60)]);
  assert.deepEqual(sp.get('j'), {});
  assert.deepEqual(sp.get('jn'), { out: { m: 61 } });
});

// ---------- karakterarkene: begge hold efter uret ----------
test('begge karakterark (hjemme og ude) viser ind- og udminut efter referatets ur: spillerens kolonne = SUB-linjens minut', () => {
  // Dræber: playerSpan sendes kun til det ene ark (ude-arket faldt tilbage til tick-minuttet, fx "60\'" i stedet for "61\'").
  const seen = { home: 0, away: 0 };
  for (const m of MATCHES.slice(0, 40)) {
    const el = render(m, m.homeId), [homeT, awayT] = all(el, (e) => cls(e, 'ratings'));
    const rowOf = (table, tag) => all(table, (r) => r.tag === 'tr').find((r) => r.children[0].textContent.startsWith(tag));
    for (const e of m.events) {
      const mt = e.type === 'SUB' && e.label?.match(/^🔄 (#\d+ .+?) ind for (#\d+ .+)$/);
      if (!mt) continue;
      const side = e.isHome ? 'home' : 'away', table = e.isHome ? homeT : awayT;
      const inRow = rowOf(table, mt[1]), outRow = rowOf(table, mt[2]);
      assert.ok(inRow && outRow, `${mt[1]} / ${mt[2]}`);
      assert.ok(inRow.children[1].textContent.startsWith(`${evMin(e)}–`), `${side} ind: ${inRow.children[1].textContent} ≠ ${evMin(e)}`);
      assert.ok(outRow.children[1].textContent.endsWith(`–${evMin(e)}`), `${side} ud: ${outRow.children[1].textContent} ≠ ${evMin(e)}`);
      seen[side]++;
    }
  }
  assert.ok(seen.home >= 5 && seen.away >= 5, `data: ${JSON.stringify(seen)}`);
});

// ---------- 📍 øjebliksbilledets overskrift ----------
test('📍 overskriften står på hændelsens ur (evMin) – dit mål og mål imod', () => {
  // Dræber: `${ev.min}'` i stedet for evMin(ev) i begge overskrifter (de to snap-ui-tests rammer et tick, hvor de tilfældigvis er ens).
  const seen = { att: 0, def: 0 };
  for (const m of MATCHES.slice(0, 60)) {
    m.events.forEach((e, i) => {
      if (!e.snapshot || evMin(e) === `${e.min}'`) return;
      const title = byId(render(m, m.homeId, { snap: i }), 'snap-title')[0].textContent;
      assert.ok(title.startsWith(`${evMin(e)} – mål`), title);
      seen[e.snapshot.attacking ? 'att' : 'def']++;
    });
  }
  assert.ok(seen.att >= 3 && seen.def >= 3, `data: ${JSON.stringify(seen)}`);
});

// ---------- afspilningens billedtekster ----------
test('afspilningen: hvert trin, der viser en hændelse (afslutning/øjeblik), står på HENDES ur — ikke på tick · 3', () => {
  // Dræber: billedteksten i skudtrinnet (kind "shot") og øjebliksbilledet bruger s.t · 3 i stedet for evMin.
  // Gennemgå alle trin i 8 kampe med ⏭; billedtekstens minut skal være urets for en hændelse, hvis tekst står i teksten.
  let checked = 0, differ = 0;
  for (const m of MATCHES.slice(0, 8)) {
    clearReplays();
    const el = replayEl(m, 'h'), cap = () => byId(el, 'rp-caption')[0].textContent;
    for (let step = 0; step < 400; step++) {
      const c = cap(), [min, ...rest] = c.split(' · '), body = rest.join(' · ');
      const hit = m.events.filter((e) => e.text && body.includes(e.text));
      if (hit.length) {
        checked++;
        assert.ok(hit.some((e) => evMin(e) === min), `trin ${step}: "${min}" ≠ ${hit.map(evMin)}`);
        if (hit.every((e) => `${e.min}'` !== evMin(e))) differ++;
      }
      const before = el.dataset.step;
      byId(el, 'rp-next')[0].handlers.click();
      if (el.dataset.step === before) break;
    }
  }
  assert.ok(checked > 50 && differ > 10, `data: ${checked} trin, ${differ} hvor urets minut ≠ tick-minuttet`);
});
