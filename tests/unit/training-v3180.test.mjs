// v3.18.0 (5): træning pr. spiller – fremgang efter alder og loft, prisen i friskhed, hvile, skader, botterne træner Alsidig
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { trainRound } from '../../public/engine/season.js';
import { FOCUS, KEY_SKILLS, keyAvg, ageTrain, roomOf, validFocus } from '../../public/engine/career.js';
import { aerialBreakdown } from '../../public/engine/generator.js';
import { viewPlayer, canSeeField } from '../../public/engine/visibility.js';

const fresh = () => createLeague(createRng(7));
// Én runde uden kampe (ingen minutter) – eller med de givne minutter
const round = (L, r, minutes = new Map()) => { L.teams.forEach((t) => t.squad.forEach((p) => { p.injuryMatchesLeft = 0; })); trainRound(L, { round: r, matches: [] }, minutes); };
const own = (L) => L.teams.find((t) => !t.isBot), bot = (L) => L.teams.find((t) => t.isBot);
const att = (t) => t.squad.find((p) => p.line === 'ATT');
// Giver spilleren fuld plads til loftet (room 1) og en bestemt alder
const young = (p, age) => { p.age = age; p.potential = keyAvg(p) + 10; p.dev = {}; p.freshness = 100; return p; };

test('fremgang: Afslutning hos en 19-årig med plads = 0,12 · 1,5 · 1 = 0,18 pr. runde – +1 efter 6 runder, ikke efter 5', () => {
  const L = fresh(), p = young(att(own(L)), 19), f0 = p.skills.finishing;
  p.trainingFocus = 'FINISH';
  assert.equal(roomOf(p), 1); assert.equal(ageTrain(19), 1.5);
  for (let r = 1; r <= 5; r++) { round(L, r); p.freshness = 100; }
  assert.equal(p.skills.finishing, f0, '5 · 0,18 = 0,9 < 1');
  assert.equal(p.dev.finishing, 0.9);
  round(L, 6);
  assert.equal(p.skills.finishing, f0 + 1, '6 · 0,18 = 1,08 ≥ 1');
  assert.equal(p.dev.finishing, 0.08, 'resten bæres videre');
  // Kun den trænede evne: tempo (også nøgle-evne for ANG) rørte sig ikke
  assert.equal(p.dev.pace, undefined);
});

test('alder og loft: en 30-årig får 0,35 af fremgangen; en spiller ved sit loft 0,1', () => {
  const L = fresh(), p = young(att(own(L)), 30);
  p.trainingFocus = 'FINISH'; round(L, 1);
  assert.equal(p.dev.finishing, Math.round(0.12 * 0.35 * 1000) / 1000);   // 0,042 (en 19-årig: 0,18)
  const q = own(L).squad.filter((x) => x.line === 'ATT')[1] ?? own(L).squad.find((x) => x.line === 'MID');
  q.age = 24; q.potential = keyAvg(q); q.dev = {}; q.trainingFocus = 'TECH'; q.freshness = 100;
  assert.equal(roomOf(q), 0.1);
  round(L, 2);
  assert.equal(q.dev.passing, Math.round(0.07 * 1 * 0.1 * 1000) / 1000);  // 0,007 (med plads: 0,07)
});

test('pris: friskhed trækkes efter fokus med gulv 50 – og en spiller under gulvet løftes ikke', () => {
  const L = fresh(), t = own(L), [a, b, c] = t.squad.filter((p) => p.line !== 'GK');
  a.trainingFocus = 'STAMINA'; a.freshness = 90;
  b.trainingFocus = 'STAMINA'; b.freshness = 52;
  c.trainingFocus = 'STAMINA'; c.freshness = 45;
  round(L, 1);
  assert.equal(a.freshness, 85);   // −5
  assert.equal(b.freshness, 50);   // gulvet (uden gulv: 47)
  assert.equal(c.freshness, 45);   // hverken trukket eller løftet
});

test('hvile: +4 friskhed (højst 100) og ingen fremgang; Alsidig −2', () => {
  const L = fresh(), t = own(L), [a, b, c] = t.squad.filter((p) => p.line !== 'GK');
  a.trainingFocus = 'REST'; a.freshness = 80; a.dev = {};
  b.trainingFocus = 'REST'; b.freshness = 98;
  c.trainingFocus = 'GENERAL'; c.freshness = 80; young(c, 20); c.freshness = 80;
  round(L, 1);
  assert.equal(a.freshness, 84); assert.deepEqual(a.dev, {});
  assert.equal(b.freshness, 100);
  assert.equal(c.freshness, 78);
  // Alsidig træner alle kædens nøgle-evner: 0,03 · 1,2 · 1 = 0,036 hver
  for (const s of KEY_SKILLS[c.line]) assert.equal(c.dev[s], 0.036, s);
});

test('den, der spillede, betaler 2 mindre (Alsidig: intet) og får kamp-xp 0,02 · min/90 i nøgle-evnerne', () => {
  const L = fresh(), t = own(L), [a, b] = t.squad.filter((p) => p.line === 'MID');
  a.trainingFocus = 'TECH'; a.freshness = 80; a.dev = {}; a.potential = 0;   // room 0,1 → TECH-xp 0,007·ageTrain
  b.trainingFocus = 'GENERAL'; b.freshness = 80;
  round(L, 1, new Map([[a.id, 90], [b.id, 45]]));
  assert.equal(a.freshness, 79);   // −3 + 2
  assert.equal(b.freshness, 80);   // −2 + 2
  assert.equal(a.dev.stamina, 0.02, 'kamp-xp i en nøgle-evne, som TECH ikke træner');
});

test('skadet spiller træner ikke: hverken pris, fremgang eller ny skade', () => {
  const L = fresh(), p = young(att(own(L)), 19);
  p.trainingFocus = 'FINISH'; p.freshness = 70;
  for (const t of L.teams) for (const x of t.squad) x.injuryMatchesLeft = 0;
  p.injuryMatchesLeft = 2;
  trainRound(L, { round: 1, matches: [] }, new Map());
  assert.equal(p.freshness, 70); assert.equal(p.dev.finishing, undefined); assert.equal(p.injuryMatchesLeft, 2);
});

test('træningsskade: rulles pr. spiller og runde (afledt rng – samme udfald igen), 1–2 kampe, står i ejerens rapport', () => {
  const save = FOCUS.STAMINA.inj;
  try {
    FOCUS.STAMINA.inj = 1;
    const run = () => { const L = fresh(), p = att(own(L)); p.trainingFocus = 'STAMINA'; round(L, 3); return [L, p]; };
    const [L, p] = run(), [, p2] = run();
    assert.ok([1, 2].includes(p.injuryMatchesLeft));
    assert.equal(p2.injuryMatchesLeft, p.injuryMatchesLeft);
    assert.deepEqual(L.trainingReport[own(L).id].injuries, [p.id]);
  } finally { FOCUS.STAMINA.inj = save; }
});

test('botterne træner altid Alsidig (fast pris – fokus kan ikke aflæses af friskheden) og har ingen rapport', () => {
  const L = fresh(), t = bot(L), p = young(att(t), 20);
  p.trainingFocus = 'FINISH'; p.freshness = 90;
  round(L, 1);
  assert.equal(p.freshness, 88, 'Alsidig −2, ikke Afslutning −3');
  assert.equal(p.dev.finishing, 0.036);   // 0,03 · 1,2 (Afslutning: 0,144)
  assert.equal(L.trainingReport[t.id], undefined);
  assert.ok(L.trainingReport[own(L).id]);
});

test('Målmand-fokus gælder kun målmænd – en markspiller med det træner Alsidig', () => {
  const L = fresh(), t = own(L), gk = t.squad.find((p) => p.line === 'GK'), d = t.squad.find((p) => p.line === 'DEF');
  assert.ok(validFocus(gk, 'KEEPER')); assert.ok(!validFocus(d, 'KEEPER')); assert.ok(!validFocus(d, 'FOO'));
  d.trainingFocus = 'KEEPER'; d.freshness = 90;
  round(L, 1);
  assert.equal(d.freshness, 88); assert.equal(d.dev.goalkeeping, undefined);
});

test('rapporten: hver +1 står med spiller og evne; luftduellen regnes straks igen, når styrken stiger (QC B4)', () => {
  const L = fresh(), t = own(L), d = young(t.squad.find((p) => p.line === 'DEF'), 18);
  d.trainingFocus = 'PHYSICAL'; d.dev = { strength: 0.99 }; d.skills.strength = Math.min(d.skills.strength, 15);
  const s0 = d.skills.strength;
  round(L, 1);
  assert.equal(d.skills.strength, s0 + 1);
  assert.ok(L.trainingReport[t.id].gains.some((g) => g.id === d.id && g.skill === 'strength'));
  assert.equal(d.aerialPower, aerialBreakdown(d.heightCm, d.jumpingPower, d.skills.strength, d.skills.positioning).total);
  assert.equal(L.trainingReport[t.id].round, 1);
});

test('loftet 20: evnen går ikke over, og fremgangen hober sig ikke op', () => {
  const L = fresh(), p = young(att(own(L)), 19);
  p.trainingFocus = 'FINISH'; p.skills.finishing = 20; p.dev = { finishing: 0.95 };
  round(L, 1);
  assert.equal(p.skills.finishing, 20); assert.equal(p.dev.finishing, 0.99);
});

test('synlighed: fokus og fremgang ser kun ejeren', () => {
  assert.ok(!canSeeField('trainingFocus', false)); assert.ok(canSeeField('trainingFocus', true));
  assert.ok(!canSeeField('dev', false));
  const L = fresh(), p = own(L).squad[0];
  p.trainingFocus = 'FINISH'; p.dev = { finishing: 0.5 };
  const v = viewPlayer(p, false);
  assert.equal(v.trainingFocus, undefined); assert.equal(v.dev, undefined);
  assert.equal(viewPlayer(p, true).trainingFocus, 'FINISH');
});
