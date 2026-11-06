// v3.32.3 Test Manager (samspil på Taktik). Byggerens suite (chemistry-v3323.test.mjs + e2e-blokken) lod ~40 af ~145 mutanter overleve:
// seed-reglens "over seedet"-gren og manglende par, bænk-målmand, to ens naboer, skadet (grænsen 1) / skadet+udelukket / skadet målmand,
// "ca. N kampe" ved et snit hvor båndet aldrig nås (60), min-af-naboer, svagest ved 2 naboer, tre "kender også", gamesToSettle-loftet,
// fokus på målmanden (data-focus="0" dæmpede ALLE streger uden en fokuslinje), isOwn-vagten i pitch, og hele Plads-cellen i lineup-list
// (+N −M, op/ned-klasse, title/aria-label, bænk⇄reserve uden tekst, preview = null, ingen række for den valgte).
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.classList = { add: (c) => { this.className += ' ' + c; }, toggle() {} }; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'class') this.className = v; }
  addEventListener() {}
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t), createElementNS: (ns, t) => new FakeEl(t) };
const { partnersOf, focusChemText, lineupPairs, gamesToSettle, pairKey, bandOf, K_GAIN, LEAK, STRANGER, BAND_RANK } = await import('../../public/engine/chemistry.js');
const { matchBenchOf, reservesOf } = await import('../../public/engine/career.js');
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { renderPitch } = await import('../../public/ui/pitch.js');
const { renderLineupList } = await import('../../public/ui/lineup-list.js');
const { neighbourPairs } = await import('../../public/engine/chemistry.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const REF = 78;
function fixture() {
  const L = createLeague(createRng(3)), t = L.teams.find((x) => !x.isBot);
  t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {};
  if (!Array.isArray(t.matchBench)) t.matchBench = matchBenchOf(t).map((p) => p.id);
  const s = t.tactics.lineupSlots, set = (a, b, v, r) => { t.chemistry[pairKey(a, b)] = [v, r]; };
  t.chemistry = {};
  const field = t.squad.filter((p) => p.position !== 'GK');
  for (const x of field) for (const y of field) if (x.id < y.id) set(x.id, y.id, 78, 0);   // seedet på runde 0
  const bench = matchBenchOf(t).filter((p) => p.position !== 'GK').map((p) => p.id);
  const sh = (id) => { const p = t.squad.find((x) => x.id === id); return `#${p.shirtNumber} ${p.shortName}`; };
  const slotsNb = (i) => neighbourPairs('4-4-2').filter(([a, b]) => a === i || b === i).map(([a, b]) => (a === i ? b : a));
  return { L, t, s, set, bench, sh, slotsNb, F: s[6] };
}
// Et uafhængigt orakel for gamesToSettle (samme model som chemistry.js, skrevet her): kampe fra v til bånd `to`, 60 = nås aldrig
function oracleGames(ref, from, to) {
  let v = from, n = 0;
  while (BAND_RANK[bandOf(v, ref)] < BAND_RANK[to] && n < 60) { v = v + K_GAIN * (100 - v); v = v - LEAK * (v - STRANGER); n++; }
  return n;
}

test('gamesToSettle: orakel for flere (fra, til, snit), også hvor det tager 30–59 kampe (grænsen 60 må ikke sænkes) og hvor båndet aldrig nås (60)', () => {
  const seen = new Set();
  for (const ref of [70, 78, 82, 85, 90, 99]) for (const from of [30, 45, 62, 74, 78, 84]) for (const to of ['finder', 'sammen', 'staerkt']) {
    const n = gamesToSettle(ref, from, to); assert.equal(n, oracleGames(ref, from, to), `${ref}/${from}/${to}`);
    seen.add(n >= 30 && n < 60 ? 'mellem' : n === 60 ? 'aldrig' : n === 0 ? 'nul' : 'kort');
  }
  assert.deepEqual([...seen].sort(), ['aldrig', 'kort', 'mellem', 'nul'].sort(), 'data: alle fire slags svar kommer med');
  assert.equal(gamesToSettle(REF), oracleGames(REF, STRANGER, 'sammen'));
  assert.notEqual(gamesToSettle(REF), gamesToSettle(REF, STRANGER, 'staerkt'), 'standard-"til" er spillet sammen');
});

test('seed-reglen: et par på seed-runden men OVER seedet (84) har spillet; et par på seed-runden på 78 har ikke; manglende par kaster ikke', () => {
  const { t, F, bench, set, sh } = fixture();
  set(F, bench[0], 84, 0);   // på seed-runden (0), men over 78 – tæller som spillet sammen
  set(F, bench[1], 78, 0);   // rent seedet – tæller ikke
  delete t.chemistry[pairKey(F, bench[2])];   // intet par overhovedet (en nykøbt) – må hverken kaste eller tælle
  const f = partnersOf(t, REF, F);
  assert.deepEqual(f.others.map((x) => [x.p.id, x.band]), [[bench[0], 'staerkt']]);
  assert.ok(focusChemText(t, REF, F).includes(`Kender også ${sh(bench[0])} (stærkt, bænk)`));
});

test('bænk-målmand: ingen naboer og ingen "kender også", trods et par i tabellen; skadet målmand får status', () => {
  const { t, s, F, set } = fixture();
  let gk = t.squad.find((p) => p.position === 'GK' && !s.includes(p.id));
  if (!gk) { gk = t.squad.find((p) => !s.includes(p.id)); gk.position = 'GK'; }
  set(gk.id, F, 92, 4);
  const g = partnersOf(t, REF, gk.id);
  assert.equal(g.isGK, true); assert.deepEqual(g.others, []); assert.deepEqual(g.neighbours, []);
  assert.equal(focusChemText(t, REF, gk.id), '🤝 Målmanden indgår ikke i samspil.');
  gk.injuryMatchesLeft = 1;
  assert.equal(focusChemText(t, REF, gk.id), '🤝 (skadet – spiller ikke) Målmanden indgår ikke i samspil.', 'status også på målmanden');
});

test('status: skadet (også 1 kamp), udelukket, og begge – skadet står først; ingen status når raskt', () => {
  const { t, s } = fixture();
  const p = t.squad.find((x) => x.id === s[3]);
  const start = (txt) => txt.startsWith.bind(txt);
  p.injuryMatchesLeft = 1; p.banMatches = 0;
  assert.ok(focusChemText(t, REF, p.id).startsWith('🤝 (skadet – spiller ikke) Alle'), focusChemText(t, REF, p.id));
  p.injuryMatchesLeft = 1; p.banMatches = 2;
  assert.ok(focusChemText(t, REF, p.id).startsWith('🤝 (skadet – spiller ikke) Alle'), 'begge: skadet først');
  p.injuryMatchesLeft = 0; p.banMatches = 1;
  assert.ok(focusChemText(t, REF, p.id).startsWith('🤝 (udelukket) Alle'));
  p.banMatches = 0;
  assert.ok(focusChemText(t, REF, p.id).startsWith('🤝 Alle hans naboer'), 'ingen status når han er rask');
  void start;
});

test('to ens naboer = "Alle hans naboer"; to forskellige = "Med naboerne" med svagest; ca. N kampe er MINIMUM over naboerne', () => {
  const { t, s, set, sh, slotsNb } = fixture();
  const lb = s[1], nbs = slotsNb(1).filter((i) => i !== 0);
  assert.equal(partnersOf(t, REF, lb).neighbours.length, 2, `data: LB har to læste naboer (${nbs})`);
  const [n1, n2] = partnersOf(t, REF, lb).neighbours.map((x) => x.mate.id);
  set(lb, n1, 62, 5); set(lb, n2, 62, 5);   // begge finder hinanden
  const same = focusChemText(t, REF, lb);
  assert.equal(same, `🤝 Alle hans naboer: finder hinanden – samspil vokser kampe side om side (ca. ${oracleGames(REF, 62, 'sammen')} kampe til spillet sammen)`);
  set(lb, n1, 62, 5); set(lb, n2, 30, 5);   // finder hinanden + fremmede: forskellige bånd, ingen stærke
  const a = oracleGames(REF, 62, 'staerkt'), b = oracleGames(REF, 30, 'staerkt');
  assert.ok(a !== b && a < b, `data: de to naboer har forskelligt antal kampe (${a} / ${b})`);
  const diff = focusChemText(t, REF, lb);
  assert.ok(diff.startsWith(`🤝 Med naboerne: `), diff);
  assert.ok(diff.includes(` · svagest: ${sh(n2).split(' ')[0]} · Ingen stærke par endnu – ca. ${a} kampe mere side om side`), diff);   // minimum (a), ikke maksimum (b)
});

test('snit hvor båndet aldrig nås: ingen "ca. 60 kampe" og ingen "ca. null" – hverken ved "Alle hans naboer" eller "Ingen stærke par"', () => {
  const { t, s, set, slotsNb } = fixture();
  const lb = s[1], [n1, n2] = partnersOf(t, 99, lb).neighbours.map((x) => x.mate.id);
  assert.equal(gamesToSettle(99, 80, 'staerkt'), 60, 'data: stærkt nås aldrig ved snit 99');
  set(lb, n1, 80, 5); set(lb, n2, 30, 5);   // finder hinanden + fremmede ved snit 99
  assert.equal(bandOf(80, 99), 'finder');
  const t1 = focusChemText(t, 99, lb);
  assert.ok(t1.endsWith(' · Ingen stærke par endnu'), t1);
  assert.ok(!/ca\.|null|60/.test(t1), t1);
  const k = slotsNb(1); void k;
  set(lb, n1, 30, 5); set(lb, n2, 30, 5);   // alle fremmede; "sammen" nås ved snit 99? (ellers 60)
  const t2 = focusChemText(t, 99, lb), g = gamesToSettle(99, 30, 'sammen');
  assert.ok(g === 60 ? !/ca\.|null/.test(t2) : t2.includes(`(ca. ${g} kampe til spillet sammen)`), `${g}: ${t2}`);
  // et snit hvor "sammen" ikke nås: finder man ét
  let ref = null; for (const r of [90, 95, 99, 100]) if (gamesToSettle(r, 30, 'sammen') === 60) { ref = r; break; }
  if (ref) { const t3 = focusChemText(t, ref, lb); assert.ok(t3.includes('side om side') && !/ca\.|null/.test(t3), t3); }
});

test('"kender også": højst de to stærkeste – tre kandidater giver to', () => {
  const { t, F, bench, set, sh } = fixture();
  set(F, bench[0], 90, 4); set(F, bench[1], 70, 4); set(F, bench[2], 66, 4);   // stærkt, finder, finder
  const txt = focusChemText(t, REF, F);
  assert.ok(txt.includes(`Kender også ${sh(bench[0])} (stærkt, bænk) og ${sh(bench[1])} (finder hinanden, bænk) – vælg en af hans naboer, klik så på ${sh(bench[0]).split(' ')[0]} eller ${sh(bench[1]).split(' ')[0]}`), txt);
  assert.ok(!txt.includes(sh(bench[2])), 'den tredje står ikke');
});

// ---------- tavlen (pitch.js): fokus, dæmpning, naboring, kun dit hold ----------
const pitchOf = (t, ui, isOwn = true, ref = REF) => renderPitch({ team: t, isOwn, ui, pairs: isOwn ? lineupPairs(t, ref) : lineupPairs(t, ref), onMove() {}, onSelect() {}, onTokenSwap() {} });
const lines = (el) => all(el, (e) => e.tag === 'line');
const svgOf = (el) => all(el, (e) => e.tag === 'svg')[0] ?? null;
const tokens = (el) => all(el, (e) => e.dataset.slot !== undefined && /^token/.test(e.className));

test('pitch: fokus på CM — præcis hans 4 læste par har .focus, svg data-focus="6", naboringe i båndets farve; ingen fokus uden valg, på målmanden, på en bænkspiller eller på et modstanderhold', () => {
  const { t, s, F, bench, set } = fixture();
  set(F, s[2], 84, 5); set(F, s[5], 74, 5); set(F, s[7], 62, 5); delete t.chemistry[pairKey(F, s[9])];
  const pairs = lineupPairs(t, REF);
  const el = pitchOf(t, { pitchSwapId: F });
  const ls = lines(el), foc = ls.filter((l) => / focus$/.test(l.attrs.class)).map((l) => l.dataset.pair).sort();
  assert.deepEqual(foc, ['2-6', '5-6', '6-7', '6-9']);
  assert.equal(ls.length, pairs.length);
  assert.equal(svgOf(el).dataset.focus, '6');
  assert.deepEqual(tokens(el).filter((x) => / mate /.test(x.className + ' ')).map((x) => `${x.dataset.slot}:${x.className.match(/mate-(\w+)/)[1]}`).sort(), ['2:staerkt', '5:sammen', '7:finder', '9:fremmede']);
  assert.ok(tokens(el).every((x) => x.className.includes('swapping') === (x.dataset.slot === '6')), 'kun CM er "swapping"');
  // bånd-klassen følger parrets bånd (ikke en fast farve)
  assert.ok(ls.find((l) => l.dataset.pair === '2-6').attrs.class.startsWith('chem chem-staerkt'));
  assert.ok(ls.find((l) => l.dataset.pair === '6-9').attrs.class.startsWith('chem chem-fremmede'));
  // ingen valg
  const e0 = pitchOf(t, {}); assert.equal(svgOf(e0).dataset.focus, undefined); assert.equal(lines(e0).filter((l) => / focus/.test(l.attrs.class)).length, 0); assert.equal(tokens(e0).filter((x) => x.className.includes('mate')).length, 0);
  // målmanden (plads 0): ingen par læses -> ingen fokus og INTET dæmpet (data-focus ville dæmpe alle streger)
  const eg = pitchOf(t, { pitchSwapId: s[0] }); assert.equal(svgOf(eg).dataset.focus, undefined, 'GK: ingen data-focus'); assert.equal(tokens(eg).filter((x) => x.className.includes('mate')).length, 0);
  // bænkspiller: ikke på banen
  const eb = pitchOf(t, { pitchSwapId: bench[0] }); assert.equal(svgOf(eb).dataset.focus, undefined); assert.equal(lines(eb).filter((l) => / focus/.test(l.attrs.class)).length, 0); assert.equal(tokens(eb).filter((x) => x.className.includes('mate')).length, 0);
  // modstanderhold: ingen streger, ingen ring, selv om der gives par
  const eo = pitchOf(t, { pitchSwapId: F }, false);
  assert.equal(svgOf(eo), null, 'modstander: ingen streger'); assert.equal(tokens(eo).filter((x) => x.className.includes('mate')).length, 0);
});

// ---------- Plads-cellen (lineup-list.js) ----------
test('lineup-list: forhåndsvisningen i Plads-cellen — "🤝 +N −M" med grønt op og rødt ned, title/aria-label/data, INTET ved ±0 / for den valgte / bænk⇄reserve / uden preview', () => {
  const { t, s } = fixture();
  const sel = s[6], rowIds = t.squad.map((p) => p.id);
  const table = {};
  const kinds = [{ kind: 'swap', up: 2, down: 1, changes: ['A: finder hinanden → stærkt', 'B: stærkt → spillet sammen', '… og 1 til'] }, { kind: 'swap', up: 1, down: 0, changes: ['A: fremmede → finder hinanden'] },
    { kind: 'swap', up: 0, down: 2, changes: ['A: stærkt → finder hinanden'] }, { kind: 'swap', up: 0, down: 0, changes: [] }, { kind: 'bench', up: 0, down: 0, changes: [] }, null];
  rowIds.filter((id) => id !== sel).forEach((id, i) => { table[id] = kinds[i % kinds.length]; });
  const asked = [];
  const render = (ui, preview) => renderLineupList({ team: t, isOwn: true, ui: { listLine: 'all', ...ui }, onPick() {}, onSort() {}, onBlocked() {}, onLine() {}, onInfo() {}, preview });
  const cellOf = (list, id) => all(list, (e) => e.tag === 'tr' && e.dataset.pid === id)[0].children[0];
  const prevOf = (list, id) => all(cellOf(list, id), (e) => /lp-prev/.test(e.className))[0] ?? null;
  const list = render({ swapId: sel }, (p) => { asked.push(p.id); return table[p.id]; });
  assert.ok(!asked.includes(sel), 'forhåndsvisningen spørges ikke for den valgte række');
  assert.ok(prevOf(list, sel) === null);
  // tekst → [grønne tal, røde tal, ændringer]
  const want = { '🤝 +2 −1': [['+2'], ['−1'], 'A: finder hinanden → stærkt · B: stærkt → spillet sammen · … og 1 til'], '🤝 +1': [['+1'], [], 'A: fremmede → finder hinanden'], '🤝 −2': [[], ['−2'], 'A: stærkt → finder hinanden'] };
  const got = new Map();
  for (const id of rowIds.filter((x) => x !== sel)) {
    const k = table[id], sp = prevOf(list, id);
    if (!k || k.kind === 'bench' || (!k.up && !k.down)) { assert.equal(sp, null, `ingen tekst for ${k ? `${k.kind} ${k.up}/${k.down}` : 'null'}`); continue; }
    const txt = sp.textContent; got.set(txt, true);
    assert.ok(want[txt], txt);
    const [ups, downs, ch] = want[txt];
    assert.equal(sp.className, 'lp-prev', 'selve mærket er neutralt – farven sidder på tallene');
    assert.deepEqual(all(sp, (e) => e.className === 'up').map((e) => e.textContent), ups, `grønt i ${txt}`);
    assert.deepEqual(all(sp, (e) => e.className === 'down').map((e) => e.textContent), downs, `rødt i ${txt}`);
    const tip = `Byt: 🤝 ${ch}`;
    assert.equal(sp.attrs.title, tip); assert.equal(sp.attrs['aria-label'], tip); assert.equal(sp.dataset.changes, ch);
    assert.ok(cellOf(list, id).className.includes('lp-place') && cellOf(list, id).children.includes(sp), 'i Plads-cellen');
  }
  assert.deepEqual([...got.keys()].sort(), Object.keys(want).sort(), 'data: alle tre slags tekst kommer med');
  assert.ok(!all(list, (e) => /lp-prev/.test(e.className)).some((e) => e.textContent.includes('±0')), 'aldrig "±0"');
  // intet valgt: preview spørges aldrig; preview = null med valgt: ingen fejl og ingen tekst
  let calls = 0;
  const l2 = render({ swapId: null }, () => { calls++; return { kind: 'swap', up: 1, down: 0, changes: [] }; });
  assert.equal(calls, 0); assert.equal(all(l2, (e) => /lp-prev/.test(e.className)).length, 0);
  const l3 = render({ swapId: sel }, null); assert.equal(all(l3, (e) => /lp-prev/.test(e.className)).length, 0);
});

test('naboer, der ikke spiller: "(skadet)" og "(udelukket)" efter båndet; en rask nabo uden mærke; ingen "Alle hans naboer", når én er ude', () => {
  const { t, s, F, set, sh } = fixture();
  set(F, s[2], 84, 5); set(F, s[5], 84, 5); set(F, s[7], 84, 5); set(F, s[9], 84, 5);
  assert.equal(focusChemText(t, REF, F).split(' · ')[0], '🤝 Alle hans naboer: stærkt', 'data: alle stærkt');
  t.squad.find((p) => p.id === s[2]).injuryMatchesLeft = 1; t.squad.find((p) => p.id === s[7]).banMatches = 1;
  t.squad.find((p) => p.id === s[5]).injuryMatchesLeft = 1; t.squad.find((p) => p.id === s[5]).banMatches = 1;   // begge: skadet står
  const txt = focusChemText(t, REF, F);
  assert.ok(txt.startsWith(`🤝 Med naboerne: ${sh(s[2])} stærkt (skadet) · ${sh(s[5])} stærkt (skadet) · ${sh(s[7])} stærkt (udelukket) · ${sh(s[9])} stærkt · svagest`), txt);
  assert.ok(!txt.includes(`${sh(s[9])} stærkt (`), 'rask nabo: intet mærke');
  assert.ok(!txt.startsWith('🤝 (') , 'den valgte selv er rask');
});
test('naboerne står stærkeste FØRST uanset pladsrækkefølgen (byggerens fixture var tilfældigt allerede faldende: plads 2 > 5 > 7 > 9)', () => {
  const { t, s, F, set, sh } = fixture();
  set(F, s[2], 62, 5); set(F, s[5], 90, 5); set(F, s[7], 74, 5); delete t.chemistry[pairKey(F, s[9])];
  assert.deepEqual(partnersOf(t, REF, F).neighbours.map((x) => x.mate.id), [s[5], s[7], s[2], s[9]], 'faldende værdi, ikke faldende plads');
  assert.ok(focusChemText(t, REF, F).startsWith(`🤝 Med naboerne: ${sh(s[5])} stærkt · ${sh(s[7])} spillet sammen · ${sh(s[2])} finder hinanden · ${sh(s[9])} fremmede`));
});
