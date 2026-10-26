// Livsløbet over mange sæsoner (v3.18.0): aldring, pension, ungdom, udvikling, økonomi og transfers – med båndene i
// tests/unit/lifecycle-v3180.test.mjs. Dit hold spilles efter en profil:
// - passiv (0 klik): ingen træning valgt (Alsidig), intet køb/salg, ungdom kun når truppen er under 18
// - aktiv (enkel heuristik): de unge træner kædens fokus, begge ungdomstilbud tages (til 22), ét køb pr. vindue af den
//   billigste spiller i den tyndeste kæde, der kan købes
// Kør: node tools/measure-lifecycle.mjs [seeds] [sæsoner] [passiv|aktiv]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { normalizeLeague } from '../public/engine/sanitize.js';
import { keyAvg, LINE_MIN } from '../public/engine/career.js';
import { windowOf, marketInfo, buyPlayer } from '../public/engine/transfers.js';
import { takeYouth } from '../public/state/actions.js';

// Startniveau: nøglesnit ≥ 12 (tier STARTER: evner 9–13 + kædens tillæg)
export const STARTER_KEY = 12;
const FOCUS_OF = { GK: 'KEEPER', DEF: 'DEFENCE', MID: 'TECH', ATT: 'FINISH' };
function activeTurn(L) {
  const me = L.teams.find((t) => !t.isBot);
  for (const p of me.squad) p.trainingFocus = p.age <= 25 ? FOCUS_OF[p.line] : 'GENERAL';
  for (const y of [...(me.youthOffers ?? [])]) if (me.squad.length < 22) takeYouth(me, y.id);
  if (windowOf(L) != null && !L._bought?.[windowOf(L)]) {
    const line = Object.keys(LINE_MIN).sort((a, b) => me.squad.filter((p) => p.line === a).length / LINE_MIN[a] - me.squad.filter((p) => p.line === b).length / LINE_MIN[b])[0];
    const cand = L.teams.filter((t) => t.isBot).flatMap((t) => t.squad.filter((p) => p.line === line).map((p) => ({ p, m: marketInfo(L, me, t, p) }))).filter((o) => !o.m.reason).sort((a, b) => a.m.price - b.m.price);
    if (cand[0]) buyPlayer(L, me, cand[0].p.id);
    (L._bought ||= {})[windowOf(L)] = true;
  }
}

export function measureLifecycle(seed, seasons = 10, profile = 'passiv') {
  const L = createLeague(createRng(seed)), rng = createRng(seed * 7);
  const all = () => L.teams.flatMap((t) => t.squad);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const key0 = mean(all().map(keyAvg)), cash0 = L.teams.reduce((a, t) => a + t.cashBalance, 0);
  let transfers = 0, myMinusRounds = 0, lastLog = null;
  const youthSeen = new Map();   // ungdomsspillere: bedste nøglesnit til og med 23 år
  for (let r = 0; r < seasons * 14; r++) {
    if (profile === 'aktiv') activeTurn(L);
    commitRound(L, playRound(L, rng), rng);
    const log = L.transferLog ?? [], i = lastLog ? log.indexOf(lastLog) : -1;
    transfers += log.length - 1 - i; lastLog = log.at(-1) ?? null;
    if (L.teams.find((t) => !t.isBot).cashBalance < 0) myMinusRounds++;
    for (const p of all()) if (p.roleTier === 'YOUTH' && p.age <= 23) youthSeen.set(p.id, Math.max(youthSeen.get(p.id) ?? 0, keyAvg(p)));
  }
  delete L._bought;
  const ps = all(), bots = L.teams.filter((t) => t.isBot), me = L.teams.find((t) => !t.isBot);
  const youthAged = [...youthSeen.entries()].filter(([id]) => { const p = ps.find((x) => x.id === id); return !p || p.age >= 23; });
  return {
    keyRatio: mean(ps.map(keyAvg)) / key0,
    avgAge: mean(ps.map((p) => p.age)),
    old33: ps.filter((p) => p.age >= 33).length / ps.length,
    cashRatio: L.teams.reduce((a, t) => a + t.cashBalance, 0) / cash0,
    teamsMinus: L.teams.filter((t) => t.cashBalance < 0).length,
    botSquads: bots.map((t) => t.squad.length),
    transfers,
    youthStarter: youthAged.length ? youthAged.filter(([, k]) => k >= STARTER_KEY).length / youthAged.length : null,
    myMinusRounds,
    myVsBots: mean(me.squad.map(keyAvg)) / mean(bots.flatMap((t) => t.squad).map(keyAvg)),
    saveBytes: JSON.stringify(L).length,
    sanitizeProblems: normalizeLeague(structuredClone(L))?.problems ?? [],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] || 5), seasons = Number(process.argv[3] || 10), profile = process.argv[4] || 'passiv';
  for (let s = 1; s <= seeds; s++) console.log(s, JSON.stringify(measureLifecycle(s, seasons, profile), (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
}
