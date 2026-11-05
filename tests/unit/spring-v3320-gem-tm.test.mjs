// Test Manager v3.32.0: et fund, ikke en mutant. sanitize.js (træningsrapporten) beholdt kun gains, hvis evnen stod i p.skills –
// og Spring står uden for p.skills (p.jumpingPower). Efter HVER genindlæsning forsvandt "+1 Spring" fra rapporten: "Sidste runde" på
// Træning, Trups "+N" i Spring-kolonnen og "Ingen +1 efter runde R" (hvis Spring var det eneste) løj. Rød før rettelsen i sanitize.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
globalThis.Node = FakeNode;
globalThis.document = { createElement: () => ({}), createTextNode: () => ({}) };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { keyAvg } = await import('../../public/engine/career.js');
const { afterSkillChange, trainRound } = await import('../../public/engine/season.js');
const { parseSave, serialize } = await import('../../public/state/storage.js');
const own = (L) => L.teams.find((t) => !t.isBot);
function tobias(L) {
  const p = own(L).squad.find((x) => x.line === 'DEF');
  Object.assign(p, { age: 20, jumpingPower: 13, trainingFocus: 'PHYSICAL', dev: {}, injuryMatchesLeft: 0, banMatches: 0 });
  p.skills.strength = 13; p.potential = keyAvg(p) + 1.5;
  afterSkillChange(p);
  return p;
}

test('rapporten overlever en genindlæsning: "+1 Spring" fra trainRound står stadig i trainingReport efter parseSave(serialize()) (sanitize må ikke droppe Spring)', () => {
  const L = createLeague(createRng(69)), me = own(L), p = tobias(L, 'PHYSICAL');
  p.dev.jumpingPower = 0.99; p.dev.pace = 0.99;
  trainRound(L, { round: 1, matches: [] }, new Map());
  const before = L.trainingReport[me.id].gains.filter((g) => g.id === p.id).map((g) => g.skill).sort();
  assert.deepEqual(before, ['jumpingPower', 'pace'], 'data: Spring og Fart steg i samme runde');
  const r = parseSave(serialize({ league: L, notes: {}, ui: {} }));
  assert.ok(r.ok, r.error);
  const after = r.state.league.trainingReport[me.id].gains.filter((g) => g.id === p.id).map((g) => g.skill).sort();
  assert.deepEqual(after, before, 'Træning-fanen og Trup ("+N" i Spring) læser rapporten efter hver genindlæsning');
  // sanitize skal stadig fjerne det, der ikke er en evne
  const bad = JSON.parse(serialize({ league: L, notes: {}, ui: {} }));
  bad.league.trainingReport[me.id].gains.push({ id: p.id, skill: 'heightCm' }, { id: p.id, skill: 'xyz' }, { id: p.id, skill: 'aerialPower' });
  const r2 = parseSave(JSON.stringify(bad));
  assert.ok(r2.ok, r2.error);
  assert.deepEqual(r2.state.league.trainingReport[me.id].gains.filter((g) => g.id === p.id).map((g) => g.skill).sort(), before);
});
