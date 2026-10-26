// v3.18.0 (6): økonomi – tilskuere (kun hjemme), TV, løn pr. runde, præmie ved sæsonslut, lønbudget, kassen er ejerens
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound, bookRoundFinances, placesBefore, endSeason } from '../../public/engine/season.js';
import { attendance, wagesPerRound, weeklyWages, wageBudget, wageRoomPerRound, bookLedger, TV_PER_ROUND, TICKET_PRICE, PRIZE, LEDGER_CAP } from '../../public/engine/career.js';
import { viewTeam, TEAM_PUBLIC_FIELDS } from '../../public/engine/visibility.js';
import { normalizeLeague as sanitizeLeague } from '../../public/engine/sanitize.js';
import { forecast } from '../../public/ui/club.js';

const fresh = (s = 5) => createLeague(createRng(s));
const res = (round, pairs) => ({ round, matches: pairs.map(([h, a, hg, ag]) => ({ homeId: h.id, awayId: a.id, homeGoals: hg, awayGoals: ag })) });

test('tilskuere: 4000 + 300·(8 − hjemmeholdets plads) + 150·(8 − udeholdets) + 120·form, højst 9000', () => {
  assert.equal(attendance(8, 8, 0), 4000);
  assert.equal(attendance(1, 1, 9), 8230);            // 4000 + 2100 + 1050 + 1080
  assert.equal(attendance(4.5, 4.5, 0), 5575);         // ny liga, runde 1
  assert.equal(attendance(1, 1, 9 + 10), 9000);        // loftet
  assert.equal(attendance(2, 7, 3), 4000 + 1800 + 150 + 360);
});

test('runden: TV til alle, billetter kun til hjemmeholdet, løn = ugeløn / 3 – og kassen følger regnskabet', () => {
  const L = fresh(), [A, B, C, D] = L.teams;
  const cash0 = new Map(L.teams.map((t) => [t.id, t.cashBalance]));
  bookRoundFinances(L, res(1, [[A, B, 2, 0], [C, D, 1, 1]]));
  const eA = A.finance.ledger.at(-1), eB = B.finance.ledger.at(-1);
  assert.equal(eA.att, 5575); assert.equal(eA.gate, 5575 * TICKET_PRICE);
  assert.equal(eB.att, undefined); assert.equal(eB.gate, undefined, 'udeholdet får ingen billetindtægt');
  assert.equal(eA.tv, TV_PER_ROUND); assert.equal(eB.tv, TV_PER_ROUND);
  assert.equal(eA.wages, -Math.round(weeklyWages(A) / 3));
  assert.equal(A.cashBalance, cash0.get(A.id) + 5575 * TICKET_PRICE + TV_PER_ROUND - wagesPerRound(A));
  assert.equal(B.cashBalance, cash0.get(B.id) + TV_PER_ROUND - wagesPerRound(B));
  assert.equal(eA.cash, A.cashBalance);
  // Hold uden kamp i runden (her E–H) får stadig TV og betaler løn
  const E = L.teams[4];
  assert.equal(E.cashBalance, cash0.get(E.id) + TV_PER_ROUND - wagesPerRound(E));
  // Formen: point i de seneste 3 kampe
  assert.deepEqual(A.finance.form, [3]); assert.deepEqual(B.finance.form, [0]); assert.deepEqual(C.finance.form, [1]);
  bookRoundFinances(L, res(2, [[B, A, 1, 1]])); bookRoundFinances(L, res(3, [[A, C, 3, 1]])); bookRoundFinances(L, res(4, [[D, A, 2, 0]]));
  assert.deepEqual(A.finance.form, [1, 3, 0], 'kun de seneste 3');
});

test('placering før runden: sæsonens runde 1–2 = sidste sæsons slutplacering, derefter tabellen nu', () => {
  const L = fresh(), rng = createRng(11);
  assert.ok([...placesBefore(L, 1).values()].every((v) => v === 4.5), 'ny liga: 4,5 for alle');
  for (let r = 0; r < 14; r++) commitRound(L, playRound(L, rng), rng);
  const table = L.seasons.at(-1).table, next = L.leagueMetadata.round + 1;
  const pl = placesBefore(L, next);
  table.forEach((s, i) => assert.equal(pl.get(s.teamId), i + 1));
  // Hjemmeholdets tilskuere i den nye sæsons runde 1 bygger på sidste sæsons placering – ikke den nulstillede tabel
  const champ = L.teams.find((t) => t.id === table[0].teamId), last = L.teams.find((t) => t.id === table[7].teamId);
  assert.ok(attendance(pl.get(champ.id), pl.get(last.id), 0) > attendance(pl.get(last.id), pl.get(champ.id), 0));
});

test('sæsonslut: præmien efter slutplaceringen (1,5 mio. … 0,1 mio.), og sæsonens regnskab flyttes til "sidste sæson"', () => {
  const L = fresh(), rng = createRng(3);
  for (let r = 0; r < 13; r++) commitRound(L, playRound(L, rng), rng);
  const before = new Map(L.teams.map((t) => [t.id, t.cashBalance]));
  const result = playRound(L, rng);
  commitRound(L, result, rng);
  const table = L.seasons.at(-1).table;
  table.forEach((s, i) => {
    const t = L.teams.find((x) => x.id === s.teamId), e = t.finance.ledger.at(-1);
    assert.equal(e.prize, PRIZE[i], `${i + 1}. plads`);
    assert.equal(t.cashBalance, before.get(t.id) + (e.gate ?? 0) + e.tv + e.wages + PRIZE[i]);
    assert.equal(t.finance.lastSeason.prize, PRIZE[i]);
    assert.ok(t.finance.lastSeason.tv >= 14 * TV_PER_ROUND - 1, 'sæsonens 14 runders TV');
    assert.deepEqual(t.finance.season, {});
  });
});

test('endSeason alene (migreringen fra skema 5 kalder den) udbetaler ingen præmie', () => {
  const L = fresh(), cash = L.teams.map((t) => t.cashBalance);
  endSeason(L, 0, false);
  assert.deepEqual(L.teams.map((t) => t.cashBalance), cash);
});

test('regnskabet: én linje pr. runde (præmien på samme linje), højst 30 linjer', () => {
  const t = fresh().teams[0];
  bookLedger(t, { r: 5, s: 1, tv: 100 }); bookLedger(t, { r: 5, s: 1, prize: 50 });
  assert.equal(t.finance.ledger.length, 1); assert.equal(t.finance.ledger[0].prize, 50); assert.equal(t.finance.ledger[0].tv, 100);
  for (let r = 6; r < 6 + 40; r++) bookLedger(t, { r, s: 1, tv: 1 });
  assert.equal(t.finance.ledger.length, LEDGER_CAP); assert.equal(t.finance.ledger.at(-1).r, 45);
});

test('lønbudget: 1,7 mio. + 2 % af kassen pr. uge, rummet vises pr. runde', () => {
  const t = fresh().teams[0];
  t.cashBalance = 5000000; assert.equal(wageBudget(t), 1800000);
  t.cashBalance = -20000000; assert.equal(wageBudget(t), 1700000, 'en negativ kasse trækker ikke budgettet ned under grundbeløbet');
  t.cashBalance = 5000000;
  assert.equal(wageRoomPerRound(t), Math.round((1800000 - weeklyWages(t)) / 3));
});

test('prognose: en ny liga har 14 runder tilbage, 7 hjemmekampe, og ender med kassen + rundernes netto + præmien for 4,5 → 5. plads', () => {
  const L = fresh(), t = L.teams[0], f = forecast(L, t);
  assert.equal(f.rounds, 14); assert.equal(f.home, 7);
  assert.equal(f.prize, PRIZE[4]);   // Math.round(4,5) = 5 → 5. plads (0,45 mio.)
  assert.ok(f.end > t.cashBalance - 14 * wagesPerRound(t));
});

test('kassen er ejerens: viewTeam for andre er en tilladelsesliste – præcis navn, trup (offentlige felter), opstilling og bænk', () => {
  const t = fresh().teams[1];
  t.finance.ledger.push({ r: 1, s: 1, tv: 1, cash: 1 }); t.listed = [t.squad[17].id]; t.youthOffers = [{ id: 'y' }];
  const other = viewTeam(t, false), own = viewTeam(t, true);
  assert.deepEqual(Object.keys(other).sort(), [...TEAM_PUBLIC_FIELDS].sort());
  assert.deepEqual(Object.keys(other.tactics).sort(), ['baseFormation', 'customCoords', 'lineupSlots'], 'ingen faser, Hvis-Så eller planer');
  assert.ok(other.squad.every((p) => p.skills === undefined && p.weeklyWage === undefined && p.potential === undefined && p.publicStars !== undefined));
  assert.equal(JSON.stringify(other).includes(String(t.cashBalance)), false, 'kassen står ingen steder');
  assert.equal(own, t, 'ejeren ser holdet, som det er');
});


test('sanitize: en ødelagt form bliver tom, og en for lang skæres til de seneste 3', () => {
  const L = fresh();
  L.teams[0].finance.form = 'x'; L.teams[1].finance.form = [3, 1, 0, 3, NaN];
  sanitizeLeague(L);
  assert.deepEqual(L.teams[0].finance.form, []); assert.deepEqual(L.teams[1].finance.form, [1, 0, 3]);
});

test('sæsonens runde 2 bruger også sidste sæsons slutplacering (runde 3 tabellen nu)', () => {
  const L = fresh(), rng = createRng(13);
  for (let r = 0; r < 15; r++) commitRound(L, playRound(L, rng), rng);   // sæson 1 + den nye sæsons runde 1
  const table = L.seasons.at(-1).table, pl2 = placesBefore(L, L.leagueMetadata.round + 1);
  table.forEach((s, i) => assert.equal(pl2.get(s.teamId), i + 1, 'runde 2'));
  commitRound(L, playRound(L, rng), rng);
  const pl3 = placesBefore(L, L.leagueMetadata.round + 1);
  assert.notDeepEqual([...pl3], [...pl2], 'runde 3: tabellen efter to runder (her ikke lig sidste sæson)');
});

test('formen, der tæller, er hjemmeholdets – ikke gæsternes', () => {
  const L = fresh(), [A, B] = L.teams;
  A.finance.form = [3, 3, 3]; B.finance.form = [];
  bookRoundFinances(L, res(1, [[A, B, 0, 0]]));
  assert.equal(A.finance.ledger.at(-1).att, 5575 + 120 * 9);
});
