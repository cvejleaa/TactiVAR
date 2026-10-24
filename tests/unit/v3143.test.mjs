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
  addEventListener(t, f) { (this.on ||= {})[t] = f; }
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
  let n = 0, shot = 0;
  for (const { e, m } of G) {
    if (!e.text.includes('✅')) continue;
    assert.match(e.text, /(#\d+ .+ sparkede den ind|Bolden sad i nettet)\.$/, e.text);
    assert.doesNotMatch(e.text, /Lavt cutback|spillede 1-2|baglinjen.*baglinjen|cutback fra/, e.text);
    // QC v3.14.3: "sparkede den ind" kun om den, indledningen spillede bolden til – aldrig efter "… og skyder." (løberen selv)
    const kick = e.text.match(/\. (#\d+ .+) sparkede den ind\.$/);
    if (kick) assert.ok(e.text.includes(`til ${kick[1]}. `) || e.text.includes(`spiller ${kick[1]}. `), e.text);
    if (/ og skyder\. /.test(e.text)) { assert.match(e.text, /Bolden sad i nettet\.$/, e.text); shot++; }
    const g = m.goalsPool.find((x) => x.min === e.min && e.text.includes(x.scorer));
    assert.ok(g && g.desc.length > 20 && !e.text.includes(g.desc), 'den fulde beskrivelse er i goalsPool, ikke i referatet');
    n++;
  }
  assert.ok(n >= 5 && shot >= 2, `mål med dit holds løb: ${n}, heraf "og skyder": ${shot}`);
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

test('slutstilling kun for en rigtig sæson: en arkiveret "sæson uden program" (migreringen fra skema 5) giver den almindelige tabel', async () => {
  const { endSeason } = await import('../../public/engine/season.js');
  const rng = createRng(6), L = createLeague(rng);
  commitRound(L, playRound(L, rng), rng);
  endSeason(L, L.leagueMetadata.round, false);   // som migreringen: uden program
  assert.equal(L.seasons.at(-1).programmed, false);
  const el = renderStandings({ league: L, onPick: () => {}, viewTeamId: null });
  assert.equal(byId(el, 'standings-title').textContent, `${L.leagueMetadata.name} – sæson 2, efter 0 af ${L.schedule.length} runder`);
  assert.equal(byId(el, 'standings-champion'), undefined);
});

test('mesteren røbes ikke, mens sæsonens sidste runde spilles; statistikken siger, hvor den afsluttede sæson står', async () => {
  const { renderStats } = await import('../../public/ui/stats.js');
  const rng = createRng(5), L = createLeague(rng);
  for (let r = 0; r < L.schedule.length; r++) commitRound(L, playRound(L, rng), rng);
  const playing = renderStandings({ league: L, onPick: () => {}, viewTeamId: null, playing: true });
  assert.equal(byId(playing, 'standings-champion'), undefined, 'ingen mester under afspilningen');
  assert.match(byId(playing, 'standings-title').textContent, /slutstilling, sæson 1$/);
  const st = renderStats({ league: L, myTeamId: L.teams[0].id });
  assert.match(byId(st, 'stats-season-over').textContent, /^Sæson 1 er slut – slutstillingen står i tabellen ovenfor/);
  commitRound(L, playRound(L, rng), rng);
  assert.equal(byId(renderStats({ league: L, myTeamId: L.teams[0].id }), 'stats-season-over'), undefined, 'væk efter første runde i den nye sæson');
});

// TM v3.14.3: slutstillingens indhold – hver kolonne, klasserne og klikket. Tabellen i sæsonarkivet får kunstigt forskellige tal
// pr. kolonne (data!), så en ombyttet kolonne (V/U, K/T, mål for/imod) ikke kan ligne den rigtige.
test('slutstilling: hver kolonne (K V U T Mål P) viser sit eget tal, "VAR ±" er –, "mine" kun på dit hold, "viewing" på det viste, klik vælger holdet', () => {
  const rng = createRng(8), L = createLeague(rng);
  for (let r = 0; r < L.schedule.length; r++) commitRound(L, playRound(L, rng), rng);
  const last = L.seasons.at(-1);
  last.table.forEach((t, i) => Object.assign(t, { played: 30 + i, won: 3 + i, drawn: 50 + i, lost: 70 + i, goalsFor: 100 + i, goalsAgainst: 200 + i, points: 400 + i }));
  const myId = L.teams.find((t) => !t.isBot).id, viewId = last.table[2].teamId, picked = [];
  const el = renderStandings({ league: L, onPick: (id) => picked.push(id), viewTeamId: viewId });
  const trs = all(byId(el, 'standings'), (e) => e.tag === 'tr');
  assert.deepEqual(trs[0].children.map((c) => c.textContent), ['#', 'Hold', 'K', 'V', 'U', 'T', 'Mål', 'VAR ±', 'P']);
  const body = trs.slice(1);
  assert.equal(body.length, last.table.length);
  body.forEach((tr, i) => {
    assert.deepEqual(tr.children.map((c) => c.textContent), [String(i + 1), last.table[i].teamName, String(30 + i), String(3 + i), String(50 + i), String(70 + i), `${100 + i}-${200 + i}`, '–', String(400 + i)]);
    const cls = tr.className.split(' ').filter(Boolean);
    assert.equal(cls.includes('mine'), last.table[i].teamId === myId, `mine: ${last.table[i].teamName}`);
    assert.equal(cls.includes('viewing'), last.table[i].teamId === viewId, `viewing: ${last.table[i].teamName}`);
    tr.on.click(); assert.equal(picked.at(-1), last.table[i].teamId);
  });
  assert.equal(body.filter((tr) => tr.className.includes('mine')).length, 1, 'præcis ét hold er dit (resten er bots)');
});

test('slutstilling efter TO sæsoner viser den SIDSTE sæson (2), ikke den første – og efter 1. runde i sæson 3 den nye tabel', () => {
  const rng = createRng(9), L = createLeague(rng);
  for (let s = 0; s < 2; s++) for (let r = 0; r < L.schedule.length; r++) commitRound(L, playRound(L, rng), rng);
  assert.equal(L.seasons.length, 2);
  assert.notDeepEqual(L.seasons[0].table.map((t) => t.points), L.seasons[1].table.map((t) => t.points), 'data: de to sæsoner er forskellige');
  const el = renderStandings({ league: L, onPick: () => {}, viewTeamId: null });
  assert.equal(byId(el, 'standings-title').textContent, `${L.leagueMetadata.name} – slutstilling, sæson 2`);
  assert.equal(byId(el, 'standings-champion').textContent, `🏆 Mester: ${L.seasons[1].champion.teamName} (${L.seasons[1].champion.points} point). Sæson 3 starter med næste runde.`);
  const rows = all(byId(el, 'standings'), (e) => e.tag === 'tr').slice(1).map((tr) => [tr.children[1].textContent, Number(tr.children[8].textContent)]);
  assert.deepEqual(rows, L.seasons[1].table.map((t) => [t.teamName, t.points]));
});
