// Reparerer en indlæst liga additivt (som v2.5b's sanitizeLeagueData): manglende felter får
// standardværdier, eksisterende data røres ikke. Grundlaget for migreringsreglen i
// docs/spec.md §9 – en ny version må aldrig slette ligaen.
import { clampSubsLimit } from './freshness.js';
import { MAX_RULES } from './match-rules.js';
import { TEAM_STAT_DEFAULTS, PLAYER_SEASON_DEFAULTS } from './stats.js';
import { FORMATIONS } from './formations.js';
import { buildSchedule, isValidSchedule, SEASON_ROUNDS } from './schedule.js';
import { defaultTactics, defaultStarterIds, emptyStanding, BOT_PROFILES, aerialBreakdown, assignPositions } from './generator.js';

const PLAYER_DEFAULTS = { freshness: 100, injuryMatchesLeft: 0, lastRating: 0, ratingSum: 0, ratingGames: 0, publicStars: 0, seasonAgeCounter: 1, archetype: null, distanceSum: 0, minutesSum: 0, topSpeedMax: 0, hiKmSum: 0, hiDistSum: 0 };

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
  const problems = [];
  if (!league || !Array.isArray(league.teams)) return { league: null, problems: ['Ligaen mangler hold'] };
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
  league.teams.forEach((team, idx) => {
    if (!Array.isArray(team.squad) || team.squad.length !== 18) { problems.push(`${team.name || team.id} har ${team.squad?.length ?? 0} spillere (forventet 18)`); return; }
    for (const p of team.squad) {
      for (const [k, v] of Object.entries({ ...PLAYER_DEFAULTS, ...PLAYER_SEASON_DEFAULTS })) if (p[k] === undefined) p[k] = v;
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
    // Udskiftningsgrænsen (v3.13): gemt før v3.13 → holdets profil (dit hold 70 %); 0 = fra bevares.
    team.subsLimit = clampSubsLimit(team.subsLimit ?? profile.subs);
  });
  return { league, problems };
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
