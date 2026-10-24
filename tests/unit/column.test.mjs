// v3.14: journalist-klummen (column.js). Anti-spionage bevises med en KANARIE: alle ikke-offentlige felter i de
// kampe, klummen får, kaster ved læsning – klummen skal stadig kunne bygges og være ord for ord den samme (QC B3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { playRound, commitRound, pairRound, sortStandings } from '../../public/engine/season.js';
import { buildColumn, publicFacts, STYLE_RULES, PUBLIC_FACT_KEYS, pickBy } from '../../public/engine/column.js';
import { RATING_PRIVATE_FIELDS } from '../../public/engine/visibility.js';

// Spil N runder og returnér input til klummen for dit hold (som app.js columnNow).
function season(seed, rounds) {
  const rng = createRng(seed), L = createLeague(rng), out = [];
  for (let r = 0; r < rounds; r++) {
    const res = playRound(L, rng); commitRound(L, res, rng);
    const lr = L.lastRound, me = L.teams.find((t) => !t.isBot);
    out.push({ L, input: {
      matches: lr.matches, gazette: lr.gazette, history: L.history.filter((x) => x.round >= L.seasonStartRound && x.round <= lr.round),
      table: sortStandings(L.leagueMetadata.standings).map((x) => ({ teamId: x.teamId, teamName: x.teamName, points: x.points })),
      next: pairRound(L).map(([h, a]) => ({ homeId: L.teams[h].id, homeName: L.teams[h].name, awayId: L.teams[a].id, awayName: L.teams[a].name })),
      viewerTeamId: me.id, round: lr.round } });
  }
  return out;
}
const text = (c) => [c.title, ...c.sections.flatMap((s) => [...(s.paras ?? []), ...(s.others ?? []).flatMap((o) => [o.head, o.note]), s.player?.why])].filter(Boolean).join(' | ');

test('klummen: overskrift og afsnittene i rækkefølge; "Din kamp" handler om seerens hold; samme input → samme tekst (ingen tilfældighed)', () => {
  const rounds = season(3, 4);
  const { input, L } = rounds.at(-1);
  const c = buildColumn(input);
  const ids = c.sections.map((s) => s.id);
  assert.equal(ids[0], 'col-mine');
  assert.deepEqual(ids.filter((x) => ['col-mine', 'col-others', 'col-stars', 'col-next'].includes(x)), ['col-mine', 'col-others', 'col-stars', 'col-next']);
  assert.ok(c.title && c.title.length > 5);
  assert.ok(c.sections[0].paras[0].includes(L.teams.find((t) => !t.isBot).name), c.sections[0].paras[0]);
  assert.equal(c.sections.find((s) => s.id === 'col-others').others.length, 3, 'de 3 andre kampe – seerens egen står i "Din kamp"');
  assert.deepEqual(buildColumn(input), c);
  // JSON-rundtur (QC B3): samme klumme før og efter gem/genindlæs – fanger læsning af ikke-gemte felter (duelLog)
  assert.deepEqual(buildColumn(JSON.parse(JSON.stringify(input))), c);
});

// ---------- Kanarien ----------
const poison = (obj, key) => Object.defineProperty(obj, key, { get() { throw new Error(`KANARIE: ${key}`); }, enumerable: true, configurable: true });
function poisoned(input) {
  const p = structuredClone(input);
  for (const m of p.matches) {
    const viewerSide = m.homeId === p.viewerTeamId ? 'home' : m.awayId === p.viewerTeamId ? 'away' : null;
    for (const side of ['home', 'away']) {
      if (m.endState?.[side]) { poison(m.endState[side], 'phases'); poison(m.endState[side], 'customCoords'); }
      for (const e of m.ratings[side]) for (const k of RATING_PRIVATE_FIELDS) poison(e, k);
    }
    poison(m, 'homeTacticStr'); poison(m, 'awayTacticStr'); poison(m, 'observations');
    for (const e of m.events) { poison(e, 'text'); poison(e, 'label'); poison(e, 'varMsg'); poison(e, 'stats'); }
    for (const g of m.goalsPool) { poison(g, 'desc'); poison(g, 'spectacle'); }
    // Andres kamprapporter må aldrig læses – kun seerens egen
    for (const id of Object.keys(m.ownReports ?? {})) if (id !== p.viewerTeamId || !viewerSide) poison(m.ownReports, id);
  }
  return p;
}
test('anti-spionage, kanarie: klummen læser ingen tekst, label, private karakterfelter, taktik-strenge eller andres rapporter', () => {
  for (const { input } of season(11, 6)) {
    const p = poisoned(input);
    // selvtjek: kanarien virker (ellers beviser testen intet)
    assert.throws(() => p.matches[0].events[0].label, /KANARIE/);
    assert.throws(() => p.matches[0].homeTacticStr, /KANARIE/);
    const clean = buildColumn(input);
    const c = buildColumn(p);
    assert.deepEqual(c, clean);
  }
});
test('anti-spionage: ingen indstillingsnavne om andre hold, intet om pres og ingen evnetal – i alle afsnit undtagen "Din kamp"', () => {
  const NAMES = /korte pasninger|balanceret opbygning|direkte lange bolde|lav blok|mellemblok|gegenpres|høje indlæg|lave cutbacks|lynkontra|hold på bolden|genpres|fald tilbage|offside|løb uden bold|\bpres(se|ser|set|ser højt)?\b/i;
  const SKILL = /\b(FIN|PAS|POS|INT|GK|STA|STR|BAL|PAC)\s*[:=]?\s*\d/;
  let n = 0;
  for (const seed of [5, 6, 7]) for (const { input } of season(seed, 10)) {
    const c = buildColumn(input);
    const others = c.sections.filter((s) => s.id !== 'col-mine');
    const t = [c.title, ...others.flatMap((s) => [...(s.paras ?? []), ...(s.others ?? []).flatMap((o) => [o.head, o.note]), s.player?.why])].filter(Boolean).join(' | ');
    assert.doesNotMatch(t, NAMES, t); assert.doesNotMatch(t, SKILL, t);
    n += t.length;
  }
  assert.ok(n > 5000, 'tekst nok til at testen beviser noget');
});
test('stil-gættene bygger kun på de offentlige fakta (lukket liste – positiv assertion)', () => {
  assert.ok(STYLE_RULES.length >= 6);
  for (const r of STYLE_RULES) {
    assert.ok(r.basis.length > 0 && r.basis.every((k) => PUBLIC_FACT_KEYS.includes(k)), r.key);
    assert.ok(r.say.length >= 3, `${r.key}: mindst 3 formuleringer`);
  }
  // publicFacts udsætter ikke tekst eller label
  const L = createLeague(createRng(2)), m = simulateMatch(L.teams[0], L.teams[1], createRng(9));
  const f = publicFacts(m);
  assert.ok(f.events.every((e) => !('text' in e) && !('label' in e)));
  assert.ok(f.ratings.every((e) => RATING_PRIVATE_FIELDS.every((k) => !(k in e))));
});

// ---------- Seer-afhængig ----------
test('"Din kamp" følger seeren: to menneskehold i samme kamp får hvert sit afsnit, og kun sin egen rapport', () => {
  const L = createLeague(createRng(4));
  const [A, B] = [L.teams[0], L.teams[1]]; B.isBot = false;
  const m = simulateMatch(A, B, createRng(17));
  assert.ok(m.ownReports[A.id] && m.ownReports[B.id], 'begge menneskehold har en rapport');
  const base = { matches: [m], gazette: null, history: [], table: [], next: [], round: 1 };
  const ca = buildColumn({ ...base, viewerTeamId: A.id }), cb = buildColumn({ ...base, viewerTeamId: B.id });
  assert.ok(ca.sections[0].paras[0].includes(A.name) && cb.sections[0].paras[0].includes(B.name));
  assert.notDeepEqual(ca.sections[0], cb.sections[0]);
  // A's klumme læser aldrig B's rapport (og omvendt)
  const pa = structuredClone(base); pa.matches[0] = structuredClone(m); Object.defineProperty(pa.matches[0].ownReports, B.id, { get() { throw new Error('KANARIE B'); } });
  assert.deepEqual(buildColumn({ ...pa, viewerTeamId: A.id }), ca);
});
test('en bots spillede indstillinger gemmes ikke længere i endState (Arkitekt) – dit holds gør', () => {
  // Seed uden Hvis-Så-skift hos botten (v3.15.1: med seed 5 skiftede botten formation, så slutformationen ≠ startformationen)
  const L = createLeague(createRng(4)), m = simulateMatch(L.teams[0], L.teams[1], createRng(6));
  assert.ok(!m.events.some((e) => !e.isHome && e.type === 'TRIGGER'), 'data: botten skifter ikke formation');
  assert.ok(m.endState.home.phases && m.endState.home.customCoords, 'dit hold');
  assert.equal(m.endState.away.phases, undefined); assert.equal(m.endState.away.customCoords, undefined);
  assert.equal(m.endState.away.formation, L.teams[1].tactics.baseFormation);
  assert.deepEqual(Object.keys(m.ownReports), [L.teams[0].id], 'kun menneskeholdets rapport');
});
test('"Din kamp" og fuldtids-analysen bygger på samme rapport: opbygningstallet i klummen står også i fuldtids-analysen', () => {
  let seen = 0;
  for (const { input } of season(21, 10)) {
    const m = input.matches.find((x) => x.homeId === input.viewerTeamId || x.awayId === input.viewerTeamId);
    const r = m.ownReports[input.viewerTeamId], ft = m.events.find((e) => e.type === 'FULLTIME').text;
    assert.ok(ft.includes(`Din opbygning kom igennem ${r.buildWon} af ${r.build} gange`), ft);
    const mine = buildColumn(input).sections[0].paras.join(' ');
    if (/opbygning|presset|kom I igennem/i.test(mine) && / af \d+ /.test(mine)) {
      seen++;
      assert.ok(mine.includes(`${r.buildWon} af ${r.build}`) || mine.includes(`${r.build - r.buildWon} af ${r.build}`), `${mine} | rapport ${r.buildWon}/${r.build}`);
    }
  }
  assert.ok(seen >= 1, `mindst én runde med opbygningstal (${seen})`);
});

// ---------- Variation og hukommelse ----------
test('variation: samme skabelon rykker videre fra runde til runde (pickBy), og ingen hel sætning går igen mere end 3 gange på en sæson', () => {
  const list = ['a', 'b', 'c'];
  assert.notEqual(pickBy(list, 4, 'x'), pickBy(list, 5, 'x'));
  assert.equal(pickBy(list, 4, 'x'), pickBy(list, 4, 'x'));
  const count = {};
  for (const { input } of season(31, 14)) for (const s of buildColumn(input).sections) for (const t of [...(s.paras ?? []), ...(s.others ?? []).map((o) => o.note)].filter(Boolean)) count[t] = (count[t] ?? 0) + 1;
  const worst = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  assert.ok(worst[1] <= 3, `"${worst[0]}" ${worst[1]} gange`);
});
test('optakt-scouting og opfølgning: næste modstander gættes ud fra hans seneste kampe, og runden efter følger journalisten op', () => {
  let bud = 0, follow = 0;
  for (const { input } of season(41, 14)) {
    const t = (buildColumn(input).sections.find((s) => s.id === 'col-next')?.paras ?? []).join(' ');
    if (/Mit bud: .+ i deres seneste/.test(t)) bud++;
    if (/Før kampen skrev jeg, at .+ – det (holdt|gjorde de ikke)/.test(t)) follow++;
  }
  assert.ok(bud >= 5 && follow >= 3, `bud ${bud}, opfølgning ${follow}`);
});
test('gemt spil fra før v3.14 (uden facts i historikken og uden rapporter): klummen bygges uden fejl og uden "undefined"', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../fixtures/save-v3.12.0.json', import.meta.url), 'utf8')).league;
  const me = raw.teams.find((t) => !t.isBot);
  const c = buildColumn({ matches: raw.lastRound.matches, gazette: raw.lastRound.gazette, history: raw.history, table: [], next: [], viewerTeamId: me.id, round: raw.lastRound.round });
  assert.equal(c.sections[0].id, 'col-mine');
  assert.doesNotMatch(text(c), /undefined|NaN|null/);
});

// ---------- Sandhedsregler (QC v3.14 F1–F3, F16) – håndlavede kampe, så udfaldet er kendt ----------
const goalEv = (min, isHome, hG, aG) => ({ type: 'GOAL', category: 'GOAL', min, isHome, hG, aG });
function hand({ events = [], goalsPool = [], homeGoals, awayGoals, stats = {}, ownReports = {} }) {
  return { homeId: 'H', awayId: 'A', homeName: 'Hjem', awayName: 'Ude', homeGoals, awayGoals, events, goalsPool, ownReports,
    stats: { hPoss: 50, aPoss: 50, ...stats }, ratings: { home: [], away: [] }, startFormations: { home: '4-4-2', away: '4-4-2' }, endState: {} };
}
const mineText = (m, viewer = 'H') => buildColumn({ matches: [m], viewerTeamId: viewer, round: 3 }).sections[0].paras.join(' ');
test('F1: et reduceringsmål i 85. minut (2-0 → 2-1) er ikke "sejrsmålet" – et 1-1 → 2-1 i 85. er', () => {
  const consolation = hand({ homeGoals: 2, awayGoals: 1, events: [goalEv(10, true, 1, 0), goalEv(30, true, 2, 0), goalEv(85, false, 2, 1)] });
  for (const v of ['H', 'A']) assert.doesNotMatch(mineText(consolation, v), /Sejrsmålet|afgjorde det/, v);
  const winner = hand({ homeGoals: 2, awayGoals: 1, events: [goalEv(10, true, 1, 0), goalEv(50, false, 1, 1), goalEv(85, true, 2, 1)] });
  assert.match(mineText(winner, 'H'), /Sejrsmålet kom i 85\. minut/);
  assert.match(mineText(winner, 'A'), /Hjem afgjorde det i 85\. minut/);
});
const rep = (offBallRuns, extra = {}) => ({ H: { side: 'home', build: 0, buildWon: 0, counterGoalsAgainst: 1,
  start: { formation: '4-4-2', phases: { phase1_buildUp: { passingStyle: 'SHORT', offBallRuns } } },
  end: { formation: '4-4-2', phases: { phase1_buildUp: { passingStyle: 'SHORT', offBallRuns } } }, ...extra } });
test('F2: et kontramål imod får kun årsagen "mange spillere fremme" med belæg i din spillede taktik', () => {
  const base = { homeGoals: 0, awayGoals: 1, events: [goalEv(40, false, 0, 1)], goalsPool: [{ kind: 'COUNTER', min: 40, teamName: 'Ude' }] };
  const few = mineText(hand({ ...base, ownReports: rep('FEW') }));
  assert.match(few, /et kontramål imod\./); assert.doesNotMatch(few, /mange spillere fremme/);
  assert.match(mineText(hand({ ...base, ownReports: rep('MANY') })), /et kontramål imod, da bolden blev tabt med mange spillere fremme\./);
});
test('F3: ét hovedstødsmål ud af tre gør ikke holdet til et luft-hold – to ud af tre gør', () => {
  const air = STYLE_RULES.find((r) => r.key === 'air');
  assert.equal(air.test({ headerGoals: 1, goals: 3, corners: 2 }), false);
  assert.equal(air.test({ headerGoals: 2, goals: 3, corners: 2 }), true);
  assert.equal(air.test({ headerGoals: 0, goals: 0, corners: 7 }), true);
  assert.ok(air.say.every((t) => !/mest|farligst/.test(t)));
});
test('F16: et Hvis-Så-skift, der ikke blev udført, tæller ikke som omorganisering', () => {
  const m = hand({ homeGoals: 0, awayGoals: 0, events: [{ type: 'TRIGGER', category: 'TACTIC', min: 60, isHome: true, hG: 0, aG: 0 }, { type: 'TRIGGER', category: 'HIGHLIGHT', min: 70, isHome: false, hG: 0, aG: 0 }] });
  const f = publicFacts(m);
  assert.equal(f.home.reorganised, 0); assert.equal(f.away.reorganised, 1);
});

// Release Manager v3.14: gem fra den live v3.13.0 (skema 6, runde 3, uden facts/ownReports – lavet med 3.13.0-koden,
// seed 31300, tre runder). Klummen bygges uden fejl, og næste runde får rapport og facts.
test('gem fra v3.13.0: klummen bygges uden "undefined", og runden efter har "Din kamp"-vurdering og scouting-tal', async () => {
  const { parseSave } = await import('../../public/state/storage.js');
  const raw = fs.readFileSync(new URL('../fixtures/save-v3.13.0.json', import.meta.url), 'utf8');
  const r = parseSave(raw);
  assert.ok(r.ok, r.error); assert.ok(!r.migratedFrom, 'ingen migrering');
  assert.equal(JSON.parse(raw).ui.seenVersion, '3.13.0');
  const L = r.state.league, me = L.teams.find((t) => !t.isBot);
  const input = () => ({ matches: L.lastRound.matches, gazette: L.lastRound.gazette, history: L.history.filter((x) => x.round >= L.seasonStartRound && x.round <= L.lastRound.round),
    table: sortStandings(L.leagueMetadata.standings).map((x) => ({ teamId: x.teamId, teamName: x.teamName, points: x.points })),
    next: pairRound(L).map(([h, a]) => ({ homeId: L.teams[h].id, homeName: L.teams[h].name, awayId: L.teams[a].id, awayName: L.teams[a].name })), viewerTeamId: me.id, round: L.lastRound.round });
  assert.ok(!L.lastRound.matches.some((m) => m.ownReports) && !L.history.some((h) => h.facts), 'gemt før v3.14');
  const old = buildColumn(input());
  assert.equal(old.sections[0].id, 'col-mine'); assert.doesNotMatch(text(old), /undefined|NaN|null/);
  const rng = createRng(77); commitRound(L, playRound(L, rng), rng);
  assert.ok(L.lastRound.matches.find((m) => m.homeId === me.id || m.awayId === me.id).ownReports[me.id], 'ny runde har din rapport');
  assert.ok(L.history.at(-1).facts?.[me.id], 'ny runde har offentlige tal til scouting');
  assert.doesNotMatch(text(buildColumn(input())), /undefined|NaN|null/);
});
