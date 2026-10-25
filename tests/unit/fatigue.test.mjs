// v3.13: friskhed i kampen og udskiftninger (brugeren: "Friskhed skal ændre sig i løbet af kampen, ellers
// en stamina ikke så vigtig en evne"; grænsen gælder "uanset hvor langt man er kommet i kampen";
// antallet "som udgangspunkt følge FIFA/UEFAs regler"). Her er friskheden i kampen slået TIL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { runProfile } from '../../public/engine/ratings.js';
import { drainFactor, clampSubsLimit, SUBS_LIMIT } from '../../public/engine/freshness.js';
import { MATCH_RULES } from '../../public/engine/match-rules.js';
import { normalizeLeague, normalizeRule } from '../../public/engine/sanitize.js';
import { filterEvents } from '../../public/ui/matchcenter.js';

// next() konstant, ingen scriptede chancer → ingen skud, frispark eller skader: kun tiden går.
function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return { next: () => nextValue, int: (a) => a, pick: (arr) => arr[0],
    chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(n) : !!s; } };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
function arena({ homeLimit = 70, awayLimit = 0, homeBot = false } = {}) {
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
  H.subsLimit = homeLimit; A.subsLimit = awayLimit; if (homeBot) H.isBot = true;
  return { L, H, A };
}
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const bench = (t) => t.squad.filter((p) => !t.tactics.lineupSlots.includes(p.id));
const subs = (m, home = true) => m.events.filter((e) => e.type === 'SUB' && e.isHome === home);

// ---------- Tabet i kampen ----------
// CM (grund-km 11,8) på mellemblok/Normal: 11,8 · (2,2 − 0,08·STA): STA 6 → 20,3, STA 10 → 16,5, STA 16 → 10,9.
// Før v3.13 regnede kampen intet tab, og km-prisen ændrede sig næsten ikke med STA (15 mod 13).
test('tabet i kampen: CM med STA 6 taber ≈ 20 point på 90 min, STA 16 ≈ 11 – km90 bærer ikke STA-leddet', () => {
  const team = { tactics: { phases: { phase1_buildUp: { offBallRuns: 'NORMAL' }, phase2_defending: { pressingHeight: 'MID_BLOCK' }, phase3_transition: { onBallLost: 'DROP_BACK' } } } };
  const d = (sta) => runProfile({ line: 'MID', skills: { stamina: sta, pace: 10 } }, team, createRng(1), 'CM').drain90;
  assert.ok(Math.abs(d(6) - 20.296) < 1e-9, String(d(6)));
  assert.ok(Math.abs(d(10) - 16.52) < 1e-9, String(d(10)));
  assert.ok(Math.abs(d(16) - 10.856) < 1e-9, String(d(16)));
  assert.equal(drainFactor(30), 0.3, 'bunden IN_MATCH_MIN');
});

// ---------- Friskheden i kampen virker i spillet ----------
// Skud i hvert tick (0,3), skytten alene i feltet; rul 0,5 → FIN·ff + 4 mod MV·ff + 4 + 0,3 (v3.15.1; før + 3 mod MV 8,5).
// Uden tab: 16 > 15,6 (MV 11,3) hele kampen → 30 mål (kanten 3 giver 0 – rødt). Med tab bliver skytten svagere minut for minut (STA 2 hurtigere end STA 18), mens målmanden
// taber mindre (grund-km 5,5). Mutationen "ff → freshFactor" eller TIRED_PER_POINT 0 giver 30 og 30 – rødt.
test('friskheden falder i kampen: en lav-STA skytte scorer færre sene mål end en høj-STA – uden tab scorer begge alle', () => {
  const run = (sta, live = true) => {
    const { H, A } = arena({ homeLimit: 0 });
    H.tactics.customCoords = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }]));
    Object.assign(slot(H, 9).skills, { finishing: 12, stamina: sta });
    for (const p of A.squad.slice(5, 9)) p.skills.intercepting = 1;
    slot(A, 0).skills.goalkeeping = 11.3;
    const m = simulateMatch(H, A, stubRng({ 0.48: true, 0.3: true }), live ? {} : { liveEnergy: false });
    return { goals: m.homeGoals, last: Math.max(0, ...m.events.filter((e) => e.type === 'GOAL' && e.isHome).map((e) => e.min)) };
  };
  const off = run(2, false), low = run(2), high = run(18);
  assert.equal(off.goals, 30, 'uden tab: 12 + 4 > 11,3 + 4 + 0,3 hele kampen');
  assert.ok(low.goals < high.goals && low.goals < off.goals, `STA 2 ${low.goals}, STA 18 ${high.goals}`);
  assert.ok(low.last < high.last, `sidste mål ${low.last}' mod ${high.last}'`);
});

// ---------- Træthedsskift ----------
// CM (plads 6) starter på 75 %, STA 1: tab 11,8 · 2,12 = 25,0 på 90 min → under 70 % efter 18 min → første tick
// derefter er 21'. Skiftet sker før pausen (brugeren: grænsen gælder hele kampen; v3.13-planens 46' er droppet).
test('træthedsskift: under din grænse skiftes han ud i det første tick (også før pausen), ind kommer den bedste friske i samme kæde', () => {
  const { H, A } = arena();
  const cm = slot(H, 6); cm.freshness = 75; cm.skills.stamina = 1;
  const mids = bench(H).filter((p) => p.line === 'MID');
  mids.forEach((p, i) => { p.skills = SK(8 + i); p.freshness = 100; });
  const best = mids.at(-1);
  const m = simulateMatch(H, A, stubRng({}));
  const [s] = subs(m);
  assert.ok(s, 'et skift');
  assert.equal(s.min, 21);
  assert.equal(s.text, `🔄 [${H.name}] #${cm.shirtNumber} ${cm.shortName} ud (træt, 69 % – under din grænse 70 %) – #${best.shirtNumber} ${best.shortName} ind.`);   // 69,4 rundet ned
  const inE = m.ratings.home.find((e) => e.playerId === best.id), outE = m.ratings.home.find((e) => e.playerId === cm.id);
  assert.deepEqual([outE.minOut, inE.minIn, inE.slot], [21, 21, 6]);
  // Sparet friskhed: km90 11,8·(0,9 + 0,01)·1 = 10,738; 69 min ikke løbet → 8,23 km · (1,5 − 0,03) = 12,1 → 12 i pris;
  // efter restitutionen (41 % af det manglende) 12 · 0,59 = 7,1 → 7 (QC: før stod 12)
  assert.equal(m.events.find((e) => e.label === 'Udskiftninger')?.text, `🔋 [${H.name}] Din udskiftede spiller sparede ca. 7 point friskhed til næste runde.`);
});
test('grænse Fra (0): ingen træthedsskift; grænsen 65 rammes senere end 70', () => {
  const at = (limit) => { const { H, A } = arena({ homeLimit: limit }); const cm = slot(H, 6); cm.freshness = 75; cm.skills.stamina = 1; return subs(simulateMatch(H, A, stubRng({})))[0]?.min ?? null; };
  assert.equal(at(0), null);
  assert.equal(at(70), 21);
  assert.equal(at(65), 39);   // 10 point: 36 min → 37 → første tick 39
});
test('målmanden skiftes ikke for træthed – heller ikke under grænsen fra start', () => {
  const { H, A } = arena({ homeLimit: 85 });
  slot(H, 0).freshness = 60;
  for (const b of bench(H)) b.freshness = 100;
  const m = simulateMatch(H, A, stubRng({}));
  assert.equal(m.ratings.home.find((e) => e.playerId === slot(H, 0).id).minOut, 90);
  assert.ok(subs(m).length > 0, 'markspillerne under 85 % skiftes (data)');
});

// ---------- Pauser og antal (match-rules.js) ----------
// Alle ti markspillere under grænsen fra start; bænken har 6 friske markspillere: 5 skift i 3. minut = én pause,
// resten får en besked om hvorfor.
test('højst MATCH_RULES.maxSubs (5) skift – højst 3 ad gangen (v3.15); dit hold får at vide, hvorfor resten ikke skiftes', () => {
  const { H, A } = arena({ homeLimit: 80 });
  for (let i = 1; i <= 10; i++) slot(H, i).freshness = 60;
  for (const b of bench(H)) b.freshness = 100;
  const m = simulateMatch(H, A, stubRng({}));
  const s = subs(m);
  assert.equal(s.length, MATCH_RULES.maxSubs);
  // v3.15: højst 3 ad gangen – 3 i 3. minut, de 2 sidste i næste tick (to pauser)
  assert.deepEqual(s.map((e) => e.min), [3, 3, 3, 6, 6]);
  const why = m.events.filter((e) => e.label === 'Udskiftning ikke mulig' && e.isHome);
  assert.ok(why.some((e) => /højst 3 træthedsskift ad gangen – han må vente til en senere skifte-pause \(\d skift tilbage\)\.$/.test(e.text)), 'besked om loftet');
  assert.ok(why.length >= 1 && why.every((e) => /er under din udskiftningsgrænse \(\d+ % – grænse 80 %\), men (alle 5 udskiftninger er brugt|der er ingen frisk \w+ på bænken|højst 3 træthedsskift ad gangen – (han må vente til en senere skifte-pause \(\d skift tilbage\)|og alle \d (udskiftninger|skifte-pauser) er brugt))\.$/.test(e.text)), why.map((e) => e.text).join(' | '));
});
test('pauserne binder: fire trætte i hver sit tick – 3 pauser bruges, den fjerde får besked om pauserne', () => {
  // STA 1, tab pr. min: CM 0,278, CB 0,224, ST 0,236. CM 71 → 6'; CB 78 → 39'; CM 87 → 63'; ST 90 → 87' (i 90' skiftes ikke). Ved hver
  // tidligere pause står de næste over grænsen + 5 (ingen samling). Bænken har to i hver kæde. Fjerde gang: pauserne er brugt.
  const { H, A } = arena();
  [[6, 71], [2, 78], [7, 87], [9, 90]].forEach(([i, f]) => { const p = slot(H, i); p.freshness = f; p.skills.stamina = 1; });
  for (const b of bench(H)) b.freshness = 100;
  const m = simulateMatch(H, A, stubRng({}));
  const windows = new Set(subs(m).map((e) => e.min).filter((x) => x !== 45));
  assert.deepEqual([...windows], [6, 39, 63]);
  assert.ok(m.events.some((e) => e.label === 'Udskiftning ikke mulig' && /alle 3 skifte-pauser er brugt/.test(e.text)), m.events.filter((e) => e.label === 'Udskiftning ikke mulig').map((e) => e.text).join(' | '));
});
test('samling i pausen: når en pause bruges, tages også en spiller med, der højst er 5 over grænsen – ikke en 6 over', () => {
  const run = (second) => {
    const { H, A } = arena();
    slot(H, 5).freshness = 69;            // under 70 fra start → skift i 3'
    const p = slot(H, 7); p.freshness = second;
    for (const b of bench(H)) b.freshness = 100;
    const m = simulateMatch(H, A, stubRng({}));
    return subs(m).filter((e) => e.min === 3).map((e) => e.text);
  };
  const near = run(74.9), far = run(76);
  assert.equal(near.length, 2); assert.match(near[1], /tages med i samme skifte-pause/);   // v3.16.7 (i 45': "tages med i pausen")
  assert.equal(far.length, 1);
});

// ---------- Anti-spionage (§3) ----------
test('en bots skift nævner aldrig friskhed, grænse eller træthed – kun hvem der erstatter hvem', () => {
  const { H, A } = arena({ homeLimit: 70, homeBot: true });
  slot(H, 6).freshness = 69;
  for (const b of bench(H)) b.skills = SK(7);   // > 2 svagere: botten hviler ham ikke før kampen, men skifter i kampen
  const m = simulateMatch(H, A, stubRng({}));
  const [s] = subs(m);
  assert.match(s.text, /^🔄 \[.+\] #\d+ .+ erstatter #\d+ .+\.$/);
  assert.doesNotMatch(s.text, /træt|%|grænse/);
  assert.equal(m.events.filter((e) => e.label === 'Udskiftning ikke mulig').length, 0);
});

// ---------- Holdets grænse i data ----------
test('subsLimit: 0 = fra bevares; ukendt → holdets profil (dit hold 70); klemt 50–85', () => {
  assert.deepEqual([clampSubsLimit(0), clampSubsLimit('0'), clampSubsLimit(40), clampSubsLimit(95), clampSubsLimit(72), clampSubsLimit(undefined)], [0, 0, 50, 85, 72, SUBS_LIMIT.def]);
  const L = createLeague(createRng(2));
  assert.equal(L.teams[0].subsLimit, 70);
  assert.ok(L.teams.slice(1).every((t) => [65, 70, 75].includes(t.subsLimit)));
  const raw = JSON.parse(fs.readFileSync(new URL('../fixtures/save-v3.12.0.json', import.meta.url), 'utf8')).league;
  assert.ok(raw.teams.every((t) => t.subsLimit === undefined), 'gemt før v3.13');
  normalizeLeague(raw);
  assert.equal(raw.teams[0].subsLimit, 70);
  raw.teams[0].subsLimit = 0; normalizeLeague(raw);
  assert.equal(raw.teams[0].subsLimit, 0, 'Fra overlever en ny indlæsning');
});
test('spillet sender aldrig liveEnergy: false – kun test-arenaerne gør', () => {
  for (const f of ['season.js', 'match.js']) assert.doesNotMatch(fs.readFileSync(new URL(`../../public/engine/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''), /liveEnergy\s*:\s*false/);
});

// ---------- Manuelle Hvis-Så-skift (v3.13) ----------
const subRule = (t, outSlot, inP, o = {}) => ({ ruleId: 9, minuteTrigger: 60, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(t, outSlot).id, subIn: inP.id, ...o });
test('Hvis-Så-udskiftning: "uanset stilling" fra minut 60 → X ud, Y ind i første tick fra minuttet; tæller som skift og står i "Kun taktik"', () => {
  for (const [minute, want] of [[60, 60], [61, 63]]) {
    const { H, A } = arena({ homeLimit: 0 });
    const inP = bench(H).find((p) => p.line === 'MID');
    H.tactics.conditionalRules = [subRule(H, 6, inP, { minuteTrigger: minute })];
    const m = simulateMatch(H, A, stubRng({}));
    const [s] = subs(m);
    assert.equal(s.min, want);
    assert.equal(s.text, `🔄 [${H.name} • Hvis-Så] #${slot(H, 6).shirtNumber} ${slot(H, 6).shortName} ud – #${inP.shirtNumber} ${inP.shortName} ind (din Hvis-Så-regel).`);   // v3.16.3: minuttet står ved linjen (s.min ovenfor), ikke i teksten
    assert.equal(m.ratings.home.find((e) => e.playerId === inP.id).slot, 6);
    assert.ok(filterEvents(m.events, 'tactic').includes(s), 'dit skift står under "Kun taktik"');
  }
});
test('Hvis-Så-udskiftning: betingelsen gælder (bagud ved 0-0 → intet skift), og kan den ikke udføres, får du at vide hvorfor', () => {
  const { H, A } = arena({ homeLimit: 0 });
  const inP = bench(H).find((p) => p.line === 'MID');
  H.tactics.conditionalRules = [subRule(H, 6, inP, { condition: 'TRAILING' })];
  assert.equal(subs(simulateMatch(H, A, stubRng({}))).length, 0);
  // Spilleren, der skulle ud, står på bænken (byttet i Trup efter reglen blev lavet)
  const b = arena({ homeLimit: 0 });
  const inQ = bench(b.H).find((p) => p.line === 'MID'), other = bench(b.H).find((p) => p.line === 'DEF');
  b.H.tactics.conditionalRules = [{ ...subRule(b.H, 6, inQ), subOut: other.id }];
  const m = simulateMatch(b.H, b.A, stubRng({}));
  assert.equal(subs(m).length, 0);
  const note = m.events.find((e) => e.label === 'Hvis-Så-skift ikke udført');
  // v3.16.3: minuttet står ved linjen (note.min), ikke i teksten
  assert.deepEqual([note?.min, note?.text], [60, `📋 [${b.H.name} • Hvis-Så] Udskiftningen kunne ikke udføres: #${other.shirtNumber} ${other.shortName} er ikke på banen.`]);
});
test('en bænkspiller i dine Hvis-Så-regler bruges ikke til træthedsskift – reglen kan stadig udføres bagefter', () => {
  const { H, A } = arena();
  const cm = slot(H, 6); cm.freshness = 75; cm.skills.stamina = 1;           // træt i 21'
  const mids = bench(H).filter((p) => p.line === 'MID');
  mids.forEach((p, i) => { p.skills = SK(8 + i); p.freshness = 100; });
  const best = mids.at(-1), other = mids[0];
  H.tactics.conditionalRules = [subRule(H, 7, best)];                     // den bedste er reserveret til 60'
  const m = simulateMatch(H, A, stubRng({}));
  const [first, second] = subs(m);
  assert.equal(first.min, 21); assert.ok(first.text.includes(`#${other.shirtNumber} ${other.shortName} ind`), first.text);
  assert.equal(second.min, 60); assert.ok(second.text.includes(`#${best.shirtNumber} ${best.shortName} ind (din Hvis-Så-regel`), second.text);
});
test('en bots Hvis-Så-udskiftning er neutral; gamle regler bliver planskift, "uanset stilling" og udskiftning overlever indlæsning', () => {
  const { H, A } = arena({ homeLimit: 0, homeBot: true });
  const inP = bench(H).find((p) => p.line === 'MID');
  H.tactics.conditionalRules = [subRule(H, 6, inP)];
  const [s] = subs(simulateMatch(H, A, stubRng({})));
  assert.match(s.text, /^🔄 \[[^•\]]+\] #\d+ .+ erstatter #\d+ .+\.$/);
  assert.deepEqual(normalizeRule({ condition: 'LEADING', margin: 1, newFormation: '5-4-1', newPlan: null }).action, 'SHIFT');
  const r = normalizeRule({ condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, action: 'SUB', subOut: 'a', subIn: 'b' });
  assert.deepEqual([r.condition, r.action, r.subOut, r.subIn], ['ANY', 'SUB', 'a', 'b']);
  assert.equal(normalizeRule({ condition: 'X', action: 'HACK', subOut: 3 }).action, 'SHIFT');
});

test('beskeder med årsag: reserveret bænkspiller nævnes som Hvis-Så; skade uden indskiftning siger hvorfor; intet træthedsskift i sidste tick', () => {
  // Reserveret: CM træt i 21', eneste friske MID på bænken står i en regel → beskeden siger det (QC D)
  const { H, A } = arena();
  const cm = slot(H, 6); cm.freshness = 75; cm.skills.stamina = 1;
  const mids = bench(H).filter((p) => p.line === 'MID');
  mids.forEach((p, i) => { p.freshness = i === 0 ? 100 : 50; });
  H.tactics.conditionalRules = [subRule(H, 7, mids[0], { minuteTrigger: 85 })];
  const m = simulateMatch(H, A, stubRng({}));
  assert.ok(m.events.some((e) => e.label === 'Udskiftning ikke mulig' && e.text.endsWith('men den friske midtbanespiller på bænken er sat til en af dine Hvis-Så-regler.')), m.events.filter((e) => e.label === 'Udskiftning ikke mulig').map((e) => e.text).join(' | '));
  // Skade efter 5 brugte skift: årsagen står i teksten (QC C)
  const b = arena({ homeLimit: 80 });
  for (let i = 1; i <= 10; i++) slot(b.H, i).freshness = 60;
  for (const p of bench(b.H)) p.freshness = 100;
  let flip = false;
  const rng = stubRng({ 0.06: (n) => n === 3, 0.4: true, 0.5: () => (flip = true) });
  const mi = simulateMatch(b.H, b.A, rng);
  const lame = mi.events.find((e) => e.label === 'Ingen indskiftning');
  assert.ok(lame && /Ingen indskiftning mulig \((alle 5 udskiftninger er brugt|der er ingen rask spiller på bænken)\) – holdet spiller videre/.test(lame.text), lame?.text);
  // Sidste tick: en spiller, der først krydser grænsen i 90', skiftes ikke (QC F)
  const c = arena();
  const late = slot(c.H, 6); late.skills.stamina = 1; late.freshness = 70 + 25.0 * 88 / 90;   // krydser lige før 90'
  assert.ok(subs(simulateMatch(c.H, c.A, stubRng({}))).every((e) => e.min < 90));
});
