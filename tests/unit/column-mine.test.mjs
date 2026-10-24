// v3.14 Test Manager: "Din kamp" (resultat, drama, kampvurdering), "De øvrige kampe" og overskriften – på
// HÅNDBYGGEDE kampe med kendte tal. column.test.mjs kører kun simulerede sæsoner (tilstedeværelse og format) og
// kan derfor ikke se en forskudt tærskel, en vendt side eller en ombyttet prioritet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildColumn, publicFacts, headlineOf, pickBy, STYLE_RULES } from '../../public/engine/column.js';

// Kamp: ev = [minut, type, isHome, hG, aG], pool = [kind, teamName].
const M = ({ h = 'h1', a = 'a1', hn = 'Hjem', an = 'Ude', hG = 0, aG = 0, ev = [], pool = [], stats, ownReports } = {}) => ({
  homeId: h, awayId: a, homeName: hn, awayName: an, homeGoals: hG, awayGoals: aG,
  events: ev.map(([min, type, isHome, eh, ea]) => ({ min, type, isHome, hG: eh, aG: ea, text: 'T', label: 'L' })),
  goalsPool: pool.map(([kind, teamName], i) => ({ kind, min: 10 + i, scorer: `S${i}`, teamName })), stats, ownReports,
});
const inp = (o) => ({ matches: [], gazette: null, history: [], table: [], next: [], viewerTeamId: 'h1', round: 5, ...o });
const sec = (c, id) => c.sections.find((s) => s.id === id);
const variants = (make) => [0, 1, 2].map((r) => make(r)).sort();

// ---------- Åbningssætningen: resultat set fra seerens side ----------
test('"Din kamp": åbningen handler om seerens hold og seerens score – sejr, nederlag og uafgjort, som hjemme- og udehold', () => {
  const open = (viewer, hG, aG, round = 5) => buildColumn(inp({ matches: [M({ hG, aG })], viewerTeamId: viewer, round })).sections[0].paras[0];
  const all = (viewer, hG, aG) => variants((r) => open(viewer, hG, aG, r));
  assert.deepEqual(all('h1', 2, 1), ['Sejr til Hjem: 2-1 over Ude.', 'Hjem tog de tre point mod Ude (2-1).', '2-1 – Hjem slog Ude.'].sort());
  assert.deepEqual(all('a1', 1, 2), ['Sejr til Ude: 2-1 over Hjem.', 'Ude tog de tre point mod Hjem (2-1).', '2-1 – Ude slog Hjem.'].sort(), 'udehold: seerens mål først');
  // v3.16.3 (Spilfører): "Nederlag til Hjem: 2-0 mod Ude" → "Ude slog Hjem 2-0." – vinderen og vinderens score først
  assert.deepEqual(all('h1', 0, 2), ['Ude slog Hjem 2-0.', 'Ude var for stærke for Hjem – 2-0.', 'Hjem tabte 2-0 til Ude.'].sort());
  assert.deepEqual(all('a1', 2, 0), ['Hjem slog Ude 2-0.', 'Hjem var for stærke for Ude – 2-0.', 'Ude tabte 2-0 til Hjem.'].sort());
  assert.deepEqual(all('h1', 1, 1), ['Hjem og Ude delte point efter 1-1.', 'Uafgjort 1-1 mellem Hjem og Ude.', 'Et point hver: Hjem – Ude 1-1.'].sort());
  assert.deepEqual(all('a1', 3, 3), ['Ude og Hjem delte point efter 3-3.', 'Uafgjort 3-3 mellem Ude og Hjem.', 'Et point hver: Ude – Hjem 3-3.'].sort());
  // Valget pr. runde og hold er bogstaveligt (hold-id og runde indgår): samme runde → samme tekst, men to hold og to runder vælger hver sit
  assert.deepEqual([open('h1', 2, 1, 9), open('a1', 1, 2, 9), open('h1', 2, 1, 10)], ['Hjem tog de tre point mod Ude (2-1).', 'Sejr til Ude: 2-1 over Hjem.', '2-1 – Hjem slog Ude.']);
});

test('"Din kamp": en seer uden kamp i runden får ingen "Din kamp" – og et tomt spil giver overskriften "Runden"', () => {
  const m = M({ h: 'x1', a: 'y1', hn: 'X', an: 'Y', hG: 1, aG: 0 });
  const c = buildColumn(inp({ matches: [m], viewerTeamId: 'zzz' }));
  assert.deepEqual(c.sections.map((s) => s.id), ['col-others']);
  assert.equal(c.title, headlineOf(publicFacts(m, 0), 5));
  assert.equal(buildColumn(inp({ matches: [], viewerTeamId: 'zzz' })).title, 'Runden');
  assert.deepEqual(buildColumn(inp({ matches: [] })).sections, []);
});

// ---------- Drama ----------
const open1 = (ev, hG, aG, viewer = 'h1', pool) => buildColumn(inp({ matches: [M({ hG, aG, ev, pool })], viewerTeamId: viewer })).sections[0].paras.slice(1);
test('drama: sent sejrsmål fra minut 80 (ikke 79), og kun når det SIDSTE mål afgjorde en sejr med ét mål', () => {
  const win = (min, type = 'GOAL') => [[10, 'GOAL', true, 1, 0], [40, 'GOAL', false, 1, 1], [min, type, true, 2, 1], [85, 'SUB', true, 2, 1]];
  assert.deepEqual(open1(win(80), 2, 1), ['Sejrsmålet kom i 80. minut.'], 'præcis 80, og et skift efter målet er ikke "sidste mål"');
  assert.deepEqual(open1(win(79), 2, 1), []);
  assert.deepEqual(open1(win(89, 'HEADER_GOAL'), 2, 1), ['Sejrsmålet kom i 89. minut.']);
  assert.deepEqual(open1(win(88, 'VAR_GOAL'), 2, 1), ['Sejrsmålet kom i 88. minut.']);
  // To sene mål: det sidste tæller
  assert.deepEqual(open1([[82, 'GOAL', true, 1, 0], [85, 'GOAL', false, 1, 1], [88, 'GOAL', true, 2, 1]], 2, 1), ['Sejrsmålet kom i 88. minut.']);
  // Som udehold (seeren er ude): samme regler, set fra udeholdet
  assert.deepEqual(open1([[10, 'GOAL', false, 0, 1], [40, 'GOAL', true, 1, 1], [80, 'GOAL', false, 1, 2]], 1, 2, 'a1'), ['Sejrsmålet kom i 80. minut.']);
  assert.deepEqual(open1([[10, 'GOAL', false, 0, 1], [40, 'GOAL', true, 1, 1], [79, 'GOAL', false, 1, 2]], 1, 2, 'a1'), []);
  // En sejr med to mål, et pointdelende sent mål og et sent mål i en uafgjort kamp er ikke "sejrsmål"
  assert.deepEqual(open1([[10, 'GOAL', true, 1, 0], [85, 'GOAL', true, 2, 0]], 2, 0), []);
  assert.deepEqual(open1([[10, 'GOAL', true, 1, 0], [85, 'GOAL', false, 1, 1]], 1, 1), []);
  // Vagterne er hver for sig nødvendige – data der ikke passer sammen (annulleret mål) må ikke give et sejrsmål:
  const lateOnly = (...a) => open1(...a).filter((t) => /Sejrsmålet|gjorde ondt/.test(t));
  assert.deepEqual(lateOnly([[10, 'GOAL', true, 1, 0], [85, 'GOAL', false, 1, 2]], 2, 1), [], 'sidste mål viser modsat stilling: forkert vinder');
  assert.deepEqual(lateOnly([[10, 'GOAL', false, 0, 1], [85, 'GOAL', false, 2, 2]], 1, 2, 'a1'), [], 'sidste mål viser 2-2, men slutstillingen er en sejr: ikke ét-måls-afgørelse');
  assert.deepEqual(lateOnly([[10, 'GOAL', true, 1, 0], [85, 'GOAL', true, 2, 1]], 3, 1), [], 'slutstilling med to mål er ikke et ét-måls-sejrsmål');
  // Hver vagt for sig (uden at et comeback skjuler den): slutstillingen og det sidste måls stilling skal passe sammen
  assert.deepEqual(lateOnly([[10, 'GOAL', true, 1, 0], [85, 'GOAL', true, 2, 1]], 1, 2), [], 'sidste mål viser føring til hjemme, slutstilling udesejr: den (forkerte) vinder får ikke et sent mål');
  assert.deepEqual(lateOnly([[10, 'GOAL', true, 1, 0], [85, 'GOAL', true, 3, 1]], 2, 1), [], 'sidste mål viser 3-1 (to mål), slutstilling 2-1');
  assert.deepEqual(lateOnly([[85, 'GOAL', false, 0, 1]], 1, 1), [], 'slutstilling uafgjort (annulleret mål): intet sejrsmål');
  assert.deepEqual(lateOnly([[85, 'GOAL', true, 1, 0]], 0, 0), [], '0-0 slutstilling');
});
test('drama: nederlag på et sent mål ("Det gjorde ondt"), og comeback ("I kom bagfra") går forud for sent mål', () => {
  assert.deepEqual(open1([[20, 'GOAL', true, 1, 0], [50, 'GOAL', false, 1, 1], [88, 'GOAL', false, 1, 2]], 1, 2), ['Det gjorde ondt: Ude afgjorde det i 88. minut.']);
  assert.deepEqual(open1([[20, 'GOAL', true, 1, 0], [50, 'GOAL', false, 1, 1], [79, 'GOAL', false, 1, 2]], 1, 2), [], 'minut 79 er ikke sent');
  assert.deepEqual(open1([[20, 'GOAL', false, 0, 1], [50, 'GOAL', true, 1, 1], [89, 'GOAL', true, 2, 1]].slice(0, 2).concat([[89, 'GOAL', true, 2, 1]]), 2, 1), ['I kom bagfra – det siger noget om moralen.'], 'comeback + sent mål: kun comebacket');
  // comeback som hjemmehold og som udehold; ledelsen kan være sat af alle tre måltyper
  assert.deepEqual(open1([[10, 'GOAL', false, 0, 1], [50, 'GOAL', true, 1, 1], [60, 'GOAL', true, 2, 1]], 2, 1), ['I kom bagfra – det siger noget om moralen.']);
  assert.deepEqual(open1([[10, 'GOAL', true, 1, 0], [50, 'GOAL', false, 1, 1], [60, 'GOAL', false, 1, 2]], 1, 2, 'a1'), ['I kom bagfra – det siger noget om moralen.']);
  assert.deepEqual(open1([[10, 'HEADER_GOAL', false, 0, 1], [50, 'GOAL', true, 1, 1], [60, 'GOAL', true, 2, 1]], 2, 1), ['I kom bagfra – det siger noget om moralen.']);
  assert.deepEqual(open1([[10, 'VAR_GOAL', false, 0, 1], [50, 'GOAL', true, 1, 1], [60, 'GOAL', true, 2, 1]], 2, 1), ['I kom bagfra – det siger noget om moralen.']);
  // Aldrig bagud (kun uafgjort undervejs) og tabt-efter-føring er ikke comeback
  assert.deepEqual(open1([[10, 'GOAL', true, 1, 0], [50, 'GOAL', false, 1, 1], [60, 'GOAL', true, 2, 1]], 2, 1), []);
  assert.deepEqual(open1([[10, 'GOAL', false, 0, 1], [50, 'GOAL', true, 1, 1], [60, 'GOAL', false, 1, 2]], 1, 2), [], 'bagud, udlignet, bagud igen og tabt: ingen comeback for dig');
  assert.deepEqual(open1([[10, 'GOAL', false, 0, 1], [50, 'GOAL', true, 1, 1]], 1, 1), [], 'uafgjort efter at have været bagud er ikke et comeback (kun sejr)');
  assert.deepEqual(open1([[10, 'GOAL', false, 0, 1], [50, 'GOAL', true, 1, 1], [60, 'GOAL', true, 2, 1]], 2, 1, 'a1'), [], 'fra udeholdets side: tabt efter at have ført');
});

// ---------- Kampvurderingen (yourVerdict) ----------
const PH = (passingStyle, attackFocus = 'CENTRAL') => ({ phase1_buildUp: { passingStyle, attackFocus } });
const NUMS = { build: 0, buildWon: 0, press: 0, pressWon: 0, crosses: 0, crossesWon: 0, cutbacks: 0, cutbacksBlocked: 0, cutbackGoals: 0, counterGoalsAgainst: 0, runGoals: 0 };
// Rapport: slut-taktik SHORT og som standard samme start (QC F6: stilnavnet står kun, når stilen var den samme hele kampen), alle tal 0
const R = ({ startFormation = '4-4-2', endFormation = '4-4-2', endPhases = PH('SHORT'), startPhases = endPhases, ...n } = {}) =>
  ({ side: 'home', start: { formation: startFormation, phases: startPhases }, end: { formation: endFormation, phases: endPhases }, ...NUMS, ...n });
const verdict = (r, { hG = 1, aG = 1, pool = [], round = 5, ev = [] } = {}) =>
  buildColumn(inp({ matches: [M({ hG, aG, pool, ev, ownReports: r ? { h1: r } : undefined })], round })).sections[0].paras.slice(1);
const HC = (extra) => R({ endPhases: PH('SHORT', 'HIGH_CROSSES'), ...extra });
// Én regel ad gangen: [id, prioritet, rapport, målpulje, fire/ikke-fire tekst]
const RULES = [
  { id: 'build', prio: 3, p: { build: 20, buildWon: 13 } },
  { id: 'buildf', prio: 3, p: { build: 20, buildWon: 8 } },
  { id: 'hc', prio: 4, p: { endPhases: PH('SHORT', 'HIGH_CROSSES') }, pool: [['HEADER', 'Hjem']] },
  { id: 'hcmiss', prio: 2, p: { endPhases: PH('SHORT', 'HIGH_CROSSES'), crosses: 3, crossesWon: 1 } },
  { id: 'cbgoal', prio: 4, p: { cutbackGoals: 1 } },
  { id: 'cbblocked', prio: 2, p: { cutbacks: 5, cutbacksBlocked: 3 } },
  { id: 'counter', prio: 3, p: { counterGoalsAgainst: 1 } },
  { id: 'press', prio: 2, p: { press: 4, pressWon: 2 } },
  { id: 'run', prio: 3, p: { runGoals: 1 } },
  { id: 'form', prio: 2, p: { endFormation: '3-5-2' } },
];   // rækkefølgen er kildens push-rækkefølge (lige prioritet: først-skrevet først)
test('kampvurdering: hver regels tekst og tærskel (begge sider af grænsen), én regel ad gangen', () => {
  const only = (r, o) => verdict(r, o);
  // opbygning: mindst 4 forsøg og ≥ 65 % — 13/20 er præcis grænsen
  assert.deepEqual(variants((rd) => only(R({ build: 20, buildWon: 13 }), { round: rd })[0]), [
    'Din opbygning kom igennem 13 af 20 gange – de korte pasninger bar spillet.', '13 af 20 angreb kom forbi presset – de korte pasninger virkede.', 'Opbygningen sad: 13 af 20 gange kom I igennem.'].sort());
  assert.deepEqual(only(R({ build: 20, buildWon: 12 })), [], '12/20 = 60 %: hverken godt nok eller dårligt nok');
  assert.deepEqual(only(R({ build: 4, buildWon: 3 })).length, 1, 'fra 4 forsøg');
  assert.deepEqual(only(R({ build: 3, buildWon: 3 })), [], 'under 4 forsøg: intet');
  assert.deepEqual(variants((rd) => only(R({ build: 20, buildWon: 8 }), { round: rd })[0]), [
    'Din opbygning sad fast – kun 8 af 20 gange kom I igennem.', 'Kun 8 af 20 opbygninger kom forbi presset; de korte pasninger fandt ingen vej.', 'Modstanderens pres lukkede 12 af 20 opbygninger.'].sort());
  assert.deepEqual(only(R({ build: 20, buildWon: 9 })), [], '9/20 = 45 %: ikke dårligt nok');
  assert.deepEqual(only(R({ build: 4, buildWon: 0 })).length, 1, 'fra 4 forsøg (dårlig)');
  assert.deepEqual(only(R({ build: 3, buildWon: 0 })), []);
  // hovedstød: kun med høje indlæg som angrebsfokus, ental/flertal
  assert.deepEqual(only(HC(), { pool: [['HEADER', 'Hjem']] }), ['Et hovedstødsmål fra åbent spil: de høje indlæg betalte sig.']);
  assert.deepEqual(only(HC(), { pool: [['HEADER', 'Hjem'], ['HEADER', 'Hjem']] }), ['2 hovedstødsmål fra åbent spil: de høje indlæg betalte sig.']);
  assert.deepEqual(only(R(), { pool: [['HEADER', 'Hjem']] }), [], 'uden høje indlæg som fokus: ingen kausal sætning');
  assert.deepEqual(only(HC(), { pool: [['HEADER', 'Ude']] }), [], 'modstanderens hovedstød er ikke dit');
  assert.deepEqual(only(HC(), { pool: [['CORNER', 'Hjem']] }), [], 'dødbold er ikke åbent spil');
  assert.deepEqual(only(HC({ crosses: 3, crossesWon: 1 })), ['3 høje bolde i feltet, men intet hovedstødsmål – kun 1 luftduel blev vundet.']);   // ental (QC F5)
  assert.deepEqual(only(HC({ crosses: 7, crossesWon: 4 })), ['7 høje bolde i feltet, men intet hovedstødsmål – 4 luftdueller blev vundet.']);   // "kun" kun under halvdelen (QC F5)
  assert.deepEqual(only(HC({ crosses: 7, crossesWon: 3 })), ['7 høje bolde i feltet, men intet hovedstødsmål – kun 3 luftdueller blev vundet.']);
  assert.deepEqual(only(HC({ crosses: 2, crossesWon: 1 })), [], 'under 3 høje bolde');
  assert.deepEqual(only(R({ crosses: 5, crossesWon: 1 })), [], 'uden høje indlæg som fokus');
  assert.deepEqual(only(HC({ crosses: 5, crossesWon: 1 }), { pool: [['HEADER', 'Hjem']] }), ['Et hovedstødsmål fra åbent spil: de høje indlæg betalte sig.'], 'med hovedstød vælges den positive');
  // cutbacks
  assert.deepEqual(only(R({ cutbackGoals: 1 })), ['En cutback fra baglinjen endte i nettet.']);
  assert.deepEqual(only(R({ cutbackGoals: 2 })), ['2 cutbacks fra baglinjen endte i nettet.']);
  assert.deepEqual(only(R({ cutbacks: 5, cutbacksBlocked: 3 })), ['Kanten blev lukket: 3 af 5 cutback-forsøg stoppet.']);
  assert.deepEqual(only(R({ cutbacks: 3, cutbacksBlocked: 3 })), ['Kanten blev lukket: 3 af 3 cutback-forsøg stoppet.'], 'fra 3 forsøg');
  assert.deepEqual(only(R({ cutbacks: 2, cutbacksBlocked: 2 })), [], 'under 3 forsøg');
  assert.deepEqual(only(R({ cutbacks: 10, cutbacksBlocked: 5 })), [], '50 % er under 60 %');
  assert.deepEqual(only(R({ cutbacks: 10, cutbacksBlocked: 6 })).length, 1, '60 % er grænsen (≥)');
  // kontramål imod, pres, løb
  assert.deepEqual(only(R({ counterGoalsAgainst: 1 })), ['Det kostede: et kontramål imod.']);   // årsagen kun med belæg (QC F2)
  const MANY = { phase1_buildUp: { passingStyle: 'SHORT', attackFocus: 'CENTRAL', offBallRuns: 'MANY' } };
  assert.deepEqual(only(R({ counterGoalsAgainst: 1, endPhases: MANY })), ['Det kostede: et kontramål imod, da bolden blev tabt med mange spillere fremme.']);
  assert.deepEqual(only(R({ counterGoalsAgainst: 2, endPhases: MANY })), ['Det kostede: 2 kontramål imod, da bolden blev tabt med mange spillere fremme.']);
  assert.deepEqual(only(R({ press: 4, pressWon: 2 })), ['Dit pres vandt bolden 2 af 4 gange.']);
  assert.deepEqual(only(R({ press: 10, pressWon: 7 })), ['Dit pres vandt bolden 7 af 10 gange.']);
  assert.deepEqual(only(R({ press: 3, pressWon: 3 })), [], 'under 4 pres-dueller');
  assert.deepEqual(only(R({ press: 10, pressWon: 4 })), [], '40 % er under 50 %');
  assert.deepEqual(only(R({ runGoals: 1 })), ['Løbene uden bold gav et mål.']);
  assert.deepEqual(only(R({ runGoals: 3 })), ['Løbene uden bold gav 3 mål.']);
  // formationsskift: kun når begge formationer kendes og er forskellige; "holdt" kun ved sejr
  const sw = (end, start = '4-4-2') => R({ startFormation: start, endFormation: end });
  // Neutralt uanset udfald (QC F4) – samme sætning ved sejr og nederlag; fem formuleringer (v3.15.1: med tre gik én igen 4
  // gange på en sæson), alle med begge formationer og uden vurdering.
  const SW = /^(Skiftet fra 4-4-2 til 3-5-2 undervejs|I gik fra 4-4-2 til 3-5-2 i løbet af kampen|Formationen blev lagt om fra 4-4-2 til 3-5-2|Undervejs blev 4-4-2 til 3-5-2|Holdet sluttede i 3-5-2 efter at have startet i 4-4-2)\.$/;
  const t0 = only(sw('3-5-2'));
  assert.equal(t0.length, 1); assert.match(t0[0], SW);
  assert.deepEqual(only(sw('3-5-2'), { hG: 2, aG: 1 }), t0);
  assert.deepEqual(only(sw('3-5-2'), { hG: 0, aG: 1 }), t0);
  assert.deepEqual(only(sw('4-4-2')), [], 'samme formation');
  assert.deepEqual(only(sw(null)), [], 'slutformation mangler');
  assert.deepEqual(only(sw('3-5-2', null)), [], 'startformation mangler');
  assert.deepEqual(only(null), [], 'ingen rapport (gammelt gem eller bot)');
  assert.deepEqual(only(undefined), []);
});
test('kampvurdering: opbygningens stil står som SLUT-taktikken (ikke start), alle tre stilarter har deres ord, og ukendt/manglende stil falder tilbage', () => {
  const txt = (end, start = end, n = { build: 20, buildWon: 13 }) => [0, 1, 2].map((rd) => verdict(R({ ...n, startPhases: PH(start), endPhases: end === null ? {} : PH(end) }), { round: rd })[0]).join(' | ');
  assert.match(txt('SHORT'), /de korte pasninger bar spillet.*de korte pasninger virkede/);
  // QC F6: stil ændret undervejs → intet stilnavn (hverken start eller slut)
  assert.match(txt('SHORT', 'DIRECT_LONG'), /gange – opbygningen bar spillet\..*– opbygningen virkede\./);
  assert.doesNotMatch(txt('SHORT', 'DIRECT_LONG'), /lange bolde|korte pasninger/);
  assert.match(txt('BALANCED'), /den balancerede opbygning bar spillet.*den balancerede opbygning virkede/);
  assert.match(txt('DIRECT_LONG'), /de lange bolde bar spillet.*de lange bolde virkede/);
  assert.match(txt('UKENDT'), /gange – opbygningen bar spillet\..*– opbygningen virkede\./);
  assert.match(txt(null), /gange – opbygningen bar spillet\..*– opbygningen virkede\./);
  assert.doesNotMatch(txt(null), /undefined/);
  assert.match(txt('SHORT', 'SHORT', { build: 20, buildWon: 8 }), /de korte pasninger fandt ingen vej/);
  assert.match(txt('DIRECT_LONG', 'DIRECT_LONG', { build: 20, buildWon: 8 }), /Kun 8 af 20 opbygninger kom forbi presset; de lange bolde fandt ingen vej\./);
  assert.match(txt(null, 'SHORT', { build: 20, buildWon: 8 }), /presset; opbygningen fandt ingen vej\./);
  // regressionsstik på varianten i runde 7 (nøglen 'b' hhv. 'bf' indgår i valget)
  assert.deepEqual([verdict(R({ build: 20, buildWon: 13 }), { round: 7 })[0], verdict(R({ build: 20, buildWon: 8 }), { round: 7 })[0]],
    ['13 af 20 angreb kom forbi presset – de korte pasninger virkede.', 'Kun 8 af 20 opbygninger kom forbi presset; de korte pasninger fandt ingen vej.']);
});

// Prioritet og begrænsning: højst to sætninger, de to vigtigste (4 > 3 > 2), lige prioritet i kildens rækkefølge
const compatible = (ids) => !(ids.includes('build') && ids.includes('buildf')) && !(ids.includes('hc') && ids.includes('hcmiss'));
const combine = (ids) => {
  const rs = ids.map((id) => RULES.find((x) => x.id === id));
  return { r: R(Object.assign({}, ...rs.map((x) => x.p))), pool: rs.flatMap((x) => x.pool ?? []) };
};
test('kampvurdering: højst 2 sætninger, højeste prioritet først (4 > 3 > 2), lige prioritet i kildens rækkefølge – alle kombinationer af to og tre regler', () => {
  const ids = RULES.map((x) => x.id);
  const single = Object.fromEntries(ids.map((id) => { const c = combine([id]); const v = verdict(c.r, { pool: c.pool, round: 5 }); assert.equal(v.length, 1, `${id} alene giver én sætning: ${v}`); return [id, v[0]]; }));
  const prio = Object.fromEntries(RULES.map((x) => [x.id, x.prio]));
  let n = 0;
  const subsets = (k, from = 0, cur = []) => (cur.length === k ? [cur] : ids.slice(from).flatMap((id, i) => subsets(k, from + i + 1, [...cur, id])));
  for (const k of [2, 3, 4, 10]) for (const s of (k === 10 ? [ids] : subsets(k))) {
    if (!compatible(s)) continue;
    const c = combine(s);
    const expected = s.map((id, i) => ({ id, i })).sort((a, b) => prio[b.id] - prio[a.id] || a.i - b.i).slice(0, 2).map((x) => single[x.id]);
    assert.deepEqual(verdict(c.r, { pool: c.pool, round: 5 }), expected, s.join('+'));
    n++;
  }
  assert.ok(n > 100, `kombinationer ${n}`);
  // Alle regler på én gang (de, der kan sameksistere): det er stadig kun de to vigtigste
  const all = ids.filter((id) => id !== 'buildf' && id !== 'hcmiss');
  const c = combine(all);
  assert.deepEqual(verdict(c.r, { pool: c.pool, round: 5 }), [single.hc, single.cbgoal]);
});

// ---------- Seerens egen rapport — og kun den ----------
test('kun seerens egen kamprapport læses: to menneskehold i samme kamp får hver sin vurdering, og den andens rapport rører vi ikke', () => {
  const rep = { h1: R({ runGoals: 1 }), a1: R({ counterGoalsAgainst: 2 }) };
  const m = () => M({ hG: 1, aG: 1, ownReports: rep });
  const para = (viewer) => buildColumn(inp({ matches: [m()], viewerTeamId: viewer })).sections[0].paras.slice(1);
  assert.deepEqual(para('h1'), ['Løbene uden bold gav et mål.']);
  assert.deepEqual(para('a1'), ['Det kostede: 2 kontramål imod.']);   // årsagen kun med belæg (QC F2)
  // En bot-modstander (ingen rapport for dem) og en seer, hvis side mangler rapport (gammelt gem): ingen vurdering
  const only = (viewer, key) => buildColumn(inp({ matches: [M({ hG: 1, aG: 1, ownReports: { [key]: R({ runGoals: 1 }) } })], viewerTeamId: viewer })).sections[0].paras.slice(1);
  assert.deepEqual(only('a1', 'h1'), [], 'udeholdets seer får ikke hjemmeholdets rapport');
  assert.deepEqual(only('h1', 'a1'), [], 'hjemmeholdets seer får ikke udeholdets rapport');
  assert.deepEqual(only('a1', 'a1'), ['Løbene uden bold gav et mål.']);
  // Kanarie: den andens rapport kaster, når den røres
  for (const [viewer, other] of [['h1', 'a1'], ['a1', 'h1']]) {
    const mm = m(); const orig = mm.ownReports; mm.ownReports = { [viewer]: orig[viewer] };
    Object.defineProperty(mm.ownReports, other, { get() { throw new Error('KANARIE ' + other); }, enumerable: true });
    assert.doesNotThrow(() => buildColumn(inp({ matches: [mm], viewerTeamId: viewer })), viewer);
  }
  // Og rapporterne i de ANDRE kampe i runden (andre menneskehold) røres slet ikke – hverken nøgle for nøgle eller samlet
  const other = M({ h: 'x1', a: 'y1', hn: 'X', an: 'Y', hG: 2, aG: 0, ownReports: {} });
  for (const k of ['x1', 'y1']) Object.defineProperty(other.ownReports, k, { get() { throw new Error('KANARIE ' + k); }, enumerable: true });
  assert.doesNotThrow(() => buildColumn(inp({ matches: [m(), other], viewerTeamId: 'h1', gazette: null })));
  assert.deepEqual(buildColumn(inp({ matches: [m(), other], viewerTeamId: 'h1' })).sections[0], buildColumn(inp({ matches: [m()], viewerTeamId: 'h1' })).sections[0]);
});

// ---------- De øvrige kampe ----------
test('"De øvrige kampe": seerens egen kamp er ikke med, hver kamp har sit indeks, sin overskrift og sin ene sætning (comeback > sent mål > stil)', () => {
  const o = (idx, o2) => M({ h: `x${idx}`, a: `y${idx}`, hn: `H${idx}`, an: `U${idx}`, ...o2 });
  const matches = [
    o(0, { hG: 1, aG: 2, ev: [[10, 'GOAL', true, 1, 0], [40, 'GOAL', false, 1, 1], [60, 'GOAL', false, 1, 2]] }),   // udehold vender
    o(1, { hG: 2, aG: 1, ev: [[10, 'GOAL', true, 1, 0], [40, 'GOAL', false, 1, 1], [83, 'GOAL', true, 2, 1]] }),     // sent hjemmemål
    M({ hG: 1, aG: 0 }),                                                                                              // seerens kamp (indeks 2)
    o(3, { hG: 0, aG: 1, stats: { hPoss: 30, aPoss: 70 } }),                                                          // udesejr, vinderen har bolden
    o(4, { hG: 1, aG: 1, stats: { hPoss: 70, aPoss: 30 } }),                                                          // uafgjort: hjemmeholdet gættes
    o(5, { hG: 0, aG: 0, stats: { hPoss: 30, aPoss: 70 } }),                                                          // 0-0: hjemmeholdet har intet at sige
    o(6, { hG: 0, aG: 1, pool: [['HEADER', 'U6']], stats: { hPoss: 30, aPoss: 70 } }),                                // to regler: den første i tabellen (luft)
    o(7, { hG: 2, aG: 1, stats: { hPoss: 70, aPoss: 30 } }),                                                          // hjemmesejr uden at 'wait' passer
    o(8, { hG: 1, aG: 2, ev: [[10, 'GOAL', false, 0, 1], [20, 'GOAL', true, 1, 1], [85, 'GOAL', false, 1, 2]] }),                  // sent udemål uden at have været bagud
    o(9, { hG: 0, aG: 0 }),
    o(10, { hG: 1, aG: 2, ev: [[10, 'GOAL', true, 1, 0], [40, 'GOAL', false, 1, 1], [60, 'GOAL', false, 1, 2]] }),               // endnu et udehold-comeback (indeks 10)
  ];
  const c = buildColumn(inp({ matches, round: 5 }));
  const others = sec(c, 'col-others').others;
  assert.deepEqual(others.map((x) => x.idx), [0, 1, 3, 4, 5, 6, 7, 8, 9, 10], 'seerens kamp (indeks 2) er fravalgt, indeksene er kampens plads i runden');
  const by = Object.fromEntries(others.map((x) => [x.idx, x]));
  for (const x of others) assert.equal(x.head, headlineOf(publicFacts(matches[x.idx], x.idx), 5), `overskrift ${x.idx}`);
  assert.notEqual(by[3].head, headlineOf(publicFacts(matches[3], 3), 0), 'runden indgår i overskriften (runde 5 ≠ 0 for denne kamp)');
  assert.deepEqual(variants((r) => sec(buildColumn(inp({ matches, round: r })), 'col-others').others[0].note), ['U0 kom bagfra og vandt.', 'U0 vendte kampen.', 'Comeback til U0.'].sort());
  assert.deepEqual(variants((r) => sec(buildColumn(inp({ matches, round: r })), 'col-others').others[1].note), ['Afgjort i 83. minut.', 'H1 slog til sent – i 83. minut.', 'Sejrsmålet faldt i 83. minut.'].sort());
  const say = (rule, name, idx) => `${name} ${pickBy(STYLE_RULES.find((r) => r.key === rule).say, 5, rule, idx)}.`;
  assert.equal(by[3].note, say('ball', 'U3', 3), 'udesejr: vinderen (ude) beskrives');
  assert.equal(by[4].note, say('ball', 'H4', 4), 'uafgjort: hjemmeholdet beskrives');
  assert.equal(by[5].note, '', 'uafgjort: hjemmeholdet har intet at sige (udeholdets besiddelse tæller ikke)');
  assert.equal(by[6].note, say('air', 'U6', 6), 'to regler passer: den første i tabellen');
  assert.equal(by[7].note, say('ball', 'H7', 7));
  assert.match(by[8].note, /^(Afgjort i 85\. minut\.|U8 slog til sent – 85\. minut\.|Sejrsmålet faldt i 85\. minut\.)$/, 'udeholdet var aldrig bagud → sent mål, ikke comeback');
  // Bogstavelige pinde i runde 5: valget afhænger af skabelon-nøglen OG kampens indeks (indeks 0 og 10 vælger hver sin comeback-tekst, 1 sin sent-mål-tekst)
  assert.deepEqual([by[0].note, by[10].note, by[1].note], ['Comeback til U0.', 'U10 kom bagfra og vandt.', 'Afgjort i 83. minut.']);
  assert.deepEqual(c.sections.map((x) => x.title), ['Din kamp', 'De øvrige kampe'], 'afsnitstitlerne');
  // Bogstavelig pind: noten for kamp 3 i runde 5 (nøglen rule.key + indeks indgår i valget)
  assert.equal(by[3].note, 'U3 lod modstanderen løbe efter bolden.');
  // En runde uden andre kampe har ingen "De øvrige kampe"
  assert.deepEqual(buildColumn(inp({ matches: [M({ hG: 1, aG: 0 })] })).sections.map((s) => s.id), ['col-mine']);
});

// ---------- Overskriften: rundens største historie ----------
const NEUTRAL = (i) => M({ h: `n${i}`, a: `m${i}`, hn: `N${i}`, an: `M${i}`, hG: 1, aG: 0 });
const OTHER_CB = M({ h: 'c1', a: 'c2', hn: 'C1', an: 'C2', hG: 1, aG: 2, ev: [[10, 'GOAL', true, 1, 0], [40, 'GOAL', false, 1, 1], [60, 'GOAL', false, 1, 2]] });
const OTHER_LATE = M({ h: 'l1', a: 'l2', hn: 'L1', an: 'L2', hG: 2, aG: 1, ev: [[10, 'GOAL', true, 1, 0], [40, 'GOAL', false, 1, 1], [85, 'GOAL', true, 2, 1]] });
const UPSET = { upset: { winner: 'U1', loser: 'U2', winnerPos: 7, loserPos: 1, score: '2-1' } };
const MINE_CB = [[10, 'GOAL', false, 0, 1], [50, 'GOAL', true, 1, 1], [60, 'GOAL', true, 2, 1]];
const MINE_CB_BIG = [[10, 'GOAL', false, 0, 1], [20, 'GOAL', true, 1, 1], [30, 'GOAL', true, 2, 1], [40, 'GOAL', true, 3, 1], [50, 'GOAL', true, 4, 1]];
const FEATURES = [   // faldende nyhedsværdi: [navn, titel]
  ['upset', 'Overraskelse: U1 slog U2'], ['oc', 'C2 vendte kampen'], ['mc', 'Hjem kom tilbage mod Ude'], ['ol', 'Sent drama: L1 afgjorde det i 85. minut'], ['big', 'Hjem kørte over Ude'],
];
test('overskriften: den største historie vinder – overraskelse > andres comeback > dit comeback > sent drama > stor sejr (alle 32 kombinationer)', () => {
  let n = 0;
  for (let mask = 0; mask < 32; mask++) {
    const on = FEATURES.map((_, i) => !!(mask & (1 << i)));
    const [upset, oc, mc, ol, big] = on;
    const mine = big ? (mc ? M({ hG: 4, aG: 1, ev: MINE_CB_BIG }) : M({ hG: 4, aG: 0 })) : mc ? M({ hG: 2, aG: 1, ev: MINE_CB }) : M({ hG: 1, aG: 0 });
    const matches = [mine, oc ? OTHER_CB : NEUTRAL(1), ol ? OTHER_LATE : NEUTRAL(2), NEUTRAL(3)];
    const c = buildColumn(inp({ matches, gazette: upset ? UPSET : { totalGoals: 1 }, round: 5 }));
    const first = FEATURES.find((_, i) => on[i]);
    const expected = first ? first[1] : headlineOf(publicFacts(mine, 0), 5);
    assert.equal(c.title, expected, `kombination ${FEATURES.filter((_, i) => on[i]).map((x) => x[0]).join('+') || 'ingen'}`);
    n++;
  }
  assert.equal(n, 32);
});
test('overskriften: sejrsserie brudt (≥ 3 sejre før kampen, ikke sejr nu) er en historie — under de fire øvrige, over ingenting; 2 sejre eller en sejr nu udløser den ikke', () => {
  const hist = (wins, last) => [...Array.from({ length: wins }, (_, i) => ({ round: i + 1, results: [{ h: 'h1', a: 'x', hG: 1, aG: 0 }] })), { round: wins + 1, results: [{ h: 'h1', a: 'a1', hG: last[0], aG: last[1] }] }];
  const t = (wins, last, extra = {}) => buildColumn(inp({ matches: [M({ hG: last[0], aG: last[1] }), ...(extra.ol ? [OTHER_LATE] : [])], gazette: extra.upset ? UPSET : null, history: hist(wins, last) })).title;
  const fallback = (hG, aG) => headlineOf(publicFacts(M({ hG, aG }), 0), 5);
  assert.equal(t(3, [0, 0]), 'Hjems sejrsstime er slut');
  assert.equal(t(4, [0, 1]), 'Hjems sejrsstime er slut');
  assert.equal(t(2, [0, 0]), fallback(0, 0), 'kun 2 sejre før');
  assert.equal(t(3, [1, 0]), fallback(1, 0), 'seriens fortsættelse er ikke "slut"');
  assert.equal(t(3, [0, 0], { ol: true }), 'Sent drama: L1 afgjorde det i 85. minut', 'sent drama (60) går forud for serie (50)');
  assert.equal(t(3, [0, 0], { upset: true }), 'Overraskelse: U1 slog U2');
  // Udehold
  const histA = [1, 2, 3].map((i) => ({ round: i, results: [{ h: 'x', a: 'a1', hG: 0, aG: 1 }] })).concat([{ round: 4, results: [{ h: 'h1', a: 'a1', hG: 2, aG: 1 }] }]);
  assert.equal(buildColumn(inp({ matches: [M({ hG: 2, aG: 1 })], viewerTeamId: 'a1', history: histA })).title, 'Udes sejrsstime er slut');
  // Stor sejr set fra udeholdet; 3 mål forskel er grænsen
  assert.equal(buildColumn(inp({ matches: [M({ hG: 0, aG: 3 })], viewerTeamId: 'a1' })).title, 'Ude kørte over Hjem');
  assert.equal(buildColumn(inp({ matches: [M({ hG: 0, aG: 2 })], viewerTeamId: 'a1' })).title, headlineOf(publicFacts(M({ hG: 0, aG: 2 }), 0), 5));
  assert.equal(buildColumn(inp({ matches: [M({ hG: 3, aG: 0 })] })).title, 'Hjem kørte over Ude');
  assert.equal(buildColumn(inp({ matches: [M({ hG: 3, aG: 1 })] })).title, headlineOf(publicFacts(M({ hG: 3, aG: 1 }), 0), 5), '2 mål forskel er ikke "kørte over"');
  assert.equal(buildColumn(inp({ matches: [M({ hG: 0, aG: 3 })] })).title, headlineOf(publicFacts(M({ hG: 0, aG: 3 }), 0), 5), 'tabt 0-3 er ikke en sejr');
});

// ---------- Røde kort i "Din kamp" (v3.16.3, Spilfører: klummen nævnte aldrig en udvisning) ----------
// Offentlige fakta (hReds/aReds – referatet viser udvisningen). Begge hold, dit først; ingen linje uden rødt kort.
// Dit holds linje følger resultatet (QC v3.16.3: "kostede" lovede en årsag, også efter en sejr): sejr "til trods", nederlag
// en af to varianter (pickBy på runden), uafgjort "holdt point". Modstanderens linje: kun "fik rødt kort undervejs" – ingen
// påstand om, hvor længe de spillede med færre (før: "Ude fik rødt kort og spillede med 10 mand.").
test('"Din kamp": røde kort for begge hold – dit holds linje efter resultatet (sejr/nederlag/uafgjort, 1 eller 2 kort), modstanderens "fik rødt kort undervejs"; seerens side vender; ingen linje uden rødt', () => {
  const reds = (hR, aR, { viewer = 'h1', round = 5, hG = 1, aG = 1 } = {}) => buildColumn(inp({ matches: [M({ hG, aG, stats: { hPoss: 50, aPoss: 50, hReds: hR, aReds: aR } })], viewerTeamId: viewer, round }))
    .sections[0].paras.slice(1).filter((t) => /rødt|røde|udvis/.test(t));
  const both = (hR, aR, o) => [0, 1].map((round) => reds(hR, aR, { ...o, round })).map((x) => x.join(' | ')).sort();
  assert.deepEqual(reds(0, 0), [], 'ingen røde kort → ingen linje');
  assert.deepEqual(reds(0, 0, { hG: 2, aG: 0 }), []); assert.deepEqual(reds(0, 0, { hG: 0, aG: 2 }), []);
  // Sejr: "til trods" – samme tekst i alle runder
  assert.deepEqual(both(1, 0, { hG: 2, aG: 1 }), ['Et rødt kort til trods: Hjem vandt med 10 mand.', 'Et rødt kort til trods: Hjem vandt med 10 mand.']);
  assert.deepEqual(reds(2, 0, { hG: 2, aG: 1 }), ['2 røde kort til trods: Hjem vandt med 9 mand.']);
  // Nederlag: de to varianter (runde 0 og 1 vælger hver sin)
  assert.deepEqual(both(1, 0, { hG: 0, aG: 1 }), ['Et rødt kort kostede: Hjem måtte spille med 10 mand.', 'Med 10 mand efter udvisningen blev det op ad bakke.'].sort());
  assert.deepEqual(both(2, 0, { hG: 0, aG: 1 }), ['2 røde kort kostede: Hjem måtte spille med 9 mand.', 'Med 9 mand efter udvisningerne blev det op ad bakke.'].sort());
  // Uafgjort: "holdt point" – ingen "kostede" og ingen "op ad bakke"
  assert.deepEqual(both(1, 0), ['Hjem holdt point med 10 mand efter udvisningen.', 'Hjem holdt point med 10 mand efter udvisningen.']);
  assert.deepEqual(reds(2, 0), ['Hjem holdt point med 9 mand efter udvisningerne.']);
  for (const [hG, aG] of [[2, 1], [1, 1]]) for (const r of [0, 1, 2, 3]) assert.doesNotMatch(reds(1, 0, { hG, aG, round: r }).join(' '), /kostede|op ad bakke/, `${hG}-${aG}: ingen nederlagstekst`);
  // Modstanderen: ental/flertal, uanset resultat – aldrig "spillede med" eller "mistede"
  for (const [hG, aG] of [[1, 1], [2, 1], [0, 1]]) {
    assert.deepEqual(both(0, 1, { hG, aG }), ['Ude fik rødt kort undervejs.', 'Ude fik rødt kort undervejs.']);
    assert.deepEqual(reds(0, 2, { hG, aG }), ['Ude fik 2 røde kort undervejs.']);
  }
  // Seeren er udeholdet: aReds er "dine", hReds modstanderens (ude vinder 2-1 → "til trods"; ude taber 1-0 → "kostede"/"op ad bakke")
  assert.deepEqual(reds(0, 1, { viewer: 'a1', hG: 1, aG: 2 }), ['Et rødt kort til trods: Ude vandt med 10 mand.']);
  assert.deepEqual(both(0, 1, { viewer: 'a1', hG: 1, aG: 0 }), ['Et rødt kort kostede: Ude måtte spille med 10 mand.', 'Med 10 mand efter udvisningen blev det op ad bakke.'].sort());
  assert.deepEqual(reds(1, 0, { viewer: 'a1' }), ['Hjem fik rødt kort undervejs.']);
  // Begge hold: to linjer, dit hold først
  assert.deepEqual(reds(1, 1), ['Hjem holdt point med 10 mand efter udvisningen.', 'Ude fik rødt kort undervejs.']);
});
test('"Din kamp": de røde kort står EFTER dommen over dit hold (Spilfører v3.16.3: "… mistede en mand på rødt kort. Det kostede: et kontramål imod." læstes som årsag)', () => {
  const paras = (hR, aR) => buildColumn(inp({ matches: [M({ hG: 0, aG: 1, stats: { hPoss: 50, aPoss: 50, hReds: hR, aReds: aR }, ownReports: { h1: R({ counterGoalsAgainst: 1 }) } })], round: 5 })).sections[0].paras;
  const p = paras(1, 1);
  const iv = p.findIndex((t) => t.startsWith('Det kostede: et kontramål imod'));
  const im = p.findIndex((t) => /Hjem måtte spille med 10 mand|Med 10 mand efter udvisningen/.test(t)), io = p.indexOf('Ude fik rødt kort undervejs.');
  assert.ok(iv > 0 && im > 0 && io > 0, `data: dom, dit kort og modstanderens kort står alle (${JSON.stringify(p)})`);
  assert.ok(iv < im && im < io, `rækkefølge: dom (${iv}) < dit kort (${im}) < modstanderens (${io})`);
  assert.equal(io, p.length - 1, 'modstanderens kort er afsnittets sidste linje');
  // Uden kort står dommen alene – samme dom
  assert.equal(paras(0, 0).at(-1), p[iv]);
});
test('"De øvrige kampe": ved uafgjort ingen "ventede"-regel (wait forklarer en sejr) – en sejr med samme tal får den', () => {
  const waitRule = STYLE_RULES.find((r) => r.key === 'wait');
  const other = (hG, aG) => buildColumn(inp({ matches: [M({ h: 'x1', a: 'y1', hn: 'X', an: 'Y', hG, aG, stats: { hPoss: 30, aPoss: 70, hShots: 2, aShots: 3 } })], viewerTeamId: 'zzz' }))
    .sections.find((s) => s.id === 'col-others').others[0].note;
  // Data: X har 30 % af bolden og scorer – wait-reglens test er sand for X i begge kampe
  assert.ok(waitRule.test({ poss: 30, goals: 1 }));
  const win = other(1, 0);
  assert.ok(waitRule.say.some((t) => win === `X ${t}.`), `sejr: X forklares med wait-reglen (${win})`);
  const draw = other(1, 1);
  assert.ok(!waitRule.say.some((t) => draw.includes(t)), `uafgjort: ingen wait-tekst – ${draw}`);
  assert.equal(draw, '', 'X har ingen anden regel end wait → ingen note');
});
