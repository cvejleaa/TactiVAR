// v3.21.2 Test Manager: huller fundet ved mutation af 1bb0d97 (udeholdets comeback-grænse, "rejste sig" (v3.21.2: før "hentede 0-2") kun uafgjort, sent point-grænsen 80,
// dit sene point/0-2 mod de andres comeback, kamp-overskrifternes spredning mellem kampe, "wait"/"dead" i spejderen, opfølgningen efter et nederlag).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildColumn, pickBy, STYLE_RULES, SCOUT_TAIL, headlineOf } from '../../public/engine/column.js';

const M = ({ h = 'h1', a = 'a1', hn = 'Hjem', an = 'Ude', hG = 0, aG = 0, ev = [], stats } = {}) => ({
  homeId: h, awayId: a, homeName: hn, awayName: an, homeGoals: hG, awayGoals: aG, stats,
  events: ev.map(([min, type, isHome, eh, ea, plus]) => ({ min, type, isHome, hG: eh, aG: ea, text: 'T', label: 'L', ...(plus != null ? { clock: { m: min, plus } } : {}) })),
  goalsPool: [],
});
const inp = (o) => ({ matches: [], gazette: null, history: [], table: [], next: [], viewerTeamId: 'h1', round: 5, ...o });
const G = (min, home, hG, aG, plus) => [min, 'GOAL', home, hG, aG, plus];
const title = (mine, ...others) => buildColumn(inp({ matches: [mine, ...others] })).title;
const minePars = (mine) => buildColumn(inp({ matches: [mine] })).sections[0].paras;
const note = (other) => buildColumn(inp({ matches: [M({ hG: 1, aG: 0 }), other] })).sections.find((s) => s.id === 'col-others').others[0].note;
const OC = (ev, hG, aG) => M({ h: 'x', a: 'y', hn: 'X', an: 'Y', hG, aG, ev });

test('comeback for UDEHOLDET: sejr med præcis 2 er et comeback, 3+ er en storsejr (home-grenen alene bevist før; `-diff <= 2` kunne blive `diff <= 2`)', () => {
  const isCb = (ev, hG, aG) => /bagfra|vendte|Comeback/.test(note(OC(ev, hG, aG)));
  const away2 = [G(3, true, 1, 0), G(10, true, 2, 0), G(20, false, 2, 1), G(30, false, 2, 2), G(40, false, 2, 3), G(50, false, 2, 4)];   // 0-2 bagud → 2-4 ude
  assert.equal(isCb(away2, 2, 4), true, 'ude vinder 4-2 efter 0-2: sejr med 2');
  assert.equal(isCb([...away2, G(55, false, 2, 5)], 2, 5), false, 'ude vinder 5-2 efter 0-2: sejr med 3 er storsejren');
  assert.equal(isCb([G(3, true, 1, 0), G(46, false, 1, 1), G(60, false, 1, 2), G(70, false, 1, 3), G(80, false, 1, 4)], 1, 4), false, 'ude 4-1 efter pausen-udligning: sejr med 3');
  // hjemmeholdet: præcis 2 tæller også
  assert.equal(isCb([G(3, false, 0, 1), G(10, false, 0, 2), G(20, true, 1, 2), G(30, true, 2, 2), G(40, true, 3, 2), G(50, true, 4, 2)], 4, 2), true, 'hjemme 4-2 efter 0-2');
});

test('"rejste sig" (fra 0-2) er KUN en uafgjort: et nederlag eller en storsejr efter 0-2 påstår ikke et point (fightback uden diff === 0 gav "hentede et point" om et 1-3-nederlag)', () => {
  const lost = M({ hG: 1, aG: 3, ev: [G(10, false, 0, 1), G(20, false, 0, 2), G(50, true, 1, 2), G(70, false, 1, 3)] });
  assert.doesNotMatch(title(lost), /rejste sig|tilbage|vendte|Comeback/);
  assert.ok(!minePars(lost).some((t) => /hentede et point/.test(t)), minePars(lost).join(' | '));
  const big = M({ hG: 5, aG: 2, ev: [G(10, false, 0, 1), G(20, false, 0, 2), G(30, true, 1, 2), G(40, true, 2, 2), G(50, true, 3, 2), G(60, true, 4, 2), G(70, true, 5, 2)] });
  assert.equal(title(big), 'Hjem kørte over Ude');
  assert.ok(!minePars(big).some((t) => /hentede et point/.test(t)), minePars(big).join(' | '));
  // uafgjort efter 0-2 er stadig "rejste sig" (positiv kontrol, så ovenstående ikke bare er en tom gren)
  assert.equal(title(M({ hG: 2, aG: 2, ev: [G(10, false, 0, 1), G(20, false, 0, 2), G(50, true, 1, 2), G(70, true, 2, 2)] })), 'Hjem rejste sig mod Ude');
});

test('sent point: udligningen tæller fra 80. minut (79 gør ikke; 90+3 gør)', () => {
  const lv = (min, plus) => M({ hG: 1, aG: 1, ev: [G(30, false, 0, 1), G(min, true, 1, 1, plus)] });
  assert.doesNotMatch(title(lv(79)), /Sent point/);
  assert.equal(title(lv(80)), 'Sent point: Hjem udlignede i 80. minut');
  assert.match(title(lv(90, 3)), /^Sent point: Hjem udlignede /);
  assert.ok(minePars(lv(80)).includes('Udligningen kom i 80. minut.') && !minePars(lv(79)).some((t) => /Udligningen kom/.test(t)));
});

test('overskriften: dit sene point og din "rejste sig" slår de andres comeback (vægt 76/77 mod 70 – ledningen, ikke kun talrækken)', () => {
  const otherCb = OC([G(3, true, 1, 0), G(60, false, 1, 1), G(70, false, 1, 2)], 1, 2);
  assert.equal(title(M({ hG: 1, aG: 1, ev: [G(30, false, 0, 1), G(88, true, 1, 1)] }), otherCb), 'Sent point: Hjem udlignede i 88. minut');
  assert.equal(title(M({ hG: 2, aG: 2, ev: [G(10, false, 0, 1), G(20, false, 0, 2), G(50, true, 1, 2), G(70, true, 2, 2)] }), otherCb), 'Hjem rejste sig mod Ude');
  assert.equal(title(M({ hG: 1, aG: 1 }), otherCb), 'Y vendte kampen', 'uden din historie: de andres');
});

test('kamp-overskrifterne spredes MELLEM kampe i samme runde (hjemmeholdets navn og scoren indgår i valget – før én formel)', () => {
  const F = (h, hG, a, aG) => ({ home: { goals: hG, name: h }, away: { goals: aG, name: a } });
  const names = 'ABCDEFGHIJKL'.split('');
  const byName = new Set(names.map((n) => headlineOf(F(n, 1, 'Z', 0), 5).replace(n, 'N')));
  assert.ok(byName.size >= 4, `samme score og runde, 12 hjemmeholds navne: ${byName.size} forskellige skabeloner (uden navnet: 1)`);
  const byScore = new Set([[1, 0], [2, 1], [0, 1], [1, 2], [2, 0], [0, 2], [1, 1], [3, 3]].map(([h, a]) => headlineOf(F('A', h, 'B', a), 5).replace(/\d-\d/, 'S').replace(/[AB]/g, 'X')));
  assert.ok(byScore.size >= 4, `samme navn og runde, otte scorer: ${byScore.size}`);
});

test('spejderen: "wait" (snit af mål ≥ snit af indkasserede) og "dead" (halvdelen af målene) – grænserne', () => {
  const F = (o = {}) => ({ poss: 50, shots: 0, onTarget: 0, corners: 0, aerialWon: 0, counterGoals: 0, setPieceGoals: 0, headerGoals: 0, yellows: 0, reorganised: 0, goals: 0, against: 0, ...o });
  const nx = [{ homeId: 'h1', homeName: 'Hjem', awayId: 'o2', awayName: 'Opp2' }];
  const bud = (rows) => buildColumn(inp({ matches: [M({ hG: 1, aG: 0 })], next: nx, round: 5, history: rows.map((o, i) => ({ round: i + 1, results: [], facts: { o2: F(o) } })) }))
    .sections.find((s) => s.id === 'col-next').paras[1];
  const text = (key) => `Mit bud ud fra deres seneste 2 kampe: Opp2 ${pickBy(STYLE_RULES.find((r) => r.key === key).say, 5, key, 'scout')} – ${pickBy(SCOUT_TAIL, 5, 'tail', 'o2')}.`;
  const two = (o) => [o, o];
  assert.equal(bud(two({ poss: 40, goals: 2, against: 2 })), text('wait'), 'lige mange mål for og imod: de tabte ikke');
  assert.equal(bud(two({ poss: 40, goals: 3, against: 2 })), text('wait'), 'sejr i snit (3-2)');
  assert.equal(bud(two({ poss: 40, goals: 1, against: 1 })), text('wait'));
  assert.equal(bud(two({ poss: 40, goals: 2, against: 3 })), undefined, 'tabte i snit (2-3): ingen "scorede alligevel"');
  assert.equal(bud(two({ poss: 40, goals: 1, against: 2 })), undefined);
  assert.equal(bud([{ poss: 40, goals: 3, against: 0 }, { poss: 40, goals: 0, against: 3 }]), text('wait'), 'snit 1,5-1,5');
  // dødbolde: præcis halvdelen af målene tæller (1 af 2), snit ≥ 1
  assert.equal(bud(two({ setPieceGoals: 1, goals: 2 })), text('dead'), '1 af 2 mål pr. kamp = halvdelen');
  assert.equal(bud(two({ setPieceGoals: 2, goals: 4 })), text('dead'), '2 af 4');
  assert.equal(bud(two({ setPieceGoals: 1, goals: 3 })), undefined, '1 af 3 er under halvdelen');
});

test('SCOUT_TAIL: de fem haler er bundet (listen kan ikke skrumpe til to uden at en test bliver rød)', () => {
  assert.deepEqual([...SCOUT_TAIL], ['det kan blive kampens tema', 'det skal I være klar på', 'hold øje med det', 'det skal I have en plan for', 'det kan I ikke se bort fra']);
});
