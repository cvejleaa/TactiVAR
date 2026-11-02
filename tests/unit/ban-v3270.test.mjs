// v3.27.0 (nr. 64, brugeren 2026-11-02: "Strengere" – hvert 4. gule efter målingen; tacklingerne koblet på kortene):
// udelukkelse for kort. Én vagt (career.js unavailable), reglen ét sted (banFromCards/BAN), afsones som skader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { BAN, banFromCards, unavailable, autoMatchBench } from '../../public/engine/career.js';
import { playRound, commitRound, playPairs, fixedPairs } from '../../public/engine/season.js';
import { simulateMatch, TACKLE } from '../../public/engine/match.js';
import { parseSave } from '../../public/state/storage.js';
import { viewPlayer } from '../../public/engine/visibility.js';

const own = (L) => L.teams.find((t) => !t.isBot);
// En ny liga har 18 pr. hold (7 ikke-startere = hele bænken): extra(t, n) giver n reserver mere (kopier med nyt id)
const extra = (t, n) => { for (let i = 0; i < n; i++) { const src = t.squad[1 + (i % 17)]; t.squad.push({ ...structuredClone(src), id: `${src.id}_x${i}`, shirtNumber: 60 + i }); } };

test('reglen: direkte rødt 2, rødt for to gule 1 (de to gule tæller ikke), hvert 4. gule 1 – med bogstavelige tal', () => {
  assert.deepEqual(BAN, { DIRECT: 2, SECOND_YELLOW: 1, YELLOW_EVERY: 4 });
  assert.deepEqual(banFromCards({ red: 'DIRECT' }, 0), { matches: 2, yellows: 0, why: 'DIRECT' });
  assert.deepEqual(banFromCards({ yellows: 2, red: 'SECOND_YELLOW' }, 3), { matches: 1, yellows: 3, why: 'SECOND_YELLOW' }, 'to gule bag rødt tæller ikke – ellers 2 kampe (QC)');
  // gule kort nr. 1–9: udelukkelse præcis ved 4 og 8 (før v3.27.0: aldrig; "Strengere" som valgt: ved 3, 6, 9)
  const got = [];
  for (let b = 0; b < 9; b++) got.push(banFromCards({ yellows: 1 }, b).matches);
  assert.deepEqual(got, [0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.deepEqual(banFromCards({ yellows: 1 }, 3), { matches: 1, yellows: 4, why: 'YELLOWS' });
  assert.deepEqual(banFromCards({ yellows: 1, red: 'DIRECT' }, 3), { matches: 3, yellows: 4, why: 'DIRECT' }, 'gult og så direkte rødt: gule tæller, begge straffe lægges sammen');
  assert.deepEqual(banFromCards({}, 2), { matches: 0, yellows: 2, why: null });
});

test('unavailable: skadet ELLER udelukket – positivt genkendt; botternes udtagelse vælger ham ikke', () => {
  assert.equal(unavailable({ injuryMatchesLeft: 0, banMatches: 0 }), false);
  assert.equal(unavailable({ injuryMatchesLeft: 0, banMatches: 1 }), true);
  assert.equal(unavailable({ injuryMatchesLeft: 2, banMatches: 0 }), true);
  const L = createLeague(createRng(5)), bot = L.teams[3];
  extra(bot, 4);
  const on = new Set(bot.tactics.lineupSlots), cand = bot.squad.filter((p) => !on.has(p.id));
  assert.ok(cand.length > 7, 'data: flere end 7 ikke-startere, så udtagelsen vælger');
  const before = autoMatchBench(bot);
  // en bænkspiller i en kæde med flere kandidater end kædens minimum (målmanden tages med, hvis han er den eneste)
  const need = { GK: 1, DEF: 2, MID: 2, ATT: 1 };
  const victim = before.map((id) => bot.squad.find((p) => p.id === id)).find((p) => cand.filter((q) => q.line === p.line).length > need[p.line]);
  assert.ok(victim, 'data: en bænkspiller med en afløser i kæden');
  victim.banMatches = 1;
  assert.ok(!autoMatchBench(bot).includes(victim.id), 'den udelukkede er ikke på bænken');
});

test('kampen: en udelukket starter spiller ikke – erstattes i samme kæde med noten "er udelukket"; uden bænk tages en reserve', () => {
  const L = createLeague(createRng(7)), me = own(L), opp = L.teams.find((t) => t.isBot);
  extra(me, 3);
  const p = me.squad.find((x) => x.id === me.tactics.lineupSlots[9]);
  p.banMatches = 1; p.banWhy = 'YELLOWS';
  const m = simulateMatch(me, opp, createRng(3));
  const ids = new Set(m.ratings[m.homeId === me.id ? 'home' : 'away'].map((e) => e.playerId));
  assert.ok(!ids.has(p.id), 'han står ikke i karakterarket');
  const note = m.events.find((e) => e.text.includes(`${p.shortName} er udelukket og erstattes`));
  assert.ok(note, m.events.slice(0, 3).map((e) => e.text).join(' | '));
  // Hele bænken udelukket: en reserve (helst samme kæde) – aldrig ham selv
  me.matchBench = me.squad.filter((x) => !me.tactics.lineupSlots.includes(x.id)).slice(0, 7).map((x) => x.id);
  for (const id of me.matchBench) me.squad.find((x) => x.id === id).banMatches = 1;
  const reserves = me.squad.filter((x) => !me.tactics.lineupSlots.includes(x.id) && !me.matchBench.includes(x.id));
  assert.ok(reserves.length >= 1, 'data: mindst én reserve');
  const m2 = simulateMatch(me, opp, createRng(4)), side = m2.homeId === me.id ? 'home' : 'away';
  const played = new Set(m2.ratings[side].map((e) => e.playerId));
  assert.ok(!played.has(p.id) && me.matchBench.every((id) => !played.has(id)), 'ingen udelukket spillede');
  assert.ok(reserves.some((r) => played.has(r.id)), 'en reserve kom ind i stedet');
});

test('runden: rødt kort giver udelukkelse, den afsones (præcis BAN runder ude) – og den udelukkede spiller ikke imens', () => {
  const L = createLeague(createRng(11)), rng = createRng(12);
  let checked = 0;
  for (let r = 0; r < 14 && checked < 3; r++) {
    const banned = new Set(L.teams.flatMap((t) => t.squad.filter((p) => p.banMatches > 0).map((p) => p.id)));
    const res = playRound(L, rng);
    for (const m of res.matches) for (const e of [...m.ratings.home, ...m.ratings.away]) assert.ok(!banned.has(e.playerId), `udelukket ${e.playerId} spillede i runde ${r + 1}`);
    commitRound(L, res, rng);
    for (const m of res.matches) for (const e of [...m.ratings.home, ...m.ratings.away].filter((x) => x.red === 'DIRECT')) {
      const p = L.teams.flatMap((t) => t.squad).find((x) => x.id === e.playerId);
      assert.ok(p.banMatches >= BAN.DIRECT && p.banWhy === 'DIRECT', `${p.id}: ${p.banMatches} ${p.banWhy}`);
      checked++;
    }
  }
  assert.ok(checked >= 1, `data: ${checked} direkte røde kort`);
  // afsoning: én runde trækker én kamp
  const p = own(L).squad[3]; p.banMatches = 2; p.banWhy = 'DIRECT';
  commitRound(L, playRound(L, rng), rng);
  assert.ok(p.banMatches >= 1 && p.banMatches <= 2 + BAN.DIRECT, String(p.banMatches));
});

test('sæsonskiftet: udelukkelsen afsones videre, de tællende gule nulstilles', () => {
  const L = createLeague(createRng(4)), rng = createRng(12);
  for (let r = 0; r < 13; r++) commitRound(L, playRound(L, rng), rng);
  const p = own(L).squad[4]; p.banMatches = 3; p.banYellows = 3;
  commitRound(L, playRound(L, rng), rng);
  assert.equal(L.leagueMetadata.seasonNumber, 2);
  assert.equal(p.banMatches, 2, 'én afsonet i runde 14 – to tilbage i den nye sæson');
  assert.equal(p.banYellows, 0);
});

test('synlighed: udelukkelsen er offentlig (som skader) – modstanderen ser den', () => {
  const p = { ...createLeague(createRng(2)).teams[1].squad[0], banMatches: 2, banWhy: 'DIRECT', banYellows: 3 };
  const v = viewPlayer(p, false);
  assert.equal(v.banMatches, 2); assert.equal(v.banWhy, 'DIRECT'); assert.equal(v.banYellows, 3);
});

test('gem fra v3.26.1 (tests/fixtures/save-v3.26.1.json, skema 9 uden ban-felter): indlæses, alle får 0 – ingen er udelukket', () => {
  const RAW = fs.readFileSync(new URL('../fixtures/save-v3.26.1.json', import.meta.url), 'utf8'), raw = JSON.parse(RAW);
  assert.equal(raw.schemaVersion, 9);
  const rawPlayers = raw.league.teams.flatMap((t) => t.squad);
  assert.ok(rawPlayers.length >= 144 && rawPlayers.every((p) => p.banMatches === undefined), 'data: ingen ban-felter før');
  assert.ok(rawPlayers.filter((p) => p.sYellow >= 4).length >= 5, 'data: spillere med mange gule kort i fixturet');
  const r = parseSave(RAW);
  assert.ok(r.ok, r.error);
  const all = r.state.league.teams.flatMap((t) => t.squad);
  assert.ok(all.every((p) => p.banMatches === 0 && p.banYellows === 0 && p.banWhy === null));
});

test('tacklinger: Normal = som før (1/1/0); Aggressiv flere frispark og kort – Forsigtig færre (målt i tools/measure-bans.mjs)', () => {
  assert.deepEqual(TACKLE.NORMAL, { foul: 1, card: 1, press: 0 });
  assert.ok(TACKLE.AGGRESSIVE.foul > 1 && TACKLE.AGGRESSIVE.card > 1 && TACKLE.AGGRESSIVE.press > 0);
  assert.ok(TACKLE.CAUTIOUS.foul < 1 && TACKLE.CAUTIOUS.card < 1 && TACKLE.CAUTIOUS.press < 0);
  // Gule kort pr. hold over 120 kampe: Aggressiv > Normal > Forsigtig (før v3.27.0 læste motoren ikke tacklingerne: ens)
  const yellows = {};
  for (const ti of ['CAUTIOUS', 'NORMAL', 'AGGRESSIVE']) {
    let y = 0;
    for (let s = 1; s <= 120; s++) {
      const L = createLeague(createRng(s * 17)), me = own(L);
      me.tactics.phases.phase2_defending.tacklingIntensity = ti;
      const m = simulateMatch(me, L.teams[1 + (s % 7)], createRng(s * 29));
      y += m.ratings[m.homeId === me.id ? 'home' : 'away'].reduce((a, e) => a + (e.yellows ?? 0), 0);
    }
    yellows[ti] = y / 120;
  }
  assert.ok(yellows.AGGRESSIVE > yellows.NORMAL * 1.15 && yellows.NORMAL > yellows.CAUTIOUS * 1.15, JSON.stringify(yellows));
});
