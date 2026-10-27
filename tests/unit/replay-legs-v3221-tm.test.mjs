// v3.16: 2D-afspilningen og heat map'et i Match Center (public/ui/replay.js, public/engine/heatmap.js, matchcenter.js)
// mod et minimalt DOM: trinene følger sporet, et spring fra referatet rammer hændelsens øjeblik, stillingen i et
// grundbillede er fra FØR tick'ets hændelser, afspilningen findes kun efter slutfløjt, gamle kampe uden spor viser en tekst,
// og modstanderen får kun tredjedele (ingen enkeltspillere).
// Test Manager v3.22.1: benene i show() (replay.js) bevist uden browser – pass → recv → shot, timerne og deres oprydning.
// e2e-checken "afleveringen før afslutningen" har en else-gren, der er grøn uden data (kampen er tilfældig pr. kørsel – set i 1 af 5
// kørsler), og dræber hverken recv-benet, timer-forsinkelserne eller timer-oprydningen. Her: faste seeds og en styret klokke.
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
const { replaySteps, replayEl, replayJump, clearReplays, STEP_MS } = await import('../../public/ui/replay.js');

// Styret klokke: setTimeout lægger i en kø; intet kører, før testen siger det
let queue = [];
globalThis.setTimeout = (fn, ms) => { const t = { fn, ms, dead: false }; queue.push(t); return t; };
globalThis.clearTimeout = (t) => { if (t) t.dead = true; };
const live = () => queue.filter((t) => !t.dead);
const fire = (t) => { t.dead = true; t.fn(); };

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const tokenOf = (el, pid) => all(el, (e) => e.className.includes('rp-token') && e.dataset.pid === pid)[0];
const pos = (e) => [e.style.left, e.style.top].join('/');
const match = (s) => { const L = createLeague(createRng(s)); return simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31)); };

// Finder et mål/redning/forbi med oplægger (med eller uden recv), og viser øjeblikkets trin
function open(wantRecv, wantAir = false) {
  for (let s = 1; s < 200; s++) {
    const m = match(s), o = m.trace.moments.find((x) => x.from && !!x.recv === wantRecv && !!x.air === wantAir && ['GOAL', 'HEADER_GOAL', 'SAVE', 'MISS'].includes(x.kind));
    if (!o) continue;
    clearReplays(); queue = [];
    const el = replayEl(m, o.side);
    replayJump(m, o.ev);
    byId(el, 'rp-next').handlers.click(); byId(el, 'rp-prev').handlers.click();   // pause() fjerner springets egen timer; så står vi på øjeblikkets trin med friske ben
    const st = replaySteps(m.trace, false, m.events), idx = st.findIndex((x) => x.kind === 'moment' && x.ev === o.ev);
    assert.equal(Number(el.dataset.step), idx, 'står på øjeblikkets trin');
    return { m, o, el, ball: byId(el, 'rp-ball'), sh: tokenOf(el, o.scorer ?? o.shooter), fr: tokenOf(el, o.from) };
  }
  assert.fail('data: intet øjeblik med oplægger' + (wantRecv ? ' og recv' : ' uden recv'));
}

test('benene med recv: pass (bolden hos oplæggeren) → recv (bolden hos skytten på linjen) → shot (begge ved afslutningen); to timere, ingen 0', () => {
  const { el, ball, sh, fr } = open(true);
  assert.equal(el.dataset.leg, 'pass');
  assert.equal(pos(ball), pos(fr), 'pass: bolden ligger hos oplæggeren');
  const d = STEP_MS.moment, [t1] = live();
  assert.equal(live().length, 1);
  assert.ok(t1.ms > 0 && t1.ms < d, 'første ben efter ' + t1.ms + ' ms af ' + d);
  const atRecv = pos(sh);
  assert.notEqual(atRecv, pos(fr));
  fire(t1);
  assert.equal(el.dataset.leg, 'recv');
  assert.equal(pos(ball), atRecv, 'recv: bolden ligger hos skytten, som står på linjen');
  assert.equal(pos(sh), atRecv);
  const [t2] = live();
  assert.equal(live().length, 1);
  assert.ok(t2.ms > 0 && t1.ms + t2.ms < d, 'andet ben efter ' + t2.ms + ' ms (+ ' + t1.ms + ') af ' + d);
  fire(t2);
  assert.equal(el.dataset.leg, 'shot');
  assert.notEqual(pos(sh), atRecv, 'skytten løb ind');
  assert.equal(pos(ball), pos(sh), 'shot: bolden følger skytten ind');
  assert.equal(live().length, 0);
});

test('benene uden recv (skytten står allerede onside): pass → shot, skytten flyttes ikke', () => {
  const { el, ball, sh, fr } = open(false);
  assert.equal(el.dataset.leg, 'pass');
  assert.equal(pos(ball), pos(fr));
  const before = pos(sh), [t] = live();
  assert.equal(live().length, 1);
  assert.ok(t.ms > 0 && t.ms < STEP_MS.moment);
  fire(t);
  assert.equal(el.dataset.leg, 'shot');
  assert.equal(pos(sh), before, 'skytten stod allerede på sin plads');
  assert.equal(pos(ball), pos(sh));
});

test('et nyt trin rydder benenes timer og dataset.leg – ellers flytter en gammel timer bolden i det næste billede', () => {
  const { el } = open(true);
  const pending = live()[0];
  byId(el, 'rp-next').handlers.click();   // pause() + show() af næste trin (skudtrinnet)
  assert.equal(pending.dead, true, 'timeren er ryddet');
});

test('et grundbillede (intet øjeblik) har ingen ben', () => {
  const { el, m } = open(true);
  const st = replaySteps(m.trace, false, m.events);
  while (st[Number(el.dataset.step)].kind !== 'frame') byId(el, 'rp-prev').handlers.click();   // tilbage til et grundbillede
  assert.equal(el.dataset.leg, '', 'leg nulstillet i et grundbillede');
  assert.equal(live().length, 0);
});

// v3.22.1 (QC): et indlæg, en lang bold eller et hovedstød går i luften fra oplæggeren direkte til afslutningen – ingen jordaflevering
// til skytten på linjen først; skytten løber ind fra linjen samtidig.
test('luftbold (air) med recv: pass (skytten på linjen) → shot direkte – intet recv-ben for bolden', () => {
  const { el, ball, sh, fr, o } = open(true, true);
  assert.ok(o.air && o.recv, 'data: et indlæg med recv');
  assert.equal(el.dataset.leg, 'pass'); assert.equal(pos(ball), pos(fr));
  const atRecv = pos(sh), [t] = live();
  assert.equal(live().length, 1);
  fire(t);
  assert.equal(el.dataset.leg, 'shot', 'direkte til afslutningen');
  assert.notEqual(pos(sh), atRecv, 'skytten løb ind fra linjen'); assert.equal(pos(ball), pos(sh));
  assert.equal(live().length, 0);
});
