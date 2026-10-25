// Den skadet udskiftede i resten af skade-tick'et (v3.17.0, Spilfører: gult kort til en spiller, der lige var skiftet ud
// skadet – det stille frispark trak fra listerne fra før skiftet). Tæller linjer i samme minut efter "Skadesskift: X erstatter
// Y.", der nævner Y – slutfløjtet (kampens spiller) undtaget. node tools/measure-stale-sub.mjs [N]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { simulateMatch } from '../public/engine/match.js';

export function measureStaleSub(N = 3000) {
  let subs = 0, stale = 0;
  const examples = [];
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
    m.events.forEach((e, i) => {
      const out = e.type === 'SUB' && e.text.match(/Skadesskift: .* erstatter (#\d+ \S+ [^.]+)\./)?.[1];
      if (!out) return;
      subs++;
      for (const f of m.events.slice(i + 1)) {
        if (f.min !== e.min) break;
        if (f.type !== 'END' && (f.text ?? '').includes(out)) { stale++; if (examples.length < 5) examples.push(f.text); }
      }
    });
  }
  return { subs, stale, examples };
}
if (import.meta.url === `file://${process.argv[1]}`) console.log(measureStaleSub(Number(process.argv[2] || 3000)));
