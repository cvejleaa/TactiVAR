// v3.16 Test Manager: heat map'et og 🎬-knapperne i Match Center (matchcenter.js ratingsTable/heatPitch/thirdsLine) mod et
// HÅNDBYGGET spor på en rigtig kamps spillere. replay-ui.test.mjs tjekkede at der FINDES et heat-pitch og en tredjedelslinje
// (regex på tal), men ikke hvad der stod: hvilket hold linjen gælder, rækkefølgen/afrundingen, målmandens udeladelse, felternes
// placering og styrke, prikkernes udfald/placering/tekst, klik på rækker og knapper, og 🎬's argumenter (~30 af 40 mutationer overlevede).
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
const { clearReplays } = await import('../../public/ui/replay.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id);
const cls = (e, c) => e.className.split(' ').includes(c);

// En rigtig kamp (spillere, hold, referat), men med et håndbygget spor.
const L = createLeague(createRng(4)), me = L.teams.find((t) => !t.isBot);
const base = simulateMatch(me, L.teams[(4 % 7) + 1], createRng(4 * 13));
const [hGk, hA, hB] = [base.ratings.home.find((e) => e.role === 'GK'), ...base.ratings.home.filter((e) => e.role !== 'GK' && !e.red).slice(0, 2)];
const [aGk, aA, aB] = [base.ratings.away.find((e) => e.role === 'GK'), ...base.ratings.away.filter((e) => e.role !== 'GK' && !e.red).slice(0, 2)];
const id = (e) => e.playerId;
const P = (e, x, y) => [id(e), x, y];
// Punkter i FÆLLES koordinater (hjemmeholdet angriber mod y 0, udeholdet spejlet)
const mom = (t, ev, kind, side, h, a, shooter, extra = {}) => ({ t, ev, kind, side, ball: [50, side === 'h' ? 20 : 80], h, a, shooter: id(shooter), ...extra });
const trace = () => ({
  v: 1,
  frames: [{ t: 0, poss: null, ball: [50, 50], h: [P(hGk, 50, 90), P(hA, 10, 10), P(hB, 55, 50)], a: [P(aGk, 50, 10), P(aA, 90, 90), P(aB, 50, 50)] }],
  moments: [
    mom(1, 1, 'GOAL', 'h', [P(hGk, 50, 90), P(hA, 12, 30), P(hB, 60, 60)], [P(aGk, 50, 10)], hA, { scorer: id(hA), assist: id(hB), ball: [12, 30] }),
    mom(2, 2, 'SAVE', 'h', [P(hGk, 50, 90), P(hA, 11, 31), P(hB, 60, 80)], [P(aGk, 50, 10)], hA),
    mom(3, 3, 'MISS', 'h', [P(hA, 20, 20)], [], hA),
    mom(4, 4, 'OFFSIDE_FLAG', 'h', [P(hA, 20, 20)], [], hA),
    mom(5, 5, 'VAR_NO_GOAL', 'h', [P(hA, 20, 20)], [], hA),
    mom(6, 6, 'MISS', 'a', [], [P(aGk, 50, 10), P(aA, 90, 90)], aA),
    mom(7, 7, 'MISS', 'h', [P(hA, 20, 20)], [], hA),
  ],
});
const mOf = () => ({ ...base, trace: trace() });
const mcOf = (m, extra = {}) => ({ round: 1, matches: [m], gazette: { goalOfTheRound: null, totalGoals: 0, totalVarChecks: 0 }, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false, ...extra });
function render(m, myTeamId, mc = {}) {
  clearReplays();
  const calls = { heat: [], replay: [] };
  const on = { skip() {}, view() {}, snapshot() {}, openGoal() {}, filter() {}, heat: (v) => calls.heat.push(v), replay: (...a) => calls.replay.push(a) };
  return { el: renderMatchCenter({ mc: mcOf(m, mc), myTeamId, on }), calls };
}
const tables = (el) => all(el, (e) => cls(e, 'ratings'));   // [hjemme, ude]
const rowOf = (table, e) => all(table, (x) => x.tag === 'tr').find((r) => r.children[0].textContent.startsWith(`#${e.shirtNumber} ${e.shortName}`));

test('data: kampen har et målmandsark og to markspillere pr. hold, og sporets spillere er dem', () => {
  assert.ok(hGk && hA && hB && aGk && aA && aB);
  assert.notEqual(hA.shirtNumber + hA.shortName, hB.shirtNumber + hB.shortName);
});

test('heat-knappen: kun i DIT holds karakterark ("🔥 Heat map"), markeret når et kort vises; klik tænder holdets kort, klik igen slukker; modstanderen har ingen knap', () => {
  for (const [mine, idx] of [[base.homeId, 0], [base.awayId, 1]]) {
    const { el, calls } = render(mOf(), mine);
    const t = tables(el);
    assert.equal(byId(el, 'heat-btn').length, 1, 'præcis ét heat map-knap');
    assert.equal(byId(t[idx], 'heat-btn').length, 1, `i hold ${idx}`); assert.equal(byId(t[1 - idx], 'heat-btn').length, 0);
    const b = byId(el, 'heat-btn')[0];
    assert.equal(b.textContent, '🔥 Heat map'); assert.equal(cls(b, 'active'), false);
    b.handlers.click(); assert.deepEqual(calls.heat, [{ playerId: null }]);
    // Med et kort åbent: knappen er markeret og et klik slukker (null)
    const open = render(mOf(), mine, { heat: { playerId: null } });
    const b2 = byId(open.el, 'heat-btn')[0];
    assert.equal(cls(b2, 'active'), true); b2.handlers.click(); assert.deepEqual(open.calls.heat, [null]);
  }
  // Fremmed seer (hverken hjemme eller ude): ingen knap, og tredjedele for begge
  const none = render(mOf(), 'ingen-af-dem');
  assert.equal(byId(none.el, 'heat-btn').length, 0); assert.equal(byId(none.el, 'heat-thirds').length, 2);
});

test('modstanderen kun groft: tredjedelslinjen står i modstanderens ark med hans tal (egen tredjedel · midten · angreb, afrundet, uden målmand) – ikke i dit', () => {
  // Ude (spejlet til eget): aA (90,90) → (10,10) angreb to gange (billede + sidste afslutning), aB (50,50) midten; målmanden (50,10 → eget 50,90) ikke med
  //   → 0 / 1 af 3 / 2 af 3 = 0 % · 33 % · 67 % (gulv ville give 66)
  const mineHome = render(mOf(), base.homeId).el, t = tables(mineHome);
  assert.equal(byId(t[0], 'heat-thirds').length, 0, 'dit ark har ingen tredjedelslinje');
  assert.equal(byId(t[1], 'heat-thirds')[0].textContent, '🔥 Tyngdepunkt (groft): egen tredjedel 0 % · midten 33 % · angrebstredjedelen 67 %');
  // Hjemme: 10 punkter uden målmand – angreb 7 (hA ×7), midten 2 (hB billede + mål), egen tredjedel 1 (hB 60,80) → 10 · 20 · 70 %
  const mineAway = render(mOf(), base.awayId).el, u = tables(mineAway);
  assert.equal(byId(u[1], 'heat-thirds').length, 0); assert.equal(byId(u[0], 'heat-thirds').length, 1);
  assert.equal(byId(u[0], 'heat-thirds')[0].textContent, '🔥 Tyngdepunkt (groft): egen tredjedel 10 % · midten 20 % · angrebstredjedelen 70 %');
  // Ingen spor (en gammel kamp): ingen heat map, ingen linje
  const { trace: _t, ...old } = mOf();
  const o = render(old, base.homeId).el;
  assert.equal(byId(o, 'heat-btn').length, 0); assert.equal(byId(o, 'heat-thirds').length, 0);
});

test('holdets heat map: felterne (6×9) med den rigtige placering og styrke (tætteste = 0,85), uden målmand; prikkerne med udfald, sted og tekst; noten tæller dem', () => {
  const { el } = render(mOf(), base.homeId, { heat: { playerId: null } });
  assert.equal(byId(el, 'heat-pitch').length, 1, 'kun ét kort (dit hold)');
  assert.equal(byId(el, 'heat-title')[0].textContent, '🔥 Holdet (uden målmand)');
  assert.equal(byId(el, 'heat-team').length, 0); assert.equal(byId(el, 'heat-back').length, 1);
  const cells = all(el, (x) => cls(x, 'heat-cell'));
  // Felterne (række, søjle): hA(10,10)→(0,0)·1  hA(20,20)×4→(1,1)·4 hA(12,30)+hA(11,31)→(2,0)·2  hB(55,50)→(4,3)·1  hB(60,60)→(5,3)·1  hB(60,80)→(7,3)·1
  assert.equal(cells.length, 6);
  const at = (r, c) => cells.find((x) => x.style.left === `${(c * 100) / 6}%` && x.style.top === `${(r * 100) / 9}%`);
  for (const [r, c] of [[0, 0], [1, 1], [2, 0], [4, 3], [5, 3], [7, 3]]) assert.ok(at(r, c), `felt (${r}, ${c})`);
  assert.ok(cells.every((x) => x.style.width === `${100 / 6}%` && x.style.height === `${100 / 9}%`));
  assert.equal(at(1, 1).style.opacity, '0.85', 'tætteste felt: 0,15 + 1 · 0,7');
  assert.ok(Number(at(0, 0).style.opacity) < Number(at(2, 0).style.opacity) && Number(at(2, 0).style.opacity) < 0.85);
  assert.equal(all(el, (x) => x.style.left === `${(3 * 100) / 6}%` && x.style.top === `${(8 * 100) / 9}%`).length, 0, 'målmandens felt (række 8, søjle 3) er tomt');
  // Prikkerne: hA's afslutninger i hold-koordinater; 7 øjeblikke → 6 til hjemmeholdet (udeholdets forbi hører ikke med i DIT kort).
  // v3.16.1: modstanderens zone-kort (heat-opp) har sine egne prikker – udeholdets forbi (90, 90) står dér, ikke i dit kort.
  const dots = all(byId(el, 'heat-pitch')[0], (x) => cls(x, 'heat-shot'));
  assert.deepEqual(all(byId(el, 'heat-opp')[0], (x) => cls(x, 'heat-shot')).map((d) => [d.className, d.style.left, d.style.top]), [['heat-shot miss', '90%', '90%']]);
  assert.deepEqual(dots.map((d) => [d.className, d.style.left, d.style.top, d.textContent, d.attrs.title]), [
    ['heat-shot goal', '12%', '30%', '⚽', "3' mål"], ['heat-shot save', '11%', '31%', '●', "6' redning"], ['heat-shot miss', '20%', '20%', '●', "9' forbi/blokeret"],
    ['heat-shot offside', '20%', '20%', '●', "12' offside (flag)"], ['heat-shot disallowed', '20%', '20%', '●', "15' annulleret af VAR"], ['heat-shot miss', '20%', '20%', '●', "21' forbi/blokeret"]]);
  assert.equal(byId(el, 'heat-note')[0].textContent, 'Angriber opad. Farven: hvor holdet stod i kampens 1 øjebliksbilleder og afslutninger. Prikker: 1 mål, 1 reddet, 2 forbi/blokeret, 1 offside, 1 annulleret. Klik på en spiller i listen.');
  // Knapperne
  const { el: e2, calls } = render(mOf(), base.homeId, { heat: { playerId: null } });
  byId(e2, 'heat-back')[0].handlers.click(); assert.deepEqual(calls.heat, [null]);
});

test('en spillers heat map: hans felter og prikker (afslutninger OG oplæg på hans plads), titlen med nummer og navn, "Holdet"-knap og tilbage; noten uden listeklik-opfordring', () => {
  const { el, calls } = render(mOf(), base.homeId, { heat: { playerId: id(hB) } });
  assert.equal(byId(el, 'heat-title')[0].textContent, `🔥 #${hB.shirtNumber} ${hB.shortName}`);
  const cells = all(el, (x) => cls(x, 'heat-cell'));
  // hB: (55,50)→(4,3), (60,60)→(5,3), (60,80)→(7,3) – alle lige stærke
  assert.equal(cells.length, 3); assert.ok(cells.every((x) => x.style.opacity === '0.85'));
  const dots = all(byId(el, 'heat-pitch')[0], (x) => cls(x, 'heat-shot'));   // kun dit kort (modstanderens zone-kort har sine egne)
  assert.deepEqual(dots.map((d) => [d.className, d.style.left, d.style.top, d.textContent, d.attrs.title]), [['heat-shot assist', '60%', '60%', '🅰', "3' oplæg"]]);
  assert.equal(byId(el, 'heat-note')[0].textContent, 'Angriber opad. Farven: hvor han stod i kampens 1 øjebliksbilleder og afslutninger. Prikker: 0 mål, 0 reddet, 0 forbi/blokeret, 1 oplæg.');
  byId(el, 'heat-team')[0].handlers.click(); byId(el, 'heat-back')[0].handlers.click();
  assert.deepEqual(calls.heat, [{ playerId: null }, null]);
  // Målmanden som "spiller": hans eget kort tæller hans placeringer (række 8, søjle 3)
  const g = render(mOf(), base.homeId, { heat: { playerId: id(hGk) } }).el;
  const gc = all(g, (x) => cls(x, 'heat-cell'));
  assert.equal(gc.length, 1); assert.equal(gc[0].style.top, `${(8 * 100) / 9}%`);
  assert.match(byId(g, 'heat-note')[0].textContent, /Prikker: ingen afslutninger\.$/);
  // En spiller uden afslutninger: ingen prikker
  assert.equal(all(byId(render(mOf(), base.homeId, { heat: { playerId: id(aA) } }).el, 'heat-pitch')[0], (x) => cls(x, 'heat-shot')).length, 0, 'modstanderens spiller findes ikke i dit kort');
});

test('rækkerne i dit ark: med et heat map åbent kan hver spiller vælges (klik → hans kort; samme spiller igen → holdet), den valgte er markeret; uden kort og i modstanderens ark er rækkerne ikke klikbare', () => {
  const team = render(mOf(), base.homeId, { heat: { playerId: null } });
  const t = tables(team.el);
  rowOf(t[0], hA).handlers.click(); assert.deepEqual(team.calls.heat, [{ playerId: id(hA) }]);
  assert.ok(all(t[0], (r) => cls(r, 'heat-sel')).length === 0, 'ingen valgt endnu');
  assert.equal(rowOf(t[1], aA).handlers.click, undefined, 'modstanderens rækker er ikke klikbare');
  const one = render(mOf(), base.homeId, { heat: { playerId: id(hA) } });
  const u = tables(one.el);
  assert.equal(all(u[0], (r) => cls(r, 'heat-sel')).length, 1, 'præcis én valgt række');
  assert.ok(cls(rowOf(u[0], hA), 'heat-sel') && !cls(rowOf(u[0], hB), 'heat-sel'));
  rowOf(u[0], hA).handlers.click(); rowOf(u[0], hB).handlers.click();
  assert.deepEqual(one.calls.heat, [{ playerId: null }, { playerId: id(hB) }], 'samme spiller igen → holdet; en anden → ham');
  assert.equal(rowOf(u[0], hA).attrs.title, 'Vis hans heat map');
  // Uden kort: ingen klikbare rækker
  const off = render(mOf(), base.homeId);
  assert.equal(rowOf(tables(off.el)[0], hA).handlers.click, undefined); assert.ok(!rowOf(tables(off.el)[0], hA).attrs.title);
});

test('målmanden i holdets kort: kendes han ikke (ingen række med rollen GK), tæller hans felt med; kendes han, er han udeladt (se ovenfor)', () => {
  const m = mOf(); m.ratings = { home: base.ratings.home.map((e) => (e === hGk ? { ...e, role: 'DEF' } : e)), away: base.ratings.away };
  const noGk = render(m, base.homeId, { heat: { playerId: null } }).el;
  assert.equal(all(noGk, (x) => cls(x, 'heat-cell')).length, 7, 'uden at kende målmanden tæller hans felt (række 8, søjle 3) med: 6 + 1');
});

test('🎬 i referatet: en knap ved hver afslutning, og et klik giver (kampen, hændelsens indeks) – og ingen under live', () => {
  const m = mOf();
  const { el, calls } = render(m, base.homeId);
  const feed = byId(el, 'feed')[0];
  const rows = all(feed, (r) => cls(r, 'ev'));
  const films = all(feed, (x) => cls(x, 'replay-btn'));
  assert.equal(films.length, 7, 'syv afslutninger i sporet');
  for (const f of films) f.handlers.click();
  assert.ok(calls.replay.every(([mm]) => mm === m), 'kampen sendes med');
  assert.deepEqual(calls.replay.map(([, i]) => i), [7, 6, 5, 4, 3, 2, 1], 'referatet er nyeste først; hver knap sender SIN hændelses indeks');
  // Hver knap står i rækken for sin hændelse
  for (const [, i] of calls.replay) { const row = rows.find((r) => all(r, (x) => cls(x, 'replay-btn')).length && r.textContent.startsWith(`${m.events[i].min}'`) && r.textContent.includes(m.events[i].text)); assert.ok(row, `række for hændelse ${i}`); }
  assert.equal(rows.filter((r) => all(r, (x) => cls(x, 'replay-btn')).length === 0).length, m.events.length - 7, 'andre hændelser har ingen 🎬');
  // Under live: ingen
  const live = render(m, base.homeId, { playing: true, shownCount: m.events.length });
  assert.equal(all(live.el, (x) => cls(x, 'replay-btn')).length, 0);
});

test('afspilningen kender dit hold: dine brikker er markeret, modstanderens ikke – hjemme og ude, og ingen for en fremmed seer', () => {
  for (const [mine, home, away] of [[base.homeId, true, false], [base.awayId, false, true], ['ingen', false, false]]) {
    const { el } = render(base, mine);
    const toks = all(el, (x) => cls(x, 'rp-token'));
    assert.ok(toks.length >= 14);
    assert.equal(toks.filter((x) => cls(x, 'home')).every((x) => cls(x, 'own') === home), true, `hjemme (seer ${mine === base.homeId ? 'hjemme' : mine === base.awayId ? 'ude' : 'fremmed'})`);
    assert.equal(toks.filter((x) => cls(x, 'away')).every((x) => cls(x, 'own') === away), true, 'ude');
  }
});

test('modstanderens zone-kort (v3.16.1, QC): "Dit mål" og "din side" KUN i kampen mod dit hold – i rundens andre kampe neutral tekst', () => {
  const goals = (el) => all(el, (x) => cls(x, 'zone-goal')).map((x) => x.textContent);
  const notes = (el) => byId(el, 'heat-opp-note').map((x) => x.textContent);
  const mine = render(mOf(), base.homeId).el;
  assert.deepEqual(goals(mine), ['Deres mål', 'Dit mål']);
  assert.equal(notes(mine).length, 1); assert.match(notes(mine)[0], /^Set fra din side: de angriber nedad mod dit mål/);
  // v3.16.3 (én retningsregel som afspilningen): i en kamp uden dit hold angriber hjemmeholdet OPAD (kortet vendt, målmærkerne
  // byttet: deres mål nederst) og udeholdet nedad
  const other = render(mOf(), 'ingen-af-dem').el;
  assert.deepEqual(goals(other), ['Modstanderens mål', 'Deres mål', 'Deres mål', 'Modstanderens mål']);
  assert.equal(notes(other).length, 2);
  assert.match(notes(other)[0], /^De angriber opad\./); assert.match(notes(other)[1], /^De angriber nedad\./);
  for (const t of notes(other)) assert.doesNotMatch(t, /din|dit/i);
  // Du er ude: hjemmeholdet er modstanderen og angriber nedad mod dit mål
  const away = render(mOf(), base.awayId).el;
  assert.deepEqual(goals(away), ['Deres mål', 'Dit mål']); assert.match(notes(away)[0], /^Set fra din side: de angriber nedad mod dit mål/);
});

// v3.16.3 (QC: kortene i samme ark vendte modsat): startopstillingen under modstanderens zone-kort vender som kortet – nedad
// (spejlet: x → 100 − x, y → 100 − y) – og dit hold opad; i en kamp uden dit hold hjemme opad, ude nedad. Tallene i hånden:
// GK (50, 90): opad 90 → 97, nedad 10 → 3; LB (15, 70): opad (15, 73,5), nedad (85, 30 → 26,5).
test('startopstillingen (miniPitch) vender som zone-kortet: modstanderen nedad, dit hold opad; neutral kamp hjemme opad, ude nedad', () => {
  const pos = (table, r) => { const t = all(table, (x) => cls(x, 'mp-token')).find((x) => x.attrs.title?.startsWith(`${r} – `)); return t && [t.style.left, t.style.top]; };
  const UP = { GK: ['50%', '97%'], LB: ['15%', '73.5%'] }, DOWN = { GK: ['50%', '3%'], LB: ['85%', '26.5%'] };
  assert.deepEqual([base.startFormations.home, base.startFormations.away], ['4-4-2', '4-4-2'], 'data: begge i 4-4-2');
  for (const [viewer, home, away] of [[base.homeId, UP, DOWN], [base.awayId, DOWN, UP], ['ingen-af-dem', UP, DOWN]]) {
    const t = tables(render(mOf(), viewer).el);
    for (const r of ['GK', 'LB']) {
      assert.deepEqual(pos(t[0], r), home[r], `${viewer} hjemme ${r}`);
      assert.deepEqual(pos(t[1], r), away[r], `${viewer} ude ${r}`);
    }
  }
});
