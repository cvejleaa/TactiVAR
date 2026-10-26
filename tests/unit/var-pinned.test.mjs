// v3.15.1 Test Manager: VAR-kendelsernes KONSEKVENSER – karakterer, kamptal og tællere – bogstaveligt bundet med en scriptet
// rng. var-check.test.mjs læser referatets tekster og stillingen på seedede kampe; det kan ikke se, om den tjekkede
// faktisk får −0,4, om forsvareren får +0,45, om en annulleret straffe stadig bogføres, eller om en forbi-afslutning
// kaldes fra alle fem steder. Fremgangsmåde: kør den samme kamp med og uden hændelsen (n = 0 skud / ingen straffe) og
// sammenlign karaktererne spiller for spiller – alt andet er ens, så forskellen ER kendelsens effekt.
// Stub-nøglerne er sandsynlighederne selv. Pas på kollisioner: GOAL_FOUL_SHARE = PEN_CHECK_P = 0,27 og
// PEN_OFFSIDE_SHARE = CHANCE_P.NORMAL = 0,3 (chance(0,3) er skud-chancen) – derfor styres 0,3 i straffetestene pr. kaldnummer
// (straffens offside-lodtrækning er de første kald, fordi en straffe-tick ikke kalder chance(0,3)).
import { alignPositions } from './helpers/positions.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch, PENALTY_P, FREEKICK_P, FK_SHOT_P, CORNER_P, CROSS_CORNER_P, QUIET_FOUL_P, QUIET_CARD_P } from '../../public/engine/match.js';
import { VAR_RULES, MISS_P, MISS_BLOCK_SHARE, MISS_CORNER_P, CARD_RULES } from '../../public/engine/match-rules.js';

function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return {
    next: () => nextValue, int: (a) => a, pick: (arr) => arr[0],
    chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(n) : !!s; },
  };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
function arena() {
  const L = createLeague(createRng(1));
  const [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) {
      p.skills = SK(10); p.aerialPower = 10; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 };
      p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0; p.freshness = 100;
    }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0;
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id); alignPositions(t);
    Object.assign(t.tactics.phases.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL', offBallRuns: 'NORMAL' });
    Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: 'MID_BLOCK', offsideTrap: 'OFF', tacklingIntensity: 'NORMAL' });
    Object.assign(t.tactics.phases.phase3_transition, { onBallWon: 'KEEP_POSSESSION', onBallLost: 'DROP_BACK' });
  }
  return { H, A };
}
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const shots = (n) => (k) => k < n;
const tagOf = (p) => `#${p.shirtNumber} ${p.shortName}`;
const find = (a, name) => [...a.H.squad, ...a.A.squad].find((p) => tagOf(p) === name);
const R = (m, p) => [...m.ratings.home, ...m.ratings.away].find((e) => e.playerId === p.id);
// Karakterforskel pr. spiller (m1 − m0), kun de spillere, der er rykket sig
function deltas(a, m1, m0) {
  const out = {};
  for (const p of [...a.H.squad, ...a.A.squad]) {
    if (!R(m1, p) || !R(m0, p)) continue;   // bænken
    const d = Math.round((R(m1, p).rating - R(m0, p).rating) * 100) / 100;
    if (d !== 0) out[tagOf(p)] = d;
  }
  return out;
}
const evs = (m, type) => m.events.filter((e) => e.type === type);

// ---------- Det annullerede mål: karakterer ----------
// Angriberne har varPulse 10 og mod-kunne 22 (10 + 22·0,045 = 10,99 < forsvarerens 11 → offside), målmanden er svag, så
// skuddene ville blive mål; rul 0,1. Hvert skud tjekkes (0,131) som offside (0,27 falsk).
function goalCheckRun(script, { next = 0.1, tweak = () => {} } = {}) {
  const a = arena();
  for (let i = 1; i <= 10; i++) { slot(a.H, i).varProfile.varPulse = 10; slot(a.H, i).counterTactics.vsTrapLong = 22; slot(a.H, i).varProfile.cynicism = 10; }
  const d = slot(a.A, 1); d.skills.positioning = 11; d.skills.intercepting = 20;
  slot(a.A, 0).skills.goalkeeping = 1;
  tweak(a);
  return { a, d, m: simulateMatch(a.H, a.A, stubRng(script, next)) };
}
test('annulleret mål (offside): den tjekkede −0,4 og forsvareren +0,45 pr. mål, en taktisk sejr – ingen andre karakterer rykker sig, målmanden redder intet', () => {
  const base = goalCheckRun({ 0.3: shots(0) }), no = goalCheckRun({ 0.3: shots(2), [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: false });
  const checks = evs(no.m, 'VAR_CHECK');
  assert.equal(checks.length, 2, 'data: to tjek');
  assert.deepEqual(checks.map((e) => e.var.kind + '/' + e.var.verdict), ['OFFSIDE/OVERTURNED', 'OFFSIDE/OVERTURNED']);
  const off = find(no.a, checks[0].text.match(/stod (#\d+ .+?) offside/)[1]);
  assert.deepEqual(deltas(no.a, no.m, base.m), { [tagOf(off)]: -0.8, [tagOf(no.d)]: 0.9 });
  assert.equal(R(no.m, no.d).tacticWins, 2); assert.equal(R(base.m, no.d).tacticWins, 0);
  assert.deepEqual([no.m.homeGoals, no.m.stats.hShots, no.m.stats.hOnTarget, no.m.stats.hVarChecks, no.m.homeVarNet], [0, 2, 0, 2, -2]);
  assert.equal(evs(no.m, 'SAVE').length, 0, 'et annulleret mål er ingen redning');
  // Observationen går til den tjekkede (ikke til skytten eller forsvareren)
  assert.ok(no.m.observations.some((o) => o.playerId === off.id && /^VAR-annullering \(mod .+\): .+ var en anelse for tidligt af sted\.$/.test(o.text)));
  assert.ok(!no.m.observations.some((o) => o.playerId === no.d.id && /VAR/.test(o.text)));
});
test('annulleret mål (frispark i opspillet): skytten −0,3 pr. mål og angriberens frispark tælles – forsvareren får hverken karakter eller sejr', () => {
  const base = goalCheckRun({ 0.3: shots(0) }), no = goalCheckRun({ 0.3: shots(2), [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: true });
  const checks = evs(no.m, 'VAR_CHECK');
  assert.deepEqual(checks.map((e) => e.var.kind + '/' + e.var.verdict), ['FOUL/OVERTURNED', 'FOUL/OVERTURNED']);
  const shooter = find(no.a, checks[0].text.match(/skubbede (#\d+ .+?) #\d+ .+? i opspillet/)[1]);
  assert.deepEqual(deltas(no.a, no.m, base.m), { [tagOf(shooter)]: -0.6 });
  assert.equal(R(no.m, no.d).tacticWins, 0);
  assert.deepEqual([no.m.stats.hFouls - base.m.stats.hFouls, no.m.stats.aFouls - base.m.stats.aFouls, no.m.homeGoals, no.m.stats.hOnTarget, no.m.stats.hVarChecks, no.m.homeVarNet], [2, 0, 0, 0, 2, -2]);
  assert.equal(no.m.observations.filter((o) => /^VAR-/.test(o.text)).length, 0, 'et frispark giver ingen offside-observation');
});
test('godkendt mål: karaktererne er præcis dem fra et mål uden tjek (offside- og frisparkstjek) – VAR belønner og straffer intet', () => {
  for (const foul of [false, true]) {
    const plain = goalCheckRun({ 0.3: shots(2) }, { next: 0.9 }), ok = goalCheckRun({ 0.3: shots(2), [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: foul }, { next: 0.9, tweak: (a) => { for (let i = 1; i <= 10; i++) slot(a.H, i).counterTactics.vsTrapLong = 40; } });
    assert.deepEqual(evs(ok.m, 'VAR_CHECK').map((e) => e.var.verdict), ['STANDS', 'STANDS'], `foul ${foul}`);
    assert.deepEqual([ok.m.homeGoals, plain.m.homeGoals, ok.m.homeVarNet, ok.m.stats.hVarChecks], [2, 2, 0, 2]);
    assert.deepEqual(deltas(ok.a, ok.m, plain.m), {}, `foul ${foul}`);
  }
});
// Tærsklerne i frisparkstjekket: rul·30 > cynicism + 4 (cyn 10 → rul > 0,4667): 0,46 annulleres, 0,48 står
test('frisparkstjekket: skytten med cynisme 10 slipper ved rul 0,48 (14,4 > 14) og fældes ved 0,46 (13,8 < 14)', () => {
  const kind = (next, cyn) => evs(goalCheckRun({ 0.3: shots(1), [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: true }, { next, tweak: (a) => { for (let i = 1; i <= 10; i++) slot(a.H, i).varProfile.cynicism = cyn; } }).m, 'VAR_CHECK').map((e) => e.var.verdict);
  assert.deepEqual([kind(0.48, 10), kind(0.46, 10)], [['STANDS'], ['OVERTURNED']]);
  assert.deepEqual([kind(0.48, 20), kind(0.9, 20)], [['OVERTURNED'], ['STANDS']], 'cynismen er skyttens egen (ikke theatre): 14,4 < 24; 27 > 24');
});

// ---------- Forbi: alle fem kaldesteder ----------
function missRun(script, { tweak = () => {}, next = 0.5 } = {}) {
  const a = arena(); tweak(a);
  return { a, m: simulateMatch(a.H, a.A, stubRng(script, next)) };
}
test('forbi i åbent spil: MISS_P → "Forbi" (hold uden for feltet), ingen redning, ingen skud på mål; blokeret → blokøren +0,1 og hjørne kun med MISS_CORNER_P', () => {
  const weakShooter = (a) => { for (const p of a.H.squad) p.skills.finishing = 1; slot(a.A, 0).skills.goalkeeping = 20; };
  const save = missRun({ 0.3: shots(2) }, { tweak: weakShooter }).m;
  assert.deepEqual([evs(save, 'SAVE').length, save.stats.hOnTarget, evs(save, 'MISS').length], [2, 2, 0], 'uden MISS_P er det redninger');
  const out = missRun({ 0.3: shots(2), [MISS_P]: true, [MISS_BLOCK_SHARE]: false, [MISS_CORNER_P]: true }, { tweak: weakShooter }).m;
  assert.deepEqual([evs(out, 'SAVE').length, out.stats.hOnTarget, out.stats.hShots, evs(out, 'MISS').map((e) => e.label), out.stats.hCorners], [0, 0, 2, ['Forbi', 'Forbi'], 0]);
  assert.ok(evs(out, 'MISS').every((e) => e.isHome === true && /^🎯 \[.+\] #\d+ .+ (skyder|sender|rammer|får|banker)/.test(e.text)));
  // blokeret: forsvarer +0,1 pr. skud, begivenheden står på forsvarets side; hjørnet kun når MISS_CORNER_P er sand
  const blk = (corner) => missRun({ 0.3: shots(2), [MISS_P]: true, [MISS_BLOCK_SHARE]: true, [MISS_CORNER_P]: corner, [CORNER_P]: false }, { tweak: (a) => { weakShooter(a); for (const p of a.H.squad) p.aerialPower = 1; } });
  const b0 = blk(false), b1 = blk(true);
  assert.deepEqual([evs(b0.m, 'MISS').map((e) => [e.label, e.isHome]), b0.m.stats.hCorners, b0.m.stats.hOnTarget], [[['Blokeret', false], ['Blokeret', false]], 0, 0]);
  assert.equal(b1.m.stats.hCorners, 2, 'MISS_CORNER_P sand → hjørne efter hver blokering');
  assert.match(evs(b0.m, 'MISS')[0].text, /^🧱 \[.+\] #\d+ .+ kaster sig ind foran afslutningen fra #\d+ .+ \(.+\)\.$/);
  const none = missRun({ 0.3: shots(0) }, { tweak: weakShooter });
  const blocker = b0.a.A.squad.find((p) => evs(b0.m, 'MISS')[0].text.includes(`] ${tagOf(p)} kaster sig`));
  assert.deepEqual(deltas(b0.a, b0.m, none.m), { [tagOf(blocker)]: 0.2 });
});
test('forbi på frispark, hovedstød og kontra: hvert sted kalder missed – og kun åbent spil/kontra giver hjørne efter en blokering', () => {
  const noKeeper = (a) => { slot(a.A, 0).skills.goalkeeping = 20; for (const p of a.H.squad) p.skills.finishing = 1; };
  // Frispark i skudafstand (FK_SHOT_P sand): tageren (bedste FIN+PAS) taber til keeperen
  const fk = (script) => missRun({ [FREEKICK_P]: (n) => n < 2, [FK_SHOT_P]: true, [MISS_CORNER_P]: true, ...script }, { tweak: noKeeper }).m;
  const fkSave = fk({}), fkMiss = fk({ [MISS_P]: true, [MISS_BLOCK_SHARE]: false }), fkBlock = fk({ [MISS_P]: true, [MISS_BLOCK_SHARE]: true });
  assert.deepEqual([evs(fkSave, 'SAVE').length, fkSave.stats.hOnTarget], [2, 2]);
  assert.deepEqual([evs(fkMiss, 'SAVE').length, fkMiss.stats.hOnTarget, evs(fkMiss, 'MISS').length, fkMiss.stats.hShots], [0, 0, 2, 2]);
  assert.match(evs(fkBlock, 'MISS')[0].text, /kaster sig ind foran frisparket fra/);
  assert.deepEqual([fkBlock.stats.hCorners, fkMiss.stats.hCorners], [0, 0], 'frisparket giver aldrig hjørne via forbi (withCorner = false)');
  // Hovedstød (indlæg i åbent spil): luftduellen vundet, keeperen vinder over hovedstødet
  const hd = (script) => missRun({ 0.3: shots(2), 0.52: true, [MISS_CORNER_P]: true, ...script }, { tweak: (a) => { a.H.tactics.phases.phase1_buildUp.attackFocus = 'HIGH_CROSSES'; for (const p of a.H.squad) p.aerialPower = 12; slot(a.A, 0).skills.goalkeeping = 20; } }).m;
  const hdSave = hd({}), hdMiss = hd({ [MISS_P]: true, [MISS_BLOCK_SHARE]: false }), hdBlock = hd({ [MISS_P]: true, [MISS_BLOCK_SHARE]: true });
  assert.deepEqual([evs(hdSave, 'SAVE').length, hdSave.stats.hOnTarget], [2, 2], 'data: uden MISS_P reddes hovedstødene');
  assert.deepEqual([evs(hdMiss, 'SAVE').length, hdMiss.stats.hOnTarget, evs(hdMiss, 'MISS').length], [0, 0, 2]);
  assert.match(evs(hdBlock, 'MISS')[0].text, /kaster sig ind foran hovedstødet fra/);
  assert.equal(hdBlock.stats.hCorners, 0, 'ingen hjørne fra missed() efter et hovedstød – kun via CROSS_CORNER_P');
  // Efter et forbi-hovedstød gælder CROSS_CORNER_P (0,35), ikke CORNER_P (0,9, kun efter en redning)
  const hdCorner = (cross, corner) => hd({ [MISS_P]: true, [MISS_BLOCK_SHARE]: false, [CROSS_CORNER_P]: cross, [CORNER_P]: corner });
  assert.deepEqual([hdCorner(false, true).stats.hCorners, hdCorner(true, false).stats.hCorners > 0], [0, true]);
});
// Kontra (counterAttack): vinderen er udeholdet (hjemmeholdet taber presset i hvert tick, kontra-kastet 0,032 er styret)
test('forbi på kontra: tællerne følger afslutningen – Forbi (ingen redning, ingen på mål), blokeret med hjørne kun hvis withCorner', () => {
  const ctr = (script) => {
    const a = arena(); for (const p of a.A.squad) { p.skills.intercepting = 20; p.skills.finishing = 1; } slot(a.H, 0).skills.goalkeeping = 20;
    return simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.032: shots(2), ...script }));
  };
  const save = ctr({}), miss = ctr({ [MISS_P]: true, [MISS_BLOCK_SHARE]: false }), blk = ctr({ [MISS_P]: true, [MISS_BLOCK_SHARE]: true, [MISS_CORNER_P]: true }), blk0 = ctr({ [MISS_P]: true, [MISS_BLOCK_SHARE]: true });
  assert.deepEqual([evs(save, 'SAVE').length, save.stats.aOnTarget, save.stats.aShots], [2, 2, 2], 'data: uden MISS_P reddes kontraerne');
  assert.deepEqual([evs(miss, 'SAVE').length, miss.stats.aOnTarget, evs(miss, 'MISS').map((e) => [e.label, e.isHome])], [0, 0, [['Forbi', false], ['Forbi', false]]]);
  assert.match(evs(blk, 'MISS')[0].text, /kaster sig ind foran kontraens afslutning fra #\d+ .+ \(.+\)\.$/);
  assert.deepEqual([blk.stats.aCorners, blk0.stats.aCorners], [2, 0], 'kontra: blokeret + MISS_CORNER_P → hjørne til kontraholdet');
});
// Et kontramål kan tjekkes og annulleres – stillingen følger, intet tælles
test('VAR på kontramål: annulleret → intet mål, ingen redning, ingen Rundens mål; godkendt → målet står', () => {
  const ctr = (verdictNext, trap = 22) => {
    const a = arena(); for (const p of a.A.squad) p.skills.intercepting = 20; slot(a.H, 0).skills.goalkeeping = 1;
    for (let i = 1; i <= 10; i++) { slot(a.A, i).varProfile.varPulse = 10; slot(a.A, i).counterTactics.vsTrapLong = trap; }
    slot(a.H, 1).skills.positioning = 11; slot(a.H, 2).skills.positioning = 11;
    return simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.032: shots(2), [VAR_RULES.GOAL_CHECK_P]: true }, verdictNext));
  };
  const no = ctr(0.1);
  assert.deepEqual(evs(no, 'VAR_CHECK').map((e) => e.var.verdict), ['OVERTURNED', 'OVERTURNED']);
  assert.deepEqual([no.awayGoals, no.goalsPool.length, evs(no, 'SAVE').length, no.stats.aOnTarget, no.homeVarNet], [0, 0, 0, 0, 2]);
  const ok = ctr(0.1, 23);   // 10 + 23·0,045 = 11,035 > 11
  assert.deepEqual(evs(ok, 'VAR_CHECK').map((e) => e.var.verdict), ['STANDS', 'STANDS']);
  assert.deepEqual([ok.awayGoals, ok.goalsPool.length, ok.homeVarNet], [2, 2, 0]);
  assert.ok(evs(ok, 'GOAL').every((e) => e.text.includes('MÅÅÅL PÅ KONTRA!') && / 📺 VAR: målet står – .+\.$/.test(e.text)));
});

// ---------- Straffe-VAR (v3.15.1 efter QC/Spilfører: straffen dømmes FØRST, så tjekker VAR) ----------
// En straffe i 3. minut (første tick; PENALTY_P sand ved kald 0): VAR tjekker den (PEN_CHECK_P). Filmning: rul·40 > theatre (10 →
// rul > 0,25). Offside i opspillet (PEN_OFFSIDE_SHARE): samme duel som ved mål. Alle VAR_RULES-værdier er nu unikke, så 0,3
// (skud-chancen) rører ikke straffens lodtrækninger. Hændelser: VAR_PEN (tjekket, plot falsk), så VAR_NO_PEN (annulleret, plot sand).
function penRun(script, { next = 0.1, trap = 22, tweak = () => {} } = {}) {
  const a = arena();
  for (let i = 1; i <= 10; i++) { slot(a.H, i).varProfile.varPulse = 10; slot(a.H, i).counterTactics.vsTrapLong = trap; }
  slot(a.A, 1).skills.positioning = 11;
  tweak(a);
  return { a, m: simulateMatch(a.H, a.A, stubRng({ [PENALTY_P]: (n) => n === 0, [VAR_RULES.PEN_CHECK_P]: true, [VAR_RULES.PEN_OFFSIDE_SHARE]: false, ...script }, next)) };
}
const OFFSIDE = { [VAR_RULES.PEN_OFFSIDE_SHARE]: true };
const base0 = (tweak) => penRun({ [PENALTY_P]: false }, { tweak });
const afterEv = (m, e) => m.events[m.events.indexOf(e) + 1];
// Fælden i penalty-VAR: uden positioner var den tjekkede altid den fældede. Plads 5 og 6 (midtbane) står forrest, plads 9 (den fældede
// angriber) langt bagved, og plads 6 er den bedste skytte (tager straffen) – så "tjekket", "fældet" og "skytte" er tre forskellige.
const spread = (a) => {
  a.H.tactics.customCoords = { ...Object.fromEntries([1, 2, 3, 4, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }])), 5: { x: 50, y: 30 }, 6: { x: 50, y: 31 }, 9: { x: 50, y: 70 } };
  slot(a.H, 6).skills.finishing = 20;
};
const lone = (a) => { a.H.tactics.customCoords = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }])); a.H.tactics.customCoords[9] = { x: 50, y: 20 }; };
test('straffe annulleret for filmning: dommeren peger først, VAR tjekker, så annulleres; ingen straffe, skud eller xG; den fældede −0,3 og gult for filmning; angriberens frispark tælles; VAR ± −1', () => {
  const dive = penRun({}), none = base0();
  const e = evs(dive.m, 'VAR_PEN')[0], no = evs(dive.m, 'VAR_NO_PEN')[0];
  assert.deepEqual([e.var.kind, e.var.verdict, e.isHome, e.min, e.plot], ['DIVE', 'OVERTURNED', true, 3, false]);
  assert.match(e.text, /^📺 \[.+\] Dommeren peger på pletten – #\d+ .+ går ned i feltet efter kontakt med #\d+ .+ \(.+\)\. Men VAR tjekker om der var kontakt nok …$/);
  assert.equal(afterEv(dive.m, e), no, 'kendelsen følger lige efter tjekket');
  assert.deepEqual([no.isHome, no.plot], [true, true]);
  assert.match(no.text, /^📺 \[.+\] VAR-KENDELSE: Dommeren går ud til skærmen … ingen kontakt\. Straffesparket annulleres\.$/);
  const card = evs(dive.m, 'FOUL').find((x) => / for filmning\.$/.test(x.text));
  assert.ok(card, 'gult kort for filmning'); assert.equal(card.isHome, true);
  const diver = find(dive.a, card.text.match(/Gult kort til (#\d+ .+?) for filmning/)[1]);
  assert.ok(dive.a.H.squad.includes(diver), 'den fældede (angriberen) får kortet, ikke forsvareren');
  assert.equal(e.text, `📺 [${dive.a.H.name}] Dommeren peger på pletten – ${tagOf(diver)} går ned i feltet efter kontakt med ${tagOf(slot(dive.a.A, 1))} (${dive.a.A.name}). Men VAR tjekker om der var kontakt nok …`, 'den, der peges på, er den, der får kortet');
  assert.deepEqual(deltas(dive.a, dive.m, none.m), { [tagOf(diver)]: -0.3 });
  const f = (m, key) => m.stats[key];
  assert.deepEqual(['hPenalties', 'hShots', 'hOnTarget', 'aFouls'].map((k) => f(dive.m, k) - f(none.m, k)), [0, 0, 0, 0]);
  assert.equal(dive.m.stats.hXg, none.m.stats.hXg);
  assert.deepEqual([dive.m.stats.hFouls - none.m.stats.hFouls, dive.m.stats.hYellows - none.m.stats.hYellows, dive.m.stats.hVarChecks, dive.m.homeVarNet, dive.m.homeGoals], [1, 1, 1, -1, 0]);
});
test('straffe annulleret for offside: den FORRESTE tjekkes (ikke den fældede, ikke skytten) og får −0,2; "før #fældet blev fældet"; ingen frispark/gult/straffe; VAR ± −1', () => {
  const off = penRun(OFFSIDE, { tweak: spread }), none = base0(spread);
  const e = evs(off.m, 'VAR_PEN')[0], no = evs(off.m, 'VAR_NO_PEN')[0];
  const [front, fouled] = [slot(off.a.H, 5), slot(off.a.H, 9)];
  assert.deepEqual([e.var.kind, e.var.verdict, e.plot], ['OFFSIDE', 'OVERTURNED', false]);
  assert.match(e.text, /Men VAR tjekker for offside i opspillet …$/);
  assert.ok(e.text.includes(`${tagOf(fouled)} går ned i feltet`), 'den fældede er plads 9');
  assert.equal(no.text, `📺 [${off.a.H.name}] VAR-KENDELSE: STRAFFESPARKET ANNULLERES! ${tagOf(front)} stod offside i opspillet, før ${tagOf(fouled)} blev fældet.`);
  assert.deepEqual([no.isHome, no.plot], [true, true]);
  assert.deepEqual(deltas(off.a, off.m, none.m), { [tagOf(front)]: -0.2 });
  assert.deepEqual(['hPenalties', 'hShots', 'hFouls', 'aFouls', 'hYellows'].map((k) => off.m.stats[k] - none.m.stats[k]), [0, 0, 0, 0, 0]);
  assert.deepEqual([off.m.stats.hVarChecks, off.m.homeVarNet, evs(off.m, 'FOUL').length], [1, -1, 0]);
  assert.equal(off.m.observations.length, none.m.observations.length, 'ingen observation af en straffe-kendelse');
  // positionerne er angrebsformens (midtbanen rykker længere frem end angriberne): plads 9 (y 60) ville stå FORAN plads 5/6 (y 64/65)
  // i en neutral opstilling, men i angreb står de to midtbanespillere forrest – og plads 9 er ikke blandt de to forreste
  const att = penRun(OFFSIDE, { tweak: (a) => { spread(a); Object.assign(a.H.tactics.customCoords, { 5: { x: 50, y: 64 }, 6: { x: 50, y: 65 }, 9: { x: 50, y: 60 } }); } });
  assert.equal(evs(att.m, 'VAR_NO_PEN')[0].text, `📺 [${att.a.H.name}] VAR-KENDELSE: STRAFFESPARKET ANNULLERES! ${tagOf(front)} stod offside i opspillet, før ${tagOf(fouled)} blev fældet.`);
  // er den fældede selv forrest, tjekkes han: "stod offside, før han blev fældet"
  const self = penRun(OFFSIDE, { tweak: lone }), n0 = base0(lone), f9 = slot(self.a.H, 9);
  assert.equal(evs(self.m, 'VAR_NO_PEN')[0].text, `📺 [${self.a.H.name}] VAR-KENDELSE: STRAFFESPARKET ANNULLERES! ${tagOf(f9)} stod offside, før han blev fældet.`);
  assert.deepEqual(deltas(self.a, self.m, n0.m), { [tagOf(f9)]: -0.2 });
});
test('straffe der står (filmning/offside): straffen sparkes med " 📺 VAR: straffesparket står." – forsvarerens frispark og straffe tælles, VAR ± 0; tærsklerne rul 0,26 (10,4 > 10) står, 0,24 (9,6) annulleres', () => {
  for (const [name, r] of [['filmning', penRun({}, { next: 0.26 })], ['offside', penRun(OFFSIDE, { trap: 23 })]]) {
    const e = evs(r.m, 'VAR_PEN')[0], k = afterEv(r.m, e);
    assert.deepEqual([e.var.verdict, e.plot, evs(r.m, 'VAR_NO_PEN').length], ['STANDS', false, 0], name);
    assert.deepEqual([r.m.stats.hPenalties, r.m.stats.hShots, r.m.stats.aFouls, r.m.homeVarNet, r.m.stats.hVarChecks], [1, 1, 1, 0, 1], name);
    assert.ok(/STRAFFESPARK/.test(k.text) && k.text.endsWith(' 📺 VAR: straffesparket står.'), `${name}: ${k.text}`);
    assert.ok(!k.text.includes('dømt efter VAR'), name);
  }
  assert.equal(evs(penRun({}, { next: 0.24 }).m, 'VAR_NO_PEN').length, 1);
  // også når straffen reddes (målmanden langt bedre): tillægget står på redningen, og den VAR-givne har sit eget
  const saved = penRun({}, { next: 0.26, tweak: (a) => { slot(a.A, 0).skills.goalkeeping = 40; } }), e2 = evs(saved.m, 'VAR_PEN')[0], k2 = afterEv(saved.m, e2);
  assert.ok(k2.type === 'SAVE' && /STRAFFESPARK REDDET/.test(k2.text) && k2.text.endsWith(' 📺 VAR: straffesparket står.'), k2.text);
  const awardSave = penRun({ [PENALTY_P]: false, [VAR_RULES.PEN_CHECK_P]: false, [VAR_RULES.PEN_AWARD_P]: (n) => n === 0 }, { tweak: (a) => { slot(a.A, 0).skills.goalkeeping = 40; } }), k3 = afterEv(awardSave.m, evs(awardSave.m, 'VAR_PEN')[0]);
  assert.ok(k3.type === 'SAVE' && k3.text.endsWith(' (dømt efter VAR)'), k3.text);
  // straffe-tjekket kører kun ved PEN_CHECK_P – uden tjek står straffen uden VAR-tillæg
  const unchecked = penRun({ [VAR_RULES.PEN_CHECK_P]: false });
  assert.equal(evs(unchecked.m, 'VAR_PEN').length, 0);
  assert.ok(/STRAFFESPARK/.test(evs(unchecked.m, 'GOAL')[0].text) && !/📺/.test(evs(unchecked.m, 'GOAL')[0].text));
});
test('straffens tekst: "han tager det selv" når den fældede også er skytten (mål og redning), ellers skyttens navn', () => {
  const take = (tweak, gk = 10) => { const r = penRun({ [VAR_RULES.PEN_CHECK_P]: false }, { tweak: (a) => { tweak(a); slot(a.A, 0).skills.goalkeeping = gk; } }); return { ...r, e: evs(r.m, 'GOAL')[0] ?? evs(r.m, 'SAVE')[0] }; };
  const selfGoal = take((a) => { slot(a.H, 9).skills.finishing = 20; }), selfSave = take((a) => { slot(a.H, 9).skills.finishing = 20; }, 40), other = take(() => {}), otherSave = take(() => {}, 40);
  assert.equal(selfGoal.e.type, 'GOAL'); assert.equal(selfSave.e.type, 'SAVE'); assert.equal(otherSave.e.type, 'SAVE');
  assert.match(selfGoal.e.text, /, og han tager det selv og sender bolden sikkert i nettet\.$/);
  assert.match(selfSave.e.text, /, men #\d+ .+ redder fra ham\.$/);
  assert.match(other.e.text, /, og #\d+ .+ sender bolden sikkert i nettet\.$/); assert.ok(!other.e.text.includes('selv'));
  assert.match(otherSave.e.text, /, men #\d+ .+ redder fra #\d+ .+\.$/); assert.ok(!otherSave.e.text.includes('fra ham'));
});
test('VAR giver en straffe (PEN_AWARD_P): straffen sparkes "(dømt efter VAR)", VAR ± +1, tjek tælles – fældet af modstanderen; ikke efter tabt bold', () => {
  const pa = (extra = {}, tweak = () => {}) => penRun({ [PENALTY_P]: false, [VAR_RULES.PEN_CHECK_P]: false, [VAR_RULES.PEN_AWARD_P]: (n) => n === 0, ...extra }, { tweak });
  const r = pa();
  const e = evs(r.m, 'VAR_PEN')[0], k = afterEv(r.m, e);
  assert.deepEqual([e.var.kind, e.var.verdict, e.isHome, e.plot], ['PENALTY', 'AWARDED', true, true]);
  const who = e.text.match(/^📺 \[.+\] Spillet fortsatte, men VAR kalder dommeren ud til skærmen: (#\d+ .+?) blev fældet i feltet af (#\d+ .+?) \((.+?)\)\. Efter at have set skærmen dømmer han straffespark!$/);
  assert.ok(who && r.a.H.squad.includes(find(r.a, who[1])) && r.a.A.squad.includes(find(r.a, who[2])) && who[3] === r.a.A.name, e.text);
  assert.deepEqual([r.m.stats.hPenalties, r.m.stats.hShots, r.m.stats.aFouls, r.m.homeVarNet, r.m.stats.hVarChecks, r.m.stats.aVarChecks], [1, 1, 1, 1, 1, 0]);
  assert.ok(/STRAFFESPARK/.test(k.text) && k.text.endsWith(' (dømt efter VAR)') && !k.text.includes('står'), k.text);
  // udeholdet har bolden: VAR giver DEM straffen, og VAR ± falder
  const away = pa({}, (a) => { for (const p of a.A.squad) { p.skills.passing = 11; } });
  assert.deepEqual([evs(away.m, 'VAR_PEN')[0].isHome, away.m.stats.aPenalties, away.m.homeVarNet], [false, 1, -1]);
  // tabt bold (hjemmeholdets opbygning stoppes i alle ticks): ingen VAR-straffe – og med bolden beholdt, er der
  const lost = pa({ 0.48: true, [VAR_RULES.PEN_AWARD_P]: true }, (a) => { for (const p of a.A.squad) p.skills.intercepting = 20; });
  const kept = pa({ 0.48: true, [VAR_RULES.PEN_AWARD_P]: true }, (a) => { for (const p of a.A.squad) { p.skills.intercepting = 1; p.skills.positioning = 1; p.skills.stamina = 1; } });
  assert.deepEqual([lost.m.stats.hPenalties + lost.m.stats.aPenalties, kept.m.stats.hPenalties > 5], [0, true], 'data: uden tabt bold gives der straffe i de fleste ticks');
});
// En spiller, der filmer to gange, får andet gule – også selv om "han holder igen" ville have skånet ham (force) – og et kort,
// der blev givet i straffen, må ikke lække ind i næste tick (sentOffThisTick nulstilles ved hvert tick).
test('filmning to gange giver andet gult og rødt (force); den udviste lækker ikke ind i næste tick – dets chance tæller stadig', () => {
  // De to straffe-ticks kalder ikke chance(0,3); skud-chancen er sand i de 28 øvrige ticks
  const m = penRun({ [PENALTY_P]: (n) => n < 2, 0.3: true }).m;
  const reds = evs(m, 'RED');
  assert.deepEqual([evs(m, 'VAR_PEN').map((e) => e.min), evs(m, 'VAR_NO_PEN').map((e) => e.min), evs(m, 'FOUL').map((e) => e.min), reds.map((e) => [e.min, e.isHome])], [[3, 6], [3, 6], [3], [[6, true]]]);
  assert.match(reds[0].text, /^🟨🟥 \[.+\] Andet gule kort til #\d+ .+ – han er udvist!/);
  assert.deepEqual([m.stats.hYellows, m.stats.hReds, m.stats.hPenalties], [2, 1, 0]);
  assert.equal(m.stats.hShots + m.stats.aShots, 28, 'tick 3 (9. minut) springes ikke over, fordi kortet blev givet i tick 2');
});

// ---------- Rødt kort-VAR (kortet vises først, så tjekker VAR; en spiller med gult tjekkes slet ikke) ----------
// Første frispark (3. minut) er en skade-tackling; 0,5 falsk → hjemmeholdet begår den (udeholdet er offer); fouleren er
// hjemmeholdets første forsvarer. 0,5 sand → udeholdet begår den. Direkte rødt (CARD_RULES.DIRECT_RED_P) scriptet sandt/falsk.
function redRun(script, { next = 0.5, awayFouls = false, tweak = () => {}, last = false } = {}) {
  const a = arena(); tweak(a);
  const withPick = (r) => (last ? { ...r, pick: (arr) => arr.at(-1) } : r);
  return { a, m: simulateMatch(a.H, a.A, withPick(stubRng({ 0.06: (n) => n === 0, 0.4: true, [CARD_RULES.DIRECT_RED_P]: true, [VAR_RULES.RED_CHECK_P]: true, 0.5: awayFouls, ...script }, next))) };
}
test('rødt kort-VAR: dommeren viser kortet, VAR tjekker; bekræftet → udvisning, VAR ± 0; trukket tilbage (VAR_NO_RED) → gult og VAR ± +1 for fouleren (−1 hvis udeholdet); tærskel rul·30 > cynisme + 10 (0,66 står, 0,68 trækkes tilbage)', () => {
  const conf = redRun({}, { next: 0.66 }), down = redRun({}, { next: 0.68 }), downAway = redRun({}, { next: 0.68, awayFouls: true });
  const c = evs(conf.m, 'VAR_RED')[0];
  assert.deepEqual(evs(conf.m, 'VAR_RED').map((e) => [e.var.kind, e.var.verdict, e.isHome, e.plot]), [['RED', 'CONFIRMED', true, false]]);
  assert.equal(c.text, `📺 [${conf.a.H.name}] Dommeren viser ${tagOf(slot(conf.a.H, 1))} det røde kort for tacklingen – men VAR tjekker situationen …`);
  assert.equal(afterEv(conf.m, c).type, 'RED', 'kortet står: udvisningen følger lige efter tjekket');
  // tekstens spiller er den, der faktisk udvises (ikke blot pladsen efter målmanden): med pick = sidste element er det en anden
  const lastC = redRun({}, { next: 0.66, last: true }), lc = evs(lastC.m, 'VAR_RED')[0], rd = afterEv(lastC.m, lc);
  const named = lc.text.match(/viser (#\d+ .+?) det røde kort/)[1];
  assert.ok(rd.type === 'RED' && rd.text.includes(`kort til ${named} `) && named !== tagOf(slot(lastC.a.H, 1)), `${lc.text} | ${rd.text}`);
  const lastD = redRun({}, { next: 0.68, last: true }), nr = evs(lastD.m, 'VAR_NO_RED')[0];
  assert.ok(nr.text.includes(`… ${evs(lastD.m, 'VAR_RED')[0].text.match(/viser (#\d+ .+?) det røde kort/)[1]} ramte bolden først`), nr.text);
  assert.deepEqual([conf.m.stats.hReds, conf.m.stats.hYellows, conf.m.stats.hVarChecks, conf.m.homeVarNet, evs(conf.m, 'RED').length, evs(conf.m, 'VAR_NO_RED').length], [1, 0, 1, 0, 1, 0]);
  const d = evs(down.m, 'VAR_RED')[0], dn = evs(down.m, 'VAR_NO_RED')[0];
  assert.deepEqual([d.var.verdict, d.isHome, d.plot], ['DOWNGRADED', true, false]);
  assert.deepEqual([dn.isHome, dn.plot, afterEv(down.m, d) === dn], [true, true, true]);
  assert.equal(dn.text, `📺 [${down.a.H.name}] VAR-KENDELSE: Dommeren går ud til skærmen … ${tagOf(slot(down.a.H, 1))} ramte bolden først. Det røde kort trækkes tilbage – det bliver gult.`);
  assert.deepEqual([down.m.stats.hReds, down.m.stats.hYellows, down.m.stats.hVarChecks, down.m.homeVarNet, evs(down.m, 'RED').length], [0, 1, 1, 1, 0]);
  const y = evs(down.m, 'FOUL')[0];
  assert.ok(y && y.isHome && / efter VAR-tjekket\.$/.test(y.text) && afterEv(down.m, dn) === y, 'gult kort efter VAR-tjekket til den, der begik frisparket');
  assert.deepEqual(evs(downAway.m, 'VAR_NO_RED').map((e) => e.isHome), [false]);
  assert.deepEqual([downAway.m.stats.aYellows, downAway.m.stats.aVarChecks, downAway.m.stats.hVarChecks, downAway.m.homeVarNet], [1, 1, 0, -1]);
  // cynismen er fouleren selv: 0,68·30 = 20,4 mod 20 (cynisme 10) trækkes tilbage; med cynisme 11 (21) står kortet
  const cyn = (v) => redRun({}, { next: 0.68, tweak: (a) => { slot(a.H, 1).varProfile.cynicism = v; } }).m.events.find((e) => e.type === 'VAR_RED').var.verdict;
  assert.deepEqual([cyn(10), cyn(11)], ['DOWNGRADED', 'CONFIRMED']);
});
test('en spiller, der allerede HAR gult, får sit røde kort uden VAR-tjek (et nedgraderet kort ville alligevel give udvisning): ingen VAR_RED, RED = direkte rødt, ingen tælling', () => {
  // Tick 0: det stille frispark (0,58) giver gult til udeholdets første forsvarer; tick 1: han begår skade-tacklingen (0,5 sand) og får direkte rødt
  const r = redRun({ 0.06: (n) => n === 1, [QUIET_FOUL_P]: (n) => n === 0, [QUIET_CARD_P]: (n) => n === 0 }, { next: 0.68, awayFouls: true });
  assert.deepEqual(evs(r.m, 'FOUL').map((e) => [e.min, e.isHome]), [[3, false]], 'data: gult i 3. minut');
  const red = evs(r.m, 'RED');
  assert.deepEqual(red.map((e) => [e.min, e.isHome]), [[6, false]]);
  assert.match(red[0].text, /^🟥 \[.+\] Direkte rødt kort til/);
  assert.equal(evs(r.m, 'VAR_RED').length + evs(r.m, 'VAR_NO_RED').length, 0);
  assert.deepEqual([r.m.stats.aYellows, r.m.stats.aReds, r.m.stats.aVarChecks, r.m.homeVarNet], [1, 1, 0, 0]);
  assert.equal(R(r.m, slot(r.a.A, 1)).red, 'DIRECT');
  // samme tackling uden forudgående gult: VAR tjekker (data: ellers er testen tom)
  assert.equal(evs(redRun({ 0.06: (n) => n === 1 }, { next: 0.68, awayFouls: true }).m, 'VAR_RED').length, 1);
});
test('grov tackling uden kort kan opgraderes til rødt: rul·22 < cynisme (0,45·22 = 9,9 < 10 opgraderes, 0,46 → 10,1 ikke); VAR ± −1, kun uden direkte rødt', () => {
  const up = (v, extra = {}, o = {}) => redRun({ [CARD_RULES.DIRECT_RED_P]: false, [VAR_RULES.RED_UPGRADE_P]: true, ...extra }, { next: v, ...o });
  const a = up(0.45);
  assert.deepEqual(evs(a.m, 'VAR_RED').map((e) => [e.var.verdict, e.isHome, e.plot]), [['UPGRADED', true, true]]);
  assert.deepEqual([a.m.stats.hReds, a.m.stats.hVarChecks, a.m.homeVarNet, evs(a.m, 'RED').length], [1, 1, -1, 1]);
  assert.match(evs(a.m, 'RED')[0].text, /^🟥 \[.+\] Direkte rødt kort/);
  assert.equal(evs(up(0.46).m, 'VAR_RED').length, 0);
  assert.equal(evs(up(0.45, { [VAR_RULES.RED_UPGRADE_P]: false }).m, 'VAR_RED').length, 0, 'kun ved RED_UPGRADE_P');
  const away = up(0.45, {}, { awayFouls: true });
  assert.deepEqual([away.m.stats.aReds, away.m.stats.aVarChecks, away.m.homeVarNet, evs(away.m, 'VAR_RED')[0].isHome], [1, 1, 1, false]);
  // cynismen er fouleren selv (ikke theatre)
  assert.equal(evs(up(0.45, {}, { tweak: (x) => { slot(x.H, 1).varProfile.cynicism = 9; } }).m, 'VAR_RED').length, 0);
  assert.equal(evs(up(0.45, {}, { tweak: (x) => { slot(x.H, 1).varProfile.theatre = 0; slot(x.H, 1).varProfile.cynicism = 10; } }).m, 'VAR_RED').length, 1);
  // et direkte rødt, VAR ikke tjekker (RED_CHECK_P falsk), står uden tjek
  const nochk = redRun({ [VAR_RULES.RED_CHECK_P]: false }, { next: 0.68 });
  assert.deepEqual([evs(nochk.m, 'VAR_RED').length, nochk.m.stats.hReds, nochk.m.stats.hVarChecks, nochk.m.homeVarNet], [0, 1, 0, 0]);
});

// ---------- Cutback: bolden spillet tilbage – modtageren kan ikke være offside, kun frisparket tjekkes ----------
test('cutback-mål tjekkes kun for frispark i opspillet (aldrig offside), selv når offside-delen ville blive valgt', () => {
  const run = (focus) => {
    const a = arena(); a.H.tactics.phases.phase1_buildUp.attackFocus = focus;
    slot(a.A, 0).skills.goalkeeping = 1;
    return simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2), 0.38: true, [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: false }, 0.9));
  };
  const cut = run('LOW_CUTBACKS'), open = run('CENTRAL');
  assert.deepEqual(evs(cut, 'VAR_CHECK').map((e) => e.var.kind), ['FOUL', 'FOUL'], 'cutback: kun frispark');
  assert.ok(evs(cut, 'VAR_CHECK').every((e) => /skubbede #\d+ .+ #\d+ .+ i opspillet\? …$/.test(e.text)));
  assert.deepEqual(evs(open, 'VAR_CHECK').map((e) => e.var.kind), ['OFFSIDE', 'OFFSIDE'], 'data: åbent spil tjekkes for offside');
});

// ---------- Linjedommerens flag ----------
test('linjedommerens flag: afslutningen tæller hverken som redning, på mål, forbi eller VAR-tjek – den offside-tjekkede −0,1 og forsvareren +0,2 pr. flag', () => {
  const run = (script, trap = 22) => {
    const a = arena();
    for (let i = 1; i <= 10; i++) { slot(a.H, i).varProfile.varPulse = 10; slot(a.H, i).counterTactics.vsTrapLong = trap; slot(a.H, i).skills.finishing = 1; }
    slot(a.A, 1).skills.positioning = 11; slot(a.A, 0).skills.goalkeeping = 20;
    return { a, m: simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2), ...script }, 0.1)) };
  };
  const base = run({ 0.3: shots(0) }), flag = run({ [VAR_RULES.OFFSIDE_FLAG_P]: true, [MISS_P]: true }), onside = run({ [VAR_RULES.OFFSIDE_FLAG_P]: true }, 23), none = run({});
  const flags = evs(flag.m, 'OFFSIDE_FLAG');
  assert.equal(flags.length, 2); assert.ok(flags.every((e) => e.isHome === false && !e.var && !e.plot));
  const d = slot(flag.a.A, 1);
  // flaget kommer FØR forbi-lodtrækningen (MISS_P sand): ingen MISS-hændelser, ingen redning, intet på mål, ingen VAR-tjek
  assert.deepEqual([evs(flag.m, 'MISS').length, evs(flag.m, 'SAVE').length, flag.m.stats.hOnTarget, flag.m.stats.hVarChecks, flag.m.homeVarNet, flag.m.stats.hShots], [0, 0, 0, 0, 0, 2]);
  const dl = deltas(flag.a, flag.m, base.m);
  assert.equal(dl[tagOf(d)], 0.4, 'forsvareren (den, der blev trukket) +0,2 pr. flag');
  assert.equal(Object.values(dl).filter((v) => v === -0.2).length >= 1, true, 'den offside-tjekkede −0,1 pr. flag');
  assert.deepEqual(Object.values(dl).sort(), [-0.2, 0.4].sort(), 'ingen andre karakterer rykker sig');
  // onside (11,035 > 11): intet flag → redningerne står, forsvareren får ikke +0,2
  assert.deepEqual([evs(onside.m, 'OFFSIDE_FLAG').length, evs(onside.m, 'SAVE').length, onside.m.stats.hOnTarget], [0, 2, 2]);
  assert.equal(evs(none.m, 'OFFSIDE_FLAG').length, 0, 'uden OFFSIDE_FLAG_P intet flag');
  assert.match(flags[0].text, /^🚩 \[.+\] Linjedommeren løfter flaget efter afslutningen fra #\d+ .+ – (#\d+ .+ \(.+\) stod offside i opspillet|han \(.+\) stod offside)\.$/);
});

// ---------- Billedet ved et VAR-tjek af en holdkammerat (varBehind) ----------
// Angriberne (plads 9 og 10) står i angrebsform på y 14 (trukket y 20 − 6); skytten (plads 5, FIN 20, x 46 – 8 fra stopperen på 38, så
// han ikke skubbes på tværs) trækkes til y 32 − 16 = 16. v3.16.1 (sammenpresning): ingen står foran modstanderens sidste markspiller
// (stopper på 73 → linje 27 + ONSIDE_GAP 1 = 28); [14, 40] mappes til [28, 40]: angriberne 28, skytten 28 + 2·12/26 = 28,9 → 29 – to står
// foran ham, så han er ikke blandt de VAR_FRONT forreste, og hans forreste holdkammerat tjekkes. Billedet rykker skytten til den tjekkedes
// y + VAR_BEHIND (28 + 4 = 32) og bolden med; uden varBehind stod han på 29 (bolden på 20). Står han længere tilbage (52 − 16 = 36 →
// 28 + 22·12/26 = 38,2 → 38 > 32), rykkes han ikke.
test('billedet ved et VAR-tjek af en holdkammerat: skytten tegnes mindst VAR_BEHIND (4) bag den tjekkede (koblet y 29 → 32), bolden ved ham – står han allerede længere tilbage (38), rykkes han ikke', () => {
  const run = (shooterY) => {
    const a = arena();
    a.H.tactics.customCoords = { ...Object.fromEntries([1, 2, 3, 4, 6, 7, 8].map((j) => [j, { x: 50, y: 95 }])), 9: { x: 5, y: 20 }, 10: { x: 95, y: 20 }, 5: { x: 46, y: shooterY } };
    for (const p of a.A.squad) p.skills.positioning = 20;   // løbene vindes ikke – almindelig afslutning
    for (const p of a.H.squad) p.skills.finishing = 1;
    slot(a.H, 5).skills.finishing = 20; slot(a.A, 0).skills.goalkeeping = 1;
    for (let i = 1; i <= 10; i++) { slot(a.H, i).counterTactics.vsTrapLong = 40; slot(a.H, i).varProfile.varPulse = 30; }
    const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (n) => n < 1, [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: false }, 0.5));
    return { a, m, goal: evs(m, 'GOAL')[0] };
  };
  const near = run(32), far = run(52);
  for (const r of [near, far]) {
    assert.equal(evs(r.m, 'VAR_CHECK').length, 1);
    assert.match(r.goal.text, /📺 VAR: målet står – #\d+ .+ foran #6 A\. Hansen stod ikke offside/, 'skytten (plads 5) var ikke den forreste');
    assert.equal(r.goal.snapshot.scorer, slot(r.a.H, 5).id);
  }
  const ys = (r) => Object.fromEntries(r.goal.snapshot.pts.map(([id, x, y]) => [id, [x, y]]));
  assert.deepEqual(ys(near)[slot(near.a.H, 5).id], [46, 32]);
  assert.deepEqual(near.goal.snapshot.ball, [46, 32], 'bolden ved skytten (x 46, ikke midten)');
  assert.deepEqual([ys(near)[slot(near.a.H, 9).id], ys(near)[slot(near.a.H, 10).id]], [[5, 28], [95, 28]], 'den tjekkede står, hvor han stod (på linjen)');
  assert.deepEqual(ys(far)[slot(far.a.H, 5).id], [46, 38], 'allerede længere tilbage end 28 + 4: uændret');
  assert.deepEqual(far.goal.snapshot.ball, [46, 38], 'langskud (38 ≥ LONGSHOT_Y 30): bolden ved skytten');
});

// Samme opstilling, men VAR-evnerne er forskellige: den tjekkede (plads 9/10) og skytten (plads 5) har hver sin varPulse, og
// afgørelsen (godkendt/annulleret/flag) afhænger af den TJEKKEDES – ikke skyttens.
function behindRun(script, { offPulse = 30, shooterPulse = 30, trap = 40, gk = 10, lone = false } = {}) {
  const a = arena(); slot(a.A, 0).skills.goalkeeping = gk;
  a.H.tactics.customCoords = lone ? { ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }])), 9: { x: 40, y: 20 } } : { ...Object.fromEntries([1, 2, 3, 4, 6, 7, 8].map((j) => [j, { x: 50, y: 95 }])), 9: { x: 5, y: 20 }, 10: { x: 95, y: 20 }, 5: { x: 40, y: 32 } };
  for (const p of a.A.squad) p.skills.positioning = 20;
  for (const p of a.H.squad) p.skills.finishing = 1;
  slot(a.H, lone ? 9 : 5).skills.finishing = 20;
  for (let i = 1; i <= 10; i++) { slot(a.H, i).counterTactics.vsTrapLong = trap; slot(a.H, i).varProfile.varPulse = i === 5 ? shooterPulse : offPulse; }
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (n) => n < 1, ...script }, 0.5));
  return { a, m, shooter: slot(a.H, lone ? 9 : 5), def: slot(a.A, 1) };
}
const ONE_CHECK = { [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: false };
test('VAR tjekker en holdkammerat foran skytten: godkendt → timingen er den TJEKKEDES (iskold 30 ≠ skyttens slap 5) i både referat og observation', () => {
  const r = behindRun(ONE_CHECK, { offPulse: 30, shooterPulse: 5 });
  const g = evs(r.m, 'GOAL')[0];
  assert.match(g.text, /📺 VAR: målet står – #\d+ .+ foran #6 A\. Hansen stod ikke offside; han timede sit løb med iskold præcision\.$/);
  const off = find(r.a, g.text.match(/målet står – (#\d+ .+?) foran/)[1]);
  assert.ok(off === slot(r.a.H, 9) || off === slot(r.a.H, 10));
  assert.ok(r.m.observations.some((o) => o.playerId === off.id && o.text === `VAR-tjek (mod ${r.a.A.name}): ${off.shortName} timede sit løb med iskold præcision.`), 'observationen går til den tjekkede');   // v3.16.3: uden minut
  assert.ok(!r.m.observations.some((o) => o.playerId === r.shooter.id && /^VAR-/.test(o.text)), 'skytten får ingen VAR-observation');
  // omvendt: den tjekkede er slap (5), skytten iskold (30) → afgørelsen følger den tjekkede
  const w = behindRun(ONE_CHECK, { offPulse: 5, shooterPulse: 30, trap: 22 });
  assert.equal(evs(w.m, 'VAR_CHECK')[0].var.verdict, 'OVERTURNED', 'skytten er iskold, men den tjekkede (slap) var offside');
});
test('annulleret mål med en holdkammerat tjekket: kendelsen nævner forsvareren, hans hold og begge spillere – og hold-/spillernavnene står de rigtige steder', () => {
  const r = behindRun(ONE_CHECK, { offPulse: 5, shooterPulse: 30, trap: 22 });
  const no = evs(r.m, 'VAR_NO_GOAL')[0], chk = evs(r.m, 'VAR_CHECK')[0];
  const off = find(r.a, chk.text.match(/stod (#\d+ .+?) offside/)[1]);
  assert.ok(off === slot(r.a.H, 9) || off === slot(r.a.H, 10));
  assert.equal(no.text, `📺 [${r.a.H.name} • 0-0] VAR-KENDELSE: MÅLET ANNULLERES! ${tagOf(r.def)} (${r.a.A.name}) holdt linjen, og ${tagOf(off)} stod offside og var med i situationen, da ${tagOf(r.shooter)} skød.`);
  assert.equal(no.label, `📺 VAR: annulleret – ${tagOf(off)}`);
  assert.deepEqual([no.isHome, no.plot], [true, true]);
  // og den almindelige variant (skytten selv): holdnavnet er forsvarerens
  const self = goalCheckRun({ 0.3: shots(1), [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: false });
  const t = evs(self.m, 'VAR_NO_GOAL')[0].text;
  assert.match(t, new RegExp(`^📺 \\[${self.a.H.name} • 0-0\\] VAR-KENDELSE: MÅLET ANNULLERES! ${tagOf(self.d).replace('.', '\\.')} \\(${self.a.A.name}\\) holdt linjen, og #\\d+ .+ (var offside|stod offside og var med i situationen, da #\\d+ .+ skød)\\.$`));
});
test('annulleret mål, hvor skytten selv er den forreste: "#forsvarer (forsvarets hold) holdt linjen, og #skytte var offside" – holdnavnet er forsvarets', () => {
  const r = behindRun(ONE_CHECK, { offPulse: 5, trap: 22, lone: true });
  const no = evs(r.m, 'VAR_NO_GOAL')[0];
  assert.equal(no.text, `📺 [${r.a.H.name} • 0-0] VAR-KENDELSE: MÅLET ANNULLERES! ${tagOf(r.def)} (${r.a.A.name}) holdt linjen, og ${tagOf(r.shooter)} var offside.`);
  assert.equal(no.label, `📺 VAR: annulleret – ${tagOf(r.shooter)}`);
});
test('linjedommerens flag med en holdkammerat tjekket: "#X (hold) stod offside i opspillet" – ikke "han"', () => {
  const r = behindRun({ [VAR_RULES.OFFSIDE_FLAG_P]: true }, { offPulse: 5, shooterPulse: 30, trap: 22, gk: 20 });   // keeperen redder (20 + 4 > 20 + 4 + 0,3 falsk): flaget nås
  const f = evs(r.m, 'OFFSIDE_FLAG');
  assert.equal(f.length, 1, 'data: ét flag');
  assert.match(f[0].text, new RegExp(`^🚩 \\[${r.a.A.name}\\] Linjedommeren løfter flaget efter afslutningen fra ${tagOf(r.shooter).replace('.', '\\.')} – #\\d+ .+ \\(${r.a.H.name}\\) stod offside i opspillet\\.$`));
  // står skytten selv forrest, er det ham: "han stod offside" (uden holdnavn)
  const s = behindRun({ [VAR_RULES.OFFSIDE_FLAG_P]: true }, { offPulse: 5, trap: 22, gk: 20, lone: true });
  assert.equal(evs(s.m, 'OFFSIDE_FLAG').length, 1, 'data: ét flag');
  assert.equal(evs(s.m, 'OFFSIDE_FLAG')[0].text, `🚩 [${s.a.A.name}] Linjedommeren løfter flaget efter afslutningen fra ${tagOf(s.shooter)} – han stod offside.`);
});
// Standardværdien for mod-kunnen: en angriber uden registreret mod-kunne regnes for 15 (15·0,045 = 0,675)
test('offside-duellen: uden registreret mod-kunne regnes vsTrapLong som 15 (10 + 0,675 > 10,6 → godkendt); ikke 0 (10 < 10,6)', () => {
  const r = goalCheckRun({ 0.3: shots(1), [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: false }, { tweak: (a) => { slot(a.A, 1).skills.positioning = 10.6; for (const p of a.H.squad) p.counterTactics.vsTrapLong = undefined; } });
  assert.deepEqual(evs(r.m, 'VAR_CHECK').map((e) => e.var.verdict), ['STANDS']);
});

// ---------- Hovedstød: VAR tjekker mod stopperen i luftduellen ----------
test('hovedstødsmål annulleret for offside: VAR holder op mod stopperen i luftduellen (første CB, plads 2) – ham får +0,45 og taktisk sejr, ikke den først valgte forsvarer (plads 1)', () => {
  const run = (n) => {
    const a = arena();
    a.H.tactics.phases.phase1_buildUp.attackFocus = 'HIGH_CROSSES';
    for (let i = 1; i <= 10; i++) { slot(a.H, i).varProfile.varPulse = 10; slot(a.H, i).counterTactics.vsTrapLong = 22; slot(a.H, i).aerialPower = 15; }
    for (const p of a.A.squad) { p.aerialPower = 1; p.skills.positioning = 1; }
    slot(a.A, 2).skills.positioning = 11; slot(a.A, 0).skills.goalkeeping = 1;
    return { a, m: simulateMatch(a.H, a.A, stubRng({ 0.3: shots(n), 0.52: true, [CROSS_CORNER_P]: true, [CORNER_P]: true, [VAR_RULES.GOAL_CHECK_P]: n > 0, [VAR_RULES.GOAL_FOUL_SHARE]: false }, 0.1)) };
  };
  const no = run(2), base = run(0);
  assert.deepEqual(evs(no.m, 'VAR_CHECK').map((e) => e.var.kind + '/' + e.var.verdict), ['OFFSIDE/OVERTURNED', 'OFFSIDE/OVERTURNED']);
  assert.deepEqual([no.m.homeGoals, evs(no.m, 'HEADER_GOAL').length, no.m.stats.hAerialWon], [0, 0, 2], 'luftduellen er vundet, målet annulleret');
  const cb = slot(no.a.A, 2);
  assert.equal(R(no.m, cb).tacticWins, 2);
  assert.equal(deltas(no.a, no.m, base.m)[tagOf(cb)], 0.9);
  assert.match(evs(no.m, 'VAR_NO_GOAL')[0].text, new RegExp(`${tagOf(cb).replace('.', '\\.')} \\(.+\\) holdt linjen`));
  // ingen hjørne, ingen redning efter et annulleret hovedstød ("disallowed" er hverken redning eller clearing)
  assert.deepEqual([no.m.stats.hCorners, evs(no.m, 'SAVE').length], [0, 0]);
});

// ---------- Straffe-kendelsen: hvem og hvorfor ----------
test('straffe-filmning afgøres af den fældedes theatre (ikke cynisme, ikke forsvarerens): theatre 30 → annulleres ved rul 0,26; theatre 5 → står', () => {
  const dive = (theatre, cyn, foulerTheatre) => penRun({}, { next: 0.26, tweak: (a) => {
    const p = slot(a.H, 9); p.varProfile.theatre = theatre; p.varProfile.cynicism = cyn; slot(a.A, 1).varProfile.theatre = foulerTheatre;
  } }).m;
  const over = dive(30, 0, 0), stands = dive(5, 30, 30);
  assert.deepEqual([evs(over, 'VAR_PEN')[0].var.verdict, evs(over, 'VAR_NO_PEN').length], ['OVERTURNED', 1], '10,4 < 30');
  assert.deepEqual([evs(stands, 'VAR_PEN')[0].var.verdict, evs(stands, 'VAR_NO_PEN').length], ['STANDS', 0], '10,4 > 5');
});

// ---------- Et rødt kort, der ikke kan gives, tjekkes ikke ----------
test('hjemmeholdet er nede på 7 mand: VAR tjekker ikke flere røde kort (RED_CHECK_P kaldes ikke) og opgraderer ingen (RED_UPGRADE_P) – ingen VAR_RED, ingen tælling', () => {
  // Fire direkte røde i de fire første ticks (RED_CHECK_P falsk i de første fire kald) → 11 − 4 = 7. Derefter kan ingen udvises.
  const run = (script) => { const a = arena(); return simulateMatch(a.H, a.A, stubRng({ 0.06: true, 0.4: true, [VAR_RULES.RED_CHECK_P]: (n) => n >= 4, ...script }, 0.45)); };
  const direct = run({ [CARD_RULES.DIRECT_RED_P]: true });
  const up = run({ [CARD_RULES.DIRECT_RED_P]: (n) => n < 4, [VAR_RULES.RED_CHECK_P]: false, [VAR_RULES.RED_UPGRADE_P]: true });
  for (const [name, m] of [['direkte', direct], ['opgradering', up]]) {
    assert.equal(m.stats.hReds, 4, `${name}: data: fire røde, så 7 mand`);
    assert.equal(evs(m, 'VAR_RED').length, 0, name);
    assert.deepEqual([m.stats.hVarChecks, m.stats.aVarChecks, m.homeVarNet], [0, 0, 0], name);
  }
});

// ---------- Forbi: hvem blokerer, og hvilket hold står hvor ----------
test('blokering: forsvareren (sidste forsvarer med pick = sidste element) blokerer og får +0,1 pr. skud – aldrig en midtbanespiller; teksten har forsvarets hold først og angriberens til sidst', () => {
  const run = (n) => {
    const a = arena(); for (const p of a.H.squad) p.skills.finishing = 1; slot(a.A, 0).skills.goalkeeping = 20;
    const rng = stubRng({ 0.3: shots(n), [MISS_P]: true, [MISS_BLOCK_SHARE]: true });
    return { a, m: simulateMatch(a.H, a.A, { ...rng, pick: (arr) => arr.at(-1) }) };
  };
  const r = run(2), none = run(0);
  const rb = slot(r.a.A, 4);
  assert.deepEqual(deltas(r.a, r.m, none.m), { [tagOf(rb)]: 0.2 });
  const t = evs(r.m, 'MISS')[0].text;
  assert.equal(t.startsWith(`🧱 [${r.a.A.name}] ${tagOf(rb)} kaster sig ind foran afslutningen fra #`), true, t);
  assert.match(t, new RegExp(`\\(${r.a.H.name}\\)\\.$`));
  // og forbi-skuddet står med angriberens hold
  const miss = missRun({ 0.3: shots(1), [MISS_P]: true, [MISS_BLOCK_SHARE]: false }, { tweak: (a) => { for (const p of a.H.squad) p.skills.finishing = 1; slot(a.A, 0).skills.goalkeeping = 20; } });
  assert.match(evs(miss.m, 'MISS')[0].text, new RegExp(`^🎯 \\[${miss.a.H.name}\\] #`));
});

// ---------- Konstanterne er pinnet bogstaveligt (testene bruger dem som stub-nøgler, så en ændret værdi følger med) ----------
test('VAR_RULES og MISS_*: værdierne og specifikationens procenter (docs/spec.md "VAR som i virkeligheden") følges ad', async () => {
  assert.deepEqual({ ...VAR_RULES }, { GOAL_CHECK_P: 0.131, GOAL_FOUL_SHARE: 0.27, OFFSIDE_FLAG_P: 0.043, PEN_CHECK_P: 0.26, PEN_OFFSIDE_SHARE: 0.31, PEN_AWARD_P: 0.0023, RED_CHECK_P: 0.53, RED_UPGRADE_P: 0.041 });
  assert.deepEqual([MISS_P, MISS_BLOCK_SHARE, MISS_CORNER_P], [0.62, 0.66, 0.88]);
  const spec = (await import('node:fs')).readFileSync(new URL('../../docs/spec.md', import.meta.url), 'utf8');
  const sec = spec.slice(spec.indexOf('VAR som i virkeligheden (v3.15.1'));
  const pct = (v) => `${+(v * 100).toFixed(2)}`.replace('.', ',') + ' %';
  for (const v of [...Object.values(VAR_RULES), MISS_P, MISS_BLOCK_SHARE, MISS_CORNER_P]) assert.ok(sec.includes(pct(v)), `specifikationen nævner ${pct(v)}`);
  // Alle værdier er unikke (stubs er nøglet på sandsynligheden) – og rører ingen af motorens øvrige chance(p)-nøgler (skud-chancen
  // 0,3/0,285/0,36, kontra 0,48 osv.): en kollision ville få en stub til at styre to ting på én gang.
  const all = [...Object.values(VAR_RULES), MISS_P, MISS_BLOCK_SHARE, MISS_CORNER_P];
  assert.equal(new Set(all).size, all.length, 'unikke');
  for (const other of [0.3, 0.285, 0.36, 0.48, 0.06, 0.4, 0.5, 0.07, 0.58, 0.21, 0.52, 0.38, 0.9, 0.35, 0.37]) assert.ok(!all.includes(other), `${other} bruges allerede af motoren`);
});
