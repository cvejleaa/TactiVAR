// v3.18.0 (7): sæsonskiftet – pension, +1 år, aldersfald, vækst, ny løn, ungdom, reparerede opstillinger, øjebliksbilledet (B1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound, endSeason } from '../../public/engine/season.js';
import { retireChance, willRetire, declineSkills, seasonGrowth, refreshValue, publicWage, freeShirt, botYouthTake, repairLineup, trainedSkills, LOG, SQUAD_MAX } from '../../public/engine/career.js';
import { takeYouth, dropYouth } from '../../public/state/actions.js';
import { endedSeasonView } from '../../public/ui/stats.js';

const own = (L) => L.teams.find((t) => !t.isBot);
// En liga lige før sæsonens sidste runde; prep(L) kører før runde 14
function toSeasonEnd(seed = 4, prep = () => {}) {
  const L = createLeague(createRng(seed)), rng = createRng(seed * 3);
  for (let r = 0; r < 13; r++) commitRound(L, playRound(L, rng), rng);
  prep(L);
  commitRound(L, playRound(L, rng), rng);
  return L;
}

test('pension: 0 under 31, ¼ ½ ¾ fra 31, sikker ved 34 – målmænd to år senere; samme svar hver gang (varslet = udfaldet)', () => {
  const f = (age, line = 'MID') => retireChance({ age, line });
  assert.deepEqual([30, 31, 32, 33, 34, 40].map((a) => f(a)), [0, 0.25, 0.5, 0.75, 1, 1]);
  assert.deepEqual([32, 33, 35, 36].map((a) => f(a, 'GK')), [0, 0.25, 0.75, 1]);
  const p = { id: 'plr_x', age: 32, line: 'DEF' };
  assert.equal(willRetire(p, 3), willRetire(p, 3));
  const outcomes = Array.from({ length: 40 }, (_, s) => willRetire(p, s));
  assert.ok(outcomes.includes(true) && outcomes.includes(false), 'afhænger af sæsonen');
  assert.equal(willRetire({ id: 'y', age: 30, line: 'MID' }, 1), false);
});

test('sæsonslut: alle bliver +1 år, footballYear +1 – men endSeason alene (migreringen) ælder ingen', () => {
  const M = createLeague(createRng(4)), ages = M.teams.flatMap((t) => t.squad.map((p) => p.age));
  endSeason(M, 0, false);
  assert.deepEqual(M.teams.flatMap((t) => t.squad.map((p) => p.age)), ages);
  let before;
  const L = toSeasonEnd(4, (L) => { before = new Map(L.teams.flatMap((t) => t.squad.map((p) => [p.id, [p.age, p.seasonAgeCounter]]))); });
  for (const t of L.teams) for (const p of t.squad) if (before.has(p.id)) { assert.equal(p.age, before.get(p.id)[0] + 1, p.id); assert.equal(p.seasonAgeCounter, before.get(p.id)[1] + 1); }
  assert.equal(L.leagueMetadata.footballYear, 2);
});

test('pension ved sæsonslut: spilleren forlader truppen, står i league.retired og rapporten; spejder-noterne om ham slettes', () => {
  let vet, gk, team;
  const L = toSeasonEnd(4, (L) => {
    team = L.teams[2]; vet = team.squad.find((p) => p.line === 'DEF' && team.tactics.lineupSlots.includes(p.id)); vet.age = 36;
    gk = own(L).squad.find((p) => p.line === 'MID'); gk.age = 34;
    L.scouting[own(L).id][vet.id] = ['[Runde 3] noget'];
  });
  assert.ok(!team.squad.some((p) => p.id === vet.id));
  assert.ok(!own(L).squad.some((p) => p.id === gk.id), 'også dit hold – pension er ikke økonomi (B5 gælder salg)');
  assert.ok(L.retired.some((r) => r.id === vet.id && r.age === 36 && r.season === 1));
  assert.ok(L.turnoverReport.retired.some((r) => r.id === gk.id && r.teamId === own(L).id));
  assert.equal(L.scouting[own(L).id][vet.id], undefined);
});

test('opstillingen repareres (B3): den tomme plads får en fra samme kæde, Hvis-Så-skift med den stoppede ryddes, bænken er gyldig', () => {
  let vet, team, slot;
  const L = toSeasonEnd(4, (L) => {
    team = L.teams[3]; slot = 2; vet = team.squad.find((p) => p.id === team.tactics.lineupSlots[slot]); vet.age = 36;
    team.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 60, condition: 'ANY', margin: 1, newFormation: null, newPlan: null, slotRemapping: Array.from({ length: 11 }, (_, i) => i), action: 'SUB', subOut: vet.id, subIn: team.squad[15].id }];
  });
  const repl = team.squad.find((p) => p.id === team.tactics.lineupSlots[slot]);
  assert.ok(repl, 'pladsen er udfyldt'); assert.equal(repl.line, vet.line);
  assert.equal(new Set(team.tactics.lineupSlots).size, 11);
  assert.equal(team.tactics.conditionalRules[0].subOut, null);
  const on = new Set(team.tactics.lineupSlots);
  assert.ok(team.matchBench.every((id) => !on.has(id) && team.squad.some((p) => p.id === id)));
  assert.equal(team.squad.find((p) => p.id === team.tactics.lineupSlots[0]).line, 'GK');
});

test('repairLineup: findes ingen fra samme kæde, tages en markspiller – aldrig målmanden', () => {
  const L = createLeague(createRng(9)), t = L.teams[1];
  const slot = t.tactics.lineupSlots.findIndex((id) => t.squad.find((p) => p.id === id).line === 'ATT');
  const gone = t.squad.find((p) => p.id === t.tactics.lineupSlots[slot]);
  t.squad = t.squad.filter((p) => p.line !== 'ATT' || t.tactics.lineupSlots.includes(p.id));   // ingen ANG på bænken
  t.squad = t.squad.filter((p) => p.id !== gone.id);
  repairLineup(t, new Map([[gone.id, 'ATT']]));
  const r = t.squad.find((p) => p.id === t.tactics.lineupSlots[slot]);
  assert.ok(r && r.line !== 'GK');
});

test('aldersfald: ingen før 30 (MV 32); en 35-årig falder; træning halverer faldet i de trænede evner', () => {
  const mk = (age, line = 'MID', id = 'p') => ({ id, age, line, skills: { pace: 12, stamina: 12, strength: 12, ballControl: 12, passing: 12, finishing: 12, positioning: 12, intercepting: 12, goalkeeping: 12 } });
  assert.deepEqual(declineSkills(mk(29), 1), []);
  assert.deepEqual(declineSkills(mk(31, 'GK'), 1), []);
  let free = 0, trained = 0;
  for (let i = 0; i < 400; i++) {
    free += declineSkills(mk(33, 'MID', `a${i}`), 1).filter((s) => s === 'pace' || s === 'stamina').length;
    trained += declineSkills(mk(33, 'MID', `a${i}`), 1, new Set(['pace', 'stamina'])).filter((s) => s === 'pace' || s === 'stamina').length;
  }
  // 33 år: 0,35 + 3 · 0,15 = 0,80 pr. evne → ≈ 640 af 800; trænet ≈ 320
  assert.ok(free > 560 && free < 720, String(free));
  assert.ok(trained > 250 && trained < 390, String(trained));
  assert.deepEqual([...trainedSkills({ line: 'MID', trainingFocus: 'REST' }, false)], []);
  assert.deepEqual([...trainedSkills({ line: 'MID', trainingFocus: 'FINISH' }, true)], ['passing', 'ballControl', 'stamina'], 'botterne: Alsidig');
});

test('vækst ved sæsonslut: en 18-årig med plads vokser i nøgle-evnerne – en 24-årig ikke', () => {
  const L = createLeague(createRng(4)), p = L.teams[0].squad.find((x) => x.line === 'ATT');
  p.age = 18; p.potential = 19; p.dev = {}; p.matchLog = [];
  seasonGrowth(p, 1);
  assert.equal(p.dev.finishing ?? 0, 0.72, '1,2 · 1 · 0,6 (ingen kampe) = 0,72');
  const q = L.teams[0].squad.find((x) => x.line === 'MID'); q.age = 24; q.potential = 19; q.dev = {};
  assert.deepEqual(seasonGrowth(q, 1), []); assert.deepEqual(q.dev, {});
  // Brug: 14 kampe i sæsonen → 1,2 · 1 · 1,0 = 1,2 → +1 og 0,2 i rest
  const r = L.teams[1].squad.find((x) => x.line === 'ATT'); r.age = 18; r.potential = 19; r.dev = {}; const f0 = r.skills.finishing;
  r.matchLog = Array.from({ length: 14 }, () => [1, 1, 0, 1, 0, 0, 90, 6, 2, 0, 0]);
  seasonGrowth(r, 1);
  assert.equal(r.skills.finishing, f0 + 1); assert.equal(r.dev.finishing, 0.2);
});

test('løn genforhandles ved sæsonslut (stjerner og alder), og værdi-stjernerne er snittet af de seneste 5 kampe', () => {
  const p = { matchLog: [[1, 1, 0, 1, 0, 0, 90, 6, 1, 0, 0], [1, 2, 0, 1, 0, 0, 90, 6, 2, 0, 0], [1, 3, 0, 1, 0, 0, 90, 6, 3, 0, 0], [1, 4, 0, 1, 0, 0, 90, 6, 4, 0, 0], [1, 5, 0, 1, 0, 0, 90, 6, 4, 0, 0], [1, 6, 0, 1, 0, 0, 90, 6, 4, 0, 0]] };
  refreshValue(p); assert.equal(p.valueStars, 3.4);   // (2 + 3 + 4 + 4 + 4) / 5 – den første (1) er for gammel
  const q = { matchLog: [[1, 1, 0, 1, 0, 0, 90, 6, 5, 0, 0], [1, 2, 0, 1, 0, 0, 90, 6, 5, 0, 0]], valueStars: 2 };
  refreshValue(q); assert.equal(q.valueStars, 2, 'under 3 kampe: uændret');
  const L = toSeasonEnd(5);
  for (const t of L.teams) for (const x of t.squad) assert.equal(x.weeklyWage, publicWage(x), x.id);
});

test('ungdom: dit hold får 2 tilbud (ikke i truppen endnu), botterne tager selv op efter truppens størrelse; nye id\'er, numre og navne', () => {
  let sizes;
  const L = toSeasonEnd(6, (L) => { sizes = new Map(L.teams.map((t) => [t.id, t.squad.length])); });
  const me = own(L);
  assert.equal(me.youthOffers.length, 2);
  assert.equal(me.squad.length, sizes.get(me.id) - L.turnoverReport.retired.filter((r) => r.teamId === me.id).length);
  for (const y of me.youthOffers) { assert.match(y.id, /^plr_y\d+$/); assert.ok(y.age >= 16 && y.age <= 18); assert.equal(y.roleTier, 'YOUTH'); assert.ok(y.shirtNumber >= 19); assert.equal(y.weeklyWage, publicWage(y)); }
  for (const t of L.teams.filter((x) => x.isBot)) {
    const n = sizes.get(t.id) - L.turnoverReport.retired.filter((r) => r.teamId === t.id).length;
    assert.equal(t.squad.length, n + botYouthTake(n, [1, 2]).length, t.name);
    assert.deepEqual(t.youthOffers, []);
  }
  const all = L.teams.flatMap((t) => t.squad).concat(me.youthOffers);
  assert.equal(new Set(all.map((p) => p.id)).size, all.length, 'id\'er unikke');
  assert.equal(new Set(all.map((p) => p.shortName)).size, all.length, 'navne unikke');
  for (const t of L.teams) assert.equal(new Set(t.squad.map((p) => p.shirtNumber)).size, t.squad.length, `${t.name}: numre unikke`);
  assert.deepEqual([17, 18, 19, 20, 21, 23].map((n) => botYouthTake(n, ['a', 'b']).length), [2, 2, 2, 1, 1, 0]);
});

test('under 18 efter pension: dit hold fyldes op med ungdom automatisk (aldrig under sanitize-grænsen)', () => {
  const L = toSeasonEnd(6, (L) => { const me = own(L); me.squad.filter((p) => !me.tactics.lineupSlots.includes(p.id)).slice(0, 3).forEach((p) => { p.age = 36; }); });
  const me = own(L);
  assert.equal(me.squad.length, 18);
  assert.equal(L.turnoverReport.youthTaken.filter((y) => y.teamId === me.id).length, 3 - 0);
});

test('ungdomstilbud: Tag op (højst 25, ikke i minus), Lad gå – og ubesvarede går ved næste runde', () => {
  const L = toSeasonEnd(6), me = own(L), [a, b] = me.youthOffers, n = me.squad.length;
  me.cashBalance = -1;
  assert.match(takeYouth(me, a.id), /minus/); assert.equal(me.squad.length, n);
  me.cashBalance = 1000;
  assert.equal(takeYouth(me, a.id), null); assert.equal(me.squad.length, n + 1); assert.ok(me.squad.some((p) => p.id === a.id));
  assert.match(takeYouth(me, a.id), /udløbet/);
  dropYouth(me, b.id); assert.deepEqual(me.youthOffers, []);
  const L2 = toSeasonEnd(6), me2 = own(L2);
  while (me2.squad.length < SQUAD_MAX) me2.squad.push({ ...me2.squad[17], id: `fill${me2.squad.length}` });
  assert.match(takeYouth(me2, me2.youthOffers[0].id), /fuld/);
  const rng = createRng(1);
  commitRound(L2, playRound(L2, rng), rng);
  assert.deepEqual(me2.youthOffers, [], 'udløbet ved næste runde');
});

test('B1: den afsluttede sæsons statistik har topscoreren under sit gamle hold, selv om han er stoppet', () => {
  let top, team;
  const L = toSeasonEnd(4, (L) => {
    team = L.teams[5]; top = team.squad.find((p) => p.line === 'ATT'); top.sGoals = 40; top.sGames = 13; top.age = 36;
  });
  assert.ok(!team.squad.some((p) => p.id === top.id), 'stoppet');
  const v = endedSeasonView(L);
  const row = v.teams.find((t) => t.id === team.id).squad.find((p) => p.id === top.id);
  assert.ok(row); assert.ok(row.sGoals >= 40, String(row.sGoals)); assert.equal(row.shortName, top.shortName); assert.equal(row.shirtNumber, top.shirtNumber);
  assert.ok(!v.teams.filter((t) => t.id !== team.id).some((t) => t.squad.some((p) => p.id === top.id)));
});

test('freeShirt: laveste ledige fra 19 – også forbi de tilbud, der allerede er givet', () => {
  const t = { squad: Array.from({ length: 18 }, (_, i) => ({ shirtNumber: i + 1 })).concat([{ shirtNumber: 19 }, { shirtNumber: 21 }]) };
  assert.equal(freeShirt(t), 20);
  assert.equal(freeShirt(t, [{ shirtNumber: 20 }]), 22);
});

test('en låst-op arketype forbliver låst op, selv om evnen falder med alderen', () => {
  const L = toSeasonEnd(4, (L) => {
    for (const p of L.teams.flatMap((t) => t.squad).filter((p) => p.archetype)) { p.archetype.isUnlocked = true; p.age = 33; p.line === 'GK' || (p.trainingFocus = 'REST'); }
  });
  const arch = L.teams.flatMap((t) => t.squad).filter((p) => p.archetype && p.age === 34);
  assert.ok(arch.length > 0);
  assert.ok(arch.every((p) => p.archetype.isUnlocked));
});


test('sæsonskiftet bruger dit træningsfokus mod aldersfaldet (den samme beregning som declineSkills med de trænede evner)', () => {
  let expected;
  const L = toSeasonEnd(4, (L) => {
    const me = own(L);
    for (const p of me.squad) { p.age = 30; p.trainingFocus = 'PHYSICAL'; }
    expected = new Map(me.squad.map((p) => { const c = structuredClone(p); c.age = 31; declineSkills(c, 1, trainedSkills(c, false)); return [p.id, c.skills]; }));
  });
  // Rundens træning og kamp-xp kan have løftet en evne – sammenlign kun de evner, kampen og træningen ikke rører (PHYSICAL: fart, styrke)
  for (const p of own(L).squad) if (expected.has(p.id)) for (const s of ['pace', 'strength']) assert.ok(p.skills[s] <= expected.get(p.id)[s] + 1 && p.skills[s] >= expected.get(p.id)[s], `${p.id} ${s}`);
  const fell = own(L).squad.filter((p) => expected.has(p.id)).map((p) => ['pace', 'strength'].map((s) => expected.get(p.id)[s]).join());
  assert.ok(fell.length > 10);
});

test('freeShirt starter ved 19, selv om lavere numre er ledige', () => {
  assert.equal(freeShirt({ squad: [{ shirtNumber: 5 }] }), 19);
});

test('en bot med 22 spillere tager ingen ungdom op (offentlig regel – ikke alle tilbud)', () => {
  let bot;
  const L = toSeasonEnd(6, (L) => { bot = L.teams[4]; while (bot.squad.length < 22) bot.squad.push({ ...structuredClone(bot.squad[17]), id: `fill${bot.squad.length}`, shortName: `X. Fill${bot.squad.length}`, shirtNumber: 40 + bot.squad.length, age: 20 }); });
  const retired = L.turnoverReport.retired.filter((r) => r.teamId === bot.id).length;
  assert.equal(bot.squad.length, 22 - retired + botYouthTake(22 - retired, [1, 2]).length);
  assert.ok(!L.turnoverReport.youthTaken.some((y) => y.teamId === bot.id) || 22 - retired < 22);
});

test('gem fra v3.17.0 (runde 13) → migrering → sidste runde: sæsonskiftet sker én gang, alle ældes, 2 ungdomstilbud, gemmet går igennem igen', async () => {
  const fs = await import('node:fs');
  const { parseSave, serialize } = await import('../../public/state/storage.js');
  const raw = fs.readFileSync(new URL('../fixtures/save-v3.17.0-r13.json', import.meta.url), 'utf8');
  const r = parseSave(raw); assert.ok(r.ok, r.error);
  const L = r.state.league, ages = new Map(L.teams.flatMap((t) => t.squad.map((p) => [p.id, p.age])));
  assert.equal(L.leagueMetadata.round, 13);
  const rng = createRng(5);
  commitRound(L, playRound(L, rng), rng);
  assert.equal(L.leagueMetadata.seasonNumber, 2);
  for (const t of L.teams) for (const p of t.squad) if (ages.has(p.id)) assert.equal(p.age, ages.get(p.id) + 1);
  assert.equal(own(L).youthOffers.length, 2);
  assert.equal(L.turnoverReport.season, 1);
  const again = parseSave(serialize(r.state));
  assert.ok(again.ok, again.error); assert.ok(!again.migratedFrom, 'skema 7 – ingen migrering igen');
  assert.deepEqual(again.state.league.teams.map((t) => t.squad.length), L.teams.map((t) => t.squad.length));
});
