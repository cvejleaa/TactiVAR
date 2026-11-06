// Centrale pladser (v3.33.0, brugeren 6/11: "hvis jeg trak en spiller ud af en standardopstilling, så det f.eks. gik fra at være en cm
// til en dm, så skulle spillet finde ud af det, og ikke give en straf til en dm spiller på den plads"). Dit hold mod hver bot, begge
// baner, i fire scenarier – kør på denne checkout og på en worktree af forrige version og sammenlign:
//   a0  4-2-3-1 som "Skift formation" stiller op: en CM på hver CDM-plads (ankeret, y 56) – ens på begge versioner
//   a   som a0, men den venstre CDM-plads trukket til y 48 (CM-zonen): CM'en dér passer nu (+1 rettet)
//   b0  4-3-3 med bænkens DM på den venstre CM-plads (ankeret, y 44)
//   b   som b0, men pladsen trukket til y 56 (DM-zonen): DM'en passer nu (+1 rettet), og rollen bliver DM
//   c0  4-2-3-1 med bænkens OM på CAM-pladsen (ankeret, y 34)
//   c   som c0, men pladsen trukket til y 46 (CM-zonen): OM'en er nu på naboplads (−1), og løbsprofilen bliver CM's
// Udskriver mål for/imod, netto og antal uden for position. Kør: node tools/measure-central.mjs [N=150] [rod] [fra=1] [--json]
// (fra = første seed, så flere processer kan dele seeds; --json = summer til at lægge sammen)
// Før/efter: node tools/measure-central.mjs sammenlign <rod for forrige version> [N=150] – netto pr. scenarie på begge, forskellen og
// forskellen pr. rettet spiller (antal, der ikke længere står uden for position).
// Gemte spil: node tools/measure-central.mjs fixtures <rod for forrige version> – hvor mange trukne pladser i tests/fixtures/* der
// skifter pladstype, rolle eller fit (alle planer, alle hold).
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SCENARIOS = {
  a0: { f: '4-2-3-1' }, a: { f: '4-2-3-1', drag: [5, { x: 36, y: 48 }] },
  b0: { f: '4-3-3', put: [6, 'DM'] }, b: { f: '4-3-3', put: [6, 'DM'], drag: [6, { x: 32, y: 56 }] },
  c0: { f: '4-2-3-1', put: [8, 'AM'] }, c: { f: '4-2-3-1', put: [8, 'AM'], drag: [8, { x: 50, y: 46 }] },
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
    let gf = 0, ga = 0, games = 0, oop = 0, teams = 0;
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
        gf += home ? m.homeGoals : m.awayGoals; ga += home ? m.awayGoals : m.homeGoals; games++;
      }
    }
    out[name] = { gf, ga, games, oop, teams };
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === 'fixtures') {
  const r = await fixtureShifts(resolve(process.argv[3]));
  const sum = Object.values(r).reduce((a, v) => ({ drags: a.drags + v.drags, kind: a.kind + v.kind, role: a.role + v.role, fit: a.fit + v.fit }), { drags: 0, kind: 0, role: 0, fit: 0 });
  console.log(`${Object.keys(r).length} gemte spil: ${sum.drags} trukne pladser · pladstype skifter ${sum.kind} · rolle skifter ${sum.role} · fit skifter ${sum.fit}`);
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === 'sammenlign') {
  const N = Number(process.argv[4] || 150), [o, n] = [await measureCentral(N, resolve(process.argv[3])), await measureCentral(N)];
  for (const k of Object.keys(n)) {
    const a = summary(o[k]), b = summary(n[k]), fixed = a.outOfPos - b.outOfPos, d = Math.round((b.net - a.net) * 1000) / 1000;
    console.log(`${k.padEnd(3)} ${SCENARIOS[k].f} netto ${a.net} → ${b.net} (${d >= 0 ? '+' : ''}${d}) · uden for position ${a.outOfPos} → ${b.outOfPos}${fixed ? ` · pr. rettet ${Math.round((d / fixed) * 1000) / 1000}` : ''} · ${b.games} kampe`);
  }
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter((a) => a !== '--json'), json = process.argv.includes('--json');
  const r = await measureCentral(Number(args[0] || 150), args[1] ? resolve(args[1]) : undefined, Number(args[2] || 1));
  if (json) console.log(JSON.stringify(r));
  else for (const [k, v] of Object.entries(r)) { const x = summary(v); console.log(`${k.padEnd(3)} ${SCENARIOS[k].f} for ${x.for} · imod ${x.against} · netto ${x.net} · uden for position ${x.outOfPos} af 11 · ${x.games} kampe`); }
}
