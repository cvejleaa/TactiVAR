// v3.14 Test Manager: kampens ownReport (match.js) og endState-afgrænsningen. column.test.mjs tjekker kun, at HJEMMEholdets
// rapport findes for en bot-udekamp og at opbygningstallet står i fuldtids-teksten; her pinnes resten:
// siden, start- og slut-taktikken (også for et udehold og efter et Hvis-Så-skifter), modstander-tallene og endState for hver
// kombination af menneske/bot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';

const league = (seed) => createLeague(createRng(seed));
const KEYS = ['build', 'buildWon', 'counterGoalsAgainst', 'countersAgainst', 'crosses', 'crossesWon', 'cutbackGoals', 'cutbacks', 'cutbacksBlocked', 'end', 'headerGoals', 'oppCrosses', 'oppCrossesWon', 'oppCutbacks', 'oppCutbacksBlocked', 'oppTrapWon', 'press', 'pressWon', 'runGoals', 'runs', 'runsWon', 'side', 'start', 'trapWon'];   // v3.16.7: trapWon/oppTrapWon

test('endState: faser og trukne positioner gemmes kun for MENNESKESTYREDE sider – hjemme, ude, begge og ingen', () => {
  const mk = (seed, human) => { const L = league(seed); const [A, B] = [L.teams[0], L.teams[1]]; A.isBot = !human.includes('home'); B.isBot = !human.includes('away'); A.tactics.customCoords = { 6: { x: 40, y: 40 } }; B.tactics.customCoords = { 7: { x: 60, y: 30 } }; return { A, B, m: simulateMatch(A, B, createRng(seed + 1)) }; };
  const has = (e) => ['phases' in e, 'customCoords' in e];
  for (const [human, home, away] of [[['home'], [true, true], [false, false]], [['away'], [false, false], [true, true]], [['home', 'away'], [true, true], [true, true]], [[], [false, false], [false, false]]]) {
    const { A, B, m } = mk(3, human);
    assert.deepEqual(has(m.endState.home), home, `hjemme, menneske: ${human}`);
    assert.deepEqual(has(m.endState.away), away, `ude, menneske: ${human}`);
    for (const e of [m.endState.home, m.endState.away]) assert.ok(e.formation && e.starters.length === 11, 'formation og startere gemmes altid');
    assert.deepEqual(Object.keys(m.ownReports).sort(), human.map((s) => (s === 'home' ? A.id : B.id)).sort(), `rapport for netop de menneskestyrede: ${human}`);
    if (human.includes('home')) assert.deepEqual(m.endState.home.customCoords, { 6: { x: 40, y: 40 } });
  }
});

test('ownReport: siden (hjemme/ude), præcis de gemte felter, og start- og slut-taktikken – også for et udehold og efter et Hvis-Så-skifter', () => {
  for (const side of ['home', 'away']) {
    const L = league(5), [X, Y] = [L.teams[0], L.teams[1]];
    const [H, A] = side === 'home' ? [X, Y] : [Y, X];   // X er altid mennesket
    X.isBot = false; Y.isBot = true;
    const me = X;
    const planB = structuredClone(me.tactics);
    Object.assign(planB, { baseFormation: '3-5-2' });
    planB.phases.phase1_buildUp.passingStyle = 'DIRECT_LONG'; planB.phases.phase1_buildUp.attackFocus = 'HIGH_CROSSES';
    me.tacticPresets[1] = planB;
    me.tactics.baseFormation = '4-4-2'; me.tactics.phases.phase1_buildUp.passingStyle = 'SHORT'; me.tactics.phases.phase1_buildUp.attackFocus = 'CENTRAL';
    me.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'DRAW', margin: 1, newFormation: '5-4-1', newPlan: 1 }];
    const startPhases = structuredClone(me.tactics.phases);
    const m = simulateMatch(H, A, createRng(8));
    assert.equal(m.events.filter((e) => e.type === 'TRIGGER').length, 1, 'forudsætning: skiftet skete (' + side + ')');
    const r = m.ownReports[me.id];
    assert.deepEqual(Object.keys(r).sort(), KEYS);
    assert.equal(r.side, side);
    assert.equal(r.start.formation, '4-4-2'); assert.deepEqual(r.start.phases, startPhases, 'start: planen kampen begyndte med');
    assert.equal(r.end.formation, '3-5-2');
    assert.equal(r.end.phases.phase1_buildUp.passingStyle, 'DIRECT_LONG'); assert.equal(r.end.phases.phase1_buildUp.attackFocus, 'HIGH_CROSSES');
    assert.equal(r.start.phases.phase1_buildUp.passingStyle, 'SHORT', 'start-taktikken er ikke overskrevet af skiftet (ingen alias)');
    // Kopier: at ændre rapporten rører hverken holdet eller planen (og omvendt)
    r.end.phases.phase1_buildUp.passingStyle = 'X'; r.start.phases.phase1_buildUp.passingStyle = 'Y';
    assert.equal(me.tacticPresets[1].phases.phase1_buildUp.passingStyle, 'DIRECT_LONG'); assert.equal(me.tactics.phases.phase1_buildUp.passingStyle, 'SHORT');
    assert.equal(m.startFormations[side], '4-4-2');
  }
});

test('ownReport: modstander-tallene er modstanderens egne (cutbacks og høje bolde mod mig = hans cutbacks og høje bolde), og fuldtids-teksten læser dem', () => {
  let nCut = 0, nBlk = 0, nCr = 0, nWon = 0, nDiffer = 0, nText = 0, nTrap = 0, nOff = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const L = league(seed), [A, B] = [L.teams[0], L.teams[1]]; B.isBot = false;
    // Varier angrebsfokus, så både cutbacks og høje bolde optræder
    A.tactics.phases.phase1_buildUp.attackFocus = ['LOW_CUTBACKS', 'HIGH_CROSSES', 'CENTRAL'][seed % 3];
    B.tactics.phases.phase1_buildUp.attackFocus = ['HIGH_CROSSES', 'LOW_CUTBACKS', 'CENTRAL'][seed % 3];
    const m = simulateMatch(A, B, createRng(seed * 7));
    const a = m.ownReports[A.id], b = m.ownReports[B.id];
    assert.deepEqual([a.oppCutbacks, a.oppCutbacksBlocked, a.oppCrosses, a.oppCrossesWon], [b.cutbacks, b.cutbacksBlocked, b.crosses, b.crossesWon], `seed ${seed}: A's modstander-tal er B's egne`);
    assert.deepEqual([b.oppCutbacks, b.oppCutbacksBlocked, b.oppCrosses, b.oppCrossesWon], [a.cutbacks, a.cutbacksBlocked, a.crosses, a.crossesWon], `seed ${seed}: B's modstander-tal er A's egne`);
    nCut += a.cutbacks + b.cutbacks; nBlk += a.cutbacksBlocked + b.cutbacksBlocked; nCr += a.crosses + b.crosses; nWon += a.crossesWon + b.crossesWon;
    if (a.cutbacks !== a.crosses || b.cutbacks !== b.crosses) nDiffer++;
    // Fuldtids-analysen (for den ene menneskeside) bruger rapportens modstander-tal
    const ft = m.events.find((e) => e.type === 'FULLTIME');
    const ownerRep = ft.isHome ? a : b;
    // v3.16.3-ordlyden: "cutbacks stoppet M af N · luftdueller i åbent spil vundet …"
    assert.ok(ft.text.includes(`Dit felt: modstanderens cutbacks stoppet ${ownerRep.oppCutbacksBlocked} af ${ownerRep.oppCutbacks} · luftdueller i åbent spil vundet ${ownerRep.oppCrosses - ownerRep.oppCrossesWon} af ${ownerRep.oppCrosses}.`), `${ft.text.slice(-120)} | ${JSON.stringify(ownerRep)}`);
    const g = (n) => `${n} ${n === 1 ? 'gang' : 'gange'}`;   // v3.16.7: "af 1 gang"
    // v3.16.7: offside-fælden står for sig – egne offsides i opbygningen, fælde-sejre i presset
    const off = ownerRep.oppTrapWon, trap = ownerRep.trapWon;
    const want = `Din opbygning kom igennem ${ownerRep.buildWon} af ${g(ownerRep.build)}${off ? ` (${off} ${off === 1 ? 'gang' : 'gange'} fanget offside)` : ''}; `
      + (trap ? `dit pres stoppede opbygningen ${ownerRep.pressWon} af ${g(ownerRep.press)} (${ownerRep.pressWon - trap} ${ownerRep.pressWon - trap === 1 ? 'erobring' : 'erobringer'}, ${trap} offside).` : `dit pres vandt bolden ${ownerRep.pressWon} af ${g(ownerRep.press)}.`);
    assert.ok(ft.text.includes(want), `${want} | ${ft.text.slice(0, 260)}`);
    if (trap) nTrap++; if (off) nOff++;
    if (ownerRep.oppCutbacks !== ownerRep.cutbacks || ownerRep.oppCrosses !== ownerRep.crosses) nText++;
  }
  assert.ok(nTrap >= 3 && nOff >= 3, `data: ${nTrap} med egen fælde, ${nOff} med egne offsides`);
  assert.ok(nCut > 10 && nBlk > 3 && nCr > 10 && nWon > 3 && nDiffer > 10 && nText > 10, `data nok: cutbacks ${nCut}, stoppet ${nBlk}, høje ${nCr}, vundet ${nWon}, forskellige ${nDiffer}, tekst ${nText}`);
});

test('ownReport: rapportens mål-felter passer med kampens mål (hovedstød, kontramål imod og løbsmål er ikke højere end hvad der blev scoret)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const L = league(seed), [A, B] = [L.teams[0], L.teams[1]]; B.isBot = false;
    const m = simulateMatch(A, B, createRng(seed * 13));
    const rs = [m.ownReports[A.id], m.ownReports[B.id]];
    assert.equal(rs[0].side, 'home'); assert.equal(rs[1].side, 'away');
    for (const [i, r] of rs.entries()) {
      const goals = i === 0 ? m.homeGoals : m.awayGoals, against = i === 0 ? m.awayGoals : m.homeGoals;
      // En cutback efter et løb tæller i begge (match.js: løbsmål og cutbackmål) – hver for sig højst holdets mål (v3.15.1: før
      // stod summen her, som kun holdt, fordi seedene aldrig gav et løb til cutback-mål sammen med et andet cutbackmål).
      assert.ok(r.runGoals <= goals && r.cutbackGoals <= goals, `seed ${seed}: løbsmål ${r.runGoals} / cutbackmål ${r.cutbackGoals} over ${goals} mål`);
      assert.ok(r.counterGoalsAgainst <= against, `seed ${seed}: kontramål imod ${r.counterGoalsAgainst} > ${against} indkasserede`);
      assert.ok(r.buildWon <= r.build && r.pressWon <= r.press && r.crossesWon <= r.crosses && r.cutbacksBlocked <= r.cutbacks);
    }
  }
});
