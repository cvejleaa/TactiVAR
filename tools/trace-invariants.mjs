// Kontrolværktøjet til kampens spor (v3.16, brugeren: "en 2d simulering af kampen … så vi bedre kan kontrollere spil
// motoren"). checkTrace(m) giver
//  - errors: brud på sporets egne regler (skal være tomt – tests/unit/trace.test.mjs):
//    31 billeder (t 0–30), 7–11 spillere pr. hold, kendte id'er, alt inden for banen, spillerne på banen = arkets
//    indskiftninger, udskiftninger og udvisninger (en skadet uden indskiftning halter videre og står der), målscoreren i
//    sit holds billede ved målet;
//  - findings: motor-viden til Spilføreren (ikke fejl i sporet): hvor målscorerne stod pr. måltype, og hvor ofte angriberne
//    stod bag modstanderens sidste forsvarer (QC B2: holdenes positioner regnes uafhængigt af hinanden).
// Kør: node tools/trace-invariants.mjs [antal kampe]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { simulateMatch, LONGSHOT_Y, LONGSHOT_FAR } from '../public/engine/match.js';

const FRAMES = 31;
export function checkTrace(m) {
  const errors = [], tr = m.trace;
  const finding = { goals: 0, scorerInBox: 0, longshotOk: 0, longshots: 0, counterFar: 0, frontBehind: 0, frontFrames: 0 };
  if (!tr || tr.v !== 1) return { errors: ['intet spor (v 1)'], finding };
  if (tr.frames.length !== FRAMES || tr.frames.some((f, i) => f.t !== i)) errors.push(`billeder: ${tr.frames.map((f) => f.t).join(',')}`);
  const entries = { h: m.ratings.home, a: m.ratings.away };
  const tagOf = (e) => `#${e.shirtNumber} ${e.shortName}`;
  // Skiftene fra referatets 🔄-mærke "X ind for Y" pr. hold. Træthedsskift og Hvis-Så sker i starten af tick'et, før
  // billedet; et skadesskift sker midt i tick'et, efter billedet (et halvt minut senere her). Den haltende (skadet uden
  // indskiftning) har minOut, men står på banen til slut.
  const inAt = { h: new Map(), a: new Map() }, outAt = { h: new Map(), a: new Map() };
  for (const e of m.events.filter((x) => x.type === 'SUB')) {
    const [sub, out] = e.label.replace(/^🔄 /, '').split(' ind for '), side = e.isHome ? 'h' : 'a', t = e.min + (/Skadesskift/.test(e.text) ? 0.5 : 0);
    if (out) { outAt[side].set(out, t); inAt[side].set(sub, t); }
  }
  const onPitch = (side, min) => new Set(entries[side].filter((e) => (inAt[side].get(tagOf(e)) ?? e.minIn) <= Math.max(1, min)
    && !(e.red && e.minOut < min) && !((outAt[side].get(tagOf(e)) ?? Infinity) <= min)).map((e) => e.playerId));
  const inside = ([, x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100;
  for (const f of tr.frames) for (const side of ['h', 'a']) {
    const ids = f[side].map((q) => q[0]);
    if (ids.length < 7 || ids.length > 11) errors.push(`t ${f.t} ${side}: ${ids.length} spillere`);
    if (new Set(ids).size !== ids.length) errors.push(`t ${f.t} ${side}: dobbelt id`);
    if (!f[side].every(inside)) errors.push(`t ${f.t} ${side}: uden for banen`);
    const want = onPitch(side, f.t * 3);
    if (ids.length !== want.size || ids.some((id) => !want.has(id))) errors.push(`t ${f.t} ${side}: på banen ${ids.length}, arket ${want.size}`);
  }
  for (const mo of tr.moments) {
    if (!['h', 'a'].every((s) => mo[s].every(inside))) errors.push(`øjeblik ${mo.kind} t ${mo.t}: uden for banen`);
    // Spillerne i øjeblikket: dem på banen i minuttet – før eller efter et skadesskift i samme minut (Spilfører v3.16)
    for (const side of ['h', 'a']) {
      const ids = mo[side].map((q) => q[0]), a = onPitch(side, mo.t * 3), b = onPitch(side, mo.t * 3 + 0.5);
      if (ids.length < 7 || ids.length > 11 || new Set(ids).size !== ids.length || !ids.every((id) => a.has(id) || b.has(id))) errors.push(`øjeblik ${mo.kind} t ${mo.t} ${side}: spillerne passer ikke med arket (${ids.length})`);
    }
    if (mo.shooter != null && (!mo[mo.side].some((q) => q[0] === mo.shooter) || String(mo.ball) !== String(mo[mo.side].find((q) => q[0] === mo.shooter)?.slice(1)))) errors.push(`øjeblik ${mo.kind} t ${mo.t}: bolden står ikke ved skytten`);
    if (!mo.scorer) continue;
    const pts = mo[mo.side], sp = pts.find((q) => q[0] === mo.scorer);
    if (!sp) { errors.push(`mål t ${mo.t}: scoreren står ikke i billedet`); continue; }
    // I holdets egne koordinater (lille y = ved modstanderens mål)
    const y = mo.side === 'h' ? sp[2] : 100 - sp[2], ev = m.events[mo.ev];
    const g = m.goalsPool.find((x) => x.min === ev?.min && ev.text.includes(x.scorer));
    finding.goals++;
    if (g?.kind === 'LONGSHOT') { finding.longshots++; if (y >= LONGSHOT_Y && y <= LONGSHOT_FAR) finding.longshotOk++; }
    else if (y < LONGSHOT_Y + 5) finding.scorerInBox++;
    if (g?.kind === 'COUNTER' && y > 40) finding.counterFar++;
  }
  // Angriberne i forhold til modstanderens sidste forsvarer i grundbillederne med bolden (fælles koordinater)
  for (const f of tr.frames.filter((x) => x.poss && !x.lost && !x.run)) {   // en vundet løb/erobring står med vilje forbi linjen
    const att = f[f.poss], def = f[f.poss === 'h' ? 'a' : 'h'], up = f.poss === 'h';
    const front = att.slice(1).reduce((b, q) => (up ? Math.min(b, q[2]) : Math.max(b, q[2])), up ? 100 : 0);
    const last = def.slice(1).reduce((b, q) => (up ? Math.min(b, q[2]) : Math.max(b, q[2])), up ? 100 : 0);
    finding.frontFrames++; if (up ? front < last : front > last) finding.frontBehind++;
  }
  return { errors, finding };
}

export function traceReport(N = 100) {
  const sum = {}, errs = [];
  let bytes = 0;
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
    const r = checkTrace(m);
    errs.push(...r.errors.map((e) => `seed ${s}: ${e}`));
    for (const [k, v] of Object.entries(r.finding)) sum[k] = (sum[k] ?? 0) + v;
    bytes += JSON.stringify(m.trace).length;
  }
  return { errors: errs, sum, bytesPerMatch: bytes / N };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = traceReport(Number(process.argv[2] || 100)), s = r.sum, pc = (a, b) => `${Math.round((a / Math.max(1, b)) * 100)} %`;
  console.log(`Fejl i sporet: ${r.errors.length}${r.errors.length ? '\n  ' + r.errors.slice(0, 20).join('\n  ') : ''}`);
  console.log(`Størrelse: ${(r.bytesPerMatch / 1024).toFixed(1)} KB pr. kamp.`);
  console.log(`Mål med billede: ${s.goals}. Scoreren i/ved feltet (ikke langskud): ${pc(s.scorerInBox, s.goals - s.longshots)}. Langskud fra skudafstand (y ${LONGSHOT_Y}–${LONGSHOT_FAR}): ${pc(s.longshotOk, s.longshots)} af ${s.longshots}. Kontramål med scoreren over y 40: ${s.counterFar}.`);
  console.log(`Holdets forreste står bag modstanderens sidste forsvarer i ${pc(s.frontBehind, s.frontFrames)} af billederne med bolden (v3.16 koblede linjer: skal være 0 %).`);
}
