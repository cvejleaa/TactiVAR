// v3.24.3 (brugeren: "gemme kampene i firebase med et id, så jeg kan referere til det når vi skal justere på motoren"):
// gengivelsespakken. En kamp skal kunne spilles igen tal for tal ud fra de to hold (som de stod lige før kampen), rng-
// tilstanden lige før kampen og kampens opts – også efter en JSON-rundtur (pakken sendes som tekst).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound } from '../../public/engine/season.js';
import { simulateMatch } from '../../public/engine/match.js';
import { saveReplay, loadReplay, clearReplay, replayOf, REPLAY_KEY } from '../../public/state/replay.js';
import { resetGame, SAVE_KEY } from '../../public/state/storage.js';

const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };

test('rng.state(): createRng(state) fortsætter præcis, hvor generatoren er', () => {
  const r = createRng(42); for (let i = 0; i < 17; i++) r.next();
  const c = createRng(r.state());
  assert.deepEqual([r.next(), r.next(), r.next()], [c.next(), c.next(), c.next()]);
});

test('gengivelse: hver kamp i runden spilles igen identisk ud fra pakken – også efter JSON – i flere runder og ligaer', () => {
  for (const seed of [1, 7]) {
    const L = createLeague(createRng(seed)), rng = createRng(seed * 11);
    for (let r = 0; r < 3; r++) {
      const res = playRound(L, rng, { replay: true });
      assert.equal(res.replay.packs.length, res.matches.length);
      res.replay.packs.forEach((p0, i) => {
        const p = JSON.parse(JSON.stringify(p0));
        const again = simulateMatch(p.home, p.away, createRng(p.rngState), p.opts);
        again.goalsPool.forEach((g) => { g.matchIdx = i; });   // playPairs nummererer målene efter kampen
        assert.equal(JSON.stringify(again), JSON.stringify(res.matches[i]), `liga ${seed} runde ${r + 1} kamp ${i}`);
        assert.ok(replayOf(res.replay, res.round, i, res.matches[i]), 'replayOf finder pakken');
      });
      // modbevis: forkert rng-tilstand giver en anden kamp; hold taget EFTER bogføringen giver en anden kamp
      const p = res.replay.packs[0], m0 = JSON.stringify(res.matches[0]);
      assert.notEqual(JSON.stringify(simulateMatch(p.home, p.away, createRng(p.rngState + 1), p.opts)), m0);
      commitRound(L, res, rng);
      const after = simulateMatch(L.teams.find((t) => t.id === p.home.id), L.teams.find((t) => t.id === p.away.id), createRng(p.rngState), p.opts);
      assert.notEqual(JSON.stringify(after), m0, 'holdene efter commitRound er ikke dem, kampen blev spillet med');
    }
  }
});

test('uden replay: ingen pakke (måleværktøjerne og bots betaler intet); replayOf afviser en anden runde eller andre hold', () => {
  const L = createLeague(createRng(3)), res = playRound(L, createRng(5));
  assert.equal(res.replay, undefined);
  const r2 = playRound(createLeague(createRng(3)), createRng(5), { replay: true });
  assert.equal(replayOf(r2.replay, r2.round + 1, 0, r2.matches[0]), null);
  assert.equal(replayOf(r2.replay, r2.round, 0, r2.matches[1]), null);
});

test('lageret: gemt under sin egen nøgle (ikke i spillets gem), læses igen, og ryddes når en ny liga startes', () => {
  const st = fakeStorage(), L = createLeague(createRng(2)), res = playRound(L, createRng(9), { replay: true });
  assert.ok(saveReplay(st, res.replay));
  assert.equal(loadReplay(st).round, res.round);
  assert.equal(st.getItem(SAVE_KEY), null, 'ikke i gemmet');
  st.setItem(REPLAY_KEY, '{"round":"x"}'); assert.equal(loadReplay(st), null, 'forkert form → null');
  saveReplay(st, res.replay);
  const r = resetGame(st, { schemaVersion: 9, league: createLeague(createRng(4)), ui: {}, notes: {} });
  assert.ok(r.ok); assert.equal(st.getItem(REPLAY_KEY), null, 'ny liga: gengivelsen er væk');
  clearReplay(st); assert.equal(loadReplay(st), null);
});
