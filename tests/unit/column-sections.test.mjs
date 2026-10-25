// v3.14 Test Manager: klummens afsnit 3 (rundens spiller), 4 (formen) og 5 (næste runde + optakt-scouting og
// opfølgning) på HÅNDBYGGEDE input. column.test.mjs tæller kun, at afsnittene findes i en simuleret sæson.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildColumn, pickBy, STYLE_RULES } from '../../public/engine/column.js';
import { parseSave } from '../../public/state/storage.js';

const M = ({ h = 'h1', a = 'a1', hn = 'Hjem', an = 'Ude', hG = 0, aG = 0, ratings, stats } = {}) =>
  ({ homeId: h, awayId: a, homeName: hn, awayName: an, homeGoals: hG, awayGoals: aG, events: [], goalsPool: [], ratings, stats });
const inp = (o) => ({ matches: [], gazette: null, history: [], table: [], next: [], viewerTeamId: 'h1', round: 5, ...o });
const sec = (c, id) => c.sections.find((s) => s.id === id);
const RULE = (key) => STYLE_RULES.find((r) => r.key === key);

// ---------- Afsnit 3: rundens spiller og mål ----------
const RT = (o) => ({ playerId: 'x', shirtNumber: 1, shortName: 'X', teamId: 'a1', teamName: 'Ude', goals: 0, assists: 0, saves: 0, aerialWins: 0, stars: 3, isMotM: false, ...o });
const stars = (gz, ratings) => sec(buildColumn(inp({ matches: [M({ ratings })], gazette: gz })), 'col-stars');
const GZ = (o) => ({ playerOfTheRound: { playerId: 'p1', teamId: 'a1' }, goalOfTheRound: null, defensiveAction: null, ...o });
test('afsnit 3: begrundelsen bygges af spillerens offentlige handlinger, i rækkefølgen mål, oplæg, redninger, luftdueller (fra 3)', () => {
  const R = (o) => ({ home: [RT({ playerId: 'decoy', teamId: 'a1', goals: 9, assists: 9, saves: 9, aerialWins: 9 })], away: [RT({ playerId: 'p1', ...o })] });
  const why = (o, gz = GZ()) => stars(gz, R(o)).player.why;
  assert.equal(why({ goals: 2, assists: 1, saves: 4, aerialWins: 3 }), 'Begrundelse: 2 mål, 1 oplæg, 4 redninger, 3 vundne luftdueller.', 'den rigtige spiller (ikke den første på samme hold), hvert tal på sin plads');
  assert.equal(why({ goals: 1 }), 'Begrundelse: 1 mål.');
  assert.equal(why({ assists: 2 }), 'Begrundelse: 2 oplæg.');
  assert.equal(why({ saves: 5 }), 'Begrundelse: 5 redninger.');
  assert.equal(why({ aerialWins: 3 }), 'Begrundelse: 3 vundne luftdueller.');
  assert.equal(why({ aerialWins: 2, goals: 1 }), 'Begrundelse: 1 mål.', '2 vundne luftdueller er ikke nok');
  assert.equal(why({ aerialWins: 7 }), 'Begrundelse: 7 vundne luftdueller.');
  assert.equal(why({}), 'Begrundelse: stabil hele kampen.');
  assert.equal(why({ aerialWins: 2 }), 'Begrundelse: stabil hele kampen.');
  assert.equal(stars(GZ({ playerOfTheRound: { playerId: 'ukendt', teamId: 'a1' } }), R({ goals: 3 })).player.why, 'Begrundelse: stabil hele kampen.', 'spilleren findes ikke i kampene');
  assert.equal(stars(GZ(), { home: [], away: [] }).player.why, 'Begrundelse: stabil hele kampen.');
  // Begrundelsen læser kun de offentlige felter (ingen karakter): selv med en rating på linjen står den ikke i teksten
  assert.doesNotMatch(why({ goals: 1, rating: 9.9, distanceKm: 12.3 }), /9\.9|12/);
});
test('afsnit 3: formen på afsnittet – spiller (hold-id fra gazetten), mål og defensiv aktion udelukker hinanden', () => {
  const rt = { home: [], away: [RT({ playerId: 'p1', goals: 1 })] };
  assert.deepEqual(stars(GZ(), rt), { id: 'col-stars', title: 'Rundens spiller og mål', player: { playerId: 'p1', teamId: 'a1', why: 'Begrundelse: 1 mål.' }, goal: null, defensive: null });
  assert.equal(stars(GZ({ playerOfTheRound: { playerId: 'p1', teamId: 'h9' } }), rt).player.teamId, 'h9', 'holdet er gazettens, ikke seerens');
  assert.deepEqual([stars(GZ({ goalOfTheRound: { kind: 'GOAL' }, defensiveAction: { x: 1 } }), rt).goal, stars(GZ({ goalOfTheRound: { kind: 'GOAL' }, defensiveAction: { x: 1 } }), rt).defensive], [true, null], 'mål forud for defensiv aktion');
  assert.deepEqual([stars(GZ({ defensiveAction: { x: 1 } }), rt).goal, stars(GZ({ defensiveAction: { x: 1 } }), rt).defensive], [null, true]);
  assert.deepEqual([stars(GZ(), rt).goal, stars(GZ(), rt).defensive], [null, null]);
  assert.equal(stars(GZ({ playerOfTheRound: null }), rt).player, null, 'ingen rundens spiller');
  assert.equal(sec(buildColumn(inp({ matches: [M()], gazette: null })), 'col-stars'), undefined, 'uden gazette ingen afsnit 3');
});

// ---------- Afsnit 4: formen ----------
const T = (id, name, points) => ({ teamId: id, teamName: name, points });
const res = (h, a, hG, aG) => ({ h, a, hG, aG });
const HIST = (...rounds) => rounds.map((results, i) => ({ round: i + 1, results }));
const form = (o) => sec(buildColumn(inp({ matches: [M({ h: 'z1', a: 'z2' })], viewerTeamId: 'nobody', ...o })), 'col-form')?.paras;
const NAMES = [T('D', 'Dd', 12), T('A', 'Aa', 9), T('E', 'Ee', 1), T('F', 'Ff', 1), T('B', 'Bb', 0), T('C', 'Cc', 0)];
test('afsnit 4: sejrs- og tabsserier (≥ 3 i træk, den længste vælges), tælles fra slutningen og for både hjemme- og udehold', () => {
  const R1 = [res('A', 'B', 2, 0), res('C', 'D', 0, 1)], R2 = [res('B', 'A', 0, 3), res('D', 'C', 2, 0)], R3 = [res('A', 'B', 1, 0), res('C', 'D', 0, 2)], R4 = [res('D', 'C', 3, 0)];
  const hot = (round) => [`Dd har vundet 4 i træk.`, `4 sejre i træk til Dd.`, `Dd er i flyvende form: 4 sejre i træk.`].sort();
  const cold = [`Cc har tabt 4 i træk.`, `Krise hos Cc: 4 nederlag i træk.`, `Cc kan ikke finde vejen: 4 nederlag i træk.`].sort();
  const at = (round, hist) => form({ round, table: NAMES, history: hist });
  const four = HIST(R1, R2, R3, R4);
  // Dd (4 sejre, hjemme og ude) går forud for Aa (3); Cc (4 nederlag) forud for Bb (3)
  assert.deepEqual([0, 1, 2].map((r) => at(r, four)[0]).sort(), hot());
  assert.deepEqual([0, 1, 2].map((r) => at(r, four)[1]).sort(), cold);
  assert.equal(at(5, four).length, 3, 'serier + toppen (historik ≥ 2 og tabel)');
  // Efter tre runder: Aa har præcis 3 sejre HELE sæsonen igennem (første kamp tæller med), Bb præcis 3 nederlag; lige lange serier: den første i rækkefølgen
  const three = HIST(R1, R2, R3);
  assert.deepEqual([0, 1, 2].map((r) => at(r, three)[0]).sort(), [`Aa har vundet 3 i træk.`, `3 sejre i træk til Aa.`, `Aa er i flyvende form: 3 sejre i træk.`].sort());
  assert.deepEqual([0, 1, 2].map((r) => at(r, three)[1]).sort(), [`Bb har tabt 3 i træk.`, `Krise hos Bb: 3 nederlag i træk.`, `Bb kan ikke finde vejen: 3 nederlag i træk.`].sort());
  // To sejre/nederlag er ingen serie
  assert.deepEqual(at(5, HIST(R1, R2)), ['Dd fører med 12 point, 3 foran Aa.'], 'kun toppen; ingen serier ved 2 i træk');
  // Pinde på varianten i runde 5 (nøglen 'hot'/'cold' + holdet indgår)
  assert.deepEqual([at(5, four)[0], at(5, four)[1]], ['Dd har vundet 4 i træk.', 'Cc kan ikke finde vejen: 4 nederlag i træk.']);
  // Ukendt hold i tabellen giver tom tekst, aldrig "undefined"
  assert.doesNotMatch(form({ table: [T('A', 'Aa', 1)], history: four }).join(' '), /undefined/);
});
test('afsnit 4: uafgjort bryder en serie – hjemme som ude (en uafgjort er hverken sejr eller nederlag)', () => {
  // E spiller hjemme, F ude, mod nye modstandere hver gang (så ingen anden får en serie)
  const w = (r) => [res('E', `e${r}`, r, 0), res(`f${r}`, 'F', 0, r)];
  const l = (r) => [res('E', `e${r}`, 0, r), res(`f${r}`, 'F', r, 0)];
  const series = (hist) => form({ table: NAMES, history: hist }).filter((t) => /i træk/.test(t)).length;
  assert.equal(series(HIST(w(1), w(2), w(3), [res('E', 'F', 1, 1)])), 0, 'E og F: tre sejre og så uafgjort (hjemme for E, ude for F)');
  assert.equal(series(HIST(w(1), w(2), w(3), w(4))), 1, 'kontrol: med fire sejre er der en serie (én sætning ad gangen)');
  assert.equal(series(HIST(l(1), l(2), l(3), [res('E', 'F', 2, 2)])), 0, 'tre nederlag og så uafgjort');
  assert.equal(series(HIST(l(1), l(2), l(3), l(4))), 1, 'kontrol: fire nederlag');
  assert.equal(series(HIST(w(1), w(2), [res('E', 'F', 1, 1)], w(3))), 0, 'sejre, uafgjort, sejr: serien er 1');
});
test('afsnit 4: toppen kræver tabel og mindst 2 runder; uafgjort i toppen og enlig leder har hver sin tekst; overraskelsen står først', () => {
  const H2 = HIST([], []), H1 = HIST([]);
  assert.deepEqual(form({ table: [T('A', 'Aa', 7), T('B', 'Bb', 5)], history: H2 }), ['Aa fører med 7 point, 2 foran Bb.']);
  assert.deepEqual(form({ table: [T('A', 'Aa', 7), T('B', 'Bb', 7)], history: H2 }), ['Aa og Bb står lige i toppen med 7 point.']);
  assert.deepEqual(form({ table: [T('A', 'Aa', 7), T('B', 'Bb', 6)], history: H2 }), ['Aa fører med 7 point, 1 foran Bb.'], '1 point er ikke lige');
  assert.deepEqual(form({ table: [T('A', 'Aa', 7)], history: H2 }), ['Aa fører med 7 point.'], 'enlig leder: ingen "foran"');
  assert.equal(form({ table: [T('A', 'Aa', 7), T('B', 'Bb', 5)], history: H1 }), undefined, 'kun én runde: ingen top (og dermed intet afsnit)');
  assert.equal(form({ table: [T('A', 'Aa', 7), T('B', 'Bb', 5)], history: [] }), undefined);
  assert.equal(form({ table: [], history: H2 }), undefined, 'uden tabel');
  const up = { upset: { winner: 'U1', loser: 'U2', winnerPos: 7, loserPos: 1, score: '2-1' } };
  assert.deepEqual(form({ gazette: up, table: [T('A', 'Aa', 7), T('B', 'Bb', 5)], history: H2 }), ['Rundens overraskelse: nr. 7 U1 slog nr. 1 U2 2-1.', 'Aa fører med 7 point, 2 foran Bb.']);
  assert.deepEqual(form({ gazette: up, table: [], history: [] }), ['Rundens overraskelse: nr. 7 U1 slog nr. 1 U2 2-1.'], 'overraskelsen alene i en runde 1');
  const c = buildColumn(inp({ matches: [M()], gazette: { upset: null } }));
  assert.equal(sec(c, 'col-form'), undefined, 'intet at sige → intet afsnit');
  const secs = buildColumn(inp({ matches: [M(), M({ h: 'o1', a: 'o2' })], gazette: up, table: [T('A', 'Aa', 7)], history: H2 })).sections.map((s) => s.id);
  assert.deepEqual(secs, ['col-mine', 'col-others', 'col-stars', 'col-form'], 'afsnittene i rækkefølge (col-next kun med et program)');
});

// ---------- Afsnit 5: næste runde og scouting ----------
const F = (o = {}) => ({ poss: 50, shots: 0, onTarget: 0, corners: 0, aerialWon: 0, counterGoals: 0, setPieceGoals: 0, headerGoals: 0, yellows: 0, reorganised: 0, goals: 0, against: 0, ...o });
const H = (id, rows, results = []) => rows.map((o, i) => ({ round: i + 1, results, facts: { [id]: F(o) } }));
const NX = (home, away) => ({ homeId: home, homeName: home === 'h1' ? 'Hjem' : 'Opp2', awayId: away, awayName: away === 'h1' ? 'Hjem' : 'Opp2' });
const next = (o) => sec(buildColumn(inp({ matches: [M({ h: 'z1', a: 'z2' })], viewerTeamId: 'h1', ...o })), 'col-next')?.paras;
test('afsnit 5: næste modstander (hjemme/ude, seriens tilføjelse fra 2 i træk) og "Ny sæson"', () => {
  const nxh = [NX('h1', 'o2')], nxa = [NX('o2', 'h1')];
  assert.deepEqual(next({ next: nxh }), ['Næste runde: Opp2 kommer på besøg.']);
  assert.deepEqual(next({ next: nxa }), ['Næste runde: ude mod Opp2.']);
  assert.deepEqual(next({ next: nxa, newSeason: true }), ['Ny sæson: ude mod Opp2.']);
  assert.deepEqual(next({ next: [NX('q1', 'q2'), ...nxh] }), ['Næste runde: Opp2 kommer på besøg.'], 'programmet søges efter seerens kamp');
  assert.equal(next({ next: [NX('q1', 'q2')] }), undefined, 'seeren spiller ikke i næste runde: intet afsnit');
  assert.equal(next({ next: [] }), undefined);
  // Modstanderens serie: kun hans egen (ikke seerens) og kun fra 2 i træk
  const wins = (n) => HIST(...Array.from({ length: n }, () => [res('o2', 'x', 1, 0)]));
  const losses = (n) => HIST(...Array.from({ length: n }, () => [res('x', 'o2', 1, 0)]));
  assert.deepEqual(next({ next: nxh, history: wins(1) }), ['Næste runde: Opp2 kommer på besøg.']);
  assert.deepEqual(next({ next: nxh, history: wins(2) }), ['Næste runde: Opp2 kommer på besøg. De har vundet 2 i træk.']);
  assert.deepEqual(next({ next: nxh, history: wins(3) }), ['Næste runde: Opp2 kommer på besøg. De har vundet 3 i træk.']);
  assert.deepEqual(next({ next: nxh, history: losses(1) }), ['Næste runde: Opp2 kommer på besøg.']);
  assert.deepEqual(next({ next: nxh, history: losses(2) }), ['Næste runde: Opp2 kommer på besøg. De har tabt 2 i træk.']);
  assert.deepEqual(next({ next: nxh, history: losses(4) }), ['Næste runde: Opp2 kommer på besøg. De har tabt 4 i træk.']);
  const mine = HIST(...Array.from({ length: 3 }, () => [res('h1', 'x', 1, 0)]));
  assert.deepEqual(next({ next: nxh, history: mine }), ['Næste runde: Opp2 kommer på besøg.'], 'seerens egen serie nævnes ikke som modstanderens');
});
test('afsnit 5: optakt-scouting – modstanderens seneste 3 offentlige kampe, gennemsnit pr. kamp, første regel i tabellen, ental/flertal, ikke i en ny sæson', () => {
  const bud = (rows, o = {}) => (next({ next: [NX('h1', 'o2')], history: H('o2', rows), ...o }) ?? [])[1];
  const say = (rule, round = 5) => pickBy(RULE(rule).say, round, rule, 'scout');
  // v3.16.3 (Spilfører): "… havde bolden det meste af tiden i deres seneste 3 kampe" læstes som en påstand om kampene – nu "ud fra"
  const text = (rule, n, round = 5) => `Mit bud ud fra ${n === 1 ? 'deres seneste kamp' : `deres seneste ${n} kampe`}: Opp2 ${say(rule, round)} – det kan blive kampens tema.`;   // v3.16.7: "ud fra" først
  assert.doesNotMatch(bud([{ poss: 60 }, { poss: 60 }]), / i deres seneste/, 'ikke "i deres seneste"');
  // Gennemsnittet af de TRE seneste (ikke de fire, ikke de to, ikke kun den sidste, ikke summen): 75, 60, 40 → 58,3 ≥ 58 = "ball"
  assert.equal(bud([{ poss: 0 }, { poss: 75 }, { poss: 60 }, { poss: 40 }]), text('ball', 3));
  assert.equal(bud([{ poss: 99 }, { poss: 60 }, { poss: 40 }]), text('ball', 3), '3 kampe: 99 er med');
  assert.equal(bud([{ poss: 60 }, { poss: 56 }]), text('ball', 2), 'ental/flertal: 2 kampe, snit 58');
  assert.equal(bud([{ poss: 60 }]), text('ball', 1), '1 kamp: "deres seneste kamp"');
  assert.equal(bud([{ poss: 0 }, { poss: 57 }, { poss: 57 }, { poss: 57 }]), undefined, 'snit 57 af de tre seneste: ingen regel');
  assert.equal(bud([{ shots: 5 }, { shots: 5 }, { shots: 5 }]), undefined, 'summen (15) er ikke gennemsnittet (5)');
  assert.equal(bud([{ shots: 0 }, { shots: 0 }, { shots: 12 }]), undefined, 'kun den sidste (12) er ikke gennemsnittet (4)');
  assert.equal(bud([{ shots: 12 }, { shots: 12 }, { shots: 12 }]), text('shots', 3));
  assert.equal(bud([{ shots: 11 }, { shots: 12 }, { shots: 13 }]), text('shots', 3), 'snit 12 er grænsen (≥)');
  assert.equal(bud([{ shots: 11 }, { shots: 12 }, { shots: 12 }]), undefined, 'snit 11,67');
  // Næste-runde-buddet bygger på ALLE hans kampe til og med den netop spillede runde 5 (ikke kun til runde 4)
  assert.equal(bud([{ poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 0 }]), undefined, 'runde 5 (poss 0) er med: snit (60+60+0)/3 = 40');
  assert.equal(bud([{ poss: 0 }, { poss: 0 }, { poss: 60 }, { poss: 60 }, { poss: 60 }]), text('ball', 3), 'de tre seneste er runde 3-5');
  // Kampe uden facts for hans hold springes over (gamle gem); kun runder med hans tal tæller
  const mixed = [...H('o2', [{ poss: 60 }]), { round: 2, results: [] }, ...H('o2', [{}, { poss: 60 }]).slice(1).map((r) => ({ ...r, round: 3 })), ...H('q', [{ poss: 1 }, { poss: 1 }, { poss: 1 }]).map((r, i) => ({ ...r, round: 4 + i }))];
  assert.equal((next({ next: [NX('h1', 'o2')], history: mixed }) ?? [])[1], text('ball', 2).replace(say('ball'), say('ball')), 'runder uden hans facts tæller ikke med');
  // Hver afrundingsgrænse for de fire "mål-regler": snit ≥ 0,5 per kamp tæller som "ja"
  const flag = (key, ruleKey) => {
    const rows = (...v) => v.map((x) => ({ [key]: x }));
    return [bud(rows(1, 0)), bud(rows(1, 0, 0)), bud(rows(1, 1, 0)), bud(rows(0, 0)), bud(rows(2, 0, 0)), bud(rows(1, 0, 1, 0))].map((t) => t === text(ruleKey, t?.includes('3 kampe') ? 3 : t?.includes('4 kampe') ? 4 : 2));
  };
  assert.deepEqual(flag('headerGoals', 'air'), [true, false, true, false, true, false]);
  assert.deepEqual(flag('counterGoals', 'break'), [true, false, true, false, true, false]);
  assert.deepEqual(flag('setPieceGoals', 'dead'), [true, false, true, false, true, false]);
  assert.deepEqual(flag('reorganised', 'switch'), [true, false, true, false, true, false]);
  // "wait" kræver lav besiddelse OG snit ≥ 1 mål pr. kamp
  const w = (...g) => bud(g.map((x) => ({ poss: 40, goals: x })));
  assert.equal(w(1, 1), text('wait', 2)); assert.equal(w(2, 0), text('wait', 2), 'snit 1,0'); assert.equal(w(1, 0), undefined, 'snit 0,5 er ikke ét mål'); assert.equal(w(1, 1, 0), undefined, 'snit 0,67'); assert.equal(w(0, 0), undefined);
  // hjørner og besiddelse bruges som gennemsnit (ikke afrundet til ja/nej)
  assert.equal(bud([{ corners: 7 }, { corners: 7 }]), text('air', 2)); assert.equal(bud([{ corners: 6 }, { corners: 7 }]), undefined);
  // Første regel i tabellen (air før ball)
  assert.equal(bud([{ headerGoals: 1, poss: 70 }, { headerGoals: 1, poss: 70 }]), text('air', 2));
  // Optaktens variant følger runden (round, ikke round − 1)
  assert.notEqual(say('ball', 5), say('ball', 4));
  // Ny sæson: ingen bud (Ny sæson-linjen står, men den gamle sæsons stil er ikke et bud)
  assert.deepEqual(next({ next: [NX('h1', 'o2')], history: H('o2', [{ poss: 60 }, { poss: 60 }]), newSeason: true }), ['Ny sæson: Opp2 kommer på besøg.']);
  assert.deepEqual(next({ next: [NX('h1', 'o2')], history: H('o2', [{ poss: 60 }, { poss: 60 }]) }).length, 2);
  // Bud om HANS hold (ikke seerens): seerens egne facts i historikken gør ingen forskel
  const both = H('o2', [{ poss: 60 }, { poss: 60 }]).map((r) => ({ ...r, facts: { ...r.facts, h1: F({ shots: 40 }) } }));
  assert.equal(next({ next: [NX('h1', 'o2')], history: both })[1], text('ball', 2));
  assert.equal(next({ next: [NX('o2', 'h1')], history: both })[1], text('ball', 2), 'også når han er hjemmehold i programmet');
});
test('afsnit 5: opfølgning – "Før kampen skrev jeg …" bruger historikken FØR runden og sammenligner med modstanderens tal i den spillede kamp', () => {
  const opp = 'a1';
  const fu = (rows, played, o = {}) => {
    const m = M({ hG: 1, aG: 1, stats: played });
    return (sec(buildColumn(inp({ matches: [m], history: H(opp, rows), round: 5, ...o })), 'col-next')?.paras ?? []).find((t) => t.startsWith('Før kampen')) ?? null;
  };
  const say = (rule, round) => pickBy(RULE(rule).say, round, rule, 'scout');
  const held = `Før kampen skrev jeg, at Ude ${say('ball', 4)} – det holdt også mod jer.`;
  const notHeld = `Før kampen skrev jeg, at Ude ${say('ball', 4)} – det gjorde de ikke mod jer.`;
  assert.notEqual(say('ball', 4), say('ball', 5), 'forudsætning: runde 4 og 5 vælger forskellig variant');
  const P60 = { hPoss: 40, aPoss: 60 }, P30 = { hPoss: 70, aPoss: 30 };
  // runderne 2-4 (+ runde 5, den spillede): bud "ball"; ude holdt 60 % i kampen → holdt; ude holdt 30 % → holdt ikke
  assert.equal(fu([{ poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 60 }], P60), held);
  assert.equal(fu([{ poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 30 }], P30), notHeld, 'runde 5 (selve kampen) indgår IKKE i buddet, og vurderingen er mod modstanderen, ikke seeren (som havde 70 %)');
  // Buddet bygger på runder til og med 4: er runde 4 elendig (0 %), er der ingen regel (snit 40) – og dermed ingen opfølgning
  assert.equal(fu([{ poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 0 }, { poss: 60 }], P60), null);
  // ... og kun de tre seneste: runde 1 (0 %) tæller ikke med
  assert.equal(fu([{ poss: 0 }, { poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 60 }], P60), held);
  // Ingen historik / ingen facts for ham: ingen opfølgning
  assert.equal(fu([], P60), null);
  assert.equal(fu([{ poss: 60 }], P60, { round: 1 }), null, 'runde 1: intet før runden');
  // Opfølgningen står FØR næste-runde-linjen
  const withNext = sec(buildColumn(inp({ matches: [M({ hG: 1, aG: 1, stats: P60 })], history: H(opp, [{ poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 60 }]), next: [NX('h1', 'o2')] })), 'col-next').paras;
  assert.equal(withNext[0], held); assert.match(withNext[1], /^Næste runde: /);
  // Udeholdets seer: modstanderen er hjemmeholdet
  const mAway = M({ hG: 1, aG: 1, stats: { hPoss: 60, aPoss: 40 } });
  const rowsH = H('h1', [{ poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 60 }, { poss: 60 }]);
  const t = (sec(buildColumn(inp({ matches: [mAway], viewerTeamId: 'a1', history: rowsH, round: 5 })), 'col-next')?.paras ?? [])[0];
  assert.equal(t, `Før kampen skrev jeg, at Hjem ${say('ball', 4)} – det holdt også mod jer.`);
});
// v3.16.3 (Spilfører): "wait" er to-delt (lidt af bolden OG scorede). Holdt den ikke, men de scorede, er det besiddelsen, der
// ikke holdt – og det siges. Kun for "wait": en anden regel, der ikke holdt, får "det gjorde de ikke", også når de scorede.
test('afsnit 5: opfølgning på spådommens to dele ("wait") – scorede de, men havde halvdelen af bolden eller mere: "de scorede igen, men de havde N % af bolden mod jer"', () => {
  const fu = (rows, hG, aG, played) => (sec(buildColumn(inp({ matches: [M({ hG, aG, stats: played })], history: H('a1', rows), round: 5 })), 'col-next')?.paras ?? []).find((t) => t.startsWith('Før kampen')) ?? null;
  const W = Array.from({ length: 5 }, () => ({ poss: 40, goals: 1 }));
  const s = pickBy(RULE('wait').say, 4, 'wait', 'scout'), pre = `Før kampen skrev jeg, at Ude ${s} – `;
  assert.equal(fu(W, 0, 1, { hPoss: 60, aPoss: 40 }), `${pre}det holdt også mod jer.`, 'begge dele holdt (40 %, 1 mål)');
  // v3.16.7 (Spilfører: "havde mere af bolden" ved 47 %): procenten står; under 50 % holdt den, fra 50 % ikke
  assert.equal(fu(W, 1, 1, { hPoss: 40, aPoss: 60 }), `${pre}de scorede igen, men de havde 60 % af bolden mod jer.`, '60 % og 1 mål: besiddelsen holdt ikke');
  assert.equal(fu(W, 0, 2, { hPoss: 40, aPoss: 60 }), `${pre}de scorede igen, men de havde 60 % af bolden mod jer.`, '2 mål tæller også');
  assert.equal(fu(W, 1, 1, { hPoss: 53, aPoss: 47 }), `${pre}det holdt også mod jer: de scorede med 47 % af bolden.`, '47 % er under halvdelen: det holdt (før: "mere af bolden")');
  assert.equal(fu(W, 1, 1, { hPoss: 50, aPoss: 50 }), `${pre}de scorede igen, men de havde 50 % af bolden mod jer.`, '50 % er ikke under halvdelen');
  assert.equal(fu(W, 1, 0, { hPoss: 70, aPoss: 30 }), `${pre}det gjorde de ikke mod jer.`, '30 %, men ingen mål: "scorede igen" ville være forkert');
  assert.equal(fu(W, 1, 0, { hPoss: 40, aPoss: 60 }), `${pre}det gjorde de ikke mod jer.`, 'hverken lidt bold eller mål');
  // En anden regel ("ball"), der ikke holdt, mens de scorede: ingen "scorede igen"
  const B = Array.from({ length: 5 }, () => ({ poss: 60 }));
  assert.equal(fu(B, 1, 1, { hPoss: 70, aPoss: 30 }), `Før kampen skrev jeg, at Ude ${pickBy(RULE('ball').say, 4, 'ball', 'scout')} – det gjorde de ikke mod jer.`);
});

test('gem fra v3.10.1 (historik UDEN results og facts): klummen bygges af det migrerede gem uden fejl, og formen/optakten har intet at bygge på', () => {
  const text = fs.readFileSync(new URL('../fixtures/save-v3.10.1.json', import.meta.url), 'utf8');
  const raw = JSON.parse(text).league;
  assert.ok(raw.history.length >= 3 && raw.history.every((r) => r.results === undefined && r.facts === undefined), 'forudsætning: gamle historikposter uden results/facts');
  const parsed = parseSave(text);
  assert.ok(parsed.ok, parsed.error);
  for (const L of [raw, parsed.state.league]) {
    const me = L.teams.find((t) => !t.isBot);
    const c = buildColumn({ matches: L.lastRound.matches, gazette: L.lastRound.gazette, history: L.history, table: [], next: [{ homeId: me.id, homeName: me.name, awayId: L.teams.find((t) => t.isBot).id, awayName: 'Modstander' }], viewerTeamId: me.id, round: L.lastRound.round });
    assert.equal(c.sections[0].id, 'col-mine');
    assert.equal(sec(c, 'col-form'), undefined, 'ingen serier og ingen top uden resultater/tabel');
    assert.deepEqual(sec(c, 'col-next').paras, ['Næste runde: Modstander kommer på besøg.'], 'ingen bud og ingen opfølgning uden facts');
    assert.doesNotMatch(JSON.stringify(c), /undefined|NaN|null,/);
  }
});

test('alle fem afsnit i rækkefølge med deres id og titel (en omdøbt eller ombyttet overskrift ses)', () => {
  const m = [M({ hG: 1, aG: 0, ratings: { home: [], away: [] } }), M({ h: 'o1', a: 'o2', hn: 'O1', an: 'O2', hG: 0, aG: 0 })];
  const c = buildColumn(inp({ matches: m, gazette: { playerOfTheRound: null, goalOfTheRound: null, defensiveAction: null, upset: { winner: 'U1', loser: 'U2', winnerPos: 7, loserPos: 1, score: '2-1' } }, history: HIST([], []), table: [T('A', 'Aa', 4)], next: [NX('h1', 'o2')] }));
  assert.deepEqual(c.sections.map((x) => [x.id, x.title]), [['col-mine', 'Din kamp'], ['col-others', 'De øvrige kampe'], ['col-stars', 'Rundens spiller og mål'], ['col-form', 'Formen'], ['col-next', 'Næste runde']]);
});
