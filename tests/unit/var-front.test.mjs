// v3.14.1 (brugeren: "Hvorfor er der VAR på mål i minut 81, når det bliver scoret af en midtbanespiller, og der er 5
// spillere længere fremme?"): VAR-tjekket gælder offside for en af de VAR_FRONT forreste – står skytten bagved, er det
// hans forreste holdkammerat, der tjekkes. Bevist på seedede kampe: den navngivne offside-spiller står forrest i det
// øjeblik, chancen opstod (livePositions med bolden på midten – det samme billede, motoren vælger skytten ud fra).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch, VAR_FRONT } from '../../public/engine/match.js';
import { livePositions } from '../../public/engine/positions.js';

test('VAR-tjekket nævner kun en af de forreste som offside-mand – og en skytte længere tilbage får sin forreste holdkammerat tjekket', () => {
  let plain = 0, ahead = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const L = createLeague(createRng(seed)), H = L.teams[0], A = L.teams[1];
    const m = simulateMatch(H, A, createRng(seed * 7));
    const cut = Math.min(...m.events.filter((e) => e.isHome && ['SUB', 'TRIGGER'].includes(e.type)).map((e) => e.min), 91);
    const starters = H.tactics.lineupSlots.map((id) => H.squad.find((p) => p.id === id));
    const pos = livePositions(H.tactics, { attacking: true, ballX: 50 });
    const rank = (tag) => {   // "#9 M. Møller" → hvor mange markspillere stod længere fremme
      const i = starters.findIndex((p) => p && tag === `#${p.shirtNumber} ${p.shortName}`);
      assert.ok(i > 0, `${tag} er en markspiller i startopstillingen`);
      return starters.filter((p, j) => j > 0 && p && pos[j].y < pos[i].y).length;
    };
    for (const e of m.events.filter((x) => x.isHome && x.min < cut && ['VAR_GOAL', 'VAR_NO_GOAL'].includes(x.type))) {
      const g2 = e.text.match(/GODKENDT! (#\d+ .+?) skød, og (#\d+ .+?) foran ham stod ikke offside/);
      const n2 = e.text.match(/og (#\d+ .+?) stod offside og var med i situationen, da (#\d+ .+?) skød/);
      const two = g2 ? [g2[1], g2[2]] : n2 ? [n2[2], n2[1]] : null;   // [skytte, offside-mand]
      if (two) { ahead++; assert.ok(rank(two[0]) >= VAR_FRONT, `skytten stod bagved: ${e.text}`); assert.equal(rank(two[1]), 0, `den forreste tjekkes: ${e.text}`); continue; }
      const one = e.text.match(/GODKENDT! (#\d+ \S+ \S+?) [a-zæøå]/) ?? e.text.match(/og (#\d+ .+?) var offside/);
      assert.ok(one, e.text);
      plain++; assert.ok(rank(one[1]) < VAR_FRONT, `selv tjekket, så blandt de ${VAR_FRONT} forreste: ${e.text}`);
    }
  }
  assert.ok(plain >= 5 && ahead >= 5, `begge slags VAR-tjek forekommer (selv ${plain}, holdkammerat ${ahead})`);
});

test('tekster (brugerens ordvalg): "spillede 1-2", ikke "spillede væggen"; klummen siger "havde bolden mindst", ikke "med lidt af bolden"', async () => {
  const fs = await import('node:fs');
  const clues = fs.readFileSync(new URL('../../public/engine/clues.js', import.meta.url), 'utf8');
  assert.match(clues, /spillede 1-2 i \$\{m\}\. minut/); assert.doesNotMatch(clues, /væggen/);
  const { STYLE_RULES } = await import('../../public/engine/column.js');
  const wait = STYLE_RULES.find((r) => r.key === 'wait').say;
  assert.ok(wait.includes('scorede, selv om de havde bolden mindst'), wait.join(' | '));
  assert.ok(wait.every((t) => !/med lidt af bolden/.test(t)));
});

test('"Rundens mål" for et VAR-mål påstår intet om skyttens placering – han er ikke nødvendigvis den, VAR tjekkede (QC v3.14.1)', async () => {
  const { describeGoal } = await import('../../public/engine/clues.js');
  const texts = [0, 0.4, 0.8].map((v) => describeGoal('VAR', '#8 G. Kristensen', '#7 K. Kristensen', 81, { next: () => v, pick: (a) => a[Math.floor(v * a.length)] }));
  assert.equal(new Set(texts).size, 3, texts.join(' | '));
  for (const t of texts) { assert.match(t, /#8 G\. Kristensen/); assert.doesNotMatch(t, /rigtige side|frikendte #8|#8 G\. Kristensen (var|stod)/, t); }
});
