// v3.16.2: skudtrinnet i afspilningen (public/ui/replay.js shotEnd og 'shot'-trinnet) – bolden går derhen, referatet siger, skuddet
// endte. Håndbyggede øjeblikke med kendte tal, regnet ud fra reglen (fælles koordinater: hjemme angriber mod y 0, ude mod y 100;
// linje(d) = d hjemme, 100 − d ude; målmanden = forsvarets spiller nærmest målets midte (50, linje(0))):
//  - mål (GOAL/HEADER_GOAL): [klem(målmand.x ∓ 5 mod skyttens side, 45, 55), linje(2)]   - redning: målmanden
//  - forbi (MISS): label 'Blokeret' → forsvarets markspiller nærmest skytten; tekst med 'stolpe' (ikke "forbi den lange stolpe")
//    → [skytte.x < 50 ? 44 : 56, linje(1)]; 'over mål'/'over overliggeren' → [50, linje(0,5)]; ellers → [skytte.x < 50 ? 62 : 38, linje(2)]
//  - VAR_CHECK, VAR_NO_GOAL, OFFSIDE_FLAG: intet trin.
// Afspilleren: skudtrinnet varer 1100 ms / hastighed, flytter kun bolden (ease-in, 60 % af trinet), og 🎬 viser øjeblikket og efter
// 2600 ms / hastighed skudtrinnet – uden at afspille videre.
import { test, mock } from 'node:test';
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
const { shotEnd, shotOver, replaySteps, stepForEvent, replayEl, replayJump, clearReplays, STEP_MS } = await import('../../public/ui/replay.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const cls = (e, c) => e.className.split(' ').includes(c);
const step = (el) => Number(el.dataset.step);
const click = (el, id) => byId(el, id).handlers.click();

// Forsvaret, når hjemme angriber (udeholdet forsvarer målet ved y 0): keeper (50, 10), to markspillere.
const AWAY_DEF = [['a1', 50, 10], ['a2', 40, 25], ['a3', 60, 30]];
// Forsvaret, når ude angriber (hjemmeholdet forsvarer målet ved y 100): keeper (50, 90), to markspillere.
const HOME_DEF = [['h1', 50, 90], ['h2', 40, 75], ['h3', 60, 70]];
const mo = (side, kind, ball, def = side === 'h' ? AWAY_DEF : HOME_DEF) => ({ side, kind, ball, h: side === 'h' ? [['h9', ...ball]] : def, a: side === 'h' ? def : [['a9', ...ball]] });
const miss = (text, label = 'Forbi') => ({ type: 'MISS', label, text: `🎯 [X] #9 S. Kytte ${text}.` });

test('mål: i nettet (linje 2) ved siden af målmanden mod skyttens side, klemt til 45–55 – hjemme og ude, også hovedstød – dræber ±5 byttet, klemmen væk, linje(2) uden spejling', () => {
  // hjemme: skytte x 41 < keeper 50 → 45; x 58 ≥ 50 → 55; x 50 (ikke <) → 55
  assert.deepEqual(shotEnd(mo('h', 'GOAL', [41, 22])), [45, 2]);
  assert.deepEqual(shotEnd(mo('h', 'GOAL', [58, 20])), [55, 2]);
  assert.deepEqual(shotEnd(mo('h', 'GOAL', [50, 12])), [55, 2]);
  // keeper på x 47: skytte til højre → 52 (inden for klemmen – ikke 55); keeper 42, skytte til venstre → 37 → klemt 45; keeper 58 → 63 → 55
  assert.deepEqual(shotEnd(mo('h', 'GOAL', [60, 20], [['a1', 47, 9], ['a2', 40, 25]])), [52, 2]);
  assert.deepEqual(shotEnd(mo('h', 'GOAL', [30, 20], [['a1', 42, 9], ['a2', 40, 25]])), [45, 2]);
  assert.deepEqual(shotEnd(mo('h', 'GOAL', [70, 20], [['a1', 58, 9], ['a2', 40, 25]])), [55, 2]);
  // ude (mod y 100): keeper (49, 91), skytte x 60 → 54, y 98; hovedstød fra venstre → 49 − 5 = 44 → 45
  assert.deepEqual(shotEnd(mo('a', 'GOAL', [60, 80], [['h1', 49, 91], ['h2', 40, 75]])), [54, 98]);
  assert.deepEqual(shotEnd(mo('a', 'HEADER_GOAL', [40, 88], [['h1', 49, 91], ['h2', 40, 75]])), [45, 98]);
  assert.deepEqual(shotEnd(mo('h', 'HEADER_GOAL', [56, 8])), [55, 2]);
});

test('redning: bolden hos målmanden – hjemme og ude; målmanden er forsvarets spiller nærmest målets midte, også når plads 0 mangler og når han ikke står først – dræber def[0] som målmand og det forkerte mål (linje 100 hjemme)', () => {
  assert.deepEqual(shotEnd(mo('h', 'SAVE', [45, 20], [['a1', 47, 9], ['a2', 40, 25]])), [47, 9]);
  assert.deepEqual(shotEnd(mo('a', 'SAVE', [45, 80], [['h1', 53, 91], ['h2', 40, 75]])), [53, 91]);
  // ingen 'a1' (udvist keeper – en markspiller i målet), og han står sidst
  assert.deepEqual(shotEnd(mo('h', 'SAVE', [45, 20], [['a2', 30, 30], ['a3', 70, 20], ['a5', 52, 14]])), [52, 14]);
  assert.deepEqual(shotEnd(mo('a', 'SAVE', [45, 80], [['h4', 30, 70], ['h7', 48, 86], ['h3', 60, 70]])), [48, 86]);
  // med målet i den forkerte ende ville (60, 30) / (30, 70) være "nærmest" – de er det ikke
  assert.deepEqual(shotEnd(mo('h', 'SAVE', [45, 20], [['a3', 60, 30], ['a1', 50, 10]])), [50, 10]);
});

test('blokeret: hos forsvarets MARKSPILLER nærmest skytten (ikke keeperen, selv om han står nærmest) – hjemme og ude; uden markspillere falder den til teksten – dræber label-grenen, keeperen med, nærmest målet i stedet for skytten', () => {
  const blok = { type: 'MISS', label: 'Blokeret', text: '🧱 [Y] #4 B. Lokker kaster sig ind foran afslutningen fra #9 S. Kytte (X).' };
  assert.deepEqual(shotEnd(mo('h', 'MISS', [58, 33]), blok), [60, 30]);
  assert.deepEqual(shotEnd(mo('h', 'MISS', [50, 14]), blok), [40, 25], 'keeperen (4 væk) springes over – a2 (14,9) før a3 (18,9)');
  assert.deepEqual(shotEnd(mo('a', 'MISS', [42, 78]), blok), [40, 75]);
  assert.deepEqual(shotEnd(mo('a', 'MISS', [50, 86]), blok), [40, 75]);
  // kun keeperen tilbage: ingen at blokere → teksten (ingen stolpe/over) → forbi, skytten x 58 → 38
  assert.deepEqual(shotEnd(mo('h', 'MISS', [58, 33], [['a1', 50, 10]]), blok), [38, 2]);
});

test('stolpen: på stolpen i målets forkant på skyttens side (x 44 / 56, linje 3) – men "forbi den lange stolpe" er forbi (fjerne side, linje 2) – hjemme og ude', () => {
  assert.deepEqual(shotEnd(mo('h', 'MISS', [40, 20]), miss('rammer stolpen')), [44, 3]);
  assert.deepEqual(shotEnd(mo('h', 'MISS', [60, 20]), miss('rammer stolpen')), [56, 3]);
  assert.deepEqual(shotEnd(mo('a', 'MISS', [40, 80]), miss('rammer stolpen')), [44, 97]);
  assert.deepEqual(shotEnd(mo('a', 'MISS', [50, 80]), miss('rammer stolpen')), [56, 97], 'x 50 er ikke < 50');
  assert.deepEqual(shotEnd(mo('h', 'MISS', [40, 20]), miss('skyder forbi den lange stolpe')), [62, 2]);
  assert.deepEqual(shotEnd(mo('a', 'MISS', [60, 80]), miss('skyder forbi den lange stolpe')), [38, 98]);
});

test('over: "over mål" og "over overliggeren" → over midten af målet (50, linje 0,5) – hjemme og ude', () => {
  assert.deepEqual(shotEnd(mo('h', 'MISS', [30, 25]), miss('sender bolden over mål')), [50, 0.5]);
  assert.deepEqual(shotEnd(mo('a', 'MISS', [70, 75]), miss('banker bolden over overliggeren')), [50, 99.5]);
  assert.deepEqual(shotEnd(mo('h', 'MISS', [70, 25]), miss('banker bolden over overliggeren')), [50, 0.5]);
});

test('forbi (ellers): uden for stolpen på den FJERNE side (x 62 / 38, linje 2) – hjemme og ude; uden referat (events mangler) er alt forbi, også et blokeret/stolpe-skud', () => {
  assert.deepEqual(shotEnd(mo('h', 'MISS', [40, 20]), miss('skyder en meter forbi')), [62, 2]);
  assert.deepEqual(shotEnd(mo('h', 'MISS', [50, 20]), miss('får ikke ram på bolden – den triller forbi')), [38, 2]);
  assert.deepEqual(shotEnd(mo('a', 'MISS', [40, 80]), miss('skyder en meter forbi')), [62, 98]);
  assert.deepEqual(shotEnd(mo('a', 'MISS', [60, 80]), miss('skyder en meter forbi')), [38, 98]);
  assert.deepEqual(shotEnd(mo('h', 'MISS', [58, 33])), [38, 2]);
  assert.deepEqual(shotEnd(mo('a', 'MISS', [40, 80]), null), [62, 98]);
  assert.deepEqual(shotEnd(mo('h', 'MISS', [40, 20]), undefined), [62, 2]);
});

test('intet skudtrin efter VAR_CHECK, VAR_NO_GOAL og OFFSIDE_FLAG (kendelsen er ingen boldbane), uden bold eller uden forsvar', () => {
  for (const kind of ['VAR_CHECK', 'VAR_NO_GOAL', 'OFFSIDE_FLAG']) assert.equal(shotEnd(mo('h', kind, [41, 22])), null, kind);
  assert.equal(shotEnd({ ...mo('h', 'GOAL', [41, 22]), ball: undefined }), null);
  assert.equal(shotEnd(mo('h', 'SAVE', [41, 22], [])), null);
  // i trinene: øjeblikket står, men intet skudtrin efter det
  const frame = { t: 1, poss: 'h', ball: [50, 50], h: [['h9', 50, 50]], a: AWAY_DEF };
  const moments = ['VAR_CHECK', 'VAR_NO_GOAL', 'OFFSIDE_FLAG', 'SAVE'].map((kind, ev) => ({ t: 1, ev, shooter: 'h9', ...mo('h', kind, [41, 22]) }));
  const s = replaySteps({ frames: [frame], moments }, false, []);
  assert.deepEqual(s.map((x) => `${x.kind}:${x.ev}`), ['frame:null', 'moment:0', 'moment:1', 'moment:2', 'moment:3', 'shot:3']);
  assert.deepEqual(replaySteps({ frames: [frame], moments }, true, []).map((x) => `${x.kind}:${x.ev}`), ['moment:0', 'moment:1', 'moment:2', 'moment:3', 'shot:3']);
});

// ---------- afspilleren ----------
const ratings = { home: [{ playerId: 'h9', shirtNumber: 9, shortName: 'S. Kytte' }], away: AWAY_DEF.map(([playerId], i) => ({ playerId, shirtNumber: i + 1, shortName: playerId })) };
const ev = (min, hG, aG, text, type = 'INFO', label) => ({ min, hG, aG, text, type, label });
// t 1: grundbillede, så en redning (ev 1) og et skud på stolpen (ev 2); t 2: grundbillede og et mål (ev 3)
const events = [ev(0, 0, 0, 'Kampen i gang'), ev(3, 0, 0, 'REDNING', 'SAVE'), ev(3, 0, 0, '🎯 rammer stolpen', 'MISS', 'Forbi'), ev(6, 1, 0, 'MÅL', 'GOAL'), ev(90, 1, 0, 'SLUT', 'END')];
const F = (t) => ({ t, poss: 'h', ball: [50, 50], h: [['h9', 50, 50]], a: AWAY_DEF });
const mk = () => ({
  homeName: 'Hjemme', awayName: 'Ude', ratings, events,
  trace: { v: 1, frames: [F(1), F(2)], moments: [
    { t: 1, ev: 1, shooter: 'h9', ...mo('h', 'SAVE', [45, 20]) },
    { t: 1, ev: 2, shooter: 'h9', ...mo('h', 'MISS', [40, 22]) },
    { t: 2, ev: 3, shooter: 'h9', scorer: 'h9', ...mo('h', 'GOAL', [41, 22]) },
  ] },
});
// Trinene: 0 frame t1 · 1 redning · 2 skud → keeper (50, 10) · 3 stolpe · 4 skud → (44, 1) · 5 frame t2 · 6 mål · 7 skud → (45, 2)
const fresh = () => { clearReplays(); const m = mk(); return { m, el: replayEl(m, 'h') }; };

test('trinene med referatet: skudtrinnet lige efter sit øjeblik med udfaldet fra referatets linje; stepForEvent peger på øjeblikket, ikke skudtrinnet', () => {
  const m = mk(), s = replaySteps(m.trace, false, m.events);
  assert.deepEqual(s.map((x) => `${x.kind}:${x.ev}`), ['frame:null', 'moment:1', 'shot:1', 'moment:2', 'shot:2', 'frame:null', 'moment:3', 'shot:3']);
  assert.deepEqual([s[2].ball, s[4].ball, s[7].ball], [[50, 10], [44, 3], [45, 2]]);
  assert.deepEqual(replaySteps(m.trace, false)[4].ball, [62, 2], 'uden referat: stolpeskuddet er forbi');
  assert.deepEqual([1, 2, 3].map((e) => stepForEvent(s, m.events, e)), [1, 3, 6]);
  const hl = replaySteps(m.trace, true, m.events);
  assert.deepEqual([1, 2, 3].map((e) => stepForEvent(hl, m.events, e)), [0, 2, 4]);
});

test('banen har to tegnede mål (.rp-goal top og bund) i rp-pitch', () => {
  const { el } = fresh();
  const goals = all(byId(el, 'rp-pitch'), (x) => cls(x, 'rp-goal'));
  assert.equal(goals.length, 2);
  assert.deepEqual(goals.map((g) => [cls(g, 'top'), cls(g, 'bottom')]), [[true, false], [false, true]]);
  clearReplays();
});

test('skudtrinnet flytter KUN bolden: brikkernes plads, overgang, skjul og markering er øjeblikkets; bolden glider ease-in over 60 % af trinet (660 ms ved 1×, 330 ms ved 2×); teksten er hændelsens med "moment"', () => {
  const { el } = fresh();
  click(el, 'rp-next'); click(el, 'rp-next'); click(el, 'rp-next');   // trin 3: stolpeskuddet
  const toks = all(el, (x) => cls(x, 'rp-token'));
  const snap = () => toks.map((t) => JSON.stringify([t.dataset.pid, t.style.left, t.style.top, t.hidden, t.className]));
  const before = snap(), cap = byId(el, 'rp-caption').textContent;
  click(el, 'rp-next');   // trin 4: skudtrinnet
  assert.equal(step(el), 4);
  assert.deepEqual(snap(), before, 'ingen brik flyttet');
  assert.ok(toks.every((t) => t.style.transition === 'none'), 'brikkerne sættes uden overgang (QC v3.16.2: også baglæns)');
  const ball = byId(el, 'rp-ball');
  assert.deepEqual([ball.style.left, ball.style.top], ['44%', '3%']);
  assert.equal(ball.style.transition, 'left 660ms ease-in, top 660ms ease-in, transform 660ms ease-in, opacity 660ms ease-in');
  assert.equal(byId(el, 'rp-caption').textContent, "3' · Hjemme 0-0 Ude · 🎯 rammer stolpen");
  assert.equal(byId(el, 'rp-caption').textContent, cap);
  assert.ok(cls(byId(el, 'rp-caption'), 'moment'));
  assert.ok(cls(toks.find((t) => t.dataset.pid === 'h9'), 'actor'), 'skytten er stadig markeret');
  click(el, 'rp-speed');   // 2×
  click(el, 'rp-prev'); click(el, 'rp-next');
  assert.equal(ball.style.transition, 'left 330ms ease-in, top 330ms ease-in, transform 330ms ease-in, opacity 330ms ease-in');
  click(el, 'rp-next');   // grundbilledet bagefter tegner igen brikker og fjerner 'moment'
  assert.equal(cls(byId(el, 'rp-caption'), 'moment'), false);
  clearReplays();
});

test('tidsforløb: skudtrinnet varer 1100 ms ved 1×, 550 ved 2×, 275 ved 4×', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    assert.equal(STEP_MS.shot, 1100);
    for (const [clicks, ms] of [[0, 1100], [1, 550], [2, 275]]) {
      const { el } = fresh();
      for (let i = 0; i < clicks; i++) click(el, 'rp-speed');
      click(el, 'rp-next'); click(el, 'rp-next');   // trin 2: skudtrinnet efter redningen
      click(el, 'rp-play');
      mock.timers.tick(ms - 1); assert.equal(step(el), 2, `${ms} ms`);
      mock.timers.tick(1); assert.equal(step(el), 3);
      click(el, 'rp-play');
    }
  } finally { clearReplays(); mock.timers.reset(); }
});

test('🎬 viser øjeblikket og efter 2600 ms / hastighed skudtrinnet og står dér (afspiller ikke videre); intet skudtrin → ingen timer; ⏭ og et nyt 🎬 rydder den ventende timer', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let { m, el } = fresh();
    replayJump(m, 3);
    assert.equal(step(el), 6);
    mock.timers.tick(2599); assert.equal(step(el), 6);
    mock.timers.tick(1); assert.equal(step(el), 7);
    assert.deepEqual([byId(el, 'rp-ball').style.left, byId(el, 'rp-ball').style.top], ['45%', '2%']);
    assert.equal(byId(el, 'rp-play').textContent, '▶ Afspil');
    mock.timers.tick(60000); assert.equal(step(el), 7, 'står på udfaldet');
    // 2×: 1300 ms
    ({ m, el } = fresh()); click(el, 'rp-speed');
    replayJump(m, 1); mock.timers.tick(1299); assert.equal(step(el), 1); mock.timers.tick(1); assert.equal(step(el), 2);
    mock.timers.tick(60000); assert.equal(step(el), 2);
    // ⏭ før tiden: timeren er væk, trinet er det, ⏭ gav
    ({ m, el } = fresh());
    replayJump(m, 1); mock.timers.tick(1000); click(el, 'rp-next'); assert.equal(step(el), 2);
    mock.timers.tick(60000); assert.equal(step(el), 2, '⏭ ryddede timeren (ellers 3)');
    // et nyt 🎬 før tiden: kun det nye spring tæller
    ({ m, el } = fresh());
    replayJump(m, 1); mock.timers.tick(1000); replayJump(m, 3); assert.equal(step(el), 6);
    mock.timers.tick(1600); assert.equal(step(el), 6, 'det gamle spring flytter ikke');
    mock.timers.tick(1000); assert.equal(step(el), 7);
    // en hændelse uden øjeblik (slutfløjtet → trin 0): ingen timer
    ({ m, el } = fresh());
    replayJump(m, 4); assert.equal(step(el), 0); mock.timers.tick(60000); assert.equal(step(el), 0);
  } finally { clearReplays(); mock.timers.reset(); }
});

// FUND (v3.16.2, rettet): play() ryddede ikke 🎬's ventende timer (kun pause() gjorde) – ▶ inden for 2600 ms efter et spring gav
// to timere, og afspilningen sprang et trin over. Nu kalder play() og ⭐ clearTimeout(r.timer) først; testen vogter det.
test('▶ lige efter 🎬: almindelig afspilning fra øjeblikket (2600 ms, så skudtrinnet 1100 ms) – ikke to timere', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { m, el } = fresh();
    replayJump(m, 1); mock.timers.tick(1000); click(el, 'rp-play');
    mock.timers.tick(2599); assert.equal(step(el), 1, 'ét trin ad gangen'); mock.timers.tick(1); assert.equal(step(el), 2);
    mock.timers.tick(1100); assert.equal(step(el), 3);
    click(el, 'rp-play');
  } finally { clearReplays(); mock.timers.reset(); }
});

test('blokeret: bolden går til den blokerer, referatet NÆVNER (idOf), også når en anden står nærmere skytten – ukendt navn → nærmeste', () => {
  // Skytten på (50, 20); a2 (40, 25) står nærmest, men teksten nævner #3 a3 (60, 30)
  const m = mo('h', 'MISS', [50, 20]);
  const ev = { type: 'MISS', label: 'Blokeret', text: '🧱 [Y] #3 a3 kaster sig ind foran afslutningen fra #9 S. Kytte (X).' };
  const idOf = (t) => ({ '#3 a3': 'a3' })[t];
  assert.deepEqual(shotEnd(m, ev, idOf), [60, 30]);
  assert.deepEqual(shotEnd(m, ev), [40, 25], 'uden idOf: nærmeste markspiller');
  assert.deepEqual(shotEnd(m, { ...ev, text: '🧱 [Y] #99 Ukendt kaster sig ind foran afslutningen.' }, idOf), [40, 25]);
});

test('over mål (QC v3.16.2): trinnet har sit eget træk – .over på bolden (vokser og toner ud); intet andet udfald får det, og det fjernes igen', () => {
  const m0 = mo('h', 'MISS', [50, 20]);
  assert.equal(shotOver(m0, miss('sender bolden over mål')), true);
  assert.equal(shotOver(m0, miss('banker bolden over overliggeren')), true);
  for (const t of ['rammer stolpen', 'skyder en meter forbi', 'skyder forbi den lange stolpe']) assert.equal(shotOver(m0, miss(t)), false, t);
  assert.equal(shotOver(m0, { type: 'MISS', label: 'Blokeret', text: '🧱 over mål' }), false);
  assert.equal(shotOver(mo('h', 'GOAL', [50, 20]), miss('sender bolden over mål')), false);
  assert.equal(shotOver(m0, null), false);
  // I afspilleren: ev 2 er nu "over mål" – trin 4 (dets skudtrin) giver bolden .over, trin 5 (grundbilledet) fjerner den
  clearReplays();
  const m = mk(); m.events = events.map((e, i) => (i === 2 ? { ...e, text: '🎯 #9 S. Kytte sender bolden over mål.' } : e));
  const el = replayEl(m, 'h'), ball = byId(el, 'rp-ball');
  for (let i = 0; i < 3; i++) click(el, 'rp-next');
  assert.equal(cls(ball, 'over'), false, 'stolpeskuddets øjeblik: ikke over');
  click(el, 'rp-next'); assert.equal(step(el), 4); assert.equal(cls(ball, 'over'), true);
  click(el, 'rp-next'); assert.equal(cls(ball, 'over'), false, 'fjernes i næste trin');
  click(el, 'rp-prev'); assert.equal(cls(ball, 'over'), true);
  click(el, 'rp-prev'); assert.equal(cls(ball, 'over'), false, 'og i øjeblikket før');
  clearReplays();
});

test('⏮ baglæns ind i et skudtrin (QC v3.16.2): brikkerne står som i øjeblikket – skytten tilbage på sin plads (40, 22) fra grundbilledets (50, 50) og markeret', () => {
  const { el } = fresh();
  for (let i = 0; i < 5; i++) click(el, 'rp-next');   // trin 5: grundbilledet t 2 – skytten på (50, 50), ingen markering
  const h9 = all(el, (x) => cls(x, 'rp-token')).find((t) => t.dataset.pid === 'h9');
  assert.deepEqual([h9.style.left, h9.style.top, cls(h9, 'actor')], ['50%', '50%', false]);
  click(el, 'rp-prev');   // trin 4: stolpeskuddets skudtrin
  assert.equal(step(el), 4);
  assert.deepEqual([h9.style.left, h9.style.top, cls(h9, 'actor')], ['40%', '17.1%', true]);   // v3.16.3-skala: 22 → 50 − 28·1,175 = 17,1
  clearReplays();
});

test('⭐ under afspilning (RM v3.16.2): afspilningen fortsætter fra det nye trin og knappen viser stadig ⏸ – ryddet timer uden ny standsede den tavst', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { el } = fresh();
    click(el, 'rp-play'); mock.timers.tick(700);   // trin 1 (redningen)
    assert.equal(step(el), 1);
    click(el, 'rp-highlights');   // højdepunkter: redningen er trin 0
    assert.equal(step(el), 0);
    assert.equal(byId(el, 'rp-play').textContent, '⏸ Pause');
    mock.timers.tick(STEP_MS.moment); assert.equal(step(el), 1, 'videre til skudtrinnet');
    mock.timers.tick(STEP_MS.shot); assert.equal(step(el), 2, 'og videre');
    click(el, 'rp-highlights');   // tilbage: samme hændelse, stadig kørende
    const at = step(el); mock.timers.tick(STEP_MS.moment); assert.ok(step(el) > at, 'kører efter frakobling');
  } finally { clearReplays(); mock.timers.reset(); }
});
