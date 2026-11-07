// Centrale pladser (v3.33.0, brugeren 6/11: "hvis jeg trak en spiller ud af en standardopstilling, så det f.eks. gik fra at være en cm
// til en dm, så skulle spillet finde ud af det, og ikke give en straf til en dm spiller på den plads"). Dit hold mod hver bot, begge
// baner, i fire scenarier – kør på denne checkout og på en worktree af forrige version og sammenlign:
//   a0  4-2-3-1 som "Skift formation" stiller op: en CM på hver CDM-plads (ankeret, y 56) – ens på begge versioner
//   a   som a0, men den venstre CDM-plads trukket til y 48 (CM-zonen): CM'en dér passer nu (+1 rettet)
//   b0  4-3-3 med bænkens DM på den venstre CM-plads (ankeret, y 44)
//   b   som b0, men pladsen trukket til y 56 (DM-zonen): DM'en passer nu (+1 rettet), og rollen bliver DM
//   c0  4-2-3-1 med bænkens OM på CAM-pladsen (ankeret, y 34)
//   c   som c0, men pladsen trukket til y 46 (CM-zonen): OM'en er nu på naboplads (−1), og løbsprofilen bliver CM's
//   d0  3-4-3 med bænkens DM på den venstre CM-plads (ankeret, y 50 – CM-zonen): naboplads
//   d   som d0, men pladsen trukket til y 52 (mellemzonen DM/CM): DM'en passer fuldt (+1 rettet), rollen forbliver CM (Spilfører motor:
//       mellemzonen giver fuld pasform OG CM-bevægelse – "egentlig DM-opgave", backlog 0g)
// Udskriver mål for/imod, netto og antal uden for position. Kør: node tools/measure-central.mjs [N=150] [rod] [fra=1] [--json]
// (fra = første seed, så flere processer kan dele seeds; --json = summer til at lægge sammen)
// Før/efter: node tools/measure-central.mjs sammenlign <rod for forrige version> [N=150] [--par P] [--kun a,b,d] – PARRET: samme ligaer,
// samme modstandere og samme rng-seeds på begge versioner, så forskellen regnes kamp for kamp (netto efter − netto før) og udskrives med
// ± SE (spredningen af de parrede forskelle / √n). Også pr. rettet spiller (antal, der ikke længere står uden for position). --par P
// deler seeds i P processer pr. version (summen er den samme som i én proces).
// Gemte spil: node tools/measure-central.mjs fixtures <rod for forrige version> – hvor mange trukne pladser i tests/fixtures/* der
// skifter pladstype, rolle eller fit (alle planer, alle hold).
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SCENARIOS = {
  a0: { f: '4-2-3-1' }, a: { f: '4-2-3-1', drag: [5, { x: 36, y: 48 }] },
  b0: { f: '4-3-3', put: [6, 'DM'] }, b: { f: '4-3-3', put: [6, 'DM'], drag: [6, { x: 32, y: 56 }] },
  c0: { f: '4-2-3-1', put: [8, 'AM'] }, c: { f: '4-2-3-1', put: [8, 'AM'], drag: [8, { x: 50, y: 46 }] },
  d0: { f: '3-4-3', put: [5, 'DM'] }, d: { f: '3-4-3', put: [5, 'DM'], drag: [5, { x: 38, y: 52 }] },
};

export async function measureCentral(N = 150, root = resolve(import.meta.dirname, '..'), from = 1, names = Object.keys(SCENARIOS)) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const A = await imp('public/state/actions.js');
  const out = {};
  for (const name of names) {
    const sc = SCENARIOS[name];
    let gf = 0, ga = 0, games = 0, oop = 0, teams = 0; const nets = [];   // nets: netto pr. kamp i fast rækkefølge (til den parrede sammenligning)
    for (let s = from; s < from + N; s++) {
      const L = createLeague(createRng(s * 53)), me = L.teams.find((t) => !t.isBot);
      A.setFormation(me, sc.f);
      if (sc.put) {
        const [slot, pos] = sc.put, sub = me.squad.find((p) => p.position === pos && !me.tactics.lineupSlots.includes(p.id));
        if (!sub) continue;   // truppen har ingen ledig spiller med den position – seedet springes over (begge versioner ens)
        A.swapPlayers(me, me.tactics.lineupSlots[slot], sub.id);
      }
      if (sc.drag) A.moveSlot(me, sc.drag[0], sc.drag[1]);
      oop += A.outOfPositionCount(me); teams++;
      for (const opp of L.teams.filter((t) => t.isBot)) for (const home of [true, false]) {
        const rng = createRng(s * 7919 + opp.id.length * 31 + (home ? 1 : 2)), m = home ? simulateMatch(me, opp, rng) : simulateMatch(opp, me, rng);
        gf += home ? m.homeGoals : m.awayGoals; ga += home ? m.awayGoals : m.homeGoals; games++; nets.push(home ? m.homeGoals - m.awayGoals : m.awayGoals - m.homeGoals);
      }
    }
    out[name] = { gf, ga, games, oop, teams, nets };
  }
  return out;
}

export const summary = (v) => { const r = (x) => Math.round(x * 1000) / 1000; return { for: r(v.gf / v.games), against: r(v.ga / v.games), net: r((v.gf - v.ga) / v.games), outOfPos: r(v.oop / v.teams), games: v.games }; };

export async function fixtureShifts(oldRoot, root = resolve(import.meta.dirname, '..')) {
  const N = await import(pathToFileURL(resolve(root, 'public/engine/formations.js')).href), O = await import(pathToFileURL(resolve(oldRoot, 'public/engine/formations.js')).href);
  const dir = resolve(root, 'tests/fixtures'), out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(resolve(dir, f), 'utf8')), r = { drags: 0, kind: 0, role: 0, fit: 0 };
    for (const t of (d.league ?? d).teams ?? []) for (const tac of [t.tactics, ...(t.tacticPresets ?? [])]) for (const [k, c] of Object.entries(tac?.customCoords ?? {})) {
      const slot = +k, role = (N.FORMATIONS[tac.baseFormation] || N.FORMATIONS['4-4-2'])[slot]?.r, p = t.squad?.find((x) => x.id === tac.lineupSlots?.[slot]);
      r.drags++; if (N.slotPositionOf(role, c.y) !== O.slotPositionOf(role, c.y)) r.kind++;
      if (N.slotRoleOf(tac, slot) !== role) r.role++;
      if (p && N.slotFitOf(tac, slot, p.position) !== O.slotFitOf(tac, slot, p.position)) r.fit++;
    }
    out[f] = r;
  }
  return out;
}

// Samme seeds delt i P processer (hver kører "node measure-central.mjs n rod fra --json --kun …") – lagt sammen i seed-rækkefølge.
async function measureParallel(N, root, names, P) {
  if (P <= 1) return measureCentral(N, root, 1, names);
  const { execFile } = await import('node:child_process'), size = Math.ceil(N / P), self = import.meta.filename;
  const parts = await Promise.all(Array.from({ length: P }, (_, i) => [1 + i * size, Math.min(size, N - i * size)]).filter(([, n]) => n > 0).map(([from, n]) =>
    new Promise((ok, fail) => execFile(process.execPath, [self, String(n), root ?? resolve(import.meta.dirname, '..'), String(from), '--json', '--kun', names.join(',')], { maxBuffer: 1 << 28 }, (e, out) => (e ? fail(e) : ok(JSON.parse(out)))))));
  const out = {};
  for (const k of names) out[k] = parts.reduce((a, p) => ({ gf: a.gf + p[k].gf, ga: a.ga + p[k].ga, games: a.games + p[k].games, oop: a.oop + p[k].oop, teams: a.teams + p[k].teams, nets: a.nets.concat(p[k].nets) }), { gf: 0, ga: 0, games: 0, oop: 0, teams: 0, nets: [] });
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === 'fixtures') {
  const r = await fixtureShifts(resolve(process.argv[3]));
  const sum = Object.values(r).reduce((a, v) => ({ drags: a.drags + v.drags, kind: a.kind + v.kind, role: a.role + v.role, fit: a.fit + v.fit }), { drags: 0, kind: 0, role: 0, fit: 0 });
  console.log(`${Object.keys(r).length} gemte spil: ${sum.drags} trukne pladser · pladstype skifter ${sum.kind} · rolle skifter ${sum.role} · fit skifter ${sum.fit}`);
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === 'sammenlign') {
  const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const N = Number(process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : 150), P = Math.max(1, Number(opt('--par') || 1));
  const names = opt('--kun') ? opt('--kun').split(',') : Object.keys(SCENARIOS);
  const [o, n] = await Promise.all([resolve(process.argv[3]), undefined].map((root) => measureParallel(N, root, names, P)));
  const r3 = (x) => Math.round(x * 1000) / 1000, sg = (x) => `${x >= 0 ? '+' : ''}${r3(x)}`;
  for (const k of names) {
    const a = summary(o[k]), b = summary(n[k]), fixed = r3(a.outOfPos - b.outOfPos);
    if (o[k].nets.length !== n[k].nets.length) throw new Error(`${k}: ikke parret (${o[k].nets.length} mod ${n[k].nets.length} kampe)`);
    const d = n[k].nets.map((x, i) => x - o[k].nets[i]), m = d.reduce((s, x) => s + x, 0) / d.length;
    const se = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1) / d.length);
    console.log(`${k.padEnd(3)} ${SCENARIOS[k].f} netto ${a.net} → ${b.net} · parret ${sg(m)} ± ${r3(se)} (SE) · uden for position ${a.outOfPos} → ${b.outOfPos}${fixed > 0 ? ` · pr. rettet ${sg(m / fixed)} ± ${r3(se / fixed)}` : fixed < 0 ? ` · pr. ny uden for position ${sg(m / -fixed)} ± ${r3(se / -fixed)}` : ''} · ${d.length} kampe`);
  }
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ki = process.argv.indexOf('--kun'), kun = ki > 0 ? process.argv[ki + 1].split(',') : undefined;
  const args = process.argv.slice(2).filter((a, i, all) => a !== '--json' && a !== '--kun' && all[i - 1] !== '--kun'), json = process.argv.includes('--json');
  const r = await measureCentral(Number(args[0] || 150), args[1] ? resolve(args[1]) : undefined, Number(args[2] || 1), kun);
  if (json) console.log(JSON.stringify(r));
  else for (const [k, v] of Object.entries(r)) { const x = summary(v); console.log(`${k.padEnd(3)} ${SCENARIOS[k].f} for ${x.for} · imod ${x.against} · netto ${x.net} · uden for position ${x.outOfPos} af 11 · ${x.games} kampe`); }
}
