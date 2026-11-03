// v3.31.1 – Test Manager: det forfatterens tests lod overleve (mutationer i spec ⇄ kode, gegenpres-stavningen i referatet og Taktik,
// regnearkets særpræg-tag (låst op / modstander) og kolonne-titlerne). Hver test er skrevet, så den gamle/forkerte værdi gør den RØD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.classList = { add: (c) => { this.className += ' ' + c; }, toggle() {} }; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague, ARCHETYPES } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { POSITION_FULL, PHASE_OPTIONS } = await import('../../public/ui/labels.js');
const { renderMatrix, COLUMNS } = await import('../../public/ui/matrix.js');
const { COUNTER_LABELS } = await import('../../public/engine/counter.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const ROOT = new URL('../../public/', import.meta.url).pathname;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
const ARCH = Object.values(ARCHETYPES).flat();

test('stavning: ingen af de gamle engelske/store stavemåder står i en eneste visningstekst i public/ (gegenpres med ét s, småt)', () => {
  const files = walk(ROOT);
  assert.ok(files.length > 40, 'scanner hele public/ (ellers tjekker den intet)');
  // De interne nøgler (HIGH_GEGENPRESS) står med STORE bogstaver og røres ikke – kun stavemåder, en spiller kan se
  const OLD = [/(?<![A-Z_])[Gg]egenpress/, /Lav Blok/, /VAR-Linje/, /Lange Bolde/, /VAR-Puls/, /Scouting-indtryk/, /\(CDM\)/, /\(CAM\/CF\)/, /LW\/RW/, /wingback\)/,
    /Pressing Monster/, /Target Man/, /Sweeper Keeper/, /Penalty Killer/, /Offside Maestro/, /Line Ghost/, /Playmaker/];
  const hits = [];
  for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => { for (const re of OLD) if (re.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1} ${re} ${line.trim().slice(0, 80)}`); });
  assert.deepEqual(hits, []);
  // positiv kontrol: scanneren KAN finde: den gamle skrivemåde i en prøvelinje
  assert.ok(OLD[0].test('Højt gegenpress') && !OLD[0].test("press: 'HIGH_GEGENPRESS'"));
});

test('referatet: kampens taktiske oplæg og dit eget holds tekst staver alle seks pasnings-/presvalg præcist (højt gegenpres, ikke gegenpress)', () => {
  const PASS = { SHORT: 'korte pasninger', BALANCED: 'balanceret opbygning', DIRECT_LONG: 'direkte lange bolde' };
  const PRESS = { LOW_BLOCK: 'lav blok', MID_BLOCK: 'mellemblok', HIGH_GEGENPRESS: 'højt gegenpres' };
  for (const [ps, pt] of Object.entries(PASS)) for (const [pr, prt] of Object.entries(PRESS)) {
    const L = createLeague(createRng(41)), me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t.isBot);
    me.tactics.phases.phase1_buildUp.passingStyle = ps; me.tactics.phases.phase2_defending.pressingHeight = pr;
    const m = simulateMatch(me, opp, createRng(5), { drift: false }), want = `${me.tactics.baseFormation} • ${pt} / ${prt}`;
    assert.equal(m.homeTacticStr, want, `${ps}/${pr}`);
    assert.ok(m.events.find((e) => e.type === 'TACTIC_NOTE').text.includes(`${me.name} (${want}) møder `), `${ps}/${pr}`);
    assert.equal(m.awayTacticStr, opp.tactics.baseFormation, 'modstanderen: kun formationen');
  }
  assert.deepEqual(PHASE_OPTIONS.pressingHeight, [['LOW_BLOCK', 'Lav blok'], ['MID_BLOCK', 'Mellemblok'], ['HIGH_GEGENPRESS', 'Højt gegenpres']]);
});

test('spec ⇄ kode: særpræggenes navne og beskrivelser, de korte positioner og stilnavnene står ordret i docs/spec.md', () => {
  const spec = fs.readFileSync(new URL('../../docs/spec.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.equal(ARCH.length, 8);
  for (const a of ARCH) { assert.ok(spec.includes(a.name), `spec mangler navnet ${a.name}`); assert.ok(spec.includes(`"${a.description}"`), `spec mangler beskrivelsen: ${a.description}`); }
  for (const v of Object.values(POSITION_FULL)) assert.ok(spec.replace(/\s+/g, ' ').includes(v) || v.includes('Back/kantback') || v.includes('Kant (høje'), v);
  for (const v of ['Back/kantback (dybe kantpladser)', 'Defensiv midtbane (DM)', 'Central midtbane (CM)', 'Kant (høje kantpladser)', 'Offensiv midtbane (OM)', 'Angriber (ANG)']) assert.ok(spec.includes(v), v);
  for (const v of Object.values(COUNTER_LABELS)) assert.ok(spec.includes(`"${v}"`), v);
});

test('regnearket (Trup): særpræg-tagget – 🌟 + "arch on" når låst op, 🔒 + "arch" når låst, navn fra tabellen; modstanderen viser INTET særpræg', () => {
  const L = createLeague(createRng(7)), me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t.isBot);
  const ui = { sortCol: 'pos', sortDesc: false, filter: 'all' }, noop = () => {};
  const args = (team, isOwn) => ({ team, isOwn, ui, notes: {}, onSort: noop, onSelect: noop, onSwap: noop, onFilter: noop, onBlocked: noop });
  const withArch = me.squad.filter((p) => p.archetype);
  assert.ok(withArch.length >= 2, 'fixturet har særpræg at arbejde på');
  // gamle engelske kopier, én låst og én låst op
  withArch[0].archetype = { ...withArch[0].archetype, id: 'TARGET_MAN', name: 'Target Man', isUnlocked: false };
  withArch[1].archetype = { ...withArch[1].archetype, id: 'REGISTA', name: 'Regista (Playmaker)', isUnlocked: true };
  const tags = all(renderMatrix(args(me, true)), (e) => /(^| )arch( |$)/.test(e.className));
  const byText = Object.fromEntries(tags.map((e) => [e.textContent, e.className.trim()]));
  assert.equal(byText['🔒 Fyrtårn'], 'arch'); assert.equal(byText['🌟 Regista (spilfordeler)'], 'arch on');
  assert.ok(!Object.keys(byText).some((k) => /Target Man|Playmaker/.test(k)));
  assert.equal(tags.length, withArch.length);
  // modstanderen: spillere HAR et særpræg i data, men regnearket viser det ikke
  assert.ok(opp.squad.filter((p) => p.archetype).length >= 2, 'modstanderen har særpræg i data (ellers måler testen intet)');
  assert.deepEqual(all(renderMatrix(args(opp, false)), (e) => /(^| )arch( |$)/.test(e.className)).map((e) => e.textContent), []);
});

test('regnearkets "🧠 Mod"-kolonne: overskriftens og cellens forklaring på dansk (erfaring mod stilarter, gegenpres, lav blok, VAR-linje og lange bolde)', () => {
  assert.equal(COLUMNS.find((c) => c.key === 'mod').title, 'Erfaring mod stilarter: mod gegenpres / mod lav blok / mod VAR-linje og lange bolde (sorterer på den bedste)');
  const L = createLeague(createRng(7)), me = L.teams.find((t) => !t.isBot), noop = () => {};
  const mx = renderMatrix({ team: me, isOwn: true, ui: { sortCol: 'pos', sortDesc: false, filter: 'all' }, notes: {}, onSort: noop, onSelect: noop, onSwap: noop, onFilter: noop, onBlocked: noop });
  const cells = all(mx, (e) => /(^| )modcell( |$)/.test(e.className));
  assert.ok(cells.length >= 11);
  for (const c of cells) assert.equal(c.attrs.title, 'Mod gegenpres / lav blok / VAR-linje og lange bolde');
});
