import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { FORMATIONS, FORMATION_NAMES, MAX_ANCHOR_RADIUS, isOutOfZone, clampPos, lineOfRole } from '../../public/engine/formations.js';
import { createLeague, aerialBreakdown, rollStat, TEAM_NAMES } from '../../public/engine/generator.js';
import { viewPlayer, canSeeField, viewRatingEntry } from '../../public/engine/visibility.js';
import { initialCounterTactics, opponentTacticKeys, masteryVs, counterXpForMatch, applyCounterXp } from '../../public/engine/counter.js';
import { starsFromRating, createSheet, finalizeSheet } from '../../public/engine/ratings.js';
import { describeFinish, describeHeader, describeVarTiming, generateScoutingClues } from '../../public/engine/clues.js';
import { simulateMatch, MAX_SUBS } from '../../public/engine/match.js';
import { playRound, commitRound, pairRound, SCOUTING_PER_PLAYER } from '../../public/engine/season.js';
import { normalizeLeague } from '../../public/engine/sanitize.js';

const league = (seed = 1) => createLeague(createRng(seed));
const phases = (pass, focus, press, trap) => ({ tactics: { baseFormation: '4-4-2', phases: { phase1_buildUp: { passingStyle: pass, attackFocus: focus }, phase2_defending: { pressingHeight: press, offsideTrap: trap } } } });

// ---------- Formationer ----------
test('10 formationer med 11 pladser, målmand på plads 0', () => {
  assert.equal(FORMATION_NAMES.length, 10);
  for (const f of FORMATION_NAMES) {
    assert.equal(FORMATIONS[f].length, 11, f);
    assert.equal(FORMATIONS[f][0].r, 'GK', f);
    assert.equal(FORMATIONS[f].filter((s) => s.r === 'GK').length, 1, f);
  }
  assert.equal(lineOfRole('LWB'), 'DEF'); assert.equal(lineOfRole('CAM'), 'MID'); assert.equal(lineOfRole('ST'), 'ATT');
});

test('anker-radius: præcis 28 er inden for zonen, lige over er ude', () => {
  assert.equal(MAX_ANCHOR_RADIUS, 28);
  const a = FORMATIONS['4-4-2'][5]; // LM 15,45
  const t = (dx) => ({ baseFormation: '4-4-2', customCoords: { 5: { x: a.x + dx, y: a.y } } });
  assert.equal(isOutOfZone(t(28), 5), false);
  assert.equal(isOutOfZone(t(28.1), 5), true);
  assert.deepEqual(clampPos({ x: 0, y: 100 }), { x: 8, y: 82 });
});

// ---------- Generator ----------
test('ny liga: 8 hold × 18 spillere, unikke kortnavne pr. hold, dit hold først', () => {
  const L = league();
  assert.equal(L.teams.length, 8);
  assert.deepEqual(L.teams.map((t) => t.name), TEAM_NAMES);
  assert.equal(L.teams[0].isBot, false);
  assert.equal(L.teams.filter((t) => t.isBot).length, 7);
  for (const t of L.teams) {
    assert.equal(t.squad.length, 18);
    assert.equal(new Set(t.squad.map((p) => p.shortName)).size, 18, t.name);
    assert.equal(t.tactics.lineupSlots.length, 11);
    assert.equal(t.tacticPresets.length, 3);
    assert.equal(t.cashBalance, 5000000);
  }
  assert.equal(L.leagueMetadata.standings.length, 8);
});

test('spillernes værdier ligger i kildens intervaller', () => {
  const L = league(7);
  const all = L.teams.flatMap((t) => t.squad);
  const ranges = { STAR: [24, 28], TALENT: [17, 19], ROTATION: [21, 28], STARTER: [21, 27] };
  for (const p of all) {
    const [lo, hi] = ranges[p.roleTier];
    assert.ok(p.age >= lo && p.age <= hi, `${p.roleTier} alder ${p.age}`);
    if (p.line === 'GK' || p.line === 'DEF') assert.ok(p.heightCm >= 181 && p.heightCm <= 198);
    else assert.ok(p.heightCm >= 172 && p.heightCm <= 195);
    for (const v of Object.values(p.skills)) assert.ok(v >= 1 && v <= 20);
    assert.ok(p.varProfile.cynicism >= 4 && p.varProfile.theatre >= 3);
    const sum = Object.values(p.skills).reduce((a, b) => a + b, 0);
    assert.equal(p.weeklyWage, sum * sum * 10);
    assert.equal(p.marketValue, sum * sum * 150);
    if (p.line !== 'GK') assert.ok(p.skills.goalkeeping <= 2);
  }
  // Truppens opbygning: #1 og #12 er målmænd, #4 og #8 er stjerner
  const s = L.teams[0].squad;
  assert.equal(s[0].line, 'GK'); assert.equal(s[11].line, 'GK');
  assert.equal(s[3].roleTier, 'STAR'); assert.equal(s[7].roleTier, 'STAR');
});

test('luftduel-formlen: 193 cm, spring 16, styrke 12, position 13 giver 16 (faktor 0,65 ville give 15)', () => {
  const b = aerialBreakdown(193, 16, 12, 13);
  assert.equal(b.heightScore, 18); // round(25 × 0,70 = 17,5)
  assert.equal(b.total, 16);       // 6,30 + 5,60 + 1,80 + 1,95 = 15,65
  assert.equal(aerialBreakdown(160, 10, 10, 10).heightScore, 1);
  assert.equal(aerialBreakdown(205, 10, 10, 10).heightScore, 20);
});

test('rollStat er klemt til 1–20', () => {
  const r = createRng(2);
  for (let i = 0; i < 500; i++) { const v = rollStat(r, -5, 30); assert.ok(v >= 1 && v <= 20); }
});

test('samme seed giver samme liga og samme kamp', () => {
  assert.deepEqual(league(5), league(5));
  assert.notDeepEqual(league(5).teams[0].squad[0], league(6).teams[0].squad[0]);
  const L1 = league(5), L2 = league(5);
  assert.deepEqual(simulateMatch(L1.teams[0], L1.teams[1], createRng(9)), simulateMatch(L2.teams[0], L2.teams[1], createRng(9)));
});

// ---------- Synlighed ----------
test('synlighed: modstander ser kun offentlige felter, ejer aldrig VAR-profilen', () => {
  const p = league().teams[1].squad[0];
  const opp = viewPlayer(p, false), own = viewPlayer(p, true);
  for (const f of ['skills', 'jumpingPower', 'aerialPower', 'archetype', 'marketValue', 'counterTactics', 'lastRating', 'varProfile']) assert.equal(f in opp, false, f);
  assert.equal(opp.heightCm, p.heightCm); assert.equal(opp.shortName, p.shortName);
  assert.deepEqual(own.skills, p.skills);
  assert.equal('varProfile' in own, false);
  assert.equal(canSeeField('heightCm', false), true);
  assert.equal(canSeeField('skills', false), false);
  assert.equal(canSeeField('skills', true), true);
  assert.equal(canSeeField('varProfile', true), false);
});

// ---------- Mod-kunnen ----------
test('mod-kunnen: startværdier 12–75 og modstanderens stilart', () => {
  const r = createRng(4);
  for (let i = 0; i < 300; i++) for (const v of Object.values(initialCounterTactics(r, 17 + (i % 15), 1 + (i % 20)))) assert.ok(v >= 12 && v <= 75);
  assert.deepEqual([opponentTacticKeys(phases('SHORT', 'CENTRAL', 'HIGH_GEGENPRESS', 'NORMAL')).primary, opponentTacticKeys(phases('SHORT', 'CENTRAL', 'HIGH_GEGENPRESS', 'NORMAL')).secondary], ['vsPress', 'vsPress']);
  assert.equal(opponentTacticKeys(phases('SHORT', 'CENTRAL', 'LOW_BLOCK', 'NORMAL')).primary, 'vsLowBlock');
  assert.equal(opponentTacticKeys(phases('DIRECT_LONG', 'CENTRAL', 'MID_BLOCK', 'NORMAL')).primary, 'vsTrapLong');
  assert.equal(opponentTacticKeys(phases('SHORT', 'CENTRAL', 'HIGH_GEGENPRESS', 'EXTREME_VAR_LINE')).secondary, 'vsTrapLong');
  const p = { counterTactics: { vsPress: 80, vsLowBlock: 10, vsTrapLong: 40 } };
  assert.equal(masteryVs(p, phases('SHORT', 'CENTRAL', 'HIGH_GEGENPRESS', 'EXTREME_VAR_LINE')), 66); // 80·0,65 + 40·0,35
  assert.equal(masteryVs({}, phases('SHORT', 'CENTRAL', 'HIGH_GEGENPRESS', 'NORMAL')), 25);
});

// v3.6 (brugeren: "for hurtigt optjent erfaring"): før gav en hel kamp uden dueller 9 og
// maks. 16; sekundær +60 % og rust −3. Tallene nedenfor er røde mod den gamle formel.
test('mod-XP: 1–5 point; primær +XP, sekundær +50 %, øvrige −1 med aldersbund', () => {
  assert.equal(counterXpForMatch({ minutesPlayed: 90, tacticWins: 0, goals: 0 }), 2);
  assert.equal(counterXpForMatch({ minutesPlayed: 90, tacticWins: 2, goals: 1 }), 4);
  assert.equal(counterXpForMatch({ minutesPlayed: 90, tacticWins: 9, goals: 1 }), 5);
  assert.equal(counterXpForMatch({ minutesPlayed: 10, tacticWins: 0, goals: 0 }), 1);
  const opp = phases('SHORT', 'CENTRAL', 'HIGH_GEGENPRESS', 'EXTREME_VAR_LINE'); // primær vsPress, sekundær vsTrapLong
  assert.deepEqual(applyCounterXp({ vsPress: 50, vsLowBlock: 40, vsTrapLong: 50 }, 30, opp, 4), { vsPress: 54, vsLowBlock: 39, vsTrapLong: 52 });
  assert.deepEqual(applyCounterXp({ vsPress: 50, vsLowBlock: 25, vsTrapLong: 50 }, 30, opp, 4).vsLowBlock, 25); // bund 25 for ≥26 år
  assert.deepEqual(applyCounterXp({ vsPress: 98, vsLowBlock: 12, vsTrapLong: 50 }, 20, opp, 4), { vsPress: 100, vsLowBlock: 12, vsTrapLong: 52 });
  assert.deepEqual(applyCounterXp({ vsPress: 50, vsLowBlock: 40, vsTrapLong: 50 }, 30, opp, 1), { vsPress: 51, vsLowBlock: 39, vsTrapLong: 50 }); // sekundær +50 % af 1 = 0
});

// ---------- Karakterer ----------
test('stjernegrænser 8,35 / 7,25 / 6,15 / 5,15', () => {
  const cases = [[8.35, 5], [8.34, 4], [7.25, 4], [7.24, 3], [6.15, 3], [6.14, 2], [5.15, 2], [5.14, 1], [3.5, 1], [0, 0]];
  for (const [r, s] of cases) assert.equal(starsFromRating(r), s, `karakter ${r}`);
});

test('clean sheet: +0,5 til GK/CB/LB/RB, kun når holdet ikke lukker mål ind', () => {
  const fixed = { next: () => 0.5 }; // startkarakter præcis 6,5
  const mk = () => { const s = createSheet(); const team = { id: 'h', name: 'H', isBot: false };
    s.register({ id: 'gk', shirtNumber: 1, shortName: 'G', line: 'GK' }, team, true, 'GK', 1, fixed, 25);
    s.register({ id: 'st', shirtNumber: 9, shortName: 'S', line: 'ATT' }, team, true, 'ST', 1, fixed, 25); return s; };
  const xp = () => 9;
  const clean = finalizeSheet(mk(), 0, 0, fixed, xp).home, conceded = finalizeSheet(mk(), 0, 1, fixed, xp).home;
  assert.equal(clean.find((e) => e.playerId === 'gk').rating, 7);
  assert.equal(conceded.find((e) => e.playerId === 'gk').rating, 6.5);
  assert.equal(clean.find((e) => e.playerId === 'st').rating, 6.5);
});

test('prosa om skjulte og private evner indeholder aldrig tal', () => {
  for (let v = 1; v <= 20; v++) {
    // Centimeter er tilladt (højde er offentlig, "2 cm på den rigtige side" er prosa); alle andre tal er ikke.
    const noNum = (t) => assert.doesNotMatch(t.replace(/\d+ cm/g, ''), /\d/, t);
    [describeFinish(v), describeHeader(v), describeVarTiming(v)].forEach(noNum);
    generateScoutingClues('A. B', { theatre: v, cynicism: v, varPulse: v }, 192, v).forEach(noNum);
  }
});

// ---------- Kampmotor ----------
function manyMatches(n, seed, pick = (L, i) => [L.teams[0], L.teams[1 + (i % 7)]]) {
  const L = league(seed), rng = createRng(seed + 100);
  return Array.from({ length: n }, (_, i) => { const [h, a] = pick(L, i); return { L, h, a, m: simulateMatch(h, a, rng) }; });
}

test('motoren ændrer aldrig holdene', () => {
  const L = league(3);
  const before = JSON.stringify(L);
  const rng = createRng(1);
  for (let i = 1; i < 8; i++) for (let j = 0; j < 5; j++) simulateMatch(L.teams[0], L.teams[i], rng);
  assert.equal(JSON.stringify(L), before);
});

test('kampresultat hænger sammen: mål = målhændelser, statistik og karakterark', () => {
  for (const { m } of manyMatches(60, 11)) {
    const goalEvents = m.events.filter((e) => ['GOAL', 'HEADER_GOAL', 'VAR_GOAL'].includes(e.type));
    assert.equal(goalEvents.filter((e) => e.isHome).length, m.homeGoals);
    assert.equal(goalEvents.filter((e) => !e.isHome).length, m.awayGoals);
    assert.equal(m.ratings.home.reduce((a, r) => a + r.goals, 0), m.homeGoals);
    assert.ok(m.stats.hOnTarget >= m.homeGoals && m.stats.hShots >= m.stats.hOnTarget);
    assert.ok(m.ratings.home.length >= 11 && m.ratings.home.length <= 11 + MAX_SUBS);
    assert.equal([...m.ratings.home, ...m.ratings.away].filter((r) => r.isMotM).length, 1);
    assert.equal(m.events.at(-1).type, 'END');
    for (const r of [...m.ratings.home, ...m.ratings.away]) assert.ok(r.rating >= 3.5 && r.rating <= 10);
    const evMins = m.events.map((e) => e.min);
    assert.deepEqual(evMins, evMins.slice().sort((a, b) => a - b));
  }
});

test('skade giver indskiftning fra bænken af samme kæde og maks 3 skift', () => {
  let seen = 0;
  for (const { m } of manyMatches(120, 21)) {
    for (const inj of m.injuries) {
      const sub = m.events.find((e) => e.type === 'SUB' && e.min === inj.min);
      if (sub) seen++;
      assert.ok(inj.matches >= 1 && inj.matches <= 3);
    }
    assert.ok(m.events.filter((e) => e.type === 'SUB' && e.isHome).length <= MAX_SUBS);
  }
  assert.ok(seen > 10, `kun ${seen} skadesskift set – testen har for lidt data`);
});

test('maks 3 skift pr. hold, og første skift er fra samme kæde', () => {
  const L = league(22), base = createRng(3);
  // Tving frispark og skade i hvert tick, så der er langt flere skader end skift.
  const rng = { ...base, chance: (p) => (p === 0.06 || p === 0.4 ? true : base.chance(p)) };
  const m = simulateMatch(L.teams[0], L.teams[1], rng);
  assert.ok(m.injuries.length > 8);
  for (const list of [m.ratings.home, m.ratings.away]) {
    const subs = list.filter((r) => r.role.startsWith('SUB'));
    assert.equal(subs.length, MAX_SUBS);
    assert.equal(subs.sort((a, b) => a.minIn - b.minIn)[0].role, `SUB (${subs[0].line})`);
  }
  for (const side of [true, false]) {
    const firstSub = m.events.find((e) => e.type === 'SUB' && e.isHome === side);
    const outInj = m.injuries.find((i) => i.min === firstSub.min && i.teamId === (side ? L.teams[0].id : L.teams[1].id));
    const out = L.teams.flatMap((t) => t.squad).find((p) => p.id === outInj.playerId);
    const inn = (side ? m.ratings.home : m.ratings.away).find((r) => r.minIn === firstSub.min);
    assert.equal(inn.line, out.line, 'indskifteren skal komme fra samme kæde');
  }
});

test('skadet starter spiller ikke – erstattes i den kamplokale opstilling', () => {
  const L = league(4);
  const star = L.teams[0].squad[3];
  star.injuryMatchesLeft = 2;
  const m = simulateMatch(L.teams[0], L.teams[1], createRng(1));
  assert.equal(m.ratings.home.some((r) => r.playerId === star.id), false);
  assert.ok(m.events.some((e) => e.type === 'LINEUP' && e.text.includes(star.shortName)));
  assert.equal(L.teams[0].tactics.lineupSlots[3], star.id, 'lineupSlots må ikke ændres');
});

test('Hvis-Så: slotRemapping flytter spillerne til nye pladser', () => {
  const L = league(9);
  const ids = L.teams[0].tactics.lineupSlots.slice();
  L.teams[0].tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'DRAW', newFormation: '3-4-3', slotRemapping: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10] }];
  const L2 = league(9);
  // Uden skader i kampen er slutopstillingen præcis remap'en af startopstillingen.
  const rng = createRng(2), base = rng;
  const noInj = { ...base, chance: (p) => (p === 0.06 ? false : base.chance(p)) };
  const m = simulateMatch(L.teams[0], L2.teams[1], noInj);
  assert.deepEqual(m.endState.home.starters, [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10].map((i) => ids[i]));
  assert.equal(m.endState.home.formation, '3-4-3');
});

test('Hvis-Så: reglen udløses én gang, for begge hold, og skifter formation', () => {
  const L = league(8);
  for (const t of [L.teams[0], L.teams[1]]) t.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'DRAW', newFormation: '5-4-1', slotRemapping: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }];
  const m = simulateMatch(L.teams[0], L.teams[1], createRng(2));
  const trig = m.events.filter((e) => e.type === 'TRIGGER');
  assert.equal(trig.filter((e) => e.isHome).length, 1);
  assert.equal(trig.filter((e) => !e.isHome).length, 1);
  assert.ok(trig.every((e) => e.min === 3));
  assert.match(trig.find((e) => e.isHome).text, /til 5-4-1/, 'dit eget skift beskrives');
  const opp = trig.find((e) => !e.isHome).text;
  assert.match(opp, /omorganiserer sig/); assert.doesNotMatch(opp, /5-4-1|Hvis-Så|minut/, 'modstanderens regel kan ikke læses');
  assert.equal(m.endState.home.formation, '5-4-1');
  assert.equal(m.endState.away.formation, '5-4-1');
  assert.match(m.homeTacticStr, /^4-4-2/, 'kamphovedet viser startformationen');
  assert.equal(L.teams[0].tactics.conditionalRules[0].used, undefined, 'holdets regel må ikke markeres brugt');
  assert.equal(L.teams[0].tactics.baseFormation, '4-4-2');
});

test('anti-spionage: ingen evnetal i referatet, ingen mod-kunnen for bots', () => {
  const pattern = /\b(FIN|PAS|POS|INT|GK|STA|STR|BAL|PAC|Kynisme|Teater|VAR-Puls|Afslutning|Springkraft)\s*[:=]?\s*\d/i;
  const botsOnly = manyMatches(60, 31, (L, i) => [L.teams[1 + (i % 7)], L.teams[1 + ((i + 1) % 7)]]);
  for (const { m } of [...botsOnly, ...manyMatches(60, 32)]) {
    for (const e of m.events) assert.doesNotMatch(e.text, pattern, e.text);
    for (const o of m.observations) assert.doesNotMatch(o.text, /\d+\s*\/\s*20|\b\d{1,2}\s*(point|pt)\b/, o.text);
  }
  for (const { m } of botsOnly) for (const e of m.events) assert.doesNotMatch(e.text, /mod-kunnen/i, e.text);
  // Referatet er på dansk – motorens interne koder må ikke stå i teksten
  for (const { m } of manyMatches(30, 33)) for (const t of [...m.events.map((e) => e.text), m.homeTacticStr]) assert.doesNotMatch(t, /\b(SHORT|BALANCED|DIRECT_LONG|LOW_BLOCK|MID_BLOCK|HIGH_GEGENPRESS|HIGH_CROSSES|LOW_CUTBACKS|EXTREME_VAR_LINE)\b/, t);
});

test('viewRatingEntry: modstandere ser stjerner, ikke karakter, mod-kunnen eller XP', () => {
  const e = { playerId: 'x', rating: 7.4, stars: 4, startCounterMastery: 55, gainedCounterXp: 9, goals: 1 };
  const opp = viewRatingEntry(e, false);
  assert.equal(opp.stars, 4); assert.equal(opp.goals, 1);
  for (const k of ['rating', 'startCounterMastery', 'gainedCounterXp']) assert.equal(k in opp, false, k);
  assert.equal(viewRatingEntry(e, true).rating, 7.4);
});

test('andre holds taktiske overvejelser kan ikke læses – kun deres startformation', () => {
  const NAMES = /korte pasninger|balanceret opbygning|direkte lange bolde|lav blok|mellemblok|højt gegenpress|Gegenpress|VAR-Linje|Lange Bolde/i;
  const L = league(41), rng = createRng(41);
  for (let i = 1; i < 8; i++) {
    const m = simulateMatch(L.teams[0], L.teams[i], rng);
    assert.equal(m.awayTacticStr, L.teams[i].tactics.baseFormation, 'modstander: kun formationen');
    assert.match(m.homeTacticStr, / • /, 'dit eget hold: fuld taktik');
    const note = m.events.find((e) => e.type === 'TACTIC_NOTE').text;
    assert.doesNotMatch(note.split('møder')[1], NAMES, note);
    for (const e of m.events.filter((x) => !x.isHome && x.type === 'TACTIC_WIN')) assert.doesNotMatch(e.text, /korte pasninger|balanceret opbygning|direkte lange bolde/, e.text);
    // Afledte tekster må ikke afsløre modstanderens offside-fælde eller omstilling
    for (const e of m.events.filter((x) => !x.isHome && x.category === 'TACTIC')) assert.doesNotMatch(e.text, /offside-fælde|kontra|falder til ro/i, e.text);
    // bot mod bot: ingen taktiknavne overhovedet
    const b = simulateMatch(L.teams[i], L.teams[i % 7 + 1], rng);
    for (const e of b.events) { assert.doesNotMatch(e.text, NAMES, e.text); assert.doesNotMatch(e.text, /offside-fælde|kontra|falder til ro/i, e.text); }
  }
});

// ---------- Runder ----------
test('parring: dit hold mod valgt modstander, alle 8 hold spiller én gang', () => {
  const pairs = pairRound(league(), 3);
  assert.deepEqual(pairs[0], [0, 3]);
  assert.deepEqual(pairs.flat().sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('runde bogføres: stilling, karakterer, skader heles først og nye lægges på bagefter', () => {
  const L = league(12), rng = createRng(5);
  const pre = L.teams[2].squad[16]; // bænkspiller med eksisterende 1-kamps skade
  pre.injuryMatchesLeft = 1;
  const res = playRound(L, 1, rng);
  commitRound(L, res, rng);
  assert.equal(pre.injuryMatchesLeft, 0);
  const st = L.leagueMetadata.standings;
  assert.ok(st.every((s) => s.played === 1));
  const goals = res.matches.reduce((a, m) => a + m.homeGoals + m.awayGoals, 0);
  assert.equal(st.reduce((a, s) => a + s.goalsFor, 0), goals);
  assert.equal(st.reduce((a, s) => a + s.goalsFor - s.goalsAgainst, 0), 0);
  const draws = res.matches.filter((m) => m.homeGoals === m.awayGoals).length;
  assert.equal(st.reduce((a, s) => a + s.points, 0), 3 * (4 - draws) + 2 * draws);
  const r0 = res.matches[0].ratings.home[0];
  const p0 = L.teams[0].squad.find((p) => p.id === r0.playerId);
  assert.equal(p0.ratingGames, 1); assert.equal(p0.lastRating, r0.rating);
  assert.equal(L.leagueMetadata.round, 1);
  assert.ok(L.lastRound.gazette.playerOfTheRound);
});

test('scoutingbogen holder højst 20 indtryk pr. spiller, nyeste først', () => {
  const L = league(18), rng = createRng(3);
  for (let r = 0; r < 40; r++) commitRound(L, playRound(L, 1 + (r % 7), rng), rng);
  const lists = Object.values(L.scouting[L.teams[0].id]);
  assert.equal(SCOUTING_PER_PLAYER, 20);
  assert.ok(lists.some((l) => l.length === 20), 'testdata skal ramme loftet');
  assert.ok(lists.every((l) => l.length <= 20));
  const full = lists.find((l) => l.length === 20);
  assert.ok(Number(full[0].match(/Runde (\d+)/)[1]) > Number(full[19].match(/Runde (\d+)/)?.[1] ?? 0));
});

test('en runde kan ikke bogføres to gange', () => {
  const L = league(17), rng = createRng(1);
  const res = playRound(L, 1, rng);
  commitRound(L, res, rng);
  const snapshot = JSON.stringify(L.leagueMetadata.standings);
  assert.throws(() => commitRound(L, res, rng), /Runde 1 kan ikke bogføres/);
  assert.equal(JSON.stringify(L.leagueMetadata.standings), snapshot);
  assert.equal(playRound(L, 2, rng).round, 2);
});

test('ny skade i runden bevarer sin fulde længde (rettet v2.5b-fejl)', () => {
  const L = league(13), rng = createRng(6);
  let checked = 0;
  for (let r = 0; r < 15 && checked < 3; r++) {
    const res = playRound(L, 1 + (r % 7), rng);
    commitRound(L, res, rng);
    for (const m of res.matches) for (const inj of m.injuries) {
      const p = L.teams.flatMap((t) => t.squad).find((x) => x.id === inj.playerId);
      assert.equal(p.injuryMatchesLeft, inj.matches); checked++;
    }
  }
  assert.ok(checked >= 3, 'for få skader i testdata');
});

test('observationer lægges hos observatøren med runde-stempel, ikke på spilleren', () => {
  const L = league(14), rng = createRng(7);
  const res = playRound(L, 2, rng);
  commitRound(L, res, rng);
  const obs = res.matches.flatMap((m) => m.observations);
  assert.ok(obs.length > 0);
  const mine = L.scouting[L.teams[0].id];
  assert.ok(mine[obs[0].playerId][0].startsWith('[Runde 1]'));
  assert.deepEqual(Object.keys(L.scouting), [L.teams[0].id], 'kun menneskestyrede hold har en scoutingbog');
  assert.ok(mine[L.teams[5].squad[0].id].length >= 1, 'forsæson-indtryk af alle spillere');
  assert.equal('matchReportClues' in L.teams[0].squad[0], false);
});

// ---------- Reparation ----------
test('normalizeLeague genskaber manglende felter uden at røre data', () => {
  const L = league(15);
  const keep = L.teams[3].squad[2].skills.passing;
  delete L.leagueMetadata.standings; delete L.scouting; delete L.teams[0].tactics.customCoords;
  delete L.teams[1].squad[0].counterTactics; delete L.teams[6].tactics.conditionalRules; delete L.teams[2].tacticPresets; L.teams[4].tactics.lineupSlots = ['x'];
  const { league: N, problems } = normalizeLeague(L);
  assert.deepEqual(problems, []);
  assert.equal(N.leagueMetadata.standings.length, 8);
  assert.deepEqual(N.scouting, {});
  assert.deepEqual(N.teams[0].tactics.customCoords, {});
  assert.deepEqual(N.teams[1].squad[0].counterTactics, { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 });
  assert.equal(N.teams[2].tacticPresets.length, 3);
  assert.equal(N.teams[4].tactics.lineupSlots.length, 11);
  assert.equal(N.teams[6].tactics.conditionalRules[0].minuteTrigger, 65);
  assert.equal(N.teams[3].squad[2].skills.passing, keep);
});

test('normalizeLeague melder det, der ikke kan repareres', () => {
  const L = league(16);
  L.teams[5].squad.length = 10;
  L.teams.pop();
  const { problems } = normalizeLeague(L);
  assert.equal(problems.length, 2);
  assert.match(problems.join(' '), /7 hold/);
  assert.match(problems.join(' '), /10 spillere/);
  assert.deepEqual(normalizeLeague(null).problems, ['Ligaen mangler hold']);
});

test('referatet viser ingen mod-kunnen-procent mod modstanderen (kan bruges til at regne deres stil ud)', () => {
  // Med høj mod-kunnen (90) ville enhver tærskel-besked udløses – testen har altså data.
  const L = league(42), rng = createRng(42);
  for (const t of L.teams) for (const p of t.squad) p.counterTactics = { vsPress: 90, vsLowBlock: 90, vsTrapLong: 90 };
  let duels = 0;
  for (let i = 1; i < 8; i++) for (const e of simulateMatch(L.teams[0], L.teams[i], rng).events) {
    if (e.isHome && e.type === 'TACTIC_WIN') duels++;
    assert.doesNotMatch(e.text, /mod-kunnen|erfaring mod|🧠|\d+\s*%(?! af bolden)/i, e.text);
  }
  assert.ok(duels > 20, `for få vundne dueller for dit hold (${duels})`);
});
