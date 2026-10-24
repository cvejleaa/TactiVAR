// v3.14.1 (brugeren: "Hvorfor er der VAR på mål i minut 81, når det bliver scoret af en midtbanespiller, og der er 5
// spillere længere fremme?"): VAR-tjekket gælder offside for en af de VAR_FRONT forreste – står skytten bagved, er det
// hans forreste holdkammerat, der tjekkes. Bevist på seedede kampe: den navngivne offside-spiller står forrest i det
// øjeblik, chancen opstod (livePositions med bolden på midten – det samme billede, motoren vælger skytten ud fra).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch, VAR_FRONT } from '../../public/engine/match.js';
import { VAR_RULES } from '../../public/engine/match-rules.js';
import { livePositions } from '../../public/engine/positions.js';

// v3.15.1: VAR tjekker målet efter keeper-duellen (ikke længere en chancetype). Testen tvinger hvert mål til et synligt
// tjek (chance(GOAL_CHECK_P) og ikke frispark-delen) og læser kun de almindelige afslutninger uden oplæg – dér er billedet,
// motoren vælger skytten og den forreste ud fra, livePositions med bolden på midten.
const forceVar = (r, foul = false) => ({ ...r, chance: (p) => (p === VAR_RULES.GOAL_CHECK_P ? true : p === VAR_RULES.GOAL_FOUL_SHARE ? foul : r.chance(p)) });
const next = (m, e) => m.events[m.events.indexOf(e) + 1];
test('VAR-tjekket nævner kun en af de forreste som offside-mand – og en skytte længere tilbage får sin forreste holdkammerat tjekket', () => {
  let plain = 0, ahead = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const L = createLeague(createRng(seed)), H = L.teams[0], A = L.teams[1];
    const m = simulateMatch(H, A, forceVar(createRng(seed * 7)));
    const cut = Math.min(...m.events.filter((e) => e.isHome && ['SUB', 'TRIGGER', 'RED'].includes(e.type)).map((e) => e.min), 91);
    const starters = H.tactics.lineupSlots.map((id) => H.squad.find((p) => p.id === id));
    const pos = livePositions(H.tactics, { attacking: true, ballX: 50 });
    const rank = (tag) => {   // "#9 M. Møller" → hvor mange markspillere stod længere fremme
      const i = starters.findIndex((p) => p && tag === `#${p.shirtNumber} ${p.shortName}`);
      assert.ok(i > 0, `${tag} er en markspiller i startopstillingen`);
      return starters.filter((p, j) => j > 0 && p && pos[j].y < pos[i].y).length;
    };
    for (const e of m.events.filter((x) => x.isHome && x.min < cut && x.type === 'VAR_CHECK')) {
      const g = next(m, e);
      // Kun den almindelige afslutning (ingen ✅-indledning, ikke kontra, hovedstød, cutback eller retur) – og kun godkendte.
      if (g.type !== 'GOAL' || !/^⚽ \[[^\]]+\] MÅÅÅL! [^✅]/.test(g.text) || /KONTRA|STRAFFE|FRISPARK|baglinjen/.test(g.text)) continue;
      const checked = e.text.match(/stod (#\d+ .+?) offside\?/)[1];
      const two = g.text.match(/VAR: målet står – (#\d+ .+?) foran (#\d+ .+?) stod ikke offside/);
      if (two) { ahead++; assert.equal(two[1], checked); assert.ok(rank(two[2]) >= VAR_FRONT, `skytten stod bagved: ${g.text}`); assert.equal(rank(two[1]), 0, `den forreste tjekkes: ${g.text}`); continue; }
      const one = g.text.match(/VAR: målet står – (#\d+ .+?) (timede|var lige|slap)/);
      assert.ok(one, g.text); assert.equal(one[1], checked);
      plain++; assert.ok(rank(one[1]) < VAR_FRONT, `selv tjekket, så blandt de ${VAR_FRONT} forreste: ${g.text}`);
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

// Brugeren (v3.14.1 live): "siger at M. Møller var foran og ikke offside, men M. Poulsen er længere fremme på banen" –
// den tjekkede blev flyttet tilbage til y 16 i billedet. Invariant på billedet selv: den, teksten kalder "foran ham",
// står forrest af alle markspillere, og skytten står bag ham.
test('billedet ved et VAR-tjek af en holdkammerat: han står forrest i billedet, skytten bag ham (også ved målet, y 20)', async () => {
  const { VAR_BEHIND } = await import('../../public/engine/match.js');
  let n = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const L = createLeague(createRng(seed)), H = L.teams[0], A = L.teams[1];
    const m = simulateMatch(H, A, forceVar(createRng(seed * 11)));
    // Den almindelige afslutning (ingen ✅-indledning, kontra, cutback): kun dér står alle i holdets form (ingen flyttede aktører).
    for (const e of m.events.filter((x) => x.isHome && x.type === 'GOAL' && x.snapshot && / foran #\d+ .+? stod ikke offside/.test(x.text) && /^⚽ \[[^\]]+\] MÅÅÅL! [^✅]/.test(x.text) && !/KONTRA|baglinjen/.test(x.text))) {
      const offTag = e.text.match(/målet står – (#\d+ .+?) foran/)[1];
      const off = H.squad.find((p) => `#${p.shirtNumber} ${p.shortName}` === offTag);
      const gk = H.squad.find((p) => p.id === H.tactics.lineupSlots[0])?.id;
      const y = Object.fromEntries(e.snapshot.pts.map(([id, , py]) => [id, py]));
      const others = e.snapshot.pts.filter(([id]) => id !== off.id && id !== gk);
      assert.ok(others.every(([, , py]) => py >= y[off.id]), `${offTag} (y ${y[off.id]}) forrest: ${JSON.stringify(others)}`);
      assert.ok(y[e.snapshot.scorer] >= y[off.id] + VAR_BEHIND, `skytten står bag ham: ${y[e.snapshot.scorer]} mod ${y[off.id]}`);
      n++;
    }
  }
  assert.ok(n >= 3, `billeder med en tjekket holdkammerat: ${n}`);
});
