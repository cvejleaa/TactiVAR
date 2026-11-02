// Trupstørrelse mod træthed (spilfoerer-klub 2026-11-02): dit hold med 18/20/22 spillere mod botterne.
// Fyld: 'ungdom' (generatePlayer YOUTH, ingen bot svækkes) eller 'køb' (de billigste på markedet).
// Politik: 'fast' (rører intet – motoren erstatter kun skadede/udelukkede) · 'roter' (botternes regel på dit hold: starter
// under 80 % hviles for en ≥ 85 % i samme kæde, højst 2 svagere i evnesnit – match.js:238) · 'frisk' (kontrol: hele truppen
// sat til 100 % før hver runde = hvad trætheden koster i alt). Truppen fyldes op til N igen efter hver sæsonslut.
// Kør: node tools/measure-squad-depth.mjs [ligaer] [sæsoner]
import { createRng } from '../public/engine/rng.js';
import { createLeague, generatePlayer } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { unavailable, freeShirt, autoMatchBench } from '../public/engine/career.js';
import { marketInfo, buyPlayer } from '../public/engine/transfers.js';
const leagues = +process.argv[2] || 10, seasons = +process.argv[3] || 3;
const avg = (p) => Object.values(p.skills).reduce((a, b) => a + b, 0) / 9;
const FILL_LINES = ['MID', 'DEF', 'ATT', 'MID'];
function fill(L, me, N, how, rng) {
  let i = 0;
  while (me.squad.length < N) {
    if (how === 'klon') {   // hypotetisk: en kopi af en markspiller fra startopstillingen (samme evner, nyt id – lavere samspil)
      const xi = me.tactics.lineupSlots.slice(1).map((id) => me.squad.find((p) => p.id === id)).filter(Boolean).sort((a, b) => ({ MID: 0, DEF: 1, ATT: 2 }[a.line] - { MID: 0, DEF: 1, ATT: 2 }[b.line]));
      const src = xi[(me.squad.length - 18) % xi.length], c = structuredClone(src);
      Object.assign(c, { id: `plr_klon${L.nextPlayerSeq++}`, shortName: src.shortName + "'", name: src.name + "'", shirtNumber: freeShirt(me), matchLog: [] });
      me.squad.push(c); continue;
    }
    if (how === 'køb') {
      const c = L.teams.filter((t) => t.isBot).flatMap((t) => t.squad.map((p) => ({ p, m: marketInfo(L, me, t, p) }))).filter((o) => !o.m.reason).sort((a, b) => a.m.price - b.m.price)[0];
      if (c) { buyPlayer(L, me, c.p.id); continue; }
    }
    const line = FILL_LINES[i++ % 4], used = new Set(L.teams.flatMap((t) => t.squad.map((p) => p.shortName)));
    me.squad.push(generatePlayer(rng, line, 'YOUTH', freeShirt(me), 0, used, 0, undefined, `plr_fill${L.nextPlayerSeq++}`));
  }
  autoMatchBench(me);
}
const ff = (p) => 0.75 + 0.25 * p.freshness / 100;   // match.js:207
// 'smart': den bedste til pladsen efter evnesnit × friskhedsfaktor (en manager, der ser friskheden)
function smart(me) {
  const slots = me.tactics.lineupSlots, byId = new Map(me.squad.map((p) => [p.id, p])), on = new Set(slots);
  slots.forEach((id, i) => {
    const p = byId.get(id);
    if (i === 0 || !p || unavailable(p)) return;
    const b = me.squad.filter((q) => !on.has(q.id) && q.line === p.line && !unavailable(q) && avg(q) * ff(q) > avg(p) * ff(p) + 0.05).sort((x, y) => avg(y) * ff(y) - avg(x) * ff(x))[0];
    if (b) { slots[i] = b.id; on.delete(id); on.add(b.id); swaps++; }
  });
}
let swaps = 0;
function rotate(me) {
  const slots = me.tactics.lineupSlots, byId = new Map(me.squad.map((p) => [p.id, p])), on = new Set(slots);
  const rest = me.subsLimit + 10, freshMin = rest + 5;
  slots.forEach((id, i) => {
    const p = byId.get(id);
    if (i === 0 || !p || unavailable(p) || p.freshness >= rest) return;
    const b = me.squad.filter((q) => !on.has(q.id) && q.line === p.line && !unavailable(q) && q.freshness >= freshMin && avg(q) >= avg(p) - 2).sort((x, y) => avg(y) - avg(x))[0];
    if (b) { slots[i] = b.id; on.delete(id); on.add(b.id); swaps++; }
  });
}
function run(N, how, policy) {
  swaps = 0;
  const out = [];
  for (let seed = 1; seed <= leagues; seed++) {
    const L = createLeague(createRng(seed * 101)), rng = createRng(seed * 7), frng = createRng(seed * 13), me = L.teams.find((t) => !t.isBot);
    for (let s = 1; s <= seasons; s++) {
      fill(L, me, N, how, frng);
      const acc = { pts: 0, fresh: 0, xi: 0, cant: 0, unav: 0, fsubs: 0, short: 0 };
      for (let r = 0; r < 14; r++) {
        if (policy === 'frisk') for (const p of me.squad) p.freshness = 100;
        const pref = me.tactics.lineupSlots.slice();
        if (policy === 'roter') rotate(me);
        if (policy === 'smart') smart(me);
        acc.unav += me.squad.filter(unavailable).length;
        const fr = new Map(me.squad.map((p) => [p.id, p.freshness]));
        const res = playRound(L, rng), m = res.matches.find((x) => x.homeId === me.id || x.awayId === me.id), home = m.homeId === me.id;
        const rs = home ? m.ratings.home : m.ratings.away, starters = rs.filter((x) => x.minIn <= 1);
        for (const x of starters) { acc.fresh += fr.get(x.playerId); acc.xi++; }
        if (starters.length < 11) acc.short++;
        acc.cant += m.events.filter((e) => e.isHome === home && e.label === 'Udskiftning ikke mulig').length;
        acc.fsubs += m.events.filter((e) => e.isHome === home && /\(træt,/.test(e.text ?? '')).length;
        const gf = home ? m.homeGoals : m.awayGoals, ga = home ? m.awayGoals : m.homeGoals;
        acc.pts += gf > ga ? 3 : gf === ga ? 1 : 0;
        me.tactics.lineupSlots = pref;
        commitRound(L, res, rng);
      }
      out.push({ ...acc, place: L.seasons.at(-1).table.findIndex((x) => x.teamId === me.id) + 1 });
    }
  }
  const mean = (k) => out.reduce((a, o) => a + o[k], 0) / out.length;
  const sd = Math.sqrt(out.reduce((a, o) => a + (o.pts - mean('pts')) ** 2, 0) / out.length) / Math.sqrt(out.length);
  console.log(`${String(N)} ${how.padEnd(6)} ${policy.padEnd(6)} point/sæson ${mean('pts').toFixed(1)} (±${sd.toFixed(1)}) · plads ${mean('place').toFixed(2)} · startfriskhed ${(out.reduce((a, o) => a + o.fresh, 0) / out.reduce((a, o) => a + o.xi, 0)).toFixed(1)} % · træthedsskift/kamp ${(mean('fsubs') / 14).toFixed(2)} · "ikke mulig"/sæson ${mean('cant').toFixed(1)} · ude (skade+karantæne)/runde ${(mean('unav') / 14).toFixed(2)} · <11 startere ${mean('short').toFixed(2)} · rotationer/runde ${(swaps / out.length / 14).toFixed(2)}`);
}
const only = process.argv[4];
for (const [N, how, pol] of [[18, '-', 'frisk'], [18, '-', 'fast'], [18, '-', 'roter'], [20, 'ungdom', 'fast'], [20, 'ungdom', 'roter'], [22, 'ungdom', 'roter'], [20, 'køb', 'roter'], [22, 'køb', 'roter'], [22, 'køb', 'frisk'], [18, '-', 'smart'], [22, 'køb', 'smart'], [22, 'klon', 'roter'], [22, 'klon', 'smart'], [25, 'klon', 'smart'], [25, 'klon', 'frisk']]) if (!only || only === `${N}${how}${pol}`) run(N, how, pol);
