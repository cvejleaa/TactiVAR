// v3.15 Test Manager: sæsonstatistikkens kort (stats.js bookMatchStats) regnes fra karakterarket – ingen test bogførte et
// kort. Hver spiller/hold har sit eget tal (hjemme ≠ ude, rødt ≠ gult), og et gammelt gem (v3.13.0, uden sRed/reds)
// får 0 – ikke NaN – når kortene bogføres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { bookMatchStats } from '../../public/engine/stats.js';
import { parseSave } from '../../public/state/storage.js';

const entry = (p, extra = {}) => ({ playerId: p.id, minIn: 1, minOut: 90, goals: 0, assists: 0, isMotM: false, yellowCard: false, ...extra });
function book(L, H, A, home, away) {
  const m = { homeId: H.id, awayId: A.id, homeGoals: 1, awayGoals: 2, stats: { hPoss: 50, aPoss: 50 }, ratings: { home, away } };
  bookMatchStats(L, m);
  const row = (t) => L.leagueMetadata.standings.find((r) => r.teamId === t.id);
  return { h: row(H), a: row(A) };
}

test('kort i sæsonstatistikken: gule tælles pr. kort (to gule = 2), røde pr. udvisning (direkte rødt tæller ikke som gult) – på den rigtige spiller og det rigtige hold', () => {
  const L = createLeague(createRng(3)), [H, A] = [L.teams[0], L.teams[1]];
  const hs = H.squad, as = A.squad;
  const { h, a } = book(L, H, A, [
    entry(hs[1], { yellowCard: true, yellows: 2, red: 'SECOND_YELLOW', minOut: 40 }),    // to gule + rødt
    entry(hs[2], { yellowCard: true, yellows: 1, red: null }),                              // ét gult
    entry(hs[3], { yellowCard: false, yellows: 0, red: 'DIRECT', minOut: 20 }),             // direkte rødt: intet gult
    entry(hs[4]),
  ], [
    entry(as[1], { yellowCard: true, yellows: 1, red: null }),
    entry(as[2], { yellowCard: true }),                                                      // en kamp gemt før v3.15: kun yellowCard → ét gult
  ]);
  assert.deepEqual([h.yellows, h.reds, a.yellows, a.reds], [3, 2, 2, 0]);
  const p = (t, i) => ({ y: t.squad[i].sYellow, r: t.squad[i].sRed });
  assert.deepEqual([p(H, 1), p(H, 2), p(H, 3), p(H, 4)], [{ y: 2, r: 1 }, { y: 1, r: 0 }, { y: 0, r: 1 }, { y: 0, r: 0 }]);
  assert.deepEqual([p(A, 1), p(A, 2)], [{ y: 1, r: 0 }, { y: 1, r: 0 }]);
});

test('gem fra v3.13.0 (uden sRed og reds): efter indlæsning står de på 0, og bogføring af et rødt kort giver tal – ikke NaN', () => {
  const r = parseSave(fs.readFileSync(new URL('../fixtures/save-v3.13.0.json', import.meta.url), 'utf8'));
  assert.ok(r.ok, r.error);
  const L = r.state.league, [H, A] = [L.teams[0], L.teams[1]];
  const rows = L.leagueMetadata.standings;
  assert.ok(rows.every((x) => x.reds === 0 && Number.isFinite(x.yellows)), 'alle hold har reds 0 efter indlæsning');
  assert.ok(L.teams.every((t) => t.squad.every((p) => p.sRed === 0)), 'alle spillere har sRed 0');
  const before = rows.find((x) => x.teamId === H.id).reds;
  const { h } = book(L, H, A, [entry(H.squad[1], { yellows: 2, yellowCard: true, red: 'SECOND_YELLOW' })], []);
  assert.equal(h.reds, before + 1); assert.equal(H.squad[1].sRed, 1);
});
