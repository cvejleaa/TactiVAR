// v3.32.2 – Test Manager: huller, som byggerens tests lod overleve (mutationstest af varmoment.js, sound.js, sanitize.js og Match Centers
// ramme). Byggerens tests bruger de IMPORTEREDE konstanter (VAR_HOLD_TICKS/FRAME_AFTER), kun rigtige kampe (ingen kantværdier: tjekket som
// sidste hændelse, ukendt kind, manglende cast-felter), og aldrig sound.js' toner. Her: bogstavelige tal, syntetiske hændelser og en
// optagende falsk AudioContext. Rammen i appen (pausen, #live-status, fokus, lyd pr. hændelse) bindes i tests/e2e/run.mjs "v3.32.2 TM".
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  querySelectorAll() { return []; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const V = await import('../../public/ui/varmoment.js');
const { varSequence, varFrame, varLog, castNames, holdAfter, playbackStep, fxFor, soundFor, liveLine, VAR_HOLD_TICKS, FRAME_AFTER } = V;
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');
const { clearReplays } = await import('../../public/ui/replay.js');
const { isValidCast, normalizeLeague } = await import('../../public/engine/sanitize.js');
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { VAR_RULES } = await import('../../public/engine/match-rules.js');

// ---------- bogstavelige tal og syntetiske hændelser ----------
const ev = (type, v, extra = {}) => ({ type, isHome: true, hG: 0, aG: 0, ...(v ? { var: v } : {}), ...extra });
const chk = (verdict = 'STANDS', kind = 'OFFSIDE', cast) => ev('VAR_CHECK', { kind, verdict, ...(cast ? { cast } : {}) });
const plain = (n) => Array.from({ length: n }, () => ev('PASS'));

test('konstanterne er bogstavelige: pause 4 tick (2100 ms mellem tjek og kendelse, ikke 1680/2520) og ramme kendelse + 5 tick', () => {
  assert.equal(VAR_HOLD_TICKS, 4);   // 3 → 1680 ms, 5 → 2520 ms: begge ≥ 1500, så byggerens "gap ≥ 1500" lod dem bestå
  assert.equal(FRAME_AFTER, 5);
  const evs = [...plain(2), chk(), ev('GOAL'), ...plain(12)];
  assert.equal(holdAfter(evs, 2), 4);
  // rammen: tjekket (2), kendelsen (3) og 5 tick mere (4..8) – ikke 9
  for (let last = 2; last <= 8; last++) assert.ok(varFrame(evs, last), `last ${last}`);
  assert.equal(varFrame(evs, 9), null); assert.equal(varFrame(evs, 1), null);
});

test('varSequence: kun de tre starttyper med var; en kendelse er ét-trins KUN for præcis VAR_PEN/AWARDED og VAR_RED/UPGRADED', () => {
  const evs = [ev('PASS'), ev('GOAL', { kind: 'X', verdict: 'Y' }), ev('VAR_CHECK'), ev('VAR_NO_GOAL', { kind: 'OFFSIDE', verdict: 'OVERTURNED' })];
  for (let i = 0; i < evs.length; i++) assert.equal(varSequence(evs, i), null, `${evs[i].type} uden var / ikke en start`);
  assert.equal(varSequence([], 0), null);
  for (const [type, verdict, one] of [['VAR_PEN', 'AWARDED', true], ['VAR_RED', 'UPGRADED', true], ['VAR_PEN', 'UPGRADED', false], ['VAR_RED', 'AWARDED', false], ['VAR_CHECK', 'AWARDED', false], ['VAR_CHECK', 'UPGRADED', false], ['VAR_PEN', 'STANDS', false], ['VAR_RED', 'CONFIRMED', false]]) {
    const s = varSequence([ev(type, { kind: 'K', verdict }), ev('X')], 0);
    assert.equal(s.oneStep, one, `${type}/${verdict}`); assert.equal(s.verdictAt, one ? 0 : 1, `${type}/${verdict}`);
    assert.equal(holdAfter([ev(type, { kind: 'K', verdict }), ev('X')], 0), one ? 0 : 4);
  }
  assert.equal(varSequence([ev('VAR_PEN', { kind: 'K', verdict: 'STANDS' })], 0).type, 'VAR_PEN');
  assert.equal(varSequence([ev('VAR_RED', { kind: 'RED', verdict: 'CONFIRMED' })], 0).type, 'VAR_RED');
});

test('tjekket som SIDSTE hændelse (ingen kendelse endnu): verdictAt null, ingen pause, rammen står ved tjekket + 5 tick og er IKKE "reached"', () => {
  const evs = [...plain(8), chk()];   // indeks 8: langt nok til, at `null + 5` (= 5) ikke ligner `8 + 5`
  const s = varSequence(evs, 8);
  assert.equal(s.verdictAt, null); assert.equal(holdAfter(evs, 8), 0, 'ingen pause uden en kendelse at vente på');
  const fr = varFrame(evs, 8);
  assert.ok(fr, 'rammen står ved tjekket'); assert.equal(fr.reached, false, 'null >= 0 må ikke give reached');
  // verdictAt = events.length (off by one) må heller ikke give en pause
  assert.equal(varSequence([chk(), ev('X')], 0).verdictAt, 1);
  const lg = varLog(s, fr.reached, () => null, () => 'H');
  assert.deepEqual(lg, ['📺 VAR tjekker: offside?']);
});

test('playbackStep: slutter præcis når sidste hændelse er vist (n=4: 2 × show, så end); pausen tælles ned uden at vise noget', () => {
  const evs = plain(4), mc = { shownCount: 1, hold: 0 };
  assert.equal(playbackStep(mc, evs), 'show'); assert.equal(mc.shownCount, 2);
  assert.equal(playbackStep(mc, evs), 'show'); assert.equal(mc.shownCount, 3);
  assert.equal(playbackStep(mc, evs), 'end');
  const v = [ev('PASS'), chk(), ev('GOAL'), ...plain(3)], m2 = { shownCount: 1, hold: 0 };
  assert.equal(playbackStep(m2, v), 'show'); assert.equal(m2.hold, 4, 'pausen sættes når tjekket er vist');
  for (let k = 3; k >= 0; k--) { assert.equal(playbackStep(m2, v), 'hold'); assert.equal(m2.hold, k); assert.equal(m2.shownCount, 2); }
  assert.equal(playbackStep(m2, v), 'show'); assert.equal(m2.shownCount, 3); assert.equal(m2.hold, 0);
});

// ---------- varLog på syntetiske casts (ikke-s-navne og s-navne, manglende felter, ukendt kind) ----------
const ratings = (list) => ({ ratings: { home: list.slice(0, 2).map(([id, n, s]) => ({ playerId: id, shirtNumber: n, shortName: s })), away: list.slice(2).map(([id, n, s]) => ({ playerId: id, shirtNumber: n, shortName: s })) } });
const M = ratings([['h9', 9, 'Hansen'], ['h4', 4, 'Berg'], ['a5', 5, 'Ross'], ['a3', 3, 'Holm']]);
const nm = castNames(M);

test('castNames: spillere fra begge hold ("#9 Hansen"), ukendt id/ikke-streng/ingen ratings giver null', () => {
  assert.equal(nm('h9'), '#9 Hansen'); assert.equal(nm('a5'), '#5 Ross'); assert.equal(nm('h4'), '#4 Berg'); assert.equal(nm('a3'), '#3 Holm');
  assert.equal(nm('x'), null); assert.equal(nm(undefined), null); assert.equal(nm(9), null);
  assert.equal(castNames({})('h9'), null);
  assert.equal(castNames({ ratings: { home: [{ playerId: 'h1', shirtNumber: 1, shortName: 'A' }] } })('h1'), '#1 A', 'kun ét hold i karakterarket');
});

test('varLog: offside – "afgjort mod X\'s/Xs placering" (s-navn med apostrof), forreste mand kun ved other, ingen linje uden line', () => {
  const seq = (cast, kind = 'OFFSIDE', type = 'VAR_CHECK', verdict = 'OVERTURNED') => varSequence([ev(type, { kind, verdict, cast }), ev('X')], 0);
  assert.deepEqual(varLog(seq({ checked: 'h9', line: 'a5' }), false, nm), ['📺 VAR tjekker: offside?', '#9 Hansen tjekkes for offside', "afgjort mod #5 Ross' placering"]);
  assert.deepEqual(varLog(seq({ checked: 'h9', line: 'h4', other: true }), false, nm), ['📺 VAR tjekker: offside?', '#9 Hansen tjekkes for offside – forreste mand', 'afgjort mod #4 Bergs placering']);
  assert.deepEqual(varLog(seq({ checked: 'h9' }), false, nm), ['📺 VAR tjekker: offside?', '#9 Hansen tjekkes for offside'], 'uden line ingen "afgjort"-linje');
  assert.deepEqual(varLog(seq({ checked: 'h9', line: 'ukendt' }), false, nm), ['📺 VAR tjekker: offside?', '#9 Hansen tjekkes for offside'], 'ukendt line-id');
  assert.deepEqual(varLog(seq({ checked: 'h9', line: 'a5' }), true, nm).at(-1), '❌ Målet annulleret');
  assert.deepEqual(varLog(seq(undefined), false, nm), ['📺 VAR tjekker: offside?'], 'gammel kamp uden cast: kun spørgsmålet');
  assert.deepEqual(varLog(seq({ checked: 'ukendt' }), false, nm), ['📺 VAR tjekker: offside?'], 'ukendt checked-id: ingen navnlinjer');
});

test('varLog: frispark/filmning/rødt/dømt straffe – med og uden de valgfrie felter', () => {
  const one = (type, kind, verdict, cast) => varSequence([ev(type, { kind, verdict, cast }), ev('X')], 0);
  assert.deepEqual(varLog(one('VAR_CHECK', 'FOUL', 'STANDS', { checked: 'h9', victim: 'a3' }), false, nm), ['📺 VAR tjekker: skub i opspillet?', '#9 Hansen tjekkes for skub mod #3 Holm']);
  assert.deepEqual(varLog(one('VAR_CHECK', 'FOUL', 'STANDS', { checked: 'h9' }), false, nm), ['📺 VAR tjekker: skub i opspillet?', '#9 Hansen tjekkes for skub']);
  assert.deepEqual(varLog(one('VAR_PEN', 'DIVE', 'OVERTURNED', { checked: 'h4' }), true, nm), ['📺 VAR tjekker: filmning?', '#4 Berg tjekkes for filmning', '❌ Ingen straffe']);
  assert.deepEqual(varLog(one('VAR_PEN', 'OFFSIDE', 'STANDS', { checked: 'h4', line: 'a5' }), true, nm), ['📺 VAR tjekker: offside?', '#4 Berg tjekkes for offside', "afgjort mod #5 Ross' placering", '✅ Straffen står']);
  assert.deepEqual(varLog(one('VAR_RED', 'RED', 'CONFIRMED', { checked: 'a3' }), true, nm), ['📺 VAR tjekker: rødt kort?', '#3 Holm tjekkes', '🟥 Rødt står']);
  assert.deepEqual(varLog(one('VAR_RED', 'RED', 'DOWNGRADED', { checked: 'a3' }), true, nm).at(-1), '🟨 Rødt bliver gult');
  assert.deepEqual(varLog(one('VAR_RED', 'RED', 'UPGRADED', { checked: 'a3' }), true, nm), ['📺 VAR kalder dommeren ud: rødt kort?', '#3 Holm tjekkes', '🟥 Opgraderet til rødt']);
  assert.deepEqual(varLog(one('VAR_RED', 'RED', 'UPGRADED', undefined), true, nm), ['📺 VAR kalder dommeren ud: rødt kort?', '🟥 Opgraderet til rødt']);
  assert.deepEqual(varLog(one('VAR_PEN', 'PENALTY', 'AWARDED', { checked: 'h9', fouler: 'a5' }), true, nm, (h) => (h ? 'Hjemme FC' : 'Ude FC')), ['📺 Straffe til Hjemme FC', '#9 Hansen fældet af #5 Ross']);
  assert.deepEqual(varLog(one('VAR_PEN', 'PENALTY', 'AWARDED', { checked: 'h9' }), true, nm, () => 'Hjemme FC'), ['📺 Straffe til Hjemme FC', '#9 Hansen fældet i feltet']);
  assert.deepEqual(varLog(one('VAR_PEN', 'PENALTY', 'AWARDED', undefined), true, nm), ['📺 Straffe til'], 'uden holdnavn og cast: ingen efterhængende mellemrum');
  assert.deepEqual(varLog(one('VAR_CHECK', 'MÆRKELIG', 'STANDS', undefined), false, nm), ['📺 VAR tjekker: situationen?'], 'ukendt kind (fremtidig/ødelagt gem)');
  assert.deepEqual(varLog(one('VAR_CHECK', 'MÆRKELIG', 'UKENDT', undefined), true, nm), ['📺 VAR tjekker: situationen?'], 'ukendt kendelse: ingen kendelseslinje');
  assert.deepEqual(varLog(null, true, nm), []);
});

test('liveLine: spørgsmålet (første linje) før kendelsen, kendelsen (sidste linje) efter – og tom streng uden linjer', () => {
  const lines = ['A', 'B', 'C'];
  assert.equal(liveLine(lines, false), 'A'); assert.equal(liveLine(lines, true), 'C');
  assert.equal(liveLine([], false), ''); assert.equal(liveLine([], true), '');
});

test('fxFor og soundFor: de små grene byggerens data ikke nåede (HEADER_GOAL, VAR_RED/VAR_NO_RED/VAR_PEN, null)', () => {
  const own = () => true, opp = () => false, S = () => new Set();
  assert.equal(fxFor(ev('HEADER_GOAL'), 3, S(), own), 'fx-shake'); assert.equal(fxFor(ev('HEADER_GOAL'), 3, S(), opp), null);
  assert.equal(fxFor(ev('GOAL'), 3, S(), opp), null);
  for (const t of ['VAR_CHECK', 'VAR_PEN', 'VAR_RED', 'VAR_NO_RED', 'VAR_NO_PEN', 'SAVE', 'YELLOW']) assert.equal(fxFor(ev(t), 1, S(), own), null, t);
  assert.equal(fxFor(ev('RED'), 1, S(), opp), 'fx-shake', 'endeligt rødt ryster uanset hold');
  assert.equal(fxFor(ev('VAR_NO_GOAL'), 1, S(), own), 'fx-flash-bad'); assert.equal(fxFor(ev('VAR_NO_GOAL'), 1, S(), opp), 'fx-flash-good');
  assert.equal(fxFor(null, 1, S(), own), null);
  // idx 0 er en gyldig hændelse (seen.has(0) skal virke)
  const seen = S(); assert.equal(fxFor(ev('GOAL'), 0, seen, own), 'fx-shake'); assert.ok(seen.has(0)); assert.equal(fxFor(ev('GOAL'), 0, seen, own), null);
  // en anden hændelse med samme indeks i en NY runde har sit eget Set
  assert.equal(fxFor(ev('GOAL'), 0, S(), own), 'fx-shake');
  assert.equal(fxFor(ev('VAR_NO_GOAL'), 5, seen, own), 'fx-flash-bad'); assert.equal(fxFor(ev('VAR_NO_GOAL'), 5, seen, own), null);
  assert.equal(soundFor(ev('HEADER_GOAL'), own), 'cheer'); assert.equal(soundFor(ev('HEADER_GOAL'), opp), null); assert.equal(soundFor(ev('GOAL'), opp), null);
  for (const t of ['VAR_CHECK', 'VAR_PEN', 'VAR_RED']) assert.equal(soundFor(ev(t), opp), 'bip', t);
  for (const t of ['VAR_NO_GOAL', 'VAR_NO_PEN', 'VAR_NO_RED', 'RED', 'SAVE', 'END']) assert.equal(soundFor(ev(t), own), null, t);
  assert.equal(soundFor(null, own), null);
});

// ---------- rigtige kampe: var.cast overholder sanitize'ens form, og import mister ingen gyldig cast ----------
const forced = (r, force) => ({ ...r, chance: (p) => (p in force ? (typeof force[p] === 'number' ? r.next() < force[p] : force[p]) : r.chance(p)) });
const FORCE = { [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.PEN_CHECK_P]: true, [VAR_RULES.PEN_AWARD_P]: 0.02, [VAR_RULES.RED_CHECK_P]: true, [VAR_RULES.RED_UPGRADE_P]: 0.5, 0.06: 0.15 };
const G = [];
for (let s = 1; s <= 120; s++) {
  const L = createLeague(createRng(s)), me = L.teams.find((t) => !t.isBot), opp = L.teams.filter((t) => t.isBot)[s % 7];
  G.push({ me, m: s % 2 ? simulateMatch(opp, me, forced(createRng(s * 31), FORCE)) : simulateMatch(me, opp, forced(createRng(s * 31), FORCE)) });
}

test('hver var.cast fra motoren er gyldig for sanitize (id-tekster, other kun true) – og et normaliseret gem beholder ALLE', () => {
  let n = 0, withOther = 0;
  for (const { m } of G) for (const e of m.events) if (e.var) {
    assert.ok(e.var.cast, `${e.type} mangler cast`); n++;
    assert.equal(isValidCast(e.var.cast), true, JSON.stringify(e.var.cast));
    if ('other' in e.var.cast) { withOther++; assert.strictEqual(e.var.cast.other, true); }
    for (const [k, v] of Object.entries(e.var.cast)) if (k !== 'other') assert.ok(/^[\w-]+$/.test(v) && v.length <= 40, `${k}: ${v}`);
  }
  assert.ok(n >= 300 && withOther >= 10, `data: ${n} cast, ${withOther} med other`);
  const m = G.find(({ m }) => m.events.some((e) => e.var?.cast?.other)).m;
  const L = createLeague(createRng(5));
  L.lastRound = { round: 1, matches: [JSON.parse(JSON.stringify(m))] };
  const before = JSON.stringify(L.lastRound.matches[0].events.map((e) => e.var?.cast ?? null));
  normalizeLeague(L);
  assert.equal(JSON.stringify(L.lastRound.matches[0].events.map((e) => e.var?.cast ?? null)), before, 'ingen gyldig cast mistet');
});

test('isValidCast: hver tilladt nøgle (checked, line, victim, fouler, other:true) – og grænserne: 40 tegn ja, 41 nej, tom nej, other:false nej', () => {
  for (const ok of [{ checked: 'a' }, { checked: 'a', line: 'b' }, { checked: 'a', victim: 'b' }, { checked: 'a', fouler: 'b' }, { checked: 'a', other: true }, { checked: 'a', line: 'b', other: true }, { checked: 'x'.repeat(40) }, { checked: 'a', line: 'y'.repeat(40) }])
    assert.equal(isValidCast(ok), true, JSON.stringify(ok));
  for (const bad of [{ checked: '' }, { checked: 'a', line: '' }, { checked: 'x'.repeat(41) }, { checked: 'a', victim: 'y'.repeat(41) }, { checked: 'a', other: false }, { checked: 'a', other: 1 }, { checked: 'a', other: 'true' }, { line: 'b' }, { checked: 'a', foo: 'b' }, { checked: 'a', foo: true }, { checked: 'a', fouler: 7 }, { checked: 'a', victim: null }, undefined, 0, '', []])
    assert.equal(isValidCast(bad), false, JSON.stringify(bad));
});

test('normalizeLeague: en ugyldig cast fjernes alene (kind/verdict bliver), en hændelse uden var eller med var:null kaster ikke, en gyldig cast står', () => {
  const L = createLeague(createRng(5));
  L.lastRound = { round: 1, matches: [{ events: [
    { type: 'VAR_CHECK', var: { kind: 'OFFSIDE', verdict: 'STANDS', cast: { checked: 'a', line: 'b' } } },
    { type: 'VAR_CHECK', var: { kind: 'OFFSIDE', verdict: 'STANDS', cast: { checked: 'a', foo: 'b' } } },
    { type: 'VAR_CHECK', var: { kind: 'FOUL', verdict: 'OVERTURNED', cast: 'x' } },
    { type: 'VAR_CHECK', var: { kind: 'FOUL', verdict: 'OVERTURNED', cast: null } },
    { type: 'GOAL' }, { type: 'GOAL', var: null }, null,
  ] }] };
  normalizeLeague(L);
  const e = L.lastRound.matches[0].events;
  assert.deepEqual(e[0].var, { kind: 'OFFSIDE', verdict: 'STANDS', cast: { checked: 'a', line: 'b' } });
  assert.deepEqual(e[1].var, { kind: 'OFFSIDE', verdict: 'STANDS' });
  assert.deepEqual(e[2].var, { kind: 'FOUL', verdict: 'OVERTURNED' });
  assert.deepEqual(e[3].var, { kind: 'FOUL', verdict: 'OVERTURNED' });
  assert.equal(e[4].var, undefined); assert.equal(e[5].var, null);
});

// ---------- Match Center: "?" i kampkortet, board-klasser, puls-forsinkelse, kontaktens tekster ----------
const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const cls = (e) => (e?.className ?? '').split(' ').filter(Boolean);
const on = { snapshot() {}, view() {}, filter() {}, skip() {}, replay() {}, heat() {}, pane() {}, send() {}, copyId() {}, showVerdict() {}, sound() {} };
const live = (m, shownCount, extra = {}) => ({ round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount, playing: true, canSend: false, sent: [], ...extra });
const draw = (m, me, mc, sound = false, handlers = on) => { clearReplays(); return renderMatchCenter({ mc, myTeamId: me.id, on: handlers, sound }); };
const card0 = (r) => all(r, (e) => cls(e).includes('matchcard'))[0].textContent;

test('Match Center: "?" står i kampkortet OG stillingen kun under et mål-tjek før kendelsen – ikke ved straffe-/rødt-tjek, ikke efter kendelsen', () => {
  const seen = { pend: 0, pen: 0, red: 0, after: 0 };
  for (const { m, me } of G) for (let i = 0; i < m.events.length - 1; i++) {
    const e = m.events[i];
    if (!['VAR_CHECK', 'VAR_PEN', 'VAR_RED'].includes(e.type) || !e.var || (e.type === 'VAR_PEN' && e.var.verdict === 'AWARDED') || (e.type === 'VAR_RED' && e.var.verdict === 'UPGRADED')) continue;
    const r = draw(m, me, live(m, i + 1)), q = e.type === 'VAR_CHECK';
    assert.equal(/\d-\d \?/.test(card0(r)), q, `${e.type} kort: ${card0(r)}`);
    assert.equal(byId(r, 'score').textContent.endsWith(' ?'), q); assert.equal(cls(byId(r, 'score')).includes('score-pending'), q);
    if (q) { seen.pend++; assert.equal(card0(r).includes(`${e.hG}-${e.aG} ? `), true, card0(r)); } else seen[e.type === 'VAR_PEN' ? 'pen' : 'red']++;
    const r2 = draw(m, me, live(m, i + 2));
    assert.ok(!/\?/.test(card0(r2)) && !byId(r2, 'score').textContent.includes('?') && !cls(byId(r2, 'score')).includes('score-pending'), 'ingen "?" efter kendelsen'); seen.after++;
    if (seen.pend >= 6 && seen.pen >= 3 && seen.red >= 3) break;
  }
  assert.ok(seen.pend >= 6 && seen.pen >= 3 && seen.red >= 3, `data: ${JSON.stringify(seen)}`);
});

test('Match Center: rammens attributter og knap – tabindex -1, data-kind/-verdict (verdict tom før kendelsen), reached-klasse kun efter kendelsen, "Vis kendelsen ›" aldrig ved ét-trins', () => {
  let two = 0, one = 0;
  for (const { m, me } of G) for (let i = 0; i < m.events.length - 2; i++) {
    const e = m.events[i];
    if (!['VAR_CHECK', 'VAR_PEN', 'VAR_RED'].includes(e.type) || !e.var) continue;
    const isOne = (e.type === 'VAR_PEN' && e.var.verdict === 'AWARDED') || (e.type === 'VAR_RED' && e.var.verdict === 'UPGRADED');
    const r = draw(m, me, live(m, i + 1)), f = byId(r, 'var-frame');
    assert.ok(f, e.type); assert.equal(f.attrs.tabindex, '-1'); assert.equal(f.attrs.role, 'status');
    assert.equal(f.dataset.kind, e.var.kind); assert.equal(f.dataset.verdict, isOne ? e.var.verdict : '');
    assert.equal(cls(f).includes('reached'), isOne); assert.equal(!!byId(r, 'var-show'), !isOne);
    assert.equal(byId(r, 'var-log').tag, 'ul');
    assert.equal(all(f, (x) => cls(x).includes('var-mark'))[0].attrs['aria-hidden'], 'true');
    if (!isOne) {
      const r2 = draw(m, me, live(m, i + 2)), f2 = byId(r2, 'var-frame');
      assert.equal(f2.dataset.verdict, e.var.verdict, 'kendelsen står i data-verdict når den er vist');
      assert.ok(cls(f2).includes('reached')); assert.ok(!byId(r2, 'var-show')); two++;
    } else one++;
    if (two >= 8 && one >= 3) break;
  }
  assert.ok(two >= 8 && one >= 3, `data: ${two}/${one}`);
});

test('Match Center: puls-forsinkelsen er negativ og følger tiden siden rammens FØRSTE tegning (ikke forfra ved gentegning); nyt tjek = ny nulstilling', () => {
  const g = G.find(({ m }) => m.events.filter((e) => e.type === 'VAR_CHECK').length >= 2), m = g.m;
  const [i1, i2] = m.events.map((e, i) => (e.type === 'VAR_CHECK' ? i : -1)).filter((i) => i >= 0);
  const mc = live(m, i1 + 1), real = Date.now;
  const delay = (shown, t) => { Date.now = () => t; mc.shownCount = shown; try { return parseFloat(all(draw(m, g.me, mc), (x) => cls(x).includes('var-mark'))[0].style.animationDelay); } finally { Date.now = real; } };
  assert.ok(Math.abs(delay(i1 + 1, 5000)) < 1, 'første tegning: 0');
  assert.equal(delay(i1 + 1, 5420), -420);       // 420 ms senere, samme tjek
  assert.equal(delay(i1 + 2, 6100), -100);       // 1100 ms efter første tegning → −(1100 mod 1000)
  assert.equal(delay(i1 + 2, 5980), -980);
  const d2 = delay(i2 + 1, 90000);               // nyt tjek: nulstilles
  assert.ok(Math.abs(d2) < 1, `nyt tjek starter forfra: ${d2}`);
  assert.equal(delay(i2 + 1, 90300), -300);
});

test('Match Center: stødet ligger på #score, flashen på tavlen – aldrig omvendt; kontakten har titel og tekst for begge tilstande', () => {
  const g = G.find(({ m, me }) => m.events.some((e) => e.type === 'GOAL' && (e.isHome ? m.homeId : m.awayId) === me.id));
  const i = g.m.events.findIndex((e) => e.type === 'GOAL' && (e.isHome ? g.m.homeId : g.m.awayId) === g.me.id);
  const r = draw(g.m, g.me, live(g.m, i + 1, { fxSeen: new Set() }));
  assert.deepEqual(cls(byId(r, 'mc-board')), ['mc-board'], 'ingen fx-klasse på tavlen ved et mål'); assert.ok(cls(byId(r, 'score')).includes('fx-shake'));
  const h = G.find(({ m }) => m.events.some((e) => e.type === 'VAR_NO_GOAL')), j = h.m.events.findIndex((e) => e.type === 'VAR_NO_GOAL');
  const r2 = draw(h.m, h.me, live(h.m, j + 1, { fxSeen: new Set() }));
  assert.ok(!cls(byId(r2, 'score')).some((c) => c.startsWith('fx-')), 'ingen fx-klasse på stillingen ved annulleret mål');
  assert.ok(cls(byId(r2, 'mc-board')).some((c) => c.startsWith('fx-flash')));
  const offB = byId(draw(g.m, g.me, live(g.m, 2), false), 'sound-toggle'), onB = byId(draw(g.m, g.me, live(g.m, 2), true), 'sound-toggle');
  assert.equal(offB.attrs.title, 'Lyd fra – klik for at slå til'); assert.equal(onB.attrs.title, 'Lyd til – klik for at slå fra');
  assert.equal(offB.textContent, '🔇 Lyd fra'); assert.equal(onB.textContent, '🔊 Lyd til');
  let clicked = 0; const b = byId(draw(g.m, g.me, live(g.m, 2), false, { ...on, sound: () => clicked++ }), 'sound-toggle'); b.listeners.click(); assert.equal(clicked, 1);
  let shown = 0; const vm = G.find(({ m }) => m.events.some((e) => e.type === 'VAR_CHECK')), vi = vm.m.events.findIndex((e) => e.type === 'VAR_CHECK');
  const sb = byId(draw(vm.m, vm.me, live(vm.m, vi + 1), false, { ...on, showVerdict: () => shown++ }), 'var-show'); sb.listeners.click(); assert.equal(shown, 1);
  assert.equal(sb.textContent, 'Vis kendelsen ›');
});

// ---------- sound.js: toner, stop, autoplay-oplåsning ----------
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
function fakeAC({ state = 'suspended', rejectResume = false, throwOsc = false } = {}) {
  const calls = { news: 0, resumes: 0, oscs: [] };
  class AC {
    constructor() { calls.news++; this.state = state; this.currentTime = 10; this.destination = { dest: true }; }
    resume() { calls.resumes++; this.state = 'running'; return rejectResume ? Promise.reject(new Error('afvist')) : Promise.resolve(); }
    createGain() { const g = { sets: [], ramps: [], gain: { setValueAtTime: (v, t) => g.sets.push([v, t]), linearRampToValueAtTime: (v, t) => g.ramps.push([v, t]) }, connect: (d) => { g.to = d; } }; return g; }
    createOscillator() {
      if (throwOsc) throw new Error('ingen oscillator');
      const o = { type: '', f: [], ramps: [], starts: [], stops: [], gain: null, connect: (n) => { o.gain = n; }, start: (t) => o.starts.push(t), stop: (t) => o.stops.push(t) };
      o.frequency = { setValueAtTime: (f, t) => o.f.push([f, t]), linearRampToValueAtTime: (f, t) => o.ramps.push([f, t]) };
      calls.oscs.push(o); return o;
    }
  }
  return { AC, calls };
}
let fresh = 0;
const freshSound = () => import(`../../public/ui/sound.js?tm=${++fresh}`);

test('sound.js: lagernøglen og standarden – fra uden værdi, til kun for præcis "1", "0" slukker, kasteren giver false', async () => {
  const S = await freshSound(), mem = new Map(), st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(S.SOUND_KEY, 'tactivar_sound');
  assert.equal(S.soundOn(st), false); assert.equal(S.setSound(st, true), true); assert.equal([...mem.keys()][0], 'tactivar_sound'); assert.equal(mem.get('tactivar_sound'), '1');
  assert.equal(S.soundOn(st), true); S.setSound(st, false); assert.equal(mem.get('tactivar_sound'), '0'); assert.equal(S.soundOn(st), false);
  mem.set('tactivar_sound', 'ja'); assert.equal(S.soundOn(st), false); mem.set('tactivar_sound', 'true'); assert.equal(S.soundOn(st), false);
});

test('sound.js: oplåsning – ingen lyd før klikket, én AudioContext (også webkit-præfiks), genoptages kun fra "suspended", afvist resume giver ingen ubehandlet fejl', async () => {
  const S = await freshSound();
  assert.equal(S.playSound('whistle'), false, 'før oplåsning: ingen lyd');
  assert.equal(S.unlockSound({}), null); assert.equal(S.unlockSound({ AudioContext: null, webkitAudioContext: null }), null);
  const A = fakeAC({ rejectResume: true });
  const c1 = S.unlockSound({ webkitAudioContext: A.AC });
  assert.ok(c1, 'webkitAudioContext bruges når AudioContext mangler'); assert.equal(A.calls.news, 1); assert.equal(A.calls.resumes, 1);
  const c2 = S.unlockSound({ AudioContext: A.AC });
  assert.equal(c2, c1, 'samme kontekst genbruges'); assert.equal(A.calls.news, 1, 'ikke oprettet igen'); assert.equal(A.calls.resumes, 1, 'allerede running: ikke genoptaget igen');
  assert.equal(S.unlockSound({}), null, 'uden AudioContext i vinduet: null');
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));   // en ubehandlet afvisning ville vælte testkørslen her
  const B = fakeAC({ state: 'running' }), S2 = await freshSound();
  S2.unlockSound({ AudioContext: B.AC }); assert.equal(B.calls.resumes, 0, 'running: ingen resume');
  const C = fakeAC({ state: 'suspended' }), S3 = await freshSound();
  S3.unlockSound({ AudioContext: C.AC }); assert.equal(C.calls.resumes, 1, 'suspended: resume');
});

test('sound.js: tonerne bogstaveligt – fløjt (1 × 2900 triangel glidende til 2700), slutfløjt (3 stød), bip (2 × 880 firkant), jubel (3 savtakstoner) – tider, længder og styrke', async () => {
  const S = await freshSound(), A = fakeAC({ state: 'running' });
  S.unlockSound({ AudioContext: A.AC });
  const t0 = 10.02, run = (kind) => { A.calls.oscs.length = 0; assert.equal(S.playSound(kind), true, kind); return A.calls.oscs.slice(); };
  const chk = (o, { f, at, dur, vol, type, to }, msg) => {
    assert.equal(o.type, type, `${msg} type`); assert.equal(o.f.length, 1); assert.equal(o.f[0][0], f, `${msg} frekvens`); near(o.f[0][1], t0 + at, `${msg} start`);
    near(o.starts[0], t0 + at, `${msg} start()`); near(o.stops[0], t0 + at + dur + 0.02, `${msg} stop()`);
    if (to) { assert.equal(o.ramps.length, 1, `${msg} glid`); assert.equal(o.ramps[0][0], to); near(o.ramps[0][1], t0 + at + dur, `${msg} glid-tid`); } else assert.equal(o.ramps.length, 0, `${msg} uden glid`);
    const g = o.gain; assert.deepEqual(g.sets.map((x) => x[0]), [0], `${msg} gain starter i 0`); near(g.sets[0][1], t0 + at, `${msg} gain-start`);
    assert.equal(g.ramps.length, 2); assert.equal(g.ramps[0][0], vol, `${msg} styrke`); near(g.ramps[0][1], t0 + at + 0.02, `${msg} op`); assert.equal(g.ramps[1][0], 0); near(g.ramps[1][1], t0 + at + dur, `${msg} ned`);
    assert.deepEqual(g.to, { dest: true }, `${msg} til destination`);
  };
  let l = run('whistle'); assert.equal(l.length, 1); chk(l[0], { f: 2900, at: 0, dur: 0.55, vol: 0.12, type: 'triangle', to: 2700 }, 'fløjt');
  l = run('final'); assert.equal(l.length, 3);
  chk(l[0], { f: 2900, at: 0, dur: 0.22, vol: 0.12, type: 'triangle', to: 2700 }, 'slut 1'); chk(l[1], { f: 2900, at: 0.32, dur: 0.22, vol: 0.12, type: 'triangle', to: 2700 }, 'slut 2'); chk(l[2], { f: 2900, at: 0.64, dur: 0.55, vol: 0.12, type: 'triangle', to: 2700 }, 'slut 3');
  l = run('bip'); assert.equal(l.length, 2);
  chk(l[0], { f: 880, at: 0, dur: 0.12, vol: 0.1, type: 'square' }, 'bip 1'); chk(l[1], { f: 880, at: 0.2, dur: 0.12, vol: 0.1, type: 'square' }, 'bip 2');
  l = run('cheer'); assert.equal(l.length, 3);
  chk(l[0], { f: 523, at: 0, dur: 0.14, vol: 0.12, type: 'sawtooth' }, 'jubel 1'); chk(l[1], { f: 659, at: 0.12, dur: 0.14, vol: 0.12, type: 'sawtooth' }, 'jubel 2'); chk(l[2], { f: 784, at: 0.24, dur: 0.3, vol: 0.12, type: 'sawtooth' }, 'jubel 3');
  assert.equal(S.playSound('findes-ikke'), false); assert.equal(A.calls.oscs.length, 3, 'ukendt lyd opretter intet');
});

test('sound.js: stopSounds stopper kun tone, der stadig lever (én gang hver, uden tid), glemmer dem bagefter, tåler en tone der kaster – og en afsluttet tone røres ikke', async () => {
  const S = await freshSound(), A = fakeAC({ state: 'running' });
  S.unlockSound({ AudioContext: A.AC });
  S.playSound('final');
  const [o1, o2, o3] = A.calls.oscs;
  assert.equal(o1.stops.length, 1, 'planlagt stop ved oprettelsen');
  o2.onended();                                                       // tone 2 er spillet færdig af sig selv
  o3.stop = (t) => { if (t === undefined) throw new Error('allerede stoppet'); o3.stops.push(t); };
  S.stopSounds();
  assert.equal(o1.stops.length, 2); assert.equal(o1.stops[1], undefined, 'stop() uden tid = nu');
  assert.equal(o2.stops.length, 1, 'afsluttet tone stoppes ikke igen');
  S.stopSounds();
  assert.equal(o1.stops.length, 2, 'listen er tømt: ingen dobbelt stop');
  assert.equal(S.playSound('bip'), true); S.stopSounds(); assert.equal(A.calls.oscs[3].stops.length, 2); assert.equal(A.calls.oscs[4].stops.length, 2);
});

test('sound.js: en AudioContext, der kaster ved oprettelse/oscillator, giver false og ingen fejl; en ny oplåsning efter fejl kan lykkes', async () => {
  const S = await freshSound();
  assert.equal(S.unlockSound({ AudioContext: class { constructor() { throw new Error('nej'); } } }), null);
  assert.equal(S.playSound('whistle'), false);
  const A = fakeAC({ state: 'running', throwOsc: true });
  assert.ok(S.unlockSound({ AudioContext: A.AC })); assert.equal(S.playSound('whistle'), false, 'createOscillator kaster → false, ingen undtagelse');
  const B = fakeAC({ state: 'running' }), S2 = await freshSound();
  assert.equal(S2.unlockSound({ AudioContext: class { constructor() { throw new Error('nej'); } } }), null);
  assert.ok(S2.unlockSound({ AudioContext: B.AC }), 'efter en fejl oprettes konteksten næste gang'); assert.equal(S2.playSound('bip'), true);
});
