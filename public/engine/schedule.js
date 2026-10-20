// Kampprogram (v3.11, spec §1 og §10.7): Berger-program, hvor alle møder alle to gange – runde
// 8–14 er runde 1–7 med byttet hjemmebane. Importerer kun rng.js, så både generator, sanitize,
// storage og season kan bruge det uden kredsløb. Der er ingen hjemmebanefordel i motoren –
// hjemme/ude er kun, hvor kampen spilles.
import { createRng } from './rng.js';

export const SEASON_ROUNDS = 14;

// ids: holdenes id i den rækkefølge, programmet bygges ud fra. Returnerer 14 runder à 4 [hjemme, ude].
// Cirkelmetoden: første hold står fast, de øvrige roterer én plads pr. runde. Hjemmebanen
// skifter på det faste hold hver runde og på de øvrige par efter placering, så ingen får
// lange stræk ude.
export function buildSchedule(ids) {
  const n = ids.length, rot = ids.slice(1), first = [];
  for (let r = 0; r < n - 1; r++) {
    const circle = [ids[0], ...rot], pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i], b = circle[n - 1 - i];
      pairs.push((i === 0 ? r % 2 === 1 : i % 2 === 1) ? [b, a] : [a, b]);
    }
    first.push(pairs);
    rot.unshift(rot.pop());
  }
  return [...first, ...first.map((pairs) => pairs.map(([a, b]) => [b, a]))];
}

// Holdrækkefølgen til en ny liga: blandet, men uden at trække fra ligaens egen rng (så seedede
// tests og målinger ikke flytter sig) – seedet af holdenes spillere, altså fast for samme liga.
export function shuffledIds(teams) {
  let seed = 7;
  for (const t of teams) for (const p of t.squad) for (const ch of String(p.name)) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const rng = createRng(seed), ids = teams.map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids;
}

// Gyldigt program: 14 runder, hvor hvert hold spiller præcis én gang pr. runde, og hvert hold
// møder hvert andet præcis én gang hjemme og én gang ude.
export function isValidSchedule(schedule, teams) {
  const ids = new Set(teams.map((t) => t.id));
  const rounds = Array.isArray(schedule) && schedule.length === SEASON_ROUNDS && schedule.every((pairs) => {
    if (!Array.isArray(pairs) || pairs.length !== ids.size / 2) return false;
    const seen = pairs.flat();
    return seen.length === ids.size && new Set(seen).size === ids.size && seen.every((id) => ids.has(id));
  });
  return rounds && new Set(schedule.flat().map(([h, a]) => `${h}>${a}`)).size === ids.size * (ids.size - 1);
}

// Sæsonens runde (1–14) for en ligarunde.
export const seasonRoundOf = (league, round) => round - league.seasonStartRound + 1;
