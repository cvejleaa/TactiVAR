// v3.31.1 del 2 (brugeren 3/11: "nogle gange er der sneget sig engelske betegnelser ind"): dansk på spillerkortet.
// Særpræget vises fra ARCHETYPES efter id (labels.js archetypeOf) – ikke fra kopien på spilleren – så en gemt liga (save-schema4,
// kopierne med de engelske navne) får de danske navne UDEN migrering. Kravene med evnernes danske navne (SKILL_NAME + "Spring").
// Assertér på indholdet OG på det, der ikke må stå (negativlisten af engelske ord).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
const { parseSave } = await import('../../public/state/storage.js');
const { POSITION_FULL, PHASE_OPTIONS, archetypeOf } = await import('../../public/ui/labels.js');
const { renderCard } = await import('../../public/ui/card.js');
const { renderMatrix } = await import('../../public/ui/matrix.js');
const { RATING_ICONS } = await import('../../public/ui/matchcenter.js');
const { COUNTER_LABELS, opponentTacticKeys } = await import('../../public/engine/counter.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
// Negativlisten (planen v3.31.1 del 2, punkt 7): ingen af de gamle engelske ord må stå på kortet
const ENGLISH = /Pressing Monster|Target Man|Sweeper Keeper|Penalty Killer|Offside Maestro|Line Ghost|Playmaker|stamina|intercepting|jumpingPower|ballControl|Gegenpress|\bCAM\b|\bCDM\b|Scouting/i;
const card = (p, team, extra = {}) => renderCard({ player: p, team, isOwn: true, scouting: ['En observation.'], note: '', onNote() {}, ...extra });

// De danske navne og beskrivelser – bogstaveligt (spec §2 "Arketyper – særpræg"); kravene som [nøgle, dansk navn, krav].
// v3.32.0: kravteksten viser nu/krav (labels.js archReqText) – "Låses op ved: Styrke 20/13 ✓ · Spring 20/13 ✓" for en spiller med 20 overalt
const reqAll20 = (req) => 'Låses op ved: ' + req.map(([, n, v]) => `${n} 20/${v} ✓`).join(' · ');
const DANSK = {
  SWEEPER_KEEPER: ['Feje-målmand', 'Bryder dybe stikninger uden for feltet ved høj forsvarslinje', [['goalkeeping', 'Målmandsspil', 12], ['pace', 'Fart', 11]]],
  PENALTY_KILLER: ['Straffedræber', 'Psykisk overtag ved straffe og VAR-straffespark', [['goalkeeping', 'Målmandsspil', 14], ['positioning', 'Positionering', 12]]],
  OFFSIDE_MAESTRO: ['Offside-mester', '+20 % til hele bagkædens timing ved VAR-offside', [['positioning', 'Positionering', 13], ['intercepting', 'Erobring', 13]]],
  AERIAL_TOWER: ['Luftens Konge', '+25 % i alle hovedstødsdueller i begge felter', [['strength', 'Styrke', 13], ['jumpingPower', 'Spring', 14]]],
  REGISTA: ['Regista (spilfordeler)', 'Slår pasninger direkte fra Fase 1 til Fase 3', [['passing', 'Pasning', 13], ['ballControl', 'Boldkontrol', 13]]],
  PRESSING_MONSTER: ['Presmonster', 'Mister 50 % mindre energi ved højt gegenpres', [['stamina', 'Udholdenhed', 14], ['intercepting', 'Erobring', 12]]],
  VAR_LINE_GHOST: ['VAR-linjens spøgelse', 'Vinder 80 % af alle millimeter-tætte VAR-offside-kendelser', [['pace', 'Fart', 14], ['positioning', 'Positionering', 12]]],
  TARGET_MAN: ['Fyrtårn', 'Opspilspunkt: dominerer lange bolde og høje indlæg med hovedet', [['strength', 'Styrke', 13], ['jumpingPower', 'Spring', 13]]],
};

test('særpræg: alle 8 i tabellen har et dansk navn – kortet viser navn, beskrivelse og krav på dansk, også når spillerens kopi har det gamle engelske navn', () => {
  const L = createLeague(createRng(7)), me = L.teams.find((t) => !t.isBot), p = me.squad[3];
  const ids = Object.values(ARCHETYPES).flat().map((a) => a.id);
  assert.deepEqual(ids.slice().sort(), Object.keys(DANSK).sort(), 'alle 8 dækket');
  // de 9 forskellige krav-nøgler (alle evner, der står i et krav) er dækket af testen
  assert.equal(new Set(Object.values(ARCHETYPES).flat().flatMap((a) => Object.keys(a.unlockReq))).size, 9);
  for (const a of Object.values(ARCHETYPES).flat()) {
    const [name, desc, reqList] = DANSK[a.id], req = reqAll20(reqList);
    for (const k of Object.keys(p.skills)) p.skills[k] = 20;
    p.jumpingPower = 20;
    assert.deepEqual(reqList.map(([k, , v]) => [k, v]), Object.entries(a.unlockReq), `${a.id}: kravene i tabellens rækkefølge`);
    // kopien som i et gem fra før v3.31.1: engelsk navn og gammel beskrivelse
    p.archetype = { id: a.id, name: 'Pressing Monster', description: 'Mister 50% mindre energi ved Højt Gegenpress', unlockReq: { ...a.unlockReq }, isUnlocked: false };
    const el = card(p, me), box = byId(el, 'card-arch');
    assert.equal(box.textContent, `🔒 ${name} – ${desc}${req}`, a.id);
    assert.equal(byId(el, 'card-arch-req').textContent, req, a.id);
    assert.doesNotMatch(el.textContent, ENGLISH, a.id);
    // låst op: 🌟 og intet krav
    p.archetype.isUnlocked = true;
    const el2 = card(p, me);
    assert.equal(byId(el2, 'card-arch').textContent, `🌟 ${name} – ${desc}`, a.id);
    assert.equal(byId(el2, 'card-arch-req'), undefined);
  }
});

test('archetypeOf: navn og beskrivelse fra tabellen, låst op og kravene fra spilleren; et ukendt id viser kopien; ingen = null', () => {
  const own = { id: 'TARGET_MAN', name: 'Target Man', description: 'gammel', unlockReq: { strength: 99 }, isUnlocked: true };
  assert.deepEqual(archetypeOf(own), { id: 'TARGET_MAN', name: 'Fyrtårn', description: 'Opspilspunkt: dominerer lange bolde og høje indlæg med hovedet', unlockReq: { strength: 99 }, isUnlocked: true });
  assert.equal(own.name, 'Target Man', 'kopien på spilleren røres ikke');
  assert.deepEqual(archetypeOf({ id: 'UKENDT', name: 'X', description: 'Y' }), { id: 'UKENDT', name: 'X', description: 'Y' });
  assert.equal(archetypeOf(null), null);
});

test('save-schema4 (kopierne har de engelske navne): kortet og regnearket viser de danske – uden migrering af gemmet', () => {
  const r = parseSave(fs.readFileSync(new URL('../fixtures/save-schema4.json', import.meta.url), 'utf8'));
  assert.equal(r.ok, true, r.error);
  const me = r.state.league.teams.find((t) => !t.isBot), P = (id) => me.squad.find((p) => p.id === id);
  // gemmeformatet er uændret: kopien på spilleren har stadig det gamle navn – det er VISNINGEN, der er dansk
  assert.equal(P('plr_t0_6').archetype.name, 'Pressing Monster');
  assert.equal(P('plr_t0_11').archetype.name, 'Target Man');
  const want = { plr_t0_4: 'OFFSIDE_MAESTRO', plr_t0_6: 'PRESSING_MONSTER', plr_t0_8: 'REGISTA', plr_t0_10: 'REGISTA', plr_t0_11: 'TARGET_MAN', plr_t0_14: 'OFFSIDE_MAESTRO' };
  for (const [id, k] of Object.entries(want)) {
    const el = card(P(id), me), [name, desc, reqList] = DANSK[k], pl = P(id), now = (key) => (key === 'jumpingPower' ? pl.jumpingPower : pl.skills[key]);
    const box = byId(el, 'card-arch').textContent;
    assert.ok(box.startsWith(`${pl.archetype.isUnlocked ? '🌟' : '🔒'} ${name} – ${desc}`), id);
    if (pl.archetype.isUnlocked) assert.equal(byId(el, 'card-arch-req'), undefined, id);
    else {
      const req = byId(el, 'card-arch-req').textContent;
      assert.ok(req.startsWith('Låses op ved: '), req);
      for (const [key, n, v] of reqList) assert.ok(req.includes(`${n} ${now(key)}/${v}`), `${id}: ${req}`);
    }
    assert.doesNotMatch(el.textContent, ENGLISH, id);
  }
  const mx = renderMatrix({ team: me, isOwn: true, ui: { sortCol: 'pos', sortDesc: false, filter: 'all' }, notes: {}, onSort() {}, onSelect() {}, onSwap() {}, onFilter() {}, onBlocked() {} });
  const tags = all(mx, (e) => /(^| )arch( |$)/.test(e.className)).map((e) => e.textContent).sort();
  assert.deepEqual(tags, ['🔒 Fyrtårn', '🔒 Offside-mester', '🔒 Offside-mester', '🔒 Presmonster', '🔒 Regista (spilfordeler)', '🔒 Regista (spilfordeler)']);
  assert.doesNotMatch(mx.textContent, ENGLISH);
});

test('kortets øvrige tekster: danske positioner, "Friskhed 92 %", 🕵️ Observationer, 🧠 Erfaring mod stilarter, VAR-puls og "startspiller: +60 %"', () => {
  assert.deepEqual(POSITION_FULL, { GK: 'Målmand', CB: 'Midtstopper (MS)', FB: 'Back/kantback (dybe kantpladser)', DM: 'Defensiv midtbane (DM)', CM: 'Central midtbane (CM)', WM: 'Kant (høje kantpladser)', AM: 'Offensiv midtbane (OM)', ST: 'Angriber (ANG)' });
  const L = createLeague(createRng(11)), me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t.isBot);
  const p = me.squad.find((x) => x.position === 'AM'); p.freshness = 92; p.injuryMatchesLeft = 0;
  const el = card(p, me), txt = el.textContent, h4 = all(el, (e) => e.tag === 'h4').map((e) => e.textContent);
  assert.ok(txt.includes(' • Offensiv midtbane (OM) • ') && txt.includes('Friskhed 92 %'), txt.slice(0, 200));
  assert.ok(!txt.includes('92%'));
  assert.ok(h4.includes('🕵️ Observationer') && h4.includes('🧠 Erfaring mod stilarter'), h4.join(' | '));
  assert.ok(txt.includes('Mod gegenpres') && txt.includes('Mod lav blok') && txt.includes('Mod VAR-linje og lange bolde'));
  assert.ok(txt.includes('VAR-profil: Kynisme ?? · Teater ?? · VAR-puls ?? – tallene er skjulte; spillerens VAR-kendelser og observationerne herunder giver fingerpeg'));
  assert.doesNotMatch(txt, ENGLISH);
  for (const pos of ['DM', 'ST', 'FB', 'WM']) {
    const q = me.squad.find((x) => x.position === pos), t2 = card(q, me).textContent;
    assert.ok(t2.includes(` • ${POSITION_FULL[pos]} • `), pos); assert.doesNotMatch(t2, ENGLISH, pos);
  }
  // en modstanders spiller med en pris: "startspiller: +60 %" (ikke "starter")
  const q = opp.squad[0];
  const m = renderCard({ player: q, team: opp, isOwn: false, scouting: [], note: '', onNote() {}, market: { price: 1000000, starter: true, wage: 1000, room: 5000, cashAfter: 1, reason: 'Vinduet er lukket' } });
  assert.ok(m.textContent.includes(' · startspiller: +60 %)'), m.textContent);
  assert.doesNotMatch(m.textContent, ENGLISH);
  assert.ok(m.textContent.includes('Evner, spring, luftduel, arketype og kontrakt'));   // v3.31.2: brugerens ord
});

test('stilnavne: "gegenpres" med småt og ét s, "VAR-linje" og "lange bolde" – i barerne, referatets stil, Taktik og karakterarket', () => {
  assert.deepEqual(COUNTER_LABELS, { vsPress: 'Mod gegenpres', vsLowBlock: 'Mod lav blok', vsTrapLong: 'Mod VAR-linje og lange bolde' });
  const T = (pressingHeight, offsideTrap, passingStyle = 'BALANCED', attackFocus = 'CENTRAL') => ({ tactics: { baseFormation: '4-4-2', phases: { phase1_buildUp: { passingStyle, attackFocus }, phase2_defending: { pressingHeight, offsideTrap } } } });
  // v3.31.2 (QC-forbehold): opponentTacticKeys' "label" blev aldrig vist – den er fjernet; kun nøglerne bruges (masteryVs, applyCounterXp)
  assert.deepEqual(opponentTacticKeys(T('HIGH_GEGENPRESS', 'EXTREME_VAR_LINE')), { primary: 'vsPress', secondary: 'vsTrapLong' });
  assert.deepEqual(opponentTacticKeys(T('LOW_BLOCK', 'NORMAL', 'DIRECT_LONG')), { primary: 'vsLowBlock', secondary: 'vsTrapLong' });
  assert.equal(PHASE_OPTIONS.pressingHeight.find(([k]) => k === 'HIGH_GEGENPRESS')[1], 'Højt gegenpres');
  assert.equal(RATING_ICONS.find(([s]) => s === '🧠')[1], 'Erfaring mod stilarter optjent i kampen');
});
