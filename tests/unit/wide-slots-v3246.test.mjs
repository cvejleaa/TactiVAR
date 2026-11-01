// v3.24.6 (brugeren: "i en 3-5-2 opstilling har jeg 2 midtbane kanter der får straf for at være uden for position … Hvis jeg
// trækker min wing længere tilbage så han mere er back end midtbanespiller, skal vi også have tilpasset straffen"):
// på en kantplads afgør dybden (y) om det er en kant- eller back-plads – ikke rollenavnet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitOf, slotFitOf, slotPositionOf, FIT, FORMATIONS, WIDE_MID_Y, WIDE_BACK_Y } from '../../public/engine/formations.js';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { setFormation, outOfPositionCount, moveSlot } from '../../public/state/actions.js';

const slotOf = (f, r) => FORMATIONS[f].findIndex((s) => s.r === r);

test('3-5-2: LWB/RWB står højt (y 46) = kant-plads – kant 100 %, back på naboplads', () => {
  for (const r of ['LWB', 'RWB']) {
    const y = FORMATIONS['3-5-2'][slotOf('3-5-2', r)].y;
    assert.ok(y <= WIDE_MID_Y, `data: ${r} y ${y}`);
    assert.equal(fitOf('WM', r, y), FIT.own); assert.equal(fitOf('FB', r, y), FIT.near);
  }
});

test('5-3-2/5-4-1: LWB/RWB står dybt (y 64) = back-plads – back 100 %, kant på naboplads; LB/LM som før', () => {
  for (const f of ['5-3-2', '5-4-1']) for (const r of ['LWB', 'RWB']) {
    const y = FORMATIONS[f][slotOf(f, r)].y;
    assert.equal(fitOf('FB', r, y), FIT.own, `${f} ${r}`); assert.equal(fitOf('WM', r, y), FIT.near, `${f} ${r}`);
  }
  assert.equal(fitOf('FB', 'LB', 70), FIT.own); assert.equal(fitOf('WM', 'LB', 70), FIT.near);
  assert.equal(fitOf('WM', 'LM', 45), FIT.own); assert.equal(fitOf('FB', 'LM', 45), FIT.near);
  assert.equal(fitOf('WM', 'LW', 80), FIT.own, 'LW er altid kant (ikke en kantplads i denne forstand)');
  assert.equal(fitOf('CM', 'LWB', 46), FIT.near, 'CM på en høj kantplads = naboplads (CM-WM)');
  assert.equal(fitOf('CB', 'LWB', 64), FIT.near, 'CB på en dyb kantplads = naboplads (CB-FB)');
  assert.equal(fitOf('ST', 'LWB', 64), FIT.other);
});

test('overgangszonen (55 < y < 60): både back og kant passer; grænserne er skarpe', () => {
  assert.equal(slotPositionOf('LWB', 57), 'WIDE');
  assert.equal(fitOf('WM', 'LB', 57), FIT.own); assert.equal(fitOf('FB', 'LM', 57), FIT.own);
  assert.equal(fitOf('CM', 'LM', 57), FIT.near, 'CM nabo til kant'); assert.equal(fitOf('CB', 'LM', 57), FIT.near, 'CB nabo til back');
  assert.equal(fitOf('FB', 'LM', WIDE_MID_Y), FIT.near); assert.equal(fitOf('WM', 'LB', WIDE_BACK_Y), FIT.near);
  assert.equal(fitOf('FB', 'LM', WIDE_MID_Y + 0.5), FIT.own); assert.equal(fitOf('WM', 'LB', WIDE_BACK_Y - 0.5), FIT.own);
  assert.equal(fitOf('WM', 'LWB'), FIT.near, 'uden y: rollens standard (back) som før');
});

test('Taktik: trækker du en kant ned på 3-5-2-wingbacken, kommer straffen – trækker du ham op igen, forsvinder den', () => {
  const L = createLeague(createRng(4)), me = L.teams.find((t) => !t.isBot);
  setFormation(me, '3-5-2');
  const slot = slotOf('3-5-2', 'LWB'), wing = me.squad.find((p) => p.position === 'WM' && !me.tactics.lineupSlots.slice(1).includes(p.id)) ?? me.squad.find((p) => p.position === 'WM');
  me.tactics.lineupSlots[slot] = wing.id;
  assert.equal(slotFitOf(me.tactics, slot, 'WM'), FIT.own, 'høj: ingen straf');
  const x = FORMATIONS['3-5-2'][slot].x;
  moveSlot(me, slot, { x, y: 68 });
  assert.equal(slotFitOf(me.tactics, slot, 'WM'), FIT.near, 'trukket ned til back-dybde: naboplads');
  moveSlot(me, slot, { x, y: 46 });
  assert.equal(slotFitOf(me.tactics, slot, 'WM'), FIT.own);
  assert.equal(typeof outOfPositionCount(me), 'number');
});

test('kæden følger dybden som prisen: 3-5-2-wingback = midtbane, 5-3-2-wingback = forsvar, trukket ned = forsvar', async () => {
  const { lineOfRole, slotLineOf, WIDE_LINE_Y } = await import('../../public/engine/formations.js');
  const y352 = FORMATIONS['3-5-2'][slotOf('3-5-2', 'LWB')].y, y532 = FORMATIONS['5-3-2'][slotOf('5-3-2', 'LWB')].y;
  assert.equal(lineOfRole('LWB', y352), 'MID'); assert.equal(lineOfRole('RWB', y352), 'MID');
  assert.equal(lineOfRole('LWB', y532), 'DEF'); assert.equal(lineOfRole('LB', 70), 'DEF'); assert.equal(lineOfRole('LM', 45), 'MID');
  assert.equal(lineOfRole('LWB'), 'DEF', 'uden y: som før'); assert.equal(lineOfRole('LW', 80), 'ATT', 'LW er ikke en kantplads');
  assert.equal(lineOfRole('LM', WIDE_LINE_Y - 0.1), 'MID'); assert.equal(lineOfRole('LM', WIDE_LINE_Y), 'DEF');
  const L = createLeague(createRng(4)), me = L.teams.find((t) => !t.isBot); setFormation(me, '3-5-2');
  const s = slotOf('3-5-2', 'LWB'); assert.equal(slotLineOf(me.tactics, s), 'MID');
  moveSlot(me, s, { x: FORMATIONS['3-5-2'][s].x, y: 68 }); assert.equal(slotLineOf(me.tactics, s), 'DEF');
});
