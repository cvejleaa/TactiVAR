// v3.31.2 (brugerens ønsker 3/11): arketypen på Taktik, ærlige skøn for ungdommen, 📊 Statistik på kortet og danske positionskoder.
// Hver test har data og asserterer på indholdet OG på det, der ikke må stå. Mutationerne, de skal fange, står ved testen.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.classList = { add: (c) => { this.className += ' ' + c; }, toggle() {} }; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t), createElementNS: (ns, t) => new FakeEl(t) };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague, ARCHETYPES } = await import('../../public/engine/generator.js');
const { FORMATIONS, FORMATION_NAMES, ROLE_LABEL, roleLabel, lineOfRole } = await import('../../public/engine/formations.js');
const { keyAvg, roomOf, roomPoints, LOG } = await import('../../public/engine/career.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { playRound, commitRound } = await import('../../public/engine/season.js');
const { setFormation } = await import('../../public/state/actions.js');
const { POSITION, POSITION_FULL, PHASE_OPTIONS, FIT_HELP } = await import('../../public/ui/labels.js');
const { renderCard, roomWords, ROOM_WORDS, cardStats } = await import('../../public/ui/card.js');
const { renderTrainingTable } = await import('../../public/ui/training.js');
const { renderSeasonReport } = await import('../../public/ui/season-report.js');
const { renderLineupList } = await import('../../public/ui/lineup-list.js');
const { renderMatrix } = await import('../../public/ui/matrix.js');
const { renderPitch } = await import('../../public/ui/pitch.js');
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');
const { placeLabel } = await import('../../public/ui/lineup.js');
const { youthFirstSight, distribution, oldWords } = await import('../../tools/measure-youth-words.mjs');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const cls = (e, c) => (' ' + e.className + ' ').includes(` ${c} `);
// Al tekst en bruger kan se: indholdet og title/aria-label på hvert element
const seen = (el) => [el.textContent, ...all(el, () => true).flatMap((e) => [e.attrs.title, e.attrs['aria-label']].filter(Boolean))].join('\n');
const fresh = (seed = 4) => { const L = createLeague(createRng(seed)); return { L, me: L.teams.find((t) => !t.isBot), opp: L.teams.find((t) => t.isBot) }; };
const ARCH = Object.fromEntries(Object.values(ARCHETYPES).flat().map((a) => [a.id, a]));
const listOf = (team, isOwn) => renderLineupList({ team, isOwn, ui: { listLine: 'all' }, onPick() {}, onSort() {}, onBlocked() {}, onLine() {}, onInfo() {} });
const rowOf = (list, id) => all(list, (e) => e.tag === 'tr' && e.dataset.pid === id)[0];

// ---------- 1. Arketypen på Taktik-listen ----------
// Mutationer: mærket vist for modstanderen (isOwn-vagten fjernet) → rød; ✨ i stedet for 🔒/🌟 → rød; "særpræg" tilbage på kortet → rød
test('Taktik-listen: 🔒/🌟 + arketypens navn ved en spiller med arketype (title = beskrivelse + krav), intet ved en uden – og intet på et andet holds liste', () => {
  const { me, opp } = fresh();
  const [a, b, c] = me.tactics.lineupSlots.slice(1, 4).map((id) => me.squad.find((p) => p.id === id));
  a.archetype = { ...ARCH.REGISTA, unlockReq: { passing: 13, ballControl: 13 }, isUnlocked: false };
  b.archetype = { ...ARCH.TARGET_MAN, name: 'Target Man', isUnlocked: true };   // gammel engelsk kopi – navnet fra tabellen
  c.archetype = null;
  const list = listOf(me, true);
  const cellA = rowOf(list, a.id).children[1], cellB = rowOf(list, b.id).children[1], cellC = rowOf(list, c.id).children[1];
  const line = (cell) => all(cell, (e) => cls(e, 'lp-arch'))[0], ico = (cell) => all(cell, (e) => cls(e, 'lp-arch-ico'))[0];
  assert.equal(line(cellA).textContent, '🔒 Regista (spilfordeler)');
  assert.equal(ico(cellA).textContent.trim(), '🔒');
  assert.equal(ico(cellA).attrs.title, 'Arketype: Regista (spilfordeler) – Slår pasninger direkte fra Fase 1 til Fase 3 · Låses op ved: Pasning 13, Boldkontrol 13');
  assert.equal(ico(cellA).attrs['aria-label'], ico(cellA).attrs.title);
  assert.equal(line(cellB).textContent, '🌟 Fyrtårn');
  assert.match(ico(cellB).attrs.title, /^Arketype: Fyrtårn – Opspilspunkt: .* \(låst op\)$/);
  assert.ok(!seen(cellB).includes('Target Man') && !seen(list).includes('✨'));
  assert.equal(line(cellC), undefined); assert.equal(ico(cellC), undefined);
  assert.equal(cellC.textContent, `#${c.shirtNumber} ${c.shortName}`, 'uden arketype: kun "#nr Navn"');
  // modstanderens liste: hans spillere HAR arketyper, men intet mærke og intet navn
  const withArch = opp.squad.filter((p) => p.archetype);
  assert.ok(withArch.length >= 2, 'data: modstanderen har spillere med arketype');
  const ol = listOf(opp, false);
  assert.equal(all(ol, (e) => cls(e, 'lp-arch') || cls(e, 'lp-arch-ico')).length, 0);
  for (const p of withArch) assert.ok(!seen(ol).includes(ARCH[p.archetype.id].name), p.archetype.id);
  assert.ok(!/[🔒🌟]/u.test(all(ol, (e) => e.tag === 'tbody')[0].textContent.replace(/🔒 \?\?/g, '')), 'ingen arketype-ikoner (🔒 ?? = skjult kolonne)');
});

test('"arketype" overalt: kortets låseboks for en modstander siger arketype – ikke særpræg', () => {
  const { opp } = fresh();
  const el = renderCard({ player: opp.squad[0], team: opp, isOwn: false, scouting: [], note: '', onNote() {} });
  assert.ok(el.textContent.includes('Evner, spring, luftduel, arketype og kontrakt'), el.textContent);
  assert.ok(!/særpræg/i.test(el.textContent));
});

// ---------- 2. Skønnets ord i point ----------
// Mutation: grænserne tilbage til roomOf (0,6/0,3) → rød (kanterne); et kaldested med roomOf → rød (testen nedenfor)
test('roomWords: fem trin i evne-point – alle grænser og kanterne', () => {
  assert.deepEqual(ROOM_WORDS.map(([l]) => l), [0.45, 1.5, 3, 5.5, Infinity]);
  const cases = [[-0.3, 'er tæt på sit loft'], [0, 'er tæt på sit loft'], [0.44, 'er tæt på sit loft'], [0.45, 'har lidt mere i sig'], [1.49, 'har lidt mere i sig'],
    [1.5, 'har mere i sig'], [2.99, 'har mere i sig'], [3, 'har meget mere i sig'], [5.49, 'har meget mere i sig'], [5.5, 'har langt mere i sig'], [12, 'har langt mere i sig']];
  for (const [v, w] of cases) assert.equal(roomWords(v), w, String(v));
});

test('Skønnet i point på alle tre steder: kortet, 🏋️ Træning og ungdomstilbuddet (med nøglesnittet) – 2 point = "har mere i sig", ikke roomOf-ordet', async () => {
  const { me } = fresh();
  const p = me.squad[5]; p.potential = Math.round((keyAvg(p) + 2) * 10) / 10;
  const pts = roomPoints(p);
  assert.ok(pts > 1.9 && pts < 2.1 && roomOf(p) > 0.6, 'data: 2 point = roomOf ≈ 0,67 (det gamle "meget mere")');
  assert.equal(roomWords(roomOf(p)), 'har lidt mere i sig', 'roomOf (≈ 0,67) i den nye funktion ville give et forkert ord');
  const card = renderCard({ player: p, team: me, isOwn: true, scouting: [], note: '', onNote() {} });
  assert.equal(byId(card, 'train-estimate').textContent.split(' · ')[0], `Skøn: ${p.shortName} har mere i sig`);
  const tt = renderTrainingTable({ team: me, line: 'all', onLine() {}, onFocus() {}, onFocusMany() {} });
  const row = all(tt, (e) => e.tag === 'tr' && e.dataset.pid === p.id)[0];
  assert.equal(row.children[6].textContent, 'har mere i sig');
  // ungdomstilbuddet efter en spillet sæson
  const { L, me: m2 } = fresh(2), rng = createRng(9);
  for (let r = 0; r < 14; r++) commitRound(L, playRound(L, rng), rng);
  const y = m2.youthOffers[0];
  assert.ok(y, 'data: et ungdomstilbud');
  y.potential = Math.round((keyAvg(y) + 2) * 10) / 10;
  const rep = renderSeasonReport({ league: L, mine: m2, onTake() {}, onDrop() {} });
  const offer = all(rep, (e) => e.dataset.yid === y.id)[0].textContent;
  const snit = keyAvg(y).toFixed(1).replace('.', ',');
  assert.ok(offer.includes(` år · snit ${snit} · skøn: har mere i sig · løn `), offer);
  assert.ok(!offer.includes('meget mere') && !offer.includes('tæt på'), offer);
});

// tools/measure-youth-words.mjs: ungdom ved første syn, 320 tilbud i 20 ligaer. FØR: 95,6 % "har meget mere i sig" (planen skønnede ≈ 91 %).
// EFTER: højst 55 % ét ord (langt mere 17,2 · meget mere 55 · mere 27,8). Båndet: intet ord over 60 % – den gamle fordeling er rød.
test('Målingen: intet skøn-ord over 60 % for ungdom ved første syn – den gamle (roomOf 0,6/0,3) var over 90 %', () => {
  const ys = youthFirstSight(20);
  assert.equal(ys.length, 320);
  assert.ok(ys.every((y) => y.roleTier === 'YOUTH' && y.age <= 18));
  const after = distribution(ys, (p) => roomWords(roomPoints(p))), before = distribution(ys, (p) => oldWords(roomOf(p)));
  const top = (d) => Math.max(...Object.values(d).map((b) => b.pct));
  assert.ok(top(after) <= 60, JSON.stringify(after));
  assert.ok(Object.keys(after).length >= 3, 'mindst tre ord i brug');
  assert.ok(top(before) > 90, `den gamle fordeling skal være rød for båndet: ${JSON.stringify(before)}`);
});

// ---------- 3. 📊 Statistik på kortet ----------
// Kendt matchLog: sæson 2 (nu) og 1, dit hold (indeks me) og to andre hold (A, B). Kampen B–me i sæson 2 tæller for dit hold
// (kendt grænse: loggen gemmer ikke hans side). [S, R, H, A, HG, AG, MIN, RT, ST, G, AS]
function statScene() {
  const { L, me, opp } = fresh(3);
  const M = L.teams.indexOf(me), A = L.teams.findIndex((t, i) => t.isBot && i !== M), B = L.teams.findIndex((t, i) => t.isBot && i !== M && i !== A);
  const p = me.squad.find((x) => x.line === 'MID');
  p.matchLog = [
    [1, 10, A, B, 1, 1, 90, 6.1, 3, 0, 0],   // sæson 1 for et andet hold
    [1, 12, M, A, 2, 0, 90, 7.0, 4, 1, 0],
    [1, 13, B, M, 0, 1, 60, 6.4, 3, 0, 1],
    [2, 1, M, B, 3, 1, 90, 7.8, 4, 2, 1],
    [2, 2, A, M, 1, 1, 75, 6.6, 3, 0, 0],
    [2, 3, B, M, 0, 2, 90, 8.1, 5, 1, 2],     // B mod dit hold – også hvis han kom fra B
  ];
  Object.assign(p, { careerGames: 40, sGames: 3, sMinutes: 255, sGoals: 3, sAssists: 3, sMotm: 2, sYellow: 1, sRed: 0, sCleanSheets: 0, lastMove: null });
  L.leagueMetadata.seasonNumber = 2;
  const last = { seasonNumber: 1, players: { [p.id]: { sGames: 3, sGoals: 1, sMotm: 1, sYellow: 3, sRed: 1, t: me.id, n: p.shortName, nr: p.shirtNumber } } };
  return { L, me, opp, p, M, A, B, last };
}
const statCard = (s, extra = {}) => renderCard({ player: s.p, team: s.me, isOwn: true, scouting: [], note: '', onNote() {}, teams: s.L.teams, season: 2, lastSeason: s.last, ...extra });
const table = (el) => { const t = byId(el, 'card-stats-table'); if (!t) return null; const rows = all(t, (e) => e.tag === 'tr');
  return { head: rows[0].children.map((c) => c.textContent), rows: Object.fromEntries(rows.slice(1).map((r) => [r.children[0].textContent, r.children.slice(1).map((c) => c.textContent)])) }; };

test('📊 Statistik: Sæson 2 / Sæson 1 fra loggen filtreret på holdet (kampe, min., mål, oplæg, snit) – 👑/🟨/🟥 fra s* og lastSeasonStats; står før evnerne', () => {
  const s = statScene(), el = statCard(s), t = table(el);
  assert.equal(byId(el, 'card-stats').children[0].textContent, `📊 Statistik for ${s.me.name}`);
  assert.deepEqual(t.head, ['', 'Sæson 2', 'Sæson 1']);
  assert.deepEqual(t.rows, {
    Kampe: ['3', '2'], 'Min.': ['255', '150'], Mål: ['3', '1'], Oplæg: ['3', '1'], Snit: ['7,5', '6,7'],
    '👑': ['2', '1'], '🟨': ['1', '3'], '🟥': ['0', '1'],
  });
  assert.equal(t.rows['🧤'], undefined, 'kun målmanden har clean sheets');
  // paritet: for en spiller, der ikke er skiftet, er sæsonens kampe/mål = sGames/sGoals
  assert.deepEqual([t.rows.Kampe[0], t.rows.Mål[0]], [String(s.p.sGames), String(s.p.sGoals)]);
  // placering: lige efter hovedet, før evne-bjælkerne
  const kids = el.children.map((c) => c.attrs?.id ?? c.className);
  assert.ok(kids.indexOf('card-stats') === 1 && kids.indexOf('bars') > 1, kids.join(','));
  assert.equal(byId(el, 'card-stats-note'), undefined, 'intet "–" – ingen forklaring');
});

test('📊 Statistik: et andet holds snapshot for sidste sæson giver "–"; uden lastSeasonStats "–"; ingen kampe for holdet → "Ingen kampe for <hold> endnu"', () => {
  const s = statScene();
  s.last.players[s.p.id].t = s.opp.id;
  let t = table(statCard(s));
  assert.deepEqual([t.rows['👑'], t.rows['🟨'], t.rows['🟥']], [['2', '–'], ['1', '–'], ['0', '–']]);
  assert.deepEqual(t.rows.Kampe, ['3', '2'], 'loggen tæller stadig');
  t = table(statCard(s, { lastSeason: null }));
  assert.deepEqual(t.rows['👑'], ['2', '–']);
  // ingen kampe for dette hold (kun for A og B)
  s.p.matchLog = s.p.matchLog.filter((e) => e[LOG.H] !== s.M && e[LOG.A] !== s.M);
  const el = statCard(s);
  assert.equal(byId(el, 'card-stats-empty').textContent, `Ingen kampe for ${s.me.name} endnu`);
  assert.equal(byId(el, 'card-stats-table'), undefined);
});

// Mutation: holdfilteret fjernet (alle kampe tælles) → rød (Kampe 4/3, mål 3/1 … kampen A–B i sæson 1 er ikke hans holds)
test('📊 Statistik: købt i runde 7 (vindue 2·2+1) – kun det nye holds kampe tælles, 👑/🟨/🟥 er "–" i sæsonen; den gamle klubs kampe står ikke', () => {
  const s = statScene();
  // sæson 2: runde 1–6 for A (gammel klub), fra runde 8 for dit hold – s* rummer begge klubbers tal
  s.p.matchLog = [[2, 2, s.A, s.B, 2, 2, 90, 7.2, 4, 2, 0], [2, 5, s.B, s.A, 0, 3, 90, 7.9, 5, 1, 1], [2, 8, s.M, s.B, 1, 0, 90, 6.8, 3, 1, 0], [2, 9, s.A, s.M, 1, 0, 70, 6.0, 2, 0, 0]];
  Object.assign(s.p, { lastMove: 5, sGames: 4, sGoals: 4, sAssists: 1, sMotm: 2, sYellow: 2, sRed: 0 });
  const t = table(statCard(s, { lastSeason: null }));
  assert.deepEqual(t.rows.Kampe, ['2', '0']); assert.deepEqual(t.rows.Mål, ['1', '0']); assert.deepEqual(t.rows['Min.'], ['160', '0']);
  assert.deepEqual(t.rows.Snit, ['6,4', '–']);
  assert.deepEqual([t.rows['👑'][0], t.rows['🟨'][0], t.rows['🟥'][0]], ['–', '–', '–'], 's* rummer den gamle klubs tal');
  assert.ok(byId(statCard(s), 'card-stats-note'), 'forklaringen af "–" står');
  // og købt i vinduet før sæsonen (2·2): hele sæsonen er hos dit hold – s* gælder
  s.p.lastMove = 4;
  assert.deepEqual(table(statCard(s, { lastSeason: null })).rows['👑'], ['2', '–']);
  // skiftede midt i sæson 1 (vindue 3) til dit hold: sæson 1's snapshot rummer begge klubber → "–"
  s.p.lastMove = 3; s.last.players[s.p.id].t = s.me.id;
  assert.deepEqual(table(statCard(s)).rows['👑'], ['2', '–']);
});

// Mutation: Snit vist for modstanderen → rød
test('📊 Statistik for en modstanders spiller: samme tabel UDEN Snit (karakteren er privat)', () => {
  const s = statScene();
  // hans spiller med samme log på modstanderens hold
  const O = s.L.teams.findIndex((t, i) => t.isBot && i !== s.A && i !== s.B), other = s.L.teams[O], q = other.squad[2];
  q.matchLog = s.p.matchLog.map((e) => e.map((v, i) => (i === LOG.H && v === s.M ? O : i === LOG.A && v === s.M ? O : v))).filter((e) => e[LOG.H] !== O || e[LOG.A] !== O);
  Object.assign(q, { sGames: 3, sMotm: 2, sYellow: 1, sRed: 0, lastMove: null, careerGames: 30 });
  const el = renderCard({ player: q, team: other, isOwn: false, scouting: [], note: '', onNote() {}, teams: s.L.teams, season: 2, lastSeason: null });
  const t = table(el);
  assert.deepEqual(Object.keys(t.rows), ['Kampe', 'Min.', 'Mål', 'Oplæg', '👑', '🟨', '🟥']);
  assert.deepEqual(t.rows.Kampe, ['3', '2']);
  const txt = byId(el, 'card-stats').textContent;
  for (const v of ['7,5', '6,7', 'Snit']) assert.ok(!txt.includes(v), v);
  assert.equal(cardStats(q, { isOwn: false, teamIdx: O, teamId: other.id, season: 2 }).rows[0].avg, undefined);
});

test('📊 Statistik under afspilning (hideLog): rundens kamp, mål, 🟥 og 👑 står ikke', () => {
  const s = statScene();
  // runde 3 afspilles: den gav 1 mål og 2 oplæg; s* rummer allerede runden (👑 2, 🟥 1)
  s.p.sRed = 1;
  const t = table(statCard(s, { hideLog: [2, 3] }));
  assert.deepEqual(t.rows.Kampe, ['2', '2']); assert.deepEqual(t.rows.Mål, ['2', '1']); assert.deepEqual(t.rows.Oplæg, ['1', '1']);
  assert.deepEqual([t.rows['👑'][0], t.rows['🟨'][0], t.rows['🟥'][0]], ['–', '–', '–']);
  assert.deepEqual(t.rows['👑'][1], '1', 'sidste sæson er ikke berørt');
});

test('📊 Statistik: målmanden har 🧤 clean sheets; migreret liga (karrierekampe, ingen gemte) siger "ikke gemt" – ikke 0', () => {
  const s = statScene(), gk = s.me.squad.find((x) => x.line === 'GK');
  gk.matchLog = [[2, 1, s.M, s.B, 2, 0, 90, 7.4, 4, 0, 0], [2, 2, s.A, s.M, 0, 0, 90, 7.0, 4, 0, 0]];
  Object.assign(gk, { sGames: 2, sCleanSheets: 2, sMotm: 0, sYellow: 0, sRed: 0, lastMove: null });
  s.last.players[gk.id] = { sGames: 14, sCleanSheets: 5, t: s.me.id };
  const t = table(renderCard({ player: gk, team: s.me, isOwn: true, scouting: [], note: '', onNote() {}, teams: s.L.teams, season: 2, lastSeason: s.last }));
  assert.deepEqual(t.rows['🧤'], ['2', '5']);
  Object.assign(gk, { matchLog: [], careerGames: 31 });
  const el = renderCard({ player: gk, team: s.me, isOwn: true, scouting: [], note: '', onNote() {}, teams: s.L.teams, season: 2, lastSeason: s.last });
  const box = byId(el, 'card-stats').textContent;
  assert.ok(box.includes('ikke gemt') && !box.includes('Ingen kampe') && !/\b0\b/.test(box), box);
});

// ---------- 4. Danske positionskoder ----------
const ENGLISH_ROLE = /\b(LB|RB|LWB|RWB|CDM|CAM|LM|RM|LW|RW|ST|CF|CB)\b/;
test('ROLE_LABEL dækker ALLE roller i de 10 formationer – kun danske koder; CF = OM (den position, der passer på pladsen)', () => {
  const roles = new Set(Object.values(FORMATIONS).flat().map((s) => s.r));
  assert.equal(FORMATION_NAMES.length, 10);
  for (const r of roles) assert.ok(ROLE_LABEL[r], r);
  assert.deepEqual(ROLE_LABEL, { GK: 'MV', CB: 'MS', LB: 'VB', RB: 'HB', LWB: 'VKB', RWB: 'HKB', CDM: 'DM', CM: 'CM', CAM: 'OM', CF: 'OM', LM: 'VM', RM: 'HM', LW: 'VK', RW: 'HK', ST: 'ANG' });
  assert.deepEqual(Object.keys(ROLE_LABEL).sort(), [...roles].sort(), 'ingen overflødige');
  for (const v of Object.values(ROLE_LABEL)) assert.doesNotMatch(v, ENGLISH_ROLE);
  assert.equal(POSITION.CB, 'MS'); assert.equal(POSITION_FULL.CB, 'Midtstopper (MS)');
  assert.equal(ROLE_LABEL.CF, POSITION.AM, 'CF kobles til AM (ROLE_POSITION)');
  assert.equal(roleLabel('XX'), '?', 'aldrig en engelsk kode som fallback');
  assert.deepEqual(PHASE_OPTIONS.attackSide.map(([, l]) => l), ['Venstre (VK/VB)', 'Begge', 'Højre (HK/HB)']);
  assert.ok(FIT_HELP.includes('Kantpladser (VB/HB/VKB/HKB/VM/HM)'), FIT_HELP);
});

// Mutation: én kode tilbage til engelsk (fx LB: 'LB') → rød
test('Alle 10 formationer: Trup (Pos/#), Taktik-listen, banens titler og Match Center viser de danske koder – ingen engelske', () => {
  const { me } = fresh(6);
  for (const f of FORMATION_NAMES) {
    setFormation(me, f);
    const want = FORMATIONS[f].map((s) => ROLE_LABEL[s.r]);
    // Trup
    const mx = renderMatrix({ team: me, isOwn: true, ui: { sortCol: 'pos', sortDesc: false, filter: 'all' }, notes: {}, onSort() {}, onSelect() {}, onSwap() {}, onFilter() {}, onBlocked() {} });
    const pos = all(mx, (e) => e.tag === 'tbody')[0].children.slice(0, 11).map((r) => r.children[0].textContent.split(' #')[0]);
    assert.deepEqual(pos, want, `${f} Trup`);
    // Taktik-listen (Plads-cellen; ⚠ −x % efter koden ved en spiller uden for position)
    const ll = listOf(me, true);
    const place = all(ll, (e) => cls(e, 'start-p')).map((r) => r.children[0].children[0].textContent);
    assert.deepEqual(place, want, `${f} Taktik-listen`);
    // banen: brikkens title starter med koden
    const toks = all(renderPitch({ team: me, isOwn: true, ui: {}, onMove() {}, onSelect() {}, onTokenSwap() {} }), (e) => e.dataset.slot !== undefined && e.className.startsWith('token'));
    assert.deepEqual(toks.map((t) => t.attrs.title.split(/[ –]/)[0]), want, `${f} banen`);
    // Match Center: minibanen og listens plads (placeLabel)
    const entries = me.tactics.lineupSlots.map((id, i) => { const p = me.squad.find((x) => x.id === id); return { playerId: id, shirtNumber: p.shirtNumber, shortName: p.shortName, slot: i, role: FORMATIONS[f][i].r, line: p.line, minIn: 1, minOut: 90, goals: 0, assists: 0, saves: 0, aerialWins: 0, yellowCard: false, injured: false, isMotM: false, rating: 6.5, stars: 3, gainedCounterXp: 0 }; });
    const ev = { min: 90, hG: 0, aG: 0, text: 'Slut', category: 'PLAY', type: 'FULLTIME', label: 'Slut', plot: false, stats: { hPoss: 60, aPoss: 40, hTacticSuccess: 1, aTacticSuccess: 2, hShots: 11, aShots: 12, hOnTarget: 5, aOnTarget: 6, hXg: 1.234, aXg: 0.5, hAerialWon: 3, aAerialWon: 4, hVarChecks: 0, aVarChecks: 1, hFouls: 7, aFouls: 8, hInjuries: 1, aInjuries: 2 } };
    const mc = renderMatchCenter({ mc: { round: 1, matches: [{ homeId: me.id, awayId: 'a', homeName: me.name, awayName: 'Ude', homeTacticStr: '', awayTacticStr: '', homeGoals: 0, awayGoals: 0, events: [ev], startFormations: { home: f, away: null }, ratings: { motm: null, home: entries, away: [] } }], viewIdx: 0, filter: 'all', shownCount: 99, playing: false, gazette: null }, myTeamId: me.id, on: {} });
    const mp = all(mc, (e) => cls(e, 'mp-token'));
    assert.deepEqual(mp.map((t) => t.attrs.title.split(' – ')[0]), want, `${f} minibanen`);
    assert.deepEqual(mp.map((t) => all(t, (e) => cls(e, 'mp-name'))[0].textContent.split(' ')[0]), want);
    for (const [name, el] of [['Trup', mx], ['Taktik', ll], ['Match Center', mc]]) assert.doesNotMatch(seen(el), ENGLISH_ROLE, `${f} ${name}`);
    for (const t of toks) assert.doesNotMatch(seen(t), ENGLISH_ROLE, `${f} brik`);
  }
});

test('placeLabel: "DM (FOR)" – ikke "CDM (DEF)"; indskifteren "ind på VM"; gamle runder gennem tabellen ("MS", "ind (FOR)")', () => {
  const E = (o) => ({ role: 'X', line: 'MID', minIn: 1, slot: null, ...o });
  assert.equal(placeLabel(E({ slot: 5, line: 'DEF' }), '4-2-3-1'), 'DM (FOR)');
  assert.equal(placeLabel(E({ slot: 10, line: 'MID' }), '4-2-3-1'), 'ANG (MID)');
  assert.equal(placeLabel(E({ slot: 0, line: 'GK' }), '4-2-3-1'), 'MV');
  assert.equal(placeLabel(E({ slot: 7, minIn: 63 }), '4-2-3-1'), 'ind på VM');
  assert.equal(placeLabel(E({ slot: undefined, role: 'CB' }), '4-2-3-1'), 'MS');
  assert.equal(placeLabel(E({ slot: undefined, role: 'SUB (DEF)' }), '4-2-3-1'), 'ind (FOR)');
});

// Referatet (match.js): "Din VB … er højt oppe efter sit løb" og "står for langt fra sin VM-zone" – med danske koder
test('Referatet: kontra-forklaringen og Custom-pos-fejlen bruger de danske pladskoder', () => {
  const texts = [];
  for (let seed = 1; seed <= 60 && !(texts.some((t) => /^.* Din (VB|HB|VKB|HKB) /.test(t)) && texts.some((t) => /sin [A-ZÆØÅ]+-zone/.test(t))); seed++) {
    const { me, opp } = fresh(seed);
    me.tactics.phases.phase1_buildUp.offBallRuns = 'MANY';
    const lm = FORMATIONS[me.tactics.baseFormation].findIndex((s) => s.r === 'LM');
    me.tactics.customCoords = { [lm]: { x: 90, y: 80 } };   // langt fra ankeret (15, 45) – ude af zonen
    const m = simulateMatch(me, opp, createRng(seed), { drift: false });
    texts.push(...m.events.map((e) => e.text));
  }
  const counter = texts.filter((t) => / Din [A-ZÆØÅ]+ .* er højt oppe efter sit løb\./.test(t)), zone = texts.filter((t) => /sin [A-ZÆØÅ]+-zone/.test(t));
  assert.ok(counter.length > 0 && zone.length > 0, `data: begge tekster forekommer (${counter.length}/${zone.length})`);
  for (const t of counter) assert.match(t, / Din (VB|HB) /, t);
  for (const t of zone) assert.match(t, /sin VM-zone/, t);
  for (const t of [...counter, ...zone]) assert.doesNotMatch(t, ENGLISH_ROLE, t);
});

test('lineOfRole er uændret – kun visningen er dansk (de interne nøgler i motoren)', () => {
  assert.equal(lineOfRole('CDM'), 'MID'); assert.equal(lineOfRole('LB'), 'DEF'); assert.equal(FORMATIONS['4-4-2'][1].r, 'LB');
});
