// B7 – bred kanarie (Security Reviewer v3.18.0): botternes skjulte felter (evner undtagen udholdenhed, potentiale, VAR-profil,
// træningsfokus, fremdrift, mod-kunnen, spring) forstyrres lige før bogføringen af runde 7 (vinduet) og 14 (sæsonskiftet). Alt
// offentligt bagefter skal være identisk: trupper, opstillinger, bænke, transferliste, pensioner, bud, ungdomsoptag og de
// offentlige spillerfelter. Fanger: opstillingsreparation, botternes salg og køb efter evner/potentiale (M3, M4, M6), optag efter
// potentiale (M2), bænk efter evner (M1), eget træningsfokus (M5). Udholdenhed er udeladt: friskheden er en kendt, støjet kanal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound } from '../../public/engine/season.js';
import { viewPlayer } from '../../public/engine/visibility.js';
import { publicValue, FOCUS } from '../../public/engine/career.js';

function setup(L, roundsBefore) {
  const bots = L.teams.filter((t) => t.isBot), me = L.teams.find((t) => !t.isBot);
  for (const p of me.squad.filter((p) => !me.tactics.lineupSlots.includes(p.id)).slice(0, 4)) me.listed.push(p.id);
  // Botter med overskud (salg og køb mulige), én i minus (tvangssalg), én under minimum i FOR (køb i trin 2)
  bots.slice(0, 4).forEach((t, ti) => { for (const [line, n] of [['MID', 3], ['DEF', 2], ['ATT', 2]]) for (let i = 0; i < n; i++) {
    const src = t.squad.find((p) => p.line === line && !t.tactics.lineupSlots.includes(p.id)) ?? t.squad.find((p) => p.line === line);
    t.squad.push({ ...structuredClone(src), id: `gx${ti}_${line}${i}`, shortName: `G${ti}. ${line}${i}`, shirtNumber: 60 + i + (line === 'DEF' ? 10 : line === 'ATT' ? 20 : 0), careerGames: 0, matchLog: [], lastMove: null });
  } });
  bots[4].cashBalance = -800000;
  const d = bots[5].squad.find((p) => p.line === 'DEF' && !bots[5].tactics.lineupSlots.includes(p.id)); bots[5].squad = bots[5].squad.filter((p) => p !== d);
  bots[5].squad.push({ ...structuredClone(bots[5].squad.find((p) => p.line === 'MID' && !bots[5].tactics.lineupSlots.includes(p.id))), id: 'gx5', shortName: 'G5. X', shirtNumber: 77 });
  for (const b of bots) b.cashBalance = b === bots[4] ? b.cashBalance : 8000000;
  // Bot-startere, der går på pension ved sæsonslut (opstillingen repareres)
  if (roundsBefore === 13) for (const t of bots) t.squad.filter((p) => t.tactics.lineupSlots.includes(p.id) && p.line !== 'GK').slice(0, 2).forEach((p) => { p.age = 36; });
}
function perturb(L) {
  const r = createRng(4242);
  for (const t of L.teams.filter((x) => x.isBot)) for (const p of t.squad) {
    for (const k of Object.keys(p.skills)) if (k !== 'stamina') p.skills[k] = 2 + Math.floor(r.next() * 19);
    p.potential = 4 + r.next() * 15; p.varProfile = { cynicism: 1 + Math.floor(r.next() * 19), theatre: 1, varPulse: 20 };
    p.trainingFocus = Object.keys(FOCUS)[Math.floor(r.next() * 8)];
    p.dev = Object.fromEntries(Object.keys(p.skills).map((k) => [k, Math.round(r.next() * 990) / 1000]));
    p.counterTactics = { vsPress: Math.floor(r.next() * 40), vsLowBlock: Math.floor(r.next() * 40), vsTrapLong: Math.floor(r.next() * 40) };
    p.jumpingPower = 1 + Math.floor(r.next() * 20);
  }
}
const pub = (L) => ({
  teams: L.teams.map((t) => ({ squad: t.squad.map((p) => p.id), lineup: t.tactics.lineupSlots, bench: t.matchBench,
    players: t.squad.map((p) => { const v = viewPlayer(p, false); delete v.freshness; return { ...v, value: publicValue(p) }; }) })),
  transferLog: L.transferLog, retired: L.retired, offers: L.offers, youthTaken: L.turnoverReport?.youthTaken ?? null,
});

for (const roundsBefore of [6, 13]) for (const seed of [4, 9]) test(`kanarie: botternes skjulte data ændrer intet offentligt (runde ${roundsBefore + 1}, seed ${seed})`, () => {
  const base = createLeague(createRng(seed)), rng = createRng(seed * 3);
  for (let r = 0; r < roundsBefore; r++) commitRound(base, playRound(base, rng), rng);
  setup(base, roundsBefore);
  const result = playRound(base, rng);
  const A = structuredClone(base), B = structuredClone(base);
  perturb(B);
  commitRound(A, structuredClone(result), createRng(777));
  commitRound(B, structuredClone(result), createRng(777));
  if (roundsBefore === 6) assert.ok(A.transferLog.length > 0, 'data: der blev handlet i vinduet efter runde 7');
  if (roundsBefore === 13) assert.ok(A.retired.length > 0, 'data: bot-startere gik på pension');
  // Kun de offentlige felter – og de skjulte er faktisk forskellige (ellers beviser testen intet)
  assert.notDeepEqual(A.teams[1].squad.map((p) => p.skills.pace), B.teams[1].squad.map((p) => p.skills.pace));
  assert.deepEqual(pub(B), pub(A));
});
