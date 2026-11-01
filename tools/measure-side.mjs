// Angrebsside (v3.26.0, nr. 39 – "angrib deres svage side"): dit hold med lave cutbacks mod hver bot, begge baner, hvor botens
// HØJRE back (din venstre side) er gjort svag (PAC+POS −6). Måler andelen af kantangreb i din venstre side og netto mål for
// Begge / Venstre / Højre – og med normale backs. Kør: node tools/measure-side.mjs [N=60] [rod]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function measureSide(N = 60, root = resolve(import.meta.dirname, '..'), { weak = 6, focus = 'LOW_CUTBACKS' } = {}) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const { FORMATIONS } = await imp('public/engine/formations.js');
  const out = {};
  for (const weaken of [false, true]) for (const side of ['BOTH', 'LEFT', 'RIGHT']) {
    let gf = 0, ga = 0, games = 0, L = 0, R = 0;
    for (let s = 1; s <= N; s++) {
      const lg = createLeague(createRng(s * 61)), me = lg.teams.find((t) => !t.isBot);
      me.tactics.phases.phase1_buildUp.attackFocus = focus; me.tactics.phases.phase1_buildUp.attackSide = side;
      for (const opp of lg.teams.filter((t) => t.isBot)) {
        if (weaken) {
          const roles = (FORMATIONS[opp.tactics.baseFormation] || FORMATIONS['4-4-2']).map((c) => c.r);
          const i = roles.findIndex((r) => r === 'RB' || r === 'RWB'), p = i >= 0 && opp.squad.find((q) => q.id === opp.tactics.lineupSlots[i]);
          if (p) { p.skills.pace = Math.max(1, p.skills.pace - weak / 2); p.skills.positioning = Math.max(1, p.skills.positioning - weak / 2); }
        }
        for (const home of [true, false]) {
          const rng = createRng(s * 7907 + opp.id.length * 13 + (home ? 1 : 2));
          const m = home ? simulateMatch(me, opp, rng) : simulateMatch(opp, me, rng);
          const d = m.ownReports?.[me.id];
          gf += home ? m.homeGoals : m.awayGoals; ga += home ? m.awayGoals : m.homeGoals; games++;
          if (d) { L += d.wideL ?? 0; R += d.wideR ?? 0; }
        }
      }
    }
    const r = (v) => Math.round(v * 1000) / 1000;
    out[`${weaken ? 'svag RB' : 'normal'}|${side}`] = { left: r(L / Math.max(1, L + R)), wide: r((L + R) / games), net: r((gf - ga) / games), games };
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // node tools/measure-side.mjs [N] [rod] [svækkelse] – fx `140 . 10` / `140 . 14` (spec §5 og backlog nr. 68)
  const r = await measureSide(Number(process.argv[2] || 60), process.argv[3] ? resolve(process.argv[3]) : undefined, { weak: Number(process.argv[4] || 6) });
  for (const [k, v] of Object.entries(r)) console.log(`${k.padEnd(16)} venstre ${Math.round(v.left * 1000) / 10} % · kantangreb/kamp ${v.wide} · netto ${v.net} · ${v.games} kampe`);
}
