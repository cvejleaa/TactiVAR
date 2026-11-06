// v3.32.3 – samspil på Taktik (brugeren 6/11: "Jeg kan ikke på taktik siden se, hvem den valgte spiller spiller godt sammen med").
// Kun visning: partnersOf/focusChemText (engine/chemistry.js) og byt-forhåndsvisningen swapPreview (state/actions.js – SAMME
// pickForSwap på en kopi). Fixturet har rigtige, varierede værdier (ikke fladt 78): en stærk tidligere nabo på bænken, et stærkt
// angriber⇄angriber-par (læses ikke), en seedet ikke-nabo på 78, en målmand, en skadet og en udelukket starter, et manglende par.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partnersOf, focusChemText, lineupPairs, swapChanges, bestPartner, gamesToSettle, pairKey } from '../../public/engine/chemistry.js';
import { swapPreview, pickForSwap, swapKind } from '../../public/state/actions.js';
import { matchBenchOf, reservesOf } from '../../public/engine/career.js';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';

const REF = 78;
// 4-4-2: 0 GK, 1 LB, 2 CB, 3 CB, 4 RB, 5 LM, 6 CM, 7 CM, 8 RM, 9 ST, 10 ST. Fokus F = plads 6 (CM): naboer 2, 5, 7, 9 (læste par)
function fixture() {
  const L = createLeague(createRng(3)), t = L.teams.find((x) => !x.isBot), opp = L.teams.find((x) => x.isBot);
  t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {};
  const s = t.tactics.lineupSlots, set = (a, b, v, r) => { t.chemistry[pairKey(a, b)] = [v, r]; };
  // En reserve (truppen på 18 har ingen): en 19. markspiller uden for kamptruppens 7
  const extra = { ...structuredClone(t.squad.find((p) => p.position === 'CM' || p.position === 'DM' || p.line === 'MID')), id: 'x-reserve', shirtNumber: 40, shortName: 'R. Reservesen', name: 'Rasmus Reservesen' };
  t.squad.push(extra);
  if (!Array.isArray(t.matchBench)) t.matchBench = matchBenchOf(t).map((p) => p.id);
  t.chemistry = {};
  const field = t.squad.filter((p) => p.position !== 'GK');
  for (const x of field) for (const y of field) if (x.id < y.id) set(x.id, y.id, 78, 0);   // seedet på runde 0
  const bench = matchBenchOf(t).filter((p) => p.position !== 'GK'), res = reservesOf(t).filter((p) => p.position !== 'GK');
  const F = s[6], B1 = bench[0].id, B2 = bench[1].id, B3 = bench[2].id, R = res[0].id, gk = s[0];
  set(F, s[2], 84, 5);      // stærkt
  set(F, s[5], 74, 5);      // spillet sammen
  set(F, s[7], 62, 5);      // finder hinanden
  delete t.chemistry[pairKey(F, s[9])];   // manglende par = fremmede (ikke seedet 78)
  set(s[9], s[10], 95, 5);  // angriber⇄angriber stærkt – læses ikke
  set(F, B1, 90, 4);        // stærk tidligere nabo, nu på bænken
  // B2: seedet ikke-nabo på 78 (runde 0) – aldrig "spillet sammen"/makker
  set(F, B3, 45, 4);        // spillet, men fremmede – står ikke under "kender også"
  set(F, R, 66, 3);         // finder hinanden, reserve
  t.chemistry[pairKey(F, gk)] = [92, 4];   // et (urealistisk) målmandspar – målmanden står aldrig som makker
  t.squad.find((p) => p.id === s[3]).injuryMatchesLeft = 2;
  t.squad.find((p) => p.id === s[4]).banMatches = 1;
  const sh = (id) => { const p = t.squad.find((x) => x.id === id); return `#${p.shirtNumber} ${p.shortName}`; };
  return { L, t, opp, s, F, B1, B2, B3, R, gk, sh };
}
// Ingen 0–100-tal: alt andet end trøjenumre og "ca. N kampe" er ord
const noNumbers = (txt) => !/\d/.test(txt.replace(/#\d+/g, '').replace(/ca\. \d+ kampe/g, ''));

test('partnersOf: de læste naboer stærkeste først, den svageste, og andre han har spillet sig sammen med (≥ finder hinanden) med hvor de står', () => {
  const { t, s, F, B1, B2, B3, R, gk } = fixture();
  const f = partnersOf(t, REF, F);
  assert.deepEqual(f.neighbours.map((x) => [x.mate.id, x.band]), [[s[2], 'staerkt'], [s[5], 'sammen'], [s[7], 'finder'], [s[9], 'fremmede']], 'stærkeste først; manglende par = fremmede');
  assert.equal(f.weakest.mate.id, s[9]);
  assert.deepEqual(f.others.map((x) => [x.p.id, x.band, x.where]), [[B1, 'staerkt', 'bænk'], [R, 'finder', 'reserve']], 'kun spillede par ≥ finder hinanden');
  for (const id of [B2, B3, gk, s[3], s[8]]) assert.ok(!f.others.some((x) => x.p.id === id), `ikke under "kender også": ${id}`);
  assert.equal(f.isGK, false); assert.equal(f.sameBand, false); assert.equal(f.where, 'start');
  // ST⇄ST læses ikke: angriberen på plads 9 har kun CM-naboen – og hans makker på plads 10 er heller ikke "kender også"
  const st = partnersOf(t, REF, s[9]);
  assert.deepEqual(st.neighbours.map((x) => x.mate.id), [F]);
  assert.ok(!st.others.some((x) => x.p.id === s[10]), 'angriber⇄angriber står hverken som nabo eller "kender også"');
  // Målmanden: ingen par, ingen "kender også" – trods et par i tabellen
  const g = partnersOf(t, REF, gk);
  assert.equal(g.isGK, true); assert.deepEqual(g.neighbours, []); assert.deepEqual(g.others, []);
  // Bænken: ingen naboer; hans tidligere nabo F står under "kender også" (start)
  const b = partnersOf(t, REF, B1);
  assert.deepEqual(b.neighbours, []); assert.equal(b.where, 'bænk'); assert.deepEqual(b.others.map((x) => [x.p.id, x.where]), [[F, 'start']]);
  assert.equal(partnersOf(t, REF, 'findes-ikke'), null);
});

test('focusChemText: den præcise tekst for fokus, angriberen, målmanden, den skadede, den udelukkede og en bænkspiller – kun ord, aldrig tal 0–100', () => {
  const { t, s, F, B1, B2, R, gk, sh } = fixture();
  const txt = focusChemText(t, REF, F);
  assert.equal(txt, `🤝 Med naboerne: ${sh(s[2])} stærkt · ${sh(s[5])} spillet sammen · ${sh(s[7])} finder hinanden · ${sh(s[9])} fremmede · svagest: ${sh(s[9])}`
    + ` · Kender også ${sh(B1)} (stærkt, bænk) og ${sh(R)} (finder hinanden, reserve) – samspil tæller kun, når de står som naboer`);
  assert.ok(!txt.includes(sh(B2)) && !txt.includes(sh(s[10])) && !txt.includes(sh(gk)), 'den seedede ikke-nabo, angriberparret og målmanden står ikke');
  assert.ok(!txt.includes('Ingen stærke par'), 'han har et stærkt par');
  // Angriberen: kun CM-naboen (fremmede), ingen stærke par – antal kampe regnet (gamesToSettle 30 → stærkt ved snit 78)
  const n = gamesToSettle(REF, 30, 'staerkt');
  assert.equal(n, 14, 'data: 14 kampe fra fremmede til stærkt');
  assert.equal(focusChemText(t, REF, s[9]), `🤝 Med naboen: ${sh(F)} fremmede · Ingen stærke par endnu – ca. ${n} kampe mere side om side`);
  assert.equal(focusChemText(t, REF, gk), '🤝 Målmanden indgår ikke i samspil.');
  // Skadet (plads 3: naboerne 2, 4, 7 alle seedet 78 = spillet sammen) – og hans seedede par med resten står IKKE som "kender også"
  assert.equal(focusChemText(t, REF, s[3]), `🤝 (skadet – spiller ikke) Alle hans naboer: spillet sammen – samspil vokser kampe side om side (ca. ${gamesToSettle(REF, 78, 'staerkt')} kampe til stærkt)`);
  assert.equal(gamesToSettle(REF, 78, 'staerkt'), 3, 'data: 78 → stærkt på 3 kampe');
  assert.ok(focusChemText(t, REF, s[4]).startsWith('🤝 (udelukket) '), focusChemText(t, REF, s[4]));
  assert.equal(focusChemText(t, REF, B1), `🤝 På bænken – samspil tæller kun med naboerne på banen · Kender også ${sh(F)} (stærkt, start) – samspil tæller kun, når de står som naboer`);
  assert.equal(focusChemText(t, REF, B2), '🤝 På bænken – samspil tæller kun med naboerne på banen', 'seedet 78: intet "kender også"');
  for (const id of t.squad.map((p) => p.id)) { const x = focusChemText(t, REF, id); assert.ok(noNumbers(x), x); assert.ok(!/fremmede\)/.test(x), '"fremmede" kun om nabopar'); }
});

test('focusChemText: alle naboer stærkt → "Alle hans naboer: stærkt"; alle fremmede → antal kampe til spillet sammen; bedste makker modsiges aldrig', () => {
  const { t, s, F } = fixture();
  for (const i of [2, 5, 7, 9]) t.chemistry[pairKey(F, s[i])] = [88, 5];
  assert.equal(focusChemText(t, REF, F).split(' · ')[0], '🤝 Alle hans naboer: stærkt');
  for (const i of [2, 5, 7, 9]) delete t.chemistry[pairKey(F, s[i])];
  assert.equal(focusChemText(t, REF, F).split(' · ')[0], `🤝 Alle hans naboer: fremmede – samspil vokser kampe side om side (ca. ${gamesToSettle(REF)} kampe til spillet sammen)`);
  assert.equal(gamesToSettle(REF), 8, 'standard (købelinjen) uændret: 8');
  // Bedste makker (kortet) = den første nabo i teksten, når han er stærk
  const g = fixture();
  assert.equal(bestPartner(g.t, REF, g.F).mate.id, g.s[2]);
  assert.ok(focusChemText(g.t, REF, g.F).startsWith(`🤝 Med naboerne: ${g.sh(g.s[2])} stærkt`));
});

test('kun eget hold: en modstanders spiller giver ingen tekst på dit hold, og intet navn fra modstanderen står i dine tekster', () => {
  const { t, opp } = fixture();
  for (const p of opp.squad) assert.equal(focusChemText(t, REF, p.id), null);
  const names = new Set(opp.squad.map((p) => `#${p.shirtNumber} ${p.shortName}`));
  for (const p of t.squad) { const x = focusChemText(t, REF, p.id); for (const n of names) assert.ok(!x.includes(`${n} `) || t.squad.some((q) => `#${q.shirtNumber} ${q.shortName}` === n), n); }
});

test('lineupPairs(team, ref, slots): en anden opstilling uden at røre holdet – samme som holdet med de pladser', () => {
  const { t, s } = fixture();
  const alt = s.slice(); [alt[2], alt[3]] = [alt[3], alt[2]];
  const copy = structuredClone(t); copy.tactics.lineupSlots = alt.slice();
  assert.deepEqual(lineupPairs(t, REF, alt).map((x) => [x.i, x.j, x.v, x.band]), lineupPairs(copy, REF).map((x) => [x.i, x.j, x.v, x.band]));
  assert.deepEqual(t.tactics.lineupSlots, s, 'holdet er uændret');
  assert.notDeepEqual(lineupPairs(t, REF, alt).map((x) => x.v), lineupPairs(t, REF).map((x) => x.v), 'data: byttet ændrer værdierne');
});

// Paritet: forhåndsvisningen = den besked, der står efter selve byttet (app.js withChem: swapChanges før/efter act.pickForSwap)
test('swapPreview ⇄ beskeden efter byttet: for hvert muligt klik (start, bænk, reserve) – samme ændringer, rigtige op/ned-tal, holdet urørt', () => {
  const { t, s, F, B1, R } = fixture();
  const ids = t.squad.map((p) => p.id);
  let kinds = new Map(), nonEmpty = 0;
  for (const a of [F, s[2], s[9], B1, R, s[0]]) for (const b of ids) {
    const before = JSON.stringify([t.tactics.lineupSlots, t.matchBench, t.matchBenchAuto]);
    const pv = swapPreview(t, REF, a, b);
    assert.equal(JSON.stringify([t.tactics.lineupSlots, t.matchBench, t.matchBenchAuto]), before, 'forhåndsvisningen rører ikke holdet');
    const real = structuredClone(t), k = swapKind(real, a, b), was = lineupPairs(real, REF);
    pickForSwap(real, a, b);
    const now = lineupPairs(real, REF), msg = swapChanges(was, now);
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
    if (k !== 'swap' && k !== 'bench') { assert.equal(pv, null, `${k}: ingen forhåndsvisning`); continue; }
    assert.equal(pv.kind, k);
    assert.deepEqual(pv.changes, msg, `${a} ⇄ ${b}`);
    const m = new Map(was.map((x) => [`${x.i}-${x.j}`, x.band])), R_ = { fremmede: 0, finder: 1, sammen: 2, staerkt: 3 };
    assert.equal(pv.up, now.filter((x) => R_[x.band] > R_[m.get(`${x.i}-${x.j}`)]).length);
    assert.equal(pv.down, now.filter((x) => R_[x.band] < R_[m.get(`${x.i}-${x.j}`)]).length);
    if (k === 'bench') assert.deepEqual([pv.up, pv.down, pv.changes], [0, 0, []], 'bænk ⇄ reserve: ingen virkning');
    if (pv.changes.length) nonEmpty++;
  }
  assert.ok(kinds.get('swap') > 50 && kinds.get('bench') > 0 && kinds.get('select') > 0 && kinds.get('deselect') > 0, JSON.stringify([...kinds]));
  assert.ok(nonEmpty > 10, `data: byt med båndskift (${nonEmpty})`);
  const pv = swapPreview(t, REF, B1, s[7]);   // B1 ind på plads 7 (F's nabo, finder hinanden) → F-B1 stærkt: op
  assert.ok(pv.up >= 1 && pv.changes.some((c) => c.endsWith('finder hinanden → stærkt')), JSON.stringify(pv));
});
