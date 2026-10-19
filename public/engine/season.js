// Runder: parring, afvikling og bogføring (docs/spec.md §1, §5–7).
// Rettet ift. v2.5b: alt bogføres FØR der gemmes; skader, der fandtes før runden, heles
// med én kamp (spilleren missede kampen), og nye skader lægges på bagefter – så en
// 1-kamps skade ikke forsvinder i samme runde.
import { simulateMatch } from './match.js';
import { starsFromRating, starNoise } from './ratings.js';
import { applyCounterXp } from './counter.js';
import { buildGazette } from './gazette.js';

// v2.5b-parring: dit hold (index 0) hjemme mod den valgte modstander, de øvrige i rækkefølge.
// Erstattes af et Berger-program (spec §10.7) med samme signatur.
export function pairRound(league, opponentIdx) {
  const teams = league.teams;
  const pairs = [[0, opponentIdx]];
  const rest = teams.map((_, i) => i).filter((i) => i !== 0 && i !== opponentIdx);
  for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
  return pairs;
}

// Tabellen FØR runden – til "Rundens overraskelse" (tidligst runde 3; før er pladserne tilfældige).
export function tableBefore(league, round) {
  if (round < 3) return null;
  return Object.fromEntries(sortStandings(league.leagueMetadata.standings).map((s, i) => [s.teamId, { pos: i + 1, points: s.points }]));
}

export function playRound(league, opponentIdx, rng) {
  const round = (league.leagueMetadata.round || 0) + 1;
  const matches = pairRound(league, opponentIdx).map(([h, a]) => simulateMatch(league.teams[h], league.teams[a], rng, { round }));
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

// Friskhed (v3.7, brugeren: "kun 3 af mine spillere der har under 100% i friskhed"; før
// −4…9 og straks +8 igen). Kampen koster efter løbet distance – højt pres koster altså mere –
// og udholdenhed dæmper: km·(1,5 − STA·0,03). Restitution til næste runde: 35 % af det, der
// mangler op til 100 (ikke brugt: +15 oveni) – jo mere træt, jo hurtigere kommer han sig.
// Ligevægt for en fast starter f = 100 − 1,86·pris (QC: med fast +5 endte alle på bunden, og
// rotation blev en fast afgift): MID STA 10 (pris ≈13) ≈76 %, STA 20 (≈10) ≈81 %, målmand ≈85 %.
export const REST_SHARE = 0.35, REST_BENCH = 15, FRESH_FLOOR = 50;
export const matchCost = (km, stamina) => Math.round(km * (1.5 - stamina * 0.03));
export const restore = (f) => Math.min(100, f + Math.round(REST_SHARE * (100 - f)));
export const afterMatchFreshness = (fresh, km, stamina, noise = 0) => Math.max(FRESH_FLOOR, restore(fresh - Math.max(0, matchCost(km, stamina) + noise)));

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
        if (r.distanceKm > 0) { p.distanceSum += r.distanceKm; p.hiKmSum += r.hiKm ?? 0; p.minutesSum += Math.max(0, (r.minOut ?? 90) - (r.minIn ?? 1)); }
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

  league.leagueMetadata.round = result.round;
  league.lastRound = { round: result.round, matches: result.matches, gazette: result.gazette };
  return league;
}
