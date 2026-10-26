// Reparerer en indlæst liga additivt (som v2.5b's sanitizeLeagueData): manglende felter får
// standardværdier, eksisterende data røres ikke. Grundlaget for migreringsreglen i
// docs/spec.md §9 – en ny version må aldrig slette ligaen.
import { clampSubsLimit } from './freshness.js';
import { MAX_RULES } from './match-rules.js';
import { TEAM_STAT_DEFAULTS, PLAYER_SEASON_DEFAULTS } from './stats.js';
import { FORMATIONS } from './formations.js';
import { buildSchedule, isValidSchedule, SEASON_ROUNDS } from './schedule.js';
import { defaultTactics, defaultStarterIds, emptyStanding, BOT_PROFILES, aerialBreakdown, assignPositions, teamCareerDefaults, generatePlayer } from './generator.js';
import { initialPotential, publicWage, MATCH_LOG_CAP, SQUAD_MIN, SQUAD_MAX, derivedRng, neededLine, freeShirt } from './career.js';

const PLAYER_DEFAULTS = { freshness: 100, injuryMatchesLeft: 0, lastRating: 0, ratingSum: 0, ratingGames: 0, publicStars: 0, seasonAgeCounter: 1, archetype: null, distanceSum: 0, minutesSum: 0, topSpeedMax: 0, hiKmSum: 0, hiDistSum: 0, trainingFocus: 'GENERAL', careerGames: 0 };
// Truppens størrelse (v3.18.0: 18–25 efter lønbudgettet; før præcis 18)
export { SQUAD_MIN, SQUAD_MAX };   // ét sted: career.js
const LOG_CAP = 40;

// Hvis-Så-regel i skema 2: { condition: TRAILING|LEADING|DRAW, margin 1–5, newFormation, newPlan }.
// Skema 1 havde LEADING_BY_1 (præcis 1 foran) og TRAILING (bagud) uden antal mål.
export function normalizeRule(r) {
  if (r.condition === 'LEADING_BY_1') r.condition = 'LEADING';
  if (!['TRAILING', 'LEADING', 'DRAW', 'ANY'].includes(r.condition)) r.condition = 'TRAILING';
  // v3.13: en regel er enten et skift af plan/formation (SHIFT – alle regler fra før) eller en udskiftning (SUB).
  r.action = r.action === 'SUB' ? 'SUB' : 'SHIFT';
  r.subOut = typeof r.subOut === 'string' ? r.subOut : null;
  r.subIn = typeof r.subIn === 'string' ? r.subIn : null;
  r.margin = Math.max(1, Math.min(5, Math.round(Number(r.margin) || 1)));
  if (!FORMATIONS[r.newFormation]) r.newFormation = '4-4-2';
  r.newPlan = [0, 1, 2].includes(r.newPlan) ? r.newPlan : null;
  return r;
}

function fixTactics(t, starterIds, profile) {
  const def = defaultTactics(starterIds, profile);
  if (!t) return def;
  if (!FORMATIONS[t.baseFormation]) t.baseFormation = def.baseFormation;
  if (!Array.isArray(t.lineupSlots) || t.lineupSlots.length !== 11) t.lineupSlots = starterIds;
  t.customCoords ||= {};
  const ph = t.phases || {};
  t.phases = {
    phase1_buildUp: { ...def.phases.phase1_buildUp, ...ph.phase1_buildUp },
    phase2_defending: { ...def.phases.phase2_defending, ...ph.phase2_defending },
    phase3_transition: { ...def.phases.phase3_transition, ...ph.phase3_transition },
  };
  if (!Array.isArray(t.conditionalRules)) t.conditionalRules = def.conditionalRules;
  t.conditionalRules = t.conditionalRules.slice(0, MAX_RULES).map(normalizeRule);
  return t;
}

// Returnerer { league, problems } – problems er en liste af ting, der IKKE kunne repareres.
export function normalizeLeague(league) {
  const problems = [], notes = [];
  if (!league || !Array.isArray(league.teams)) return { league: null, problems: ['Ligaen mangler hold'], notes };
  if (league.teams.length !== 8) problems.push(`Ligaen har ${league.teams.length} hold (forventet 8)`);
  league.leagueMetadata ||= { id: 'league_div_1', name: 'TactiVAR Superligaen', seasonNumber: 1, footballYear: 1 };
  const md = league.leagueMetadata;
  md.round ??= 0;
  if (!Array.isArray(md.standings) || md.standings.length !== league.teams.length) md.standings = league.teams.map(emptyStanding);
  for (const s of md.standings) for (const [k, v] of Object.entries(TEAM_STAT_DEFAULTS)) if (s[k] === undefined) s[k] = v;
  // Statistikken (v3.10) tælles fra næste runde i en eksisterende liga – ældre runder er ikke gemt.
  league.statsFromRound ??= md.round + 1;
  if (!Array.isArray(league.history)) league.history = [];
  league.scouting ||= {};
  league.lastRound ??= null;
  // Kampens spor (v3.16) er afledt data: et spor med forkert form (fx en redigeret gemt fil) slettes, så Kamp-fanen viser
  // "Ingen afspilning" i stedet for at vælte (Security Reviewer v3.16).
  for (const m of league.lastRound?.matches || []) if (m && m.trace !== undefined && !isValidTrace(m.trace)) delete m.trace;
  // Uret (v3.16.4, RM): et ødelagt ur eller en ødelagt tillægstid slettes – visningen falder tilbage til tick-minutterne
  for (const m of league.lastRound?.matches || []) {
    if (!m) continue;
    if (m.stoppage !== undefined && !isValidStoppage(m.stoppage)) delete m.stoppage;
    for (const e of Array.isArray(m.events) ? m.events : []) if (e && e.clock !== undefined && !isValidClock(e.clock)) delete e.clock;
  }
  // Kampprogrammet (v3.11): et ugyldigt eller manglende program genskabes deterministisk (holdenes
  // rækkefølge), og sæsonens start lægges, så næste runde altid er en af sæsonens 14.
  if (!isValidSchedule(league.schedule, league.teams)) league.schedule = buildSchedule(league.teams.map((t) => t.id));
  const next = md.round + 1 - league.seasonStartRound;
  if (!Number.isInteger(league.seasonStartRound) || next < 0 || next >= SEASON_ROUNDS) league.seasonStartRound = md.round + 1;
  if (!Array.isArray(league.seasons)) league.seasons = [];
  // v3.18.0: transfers, pensioner og bud (lofter – gemmet må ikke vokse uden grænse, QC)
  if (!Number.isInteger(league.nextPlayerSeq) || league.nextPlayerSeq < 1) league.nextPlayerSeq = 1;
  // v3.18.0 (Security): kun poster af den rigtige form – en delt fil med fx et navn som objekt væltede Liga-fanen
  const okEntry = (e) => e && typeof e === 'object' && !Array.isArray(e) && Object.values(e).every((v) => v == null || ['string', 'number', 'boolean'].includes(typeof v));
  for (const k of ['transferLog', 'retired', 'offers']) league[k] = Array.isArray(league[k]) ? league[k].filter(okEntry).slice(-LOG_CAP) : [];
  league.teams.forEach((team, idx) => {
    // v3.18.0 (QC): en trup uden for 18–25 låser aldrig ligaen ude – under 18 fyldes op med ungdom (besked), over 25 får en besked.
    // Kun en trup uden 11 spillere kan ikke repareres.
    if (!Array.isArray(team.squad) || team.squad.length < 11) { problems.push(`${team.name || team.id} har ${team.squad?.length ?? 0} spillere (forventet ${SQUAD_MIN}–${SQUAD_MAX})`); return; }
    if (team.squad.length < SQUAD_MIN) {
      const rng = derivedRng('sanitize-fill', team.id, team.squad.length), used = new Set(league.teams.flatMap((t) => (t.squad || []).map((p) => p.shortName)));
      const n0 = team.squad.length;
      while (team.squad.length < SQUAD_MIN) {
        league.nextPlayerSeq = Number.isInteger(league.nextPlayerSeq) && league.nextPlayerSeq > 0 ? league.nextPlayerSeq : 1;
        team.squad.push(generatePlayer(rng, neededLine(team), 'YOUTH', freeShirt(team), idx, used, 0, undefined, `plr_y${league.nextPlayerSeq++}`));
      }
      notes.push(`${team.name} havde ${n0} spillere – truppen er fyldt op med ${SQUAD_MIN - n0} ungdomsspillere.`);
    }
    if (team.squad.length > SQUAD_MAX) notes.push(`${team.name} har ${team.squad.length} spillere – over ${SQUAD_MAX}. Sælg eller lad spillere gå.`);
    for (const p of team.squad) {
      for (const [k, v] of Object.entries({ ...PLAYER_DEFAULTS, ...PLAYER_SEASON_DEFAULTS })) if (p[k] === undefined) p[k] = v;
      if (!p.dev || typeof p.dev !== 'object') p.dev = {};
      p.matchLog = Array.isArray(p.matchLog) ? p.matchLog.filter((e) => Array.isArray(e) && e.length === 11 && e.every((v) => v == null || Number.isFinite(v))).slice(-MATCH_LOG_CAP) : [];
      if (!Number.isFinite(p.potential)) p.potential = initialPotential(p);
      if (!Number.isFinite(p.weeklyWage)) p.weeklyWage = publicWage(p);
      if (!p.counterTactics) p.counterTactics = { vsPress: 15, vsLowBlock: 15, vsTrapLong: 15 };
      p.aerialPower = aerialBreakdown(p.heightCm, p.jumpingPower, p.skills.strength, p.skills.positioning).total;
    }
    assignPositions(team.squad); // kun spillere uden (gyldig) naturlig position
    const ids = new Set(team.squad.map((p) => p.id));
    const starters = defaultStarterIds(team.squad);
    const profile = BOT_PROFILES[idx] || BOT_PROFILES[0];
    team.tactics = fixTactics(team.tactics, starters, profile);
    if (!team.tactics.lineupSlots.every((id) => ids.has(id)) || new Set(team.tactics.lineupSlots).size !== 11) team.tactics.lineupSlots = starters;
    if (!Array.isArray(team.tacticPresets) || team.tacticPresets.length < 3) team.tacticPresets = [structuredClone(team.tactics), defaultTactics(starters, profile), defaultTactics(starters, profile)];
    team.tacticPresets = team.tacticPresets.map((t) => fixTactics(t, team.tactics.lineupSlots, profile));
    team.cashBalance ??= 5000000;
    // v3.18.0: bænken (de 7 udtagne), økonomi, transferliste, ungdomstilbud – en ugyldig bænk udtages igen automatisk
    const def = teamCareerDefaults(team.squad, team.tactics.lineupSlots), starters11 = new Set(team.tactics.lineupSlots);
    const bench = Array.isArray(team.matchBench) ? [...new Set(team.matchBench)].filter((id) => ids.has(id) && !starters11.has(id)) : null;
    team.matchBench = bench && bench.length <= 7 && (bench.length === 7 || bench.length === team.squad.length - 11) ? bench : def.matchBench;
    team.matchBenchAuto = team.matchBenchAuto !== false;
    if (!team.finance || typeof team.finance !== 'object') team.finance = def.finance;
    team.finance.ledger = Array.isArray(team.finance.ledger) ? team.finance.ledger.slice(-30) : [];
    team.finance.season ||= {};
    team.finance.form = Array.isArray(team.finance.form) ? team.finance.form.filter(Number.isFinite).slice(-3) : [];
    team.listed = Array.isArray(team.listed) ? team.listed.filter((id) => ids.has(id)) : [];
    // Et ungdomstilbud er en spiller: uden evner, kæde og id kan det ikke tages op (Security: et tomt tilbud i en delt fil brickede spillet)
    const validYouth = (y) => y && typeof y.id === 'string' && !ids.has(y.id) && ['GK', 'DEF', 'MID', 'ATT'].includes(y.line) && y.skills && Object.values(y.skills).every(Number.isFinite) && typeof y.shortName === 'string' && Number.isFinite(y.age);
    team.youthOffers = Array.isArray(team.youthOffers) ? team.youthOffers.filter(validYouth).slice(0, 2) : [];
    // Udskiftningsgrænsen (v3.13): gemt før v3.13 → holdets profil (dit hold 70 %); 0 = fra bevares.
    team.subsLimit = clampSubsLimit(team.subsLimit ?? profile.subs);
  });
  return { league, problems, notes };
}

// Sporets form (v3.16, match.js "Kampens spor"): v 1, højst 31 grundbilleder, højst 11 spillere pr. side, id'er som tal eller
// tekst, koordinater som endelige tal i 0–100.
const okPts = (list) => Array.isArray(list) && list.length <= 11 && list.every((q) => Array.isArray(q) && q.length === 3 && (typeof q[0] === 'number' || typeof q[0] === 'string') && Number.isFinite(q[1]) && Number.isFinite(q[2]) && q[1] >= 0 && q[1] <= 100 && q[2] >= 0 && q[2] <= 100);
const okBall = (b) => Array.isArray(b) && b.length === 2 && b.every((v) => Number.isFinite(v) && v >= 0 && v <= 100);
const nat = (x, max) => Number.isInteger(x) && x >= 0 && x <= max;
export const isValidClock = (c) => !!c && typeof c === 'object' && nat(c.m, 90) && (c.plus === undefined || nat(c.plus, 8));
export const isValidStoppage = (st) => Array.isArray(st) && st.length === 2 && st.every((x) => x && nat(x.S, 8) && nat(x.var, 8) && x.var <= x.S);
export function isValidTrace(tr) {
  return !!tr && tr.v === 1 && Array.isArray(tr.frames) && tr.frames.length <= 31 && Array.isArray(tr.moments) && tr.moments.length <= 400
    && [...tr.frames, ...tr.moments].every((f) => f && Number.isInteger(f.t) && f.t >= 0 && f.t <= 30 && okBall(f.ball) && okPts(f.h) && okPts(f.a))
    && tr.moments.every((m) => Number.isInteger(m.ev) && (m.side === 'h' || m.side === 'a'));
}
