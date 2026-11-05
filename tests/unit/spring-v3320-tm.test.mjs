// Test Manager v3.32.0 (Spring kan trænes med Fysik): mutanter, der overlevede forfatterens spring-v3320.test.mjs, og hullerne bag dem.
// Mønstret: forfatterens tests har ÉT fixture (Tobias) og ÉN sats (33 år); her pr. gren med bestemte tal og et uafhængigt orakel.
//  - aldersfaldet: bånd 160–240 af 400 (fald 0,5) rummer også 0,4 og 0,6 → satsen kunne ændres; nu et orakel på HVERT træk
//  - kravteksten: kun to af grenene var målt ("begge", tæt på loftet) – "alle", ental, grænsen 14/15, min mod max, ukendt evne, gammel form
//  - Trup/Træning: titlen på Spring-kolonnen, arketypecellens "låst op"-title, fokusvalget pr. spiller (ikke kun massehandlingen)
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
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { FOCUS, DECLINE_FROM, declineSkills, trainedSkills, derivedRng, roomOf, ageTrain, keyAvg, trainingEstimate } = await import('../../public/engine/career.js');
const { afterSkillChange } = await import('../../public/engine/season.js');
const { archReqText, archetypeOf } = await import('../../public/ui/labels.js');
const { renderMatrix, COLUMNS } = await import('../../public/ui/matrix.js');
const { renderTrainingTable, focusLabel } = await import('../../public/ui/training.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const own = (L) => L.teams.find((t) => !t.isBot);
const hasClass = (e, c) => e.className.split(/\s+/).includes(c);
const rowOf = (root, pid) => all(root, (e) => e.tag === 'tr' && e.dataset.pid === pid)[0];
const MX = { sortCol: 'pos', sortDesc: false, filter: 'all', gains: new Map(), gainRound: 1 };
const matrix = (team) => renderMatrix({ team, isOwn: true, ui: MX, notes: {}, onSort() {}, onSelect() {}, onFilter() {}, onBlocked() {} });
// En 20-årig forsvarer, Styrke 13 og Spring 13 (Luftens Konge kræver Styrke 13 og Spring 14), Fysik, plads til loftet
function tobias(L, focus = 'PHYSICAL') {
  const p = own(L).squad.find((x) => x.line === 'DEF');
  Object.assign(p, { age: 20, jumpingPower: 13, trainingFocus: focus, dev: {}, injuryMatchesLeft: 0, banMatches: 0 });
  p.skills.strength = 13; p.potential = keyAvg(p) + 1.5;   // roomOf = 0,5
  p.archetype = { id: 'AERIAL_TOWER', name: 'x', description: 'x', unlockReq: { strength: 13, jumpingPower: 14 }, isUnlocked: false };
  afterSkillChange(p);
  return p;
}
// Runder pr. +1 uden om trainingEstimate: rate · alder · plads (career.js-kommentaren: "Fremgang pr. runde = rate · alder · plads til loftet")
const perRound = (p) => FOCUS[p.trainingFocus].rate * ageTrain(p.age) * roomOf(p);

// ---------- aldersfaldet: et orakel på hvert træk (Spring er det 10. træk i den afledte rng, efter de 9 evner) ----------
test('aldersfald: Spring falder netop når 10. træk < min(0,9; 0,2 + 0,1 · (alder − 30)) – halveret af Fysik – ved 30, 33, 36 og 40 år', () => {
  const mk = (age, id, line = 'DEF') => ({ id, age, line, jumpingPower: 14, skills: { pace: 12, stamina: 12, strength: 12, ballControl: 12, passing: 12, finishing: 12, positioning: 12, intercepting: 12, goalkeeping: 12 } });
  const physical = trainedSkills({ line: 'DEF', trainingFocus: 'PHYSICAL' }, false);
  const seen = {};
  for (const [age, c] of [[30, 0.2], [33, 0.5], [36, 0.8], [40, 0.9]]) {
    let fell = 0, fellTrained = 0;
    for (let i = 0; i < 200; i++) {
      const id = `o${i}`, season = 1 + (i % 4);
      const rng = derivedRng('decline', season, id); let u = 0; for (let k = 0; k < 10; k++) u = rng.next();
      const a = mk(age, id), b = mk(age, id);
      const got = declineSkills(a, season).includes('jumpingPower'), gotT = declineSkills(b, season, physical).includes('jumpingPower');
      assert.equal(got, u < c, `${age} år, ${id}: træk ${u.toFixed(3)} mod ${c}`);
      assert.equal(gotT, u < c * 0.5, `${age} år trænet med Fysik, ${id}: træk ${u.toFixed(3)} mod ${c * 0.5}`);
      assert.equal(a.jumpingPower, got ? 13 : 14);
      fell += got; fellTrained += gotT;
    }
    seen[age] = [fell, fellTrained];
    assert.ok(fell > 0 && fell < 200 + (c >= 0.9 ? 1 : 0) && fellTrained > 0, `data: ${age} år faldt ${fell}/200 (trænet ${fellTrained})`);   // et orakel uden udfald beviser intet
  }
  assert.ok(seen[30][0] > 0, 'ved præcis 30 år (y = 0) kan Spring falde – grænsen er < 30, ikke ≤ 30');
  // 29 år: intet fald; målmand: først fra 32
  for (let i = 0; i < 100; i++) {
    assert.deepEqual(declineSkills(mk(29, `y${i}`), 1), []);
    assert.deepEqual(declineSkills(mk(31, `g${i}`, 'GK'), 1), [], 'MV falder først fra 32');
  }
  assert.ok(Array.from({ length: 200 }, (_, i) => declineSkills(mk(32, `g${i}`, 'GK'), 1).includes('jumpingPower')).some(Boolean), 'data: en 32-årig MV kan miste Spring');
  assert.deepEqual(DECLINE_FROM, { field: 30, GK: 32 });
});

// ---------- kravteksten ----------
test('kravteksten: hver evne i et arketypekrav peger på det RIGTIGE fokus (fast tabel – ikke aflæst af FOCUS selv)', () => {
  const L = createLeague(createRng(61)), p = tobias(L, 'GENERAL');
  const want = { pace: ['Fart', 'Fysik'], strength: ['Styrke', 'Fysik'], jumpingPower: ['Spring', 'Fysik'], passing: ['Pasning', 'Teknik'], ballControl: ['Boldkontrol', 'Teknik'],
    positioning: ['Positionering', 'Forsvar'], intercepting: ['Erobring', 'Forsvar'], stamina: ['Udholdenhed', 'Kondition'], finishing: ['Afslutning', 'Afslutning'], goalkeeping: ['Målmandsspil', 'Målmand'] };
  for (const [k, [da, fokus]] of Object.entries(want)) {
    if (k === 'jumpingPower') p.jumpingPower = 3; else p.skills[k] = 3;
    assert.equal(archReqText({ unlockReq: { [k]: 20 } }, p), `Låses op ved: ${da} 3/20 – trænes med ${fokus}`, k);
  }
});

test('kravteksten: tre mangler med samme fokus → "alle trænes med Fysik" (ikke "begge")', () => {
  const L = createLeague(createRng(62)), p = tobias(L, 'GENERAL');
  p.skills.pace = 10; p.skills.strength = 11; p.jumpingPower = 12;
  assert.equal(archReqText({ unlockReq: { pace: 14, strength: 14, jumpingPower: 14 } }, p), 'Låses op ved: Fart 10/14 · Styrke 11/14 · Spring 12/14 – alle trænes med Fysik');
  p.skills.pace = 14;   // én opfyldt: de to andre er "begge"
  assert.equal(archReqText({ unlockReq: { pace: 14, strength: 14, jumpingPower: 14 } }, p), 'Låses op ved: Fart 14/14 ✓ · Styrke 11/14 · Spring 12/14 – begge trænes med Fysik');
});

test('kravteksten: ukendt evne får hverken fokus eller crash; uden spiller er det den gamle form (kun krav, danske navne)', () => {
  const L = createLeague(createRng(63)), p = tobias(L, 'GENERAL');
  assert.equal(archReqText({ unlockReq: { xyz: 5 } }, p), 'Låses op ved: xyz 0/5');
  assert.equal(archReqText({ unlockReq: { xyz: 5, jumpingPower: 14 } }, p), 'Låses op ved: xyz 0/5 · Spring 13/14 – trænes med Fysik');
  assert.equal(archReqText({ unlockReq: { strength: 13, jumpingPower: 14 } }), 'Låses op ved: Styrke 13, Spring 14');
  assert.equal(archReqText({ unlockReq: { xyz: 5 } }), 'Låses op ved: xyz 5');
  assert.equal(archReqText({ unlockReq: { strength: 13, jumpingPower: 14 } }, null), 'Låses op ved: Styrke 13, Spring 14');
});

test('kravteksten: "(det gør han nu; næste +1 om ca. N runde/r)" – ental ved 1, flertal ved 2, grænsen: 14 runder står, 15 er "går langsomt"', () => {
  const L = createLeague(createRng(64)), p = tobias(L, 'PHYSICAL'), a = { unlockReq: { strength: 13, jumpingPower: 14 } };
  const per = perRound(p);   // 0,07 · 1,2 (20 år) · 0,5 = 0,042
  assert.ok(Math.abs(per - 0.042) < 1e-9, `data: ${per}`);
  const at = (n) => { p.dev = { jumpingPower: 1 - per * (n - 0.5) }; return archReqText(a, p); };   // n − 0,5 skridt tilbage → ceil = n
  const base = 'Låses op ved: Styrke 13/13 ✓ · Spring 13/14 – trænes med Fysik (det gør han nu; ';
  assert.equal(at(1), base + 'næste +1 om ca. 1 runde)');
  assert.equal(at(2), base + 'næste +1 om ca. 2 runder)');
  assert.equal(at(14), base + 'næste +1 om ca. 14 runder)');
  assert.equal(at(15), base + 'går langsomt: fokus og alder)');
  assert.equal(trainingEstimate(p).lines.find((l) => l.skill === 'jumpingPower').n, 15, 'data: 15 er også estimatets tal');
});

test('kravteksten: ved to mangler på det fokus han træner står det NÆRMESTE +1 (min), og uden kampenes xp (han er starter i DEF, Styrke er nøgle-evne)', () => {
  const L = createLeague(createRng(65)), p = tobias(L, 'PHYSICAL');
  const per = perRound(p);
  p.skills.strength = 12;
  p.dev = { strength: 1 - per * 2.5, jumpingPower: 1 - per * 5.5 };   // Styrke 3 runder, Spring 6 runder (med kamp-xp +0,02 ville Styrke være 2)
  assert.equal(archReqText({ unlockReq: { strength: 13, jumpingPower: 14 } }, p), 'Låses op ved: Styrke 12/13 · Spring 13/14 – begge trænes med Fysik (det gør han nu; næste +1 om ca. 3 runder)');
  // kun ét af dem på det trænede fokus: 'han træner Teknik' → ingen "det gør han nu" for Fysik-kravene
  p.trainingFocus = 'TECH';
  assert.ok(!archReqText({ unlockReq: { strength: 13, jumpingPower: 14 } }, p).includes('det gør han nu'));
});

test('kravteksten: et ugyldigt fokus (MV-fokus på en markspiller) tæller som Alsidig – ingen "det gør han nu"', () => {
  const L = createLeague(createRng(66)), p = tobias(L, 'KEEPER');   // KEEPER er kun gyldigt for MV
  assert.equal(archReqText({ unlockReq: { goalkeeping: 14 } }, p), 'Låses op ved: Målmandsspil 2/14 – trænes med Målmand'.replace('2/14', `${p.skills.goalkeeping}/14`));
});

// ---------- Trup og Træning ----------
test('Trup: Spring-kolonnens overskrift forklarer, hvordan den trænes; arketypecellen siger "låst op" når den er det, og kravet når den ikke er', () => {
  const L = createLeague(createRng(67)), me = own(L), p = tobias(L, 'GENERAL');
  const t = COLUMNS.find((c) => c.key === 'jump').title;
  assert.match(t, /^Spring – trænes med Fysik/); assert.match(t, /luftduel/);
  const cell = () => all(rowOf(matrix(me), p.id), (e) => e.tag === 'span' && hasClass(e, 'arch'))[0];
  assert.equal(cell().attrs.title, 'Låses op ved: Styrke 13/13 ✓ · Spring 13/14 – trænes med Fysik');
  assert.ok(!hasClass(cell(), 'on'));
  p.archetype.isUnlocked = true;
  const on = cell();
  assert.ok(hasClass(on, 'on'));
  assert.equal(on.attrs.title, `${archetypeOf(p.archetype).name} – låst op`);
  assert.equal(archetypeOf(p.archetype).name, 'Luftens Konge');
  assert.ok(!on.attrs.title.includes('Låses op'));
});

test('Træning: fokusvalget PR. SPILLER viser evnerne (Alsidig = hans kædes nøgle-evner), ikke kun massehandlingen; Målmand og Forsvar med deres evner', () => {
  const L = createLeague(createRng(68)), me = own(L), p = tobias(L, 'GENERAL'), gk = me.squad.find((x) => x.line === 'GK');
  const t = renderTrainingTable({ team: me, onLine() {}, onFocus() {}, onFocusMany() {} });
  const opts = (pid) => all(rowOf(t, pid), (e) => e.tag === 'option').map((o) => o.textContent);
  const def = opts(p.id);
  assert.ok(def.includes('Alsidig – Positionering, Erobring, Styrke'), def.join(' | '));
  assert.ok(!def.some((o) => /kædens nøgle-evner/.test(o)), 'pr. spiller kendes evnerne – "kædens nøgle-evner" hører til massehandlingen');
  assert.ok(!def.includes('Målmand – Målmandsspil'), 'Målmand er kun for MV');
  assert.deepEqual(def.filter((o) => /^(Forsvar|Fysik|Hvile|Afslutning|Kondition|Teknik)/.test(o)),
    ['Kondition – Udholdenhed', 'Teknik – Boldkontrol, Pasning', 'Afslutning', 'Forsvar – Erobring, Positionering', 'Fysik – Fart, Styrke, Spring', 'Hvile']);
  const g = opts(gk.id);
  assert.ok(g.includes('Målmand – Målmandsspil'), g.join(' | '));
  assert.ok(g.some((o) => o.startsWith('Alsidig – ') && o.includes('Målmandsspil')), g.join(' | '));
  assert.equal(focusLabel('KEEPER'), 'Målmand – Målmandsspil');
  assert.equal(focusLabel('DEFENCE'), 'Forsvar – Erobring, Positionering');
});
