// Sponsorkontrakter evalueret på dumpede hold-sæsoner (DUMP=fil node tools/measure-sponsor.mjs …). Kør: node tools/tune-sponsor.mjs rows.json
import { readFileSync } from 'node:fs';
const rows = JSON.parse(readFileSync(process.argv[2]));
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const k = (n) => Math.round(n / 1000).toLocaleString('da-DK') + 'k';
const TV_CUT = +(process.env.TV_CUT ?? 0) * 14;   // fx TV_CUT=20000: TV 120k → 100k pr. runde
const VARIANTS = {
  'C (anbefalet)': { Tryg: () => 1000000, Balance: (r) => 550000 + 25000 * r.pts, 'Præstation': (r) => 50000 * r.gf + ({ 1: 400000, 2: 200000, 3: 100000 }[r.place] ?? 0) },
  'A (pr. point/pr. mål)': { Tryg: () => 1000000, Balance: (r) => 500000 + 25000 * r.pts, 'Præstation': (r) => 50000 * r.gf + ({ 1: 400000, 2: 200000, 3: 100000 }[r.place] ?? 0) },
  'B (point + placering)': { Tryg: () => 1000000, Balance: (r) => 550000 + 23000 * r.pts, 'Præstation': (r) => 40000 * r.pts + ({ 1: 600000, 2: 300000, 3: 100000 }[r.place] ?? 0) },
};
const inc = (r) => r.gate + r.tv + r.prize;
for (const [vn, C] of Object.entries(VARIANTS)) {
  const names = Object.keys(C);
  const bestOf = (r) => names.reduce((b, n) => (C[n](r) > C[b](r) ? n : b), names[0]);
  console.log(`\n== ${vn}: snit alle ${names.map((n) => `${n} ${k(mean(rows.map(C[n])))}`).join(' · ')}`);
  console.log('  Efter SLUTplacering, snit (sd):');
  for (let p = 1; p <= 8; p++) { const g = rows.filter((r) => r.place === p); console.log(`   ${p}. ` + names.map((n) => `${n} ${k(mean(g.map(C[n])))} (${k(sd(g.map(C[n])))})`).join(' · ')); }
  console.log(`  Bedst ex post: ${names.map((n) => `${n} ${Math.round(100 * rows.filter((r) => bestOf(r) === n).length / rows.length)} %`).join(' · ')}`);
  console.log('  Efter SIDSTE sæsons placering (det man ved ved valget): snit (sd) · bedst ex post · 10 %-fraktil');
  const q = (a, x) => { const b = [...a].sort((u, v) => u - v); return b[Math.floor(x * b.length)]; };
  for (const grp of [[1, 2], [3, 4], [5, 6], [7, 8]]) {
    const g = rows.filter((r) => r.prev && grp.includes(r.prev));
    console.log(`   sidst ${grp.join('–')}. (n=${g.length}): ` + names.map((n) => `${n} ${k(mean(g.map(C[n])))} (${k(sd(g.map(C[n])))}) ${Math.round(100 * g.filter((r) => bestOf(r) === n).length / g.length)} % p10 ${k(q(g.map(C[n]), 0.1))}`).join(' · '));
  }
  const D = rows.filter((r) => !r.bot && r.prev);
  console.log(`   dit hold (n=${D.length}, placering ${mean(D.map((r) => r.place)).toFixed(1)}): ` + names.map((n) => `${n} ${k(mean(D.map(C[n])))} (${k(sd(D.map(C[n])))}) ${Math.round(100 * D.filter((r) => bestOf(r) === n).length / D.length)} %`).join(' · '));
  // Med sponsor: andel overskud (drift + transfers), hvis hvert hold vælger efter sidste placering (1–2 Præstation, 3–5 Balance, 6–8 Tryg)
  const pick = (r) => (r.prev == null ? 'Balance' : r.prev <= 2 ? 'Præstation' : r.prev <= 5 ? 'Balance' : 'Tryg');
  const net = (r, s) => inc(r) + r.transfers - r.wages + s - (s ? TV_CUT : 0);
  console.log(`  Overskud uden sponsor ${Math.round(100 * rows.filter((r) => net(r, 0) >= 0).length / rows.length)} % · med (botregel) ${Math.round(100 * rows.filter((r) => net(r, C[pick(r)](r)) >= 0).length / rows.length)} % · snit resultat ${k(mean(rows.map((r) => net(r, 0))))} → ${k(mean(rows.map((r) => net(r, C[pick(r)](r)))))}`);
  console.log('  Pr. sæson overskud med sponsor: ' + Array.from({ length: 10 }, (_, i) => { const g = rows.filter((r) => r.s === i + 1); return `S${i + 1} ${Math.round(100 * g.filter((r) => net(r, C[pick(r)](r)) >= 0).length / g.length)} %`; }).join(' · '));
  for (const grp of [[1, 2], [3, 5], [6, 8]]) { const g = rows.filter((r) => r.place >= grp[0] && r.place <= grp[1]); console.log(`   slut ${grp.join('–')}.: resultat ${k(mean(g.map((r) => net(r, 0))))} → ${k(mean(g.map((r) => net(r, C[pick(r)](r)))))} · spredning top–bund før/efter`); }
}
