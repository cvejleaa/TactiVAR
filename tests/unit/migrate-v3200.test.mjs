// v3.20.0: migrering 7 → 8 (gem fra v3.19.0, runde 9 med dit hold i 4-3-3, og lige efter sæsonslut). Fixtures lavet med
// v3.19.0-koden (origin/main 98d297b): ny liga (seed 19) + N runder + serialize.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSave, SCHEMA_VERSION } from '../../public/state/storage.js';
import { FORMATIONS, fitOf, lineOfRole, positionOfRole } from '../../public/engine/formations.js';
import { HEIGHT_BY_POS } from '../../public/engine/generator.js';
const sameHeight = (a, b) => JSON.stringify(HEIGHT_BY_POS[a]) === JSON.stringify(HEIGHT_BY_POS[b]);

const R9 = fs.readFileSync(new URL('../fixtures/save-v3.19.0.json', import.meta.url), 'utf8');
const R15 = fs.readFileSync(new URL('../fixtures/save-v3.19.0-r15.json', import.meta.url), 'utf8');
const rolesOf = (t) => FORMATIONS[t.tactics.baseFormation].map((s) => s.r);
const outOfPos = (t) => t.tactics.lineupSlots.filter((id, i) => fitOf(t.squad.find((p) => p.id === id).position, rolesOf(t)[i]) < 1).length;

for (const [name, RAW] of [['runde 9, dit hold i 4-3-3', R9], ['efter sæsonslut', R15]]) test(`migrering 7 → 8 (${name}): én DM pr. hold, alt andet intakt, dit hold og dine positioner urørt`, () => {
  const raw = JSON.parse(RAW);
  assert.equal(raw.schemaVersion, 7); assert.equal(SCHEMA_VERSION, 8);
  const r = parseSave(RAW);
  assert.ok(r.ok, r.error); assert.equal(r.migratedFrom, 7);
  const L = r.state.league;
  assert.ok(raw.league.teams.every((t) => t.squad.every((p) => p.position !== 'DM')), 'data: ingen DM før');
  L.teams.forEach((t, i) => {
    const o = raw.league.teams[i], oById = new Map(o.squad.map((p) => [p.id, p]));
    assert.equal(t.squad.length, o.squad.length);
    t.squad.forEach((p, j) => {
      const q = o.squad[j];
      assert.equal(p.id, q.id); assert.equal(p.age, q.age); assert.equal(p.heightCm, q.heightCm); assert.deepEqual(p.skills, q.skills);
      assert.equal(p.potential, q.potential); assert.deepEqual(p.dev, q.dev); assert.equal(p.weeklyWage, q.weeklyWage);
    });
    const dms = t.squad.filter((p) => p.position === 'DM');
    if (!t.isBot) {
      // Dit hold: præcis én CM blev DM – resten af positionerne og opstillingen er de samme
      assert.equal(dms.length, 1); assert.equal(oById.get(dms[0].id).position, 'CM');
      assert.deepEqual(t.squad.filter((p) => p !== dms[0]).map((p) => p.position), o.squad.filter((p) => p.id !== dms[0].id).map((p) => p.position));
      assert.deepEqual(t.tactics.lineupSlots, o.tactics.lineupSlots);
      // (2) uden for startopstillingen, ikke STAR, laveste rygnummer
      const cands = o.squad.filter((p) => p.position === 'CM' && !o.tactics.lineupSlots.includes(p.id) && p.roleTier !== 'STAR').sort((a, b) => a.shirtNumber - b.shirtNumber);
      assert.equal(dms[0].id, cands[0].id);
    } else {
      // Botterne: de samme 11 (fordelt efter position), og højst 1 starter uden for position (kun hvor kæden ikke passer)
      assert.deepEqual([...t.tactics.lineupSlots].sort(), [...o.tactics.lineupSlots].sort());
      assert.ok(outOfPos(t) <= 1, `${t.name} ${t.tactics.baseFormation}: ${outOfPos(t)}`);
      assert.ok(dms.length >= 1, `${t.name}: ingen DM`);
      // En starter på en plads i sin kæde har pladsens position, når den har samme højdetabel (CM/DM/OM, back/kant) – ellers sin egen
      o.tactics.lineupSlots.forEach((id, k) => { const p = t.squad.find((x) => x.id === id), q = oById.get(id), role = rolesOf(t)[k];   // de oprindelige pladser (før fordelingen)
        if (p.line === lineOfRole(role)) assert.equal(p.position, positionOfRole(role), `${t.name} ${role}`); else if (p.position !== 'DM') assert.equal(p.position, q.position); });
      t.squad.forEach((p) => assert.equal(p.heightCm, oById.get(p.id).heightCm));   // højden røres ikke
    }
  });
  const before = raw.league.teams.filter((t) => t.isBot).reduce((a, t) => a + outOfPos({ ...t, squad: t.squad }), 0);
  const after = L.teams.filter((t) => t.isBot).reduce((a, t) => a + outOfPos(t), 0);
  assert.ok(after <= before / 2, `botternes startere uden for position: ${before} → ${after}`);
  console.log(`# ${name}: botternes startere uden for position ${before} → ${after}`);
  assert.equal(Object.values(r.state.notes)[0], 'Notat fra v3.19.0 – skal overleve migreringen');
});

test('migrering 7 → 8: en CM på en CDM-plads bliver DM før en reserve (regel 1), og en STAR bliver det kun, hvis ingen anden CM findes', () => {
  const raw = JSON.parse(R9), me = raw.league.teams.find((t) => !t.isBot);
  me.tactics.baseFormation = '4-3-3';
  const cdm = FORMATIONS['4-3-3'].findIndex((s) => s.r === 'CDM'), cm = me.squad.find((p) => p.position === 'CM' && p.roleTier !== 'STAR' && me.tactics.lineupSlots.includes(p.id));
  const k = me.tactics.lineupSlots.indexOf(cm.id); [me.tactics.lineupSlots[k], me.tactics.lineupSlots[cdm]] = [me.tactics.lineupSlots[cdm], me.tactics.lineupSlots[k]];
  const L = parseSave(JSON.stringify(raw)).state.league, mine = L.teams.find((t) => !t.isBot);
  assert.equal(mine.squad.find((p) => p.position === 'DM').id, cm.id);
  // Kun STAR'en er CM (ingen på CDM-plads) → ingen DM: regel 2 og 3 springer STAR over
  const raw2 = JSON.parse(R9), me2 = raw2.league.teams.find((t) => !t.isBot), star = me2.squad.find((p) => p.roleTier === 'STAR' && p.position === 'CM');
  for (const p of me2.squad) if (p.position === 'CM' && p !== star) p.position = 'AM';
  assert.equal(parseSave(JSON.stringify(raw2)).state.league.teams.find((t) => !t.isBot).squad.filter((p) => p.position === 'DM').length, 0, 'STAR bliver ikke DM');
});
