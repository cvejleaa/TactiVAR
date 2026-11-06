// v3.32.2-rettelserne efter QC og Spilfører UI (ui/varmoment.js): rammen lukker før tid ved et nyt mål/rødt efter kendelsen,
// kendelseslinjen nævner holdet og er grøn/rød for DIT hold, og fokus falder tilbage til ⚡, når rammen forsvinder.
// Rammens placering, role="group", lyden ved fanevalg og #live-status ved ny runde: tests/e2e/run.mjs "v3.32.2 TM".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { varFrame, varSequence, varLog, verdictTone, verdictIndex, refocusId, FRAME_AFTER } from '../../public/ui/varmoment.js';

const ev = (type, v, isHome = true) => ({ type, isHome, ...(v ? { var: v } : {}) });
const plain = (n) => Array.from({ length: n }, () => ev('PASS'));
const chk = (verdict = 'OVERTURNED', type = 'VAR_CHECK', kind = 'OFFSIDE', isHome = true) => ev(type, { kind, verdict }, isHome);

test('varFrame lukker (null), når et nyt GOAL/HEADER_GOAL/RED vises EFTER kendelsen – ikke før, og ikke ved kendelsen selv', () => {
  assert.equal(FRAME_AFTER, 5);
  for (const closer of ['GOAL', 'HEADER_GOAL', 'RED']) {
    // tjek (2), kendelse (3), en almindelig hændelse (4), det nye mål/rødt (5) – rammen ville ellers stå til 3 + 5 = 8
    const evs = [...plain(2), chk(), ev('VAR_NO_GOAL'), ev('PASS'), ev(closer), ...plain(6)];
    for (const last of [2, 3, 4]) assert.ok(varFrame(evs, last), `${closer}: rammen står ved ${last}`);
    for (let last = 5; last <= 9; last++) assert.equal(varFrame(evs, last), null, `${closer}: lukket ved ${last}`);
    // uden det nye mål stod rammen til 8 (beviset for, at det er målet, der lukker)
    const calm = [...plain(2), chk(), ev('VAR_NO_GOAL'), ...plain(8)];
    for (let last = 5; last <= 8; last++) assert.ok(varFrame(calm, last), `uden ${closer}: står ved ${last}`);
  }
  // Kendelsen er selv et mål (VAR_CHECK STANDS → GOAL; VAR_RED CONFIRMED → RED): lukker IKKE
  const st = [...plain(2), chk('STANDS'), ev('GOAL'), ...plain(8)];
  for (let last = 3; last <= 8; last++) assert.ok(varFrame(st, last)?.reached, `STANDS-målet er kendelsen: ${last}`);
  const rc = [...plain(2), chk('CONFIRMED', 'VAR_RED', 'RED'), ev('RED'), ...plain(8)];
  for (let last = 3; last <= 8; last++) assert.ok(varFrame(rc, last)?.reached, `RED er kendelsen: ${last}`);
  // …men et mål EFTER STANDS-målet lukker
  const st2 = [...plain(2), chk('STANDS'), ev('GOAL'), ev('PASS'), ev('HEADER_GOAL'), ...plain(4)];
  assert.ok(varFrame(st2, 4)); assert.equal(varFrame(st2, 5), null);
  // Tjekket uden kendelse endnu (sidste hændelse): rammen står
  assert.ok(varFrame([...plain(3), chk()], 3));
  // Et nyt tjek efter kendelsen: rammen for det NYE tjek (ikke den gamle kendelse)
  const two = [...plain(2), chk(), ev('VAR_NO_GOAL'), ev('PASS'), chk('CONFIRMED', 'VAR_RED', 'RED', false), ev('RED', null, false), ...plain(6)];
  const fr = varFrame(two, 5);
  assert.equal(fr.seq.check, 5); assert.equal(fr.seq.type, 'VAR_RED'); assert.equal(fr.reached, false);
  assert.equal(varFrame(two, 6).seq.check, 5, 'kendelsen af det nye tjek (RED) lukker ikke dets egen ramme');
  // Et ikke-lukkende hændelse (SAVE, YELLOW) efter kendelsen lukker ikke
  const keep = [...plain(2), chk(), ev('VAR_NO_GOAL'), ev('SAVE'), ev('YELLOW'), ...plain(6)];
  for (let last = 4; last <= 8; last++) assert.ok(varFrame(keep, last), `SAVE/YELLOW lukker ikke: ${last}`);
});

const TEAM = (home) => (home ? 'Hjemme FC' : 'Ude Boys');
const one = (type, verdict, isHome, kind = 'OFFSIDE') => varSequence([ev(type, { kind, verdict, cast: {} }, isHome), ev('X')], 0);
test('kendelseslinjen nævner holdet (det angribende ved mål/straffe, holdet med kortet ved rødt) – uden holdnavn de gamle ord', () => {
  const W = [
    ['VAR_CHECK', 'STANDS', true, '✅ Hjemme FCs mål står', '✅ Målet står'],
    ['VAR_CHECK', 'OVERTURNED', false, "❌ Ude Boys' mål annulleret", '❌ Målet annulleret'],
    ['VAR_PEN', 'STANDS', true, '✅ Straffen til Hjemme FC står', '✅ Straffen står'],
    ['VAR_PEN', 'OVERTURNED', false, '❌ Ingen straffe til Ude Boys', '❌ Ingen straffe'],
    ['VAR_RED', 'CONFIRMED', false, '🟥 Rødt til Ude Boys står', '🟥 Rødt står'],
    ['VAR_RED', 'DOWNGRADED', true, '🟨 Rødt til Hjemme FC bliver gult', '🟨 Rødt bliver gult'],
    ['VAR_RED', 'UPGRADED', true, '🟥 Opgraderet: rødt til Hjemme FC', '🟥 Opgraderet til rødt'],
  ];
  for (const [type, verdict, home, withTeam, without] of W) {
    const s = one(type, verdict, home, type === 'VAR_RED' ? 'RED' : 'OFFSIDE');
    assert.equal(varLog(s, true, () => null, TEAM).at(-1), withTeam, `${type}/${verdict}`);
    assert.equal(varLog(s, true, () => null).at(-1), without, `${type}/${verdict} uden team`);
    assert.equal(varLog(s, true, () => null, () => null).at(-1), without, `${type}/${verdict} team → null`);
    // det ANDET hold står aldrig i kendelsen
    assert.ok(!varLog(s, true, () => null, TEAM).at(-1).includes(TEAM(!home)), `${type}/${verdict}: kun holdet selv`);
  }
  // ét-trins straffe uændret
  assert.deepEqual(varLog(one('VAR_PEN', 'AWARDED', false, 'PENALTY'), true, () => null, TEAM), ['📺 Straffe til Ude Boys']);
  // aldrig ev.text: hændelsen har en tekst, linjen er tabellens
  const s = varSequence([{ ...ev('VAR_CHECK', { kind: 'OFFSIDE', verdict: 'STANDS' }), text: 'Målet står! hemmelig taktik' }, ev('GOAL')], 0);
  assert.ok(!varLog(s, true, () => null, TEAM).some((l) => l.includes('hemmelig')));
});

test('verdictTone: grøn (v-good), når kendelsen er god for DIT hold – rød (v-bad) ellers; hver gren × dit/deres hold', () => {
  const G = { STANDS: true, AWARDED: true, OVERTURNED: false, CONFIRMED: false, UPGRADED: false, DOWNGRADED: true };
  const TYPE = { STANDS: 'VAR_CHECK', OVERTURNED: 'VAR_CHECK', AWARDED: 'VAR_PEN', CONFIRMED: 'VAR_RED', UPGRADED: 'VAR_RED', DOWNGRADED: 'VAR_RED' };
  for (const [verdict, good] of Object.entries(G)) for (const home of [true, false]) for (const meHome of [true, false]) {
    const s = one(TYPE[verdict], verdict, home), mine = home === meHome;
    assert.equal(verdictTone(s, (h) => h === meHome), (good === mine) ? 'v-good' : 'v-bad', `${verdict} hold=${home} mig=${meHome}`);
  }
  // konkret: dit mål annulleret = rødt; deres røde kort står = grønt for dig; straffen mod dig står = rødt
  assert.equal(verdictTone(one('VAR_CHECK', 'OVERTURNED', true), (h) => h), 'v-bad');
  assert.equal(verdictTone(one('VAR_RED', 'CONFIRMED', false), (h) => h), 'v-good');
  assert.equal(verdictTone(one('VAR_PEN', 'STANDS', false), (h) => h), 'v-bad');
  assert.equal(verdictTone(one('VAR_PEN', 'STANDS', true), (h) => h), 'v-good');
  assert.equal(verdictTone(one('VAR_CHECK', 'UKENDT', true), (h) => h), null);
  assert.equal(verdictTone(null, (h) => h), null);
});

test('verdictIndex: kendelsen er sidste linje, når den er vist; den første ved dømt straffe; ellers ingen', () => {
  const s = one('VAR_CHECK', 'OVERTURNED', true), L = ['a', 'b', 'c'];
  assert.equal(verdictIndex(s, true, L), 2); assert.equal(verdictIndex(s, false, L), -1);
  assert.equal(verdictIndex(one('VAR_PEN', 'AWARDED', true, 'PENALTY'), true, ['📺 Straffe til X', 'y']), 0);
  assert.equal(verdictIndex(one('VAR_RED', 'UPGRADED', true, 'RED'), true, L), 2);
  assert.equal(verdictIndex(one('VAR_CHECK', 'UKENDT', true), true, L), -1);
  assert.equal(verdictIndex(s, true, []), -1);
});

test('refocusId: samme id → id; "Vis kendelsen ›" væk → rammen; rammen væk → ⚡ (#skip); ⚡ væk → ingen flytning', () => {
  const has = (...ids) => (x) => ids.includes(x);
  assert.equal(refocusId(null, has('skip')), null);
  assert.equal(refocusId('sound-toggle', has('sound-toggle', 'skip')), 'sound-toggle');
  assert.equal(refocusId('var-show', has('var-show', 'var-frame', 'skip')), 'var-show');
  assert.equal(refocusId('var-show', has('var-frame', 'skip')), 'var-frame');
  assert.equal(refocusId('var-show', has('skip')), 'skip', 'knap og ramme væk');
  assert.equal(refocusId('var-frame', has('skip')), 'skip');
  assert.equal(refocusId('var-frame', has()), null, 'slutfløjt: ingen ⚡');
  assert.equal(refocusId('var-show', has()), null);
  assert.equal(refocusId('sound-toggle', has('skip')), null, 'kun fokus fra rammen falder tilbage til ⚡');
});
