// v3.24.2 Test Manager: ledningen i commitRound (rapporten skrives efter chemRef, snapshot før kampene, kun dit hold), rapporten
// trainingSummary (kun-strong, rækkefølge, linket) og tekstgrænserne i strongLines (3 vs 4, ned 2–3 vs 4+, delvis ukendte par).
// Forfatterens tests dækkede strongChanges alene og commitRound kun som "hvert op er stærkt nu" – ikke at snapshot/ref/rækkefølge er rigtige.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.on = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; }
  addEventListener(t, f) { this.on[t] = f; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { strongLines: SL, trainingSummary } = await import('../../public/ui/card.js');
// v3.24.2 (QC): strongLines giver { up, down } – her som én liste, op først
const strongLines = (t, x) => { const r = SL(t, x); return [...r.up, ...r.down]; };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { playRound, commitRound } = await import('../../public/engine/season.js');
const { lineupPairs, pairKey, bandOf } = await import('../../public/engine/chemistry.js');

const own = (L) => L.teams.find((t) => !t.isBot);
const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };

// ---------- ledningen i commitRound: uafhængigt orakel (værdier før/efter fra selve chemistry-tabellen, ligaens NYE snit) ----------
function oracleRound(seed, nRounds, staleRef = null) {
  const L = createLeague(createRng(seed)), rng = createRng(seed * 7 + 1), me = own(L);
  for (let r = 0; r < nRounds; r++) commitRound(L, playRound(L, rng), rng);   // runde ≥ 3: ABSENT_ROUNDS-faldet kan ramme par uden fælles kamp
  // Dit holds 12 opstillingspar får værdier fra 79,5 til 85 (stærkt ved ligaens snit ≈ 80 ligger omkring 82–83: nogle krydser op i runden,
  // andre er stærke før); sidste fælles runde 0 = "ikke spillet sammen" for dem, der ikke når ind på banen sammen
  lineupPairs(me, 78).forEach((x, i) => { me.chemistry[pairKey(x.a.id, x.b.id)] = [79.5 + 0.5 * i, 0]; });
  if (staleRef != null) L.leagueMetadata.chemRef = staleRef;   // et gemt snit fra før runden – commitRound skal sætte et nyt, før rapporten skrives
  const res = playRound(L, rng);
  // En bænkspiller ind på plads 2 EFTER simuleringen: hans par i opstillingen har ikke spillet sammen i runden (last = 0) og står på 84
  // (stærkt før); ABSENT_ROUNDS-faldet (−5) og lækagen trækker dem ned under grænsen
  const slots = me.tactics.lineupSlots, starters = new Set(slots), x = me.squad.find((p) => p.position !== 'GK' && !starters.has(p.id));
  slots[2] = x.id;
  for (const pr of lineupPairs(me, 78)) if (pr.a.id === x.id || pr.b.id === x.id) me.chemistry[pairKey(pr.a.id, pr.b.id)] = [84, 0];
  const before = structuredClone(me.chemistry), round = res.round;
  commitRound(L, res, rng);
  const ref = L.leagueMetadata.chemRef, got = L.trainingReport[me.id].strong;
  const exp = { up: [], down: [] };
  for (const pr of lineupPairs(me, ref)) {
    const k = pairKey(pr.a.id, pr.b.id);
    if (!before[k]) continue;
    const was = bandOf(before[k][0], ref) === 'staerkt', now = pr.band === 'staerkt', together = me.chemistry[k]?.[1] === round;
    if (now && !was && together) exp.up.push([pr.a.id, pr.b.id]); else if (was && !now && !together) exp.down.push([pr.a.id, pr.b.id]);
  }
  return { L, me, got, exp, ref };
}

test('commitRound: rapportens strong = det uafhængige orakel – op OG ned, mod ligaens nye snit, snapshot før kampene (data i begge lister)', () => {
  let up = 0, down = 0;
  for (const seed of [1, 2, 3, 4]) {
    const { got, exp } = oracleRound(seed, 3);
    assert.deepEqual(got, exp, `seed ${seed}`);
    up += got.up.length; down += got.down.length;
  }
  // data: uden dem er ligheden ovenfor tom = tom
  assert.ok(up > 0, 'mindst ét "op" i fixturet'); assert.ok(down > 0, 'mindst ét "ned" i fixturet');
});

test('commitRound: gemt chemRef er forældet (60) – rapporten bruger det NYE snit, ikke det gamle (rapporten skrives efter chemRef sættes)', () => {
  // Ved snit 60 er alle 79,5–85-par "stærkt" både før og efter (≥ 70,4) → tom rapport; ved det nye snit (≈ 80) er der op og ned
  let n = 0;
  for (const seed of [1, 2, 3, 4]) {
    const { got, exp, ref } = oracleRound(seed, 3, 60);
    assert.notEqual(ref, 60); assert.ok(ref > 70 && ref < 90, `nyt snit ${ref}`);
    assert.deepEqual(got, exp, `seed ${seed}`);
    n += exp.up.length + exp.down.length;
  }
  assert.ok(n > 0, 'data: forventningen er ikke tom');
});

test('commitRound: kun dit hold får rapport og strong; en liga uden menneskehold fejler ikke', () => {
  const L = createLeague(createRng(5)), rng = createRng(9), me = own(L);
  commitRound(L, playRound(L, rng), rng);
  assert.deepEqual(Object.keys(L.trainingReport), [me.id]);
  assert.ok(Array.isArray(L.trainingReport[me.id].strong.up) && Array.isArray(L.trainingReport[me.id].strong.down));
  const L2 = createLeague(createRng(5)), rng2 = createRng(9);
  for (const t of L2.teams) t.isBot = true;
  assert.doesNotThrow(() => commitRound(L2, playRound(L2, rng2), rng2));
  assert.deepEqual(Object.keys(L2.trainingReport), []);
});

test('commitRound: over en hel sæson (også sæsonslut/vindue) har strong gyldig form og kun spillere, der stadig er i truppen', () => {
  const L = createLeague(createRng(6)), rng = createRng(11), me = own(L), ids = () => new Set(me.squad.map((p) => p.id));
  for (let r = 0; r < 15; r++) {
    commitRound(L, playRound(L, rng), rng);
    const s = L.trainingReport[me.id].strong;
    assert.ok(Array.isArray(s.up) && Array.isArray(s.down), `runde ${r + 1}`);
    for (const pr of [...s.up, ...s.down]) { assert.equal(pr.length, 2); for (const id of pr) assert.ok(ids().has(id), `runde ${r + 1}: ${id} er ikke i truppen`); }
  }
});

// ---------- trainingSummary ----------
const emptyRep = (extra = {}) => ({ round: 3, gains: [], injuries: [], ...extra });
const teamFix = () => { const L = createLeague(createRng(4)), me = own(L); return { me, s: me.squad, w: (p) => `#${p.shirtNumber} ${p.shortName}`, pr: (i, j) => [me.squad[i].id, me.squad[j].id] }; };

test('trainingSummary: kun strong (ingen fremgang, ingen skader) giver stadig panelet – #training-strong med teksten', () => {
  const { me, w, s, pr } = teamFix();
  const el = trainingSummary(emptyRep({ strong: { up: [pr(1, 2)], down: [] } }), me, 3, null);
  assert.ok(el, 'panelet findes');
  const st = all(el, (e) => e.id === 'training-strong');
  assert.equal(st.length, 1);
  assert.equal(st[0].textContent, `🤝 ${w(s[1])} og ${w(s[2])} spiller nu stærkt sammen.`);
  assert.equal(all(el, (e) => e.tag === 'strong').length, 0, 'ingen "Træning og kampe"-overskrift uden fremgang/skader');
  assert.doesNotMatch(el.textContent, /Træning og kampe/);
});

test('trainingSummary: kun ned fungerer også; hverken fremgang, skader eller strong → null; kun ukendte par → null', () => {
  const { me, s, w, pr } = teamFix();
  const dn = trainingSummary(emptyRep({ strong: { up: [], down: [pr(1, 2)] } }), me, 3, null);
  assert.equal(all(dn, (e) => e.id === 'training-strong')[0].textContent, `${w(s[1])} og ${w(s[2])} spiller ikke længere stærkt sammen – de spillede ikke sammen i runden.`);
  assert.equal(trainingSummary(emptyRep({ strong: { up: [], down: [] } }), me, 3, null), null);
  assert.equal(trainingSummary(emptyRep(), me, 3, null), null, 'rapport fra v3.24.1 uden strong');
  assert.equal(trainingSummary(emptyRep({ strong: { up: [[s[1].id, 'solgt']], down: [['x', 'y']] } }), me, 3, null), null);
  assert.equal(trainingSummary(undefined, me, 3, null), null);
});

test('trainingSummary: strong står ØVERST og fremgang/skader bevares under; linket findes kun med onTaktik og kalder den', () => {
  const { me, s, pr } = teamFix();
  const rep = emptyRep({ gains: [{ id: s[3].id, skill: 'finishing' }], injuries: [s[4].id], strong: { up: [pr(1, 2)], down: [] } });
  let called = 0;
  const el = trainingSummary(rep, me, 3, () => { called++; });
  assert.equal(el.id, 'training-summary');
  assert.equal(el.children[0].id, 'training-strong', 'strong er første barn');
  assert.match(el.children[1].textContent, /^🏋️ Træning og kampe efter runde 3: /);
  assert.match(el.children[1].textContent, new RegExp(`${s[3].shortName} \\+1 `));
  assert.match(el.children[1].textContent, new RegExp(`🚑 ${s[4].shortName} skadet i træningen`));
  const btns = all(el, (e) => e.tag === 'button');
  assert.equal(btns.length, 1);
  assert.equal(btns[0].className, 'linklike'); assert.equal(btns[0].textContent, 'se stregerne på Taktik');
  assert.equal(all(el.children[0], (e) => e.tag === 'button').length, 1, 'linket står i strong-linjen');
  btns[0].on.click(); assert.equal(called, 1);
  const noLink = trainingSummary(rep, me, 3);
  assert.equal(all(noLink, (e) => e.tag === 'button').length, 0, 'uden onTaktik intet link');
  // uden strong: ingen #training-strong og intet link, men fremgangen står
  const plain = trainingSummary(emptyRep({ gains: rep.gains }), me, 3, () => {});
  assert.equal(all(plain, (e) => e.id === 'training-strong').length, 0); assert.equal(all(plain, (e) => e.tag === 'button').length, 0);
  assert.match(plain.textContent, /Træning og kampe efter runde 3/);
});

// ---------- strongLines: grænser og filter ----------
test('strongLines: 3 par er en liste (4 er antallet); ned: 2–3 liste, 4 antallet; op og ned sammen = to sætninger, op først', () => {
  const { me, s, w, pr } = teamFix();
  assert.deepEqual(strongLines(me, { up: [pr(1, 2), pr(3, 4), pr(5, 6)], down: [] }), [`🤝 Spiller nu stærkt sammen: ${w(s[1])} og ${w(s[2])} · ${w(s[3])} og ${w(s[4])} · ${w(s[5])} og ${w(s[6])}.`]);
  assert.deepEqual(strongLines(me, { up: [pr(1, 2), pr(3, 4), pr(5, 6), pr(7, 8), pr(9, 10)], down: [] }), ['🤝 5 par spiller nu stærkt sammen.']);
  const T = 'Spiller ikke længere stærkt sammen (de spillede ikke sammen i runden): ';
  assert.deepEqual(strongLines(me, { up: [], down: [pr(1, 2), pr(3, 4)] }), [`${T}${w(s[1])} og ${w(s[2])} · ${w(s[3])} og ${w(s[4])}.`]);
  assert.deepEqual(strongLines(me, { up: [], down: [pr(1, 2), pr(3, 4), pr(5, 6)] }), [`${T}${w(s[1])} og ${w(s[2])} · ${w(s[3])} og ${w(s[4])} · ${w(s[5])} og ${w(s[6])}.`]);
  assert.deepEqual(strongLines(me, { up: [], down: [pr(1, 2), pr(3, 4), pr(5, 6), pr(7, 8)] }), ['4 par spiller ikke længere stærkt sammen – de spillede ikke sammen i runden.']);
  assert.deepEqual(strongLines(me, { up: [pr(1, 2)], down: [pr(3, 4)] }), [`🤝 ${w(s[1])} og ${w(s[2])} spiller nu stærkt sammen.`, `${w(s[3])} og ${w(s[4])} spiller ikke længere stærkt sammen – de spillede ikke sammen i runden.`]);
});

test('strongLines: ukendte par filtreres FØR tællingen – 2 af 2 kendte bliver ét par (ental), 4 med ét ukendt bliver en liste af 3', () => {
  const { me, s, w, pr } = teamFix();
  assert.deepEqual(strongLines(me, { up: [pr(1, 2), [s[3].id, 'solgt']], down: [] }), [`🤝 ${w(s[1])} og ${w(s[2])} spiller nu stærkt sammen.`]);
  assert.deepEqual(strongLines(me, { up: [pr(1, 2), pr(3, 4), pr(5, 6), ['solgt', s[7].id]], down: [] }), [`🤝 Spiller nu stærkt sammen: ${w(s[1])} og ${w(s[2])} · ${w(s[3])} og ${w(s[4])} · ${w(s[5])} og ${w(s[6])}.`]);
  assert.deepEqual(strongLines(me, { up: [], down: [pr(1, 2), [s[3].id, 'solgt']] }), [`${w(s[1])} og ${w(s[2])} spiller ikke længere stærkt sammen – de spillede ikke sammen i runden.`]);
  assert.ok(!JSON.stringify(strongLines(me, { up: [pr(1, 2), ['solgt', s[7].id]], down: [] })).includes('null'));
});

test('strongLines: manglende up eller down i rapporten (kun den ene nøgle) fejler ikke', () => {
  const { me, s, w, pr } = teamFix();
  assert.deepEqual(strongLines(me, { up: [pr(1, 2)] }), [`🤝 ${w(s[1])} og ${w(s[2])} spiller nu stærkt sammen.`]);
  assert.deepEqual(strongLines(me, { down: [pr(1, 2)] }), [`${w(s[1])} og ${w(s[2])} spiller ikke længere stærkt sammen – de spillede ikke sammen i runden.`]);
  assert.deepEqual(strongLines(me, {}), []);
});
// (QC-rettelse: en forkert formet strong renses nu i sanitize – testet i chemistry-v3242.test.mjs)
