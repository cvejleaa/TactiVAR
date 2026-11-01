// Test Manager v3.26.0 (nr. 39, angrebsside): forfatterens tests måler siden statistisk (measureSide, N=40, bånd 0,54 / 0,72 / 0,28),
// og de gamle stub-filer slår siden FRA (SIDE.GAIN = 0). Derfor var leftShare's fire led, GAIN/CAP-klemmen, CHOICE, READ i duellen,
// tællerne (wideL/R, Stop, back-tag) og gamle gem uden attackSide ubundne. Her er de bundet deterministisk: stub-rng (next konstant),
// uniforme evner (kantspiller PAC+BAL 20, back PAC+POS 20) og ÉT led ad gangen flyttet med en kendt forskel.
// Hver test nævner, hvilken mutation den dræber. GAIN/CAP er IKKE sat til 0 her.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRng } from '../../public/engine/rng.js';
import { createLeague, defaultTactics } from '../../public/engine/generator.js';
import { simulateMatch as simLive, SIDE, oppSideLine, CUTBACK_DEF_EDGE } from '../../public/engine/match.js';
import { parseSave } from '../../public/state/storage.js';
import { alignPositions } from './helpers/positions.mjs';

// --- FakeEl-DOM til Taktik-fanen (som tactics-ui.test.mjs) ---
class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { renderTactics } = await import('../../public/ui/tactics.js');
const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const optVal = (o) => o.value ?? o.attrs.value;

const simulateMatch = (h, a, r, o = {}) => simLive(h, a, r, { liveEnergy: false, drift: false, ...o });
// chance(p) afgøres af script[p]; next() er konstant, eller (v.set) kan flyttes undervejs af et script.
function stubRng(script = {}, nextValue = 0.5) {
  const calls = {}, st = { v: nextValue };
  return {
    st,
    next: () => st.v,
    int: (a) => a,
    pick: (arr) => arr[0],
    chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(n, st) : !!s; },
  };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
function arena({ home = {}, away = {} } = {}) {
  const L = createLeague(createRng(1));
  const [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) {
      p.skills = SK(10); p.aerialPower = 10; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 };
      p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0;
    }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0;
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id); alignPositions(t);
  }
  const setPhases = (t, o) => {
    const ph = t.tactics.phases;
    Object.assign(ph.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL', offBallRuns: 'NORMAL' }, o.p1);
    Object.assign(ph.phase2_defending, { pressingHeight: 'MID_BLOCK', offsideTrap: 'OFF', tacklingIntensity: 'NORMAL' }, o.p2);
    Object.assign(ph.phase3_transition, { onBallWon: 'KEEP_POSSESSION', onBallLost: 'DROP_BACK' }, o.p3);
  };
  setPhases(H, home); setPhases(A, away);
  return { L, H, A };
}
// 4-4-2: plads 0 GK, 1 LB, 2–3 CB, 4 RB, 5 LM, 6–7 CM, 8 RM, 9–10 ST.
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const tg = (p) => `#${p.shirtNumber} ${p.shortName}`;
const shots = (n) => (k) => k < n;
const homeBall = (a) => { for (const i of [5, 6, 7, 8]) Object.assign(slot(a.A, i).skills, { passing: 0, ballControl: 0 }); };
const noRotation = (t) => { for (const b of t.squad.slice(11)) b.skills = SK(1); };
const ftOf = (m) => m.events.find((e) => e.type === 'FULLTIME');

// Cutback-kamp: kantspiller PAC+BAL 20 overalt, back PAC+POS 20 overalt (x = ekstra POS til alle forsvarere; w/b = ekstra PAC til én plads).
// wL/wR = angriberens LM/RM (plads 5/8); bL/bR = forsvarets LB/RB (plads 1/4). Angriberens venstre kant møder forsvarets HØJRE back.
function cut({ side = 'BOTH', next = 0.5, n = 2, wL = 0, wR = 0, bL = 0, bR = 0, wLbc = 0, wRbc = 0, bLpos = 0, bRpos = 0, x = 0, press = 'MID_BLOCK', script = {}, bot = false,
  hForm = null, aForm = null, S = { wL: 5, wR: 8, bL: 1, bR: 4 }, tweak = null } = {}) {
  const a = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS', attackSide: side } }, away: { p2: { pressingHeight: press } } });
  if (hForm) { a.H.tactics.baseFormation = hForm; alignPositions(a.H); }
  if (aForm) { a.A.tactics.baseFormation = aForm; alignPositions(a.A); }
  for (const p of a.H.squad) Object.assign(p.skills, { pace: 10, ballControl: 10 });
  for (const p of a.A.squad) Object.assign(p.skills, { pace: 10, positioning: 10 + x });
  slot(a.H, S.wL).skills.pace += wL; slot(a.H, S.wR).skills.pace += wR; slot(a.A, S.bL).skills.pace += bL; slot(a.A, S.bR).skills.pace += bR;
  slot(a.H, S.wL).skills.ballControl += wLbc; slot(a.H, S.wR).skills.ballControl += wRbc; slot(a.A, S.bL).skills.positioning += bLpos; slot(a.A, S.bR).skills.positioning += bRpos;
  if (tweak) tweak(a);
  slot(a.A, 0).skills.goalkeeping = 0; homeBall(a); noRotation(a.A);
  if (bot) a.H.isBot = true;
  const rng = stubRng({ 0.3: shots(n), 0.38: true, ...script }, next);
  const m = simulateMatch(a.H, a.A, rng);
  return { a, m, d: m.duelLog[a.H.id] };
}
const dir = (r) => (r.d.wideL === r.d.cutbacks && r.d.wideR === 0 ? 'L' : r.d.wideR === r.d.cutbacks && r.d.wideL === 0 ? 'R' : `?${r.d.wideL}/${r.d.wideR}`);

test('konstanterne er bogstavelige (GAIN 0,01 pr. point, CAP 0,06, CHOICE 0,78, READ 0,5) – kantduellens basiskant er −2', () => {
  assert.deepEqual({ ...SIDE }, { GAIN: 0.01, CAP: 0.06, CHOICE: 0.78, READ: 0.5 });
  assert.equal(CUTBACK_DEF_EDGE, -2);   // READ-testen nedenfor regner med den
});

test('Begge: fire led pr. for sig – kant venstre/højre og deres højre/venstre back flytter siden den rigtige vej (dræber ombyttet L/R, fortegn, nulstillet led)', () => {
  // +4 point forskel = 0,54 / 0,46. Ved next 0,535 skal en positiv forskel give VENSTRE og en negativ HØJRE; ved 0,465 det samme
  // (uden forskel: 0,5 → 0,535 giver HØJRE, 0,465 giver VENSTRE). Et led, der er nulstillet/byttet, vender mindst ét af otte udfald.
  for (const nx of [0.535, 0.465]) {
    assert.equal(dir(cut({ next: nx, wL: 4 })), 'L', `egen venstre kant +4 @${nx}`);
    assert.equal(dir(cut({ next: nx, wR: 4 })), 'R', `egen højre kant +4 @${nx}`);
    assert.equal(dir(cut({ next: nx, bL: 4 })), 'L', `deres venstre back +4 (= svag højre side for dem) @${nx}`);
    assert.equal(dir(cut({ next: nx, bR: 4 })), 'R', `deres højre back +4 @${nx}`);
  }
  // begge evner tæller (PAC+BAL for kanten, PAC+POS for backen): samme +4 via kun BAL / kun POS
  for (const nx of [0.535, 0.465]) {
    assert.equal(dir(cut({ next: nx, wLbc: 4 })), 'L', `egen venstre kant +4 BAL @${nx}`);
    assert.equal(dir(cut({ next: nx, wRbc: 4 })), 'R', `egen højre kant +4 BAL @${nx}`);
    assert.equal(dir(cut({ next: nx, bLpos: 4 })), 'L', `deres venstre back +4 POS @${nx}`);
    assert.equal(dir(cut({ next: nx, bRpos: 4 })), 'R', `deres højre back +4 POS @${nx}`);
  }
  // kontrol: uden forskel er det 0,5
  assert.equal(dir(cut({ next: 0.535 })), 'R'); assert.equal(dir(cut({ next: 0.465 })), 'L');
});

test('Begge: GAIN = 0,01 pr. point (3 point = 0,53 → ikke venstre ved 0,535; 4 point = 0,54 → venstre) og klemmen CAP = 0,06 i begge retninger', () => {
  assert.equal(dir(cut({ next: 0.535, wL: 3 })), 'R', '3 point er 0,53 (GAIN 0,02 gav 0,56)');
  assert.equal(dir(cut({ next: 0.465, wR: 3 })), 'L', '−3 point er 0,47 (GAIN 0,02 gav 0,44)');
  // 20 point = 0,20 → klemt til 0,06 (0,56 / 0,44)
  assert.equal(dir(cut({ next: 0.555, wL: 20 })), 'L'); assert.equal(dir(cut({ next: 0.565, wL: 20 })), 'R', 'CAP 0,07 ville give venstre');
  assert.equal(dir(cut({ next: 0.435, wR: 20 })), 'L', 'CAP 0,05 ville give højre'); assert.equal(dir(cut({ next: 0.445, wR: 20 })), 'R');
  // forskellen er summen af de to sider: kant +10 og deres venstre back +10 = 20 point (ikke 10)
  assert.equal(dir(cut({ next: 0.555, wL: 10, bL: 10 })), 'L');
});

test('Venstre/Højre: CHOICE = 0,78 – styrer siden uanset hvor kanten er stærkest (dræber CHOICE byttet om, fast valg der stadig læser styrken)', () => {
  assert.equal(dir(cut({ side: 'LEFT', next: 0.5, wR: 20 })), 'L', 'Venstre, selvom højre kant er stærkest');
  assert.equal(dir(cut({ side: 'LEFT', next: 0.775 })), 'L'); assert.equal(dir(cut({ side: 'LEFT', next: 0.785 })), 'R', 'de 22 %');
  assert.equal(dir(cut({ side: 'RIGHT', next: 0.5, wL: 20 })), 'R', 'Højre, selvom venstre kant er stærkest');
  assert.equal(dir(cut({ side: 'RIGHT', next: 0.219 })), 'L', 'de 22 %'); assert.equal(dir(cut({ side: 'RIGHT', next: 0.221 })), 'R');
});

test('indlæg: kanten følger samme valg (ikke længere 0,5): Venstre/Højre/Begge med stærk kant – og lange bolde tæller ikke som kantangreb', () => {
  const cross = ({ side, next, wL = 0, shotsN = 2, pass = 'BALANCED', focus = 'HIGH_CROSSES', script = {} }) => {
    const a = arena({ home: { p1: { attackFocus: focus, passingStyle: pass, attackSide: side } } });
    for (const p of a.H.squad) Object.assign(p.skills, { pace: 10, ballControl: 10 });
    slot(a.H, 5).skills.pace += wL; noRotation(a.A);
    const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(shotsN), 0.52: true, ...script }, next));
    return { a, m, d: m.duelLog[a.H.id] };
  };
  const lr = (r) => [r.d.wideL, r.d.wideR];
  assert.deepEqual(lr(cross({ side: 'LEFT', next: 0.5 })), [2, 0]);
  assert.deepEqual(lr(cross({ side: 'RIGHT', next: 0.5 })), [0, 2]);
  assert.deepEqual(lr(cross({ side: 'LEFT', next: 0.9 })), [0, 2], 'de 22 %');
  assert.deepEqual(lr(cross({ side: 'BOTH', next: 0.535, wL: 4 })), [2, 0]); assert.deepEqual(lr(cross({ side: 'BOTH', next: 0.535, wL: 3 })), [0, 2]);
  assert.deepEqual(lr(cross({ side: 'BOTH', next: 0.5 })), [0, 2], 'uden forskel er 0,5 ikke < 0,5');
  // lange bolde (Direkte lange bolde, Centralt) slås fra midten og er ingen kantangreb
  const long = cross({ side: 'LEFT', next: 0.5, shotsN: 3, pass: 'DIRECT_LONG', focus: 'CENTRAL', script: { 0.15: true } });
  assert.equal(long.d.crosses, 3, 'data: tre lange bolde'); assert.deepEqual(lr(long), [0, 0]);
  assert.ok(!/kantangreb \d/.test(ftOf(long.m).text), ftOf(long.m).text);
  // Hold på ulige tal: 3 venstre + 1 højre uden back (indlæg har ingen kantduel) vs 2 + 2 → "i hver side"
  const mix = (seq) => { const r = cross({ side: 'BOTH', next: 0.5, shotsN: seq.length, script: { 0.52: (n, st) => { st.v = seq[n] ?? 0.5; return true; } } }); return { ...r, t: ftOf(r.m).text }; };
  const m31 = mix([0.4, 0.4, 0.6, 0.4]), m22 = mix([0.4, 0.6, 0.4, 0.6]);
  assert.deepEqual(lr(m31), [3, 1]); assert.ok(m31.t.includes('kantangreb 3 i venstre, 1 i højre'), m31.t);
  assert.deepEqual(lr(m22), [2, 2]); assert.ok(m22.t.includes('kantangreb 2 i hver side'), m22.t); assert.ok(!m22.t.includes('kantangreb 2 i venstre'), m22.t);
});

test('Begge: formationens roller afgør siden (4-3-3: LW/RW; 3-4-3: LM/RM), en forsvarer uden backs bruger sine kantmidtbane (ingen back = LM/RM), og træthed tæller (ff) – dræber fast 4-4-2-rolletabel, fjernet fallback, fjernet ff', () => {
  // angriber 4-3-3: LW = plads 8, RW = plads 10
  const S433 = { wL: 8, wR: 10, bL: 1, bR: 4 };
  for (const nx of [0.535, 0.465]) {
    assert.equal(dir(cut({ next: nx, hForm: '4-3-3', S: S433, wL: 4 })), 'L', `LW +4 @${nx}`);
    assert.equal(dir(cut({ next: nx, hForm: '4-3-3', S: S433, wR: 4 })), 'R', `RW +4 @${nx}`);
  }
  // forsvar 3-4-3 (tre stoppere, ingen backs): deres venstre side = LM (plads 4), højre = RM (plads 7)
  const S343 = { wL: 5, wR: 8, bL: 4, bR: 7 };
  for (const nx of [0.535, 0.465]) {
    assert.equal(dir(cut({ next: nx, aForm: '3-4-3', S: S343, bL: 4 })), 'L', `deres LM +4 @${nx}`);
    assert.equal(dir(cut({ next: nx, aForm: '3-4-3', S: S343, bR: 4 })), 'R', `deres RM +4 @${nx}`);
  }
  // ff: en stærk back/kant, der er helt udtrættet, tæller mindre end hans rå tal
  const off = (i, side) => (a) => { slot(side === 'H' ? a.H : a.A, i).freshness = 0; };   // freshFactor 0,75
  const rawLB = cut({ next: 0.5, bL: 4 });                                  // LB 24 mod 20: 0,54 → venstre ved 0,5
  assert.equal(dir(rawLB), 'L');
  assert.equal(dir(cut({ next: 0.5, bL: 4, tweak: off(1, 'A') })), 'R', 'LB helt udtrættet: 24·0,75 = 18 < 20 → forskellen bliver negativ (0,47)');
  assert.equal(dir(cut({ next: 0.535, wL: 4 })), 'L');
  assert.equal(dir(cut({ next: 0.535, wL: 4, tweak: off(5, 'H') })), 'R', 'LM helt udtrættet: 18 < 20 (LB 20 er nu bedste kant) → ingen forskel (0,5)');
});

test('READ: deres back får +0,5 i kantduellen KUN på den side, I har valgt fast – ikke på den anden side, ikke ved Begge (dræber fjernet/ombyttet side, READ 0,25/0,6)', () => {
  // Blokeret hvis kantspiller (20) + 4 <= back (20 + x) + 4 − 2 + read. x = 1,5: 24 <= 23,5 + read → kun med read 0,5 (lighed). x = 1,4: 24 <= 23,4 + 0,5 → aldrig.
  const blocked = (o) => { const r = cut({ x: 1.5, ...o }); return [r.d.cutbacksBlocked, r.d.wideLStop, r.d.wideRStop, dir(r)]; };
  assert.deepEqual(blocked({ side: 'LEFT', next: 0.5 }), [2, 2, 0, 'L'], 'Venstre valgt, angreb venstre → læst');
  assert.deepEqual(blocked({ side: 'RIGHT', next: 0.5 }), [2, 0, 2, 'R'], 'Højre valgt, angreb højre → læst');
  assert.deepEqual(blocked({ side: 'LEFT', next: 0.9 }), [0, 0, 0, 'R'], 'Venstre valgt, men de 22 % gik højre → ikke læst');
  assert.deepEqual(blocked({ side: 'RIGHT', next: 0.1 }), [0, 0, 0, 'L'], 'Højre valgt, men de 22 % gik venstre → ikke læst');
  assert.deepEqual(blocked({ side: 'BOTH', next: 0.4 }), [0, 0, 0, 'L'], 'Begge: aldrig læst (venstre)');
  assert.deepEqual(blocked({ side: 'BOTH', next: 0.6 }), [0, 0, 0, 'R'], 'Begge: aldrig læst (højre)');
  assert.equal(cut({ x: 1.4, side: 'LEFT', next: 0.5 }).d.cutbacksBlocked, 0, 'READ er under 0,6');
  assert.equal(cut({ x: 2, side: 'BOTH', next: 0.5 }).d.cutbacksBlocked, 2, 'kontrol: duellen kan blokere (x 2 = basiskanten)');
});

test('tællere og fuldtidstekst: 3 kantangreb venstre med 1 lukket, deres HØJRE back (plads 4) står ved venstre, 0 højre – og spejlet (dræber wideL/R byttet, Stop ikke talt/forkert side, back-tag på forkert side)', () => {
  // 0.38 kaldes én gang pr. cutback: nr. 1 (den anden) mødes af stærke backs, de øvrige af svage
  const play = (next) => {
    const a = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS', attackSide: 'BOTH' } } });
    for (const p of a.H.squad) Object.assign(p.skills, { pace: 10, ballControl: 10 });
    for (const p of a.A.squad) Object.assign(p.skills, { pace: 10, positioning: 10 });
    slot(a.A, 0).skills.goalkeeping = 0; homeBall(a); noRotation(a.A);
    const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(3), 0.38: (n) => { for (const p of a.A.squad) p.skills.positioning = n === 1 ? 40 : 10; return true; } }, next));
    return { a, m, d: m.duelLog[a.H.id], t: ftOf(m).text };
  };
  const l = play(0.4);
  assert.deepEqual([l.d.cutbacks, l.d.wideL, l.d.wideR, l.d.wideLStop, l.d.wideRStop, l.d.backL, l.d.backR], [3, 3, 0, 1, 0, tg(slot(l.a.A, 4)), null]);
  assert.ok(l.t.includes(`kantangreb 3 i venstre mod ${tg(slot(l.a.A, 4))} (1 lukket), 0 i højre.`), l.t);
  const r = play(0.6);
  assert.deepEqual([r.d.cutbacks, r.d.wideL, r.d.wideR, r.d.wideLStop, r.d.wideRStop, r.d.backL, r.d.backR], [3, 0, 3, 0, 1, null, tg(slot(r.a.A, 1))]);
  assert.ok(r.t.includes(`kantangreb 0 i venstre, 3 i højre mod ${tg(slot(r.a.A, 1))} (1 lukket).`), r.t);
  assert.equal(r.d.cutbacksBlocked, 1, 'data: ét lukket – ellers beviser Stop-tallet intet');
});

test('kantangreb: lige mange i hver side vises som "i hver side" KUN uden backs – indlæg venstre + cutback højre (og omvendt, efter et Hvis-Så-planskift) viser backen (dræber de to back-vagter hver for sig)', () => {
  // Plan A = første fokus; Plan B = det andet. Hvis-Så skifter til B fra minut 9 (efter 2 chancer: tick 3 og 6): 1. halvdel venstre (next 0,4), 2. højre (0,6).
  const mixed = (first) => {
    const a = arena({ home: { p1: { attackFocus: first === 'cross' ? 'HIGH_CROSSES' : 'LOW_CUTBACKS' } } });
    for (const p of a.H.squad) Object.assign(p.skills, { pace: 10, ballControl: 10 });
    for (const p of a.A.squad) Object.assign(p.skills, { pace: 10, positioning: 10 });
    homeBall(a); noRotation(a.A);
    const planB = structuredClone(a.H.tactics);
    planB.phases.phase1_buildUp.attackFocus = first === 'cross' ? 'LOW_CUTBACKS' : 'HIGH_CROSSES';
    a.H.tacticPresets[1] = planB;
    a.H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 7, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: 1, slotRemapping: [...Array(11).keys()] }];
    const rng = stubRng({ 0.3: (k, st) => { st.v = k < 2 ? 0.4 : 0.6; return k < 4; }, 0.52: true, 0.38: true }, 0.5);
    const m = simulateMatch(a.H, a.A, rng);
    return { a, d: m.duelLog[a.H.id], t: ftOf(m).text, m };
  };
  const c = mixed('cross');   // indlæg venstre ×2, så cutbacks højre ×2 mod deres LB
  assert.deepEqual([c.d.wideL, c.d.wideR, c.d.backL, c.d.backR], [2, 2, null, tg(slot(c.a.A, 1))]);
  assert.ok(c.t.includes(`kantangreb 2 i venstre, 2 i højre mod ${tg(slot(c.a.A, 1))}`) && !c.t.includes('i hver side'), c.t);
  const k = mixed('cut');     // cutbacks venstre ×2 mod deres RB, så indlæg højre ×2
  assert.deepEqual([k.d.wideL, k.d.wideR, k.d.backL, k.d.backR], [2, 2, tg(slot(k.a.A, 4)), null]);
  assert.ok(k.t.includes(`kantangreb 2 i venstre mod ${tg(slot(k.a.A, 4))}, 2 i højre`) && !k.t.includes('i hver side'), k.t);
});

test('Dit felt (kamp, spejlet): en bot angriber din HØJRE side (deres venstre, next 0,4) mod din RB – og din venstre (next 0,6) mod din LB; dine egne kantangreb nævnes ikke', () => {
  const play = (next) => {
    const a = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS' } } });
    for (const p of a.H.squad) Object.assign(p.skills, { pace: 10, ballControl: 10 });
    for (const p of a.A.squad) Object.assign(p.skills, { pace: 30, positioning: 30 });
    homeBall(a); noRotation(a.A); a.H.isBot = true; a.A.isBot = false;
    const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(5), 0.38: true }, next));   // QC v3.26.0: Dit felt kræver ≥ 5
    return { a, t: ftOf(m).text };
  };
  const v = play(0.4), h = play(0.6);
  assert.ok(v.t.includes(`5 af 5 kantangreb kom i din højre side (mod ${tg(slot(v.a.A, 4))}).`), v.t);
  assert.ok(h.t.includes(`5 af 5 kantangreb kom i din venstre side (mod ${tg(slot(h.a.A, 1))}).`), h.t);
  assert.ok(!/kantangreb \d+ i /.test(v.t) && !/kantangreb \d+ i /.test(h.t), 'ingen egne kantangreb at fortælle om');
});

// QC v3.26.0: grænsen ≥ 5 og ¾ (før ≥ 3 og 2/3 – de gamle tilfælde 2 af 3, 4 af 6, 3 af 3 er nu tomme og røde på den gamle kode)
test('oppSideLine: grænserne bogstaveligt – ¾ præcis (6 af 8, 3 af 4 i 5+) vises, 5 af 7 og 4 af 6 ikke; mindst 5 i alt; uafgjort vises ikke', () => {
  assert.equal(oppSideLine({ oppWideL: 6, oppWideR: 2, oppBackL: '#2 X' }), ' · 6 af 8 kantangreb kom i din højre side (mod #2 X)');
  assert.equal(oppSideLine({ oppWideL: 2, oppWideR: 6, oppBackR: '#4 Y' }), ' · 6 af 8 kantangreb kom i din venstre side (mod #4 Y)');
  assert.equal(oppSideLine({ oppWideL: 5, oppWideR: 0 }), ' · 5 af 5 kantangreb kom i din højre side', 'n = 5 er nok');
  assert.equal(oppSideLine({ oppWideL: 0, oppWideR: 5 }), ' · 5 af 5 kantangreb kom i din venstre side');
  for (const [l, r] of [[2, 1], [1, 2], [4, 2], [3, 0], [0, 3], [4, 0], [5, 2], [4, 3], [3, 3], [5, 5], [0, 0]]) assert.equal(oppSideLine({ oppWideL: l, oppWideR: r }), '', `${l}-${r}`);
  // højre-flertal bruger HØJRE backs navn (ikke venstres)
  assert.equal(oppSideLine({ oppWideL: 0, oppWideR: 5, oppBackL: 'forkert', oppBackR: 'rigtig' }), ' · 5 af 5 kantangreb kom i din venstre side (mod rigtig)');
});

test('gamle gem (v3.25 og før) har ingen attackSide: indlæsning giver Begge på ALLE hold, et gemt valg overlever, og andre faser er urørte', () => {
  const RAW = fs.readFileSync(new URL('../fixtures/save-v3.22.1.json', import.meta.url), 'utf8');
  const raw = JSON.parse(RAW);
  assert.ok(raw.league.teams.length === 8 && raw.league.teams.every((t) => !('attackSide' in t.tactics.phases.phase1_buildUp)), 'data: fixturet har ikke feltet');
  const r = parseSave(RAW);
  assert.ok(r.ok, r.error);
  r.state.league.teams.forEach((t, i) => {
    assert.equal(t.tactics.phases.phase1_buildUp.attackSide, 'BOTH', t.id);
    assert.equal(t.tactics.phases.phase1_buildUp.passingStyle, raw.league.teams[i].tactics.phases.phase1_buildUp.passingStyle);
    assert.equal(t.tactics.phases.phase1_buildUp.attackFocus, raw.league.teams[i].tactics.phases.phase1_buildUp.attackFocus);
    assert.equal(t.tactics.phases.phase2_defending.pressingHeight, raw.league.teams[i].tactics.phases.phase2_defending.pressingHeight);
  });
  // et gemt valg overlever (defaults må ikke overskrive det) – også i en af planerne
  raw.league.teams[0].tactics.phases.phase1_buildUp.attackSide = 'LEFT';
  raw.league.teams[3].tactics.phases.phase1_buildUp.attackSide = 'RIGHT';
  const r2 = parseSave(JSON.stringify(raw));
  assert.deepEqual([0, 1, 2, 3].map((i) => r2.state.league.teams[i].tactics.phases.phase1_buildUp.attackSide), ['LEFT', 'BOTH', 'BOTH', 'RIGHT']);
  // og et gammelt gem kan spilles: en kamp med Begge giver ingen NaN (leftShare læser feltet)
  const L = r.state.league, [h, a] = L.teams;
  const m = simLive(h, a, createRng(5));
  assert.ok(Number.isInteger(m.homeGoals) && Number.isInteger(m.awayGoals));
});

test('alle nyoprettede hold (også botternes profiler) starter på Begge; defaultTactics giver Begge', () => {
  const L = createLeague(createRng(3));
  assert.equal(L.teams.length, 8);
  for (const t of L.teams) assert.equal(t.tactics.phases.phase1_buildUp.attackSide, 'BOTH', t.id);
  assert.equal(defaultTactics(L.teams[2].tactics.lineupSlots).phases.phase1_buildUp.attackSide, 'BOTH');
});

test('Taktik-fanen: Angrebsside står i Fase 1 mellem Angrebsfokus og Løb uden bold med Venstre/Begge/Højre, viser holdets valg, sender valget – og modstanderen ser den ikke', () => {
  const L = createLeague(createRng(4)), team = L.teams[0];
  team.tactics.phases.phase1_buildUp.attackSide = 'RIGHT';
  const calls = [], on = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) });
  const root = renderTactics({ team, isOwn: true, ui: { activePresetIndex: 0 }, on });
  const fs1 = all(root, (e) => e.tag === 'fieldset' && e.dataset.phase === 'phase1_buildUp')[0];
  const sels = all(fs1, (e) => e.tag === 'select');
  assert.deepEqual(sels.map((s) => s.dataset.field), ['passingStyle', 'attackFocus', 'attackSide', 'offBallRuns']);
  const sel = sels[2];
  assert.deepEqual(all(sel, (e) => e.tag === 'option').map((o) => [optVal(o), o.textContent]), [['LEFT', 'Venstre (LW/LB)'], ['BOTH', 'Begge'], ['RIGHT', 'Højre (RW/RB)']]);
  assert.deepEqual(all(sel, (e) => e.tag === 'option').filter((o) => o.attrs.selected === '').map(optVal), ['RIGHT']);
  assert.equal(all(fs1, (e) => e.tag === 'label').map((l) => l.textContent.split(' ')[0]).includes('Angrebsside'), true);
  sel.listeners.change({ target: { value: 'LEFT' } });
  assert.deepEqual(calls.at(-1), ['phase', 'phase1_buildUp', 'attackSide', 'LEFT']);
  // hjælpeteksten: tallet kommer af SIDE.CHOICE (0,78 → ca. 3 af 4), og siger hvad Begge/Venstre/Højre gør
  const help = all(fs1, (e) => e.className.includes('phase-help'))[0].textContent;
  assert.ok(help.includes(`Venstre/Højre: ca. ${Math.round(SIDE.CHOICE * 4)} af 4 kantangreb dér`) && help.includes('ca. 3 af 4'), help);
  assert.ok(help.includes('Begge: lidt oftere dér, hvor jeres kant står stærkest mod deres back') && help.includes('ved cutbacks læser deres back på den side det') && help.includes('en lille fordel, ca. ét styret kantangreb pr. kamp, og mest ved Lave cutbacks'), help);
  // modstanderens hold: faserne (og dermed hans valgte side) vises slet ikke
  const opp = renderTactics({ team: L.teams[1], isOwn: false, ui: { activePresetIndex: 0 }, on });
  assert.equal(all(opp, (e) => e.dataset.field === 'attackSide').length, 0);
  assert.ok(!opp.textContent.includes('Venstre (LW/LB)'));
});

// QC v3.26.0: "mod #x" må ikke være kun den sidste back – skiftede backen (udskiftning), står der "flere backs"
test('back-navnet pr. side: samme back hver gang → hans navn; skiftende → "flere backs"', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../../public/engine/match.js', import.meta.url), 'utf8');
  const line = src.split('\n').find((l) => l.includes("const k = 'back' + sd"));
  assert.ok(line, 'tildelingen findes');
  const log = { backL: null };
  const set = (t) => { const k = 'backL'; log[k] = log[k] == null || log[k] === t ? t : 'flere backs'; };
  set('#3 A'); set('#3 A'); assert.equal(log.backL, '#3 A');
  set('#14 B'); assert.equal(log.backL, 'flere backs'); set('#3 A'); assert.equal(log.backL, 'flere backs');
  assert.ok(line.includes("log[k] == null || log[k] === t ? t : 'flere backs'"), line);
});
