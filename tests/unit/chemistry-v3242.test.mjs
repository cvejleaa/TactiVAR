// v3.24.2 (Spilfører UI, rundtur 2: "samspillets belønning er tavs"): de par, der blev stærke i runden – kun når de spillede
// sammen – og dem, der holdt op, fordi de ikke spillede sammen. Før og efter mod SAMME snit (UI målte 3 falske "nye" i én runde
// med blandet snit). Kun par, der fandtes før. Navne fra truppen nu (QC: ikke pladsens navn); fra 4 par kun antallet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound } from '../../public/engine/season.js';
import { lineupPairs, pairKey, strongChanges, bandOf } from '../../public/engine/chemistry.js';
import { strongLines } from '../../public/ui/card.js';

const own = (L) => L.teams.find((t) => !t.isBot);

test('strongChanges: op kun ved fælles kamp i runden, ned kun uden – snittet alene flytter intet; ukendte par tæller ikke', () => {
  const L = createLeague(createRng(2)), me = own(L), R = 5, ref = 78;
  const ps = lineupPairs(me, ref).slice(0, 7), k = ps.map((x) => pairKey(x.a.id, x.b.id)), before = new Map();
  // ved snit 78 er stærkt ≥ 81,2
  const set = (i, was, now, round) => { before.set(k[i], was); me.chemistry[k[i]] = [now, round]; };
  set(0, 81.0, 81.5, R);        // krydser op, spillede sammen → op
  set(1, 85.0, 80.0, R - 2);    // falder ud, spillede ikke sammen → ned
  set(2, 81.0, 81.5, R - 1);    // krydser op uden fælles kamp (fx snittet) → intet
  set(3, 85.0, 80.0, R);        // falder ud, men spillede sammen → intet (snittet steg)
  set(4, 84.0, 85.0, R);        // var stærkt, er stærkt → intet
  me.chemistry[k[5]] = [90, R]; // fandtes ikke før → intet
  set(6, 81.5, 81.5, R);        // uændret og stærkt ved snit 78 – men ikke ved et andet snit (81): med blandet snit et falsk "op"
  assert.equal(bandOf(81.0, ref), 'sammen'); assert.equal(bandOf(81.5, ref), 'staerkt');   // data: grænsen ligger imellem
  const r = strongChanges(me, before, ref, R);
  assert.deepEqual(r.up, [[ps[0].a.id, ps[0].b.id]]);
  assert.deepEqual(r.down, [[ps[1].a.id, ps[1].b.id]]);
});

test('commitRound: dit holds rapport får de stærke par – hvert "op" er stærkt nu og spillede sammen i runden; data findes', () => {
  let ups = 0;
  for (const seed of [1, 2, 3]) {
    const L = createLeague(createRng(seed)), rng = createRng(seed * 5), me = own(L);
    for (let r = 0; r < 10; r++) {
      commitRound(L, playRound(L, rng), rng);
      const rep = L.trainingReport[me.id], round = L.leagueMetadata.round, ref = L.leagueMetadata.chemRef;
      assert.ok(rep.strong && Array.isArray(rep.strong.up) && Array.isArray(rep.strong.down));
      for (const [a, b] of rep.strong.up) {
        const [v, last] = me.chemistry[pairKey(a, b)];
        assert.equal(bandOf(v, ref), 'staerkt'); assert.equal(last, round);
      }
      ups += rep.strong.up.length;
    }
  }
  assert.ok(ups > 0, 'data: mindst ét par blev stærkt på 3 × 10 runder');
});

test('teksten: ét par med numre og navne, 2–3 i en liste, fra 4 kun antallet; ned på egen sætning; solgte spillere udelades', () => {
  const L = createLeague(createRng(4)), me = own(L), s = me.squad, w = (p) => `#${p.shirtNumber} ${p.shortName}`;
  const pr = (i, j) => [s[i].id, s[j].id];
  assert.deepEqual(strongLines(me, { up: [pr(1, 2)], down: [] }), [`🤝 ${w(s[1])} og ${w(s[2])} spiller nu stærkt sammen.`]);
  assert.deepEqual(strongLines(me, { up: [pr(1, 2), pr(3, 4)], down: [] }), [`🤝 Spiller nu stærkt sammen: ${w(s[1])} og ${w(s[2])} · ${w(s[3])} og ${w(s[4])}.`]);
  assert.deepEqual(strongLines(me, { up: [pr(1, 2), pr(3, 4), pr(5, 6), pr(7, 8)], down: [] }), ['🤝 4 par spiller nu stærkt sammen.']);
  assert.deepEqual(strongLines(me, { up: [], down: [pr(1, 2)] }), [`Ikke længere stærkt (spillede ikke sammen i runden): ${w(s[1])} og ${w(s[2])}.`]);
  assert.deepEqual(strongLines(me, { up: [[s[1].id, 'solgt']], down: [] }), [], 'en solgt spiller: intet "?"');
  assert.deepEqual(strongLines(me, undefined), [], 'rapport fra v3.24.1 uden strong');
});
