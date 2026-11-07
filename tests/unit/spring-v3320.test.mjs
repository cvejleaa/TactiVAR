// v3.32.0 (backlog 0c – brugeren 3/11: "Tobias kan blive luftens konge, men det kræver jumpingpower på 14, men jeg kan ikke se hans
// jumpingpower i sidebjælken. Og jeg kan ikke se hvordan jeg kan træne ham i det"): Spring (p.jumpingPower) trænes med Fysik.
// Motoren (FOCUS.PHYSICAL, addXp via skillOf/setSkill, luftduellen regnes om), kortets Spring-bjælke, kravteksten med nu/krav og fokus,
// Træning-fanens fokusvalg, Trup-kolonnens "+N" og et gem fra v3.31.2. Med BESTEMTE tal, og hvad der IKKE må stå ("undefined").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
const { createLeague, ARCHETYPES, aerialBreakdown } = await import('../../public/engine/generator.js');
const { FOCUS, addXp, skillOf, setSkill, focusOfSkill, trainingEstimate, KEY_SKILLS, keyAvg } = await import('../../public/engine/career.js');
const { trainRound, afterSkillChange } = await import('../../public/engine/season.js');
const { parseSave, serialize } = await import('../../public/state/storage.js');
const { archReqText, archetypeOf, SKILL_LABELS } = await import('../../public/ui/labels.js');
const { renderCard, SKILL_NAME } = await import('../../public/ui/card.js');
const { renderMatrix, COLUMNS } = await import('../../public/ui/matrix.js');
const { renderTrainingTable, focusLabel, gainWords } = await import('../../public/ui/training.js');
const { measureJump } = await import('../../tools/measure-jump.mjs');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (root, id) => all(root, (e) => e.id === id)[0] ?? null;
const own = (L) => L.teams.find((t) => !t.isBot);
const hasClass = (e, c) => e.className.split(/\s+/).includes(c);
const rowOf = (root, pid) => all(root, (e) => e.tag === 'tr' && e.dataset.pid === pid)[0];
const card = (p, team) => renderCard({ player: p, team, isOwn: true, scouting: [], note: '', onNote() {} });
// En spiller som Tobias: 20 år, forsvarer, Styrke 13, Spring 13 – Luftens Konge kræver Styrke 13 og Spring 14
function tobias(L) {
  const me = own(L), p = me.squad.find((x) => x.line === 'DEF');
  Object.assign(p, { age: 20, jumpingPower: 13, trainingFocus: 'PHYSICAL', dev: {}, injuryMatchesLeft: 0, banMatches: 0 });
  p.skills.strength = 13; p.potential = keyAvg(p) + 3;
  p.archetype = { id: 'AERIAL_TOWER', name: 'Luftens Konge', description: 'x', unlockReq: { strength: 13, jumpingPower: 14 }, isUnlocked: false };
  afterSkillChange(p);
  return { me, p };
}

test('motoren: Fysik træner Fart, Styrke OG Spring med rate 0,07 pr. evne; skillOf/setSkill læser og skriver p.jumpingPower', () => {
  assert.deepEqual(FOCUS.PHYSICAL.skills, ['pace', 'strength', 'jumpingPower']);
  assert.equal(FOCUS.PHYSICAL.rate, 0.07, 'raten gælder pr. evne – Fart og Styrke går som før v3.32.0');
  assert.equal(focusOfSkill('jumpingPower'), 'PHYSICAL');
  assert.equal(focusOfSkill('pace'), 'PHYSICAL');
  assert.equal(focusOfSkill('ballControl'), 'TECH');
  // Spring er IKKE en af de 9 evner: hverken i p.skills eller i nogen kædes nøgle-evner
  assert.ok(!Object.values(KEY_SKILLS).flat().includes('jumpingPower'));
  const p = { skills: { strength: 9 }, jumpingPower: 11 };
  assert.equal(skillOf(p, 'jumpingPower'), 11); assert.equal(skillOf(p, 'strength'), 9);
  setSkill(p, 'jumpingPower', 12); setSkill(p, 'strength', 10);
  assert.deepEqual(p, { skills: { strength: 10 }, jumpingPower: 12 });
});

test('addXp på Spring: p.jumpingPower stiger, p.skills får INGEN jumpingPower, luftduellen regnes om (onSkill) – og Spring 20 er loftet', () => {
  const L = createLeague(createRng(41)), { p } = tobias(L);
  const up = addXp(p, 'jumpingPower', 1.2, afterSkillChange);
  assert.deepEqual(up, ['jumpingPower']);
  assert.equal(p.jumpingPower, 14);
  assert.equal('jumpingPower' in p.skills, false, 'Spring står uden for de 9 evner');
  assert.equal(p.dev.jumpingPower, 0.2);
  assert.equal(p.aerialPower, aerialBreakdown(p.heightCm, 14, p.skills.strength, p.skills.positioning).total);
  assert.equal(p.archetype.isUnlocked, true, 'Styrke 13 og Spring 14 låser Luftens Konge op med det samme');
  p.jumpingPower = 20; p.dev.jumpingPower = 0;
  assert.deepEqual(addXp(p, 'jumpingPower', 2), []);
  assert.equal(p.jumpingPower, 20); assert.equal(p.dev.jumpingPower, 0.99);
});

test('aerialPower regnes om efter Spring +1 – også når det heltallige resultat skifter (højden sat, så 13 → 14 flytter totalen)', () => {
  const L = createLeague(createRng(42)), { p } = tobias(L);
  // find en højde, hvor Spring 13 → 14 ændrer den afrundede total
  for (let cm = 170; cm <= 200; cm++) {
    const a = aerialBreakdown(cm, 13, p.skills.strength, p.skills.positioning).total, b = aerialBreakdown(cm, 14, p.skills.strength, p.skills.positioning).total;
    if (b > a) { p.heightCm = cm; break; }
  }
  afterSkillChange(p);
  const before = p.aerialPower;
  addXp(p, 'jumpingPower', 1, afterSkillChange);
  assert.equal(p.jumpingPower, 14);
  assert.equal(p.aerialPower, before + 1, `${p.heightCm} cm: luftduellen skal stige med det samme (${before} → ${before + 1})`);
});

test('trainRound: en ung spiller på Fysik får xp i Spring hver runde, en på Alsidig ikke; rapporten siger "+1 Spring"', () => {
  const L = createLeague(createRng(43)), { me, p } = tobias(L), q = me.squad.find((x) => x !== p && x.line === 'DEF');
  q.trainingFocus = 'GENERAL'; q.dev = {}; q.injuryMatchesLeft = 0;
  p.dev.jumpingPower = 0.99;
  const j0 = q.jumpingPower;
  trainRound(L, { round: 1, matches: [] }, new Map());
  assert.equal(p.jumpingPower, 14, 'Spring 13 → 14 efter en runde med Fysik (dev 0,99)');
  assert.equal(q.jumpingPower, j0); assert.equal(q.dev.jumpingPower, undefined, 'Alsidig træner ikke Spring');
  const gains = L.trainingReport[me.id].gains.filter((g) => g.id === p.id).map((g) => g.skill);
  assert.ok(gains.includes('jumpingPower'), JSON.stringify(gains));
  assert.equal(gainWords(gains.filter((s) => s === 'jumpingPower')), '+1 Spring');
});

test('trainingEstimate og kortets træningsblok: Fysik viser Fart, Styrke og Spring med fremdrift – aldrig "undefined"', () => {
  const L = createLeague(createRng(44)), { me, p } = tobias(L);
  p.dev = { pace: 0.1, strength: 0.2, jumpingPower: 0.5 };
  const e = trainingEstimate(p);
  assert.deepEqual(e.lines.map((l) => l.skill), ['pace', 'strength', 'jumpingPower']);
  assert.equal(e.lines[2].dev, 0.5); assert.equal(e.lines[2].top, false);
  const t = byId(card(p, me), 'card-training').textContent;
  assert.ok(t.includes('Spring 0,5/1,0'), t);
  assert.ok(t.includes('Fart 0,1/1,0') && t.includes('Styrke 0,2/1,0'), t);
  assert.ok(!/undefined|NaN/.test(t), t);
  p.jumpingPower = 20;
  assert.equal(trainingEstimate(p).lines[2].top, true, 'Spring 20 er helt i top (skillOf – ikke p.skills.jumpingPower)');
  assert.ok(byId(card(p, me), 'card-training').textContent.includes('Spring 20 – helt i top'));
});

test('kortet: "Spring" som bjælke i "Fysik & luft" med p.jumpingPower – 10 bjælker, ingen "undefined"', () => {
  const L = createLeague(createRng(45)), { me, p } = tobias(L);
  p.jumpingPower = 17;
  assert.deepEqual(SKILL_LABELS[0], ['Fysik & luft', [['pace', 'Fart'], ['stamina', 'Udholdenhed'], ['strength', 'Styrke'], ['jumpingPower', 'Spring']]]);
  assert.equal(SKILL_NAME.jumpingPower, 'Spring');
  const el = card(p, me), bars = all(el, (e) => hasClass(e, 'bar') && all(e, (x) => hasClass(x, 'bar-label')).length);
  assert.equal(all(all(el, (e) => hasClass(e, 'bars'))[0], (e) => hasClass(e, 'bar')).length, 10, 'ni evner + Spring');
  const spring = bars.find((b) => all(b, (x) => hasClass(x, 'bar-label'))[0].textContent === 'Spring');
  assert.ok(spring, 'Spring-bjælken findes');
  assert.equal(all(spring, (x) => hasClass(x, 'bar-val'))[0].textContent, '17');
  assert.equal(all(spring, (x) => hasClass(x, 'bar-fill'))[0].style.width, '85%');
  const group = all(el, (e) => hasClass(e, 'bar-group') && e.children[0]?.textContent === 'Fysik & luft')[0];
  assert.deepEqual(all(group, (x) => hasClass(x, 'bar-label')).map((x) => x.textContent), ['Fart', 'Udholdenhed', 'Styrke', 'Spring']);
  assert.ok(!/undefined|NaN/.test(el.textContent));
});

test('kravteksten: nu/krav, ✓ for opfyldt, fokus for det, der mangler – "det gør han nu" med skønnet, "begge" ved samme fokus', () => {
  const L = createLeague(createRng(46)), { p } = tobias(L), a = archetypeOf(p.archetype);
  p.trainingFocus = 'GENERAL';
  assert.equal(archReqText(a, p), 'Låses op ved: Styrke 13/13 ✓ · Spring 13/14 – trænes med Fysik');
  p.trainingFocus = 'PHYSICAL';
  const n = trainingEstimate(p).lines.find((l) => l.skill === 'jumpingPower').n;
  assert.ok(n > 0 && n <= 14, `data: en ung spiller med plads når +1 inden for en sæson (${n})`);
  assert.equal(archReqText(a, p), `Låses op ved: Styrke 13/13 ✓ · Spring 13/14 – trænes med Fysik (det gør han nu; næste +1 om ca. ${n} runder)`);
  p.skills.strength = 12; p.trainingFocus = 'GENERAL';
  assert.equal(archReqText(a, p), 'Låses op ved: Styrke 12/13 · Spring 13/14 – begge trænes med Fysik');
  // Tæt på loftet (roomOf klemt til 0,1 – Tobias' profil, ikke snittet): langsomt, og hvorfor
  p.potential = keyAvg(p); p.age = 25; p.trainingFocus = 'PHYSICAL';
  assert.equal(archReqText(a, p), 'Låses op ved: Styrke 12/13 · Spring 13/14 – begge trænes med Fysik (det gør han nu; går langsomt – han er tæt på sit loft)');
  // To mangler med HVER sit fokus: hver sit hint; det opfyldte uden fokus
  p.trainingFocus = 'GENERAL'; p.skills.stamina = 10; p.skills.intercepting = 12;
  assert.equal(archReqText({ unlockReq: { stamina: 14, intercepting: 12 } }, p), 'Låses op ved: Udholdenhed 10/14 – trænes med Kondition · Erobring 12/12 ✓');
  p.skills.passing = 9; p.skills.finishing = 5;
  assert.equal(archReqText({ unlockReq: { passing: 13, finishing: 9 } }, p), 'Låses op ved: Pasning 9/13 – trænes med Teknik · Afslutning 5/9 – trænes med Afslutning');
  assert.ok(!/undefined|NaN|jumpingPower/.test(archReqText(a, p)));
});

test('paritet: hver evne i et arketypekrav har et dansk navn og et fokus, der træner den', () => {
  const keys = new Set(Object.values(ARCHETYPES).flat().flatMap((a) => Object.keys(a.unlockReq)));
  assert.ok(keys.has('jumpingPower') && keys.size === 9, [...keys].join());
  for (const k of keys) {
    assert.ok(focusOfSkill(k), `${k} har intet fokus`);
    assert.ok(FOCUS[focusOfSkill(k)].skills.includes(k));
    assert.ok(SKILL_NAME[k], `${k} har intet dansk navn`);
  }
});

test('kravteksten på kortet, i Trups arketypecelle (title) – kun dit hold', () => {
  const L = createLeague(createRng(47)), { me, p } = tobias(L);
  p.trainingFocus = 'GENERAL';
  const want = 'Låses op ved: Styrke 13/13 ✓ · Spring 13/14 – trænes med Fysik';
  assert.equal(byId(card(p, me), 'card-arch-req').textContent, want);
  const ui = { sortCol: 'pos', sortDesc: false, filter: 'all', gains: new Map(), gainRound: 1 };
  const mx = renderMatrix({ team: me, isOwn: true, ui, notes: {}, onSort() {}, onSelect() {}, onFilter() {}, onBlocked() {} });
  const cell = all(rowOf(mx, p.id), (e) => e.tag === 'span' && hasClass(e, 'arch'))[0];
  assert.equal(cell.attrs.title, want);
  // en modstander: ingen arketype, ingen kravtekst
  const bot = L.teams.find((t) => t.isBot);
  const mb = renderMatrix({ team: bot, isOwn: false, ui, notes: {}, onSort() {}, onSelect() {}, onFilter() {}, onBlocked() {} });
  assert.ok(!mb.textContent.includes('Låses op') && all(mb, (e) => /Låses op/.test(e.attrs.title ?? '')).length === 0);
});

test('Trup: Spring-kolonnen får "+N" for jumpingPower (før v3.32.0 aldrig); "jump"/"aerial"/"avg" som navne giver stadig intet mærke', () => {
  const L = createLeague(createRng(48)), me = own(L), [p0, p1] = me.squad;
  const col = (k) => COLUMNS.findIndex((c) => c.key === k);
  const ui = { sortCol: 'pos', sortDesc: false, filter: 'all', gains: new Map([[p0.id, ['jumpingPower', 'jumpingPower']], [p1.id, ['jump', 'aerial', 'avg']]]), gainRound: 4 };
  const mx = renderMatrix({ team: me, isOwn: true, ui, notes: {}, onSort() {}, onSelect() {}, onFilter() {}, onBlocked() {} });
  const j0 = rowOf(mx, p0.id).children[col('jump')], j1 = rowOf(mx, p1.id).children[col('jump')];
  assert.ok(hasClass(j0, 'gain') && j0.dataset.gain === '2', j0.className);
  assert.equal(j0.attrs.title, '+2 Spring efter runde 4');
  assert.equal(j0.textContent, String(p0.jumpingPower));
  assert.ok(!hasClass(j1, 'gain') && j1.attrs.title === undefined);
  assert.equal(all(rowOf(mx, p1.id), (e) => e.tag === 'td' && hasClass(e, 'gain')).length, 0);
  assert.match(COLUMNS[col('avg')].title, /Spring tæller ikke med/);
});

test('Træning-fanen: fokusvalget viser sine evner ("Fysik – Fart, Styrke, Spring"), fremdriften SPR, ét-evne-fokus står alene', () => {
  const L = createLeague(createRng(49)), { me, p } = tobias(L);
  p.dev = { jumpingPower: 0.4 };
  assert.equal(focusLabel('PHYSICAL'), 'Fysik – Fart, Styrke, Spring');
  assert.equal(focusLabel('TECH'), 'Teknik – Boldkontrol, Pasning');
  assert.equal(focusLabel('FINISH'), 'Afslutning');
  assert.equal(focusLabel('STAMINA'), 'Kondition – Udholdenhed');
  assert.equal(focusLabel('REST'), 'Hvile');
  assert.equal(focusLabel('GENERAL'), 'Alsidig – kædens nøgle-evner');
  assert.equal(focusLabel('GENERAL', p), 'Alsidig – Positionering, Erobring, Styrke');
  const t = renderTrainingTable({ team: me, onLine() {}, onFocus() {}, onFocusMany() {} });
  const row = rowOf(t, p.id), opts = all(row, (e) => e.tag === 'option').map((o) => o.textContent);
  assert.ok(opts.includes('Fysik – Fart, Styrke, Spring'), opts.join(' | '));
  assert.ok(all(row, (e) => hasClass(e, 'train-prog'))[0].textContent.includes('SPR 0,4'));
  const many = all(t, (e) => e.id === 'focus-many' || e.attrs.id === 'focus-many')[0];
  assert.ok(all(many, (e) => e.tag === 'option').some((o) => o.textContent === 'Fysik – Fart, Styrke, Spring'));
  assert.ok(!/undefined|NaN/.test(t.textContent));
});

test('gem fra v3.31.2 (tests/fixtures/save-v3.31.2.json): indlæses (siden v3.33.1 med 9 → 10 – intet om Spring); dev.jumpingPower overlever gem og indlæsning', () => {
  const RAW = fs.readFileSync(new URL('../fixtures/save-v3.31.2.json', import.meta.url), 'utf8'), raw = JSON.parse(RAW);
  const rawMe = raw.league.teams.find((t) => !t.isBot);
  assert.ok(rawMe.squad.some((p) => p.trainingFocus === 'PHYSICAL' && p.dev?.pace > 0), 'data: fixturet har spillere på Fysik med fremdrift');
  assert.ok(rawMe.squad.every((p) => p.dev?.jumpingPower === undefined), 'data: v3.31.2 kendte ikke Spring-træning');
  const r = parseSave(RAW);
  assert.ok(r.ok, r.error);
  const L = r.state.league, me = own(L), p = me.squad.find((x) => x.trainingFocus === 'PHYSICAL' && x.injuryMatchesLeft === 0);
  assert.equal(r.migratedFrom, 9, 'v3.33.1: skema 9 → 10 (sæsonens løbetal, karrierestop) – Spring-træningen kræver stadig ingen migrering');
  const j0 = p.jumpingPower;
  p.dev.jumpingPower = 0.995;
  trainRound(L, { round: L.leagueMetadata.round + 1, matches: [] }, new Map());
  assert.equal(p.jumpingPower, j0 + 1);
  const back = parseSave(serialize(r.state));
  assert.ok(back.ok, back.error);
  const q = own(back.state.league).squad.find((x) => x.id === p.id);
  assert.equal(q.jumpingPower, j0 + 1);
  assert.equal(q.dev.jumpingPower, p.dev.jumpingPower, 'dev.jumpingPower ryddes ikke af sanitize');
  assert.ok(q.dev.jumpingPower > 0);
  const t = byId(card(q, own(back.state.league)), 'card-training').textContent;
  assert.ok(t.includes('Spring ') && !/undefined|NaN/.test(t), t);
});

test('measure-jump (tools/measure-jump.mjs): de 17–23-årige på Fysik når Spring +1 inden for to sæsoner – før v3.32.0 ingen (0 af 28)', () => {
  // Seeds 1–3, 2 sæsoner: før v3.32.0 0/28 (Spring kunne ikke trænes), efter 20/28 = 0,71. Båndet ≥ 0,5 er rødt med den gamle værdi.
  const young = [1, 2, 3].flatMap((s) => measureJump(s, 2).young);
  assert.ok(young.length >= 20, `data: ${young.length} unge`);
  const share = young.filter((n) => n <= 28).length / young.length;
  assert.ok(share >= 0.5, `andel ${share}`);
});

// ---------- D5: aldersfaldet tager Spring med (egen commit – den eneste del, der må flytte golden-hashes over sæsoner) ----------
const { declineSkills, trainedSkills, DECLINE } = await import('../../public/engine/career.js');
const { seasonTurnover } = await import('../../public/engine/season.js');

test('aldersfald: Spring falder med Styrkes sats fra 30 år, Fysik halverer faldet; ingen før 30 – og Spring står sidst i DECLINE', () => {
  const mk = (age, id) => ({ id, age, line: 'DEF', jumpingPower: 14, skills: { pace: 12, stamina: 12, strength: 12, ballControl: 12, passing: 12, finishing: 12, positioning: 12, intercepting: 12, goalkeeping: 2 } });
  assert.deepEqual(DECLINE.at(-1), [['jumpingPower'], 0.2, 0.1], 'sidst: de 9 evners træk i den afledte rng er de samme som før v3.32.0');
  let free = 0, trained = 0, young = 0;
  for (let i = 0; i < 400; i++) {
    const a = mk(33, `j${i}`), b = mk(33, `j${i}`), c = mk(29, `j${i}`);
    if (declineSkills(a, 1).includes('jumpingPower')) { free++; assert.equal(a.jumpingPower, 13); assert.equal('jumpingPower' in a.skills, false); }
    if (declineSkills(b, 1, trainedSkills({ line: 'DEF', trainingFocus: 'PHYSICAL' }, false)).includes('jumpingPower')) trained++;
    if (declineSkills(c, 1).includes('jumpingPower')) young++;
  }
  // 33 år: 0,2 + 3 · 0,1 = 0,5 → ≈ 200 af 400 (før v3.32.0: 0 – Spring faldt aldrig); trænet med Fysik ≈ 100
  assert.ok(free > 160 && free < 240, String(free));
  assert.ok(trained > 70 && trained < 130, String(trained));
  assert.equal(young, 0);
  assert.ok(trainedSkills({ line: 'DEF', trainingFocus: 'PHYSICAL' }, false).has('jumpingPower'));
  // Spring 1 falder ikke under 1
  const low = mk(36, 'low'); low.jumpingPower = 1;
  for (let s = 1; s < 30; s++) declineSkills(low, s);
  assert.equal(low.jumpingPower, 1);
});

test('sæsonskiftet: en 31-årigs Spring kan falde, og luftduellen regnes om med den nye værdi', () => {
  const L = createLeague(createRng(51)), me = own(L);
  for (const p of me.squad) { p.age = 31; p.jumpingPower = 15; p.trainingFocus = 'GENERAL'; afterSkillChange(p); }
  const before = new Map(me.squad.map((p) => [p.id, p.jumpingPower]));
  seasonTurnover(L);   // 31 → 32 år: Spring falder med 0,2 + 0,1 · 2 = 0,4 (pension ¼)
  const stay = own(L).squad.filter((p) => before.has(p.id));
  const fell = stay.filter((p) => p.jumpingPower < before.get(p.id));
  assert.ok(stay.length >= 1, 'data: nogen er stadig i truppen');
  assert.ok(fell.length >= 1, `data: mindst én faldt i Spring (${fell.length}/${stay.length})`);
  for (const p of fell) {
    assert.equal(p.jumpingPower, 14);
    assert.equal(p.aerialPower, aerialBreakdown(p.heightCm, p.jumpingPower, p.skills.strength, p.skills.positioning).total, p.id);
  }
});

// QC v3.32.0: kravteksten og kortets træningsboks giver SAMME "næste +1" – også for en starter, hvor kampenes xp i
// nøgle-evnerne tæller (før: kravteksten regnede uden starter og kunne sige 9 runder, mens boksen sagde 7)
test('Kravteksten bruger samme skøn som kortet: en DEF-starter, der mangler Styrke på Fysik', async () => {
  const { archReqText } = await import('../../public/ui/labels.js');
  const { trainingEstimate, KEY_SKILLS } = await import('../../public/engine/career.js');
  const { createLeague } = await import('../../public/engine/generator.js');
  const { createRng } = await import('../../public/engine/rng.js');
  const L = createLeague(createRng(31)), me = L.teams.find((t) => !t.isBot);
  const p = me.squad.find((x) => x.line === 'DEF' && KEY_SKILLS.DEF.includes('strength')) ?? me.squad.find((x) => x.line === 'DEF');
  p.trainingFocus = 'PHYSICAL'; p.skills.strength = 12; p.dev = { strength: 0.5 }; p.age = 21; p.potential = 18;
  const a = { id: 'AERIAL_TOWER', unlockReq: { strength: 13 } };
  const want = (st) => trainingEstimate(p, st).lines.find((l) => l.skill === 'strength').n;
  for (const st of [false, true]) {
    const n = want(st), txt = archReqText(a, p, st);
    assert.ok(txt.includes(n > 14 ? 'går langsomt' : `næste +1 om ca. ${n} runde`), `${st}: ${txt} (skøn ${n})`);
  }
  if (KEY_SKILLS.DEF.includes('strength')) assert.notEqual(want(true), want(false), 'data: starteren skal give et andet skøn, ellers tester vi intet');
});
