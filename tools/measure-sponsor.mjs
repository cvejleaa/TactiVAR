// Økonomien bag et sponsorvalg (Spilfører økonomi 2026-11-02). Kør: node tools/measure-sponsor.mjs [ligaer] [sæsoner] [profil]
// profil: passiv (dit hold rører intet, 18 mand) | fyld21 (køb den billigste ledige ved hvert vindue, til truppen er 21)
// (1) lønnens drift ved sæsonskiftet, delt i pension, alder, stjerner, ungdom ind, transfers
// (2) indtægt og break-even-løn pr. runde pr. placering
// (3) tre sponsorkontrakter, evalueret bagefter på de samme hold-sæsoner (ingen tilbagekobling – se note i svaret)
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { wagesPerRound, publicWage } from '../public/engine/career.js';
import { windowOf, marketInfo, buyPlayer } from '../public/engine/transfers.js';
const leagues = +process.argv[2] || 5, seasons = +process.argv[3] || 10, profile = process.argv[4] || 'passiv';
const rows = [], drift = [];
function turn(L) {
  const me = L.teams.find((t) => !t.isBot), w = windowOf(L);
  if (profile !== 'fyld21' || w == null || L._done?.[w]) return;
  (L._done ||= {})[w] = true;
  for (let i = 0; i < 3 && me.squad.length < 21; i++) {
    const c = L.teams.filter((t) => t.isBot).flatMap((t) => t.squad.map((p) => ({ p, m: marketInfo(L, me, t, p) }))).filter((o) => !o.m.reason).sort((a, b) => a.m.price - b.m.price)[0];
    if (c) buyPlayer(L, me, c.p.id); else break;
  }
}
for (let seed = 1; seed <= leagues; seed++) {
  const L = createLeague(createRng(seed * 101)), rng = createRng(seed * 7), R = L.schedule.length;
  let prevPlace = new Map();
  for (let s = 1; s <= seasons; s++) {
    const ws = new Map(L.teams.map((t) => [t.id, 0]));
    let snap = null;
    for (let r = 0; r < R; r++) {
      turn(L);
      for (const t of L.teams) ws.set(t.id, ws.get(t.id) + wagesPerRound(t));
      if (r === R - 1) snap = new Map(L.teams.map((t) => [t.id, new Map(t.squad.map((p) => [p.id, { w: p.weeklyWage, age: p.age }]))]));
      if (r === R - 1) for (const t of L.teams) { const f = t.finance.season; t._pre = { gate: f.gate ?? 0, tv: f.tv ?? 0, wages: f.wages ?? 0, transfers: f.transfers ?? 0 }; }
      commitRound(L, playRound(L, rng), rng);
    }
    const table = L.seasons.at(-1).table;
    table.forEach((e, i) => {
      const t = L.teams.find((x) => x.id === e.teamId), f = t.finance.lastSeason ?? {};
      rows.push({ seed, s, bot: t.isBot, place: i + 1, prev: prevPlace.get(t.id) ?? null, pts: e.points, gf: e.goalsFor, won: e.won,
        gate: f.gate ?? 0, tv: f.tv ?? 0, prize: f.prize ?? 0, transfers: f.transfers ?? 0, wages: -(f.wages ?? 0),
        wpr: ws.get(t.id) / R, squad: t.squad.length, cash: t.cashBalance });
    });
    prevPlace = new Map(table.map((e, i) => [e.teamId, i + 1]));
    // (1) sæsonskiftet: ugeløn før sidste runde → efter skiftet (inkl. vinduets handler ved sæsonslut)
    const allNow = new Map(L.teams.flatMap((t) => t.squad.map((p) => [p.id, t.id])));
    const before = new Set([...snap.values()].flatMap((m) => [...m.keys()]));
    for (const t of L.teams) {
      const d = { s, bot: t.isBot, retired: 0, age: 0, stars: 0, youth: 0, transIn: 0, transOut: 0, total: 0 }, old = snap.get(t.id);
      for (const [id, o] of old) {
        const p = t.squad.find((x) => x.id === id);
        if (!p) { if (allNow.has(id)) d.transOut -= o.w; else d.retired -= o.w; continue; }
        const atOldAge = publicWage({ ...p, age: o.age });
        d.stars += atOldAge - o.w; d.age += p.weeklyWage - atOldAge;
      }
      for (const p of t.squad) if (!old.has(p.id)) { if (before.has(p.id)) d.transIn += p.weeklyWage; else d.youth += p.weeklyWage; }
      d.total = d.retired + d.age + d.stars + d.youth + d.transIn + d.transOut;
      drift.push(d);
    }
  }
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const k = (n) => Math.round(n / 1000).toLocaleString('da-DK') + 'k', pr = (n) => k(n / 3);   // ugeløn → pr. runde
console.log(`profil ${profile} · ${leagues} ligaer × ${seasons} sæsoner = ${rows.length} hold-sæsoner\n`);
console.log('(1) Lønnens drift ved sæsonskiftet, snit pr. hold, kr. PR. RUNDE: total = pension + alder + stjerner + ungdom + køb + salg');
for (let s = 1; s < seasons; s++) { const g = drift.filter((d) => d.s === s); console.log(`  S${s}→S${s + 1}: ${pr(mean(g.map((d) => d.total))).padStart(6)} = ${['retired', 'age', 'stars', 'youth', 'transIn', 'transOut'].map((x) => pr(mean(g.map((d) => d[x])))).join(' + ')}`); }
console.log('  Løn/runde i snit pr. sæson: ' + Array.from({ length: seasons }, (_, i) => k(mean(rows.filter((r) => r.s === i + 1).map((r) => r.wpr)))).join(' · '));
console.log('  Indtægt (billet+TV+præmie) pr. sæson: ' + Array.from({ length: seasons }, (_, i) => k(mean(rows.filter((r) => r.s === i + 1).map((r) => r.gate + r.tv + r.prize)))).join(' · '));
console.log('\n(2) Pr. placering: indtægt/sæson (billet+TV+præmie) · break-even løn/runde · faktisk løn/runde · point snit (sd) · mål');
const inc = (r) => r.gate + r.tv + r.prize;
for (let p = 1; p <= 8; p++) { const g = rows.filter((r) => r.place === p); console.log(`  ${p}. ${k(mean(g.map(inc))).padStart(7)} · ${k(mean(g.map(inc)) / 14).padStart(5)} · ${k(mean(g.map((r) => r.wpr))).padStart(5)} · ${mean(g.map((r) => r.pts)).toFixed(1)} (${sd(g.map((r) => r.pts)).toFixed(1)}) · ${mean(g.map((r) => r.gf)).toFixed(1)}`); }
const me = rows.filter((r) => !r.bot);
console.log(`  Dit hold: placering ${mean(me.map((r) => r.place)).toFixed(1)} · løn/runde ${k(mean(me.map((r) => r.wpr)))} · trup ${mean(me.map((r) => r.squad)).toFixed(1)} · resultat ${k(mean(me.map((r) => inc(r) + r.transfers - r.wages)))} · overskud ${Math.round(100 * me.filter((r) => inc(r) + r.transfers - r.wages >= 0).length / me.length)} %`);
// (3) Sponsorkontrakter: grundbeløb + pr. point + bonus efter slutplacering
const PLACE_BONUS = { 1: 600000, 2: 300000, 3: 150000 };
const C = {
  Tryg:       (r) => 1500000,
  Balance:    (r) => 700000 + 40000 * r.pts,
  'Præstation': (r) => 0 + 60000 * r.pts + (PLACE_BONUS[r.place] ?? 0),
};
const names = Object.keys(C);
console.log('\n(3) Sponsor – snit (sd) pr. sæson efter SLUTplacering; [bedst ex post %]');
for (let p = 1; p <= 8; p++) { const g = rows.filter((r) => r.place === p); console.log(`  ${p}. ` + names.map((n) => `${n} ${k(mean(g.map(C[n])))} (${k(sd(g.map(C[n])))})`).join(' · ')); }
const best = names.map((n) => rows.filter((r) => names.every((m) => C[n](r) >= C[m](r))).length);
console.log(`  bedst ex post: ${names.map((n, i) => `${n} ${Math.round(100 * best[i] / rows.length)} %`).join(' · ')}`);
console.log('  Efter SIDSTE sæsons placering (det man ved, når man vælger) – snit (sd) · bedst ex post:');
for (const grp of [[1, 2], [3, 4], [5, 6], [7, 8]]) {
  const g = rows.filter((r) => r.prev && grp.includes(r.prev));
  console.log(`   sidst ${grp.join('–')}. (n=${g.length}, nu snit ${mean(g.map((r) => r.place)).toFixed(1)}): ` + names.map((n) => `${n} ${k(mean(g.map(C[n])))} (${k(sd(g.map(C[n])))}) ${Math.round(100 * g.filter((r) => names.every((m) => C[n](r) >= C[m](r))).length / g.length)} %`).join(' · '));
}
const D = me.filter((r) => r.prev);
console.log(`  Dit hold (n=${D.length}): ` + names.map((n) => `${n} ${k(mean(D.map(C[n])))} (${k(sd(D.map(C[n])))})`).join(' · '));
// Pengemaskine-tjek: Tryg + tank (sælg alt): Tryg betaler uanset; værdien af at tanke = mistet billet/præmie
console.log('  Ex post: hvad koster det at falde 1 placering? indtægt ' + Array.from({ length: 7 }, (_, i) => k(mean(rows.filter((r) => r.place === i + 1).map(inc)) - mean(rows.filter((r) => r.place === i + 2).map(inc)))).join(' · '));
console.log('  Dit hold pr. sæson: placering · trup · løn/runde · driftsresultat (uden transfers) · transfers');
for (let s = 1; s <= seasons; s++) { const g = me.filter((r) => r.s === s); console.log(`   S${s}: ${mean(g.map((r) => r.place)).toFixed(1)} · ${mean(g.map((r) => r.squad)).toFixed(1)} · ${k(mean(g.map((r) => r.wpr)))} · ${k(mean(g.map((r) => inc(r) - r.wages)))} · ${k(mean(g.map((r) => r.transfers)))}`); }
if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(rows));
