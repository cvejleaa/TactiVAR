// v3.31.2 (brugeren 3/11: "jeg har endnu ikke set en ungdomsspiller der ikke har betegnelsen 'har meget mere i sig'"):
// fordelingen af skønnets ord – før (roomOf 0,1–1 med grænserne 0,6/0,3) og efter (roomPoints i evne-point, fem trin, ui/card.js).
// 1) AL ungdom ved første syn: tilbuddene skabt som ved sæsonslut (samme kode: neededLine/neededPosition/freeShirt + generatePlayer
//    'YOUTH' med derivedRng('youth', …)) for alle 8 hold i 20 ligaer – også botternes, som ellers forsvinder ved sæsonslut.
// 2) Truppernes ≤ 19 / ≤ 23 / øvrige efter 0, 14 og 28 runder i 5 spillede ligaer (træning og vækst flytter pladsen).
// Kør: node tools/measure-youth-words.mjs   (testen tests/unit/youth-words-v3312.test.mjs bruger youthFirstSight og fordelingen herfra)
import { pathToFileURL } from 'node:url';
import { createRng } from '../public/engine/rng.js';
import { createLeague, generatePlayer, neededPosition } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { roomOf, roomPoints, derivedRng, neededLine, freeShirt, YOUTH_OFFERS } from '../public/engine/career.js';

// Ordene før v3.31.2 – bevidst kopieret hertil (de findes ikke længere i koden), så målingen kan vise "før"
export const OLD_WORDS = ['har meget mere i sig', 'har mere i sig', 'er tæt på sit loft'];
export const oldWords = (room) => (room >= 0.6 ? OLD_WORDS[0] : room >= 0.3 ? OLD_WORDS[1] : OLD_WORDS[2]);

// Ungdomstilbud for alle hold i en ny liga, som sæsonslutningen skaber dem (season.js "Ungdom")
export function youthFirstSight(seeds = 20) {
  const out = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const L = createLeague(createRng(seed)), used = new Set(L.teams.flatMap((t) => t.squad.map((p) => p.shortName)));
    let seq = 0;
    L.teams.forEach((team, ti) => {
      const rng = derivedRng('youth', 1, team.id), offers = [];
      const make = () => { const line = neededLine(team, offers, []); offers.push(generatePlayer(rng, line, 'YOUTH', freeShirt(team, offers), ti, used, 0, neededPosition(team, line, offers), `plr_ym${seed}_${seq++}`)); };
      for (let k = 0; k < YOUTH_OFFERS; k++) make();
      while (team.squad.length + offers.length < 18) make();
      out.push(...offers);
    });
  }
  return out;
}

// { ord: { n, pct, potMin, potMax } } for en liste spillere og en ord-funktion
export function distribution(players, words) {
  const by = new Map();
  for (const p of players) { const w = words(p), b = by.get(w) ?? { n: 0, potMin: Infinity, potMax: -Infinity }; b.n++; b.potMin = Math.min(b.potMin, p.potential); b.potMax = Math.max(b.potMax, p.potential); by.set(w, b); }
  return Object.fromEntries([...by].map(([w, b]) => [w, { ...b, pct: Math.round((b.n / players.length) * 1000) / 10 }]));
}
let ROOM_ORDER = [];
export const newWordOf = async () => (await import('../public/ui/card.js')).roomWords;

function show(title, players, roomWords) {
  const before = distribution(players, (p) => oldWords(roomOf(p))), after = distribution(players, (p) => roomWords(roomPoints(p)));
  const ord = (d, words) => words.filter((w) => d[w]).map((w) => [w, d[w]]);   // ordenes rækkefølge, fra mest til mindst plads
  console.log(`\n${title} (n = ${players.length})`);
  console.log('  FØR  ', ord(before, OLD_WORDS).map(([w, b]) => `${w}: ${b.pct} %`).join(' · '));
  console.log('  EFTER', ord(after, ROOM_ORDER).map(([w, b]) => `${w}: ${b.pct} % (potentiale ${b.potMin}–${b.potMax})`).join(' · '));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // card.js tegner DOM – en minimal stand-in, så ord-funktionen kan importeres i node
  globalThis.Node ??= class {}; globalThis.document ??= { createElement: () => ({}), createTextNode: () => ({}) };
  const roomWords = await newWordOf();
  ROOM_ORDER = (await import('../public/ui/card.js')).ROOM_WORDS.map(([, w]) => w).reverse();
  show('Ungdom ved første syn – 20 ligaer, alle 8 hold', youthFirstSight(20), roomWords);
  const groups = { '≤ 19 år': (p) => p.age <= 19, '20–23 år': (p) => p.age > 19 && p.age <= 23, 'øvrige': (p) => p.age > 23 };
  const snaps = { 0: [], 14: [], 28: [] };
  for (let seed = 1; seed <= 5; seed++) {
    const L = createLeague(createRng(seed)), rng = createRng(seed * 7);
    for (let r = 0; r <= 28; r++) {
      if (snaps[r]) snaps[r].push(...L.teams.flatMap((t) => t.squad.map((p) => ({ age: p.age, potential: p.potential, line: p.line, skills: { ...p.skills } }))));
      if (r < 28) commitRound(L, playRound(L, rng), rng);
    }
  }
  for (const [r, list] of Object.entries(snaps)) for (const [g, f] of Object.entries(groups)) show(`Efter ${r} runder, ${g} – 5 ligaer`, list.filter(f), roomWords);
}
