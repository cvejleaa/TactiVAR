// Livsløb, økonomi og transfers (v3.18.0) – konstanter og rene hjælpere ét sted (spec §13; CLAUDE.md "et tal uden kode er
// en påstand"). Intet her trækker på ligaens rng: tilfældighed kommer fra afledte, seedede rng'er (hash af id og sæson), så en
// sæsonovergang er reproducerbar og flytter ikke kampene.
import { createRng } from './rng.js';

// ---------- Afledt tilfældighed ----------
// FNV-1a over en tekst → et 32-bit seed. Samme tekst giver altid samme tal (to indlæsninger giver samme potentiale).
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export const derivedRng = (...parts) => createRng(hashSeed(...parts));

// ---------- Lofter i gemmet ----------
export const MATCH_LOG_CAP = 28;   // kamphistorik pr. spiller (to sæsoner)

// ---------- Kæder og nøgle-evner ----------
// Kædens 3 nøgle-evner: potentialet er et loft for deres gennemsnit; "Alsidig" træner dem; vækst ved sæsonslut vægter dem.
export const KEY_SKILLS = {
  GK: ['goalkeeping', 'positioning', 'passing'],
  DEF: ['positioning', 'intercepting', 'strength'],
  MID: ['passing', 'ballControl', 'stamina'],
  ATT: ['finishing', 'pace', 'ballControl'],
};
export const keyAvg = (p) => KEY_SKILLS[p.line].reduce((a, k) => a + (p.skills?.[k] ?? 0), 0) / 3;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- Potentiale (hemmeligt) ----------
// Loft for nøgle-evnernes snit. Eksisterende spillere (migrering): deterministisk fra id efter alder – 16–19 år snit + 4 ± 2,
// 20–23 år + 2 ± 1, ældre ingen plads; klemt til 4–19 og aldrig under det nuværende snit.
export function initialPotential(p) {
  const r = derivedRng('potential', p.id), avg = keyAvg(p);
  const room = p.age <= 19 ? 4 + (r.next() * 4 - 2) : p.age <= 23 ? 2 + (r.next() * 2 - 1) : 0;
  return Math.round(clamp(Math.max(avg, avg + room), 4, 19) * 10) / 10;
}

// ---------- Offentlig værdi og løn (afslører ikke evnerne – kun stjerner, tier og alder, spec §3) ----------
export const VALUE_BY_STARS = [0, 300000, 600000, 1200000, 2400000, 4500000];   // kr. pr. stjerne (0–5)
export const TIER_STARS = { STAR: 4, STARTER: 3, ROTATION: 2, TALENT: 2, YOUTH: 2 };
export const ageFactor = (age) => (age <= 21 ? 1.3 : age <= 27 ? 1 : age <= 30 ? 0.8 : age <= 32 ? 0.55 : 0.35);
export const WAGE_SHARE = 0.06;   // ugeløn = 6 % af værdien
const round = (v, step) => Math.round(v / step) * step;
// Stjernerne bag værdien: med mindst 3 kampe i karrieren de offentlige stjerner (valueStars – sat ved vinduerne), ellers tier'ens
export function starsForValue(p) {
  if ((p.careerGames ?? 0) >= 3 && (p.valueStars ?? p.publicStars) > 0) return clamp(Math.round(p.valueStars ?? p.publicStars), 1, 5);
  return TIER_STARS[p.roleTier] ?? 2;
}
export const publicValue = (p) => Math.max(25000, round(VALUE_BY_STARS[starsForValue(p)] * ageFactor(p.age), 25000));
export const publicWage = (p) => Math.max(1000, round(publicValue(p) * WAGE_SHARE, 1000));

// ---------- Navne (v3.18.0: unikke kortnavne i hele ligaen) ----------
export const FIRST_NAMES_EXTRA = ['Bastian', 'Daniel', 'Elias', 'Felix', 'Hjalte', 'Isak', 'Johan', 'Kristoffer', 'Laurits', 'Nicklas', 'Philip', 'Rune', 'Theo', 'Ulrik', 'Valdemar', 'Yusuf', 'Zakarias', 'Benjamin', 'Dennis', 'Hugo', 'Ida', 'Otto', 'Ruben', 'Tristan', 'Esben', 'Gabriel', 'Henrik', 'Lasse', 'Oskar', 'Vilhelm'];
export const LAST_NAMES_EXTRA = ['Frederiksen', 'Iversen', 'Henriksen', 'Svendsen', 'Mikkelsen', 'Overgaard', 'Bertelsen', 'Nygaard', 'Kjeldsen', 'Damgaard', 'Bisgaard', 'Højgaard', 'Bruun', 'Winther', 'Thygesen', 'Lindberg', 'Krogh', 'Skov', 'Brandt', 'Juhl', 'Vinther', 'Friis', 'Jeppesen', 'Ravn', 'Toft', 'Kragh', 'Beck', 'Søndergaard', 'Østergaard', 'Lassen'];
// Et kortnavn, der ikke er brugt i ligaen (used: Set af kortnavne). Fornavn og efternavn fra de udvidede lister.
export function drawUniqueName(rng, used, first, last) {
  const F = [...first, ...FIRST_NAMES_EXTRA], L = [...last, ...LAST_NAMES_EXTRA];
  for (let i = 0; i < 500; i++) {
    const f = F[Math.floor(rng.next() * F.length)], l = L[Math.floor(rng.next() * L.length)], s = `${f[0]}. ${l}`;
    if (!used.has(s)) { used.add(s); return { name: `${f} ${l}`, shortName: s }; }
  }
  // Udtømt (urealistisk) – et fornavnsforbogstav mere skiller dem
  for (const f of F) for (const l of L) { const s = `${f.slice(0, 2)}. ${l}`; if (!used.has(s)) { used.add(s); return { name: `${f} ${l}`, shortName: s }; } }
  return null;
}
// Gør alle kortnavne i ligaen unikke: den første (holdenes rækkefølge, dit hold først) beholder navnet, de senere får et nyt.
// Returnerer [{ id, from, to }] (til at rette tekster i en gemt liga). rng: en afledt rng – ikke ligaens.
export function uniquifyNames(teams, rng, first, last) {
  const order = [...teams.filter((t) => !t.isBot), ...teams.filter((t) => t.isBot)];
  const seen = new Set(), used = new Set(teams.flatMap((t) => t.squad.map((p) => p.shortName))), renamed = [];   // used: også de endnu ikke gennemgåede
  for (const t of order) for (const p of t.squad) {
    if (!seen.has(p.shortName)) { seen.add(p.shortName); continue; }
    const n = drawUniqueName(rng, used, first, last);
    if (!n) continue;
    renamed.push({ id: p.id, nr: p.shirtNumber, from: p.shortName, to: n.shortName });
    p.name = n.name; p.shortName = n.shortName; seen.add(n.shortName);
  }
  return renamed;
}

// ---------- Kamptruppen (v3.18.0): 11 startere + højst 7 på bænken; resten er reserver ----------
export const BENCH_SIZE = 7;
// Bænken – ÉT sted (QC B2: bane, regneark, Hvis-Så-vælgeren og motoren skal være enige). I truppens rækkefølge, uden startere.
// Højst 7 ikke-startere (18 spillere): alle – udtagelsen betyder først noget med en større trup.
export function matchBenchOf(team) {
  const on = new Set(team.tactics?.lineupSlots ?? []), cand = team.squad.filter((p) => !on.has(p.id));
  if (cand.length <= BENCH_SIZE || !Array.isArray(team.matchBench)) return cand.slice(0, BENCH_SIZE);
  const pickd = new Set(team.matchBench);
  return cand.filter((p) => pickd.has(p.id)).slice(0, BENCH_SIZE);
}
export const reservesOf = (team) => { const b = new Set(matchBenchOf(team).map((p) => p.id)), on = new Set(team.tactics?.lineupSlots ?? []); return team.squad.filter((p) => !on.has(p.id) && !b.has(p.id)); };
// Automatisk udtagelse uden rng og kun på offentlige data (QC B7 – en bots valg må ikke røbe skjulte evner): raske før skadede,
// 1 målmand og mindst 2 forsvarere, 2 midtbanespillere og 1 angriber, så de bedste efter stjerner/tier og friskhed.
// Med 7 eller færre ikke-startere er det dem alle (18 spillere: uændret fra før v3.18.0).
export function autoMatchBench(team) {
  const on = new Set(team.tactics.lineupSlots), cand = team.squad.filter((p) => !on.has(p.id));
  if (cand.length <= BENCH_SIZE) return (team.matchBench = cand.map((p) => p.id));
  const score = (p) => (p.injuryMatchesLeft > 0 ? -100 : 0) + starsForValue(p) * 10 + (p.freshness ?? 100) / 10;
  const best = (list) => list.slice().sort((a, b) => score(b) - score(a) || cand.indexOf(a) - cand.indexOf(b));
  const chosen = new Set();
  for (const [line, n] of [['GK', 1], ['DEF', 2], ['MID', 2], ['ATT', 1]]) for (const p of best(cand.filter((q) => q.line === line)).slice(0, n)) chosen.add(p.id);
  for (const p of best(cand)) { if (chosen.size >= BENCH_SIZE) break; chosen.add(p.id); }
  return (team.matchBench = cand.filter((p) => chosen.has(p.id)).map((p) => p.id));
}
