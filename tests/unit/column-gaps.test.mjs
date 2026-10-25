// v3.14 Test Manager: huller i column.test.mjs, fundet ved mutation af column.js/stats.js/gazette.js.
// Forfatterens tests kører klummen på simulerede sæsoner (format og tilstedeværelse); her står HÅNDBYGGEDE kampe
// med kendte, forskellige tal pr. side, så en ombyttet side, en forskudt tærskel eller en fjernet gren bliver rød.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildColumn, publicFacts, compactFacts, headlineOf, pickBy, STYLE_RULES, PUBLIC_FACT_KEYS, RATING_PUBLIC, styleGuess } from '../../public/engine/column.js';
import { roundHistory } from '../../public/engine/stats.js';
import { headline } from '../../public/engine/gazette.js';
import { RATING_PRIVATE_FIELDS } from '../../public/engine/visibility.js';

// Kamp: events = [minut, type, isHome, hG, aG], pool = [kind, teamName].
const M = ({ h = 'h1', a = 'a1', hn = 'Hjem', an = 'Ude', hG = 0, aG = 0, ev = [], pool = [], stats, ratings, ownReports, sf, es } = {}) => ({
  homeId: h, awayId: a, homeName: hn, awayName: an, homeGoals: hG, awayGoals: aG,
  events: ev.map(([min, type, isHome, eh, ea]) => ({ min, type, category: type === 'TRIGGER' ? 'HIGHLIGHT' : 'X', isHome, hG: eh, aG: ea, text: 'TEKST', label: 'LABEL' })),
  goalsPool: pool.map(([kind, teamName], i) => ({ kind, min: 10 + i, scorer: `S${i}`, teamName, desc: 'DESC' })),
  stats, ratings, ownReports, startFormations: sf, endState: es,
});
const inp = (o) => ({ matches: [], gazette: null, history: [], table: [], next: [], viewerTeamId: 'h1', round: 5, ...o });
const sec = (c, id) => c.sections.find((s) => s.id === id);
// Alle tre varianter af en skabelon: runderne 0, 1, 2 giver tre forskellige valg
const variants = (make) => [0, 1, 2].map((r) => make(r)).sort();

// ---------- publicFacts: hver værdi fra den rigtige side ----------
const FULL = M({
  hG: 3, aG: 2, sf: { home: '4-4-2', away: '4-3-3' }, es: { home: { formation: '3-5-2' }, away: { formation: '5-4-1' } },
  stats: { hPoss: 30, aPoss: 90, hShots: 11, aShots: 7, hOnTarget: 5, aOnTarget: 3, hCorners: 8, aCorners: 2, hAerialWon: 9, aAerialWon: 4, hYellows: 2, aYellows: 6, hReds: 1, aReds: 3, hXg: 99, aXg: 98, hVarChecks: 97, hTacticSuccess: 96, hFreeKicks: 95, hFouls: 94 },
  ev: [[10, 'GOAL', true, 1, 0], [20, 'SUB', true, 1, 0], [30, 'INJURY', false, 1, 0], [40, 'TRIGGER', true, 1, 0], [41, 'TRIGGER', true, 1, 0], [50, 'TRIGGER', false, 1, 0],
    [60, 'HEADER_GOAL', false, 1, 1], [70, 'VAR_GOAL', true, 2, 1], [80, 'YELLOW', true, 2, 1], [85, 'INFO', false, 2, 1]],
  pool: [['COUNTER', 'Hjem'], ['COUNTER', 'Hjem'], ['HEADER', 'Hjem'], ['CORNER', 'Hjem'], ['PENALTY', 'Hjem'], ['LONGSHOT', 'Hjem'],
    ['COUNTER', 'Ude'], ['HEADER', 'Ude'], ['HEADER', 'Ude'], ['FREEKICK', 'Ude'], ['SETPIECE', 'Ude'], ['SETPIECE', 'Ude']],
  ratings: {
    home: [{ playerId: 'p1', shirtNumber: 1, shortName: 'A', teamId: 'h1', teamName: 'Hjem', goals: 1, assists: 2, saves: 3, aerialWins: 4, stars: 5, isMotM: false, rating: 9.9, distanceKm: 11, topSpeed: 33, hiShare: 40, freeRuns: 5, minIn: 1, slot: 3 }],
    away: [{ playerId: 'p2', shirtNumber: 2, shortName: 'B', teamId: 'a1', teamName: 'Ude', goals: 0, assists: 1, saves: 0, aerialWins: 1, stars: 3, isMotM: true, rating: 7.1, distanceKm: 8, hiKm: 2, minOut: 70 }],
  },
});
test('publicFacts: hvert tal står på den rigtige side, og kun de offentlige tal kommer ud (ikke xG, VAR, frispark, fouls, tekst, label)', () => {
  const f = publicFacts(FULL, 3);
  assert.equal(f.idx, 3);
  assert.deepEqual({ ...f.home }, { id: 'h1', name: 'Hjem', goals: 3, against: 2, formation: '4-4-2', endFormation: '3-5-2', poss: 25, shots: 11, onTarget: 5, corners: 8, aerialWon: 9, yellows: 2, reds: 1,
    counterGoals: 2, setPieceGoals: 2, headerGoals: 1, reorganised: 2 });   // reds (v3.16.3): 1 hjemme ≠ 3 ude – en ombytning er rød
  assert.deepEqual({ ...f.away }, { id: 'a1', name: 'Ude', goals: 2, against: 3, formation: '4-3-3', endFormation: '5-4-1', poss: 75, shots: 7, onTarget: 3, corners: 2, aerialWon: 4, yellows: 6, reds: 3,
    counterGoals: 1, setPieceGoals: 3, headerGoals: 2, reorganised: 1 });
  // Præcis de otte offentlige begivenheder, med præcis disse felter (SUB/INJURY/TRIGGER og alle tre måltyper; ingen tekst/label;
  // clock: null for hændelser uden ur – v3.16.4)
  assert.deepEqual(f.events, [
    { type: 'GOAL', min: 10, clock: null, isHome: true, hG: 1, aG: 0 }, { type: 'SUB', min: 20, clock: null, isHome: true, hG: 1, aG: 0 }, { type: 'INJURY', min: 30, clock: null, isHome: false, hG: 1, aG: 0 },
    { type: 'TRIGGER', min: 40, clock: null, isHome: true, hG: 1, aG: 0 }, { type: 'TRIGGER', min: 41, clock: null, isHome: true, hG: 1, aG: 0 }, { type: 'TRIGGER', min: 50, clock: null, isHome: false, hG: 1, aG: 0 },
    { type: 'HEADER_GOAL', min: 60, clock: null, isHome: false, hG: 1, aG: 1 }, { type: 'VAR_GOAL', min: 70, clock: null, isHome: true, hG: 2, aG: 1 }]);
  assert.equal(f.goals.length, 12);
  assert.deepEqual(f.goals[0], { kind: 'COUNTER', min: 10, scorer: 'S0', teamName: 'Hjem' }, 'målene uden desc/spectacle');
  // Karakterlinjer: hjemme først, så ude; PRÆCIS de offentlige felter (positiv liste), aldrig rating/km/topfart/minIn/slot
  assert.deepEqual(f.ratings, [
    { playerId: 'p1', shirtNumber: 1, shortName: 'A', teamId: 'h1', teamName: 'Hjem', goals: 1, assists: 2, saves: 3, aerialWins: 4, stars: 5, isMotM: false },
    { playerId: 'p2', shirtNumber: 2, shortName: 'B', teamId: 'a1', teamName: 'Ude', goals: 0, assists: 1, saves: 0, aerialWins: 1, stars: 3, isMotM: true }]);
  assert.ok(Object.isFrozen(f) && Object.isFrozen(f.home) && Object.isFrozen(f.away), 'fakta-laget er frosset');
});
test('publicFacts: tomme/gamle kampe giver nuller og null (ikke NaN/undefined), og idx er 0 uden argument', () => {
  const f = publicFacts({ homeId: 'h', awayId: 'a', homeName: 'H', awayName: 'A', homeGoals: 1, awayGoals: 0 });
  assert.equal(f.idx, 0);
  assert.deepEqual({ ...f.home }, { id: 'h', name: 'H', goals: 1, against: 0, formation: null, endFormation: null, poss: 0, shots: 0, onTarget: 0, corners: 0, aerialWon: 0, yellows: 0, reds: 0, counterGoals: 0, setPieceGoals: 0, headerGoals: 0, reorganised: 0 });   // reds: 0 (ikke undefined) for kampe fra før v3.16.3
  assert.equal(f.away.poss, 0);
  assert.deepEqual([f.events, f.goals, f.ratings], [[], [], []]);
});
test('de lukkede lister er bogstavelige: PUBLIC_FACT_KEYS og RATING_PUBLIC (ingen nøgle kan fjernes eller tilføjes uden at en test ser det)', () => {
  assert.deepEqual(PUBLIC_FACT_KEYS, ['poss', 'shots', 'onTarget', 'corners', 'aerialWon', 'counterGoals', 'setPieceGoals', 'headerGoals', 'yellows', 'reds', 'reorganised', 'goals', 'against']);   // 'reds' ny i v3.16.3 (13 nøgler)
  assert.deepEqual(RATING_PUBLIC, ['playerId', 'shirtNumber', 'shortName', 'teamId', 'teamName', 'goals', 'assists', 'saves', 'aerialWins', 'stars', 'isMotM']);
  assert.ok(RATING_PUBLIC.every((k) => !RATING_PRIVATE_FIELDS.includes(k)));
});
test('compactFacts og runde-historikkens facts: begge hold, nøglet på hold-id, præcis de 13 tal (v3.16.3: + reds) – for hver kamp i runden', () => {
  const f = publicFacts(FULL);
  const c = compactFacts(f);
  assert.deepEqual(Object.keys(c), ['h1', 'a1']);
  assert.deepEqual(c.h1, { poss: 25, shots: 11, onTarget: 5, corners: 8, aerialWon: 9, counterGoals: 2, setPieceGoals: 2, headerGoals: 1, yellows: 2, reds: 1, reorganised: 2, goals: 3, against: 2 });
  assert.deepEqual(c.a1, { poss: 75, shots: 7, onTarget: 3, corners: 2, aerialWon: 4, counterGoals: 1, setPieceGoals: 3, headerGoals: 2, yellows: 6, reds: 3, reorganised: 1, goals: 2, against: 3 });
  const m2 = M({ h: 'h2', a: 'a2', hn: 'Hjem2', an: 'Ude2', hG: 0, aG: 1, stats: { hPoss: 50, aPoss: 50, hShots: 1, aShots: 2 } });
  const hist = roundHistory(4, [FULL, m2]);
  assert.deepEqual(Object.keys(hist.facts), ['h1', 'a1', 'h2', 'a2'], 'begge kampe, begge hold');
  assert.deepEqual(hist.facts.h1, c.h1); assert.deepEqual(hist.facts.a1, c.a1);
  assert.deepEqual(hist.facts.a2, { poss: 50, shots: 2, onTarget: 0, corners: 0, aerialWon: 0, counterGoals: 0, setPieceGoals: 0, headerGoals: 0, yellows: 0, reds: 0, reorganised: 0, goals: 1, against: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(hist.facts)), hist.facts, 'JSON-rundtur');
});

// ---------- Stil-gæt: tærskler og basis ----------
const ZERO = { poss: 50, shots: 0, onTarget: 0, corners: 0, aerialWon: 0, counterGoals: 0, setPieceGoals: 0, headerGoals: 0, yellows: 0, reorganised: 0, goals: 0, against: 0 };
const guess = (o) => styleGuess({ ...ZERO, ...o }).map((r) => r.key);
test('stil-gæt: hver tærskel på begge sider af grænsen (kun den ene regel rammes)', () => {
  assert.deepEqual(STYLE_RULES.map((r) => r.key), ['air', 'break', 'ball', 'wait', 'shots', 'target', 'dead', 'switch']);   // 'target' ny i v3.17.0
  assert.deepEqual(guess({}), []);
  assert.deepEqual([guess({ headerGoals: 0 }), guess({ headerGoals: 1 })], [[], ['air']]);
  assert.deepEqual([guess({ corners: 6 }), guess({ corners: 7 })], [[], ['air']]);
  assert.deepEqual([guess({ counterGoals: 0 }), guess({ counterGoals: 1 })], [[], ['break']]);
  assert.deepEqual([guess({ poss: 57 }), guess({ poss: 58 })], [[], ['ball']]);
  assert.deepEqual([guess({ poss: 43, goals: 3 }), guess({ poss: 42, goals: 1 }), guess({ poss: 42, goals: 0 }), guess({ poss: 41, goals: 2 })], [[], ['wait'], [], ['wait']]);
  assert.deepEqual([guess({ poss: 30, goals: 0 }), guess({ goals: 5 })], [[], []], 'wait kræver BÅDE lav besiddelse og mål');
  assert.deepEqual([guess({ shots: 23 }), guess({ shots: 24 })], [[], ['shots']]);   // v3.17.0: 12 → 24 (11/12 er nu begge under)
  assert.deepEqual([guess({ shots: 12 }), guess({ onTarget: 9 }), guess({ onTarget: 10 })], [[], [], ['target']]);
  assert.deepEqual([guess({ setPieceGoals: 0 }), guess({ setPieceGoals: 1 })], [[], ['dead']]);
  assert.deepEqual([guess({ reorganised: 0 }), guess({ reorganised: 1 })], [[], ['switch']]);
  // Rækkefølgen er tabellens (første træf styrer noten); intet filtreres væk eller vendes
  assert.deepEqual(guess({ headerGoals: 2, poss: 60, shots: 30, onTarget: 12, reorganised: 1 }), ['air', 'ball', 'shots', 'target', 'switch']);
});
test('stil-gæt: "basis" er præcis de fakta, reglen læser (målt med en proxy) – ellers kan basis lyve uden at nogen ser det', () => {
  for (const r of STYLE_RULES) {
    const read = new Set();
    const spy = (base) => new Proxy({ ...ZERO, ...base }, { get(t, k) { read.add(k); return t[k]; } });
    for (const base of [{}, { headerGoals: 1, counterGoals: 1, setPieceGoals: 1, reorganised: 1, poss: 40, goals: 2, shots: 20, corners: 9 }, { poss: 60 }, { poss: 30, goals: 0 }]) r.test(spy(base));
    assert.deepEqual([...read].sort(), [...r.basis].sort(), `${r.key}: basis ≠ det, testen læser`);
  }
});

// ---------- headline: alle 12 skabeloner ----------
test('overskrifter: alle tolv skabeloner, vinderen først, stor sejr fra 3 mål, og gazette.headline giver samme tekst', () => {
  const F = (hG, aG) => ({ home: { goals: hG, name: 'A' }, away: { goals: aG, name: 'B' } });
  const all = (hG, aG) => [0, 1, 2].map((r) => headlineOf(F(hG, aG), r)).sort();
  assert.deepEqual(all(3, 0), ['A knuser B 3-0', 'B får klø – A vinder 3-0', 'Opvisning: A sender B hjem med 3-0'].sort());
  assert.deepEqual(all(0, 4), ['B knuser A 4-0', 'A får klø – B vinder 4-0', 'Opvisning: B sender A hjem med 4-0'].sort());
  assert.deepEqual(all(2, 0), ['A slår B 2-0', 'A snupper sejren mod B (2-0)', 'Tre point til A efter 2-0 mod B'].sort(), '2 mål er ikke stor sejr');
  assert.deepEqual(all(1, 2), ['B slår A 2-1', 'B snupper sejren mod A (2-1)', 'Tre point til B efter 2-1 mod A'].sort());
  assert.deepEqual(all(0, 0), ['Målløst mellem A og B', 'Taktisk skak: A og B deler 0-0', 'Ingen vinder – A og B spiller 0-0'].sort());
  assert.deepEqual(all(2, 2), ['Point deles: A – B 2-2', 'A og B skilles 2-2', 'Uafgjort 2-2 mellem A og B'].sort());
  assert.deepEqual(all(1, 1).includes('Målløst mellem A og B'), false, '1-1 er ikke målløst');
  // runden indgår i valget; gazette.headline sender runden videre (ikke 0) og bruger samme tekst
  assert.equal(headlineOf(F(3, 0), 1), 'Opvisning: A sender B hjem med 3-0');
  const mm = { homeName: 'A', awayName: 'B', homeGoals: 3, awayGoals: 0 };
  assert.equal(headline(mm, 1), 'Opvisning: A sender B hjem med 3-0');
  assert.equal(headline(mm), 'A knuser B 3-0', 'runde 0 uden argument');
});
test('pickBy: nøglerne og runden indgår begge i valget, og tallet er heltals-afrundet', () => {
  const L = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((r) => pickBy(L, r, 'x')).sort(), L, 'runderne cykler gennem alle varianter');
  const idx = (r, ...k) => L.indexOf(pickBy(L, r, ...k));
  assert.equal((idx(1, 'x') - idx(0, 'x') + 7) % 7, 1, 'runde + 1 = næste variant');
  assert.equal(idx(0, 'x', 'y') === idx(0, 'x') && idx(0, 'x', 'z') === idx(0, 'x') && idx(0, 'y', 'x') === idx(0, 'x'), false, 'rækkefølgen af/antal nøgler påvirker valget');
  const spread = new Set(['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'].map((k) => idx(0, k)));
  assert.ok(spread.size >= 4, 'forskellige nøgler spreder sig over varianterne');
  // Bogstavelige værdier (regressionsstik): hashen er en del af "samme runde → samme klumme" og må ikke flytte sig ubemærket
  assert.deepEqual([pickBy(L, 0, 'x'), pickBy(L, 0, 'open', 'h1'), pickBy(L, 7, 'open', 'a1'), pickBy(L, 3, 'k1', 'Z'), pickBy(L, 0, 'ab'), pickBy(L, 0, 'ba')], ['b', 'f', 'f', 'g', 'e', 'g']);
});
