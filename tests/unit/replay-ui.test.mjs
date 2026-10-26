// v3.16: 2D-afspilningen og heat map'et i Match Center (public/ui/replay.js, public/engine/heatmap.js, matchcenter.js)
// mod et minimalt DOM: trinene følger sporet, et spring fra referatet rammer hændelsens øjeblik, stillingen i et
// grundbillede er fra FØR tick'ets hændelser, afspilningen findes kun efter slutfløjt, gamle kampe uden spor viser en tekst,
// og modstanderen får kun tredjedele (ingen enkeltspillere).
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
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');
const { replaySteps, stepForEvent, replayEl, replayJump, clearReplays } = await import('../../public/ui/replay.js');
const { heatGrid, shotsOf, thirds } = await import('../../public/engine/heatmap.js');
const { evMin, fmtMin, tickClock, clockNum } = await import('../../public/engine/clock.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
function game(s = 4) {
  const L = createLeague(createRng(s)), me = L.teams.find((t) => !t.isBot);
  return { me, m: simulateMatch(me, L.teams[(s % 7) + 1], createRng(s * 13)) };
}
const mcOf = (m, extra = {}) => ({ round: 1, matches: [m], gazette: { goalOfTheRound: null, totalGoals: 0, totalVarChecks: 0 }, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false, ...extra });
const on = { skip() {}, view() {}, snapshot() {}, openGoal() {}, filter() {}, heat() {}, replay() {} };

// v3.16.2: efter hvert mål/redning/skud forbi et skudtrin med samme hændelse (VAR-tjek, annulleret mål og flag har intet).
const SHOT_KINDS = new Set(['GOAL', 'HEADER_GOAL', 'SAVE', 'MISS']);
test('trinene: 31 grundbilleder + ét pr. afslutning i tick-orden, et skudtrin efter hvert mål/redning/forbi; højdepunkter = kun afslutningerne og deres skudtrin; spring rammer hændelsens øjeblik', () => {
  const { m } = game();
  const s = replaySteps(m.trace, false, m.events), hl = replaySteps(m.trace, true, m.events);
  assert.equal(s.filter((x) => x.kind === 'frame').length, 31);
  assert.equal(s.filter((x) => x.kind === 'moment').length, m.trace.moments.length);
  const shots = m.trace.moments.filter((x) => SHOT_KINDS.has(x.kind));
  assert.ok(m.trace.moments.length >= 5 && shots.length >= 3, 'data: afslutninger');
  assert.deepEqual(s.filter((x) => x.kind === 'shot').map((x) => x.ev), shots.map((x) => x.ev));
  assert.ok(s.every((x, i) => x.kind !== 'shot' || (s[i - 1].kind === 'moment' && s[i - 1].ev === x.ev)), 'skudtrinnet lige efter sit øjeblik');
  assert.ok(s.every((x, i) => i === 0 || x.t >= s[i - 1].t), 'tick-orden');
  // v3.17.0: Højdepunkter springer halvchancen over, medmindre den blev til mål (Spilfører: ellers en halv afspilning)
  const keep = (x) => !(x.half && !x.scorer);
  assert.ok(m.trace.moments.some((x) => x.half) && m.trace.moments.some((x) => !x.half), 'data: både halvchancer og andre afslutninger');
  assert.deepEqual(hl.filter((x) => x.kind === 'moment').map((x) => x.ev), m.trace.moments.filter(keep).map((x) => x.ev));
  const halfEv = new Set(m.trace.moments.filter((x) => !keep(x)).map((x) => x.ev));
  assert.deepEqual(hl, s.filter((x) => x.kind !== 'frame' && !halfEv.has(x.ev)), 'højdepunkter = de samme trin uden grundbillederne og halvchancerne');
  const mo = m.trace.moments[2];
  assert.equal(s[stepForEvent(s, m.events, mo.ev)].ev, mo.ev);
  // En hændelse uden øjeblik (fx et gult kort) → grundbilledet i dens tick
  const foul = m.events.findIndex((e) => e.min > 3 && !m.trace.moments.some((x) => x.ev === m.events.indexOf(e)) && e.type !== 'END');
  assert.equal(s[stepForEvent(s, m.events, foul)].t, Math.round(m.events[foul].min / 3));
});

test('afspilningen: brikker for begge hold, et spring viser hændelsens tekst; et grundbillede viser stillingen FØR tickets mål', () => {
  clearReplays();
  // En kamp med et mål i åbent spil (billede) – første seed fra 4
  let m = null;
  for (let s = 4; !m && s < 40; s++) { const g = game(s).m; if (g.trace.moments.some((x) => x.kind === 'GOAL' && g.events[x.ev].hG + g.events[x.ev].aG >= 1 && !g.trace.moments.some((y) => y.t === x.t && y.ev < x.ev))) m = g; }
  const el = replayEl(m, 'h');
  // Målet er tick'ets første øjeblik – så er forrige trin grundbilledet (v3.17.0: halvchancen kan stå før i samme tick)
  const goal = m.trace.moments.find((x) => x.kind === 'GOAL' && m.events[x.ev].hG + m.events[x.ev].aG >= 1 && !m.trace.moments.some((y) => y.t === x.t && y.ev < x.ev));
  assert.ok(goal, 'data: et mål med billede');
  replayJump(m, goal.ev);
  const cap = byId(el, 'rp-caption').textContent, e = m.events[goal.ev];
  assert.ok(cap.includes(e.text) && cap.includes(`${e.hG}-${e.aG}`), cap);
  assert.ok(cap.startsWith(`${evMin(e)} · `), `øjeblikket står på hændelsens ur (v3.16.4): ${cap}`);
  const tokens = all(el, (x) => x.className.includes('rp-token') && !x.hidden);
  assert.equal(tokens.length, goal.h.length + goal.a.length);
  assert.ok(all(el, (x) => x.className.includes('actor')).some((x) => Number(x.dataset.pid) === goal.scorer || x.dataset.pid === goal.scorer), 'scoreren fremhævet');
  // Grundbilledet i målets tick: stillingen fra før målet
  const before = m.events.filter((x) => x.min < e.min).at(-1);
  byId(el, 'rp-prev').handlers.click();
  const cap2 = byId(el, 'rp-caption').textContent;
  // v3.16.4: grundbilledet står på tick'ets første minut (tickClock) – aldrig efter målets eget minut
  const baseMin = tickClock(Math.round(e.min / 3), m.stoppage);
  assert.ok(cap2.startsWith(`${fmtMin(baseMin)} · ${m.homeName} ${before.hG}-${before.aG} `), `${cap2} (før: ${before.hG}-${before.aG}, efter: ${e.hG}-${e.aG})`);
  assert.ok(clockNum(baseMin) <= clockNum(e.clock), `${fmtMin(baseMin)} ≤ ${evMin(e)}`);
  // Samme element genbruges mellem tegningerne (faste brikker – CSS-overgange)
  assert.equal(replayEl(m, 'h'), el);
});

test('Match Center: afspilning og 🎬 kun efter slutfløjt; en kamp uden spor (før v3.16) viser en tekst, ingen fejl', () => {
  clearReplays();
  const { m } = game();
  const live = renderMatchCenter({ mc: mcOf(m, { playing: true, shownCount: 5 }), myTeamId: m.homeId, on });
  assert.equal(byId(live, 'replay'), undefined, 'ingen afspilning under live');
  assert.equal(all(live, (x) => x.className.includes('replay-btn')).length, 0);
  const done = renderMatchCenter({ mc: mcOf(m), myTeamId: m.homeId, on });
  assert.ok(byId(done, 'rp-pitch'));
  assert.equal(all(done, (x) => x.className.includes('replay-btn')).length, m.trace.moments.length);
  const { trace, ...old } = m;
  const oldEl = renderMatchCenter({ mc: mcOf(old), myTeamId: m.homeId, on });
  assert.match(byId(oldEl, 'replay').textContent, /Ingen afspilning/);
  assert.equal(byId(oldEl, 'heat-btn'), undefined);
});

test('heat map: dit hold og dine spillere fuldt (tæthed + afslutninger); modstanderen kun tredjedele – ingen af hans spillere i kortet', () => {
  clearReplays();
  const { m } = game();
  const grid = heatGrid(m.trace, 'h', null);
  assert.equal(grid.length, 18); assert.equal(grid[0].length, 12);   // v3.20.2: 12 × 18 (før 6 × 9)
  assert.equal(Math.max(...grid.flat()), 1);
  const scorer = m.trace.moments.find((x) => x.side === 'h' && x.scorer)?.scorer;
  if (scorer) assert.ok(shotsOf(m.trace, 'h', scorer).some((s) => s.outcome === 'goal'));
  const t = thirds(m.trace, 'a');
  assert.ok(Math.abs(t.defence + t.middle + t.attack - 1) < 1e-9);
  const el = renderMatchCenter({ mc: mcOf(m, { heat: { playerId: null } }), myTeamId: m.homeId, on });
  assert.ok(byId(el, 'heat-pitch'), 'dit holds kort');
  assert.match(byId(el, 'heat-thirds').textContent, /^🔥 Tyngdepunkt \(groft\): egen tredjedel \d+ % · midten \d+ % · angrebstredjedelen \d+ %$/);
  const heat = byId(el, 'heat-pitch');
  const awayIds = new Set(m.ratings.away.map((e) => String(e.playerId)));
  assert.ok(!all(heat, (x) => x.dataset?.pid && awayIds.has(String(x.dataset.pid))).length, 'ingen modstandere i kortet');
  assert.equal(all(el, (x) => x.attrs.id === 'heat-pitch').length, 1, 'kun ét heat map (dit hold)');
});
