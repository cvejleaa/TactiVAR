// v3.27.0 Test Manager (nr. 64, udelukkelse for kort). Forfatterens ban-v3270.test.mjs binder reglen (BAN/banFromCards), vagten
// (unavailable), kampens erstatning, afsoningen og tacklingernes retning – men mutanter overlevede i ledningen OMKRING:
// commitRound med kun gule (banYellows gemmes/akkumuleres, banWhy), nedtællingens rækkefølge (præcis BAN, ikke "mindst 1"),
// banWhy nulstilles efter afsoning, referatets gule-kort-note (nth, ikke nth+1), reserve-fallbackens kæde/noter ("ingen afløser",
// skadet vs. udelukket), hele UI-laget (labels, spillerkort, banen, listen, matrixen) og tacklingernes TAL (±-retning for
// frispark, kort og pres – før var kun Aggressiv > Normal > Forsigtig med 15 % pinnet, og presset kun af golden-hash'en).
import { test } from 'node:test';
import assert from 'node:assert/strict';

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
const { createLeague } = await import('../../public/engine/generator.js');
const { BAN } = await import('../../public/engine/career.js');
const { playRound, commitRound } = await import('../../public/engine/season.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { outLabel, banText, yellowWarn, OUT_TITLE, BAN_WHY } = await import('../../public/ui/labels.js');
const { renderCard } = await import('../../public/ui/card.js');
const { renderPitch } = await import('../../public/ui/pitch.js');
const { renderLineupList } = await import('../../public/ui/lineup-list.js');
const { renderMatrix } = await import('../../public/ui/matrix.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const own = (L) => L.teams.find((t) => !t.isBot);
const playerOf = (L, id) => L.teams.flatMap((t) => t.squad).find((p) => p.id === id);

// ---------- labels.js: de korte tegn og ordene, med bogstavelige strenge ----------
test('labels: outLabel / banText / yellowWarn – bogstavelige tekster, begge tegn, ental/flertal, intet ved 0', () => {
  assert.equal(outLabel({ injuryMatchesLeft: 0, banMatches: 0 }), '');
  assert.equal(outLabel({ injuryMatchesLeft: 2, banMatches: 0 }), '🚑 2');
  assert.equal(outLabel({ injuryMatchesLeft: 0, banMatches: 1 }), '⛔ 1');
  assert.equal(outLabel({ injuryMatchesLeft: 3, banMatches: 2 }), '🚑 3 · ⛔ 2', 'begge: skade først, adskilt af " · "');
  assert.ok(!outLabel({ injuryMatchesLeft: 0, banMatches: 2 }).includes('🟥'), 'aldrig 🟥 (= udvist i kampen)');
  assert.equal(banText({ banMatches: 0, banWhy: null }), '');
  assert.equal(banText({ banMatches: 1, banWhy: 'YELLOWS' }), '⛔ udelukket i 1 kamp (4. gule kort i sæsonen)');
  assert.equal(banText({ banMatches: 2, banWhy: 'DIRECT' }), '⛔ udelukket i 2 kampe (direkte rødt kort)');
  assert.equal(banText({ banMatches: 1, banWhy: 'SECOND_YELLOW' }), '⛔ udelukket i 1 kamp (rødt kort for to gule)');
  assert.equal(banText({ banMatches: 3, banWhy: null }), '⛔ udelukket i 3 kampe', 'ukendt årsag (gammelt gem): ingen tom parentes');
  assert.deepEqual(Object.keys(BAN_WHY).sort(), ['DIRECT', 'SECOND_YELLOW', 'YELLOWS']);
  // varslingen: præcis når næste gule giver udelukkelse (banYellows 3, 7, 11 …) – ikke ved 0, 1, 2, 4, 5, 6
  const warn = [0, 1, 2, 3, 4, 5, 6, 7, 11].map((n) => yellowWarn({ banYellows: n }));
  assert.deepEqual(warn, ['', '', '', '🟨 3 – næste gule kort giver 1 kamps udelukkelse', '', '', '', '🟨 7 – næste gule kort giver 1 kamps udelukkelse', '🟨 11 – næste gule kort giver 1 kamps udelukkelse']);
  assert.equal(yellowWarn({}), '', 'gammelt gem uden banYellows: ingen varsling (og ingen "NaN")');
  assert.ok(OUT_TITLE.includes('direkte rødt 2 kampe') && OUT_TITLE.includes('rødt for to gule 1 kamp') && OUT_TITLE.includes('hvert 4. gule kort i sæsonen 1 kamp'), OUT_TITLE);
});

// ---------- spillerkortet ----------
test('spillerkortet: ⛔-boksen og 🟨-varslen står ved den rigtige tilstand – for ejeren OG for en modstander (offentligt)', () => {
  const L = createLeague(createRng(8)), me = own(L), opp = L.teams.find((t) => t.isBot);
  for (const [team, isOwn] of [[me, true], [opp, false]]) {
    const p = team.squad[3], draw = () => renderCard({ player: p, team, isOwn, scouting: [], note: '', onNote() {} });
    const ban = (r) => all(r, (e) => e.attrs.id === 'card-ban')[0], yel = (r) => all(r, (e) => e.attrs.id === 'card-yellow')[0];
    Object.assign(p, { banMatches: 0, banWhy: null, banYellows: 0 });
    assert.ok(!ban(draw()) && !yel(draw()), 'rask: hverken boks eller varsel');
    Object.assign(p, { banMatches: 2, banWhy: 'DIRECT', banYellows: 1 });
    assert.equal(ban(draw()).textContent, '⛔ udelukket i 2 kampe (direkte rødt kort)');
    assert.match(ban(draw()).className, /\bban\b/); assert.ok(!yel(draw()));
    Object.assign(p, { banMatches: 0, banWhy: null, banYellows: 3 });
    assert.ok(!ban(draw()), 'ikke udelukket endnu');
    assert.equal(yel(draw()).textContent, '🟨 3 – næste gule kort giver 1 kamps udelukkelse');
    Object.assign(p, { banYellows: 4 });
    assert.ok(!yel(draw()), '4 gule: næste giver ikke noget');
  }
});

// ---------- banen, listen, matrixen ----------
test('banen: udelukket starter får .banned og "⛔ udelukket" (før zone-flaget); skadet får .injured men ikke .banned; rask intet', () => {
  const L = createLeague(createRng(6)), me = own(L), ids = me.tactics.lineupSlots;
  const [pBan, pInj, pBoth, pOk] = [ids[2], ids[3], ids[4], ids[5]].map((id) => me.squad.find((p) => p.id === id));
  Object.assign(pBan, { banMatches: 1 }); Object.assign(pInj, { injuryMatchesLeft: 2 }); Object.assign(pBoth, { banMatches: 1, injuryMatchesLeft: 1 });
  me.tactics.customCoords = { 2: { x: 5, y: 95 } };   // pBan står uden for sin zone: ban-flaget skal vinde over zone-flaget
  const tokens = all(renderPitch({ team: me, isOwn: true, ui: {}, onMove() {}, onSelect() {}, onTokenSwap() {} }), (e) => e.dataset.slot !== undefined && e.className.startsWith('token'));
  const tok = (slot) => tokens.find((t) => t.dataset.slot === String(slot));
  const flags = (slot) => all(tok(slot), (e) => /\btoken-flag\b/.test(e.className) && !/\bpos\b/.test(e.className)).map((e) => e.textContent);
  assert.match(tok(2).className, /\bbanned\b/); assert.match(tok(2).className, /\binjured\b/, 'den gamle ".injured"-stil gælder også udelukkede (outLabel)');
  assert.deepEqual(flags(2), ['⛔ udelukket'], 'ét flag, ban vinder over "Ude af zone"');
  assert.match(tok(3).className, /\binjured\b/); assert.doesNotMatch(tok(3).className, /\bbanned\b/); assert.deepEqual(flags(3), []);
  assert.match(tok(4).className, /\bbanned\b/); assert.match(tok(4).className, /\binjured\b/);
  assert.doesNotMatch(tok(5).className, /\b(banned|injured)\b/); assert.deepEqual(flags(5), []);
  // kontrol på zone-flaget: uden udelukkelse står det i stedet
  pBan.banMatches = 0;
  const t2 = all(renderPitch({ team: me, isOwn: true, ui: {}, onMove() {}, onSelect() {}, onTokenSwap() {} }), (e) => e.dataset.slot === '2' && e.className.startsWith('token'))[0];
  assert.deepEqual(all(t2, (e) => /\btoken-flag\b/.test(e.className) && !/\bpos\b/.test(e.className)).map((e) => e.textContent), ['⚠ Ude af zone (-20%)'], 'data: zone-flaget er der, når han ikke er udelukket');
});

test('listen og matrixen: "Frisk"-cellen viser 🚑 / ⛔ / begge med forklaringen som title; raske viser %; kun udelukkede rækker er .banned', () => {
  const L = createLeague(createRng(9)), me = own(L);
  const [a, b, c, d] = me.squad.slice(0, 4);
  Object.assign(a, { banMatches: 2, banWhy: 'DIRECT', injuryMatchesLeft: 0 }); Object.assign(b, { banMatches: 0, injuryMatchesLeft: 3 });
  Object.assign(c, { banMatches: 1, banWhy: 'YELLOWS', injuryMatchesLeft: 2 }); Object.assign(d, { banMatches: 0, injuryMatchesLeft: 0, freshness: 87 });
  const rowsOf = (root, sel) => Object.fromEntries(all(root, (e) => e.tag === 'tr' && e.dataset.pid).map((tr) => [tr.dataset.pid, tr]));
  const spans = (tr) => all(tr, (e) => e.tag === 'span' && /\binjury\b/.test(e.className));
  const list = renderLineupList({ team: me, isOwn: true, ui: { listLine: 'all' }, onPick() {}, onSort() {}, onBlocked() {}, onLine() {} });
  const mx = renderMatrix({ team: me, isOwn: true, ui: { sortCol: 'pos', sortDesc: false, filter: 'all' }, notes: {}, onSort() {}, onSelect() {}, onSwap() {}, onFilter() {}, onBlocked() {} });
  for (const [name, root, bannedClass] of [['lineup-list', list, true], ['matrix', mx, false]]) {
    const rows = rowsOf(root);
    for (const p of [a, b, c, d]) assert.ok(rows[p.id], `${name}: data: række for ${p.id}`);
    assert.deepEqual(spans(rows[a.id]).map((s) => s.textContent), ['⛔ 2'], name);
    assert.deepEqual(spans(rows[b.id]).map((s) => s.textContent), ['🚑 3'], name);
    assert.deepEqual(spans(rows[c.id]).map((s) => s.textContent), ['🚑 2 · ⛔ 1'], name);
    assert.equal(spans(rows[a.id])[0].attrs.title, OUT_TITLE, `${name}: forklaringen ved tegnet`);
    assert.deepEqual(spans(rows[d.id]), [], `${name}: rask: ingen tegn`); assert.ok(rows[d.id].textContent.includes('87%'), `${name}: rask viser friskhed`);
    if (bannedClass) {
      assert.match(rows[a.id].className, /\bbanned\b/); assert.match(rows[c.id].className, /\bbanned\b/);
      assert.doesNotMatch(rows[b.id].className, /\bbanned\b/); assert.doesNotMatch(rows[d.id].className, /\bbanned\b/);
      assert.match(rows[a.id].className, /\binjured\b/, 'udelukket får også den gamle .injured-stil'); assert.doesNotMatch(rows[d.id].className, /\binjured\b/);
    }
  }
});

// ---------- commitRound: kun gule, nedtælling, banWhy ----------
// Hjælp: spil en runde og sæt kortene på tre navngivne spillere i karakterarket FØR commitRound (hjemme- og udehold, ejer og bot)
function roundWith(L, rng, setups) {
  const res = playRound(L, rng), m = res.matches[0], ents = [m.ratings.home[1], m.ratings.home[2], m.ratings.away[1], m.ratings.away[2]];
  setups.forEach((s, i) => { const e = ents[i], p = playerOf(L, e.playerId); e.yellows = s.yellows ?? 0; e.red = s.red ?? null; Object.assign(p, s.pre ?? {}); s.p = p; });
  return { res, ents };
}
test('commitRound: kun gule kort – de tællende gule gemmes, hvert 4. giver 1 kamp (YELLOWS) på både hjemme- og udehold; 5. gule giver intet', () => {
  const L = createLeague(createRng(21)), rng = createRng(22);
  const S = [{ yellows: 1, pre: { banYellows: 3 } }, { yellows: 1, pre: { banYellows: 7 } }, { yellows: 1, pre: { banYellows: 4 } }, { yellows: 1, pre: { banYellows: 0 } }];
  const { res } = roundWith(L, rng, S);
  commitRound(L, res, rng);
  assert.deepEqual(S.map((s) => [s.p.banYellows, s.p.banMatches, s.p.banWhy]), [[4, 1, 'YELLOWS'], [8, 1, 'YELLOWS'], [5, 0, null], [1, 0, null]]);
});
test('commitRound: rødt for to gule tæller ikke i de gule; direkte rødt + gult lægges sammen; nyt kort ER IKKE afsonet i samme runde (præcis BAN)', () => {
  const L = createLeague(createRng(23)), rng = createRng(24);
  const S = [{ yellows: 2, red: 'SECOND_YELLOW', pre: { banYellows: 3 } }, { yellows: 1, red: 'DIRECT', pre: { banYellows: 3 } }, { yellows: 0, red: 'DIRECT', pre: { banYellows: 0 } }, { yellows: 2, red: 'SECOND_YELLOW', pre: { banYellows: 0 } }];
  const { res } = roundWith(L, rng, S);
  commitRound(L, res, rng);
  assert.deepEqual(S.map((s) => [s.p.banYellows, s.p.banMatches, s.p.banWhy]), [
    [3, BAN.SECOND_YELLOW, 'SECOND_YELLOW'],   // 2 gule bag rødt tæller ikke: 3 (ikke 5), og kun 1 kamp (ikke 2)
    [4, BAN.DIRECT + 1, 'DIRECT'],             // gult nr. 4 + direkte rødt: 3 kampe, årsag = rødt
    [0, BAN.DIRECT, 'DIRECT'],                 // præcis 2: nedtællingen kører FØR de nye kort
    [0, BAN.SECOND_YELLOW, 'SECOND_YELLOW']]);
});
test('commitRound: afsoning – banMatches tæller ned med 1 pr. runde, banWhy bevares mens han stadig mangler og nulstilles ved 0', () => {
  const L = createLeague(createRng(25)), rng = createRng(26), me = own(L);
  const [x, y, z] = me.squad.slice(2, 5);
  Object.assign(x, { banMatches: 2, banWhy: 'DIRECT' }); Object.assign(y, { banMatches: 1, banWhy: 'YELLOWS' }); Object.assign(z, { banMatches: 0, banWhy: null });
  commitRound(L, playRound(L, rng), rng);
  assert.equal(x.banMatches, 1); assert.equal(x.banWhy, 'DIRECT', 'stadig udelukket: årsagen bevares');
  assert.equal(y.banMatches, 0); assert.equal(y.banWhy, null, 'afsonet: årsagen ryddes (ellers vises "(…)" ved en rask spiller)');
  assert.equal(z.banMatches, 0);
  commitRound(L, playRound(L, rng), rng);
  assert.equal(x.banMatches, 0); assert.equal(x.banWhy, null);
});
test('sæsonskiftet: ALLE spilleres tællende gule nulstilles (også bots og dem med 1–3), udelukkelse og årsag afsones videre', () => {
  const L = createLeague(createRng(4)), rng = createRng(12);
  for (let r = 0; r < 13; r++) commitRound(L, playRound(L, rng), rng);
  const bot = L.teams.find((t) => t.isBot), a = own(L).squad[5], b = bot.squad[5], c = bot.squad[6];
  Object.assign(a, { banYellows: 3, banMatches: 2, banWhy: 'DIRECT' }); Object.assign(b, { banYellows: 1 }); Object.assign(c, { banYellows: 6, banMatches: 0 });
  commitRound(L, playRound(L, rng), rng);
  assert.equal(L.leagueMetadata.seasonNumber, 2);
  assert.deepEqual([a.banYellows, b.banYellows, c.banYellows], [0, 0, 0]);
  assert.deepEqual([a.banMatches, a.banWhy], [1, 'DIRECT']);
});

// ---------- kampen: referatets note, reserve-fallback ----------
test('referat: det tællende gule kort nr. 4, 8 … siger det (nth = banYellows + 1) – andre gule siger intet; andet gult siger det ikke', () => {
  const run = (before) => {
    const texts = [];
    for (let s = 1; s <= 30; s++) {
      const L = createLeague(createRng(s * 13));
      for (const t of L.teams) for (const p of t.squad) p.banYellows = before;
      const m = simulateMatch(L.teams[0], L.teams[1 + (s % 7)], createRng(s * 7));
      texts.push(...m.events.filter((e) => e.type === 'FOUL' && e.label === 'Gult kort').map((e) => e.text));
    }
    return texts;
  };
  const note = (n) => ` Det er hans ${n}. gule kort i sæsonen – han er udelukket i næste kamp.`;
  for (const [before, n] of [[3, 4], [7, 8]]) {
    const t = run(before);
    assert.ok(t.length >= 20, `data: ${t.length} gule kort ved banYellows ${before}`);
    assert.ok(t.every((x) => x.startsWith('🟨 [') && x.endsWith(`.${note(n)}`)), `${before}: ${t.find((x) => !x.endsWith(note(n)))}`);
  }
  for (const before of [0, 1, 2, 4, 5, 6]) {
    const t = run(before);
    assert.ok(t.length >= 20 && t.every((x) => !x.includes('udelukket') && !x.includes('Det er hans')), `${before}: ${t.find((x) => x.includes('udelukket'))}`);
  }
});

const benchOf = (me) => me.squad.filter((x) => !me.tactics.lineupSlots.includes(x.id));
function stage(seed, nExtra = 3) {
  const L = createLeague(createRng(seed)), me = own(L), opp = L.teams.find((t) => t.isBot);
  for (let i = 0; i < nExtra; i++) { const src = me.squad[1 + (i % 17)]; me.squad.push({ ...structuredClone(src), id: `${src.id}_x${i}`, shirtNumber: 60 + i }); }
  return { L, me, opp };
}
const sideOf = (m, me) => m.ratings[m.homeId === me.id ? 'home' : 'away'];
test('reserve-fallback: uden rask bænk tages en reserve fra SAMME kæde (selv om en anden kæde står først) – og noten siger hvem og hvorfor', () => {
  const { me, opp } = stage(7, 0);
  const starter = me.squad.find((x) => x.id === me.tactics.lineupSlots[2]);   // en forsvarsspiller
  assert.equal(starter.line, 'DEF', 'data: pladsen er i forsvaret');
  starter.banMatches = 1;
  const bench = benchOf(me); assert.equal(bench.length, 7, 'data: 7 ikke-startere = hele bænken');
  me.matchBench = bench.map((b) => b.id);
  for (const b of bench) b.banMatches = 1;
  // to reserver (uden for bænken): en MIDTBANE først i truppen, derefter en FORSVARER
  const clone = (src, id, nr) => ({ ...structuredClone(src), id, shirtNumber: nr, banMatches: 0, injuryMatchesLeft: 0, freshness: 100 });
  const mid = clone(me.squad.find((x) => x.line === 'MID'), 'res_mid', 71), def = clone(starter, 'res_def', 72);
  // …og FØR dem to forsvarsreserver, der heller ikke kan spille (udelukket / skadet): reserven skal være rask
  const badBan = clone(starter, 'res_ban', 73), badInj = clone(starter, 'res_inj', 74);
  badBan.banMatches = 1; badInj.injuryMatchesLeft = 3;
  me.squad.push(badBan, badInj, mid, def);
  const m = simulateMatch(me, opp, createRng(3)), played = new Set(sideOf(m, me).map((e) => e.playerId));
  assert.ok(!played.has(starter.id) && bench.every((b) => !played.has(b.id)), 'ingen udelukket spillede');
  assert.ok(played.has(def.id) && !played.has(mid.id), 'reserven fra samme kæde kom ind – ikke midtbanen, der stod først');
  assert.ok(!played.has(badBan.id) && !played.has(badInj.id), 'en udelukket/skadet reserve kommer aldrig ind');
  const notes = m.events.filter((e) => e.text.startsWith('📋') && e.text.includes('er udelukket')).map((e) => e.text);
  assert.deepEqual(notes, [`📋 [${me.name}] #${starter.shirtNumber} ${starter.shortName} er udelukket og erstattes i startopstillingen af #72 ${def.shortName}.`]);
});
test('ingen afløser overhovedet: noten siger det, holdet starter med 10 – og han spiller ikke', () => {
  const { me, opp } = stage(7, 0);
  const starter = me.squad.find((x) => x.id === me.tactics.lineupSlots[9]);
  starter.banMatches = 1;
  for (const x of benchOf(me)) x.banMatches = 1;   // hele bænken og alle reserver (18 mand: 7 ikke-startere)
  const m = simulateMatch(me, opp, createRng(5)), side = sideOf(m, me);
  assert.ok(!side.some((e) => e.playerId === starter.id) && side.length === 10, `${side.length} i karakterarket`);
  const notes = m.events.filter((e) => e.text.startsWith('📋') && e.text.includes('ingen afløser')).map((e) => e.text);
  assert.deepEqual(notes, [`📋 [${me.name}] #${starter.shirtNumber} ${starter.shortName} er udelukket, og der er ingen afløser – holdet starter med en mand mindre.`]);
});
test('årsagen i noten: skadet → "er skadet", udelukket → "er udelukket", begge → "er skadet" (skaden går først)', () => {
  const say = (inj, ban) => {
    const { me, opp } = stage(9, 0), p = me.squad.find((x) => x.id === me.tactics.lineupSlots[8]);
    p.injuryMatchesLeft = inj; p.banMatches = ban;
    const m = simulateMatch(me, opp, createRng(2));
    return m.events.filter((e) => e.text.startsWith('📋') && e.text.includes(`${p.shortName} er `)).map((e) => e.text.replace(/ og erstattes.*$/, ''));
  };
  const tag = (inj, ban) => say(inj, ban)[0]?.match(/er (skadet|udelukket)$/)?.[0];
  assert.equal(tag(2, 0), 'er skadet'); assert.equal(tag(0, 2), 'er udelukket'); assert.equal(tag(1, 1), 'er skadet');
});

// ---------- tacklingerne: tallene, ikke kun rækkefølgen ----------
test('tacklinger: frispark ×~0,8/×~1,25, gule pr. frispark ×~0,8/×~1,25 og presset vundet ±~4 point – i retning OG størrelse', () => {
  const N = 300, got = {};
  for (const ti of ['CAUTIOUS', 'NORMAL', 'AGGRESSIVE']) {
    let press = 0, won = 0, fouls = 0, y = 0;
    for (let s = 1; s <= N; s++) {
      const L = createLeague(createRng(s * 17)), me = own(L);
      me.tactics.phases.phase2_defending.tacklingIntensity = ti;
      const m = simulateMatch(me, L.teams[1 + (s % 7)], createRng(s * 29)), h = m.homeId === me.id, d = m.ownReports[me.id];
      press += d.press; won += d.pressWon; fouls += m.events.at(-1).stats[h ? 'hFouls' : 'aFouls']; y += sideOf(m, me).reduce((a, e) => a + (e.yellows ?? 0), 0);
    }
    got[ti] = { press: won / press, fouls: fouls / N, yPerFoul: y / fouls };
  }
  const C = got.CAUTIOUS, Nn = got.NORMAL, A = got.AGGRESSIVE, r = (v) => Math.round(v * 1000) / 1000;
  const info = JSON.stringify(got);
  // målt (seed s*17 / s*29, 300 kampe): frispark 7,47 / 9,42 / 11,87; gule pr. frispark 0,188 / 0,200 / 0,236; presset 0,467 / 0,503 / 0,551
  assert.ok(A.fouls / Nn.fouls > 1.15 && A.fouls / Nn.fouls < 1.4, `Aggressiv frispark ×${r(A.fouls / Nn.fouls)} ${info}`);
  assert.ok(C.fouls / Nn.fouls > 0.7 && C.fouls / Nn.fouls < 0.88, `Forsigtig frispark ×${r(C.fouls / Nn.fouls)} ${info}`);
  assert.ok(A.yPerFoul / Nn.yPerFoul > 1.1, `Aggressiv: gule pr. frispark ×${r(A.yPerFoul / Nn.yPerFoul)} ${info}`);
  assert.ok(C.yPerFoul / Nn.yPerFoul < 0.97, `Forsigtig: gule pr. frispark ×${r(C.yPerFoul / Nn.yPerFoul)} ${info}`);
  // presset: +0,6 / −0,6 i en duel afgjort af ca. ±7 spredning → ca. ±4 point. 0 eller omvendt fortegn (A < Normal) er rødt
  assert.ok(A.press - Nn.press > 0.025 && A.press - Nn.press < 0.07, `Aggressiv presset +${r(A.press - Nn.press)} ${info}`);
  assert.ok(Nn.press - C.press > 0.02 && Nn.press - C.press < 0.06, `Forsigtig presset −${r(Nn.press - C.press)} ${info}`);
});

test('tacklinger: ukendt/manglende værdi (gammelt gem) opfører sig som Normal – præcis samme kamp, ikke Aggressiv', () => {
  const run = (ti) => {
    const L = createLeague(createRng(31)), me = own(L);
    me.tactics.phases.phase2_defending.tacklingIntensity = ti;
    return JSON.stringify(simulateMatch(me, L.teams[2], createRng(32)).events.map((e) => [e.min, e.text]));
  };
  const normal = run('NORMAL');
  assert.equal(run(undefined), normal); assert.equal(run('ELLER_NOGET'), normal);
  assert.notEqual(run('AGGRESSIVE'), normal, 'data: Aggressiv giver en anden kamp, så sammenligningen måler noget');
});

test('nye spillere har ban-felterne (0 / 0 / null) – også botternes, så offentlig visning og afsoning aldrig møder undefined', () => {
  const L = createLeague(createRng(41));
  const ps = L.teams.flatMap((t) => t.squad);
  assert.ok(ps.length >= 144);
  assert.ok(ps.every((p) => p.banMatches === 0 && p.banYellows === 0 && p.banWhy === null));
});
