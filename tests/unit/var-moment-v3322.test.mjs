// v3.32.2 – VAR-øjeblikket og spilfornemmelsen (docs/plans: D2–D5). Rammen og loggen (ui/varmoment.js) på RIGTIGE, seedede kampe med
// tvungne VAR-tjek (forced() som i var-check.test.mjs), pausen (playbackStep – tjek→kendelse ≥ 1500 ms mod før 420), fx én gang pr.
// hændelse og i rigtig farve, Match Center mod et minimalt DOM (FakeEl som i ui-v3321.test.mjs), sanitize og lyd-nøglen.
// e2e (tests/e2e/run.mjs "v3.32.2") måler CSS-animationerne, reduceret bevægelse, 44 px og at AudioContext aldrig oprettes med lyd fra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

const { varSequence, varFrame, varLog, castNames, holdAfter, playbackStep, fxFor, soundFor, liveLine, VAR_HOLD_TICKS, FRAME_AFTER } = await import('../../public/ui/varmoment.js');
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');
const { clearReplays } = await import('../../public/ui/replay.js');
const { soundOn, setSound, unlockSound, SOUND_KEY } = await import('../../public/ui/sound.js');
const { isValidCast, normalizeLeague } = await import('../../public/engine/sanitize.js');
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { VAR_RULES } = await import('../../public/engine/match-rules.js');

const forced = (r, force) => ({ ...r, chance: (p) => (p in force ? (typeof force[p] === 'number' ? r.next() < force[p] : force[p]) : r.chance(p)) });
const FORCE = { [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.PEN_CHECK_P]: true, [VAR_RULES.PEN_AWARD_P]: 0.02, [VAR_RULES.RED_CHECK_P]: true, [VAR_RULES.RED_UPGRADE_P]: 0.5, 0.06: 0.15 };
// Dit hold i hver kamp (hjemme i lige seeds, ude i ulige) – så "dit mål" og "deres mål" begge forekommer
function games(n, force = FORCE, seed0 = 1) {
  const out = [];
  for (let s = seed0; s < seed0 + n; s++) {
    const L = createLeague(createRng(s)), me = L.teams.find((t) => !t.isBot), opp = L.teams.filter((t) => t.isBot)[s % 7];
    const m = s % 2 ? simulateMatch(opp, me, forced(createRng(s * 31), force)) : simulateMatch(me, opp, forced(createRng(s * 31), force));
    out.push({ me, m, own: (home) => (home ? m.homeId : m.awayId) === me.id });
  }
  return out;
}
const G = games(220);
const STARTS = new Set(['VAR_CHECK', 'VAR_PEN', 'VAR_RED']);
const seqs = function* () { for (const g of G) for (let i = 0; i < g.m.events.length; i++) if (STARTS.has(g.m.events[i].type)) yield { ...g, i, e: g.m.events[i], seq: varSequence(g.m.events, i) }; };
const VERDICT_LINE = /^(✅|❌|🟥|🟨) /;

test('varSequence: kendelsen efter tabellen pr. kind/verdict – to-trins er den næste hændelse af den rigtige type, ét-trins er tjekket selv', () => {
  const WANT = {
    'VAR_CHECK:STANDS': ['GOAL', 'HEADER_GOAL'], 'VAR_CHECK:OVERTURNED': ['VAR_NO_GOAL'],
    'VAR_PEN:STANDS': ['GOAL', 'SAVE'], 'VAR_PEN:OVERTURNED': ['VAR_NO_PEN'],
    'VAR_RED:CONFIRMED': ['RED'], 'VAR_RED:DOWNGRADED': ['VAR_NO_RED'],
  };
  const n = {};
  for (const { m, i, e, seq } of seqs()) {
    const k = `${e.type}:${e.var.verdict}`; n[k] = (n[k] ?? 0) + 1;
    if (k === 'VAR_PEN:AWARDED' || k === 'VAR_RED:UPGRADED') { assert.equal(seq.oneStep, true, k); assert.equal(seq.verdictAt, i); continue; }
    assert.equal(seq.oneStep, false, k); assert.equal(seq.verdictAt, i + 1);
    assert.ok(WANT[k].includes(m.events[i + 1].type), `${k} → ${m.events[i + 1].type}`);
  }
  for (const k of [...Object.keys(WANT), 'VAR_PEN:AWARDED', 'VAR_RED:UPGRADED']) assert.ok((n[k] ?? 0) >= 3, `${k}: ${JSON.stringify(n)}`);
  assert.equal(varSequence(G[0].m.events, G[0].m.events.findIndex((x) => x.type === 'GOAL')), null, 'et mål er intet tjek');
});

test('varLog i hver gren: spørgsmålet, de navngivne spillere (de samme som motorens tekst) og kendelsen – kendelsen KUN når den er vist', () => {
  const seen = new Set();
  for (const { m, e, seq } of seqs()) {
    const name = castNames(m), team = (home) => (home ? m.homeName : m.awayName), c = e.var.cast;
    const before = varLog(seq, false, name, team), after = varLog(seq, true, name, team);
    const k = `${e.type}:${e.var.kind}:${e.var.verdict}`; seen.add(k);
    if (seq.oneStep) {
      if (e.var.verdict === 'AWARDED') { assert.deepEqual(after, [`📺 Straffe til ${team(e.isHome)}`, `${name(c.checked)} fældet af ${name(c.fouler)}`]); assert.ok(e.text.includes(`${name(c.checked)} blev fældet i feltet af ${name(c.fouler)}`)); }
      else assert.deepEqual(after, ['📺 VAR kalder dommeren ud: rødt kort?', `${name(c.checked)} tjekkes`, `🟥 Opgraderet: rødt til ${team(e.isHome)}`]);
      continue;
    }
    // Kendelsen står ikke på tjek-tick'et – og er den sidste linje bagefter
    assert.ok(!before.some((l) => VERDICT_LINE.test(l)), `${k}: ${before}`);
    assert.deepEqual(after.slice(0, -1), before); assert.match(after.at(-1), VERDICT_LINE);
    // v3.32.2-rettelsen: kendelsen nævner holdet (t = team(isHome))
    const t = team(e.isHome), g = /[sxz]$/i.test(t) ? `${t}'` : `${t}s`;
    const WORD = { 'VAR_CHECK:STANDS': `✅ ${g} mål står`, 'VAR_CHECK:OVERTURNED': `❌ ${g} mål annulleret`, 'VAR_PEN:STANDS': `✅ Straffen til ${t} står`, 'VAR_PEN:OVERTURNED': `❌ Ingen straffe til ${t}`, 'VAR_RED:CONFIRMED': `🟥 Rødt til ${t} står`, 'VAR_RED:DOWNGRADED': `🟨 Rødt til ${t} bliver gult` };
    assert.equal(after.at(-1), WORD[`${e.type}:${e.var.verdict}`], k);
    const Q = { OFFSIDE: 'offside?', FOUL: 'skub i opspillet?', DIVE: 'filmning?', RED: 'rødt kort?' };
    assert.equal(before[0], `📺 VAR tjekker: ${Q[e.var.kind]}`);
    if (e.var.kind === 'OFFSIDE') {
      assert.equal(before[1], `${name(c.checked)} tjekkes for offside${c.other ? ' – forreste mand' : ''}`);
      const ln = name(c.line); assert.ok(ln, 'line findes');
      assert.equal(before[2], `afgjort mod ${/[sxz]$/i.test(ln) ? `${ln}'` : `${ln}s`} placering`);
      if (e.type === 'VAR_CHECK') assert.ok(e.text.includes(`stod ${name(c.checked)} offside?`), 'samme spiller som teksten');   // straffens: var-check.test.mjs
      assert.equal(before.length, 3);
    } else if (e.var.kind === 'FOUL') {
      assert.deepEqual(before.slice(1), [`${name(c.checked)} tjekkes for skub mod ${name(c.victim)}`]);
      assert.ok(e.text.includes(`skubbede ${name(c.checked)} ${name(c.victim)}`), e.text);
    } else if (e.var.kind === 'DIVE') assert.deepEqual(before.slice(1), [`${name(c.checked)} tjekkes for filmning`]);
    else assert.deepEqual(before.slice(1), [`${name(c.checked)} tjekkes`]);
    // forreste mand kun ved other (QC/Spilfører motor: ellers er han ikke nødvendigvis den forreste)
    assert.equal(before.some((l) => l.includes('forreste')), !!c.other);
    for (const l of after) assert.ok(!/taktik|kynisk|teater|fælde/i.test(l), l);
  }
  for (const k of ['VAR_CHECK:OFFSIDE:OVERTURNED', 'VAR_CHECK:OFFSIDE:STANDS', 'VAR_CHECK:FOUL:STANDS', 'VAR_CHECK:FOUL:OVERTURNED', 'VAR_PEN:OFFSIDE:STANDS', 'VAR_PEN:DIVE:OVERTURNED', 'VAR_PEN:PENALTY:AWARDED', 'VAR_RED:RED:CONFIRMED', 'VAR_RED:RED:DOWNGRADED', 'VAR_RED:RED:UPGRADED']) assert.ok(seen.has(k), `${k}: ${[...seen]}`);
});

test('hjørnespark med tjek: FOUL og ingen "afgjort mod"-linje (der kan ikke være offside)', () => {
  let n = 0;
  for (const { m, i, e, seq } of seqs()) {
    if (e.type !== 'VAR_CHECK') continue;
    const g = m.events[i + 1];
    if (!['GOAL', 'HEADER_GOAL'].includes(g.type) || !m.goalsPool.some((x) => x.min === g.min && x.kind === 'CORNER' && g.text.includes(x.scorer))) continue;
    n++; assert.equal(seq.kind, 'FOUL'); assert.ok(!varLog(seq, true, castNames(m)).some((l) => l.startsWith('afgjort')));
  }
  assert.ok(n >= 2, `data: ${n}`);
});

test('loggen læser intet uden for data: en hændelse, der kaster ved alt andet end type/var/isHome, giver samme linjer (også uden cast)', () => {
  const ALLOWED = new Set(['type', 'var', 'isHome']);
  const guard = (e) => new Proxy(e, { get(t, k) { if (typeof k === 'string' && !ALLOWED.has(k)) throw new Error(`læste ${k}`); return t[k]; } });
  let n = 0;
  for (const { m } of G.slice(0, 80)) {
    const P = m.events.map(guard), name = castNames(m);
    for (let last = 0; last < P.length; last++) {
      const fr = varFrame(P, last); holdAfter(P, last);
      if (!fr) continue;
      n++;
      assert.deepEqual(varLog(fr.seq, fr.reached, name), varLog(varFrame(m.events, last).seq, fr.reached, name));
    }
    // en gammel kamp uden cast: ingen navne – kun spørgsmål og kendelse
    const old = m.events.map((e) => (e.var ? guard({ ...e, var: { kind: e.var.kind, verdict: e.var.verdict } }) : guard(e)));
    for (let i = 0; i < old.length; i++) { const s = varSequence(old, i); if (s) { const l = varLog(s, true, name, () => 'Holdet'); assert.ok(l.length <= 2 && !l.some((x) => /#\d+/.test(x)), String(l)); } }
  }
  assert.ok(n >= 200, `data: ${n}`);
});

test('rammen: fra tjekket til kendelsen + 5 tick; kendelsen IKKE på tjek-tick\'et; liveLine = spørgsmålet, så kendelsen', () => {
  let two = 0, one = 0;
  for (const { m, i, seq } of seqs()) {
    const ev = m.events;
    const at = varFrame(ev, i);
    if (at?.seq.check !== i) continue;   // et nyt tjek inden for det forriges ramme
    assert.equal(varFrame(ev, i - 1)?.seq.check === i, false);
    if (seq.oneStep) { one++; assert.equal(at.reached, true); assert.equal(holdAfter(ev, i), 0, 'ét-trins: ingen pause'); }
    else {
      two++; assert.equal(at.reached, false, 'kendelsen står ikke på tjek-tick\'et'); assert.equal(holdAfter(ev, i), VAR_HOLD_TICKS);
      assert.equal(varFrame(ev, i + 1).reached, true);
      const lines = varLog(at.seq, false, castNames(m)); assert.equal(liveLine(lines, false), lines[0]);
    }
    const end = (seq.verdictAt) + FRAME_AFTER;
    // (et nyt mål/rødt efter kendelsen lukker rammen før tid – v3.32.2-rettelsen, var-moment-v3322-fix.test.mjs)
    if (end < ev.length && !ev.slice(i + 1, end + 2).some((x) => STARTS.has(x.type)) && !ev.slice(seq.verdictAt + 1, end + 1).some((x) => ['GOAL', 'HEADER_GOAL', 'RED'].includes(x.type))) { assert.equal(varFrame(ev, end)?.seq.check, i); assert.equal(varFrame(ev, end + 1), null, 'rammen går væk'); }
  }
  assert.ok(two >= 50 && one >= 10, `data: ${two} to-trins, ${one} ét-trins`);
  assert.equal(FRAME_AFTER, 5);
});

test('pausen: tjek→kendelse ≥ 1500 ms (før 420 ms – ét tick); ét-trins går videre efter ét tick; PLAYBACK_MS er 420', () => {
  const MS = 420;
  assert.match(readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8'), /export const PLAYBACK_MS = 420;/);
  let n = 0, nOne = 0;
  for (const { m } of G.slice(0, 60)) {
    const mc = { shownCount: 1, hold: 0 }, shownAt = [0];
    for (let t = 1; ; t++) { const r = playbackStep(mc, m.events); if (r === 'end') break; if (r === 'show') shownAt[mc.shownCount - 1] = t; }
    assert.equal(shownAt.length, m.events.length - 1 < 1 ? 1 : shownAt.length);
    for (let i = 0; i < m.events.length - 1; i++) {
      const s = varSequence(m.events, i);
      if (!s || shownAt[i + 1] == null) continue;
      const gap = (shownAt[i + 1] - shownAt[i]) * MS;
      if (s.oneStep) { nOne++; assert.equal(gap, MS); } else { n++; assert.ok(gap >= 1500, `tjek→kendelse ${gap} ms`); assert.equal(gap, (1 + VAR_HOLD_TICKS) * MS); }
    }
    // alle andre hændelser: ét tick
    for (let i = 1; i < shownAt.length; i++) if (shownAt[i] != null && !varSequence(m.events, i - 1)) assert.equal(shownAt[i] - shownAt[i - 1], 1);
  }
  assert.ok(n >= 20 && nOne >= 2, `data: ${n} to-trins, ${nOne} ét-trins`);
});

test('fxFor: rystelse ved dit endelige mål og det endelige røde kort (aldrig VAR_CHECK/VAR_RED/VAR_NO_RED), flash rød når dit mål annulleres og grøn ved deres – én gang pr. hændelse', () => {
  const c = { shake: 0, oppGoal: 0, bad: 0, good: 0, red: 0 };
  for (const { m, own } of G) for (let i = 0; i < m.events.length; i++) {
    const e = m.events[i], seen = new Set(), fx = fxFor(e, i, seen, own);
    if (['GOAL', 'HEADER_GOAL'].includes(e.type)) { if (own(e.isHome)) { c.shake++; assert.equal(fx, 'fx-shake'); } else { c.oppGoal++; assert.equal(fx, null); } }
    else if (e.type === 'RED') { c.red++; assert.equal(fx, 'fx-shake'); }
    else if (e.type === 'VAR_NO_GOAL') { const want = own(e.isHome) ? 'fx-flash-bad' : 'fx-flash-good'; c[own(e.isHome) ? 'bad' : 'good']++; assert.equal(fx, want); }
    else assert.equal(fx, null, e.type);
    if (fx) { assert.ok(seen.has(i)); assert.equal(fxFor(e, i, seen, own), null, 'ikke igen i samme hændelse'); }
  }
  assert.ok(c.shake >= 20 && c.oppGoal >= 20 && c.bad >= 5 && c.good >= 5 && c.red >= 5, JSON.stringify(c));
  assert.equal(soundFor({ type: 'VAR_CHECK', isHome: true }, () => true), 'bip');
  assert.equal(soundFor({ type: 'GOAL', isHome: true }, () => true), 'cheer');
  assert.equal(soundFor({ type: 'GOAL', isHome: true }, () => false), null);
});

// ---------- Match Center mod FakeEl ----------
const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const hasCls = (e, c) => !!e && e.className.split(' ').includes(c);
const on = { snapshot() {}, view() {}, filter() {}, skip() {}, replay() {}, heat() {}, pane() {}, send() {}, copyId() {}, showVerdict() {}, sound() {} };
const live = (m, shownCount, extra = {}) => ({ round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount, playing: true, canSend: false, sent: [], ...extra });
const draw = (m, me, mc, sound = false) => { clearReplays(); return renderMatchCenter({ mc, myTeamId: me.id, on, sound }); };

test('Match Center: rammen under stillingen (zonen .mc-live med tidslinjen) med role="group" – på tjek-tick\'et spørgsmålet, "?" ved stillingen og "Vis kendelsen ›"; ved kendelsen kendelsen og ingen knap', () => {
  let n = 0;
  for (const { m, me, i, e, seq } of seqs()) {
    if (e.type !== 'VAR_CHECK' || n >= 12) continue;
    n++;
    const r = draw(m, me, live(m, i + 1)), fr = byId(r, 'var-frame');
    assert.ok(fr, 'rammen'); assert.equal(fr.attrs.role, 'group'); assert.equal(fr.attrs['aria-label'], 'VAR-tjek');
    const zone = byId(r, 'mc-live'), board = byId(r, 'mc-board');
    assert.ok(zone.children.includes(fr) && board.children.includes(zone) && !board.children.includes(fr), 'rammen ligger i zonen under stillingen');
    assert.ok(board.children.indexOf(byId(board, 'scoreboard')) < board.children.indexOf(zone), 'zonen står efter stillingen');
    const log = byId(r, 'var-log').children.map((li) => li.textContent);
    assert.deepEqual(log, varLog(seq, false, castNames(m), (h) => (h ? m.homeName : m.awayName)));
    assert.ok(byId(r, 'var-show'), 'Vis kendelsen ›');
    assert.ok(hasCls(byId(r, 'score'), 'score-pending') && byId(r, 'score').textContent.endsWith(' ?'), byId(r, 'score').textContent);
    assert.equal(all(r, (x) => hasCls(x, 'varbanner')).length, 0, 'det gamle banner er væk');
    const v = draw(m, me, live(m, i + 2)), log2 = byId(v, 'var-log').children.map((li) => li.textContent);
    assert.match(log2.at(-1), VERDICT_LINE); assert.ok(!byId(v, 'var-show'), 'ingen knap efter kendelsen');
    assert.ok(!byId(v, 'score').textContent.includes('?'));
    // efter fløjtet: ingen ramme
    assert.ok(!byId(draw(m, me, { ...live(m, Infinity), playing: false }), 'var-frame'));
  }
  assert.ok(n >= 5, `data: ${n}`);
});

test('Match Center: rystelsen står på #score ved dit mål ÉN gang (et filterklik i samme tick tegner uden); lydkontakten ved ⚡ med aria-pressed', () => {
  const g = G.find(({ m, own }) => m.events.some((e) => e.type === 'GOAL' && own(e.isHome)));
  const i = g.m.events.findIndex((e) => e.type === 'GOAL' && g.own(e.isHome));
  const mc = live(g.m, i + 1, { fxSeen: new Set() });
  assert.ok(hasCls(byId(draw(g.m, g.me, mc), 'score'), 'fx-shake'));
  assert.ok(!hasCls(byId(draw(g.m, g.me, mc), 'score'), 'fx-shake'), 'ikke igen');
  const off = byId(draw(g.m, g.me, live(g.m, 2)), 'sound-toggle'), onB = byId(draw(g.m, g.me, live(g.m, 2), true), 'sound-toggle');
  assert.equal(off.attrs['aria-pressed'], 'false'); assert.equal(off.textContent, '🔇 Lyd fra');
  assert.equal(onB.attrs['aria-pressed'], 'true'); assert.equal(onB.textContent, '🔊 Lyd til');
  const row = all(draw(g.m, g.me, live(g.m, 2)), (x) => hasCls(x, 'row'))[0];
  assert.ok(byId(row, 'skip') && byId(row, 'sound-toggle'), 'kontakten står i rækken ved ⚡');
  assert.ok(byId(draw(g.m, g.me, { ...live(g.m, Infinity), playing: false }), 'sound-toggle'), 'også efter fløjtet');
  // et annulleret mål: flashen på stillingens boks
  const h = G.find(({ m }) => m.events.some((e) => e.type === 'VAR_NO_GOAL'));
  const j = h.m.events.findIndex((e) => e.type === 'VAR_NO_GOAL'), want = h.own(h.m.events[j].isHome) ? 'fx-flash-bad' : 'fx-flash-good';
  assert.ok(hasCls(byId(draw(h.m, h.me, live(h.m, j + 1, { fxSeen: new Set() })), 'mc-board'), want));
});

test('sanitize: en ugyldig var.cast smides væk ved import – en gyldig bliver', () => {
  assert.ok(isValidCast({ checked: 'plr_t0_9', line: 'plr_t1_4', other: true }));
  assert.ok(isValidCast({ checked: 'plr_t0_9', fouler: 'plr_t1_4' }));
  for (const bad of [null, 'x', [], {}, { checked: 9 }, { checked: 'a', line: 4 }, { checked: 'a', other: 'ja' }, { checked: 'a', navn: 'b' }, { checked: 'a'.repeat(41) }]) assert.equal(isValidCast(bad), false, JSON.stringify(bad));
  const { m } = G.find(({ m }) => m.events.some((e) => e.var?.cast));
  const L = createLeague(createRng(5)), evs = m.events.map((e) => ({ ...e, var: e.var && { ...e.var } }));
  const bad = evs.find((e) => e.var?.cast), good = evs.filter((e) => e.var?.cast)[1] ?? null;
  bad.var.cast = { checked: { navn: 'x' } };
  L.lastRound = { round: 1, matches: [{ ...m, events: evs }] };
  const r = normalizeLeague(L);
  assert.ok(!('cast' in bad.var), 'ugyldig væk'); assert.equal(bad.var.kind, m.events[evs.indexOf(bad)].var.kind, 'resten af var bliver');
  if (good) assert.ok(isValidCast(good.var.cast));
  assert.ok(r.league);
});

test('lyden: fra som standard (også når lageret kaster); kontakten husker under tactivar_sound; ingen AudioContext → ingen lyd og ingen fejl', () => {
  const mem = new Map(), st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  assert.equal(soundOn(st), false);
  setSound(st, true); assert.equal(mem.get(SOUND_KEY), '1'); assert.equal(soundOn(st), true);
  setSound(st, false); assert.equal(soundOn(st), false);
  const boom = { getItem() { throw new Error('blokeret'); }, setItem() { throw new Error('blokeret'); } };
  assert.equal(soundOn(boom), false); assert.equal(setSound(boom, true), false);
  assert.equal(unlockSound({}), null);
  assert.equal(unlockSound({ AudioContext: class { constructor() { throw new Error('nej'); } } }), null);
});
