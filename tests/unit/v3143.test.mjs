// v3.14.3 – brugerens tre fund på 3.14.2: (1) langskud fra egen banehalvdel i billedet, (2) cutbacken fortalt to gange
// i referatet, (3) slutstillingen forsvinder i samme øjeblik, som sæsonens sidste runde er spillet.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch, LONGSHOT_FAR } = await import('../../public/engine/match.js');
const { playRound, commitRound } = await import('../../public/engine/season.js');
const { renderStandings } = await import('../../public/ui/standings.js');
const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];

// Mange seedede kampe for dit hold – mål med billede.
function goals(n = 120) {
  const out = [];
  for (let seed = 1; seed <= n; seed++) {
    const L = createLeague(createRng(seed));
    const m = simulateMatch(L.teams[0], L.teams[1], createRng(seed * 13));
    m.events.forEach((e) => { if (e.type === 'GOAL' && e.isHome) out.push({ e, m }); });
  }
  return out;
}
const G = goals();

test('langskud: skytten og bolden står i billedet højst på LONGSHOT_FAR (38) – aldrig fra egen banehalvdel', () => {
  assert.equal(LONGSHOT_FAR, 38);
  let n = 0;
  for (const { e, m } of G) {
    const g = m.goalsPool.find((x) => x.min === e.min && e.text.includes(x.scorer));
    if (g?.kind !== 'LONGSHOT' || !e.snapshot) continue;
    const at = e.snapshot.pts.find(([id]) => id === e.snapshot.scorer);
    assert.ok(at[2] <= LONGSHOT_FAR && e.snapshot.ball[1] <= LONGSHOT_FAR, `${e.text} | skytte y ${at[2]}, bold y ${e.snapshot.ball[1]}`);
    assert.deepEqual(e.snapshot.ball, [at[1], at[2]], 'bolden ved skytten');
    n++;
  }
  assert.ok(n >= 5, `langskudsmål med billede: ${n}`);
});

test('referatet fortæller oplægget én gang: med dit holds løb (✅) slutter målteksten kort – den fulde beskrivelse står i Rundens mål', () => {
  let n = 0;
  for (const { e, m } of G) {
    if (!e.text.includes('✅')) continue;
    assert.match(e.text, /(#\d+ .+ sparkede den ind|Bolden sad i nettet)\.$/, e.text);
    assert.doesNotMatch(e.text, /Lavt cutback|spillede 1-2|baglinjen.*baglinjen|cutback fra/, e.text);
    const g = m.goalsPool.find((x) => x.min === e.min && e.text.includes(x.scorer));
    assert.ok(g && g.desc.length > 20 && !e.text.includes(g.desc), 'den fulde beskrivelse er i goalsPool, ikke i referatet');
    n++;
  }
  assert.ok(n >= 5, `mål med dit holds løb: ${n}`);
});

test('slutstilling: lige efter sæsonens sidste runde viser tabellen slutstillingen og mesteren – efter næste runde den nye sæson', () => {
  const rng = createRng(5), L = createLeague(rng);
  for (let r = 0; r < L.schedule.length; r++) commitRound(L, playRound(L, rng), rng);
  const last = L.seasons.at(-1);
  assert.equal(last.seasonNumber, 1); assert.ok(last.programmed);
  assert.ok(last.table.some((t) => t.points > 0), 'data: point i slutstillingen');
  const el = renderStandings({ league: L, onPick: () => {}, viewTeamId: null });
  assert.equal(byId(el, 'standings-title').textContent, `${L.leagueMetadata.name} – slutstilling, sæson 1`);
  assert.equal(byId(el, 'standings-champion').textContent, `🏆 Mester: ${last.champion.teamName} (${last.champion.points} point). Sæson 2 starter med næste runde.`);
  const rows = all(byId(el, 'standings'), (e) => e.tag === 'tr').slice(1).map((tr) => [tr.children[1].textContent, Number(tr.children[8].textContent)]);
  assert.deepEqual(rows, last.table.map((t) => [t.teamName, t.points]));
  commitRound(L, playRound(L, rng), rng);
  const el2 = renderStandings({ league: L, onPick: () => {}, viewTeamId: null });
  assert.equal(byId(el2, 'standings-title').textContent, `${L.leagueMetadata.name} – sæson 2, efter 1 af ${L.schedule.length} runder`);
  assert.equal(byId(el2, 'standings-champion'), undefined);
});
