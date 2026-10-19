import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { FORMATIONS, FORMATION_NAMES, MAX_ANCHOR_RADIUS, isOutOfZone, clampPos, lineOfRole } from '../../public/engine/formations.js';
import { createLeague, aerialBreakdown, rollStat, TEAM_NAMES } from '../../public/engine/generator.js';
import { viewPlayer, canSeeField } from '../../public/engine/visibility.js';
import { initialCounterTactics, opponentTacticKeys, masteryVs, counterXpForMatch, applyCounterXp } from '../../public/engine/counter.js';
import { starsFromRating } from '../../public/engine/ratings.js';
import { simulateMatch, MAX_SUBS } from '../../public/engine/match.js';
import { playRound, commitRound, pairRound } from '../../public/engine/season.js';
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

test('mod-XP: 4–16 point; primær +XP, sekundær +60 %, øvrige −3 med aldersbund', () => {
  assert.equal(counterXpForMatch({ minutesPlayed: 90, tacticWins: 0, goals: 0 }), 9);
  assert.equal(counterXpForMatch({ minutesPlayed: 90, tacticWins: 2, goals: 1 }), 15);
  assert.equal(counterXpForMatch({ minutesPlayed: 90, tacticWins: 9, goals: 1 }), 16);
  assert.equal(counterXpForMatch({ minutesPlayed: 10, tacticWins: 0, goals: 0 }), 4);
  const opp = phases('SHORT', 'CENTRAL', 'HIGH_GEGENPRESS', 'EXTREME_VAR_LINE'); // primær vsPress, sekundær vsTrapLong
  assert.deepEqual(applyCounterXp({ vsPress: 50, vsLowBlock: 26, vsTrapLong: 50 }, 30, opp, 10), { vsPress: 60, vsLowBlock: 25, vsTrapLong: 56 });
  assert.deepEqual(applyCounterXp({ vsPress: 95, vsLowBlock: 13, vsTrapLong: 50 }, 20, opp, 10), { vsPress: 100, vsLowBlock: 12, vsTrapLong: 56 });
});

// ---------- Karakterer ----------
test('stjernegrænser 8,35 / 7,25 / 6,15 / 5,15', () => {
  const cases = [[8.35, 5], [8.34, 4], [7.25, 4], [7.24, 3], [6.15, 3], [6.14, 2], [5.15, 2], [5.14, 1], [3.5, 1], [0, 0]];
  for (const [r, s] of cases) assert.equal(starsFromRating(r), s, `karakter ${r}`);
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

test('skadet starter spiller ikke – erstattes i den kamplokale opstilling', () => {
  const L = league(4);
  const star = L.teams[0].squad[3];
  star.injuryMatchesLeft = 2;
  const m = simulateMatch(L.teams[0], L.teams[1], createRng(1));
  assert.equal(m.ratings.home.some((r) => r.playerId === star.id), false);
  assert.ok(m.events.some((e) => e.type === 'LINEUP' && e.text.includes(star.shortName)));
  assert.equal(L.teams[0].tactics.lineupSlots[3], star.id, 'lineupSlots må ikke ændres');
});

test('Hvis-Så: reglen udløses én gang, for begge hold, og skifter formation', () => {
  const L = league(8);
  for (const t of [L.teams[0], L.teams[1]]) t.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'DRAW', newFormation: '5-4-1', slotRemapping: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }];
  const m = simulateMatch(L.teams[0], L.teams[1], createRng(2));
  const trig = m.events.filter((e) => e.type === 'TRIGGER');
  assert.equal(trig.filter((e) => e.isHome).length, 1);
  assert.equal(trig.filter((e) => !e.isHome).length, 1);
  assert.ok(trig.every((e) => e.text.includes('til 5-4-1') && e.min === 3));
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
  assert.ok(L.scouting[obs[0].playerId][0].startsWith('[Runde 1]'));
  assert.equal('matchReportClues' in L.teams[0].squad[0], false);
});

// ---------- Reparation ----------
test('normalizeLeague genskaber manglende felter uden at røre data', () => {
  const L = league(15);
  const keep = L.teams[3].squad[2].skills.passing;
  delete L.leagueMetadata.standings; delete L.scouting; delete L.teams[0].tactics.customCoords;
  delete L.teams[1].squad[0].counterTactics; delete L.teams[2].tacticPresets; L.teams[4].tactics.lineupSlots = ['x'];
  const { league: N, problems } = normalizeLeague(L);
  assert.deepEqual(problems, []);
  assert.equal(N.leagueMetadata.standings.length, 8);
  assert.deepEqual(N.scouting, {});
  assert.deepEqual(N.teams[0].tactics.customCoords, {});
  assert.deepEqual(N.teams[1].squad[0].counterTactics, { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 });
  assert.equal(N.teams[2].tacticPresets.length, 3);
  assert.equal(N.teams[4].tactics.lineupSlots.length, 11);
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
