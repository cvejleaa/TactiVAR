// v3.16 Test Manager: replay.js mod en HÅNDBYGGET kamp med kendte tal og en falsk klokke. replay-ui.test.mjs læste en seedet kamp
// og tjekkede hovedlinjerne (antal brikker, at et spring viser teksten, stillingen FØR et mål); resten af afspilleren – brikkernes
// placering/skjul/markering, stillingen i hvert slags trin, ▶/⏸-teksten, trinenes varighed og hastighed, grænserne ved første og
// sidste trin, genstart, Højdepunkter, spring og oprydning – kunne ændres med grøn suite (~85 af ~100 mutationer overlevede).
// Tiden er mock.timers (STEP_MS: grundbillede 700 ms, øjeblik 2600 ms, delt med hastigheden).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.handlers = {}; this.hidden = false; this.scrolled = 0; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(k, f) { this.handlers[k] = f; }
  scrollIntoView() { this.scrolled++; }
  get id() { return this.attrs.id; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { replaySteps, stepForEvent, replayEl, replayJump, clearReplays, STEP_MS, SPEEDS } = await import('../../public/ui/replay.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const cls = (e, c) => e.className.split(' ').includes(c);
const tokens = (el) => all(el, (x) => cls(x, 'rp-token'));
const tok = (el, pid) => tokens(el).find((t) => t.dataset.pid === pid);

// Hjemme: 1 (målmand, #1), 2 (#2), 3 (#3).  Ude: 11 (#11), 12 (#12), 13 (#13).  Id'erne er strenge (som i spillet).
const ratings = {
  home: [['h1', 1, 'A. Keeper'], ['h2', 2, 'B. Back'], ['h3', 3, 'C. Spids']].map(([playerId, shirtNumber, shortName]) => ({ playerId, shirtNumber, shortName })),
  away: [['a1', 11, 'X. Keeper'], ['a2', 12, 'Y. Back'], ['a3', 13, 'Z. Spids']].map(([playerId, shirtNumber, shortName]) => ({ playerId, shirtNumber, shortName })),
};
const P = (side, pts) => pts.map(([n, x, y]) => [`${side}${n}`, x, y]);
const SHAPE = (dx = 0) => ({ h: P('h', [[1, 50, 90], [2, 30 + dx, 60], [3, 70 + dx, 40]]), a: P('a', [[1, 50, 10], [2, 32 + dx, 38], [3, 68 + dx, 61]]) });
// Fire grundbilleder (t 0–3) og fire øjeblikke: t 1 mål (hjemme: 3 scorer, 2 lægger op), t 2 redning og forbi (ude-skytte 3), t 3 mål (ude).
// I grundbillede 2 mangler hjemmespiller 3 (udvist/skadet) – han er skjult dér og tilbage i billede 3.
const trace = {
  v: 1,
  frames: [
    { t: 0, poss: null, ball: [50, 50], ...SHAPE(0) },
    { t: 1, poss: 'h', ball: [44, 50], ...SHAPE(1) },
    { t: 2, poss: 'a', lost: true, ball: [56, 50], h: SHAPE(2).h.slice(0, 2), a: SHAPE(2).a },
    { t: 3, poss: 'h', run: true, ball: [44, 50], ...SHAPE(3) },
  ],
  moments: [
    { t: 1, ev: 1, kind: 'GOAL', side: 'h', ball: [41, 22], h: P('h', [[1, 50, 90], [2, 25, 62], [3, 41, 22]]), a: P('a', [[1, 50, 10], [2, 33, 39], [3, 67, 62]]), shooter: 'h3', scorer: 'h3', assist: 'h2' },
    { t: 2, ev: 2, kind: 'SAVE', side: 'a', ball: [50, 80], h: P('h', [[1, 50, 90], [2, 34, 59]]), a: P('a', [[1, 50, 10], [2, 36, 40], [3, 62, 66]]), shooter: 'a3' },
    { t: 2, ev: 4, kind: 'MISS', side: 'a', ball: [50, 80], h: P('h', [[1, 50, 90], [2, 35, 58]]), a: P('a', [[1, 50, 10], [2, 37, 41], [3, 63, 65]]), shooter: 'a3' },
    { t: 3, ev: 5, kind: 'GOAL', side: 'a', ball: [57, 76], h: P('h', [[1, 50, 90], [2, 36, 57], [3, 74, 41]]), a: P('a', [[1, 50, 10], [2, 38, 42], [3, 57, 76]]), shooter: 'a3', scorer: 'a3', assist: null },
  ],
};
// Referatet: mål ved tick 1 (ev 1), redning (ev 2), gult kort uden øjeblik (ev 3, samme tick), forbi (ev 4), udlignende mål (ev 5).
const ev = (min, hG, aG, text, type = 'INFO') => ({ min, hG, aG, text, type });
const events = [ev(3, 0, 0, 'Kampen i gang'), ev(3, 1, 0, 'MÅL Hjemme', 'GOAL'), ev(6, 1, 0, 'REDNING', 'SAVE'), ev(6, 1, 0, 'GULT KORT', 'FOUL'), ev(6, 1, 0, 'FORBI', 'MISS'), ev(9, 1, 1, 'MÅL Ude', 'GOAL'), ev(90, 1, 1, 'SLUT', 'END')];
const mk = () => ({ homeName: 'Hjemme', awayName: 'Ude', ratings, events, trace: structuredClone(trace) });
// Trinene (fuld afspilning): 0 frame t0 · 1 frame t1 · 2 mål ev1 · 3 frame t2 · 4 redning ev2 · 5 forbi ev4 · 6 frame t3 · 7 mål ev5
const step = (el) => Number(el.dataset.step);
const cap = (el) => byId(el, 'rp-caption').textContent;
const click = (el, id) => byId(el, id).handlers.click();
const label = (el, id) => byId(el, id).textContent;
function fresh(ownSide = 'h') { clearReplays(); const m = mk(); return { m, el: replayEl(m, ownSide) }; }

test('trinene: frames i tick-orden, hvert tick efterfulgt af sine afslutninger i referatets rækkefølge; højdepunkter = kun afslutningerne; ingen spor → ingen trin', () => {
  const s = replaySteps(trace);
  assert.deepEqual(s.map((x) => `${x.kind}:${x.t}:${x.ev}`), ['frame:0:null', 'frame:1:null', 'moment:1:1', 'frame:2:null', 'moment:2:2', 'moment:2:4', 'frame:3:null', 'moment:3:5']);
  assert.deepEqual(replaySteps(trace, true).map((x) => `${x.kind}:${x.t}:${x.ev}`), ['moment:1:1', 'moment:2:2', 'moment:2:4', 'moment:3:5']);
  assert.deepEqual(replaySteps(null), []); assert.deepEqual(replaySteps(undefined, true), []);
  // Trinet bærer billedet, bolden og aktørerne
  assert.deepEqual(s[2].ball, [41, 22]); assert.deepEqual(s[2].h, trace.moments[0].h); assert.deepEqual(s[2].a, trace.moments[0].a);
  assert.deepEqual([s[2].actor, s[2].assist], ['h3', 'h2']);
  assert.deepEqual([s[4].actor, s[4].assist], ['a3', null], 'en redning: skytten er aktør, intet oplæg');
  assert.deepEqual([s[7].actor, s[7].assist], ['a3', null]);
  assert.deepEqual(s[1].ball, [44, 50]); assert.deepEqual(s[1].h, trace.frames[1].h);
});

test('stepForEvent: hændelsens eget øjeblik; ellers grundbilledet i dens tick (ikke dets første afslutning); rundes til nærmeste tick; i højdepunkter første afslutning i ticket eller trin 0', () => {
  const s = replaySteps(trace), hl = replaySteps(trace, true);
  assert.equal(stepForEvent(s, events, 1), 2); assert.equal(stepForEvent(s, events, 4), 5); assert.equal(stepForEvent(s, events, 5), 7);
  assert.equal(stepForEvent(s, events, 3), 3, 'gult kort (min 6, tick 2) → grundbilledet t2, ikke redningen');
  assert.equal(stepForEvent(s, events, 0), 1, 'min 3 → tick 1');
  assert.equal(stepForEvent(s, events, 6), 0, 'min 90 (tick 30) findes ikke i denne lille kamp → trin 0, ikke −1');
  assert.equal(stepForEvent(s, events, 99), 0, 'ukendt hændelse');
  // Højdepunkter: ingen grundbilleder – første trin i ticket, ellers 0
  assert.equal(stepForEvent(hl, events, 3), 1, 'gult kort i tick 2 → første afslutning i tick 2');
  assert.equal(stepForEvent(hl, events, 6), 0);
  assert.equal(stepForEvent(hl, events, 0), 0);
  // Afrunding: min 4 → tick 1 (1,33), min 5 → tick 2 (1,67) – ikke gulv/loft
  const ev2 = [{ min: 4 }, { min: 5 }], frames = replaySteps({ frames: trace.frames, moments: [] });
  assert.equal(stepForEvent(frames, ev2, 0), 1); assert.equal(stepForEvent(frames, ev2, 1), 2);
});

test('første billede: hold og bold på deres pladser (x → left, y → top), kortet har titel og antal billeder, stillingen er 0-0 ved afspark', () => {
  const { el } = fresh('h');
  assert.equal(el.id, 'replay');
  assert.equal(step(el), 0);
  assert.equal(cap(el), "0' · Hjemme 0-0 Ude");
  assert.match(el.children[0].textContent, /^🎬 Afspilning – taktiktavle ud fra 4 øjebliksbilleder \(hvert 3\. minut\) og afslutningerne i åbent spil \(dødbolde – straffe, frispark, hjørnespark – har intet billede\)\. Hjemme angriber opad\.$/);
  const ball = byId(el, 'rp-ball');
  assert.deepEqual([ball.style.left, ball.style.top], ['50%', '50%']);
  assert.equal(tokens(el).length, 6);
  const t = tok(el, 'h2'), u = tok(el, 'a3');
  assert.deepEqual([t.style.left, t.style.top, t.textContent], ['30%', '60%', '2']);
  assert.deepEqual([u.style.left, u.style.top, u.textContent], ['68%', '61%', '13']);
  assert.equal(t.attrs.title, '#2 B. Back (Hjemme)'); assert.equal(u.attrs.title, '#13 Z. Spids (Ude)');
  assert.ok(tokens(el).every((x) => !x.hidden));
  // antallet i overskriften er billederne (ikke afslutningerne): 2 billeder og 1 afslutning
  clearReplays();
  const small = { ...mk(), trace: { v: 1, frames: trace.frames.slice(0, 2), moments: [trace.moments[0]] } };
  assert.match(replayEl(small, 'h').children[0].textContent, /taktiktavle ud fra 2 øjebliksbilleder/);
  assert.ok(cls(t, 'home') && !cls(t, 'away') && cls(u, 'away') && !cls(u, 'home'));
});

test('dit hold markeres: hjemme → hjemmebrikkerne har "own", ude → udebrikkerne, ellers ingen', () => {
  for (const [side, homeOwn, awayOwn] of [['h', true, false], ['a', false, true], [null, false, false]]) {
    const { el } = fresh(side);
    assert.equal(tokens(el).filter((x) => cls(x, 'home')).every((x) => cls(x, 'own') === homeOwn), true, `${side} hjemme`);
    assert.equal(tokens(el).filter((x) => cls(x, 'away')).every((x) => cls(x, 'own') === awayOwn), true, `${side} ude`);
  }
});

test('trin frem og tilbage: bolden og brikkerne følger trinet; stillingen i et grundbillede er FØR tickets hændelser og teksten siger duellens udfald (har bolden / erobrer – det ANDET hold / spiller sig frem), et øjeblik viser sin egen linje; grænserne holder', () => {
  const { el } = fresh('h');
  // v3.16.1: grundbilledets tekst siger, hvordan duellen gik – t 2 er udeholdets tick, men hjemme erobrer (lost), t 3 slipper
  // hjemmes angriber igennem (run); afsparket (ingen besiddelse) har ingen duel-tekst.
  const want = ["0' · Hjemme 0-0 Ude", "3' · Hjemme 0-0 Ude · Hjemme har bolden", "3' · Hjemme 1-0 Ude · MÅL Hjemme", "6' · Hjemme 1-0 Ude · Hjemme erobrer bolden", "6' · Hjemme 1-0 Ude · REDNING", "6' · Hjemme 1-0 Ude · FORBI", "9' · Hjemme 1-0 Ude · Hjemme spiller sig frem til angriberen", "9' · Hjemme 1-1 Ude · MÅL Ude"];
  for (let i = 0; i < 8; i++) { assert.equal(step(el), i); assert.equal(cap(el), want[i], `trin ${i}`); if (i < 7) click(el, 'rp-next'); }
  click(el, 'rp-next'); assert.equal(step(el), 7, 'ikke forbi sidste trin'); assert.equal(cap(el), want[7]);
  click(el, 'rp-prev'); assert.equal(step(el), 6); assert.equal(cap(el), want[6]);
  for (let i = 0; i < 9; i++) click(el, 'rp-prev');
  assert.equal(step(el), 0, 'ikke før første trin'); assert.equal(cap(el), want[0]);
  // bolden og brikkerne
  click(el, 'rp-next'); click(el, 'rp-next');   // mål, trin 2
  const ball = byId(el, 'rp-ball');
  assert.deepEqual([ball.style.left, ball.style.top], ['41%', '22%']);
  assert.deepEqual([tok(el, 'h3').style.left, tok(el, 'h3').style.top, tok(el, 'a2').style.left, tok(el, 'a2').style.top], ['41%', '22%', '33%', '39%']);
});

test('markeringer: aktøren og oplægsgiveren markeres i øjeblikket og kun dér; billedtekstens "moment"-klasse følger trinnets slags', () => {
  const { el } = fresh('h');
  const marked = () => tokens(el).filter((x) => !x.hidden && (cls(x, 'actor') || cls(x, 'assist'))).map((x) => `${x.dataset.pid}:${cls(x, 'actor') ? 'actor' : 'assist'}`).sort();
  assert.deepEqual(marked(), []); assert.equal(cls(byId(el, 'rp-caption'), 'moment'), false);
  click(el, 'rp-next'); click(el, 'rp-next');
  assert.deepEqual(marked(), ['h2:assist', 'h3:actor']); assert.equal(cls(byId(el, 'rp-caption'), 'moment'), true);
  click(el, 'rp-next');   // grundbillede t2
  assert.deepEqual(marked(), [], 'markeringerne fjernes igen'); assert.equal(cls(byId(el, 'rp-caption'), 'moment'), false);
  click(el, 'rp-next');   // redningen: kun aktøren
  assert.deepEqual(marked(), ['a3:actor']);
});

test('brikker der ikke er på banen i trinet skjules og vises igen, når de er tilbage; ukendte spillere får "?"', () => {
  const { el } = fresh('h');
  assert.equal(tok(el, 'h3').hidden, false);
  for (let i = 0; i < 3; i++) click(el, 'rp-next');   // grundbillede t2 uden hjemmespiller 3
  assert.equal(tok(el, 'h3').hidden, true, 'h3 er ude af billedet');
  assert.equal(tokens(el).filter((x) => !x.hidden).length, 5);
  for (let i = 0; i < 3; i++) click(el, 'rp-next');   // grundbillede t3: h3 er tilbage
  assert.equal(step(el), 6); assert.equal(tok(el, 'h3').hidden, false);
  // en spiller uden række i karakterarket
  clearReplays();
  const m = mk(); m.trace.frames[0].h.push(['h99', 10, 10]);
  const e2 = replayEl(m, 'h');
  const unknown = tok(e2, 'h99');
  assert.equal(unknown.textContent, '?'); assert.ok(!unknown.attrs.title);
});

test('▶ Afspil: knappen skifter til ⏸ Pause, et grundbillede varer 700 ms og et øjeblik 2600 ms; ⏸ stopper; slutningen stopper og ▶ starter forfra', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { el } = fresh('h');
    assert.deepEqual([STEP_MS.frame, STEP_MS.moment], [700, 2600]);
    assert.equal(label(el, 'rp-play'), '▶ Afspil');
    click(el, 'rp-play');
    assert.equal(label(el, 'rp-play'), '⏸ Pause');
    mock.timers.tick(699); assert.equal(step(el), 0, 'grundbillede 0 varer 700 ms');
    mock.timers.tick(1); assert.equal(step(el), 1);
    mock.timers.tick(700); assert.equal(step(el), 2, 'grundbillede t1 varer 700 ms');
    mock.timers.tick(2599); assert.equal(step(el), 2, 'et øjeblik varer 2600 ms');
    mock.timers.tick(1); assert.equal(step(el), 3);
    // Pause: afspilningen står, og knappen kan starte den igen (spilleren er ikke "sat fast" i spiller-tilstand)
    click(el, 'rp-play'); assert.equal(label(el, 'rp-play'), '▶ Afspil');
    mock.timers.tick(10000); assert.equal(step(el), 3, 'pausen holder');
    click(el, 'rp-play'); assert.equal(label(el, 'rp-play'), '⏸ Pause');
    mock.timers.tick(700); assert.equal(step(el), 4);
    // Til slut: sidste trin stopper afspilningen
    mock.timers.tick(2600); assert.equal(step(el), 5); mock.timers.tick(2600); assert.equal(step(el), 6); mock.timers.tick(700); assert.equal(step(el), 7);
    mock.timers.tick(2600); assert.equal(step(el), 7, 'bliver på sidste trin');
    assert.equal(label(el, 'rp-play'), '▶ Afspil', 'stoppet ved slutningen');
    // ▶ ved sidste trin starter forfra
    click(el, 'rp-play'); assert.equal(step(el), 0); assert.equal(label(el, 'rp-play'), '⏸ Pause');
    mock.timers.tick(700); assert.equal(step(el), 1);
    click(el, 'rp-play');
  } finally { clearReplays(); mock.timers.reset(); }
});

test('hastighed: 1× → 2× → 4× → 1× (teksten følger), og trinene varer 700/speed og 2600/speed', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    assert.deepEqual(SPEEDS, [1, 2, 4]);
    const { el } = fresh('h');
    assert.equal(label(el, 'rp-speed'), '1×');
    click(el, 'rp-speed'); assert.equal(label(el, 'rp-speed'), '2×');
    click(el, 'rp-speed'); assert.equal(label(el, 'rp-speed'), '4×');
    click(el, 'rp-speed'); assert.equal(label(el, 'rp-speed'), '1×');
    click(el, 'rp-speed');   // 2×
    click(el, 'rp-play');
    mock.timers.tick(349); assert.equal(step(el), 0); mock.timers.tick(1); assert.equal(step(el), 1, 'grundbillede ved 2×: 350 ms');
    mock.timers.tick(350); assert.equal(step(el), 2);
    mock.timers.tick(1299); assert.equal(step(el), 2); mock.timers.tick(1); assert.equal(step(el), 3, 'øjeblik ved 2×: 1300 ms');
    click(el, 'rp-speed');   // 4×, midt i afspilningen: gælder fra næste trin
    mock.timers.tick(350); assert.equal(step(el), 4, 'det igangværende trin (350 ms ved 2×) afsluttes');
    mock.timers.tick(649); assert.equal(step(el), 4); mock.timers.tick(1); assert.equal(step(el), 5, 'øjeblik ved 4×: 650 ms');
    click(el, 'rp-play');
  } finally { clearReplays(); mock.timers.reset(); }
});

test('⏮/⏭ under afspilning standser den (og timeren), så trinet ikke løber videre', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    for (const [btn, to] of [['rp-next', 1], ['rp-prev', 0]]) {
      const { el } = fresh('h');
      click(el, 'rp-play');
      if (btn === 'rp-prev') { mock.timers.tick(700); }
      click(el, btn);
      assert.equal(label(el, 'rp-play'), '▶ Afspil', btn);
      assert.equal(step(el), to);
      mock.timers.tick(20000); assert.equal(step(el), to, `${btn}: timeren er stoppet`);
    }
  } finally { clearReplays(); mock.timers.reset(); }
});

test('⭐ Højdepunkter: kun afslutningerne; trinnet bevares (samme hændelse) ved til- og frakobling; stillingen/teksten er afslutningens; knappen markeres; varigheden er øjeblikkets', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { el } = fresh('h');
    click(el, 'rp-next'); click(el, 'rp-next'); click(el, 'rp-next'); click(el, 'rp-next');   // trin 4: redningen (ev 2)
    assert.equal(cls(byId(el, 'rp-highlights'), 'active'), false);
    click(el, 'rp-highlights');
    assert.equal(cls(byId(el, 'rp-highlights'), 'active'), true);
    assert.equal(step(el), 1, 'redningen er afslutning nr. 2 af 4'); assert.equal(cap(el), "6' · Hjemme 1-0 Ude · REDNING");
    click(el, 'rp-next'); click(el, 'rp-next'); click(el, 'rp-next'); assert.equal(step(el), 3, '4 trin i alt'); assert.equal(cap(el), "9' · Hjemme 1-1 Ude · MÅL Ude");
    click(el, 'rp-prev'); click(el, 'rp-prev'); assert.equal(step(el), 1);
    click(el, 'rp-highlights');   // tilbage til alle trin – samme hændelse (ev 2 = trin 4)
    assert.equal(cls(byId(el, 'rp-highlights'), 'active'), false);
    assert.equal(step(el), 4); assert.equal(cap(el), "6' · Hjemme 1-0 Ude · REDNING");
    // Fra et grundbillede (ingen hændelse) starter højdepunkterne forfra
    click(el, 'rp-prev'); click(el, 'rp-prev');
    click(el, 'rp-next'); assert.equal(step(el), 3, 'trin 4 → to tilbage = 2 (målet) → ét frem = 3 (grundbilledet t2)');
    click(el, 'rp-highlights'); assert.equal(step(el), 0, 'fra et grundbillede → første afslutning');
    // Afspilning i højdepunkter: kun øjeblikke (2600 ms hver)
    click(el, 'rp-play'); mock.timers.tick(2599); assert.equal(step(el), 0); mock.timers.tick(1); assert.equal(step(el), 1);
    click(el, 'rp-play');
  } finally { clearReplays(); mock.timers.reset(); }
});

test('🎬-spring (replayJump): går til hændelsens trin, standser afspilningen, slår højdepunkter fra, ruller til afspilleren – og gør intet for en kamp uden afspiller', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { m, el } = fresh('h');
    click(el, 'rp-highlights'); click(el, 'rp-play');
    replayJump(m, 4);   // forbi (ev 4) → trin 5 i fuld afspilning
    assert.equal(cls(byId(el, 'rp-highlights'), 'active'), false, 'højdepunkter slået fra');
    assert.equal(step(el), 5); assert.equal(cap(el), "6' · Hjemme 1-0 Ude · FORBI");
    assert.equal(label(el, 'rp-play'), '▶ Afspil', 'standset');
    click(el, 'rp-highlights');   // højdepunkterne er virkelig slået fra: ét klik slår dem til igen (ikke to)
    assert.equal(cls(byId(el, 'rp-highlights'), 'active'), true); assert.equal(step(el), 2, 'forbi (ev 4) er afslutning nr. 3 af 4'); click(el, 'rp-highlights');
    mock.timers.tick(20000); assert.equal(step(el), 5, 'timeren er stoppet');
    assert.equal(el.scrolled, 1, 'ruller til afspilleren');
    replayJump(m, 3); assert.equal(step(el), 3, 'gult kort → grundbilledet i dets tick'); assert.equal(el.scrolled, 2);
    // Skal ikke kaste: kamp uden spor, uden kamp, og et spor der aldrig er tegnet
    replayJump({ ...m, trace: undefined }, 1); replayJump(undefined, 1); replayJump({ trace: { frames: [], moments: [] }, events }, 1);
    assert.equal(step(el), 3);
  } finally { clearReplays(); mock.timers.reset(); }
});

test('ét afspilningselement pr. kamp (nøgle: sporet): samme kamp → samme element; en anden kamp → et nyt; clearReplays nulstiller cachen og standser timere', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    clearReplays();
    const m = mk(), m2 = mk();
    const el = replayEl(m, 'h');
    assert.equal(replayEl(m, 'h'), el, 'samme spor → samme element');
    assert.notEqual(replayEl(m2, 'h'), el, 'en anden kamps spor → et andet element');
    click(el, 'rp-next');
    assert.equal(step(replayEl(m, 'h')), 1, 'tilstanden bevares');
    click(el, 'rp-play'); assert.equal(label(el, 'rp-play'), '⏸ Pause');
    clearReplays();
    mock.timers.tick(20000);
    assert.equal(step(el), 1, 'timeren er stoppet af clearReplays');
    const again = replayEl(m, 'h');
    assert.notEqual(again, el, 'nyt element efter clearReplays');
    assert.equal(step(again), 0);
  } finally { clearReplays(); mock.timers.reset(); }
});

test('kamp uden spor (før v3.16): en tekst i stedet for en afspiller; et tomt spor kaster ikke', () => {
  clearReplays();
  const old = replayEl({ ...mk(), trace: undefined }, 'h');
  assert.equal(old.id, 'replay'); assert.match(old.textContent, /^🎬 Ingen afspilning – kampen er spillet før v3\.16/);
  assert.equal(byId(old, 'rp-pitch'), undefined);
  const empty = replayEl({ ...mk(), trace: { v: 1, frames: [], moments: [] } }, 'h');
  assert.ok(byId(empty, 'rp-pitch'));
  assert.doesNotThrow(() => { click(empty, 'rp-next'); click(empty, 'rp-prev'); click(empty, 'rp-highlights'); });
  assert.equal(empty.dataset.step, undefined, 'ingen trin at vise');
});

test('duellens tekst (v3.16.1): alle fire udfald for begge hold – erobringen nævner det hold, der IKKE havde tick\'et', async () => {
  const { duelText } = await import('../../public/ui/replay.js');
  const m = { homeName: 'Hjemme', awayName: 'Ude' };
  assert.equal(duelText({ poss: 'a', duel: 'ball' }, m), ' · Ude har bolden');
  assert.equal(duelText({ poss: 'a', duel: 'lost' }, m), ' · Hjemme erobrer bolden');
  assert.equal(duelText({ poss: 'h', duel: 'lost' }, m), ' · Ude erobrer bolden');
  assert.equal(duelText({ poss: 'h', duel: 'offside' }, m), ' · Hjemme: fanget offside');
  assert.equal(duelText({ poss: 'a', duel: 'run' }, m), ' · Ude spiller sig frem til angriberen');
  assert.equal(duelText({ poss: null, duel: null }, m), '');
});
