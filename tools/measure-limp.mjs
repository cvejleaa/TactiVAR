// Haltende spiller (v3.16.6, QC: "at halte skal koste mindre end et rødt kort"). Samme kamp tre gange: uden hændelse, med en
// hjemmespiller skadet i 9' uden indskiftning (halter resten af kampen – også i pausen, for bænken er tom) og med en
// hjemmespiller udvist i 9'. Hjemmeholdet har ingen bænk i alle tre (ingen skift), så forskellen er kun halten/udvisningen.
// Måler hjemmeholdets målforskel pr. kamp. Kør: node tools/measure-limp.mjs [antal]
import { pathToFileURL } from 'node:url';
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { simulateMatch } from '../public/engine/match.js';
import { CARD_RULES, VAR_RULES } from '../public/engine/match-rules.js';

// Tving tick 3's frispark (9'): skadet offer på hjemmeholdet (limp) eller på udeholdet med direkte rødt til hjemmeholdets
// tackler (red – det røde kort kommer kun med skade-tacklingen; udeholdets offer skiftes ud)
export function forced(base, mode) {
  let fk = -1, armed = false;
  return { ...base, chance: (p) => {
    if (p === 0.06) { fk++; armed = fk === 2 && mode !== 'none'; return armed ? true : base.chance(p); }
    if (armed && p === 0.5) return mode === 'limp';
    if (armed && p === 0.4) { if (mode === 'limp') armed = false; return true; }   // rødt kort kommer kun med skade-tacklingen (udeholdets offer skiftes ud)
    if (armed && p === CARD_RULES.DIRECT_RED_P) return true;
    if (armed && p === VAR_RULES.RED_CHECK_P) { armed = false; return false; }
    return base.chance(p);
  } };
}
export function measureLimp(N = 1500) {
  const out = { none: 0, limp: 0, red: 0, limpSeen: 0, redSeen: 0 };
  for (let s = 1; s <= N; s++) {
    for (const mode of ['none', 'limp', 'red']) {
      const L = createLeague(createRng(s * 97)), H = L.teams[s % 8], A = L.teams[(s + 3) % 8];
      H.subsLimit = 0; H.tactics.conditionalRules = [];
      for (const p of H.squad) if (!H.tactics.lineupSlots.includes(p.id)) p.injuryMatchesLeft = 5;
      const m = simulateMatch(H, A, forced(createRng(s * 131), mode));
      out[mode] += m.homeGoals - m.awayGoals;
      if (mode === 'limp' && m.events.some((e) => e.min === 9 && /Ingen indskiftning/.test(e.text ?? ''))) out.limpSeen++;
      if (mode === 'red' && m.events.some((e) => e.min === 9 && e.type === 'RED' && e.isHome)) out.redSeen++;
    }
  }
  return { n: N, none: out.none / N, limp: out.limp / N, red: out.red / N, limpSeen: out.limpSeen, redSeen: out.redSeen };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = measureLimp(Number(process.argv[2] || 1500));
  console.log(`${r.n} kampe · hjemmeholdets målforskel: uden ${r.none.toFixed(3)} · haltende fra 9' ${r.limp.toFixed(3)} (${(r.limp - r.none).toFixed(3)}) · udvist i 9' ${r.red.toFixed(3)} (${(r.red - r.none).toFixed(3)}) · data: ${r.limpSeen} haltende, ${r.redSeen} udviste`);
}
