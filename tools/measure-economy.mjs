// Økonomien over mange sæsoner: sæsonresultat pr. hold (billetter + TV + præmie + transfers − løn), placering og løn.
// Kør: node tools/measure-economy.mjs [ligaer] [sæsoner]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { wagesPerRound } from '../public/engine/career.js';

const leagues = +process.argv[2] || 5, seasons = +process.argv[3] || 10;
const rows = [];
for (let seed = 1; seed <= leagues; seed++) {
  const L = createLeague(createRng(seed * 101)), rng = createRng(seed * 7);
  const roundsPer = L.schedule.length;
  const wageSum = new Map();
  for (let s = 1; s <= seasons; s++) {
    for (const t of L.teams) wageSum.set(t.id, 0);
    for (let r = 0; r < roundsPer; r++) {
      for (const t of L.teams) wageSum.set(t.id, wageSum.get(t.id) + wagesPerRound(t));
      commitRound(L, playRound(L, rng), rng);
    }
    const table = L.seasons.at(-1).table;
    for (const t of L.teams) {
      const f = t.finance.lastSeason ?? {}, place = table.findIndex((x) => x.teamId === t.id) + 1;
      const net = (f.gate ?? 0) + (f.tv ?? 0) + (f.prize ?? 0) + (f.transfers ?? 0) + (f.wages ?? 0);
      rows.push({ seed, s, team: t.name, bot: t.isBot, place, net, gate: f.gate ?? 0, tv: f.tv ?? 0, prize: f.prize ?? 0, transfers: f.transfers ?? 0, wages: -(f.wages ?? 0), wagePerRound: Math.round(wageSum.get(t.id) / roundsPer), cash: t.cashBalance, squad: t.squad.length });
    }
  }
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
const k = (n) => Math.round(n / 1000).toLocaleString('da-DK') + 'k';
const pos = rows.filter((r) => r.net >= 0);
console.log(`${leagues} ligaer × ${seasons} sæsoner × 8 hold = ${rows.length} hold-sæsoner`);
console.log(`Overskud (≥ 0): ${pos.length} (${Math.round(100 * pos.length / rows.length)} %)  · dit hold: ${rows.filter((r) => !r.bot && r.net >= 0).length} af ${rows.filter((r) => !r.bot).length}`);
console.log(`Sæsonresultat: snit ${k(mean(rows.map((r) => r.net)))} · median ${k(pct(rows.map((r) => r.net), 0.5))} · 10 % ${k(pct(rows.map((r) => r.net), 0.1))} · 90 % ${k(pct(rows.map((r) => r.net), 0.9))} · bedst ${k(Math.max(...rows.map((r) => r.net)))}`);
console.log(`Snit pr. sæson: billetter ${k(mean(rows.map((r) => r.gate)))} · TV ${k(mean(rows.map((r) => r.tv)))} · præmie ${k(mean(rows.map((r) => r.prize)))} · transfers ${k(mean(rows.map((r) => r.transfers)))} · løn ${k(mean(rows.map((r) => r.wages)))}`);
console.log('\nPr. placering: snit resultat · andel overskud · løn/runde · billetter');
for (let p = 1; p <= 8; p++) { const g = rows.filter((r) => r.place === p); console.log(`  ${p}.  ${k(mean(g.map((r) => r.net))).padStart(8)} · ${String(Math.round(100 * g.filter((r) => r.net >= 0).length / g.length)).padStart(3)} % · ${k(mean(g.map((r) => r.wagePerRound))).padStart(6)} · ${k(mean(g.map((r) => r.gate)))}`); }
console.log('\nPr. sæson (alle hold): snit resultat · andel overskud · snit løn/runde · snit kasse ved slut · hold i minus');
for (let s = 1; s <= seasons; s++) { const g = rows.filter((r) => r.s === s); console.log(`  S${String(s).padStart(2)}  ${k(mean(g.map((r) => r.net))).padStart(8)} · ${String(Math.round(100 * g.filter((r) => r.net >= 0).length / g.length)).padStart(3)} % · ${k(mean(g.map((r) => r.wagePerRound))).padStart(6)} · ${k(mean(g.map((r) => r.cash))).padStart(8)} · ${g.filter((r) => r.cash < 0).length}`); }
console.log('\nLøn/runde-bånd: snit resultat · andel overskud · antal');
for (const [a, b] of [[0, 400e3], [400e3, 500e3], [500e3, 600e3], [600e3, 700e3], [700e3, 1e9]]) { const g = rows.filter((r) => r.wagePerRound >= a && r.wagePerRound < b); if (g.length) console.log(`  ${k(a)}–${b > 1e8 ? '' : k(b)}  ${k(mean(g.map((r) => r.net))).padStart(8)} · ${String(Math.round(100 * g.filter((r) => r.net >= 0).length / g.length)).padStart(3)} % · ${g.length}`); }
console.log('\nDe 5 bedste hold-sæsoner:'); for (const r of [...rows].sort((a, b) => b.net - a.net).slice(0, 5)) console.log(`  liga ${r.seed} S${r.s} ${r.team}${r.bot ? '' : ' (dit)'} · ${r.place}. · ${k(r.net)} (billetter ${k(r.gate)}, præmie ${k(r.prize)}, transfers ${k(r.transfers)}, løn ${k(r.wages)})`);
