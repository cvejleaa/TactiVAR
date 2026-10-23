// 📍 øjebliksbilledet i Match Center (public/ui/matchcenter.js snapPitch + pinden i referatet) mod et
// minimalt DOM. Test Manager v3.12.1: e2e kører kun ét tilfældigt udfald uden at kigge på koordinaterne,
// ⚽/🅰-mærkerne, pinden under afspilning eller pinden med et filter; her er alt sat til kendte, FORSKELLIGE værdier
// (bold x 50 ≠ y 28), så ombyttede x/y, et forkert indeks eller en manglende markering bliver rød.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.handlers = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, f) { this.handlers[k] = f; }
  get id() { return this.attrs.id; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id);
const cls = (e, c) => e.className.split(' ').includes(c);
function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return { next: () => nextValue, int: (a) => a, pick: (arr) => arr[0], chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(n) : !!s; } };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
// Dit hold (H) angriber med cutbacks (bold (50,28), scorer og oplæg forskellige) – eller en bot (A) angriber dig (mål imod)
function played({ youAttack }) {
  const L = createLeague(createRng(1)); const [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) { p.skills = SK(10); p.aerialPower = 10; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 }; p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0; }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0; /* v3.13: ingen træthedsskift i test-arenaen */
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
    Object.assign(t.tactics.phases.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'LOW_CUTBACKS', offBallRuns: 'NORMAL' });
    Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: 'MID_BLOCK', offsideTrap: 'OFF', tacklingIntensity: 'NORMAL' });
    Object.assign(t.tactics.phases.phase3_transition, { onBallWon: 'KEEP_POSSESSION', onBallLost: 'DROP_BACK' });
  }
  const [att, def] = youAttack ? [H, A] : [A, H];
  for (const p of def.squad) { p.skills.goalkeeping = 1; p.skills.intercepting = 1; }
  const m = simulateMatch(att, def, stubRng({ 0.48: true, 0.3: true, 0.38: true }));
  const me = H;
  return { m, me, att, def };
}
const draw = (m, me, mc, on = {}) => renderMatchCenter({ mc: { round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount: 0, playing: false, snap: null, ...mc }, myTeamId: me.id, on: { snapshot: () => {}, view: () => {}, filter: () => {}, skip: () => {}, ...on } });
const goalIdx = (m) => m.events.findIndex((e) => e.snapshot);

test('dit mål: 11 brikker på (x%, y%) fra billedet, scorer ⚽ og oplæg 🅰 mærket på de rigtige spillere, bolden på (50 %, 28 %), overskriften nævner scorer og minut', () => {
  const { m, me } = played({ youAttack: true });
  const i = goalIdx(m), snap = m.events[i].snapshot;
  assert.equal(snap.attacking, true);
  const root = draw(m, me, { snap: i });
  const pitches = byId(root, 'snap-pitch');
  assert.equal(pitches.length, 1, 'præcis ét billede');
  const toks = all(pitches[0], (e) => cls(e, 'mp-token'));
  assert.equal(toks.length, 11);
  // Hver brik står på billedets koordinater (x → left, y → top)
  assert.deepEqual(toks.map((t) => [t.dataset.pid, t.style.left, t.style.top]), snap.pts.map(([id, x, y]) => [id, x + '%', y + '%']));
  const sc = toks.filter((t) => cls(t, 'scorer')), as = toks.filter((t) => cls(t, 'assist'));
  assert.equal(sc.length, 1); assert.equal(as.length, 1);
  assert.equal(sc[0].dataset.pid, snap.scorer); assert.equal(as[0].dataset.pid, snap.assist);
  assert.notEqual(snap.scorer, snap.assist);
  assert.equal(sc[0].children[0].textContent, '⚽'); assert.equal(as[0].children[0].textContent, '🅰');
  // De øvrige har trøjenummer (#N) – ikke ⚽/🅰
  assert.ok(toks.filter((t) => !cls(t, 'scorer') && !cls(t, 'assist')).every((t) => /^#\d+$/.test(t.children[0].textContent)));
  const ball = byId(pitches[0], 'snap-ball')[0];
  assert.deepEqual([ball.style.left, ball.style.top], ['50%', '28%']);
  const title = byId(pitches[0], 'snap-title')[0].textContent;
  assert.match(title, new RegExp(`^${m.events[i].min}' – mål af #\\d+ .+: sådan stod I$`));
  // Billedet ligger i DIT holds karakterark (hjemmeholdet er dig her); modstanderen viser stadig startopstillingen
  const ratings = all(root, (e) => cls(e, 'ratings'));
  assert.equal(ratings.length, 2);
  assert.equal(all(ratings[0], (e) => e.attrs.id === 'snap-pitch').length, 1); assert.equal(all(ratings[1], (e) => e.attrs.id === 'snap-pitch').length, 0);
  // Hændelsen er markeret; de andre ikke
  const marked = all(root, (e) => cls(e, 'ev') && cls(e, 'snapped'));
  assert.equal(marked.length, 1);
});
test('mål imod: ingen scorer/oplæg-mærker, bolden spejlet på (50 %, 72 %), overskriften siger at modstanderens spillere ikke vises', () => {
  const { m, me } = played({ youAttack: false });
  const i = goalIdx(m), snap = m.events[i].snapshot;
  assert.equal(snap.attacking, false);
  const root = draw(m, me, { snap: i });
  const pitch = byId(root, 'snap-pitch')[0];
  const toks = all(pitch, (e) => cls(e, 'mp-token'));
  assert.equal(toks.length, 11);
  assert.equal(toks.filter((t) => cls(t, 'scorer') || cls(t, 'assist')).length, 0);
  assert.deepEqual(toks.map((t) => [t.dataset.pid, t.style.left, t.style.top]), snap.pts.map(([id, x, y]) => [id, x + '%', y + '%']));
  const ball = byId(pitch, 'snap-ball')[0];
  assert.deepEqual(snap.ball, [50, 72]);   // cutback-stedet (50,28) set fra modstanderens side
  assert.deepEqual([ball.style.left, ball.style.top], ['50%', '72%']);
  assert.equal(byId(pitch, 'snap-title')[0].textContent, `${m.events[i].min}' – mål imod: sådan stod dit forsvar (modstanderens spillere vises ikke)`);
  // Du er udeholdet: billedet står i udeholdets karakterark
  const ratings = all(root, (e) => cls(e, 'ratings'));
  assert.equal(all(ratings[1], (e) => e.attrs.id === 'snap-pitch').length, 1); assert.equal(all(ratings[0], (e) => e.attrs.id === 'snap-pitch').length, 0);
});
test('uden valgt mål, eller et valgt indeks uden billede: ingen bane med billede (men 📍 ved hvert mål med billede)', () => {
  const { m, me } = played({ youAttack: true });
  const want = m.events.filter((e) => e.snapshot).length;
  assert.ok(want >= 25, 'testen har data');
  for (const snap of [null, 0, undefined]) {
    assert.equal(m.events[0].snapshot, undefined);
    const root = draw(m, me, { snap });
    assert.equal(byId(root, 'snap-pitch').length, 0, String(snap));
    assert.equal(all(root, (e) => cls(e, 'snap-btn')).length, want);
  }
});
test('📍 findes ikke under afspilning; i et filtreret referat peger den på hændelsens plads i HELE kampen (ikke i den filtrerede liste)', () => {
  const { m, me } = played({ youAttack: true });
  const playing = draw(m, me, { playing: true, shownCount: m.events.length });
  assert.equal(all(playing, (e) => cls(e, 'snap-btn')).length, 0, 'ingen 📍 før slutfløjt');
  for (const filter of ['all', 'key', 'tactic']) {
    const got = [];
    const root = draw(m, me, { filter }, { snapshot: (i) => got.push(i) });
    const pins = all(root, (e) => cls(e, 'snap-btn'));
    for (const p of pins) p.handlers.click();
    // Hvert klik giver et indeks, hvor kampens hændelse HAR et billede, og alle mål med billede dækkes én gang
    assert.ok(got.every((i) => m.events[i]?.snapshot), `${filter}: ${got.join()}`);
    if (filter !== 'tactic') assert.equal(new Set(got).size, got.length);
    if (filter === 'all') assert.equal(got.length, m.events.filter((e) => e.snapshot).length);
    if (filter === 'key') assert.ok(got.length >= 25 && got.length === new Set(got).size);
  }
  // Pinden hører til sit eget mål: i feed-rækkefølgen (nyeste først) peger den første pin på kampens SIDSTE mål med billede
  const got2 = []; const r2 = draw(m, me, { filter: 'key' }, { snapshot: (i) => got2.push(i) });
  all(r2, (e) => cls(e, 'snap-btn'))[0].handlers.click();
  assert.equal(got2[0], m.events.map((e, i) => (e.snapshot ? i : -1)).filter((i) => i >= 0).at(-1));
});
