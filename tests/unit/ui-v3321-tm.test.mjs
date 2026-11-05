// v3.32.1, Test Manager: huller i forfatterens ui-v3321.test.mjs, fundet ved mutation (se hukommelsen). Forfatterens tests pinner markScrollable
// på ÉT scenarie pr. gren (grænse 40 % kun mellem 27 % og 50 %, "mere" kun nøjagtigt ved enden, ingen ny måling ved rulning, ingen ryd ved
// remark/passer-igen), foldets ontoggle slet ikke, og matrixens data-pos (pladsen i navnecellen) kun ved at sammenligne med sig selv.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  querySelectorAll() { return []; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { fold, markScrollable, remarkScrollable } = await import('../../public/ui/dom.js');
const { renderMatchCenter, fullTimeLine, ftTone } = await import('../../public/ui/matchcenter.js');
const { renderMatrix, COLUMNS } = await import('../../public/ui/matrix.js');
const { renderTrainingTable } = await import('../../public/ui/training.js');
const { clearReplays } = await import('../../public/ui/replay.js');
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id || e.id === id);
const hasCls = (e, c) => e.className.split(/\s+/).includes(c);

// Et falsk rulle-element; w1/w2 = bredden af de to låste celler
function wrap({ scrollWidth, clientWidth, scrollLeft = 0, w1 = 60, w2 = 90, stick = true }) {
  const cell = (w) => ({ getBoundingClientRect: () => ({ width: w }) });
  const o = { scrollWidth, clientWidth, scrollLeft, w1, w2, dataset: {}, listeners: {}, props: {}, style: { setProperty: (k, v) => { o.props[k] = v; } },
    matches: (s) => s === '.tablewrap', querySelectorAll: () => [],
    querySelector: (s) => (!stick ? null : s === 'tbody .stick-1' ? cell(o.w1) : s === 'tbody .stick-2' ? cell(o.w2) : null),
    addEventListener(k, f) { this.listeners[k] = f; } };
  return o;
}
// En container, der rummer rulle-elementerne (som et fold eller siden)
const holder = (...ws) => ({ matches: () => false, querySelectorAll: (s) => (s.includes('[data-stick]') ? ws.filter((w) => w.dataset.stick) : ws) });

test('markScrollable: "mere til højre" tæller 1 px afrunding – 1 px fra enden er ENDEN, 2 px fra enden er der mere', () => {
  const w = wrap({ scrollWidth: 1000, clientWidth: 324 });
  markScrollable(w); assert.equal(w.dataset.more, 'ja');
  w.scrollLeft = 1000 - 324 - 2; w.listeners.scroll(); assert.equal(w.dataset.more, 'ja', '2 px fra enden: stadig mere');
  w.scrollLeft = 1000 - 324 - 1; w.listeners.scroll(); assert.equal(w.dataset.more, undefined, '1 px fra enden (subpixel-afrunding): fade væk');
  w.scrollLeft = 1000 - 324; w.listeners.scroll(); assert.equal(w.dataset.more, undefined);
  // "mere" uden "bredere end rammen" findes ikke: en tabel, der passer, har hverken scroll eller more – også selv om scrollLeft er 0 og bredden er mindre
  const fits = wrap({ scrollWidth: 300, clientWidth: 324 }); markScrollable(fits);
  assert.deepEqual([fits.dataset.scroll, fits.dataset.more], [undefined, undefined]);
  // 2 px bredere er bredere (1 px er afrunding)
  const two = wrap({ scrollWidth: 1102, clientWidth: 1100 }); markScrollable(two); assert.equal(two.dataset.scroll, 'ja');
});

test('markScrollable: grænsen er 40 % af rammen – 39 % låser begge kolonner, 41 % kun navnet (ikke bare "et sted mellem 27 og 50 %")', () => {
  const at = (ratio) => { const w = wrap({ scrollWidth: 2000, clientWidth: 1000, w1: ratio * 400, w2: ratio * 600 }); markScrollable(w); return w.dataset.stick; };
  assert.equal(at(0.39), 'alle'); assert.equal(at(0.41), 'navn');
  assert.equal(at(0.1), 'alle'); assert.equal(at(0.6), 'navn');
});

test('markScrollable: en tabel med kun ÉN låst kolonne (Træning, regnskabet) er altid "alle" – også når kolonnen fylder over 40 % (i "navn" er stick-1 ikke låst, og der er ingen stick-2)', () => {
  const one = wrap({ scrollWidth: 900, clientWidth: 324, w1: 200 });
  one.querySelector = (s) => (s === 'tbody .stick-1' ? { getBoundingClientRect: () => ({ width: 200 }) } : null);   // 62 % af rammen
  markScrollable(one);
  assert.equal(one.dataset.stick, 'alle'); assert.equal(one.props['--stick1-w'], '200px');
});

test('markScrollable: --stick1-w er den låste FØRSTE kolonnes bredde (ikke navnets), og målingen står fast, når der rulles (pladsen i navnecellen ændrer selv bredden)', () => {
  const w = wrap({ scrollWidth: 1200, clientWidth: 324, w1: 68, w2: 93 });
  markScrollable(w);
  assert.equal(w.props['--stick1-w'], '68px'); assert.equal(w.dataset.stick, 'navn');
  // "navn"-tilstanden gør navnecellen bredere (pladsen foran navnet) og pladsen smallere: en ny måling ved rulning ville skifte tilstand
  w.w1 = 20; w.w2 = 40; w.scrollLeft = 200; w.listeners.scroll();
  assert.equal(w.dataset.stick, 'navn', 'ikke afgjort igen ved rulning'); assert.equal(w.props['--stick1-w'], '68px');
  assert.equal(w.dataset.more, 'ja', 'men "mere" følger rulningen');
});

test('markScrollable: passer tabellen igen (bredere ramme), ryddes den låste tilstand; remarkScrollable afgør forfra (drej telefonen)', () => {
  const w = wrap({ scrollWidth: 1200, clientWidth: 324, w1: 68, w2: 93 });
  markScrollable(w); assert.equal(w.dataset.stick, 'navn');
  w.clientWidth = 1300; w.listeners.scroll();
  assert.deepEqual([w.dataset.scroll, w.dataset.more, w.dataset.stick], [undefined, undefined, undefined], 'passer: alt ryddet');
  // remark: en gammel afgørelse ('navn' ved smal ramme) droppes, når rammen er blevet bredere, men tabellen stadig ruller
  const v = wrap({ scrollWidth: 1200, clientWidth: 324, w1: 68, w2: 93 });
  markScrollable(v); assert.equal(v.dataset.stick, 'navn');
  v.clientWidth = 700; v.w1 = 68; v.w2 = 93;
  remarkScrollable(holder(v));
  assert.equal(v.dataset.stick, 'alle', '161 af 700 = 23 % → begge låst; uden remark blev "navn" stående');
  markScrollable(holder(v)); assert.equal(v.dataset.stick, 'alle');
});

test('markScrollable: finder tabeller INDE i en container (siden, et fold) og container-elementet selv; lytter sættes én gang pr. ramme', () => {
  const a = wrap({ scrollWidth: 900, clientWidth: 324 }), b = wrap({ scrollWidth: 400, clientWidth: 324 });
  markScrollable(holder(a, b));
  assert.equal(a.dataset.scroll, 'ja'); assert.equal(b.dataset.scroll, 'ja');
  assert.equal(typeof a.listeners.scroll, 'function'); assert.equal(typeof b.listeners.scroll, 'function');
  const first = a.listeners.scroll; markScrollable(holder(a)); assert.equal(a.listeners.scroll, first, 'ikke en ny lytter ved hver tegning');
  const self = wrap({ scrollWidth: 900, clientWidth: 324 }); markScrollable(self);   // selv en .tablewrap (matches) måles
  assert.equal(self.dataset.scroll, 'ja');
});

test('fold: når det åbnes/lukkes, måles de brede tabeller i det igen (indholdet i et lukket fold har bredde 0)', () => {
  const w = wrap({ scrollWidth: 0, clientWidth: 0 });
  const d = fold({ id: 'tm-fold-mark', summary: 'S' }, 'x');
  markScrollable(holder(w)); assert.equal(w.dataset.scroll, undefined, 'lukket: intet at rulle');
  w.scrollWidth = 900; w.clientWidth = 324;
  d.listeners.toggle({ target: holder(w) });
  assert.equal(w.dataset.scroll, 'ja', 'åbnet: målt forfra');
});

// ---------- Kamp: ⋯ Mere i alle tre tilstande, fanegruppens tilgængelighed, fuldtids-linjens tekst ----------
function played(seed = 3) {
  const L = createLeague(createRng(seed)), me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t.isBot);
  return { me, m: simulateMatch(me, opp, createRng(seed + 100)) };
}
const noop = () => {};
const baseOn = { snapshot: noop, view: noop, filter: noop, skip: noop, replay: noop, heat: noop, pane: noop, copyId: noop };
const draw = (m, me, mc, on) => { clearReplays(); return renderMatchCenter({ mc: { round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false, sent: [], ...mc }, myTeamId: me.id, on }); };

test('"⋯ Mere": findes kun efter fløjtet og kun når der er noget i det – send-boksen alene, listen alene, begge, eller slet ikke', () => {
  const { me, m } = played();
  const sent = [{ id: 'K-1', label: 'x', replay: true }];
  const both = draw(m, me, { sent, canSend: false, sendWhy: 'hvorfor' }, { ...baseOn, send: noop });
  assert.equal(byId(both, 'mc-more').length, 1); assert.equal(byId(both, 'send-off').length, 1); assert.equal(byId(both, 'sent-list').length, 1);
  const listOnly = draw(m, me, { sent }, baseOn);   // ingen on.send (fx gemt uden Firebase): listen står stadig
  assert.equal(byId(listOnly, 'mc-more').length, 1); assert.equal(byId(listOnly, 'sent-list').length, 1); assert.equal(byId(listOnly, 'send-off').length + byId(listOnly, 'send-match').length, 0);
  const sendOnly = draw(m, me, { sent: [], canSend: false, sendWhy: 'hvorfor' }, { ...baseOn, send: noop });
  assert.equal(byId(sendOnly, 'mc-more').length, 1); assert.equal(byId(sendOnly, 'sent-list').length, 0, 'ingen tom liste');
  const none = draw(m, me, { sent: [] }, baseOn);
  assert.equal(byId(none, 'mc-more').length, 0, 'et tomt fold uden indhold vises ikke');
  const live = draw(m, me, { sent, playing: true, shownCount: 10 }, { ...baseOn, send: noop });
  assert.equal(byId(live, 'mc-more').length, 0); assert.equal(byId(live, 'sent-list').length, 0, 'ikke under live-afspilning');
});

test('fanegruppen er en navngiven gruppe (skærmlæser): role="group" og aria-label "Kampens visninger"', () => {
  const { me, m } = played();
  const tabs = byId(draw(m, me, {}, baseOn), 'mc-tabs')[0];
  assert.equal(tabs.attrs.role, 'group'); assert.equal(tabs.attrs['aria-label'], 'Kampens visninger');
  const more = byId(draw(m, me, { sent: [{ id: 'K-1', label: 'x' }] }, baseOn), 'mc-more')[0];
  assert.equal(more.children[0].attrs['aria-label'], 'Mere: send kampen');
});

test('statistik-fanen viser kampens egne tal – hjemme i 1. kolonne, ude i 3. (en ombytning ses, summen alene ville ikke)', () => {
  const { me, m } = played();
  const st = m.events.at(-1).stats;
  assert.ok(st && st.hShots + st.aShots > 0 && st.hShots !== st.aShots, 'fixturet har afslutninger, og siderne er forskellige');
  const t = byId(draw(m, me, { pane: 'stats' }, baseOn), 'match-stats')[0];
  const rows = Object.fromEntries(all(t, (e) => e.tag === 'tr' && e.children.length === 3 && e.children[1].tag === 'th').map((r) => [r.children[1].textContent, [r.children[0].textContent, r.children[2].textContent]]));
  const pct = Math.round((st.hPoss / (st.hPoss + st.aPoss)) * 100);
  assert.deepEqual(rows['Boldbesiddelse'], [`${pct}%`, `${100 - pct}%`]);
  assert.deepEqual(rows['Afslutninger'], [String(st.hShots), String(st.aShots)]);
  assert.deepEqual(rows['Skud på mål'], [String(st.hOnTarget), String(st.aOnTarget)]);
  assert.equal(Object.keys(rows).length, 14);
});

test('fuldtids-linjen: "<resultat>. <taktisk dom>." (3. sætning) – ellers boldbesiddelsen; bundet til FULLTIME-hændelsen', () => {
  const text = '📊 [FULDTIDS-ANALYSE] Sejr 2-1 til dig. Du havde 55% af bolden og 7 afslutninger. Din opbygning kom igennem 5 af 12 gange; dit pres vandt bolden 2 af 4 gange. Dødbolde: 3 hjørnespark. Slut.';
  assert.equal(fullTimeLine([{ type: 'GOAL', text: 'x' }, { type: 'FULLTIME', text }]), 'Sejr 2-1 til dig. Din opbygning kom igennem 5 af 12 gange; dit pres vandt bolden 2 af 4 gange.');
  assert.equal(fullTimeLine([{ type: 'FULLTIME', text: '📊 [FULDTIDS-ANALYSE] Nederlag 0-1. Du havde 40% af bolden.' }]), 'Nederlag 0-1. Du havde 40% af bolden.', 'uden dom: boldbesiddelsen');
  assert.deepEqual(['Sejr 2-1 til dig.', 'Nederlag 0-1.', 'Uafgjort 1-1.'].map(ftTone), ['ft-win', 'ft-loss', 'ft-draw']);
  assert.equal(fullTimeLine([{ type: 'FULLTIME', text: '📊 [FULDTIDS-ANALYSE] Uafgjort 0-0.' }]), 'Uafgjort 0-0.', 'kun én sætning: ingen hængende mellemrum');
  assert.equal(fullTimeLine([{ type: 'GOAL', text }]), null, 'kun FULLTIME-hændelsen tæller');
  assert.equal(fullTimeLine([{ type: 'FULLTIME', text: 'Slutfløjt' }]), null, 'uden analyse-mærket ingen linje');
  assert.equal(fullTimeLine([{ type: 'FULLTIME' }]), null);
  assert.equal(fullTimeLine([]), null);
});

// ---------- Trup: pladsen i navnecellen er den samme som Pos-cellens ----------
test('Trup: data-pos på navnecellen = plads-mærket i Pos-cellen (starter: rollen; bænk: BÆNK; resten: RES) – for HVER række, og de låste kolonner har deres klasse', () => {
  const L = createLeague(createRng(7)), team = L.teams.find((t) => !t.isBot);
  // en 19. spiller uden for startopstillingen og kamptruppen = reserve (en frisk trup er 18: 11 + 7)
  const res = structuredClone(team.squad.at(-1)); res.id = 'reserve-tm'; res.shirtNumber = 99; res.shortName = 'Reserve'; res.skills = Object.fromEntries(Object.keys(res.skills).map((k) => [k, 1]));
  team.squad.push(res);
  const ui = { sortCol: 'pos', sortDesc: false, filter: 'all' };
  const root = renderMatrix({ team, isOwn: true, ui, notes: {}, onSort: noop, onSelect: noop, onSwap: null, onFilter: noop, onBlocked: noop });
  const rows = all(root, (e) => e.tag === 'tr' && e.dataset.pid);
  assert.equal(rows.length, team.squad.length);
  const kinds = new Set();
  for (const r of rows) {
    const pos = all(r, (e) => e.tag === 'td' && hasCls(e, 'stick-1'))[0], name = all(r, (e) => e.tag === 'td' && hasCls(e, 'stick-2'))[0];
    assert.ok(pos && name, 'begge låste celler i hver række');
    const label = pos.textContent.replace(/ #\d+$/, '');
    assert.equal(name.dataset.pos, label, `${name.textContent}: ${label}`);
    kinds.add(label === 'BÆNK' ? 'BÆNK' : label === 'RES' ? 'RES' : 'rolle');
    assert.equal(pos.textContent.startsWith(label + ' #'), true);
  }
  assert.deepEqual([...kinds].sort(), ['BÆNK', 'RES', 'rolle'], 'fixturet har starter, bænk og reserve');
  assert.equal(rows.filter((r) => all(r, (e) => e.dataset?.pos === 'BÆNK').length).length, 7, '7 på kamptruppens bænk');
  // overskriftsrækken: Pos og Spiller er låst, ingen andre
  const th = all(root, (e) => e.tag === 'th' && /stick-/.test(e.className)).map((e) => [e.textContent.replace(/ [▲▼]$/, ''), e.className.match(/stick-\d/)[0]]);
  assert.deepEqual(th, [['Pos/#', 'stick-1'], ['Spiller', 'stick-2']]);
  assert.equal(all(root, (e) => e.tag === 'td' && /stick-/.test(e.className)).length, rows.length * 2, 'kun de to kolonner låses i hver række');
  assert.equal(COLUMNS[0].key, 'pos'); assert.equal(COLUMNS[1].key, 'name');
});

test('Trup: navnecellen i en række med +N-mærke (evne steget) har OGSÅ data-pos – ellers mister den sin plads, når Pos-kolonnen er rullet væk', () => {
  const L = createLeague(createRng(7)), team = L.teams.find((t) => !t.isBot);
  const gainer = team.squad.find((p) => team.tactics.lineupSlots.includes(p.id));
  const ui = { sortCol: 'pos', sortDesc: false, filter: 'all', gains: new Map([[gainer.id, ['pace']]]), gainRound: 3 };
  const root = renderMatrix({ team, isOwn: true, ui, notes: {}, onSort: noop, onSelect: noop, onSwap: null, onFilter: noop, onBlocked: noop });
  const row = all(root, (e) => e.tag === 'tr' && e.dataset.pid === gainer.id)[0];
  const name = all(row, (e) => e.tag === 'td' && hasCls(e, 'stick-2'))[0], pos = all(row, (e) => e.tag === 'td' && hasCls(e, 'stick-1'))[0];
  assert.ok(hasCls(name, 'player-gain') && name.dataset.gain === '1', 'rækken har +N-mærket');
  assert.equal(name.dataset.pos, pos.textContent.replace(/ #\d+$/, '')); assert.ok(name.dataset.pos.length >= 2);
});

test('Træning: kun Spiller (første kolonne) er låst – i overskriften og i hver række', () => {
  const L = createLeague(createRng(7)), team = L.teams.find((t) => !t.isBot);
  const root = renderTrainingTable({ team, ui: { trainingSort: 'pos' }, report: null, on: new Proxy({}, { get: () => noop }) });
  const t = byId(root, 'training-table')[0];
  const ths = all(t, (e) => e.tag === 'th'), tds = all(t, (e) => e.tag === 'td');
  assert.equal(ths.filter((e) => hasCls(e, 'stick-1')).length, 1); assert.equal(hasCls(ths[0], 'stick-1'), true); assert.equal(ths[0].textContent, 'Spiller');
  const stuck = tds.filter((e) => hasCls(e, 'stick-1'));
  assert.equal(stuck.length, team.squad.length); assert.ok(stuck.every((e) => /^#\d+ /.test(e.textContent)));
});
