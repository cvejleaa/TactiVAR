// v3.13 – Test Manager: huller, som mutationstest af friskhed i kampen, træthedsskift og Hvis-Så-udskiftninger
// afslørede (se tests/unit/fatigue.test.mjs for forfatterens egne tests). Friskheden i kampen er TIL her.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague, BOT_PROFILES } from '../../public/engine/generator.js';
import { simulateMatch, ruleConditionMet } from '../../public/engine/match.js';
import { runProfile } from '../../public/engine/ratings.js';
import { drainFactor, clampSubsLimit, SUBS_LIMIT, IN_MATCH_BASE, IN_MATCH_STA, IN_MATCH_MIN, TIRED_PER_POINT } from '../../public/engine/freshness.js';
import { MATCH_RULES, MAX_RULES } from '../../public/engine/match-rules.js';
import { filterEvents } from '../../public/ui/matchcenter.js';
import { normalizeRule, normalizeLeague } from '../../public/engine/sanitize.js';
import * as act from '../../public/state/actions.js';

// next() konstant, ingen scriptede chancer → ingen skud, frispark eller skader: kun tiden går.
function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return { next: () => nextValue, int: (a) => a, pick: (arr) => arr[0],
    chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(n) : !!s; } };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
function arena({ homeLimit = 70, awayLimit = 0, homeBot = false, awayBot = true } = {}) {
  const L = createLeague(createRng(1));
  const [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) { p.skills = SK(10); p.freshness = 100; p.injuryMatchesLeft = 0; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 }; }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = [];
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
    Object.assign(t.tactics.phases.phase1_buildUp, { offBallRuns: 'NORMAL' });
    Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: 'MID_BLOCK' });
    Object.assign(t.tactics.phases.phase3_transition, { onBallLost: 'DROP_BACK' });
  }
  H.subsLimit = homeLimit; A.subsLimit = awayLimit; H.isBot = homeBot; A.isBot = awayBot;
  return { L, H, A };
}
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const bench = (t) => t.squad.filter((p) => !t.tactics.lineupSlots.includes(p.id));
const subs = (m, home = true) => m.events.filter((e) => e.type === 'SUB' && e.isHome === home);
const tag = (p) => `#${p.shirtNumber} ${p.shortName}`;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≠ ${b}`);

// ---------- Konstanterne bogstaveligt (de gamle tests sammenlignede med konstanten selv) ----------
test('konstanterne er pinnet bogstaveligt: tab IN_MATCH_*, TIRED_PER_POINT, grænsens min/max/standard/NEAR, 5 skift i 3 pauser, 8 regler', () => {
  assert.deepEqual([IN_MATCH_BASE, IN_MATCH_STA, IN_MATCH_MIN, TIRED_PER_POINT], [2.2, 0.08, 0.3, 0.006]);
  assert.deepEqual({ ...SUBS_LIMIT }, { min: 50, max: 85, def: 70, near: 5 });
  assert.deepEqual({ ...MATCH_RULES }, { maxSubs: 5, maxWindows: 3 });
  assert.equal(MAX_RULES, 8);
});
test('drainFactor: manglende STA tæller som 10 (1,4), 6 → 1,72, 16 → 0,92; gulvet 0,3 fra STA 24', () => {
  near(drainFactor(undefined), 1.4); near(drainFactor(6), 1.72); near(drainFactor(16), 0.92);
  near(drainFactor(24), 0.3); near(drainFactor(23), 0.36);
});
test('clampSubsLimit: afrunder til nærmeste, klemmer 50–85, ukendt → 70, 0 (fra) bevares som tal og streng', () => {
  assert.deepEqual([clampSubsLimit(72.4), clampSubsLimit(72.6), clampSubsLimit('65')], [72, 73, 65]);
  assert.deepEqual([clampSubsLimit(49), clampSubsLimit(50), clampSubsLimit(85), clampSubsLimit(86)], [50, 50, 85, 85]);
  assert.deepEqual([clampSubsLimit(undefined), clampSubsLimit(NaN), clampSubsLimit('abc'), clampSubsLimit(null)], [70, 70, 70, 70]);
  assert.deepEqual([clampSubsLimit(0), clampSubsLimit('0')], [0, 0]);
});

// ---------- drain90 på arket: pladsens km · pres · løb · genpres · drainFactor ----------
test('drain90: pres, løb uden bold (kun løbsroller), genpres (ikke målmand) og rolle indgår – literal pr. kombination', () => {
  const T = (press, runs, lost) => ({ tactics: { phases: { phase1_buildUp: { offBallRuns: runs }, phase2_defending: { pressingHeight: press }, phase3_transition: { onBallLost: lost } } } });
  const d = (line, role, sta, t) => runProfile({ line, skills: { stamina: sta, pace: 10 } }, t, createRng(1), role).drain90;
  const mid = T('MID_BLOCK', 'NORMAL', 'DROP_BACK');
  near(d('MID', 'CM', 10, mid), 11.8 * 1.4);
  near(d('MID', 'CM', 10, T('HIGH_GEGENPRESS', 'NORMAL', 'DROP_BACK')), 11.8 * 1.06 * 1.4);
  near(d('MID', 'CM', 10, T('LOW_BLOCK', 'NORMAL', 'DROP_BACK')), 11.8 * 0.96 * 1.4);
  near(d('MID', 'CM', 10, T('MID_BLOCK', 'MANY', 'DROP_BACK')), 11.8 * 1.03 * 1.4);
  near(d('MID', 'CM', 10, T('MID_BLOCK', 'FEW', 'DROP_BACK')), 11.8 * 0.98 * 1.4);
  near(d('DEF', 'CB', 10, T('MID_BLOCK', 'MANY', 'DROP_BACK')), 9.5 * 1.4);          // CB er ingen løbsrolle
  near(d('MID', 'CM', 10, T('MID_BLOCK', 'NORMAL', 'COUNTER_PRESS_5S')), 11.8 * 1.04 * 1.4);
  near(d('GK', 'GK', 10, T('MID_BLOCK', 'NORMAL', 'COUNTER_PRESS_5S')), 5.5 * 1.4);   // målmanden presser ikke
  near(d('ATT', 'ST', 20, T('HIGH_GEGENPRESS', 'MANY', 'COUNTER_PRESS_5S')), 10.0 * 1.06 * 1.03 * 1.04 * 0.6);
});

// ---------- Friskheden i kampen: eksakte minutter (stub-rng, hvert tick et skud) ----------
// Skytten alene i feltet; skud (0,3) og angreb (0,48) i hvert tick. Uden tab scorer han i alle 30 ticks; med tab holder
// han op, når FIN·ff + 4 ≤ MV·ff + 4 + KEEPER_EDGE 0,3 (v3.15.1; før + 3 mod MV 8,5 → MV 11,3 her, så tabet stadig skiller).
// Kanten 3 med MV 11,3 giver 0 mål ved alle tre STA – rødt. Målene stopper (monotont) – antal mål = sidste mål / 3. Alle tre konstanter
// og begge led i ff (friskhed før kampen · tabt i kampen) flytter mindst ét af tallene.
function shooter({ fin = 12, gk = 11.3, sta, shooterFresh = 100, gkFresh = 100, gkSta = 10 }) {
  const { H, A } = arena({ homeLimit: 0 });
  H.tactics.customCoords = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }]));
  Object.assign(slot(H, 9).skills, { finishing: fin, stamina: sta }); slot(H, 9).freshness = shooterFresh;
  for (const p of A.squad.slice(5, 9)) p.skills.intercepting = 1;
  Object.assign(slot(A, 0).skills, { goalkeeping: gk, stamina: gkSta }); slot(A, 0).freshness = gkFresh;
  const m = simulateMatch(H, A, stubRng({ 0.48: true, 0.3: true }));
  return { goals: m.homeGoals, last: Math.max(0, ...m.events.filter((e) => e.type === 'GOAL' && e.isHome).map((e) => e.min)) };
}
// v3.15.1: MV 8,5 + 3 → 11,3 + 0,3 (målmandens eget tab vejer nu på en større værdi); før 42 / 72 / 90 (14 / 24 / 30 mål).
test('friskhed i kampen: sidste mål ved STA 2 / 10 / 18 er 39 / 75 / 90 (13 / 25 / 30 mål) – tab, STA-led og TIRED_PER_POINT pinnet', () => {
  const r = [2, 10, 18].map((sta) => shooter({ sta }));
  assert.deepEqual(r.map((x) => [x.goals, x.last]), [[13, 39], [25, 75], [30, 90]]);
});
// Friskheden FØR kampen (freshFactor) og tabet i kampen skal begge med i ff: uden den første er skytten lige så god kl. 90
// (27 / 16 mål ville være 30), uden den anden holder ingen op. Målmandens friskhed vejer lige så meget som skyttens.
// v3.15.1 (KEEPER_EDGE 3 → 0,3): MV 8,5 / 7,5 → 11,55 / 10,26 giver de samme tal som før (kanten 3 giver 0 mål).
test('friskhed før kampen vejer med i ff: skytte 80 % / målmand 70 % → sidste mål 81 (27 mål); skytte 60 % → 48 (16 mål)', () => {
  const a = shooter({ sta: 10, shooterFresh: 80, gkFresh: 70, fin: 12, gk: 11.55 });
  const b = shooter({ sta: 10, shooterFresh: 60, gkFresh: 100, fin: 12, gk: 10.26 });
  assert.deepEqual([[a.goals, a.last], [b.goals, b.last]], [[27, 81], [16, 48]]);
});
test('arket gemmer hverken km90 eller drain90 efter kampen (de er hjælpetal, ikke data)', () => {
  const { H, A } = arena({ homeLimit: 0 });
  const m = simulateMatch(H, A, stubRng({}));
  for (const e of [...m.ratings.home, ...m.ratings.away]) assert.ok(!('drain90' in e) && !('km90' in e), Object.keys(e).join());
});

// ---------- Botternes rotation før kampen følger deres grænse (ROTATE_MARGIN 10, indskifter mindst +5 over) ----------
// Starteren på plads 6 (midtbane) hviler, når han er under grænse + 10 (uden grænse: 70), og kun hvis en bænkspiller i
// samme kæde er mindst grænse + 15 (uden grænse: 85) frisk og højst 2 point svagere. Begge sider af hver kant.
function rotated({ limit, starter, benchFresh, benchSkill = 10, bot = true }) {
  const { H, A } = arena({ homeLimit: limit, homeBot: bot });
  slot(H, 6).freshness = starter;
  for (const p of bench(H)) { p.freshness = benchFresh; p.skills = SK(benchSkill); }
  const m = simulateMatch(H, A, stubRng({}), { liveEnergy: false });
  return m.events.some((e) => e.text.includes(`starter i stedet for en træt ${tag(slot(H, 6))}`));
}
test('bot-rotation uden grænse (0): starter under 70 hviles af en bænkspiller på mindst 85; 70 / 84 gør det ikke', () => {
  assert.equal(rotated({ limit: 0, starter: 69, benchFresh: 85 }), true);
  assert.equal(rotated({ limit: 0, starter: 70, benchFresh: 100 }), false, 'starter præcis 70');
  assert.equal(rotated({ limit: 0, starter: 69, benchFresh: 84 }), false, 'bænk 84 < 85');
});
test('bot-rotation med grænse 65 (hvile under 75, bænk mindst 80) og 75 (hvile under 85, bænk mindst 90)', () => {
  assert.equal(rotated({ limit: 65, starter: 74, benchFresh: 80 }), true);
  assert.equal(rotated({ limit: 65, starter: 75, benchFresh: 100 }), false, 'starter 75 = grænse + 10');
  assert.equal(rotated({ limit: 65, starter: 74, benchFresh: 79 }), false, 'bænk 79 < grænse + 15');
  assert.equal(rotated({ limit: 75, starter: 84, benchFresh: 90 }), true);
  assert.equal(rotated({ limit: 75, starter: 85, benchFresh: 100 }), false, 'starter 85 = grænse + 10');
  assert.equal(rotated({ limit: 75, starter: 84, benchFresh: 89 }), false, 'bænk 89 < grænse + 15');
  assert.equal(rotated({ limit: 70, starter: 79, benchFresh: 85 }), true);
  assert.equal(rotated({ limit: 70, starter: 80, benchFresh: 100 }), false);
});
test('bot-rotation: indskifteren må højst være 2 evnepoint svagere end starteren, og et menneskehold rotes aldrig', () => {
  assert.equal(rotated({ limit: 0, starter: 60, benchFresh: 100, benchSkill: 8 }), true, '−2 er stadig ok');
  assert.equal(rotated({ limit: 0, starter: 60, benchFresh: 100, benchSkill: 7.9 }), false, '−2,1 er for svag');
  assert.equal(rotated({ limit: 0, starter: 60, benchFresh: 100, bot: false }), false, 'dit eget hold rotes ikke for dig');
});
test('bot-rotation vælger den bedste friske bænkspiller i kæden (ikke den første)', () => {
  const { H, A } = arena({ homeLimit: 0, homeBot: true });
  slot(H, 6).freshness = 60;
  const mids = bench(H).filter((p) => p.line === 'MID');
  mids.forEach((p, i) => { p.skills = SK(9 + i * 0.1); p.freshness = 100; });
  const best = mids.at(-1);
  const m = simulateMatch(H, A, stubRng({}), { liveEnergy: false });
  assert.ok(mids.length >= 2);
  assert.ok(m.events.some((e) => e.text === `📋 [${H.name}] ${tag(best)} starter i stedet for en træt ${tag(slot(H, 6))}.`), m.events.filter((e) => e.type === 'LINEUP').map((e) => e.text).join(' | '));
});

// ---------- Træthedsskift: rækkefølge, valg af indskifter, beskeder ----------
// Bænken: MV, 2 forsvarere, 2 midtbane, 2 angribere. Pladserne (4-4-2): 1 LB, 2-3 CB, 4 RB, 5 LM, 6-7 CM, 9-10 ST; kæderne
// følger spillerens line (plads 8 og 10 er angribere, plads 9 en midtbanespiller).
const blocked = (m, home = true) => m.events.filter((e) => e.label === 'Udskiftning ikke mulig' && e.isHome === home);
const outOf = (e, t) => t.squad.filter((p) => e.text.includes(`${tag(p)} ud (`));
const at3 = (list) => list.filter((e) => e.min === 3);   // første tick – senere tæller indskiftere og trætte med
const freshBench = (t, v = 100) => { for (const b of bench(t)) b.freshness = v; };

test('trætte skiftes lavest friskhed først; når bænken er tom, får de resterende besked om kæden – én gang hver, kun dit hold', () => {
  const { H, A } = arena();
  const [p1, p2, p3, p4] = [1, 2, 3, 4].map((i) => slot(H, i));
  [p1.freshness, p2.freshness, p3.freshness, p4.freshness] = [66, 62, 64, 60];
  freshBench(H);
  for (const b of bench(H).filter((x) => x.line === 'DEF')) b.freshness = 100;   // to forsvarere → to skift
  slot(A, 1).freshness = 60; slot(A, 2).freshness = 61; A.subsLimit = 70; for (const b of bench(A)) b.freshness = 50;   // en bots tavse "ingen indskifter"
  const m = simulateMatch(H, A, stubRng({}));
  const s = subs(m);
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((e) => [e.min, outOf(e, H)[0]?.id]), [[3, p4.id], [3, p2.id]], 'lavest (60) først, så 62 – ikke 66 og 64');
  const b = blocked(m);
  // I 3. minut er LB (10,6 km · 1,4 · 2/90) 0,33 og CB 0,30 point nede: 66 → 65,7 → "65 %", 64 → 63,7 → "63 %"; lavest friskhed først
  assert.deepEqual(b.map((e) => e.text), [
    `📋 [${H.name}] ${tag(p3)} er under din udskiftningsgrænse (63 % – grænse 70 %), men der er ingen frisk forsvarsspiller på bænken.`,
    `📋 [${H.name}] ${tag(p1)} er under din udskiftningsgrænse (65 % – grænse 70 %), men der er ingen frisk forsvarsspiller på bænken.`], 'resterende får besked, nøjagtig én gang (ikke et pr. tick)');
  assert.ok(b.every((e) => e.type === 'INFO' && e.category === 'TACTIC'));
  assert.equal(blocked(m, false).length, 0, 'en bots manglende indskifter nævnes aldrig');
});
test('"ingen frisk …" nævner kæden (forsvarsspiller / midtbanespiller / angriber), og en indskifter på præcis grænse + 5 (75) er frisk nok – 74 er ikke', () => {
  const run = (benchFresh) => {
    const { H, A } = arena();
    [1, 5, 8].forEach((i) => { slot(H, i).freshness = 60; });
    freshBench(H, benchFresh);
    return { H, m: simulateMatch(H, A, stubRng({})) };
  };
  const low = run(74), ok = run(75);
  assert.equal(subs(low.m).length, 0, 'bænk 74 < 70 + 5');
  const words = at3(low.m.events.filter((e) => e.label === 'Udskiftning ikke mulig')).map((e) => e.text.match(/ingen frisk (\S+) på bænken\.$/)?.[1]).sort();
  assert.deepEqual(words, ['angriber', 'forsvarsspiller', 'midtbanespiller']);
  assert.equal(at3(subs(ok.m)).length, 3, 'bænk 75 = 70 + 5 er med (indskifterne selv bliver trætte senere – kun 3. minut tælles)');
});
test('indskifteren vælges efter evnesnit · friskhed (ikke kun det ene), og den højeste vinder uanset bænkens rækkefølge', () => {
  const run = (a, b) => {
    const { H, A } = arena();
    const cm = slot(H, 6); cm.freshness = 60;
    const [m1, m2] = bench(H).filter((p) => p.line === 'MID');
    m1.skills = SK(a[0]); m1.freshness = a[1]; m2.skills = SK(b[0]); m2.freshness = b[1];
    for (const x of bench(H).filter((p) => p.line !== 'MID')) x.freshness = 100;
    const m = simulateMatch(H, A, stubRng({}));
    return { m, in: subs(m)[0].text.includes(`${tag(m1)} ind`) ? 'første' : subs(m)[0].text.includes(`${tag(m2)} ind`) ? 'anden' : '?' };
  };
  assert.equal(run([11, 80], [9, 100]).in, 'anden', '11·80 = 880 mod 9·100 = 900: den friskeste vinder over den bedste');
  assert.equal(run([9, 100], [11, 80]).in, 'første');
  assert.equal(run([12, 80], [9, 100]).in, 'første', '12·80 = 960 mod 900: den bedste vinder over den friskeste');
  assert.equal(run([9, 100], [12, 80]).in, 'anden');
});
test('samlingen: er hovedskiftet umuligt, tages en tæt-på ikke med; lykkes ét, tages tæt-på med (også når et andet trængende skift fejler)', () => {
  const setup = (withA) => {
    const { H, A } = arena();
    if (withA) { slot(H, 1).freshness = 60; for (const b of bench(H).filter((x) => x.line === 'DEF')) b.freshness = 100; }   // A: kan skiftes
    slot(H, 8).freshness = 65; for (const b of bench(H).filter((x) => x.line === 'ATT')) b.freshness = 74;                 // B: ingen frisk angriber
    slot(H, 5).freshness = 72; for (const b of bench(H).filter((x) => x.line === 'MID')) b.freshness = 100;                // C: tæt på (72 < 75)
    return simulateMatch(H, A, stubRng({}));
  };
  const only = setup(false), both = setup(true);
  assert.equal(at3(subs(only)).length, 0, 'ingen pause brugt → C holdes ikke ud af kampen på falsk grundlag');
  assert.equal(at3(blocked(only)).length, 1, 'kun B får besked');
  const s = at3(subs(both));
  assert.equal(s.length, 2);
  assert.match(s[0].text, /under din grænse 70 %/); assert.match(s[1].text, /tages med i samme pause/);
  assert.equal(at3(blocked(both)).length, 1, 'B får stadig sin besked; C (tæt på) aldrig');
});
// v3.15 (brugerens valg "spred skift"): højst 3 træthedsskift ad gangen – de trætteste først; den fjerde venter til
// næste tick (og får besked), hvor han tages sammen med den mest trætte tæt-på – i alt stadig højst 5.
test('samlingen: højst 3 ad gangen – de trætteste først, den fjerde venter (med besked) og tages i næste tick sammen med den trætteste tæt-på', () => {
  const { H, A } = arena();
  [[1, 60], [2, 61], [5, 60], [6, 61]].forEach(([i, f]) => { slot(H, i).freshness = f; });
  slot(H, 8).freshness = 74; slot(H, 10).freshness = 72;     // tæt på; plads 10 er trættest
  freshBench(H);
  const m = simulateMatch(H, A, stubRng({}));
  const first = at3(subs(m));
  assert.equal(first.length, 3, first.map((e) => e.text).join(' | '));
  // De fire trætte (plads 1, 2, 5, 6): tre skiftes (de trætteste efter kampens tab), den fjerde venter
  const tired = [1, 2, 5, 6].map((i) => slot(H, i)), outOf = (e) => tired.find((p) => e.text.includes(`${tag(p)} ud`));
  assert.ok(first.every(outOf) && new Set(first.map(outOf)).size === 3, first.map((e) => e.text).join(' | '));
  const waiting = tired.find((p) => !first.map(outOf).includes(p));
  const fr = (e) => Number(e.text.match(/træt, (\d+) %/)[1]);
  assert.ok(first.every((e) => /under din grænse/.test(e.text) && !/tages med/.test(e.text)), 'ingen tæt-på, når loftet er nået');
  const wait = at3(blocked(m));
  assert.equal(wait.length, 1);
  assert.match(wait[0].text, new RegExp(`${tag(waiting)} .*højst 3 træthedsskift ad gangen – han venter til næste skift\\.$`));
  const next = subs(m).filter((e) => e.min === 6);
  assert.equal(next.length, 2, next.map((e) => e.text).join(' | '));
  assert.ok(next[0].text.includes(`${tag(waiting)} ud`) && next[1].text.includes(`${tag(slot(H, 10))} ud`) && /tages med/.test(next[1].text), next.map((e) => e.text).join(' | '));
  assert.ok(Math.max(...first.map(fr)) <= fr(next[0]), 'de trætteste gik først');
  assert.equal(subs(m).length, 5);
});
test('samlingen: en tæt-på uden frisk indskifter får ingen besked', () => {
  const { H, A } = arena();
  slot(H, 1).freshness = 60; slot(H, 8).freshness = 72;
  freshBench(H); for (const b of bench(H).filter((x) => x.line === 'ATT')) b.freshness = 74;
  const m = simulateMatch(H, A, stubRng({}));
  assert.equal(at3(subs(m)).length, 1);
  assert.equal(at3(blocked(m)).length, 0);
});

// ---------- Hvem ser hvad: dit skift er "taktik" og fortæller hvorfor; en bots er neutralt ----------
test('begge sider: dit udebanehold skifter også for træthed; kun DINE skift står under "Kun taktik" og har tal i teksten', () => {
  const { H, A } = arena({ homeLimit: 70, awayLimit: 70, homeBot: true, awayBot: false });
  slot(H, 6).freshness = 60; slot(A, 6).freshness = 60;
  for (const t of [H, A]) freshBench(t);
  for (const b of bench(H)) b.skills = SK(7);   // > 2 svagere: botten hviler ham ikke før kampen, men skifter i kampen
  const m = simulateMatch(H, A, stubRng({}));
  const mine = subs(m, false)[0], theirs = subs(m, true)[0];
  assert.ok(mine && theirs, 'begge hold skifter');
  assert.match(mine.text, new RegExp(`^🔄 \\[${A.name}\\] ${tag(slot(A, 6)).replace('#', '#')} ud \\(træt, 5\\d % – under din grænse 70 %\\) – #\\d+ .+ ind\\.$`));
  assert.match(theirs.text, new RegExp(`^🔄 \\[${H.name}\\] #\\d+ .+ erstatter ${tag(slot(H, 6))}\\.$`));
  assert.ok(mine.tactical === true && !theirs.tactical);
  const tactic = filterEvents(m.events, 'tactic');
  assert.ok(tactic.includes(mine) && !tactic.includes(theirs), 'Kun taktik: dit skift ja, botten nej');
});
test('en bots Hvis-Så-skift, der ikke kan udføres, tier; dit eget får besked – og kun én gang (reglen er brugt)', () => {
  const run = (bot) => {
    const { H, A } = arena({ homeLimit: 0, homeBot: bot });
    const other = bench(H).find((p) => p.line === 'DEF');
    H.tactics.conditionalRules = [{ ruleId: 9, minuteTrigger: 6, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: other.id, subIn: bench(H).find((p) => p.line === 'MID').id }];
    return simulateMatch(H, A, stubRng({})).events.filter((e) => e.label === 'Hvis-Så-skift ikke udført');
  };
  assert.equal(run(true).length, 0);
  const mine = run(false);
  assert.equal(mine.length, 1, 'ikke et pr. tick');
  assert.deepEqual([mine[0].min, mine[0].type, mine[0].category, mine[0].isHome], [6, 'TRIGGER', 'TACTIC', true]);
});
test('Hvis-Så-udskiftning: fejlmeddelelserne – ude af banen går først, derefter indskifter ikke på bænken (skadet) og pauser/skift brugt', () => {
  const build = (mut) => {
    const { H, A } = arena({ homeLimit: 0 });
    const [b1, b2] = bench(H).filter((p) => p.line === 'MID');
    const r = (o) => ({ ruleId: 9, minuteTrigger: 6, condition: 'ANY', margin: 1, newFormation: '5-4-1', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(H, 6).id, subIn: b1.id, ...o });
    H.tactics.conditionalRules = mut({ H, b1, b2, r });
    return { H, m: () => simulateMatch(H, A, stubRng({})) };
  };
  const msg = (m) => m.events.filter((e) => e.label === 'Hvis-Så-skift ikke udført').map((e) => e.text);
  const mins = (m) => m.events.filter((e) => e.label === 'Hvis-Så-skift ikke udført').map((e) => e.min);   // v3.16.3: minuttet står ved linjen, ikke i teksten
  // Indskifteren er skadet
  let c = build(({ b1, r }) => { b1.injuryMatchesLeft = 2; return [r()]; });
  let m = c.m();
  assert.equal(subs(m).length, 0);
  assert.deepEqual(mins(m), [6]);
  assert.deepEqual(msg(m), [`📋 [${c.H.name} • Hvis-Så] Udskiftningen kunne ikke udføres: ${tag(bench(c.H).find((p) => p.injuryMatchesLeft))} er ikke på bænken (skadet, allerede brugt eller i startopstillingen).`]);
  // Begge spillere forkerte: "ikke på banen" går først og nævner UD-spilleren
  c = build(({ b1, b2, r, H }) => { b1.injuryMatchesLeft = 2; return [r({ subOut: bench(H).find((p) => p.line === 'DEF').id })]; });
  m = c.m();
  assert.deepEqual(msg(m), [`📋 [${c.H.name} • Hvis-Så] Udskiftningen kunne ikke udføres: ${tag(bench(c.H).find((p) => p.line === 'DEF'))} er ikke på banen.`]);
  // Reglen skifter målmanden (plads 0)? UD-spilleren er målmanden: kan ikke
  c = build(({ r, H }) => [r({ subOut: slot(H, 0).id })]);
  m = c.m();
  assert.equal(subs(m).length, 0); assert.equal(msg(m).length, 1);
  assert.ok(msg(m)[0].includes('er ikke på banen'), msg(m)[0]);
  // En regel, der ikke kan udføres, ændrer ikke formationen (SUB falder ikke igennem til planskiftet 5-4-1)
  assert.equal(m.events.filter((e) => /Holdet skifter fra/.test(e.text)).length, 0);   // v3.16.3-ordlyden ("Holdet skifter fra …")
});
test('Hvis-Så-udskiftning: en vellykket regel bruges kun én gang og skifter ikke formation (fx 5-4-1)', () => {
  const { H, A } = arena({ homeLimit: 0 });
  const inP = bench(H).find((p) => p.line === 'MID');
  H.tactics.conditionalRules = [{ ruleId: 9, minuteTrigger: 6, condition: 'ANY', margin: 1, newFormation: '5-4-1', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(H, 6).id, subIn: inP.id }];
  const m = simulateMatch(H, A, stubRng({}));
  assert.equal(subs(m).length, 1);
  assert.equal(m.events.filter((e) => e.label === 'Hvis-Så-skift ikke udført').length, 0, 'ingen fejl-besked et tick senere');
  assert.equal(m.events.filter((e) => /Holdet skifter fra/.test(e.text)).length, 0, 'ingen formationsskift');   // v3.16.3-ordlyden
  assert.equal(m.endState?.tactics?.baseFormation ?? '4-4-2', '4-4-2');
});

// ---------- Pauser og antal via Hvis-Så (deterministiske minutter) ----------
function ruleRun(minutes, { limit = 0 } = {}) {
  const { H, A } = arena({ homeLimit: limit });
  const pool = bench(H).filter((p) => p.line !== 'GK');   // 2 DEF, 2 MID, 2 ATT
  const outs = [1, 2, 3, 4, 5, 6];
  H.tactics.conditionalRules = minutes.map((min, i) => ({ ruleId: i + 1, minuteTrigger: min, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(H, outs[i]).id, subIn: pool[i].id }));
  const m = simulateMatch(H, A, stubRng({}));
  // notes: [minut, tekst] – minuttet står ved linjen, ikke i teksten (v3.16.3)
  return { H, m, mins: subs(m).map((e) => e.min), notes: m.events.filter((e) => e.label === 'Hvis-Så-skift ikke udført').map((e) => [e.min, e.text]) };
}
test('pauser: to skift i samme tick er én pause – 3-3-6-9-9 giver fem skift i tre pauser; det sjette får "alle 5 udskiftninger er brugt"', () => {
  const r = ruleRun([3, 3, 6, 9, 9, 12]);
  assert.deepEqual(r.mins, [3, 3, 6, 9, 9]);
  assert.deepEqual(r.notes, [[12, `📋 [${r.H.name} • Hvis-Så] Udskiftningen kunne ikke udføres: alle 5 udskiftninger er brugt.`]]);
});
test('pauser: den fjerde pause afvises med "alle 3 skifte-pauser er brugt" (skift 4 af 5)', () => {
  const r = ruleRun([3, 6, 9, 12]);
  assert.deepEqual(r.mins, [3, 6, 9]);
  assert.deepEqual(r.notes, [[12, `📋 [${r.H.name} • Hvis-Så] Udskiftningen kunne ikke udføres: alle 3 skifte-pauser er brugt.`]]);
});
test('pauser: halvlegen (45) er gratis og tæller ikke som en af de tre – 45-48-51-54 udføres, 57 afvises', () => {
  const r = ruleRun([45, 48, 51, 54, 57]);
  assert.deepEqual(r.mins, [45, 48, 51, 54]);
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0][0], 57);
  assert.match(r.notes[0][1], /udføres: alle 3 skifte-pauser er brugt\.$/);
});
test('Hvis-Så-skiftet kører før træthedsskiftet i samme tick: reglens indskifter er til rådighed, og reglen mister ikke sin udgående spiller', () => {
  const { H, A } = arena({ homeLimit: 70 });
  const cm = slot(H, 6); cm.freshness = 60;
  const [b1, b2] = bench(H).filter((p) => p.line === 'MID');
  b1.skills = SK(12); b2.skills = SK(9);
  freshBench(H);
  H.tactics.conditionalRules = [{ ruleId: 9, minuteTrigger: 3, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: cm.id, subIn: b2.id }];
  const m = simulateMatch(H, A, stubRng({}));
  const [first] = subs(m);
  assert.equal(first.text, `🔄 [${H.name} • Hvis-Så] ${tag(cm)} ud – ${tag(b2)} ind (din Hvis-Så-regel).`);
  assert.equal(first.min, 3);   // v3.16.3: minuttet ved linjen, ikke i teksten
  assert.equal(m.events.filter((e) => e.label === 'Hvis-Så-skift ikke udført').length, 0);
});

// ---------- "sparede ca. N point" ----------
test('sparet friskhed: to udskiftede CM (11,8 km · 87/90 → 11,41 km · (1,5 − 0,3)) = 14 hver → "Dine 2 udskiftede spillere … 28 point"; ingen skift → ingen linje', () => {
  const { H, A } = arena({ homeLimit: 0 });
  const [b1, b2] = bench(H).filter((p) => p.line === 'MID');
  H.tactics.conditionalRules = [6, 7].map((i, k) => ({ ruleId: k + 1, minuteTrigger: 3, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(H, i).id, subIn: [b1, b2][k].id }));
  const m = simulateMatch(H, A, stubRng({}));
  const l = m.events.filter((e) => e.label === 'Udskiftninger');
  assert.equal(l.length, 1);
  assert.equal(l[0].text, `🔋 [${H.name}] Dine 2 udskiftede spillere sparede ca. 17 point friskhed til næste runde.`);   // QC: efter restitution 28 · 0,59 = 16,5 → 17
  assert.deepEqual([l[0].min, l[0].type, l[0].category, l[0].isHome], [90, 'INFO', 'TACTIC', true]);
  const none = arena({ homeLimit: 0 });
  assert.equal(simulateMatch(none.H, none.A, stubRng({})).events.filter((e) => e.label === 'Udskiftninger').length, 0, 'uden skift: ingen "sparede"-linje');
});
test('sparet friskhed: kun dit eget hold får linjen, udebanen lige så, og en spiller med lav STA sparer mere (STA 0: 11,8 · 0,9 · 87/90 · 1,5 = 15,4 → 15)', () => {
  const { H, A } = arena({ homeLimit: 0, homeBot: true, awayBot: false, awayLimit: 0 });
  const b = bench(A).find((p) => p.line === 'MID'); slot(A, 6).skills.stamina = 0;
  A.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(A, 6).id, subIn: b.id }];
  const bot = bench(H).find((p) => p.line === 'MID');
  H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(H, 6).id, subIn: bot.id }];
  const m = simulateMatch(H, A, stubRng({}));
  const l = m.events.filter((e) => e.label === 'Udskiftninger');
  assert.equal(l.length, 1, 'botten får ingen linje');
  assert.equal(l[0].isHome, false);
  assert.equal(l[0].text, `🔋 [${A.name}] Din udskiftede spiller sparede ca. 9 point friskhed til næste runde.`);   // 15 · 0,59 = 8,9 → 9
});

// ---------- ff på kaldstederne ----------
// Straffe i hvert tick (30): FIN 12 + 2,3 (bonus) mod MV 14,7 – målmanden (STA 0) trættes og slipper efterhånden flere
// igennem; tagerens STA 24 taber næsten intet. Uden ff på målmanden (kun friskhed før kampen) er det 0 mål; med: 16.
test('straffe: en træt målmand (STA 0) slipper efterhånden straffer ind – 16 af 30 ved MV 14,7 (uden tab på målmanden: 0)', () => {
  const { H, A } = arena({ homeLimit: 0 });
  Object.assign(slot(H, 9).skills, { finishing: 12, stamina: 24 }); slot(H, 10).skills.finishing = 1; slot(H, 6).skills.finishing = 1;
  Object.assign(slot(A, 0).skills, { goalkeeping: 14.7, stamina: 0 });
  const m = simulateMatch(H, A, stubRng({ 0.011: true }));
  assert.equal(m.stats.hPenalties, 30);
  assert.equal(m.homeGoals, 16);
});
// Skud i hvert tick: FIN 12 + 4 mod MV 12 + 4 + 0,3 (MV STA 0, skytte STA 24): den træthed, målmanden ophober, giver mål
// fra et stykke inde i kampen – 16 af 30 (v3.15.1; før MV 9,2 + 7: 17 af 30; kanten 3 med MV 12 giver 0). Uden tab på
// målmanden: 16 > 16,3 falsk → 0. Fanger "ff → freshFactor" på målmanden i afslutningerne (FIN-duellen).
test('afslutninger: en træt målmand (STA 0) slipper mål ind senere i kampen – 16 af 30 ved MV 12', () => {
  const r = shooter({ sta: 24, gkSta: 0, fin: 12, gk: 12 });
  assert.deepEqual([r.goals, r.last], [16, 90]);
});
// Resten af kaldstederne (hovedstød, kontra, indlæg, cutback, løb, dribling, opbygning/pres) er kun bundet af denne vagt:
// hvert tal i en duel går gennem ff(...), aldrig direkte gennem freshFactor(...) – ellers er tabet i kampen væk dér.
test('match.js bruger ff(...) i alle dueller – freshFactor kaldes kun inde i ff selv (20 kald)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../public/engine/match.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.equal((src.match(/\bfreshFactor\(/g) ?? []).length, 1, 'kun ff-definitionen kalder freshFactor(');
  assert.equal((src.match(/(?<![A-Za-z])ff\(/g) ?? []).length, 20);
});

// ---------- Hvis-Så og reserverede bænkspillere ----------
test('en Hvis-Så-regel med ukendt spiller siger "spilleren er ikke på banen" (ikke et navn)', () => {
  const { H, A } = arena({ homeLimit: 0 });
  H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 6, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: 'findes_ikke', subIn: bench(H)[1].id }];
  const m = simulateMatch(H, A, stubRng({}));
  assert.deepEqual(m.events.filter((e) => e.label === 'Hvis-Så-skift ikke udført').map((e) => [e.min, e.text]), [[6, `📋 [${H.name} • Hvis-Så] Udskiftningen kunne ikke udføres: spilleren er ikke på banen.`]]);   // v3.16.3: minuttet ved linjen
});
test('reservation: en brugt regel (der mislykkedes) og en regel, der kun er et planskift, holder ingen bænkspiller tilbage', () => {
  const run = (rule) => {
    const { H, A } = arena();
    const cm = slot(H, 6); cm.freshness = 75; cm.skills.stamina = 1;     // træt i 21'
    const [m1, m2] = bench(H).filter((p) => p.line === 'MID');
    m1.skills = SK(8); m2.skills = SK(12); freshBench(H);                 // m2 er klart bedst
    H.tactics.conditionalRules = [rule({ H, m2, cm })];
    const m = simulateMatch(H, A, stubRng({}));
    return subs(m).find((e) => e.min === 21)?.text ?? '';
  };
  const base = { ruleId: 1, margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()] };
  // Reglen i minut 3 kan ikke udføres (ud-spilleren findes ikke) → den er brugt, og m2 er ikke længere reserveret
  const failed = run(({ m2 }) => ({ ...base, minuteTrigger: 3, condition: 'ANY', action: 'SUB', subOut: 'findes_ikke', subIn: m2.id }));
  const { H } = arena(); const [, m2] = bench(H).filter((p) => p.line === 'MID');
  assert.ok(failed.endsWith(`${tag(m2)} ind.`), 'det bedste vælges, når reglen er brugt: ' + failed);
  // Et planskift (SHIFT) med en gammel subIn fra en tidligere udskiftning reserverer ikke
  const shift = run(({ m2 }) => ({ ...base, minuteTrigger: 80, condition: 'TRAILING', action: 'SHIFT', subOut: null, subIn: m2.id }));
  assert.ok(shift.endsWith(`${tag(m2)} ind.`), 'et planskift reserverer ikke: ' + shift);
});

// ---------- En skadet spiller, der ikke kan skiftes, er ikke "træt" ----------
test('en skadet spiller uden indskiftning (skift brugt) nævnes ikke i træthedsbeskederne', () => {
  const { H, A } = arena();
  const lb = slot(H, 1); lb.freshness = 73;                          // ikke træt ved skaden (tick 9), men bliver det (LB 0,165 pr. min → under 70 efter ca. 19 min)
  const outs = [2, 3, 4, 5, 6], ins = bench(H).filter((p) => p.line !== 'GK');
  H.tactics.conditionalRules = outs.map((o, i) => ({ ruleId: i + 1, minuteTrigger: 3, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(H, o).id, subIn: ins[i].id }));
  // Skade på plads 1 (hjemme) i tick 9: de 5 skift er brugt → "Ingen indskiftning mulig"
  const m = simulateMatch(H, A, stubRng({ 0.06: (n) => n === 2, 0.5: true, 0.4: true }));
  assert.ok(m.events.some((e) => e.label === 'Ingen indskiftning'), 'skaden skete uden indskiftning');
  assert.equal(subs(m).length, 5);
  assert.deepEqual(blocked(m).map((e) => e.text), [], 'ingen træthedsbesked om den skadede LB');
});

// ---------- Hvis-Så: den ANGIVNE indskifter kommer ind (teksten kan ikke afsløre det) ----------
test('Hvis-Så-udskiftning: den valgte bænkspiller spiller (også den ANDEN midtbanespiller og en angriber ind for en midtbanespiller) – ikke bare den første i kæden', () => {
  for (const choose of [(b) => b.filter((p) => p.line === 'MID')[1], (b) => b.filter((p) => p.line === 'ATT')[1]]) {
    const { H, A } = arena({ homeLimit: 0 });
    const inP = choose(bench(H)), first = bench(H).find((p) => p.line === 'MID');
    H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 60, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(H, 6).id, subIn: inP.id }];
    const m = simulateMatch(H, A, stubRng({}));
    const e = m.ratings.home.find((x) => x.playerId === inP.id);
    assert.deepEqual([e?.minIn, e?.slot], [60, 6], `${tag(inP)} ind på plads 6`);
    assert.equal(m.ratings.home.some((x) => x.playerId === first.id), false, 'den første i kæden spiller ikke');
  }
});
test('skadet spiller med indskifter er ikke et "udskiftet" valg – "sparede"-linjen tæller kun de planlagte skift', () => {
  const { H, A } = arena({ homeLimit: 0 });
  const m = simulateMatch(H, A, stubRng({ 0.06: (n) => n === 0, 0.5: true, 0.4: true }));
  assert.equal(subs(m).length, 1, 'skadesskiftet skete');
  assert.ok(m.events.some((e) => e.type === 'INJURY' && e.isHome));
  assert.equal(m.events.filter((e) => e.label === 'Udskiftninger').length, 0);
});

// ---------- Indlæsning og handlinger ----------
test('normalizeRule: SUB bevares, alt andet bliver SHIFT; subOut/subIn kun som tekst (id) – tal, objekter og manglende bliver null; ANY bevares, ukendt → TRAILING', () => {
  const n = (o) => normalizeRule({ condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, ...o });
  assert.equal(n({ action: 'SUB' }).action, 'SUB');
  for (const a of ['sub', 'HACK', undefined, null, 1, true]) assert.equal(n({ action: a }).action, 'SHIFT', String(a));
  const ok = n({ action: 'SUB', subOut: 'plr_a', subIn: 'plr_b' });
  assert.deepEqual([ok.subOut, ok.subIn], ['plr_a', 'plr_b']);
  for (const bad of [3, {}, ['x'], undefined, null, true]) { const r = n({ subOut: bad, subIn: bad }); assert.deepEqual([r.subOut, r.subIn], [null, null], JSON.stringify(bad)); }
  assert.equal(n({}).condition, 'ANY');
  assert.equal(n({ condition: 'BOGUS' }).condition, 'TRAILING');
  assert.equal(n({ condition: 'LEADING_BY_1' }).condition, 'LEADING');
});
test('normalizeLeague: højst 8 regler pr. plan bevares (ikke 5, ikke 9), og en gemt udskiftningsregel overlever indlæsning uændret', () => {
  const L = createLeague(createRng(6));
  const t = L.teams[0], other = bench(t)[0];
  t.tactics.conditionalRules = Array.from({ length: 10 }, (_, i) => ({ ruleId: i + 1, minuteTrigger: 60 + i, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: t.tactics.lineupSlots[3], subIn: other.id }));
  t.tacticPresets[1].conditionalRules = t.tactics.conditionalRules.slice(0, 7).map((r) => structuredClone(r));
  normalizeLeague(L);
  assert.equal(t.tactics.conditionalRules.length, 8);
  assert.equal(t.tacticPresets[1].conditionalRules.length, 7);
  assert.deepEqual(t.tactics.conditionalRules.map((r) => r.minuteTrigger), [60, 61, 62, 63, 64, 65, 66, 67]);
  const r = t.tactics.conditionalRules[0];
  assert.deepEqual([r.condition, r.action, r.subOut, r.subIn], ['ANY', 'SUB', t.tactics.lineupSlots[3], other.id]);
});
test('actions: ny regel er et planskift uden spillere; setSubsLimit klemmer og bevarer 0; holdets grænse hører ikke til planen', () => {
  const t = createLeague(createRng(3)).teams[0];
  t.tactics.conditionalRules = [];
  assert.equal(act.addRule(t), true);
  const r = t.tactics.conditionalRules[0];
  assert.deepEqual([r.action, r.subOut, r.subIn], ['SHIFT', null, null]);
  const before = JSON.stringify(t.tactics);
  act.setSubsLimit(t, 95); assert.equal(t.subsLimit, 85);
  act.setSubsLimit(t, 10); assert.equal(t.subsLimit, 50);
  act.setSubsLimit(t, 0); assert.equal(t.subsLimit, 0);
  act.setSubsLimit(t, 72); assert.equal(t.subsLimit, 72);
  assert.equal(JSON.stringify(t.tactics), before, 'grænsen ligger på holdet, ikke i planen');
  assert.equal('subsLimit' in t.tactics, false);
});
test('beskeden gentages ikke, men en NY grund til samme spiller får sin egen besked ("ingen frisk angriber" → senere "alle 3 skifte-pauser er brugt")', () => {
  const { H, A } = arena();
  const p = slot(H, 8); p.freshness = 60;                               // angriber, ingen frisk angriber på bænken
  freshBench(H); for (const b of bench(H).filter((x) => x.line === 'ATT')) b.freshness = 74;
  const pool = bench(H).filter((x) => x.line === 'DEF' || x.line === 'MID');
  H.tactics.conditionalRules = [[6, 1], [9, 2], [12, 5]].map(([min, out], i) => ({ ruleId: i + 1, minuteTrigger: min, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(H, out).id, subIn: pool[i].id }));
  const m = simulateMatch(H, A, stubRng({}));
  const mine = blocked(m).filter((e) => e.text.includes(tag(p)));
  assert.deepEqual(mine.map((e) => [e.min, e.text.replace(/^.*men /, '')]), [[3, 'der er ingen frisk angriber på bænken.'], [15, 'alle 3 skifte-pauser er brugt.']]);
});
test('et nyt holds standardregel er et planskift (bagud 65\' → 3-4-3) uden spillere – ikke en udskiftning', () => {
  const L = createLeague(createRng(5));
  for (const t of L.teams) for (const tac of [t.tactics, ...t.tacticPresets.slice(0, 1)]) {
    const [r, ...rest] = tac.conditionalRules;
    assert.equal(rest.length, 0);
    assert.deepEqual([r.condition, r.minuteTrigger, r.newFormation, r.action, r.subOut, r.subIn], ['TRAILING', 65, '3-4-3', 'SHIFT', null, null]);
  }
});
test('ruleConditionMet: "uanset stilling" er sand ved alle stillinger; uafgjort kun ved lighed; ukendt betingelse falsk', () => {
  const c = (condition, own, opp, margin = 1) => ruleConditionMet({ condition, margin }, own, opp);
  assert.deepEqual([[0, 0], [0, 3], [3, 0], [2, 2]].map(([a, b]) => c('ANY', a, b)), [true, true, true, true]);
  assert.deepEqual([[0, 0], [0, 1], [1, 0]].map(([a, b]) => c('DRAW', a, b)), [true, false, false]);
  assert.deepEqual([[0, 1], [0, 2], [1, 1]].map(([a, b]) => c('TRAILING', a, b, 2)), [false, true, false]);
  assert.deepEqual([[1, 0], [2, 0], [1, 1]].map(([a, b]) => c('LEADING', a, b, 2)), [false, true, false]);
  assert.equal(c('SOMETHING', 0, 0), false);
});

test('holdenes grænser: bogstaveligt pr. hold (70 / 75 / 65 / 75 / 70 / 70 / 65 / 75) og efter reglen "mange løb 75, lav blok/få løb 65, resten 70"', () => {
  const L = createLeague(createRng(9));
  assert.deepEqual(L.teams.map((t) => t.subsLimit), [70, 75, 65, 75, 70, 70, 65, 75]);
  assert.deepEqual(BOT_PROFILES.map((p) => p.subs), [70, 75, 65, 75, 70, 70, 65, 75]);
  BOT_PROFILES.forEach((p, i) => assert.equal(p.subs, p.runs === 'MANY' ? 75 : p.runs === 'FEW' ? 65 : 70, `profil ${i} (${p.press}, ${p.runs})`));
});
test('indlæsning: et gemt hold uden grænse får SIN profils (ikke altid 70 / dit holds), og en ugyldig grænse klemmes', () => {
  const L = createLeague(createRng(9));
  for (const t of L.teams) delete t.subsLimit;
  normalizeLeague(L);
  assert.deepEqual(L.teams.map((t) => t.subsLimit), [70, 75, 65, 75, 70, 70, 65, 75]);
  L.teams[1].subsLimit = 99; L.teams[2].subsLimit = 'abc'; L.teams[3].subsLimit = 12; L.teams[4].subsLimit = 0; L.teams[5].subsLimit = 62.4;
  normalizeLeague(L);
  assert.deepEqual(L.teams.slice(1, 6).map((t) => t.subsLimit), [85, 70, 50, 0, 62]);
});
test('en bots Hvis-Så-skift er ikke dit "taktik"-skift; og kun planlagte startere tæller som "udskiftet" – en indskifter, der selv skiftes ud, gør ikke', () => {
  const { H, A } = arena({ homeLimit: 0, homeBot: true });
  const inP = bench(H).find((p) => p.line === 'MID');
  H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 6, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(H, 6).id, subIn: inP.id }];
  const m = simulateMatch(H, A, stubRng({}));
  const [s] = subs(m);
  assert.ok(s && !s.tactical && !filterEvents(m.events, 'tactic').includes(s));
  // Kæde: starteren ud i 3', hans indskifter ud igen i 6' → kun ÉN udskiftet starter
  const c = arena({ homeLimit: 0 });
  const [b1, b2] = bench(c.H).filter((p) => p.line === 'MID');
  c.H.tactics.conditionalRules = [
    { ruleId: 1, minuteTrigger: 3, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(c.H, 6).id, subIn: b1.id },
    { ruleId: 2, minuteTrigger: 6, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: b1.id, subIn: b2.id }];
  const mc = simulateMatch(c.H, c.A, stubRng({}));
  assert.equal(subs(mc).length, 2);
  assert.equal(mc.events.find((e) => e.label === 'Udskiftninger')?.text, `🔋 [${c.H.name}] Din udskiftede spiller sparede ca. 8 point friskhed til næste runde.`);   // 14 · 0,59 = 8,3 → 8
});

// ---------- v3.16.6 (M1): skade før rotation, og en hvilet spiller forbliver brugt ----------
// Spilfører: "#16 starter i stedet for en træt #10" og straks "#8 er skadet og erstattes af #10". Nu: den skadede erstattes
// først (af den friskeste i kæden), rotationen rører ikke den plads, og den hvilede kommer ikke ind igen.
test('bot med træt plads 6 og skadet plads 7 og ÉN brugbar midtbanespiller på bænken: den skadede erstattes, den trætte spiller', () => {
  const { H, A } = arena({ homeLimit: 0, homeBot: true });
  slot(H, 6).freshness = 60; slot(H, 7).injuryMatchesLeft = 2;
  const mids = bench(H).filter((p) => p.line === 'MID');
  mids.forEach((p, i) => { p.freshness = 100; if (i > 0) p.injuryMatchesLeft = 3; });
  const m = simulateMatch(H, A, stubRng({}), { liveEnergy: false });
  const lines = m.events.filter((e) => e.type === 'LINEUP').map((e) => e.text);
  assert.ok(mids.length >= 2, 'data: to midtbanespillere på bænken (den ene skadet)');
  assert.ok(lines.includes(`📋 [${H.name}] ${tag(slot(H, 7))} er skadet og erstattes i startopstillingen af ${tag(mids[0])}.`), lines.join(' | '));
  assert.ok(!lines.some((t) => t.includes('starter i stedet for en træt')), `ingen hvile – bænken er brugt: ${lines.join(' | ')}`);
  assert.ok(!lines.some((t) => t.endsWith(`af ${tag(slot(H, 6))}.`)), 'den trætte er aldrig erstatning');
  assert.ok(m.ratings.home.some((e) => e.playerId === slot(H, 6).id), 'den trætte spiller kampen');
});
test('en hvilet spiller er ikke erstatning for en skadet senere i opstillingen (used beholder ham)', () => {
  const { H, A } = arena({ homeLimit: 0, homeBot: true });
  slot(H, 6).freshness = 60; slot(H, 2).injuryMatchesLeft = 2;   // en forsvarsspiller skadet; ingen forsvarsspiller på bænken
  for (const p of bench(H)) { p.freshness = 100; if (p.line !== 'MID') p.injuryMatchesLeft = 3; }
  const m = simulateMatch(H, A, stubRng({}), { liveEnergy: false });
  const lines = m.events.filter((e) => e.type === 'LINEUP').map((e) => e.text);
  assert.ok(lines.some((t) => t.includes(`er skadet og erstattes i startopstillingen af`)), `data: skaden erstattes – ${lines.join(' | ')}`);
  assert.ok(!lines.some((t) => t.endsWith(`af ${tag(slot(H, 6))}.`)), `den trætte/hvilede er aldrig erstatning: ${lines.join(' | ')}`);
});
test('skadeserstatningen er den friskeste i kæden (ikke den første på bænken)', () => {
  const { H, A } = arena({ homeLimit: 0, homeBot: false });
  slot(H, 7).injuryMatchesLeft = 2;
  const mids = bench(H).filter((p) => p.line === 'MID');
  mids.forEach((p, i) => { p.freshness = i === mids.length - 1 ? 95 : 70; });
  const m = simulateMatch(H, A, stubRng({}), { liveEnergy: false });
  assert.ok(mids.length >= 2);
  assert.ok(m.events.some((e) => e.text === `📋 [${H.name}] ${tag(slot(H, 7))} er skadet og erstattes i startopstillingen af ${tag(mids.at(-1))}.`), m.events.filter((e) => e.type === 'LINEUP').map((e) => e.text).join(' | '));
});
test('en hvilet spiller kommer heller ikke ind i kampen: skade i 3. minut med kun den hvilede på bænken → ingen indskiftning af ham', () => {
  const { H, A } = arena({ homeLimit: 0, homeBot: true });
  slot(H, 6).freshness = 60;
  const mids = bench(H).filter((p) => p.line === 'MID');
  for (const p of bench(H)) { p.freshness = 100; if (p !== mids[0]) p.injuryMatchesLeft = 3; }
  // Første tick: frispark (0,06) til hjemmeholdets offer (0,5 → H, int → plads 1), skade (0,4)
  const m = simulateMatch(H, A, stubRng({ 0.06: (n) => n === 0, 0.5: (n) => n === 0, 0.4: (n) => n === 0 }), { liveEnergy: false });
  const lines = m.events.filter((e) => e.type === 'LINEUP').map((e) => e.text);
  assert.ok(lines.includes(`📋 [${H.name}] ${tag(mids[0])} starter i stedet for en træt ${tag(slot(H, 6))}.`), `data: rotationen – ${lines.join(' | ')}`);
  assert.ok(m.events.some((e) => e.type === 'INJURY' && e.min === 3), `data: skaden i 3' – ${m.events.filter((e) => e.min === 3).map((e) => e.type).join()}`);
  assert.ok(!m.events.some((e) => e.type === 'SUB' && e.label?.startsWith(`🔄 ${tag(slot(H, 6))} ind`)), m.events.filter((e) => e.type === 'SUB').map((e) => e.label).join(' | '));
});

// ---------- v3.16.6 (M6): botternes træthedsskift fra pausen, og ét skift + én pause gemt til skade indtil 75' ----------
// Alle markspillere starter på 74 % med grænse 75: de er under grænsen fra første minut. Bænken er frisk.
function tiredMatch({ homeBot, script = {} }) {
  const { H, A } = arena({ homeLimit: 75, homeBot });
  for (const p of H.squad) p.freshness = H.tactics.lineupSlots.includes(p.id) && p.line !== 'GK' ? 74 : 89;   // bænk 89 < 90: ingen rotation før kampen (grænse + 15)
  const m = simulateMatch(H, A, stubRng(script));
  const subs = m.events.filter((e) => e.type === 'SUB' && e.isHome);
  return { H, m, subs, fatigue: subs.filter((e) => !/Skadesskift/.test(e.text)) };
}
test('bot: ingen træthedsskift før pausen, selv om alle er under grænsen – dit hold med samme grænse skifter før', () => {
  const bot = tiredMatch({ homeBot: true }), mine = tiredMatch({ homeBot: false });
  assert.ok(bot.fatigue.length >= 3, `data: botten skifter (${bot.fatigue.map((e) => e.min).join()})`);
  assert.equal(bot.fatigue.filter((e) => e.min < 45).length, 0, bot.fatigue.map((e) => e.min).join());
  assert.ok(bot.fatigue.some((e) => e.min === 45), 'pausen tæller med');
  assert.ok(mine.fatigue.some((e) => e.min < 45), `dit hold følger kun grænsen: ${mine.fatigue.map((e) => e.min).join()}`);
});
test('bot: før 75\' bruges højst 4 træthedsskift og 2 skifte-pauser (én af hver gemt til skade); efter 75\' må resten bruges', () => {
  const { fatigue } = tiredMatch({ homeBot: true });
  const before = fatigue.filter((e) => e.min < 75), windows = new Set(before.filter((e) => e.min !== 45).map((e) => e.min));
  assert.ok(before.length === 4, `før 75': ${before.map((e) => e.min).join()} (5 uden reserven)`);
  assert.ok(windows.size <= 1, `pauser før 75' (pausen 45' tæller ikke): ${[...windows].join()}`);
  assert.deepEqual(fatigue.map((e) => e.min), [45, 45, 45, 48, 75], 'det femte i præcis 75\' (until 75, ikke 78 og ikke <=)');
});
test('bot: skifte-pausen gemmes til skaden – skader i 51\' og 60\' og en træt i 63\': den trætte venter, skaden i 72\' får en indskiftning', () => {
  // Uden pause-reserven (keep.windows 0) tager træthedsskiftet i 63' den tredje pause, og skaden i 72' må spille videre haltende
  const { H, A } = arena({ homeLimit: 75, homeBot: true });
  slot(H, 6).freshness = 86;
  for (const p of bench(H)) p.freshness = 89;   // < 90: ingen rotation før kampen
  const m = simulateMatch(H, A, stubRng({ 0.06: (n) => n === 16 || n === 19 || n === 23, 0.5: true, 0.4: true }));
  const home = m.events.filter((e) => e.isHome && (e.type === 'SUB' || e.type === 'INJURY' || /Ingen indskiftning/.test(e.text ?? ''))).map((e) => `${e.min}:${e.type}`);
  assert.deepEqual(home, ['51:INJURY', '51:SUB', '60:INJURY', '60:SUB', '72:INJURY', '72:SUB'], home.join(' '));
});
test('rotation (TM v3.16.6): to trætte i samme kæde og ÉN frisk på bænken → kun én rotation, ingen spiller to gange i opstillingen', () => {
  const { H, A } = arena({ homeLimit: 0, homeBot: true });
  slot(H, 6).freshness = 60; slot(H, 7).freshness = 60;
  const mids = bench(H).filter((p) => p.line === 'MID');
  mids.forEach((p, i) => { p.freshness = 100; if (i > 0) p.injuryMatchesLeft = 3; });
  const m = simulateMatch(H, A, stubRng({}), { liveEnergy: false });
  const rot = m.events.filter((e) => e.type === 'LINEUP' && e.text.includes('starter i stedet for en træt'));
  const ids = m.ratings.home.filter((e) => e.minIn <= 1).map((e) => e.playerId);
  assert.equal(rot.length, 1, rot.map((e) => e.text).join(' | '));
  assert.equal(new Set(ids).size, ids.length, 'ingen dublet');
  assert.equal(ids.length, 11);
});
test('skadeserstatning (TM v3.16.6): lige friske i kæden → den bedste (avgSkill) vælges', () => {
  const { H, A } = arena({ homeLimit: 0, homeBot: false });
  slot(H, 7).injuryMatchesLeft = 2;
  const mids = bench(H).filter((p) => p.line === 'MID');
  mids.forEach((p, i) => { p.freshness = 100; p.skills = SK(i === mids.length - 1 ? 11 : 10); });
  const m = simulateMatch(H, A, stubRng({}), { liveEnergy: false });
  assert.ok(mids.length >= 2);
  assert.ok(m.events.some((e) => e.text === `📋 [${H.name}] ${tag(slot(H, 7))} er skadet og erstattes i startopstillingen af ${tag(mids.at(-1))}.`), m.events.filter((e) => e.type === 'LINEUP').map((e) => e.text).join(' | '));
});
test('bot: med én skade (51\') må træthedsskiftet i 63\' tage pause 2 af 3 – kun den sidste pause gemmes (keep.windows 1, ikke 2)', () => {
  const { H, A } = arena({ homeLimit: 75, homeBot: true });
  slot(H, 6).freshness = 86;
  for (const p of bench(H)) p.freshness = 89;
  const m = simulateMatch(H, A, stubRng({ 0.06: (n) => n === 16, 0.5: true, 0.4: true }));
  const home = m.events.filter((e) => e.isHome && (e.type === 'SUB' || e.type === 'INJURY')).map((e) => `${e.min}:${e.type}`);
  assert.deepEqual(home, ['51:INJURY', '51:SUB', '63:SUB'], home.join(' '));
});
