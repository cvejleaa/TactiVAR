// Test Manager v3.14.1: huller fundet ved mutation af VAR-tjekket for den forreste (match.js, VAR-grenen).
// Hver test nævner, hvilken mutation den dræber. Kampen styres bogstaveligt: seqRng() leverer rullene i den
// rækkefølge, VAR-grenen bruger dem (xG, skudsted, modtager, VAR-tjek, de to VAR-rul) og lader resten være 0,5,
// så skytten, den tjekkede, karaktererne og teksterne er kendte tal – ikke noget, testen læser tilbage fra motoren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch as simLive, VAR_FRONT } from '../../public/engine/match.js';
import { describeGoal } from '../../public/engine/clues.js';

const simulateMatch = (h, a, r) => simLive(h, a, r, { liveEnergy: false });
// To chancer (de to første chance(0,3)); i hver: next() giver [xG, skudsted, modtager, VAR-tjek, VAR-rul 1, VAR-rul 2], derefter 0,5.
// spot < 0,5 = feltets kant (EDGE_SHARE 0,5), ≥ 0,5 = målet; recv 0,1 = første i rækken blandt dem nær stedet.
function seqRng({ spot = 0.1, v1 = 0.5, v2 = 0.5 } = {}) {
  let q = [], n = 0;
  return {
    next: () => (q.length ? q.shift() : 0.5), int: (a) => a, pick: (arr) => arr[0],
    chance: (p) => { if (p === 0.3 && n++ < 2) { q = [0.5, spot, 0.1, 0.1, v1, v2]; return true; } return false; },
  };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
const prep = (t) => {
  for (const p of t.squad) {
    p.skills = SK(10); p.aerialPower = 10; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 };
    p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0;
  }
  t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0;
  t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
  // Neutrale faser (en bot har ellers egne: Mange løb = 36 % chance i stedet for 30 %, og sit eget pres)
  const ph = t.tactics.phases;
  Object.assign(ph.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL', offBallRuns: 'NORMAL' });
  Object.assign(ph.phase2_defending, { pressingHeight: 'MID_BLOCK', offsideTrap: 'OFF', tacklingIntensity: 'NORMAL' });
  Object.assign(ph.phase3_transition, { onBallWon: 'KEEP_POSSESSION', onBallLost: 'DROP_BACK' });
};
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const tag = (p) => `#${p.shirtNumber} ${p.shortName}`;
const FAR = { x: 50, y: 95 };
// Pladserne (4-4-2, bolden på midten, angreb): back +20 frem, midtbane +16, angriber +6, stopper +14 (live-gaps.test.mjs).
// Alle markspillere langt væk (FAR), undtagen de udvalgte: slot 1 (back, skytten) og eventuelt slot 8 (midtbane) og 9 (angriber).
const SPOTS = {
  front: { 1: { x: 50, y: 50 } },                                      // skytten alene forrest (y 30): ingen foran → han tjekkes selv
  one: { 1: { x: 50, y: 50 }, 9: { x: 50, y: 28 } },                   // én foran ham (angriber y 22): stadig blandt de to forreste → han tjekkes selv
  two: { 1: { x: 50, y: 50 }, 8: { x: 50, y: 30 }, 9: { x: 50, y: 28 } },   // to foran (midtbanen y 14, angriberen y 22): bagved → den forreste, midtbanespilleren, tjekkes
};
// attack 'H' = dit hold (menneske), 'A' = botten angriber. Returnerer kampen og de fire roller.
function varGame({ spots, attack = 'H', rolls, shooterPulse = 10, offPulse = 10, shooterTrap = 25, offTrap = 25, defPositioning = 11, offSlot = 8 }) {
  const L = createLeague(createRng(1)), [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) prep(t);
  const att = attack === 'H' ? H : A, def = attack === 'H' ? A : H;
  att.tactics.customCoords = {}; for (let i = 1; i <= 10; i++) att.tactics.customCoords[i] = spots[i] ?? FAR;
  if (attack === 'A') for (const p of [5, 6, 7, 8].map((i) => slot(A, i))) p.skills.passing = 15;   // botten har bolden
  const d = slot(def, 1); d.skills.positioning = defPositioning; d.skills.intercepting = 20;
  const shooter = slot(att, 1), off = slot(att, offSlot), assister = slot(att, 5);
  shooter.varProfile.varPulse = shooterPulse; off.varProfile.varPulse = offPulse;
  shooter.counterTactics.vsTrapLong = shooterTrap; off.counterTactics.vsTrapLong = offTrap;
  const m = simulateMatch(H, A, seqRng(rolls));
  const home = m.ratings.home, away = m.ratings.away;
  const rating = (p) => [...home, ...away].find((r) => r.playerId === p.id);
  return { H, A, att, def, m, shooter, off, assister, defender: d, rating, evs: m.events.filter((e) => /^VAR_/.test(e.type)) };
}
const bySlot = (t, xy) => t.tactics.lineupSlots.map((id, i) => [id, ...xy[i]]);
// Billedet af 'two' (H): GK 90 · back (skytten) · stoppere 81 · højre back 75 · midtbane 79 · [slot 8: 14] · [slot 9: 22] · angriber 89
const BASE = [[50, 90], [50, 30], [50, 81], [50, 81], [50, 75], [50, 79], [50, 79], [50, 79], [50, 14], [50, 22], [50, 89]];
const withPts = (changes) => BASE.map((xy, i) => changes[i] ?? xy);

test('billedet: skytten står, hvor han skød fra (kanten 50,32 / målet 50,20); den tjekkede står, hvor han stod (forrest, 50,14); bolden ved skytten', () => {
  // Dræber: skudsted altid EDGE / snapshot med SPOT.EDGE i stedet for shotSpot (overlevede: forfatterens test bruger kun rul 0,1 = kanten),
  // moves-skytten på SPOT.EDGE, og 'other' altid sand (så en selv-tjekket skytte flyttes til 50,16).
  for (const [spot, ball] of [[0.1, [50, 32]], [0.9, [50, 20]]]) {
    const two = varGame({ spots: SPOTS.two, rolls: { spot } });
    assert.equal(two.evs.length, 2);
    const s = two.evs[0].snapshot;
    assert.equal(s.scorer, two.shooter.id); assert.equal(s.assist, two.assister.id);
    assert.deepEqual(s.ball, ball, `bolden ved skytten (spot ${spot})`);
    assert.deepEqual(s.pts, bySlot(two.H, withPts({ 1: ball })), `to foran: skytten på ${ball}, den forreste (slot 8) bliver på 50,14 (v3.14.1: før flyttet tilbage til 50,16)`);
    // skytten selv forrest: ingen anden flyttes – og skytten flyttes til skudstedet, ikke 50,16
    for (const key of ['front', 'one']) {
      const own = varGame({ spots: SPOTS[key], rolls: { spot } });
      const o = own.evs[0].snapshot;
      assert.deepEqual(o.ball, ball);
      const base = key === 'one' ? withPts({ 1: ball, 8: [50, 79] }) : withPts({ 1: ball, 8: [50, 79], 9: [50, 89] });
      assert.deepEqual(o.pts, bySlot(own.H, base), `${key}: kun skytten flyttes (spot ${spot})`);
    }
  }
});

test('grænsen VAR_FRONT = 2: præcis én foran → skytten tjekkes selv; to foran → den forreste tjekkes (konstanten er en literal, ikke den importerede)', () => {
  // forfatterens var-front.test importerer VAR_FRONT og sammenligner rank med den: sættes konstanten til 1 eller 3, følger testen med (overlevede begge).
  assert.equal(VAR_FRONT, 2);
  const one = varGame({ spots: SPOTS.one, rolls: {} }), two = varGame({ spots: SPOTS.two, rolls: {} });
  assert.match(one.evs[0].text, new RegExp(`GODKENDT! ${tag(one.shooter)} var lige akkurat på den rigtige side\\.$`), 'rang 1: skytten selv');
  assert.match(two.evs[0].text, new RegExp(`GODKENDT! ${tag(two.shooter)} skød, og ${tag(two.off)} foran ham stod ikke offside – han var lige akkurat`), 'rang 2: den forreste');
  // den forreste er den, der står forrest på banen – her en midtbanespiller (y 14) foran angriberen (y 22)
  assert.notEqual(two.off.id, slot(two.H, 9).id);
});

test('VAR afgøres af den tjekkedes evner: varPulse, mod-kunnen mod fælden og tidsangivelsen – ikke skyttens (hjemme og ude)', () => {
  // Dræber: off.varProfile → shooter.varProfile i afgørelsen, off.counterTactics → shooter.counterTactics, describeVarTiming(off…) → (shooter…).
  for (const attack of ['H', 'A']) {
    const good = (g) => g.evs.map((e) => e.type).join();
    // varPulse: den tjekkede 0 (taber mod positioning 11 selv med 1,1 i fælde), skytten 20 → annulleret; omvendt → godkendt
    assert.equal(good(varGame({ spots: SPOTS.two, attack, shooterPulse: 20, offPulse: 0 })), 'VAR_NO_GOAL,VAR_NO_GOAL', `${attack}: skytten 20 / tjekket 0`);
    assert.equal(good(varGame({ spots: SPOTS.two, attack, shooterPulse: 0, offPulse: 20 })), 'VAR_GOAL,VAR_GOAL', `${attack}: skytten 0 / tjekket 20`);
    // fælden: 10 + 40·0,045 = 11,8 > 11,5 – men 10 + 0 = 10 < 11,5
    assert.equal(good(varGame({ spots: SPOTS.two, attack, offTrap: 40, shooterTrap: 0, defPositioning: 11.5 })), 'VAR_GOAL,VAR_GOAL', `${attack}: fælde hos den tjekkede`);
    assert.equal(good(varGame({ spots: SPOTS.two, attack, offTrap: 0, shooterTrap: 40, defPositioning: 11.5 })), 'VAR_NO_GOAL,VAR_NO_GOAL', `${attack}: fælde hos skytten`);
    // tidsangivelsen (≥14 iskold · ≥9 lige akkurat · ellers millimeter) følger den tjekkede; forsvareren 1 så alle godkendes
    const iskold = varGame({ spots: SPOTS.two, attack, shooterPulse: 8, offPulse: 14, defPositioning: 1 });
    assert.match(iskold.evs[0].text, /skød, og #\d+ [^ ]+ [^ ]+ foran ham stod ikke offside – han timede sit løb med iskold præcision\.$/, attack);
    const milli = varGame({ spots: SPOTS.two, attack, shooterPulse: 14, offPulse: 8, defPositioning: 1 });
    assert.match(milli.evs[0].text, /foran ham stod ikke offside – han slap heldigt igennem på en millimeterafgørelse\.$/, attack);
    // en selv-tjekket skytte: hans egne evner (slot 1 forrest)
    const own = varGame({ spots: SPOTS.front, attack, shooterPulse: 14, offPulse: 0, defPositioning: 1 });
    assert.match(own.evs[0].text, /GODKENDT! #\d+ [^ ]+ [^ ]+ timede sit løb med iskold præcision\.$/, attack);
  }
});

test('teksterne, mål godkendt: skytten er scorer; den tjekkede nævnes kun som "foran ham" og får observationen', () => {
  // Dræber: goal-observe (off → shooter, tekst), goalsPool.scorer → off, label → tag(off), why-plain → tag(off).
  for (const attack of ['H', 'A']) {
    const g = varGame({ spots: SPOTS.two, attack, offPulse: 14, shooterPulse: 8, defPositioning: 1 });
    const club = g.att.name, score = (n) => (attack === 'H' ? `${n}-0` : `0-${n}`);
    assert.equal(g.evs[0].text, `📺 [${club} • ${score(1)}] VAR-KENDELSE: MÅL GODKENDT! ${tag(g.shooter)} skød, og ${tag(g.off)} foran ham stod ikke offside – han timede sit løb med iskold præcision.`);
    assert.equal(g.evs[1].text, `📺 [${club} • ${score(2)}] VAR-KENDELSE: MÅL GODKENDT! ${tag(g.shooter)} skød, og ${tag(g.off)} foran ham stod ikke offside – han timede sit løb med iskold præcision.`);
    assert.equal(g.evs[0].label, `📺 VAR: mål godkendt – ${tag(g.shooter)}`);
    assert.equal(g.evs[0].varMsg, `${club}: mål godkendt`);
    assert.deepEqual(g.m.goalsPool.map((x) => x.scorer), [tag(g.shooter), tag(g.shooter)]);
    assert.deepEqual(g.m.observations, [0, 1].map((i) => ({ playerId: g.off.id, text: `VAR-tjek (${[3, 6][i]}. min mod ${g.def.name}): ${g.off.shortName} timede sit løb med iskold præcision.` })));
    const p = g.evs[0];
    const own = varGame({ spots: SPOTS.front, attack, offPulse: 10, shooterPulse: 14, defPositioning: 1 });
    assert.equal(own.evs[0].text, `📺 [${own.att.name} • ${score(1)}] VAR-KENDELSE: MÅL GODKENDT! ${tag(own.shooter)} timede sit løb med iskold præcision.`);
    assert.equal(own.evs[0].label, `📺 VAR: mål godkendt – ${tag(own.shooter)}`);
    assert.deepEqual(own.m.observations.map((o) => o.playerId), [own.shooter.id, own.shooter.id]);
    assert.equal(own.m.observations[0].text, `VAR-tjek (3. min mod ${own.def.name}): ${own.shooter.shortName} timede sit løb med iskold præcision.`);
    assert.ok(p);
  }
});

test('teksterne, mål annulleret: den tjekkede stod offside og får observationen; skytten selv, når han er forrest', () => {
  // Dræber: annul-observe (shooter / tekst), annul-label (tag(off) → tag(shooter)), annul-why-plain (tag(shooter) → tag(off)).
  for (const attack of ['H', 'A']) {
    const g = varGame({ spots: SPOTS.two, attack, offPulse: 0, shooterPulse: 20 });
    const club = g.att.name;
    assert.deepEqual(g.evs.map((e) => e.type), ['VAR_NO_GOAL', 'VAR_NO_GOAL']);
    assert.equal(g.evs[0].text, `📺 [${club}] VAR-KENDELSE: MÅLET ANNULLERES! ${tag(g.defender)} (${g.def.name}) holdt linjen, og ${tag(g.off)} stod offside og var med i situationen, da ${tag(g.shooter)} skød.`);
    assert.equal(g.evs[0].label, `📺 VAR: annulleret – ${tag(g.off)}`);
    assert.equal(g.evs[0].varMsg, `${club}: mål annulleret`);
    assert.deepEqual(g.m.observations, [3, 6].map((min) => ({ playerId: g.off.id, text: `VAR-annullering (${min}. min mod ${g.def.name}): ${g.off.shortName} var en anelse for tidligt af sted.` })));
    const own = varGame({ spots: SPOTS.front, attack, shooterPulse: 0, offPulse: 20 });
    assert.equal(own.evs[0].text, `📺 [${own.att.name}] VAR-KENDELSE: MÅLET ANNULLERES! ${tag(own.defender)} (${own.def.name}) holdt linjen, og ${tag(own.shooter)} var offside.`);
    assert.equal(own.evs[0].label, `📺 VAR: annulleret – ${tag(own.shooter)}`);
    assert.deepEqual(own.m.observations.map((o) => [o.playerId, o.text]), [3, 6].map((min) => [own.shooter.id, `VAR-annullering (${min}. min mod ${own.def.name}): ${own.shooter.shortName} var en anelse for tidligt af sted.`]));
  }
});

test('karakterer: godkendt giver skytten +1,3 og forsvareren −0,35 pr. mål; annulleret giver den TJEKKEDE −0,4 (ikke skytten) og forsvareren +0,45', () => {
  // Dræber: annul-adjust (off.id → shooter.id), goal-defender −0,35, annul-defender +0,45. Alle har start 6,5 (rul 0,5); clean sheet +0,5 til dit holds forsvar.
  // Dit hold angriber: skytten er back (clean sheet), den tjekkede en midtbanespiller.
  const ok = varGame({ spots: SPOTS.two, offPulse: 14, shooterPulse: 8, defPositioning: 1 });
  assert.deepEqual([ok.shooter, ok.off, ok.assister, ok.defender].map((p) => ok.rating(p).rating), [9.6, 6.5, 7.5, 5.8], 'back: 6,5+2·1,3+0,5 · tjekket: uændret · oplæg: +2·0,5 · forsvarer: 6,5−2·0,35');
  assert.deepEqual([ok.shooter, ok.off].map((p) => ok.rating(p).goals), [2, 0]);
  const no = varGame({ spots: SPOTS.two, offPulse: 0, shooterPulse: 20 });
  assert.deepEqual([no.shooter, no.off, no.assister, no.defender].map((p) => no.rating(p).rating), [7.0, 5.7, 6.5, 7.9], 'back: 6,5+0,5 uændret · tjekket: 6,5−2·0,4 · oplæg: uændret · forsvarer: 6,5+2·0,45+0,5');
  assert.deepEqual([no.shooter, no.off, no.defender].map((p) => no.rating(p).goals), [0, 0, 0]);
  assert.equal(no.rating(no.defender).tacticWins, 2);
  // selv-tjekket: skytten får −0,4 pr. annullering
  const own = varGame({ spots: SPOTS.front, shooterPulse: 0, offPulse: 20 });
  assert.equal(own.rating(own.shooter).rating, 6.5 + 0.5 - 0.8);
});

test('den forreste i en bot-kamp tjekkes også, og bolden i billedet af et mål imod spejles fra skudstedet', () => {
  // Dræber: isFront/frontOf på det forkerte hold (def), samt snapshot(…, SPOT.GOAL): før v3.14.1 stod bolden altid på målet (50,80 set fra dig).
  for (const [spot, ball] of [[0.1, [50, 68]], [0.9, [50, 80]]]) {
    const g = varGame({ spots: SPOTS.two, attack: 'A', rolls: { spot }, offPulse: 0, shooterPulse: 20 });
    assert.equal(g.evs[0].type, 'VAR_NO_GOAL');
    assert.match(g.evs[0].text, new RegExp(`og ${tag(g.off)} stod offside og var med i situationen, da ${tag(g.shooter)} skød\\.$`));
    const goal = varGame({ spots: SPOTS.two, attack: 'A', rolls: { spot }, offPulse: 14, shooterPulse: 8, defPositioning: 1 });
    assert.deepEqual([goal.evs[0].snapshot.attacking, goal.evs[0].snapshot.scorer, goal.evs[0].snapshot.ball], [false, null, ball], `mål imod, spot ${spot}`);
  }
});

test('teksten "spillede 1-2" (kombinationsmål) kan komme fra beskrivelsen – og "væggen" er væk', () => {
  const at = (x) => describeGoal('COMBINATION', 'S', 'A', 7, { next: () => x });
  assert.deepEqual([0.1, 0.5, 0.99].map(at), [
    'Kombinationsfodbold i 7. minut: A spillede S fri, og han sluttede sikkert af.',
    'Tre hurtige afleveringer i 7. minut, og S kunne score efter oplæg fra A.',
    'A og S spillede 1-2 i 7. minut, og S gjorde det færdigt.',
  ]);
});

// v3.14.2 (brugeren: "siger at M. Møller var foran og ikke offside, men M. Poulsen er længere fremme"): den tjekkede
// bliver, hvor han stod, og skytten tegnes aldrig foran ham. Her står den forreste (midtbanen) langt tilbage på y 22,
// så skuddet tæt på mål (y 20) ville tegne skytten foran ham – han står i stedet VAR_BEHIND bag (y 26).
test('billedet: står den tjekkede forreste trukket tilbage (y 22), tegnes skytten bag ham (y 26), ikke på skudstedet (y 20)', async () => {
  const { VAR_BEHIND } = await import('../../public/engine/match.js');
  const deep = { 1: { x: 50, y: 60 }, 8: { x: 50, y: 38 }, 9: { x: 50, y: 40 } };   // back y 40, midtbane y 22, angriber y 34
  const g = varGame({ spots: deep, rolls: { spot: 0.9 } });
  const s = g.evs[0].snapshot, y = Object.fromEntries(s.pts.map(([id, , py]) => [id, py]));
  assert.match(g.evs[0].text, new RegExp(`${tag(g.off)} foran ham`));
  assert.equal(y[g.off.id], 22, 'den tjekkede står, hvor han stod');
  assert.equal(y[g.shooter.id], 22 + VAR_BEHIND); assert.equal(VAR_BEHIND, 4);
  assert.deepEqual(s.ball, [50, 26]);
});
