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
