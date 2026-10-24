// Runder: parring, afvikling og bogføring (docs/spec.md §1, §5–7).
// Rettet ift. v2.5b: alt bogføres FØR der gemmes; skader, der fandtes før runden, heles
// med én kamp (spilleren missede kampen), og nye skader lægges på bagefter – så en
// 1-kamps skade ikke forsvinder i samme runde.
import { bookMatchStats, roundHistory, HISTORY_MAX } from './stats.js';
import { simulateMatch } from './match.js';
import { starsFromRating, starNoise } from './ratings.js';
import { applyCounterXp } from './counter.js';
import { buildGazette } from './gazette.js';
import { SEASON_ROUNDS, seasonRoundOf } from './schedule.js';
import { emptyStanding } from './generator.js';
import { PLAYER_SEASON_DEFAULTS, PLAYER_SEASON_FIELDS, TEAM_STAT_FIELDS } from './stats.js';
import { REST_BENCH, afterMatchFreshness } from './freshness.js';

// Næste rundes kampe efter programmet (v3.11) som [hjemmeIdx, udeIdx]. Kampen med et
// menneskestyret hold står først: avisen, afspilningen og Kamp-fanens første kort bygger på det.
export function pairRound(league) {
  const idx = new Map(league.teams.map((t, i) => [t.id, i]));
  const r = seasonRoundOf(league, league.leagueMetadata.round + 1);
  const pairs = league.schedule[r - 1].map(([a, b]) => [idx.get(a), idx.get(b)]);
  const human = (p) => p.some((i) => !league.teams[i].isBot);
  return [...pairs.filter(human), ...pairs.filter((p) => !human(p))];
}

// Tabellen FØR runden – til "Rundens overraskelse" (tidligst sæsonens runde 3; før er pladserne tilfældige).
export function tableBefore(league, round) {
  if (seasonRoundOf(league, round) < 3) return null;
  return Object.fromEntries(sortStandings(league.leagueMetadata.standings).map((s, i) => [s.teamId, { pos: i + 1, points: s.points }]));
}

export const playRound = (league, rng) => playPairs(league, pairRound(league), rng);

// Den gamle parring (før v3.11): hold 0 hjemme mod en fast modstander, de øvrige i rækkefølge.
// Kun til måleværktøjet og tests, så målingerne kan gentages tal for tal med playPairs.
export function fixedPairs(league, opponentIdx) {
  const rest = league.teams.map((_, i) => i).filter((i) => i !== 0 && i !== opponentIdx), pairs = [[0, opponentIdx]];
  for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
  return pairs;
}

// Spiller faste par – måleværktøjet og tests styrer selv parringen.
export function playPairs(league, pairs, rng) {
  const round = (league.leagueMetadata.round || 0) + 1;
  const matches = pairs.map(([h, a]) => simulateMatch(league.teams[h], league.teams[a], rng, { round }));
  // Hvert mål ved, hvilken kamp i runden det faldt i (avisen linker til referatet, v3.7.1).
  matches.forEach((m, i) => m.goalsPool.forEach((g) => { g.matchIdx = i; }));
  return { round, matches, gazette: buildGazette(matches, { positions: tableBefore(league, round), round }) };
}

function applyStanding(standings, m) {
  const sh = standings.find((s) => s.teamId === m.homeId), sa = standings.find((s) => s.teamId === m.awayId);
  const hG = m.homeGoals, aG = m.awayGoals;
  sh.played++; sa.played++;
  sh.goalsFor += hG; sh.goalsAgainst += aG; sa.goalsFor += aG; sa.goalsAgainst += hG;
  sh.varNet += m.homeVarNet; sa.varNet -= m.homeVarNet;
  if (hG > aG) { sh.won++; sh.points += 3; sa.lost++; }
  else if (hG < aG) { sa.won++; sa.points += 3; sh.lost++; }
  else { sh.drawn++; sa.drawn++; sh.points++; sa.points++; }
}

export const sortStandings = (standings) => standings.slice().sort((a, b) =>
  b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor);

export const SCOUTING_PER_PLAYER = 20;


// Bogfører en afviklet runde i ligaen (muterer league) – kaldes før der gemmes.
// Idempotent: en runde, der allerede er bogført (dobbeltklik, genindlæsning midt i
// afspilning), afvises, så den aldrig tæller to gange.
export function commitRound(league, result, rng) {
  const expected = (league.leagueMetadata.round || 0) + 1;
  if (result.round !== expected) throw new Error(`Runde ${result.round} kan ikke bogføres – ligaen venter på runde ${expected}.`);
  const byId = new Map(league.teams.map((t) => [t.id, t]));
  const players = new Map(league.teams.flatMap((t) => t.squad.map((p) => [p.id, p])));
  const played = new Set();

  for (const m of result.matches) {
    applyStanding(league.leagueMetadata.standings, m);
    for (const [oppId, list] of [[m.awayId, m.ratings.home], [m.homeId, m.ratings.away]]) {
      const opp = byId.get(oppId);
      for (const r of list) {
        const p = players.get(r.playerId);
        played.add(p.id);
        p.lastRating = r.rating;
        p.ratingSum += r.rating; p.ratingGames += 1;
        p.publicStars = starsFromRating(p.ratingSum / p.ratingGames, starNoise(rng));
        p.counterTactics = applyCounterXp(p.counterTactics, p.age, opp, r.gainedCounterXp);
        // Støj ±2 på prisen, så udholdenheden ikke kan regnes baglæns af den offentlige friskhed.
        p.freshness = afterMatchFreshness(p.freshness, r.distanceKm ?? 0, p.skills.stamina, Math.round(rng.next() * 4 - 2));
        // Sæsontal til spillerkortet (kun ejeren ser dem): km pr. 90 min og bedste topfart.
        if (r.distanceKm > 0) { p.distanceSum += r.distanceKm; p.minutesSum += Math.max(0, (r.minOut ?? 90) - (r.minIn ?? 1)); }
        // HI-andelen har sin egen nævner: kun km fra kampe med HI-data (fra v3.7.1), så
        // ligaer fra v3.7.0 ikke viser en for lav sæsonandel.
        if (r.distanceKm > 0 && r.hiKm != null) { p.hiKmSum += r.hiKm; p.hiDistSum += r.distanceKm; }
        if (r.topSpeed > p.topSpeedMax) p.topSpeedMax = r.topSpeed;
      }
    }
    // Observationer tilfalder de menneskestyrede hold (de kan læse alle rundens referater).
    for (const viewer of league.teams.filter((t) => !t.isBot)) {
      const book = (league.scouting[viewer.id] ||= {});
      for (const o of m.observations) {
        const list = (book[o.playerId] ||= []);
        list.unshift(`[Runde ${result.round}] ${o.text}`);
        list.length = Math.min(list.length, SCOUTING_PER_PLAYER);
      }
    }
  }
  for (const p of players.values()) {
    if (!played.has(p.id)) p.freshness = Math.min(100, p.freshness + REST_BENCH);
    // Skader fra før runden heles én kamp; rundens nye skader lægges på nedenfor.
    p.injuryMatchesLeft = Math.max(0, p.injuryMatchesLeft - 1);
  }
  for (const m of result.matches) for (const inj of m.injuries) players.get(inj.playerId).injuryMatchesLeft = inj.matches;

  // Sæsonstatistik (v3.10) – fra league.statsFromRound.
  for (const m of result.matches) bookMatchStats(league, m);
  (league.history ||= []).push(roundHistory(result.round, result.matches));
  if (league.history.length > HISTORY_MAX) league.history.splice(0, league.history.length - HISTORY_MAX);
  league.leagueMetadata.round = result.round;
  league.lastRound = { round: result.round, matches: result.matches, gazette: result.gazette };
  if (seasonRoundOf(league, result.round) === SEASON_ROUNDS) {
    const end = endSeason(league, result.round, true);
    if (result.gazette) result.gazette.seasonEnd = end;
  }
  return league;
}

// Sæsonslut (v3.11): tabellen og sæsonopgørelsen arkiveres, og tabel og sæsonstatistik starter
// forfra. Spillerne, friskheden og ligaens forløb (history) bevares. programmed = false for
// sæsonen før kampprogrammet (migreringen fra skema 5).
export function endSeason(league, toRound, programmed) {
  const md = league.leagueMetadata;
  // Den seneste sæsons tabel har også VAR ± og holdtallene (Liga-statistikken viser dem, til næste sæsons runde 1 er
  // spillet); ældre sæsoner skæres ned til de faste felter, så gemmet ikke vokser med hver sæson.
  for (const s of league.seasons || []) if (s.table) s.table = s.table.map(baseRow);
  const table = sortStandings(md.standings).map((s) => ({ ...baseRow(s), varNet: s.varNet ?? 0, ...Object.fromEntries(TEAM_STAT_FIELDS.map((k) => [k, s[k] ?? 0])) }));
  const teamOf = new Map(league.teams.flatMap((t) => t.squad.map((p) => [p.id, t])));
  const all = league.teams.flatMap((t) => t.squad);
  const who = (p) => (p ? { playerId: p.id, teamId: teamOf.get(p.id).id, teamName: teamOf.get(p.id).name, shirtNumber: p.shirtNumber, shortName: p.shortName, goals: p.sGoals, motm: p.sMotm } : null);
  const byGoals = (a, b) => b.sGoals - a.sGoals || b.sAssists - a.sAssists;
  const mine = league.teams.find((t) => !t.isBot);
  const hist = (league.history || []).filter((r) => r.round >= league.seasonStartRound && r.round <= toRound);
  const summary = {
    seasonNumber: md.seasonNumber, fromRound: league.seasonStartRound, toRound, programmed, statsFrom: league.statsFromRound ?? league.seasonStartRound,
    table, champion: table[0] ? { ...decider(table[0]), teamId: table[0].teamId, runnerUp: table[1] ? decider(table[1]) : null } : null,
    myPos: mine ? table.findIndex((s) => s.teamId === mine.id) + 1 : null,
    topScorer: who(all.filter((p) => p.sGoals > 0).sort(byGoals)[0]),
    // Dit holds bedste: flest kåringer som kampens spiller, så mål.
    myBest: mine ? who(mine.squad.filter((p) => p.sGames > 0).sort((a, b) => b.sMotm - a.sMotm || byGoals(a, b))[0]) : null,
    goals: hist.reduce((a, r) => a + r.goals, 0), matches: hist.reduce((a, r) => a + r.matches, 0),
  };
  (league.seasons ||= []).push(summary);
  // Spillernes sæsontal for netop denne sæson (kun den seneste – overskrives ved næste sæsonslut). Kun felter ≠ 0.
  league.lastSeasonStats = { seasonNumber: md.seasonNumber, players: Object.fromEntries(all.map((p) => [p.id, Object.fromEntries(PLAYER_SEASON_FIELDS.filter((k) => p[k]).map((k) => [k, p[k]]))]).filter(([, v]) => Object.keys(v).length)) };
  md.standings = league.teams.map(emptyStanding);
  for (const t of league.teams) for (const p of t.squad) Object.assign(p, PLAYER_SEASON_DEFAULTS);
  md.seasonNumber = (md.seasonNumber || 1) + 1;
  league.statsFromRound = toRound + 1;
  league.seasonStartRound = toRound + 1;
  return summary;
}

const baseRow = ({ teamId, teamName, played, won, drawn, lost, goalsFor, goalsAgainst, points }) => ({ teamId, teamName, played, won, drawn, lost, goalsFor, goalsAgainst, points });
// Det, sortStandings afgør på: point → målforskel → scorede mål.
const decider = (s) => ({ teamName: s.teamName, points: s.points, goalDiff: s.goalsFor - s.goalsAgainst, goalsFor: s.goalsFor });

// Lige efter sæsonslut (ingen runde spillet i den nye sæson): den afsluttede sæsons arkiv – ellers null.
// En "sæson uden program" (migreringen fra skema 5) er ikke en rigtig sæson og tæller ikke.
export function seasonJustEnded(league) {
  const last = league.seasons?.at(-1);
  return last?.programmed && last.table?.length && league.leagueMetadata.round + 1 === league.seasonStartRound ? last : null;
}

// Mesterteksten siger, hvad der afgjorde det (samme rækkefølge som sortStandings). myPos = seerens placering:
// er seeren nr. 2, hedder det "I endte begge". Et arkiv fra før v3.16.3 (uden målforskel/nr. 2) får point-teksten.
// Uden afsluttende punktum – kalderen sætter det.
const signed = (n) => (n > 0 ? `+${n}` : String(n));
export function championText(c, myPos = null) {
  const base = `${c.teamName} er mester med ${c.points} point`, r = c.runnerUp;
  if (!r || c.goalDiff == null || r.goalDiff == null || r.points !== c.points) return base;
  const both = myPos === 2 ? 'I endte begge' : `${c.teamName} og ${r.teamName} endte begge`;
  if (r.goalDiff !== c.goalDiff) return `${c.teamName} er mester på målforskel – ${both} på ${c.points} point`;
  if (r.goalsFor !== c.goalsFor) return `${c.teamName} er mester på flest scorede mål – ${both} på ${c.points} point og målforskel ${signed(c.goalDiff)}`;
  return `${c.teamName} er mester – ${both} på ${c.points} point, målforskel ${signed(c.goalDiff)} og ${c.goalsFor} scorede mål`;
}
