// Reparerer en indlæst liga additivt (som v2.5b's sanitizeLeagueData): manglende felter får
// standardværdier, eksisterende data røres ikke. Grundlaget for migreringsreglen i
// docs/spec.md §9 – en ny version må aldrig slette ligaen.
import { FORMATIONS } from './formations.js';
import { defaultTactics, emptyStanding, BOT_PROFILES, aerialBreakdown } from './generator.js';

const PLAYER_DEFAULTS = { freshness: 100, injuryMatchesLeft: 0, lastRating: 0, ratingSum: 0, ratingGames: 0, publicStars: 0, seasonAgeCounter: 1, archetype: null };

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
  t.conditionalRules = t.conditionalRules.slice(0, 5);
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
  league.scouting ||= {};
  league.lastRound ??= null;
  league.teams.forEach((team, idx) => {
    if (!Array.isArray(team.squad) || team.squad.length !== 18) { problems.push(`${team.name || team.id} har ${team.squad?.length ?? 0} spillere (forventet 18)`); return; }
    for (const p of team.squad) {
      for (const [k, v] of Object.entries(PLAYER_DEFAULTS)) if (p[k] === undefined) p[k] = v;
      if (!p.counterTactics) p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 };
      p.aerialPower = aerialBreakdown(p.heightCm, p.jumpingPower, p.skills.strength, p.skills.positioning).total;
    }
    const ids = new Set(team.squad.map((p) => p.id));
    const starters = team.squad.slice(0, 11).map((p) => p.id);
    const profile = BOT_PROFILES[idx] || BOT_PROFILES[0];
    team.tactics = fixTactics(team.tactics, starters, profile);
    if (!team.tactics.lineupSlots.every((id) => ids.has(id)) || new Set(team.tactics.lineupSlots).size !== 11) team.tactics.lineupSlots = starters;
    if (!Array.isArray(team.tacticPresets) || team.tacticPresets.length < 3) team.tacticPresets = [structuredClone(team.tactics), defaultTactics(starters, profile), defaultTactics(starters, profile)];
    team.tacticPresets = team.tacticPresets.map((t) => fixTactics(t, team.tactics.lineupSlots, profile));
    team.cashBalance ??= 5000000;
  });
  return { league, problems };
}
