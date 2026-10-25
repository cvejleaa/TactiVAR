// v3.16.7 M3 (Spilfører: midtstoppere lavede cutbacks, angribere lukkede kanten i eget felt): kantmanden er en kant- eller
// back-plads på den side (inden for rækkevidde), backen er backen på sin side – aldrig en angriber, når andre findes.
// tools/measure-cutback-roles.mjs, 1500 kampe: kantmand ikke på en kantplads 239 → 99 af ≈1030 (23 % → 10 %; resten er
// løbs-cutbacks, hvor løberen selv laver den, og spillere flyttet af Hvis-Så), angriber som back 66 → 17 (6,4 % → 1,7 %).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureCutbackRoles } from '../../tools/measure-cutback-roles.mjs';

test('cutback-roller (1500 kampe): højst 15 % fra en ikke-kantplads (før 23 %), højst 3 % angribere som back (før 6,4 %)', async () => {
  const r = await measureCutbackRoles(1500);
  assert.ok(r.cutbacks >= 800, `data: ${r.cutbacks} cutbacks`);
  assert.ok(r.wingerCentral / r.cutbacks <= 0.15, `ikke-kant ${r.wingerCentral} af ${r.cutbacks}`);
  assert.ok(r.backAttacker / r.cutbacks <= 0.03, `angriber som back ${r.backAttacker} af ${r.cutbacks}`);
});

// v3.17.0: løbs-cutbacken møder backen på sin kant (flankBack, samme forsvarer i løbet, driblingen og teksten), og kanten
// lukkes aldrig af en kantangriber (efter Hvis-Så til 3-4-3 var det angriberen). 1500 kampe: backen på samme side som
// kantmanden 123 af 709 (17 %) → 9 af 999 (0,9 %); angriber som back 17 → 0.
test('cutback-backen (v3.17.0): modsat side af kantmanden i ≥97 % (før 83 %), aldrig en angriber (før 17 af 1040)', async () => {
  const r = await measureCutbackRoles(1500);
  assert.ok(r.sided >= 700, `data: ${r.sided} med side-pladser`);
  assert.ok(r.wrongSide / r.sided <= 0.03, `samme side ${r.wrongSide} af ${r.sided}`);
  assert.equal(r.backAttacker, 0);
});
