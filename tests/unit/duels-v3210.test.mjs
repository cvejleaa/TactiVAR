// v3.21.0 Test Manager – det movement-v3210.test.mjs ikke dækker: duellens mand efter afstand (nearPick), duel-tallene (duels/duelsWon),
// at de er private (visibility.js) og 🤼-kolonnen (matchcenter.js). Før dette lå alt det kun i golden-hashene (trace-golden*,
// fingerprint): en hash siger "noget ændrede sig", ikke hvad der skulle gælde – og 3 af 3 visibility-/UI-mutationer overlevede helt.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  scrollIntoView() {}
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch, runZone } = await import('../../public/engine/match.js');
const { coupledPositions, livePositions } = await import('../../public/engine/positions.js');
const { FORMATIONS, lineOfRole, slotPosition } = await import('../../public/engine/formations.js');
const { RATING_PRIVATE_FIELDS, viewRatingEntry } = await import('../../public/engine/visibility.js');
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');
const { clearReplays } = await import('../../public/ui/replay.js');

const tag = (p) => `#${p.shirtNumber} ${p.shortName}`;
// Samme kampe som trace-golden: dit hold (kun dér fortælles presset i 1. person) hjemme/ude skiftevis
function games(n) {
  const out = [];
  for (let s = 1; s <= n; s++) {
    const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const [home, away] = s % 2 ? [me, opp] : [opp, me];
    out.push({ s, home, away, m: simulateMatch(home, away, createRng(s * 131)) });
  }
  return out;
}
const BIG = games(1500), G = BIG.slice(0, 120);

test('duels/duelsWon er private (viewRatingEntry): modstanderens ark viser dem ikke, dit eget gør – og begge står i listen', () => {
  const e = { playerId: 'p', stars: 3, duels: 7, duelsWon: 4, goals: 1 };
  const o = viewRatingEntry(e, false), mine = viewRatingEntry(e, true);
  assert.ok(!('duels' in o), 'duels røber hvem der står nærmest = modstanderens opstilling');
  assert.ok(!('duelsWon' in o), 'duelsWon er privat');
  assert.equal(o.goals, 1, 'det offentlige står stadig'); assert.equal(o.stars, 3);
  assert.equal(mine.duels, 7); assert.equal(mine.duelsWon, 4);
  for (const k of ['duels', 'duelsWon']) assert.ok(RATING_PRIVATE_FIELDS.includes(k), k);
});

// Offside-fælden er bagkædens duel, ikke presserens (5575241): presseren tælles i build-grenen og i pres-uden-fælde-grenen (pressWon − trapWon).
test('duel-tallene: pr. hold = presserens duel (opbygning vundet + pres uden fælde) + modstanderens løb (som markør); vundet = pres uden fælde + modstanderens tabte løb – offside-fælden tæller ikke', () => {
  let press = 0, runs = 0, won = 0, trap = 0;
  for (const { s, home, away, m } of G) for (const [side, team, other] of [['home', home, away], ['away', away, home]]) {
    const d = m.duelLog[team.id], o = m.duelLog[other.id], list = m.ratings[side];
    const sum = (k) => list.reduce((a, e) => a + e[k], 0);
    assert.ok(list.every((e) => Number.isInteger(e.duels) && Number.isInteger(e.duelsWon) && e.duelsWon <= e.duels), `seed ${s}: heltal, vundet ≤ dueller`);
    const noTrap = d.pressWon - d.trapWon;   // presset vandt uden fælde = presserens vundne duel
    assert.equal(sum('duels'), d.press - d.trapWon + o.runs, `seed ${s} ${side}: dueller = pres (${d.press}) − fælde (${d.trapWon}) + modstanderens løb (${o.runs})`);
    assert.equal(sum('duelsWon'), noTrap + (o.runs - o.runsWon), `seed ${s} ${side}: vundne = pres uden fælde (${noTrap}) + tabte løb (${o.runs - o.runsWon})`);
    trap += d.trapWon;
    assert.ok(list.filter((e) => e.role === 'GK').every((e) => e.duels === 0), `seed ${s}: målmanden er aldrig nærmeste mand`);
    press += d.press; runs += o.runs; won += sum('duelsWon');
  }
  assert.ok(press > 1500 && runs > 150 && won > 700 && won < press + runs && trap > 100, `data: pres ${press}, løb ${runs}, vundne ${won}, fælder ${trap}`);   // begge slags dueller tælles, og fælder findes (ellers beviser det ikke at de er fraregnet)
});

// Presseren er en af de NEAR_POOL = 3 nærmeste midtbanespillere (vægt friskhed / afstand²) – målt i det billede, motoren regnede på
// (samme kald som tick'et: coupledPositions med kampens driftSeed og t = minut / 3). Fordeling over 120 kampe → N prøver:
// rang 0 / 1 / 2 = ≈ 66 / 23 / 10 %. Rød mod: altid nærmeste og pulje 1 (100 / 0 / 0), pulje 10 (rang 3 findes), rng.pick (rang 3, 25 / 30 / 27 %),
// afstand i stedet for afstand² (52 / 32 / 16), afstand³ (75 / 20 / 4), NEAR_MIN 20 (44 / 40 / 16), den fjerneste først (0 / 69 / 24).
test('presseren vælges efter afstand: blandt de tre nærmeste midtbanespillere til opspilleren, oftest den nærmeste – men ikke altid', () => {
  const hist = [0, 0, 0, 0, 0, 0];
  let n = 0, own = 0, ownClose = 0;
  for (const { home, away, m } of BIG.slice(0, 500)) {
    const T = { h: home, a: away };
    const stop = m.events.find((e) => ['SUB', 'RED', 'TRIGGER'].includes(e.type))?.min ?? Infinity;   // før skift er alle 11 på banen med den trukne form
    for (const e of m.events) {
      if (e.type !== 'TACTIC_FAIL' || e.min >= stop || !/erobrer bolden fra/.test(e.text)) continue;
      const defSide = e.isHome ? 'h' : 'a', attSide = e.isHome ? 'a' : 'h';
      const defL = m.ratings[e.isHome ? 'home' : 'away'], attL = m.ratings[e.isHome ? 'away' : 'home'];
      const pr = defL.find((x) => e.text.includes(`${tag(x)} erobrer bolden fra`)), pm = attL.find((x) => e.text.includes(`bolden fra ${tag(x)} (`));
      if (!pr || !pm) continue;
      const dr = (side) => ({ seed: m.driftSeed, team: side === 'h' ? 1 : 2, t: e.min / 3 });
      const at = T[attSide].tactics, dt = T[defSide].tactics, on = Array(11).fill(true);
      const live = livePositions(at, { attacking: true, ballX: 50, drift: dr(attSide) });
      const tp = coupledPositions(at, dt, { ballX: live[pm.slot]?.x ?? 50, ballOn: on, oppOn: on, ballDrift: dr(attSide), oppDrift: dr(defSide) });
      const pt = { x: 100 - tp.ball[pm.slot].x, y: 100 - tp.ball[pm.slot].y }, F = FORMATIONS[dt.baseFormation] || FORMATIONS['4-4-2'];
      const ds = F.map((c, i) => i).filter((i) => i > 0 && lineOfRole(F[i].r) === 'MID')
        .map((i) => ({ i, d: Math.hypot(tp.opp[i].x - pt.x, tp.opp[i].y - pt.y) })).sort((a, b) => a.d - b.d || a.i - b.i);
      const rank = ds.findIndex((x) => x.i === pr.slot);
      assert.ok(rank >= 0, `${tag(pr)} er en midtbanespiller`);
      hist[rank]++; n++;
      if (/\[DIT PRES VIRKER\]/.test(e.text)) { own++; assert.equal(/han stod nærmest\./.test(e.text), rank === 0, `"nærmest" kun om nr. 1 (rang ${rank}): ${e.text}`); if (rank > 0) ownClose++; }
    }
  }
  assert.ok(own >= 20 && ownClose >= 3, `data: ${own} egne erobringer, ${ownClose} tæt på`);
  const share = hist.map((x) => x / n);
  assert.ok(n >= 400, `data: ${n} erobringer`);
  assert.equal(hist.slice(3).reduce((a, b) => a + b, 0), 0, `kun de 3 nærmeste: ${hist}`);
  assert.ok(share[0] >= 0.58 && share[0] <= 0.73, `nærmeste ${share[0].toFixed(3)} (hist ${hist}) – bånd 0,58–0,73: altid nærmeste/pulje 1 = 1,0; afstand i stedet for afstand² = 0,52; afstand³ = 0,75`);
  assert.ok(share[1] >= 0.15 && share[2] >= 0.07, `nr. 2 ${share[1].toFixed(3)} og nr. 3 ${share[2].toFixed(3)} (hist ${hist}) – afstand³ giver nr. 3 = 0,04`);
});

// Markøren i midten (løb uden bold, ikke kanten): den forsvarer, der står nærmest løberen – samme pulje på 3 og samme afstand som presseren.
// 'Opsnappet' nævner både markør og løber. 57 prøver af 1500 kampe: rang 0 / 1 / 2 = 37 / 16 / 4. Rød mod: markøren trukket tilfældigt (N19: rang 3 i 17 af 59),
// afstanden målt fra en forkert løber (N18: rang 3-4 i 16 af 61), pulje 10 (3 af 58 på rang 3), altid nærmeste (54 af 54 på rang 0).
test('markøren i midten er en af de tre nærmeste forsvarere til løberen – oftest den nærmeste', () => {
  const hist = [0, 0, 0, 0, 0, 0];
  let n = 0;
  for (const { home, away, m } of BIG) {
    const T = { h: home, a: away };
    const stop = m.events.find((e) => ['SUB', 'RED', 'TRIGGER'].includes(e.type))?.min ?? Infinity;
    for (const e of m.events) {
      if (e.label !== 'Opsnappet' || e.min >= stop) continue;
      const defSide = e.isHome ? 'h' : 'a', attSide = e.isHome ? 'a' : 'h';
      const defL = m.ratings[e.isHome ? 'home' : 'away'], attL = m.ratings[e.isHome ? 'away' : 'home'];
      const mk = defL.find((x) => e.text.includes(`${tag(x)} (`) || e.text.includes(`${tag(x)} tager bolden`)), ru = attL.find((x) => e.text.includes(`${tag(x)} løber sig fri`) || e.text.includes(`fra ${tag(x)} (`));
      if (!mk || !ru) continue;
      const at = T[attSide].tactics, dt = T[defSide].tactics;
      if (runZone(slotPosition(at, ru.slot)) === 'WIDE') continue;   // på kanten dækker backen på hans side (flankBack)
      const dr = (side) => ({ seed: m.driftSeed, team: side === 'h' ? 1 : 2, t: e.min / 3 }), on = Array(11).fill(true);
      const tp = coupledPositions(at, dt, { ballX: 50, ballOn: on, oppOn: on, ballDrift: dr(attSide), oppDrift: dr(defSide) });
      const pt = { x: 100 - tp.ball[ru.slot].x, y: 100 - tp.ball[ru.slot].y }, F = FORMATIONS[dt.baseFormation] || FORMATIONS['4-4-2'];
      const ds = F.map((c, i) => i).filter((i) => i > 0 && lineOfRole(F[i].r) === 'DEF')
        .map((i) => ({ i, d: Math.hypot(tp.opp[i].x - pt.x, tp.opp[i].y - pt.y) })).sort((a, b) => a.d - b.d || a.i - b.i);
      const rank = ds.findIndex((x) => x.i === mk.slot);
      if (rank < 0) continue;
      hist[rank]++; n++;
    }
  }
  assert.ok(n >= 40, `data: ${n} opsnapninger i midten`);
  assert.equal(hist.slice(3).reduce((a, b) => a + b, 0), 0, `kun de 3 nærmeste: ${hist}`);
  assert.ok(hist[0] / n >= 0.5 && hist[0] / n < 1, `nærmeste ${hist[0] / n} (hist ${hist})`);
});

test('presset fortælles kun i dit eget holds referat: "nærmest" kun om nr. 1, ellers "tæt på"; når presset brydes nævnes presseren ikke', () => {
  let brydes = 0, nearest = 0, close = 0;
  for (const { m } of G) for (const e of m.events) {
    if (/\[DIT PRES BRYDES\]/.test(e.text)) { brydes++; assert.match(e.text, / – presset når ikke frem\./); assert.doesNotMatch(e.text, /nærmeste mand|nærmest|tæt på/); }
    else if (/\[DIT PRES VIRKER\]/.test(e.text)) {
      assert.match(e.text, /erobrer bolden fra #\d+ .+ \(.+\) – han stod (nærmest|tæt på)\./);
      if (/han stod nærmest\./.test(e.text)) nearest++; else close++;
    } else assert.doesNotMatch(e.text, /nærmeste mand|stod nærmest|stod tæt på|presset når ikke frem/, e.text);   // modstanderens og andre holds tekster røber intet om afstand
  }
  assert.ok(brydes >= 20 && nearest >= 8 && close >= 3, `data: ${brydes} brydes, ${nearest} nærmest, ${close} tæt på`);
});

// 🤼-kolonnen: dit ark har den (vundet / i alt), modstanderens ikke (det røber hvem der står nærmest = hans opstilling)
const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const cls = (e, c) => e.className.split(' ').includes(c);
function renderWith(myTeamId, fn) {
  const { home, away, m } = G[0];
  const ratings = { ...m.ratings, home: m.ratings.home.map(fn), away: m.ratings.away.map((e, i) => fn(e, i + 20)) };
  clearReplays();
  const mc = { round: 1, matches: [{ ...m, ratings }], gazette: { goalOfTheRound: null, totalGoals: 0, totalVarChecks: 0 }, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false };
  const el = renderMatchCenter({ mc, myTeamId, on: { skip() {}, view() {}, snapshot() {}, openGoal() {}, filter() {}, heat() {}, replay() {} } });
  return { tables: all(el, (e) => cls(e, 'ratings')), home, away, ratings };
}
test('🤼-kolonnen: dit ark viser vundet/i alt pr. spiller (tom ved 0 dueller), modstanderens ark har den slet ikke', () => {
  const fn = (e, i) => { const o = { ...e, duels: i % 4 === 2 ? 0 : i + 3, duelsWon: i % 4 === 1 ? undefined : i % 3 }; if (i % 4 === 0) { delete o.duels; delete o.duelsWon; } return o; };   // i % 4 === 0: gammelt gem uden felterne
  for (const mine of ['home', 'away']) {
    const { tables, ratings } = renderWith(mine === 'home' ? G[0].home.id : G[0].away.id, fn);
    const [own, theirs] = mine === 'home' ? [tables[0], tables[1]] : [tables[1], tables[0]], list = ratings[mine];
    assert.equal(all(own, (x) => x.tag === 'td' && cls(x, 'duel')).length, list.length, `${mine}: én 🤼-celle pr. spiller`);
    const want = [];
    for (const e of list) {
      const row = all(own, (x) => x.tag === 'tr').find((r) => r.children[0].textContent.startsWith(`${tag(e)} `));
      const cell = row.children.find((c) => cls(c, 'duel')), w = e.duels ? `${e.duelsWon ?? 0}/${e.duels} 🤼` : '';
      assert.equal(cell.textContent, w, tag(e)); want.push(w);
    }
    assert.ok(want.some((w) => w === '') && want.some((w) => /^0\/\d+ 🤼$/.test(w)) && want.some((w) => /^[12]\/\d+ 🤼$/.test(w)), 'data: tom, 0/x og y/x');
    assert.equal(all(theirs, (x) => cls(x, 'duel')).length, 0, `${mine}: modstanderens ark har ingen 🤼-kolonne`);
    assert.doesNotMatch(theirs.textContent, /🤼/);
  }
});
