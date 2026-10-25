// v3.16.2 Test Manager: huller fundet ved mutation af skudtrinnet (public/ui/replay.js shotEnd, replaySteps, replayEl/r.jump).
// Forfatterens replay-shot.test.mjs bygger alle øjeblikke i hånden med få, pæne
// koordinater og afspiller kun redning/stolpe/mål – så (1) "nærmest" kunne måles på én akse eller fra et andet punkt, (2) idOf/events
// kunne tabes på vejen fra replayEl til replaySteps i ⭐ og 🎬 (kun direkte replaySteps-kald var testet), (3) ⭐ ryddede ikke 🎬's
// timer, og (4) ⏮ lander på skudtrinnet med næste tick's brikker (FUND, rettet i baac8f9). Hver test nævner, hvad den dræber.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
const { shotEnd, replaySteps, replayEl, replayJump, clearReplays } = await import('../../public/ui/replay.js');
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const cls = (e, c) => e.className.split(' ').includes(c);
const step = (el) => Number(el.dataset.step);
const click = (el, id) => byId(el, id).handlers.click();
const ballAt = (el) => [byId(el, 'rp-ball').style.left, byId(el, 'rp-ball').style.top];
const tok = (el, pid) => all(el, (e) => e.dataset.pid === pid)[0];

const mo = (side, kind, ball, def, own = [['h9', ...ball]]) => ({ side, kind, ball, h: side === 'h' ? own : def, a: side === 'h' ? def : own });
const miss = (label, text) => ({ type: 'MISS', label, text });

// ---------- nærmest: afstanden er den euklidiske, målt til målets midte (50, linje 0) og til skytten ----------
test('målmanden er den NÆRMESTE ved afstand (ikke kun y eller kun x), målt mod (50, linje 0): keeper (50, 10) mod en back på målstregen (20, 6) og en midtstopper (52, 3) – dræber nærmest-på-y, nærmest-på-x og et forkert målpunkt (x 40)', () => {
  // til (50, 0): keeper 10, back (20, 6) 30,6, stopper (52, 3) 3,6 → hypot vælger stopperen; kun y ville vælge ham også (3 < 6 < 10),
  // så keeper-testen bruger en back, der står tættere i y end keeperen men langt væk i x:
  assert.deepEqual(shotEnd(mo('h', 'SAVE', [45, 20], [['a1', 50, 10], ['a2', 20, 6]])), [50, 10], 'y alene ville give (20, 6)');
  // x alene: keeper (50, 10) og en stopper (52, 3) – hypot: stopperen (3,6 mod 10); x alene: keeperen (0 mod 2)
  assert.deepEqual(shotEnd(mo('h', 'SAVE', [45, 20], [['a1', 50, 10], ['a2', 52, 3]])), [52, 3], 'x alene ville give (50, 10)');
  // målpunktet er x 50: keeper (50, 10) mod en spiller (41, 9) – fra (50, 0) er keeperen nærmest (10 mod 12,7), fra (40, 0) ville (41, 9) være det (9,1 mod 14,1)
  assert.deepEqual(shotEnd(mo('h', 'SAVE', [45, 20], [['a1', 50, 10], ['a2', 41, 9]])), [50, 10]);
  assert.deepEqual(shotEnd(mo('a', 'SAVE', [45, 80], [['h1', 50, 90], ['h2', 41, 91]])), [50, 90]);
});

test('lige afstand: den FØRSTE i forsvarets liste vinder (målmand og blokerer) – dræber < → <=', () => {
  // keeper: (45, 10) og (55, 10) er begge 11,18 fra (50, 0)
  assert.deepEqual(shotEnd(mo('h', 'SAVE', [45, 20], [['a1', 45, 10], ['a2', 55, 10]])), [45, 10]);
  assert.deepEqual(shotEnd(mo('h', 'SAVE', [45, 20], [['a2', 55, 10], ['a1', 45, 10]])), [55, 10]);
  // blokerer (uden navn): to markspillere 10 fra skytten (50, 30): (40, 30) og (60, 30), keeper (50, 5) står i målet
  const blok = miss('Blokeret', '🧱 [Y] #4 B. Lokker kaster sig ind foran afslutningen fra #9 S. Kytte (X).');
  assert.deepEqual(shotEnd(mo('h', 'MISS', [50, 30], [['a1', 50, 5], ['a2', 40, 30], ['a3', 60, 30]]), blok), [40, 30]);
  assert.deepEqual(shotEnd(mo('h', 'MISS', [50, 30], [['a1', 50, 5], ['a3', 60, 30], ['a2', 40, 30]]), blok), [60, 30]);
});

test('blokeret uden navn: markspilleren nærmest skytten ved EUKLIDISK afstand (x alene: (50, 40) 0 væk i x men 20 i y; y alene: (30, 20) 0 i y men 20 i x) – dræber nærmest-på-x og -på-y', () => {
  const blok = miss('Blokeret', '🧱 [Y] #4 B. Lokker kaster sig ind foran afslutningen.');
  const ud = (field) => shotEnd(mo('h', 'MISS', [50, 20], [['a1', 50, 8], ...field]), blok);
  assert.deepEqual(ud([['a2', 50, 40], ['a3', 45, 22]]), [45, 22], 'x alene ville give (50, 40)');
  assert.deepEqual(ud([['a2', 30, 20], ['a3', 52, 26]]), [52, 26], 'y alene ville give (30, 20)');
});

test('blokeret: label \'Blokeret\' alene afgør (teksten kan mangle "kaster sig ind") – nærmeste markspiller; dræber label→tekst', () => {
  const m = mo('h', 'MISS', [58, 33], [['a1', 50, 10], ['a2', 40, 25], ['a3', 60, 30]]);
  assert.deepEqual(shotEnd(m, miss('Blokeret', '🧱 en blokering')), [60, 30]);
  assert.deepEqual(shotEnd(m, miss('Forbi', '🧱 [Y] #3 a3 kaster sig ind foran afslutningen')), [38, 2], 'tekst uden label er forbi');
});

test('mål: "skyttens side" er set fra MÅLMANDEN (hans x), ikke fra midten – skytte x 48 med keeper x 47 er til højre for ham (52), ikke til venstre (dræber < 50 i stedet for < keeper)', () => {
  assert.deepEqual(shotEnd(mo('h', 'GOAL', [48, 20], [['a1', 47, 9], ['a2', 40, 25]])), [52, 2]);
  assert.deepEqual(shotEnd(mo('h', 'GOAL', [52, 20], [['a1', 53, 9], ['a2', 40, 25]])), [48, 2]);
  assert.deepEqual(shotEnd(mo('a', 'HEADER_GOAL', [52, 80], [['h1', 53, 91], ['h2', 40, 75]])), [48, 98]);
});

// ---------- ledningen i afspilleren: idOf og referatet skal frem til replaySteps i HVER vej (start, ⭐, 🎬) ----------
const AWAY = [['a1', 50, 10], ['a2', 40, 25], ['a3', 60, 30]];
const ratings = { home: [{ playerId: 'h9', shirtNumber: 9, shortName: 'S. Kytte' }], away: AWAY.map(([playerId], i) => ({ playerId, shirtNumber: i + 1, shortName: playerId })) };
const ev = (min, hG, aG, text, type = 'INFO', label) => ({ min, hG, aG, text, type, label });
// ev1: blokeret af #3 a3 (60, 30) – a2 (40, 25) står nærmere skytten (50, 20); ev2: stolpen fra venstre → (44, 1)
const events = [ev(0, 0, 0, 'Kampen i gang'),
  ev(3, 0, 0, '🧱 [Y] #3 a3 kaster sig ind foran afslutningen fra #9 S. Kytte (X).', 'MISS', 'Blokeret'),
  ev(3, 0, 0, '🎯 [X] #9 S. Kytte rammer stolpen.', 'MISS', 'Forbi'), ev(90, 0, 0, 'SLUT', 'END')];
const F = (t) => ({ t, poss: 'h', ball: [50, 50], h: [['h9', 50, 50]], a: AWAY });
const mk = () => ({ homeName: 'Hjemme', awayName: 'Ude', ratings, events, trace: { v: 1, frames: [F(1), F(2)], moments: [
  { t: 1, ev: 1, shooter: 'h9', ...mo('h', 'MISS', [50, 20], AWAY) }, { t: 1, ev: 2, shooter: 'h9', ...mo('h', 'MISS', [40, 22], AWAY) }] } });
// Trinene (fuld): 0 frame t1 · 1 blokeret · 2 skud → (60, 30) · 3 stolpe · 4 skud → (44, 1) · 5 frame t2.  Højdepunkter: 0 · 1 skud · 2 · 3 skud
const fresh = () => { clearReplays(); const m = mk(); return { m, el: replayEl(m, 'h') }; };
// v3.16.3: blokeringens ende er blokerens plads (endPlayer) og tegnes som brikkerne: (60, 30) → top 50 − 20·1,175 = 26,5;
// stolpen (44, 3) er et mållinje-punkt og skaleres ikke. Brikkerne: (40, 22) → 17,1; (50, 50) → 50.

test('ledningen: blokeringen er den NAVNGIVNE (a3, ikke nærmeste a2) og stolpen på stolpen – i grundafspilningen, efter ⭐ og efter 🎬 – dræber tabt idOf/referat i replayEl, ⭐-knappen og r.jump', () => {
  let { m, el } = fresh();
  for (let i = 0; i < 2; i++) click(el, 'rp-next');
  assert.deepEqual(ballAt(el), ['60%', '26.5%'], 'start: idOf');
  for (let i = 0; i < 2; i++) click(el, 'rp-next');
  assert.deepEqual(ballAt(el), ['44%', '3%'], 'start: referatet (stolpen)');
  // ⭐ fra første trin: højdepunkterne er byggede igen, med referat og idOf
  ({ m, el } = fresh()); click(el, 'rp-highlights');
  click(el, 'rp-next'); assert.equal(step(el), 1, 'højdepunkter: 0 blokeringen, 1 dens skudtrin');
  assert.deepEqual(ballAt(el), ['60%', '26.5%'], '⭐: idOf'); click(el, 'rp-next'); click(el, 'rp-next');
  assert.deepEqual(ballAt(el), ['44%', '3%'], '⭐: referatet');
  // 🎬 mens ⭐ er til: højdepunkterne slås fra og fuld afspilning bygges igen – med referat og idOf
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    ({ m, el } = fresh()); click(el, 'rp-highlights');
    replayJump(m, 1); assert.equal(step(el), 1, 'fuld afspilning igen'); mock.timers.tick(2600);
    assert.equal(step(el), 2); assert.deepEqual(ballAt(el), ['60%', '26.5%'], '🎬: idOf');
    replayJump(m, 2); mock.timers.tick(2600);
    assert.equal(step(el), 4); assert.deepEqual(ballAt(el), ['44%', '3%'], '🎬: referatet');
  } finally { clearReplays(); mock.timers.reset(); }
});

test('⭐ rydder 🎬\'s ventende timer: efter 🎬 og ⭐ inden 2600 ms står afspilleren, hvor ⭐ satte den – dræber clearTimeout i ⭐-knappen', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { m, el } = fresh();
    replayJump(m, 1); assert.equal(step(el), 1); mock.timers.tick(1000);
    click(el, 'rp-highlights'); assert.equal(step(el), 0, 'højdepunkter: blokeringen er trin 0');
    mock.timers.tick(60000); assert.equal(step(el), 0, 'den gamle timer flyttede ikke trinet (ellers 1)');
  } finally { clearReplays(); mock.timers.reset(); }
});

// FUND: skudtrinnet tegner kun bolden. Går man ⏮ fra grundbilledet efter, lander man på skudtrinnet med BRIKKERNE fra grundbilledet
// (næste tick) – skytten stod midt på banen, mens bolden var i nettet. Rettet: show() tegner brikkerne i skudtrinnet (baac8f9).
test('⏮ fra grundbilledet lander på skudtrinnet med øjeblikkets brikker (skytten h9 ved (40, 22), ikke ved næste tick\'s (50, 50)) og bolden ved udfaldet', () => {
  const { el } = fresh();
  for (let i = 0; i < 5; i++) click(el, 'rp-next');   // grundbillede t2
  assert.deepEqual([tok(el, 'h9').style.left, tok(el, 'h9').style.top], ['50%', '50%']);
  click(el, 'rp-prev'); assert.equal(step(el), 4);
  assert.deepEqual(ballAt(el), ['44%', '3%']);
  assert.deepEqual([tok(el, 'h9').style.left, tok(el, 'h9').style.top], ['40%', '17.1%'], 'skytten, hvor han skød');
  assert.ok(cls(tok(el, 'h9'), 'actor'));
  assert.ok(cls(byId(el, 'rp-caption'), 'moment'), 'billedteksten er øjeblikkets (ikke grundbilledets)');
});

test('⏮ fra grundbilledet til skudtrinnet: billedteksten er øjeblikkets (klassen "moment" og referatets linje) – dræber flag(caption, \'moment\') i skudtrinnet', () => {
  const { el } = fresh();
  for (let i = 0; i < 5; i++) click(el, 'rp-next');   // grundbillede t2: ingen "moment"
  assert.equal(cls(byId(el, 'rp-caption'), 'moment'), false);
  click(el, 'rp-prev'); assert.equal(step(el), 4);
  assert.ok(cls(byId(el, 'rp-caption'), 'moment'));
  assert.equal(byId(el, 'rp-caption').textContent, "3' · Hjemme 0-0 Ude · 🎯 [X] #9 S. Kytte rammer stolpen.");
});

// ---------- rigtige kampe: teksterne i motoren og shotEnd's mønstre hører sammen ----------
// De håndbyggede tests bruger skrevne tekster; her er det motorens egne (MISS_TXT, "kaster sig ind"), så en omformuleret tekst
// bliver rød i stedet for at falde stille til "forbi".
test('60 rigtige kampe: blokerede skud ender hos den NAVNGIVNE blokerer; mål i nettet (linje 2, x 45–55) på rigtig side; redninger hos keeperen; stolpe/over/forbi hver sit sted', () => {
  const n = { blok: 0, goal: 0, save: 0, stolpe: 0, over: 0, forbi: 0 };
  for (let s = 1; s <= 60; s++) {
    const L = createLeague(createRng(s)), m = simulateMatch(L.teams[1], L.teams[2], createRng(s * 7));
    const byTag = new Map([...m.ratings.home, ...m.ratings.away].map((e) => [`#${e.shirtNumber} ${e.shortName}`, e.playerId])), idOf = (t) => byTag.get(t);
    for (const mm of m.trace.moments) {
      const e = m.events[mm.ev], end = shotEnd(mm, e, idOf), top = mm.side === 'h', line = (d) => (top ? d : 100 - d), def = mm[top ? 'a' : 'h'];
      if (mm.kind === 'GOAL' || mm.kind === 'HEADER_GOAL') {
        assert.equal(end[1], line(2)); assert.ok(end[0] >= 45 && end[0] <= 55); n.goal++;
      } else if (mm.kind === 'SAVE') {
        assert.ok(def.some((q) => q[1] === end[0] && q[2] === end[1]), 'hos en forsvarer'); assert.ok(Math.abs(end[1] - line(0)) < 25, 'ved målet'); n.save++;
      } else if (mm.kind === 'MISS') {
        if (e.label === 'Blokeret') {
          const nm = e.text.match(/(#\d+ .+?) (?:kaster sig ind|blokerer|får et ben|lukker af)/), id = idOf(nm?.[1]);
          assert.ok(id, `blokereren findes i karakterarket: ${nm?.[1]}`);
          assert.deepEqual(end, def.find((q) => q[0] === id).slice(1)); n.blok++;
        } else if (/rammer stolpen/.test(e.text)) { assert.ok([44, 56].includes(end[0]) && end[1] === line(3)); n.stolpe++; /* stolpen i målets forkant (QC v3.16.2) */ }
        else if (/over (mål|overliggeren)/.test(e.text)) { assert.deepEqual(end, [50, line(0.5)]); n.over++; }
        else { assert.ok([38, 62].includes(end[0]) && end[1] === line(2), e.text); n.forbi++; }
      }
    }
  }
  assert.ok(n.blok > 50 && n.goal > 80 && n.save > 50 && n.stolpe > 3 && n.over > 5 && n.forbi > 10, JSON.stringify(n));
});

// ---------- det tegnede mål og koordinaterne passer sammen ----------
// shotEnd's tal (stolpe x 44/56, mål x 45–55 klemt, over/forbi uden for 44–56) forudsætter et mål på x 44–56, 3 % dybt i hver ende.
// CSS'en er den eneste, der tegner det – ændres den uden shotEnd (eller omvendt), ender bolden "i nettet" ved siden af målet.
test('.rp-goal i style.css: x 44–56 (left 44 %, width 12 %), 3 % dybt, top og bund – samme mål som shotEnd regner med (stolpe 44/56, mål 45–55, forbi 38/62)', () => {
  const css = readFileSync(new URL('../../public/style.css', import.meta.url), 'utf8');
  const rule = css.match(/\.rp-goal \{([^}]*)\}/)?.[1] ?? '';
  const px = (k) => Number(rule.match(new RegExp(`${k}:\\s*([\\d.]+)%`))?.[1]);
  assert.deepEqual([px('left'), px('width'), px('height')], [44, 12, 3]);
  assert.match(css, /\.rp-goal\.top \{ top: -2px;/); assert.match(css, /\.rp-goal\.bottom \{ bottom: -2px;/);
  const post = [shotEnd(mo('h', 'MISS', [40, 20], AWAY), miss('Forbi', 'rammer stolpen'))[0], shotEnd(mo('h', 'MISS', [60, 20], AWAY), miss('Forbi', 'rammer stolpen'))[0]];
  assert.deepEqual(post, [px('left'), px('left') + px('width')]);
  const net = shotEnd(mo('h', 'GOAL', [30, 20], [['a1', 50, 9]]))[1], depth = px('height');
  assert.ok(net > 0 && net < depth, 'i nettet = inden for målets dybde');
});
