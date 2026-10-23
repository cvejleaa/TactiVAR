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
  const L = createLeague(createRng(4)), m = simulateMatch(L.teams[0], L.teams[1], createRng(5));
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
    if (/Mit bud: i deres seneste/.test(t)) bud++;
    if (/Jeg skrev, at .+ – det (holdt|gjorde de ikke)/.test(t)) follow++;
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
