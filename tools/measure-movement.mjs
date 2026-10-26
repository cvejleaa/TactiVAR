// Bevægelse (v3.21.0): passer heat map'et til løbet, og ligner det fodbold? Samme kampe med og uden bevægelsen (opts.drift).
// node tools/measure-movement.mjs [N=40]
// Pr. rolle (dit hold, hjemme, alle 10 markspillere): median-dækning af banen (heatGrid > HEAT_MIN – det, brugeren ser) og
// median distanceKm. Rækkefølgen af rollernes dækning skal følge km-tabellen (rangkorrelation over rollerne), og inden for
// samme rolle (CM) måles korrelationen mellem dækning og km.
// Glathed: hvor stor en del af en spillers flytning mellem to billeder er holdets fælles flytning (ikke hans egen rysten).
// Spring: afstanden fra en spillers plads i grundbilledet til hans plads i samme ticks afslutningsøjeblik (motoren ⇄ billedet).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const GROUP = { CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', CDM: 'CM', CM: 'CM', CAM: 'AM', CF: 'AM', LM: 'W', RM: 'W', LW: 'W', RW: 'W', ST: 'ST' };

export async function measureMovement(N = 40, root = resolve(import.meta.dirname, '..')) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const { FORMATIONS } = await imp('public/engine/formations.js');
  const H = await imp('public/engine/heatmap.js');
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
  const rank = (a) => { const s = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; s.forEach(([, i], k) => { r[i] = k; }); return r; };
  const spearman = (a, b) => { const ra = rank(a), rb = rank(b), n = a.length, m = (n - 1) / 2; let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (ra[i] - m) * (rb[i] - m); da += (ra[i] - m) ** 2; db += (rb[i] - m) ** 2; } return da && db ? num / Math.sqrt(da * db) : 0; };
  const out = {};
  for (const drift of [false, true]) {
    const cov = {}, km = {}, cmCov = [], cmKm = [], own = [], all = [], jumps = [];
    for (let s = 1; s <= N; s++) {
      const rng = createRng(s * 6151), L = createLeague(rng), me = L.teams[s % 8], opp = L.teams[(s + 3) % 8];
      const m = simulateMatch(me, opp, rng, drift ? {} : { drift: false });
      const roles = FORMATIONS[me.tactics.baseFormation].map((c) => c.r);
      me.tactics.lineupSlots.forEach((id, i) => {
        const g = GROUP[roles[i]]; if (!g) return;
        const e = m.ratings.home.find((x) => x.playerId === id); if (!e || e.minOut - e.minIn < 85) return;
        const c = H.heatGrid(m.trace, 'h', id).flat().filter((v) => v > H.HEAT_MIN).length / (H.COLS * H.ROWS);
        (cov[g] ??= []).push(c); (km[g] ??= []).push(e.distanceKm);
        if (g === 'CM') { cmCov.push(c); cmKm.push(e.distanceKm); }
      });
      const fr = m.trace.frames.filter((f) => f.poss).sort((a, b) => a.t - b.t);
      for (let k = 1; k < fr.length; k++) {
        const a = new Map(fr[k - 1].h.slice(1).map((q) => [q[0], q])), b = fr[k].h.slice(1).filter((q) => a.has(q[0]));
        if (b.length < 8) continue;
        const mx = b.reduce((v, q) => v + q[1] - a.get(q[0])[1], 0) / b.length, my = b.reduce((v, q) => v + q[2] - a.get(q[0])[2], 0) / b.length;
        for (const q of b) { const p = a.get(q[0]); all.push(Math.hypot(q[1] - p[1], q[2] - p[2])); own.push(Math.hypot(q[1] - p[1] - mx, q[2] - p[2] - my)); }
      }
      for (const mo of m.trace.moments.filter((x) => x.side === 'h')) {
        const f = m.trace.frames.find((x) => x.t === Math.floor(mo.t)); if (!f) continue;
        for (const q of mo.h.slice(1)) { if (q[0] === mo.shooter || q[0] === mo.scorer) continue; const p = f.h.find((z) => z[0] === q[0]); if (p) jumps.push(Math.hypot(q[1] - p[1], q[2] - p[2])); }
      }
    }
    const groups = Object.keys(cov).filter((g) => cov[g].length >= 5);
    out[drift ? 'after' : 'before'] = {
      coverage: Object.fromEntries(groups.map((g) => [g, med(cov[g])])), km: Object.fromEntries(groups.map((g) => [g, med(km[g])])),
      roleRank: spearman(groups.map((g) => med(cov[g])), groups.map((g) => med(km[g]))), cmWithin: spearman(cmCov, cmKm),
      ownShare: own.reduce((a, b) => a + b, 0) / Math.max(1, all.reduce((a, b) => a + b, 0)), stepMedian: med(all), jumpMedian: med(jumps),
    };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await measureMovement(Number(process.argv[2] || 40));
  console.log(JSON.stringify(r, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 1));
}
