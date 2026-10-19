// Spillergenerator og ny liga (docs/spec.md §1–2). Al tilfældighed fra den seedede rng.
import { initialCounterTactics } from './counter.js';
import { generateScoutingClues } from './clues.js';

export const TEAM_NAMES = ['Bibamus United', 'FC Vejleå', 'Ølstykke IF', 'Lyngby Tacticians', 'Nordkysten BK', 'Furesø Boldklub', 'Roskilde Rovers', 'Kronborg United'];

const FIRST_NAMES = ['Mikkel', 'Kasper', 'Lukas', 'Mathias', 'Frederik', 'Christian', 'Andreas', 'Victor', 'Mads', 'Emil', 'Jonas', 'Nikolaj', 'Oliver', 'William', 'Magnus', 'Sebastian', 'Tobias', 'Rasmus', 'Simon', 'Jakob', 'Anders', 'Martin', 'Søren', 'Peter', 'Jens', 'Gustav', 'Carl', 'Alexander', 'Malthe', 'Noah'];
const LAST_NAMES = ['Jensen', 'Nielsen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Jørgensen', 'Petersen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen', 'Poulsen', 'Johansen', 'Møller', 'Mortensen', 'Knudsen', 'Jakobsen', 'Holm', 'Lund', 'Schmidt', 'Eriksen', 'Bach', 'Dahl', 'Kjær', 'Vestergaard', 'Lauridsen'];

// Arketyper pr. kæde. Krav-tallene er afskåret i kilden og fastsat her (spec §2).
export const ARCHETYPES = {
  GK: [
    { id: 'SWEEPER_KEEPER', name: 'Sweeper Keeper', description: 'Bryder dybe stikninger uden for feltet ved høj forsvarslinje', unlockReq: { goalkeeping: 12, pace: 11 } },
    { id: 'PENALTY_KILLER', name: 'Penalty Killer', description: 'Psykisk overtag ved straffe og VAR-straffespark', unlockReq: { goalkeeping: 14, positioning: 12 } },
  ],
  DEF: [
    { id: 'OFFSIDE_MAESTRO', name: 'Offside Maestro', description: '+20% til hele bagkædens timing ved VAR-offside', unlockReq: { positioning: 13, intercepting: 13 } },
    { id: 'AERIAL_TOWER', name: 'Luftens Konge', description: '+25% i alle hovedstødsdueller i begge felter', unlockReq: { strength: 13, jumpingPower: 14 } },
  ],
  MID: [
    { id: 'REGISTA', name: 'Regista (Playmaker)', description: 'Slår pasninger direkte fra Fase 1 til Fase 3', unlockReq: { passing: 13, ballControl: 13 } },
    { id: 'PRESSING_MONSTER', name: 'Pressing Monster', description: 'Mister 50% mindre energi ved Højt Gegenpress', unlockReq: { stamina: 14, intercepting: 12 } },
  ],
  ATT: [
    { id: 'VAR_LINE_GHOST', name: 'VAR-Line Ghost', description: 'Vinder 80% af alle millimeter-tætte VAR-offside-kendelser', unlockReq: { pace: 14, positioning: 12 } },
    { id: 'TARGET_MAN', name: 'Target Man', description: 'Dominerer lange bolde og høje indlæg med hovedet', unlockReq: { strength: 13, jumpingPower: 13 } },
  ],
};

// Truppens opbygning: #1–11 starter, #12–18 bænk (spec §2; #10–11 og #16–18 fastsat).
const BLUEPRINT = [
  ['GK', 'STARTER'], ['DEF', 'STARTER'], ['DEF', 'STARTER'], ['DEF', 'STAR'], ['DEF', 'STARTER'],
  ['MID', 'STARTER'], ['MID', 'STARTER'], ['MID', 'STAR'], ['ATT', 'STARTER'], ['MID', 'STARTER'], ['ATT', 'STARTER'],
  ['GK', 'ROTATION'], ['DEF', 'ROTATION'], ['DEF', 'TALENT'], ['MID', 'ROTATION'], ['MID', 'TALENT'], ['ATT', 'ROTATION'], ['ATT', 'TALENT'],
];

const TIERS = {
  STAR: { age: [24, 28], stat: [11, 15], arch: 0.75 },
  TALENT: { age: [17, 19], stat: [6, 10], arch: 0.55 },
  ROTATION: { age: [21, 28], stat: [7, 11], arch: 0.25 },
  STARTER: { age: [21, 27], stat: [9, 13], arch: 0.25 },
};

// Bot-holdenes taktiske profiler (v2.5b BOT_TACTICAL_PROFILES; tackling/omstilling fastsat).
export const BOT_PROFILES = [
  { form: '4-4-2', pass: 'BALANCED', focus: 'CENTRAL', press: 'MID_BLOCK', offside: 'NORMAL', tackle: 'NORMAL', won: 'FAST_COUNTER', lost: 'DROP_BACK' },
  { form: '4-2-3-1', pass: 'SHORT', focus: 'LOW_CUTBACKS', press: 'HIGH_GEGENPRESS', offside: 'EXTREME_VAR_LINE', tackle: 'AGGRESSIVE', won: 'KEEP_POSSESSION', lost: 'COUNTER_PRESS_5S' },
  { form: '5-3-2', pass: 'DIRECT_LONG', focus: 'HIGH_CROSSES', press: 'LOW_BLOCK', offside: 'OFF', tackle: 'CAUTIOUS', won: 'FAST_COUNTER', lost: 'DROP_BACK' },
  { form: '4-3-3', pass: 'SHORT', focus: 'CENTRAL', press: 'HIGH_GEGENPRESS', offside: 'EXTREME_VAR_LINE', tackle: 'NORMAL', won: 'KEEP_POSSESSION', lost: 'COUNTER_PRESS_5S' },
  { form: '3-5-2', pass: 'BALANCED', focus: 'HIGH_CROSSES', press: 'MID_BLOCK', offside: 'NORMAL', tackle: 'NORMAL', won: 'FAST_COUNTER', lost: 'DROP_BACK' },
  { form: '4-4-2', pass: 'DIRECT_LONG', focus: 'HIGH_CROSSES', press: 'MID_BLOCK', offside: 'NORMAL', tackle: 'AGGRESSIVE', won: 'FAST_COUNTER', lost: 'DROP_BACK' },
  { form: '5-4-1', pass: 'DIRECT_LONG', focus: 'CENTRAL', press: 'LOW_BLOCK', offside: 'OFF', tackle: 'CAUTIOUS', won: 'FAST_COUNTER', lost: 'DROP_BACK' },
  { form: '3-4-3', pass: 'BALANCED', focus: 'LOW_CUTBACKS', press: 'HIGH_GEGENPRESS', offside: 'NORMAL', tackle: 'AGGRESSIVE', won: 'KEEP_POSSESSION', lost: 'COUNTER_PRESS_5S' },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Trekantsfordelt kast, klemt til 1–20 (kildens rollStat).
export function rollStat(rng, min, max) {
  return clamp(Math.round(min + ((rng.next() + rng.next()) / 2) * (max - min)), 1, 20);
}

export function aerialBreakdown(heightCm, jumpingPower, strength, positioning) {
  const heightScore = clamp(Math.round((heightCm - 168) * 0.7), 1, 20);
  const wHeight = heightScore * 0.35, wJump = jumpingPower * 0.35, wStr = strength * 0.15, wPos = positioning * 0.15;
  const exact = wHeight + wJump + wStr + wPos;
  return { heightScore, wHeight, wJump, wStr, wPos, exact, total: Math.round(exact) };
}

export function isArchetypeUnlocked(arch, player) {
  const stats = { ...player.skills, jumpingPower: player.jumpingPower };
  return Object.entries(arch.unlockReq).every(([k, v]) => (stats[k] || 0) >= v);
}

export function generatePlayer(rng, line, roleTier, shirtNumber, teamIdx, usedShortNames) {
  const t = TIERS[roleTier];
  const [bMin, bMax] = t.stat;
  const age = rng.int(t.age[0], t.age[1]);
  let firstName, lastName, shortName;
  do {
    firstName = rng.pick(FIRST_NAMES); lastName = rng.pick(LAST_NAMES);
    shortName = firstName[0] + '. ' + lastName;
  } while (usedShortNames.has(shortName));
  usedShortNames.add(shortName);

  const heightCm = line === 'GK' || line === 'DEF' ? rng.int(181, 198) : rng.int(172, 195);
  const r = (a, b) => rollStat(rng, a, b);
  const jumpingPower = r(bMin - 1, bMax + (line === 'DEF' || line === 'ATT' ? 2 : 0));
  const skills = {
    pace: r(bMin - 1, bMax + (line === 'ATT' || line === 'MID' ? 1 : 0)),
    stamina: r(bMin, bMax + (line === 'MID' ? 2 : 0)),
    strength: r(bMin - 1, bMax + (line === 'DEF' ? 2 : 0)),
    ballControl: r(line === 'GK' ? 4 : bMin, line === 'GK' ? 9 : bMax + 1),
    passing: r(line === 'GK' ? 5 : bMin, line === 'MID' ? bMax + 2 : bMax),
    finishing: r(line === 'ATT' ? bMin + 2 : 2, line === 'ATT' ? bMax + 2 : 9),
    positioning: r(bMin, bMax + 1),
    intercepting: r(line === 'DEF' || line === 'MID' ? bMin + 1 : 2, line === 'DEF' ? bMax + 2 : 9),
    goalkeeping: line === 'GK' ? r(bMin + 2, bMax + 2) : r(1, 2),
  };
  const varProfile = { cynicism: r(4, 18), theatre: r(3, 18), varPulse: r(bMin - 1, bMax + 2) };
  const sum = Object.values(skills).reduce((a, b) => a + b, 0);
  const player = {
    id: `plr_t${teamIdx}_${shirtNumber}`, name: `${firstName} ${lastName}`, shortName,
    age, seasonAgeCounter: 1, line, shirtNumber, roleTier,
    freshness: 100, injuryMatchesLeft: 0, lastRating: 0, ratingSum: 0, ratingGames: 0, publicStars: 0,
    heightCm, jumpingPower, aerialPower: aerialBreakdown(heightCm, jumpingPower, skills.strength, skills.positioning).total,
    skills, varProfile,
    archetype: null,
    weeklyWage: Math.round(sum * sum * 10), marketValue: Math.round(sum * sum * 150),
  };
  player.counterTactics = initialCounterTactics(rng, age, skills.positioning);
  if (rng.chance(t.arch)) {
    const a = rng.pick(ARCHETYPES[line]);
    player.archetype = { id: a.id, name: a.name, description: a.description, unlockReq: { ...a.unlockReq }, isUnlocked: false };
    player.archetype.isUnlocked = isArchetypeUnlocked(a, player);
  }
  return player;
}

export function defaultTactics(starterIds, profile) {
  const p = profile || BOT_PROFILES[0];
  return {
    baseFormation: p.form, lineupSlots: starterIds.slice(), customCoords: {},
    phases: {
      phase1_buildUp: { passingStyle: p.pass, attackFocus: p.focus },
      phase2_defending: { pressingHeight: p.press, offsideTrap: p.offside, tacklingIntensity: p.tackle },
      phase3_transition: { onBallWon: p.won, onBallLost: p.lost },
    },
    conditionalRules: [{ ruleId: 1, minuteTrigger: 65, condition: 'TRAILING', newFormation: '3-4-3', slotRemapping: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10], used: false }],
  };
}

export function generateTeam(rng, idx) {
  const used = new Set();
  const squad = BLUEPRINT.map(([line, tier], i) => generatePlayer(rng, line, tier, i + 1, idx, used));
  const starters = squad.slice(0, 11).map((p) => p.id);
  const isBot = idx !== 0;
  const own = isBot ? BOT_PROFILES[idx] : BOT_PROFILES[0];
  const tactics = defaultTactics(starters, own);
  return {
    id: `team_div1_${idx + 1}`, name: TEAM_NAMES[idx], isBot, ownerUid: null, cashBalance: 5000000,
    tactics,
    tacticPresets: [
      structuredClone(tactics),
      { ...defaultTactics(starters, own), baseFormation: '4-3-3' },
      { ...defaultTactics(starters, { ...own, press: 'LOW_BLOCK' }), baseFormation: '5-4-1' },
    ],
    squad,
  };
}

export function emptyStanding(team) {
  return { teamId: team.id, teamName: team.name, isBot: team.isBot, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, varNet: 0, points: 0 };
}

export function createLeague(rng) {
  const teams = TEAM_NAMES.map((_, i) => generateTeam(rng, i));
  // Observationer ligger hos observatøren (dig), ikke på spilleren (spec §2 "Rettet").
  // Ligaen starter med de indtryk, man har fra forsæsonen.
  const scouting = {};
  for (const t of teams) for (const p of t.squad) scouting[p.id] = generateScoutingClues(p.shortName, p.varProfile, p.heightCm, p.jumpingPower).map((c) => `[Forsæson] ${c}`);
  return {
    leagueMetadata: { id: 'league_div_1', name: 'TactiVAR Superligaen', seasonNumber: 1, footballYear: 1, round: 0, standings: teams.map(emptyStanding) },
    teams,
    scouting,
    lastRound: null,
  };
}
