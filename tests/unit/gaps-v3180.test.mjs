// v3.18.0 – Test Managers huller: navne i arkivet ved migreringen, sanitize af de nye felter, træningsfokus-vagten,
// grænserne (3 kampe, 0 kr.) og botternes valg (hvem byder, trin 2 i vinduet)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { MIGRATIONS } from '../../public/state/storage.js';
import { normalizeLeague } from '../../public/engine/sanitize.js';
import { setFocus, setFocusMany, takeYouth } from '../../public/state/actions.js';
import { starsForValue, TIER_STARS, MATCH_LOG_CAP } from '../../public/engine/career.js';
import { setListed, openWindow } from '../../public/engine/transfers.js';

const fresh = (s = 12) => createLeague(createRng(s));

test('migrering 6 → 7: et omdøbt navn rettes også i sæsonarkivet (objekter og tekst) og i history', () => {
  const L = fresh(), keep = L.teams[0].squad[0], dup = L.teams[3].squad[5], old = keep.shortName;
  dup.shortName = old;
  L.seasons = [{ seasonNumber: 1, topScorer: { playerId: dup.id, shortName: old, shirtNumber: dup.shirtNumber }, myBest: { playerId: keep.id, shortName: old } }];
  L.history = [{ round: 3, biggest: { label: `#${dup.shirtNumber} ${old} scorede` } }];
  L.lastRound = { round: 3, matches: [{ ratings: { home: [], away: [{ playerId: dup.id, shortName: old }] } }] };
  MIGRATIONS[6]({ schemaVersion: 6, league: L });
  assert.notEqual(dup.shortName, old, 'botspilleren er omdøbt');
  assert.equal(keep.shortName, old, 'dit holds spiller beholder navnet');
  assert.equal(L.seasons[0].topScorer.shortName, dup.shortName);
  assert.equal(L.seasons[0].myBest.shortName, old, 'samme gamle navn, men en anden spiller (id) – uændret');
  assert.equal(L.history[0].biggest.label, `#${dup.shirtNumber} ${dup.shortName} scorede`);
  assert.equal(L.lastRound.matches[0].ratings.away[0].shortName, dup.shortName);
});

test('sanitize: matchLog skæres til 28, en bænk med en starter udtages igen, og en ukendt spiller fjernes fra salgslisten', () => {
  const L = fresh(), t = L.teams[0], p = t.squad[12];
  p.matchLog = Array.from({ length: 40 }, (_, i) => [1, i, 0, 1, 0, 0, 90, 6, 2, 0, 0]);
  t.matchBench = [t.tactics.lineupSlots[0], ...t.matchBench.slice(1)];
  t.listed = ['findes_ikke', p.id];
  normalizeLeague(L);
  assert.equal(p.matchLog.length, MATCH_LOG_CAP); assert.equal(p.matchLog[0][1], 40 - MATCH_LOG_CAP, 'de nyeste beholdes');
  const on = new Set(t.tactics.lineupSlots);
  assert.equal(t.matchBench.length, 7); assert.ok(t.matchBench.every((id) => !on.has(id)));
  assert.deepEqual(t.listed, [p.id]);
});

test('træningsfokus: Målmand kun for målmænd, ukendt fokus afvises; massehandlingen tæller kun de gyldige', () => {
  const L = fresh(), t = L.teams[0], gk = t.squad.find((p) => p.line === 'GK'), d = t.squad.find((p) => p.line === 'DEF');
  assert.equal(setFocus(t, d.id, 'KEEPER'), false); assert.equal(d.trainingFocus, 'GENERAL');
  assert.equal(setFocus(t, d.id, 'NOPE'), false);
  assert.equal(setFocus(t, gk.id, 'KEEPER'), true); assert.equal(gk.trainingFocus, 'KEEPER');
  assert.equal(setFocusMany(t, [gk.id, d.id, 'ukendt'], 'KEEPER'), 1);
  assert.equal(setFocusMany(t, [gk.id, d.id], 'REST'), 2);
});

test('grænser: værdi-stjernerne gælder fra præcis 3 kampe; ungdom kan tages op med præcis 0 kr. i kassen', () => {
  const p = { roleTier: 'ROTATION', careerGames: 2, publicStars: 5 };
  assert.equal(starsForValue(p), TIER_STARS.ROTATION);
  p.careerGames = 3; assert.equal(starsForValue(p), 5);
  const t = { squad: Array.from({ length: 18 }, (_, i) => ({ id: `s${i}` })), youthOffers: [{ id: 'y1' }], cashBalance: 0, matchBenchAuto: false };
  assert.equal(takeYouth(t, 'y1'), null);
});

test('bud: den bot, der mangler mest i kæden, byder først', () => {
  const L = fresh(), me = L.teams[0];
  me.squad.push({ ...structuredClone(me.squad.find((p) => p.line === 'GK' && !me.tactics.lineupSlots.includes(p.id))), id: 'gk3', shortName: 'G. K3', shirtNumber: 40 });
  const target = L.teams[5], gk = target.squad.find((p) => p.line === 'GK' && !target.tactics.lineupSlots.includes(p.id));
  target.squad = target.squad.filter((p) => p !== gk);   // 1 MV – under minimum
  for (const t of L.teams.filter((x) => x.isBot)) t.cashBalance = 20000000;
  setListed(L, me, 'gk3', true);
  assert.equal(L.offers.find((o) => o.playerId === 'gk3')?.to, target.id);
});

test('vinduet, trin 2: en bot under minimum i en kæde køber den billigste ikke-starter fra en bot med overskud', () => {
  const L = fresh(), buyer = L.teams[2], seller = L.teams[6];
  const gk = buyer.squad.find((p) => p.line === 'GK' && !buyer.tactics.lineupSlots.includes(p.id));
  buyer.squad = buyer.squad.filter((p) => p !== gk);
  buyer.cashBalance = 20000000;
  const extra = { ...structuredClone(seller.squad.find((p) => p.line === 'GK' && !seller.tactics.lineupSlots.includes(p.id))), id: 'gkx', shortName: 'X. GK', shirtNumber: 41 };
  seller.squad.push(extra);
  for (const t of L.teams.filter((x) => x.isBot && x !== seller && x !== buyer)) t.cashBalance = 0;   // ingen andre køber i trin 3
  openWindow(L);
  assert.equal(buyer.squad.filter((p) => p.line === 'GK').length, 2);
  assert.ok(L.transferLog.some((e) => e.to === buyer.id && e.from === seller.id));
});

test('QC: du kan ikke sælge under minimum i kæden (aldrig uden målmand)', async () => {
  const { acceptOffer } = await import('../../public/engine/transfers.js');
  const L = fresh(), me = L.teams[0];
  me.squad.push(...[1, 2].map((i) => ({ ...structuredClone(me.squad.find((p) => p.line === 'MID')), id: `m${i}`, shortName: `M. Q${i}`, shirtNumber: 70 + i })));
  const gk = me.squad.find((p) => p.line === 'GK' && !me.tactics.lineupSlots.includes(p.id));
  for (const t of L.teams.filter((x) => x.isBot)) t.cashBalance = 20000000;
  setListed(L, me, gk.id, true);
  assert.ok(L.offers.some((o) => o.playerId === gk.id), 'data: der er et bud');
  assert.match(acceptOffer(L, me, gk.id), /kun 2 i kæden/);
  assert.equal(me.squad.filter((p) => p.line === 'GK').length, 2);
});

test('QC: sanitize fylder en trup under 18 op med ungdom (med besked) – og en trup over 25 låser ikke ligaen ude', () => {
  const L = fresh(), t = L.teams[3];
  t.squad = t.squad.filter((p) => t.tactics.lineupSlots.includes(p.id) || p.line === 'GK');
  const n0 = t.squad.length; assert.ok(n0 >= 11 && n0 < 18, 'data');
  const big = L.teams[4]; while (big.squad.length < 27) big.squad.push({ ...structuredClone(big.squad[17]), id: `b${big.squad.length}`, shortName: `B. B${big.squad.length}`, shirtNumber: 50 + big.squad.length });
  const r = normalizeLeague(L);
  assert.deepEqual(r.problems, []);
  assert.equal(t.squad.length, 18); assert.ok(t.squad.slice(n0).every((p) => p.roleTier === 'YOUTH' && /^plr_y/.test(p.id)));
  assert.ok(r.notes.some((n) => n.includes(`fyldt op med ${18 - n0}`)));
  assert.ok(r.notes.some((n) => n.includes('27 spillere')));
});

test('QC K5: en bot med 22 spillere tager alligevel en ungdomsmålmand, når den kun har 1 MV', async () => {
  const { playRound, commitRound } = await import('../../public/engine/season.js');
  const L = fresh(), bot = L.teams[5], rng = createRng(3);
  for (let r = 0; r < 13; r++) commitRound(L, playRound(L, rng), rng);
  const gk2 = bot.squad.find((p) => p.line === 'GK' && !bot.tactics.lineupSlots.includes(p.id));
  bot.squad = bot.squad.filter((p) => p !== gk2);
  while (bot.squad.length < 22) bot.squad.push({ ...structuredClone(bot.squad.find((p) => p.line === 'ATT')), id: `a${bot.squad.length}`, shortName: `A. A${bot.squad.length}`, shirtNumber: 50 + bot.squad.length, age: 20 });
  commitRound(L, playRound(L, rng), rng);
  assert.ok(bot.squad.filter((p) => p.line === 'GK').length >= 2);
});

test('Spilfører: et kampstempel fra en tidligere sæson har sæsonen med', async () => {
  const { stampText } = await import('../../public/engine/career.js');
  const teams = [{ name: 'A' }, { name: 'B' }], e = [1, 14, 0, 1, 2, 1, 90, 7.1, 3, 1, 0];
  assert.match(stampText(e, teams, true, 2), /^\[Sæson 1, runde 14 • A 2-1 B/);
  assert.match(stampText(e, teams, true, 1), /^\[Runde 14 • /);
});
