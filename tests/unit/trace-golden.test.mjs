// v3.16 trin 1 (Arkitekt, QC B5): et fingeraftryk af 20 seedede kampe FØR kampens spor blev optaget – optagelsen må ikke
// ændre én eneste kamp (intet rng-træk, ingen skrivning i seen/seenX). Hashen dækker hele resultatet uden sporet: referat
// (også 📍-billederne), kamptal, karakterer, Rundens mål-pulje, skader, observationer og slutopstilling. Kampene har dit hold
// (📍 findes kun dér), og udvalget skal rumme røde kort, Hvis-Så-skift og udskiftninger (vagt nedenfor).
// Ændres motoren BEVIDST, opdateres GOLDEN med den nye værdi – og commit-teksten siger hvorfor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';

const GOLDEN = 'd46c1314c9eee1e8cf2bae91f5f619caa94c5daab23e66b1ff28d1651669a094';   // v3.16.3: kun tekst – noprose uændret (tools/fingerprint.mjs; før 7648f4ef… – vary, målets linje, fuldtidsanalysen – og før det 072a48cf… fra v3.16.2) · v3.16.1 sammenpresning i stedet for klemning (bevidst ændret motor: modtagervalget læser positionerne – før d67fad2a… fra v3.16) · v3.16 koblede linjer + SHOT_REACH (bevidst ændret motor: modtagervalg, langskud, kontra, kant efter pres – før 9ae07870… fra v3.15.1)
export function goldenMatches() {
  const out = [];
  for (let s = 1; s <= 20; s++) {
    const L = createLeague(createRng(s * 97));
    const me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    out.push(s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131)));
  }
  return out;
}
const strip = (m) => { const { trace, ...rest } = m; return rest; };

test('fingeraftryk: 20 seedede kampe er uændrede af optagelsen (hash af hele resultatet uden sporet)', () => {
  const ms = goldenMatches();
  const types = new Set(ms.flatMap((m) => m.events.map((e) => e.type)));
  for (const t of ['RED', 'SUB', 'TRIGGER', 'GOAL', 'VAR_CHECK']) assert.ok(types.has(t), `data: udvalget rummer ${t}`);
  assert.ok(ms.some((m) => m.events.some((e) => e.snapshot)), 'data: 📍-billeder');
  const h = createHash('sha256').update(JSON.stringify(ms.map(strip))).digest('hex');
  assert.equal(h, GOLDEN);
});
