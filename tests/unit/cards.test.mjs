// v3.15: røde kort, Kampens/Rundens spiller og spredte træthedsskift (Spilførerens sæsongennemgang: 0 røde kort og 8
// dobbelt-gule på en sæson; en firemålsscorer tabte Kampens spiller til en midtbanespiller; botter skiftede 5 på én gang).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { createSheet, finalizeSheet } from '../../public/engine/ratings.js';
import { buildGazette } from '../../public/engine/gazette.js';
import { MIN_PLAYERS } from '../../public/engine/match-rules.js';

const tagOf = (p) => `#${p.shirtNumber} ${p.shortName}`;
function matches(n, wrap = (r) => r) {
  const out = [];
  for (let s = 1; s <= n; s++) {
    const L = createLeague(createRng(s)), H = L.teams[s % 8], A = L.teams[(s + 3) % 8];
    out.push({ L, H, A, m: simulateMatch(H, A, wrap(createRng(s * 31))) });
  }
  return out;
}
const M = matches(300);

test('kort ét sted: kampstatistikkens gule og røde = karakterarkenes; højst 2 gule; andet gule = rødt; udvisningen står i referatet', () => {
  let reds = 0, second = 0;
  for (const { m } of M) {
    for (const [side, list] of [['h', m.ratings.home], ['a', m.ratings.away]]) {
      assert.equal(m.stats[side + 'Yellows'], list.reduce((a, e) => a + e.yellows, 0));
      assert.equal(m.stats[side + 'Reds'], list.filter((e) => e.red).length);
      for (const e of list) {
        assert.ok(e.yellows <= 2 && (e.yellows === 2) === (e.red === 'SECOND_YELLOW'), JSON.stringify(e));
        if (!e.red) continue;
        reds++; if (e.red === 'SECOND_YELLOW') second++;
        const ev = m.events.find((x) => x.type === 'RED' && x.text.includes(`${e.shortName}`));
        assert.ok(ev && ev.min === e.minOut && ev.plot && ev.category === 'HIGHLIGHT', `${e.shortName}: ${ev?.text}`);
        assert.match(ev.text, e.red === 'SECOND_YELLOW' ? /^🟨🟥 \[.+\] Andet gule kort til .+ – han er udvist! .+ må spille resten af kampen med (ti|ni|otte|syv) mand\.$/ : /^🟥 \[.+\] Direkte rødt kort til .+ for den grove tackling – han er udvist!/);
      }
    }
  }
  assert.ok(reds >= 20 && second >= 10 && reds > second, `data: ${reds} røde, heraf ${second} andet gule`);
});

test('en udvist er ude resten af kampen: ingen indskiftning for ham, pladsen er tom i slutopstillingen', () => {
  let n = 0;
  for (const { m, H, A } of M) {
    for (const ev of m.events.filter((x) => x.type === 'RED')) {
      const side = ev.isHome ? H : A, end = m.endState[ev.isHome ? 'home' : 'away'];
      const p = side.squad.find((x) => ev.text.includes(tagOf(x)));
      assert.ok(!end.starters.includes(p.id) && end.starters.includes(null), 'tom plads');
      assert.ok(!m.events.some((x) => x.type === 'SUB' && x.min >= ev.min && x.isHome === ev.isHome && (x.text.includes(`erstatter ${tagOf(p)}`) || x.text.includes(`${tagOf(p)} ud`))), 'ingen indskiftning for den udviste');
      n++;
    }
  }
  assert.ok(n >= 20, `udvisninger: ${n}`);
});

test(`aldrig færre end ${MIN_PLAYERS} spillere – heller ikke når hver frisparksskade giver direkte rødt`, () => {
  const force = (r) => ({ ...r, chance: (p) => (p === 0.06 || p === 0.4 || p === 0.07 ? true : r.chance(p)) });
  for (const { m } of matches(20, force)) {
    for (const side of ['home', 'away']) assert.ok(m.endState[side].starters.filter(Boolean).length >= MIN_PLAYERS, side);
    assert.ok(m.events.filter((e) => e.type === 'RED').length >= 4, 'data: mange udvisninger');
  }
});

test('Kampens spiller: en firemålsscorer slår midtbanespilleren med mange vundne dueller; en udvist kan ikke vinde; Rundens spiller følger samme rangering', () => {
  const L = createLeague(createRng(2)), T = L.teams[0], rng = createRng(1);
  const sheet = createSheet(), [gk, mid, st, red] = [T.squad[0], T.squad[6], T.squad[9], T.squad[10]];
  for (const p of [gk, mid, st, red]) sheet.register(p, T, true, 'CM', 1, rng, 0);
  for (let i = 0; i < 4; i++) { sheet.adjust(st.id, 1.25); sheet.bump(st.id, 'goals'); }   // 6,5 + 5 = 11,5 → 10,0
  for (let i = 0; i < 12; i++) sheet.adjust(mid.id, 0.2);                                   // 6,5 + 2,4 = 8,9
  sheet.adjust(red.id, 6); sheet.entries[red.id].red = 'DIRECT';                             // 10,0 – men udvist
  for (let i = 0; i < 5; i++) sheet.bump(red.id, 'goals');                                   // og flere mål: uden vagten vandt han
  const r = finalizeSheet(sheet, 4, 0, rng, () => 0);
  assert.equal(r.motm.playerId, st.id, 'firemålsscoreren');
  assert.equal(sheet.entries[st.id].rating, 10);
  // Før v3.15 klemtes ved hver justering, så et rødt kort (−1) efter fire mål trak ham ned fra 10: nu 11,5 − 1 = 10,0
  const s2 = createSheet(); s2.register(st, T, true, 'ST', 1, rng, 0); s2.register(mid, T, true, 'CM', 1, rng, 0);
  for (let i = 0; i < 4; i++) { s2.adjust(st.id, 1.25); s2.bump(st.id, 'goals'); }
  s2.adjust(st.id, -0.4); s2.adjust(mid.id, 3.3);
  assert.equal(finalizeSheet(s2, 4, 0, rng, () => 0).motm.playerId, st.id, 'loftet tager ikke overskuddet fra mål');
  // Rundens spiller: samme rangering, og den udviste med 10,0 springes over
  const match = { homeGoals: 4, awayGoals: 0, homeName: T.name, awayName: 'X', stats: { hVarChecks: 0, aVarChecks: 0 }, goalsPool: [], ratings: { home: r.home, away: [] }, events: [] };
  assert.equal(buildGazette([match]).playerOfTheRound.playerId, st.id);
});

test('resultatet og redningerne: sejr +0,4, nederlag −0,4, og redninger over 4 giver kun det halve', () => {
  const L = createLeague(createRng(3)), [W, Lo] = [L.teams[0], L.teams[1]], rng = createRng(2);
  const sheet = createSheet(), [gk, st] = [Lo.squad[0], W.squad[9]];
  sheet.register(gk, Lo, false, 'GK', 1, rng, 0); sheet.register(st, W, true, 'ST', 1, rng, 0);
  sheet.entries[gk.id].rating = 6.5; sheet.entries[st.id].rating = 6.5;
  for (let i = 0; i < 8; i++) { sheet.adjust(gk.id, 0.5); sheet.bump(gk.id, 'saves'); }   // 6,5 + 4,0 = 10,5
  sheet.adjust(gk.id, -0.3);                                                              // ét mål imod
  sheet.adjust(st.id, 1.25); sheet.bump(st.id, 'goals');                                  // 7,75
  finalizeSheet(sheet, 1, 0, rng, () => 0);
  // Målmanden: 10,5 − 0,3 − 0,4 nederlag − 4·0,25 (redning 5–8 halv værdi) = 8,8 (uden halveringen 9,8; uden resultatet 9,2)
  assert.equal(sheet.entries[gk.id].rating, 8.8);
  // Målscoreren: 7,75 + 0,4 sejr = 8,15 → 8,2 (uden resultatet 7,8)
  assert.equal(sheet.entries[st.id].rating, 8.2);
});

test('et rødt kort stopper spillet: intet sker resten af det minut (den udviste dukker ikke op igen i samme tick)', () => {
  let n = 0;
  for (const { m } of M) m.events.forEach((e, i) => {
    if (e.type !== 'RED') return;
    n++;
    assert.ok(m.events.slice(i + 1).every((x) => x.min !== e.min || x.type === 'FULLTIME' || x.type === 'END' || (x.min === 90 && x.type === 'INFO')), `${e.min}': ${m.events.slice(i + 1).filter((x) => x.min === e.min).map((x) => x.text).join(' | ')}`);
  });
  assert.ok(n >= 20, `udvisninger: ${n}`);
});

test('højst 3 træthedsskift ad gangen – også i pausen (Spilfører: botterne skiftede 4–5 i 45. minut; uden loftet i pausen: 5)', async () => {
  const { playRound, commitRound } = await import('../../public/engine/season.js');
  let at45 = 0;
  for (let s = 1; s <= 4; s++) {
    const rng = createRng(s), L = createLeague(rng);
    for (let r = 0; r < 14; r++) {
      const res = playRound(L, rng);
      for (const m of res.matches) for (const home of [true, false]) {
        const per = {};
        for (const e of m.events.filter((x) => x.type === 'SUB' && x.isHome === home && !/Skadesskift|Hvis-Så/.test(x.text))) per[e.min] = (per[e.min] ?? 0) + 1;
        for (const [min, k] of Object.entries(per)) { assert.ok(k <= 3, `${k} træthedsskift i ${min}. minut`); if (min === '45') at45++; }
      }
      commitRound(L, res, rng);
    }
  }
  assert.ok(at45 >= 5, `data: træthedsskift i pausen ${at45}`);
});
