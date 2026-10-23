// Spillergenerator og ny liga (docs/spec.md §1–2). Al tilfældighed fra den seedede rng.
import { initialCounterTactics } from './counter.js';
import { TEAM_STAT_DEFAULTS, PLAYER_SEASON_DEFAULTS } from './stats.js';
import { generateScoutingClues } from './clues.js';
import { buildSchedule, shuffledIds } from './schedule.js';

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
// Naturlig position (v3.8) passer til standardopstillingen 4-4-2 (LB CB CB RB / LM CM CM RM / ST ST):
// 2 MV; forsvar 3 CB + 3 FB; midtbane 3 CM + 2 WM + 1 AM; angreb 3 ST + 1 WM.
const POSITION_OF_LINE = { GK: 'GK', DEF: 'CB', MID: 'CM', ATT: 'ST' };
const BLUEPRINT = [
  ['GK', 'STARTER', 'GK'], ['DEF', 'STARTER', 'FB'], ['DEF', 'STARTER', 'CB'], ['DEF', 'STAR', 'CB'], ['DEF', 'STARTER', 'FB'],
  ['MID', 'STARTER', 'WM'], ['MID', 'STARTER', 'CM'], ['MID', 'STAR', 'CM'], ['ATT', 'STARTER', 'ST'], ['MID', 'STARTER', 'WM'], ['ATT', 'STARTER', 'ST'],
  ['GK', 'ROTATION', 'GK'], ['DEF', 'ROTATION', 'CB'], ['DEF', 'TALENT', 'FB'], ['MID', 'ROTATION', 'CM'], ['MID', 'TALENT', 'AM'], ['ATT', 'ROTATION', 'ST'], ['ATT', 'TALENT', 'WM'],
];
export const POSITIONS = ['GK', 'CB', 'FB', 'CM', 'WM', 'AM', 'ST'];

// Naturlig position til spillere uden en (ligaer fra før v3.8): pr. kæde efter højde – de
// højeste bliver stoppere og angribere, de laveste backs og kanter (dokumentets mønster),
// i samme forhold som BLUEPRINT. Kun spillere uden position røres.
export function assignPositions(squad) {
  const byLine = {};
  for (const p of squad) if (!POSITIONS.includes(p.position)) (byLine[p.line] ||= []).push(p);
  for (const [line, list] of Object.entries(byLine)) {
    list.sort((a, b) => (b.heightCm ?? 0) - (a.heightCm ?? 0) || String(a.id).localeCompare(String(b.id)));
    const n = list.length;
    list.forEach((p, i) => {
      if (line === 'GK') p.position = 'GK';
      else if (line === 'DEF') p.position = i < Math.ceil(n / 2) ? 'CB' : 'FB';
      else if (line === 'MID') p.position = i < Math.floor(n / 2) ? 'CM' : i === Math.floor(n / 2) && n >= 4 ? 'AM' : 'WM';
      else p.position = n >= 4 && i === n - 1 ? 'WM' : 'ST';
    });
  }
  return squad;
}

const TIERS = {
  STAR: { age: [24, 28], stat: [11, 15], arch: 0.75 },
  TALENT: { age: [17, 19], stat: [6, 10], arch: 0.55 },
  ROTATION: { age: [21, 28], stat: [7, 11], arch: 0.25 },
  STARTER: { age: [21, 27], stat: [9, 13], arch: 0.25 },
};

// Bot-holdenes taktiske profiler (v2.5b BOT_TACTICAL_PROFILES; tackling/omstilling fastsat).
// subs = udskiftningsgrænsen i % (v3.13): hold med mange løb skifter tidligere (75), lav blok senere (65), resten 70.
// runs = løb uden bold (v3.9): gegenpres-hold mange, lav blok få, resten normal. Profil 0 er
// KUN brugerens hold (idx 0) – den skal stå på NORMAL.
export const BOT_PROFILES = [
  { form: '4-4-2', pass: 'BALANCED', focus: 'CENTRAL', press: 'MID_BLOCK', offside: 'NORMAL', tackle: 'NORMAL', won: 'FAST_COUNTER', lost: 'DROP_BACK', runs: 'NORMAL', subs: 70 },
  { form: '4-2-3-1', pass: 'SHORT', focus: 'LOW_CUTBACKS', press: 'HIGH_GEGENPRESS', offside: 'EXTREME_VAR_LINE', tackle: 'AGGRESSIVE', won: 'KEEP_POSSESSION', lost: 'COUNTER_PRESS_5S', runs: 'MANY', subs: 75 },
  { form: '5-3-2', pass: 'DIRECT_LONG', focus: 'HIGH_CROSSES', press: 'LOW_BLOCK', offside: 'OFF', tackle: 'CAUTIOUS', won: 'FAST_COUNTER', lost: 'DROP_BACK', runs: 'FEW', subs: 65 },
  { form: '4-3-3', pass: 'SHORT', focus: 'CENTRAL', press: 'HIGH_GEGENPRESS', offside: 'EXTREME_VAR_LINE', tackle: 'NORMAL', won: 'KEEP_POSSESSION', lost: 'COUNTER_PRESS_5S', runs: 'MANY', subs: 75 },
  { form: '3-5-2', pass: 'BALANCED', focus: 'HIGH_CROSSES', press: 'MID_BLOCK', offside: 'NORMAL', tackle: 'NORMAL', won: 'FAST_COUNTER', lost: 'DROP_BACK', runs: 'NORMAL', subs: 70 },
  { form: '4-4-2', pass: 'DIRECT_LONG', focus: 'HIGH_CROSSES', press: 'MID_BLOCK', offside: 'NORMAL', tackle: 'AGGRESSIVE', won: 'FAST_COUNTER', lost: 'DROP_BACK', runs: 'NORMAL', subs: 70 },
  { form: '5-4-1', pass: 'DIRECT_LONG', focus: 'CENTRAL', press: 'LOW_BLOCK', offside: 'OFF', tackle: 'CAUTIOUS', won: 'FAST_COUNTER', lost: 'DROP_BACK', runs: 'FEW', subs: 65 },
  { form: '3-4-3', pass: 'BALANCED', focus: 'LOW_CUTBACKS', press: 'HIGH_GEGENPRESS', offside: 'NORMAL', tackle: 'AGGRESSIVE', won: 'KEEP_POSSESSION', lost: 'COUNTER_PRESS_5S', runs: 'MANY', subs: 75 },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Trekantsfordelt kast, klemt til 1–20 (kildens rollStat).
export function rollStat(rng, min, max) {
  return clamp(Math.round(min + ((rng.next() + rng.next()) / 2) * (max - min)), 1, 20);
}

// Højde efter Superligaen (brugerens dokument "Spillerhøjde i Superligaen": ligasnit ≈184 cm,
// trupper 182,9–187,5, 169–201). Fra v3.8 pr. NATURLIG POSITION efter dokumentets tabel:
// MV 193–195 (188–201), CB 189–191 (184–198), ST 185–188 (178–196), CM/DM 182–185 (175–192),
// backs og kanter 174–177 (169–183). Tre terninger −d..d om midten (spredning ≈3,5 cm ved d=3,
// ≈4,5 ved d=4), klemt til positionens spænd. Truppen 2 GK/3 CB/3 FB/3 CM/3 WM/1 AM/3 ST:
// (2·194 + 3·190 + 6·175,5 + 4·183,5 + 3·186,5)/18 = 183,6 + holdprofil (−1,5…+3, snit +0,75) ≈ 184,3.
export const HEIGHT_BY_POS = {
  GK: { mid: 194, dice: 3, min: 188, max: 201 },
  CB: { mid: 190, dice: 3, min: 184, max: 198 },
  ST: { mid: 186.5, dice: 4, min: 178, max: 196 },
  CM: { mid: 183.5, dice: 4, min: 175, max: 192 },
  AM: { mid: 183.5, dice: 4, min: 175, max: 192 },
  FB: { mid: 175.5, dice: 3, min: 169, max: 183 },
  WM: { mid: 175.5, dice: 3, min: 169, max: 183 },
};
export const HEIGHT_MIN = 168, HEIGHT_MAX = 201;
export const HEIGHT_ZERO = 166;
export const HEIGHT_TEAM_MEAN_OFFSET = 0.75;                  // snit af holdprofilen (−1,5…+3)

// Højden ved fraktil q (0–1) i en fordeling { mid, dice, min, max } – den samme, generatoren
// trækker fra (holdprofilen sat til sit snit). Bruges, når en eksisterende liga lægges om.
const diceCdfCache = {};
function diceSums(d) {
  if (diceCdfCache[d]) return diceCdfCache[d];
  const sums = [];
  for (let a = -d; a <= d; a++) for (let b = -d; b <= d; b++) for (let c = -d; c <= d; c++) sums.push(a + b + c);
  return (diceCdfCache[d] = sums.sort((x, y) => x - y));
}
export function heightAtQuantile(key, q, table = HEIGHT_BY_POS) {
  const t = table[key] ?? table.CM ?? Object.values(table)[0];
  const sums = diceSums(t.dice);
  const v = sums[Math.min(sums.length - 1, Math.max(0, Math.floor(q * sums.length)))];
  return clamp(Math.round(t.mid + HEIGHT_TEAM_MEAN_OFFSET) + v, t.min ?? HEIGHT_MIN, t.max ?? HEIGHT_MAX);
}

export function aerialBreakdown(heightCm, jumpingPower, strength, positioning) {
  // Nulpunkt 166 cm (v3.7): højde-scoren ligger på samme niveau som før v3.6 (nulpunkt 168 ved snit 186).
  const heightScore = clamp(Math.round((heightCm - HEIGHT_ZERO) * 0.7), 1, 20);
  const wHeight = heightScore * 0.35, wJump = jumpingPower * 0.35, wStr = strength * 0.15, wPos = positioning * 0.15;
  const exact = wHeight + wJump + wStr + wPos;
  return { heightScore, wHeight, wJump, wStr, wPos, exact, total: Math.round(exact) };
}

export function isArchetypeUnlocked(arch, player) {
  const stats = { ...player.skills, jumpingPower: player.jumpingPower };
  return Object.entries(arch.unlockReq).every(([k, v]) => (stats[k] || 0) >= v);
}

export function generatePlayer(rng, line, roleTier, shirtNumber, teamIdx, usedShortNames, heightOffset = 0, position = POSITION_OF_LINE[line]) {
  const t = TIERS[roleTier];
  const [bMin, bMax] = t.stat;
  const age = rng.int(t.age[0], t.age[1]);
  let firstName, lastName, shortName;
  do {
    firstName = rng.pick(FIRST_NAMES); lastName = rng.pick(LAST_NAMES);
    shortName = firstName[0] + '. ' + lastName;
  } while (usedShortNames.has(shortName));
  usedShortNames.add(shortName);

  // Klokkeform om positionens midte plus holdets profil, klemt til positionens spænd (v3.8).
  // Hele truppen spreder sig stadig bredt (brugeren: "ikke at alle spillere skal ligge tæt på gns.
  // for deres position"), fordi positionerne ligger fra 175,5 til 194.
  const ht = HEIGHT_BY_POS[position], d = ht.dice;
  const heightCm = clamp(Math.round(ht.mid + heightOffset) + rng.int(-d, d) + rng.int(-d, d) + rng.int(-d, d), ht.min, ht.max);
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
    age, seasonAgeCounter: 1, line, position, shirtNumber, roleTier,
    ...PLAYER_SEASON_DEFAULTS,
    freshness: 100, injuryMatchesLeft: 0, lastRating: 0, ratingSum: 0, ratingGames: 0, publicStars: 0, distanceSum: 0, minutesSum: 0, topSpeedMax: 0, hiKmSum: 0, hiDistSum: 0,
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

// Standardopstilling: truppens 11 første sorteret efter kæde (MÅL, FOR, MID, ANG), så
// kæderne lander på formationens pladser (kildens trup har #9 ANG før #10 MID).
const LINE_ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
export function defaultStarterIds(squad) {
  return squad.slice(0, 11).map((p, i) => [p, i]).sort((a, b) => LINE_ORDER[a[0].line] - LINE_ORDER[b[0].line] || a[1] - b[1]).map(([p]) => p.id);
}

export function defaultTactics(starterIds, profile) {
  const p = profile || BOT_PROFILES[0];
  return {
    baseFormation: p.form, lineupSlots: starterIds.slice(), customCoords: {},
    phases: {
      phase1_buildUp: { passingStyle: p.pass, attackFocus: p.focus, offBallRuns: p.runs ?? 'NORMAL' },
      phase2_defending: { pressingHeight: p.press, offsideTrap: p.offside, tacklingIntensity: p.tackle },
      phase3_transition: { onBallWon: p.won, onBallLost: p.lost },
    },
    conditionalRules: [{ ruleId: 1, minuteTrigger: 65, condition: 'TRAILING', margin: 1, newFormation: '3-4-3', newPlan: null, slotRemapping: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10] }],
  };
}

export function generateTeam(rng, idx) {
  const used = new Set();
  // Holdprofil: fysisk "power-hold" op til +3 cm, tekniske hold ned til −1,5 cm (Superligaen 182,9–187,5).
  const heightOffset = rng.int(-3, 6) / 2;
  const squad = BLUEPRINT.map(([line, tier, pos], i) => generatePlayer(rng, line, tier, i + 1, idx, used, heightOffset, pos));
  const starters = defaultStarterIds(squad);
  const isBot = idx !== 0;
  const own = isBot ? BOT_PROFILES[idx] : BOT_PROFILES[0];
  const tactics = defaultTactics(starters, own);
  return {
    id: `team_div1_${idx + 1}`, name: TEAM_NAMES[idx], isBot, ownerUid: null, cashBalance: 5000000,
    subsLimit: own.subs, tactics,
    tacticPresets: [
      structuredClone(tactics),
      { ...defaultTactics(starters, own), baseFormation: '4-3-3' },
      { ...defaultTactics(starters, { ...own, press: 'LOW_BLOCK' }), baseFormation: '5-4-1' },
    ],
    squad,
  };
}

export function emptyStanding(team) {
  return { teamId: team.id, teamName: team.name, isBot: team.isBot, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, varNet: 0, points: 0, ...TEAM_STAT_DEFAULTS };
}

export function createLeague(rng) {
  const teams = TEAM_NAMES.map((_, i) => generateTeam(rng, i));
  // Observationer ligger hos observatøren (dig), ikke på spilleren (spec §2 "Rettet").
  // Ligaen starter med de indtryk, man har fra forsæsonen.
  // scouting[observatørens hold-id][spiller-id] – i trin 2 bliver det ét dokument pr. bruger.
  const scouting = {};
  for (const viewer of teams.filter((t) => !t.isBot)) {
    const book = (scouting[viewer.id] = {});
    for (const t of teams) for (const p of t.squad) book[p.id] = generateScoutingClues(p.shortName, p.varProfile, p.heightCm, p.jumpingPower).map((c) => `[Forsæson] ${c}`);
  }
  return {
    leagueMetadata: { id: 'league_div_1', name: 'TactiVAR Superligaen', seasonNumber: 1, footballYear: 1, round: 0, standings: teams.map(emptyStanding) },
    statsFromRound: 1, history: [],
    // Kampprogram (v3.11): sæsonen starter i runde 1; seasons er arkivet over afsluttede sæsoner.
    schedule: buildSchedule(shuffledIds(teams)), seasonStartRound: 1, seasons: [],
    teams,
    scouting,
    lastRound: null,
  };
}
