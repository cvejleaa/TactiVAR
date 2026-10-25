// v3.16.5 (tekster – kampene uændrede, se fingerprint.test.mjs): VAR-bekræftet rødt kort siger det, Hvis-Så-skift med færre
// mand siger "med ti mand", og klummen siger, når titlen er afgjort før tid, og at rundens spiller er kampens spiller.
// (Redningen efter opspillet: engine-branches.test.mjs, "løber → skud fra kanten".) Hver test har data (vagter på antal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { buildColumn } from '../../public/engine/column.js';
import { roundsLeftOf } from '../../public/engine/schedule.js';

const play = (s, setup = () => {}) => {
  const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
  setup(me, opp);
  return s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
};
const NOTE = '📺 VAR: det røde kort står.';

test('VAR tjekker det røde kort: står det, siger udvisningen det – bliver det gult, eller var der intet tjek, gør den ikke', () => {
  let confirmed = 0, downgraded = 0, upgraded = 0, plain = 0;
  for (let s = 1; s <= 700; s++) {   // v3.17.0: 400 → 700 (datavagten)
    const ev = play(s).events;
    ev.forEach((e, i) => {
      if (e.type === 'VAR_RED' && e.var?.kind === 'RED') {
        const next = ev.slice(i + 1).find((x) => x.min === e.min && (x.type === 'RED' || x.type === 'VAR_NO_RED'));
        if (e.var.verdict === 'CONFIRMED') { confirmed++; assert.equal(next?.type, 'RED'); assert.ok(next.text.endsWith(` mand. ${NOTE}`), next.text); }
        else if (e.var.verdict === 'DOWNGRADED') { downgraded++; assert.equal(next?.type, 'VAR_NO_RED'); }
        else { upgraded++; assert.equal(next?.type, 'RED'); assert.ok(!next.text.includes('VAR'), `opgraderet: kendelsen stod allerede – ${next.text}`); }
      }
      if (e.type === 'RED' && !(ev[i - 1]?.type === 'VAR_RED' && ev[i - 1].var?.verdict === 'CONFIRMED')) {
        plain++; assert.ok(!e.text.includes('VAR'), e.text);
      }
    });
  }
  assert.ok(confirmed >= 5 && downgraded >= 3 && upgraded >= 1 && plain >= 20, `data: ${confirmed} bekræftet, ${downgraded} nedgraderet, ${upgraded} opgraderet, ${plain} uden tjek`);
});

// Begge grene af reglen: ny formation og en af holdets egne planer (Plan B) – hver med færre og fuldt hold.
const shiftCase = (rule, RX) => {
  let short = 0, full = 0;
  for (let s = 1; s <= 400 && short < 5; s++) {
    const ev = play(s, (me) => { me.tactics.conditionalRules = [{ ruleId: 1, condition: 'ANY', minuteTrigger: 72, margin: 1, slotRemapping: null, ...rule }]; }).events;
    const t = ev.find((e) => e.type === 'TRIGGER' && e.text.startsWith('📋'));
    if (!t) continue;
    const myName = t.text.match(/^📋 \[(.+) • Hvis-Så\]/)[1];
    const reds = ev.slice(0, ev.indexOf(t)).filter((e) => e.type === 'RED' && e.text.includes(`[${myName}]`)).length;   // RED = udvisningen (sendOff); VAR_RED er tjekket
    assert.match(t.text, RX);
    if (reds) { short++; assert.ok(t.text.endsWith(` med ${{ 1: 'ti', 2: 'ni', 3: 'otte' }[reds]} mand.`), `${reds} røde: ${t.text}`); }
    else { full++; assert.ok(!t.text.includes(' mand'), t.text); }
  }
  assert.ok(short >= 5 && full >= 50, `data: ${short} med færre mand, ${full} med fuldt hold`);
};
test('Hvis-Så-formationsskift med færre mand: "… til 4-3-3 med ti mand." – med fuldt hold intet tal', () => {
  shiftCase({ action: 'FORMATION', newFormation: '4-3-3', newPlan: null }, /^📋 \[.+ • Hvis-Så\] Holdet skifter fra .+ til 4-3-3( med (ti|ni|otte) mand)?\.$/);
});
test('Hvis-Så-planskift med færre mand: "… til Plan B (4-4-2, … / …) med ti mand." – med fuldt hold intet tal', () => {
  shiftCase({ action: 'FORMATION', newFormation: '4-4-2', newPlan: 1 }, /^📋 \[.+ • Hvis-Så\] Holdet skifter fra .+ til Plan B \(.+ \/ .+\)( med (ti|ni|otte) mand)?\.$/);
});

// ---------- Klummen ----------
const T = (id, name, points) => ({ teamId: id, teamName: name, points });
const res = (h, a, hG, aG) => ({ h, a, hG, aG });
const M = { homeId: 'z1', awayId: 'z2', homeName: 'Z1', awayName: 'Z2', homeGoals: 0, awayGoals: 0, events: [], goalsPool: [] };
const col = (o) => buildColumn({ matches: [M], gazette: null, history: [], table: [], next: [], viewerTeamId: 'nobody', round: 12, ...o });
const paras = (c) => c.sections.find((s) => s.id === 'col-form')?.paras ?? [];
const HIST = (last) => [{ round: 1, results: [] }, { round: 2, results: last }];

test('klummen: mester før tid kun, når forspringet er STØRRE end 3 point pr. resterende runde (lige = målforskel kan stadig flytte)', () => {
  // 2 runder tilbage: 7 > 6 → afgjort; 6 = 6 → ikke (to sejre til nr. 2 giver lige point)
  const at = (gap, roundsLeft) => paras(col({ table: [T('A', 'Aa', 30), T('B', 'Bb', 30 - gap)], history: HIST([]), roundsLeft }))[0];
  assert.equal(at(7, 2), '🏆 Aa er mester – 2 runder før tid (7 point foran Bb).');
  assert.equal(at(6, 2), 'Aa fører med 30 point, 6 foran Bb.');
  assert.equal(at(4, 1), '🏆 Aa er mester – én runde før tid (4 point foran Bb).');
  assert.equal(at(3, 1), 'Aa fører med 30 point, 3 foran Bb.');
  assert.equal(at(40, 0), 'Aa fører med 30 point, 40 foran Bb.', 'ingen runder tilbage, men ikke sæsonslut: ikke "før tid"');
  assert.equal(at(7, null), 'Aa fører med 30 point, 7 foran Bb.', 'uden programmet (roundsLeft) intet gæt');
  assert.ok(!paras(col({ table: [T('A', 'Aa', 30), T('B', 'Bb', 20)], history: HIST([]), roundsLeft: 2, newSeason: true, champion: { teamName: 'Aa', points: 30 } })).some((t) => t.includes('før tid')), 'sæsonslut: ikke "før tid" (mesteren står i banneret – v3.16.7)');
});

test('klummen: "mester før tid" er overskrift kun i runden, titlen blev afgjort – ikke resten af sæsonen', () => {
  const title = (last, table) => col({ table, history: HIST(last), roundsLeft: 2 }).title;
  // A 30, B 23 nu (7 > 6). Før runden: A vandt (27), B tabte (23) → 4 ≤ 9: afgjort NU
  assert.equal(title([res('A', 'C', 1, 0), res('D', 'B', 2, 0)], [T('A', 'Aa', 30), T('B', 'Bb', 23), T('C', 'Cc', 0), T('D', 'Dd', 0)]), 'Aa er mester før tid');
  // Før runden: A 30 (tabte), B 20 (vandt) → 10 > 9: afgjort allerede – ingen overskrift igen
  assert.notEqual(title([res('C', 'A', 1, 0), res('B', 'D', 2, 0)], [T('A', 'Aa', 30), T('B', 'Bb', 23), T('C', 'Cc', 3), T('D', 'Dd', 0)]), 'Aa er mester før tid');
  // Før runden var nr. 3 tættest: A 27, C 21 (tabte nu), B 20 → 6 ≤ 9: afgjort NU (alle forfølgere tæller, ikke kun nr. 2)
  assert.equal(title([res('A', 'D', 3, 0), res('B', 'C', 3, 0)], [T('A', 'Aa', 30), T('B', 'Bb', 23), T('C', 'Cc', 21), T('D', 'Dd', 0)]), 'Aa er mester før tid');
});

test('klummen: grænsen for "afgjort allerede" er forspring > 3·(resterende + 1) FØR runden – og pointene før regnes for hjemme/ude, sejr/uafgjort', () => {
  // roundsLeft 2 → før runden var der 3 tilbage: grænse 9. Tabellen sorteret; C og D er fyld.
  const title = (last, table) => col({ table, history: HIST(last), roundsLeft: 2 }).title;
  const MEST = 'Aa er mester før tid';
  // A vandt hjemme (27 før), B tabte ude (18 før): 9 → afgjort NU
  assert.equal(title([res('A', 'C', 1, 0), res('D', 'B', 1, 0)], [T('A', 'Aa', 30), T('B', 'Bb', 18), T('D', 'Dd', 3), T('C', 'Cc', 0)]), MEST, 'før-forspring præcis 9');
  // B 17 før: 10 → afgjort allerede
  assert.notEqual(title([res('A', 'C', 1, 0), res('D', 'B', 1, 0)], [T('A', 'Aa', 30), T('B', 'Bb', 17), T('D', 'Dd', 3), T('C', 'Cc', 0)]), MEST, 'før-forspring præcis 10');
  // B uafgjort hjemme (18 nu → 17 før): 27 − 17 = 10 → allerede (med 0 point for uafgjort: 9 → NU)
  assert.notEqual(title([res('A', 'C', 1, 0), res('B', 'D', 1, 1)], [T('A', 'Aa', 30), T('B', 'Bb', 18), T('D', 'Dd', 1), T('C', 'Cc', 0)]), MEST, 'hjemme uafgjort = 1 point');
  // A uafgjort ude (30 nu → 29 før), B tabte (20 før): 9 → NU (med 0 point: 10 → allerede)
  assert.equal(title([res('C', 'A', 1, 1), res('D', 'B', 1, 0)], [T('A', 'Aa', 30), T('B', 'Bb', 20), T('D', 'Dd', 3), T('C', 'Cc', 1)]), MEST, 'ude uafgjort = 1 point');
  // A vandt ude (27 før), B tabte (18 før): 9 → NU (med 0 point for udesejr: 12 → allerede)
  assert.equal(title([res('C', 'A', 0, 1), res('D', 'B', 1, 0)], [T('A', 'Aa', 30), T('B', 'Bb', 18), T('D', 'Dd', 3), T('C', 'Cc', 0)]), MEST, 'udesejr = 3 point');
  // Nr. 2 lå 10 bag før runden (B vandt: 22 → 19), men nr. 3 kun 8 (C tabte: 21) – A uafgjort ude (29 før): afgjort NU
  assert.equal(title([res('D', 'A', 1, 1), res('B', 'C', 3, 0)], [T('A', 'Aa', 30), T('B', 'Bb', 22), T('C', 'Cc', 21), T('D', 'Dd', 1)]), MEST, 'alle forfølgere tæller, ikke kun nr. 2');
});

test('klummen: "mester før tid" går forud for rundens overraskelse (90) som overskrift', () => {
  const gazette = { playerOfTheRound: null, goalOfTheRound: null, defensiveAction: null, upset: { winnerPos: 7, winner: 'Dd', loserPos: 3, loser: 'Cc', score: '1-0' } };
  const c = col({ gazette, table: [T('A', 'Aa', 30), T('B', 'Bb', 18), T('C', 'Cc', 10), T('D', 'Dd', 3)], history: HIST([res('A', 'B', 1, 0), res('D', 'C', 1, 0)]), roundsLeft: 2 });
  assert.equal(c.title, 'Aa er mester før tid');
  assert.ok(paras(c).some((t) => t.startsWith('Rundens overraskelse')), 'kontrol: overraskelsen findes');
});

test('roundsLeftOf (app.js → klummen): 14 − sæsonrunden; 0 efter sæsonslut', () => {
  const L = { seasonStartRound: 15 };
  assert.equal(roundsLeftOf(L, 15, false), 13);
  assert.equal(roundsLeftOf(L, 26, false), 2);
  assert.equal(roundsLeftOf(L, 27, false), 1);
  assert.equal(roundsLeftOf(L, 28, true), 0);
  assert.equal(roundsLeftOf(L, 20, true), 0, 'sæsonslut vinder altid');
});

test('klummen: rundens spiller – "kampens spiller" står først, når han var det; ellers som før', () => {
  const RT = (o) => ({ playerId: 'p1', shirtNumber: 9, shortName: 'H', teamId: 'a1', teamName: 'Ude', goals: 0, assists: 0, saves: 0, aerialWins: 0, stars: 3, isMotM: false, ...o });
  const why = (o) => buildColumn({ matches: [{ ...M, ratings: { home: [RT({ playerId: 'mate', goals: 2, isMotM: false })], away: [RT(o)] } }], gazette: { playerOfTheRound: { playerId: 'p1', teamId: 'a1' }, goalOfTheRound: null, defensiveAction: null }, viewerTeamId: 'nobody', round: 3 })
    .sections.find((s) => s.id === 'col-stars').player.why;
  assert.equal(why({ goals: 1, isMotM: true }), 'Begrundelse: kampens spiller, 1 mål.');
  assert.equal(why({ isMotM: true }), 'Begrundelse: kampens spiller.');
  assert.equal(why({ goals: 1 }), 'Begrundelse: 1 mål.');
  assert.equal(why({ goals: 2 }), 'Begrundelse: 2 mål.');
});
