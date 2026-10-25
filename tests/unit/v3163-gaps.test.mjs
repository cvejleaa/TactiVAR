// Test Manager v3.16.3: huller fundet ved mutation af sæsonslut (championText, seasonJustEnded, endedSeasonView, lastSeasonStats).
// Forfatterens tests pinder mesterteksten ved målforskel +8/−2 (aldrig 0), vælger alt i endedSeasonView ved et komplet arkiv
// (ingen af vagterne rammes) og et sæson-1-arkiv, der starter i runde 1 (statsFrom = fromRound), og tæller aldrig, hvad
// lastSeasonStats RUMMER – kun at det findes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { playRound, commitRound, endSeason, championText, seasonJustEnded } = await import('../../public/engine/season.js');
const { PLAYER_SEASON_FIELDS, TEAM_STAT_FIELDS } = await import('../../public/engine/stats.js');
const { gen, pickBy, describeGoal, GOAL_KINDS } = await import('../../public/engine/clues.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { buildColumn } = await import('../../public/engine/column.js');
const { serialize, parseSave } = await import('../../public/state/storage.js');
const { renderStats, endedSeasonView } = await import('../../public/ui/stats.js');
const { drawY, DRAW_K, replaySteps } = await import('../../public/ui/replay.js');
const { renderCard } = await import('../../public/ui/card.js');
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const sectionTitle = (el, id) => all(byId(el, id), (e) => e.tag === 'summary')[0].textContent;

function fullSeason(seed) {
  const rng = createRng(seed), L = createLeague(rng);
  for (let r = 0; r < L.schedule.length; r++) commitRound(L, playRound(L, rng), rng);
  return { L, rng };
}

// ---------- mesterteksten: målforskel 0 ----------
const row = (teamName, points, goalDiff, goalsFor) => ({ teamName, points, goalDiff, goalsFor });
test('championText: målforskel 0 står som "0" (ikke "+0") i tredje led – positiv med +, negativ med −', () => {
  const c = (a, b) => ({ teamId: 'x', ...a, runnerUp: b });
  assert.equal(championText(c(row('Alfa', 29, 0, 22), row('Beta', 29, 0, 20)), 2), 'Alfa er mester på flest scorede mål – I endte begge på 29 point og målforskel 0');
  assert.equal(championText(c(row('Alfa', 29, 0, 22), row('Beta', 29, 0, 22)), 3), 'Alfa er mester – Alfa og Beta endte begge på 29 point, målforskel 0 og 22 scorede mål');
  assert.equal(championText(c(row('Alfa', 29, 1, 22), row('Beta', 29, 1, 20)), 3), 'Alfa er mester på flest scorede mål – Alfa og Beta endte begge på 29 point og målforskel +1');
});

// ---------- lastSeasonStats: kun spillere og felter ≠ 0 ----------
test('endSeason: lastSeasonStats rummer netop de spillere og felter, der er ≠ 0 – ingen nuller, ingen tomme spillere; spillerne nulstilles bagefter', () => {
  const L = createLeague(createRng(3));
  const [p0, p1, p2] = L.teams[1].squad;
  assert.ok(L.teams.flatMap((t) => t.squad).every((p) => PLAYER_SEASON_FIELDS.every((k) => p[k] === 0)), 'data: en frisk liga har kun nuller');
  Object.assign(p0, { sGoals: 3, sGames: 5, sAssists: 0 }); Object.assign(p2, { sMotm: 1, sMinutes: 270 });
  assert.equal(p1.sGoals, 0);
  endSeason(L, 14, true);
  assert.deepEqual(L.lastSeasonStats, { seasonNumber: 1, players: { [p0.id]: { sGames: 5, sGoals: 3 }, [p2.id]: { sMinutes: 270, sMotm: 1 } } });
  assert.equal(L.leagueMetadata.seasonNumber, 2);
  assert.ok(L.teams.flatMap((t) => t.squad).every((p) => PLAYER_SEASON_FIELDS.every((k) => p[k] === 0)), 'spillerne er nulstillet til sæson 2');
  // Næste sæsonslut overskriver (kun den seneste sæson gemmes)
  L.leagueMetadata.round = 28; L.seasonStartRound = 15;
  p1.sRed = 2;
  endSeason(L, 28, true);
  assert.deepEqual(L.lastSeasonStats, { seasonNumber: 2, players: { [p1.id]: { sRed: 2 } } });
});

// ---------- endedSeasonView: vagter og sæsonstart ----------
test('endedSeasonView: kun et komplet arkiv vises – manglende holdfelt, manglende/ikke-objekt spillerliste eller et arkiv for en anden sæson giver null (og fanen den gamle note)', () => {
  const { L } = fullSeason(5), me = L.teams.find((t) => !t.isBot);
  assert.ok(seasonJustEnded(L), 'data: lige efter sæsonslut');
  assert.ok(endedSeasonView(L), 'komplet arkiv: vises');
  const brk = (fn) => { const c = structuredClone(L); fn(c); return c; };
  // ét holds tal mangler (kun den række) – "alle" holdrækker skal have dem
  const noField = brk((c) => { delete c.seasons[0].table[2][TEAM_STAT_FIELDS[3]]; });
  assert.ok(endedSeasonView(noField) === null, 'en række uden xg');
  const nan = brk((c) => { c.seasons[0].table[5].shots = null; });
  assert.ok(endedSeasonView(nan) === null, 'et ikke-tal');
  for (const players of [undefined, null, 'x', 7]) {
    const c = brk((x) => { x.lastSeasonStats.players = players; });
    assert.ok(endedSeasonView(c) === null, `players = ${JSON.stringify(players)}`);
  }
  assert.ok(endedSeasonView(brk((c) => { delete c.lastSeasonStats; })) === null, 'intet arkiv (fra før v3.16.3)');
  assert.ok(endedSeasonView(brk((c) => { c.lastSeasonStats.seasonNumber = 9; })) === null);
  // fanen falder tilbage til den gamle note uden at vælte
  const st = renderStats({ league: noField, myTeamId: me.id });
  assert.match(byId(st, 'stats-season-over').textContent, /^Sæson 1 er slut/); assert.equal(byId(st, 'stats-season-ended'), undefined);
  assert.equal(sectionTitle(st, 'stats-players'), 'Spillere (sæson 2)');
});

test('endedSeasonView: en sæson, hvis statistik begyndte midt i sæsonen (statsFrom 4), siger "fra runde 4" og noten om de manglende runder', () => {
  const { L } = fullSeason(5), me = L.teams.find((t) => !t.isBot);
  assert.equal(L.seasons[0].statsFrom, 1, 'data: en ny liga tæller fra runde 1');
  L.seasons[0].statsFrom = 4;
  const st = renderStats({ league: L, myTeamId: me.id });
  assert.equal(sectionTitle(st, 'stats-players'), 'Spillere (sæson 1 – afsluttet, fra runde 4)');
  assert.equal(sectionTitle(st, 'stats-teams'), 'Holdtal (sæson 1 – afsluttet, fra runde 4)');
  assert.match(byId(st, 'stats-gap').textContent, /^Sæsonens runde 1–3 blev spillet, før statistikken fandtes/);
  // statsFrom udeladt (arkiv uden feltet): hele sæsonen tæller
  delete L.seasons[0].statsFrom;
  const st2 = renderStats({ league: L, myTeamId: me.id });
  assert.equal(sectionTitle(st2, 'stats-players'), 'Spillere (sæson 1 – afsluttet)');
  assert.equal(byId(st2, 'stats-gap'), undefined);
});

// ---------- vinduet: kun den seneste sæson ----------
test('seasonJustEnded: efter to sæsoner er det sæson 2, der vises (ikke sæson 1) – og først når den nye sæsons runde 1 er spillet, forsvinder vinduet', () => {
  const { L, rng } = fullSeason(9);
  assert.equal(seasonJustEnded(L).seasonNumber, 1);
  commitRound(L, playRound(L, rng), rng);
  assert.equal(seasonJustEnded(L), null, 'efter sæson 2 runde 1');
  for (let r = 1; r < L.schedule.length; r++) commitRound(L, playRound(L, rng), rng);
  assert.equal(L.seasons.length, 2);
  assert.equal(seasonJustEnded(L).seasonNumber, 2, 'ikke sæson 1');
  assert.equal(endedSeasonView(L).leagueMetadata.seasonNumber, 2);
  // en sæson uden program (migreringen fra skema 5) er ikke en rigtig sæson
  L.seasons[1].programmed = false;
  assert.equal(seasonJustEnded(L), null);
  L.seasons[1].programmed = true; L.seasons[1].table = [];
  assert.equal(seasonJustEnded(L), null, 'uden tabel');
});

// ---------- gem og indlæs ----------
test('et gem lige efter sæsonslut (v3.16.3) overlever serialize → parseSave: arkivets VAR ±, nr. 2 og den afsluttede sæsons tal er der stadig', () => {
  const { L } = fullSeason(5), me = L.teams.find((t) => !t.isBot);
  const r = parseSave(serialize({ league: L, notes: {}, ui: { seenVersion: '3.16.3' } }));
  assert.ok(r.ok, r.error); assert.equal(r.migratedFrom, null);
  const P = r.state.league;
  assert.deepEqual(P.lastSeasonStats, L.lastSeasonStats);
  assert.ok(Object.keys(P.lastSeasonStats.players).length > 40, 'data: sæsonens tal er gemt');
  assert.deepEqual(P.seasons[0].table, L.seasons[0].table);
  assert.ok(P.seasons[0].table.every((t) => Number.isFinite(t.varNet)));
  assert.deepEqual(P.seasons[0].champion, L.seasons[0].champion);
  assert.ok(P.seasons[0].champion.runnerUp);
  const st = renderStats({ league: P, myTeamId: me.id });
  assert.equal(sectionTitle(st, 'stats-players'), 'Spillere (sæson 1 – afsluttet)');
});

// ---------- ejefald i ALLE måltekster ----------
// Forfatterens ejefalds-test kigger på 200 kampes referater, hvor kun få af de 33 skabeloner (11 typer × 3) har et navn på
// -s/-x/-z; fjernes gen() fra én skabelon (VAR 2, VAR 3), er suiten grøn. Her: samme skabelon med to sæt navne – ét på -s/-x
// og ét uden – skal kun adskille sig i ejefaldet ("Kjærs" → "Hans'", "Lunds" → "Max'").
test('måltekster: hver af de 36 skabeloner bøjer ejefaldet — navne på -s/-x får apostrof, andre -s', () => {
  let possessive = 0;
  for (const kind of GOAL_KINDS) for (let j = 0; j < 3; j++) {
    const at = (s, a) => describeGoal(kind, s, a, 0, { next: () => (j + 0.5) / 3 });
    const plain = at('Kjær', 'Lund');
    const expected = plain.replaceAll('Kjærs', "Hans'").replaceAll('Lunds', "Max'").replaceAll('Kjær', 'Hans').replaceAll('Lund', 'Max');
    assert.equal(at('Hans', 'Max'), expected, `${kind} ${j}`);
    if (/Kjærs|Lunds/.test(plain)) possessive++;
  }
  assert.equal(GOAL_KINDS.length, 12);   // + SCRAMBLE (v3.17.0)
  assert.equal(possessive, 6, 'data: 6 skabeloner har et ejefald (CORNER, SETPIECE og HEADER: variant 2 → oplægsgiveren; VAR: alle tre → skytten)');
});
test('pickBy: runden tages som heltal (|0) – 2,9 er 2 og en manglende runde er 0 (ellers er indekset ikke et heltal)', () => {
  const L5 = ['a', 'b', 'c', 'd', 'e'];
  for (const k of ['k', 'x1', 'Roskilde']) {
    assert.equal(pickBy(L5, 2.9, k), pickBy(L5, 2, k));
    assert.equal(pickBy(L5, undefined, k), pickBy(L5, 0, k));
    assert.equal(pickBy(L5, 7, k), pickBy(L5, 2, k), 'modulo listens længde');
  }
});

// ---------- championText: hver vagt for sig ----------
test('championText: mangler målforskel hos mesteren, hos nr. 2 – eller nr. 2 selv – giver point-teksten (hver vagt for sig)', () => {
  const full = { teamId: 'x', ...row('Alfa', 29, 5, 20), runnerUp: row('Beta', 29, 3, 30) };
  assert.equal(championText(full, 2), 'Alfa er mester på målforskel – I endte begge på 29 point', 'data: komplet arkiv');
  assert.equal(championText({ ...full, goalDiff: undefined }, 2), 'Alfa er mester med 29 point', 'mesteren uden målforskel');
  assert.equal(championText({ ...full, runnerUp: row('Beta', 29, undefined, 30) }, 2), 'Alfa er mester med 29 point', 'nr. 2 uden målforskel');
  assert.equal(championText({ ...full, runnerUp: null }, 2), 'Alfa er mester med 29 point', 'ingen nr. 2');
  assert.equal(championText({ ...full, runnerUp: row('Beta', 28, 3, 30) }, 2), 'Alfa er mester med 29 point', 'flere point end nr. 2');
});

// ---------- klummens "Formen" ved sæsonslut ----------
test('klummen ved sæsonslut: mesteren står IKKE i Formen (v3.16.7 – banneret og avisens sæsonslut-afsnit har ham; championText testes i season-end)', () => {
  const T = (id, teamName, points) => ({ teamId: id, teamName, points });
  const table = [T('t1', 'Alfa', 29), T('t2', 'Beta', 29), T('t3', 'Gamma', 20)];
  const GD = { teamId: 't1', ...row('Alfa', 29, 11, 21), runnerUp: row('Beta', 29, 8, 29) };
  const col = (newSeason, champion) => buildColumn({ matches: [], gazette: null, history: [{ round: 13 }, { round: 14 }], table, next: [], viewerTeamId: 't2', round: 14, newSeason, champion });
  for (const c of [GD, null, undefined]) {
    const all = col(true, c).sections.flatMap((x) => x.paras ?? []).join(' | ');
    assert.ok(!/er mester/.test(all), all);
    assert.equal(col(true, c).sections.find((x) => x.id === 'col-form'), undefined, 'Formen har ellers intet at sige her');
  }
  // Kontrol: midt i sæsonen står toppen i Formen
  assert.deepEqual(col(false, null).sections.find((x) => x.id === 'col-form').paras, ['Alfa og Beta står lige i toppen med 29 point.']);
});

// ---------- endSeason: manglende felter i tabellen ----------
test('endSeason: en tabelrække uden VAR ± og holdtal (gem fra før de blev ført) arkiveres med nuller – arkivet er komplet og kan vises', () => {
  const L = createLeague(createRng(3)), r0 = L.leagueMetadata.standings[0];
  for (const k of ['varNet', ...TEAM_STAT_FIELDS]) delete r0[k];
  endSeason(L, 14, true);
  const t = L.seasons[0].table.find((x) => x.teamId === r0.teamId);
  assert.equal(t.varNet, 0);
  for (const k of TEAM_STAT_FIELDS) assert.strictEqual(t[k], 0, k);
  assert.ok(L.seasons[0].table.every((x) => Number.isFinite(x.varNet) && TEAM_STAT_FIELDS.every((k) => Number.isFinite(x[k]))));
});

// ---------- ejefald og begge holdnavne i hele referatet ----------
// Alle spillere og hold hedder noget på -s (og tilføjer man et "s" til det, er det forkert): 600 kampe, hvor der også er
// bot-mod-bot (de "neutrale" tekster). Data-vagter: hver tekstfamilie forekommer, ellers er testen tom for den.
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function sMatches(n) {
  return Array.from({ length: n }, (_, i) => {
    const sd = i + 1, L = createLeague(createRng(sd * 97));
    for (const t of L.teams) { t.name = t.name.replace(/s?$/, 's'); for (const p of t.squad) p.shortName += 's'; }
    const me = L.teams.find((t) => !t.isBot), a = L.teams[1 + (sd % 3)], b = L.teams[4 + (sd % 3)];
    return sd % 2 ? simulateMatch(a, b, createRng(sd * 131)) : simulateMatch(me, b, createRng(sd * 131));
  });
}
const SM = sMatches(600);
test('ejefald i referatet: med navne på -s står der aldrig "…ss" – frisparksmål, redning af frispark, VAR-rødt, pres (bot mod bot og dit hold)', () => {
  const lines = SM.flatMap((m) => m.events.map((e) => e.text));
  const names = [...new Set(SM.flatMap((m) => [m.homeName, m.awayName, ...[...m.ratings.home, ...m.ratings.away].flatMap((e) => [e.shortName, `#${e.shirtNumber} ${e.shortName}`])]))];
  assert.ok(names.every((n) => /s$/.test(n)), 'data: alle navne ender på s');
  const bad = new RegExp(`(?:${names.map(esc).join('|')})s(?![\\p{L}])`, 'u');
  assert.deepEqual(lines.filter((t) => bad.test(t)).slice(0, 3), []);
  const n = (re) => lines.filter((t) => re.test(t)).length;
  // hver familie forekommer, og ejefaldet står med apostrof
  assert.ok(n(/FRISPARKSMÅL! Frispark efter .+s' \(.+\) forseelse/) >= 20, 'frisparksmål');
  assert.ok(n(/🧤 \[.+\] .+ redder .+s' frispark \(/) >= 50, 'frispark reddet');
  assert.ok(n(/VAR kalder dommeren ud til skærmen: .+s' tackling var med knopperne/) >= 3, 'VAR opgraderer til rødt');
  assert.ok(n(/\[FASE 1 VIRKER • .+\] .+ spiller sig igennem .+s' pres\./) >= 500, 'bot mod bot: opbygning virker');
  assert.ok(n(/\[DIN OPBYGNING VIRKER\] .+ bryder igennem .+s' pres\./) >= 300, 'din opbygning virker');
});
// v3.17.0: "[FASE 1 STOPPER MOD FASE 2]" → holdmærket som de andre ("[FASE 2 VIRKER • presserens hold]"), boldholderens hold i parentes
test('begge holdnavne: den neutrale pres-linje "[FASE 2 VIRKER • hold] … erobrer bolden fra … (hold)" nævner presserens OG boldholderens hold (to spillere med samme nummer kan ikke forveksles)', () => {
  let n = 0;
  for (const m of SM) {
    const side = (home) => (home ? m.ratings.home : m.ratings.away);
    assert.ok(!m.events.some((x) => x.text.includes('FASE 1 STOPPER MOD FASE 2')), 'den gamle linje uden holdmærke');
    for (const e of m.events.filter((x) => x.text.startsWith('🛑 [FASE 2 VIRKER • ') && x.text.includes(' erobrer bolden fra '))) {
      const t = e.text.match(/^🛑 \[FASE 2 VIRKER • (.+?)\] (#\d+ .+?) erobrer bolden fra (#\d+ .+?) \((.+?)\)\.$/);
      assert.ok(t, e.text);
      const [defName, attName] = e.isHome ? [m.homeName, m.awayName] : [m.awayName, m.homeName];
      assert.deepEqual([t[1], t[4]], [defName, attName], e.text);
      assert.ok(side(e.isHome).some((r) => `#${r.shirtNumber} ${r.shortName}` === t[2]) && side(!e.isHome).some((r) => `#${r.shirtNumber} ${r.shortName}` === t[3]), 'presseren er forsvarets, boldholderen angrebets');
      n++;
    }
  }
  assert.ok(n > 500, `data: ${n}`);
});
test('ingen minutter i teksterne – 600 kampe (Hvis-Så-planskift hos dit hold forekommer i ca. hver 6. kamp)', () => {
  const lines = SM.flatMap((m) => m.events.map((e) => e.text)), obs = SM.flatMap((m) => m.observations.map((o) => o.text));
  assert.ok(lines.filter((t) => /Hvis-Så\] Holdet skifter fra .+ til /.test(t)).length >= 20, 'data: planskift');
  assert.deepEqual(lines.filter((t) => /\d+\. min|' PAUSE|I \d+\. minut/.test(t)).slice(0, 3), []);
  assert.deepEqual(obs.filter((t) => /\d+\. min/.test(t)).slice(0, 3), []);
});

// ---------- direkte frispark: kampens brugte tekster ----------
function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return { next: () => nextValue, int: (a) => a, pick: (arr) => arr[0],
    chance: (p) => { const k = (calls[p] = (calls[p] ?? -1) + 1), s = script[p]; return typeof s === 'function' ? s(k) : !!s; } };
}
test('direkte frisparksmål: kampens brugte måltekster gælder også frisparkene – tre mål, tre forskellige tekster, så rng\'ens (konstante) valg igen', () => {
  const L = createLeague(createRng(1)), [H, A] = [L.teams[0], L.teams[1]];
  const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
  for (const t of [H, A]) {
    for (const p of t.squad) { p.skills = SK(10); p.aerialPower = 10; p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0; }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0;
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
  }
  H.squad.find((p) => p.id === H.tactics.lineupSlots[10]).skills.finishing = 15;
  A.squad.find((p) => p.id === A.tactics.lineupSlots[0]).skills.goalkeeping = 5;
  const m = simulateMatch(H, A, stubRng({ 0.061: true, 0.37: true }, 0.5));
  const fk = m.goalsPool.filter((g) => g.kind === 'FREEKICK').map((g) => g.desc);
  assert.ok(fk.length >= 4, `data: ${fk.length} frisparksmål`);
  assert.equal(new Set(fk.slice(0, 3)).size, 3, 'de tre første er forskellige');
  assert.equal(fk[3], fk[0], 'alle tre brugt → rng\'ens valg igen (variant 1)');
});

// ---------- røde kort i klummen: variantvalget pr. runde og hold (bogstaveligt) ----------
// Forfatterens test samler runde 0 og 1 i en sorteret liste og kan derfor ikke se, hvilken variant der hører til hvilken runde
// – eller at modstanderens linje vælges på HANS id (ikke dit). Hold h1/a1: runde 0 giver dit "Med 10 mand …" og hans "Ude fik …".
function cardsFirst(hG, aG) {
  const ev = [{ min: 5, type: 'RED', isHome: true }, { min: 5, type: 'RED', isHome: false }];
  let h = 0, a = 0;
  while (h < hG || a < aG) { const home = (h <= a && h < hG) || a >= aG; if (home) h++; else a++; ev.push({ min: 20 + ev.length, type: 'GOAL', isHome: home, hG: h, aG: a }); }
  return ev;
}
test('røde kort i klummen: dit holds nederlagslinje vælges pr. runde på DIT id; uafgjort og modstanderens linje er faste (bogstaveligt, runde 0–3)', () => {
  const m = (hG, aG) => ({ homeId: 'h1', awayId: 'a1', homeName: 'Hjem', awayName: 'Ude', homeGoals: hG, awayGoals: aG, events: cardsFirst(hG, aG), goalsPool: [], stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 1 } });
  // v3.16.7: kortene står i referatet før målene (linjen kræver kortet før det afgørende mål)
  const reds = (round, hG, aG) => buildColumn({ matches: [m(hG, aG)], gazette: null, history: [], table: [], next: [], viewerTeamId: 'h1', round }).sections[0].paras.filter((t) => /rødt kort|med 10 mand|udvisningen/.test(t));
  const loss = ['Et rødt kort kostede: Hjem måtte spille med 10 mand.', 'Med 10 mand efter udvisningen blev det op ad bakke.'];
  const pick = (round) => pickBy(loss, round, 'red', 'h1');
  assert.deepEqual([0, 1, 2, 3].map((r) => reds(r, 0, 1)), [0, 1, 2, 3].map((r) => [pick(r), 'Ude fik rødt kort undervejs.']));
  assert.ok(new Set([0, 1, 2, 3].map(pick)).size === 2, 'begge nederlagsvarianter forekommer');
  assert.deepEqual(reds(0, 1, 1), ['Hjem holdt point med 10 mand efter udvisningen.', 'Ude fik rødt kort undervejs.']);
  assert.deepEqual(reds(0, 2, 1), ['Et rødt kort til trods: Hjem vandt med 10 mand.', 'Ude fik rødt kort undervejs.']);
});

// ---------- banens skala ----------
test('drawY: skala 1,175 om 50 med én decimal, klemt til 1–99 – målmanden (90/10) ved mållinjen (97/3); y ≥ 92,5 og ≤ 7,5 klemmes', () => {
  // Regnet i hånden: 50 + (y − 50)·1,175. 60 → 61,75 → 61.8 · 22 → 17,1 · 39 → 37,075 → 37.1 · 91 → 98,175 → 98.2 · 9 → 1,825 → 1.8
  assert.deepEqual([90, 10, 50, 60, 22, 39, 91, 9].map(drawY), [97, 3, 50, 61.8, 17.1, 37.1, 98.2, 1.8]);
  // 92 → 99,35 (klemt til 99, ikke 99.4) · 95 → 102,9 · 100 → 108,75 · 8 → 0,65 · 0 → −8,75
  assert.deepEqual([92, 95, 100, 8, 0, 5].map(drawY), [99, 99, 99, 1, 1, 1]);
  assert.equal(DRAW_K, 1.175);
});

// ---------- spillerkortet ----------
test('spillerkortet: VAR-profilen er skjult for alle – "??" og forklaringen "tallene er skjulte …", ikke "afsløres gennem kampe"; profilens tal står ingen steder i boksen', () => {
  const L = createLeague(createRng(4)), me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t.isBot);
  for (const [team, isOwn] of [[me, true], [opp, false]]) {
    const p = team.squad[0]; p.varProfile = { cynicism: 17, theatre: 13, varPulse: 19 };
    const box = all(renderCard({ player: p, team, isOwn, scouting: [], note: '', onNote() {} }), (e) => e.className === 'varbox')[0].textContent;
    assert.equal(box, 'VAR-profil: Kynisme ?? · Teater ?? · VAR-Puls ?? – tallene er skjulte; spillerens VAR-kendelser og scouting-indtrykkene herunder giver fingerpeg');
    assert.ok(!/1[739]/.test(box));
  }
});

// ---------- forklaringen under karakterarkene ----------
test('forklaringen: 🎬 viser afslutningen i afspilningen; 📍 hører til kampe fra før afspilningen (ellers viser 🎬 det)', () => {
  const L = createLeague(createRng(1)), m = simulateMatch(L.teams[0], L.teams[1], createRng(5));
  const root = renderMatchCenter({ mc: { round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount: 0, playing: false, snap: null }, myTeamId: L.teams[0].id,
    on: { snapshot() {}, view() {}, filter() {}, skip() {}, replay() {}, heat() {}, openGoal() {} } });
  const legend = all(root, (e) => e.attrs.id === 'icon-legend')[0].textContent;
  assert.ok(legend.includes(' · 🎬 i referatet = vis afslutningen i afspilningen · 📍 i referatet = se hvor dit hold stod, da målet faldt (kampe fra før afspilningen – ellers viser 🎬 det) · HI = '), legend);
});

// ---------- Hvis-Så til egen plan: ingen minutangivelse ----------
test('Hvis-Så til egen plan: teksten er "Holdet skifter fra … til Plan B (…)" uden minut — minuttet står ved linjen', () => {
  const L = createLeague(createRng(1)), [H, A] = [L.teams[0], L.teams[1]];
  const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
  for (const t of [H, A]) {
    for (const p of t.squad) { p.skills = SK(10); p.aerialPower = 10; p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0; }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0;
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
  }
  const planB = structuredClone(H.tactics);
  Object.assign(planB, { baseFormation: '3-5-2' }); planB.phases.phase1_buildUp.passingStyle = 'DIRECT_LONG';
  H.tacticPresets[1] = planB;
  H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'DRAW', margin: 1, newFormation: '5-4-1', newPlan: 1 }];
  const m = simulateMatch(H, A, stubRng({ 0.48: true }));
  const trig = m.events.filter((e) => e.type === 'TRIGGER');
  assert.equal(trig.length, 1);
  assert.match(trig[0].text, /^📋 \[.+ • Hvis-Så\] Holdet skifter fra 4-4-2 til Plan B \(3-5-2, direkte lange bolde \/ [^)]+\)\.$/);
  assert.equal(trig[0].min, 3);
});

// ---------- endPlayer: begge koordinater ----------
test('endPlayer: skuddets endepunkt er en spillers plads, når BEGGE koordinater passer – et mållinje-punkt, der blot deler x eller y med en spiller, tegnes som mållinje', () => {
  const P = (id, x, y) => [id, x, y];
  const trace = (kind, h, a) => ({ v: 1, frames: [{ t: 1, poss: 'h', ball: [50, 50], h, a }], moments: [{ t: 1, ev: 0, kind, side: 'h', ball: [41, 22], h, a, shooter: 'h3' }] });
  const shot = (kind, h, a) => replaySteps(trace(kind, h, a), false, [{ label: 'x', text: 'Redningen' }], () => null).find((s) => s.kind === 'shot');
  const H = [P('h1', 50, 90), P('h3', 41, 22)];
  // Mål: bolden i nettet (45, 2) — spillere på x = 45 (a2) og y = 2 (a3), men ingen på (45, 2)
  const goal = shot('GOAL', H, [P('a1', 50, 10), P('a2', 45, 60), P('a3', 20, 2)]);
  assert.deepEqual([goal.ball, goal.endPlayer], [[45, 2], false]);
  // Samme billede, men en spiller PÅ (45, 2): så er det hans plads
  assert.equal(shot('GOAL', H, [P('a1', 50, 10), P('a4', 45, 2)]).endPlayer, true);
  // Redning: hos målmanden (50, 10) — også når en anden spiller deler hans x
  const save = shot('SAVE', H, [P('a1', 50, 10), P('a2', 50, 60)]);
  assert.deepEqual([save.ball, save.endPlayer], [[50, 10], true]);
});
