// v3.17.0 – tekster i balance-gennemgangen: halvchancens linjer, botternes FASE-linjer, Rundens mål uden dobbelt etiket
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';

const { goalDesc, filterEvents } = await import('../../public/ui/matchcenter.js');
const { shotOver } = await import('../../public/ui/replay.js');
const M = [];
for (let s = 1; s <= 120; s++) { const L = createLeague(createRng(s)); M.push(simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31))); }

test('Rundens mål: en indledning, der gentager typen, fjernes ("Kontra: bolden …" → "Bolden …") – andre tekster står urørt', () => {
  assert.equal(goalDesc({ kind: 'COUNTER', desc: 'Kontra: bolden blev erobret, og #9 A. B scorede.' }), 'Bolden blev erobret, og #9 A. B scorede.');
  assert.equal(goalDesc({ kind: 'CUTBACK', desc: 'Lavt cutback: #7 C. D nåede baglinjen.' }), '#7 C. D nåede baglinjen.');
  assert.equal(goalDesc({ kind: 'COMBINATION', desc: 'Kombinationsfodbold: #8 E. F spillede #9 fri.' }), '#8 E. F spillede #9 fri.');
  assert.equal(goalDesc({ kind: 'COUNTER', desc: 'Flot kontra' }), 'Flot kontra', 'uden kolon');
  assert.equal(goalDesc({ kind: 'HEADER', desc: 'Kontra: noget andet.' }), 'Kontra: noget andet.', 'indledningen nævner ikke typen');
  assert.equal(goalDesc({ kind: 'COUNTER', desc: 'En meget lang indledning om kontra og meget mere: rest' }), 'En meget lang indledning om kontra og meget mere: rest', 'over 32 tegn er ikke en etiket');
  assert.equal(goalDesc({ kind: 'FREEKICK', desc: 'Et frispark for vitrineskabet: #9 A. B krøllede den ind.' }), '#9 A. B krøllede den ind.', 'Spilfører R11');
  assert.equal(goalDesc({ kind: 'UKENDT', desc: 'X: y' }), 'X: y');
});

test('halvchancen: dæmpet (minor), aldrig stolpen, og dens forbi-tekster går ikke igen i en kamp, før de fem er brugt', () => {
  let n = 0, saves = 0, goals = 0, overs = 0;
  for (const m of M) {
    const used = new Set();
    for (const e of m.events.filter((x) => x.minor)) {
      n++;
      assert.ok(['MISS', 'SAVE'].includes(e.type), e.type);
      assert.ok(!/stolpe|overligger/.test(e.text), e.text);
      if (e.type === 'SAVE') saves++;
      if (e.type === 'MISS' && e.text.startsWith('🎯')) {
        const t = e.text.replace(/^🎯 \[.+?\] #\d+ \S+ \S+ /, '').replace(/( fra distancen)?\.$/, '');
        assert.ok(!used.has(t), `gentaget: ${t}`); used.add(t); if (used.size === 5) used.clear();
      }
    }
    goals += m.goalsPool.filter((g) => g.kind === 'SCRAMBLE').length;
    // QC: aldrig "… fra distancen fra #9"; en tekst med "over" tegnes over mål i afspilningen (shotOver)
    for (const e of m.events.filter((x) => x.minor)) {
      assert.ok(!/ fra \S+ fra #/.test(e.text) && !/distancen fra #/.test(e.text), e.text);
      if (e.type === 'MISS' && /\bover\b/.test(e.text)) { assert.ok(shotOver({ kind: 'MISS' }, e), e.text); overs++; }
    }
    // et mål er aldrig dæmpet
    assert.ok(!m.events.some((e) => e.minor && /GOAL/.test(e.type)));
  }
  assert.ok(n >= 120 * 8 && saves >= 120 && goals >= 10 && overs >= 50, `data: ${n} halvchancer, ${saves} redninger, ${goals} SCRAMBLE-mål, ${overs} over mål`);
});

test('botternes FASE-linjer: kun den første pr. hold og slags vises (≤ 4 pr. kamp; før ≈ 14) – resten står i data som quiet, og pres-linjen har holdmærke', () => {
  let shown = 0, quiet = 0, games = 0;
  for (const m of M) {
    if (m.ownReports && Object.keys(m.ownReports).length) continue;   // kun kampe mellem to botter
    games++;
    const fase = m.events.filter((e) => /^\S+ \[FASE /.test(e.text));
    const vis = filterEvents(m.events, 'all').filter((e) => /^\S+ \[FASE /.test(e.text));
    shown += vis.length; quiet += fase.filter((e) => e.quiet).length;
    const key = (e) => `${e.isHome}|${e.type}`;
    assert.equal(new Set(vis.map(key)).size, vis.length, 'højst én pr. hold og slags');
    assert.ok(vis.length <= 4);
    assert.ok(!fase.some((e) => e.text.includes('STOPPER MOD')), 'den gamle linje uden holdmærke');
  }
  assert.ok(games >= 60 && quiet > shown, `data: ${games} kampe, ${shown} viste, ${quiet} quiet`);
});

test('opbygningens offside-parentes: "stoppet var offside" (1 stop), "alle N stop" (alle), ellers "af de N stop var Z" – aldrig "af de 1 stop var 1"', async () => {
  const { duelText } = await import('../../public/engine/match.js');
  const d = (build, buildWon) => ({ build, buildWon, press: 0, pressWon: 0, trapWon: 0 });
  assert.match(duelText(d(5, 4), { trapWon: 1 }), /igennem 4 af 5 gange \(stoppet var offside\)/);
  assert.match(duelText(d(6, 2), { trapWon: 4 }), /igennem 2 af 6 gange \(alle 4 stop var offside\)/);
  assert.match(duelText(d(6, 2), { trapWon: 3 }), /igennem 2 af 6 gange \(af de 4 stop var 3 offside\)/);
  assert.doesNotMatch(duelText(d(6, 2), { trapWon: 0 }), /offside/);
});

test('blokeringen varierer (Spilfører: "kaster sig ind foran" 484 gange) – og afspilningen finder stadig blokeren på hvert verbum', async () => {
  const { shotEnd } = await import('../../public/ui/replay.js');
  const verbs = new Map();
  for (const m of M) for (const e of m.events.filter((x) => x.minor && x.label === 'Blokeret')) {
    const v = e.text.match(/^🧱 \[.+?\] #\d+ \S+ \S+ (kaster sig ind foran|blokerer|får et ben i vejen for|lukker af for) /)?.[1];
    assert.ok(v, e.text); verbs.set(v, (verbs.get(v) ?? 0) + 1);
  }
  assert.equal(verbs.size, 4, JSON.stringify([...verbs]));
  // hvert verbum: blokeren slås op ved navn (idOf) – ikke den nærmeste
  const ids = { '#4 A. B': 'p4' }, idOf = (t) => ids[t];
  for (const v of verbs.keys()) {
    const mo = { kind: 'MISS', side: 'h', ball: [50, 20], h: [['s', 50, 20]], a: [['gk', 50, 2], ['p4', 80, 80], ['p5', 50, 18]] };
    const end = shotEnd(mo, { label: 'Blokeret', text: `🧱 [X] #4 A. B ${v} skuddet fra #9 C. D (Y).` }, idOf);
    assert.deepEqual(end, [80, 80], v);
  }
});
