// Runder: parring, afvikling og bogføring (docs/spec.md §1, §5–7).
// Rettet ift. v2.5b: alt bogføres FØR der gemmes; skader, der fandtes før runden, heles
// med én kamp (spilleren missede kampen), og nye skader lægges på bagefter – så en
// 1-kamps skade ikke forsvinder i samme runde.
import { autoMatchBench, logMatch, FOCUS, focusSkills, validFocus, ageTrain, roomOf, addXp, KEY_SKILLS, MATCH_XP, TRAIN_FRESH_FLOOR, TRAIN_INJURY_MATCHES, PLAYED_RELIEF, derivedRng,
  attendance, wagesPerRound, formOf, bookLedger, TV_PER_ROUND, TICKET_PRICE, PRIZE, NEW_LEAGUE_PLACE,
  willRetire, declineSkills, seasonGrowth, trainedSkills, refreshValue, publicWage, freeShirt, neededLine, botYouthTake, repairLineup, YOUTH_OFFERS, SQUAD_MIN, RETIRED_CAP, LINE_MIN } from './career.js';
import { aerialBreakdown, isArchetypeUnlocked, generatePlayer, neededPosition } from './generator.js';
import { bookMatchStats, roundHistory, HISTORY_MAX } from './stats.js';
import { simulateMatch } from './match.js';
import { openWindow, windowOf } from './transfers.js';
import { starsFromRating, starNoise } from './ratings.js';
import { applyCounterXp } from './counter.js';
import { buildGazette } from './gazette.js';
import { SEASON_ROUNDS, seasonRoundOf } from './schedule.js';
import { emptyStanding } from './generator.js';
import { PLAYER_SEASON_DEFAULTS, PLAYER_SEASON_FIELDS, TEAM_STAT_FIELDS } from './stats.js';
import { REST_BENCH, afterMatchFreshness } from './freshness.js';
import { applyChemistry, decayChemistry, pruneChemistry, leagueChemRef, chemRefOf, chemSnapshot, strongChanges } from './chemistry.js';

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

export const playRound = (league, rng, opts) => playPairs(league, pairRound(league), rng, opts);

// Den gamle parring (før v3.11): hold 0 hjemme mod en fast modstander, de øvrige i rækkefølge.
// Kun til måleværktøjet og tests, så målingerne kan gentages tal for tal med playPairs.
export function fixedPairs(league, opponentIdx) {
  const rest = league.teams.map((_, i) => i).filter((i) => i !== 0 && i !== opponentIdx), pairs = [[0, opponentIdx]];
  for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
  return pairs;
}

// Spiller faste par – måleværktøjet og tests styrer selv parringen.
// opts.replay (v3.24.3, kamp-id – kun klienten): en gengivelsespakke pr. kamp – de to hold, som de stod lige før kampen
// (efter bænkudtagelsen, før commitRound ændrer dem), rng-tilstanden lige før kampen og kampens opts. simulateMatch er ren
// over holdene og trækker kun tilfældighed fra rng, så simulateMatch(home, away, createRng(rngState), opts) giver samme kamp.
export function playPairs(league, pairs, rng, { replay = false } = {}) {
  const round = (league.leagueMetadata.round || 0) + 1;
  // lastOfSeason: friskheden følger med over sæsonskiftet – referatet siger "til første runde i næste sæson" (v3.16.7)
  const lastOfSeason = seasonRoundOf(league, round) === SEASON_ROUNDS;
  // Kamptruppen (v3.18.0): botterne – og dit hold med "Udtag automatisk" – udtager bænken før runden (intet rng)
  for (const t of league.teams) if (t.isBot || t.matchBenchAuto !== false) autoMatchBench(t);
  const chemRef = chemRefOf(league);   // samspil (v3.24.0): virkningen måles mod ligaens snit
  const mopts = { round, lastOfSeason, chemRef }, packs = [];
  const matches = pairs.map(([h, a]) => {
    if (replay) packs.push({ v: 1, home: structuredClone(league.teams[h]), away: structuredClone(league.teams[a]), rngState: rng.state(), opts: { ...mopts } });
    return simulateMatch(league.teams[h], league.teams[a], rng, mopts);
  });
  // Hvert mål ved, hvilken kamp i runden det faldt i (avisen linker til referatet, v3.7.1).
  matches.forEach((m, i) => m.goalsPool.forEach((g) => { g.matchIdx = i; }));
  const out = { round, matches, gazette: buildGazette(matches, { positions: tableBefore(league, round), round }) };
  if (replay) out.replay = { round, packs };
  return out;
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
const minutesOf = (result) => new Map(result.matches.flatMap((m) => [...m.ratings.home, ...m.ratings.away]).map((r) => [r.playerId, Math.max(0, (r.minOut ?? 90) - ((r.minIn ?? 1) <= 1 ? 0 : r.minIn))]));
// En evne steg: luftduellen og arketypen regnes straks igen – ikke først ved næste indlæsning (QC B4; en låst-op arketype forbliver)
export function afterSkillChange(p) {
  p.aerialPower = aerialBreakdown(p.heightCm, p.jumpingPower, p.skills.strength, p.skills.positioning).total;
  if (p.archetype && !p.archetype.isUnlocked) p.archetype.isUnlocked = isArchetypeUnlocked(p.archetype, p);
}
// Træning efter runden (v3.18.0): hver spillers fokus (botterne: Alsidig) – friskhed, fremgang, en lille skaderisiko –
// og kamp-xp til nøgle-evnerne for de spillede minutter. Tilfældighed fra en afledt rng pr. spiller (rører ikke rundens).
// Dit holds rapport (fremgang og træningsskader) står i league.trainingReport (kun ejeren ser den).
export function trainRound(league, result, minutes) {
  const report = {};
  for (const team of league.teams) {
    const rep = team.isBot ? null : (report[team.id] = { round: result.round, gains: [], injuries: [] });
    for (const p of team.squad) {
      const injured = p.injuryMatchesLeft > 0;
      const f = team.isBot || !validFocus(p, p.trainingFocus) ? FOCUS.GENERAL : FOCUS[p.trainingFocus];
      const gains = [];
      const mins = minutes.get(p.id) ?? 0;
      if (mins > 0) for (const s of KEY_SKILLS[p.line]) gains.push(...addXp(p, s, MATCH_XP * mins / 90, afterSkillChange));
      if (!injured) {
        // Den, der spillede, træner restitution: prisen er 2 mindre (Alsidig: ingen) – ellers trak træningen hele ligaens friskhed
        // ned, og træthedsskiftene før pausen steg fra 19 % til 29 % (measure-duels skift)
        const cost = f.fresh < 0 && mins > 0 ? Math.min(0, f.fresh + PLAYED_RELIEF) : f.fresh;
        p.freshness = cost < 0 ? Math.max(Math.min(p.freshness, TRAIN_FRESH_FLOOR), p.freshness + cost) : Math.min(100, p.freshness + cost);
        if (f.rate > 0) { const skills = focusSkills(p, f); for (const s of skills) gains.push(...addXp(p, s, f.rate * ageTrain(p.age) * roomOf(p), afterSkillChange)); }
        const r = derivedRng('train', result.round, p.id);
        if (f.inj > 0 && r.chance(f.inj)) { p.injuryMatchesLeft = TRAIN_INJURY_MATCHES[Math.floor(r.next() * TRAIN_INJURY_MATCHES.length)]; rep?.injuries.push(p.id); }
      }
      if (rep) for (const s of gains) { rep.gains.push({ id: p.id, skill: s }); league.devTally ||= {}; league.devTally[p.id] = (league.devTally[p.id] ?? 0) + 1; }
    }
  }
  league.trainingReport = report;
}

// Placering før runden til tilskuertallet: sæsonens runde 1–2 = sidste sæsons slutplacering (ny liga: 4,5 for alle)
export function placesBefore(league, round) {
  if (seasonRoundOf(league, round) <= 2) {
    const t = league.seasons?.at(-1)?.table;
    return new Map(league.teams.map((x) => { const i = t ? t.findIndex((s) => s.teamId === x.id) : -1; return [x.id, i >= 0 ? i + 1 : NEW_LEAGUE_PLACE]; }));
  }
  return new Map(sortStandings(league.leagueMetadata.standings).map((s, i) => [s.teamId, i + 1]));
}
// Rundens økonomi (v3.18.0): før tabellen opdateres – tilskuerne kommer efter stillingen og formen, som de var før kampen
export function bookRoundFinances(league, result) {
  const places = placesBefore(league, result.round), season = league.leagueMetadata.seasonNumber ?? 1;
  const byId = new Map(league.teams.map((t) => [t.id, t]));
  const entry = new Map(league.teams.map((t) => [t.id, { r: result.round, s: season, tv: TV_PER_ROUND, wages: -wagesPerRound(t) }]));
  for (const m of result.matches) {
    const att = attendance(places.get(m.homeId), places.get(m.awayId), formOf(byId.get(m.homeId)));
    Object.assign(entry.get(m.homeId), { att, gate: att * TICKET_PRICE });
  }
  for (const t of league.teams) bookLedger(t, entry.get(t.id));
  // Formen: point i de seneste 3 kampe
  for (const m of result.matches) {
    const pts = (a, b) => (a > b ? 3 : a === b ? 1 : 0);
    for (const [id, p] of [[m.homeId, pts(m.homeGoals, m.awayGoals)], [m.awayId, pts(m.awayGoals, m.homeGoals)]]) {
      const f = byId.get(id).finance; f.form = [...(f.form ?? []), p].slice(-3);
    }
  }
}
// Præmien ved sæsonslut efter slutplaceringen – kun fra commitRound (MIGRATIONS[5] kalder endSeason, F1)
function payPrizes(league, round, table) {
  const byId = new Map(league.teams.map((t) => [t.id, t]));
  table.forEach((s, i) => { const t = byId.get(s.teamId); if (t) bookLedger(t, { r: round, s: league.seasons.at(-1)?.seasonNumber ?? 1, prize: PRIZE[i] ?? 0 }); });
  for (const t of league.teams) { t.finance.lastSeason = t.finance.season; t.finance.season = {}; }
}

export function commitRound(league, result, rng) {
  const expected = (league.leagueMetadata.round || 0) + 1;
  if (result.round !== expected) throw new Error(`Runde ${result.round} kan ikke bogføres – ligaen venter på runde ${expected}.`);
  const byId = new Map(league.teams.map((t) => [t.id, t]));
  const teamIdx = new Map(league.teams.map((t, i) => [t.id, i]));
  const players = new Map(league.teams.flatMap((t) => t.squad.map((p) => [p.id, p])));
  const played = new Set();
  // Ungdomstilbud, du ikke har taget stilling til, går ved næste runde ("Lad gå" er standard)
  for (const t of league.teams) if (t.youthOffers?.length) t.youthOffers = [];
  league.offers = [];   // botternes bud gælder kun, mens vinduet er åbent
  bookRoundFinances(league, result);
  const mine = league.teams.find((t) => !t.isBot), chemBefore = mine ? chemSnapshot(mine) : null;   // v3.24.2: stærke par før runden

  for (const m of result.matches) {
    applyStanding(league.leagueMetadata.standings, m);
    // Samspil (v3.23.0): fælles minutter på nabopladser i den formation, holdet startede i
    for (const [id, list] of [[m.homeId, m.ratings.home], [m.awayId, m.ratings.away]]) applyChemistry(byId.get(id), list, m.startFormations?.[id === m.homeId ? 'home' : 'away'] ?? byId.get(id).tactics.baseFormation, result.round);
    for (const [oppId, list] of [[m.awayId, m.ratings.home], [m.homeId, m.ratings.away]]) {
      const opp = byId.get(oppId);
      for (const r of list) {
        const p = players.get(r.playerId);
        played.add(p.id);
        p.lastRating = r.rating;
        p.ratingSum += r.rating; p.ratingGames += 1;
        p.publicStars = starsFromRating(p.ratingSum / p.ratingGames, starNoise(rng));
        // Kamphistorik (v3.18.0): stemplet pr. kamp – karakteren privat, stjernerne (kampens egne) offentlige
        p.careerGames = (p.careerGames ?? 0) + 1;
        logMatch(p, [league.leagueMetadata.seasonNumber ?? 1, seasonRoundOf(league, result.round), teamIdx.get(m.homeId), teamIdx.get(m.awayId), m.homeGoals, m.awayGoals,
          Math.max(0, (r.minOut ?? 90) - ((r.minIn ?? 1) <= 1 ? 0 : r.minIn)), r.rating, r.stars ?? 0, r.goals ?? 0, r.assists ?? 0]);
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
  for (const t of league.teams) decayChemistry(t, result.round);
  // Træning (v3.18.0) – efter kampene og skaderne, før næste runde
  trainRound(league, result, minutesOf(result));

  // Sæsonstatistik (v3.10) – fra league.statsFromRound.
  for (const m of result.matches) bookMatchStats(league, m);
  (league.history ||= []).push(roundHistory(result.round, result.matches));
  if (league.history.length > HISTORY_MAX) league.history.splice(0, league.history.length - HISTORY_MAX);
  league.leagueMetadata.round = result.round;
  league.lastRound = { round: result.round, matches: result.matches, gazette: result.gazette };
  if (seasonRoundOf(league, result.round) === SEASON_ROUNDS) {
    const end = endSeason(league, result.round, true);
    payPrizes(league, result.round, league.seasons.at(-1).table);
    seasonTurnover(league);
    for (const t of league.teams) pruneChemistry(t);   // pension: hans par forsvinder
    openWindow(league);   // transfervinduet ved sæsonslut
    if (result.gazette) result.gazette.seasonEnd = end;
  } else if (seasonRoundOf(league, result.round) === 7) openWindow(league);   // vinduet før runde 8
  // Ligaens snit af samspil – efter sæsonskiftet og vinduets handler (QC: ellers forældet i en ny sæsons første runde)
  league.leagueMetadata.chemRef = leagueChemRef(league);
  const rep = mine && league.trainingReport?.[mine.id];
  if (rep) rep.strong = strongChanges(mine, chemBefore, league.leagueMetadata.chemRef, result.round);
  return league;
}

// Sæsonskiftet (v3.18.0) – kun fra commitRound, efter endSeason (MIGRATIONS[5] kalder endSeason; ingen ældes ved en migrering, F1).
// Pension → alle +1 år, aldersfald, ny værdi og genforhandlet løn → ungdomstilbud (botterne tager selv op) → opstillingerne repareres.
// Alt tilfældigt med afledt rng pr. spiller/hold og sæson. league.turnoverReport er grundlaget for sæsonrapporten.
export function seasonTurnover(league) {
  const md = league.leagueMetadata, season = (md.seasonNumber ?? 2) - 1;
  md.footballYear = (md.footballYear ?? 1) + 1;
  const mine = league.teams.find((t) => !t.isBot);
  const report = { season, retired: [], youthTaken: [], best: [], aged: true };
  const goneLine = new Map(), gone = new Set();
  for (const team of league.teams) {
    team.squad = team.squad.filter((p) => {
      if (!willRetire(p, season)) return true;
      goneLine.set(p.id, p.line); gone.add(p.id);
      report.retired.push({ id: p.id, name: p.name, shortName: p.shortName, nr: p.shirtNumber, teamId: team.id, age: p.age, games: p.careerGames ?? 0, line: p.line });
      return false;
    });
  }
  const wagesBefore = mine ? wagesPerRound(mine) : 0;
  for (const team of league.teams) for (const p of team.squad) {
    const grew = seasonGrowth(p, season, afterSkillChange);
    if (grew.length && !team.isBot) { league.devTally ||= {}; league.devTally[p.id] = (league.devTally[p.id] ?? 0) + grew.length; }
    p.age += 1; p.seasonAgeCounter = (p.seasonAgeCounter ?? 1) + 1;
    if (declineSkills(p, season, trainedSkills(p, team.isBot)).length) afterSkillChange(p);
    refreshValue(p); p.weeklyWage = publicWage(p);   // lønnen genforhandles ved hvert sæsonslut (QC B6, Spilfører)
  }
  league.retired = [...(league.retired ?? []), ...report.retired.map(({ id, name, teamId, age, games }) => ({ id, name, teamId, age, games, season }))].slice(-RETIRED_CAP);
  // Ungdom
  const used = new Set(league.teams.flatMap((t) => t.squad.map((p) => p.shortName)));
  const ids = new Set(league.teams.flatMap((t) => t.squad.map((p) => p.id)));
  const nextId = () => { let id; do id = `plr_y${league.nextPlayerSeq++}`; while (ids.has(id)); ids.add(id); return id; };
  league.teams.forEach((team, ti) => {
    const rng = derivedRng('youth', season, team.id), offers = [];
    const prefer = report.retired.filter((r) => r.teamId === team.id).map((r) => r.line);
    const make = () => { const line = neededLine(team, offers, prefer); const y = generatePlayer(rng, line, 'YOUTH', freeShirt(team, offers), ti, used, 0, neededPosition(team, line, offers), nextId()); offers.push(y); return y; };
    for (let k = 0; k < YOUTH_OFFERS; k++) make();
    while (team.squad.length + offers.length < SQUAD_MIN) make();   // aldrig under 18 (sanitize-grænsen)
    const take = team.isBot ? botYouthTake(team.squad.length, offers) : offers.slice(0, Math.max(0, SQUAD_MIN - team.squad.length));
    // En bot tager altid et tilbud i en kæde under minimum (QC K5: ellers en markspiller i mål)
    if (team.isBot) for (const y of offers) if (!take.includes(y) && team.squad.filter((p) => p.line === y.line).length + take.filter((x) => x.line === y.line).length < LINE_MIN[y.line]) take.push(y);
    // v3.24.1: dit tvungne optag (op til 18) har samme karantæne som takeYouth – ellers sælges de straks (Spilfører økonomi)
    for (const y of take) { if (!team.isBot) y.lastMove = windowOf(league); team.squad.push(y); report.youthTaken.push({ id: y.id, teamId: team.id }); }
    team.youthOffers = team.isBot ? [] : offers.filter((y) => !take.includes(y));
  });
  for (const team of league.teams) repairLineup(team, goneLine);
  for (const book of Object.values(league.scouting ?? {})) for (const id of Object.keys(book)) if (gone.has(id)) delete book[id];
  // Mest udviklet på dit hold (træning og kampe i sæsonen)
  const tally = league.devTally ?? {};
  report.best = (mine?.squad ?? []).filter((p) => tally[p.id] > 0).sort((a, b) => tally[b.id] - tally[a.id]).slice(0, 3).map((p) => ({ id: p.id, n: tally[p.id] }));
  league.devTally = {};
  report.wages = mine ? { before: wagesBefore, after: wagesPerRound(mine) } : null;   // efter pension og ny løn – før ungdom
  league.turnoverReport = report;
  return report;
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
  // v3.18.0 (QC B1): med et øjebliksbillede af holdet, navnet og nummeret – statistikken for den afsluttede sæson står,
  // selv om spilleren stopper eller skifter klub ved sæsonskiftet
  league.lastSeasonStats = { seasonNumber: md.seasonNumber, players: Object.fromEntries(all.map((p) => [p.id, Object.fromEntries(PLAYER_SEASON_FIELDS.filter((k) => p[k]).map((k) => [k, p[k]]))])
    .filter(([, v]) => Object.keys(v).length).map(([id, v]) => { const p = all.find((x) => x.id === id); return [id, { ...v, t: teamOf.get(id).id, n: p.shortName, nr: p.shirtNumber }]; })) };
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
