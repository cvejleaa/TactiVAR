// v3.18.0 – spillerkortets kamphistorik (📜 Kampe) og kampstemplet
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
const { playRound, commitRound } = await import('../../public/engine/season.js');
const { renderCard } = await import('../../public/ui/card.js');
const { LOG, stampText, MATCH_LOG_CAP } = await import('../../public/engine/career.js');
const { viewPlayer } = await import('../../public/engine/visibility.js');
const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];

const rng = createRng(18), L = createLeague(rng);
for (let r = 0; r < 3; r++) commitRound(L, playRound(L, rng), rng);
const me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t.isBot);

test('kamphistorik: én tupel pr. spillet kamp med runde, hold, stilling, minutter, karakter, stjerner, mål og oplæg – lig karakterarket', () => {
  const p = me.squad.find((x) => x.matchLog.length === 3);
  assert.ok(p, 'data: en starter med 3 kampe');
  assert.equal(p.careerGames, 3);
  const last = L.lastRound.matches.find((m) => m.homeId === me.id || m.awayId === me.id), r = [...last.ratings.home, ...last.ratings.away].find((e) => e.playerId === p.id);
  const e = p.matchLog.at(-1);
  assert.deepEqual([e[LOG.S], e[LOG.R], L.teams[e[LOG.H]].id, L.teams[e[LOG.A]].id, e[LOG.HG], e[LOG.AG], e[LOG.RT], e[LOG.ST], e[LOG.G], e[LOG.AS]],
    [1, 3, last.homeId, last.awayId, last.homeGoals, last.awayGoals, r.rating, r.stars, r.goals, r.assists]);
  assert.equal(e[LOG.MIN], r.minIn <= 1 ? r.minOut : r.minOut - r.minIn);
  const unused = me.squad.find((x) => !x.matchLog.length);
  assert.ok(!unused || unused.careerGames === 0, 'en reserve/ubrugt får ingen linje');
  // Stemplet
  assert.equal(stampText([1, 5, 0, 1, 2, 1, 90, 7.4, 4, 1, 0], L.teams, true), `[Runde 5 • ${L.teams[0].name} 2-1 ${L.teams[1].name} • 90' • 7,4]`);
  assert.equal(stampText([1, 5, 0, 1, 2, 1, 90, 7.4, 4, 1, 0], L.teams, false), `[Runde 5 • ${L.teams[0].name} 2-1 ${L.teams[1].name} • 90' • ★★★★☆]`);
});

test('kamphistorikken er offentlig, men karakteren kun for ejeren (viewPlayer) – og loftet er MATCH_LOG_CAP', () => {
  const p = opp.squad.find((x) => x.matchLog.length);
  assert.ok(p.matchLog.every((e) => typeof e[LOG.RT] === 'number'), 'data');
  assert.ok(viewPlayer(p, false).matchLog.every((e) => e[LOG.RT] === null && e[LOG.ST] >= 0));
  assert.deepEqual(viewPlayer(p, true).matchLog, p.matchLog);
  const q = structuredClone(p); q.matchLog = [];
  for (let i = 0; i < 40; i++) commitLike(q, i);
  assert.equal(q.matchLog.length, MATCH_LOG_CAP); assert.equal(q.matchLog[0][LOG.R], 40 - MATCH_LOG_CAP + 1);
});
function commitLike(p, i) { const { logMatch } = CAREER; logMatch(p, [1, i + 1, 0, 1, 0, 0, 90, 6, 3, 0, 0]); }
const CAREER = await import('../../public/engine/career.js');

test('spillerkortet: 📜 Kampe med stemplet og karrierelinjen; andre holds kort viser stjerner, ikke karakteren; 📺 kun ved seneste runde og åbner den kamp', () => {
  const p = me.squad.find((x) => x.matchLog.length === 3), o = opp.squad.find((x) => x.matchLog.length === 3);
  const latest = L.lastRound.matches.map((m) => [L.teams.findIndex((t) => t.id === m.homeId), L.teams.findIndex((t) => t.id === m.awayId), m.homeGoals, m.awayGoals].join('|'));
  let opened = null;
  const el = renderCard({ player: p, team: me, isOwn: true, scouting: [], note: '', onNote() {}, teams: L.teams, latest, onOpenMatch: (h, a) => { opened = [h, a]; } });
  const log = byId(el, 'match-log');
  assert.match(byId(el, 'career-line').textContent, /^3 kampe i karrieren · \d+ mål og \d+ oplæg i de seneste 3$/);
  const rows = all(log, (x) => x.className === 'log-row');
  assert.equal(rows.length, 3);
  assert.ok(rows[0].textContent.startsWith(stampText(p.matchLog.at(-1), L.teams, true)), rows[0].textContent);
  assert.match(rows[0].textContent, /• \d+,\d\]|• \d+\]/, 'karakteren');
  const btns = all(log, (x) => x.className.includes('log-open'));
  assert.equal(btns.length, 1, 'kun seneste runde linker');
  btns[0].handlers.click(); assert.deepEqual(opened, [p.matchLog.at(-1)[LOG.H], p.matchLog.at(-1)[LOG.A]]);
  const oel = renderCard({ player: o, team: opp, isOwn: false, scouting: [], note: '', onNote() {}, teams: L.teams, latest: null });
  const orow = all(byId(oel, 'match-log'), (x) => x.className === 'log-row')[0].textContent;
  assert.match(orow, /• [★☆]{5}\]/); assert.doesNotMatch(orow, /• \d+,\d\]/);
});
