// Dit hold over 10 sæsoner: passiv (rører intet) mod sparsom (hvert vindue: sæt de 2 dyreste ikke-startere til salg, der
// ikke udløser en ungdomsspiller, og tag buddet) mod dyr (som passiv, men truppen fyldes til 25 med køb – brugerens situation).
// Kør: node tools/measure-economy-me.mjs [ligaer] [sæsoner]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { wagesPerRound } from '../public/engine/career.js';
import { windowOf, isStarter, needsYouth, setListed, acceptOffer, marketInfo, buyPlayer } from '../public/engine/transfers.js';
const leagues = +process.argv[2] || 10, seasons = +process.argv[3] || 10;
function turn(L, profile) {
  const me = L.teams.find((t) => !t.isBot), w = windowOf(L);
  if (w == null || L._done?.[w]) return;
  (L._done ||= {})[w] = true;
  if (profile === 'sparsom') {
    const cand = me.squad.filter((p) => !isStarter(me, p) && !needsYouth(me, p)).sort((a, b) => b.weeklyWage - a.weeklyWage).slice(0, 2);
    for (const p of cand) { setListed(L, me, p.id, true); acceptOffer(L, me, p.id); }
  }
  if (profile === 'dyr') for (let i = 0; i < 2 && me.squad.length < 25; i++) {
    const c = L.teams.filter((t) => t.isBot).flatMap((t) => t.squad.map((p) => ({ p, m: marketInfo(L, me, t, p) }))).filter((o) => !o.m.reason).sort((a, b) => a.m.price - b.m.price)[0];
    if (c) buyPlayer(L, me, c.p.id);
  }
}
const k = (n) => Math.round(n / 1000).toLocaleString('da-DK') + 'k';
for (const profile of ['passiv', 'sparsom', 'dyr']) {
  const res = [];
  for (let seed = 1; seed <= leagues; seed++) {
    const L = createLeague(createRng(seed * 101)), rng = createRng(seed * 7), me = L.teams.find((t) => !t.isBot);
    for (let s = 1; s <= seasons; s++) {
      let ws = 0;
      for (let r = 0; r < L.schedule.length; r++) { turn(L, profile); ws += wagesPerRound(me); commitRound(L, playRound(L, rng), rng); }
      const f = me.finance.lastSeason ?? {}, net = (f.gate ?? 0) + (f.tv ?? 0) + (f.prize ?? 0) + (f.transfers ?? 0) + (f.wages ?? 0);
      const opNet = net - (f.transfers ?? 0);
      res.push({ net, opNet, place: L.seasons.at(-1).table.findIndex((x) => x.teamId === me.id) + 1, wpr: ws / L.schedule.length, squad: me.squad.length, cash: me.cashBalance });
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`${profile.padEnd(8)} overskud ${String(Math.round(100 * res.filter((r) => r.net >= 0).length / res.length)).padStart(3)} % af sæsonerne · uden transfers ${String(Math.round(100 * res.filter((r) => r.opNet >= 0).length / res.length)).padStart(3)} % · snit ${k(mean(res.map((r) => r.net))).padStart(7)} · løn/runde ${k(mean(res.map((r) => r.wpr)))} · trup ${mean(res.map((r) => r.squad)).toFixed(1)} · placering ${mean(res.map((r) => r.place)).toFixed(1)} · kasse efter ${seasons} s. ${k(mean(res.filter((_, i) => i % seasons === seasons - 1).map((r) => r.cash)))}`);
}
