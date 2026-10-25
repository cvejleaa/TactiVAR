// v3.16.7 (Spilførerens sæsongennemgang af v3.16.6): klummen siger kun det, kampens tal bærer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildColumn, pickBy, STYLE_RULES } from '../../public/engine/column.js';
import { pl } from '../../public/engine/clues.js';

const M = ({ hG = 0, aG = 0, ev = [], pool = [], stats = { hPoss: 50, aPoss: 50 }, ownReports } = {}) => ({
  homeId: 'h1', awayId: 'a1', homeName: 'Hjem', awayName: 'Ude', homeGoals: hG, awayGoals: aG,
  events: ev.map(([min, type, isHome, eh, ea]) => ({ min, type, isHome, hG: eh, aG: ea, text: 'T', label: 'L' })),
  goalsPool: pool.map(([kind, teamName], i) => ({ kind, min: 10 + i, scorer: `S${i}`, teamName })), stats, ownReports,
});
const col = (o) => buildColumn({ matches: [], gazette: null, history: [], table: [], next: [], viewerTeamId: 'h1', round: 5, ...o });
const mine = (m) => col({ matches: [m] }).sections[0].paras;

test('pl: ental/flertal', () => {
  assert.equal(pl(1, 'gang', 'gange'), '1 gang'); assert.equal(pl(0, 'gang', 'gange'), '0 gange'); assert.equal(pl(2, 'afslutning', 'afslutninger'), '2 afslutninger');
});

test('rødt kort: "til trods" kun når kortet kom FØR det afgørende mål – efter det er det "fik rødt kort undervejs"', () => {
  // 2-1: H 1-0, A 1-1, H 2-1 (afgørende). Kort før alle mål, mellem 1-1 og 2-1 (stadig før det afgørende) og efter 2-1.
  const goals = [[20, 'GOAL', true, 1, 0], [30, 'GOAL', false, 1, 1], [60, 'GOAL', true, 2, 1]];
  const at = (k) => { const ev = goals.slice(); ev.splice(k, 0, [k * 10 + 5, 'RED', true]); return mine(M({ hG: 2, aG: 1, ev, stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 0 } })); };
  for (const k of [0, 2]) assert.ok(at(k).includes('Et rødt kort til trods: Hjem vandt med 10 mand.'), `kort som hændelse ${k}: ${at(k).join(' | ')}`);
  assert.ok(at(3).includes('Hjem fik rødt kort undervejs.') && !at(3).some((t) => /til trods|vandt med/.test(t)), `kort efter sejrsmålet: ${at(3).join(' | ')}`);
  // Afgørende mål er IKKE det sidste: 3-1 med 2-1 i 60' og 3-1 i 80' – vinderen førte fra 1-0 (20'), så et kort i 70' er efter
  const g3 = [[20, 'GOAL', true, 1, 0], [30, 'GOAL', true, 2, 0], [50, 'GOAL', false, 2, 1], [80, 'GOAL', true, 3, 1]];
  const late = mine(M({ hG: 3, aG: 1, ev: [...g3.slice(0, 3), [70, 'RED', true], g3[3]], stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 0 } }));
  assert.ok(late.includes('Hjem fik rødt kort undervejs.'), `førte fra 1-0 resten af kampen: ${late.join(' | ')}`);
  // Nederlag og uafgjort: samme regel (QC)
  const loss = mine(M({ hG: 0, aG: 1, ev: [[30, 'GOAL', false, 0, 1], [80, 'RED', true]], stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 0 } }));
  assert.ok(loss.includes('Hjem fik rødt kort undervejs.') && !loss.some((t) => /kostede|op ad bakke/.test(t)), loss.join(' | '));
  const draw = mine(M({ hG: 1, aG: 1, ev: [[10, 'GOAL', true, 1, 0], [30, 'GOAL', false, 1, 1], [80, 'RED', true]], stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 0 } }));
  assert.ok(draw.includes('Hjem fik rødt kort undervejs.') && !draw.some((t) => /holdt point/.test(t)), draw.join(' | '));
  // Uden kortet i referatet (gammelt gem uden RED-hændelse): den neutrale linje – aldrig en påstand
  const old = mine(M({ hG: 2, aG: 1, ev: goals, stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 0 } }));
  assert.ok(old.includes('Hjem fik rødt kort undervejs.'), old.join(' | '));
});

test('"Det kostede:" kun med årsag – ellers "Ét af målene imod kom på kontra."; "fandt ingen vej" kun ved 0 gennembrud', () => {
  const R = (o) => ({ build: 0, buildWon: 0, press: 0, pressWon: 0, crosses: 0, crossesWon: 0, cutbacks: 0, cutbacksBlocked: 0, cutbackGoals: 0, runGoals: 0, counterGoalsAgainst: 0,
    start: { formation: '4-4-2', phases: { phase1_buildUp: { passingStyle: 'SHORT' } } }, end: { formation: '4-4-2', phases: { phase1_buildUp: { passingStyle: 'SHORT', offBallRuns: 'NORMAL' } } }, ...o });
  const v = (r, round = 5) => buildColumn({ matches: [M({ ownReports: { h1: r } })], viewerTeamId: 'h1', round }).sections[0].paras.slice(1);
  assert.deepEqual(v(R({ counterGoalsAgainst: 1 })), ['Modstanderen slog én gang til på kontra.']);
  assert.ok(v(R({ counterGoalsAgainst: 1 })).every((t) => !t.includes('Det kostede')));
  // "fandt ingen vej": variant 2 (pickBy) – find runden, der vælger den, og sammenlign 0 og 3 gennembrud af 8
  const variant2 = [...Array(40).keys()].find((rd) => v(R({ build: 8, buildWon: 3 }), rd)[0]?.startsWith('Kun 3 af 8'));
  assert.ok(variant2 != null, 'data: variant 2 forekommer');
  assert.equal(v(R({ build: 8, buildWon: 3 }), variant2)[0], 'Kun 3 af 8 opbygninger kom forbi presset; de korte pasninger sad fast.');
  assert.equal(v(R({ build: 8, buildWon: 0 }), variant2)[0], 'Kun 0 af 8 opbygninger kom forbi presset; de korte pasninger fandt ingen vej.');
});

test('opfølgning på "air": hovedstød efter dødbolde tæller med – "det holdt også mod jer – begge/deres eneste mål …"', () => {
  const H = (rows) => rows.map((f, i) => ({ round: i + 1, facts: { a1: { poss: 50, shots: 5, onTarget: 2, corners: 8, aerialWon: 3, counterGoals: 0, setPieceGoals: 0, headerGoals: 0, yellows: 0, reds: 0, reorganised: 0, goals: 1, against: 1, ...f } } }));
  const air = STYLE_RULES.find((r) => r.key === 'air');
  const hist = H([{}, {}, {}, {}]);
  const fu = (pool, aG) => (buildColumn({ matches: [M({ aG, pool, stats: { hPoss: 50, aPoss: 50, aCorners: 2 } })], history: hist, viewerTeamId: 'h1', round: 5 }).sections.find((s) => s.id === 'col-next')?.paras ?? []).find((t) => t.startsWith('Før kampen'));
  const pre = `Før kampen skrev jeg, at Ude ${pickBy(air.say, 4, 'air', 'scout')}`;
  assert.equal(fu([['CORNER', 'Ude'], ['SETPIECE', 'Ude']], 2), `${pre} – det holdt også mod jer: begge deres mål kom på hovedstød efter dødbolde.`);
  assert.equal(fu([['CORNER', 'Ude']], 1), `${pre} – det holdt også mod jer: deres eneste mål kom på hovedstød efter dødbolde.`);
  assert.equal(fu([['CORNER', 'Ude'], ['COMBINATION', 'Ude']], 2), `${pre} – det holdt også mod jer: 1 af deres mål kom på hovedstød efter dødbolde.`, 'halvdelen af målene');
  assert.equal(fu([['CORNER', 'Ude'], ['COMBINATION', 'Ude'], ['LONGSHOT', 'Ude']], 3), `${pre} – det gjorde de ikke mod jer.`, '1 af 3 er ikke luft-holdet (QC F3)');
  assert.equal(fu([], 0), `${pre} – det gjorde de ikke mod jer.`);
});

// ---------- Gentagelser (T3 – tekst, intet rng; noprose uændret) ----------
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { HEADER_PROSE } from '../../public/engine/clues.js';
const MISS_TXT = ['skyder forbi den lange stolpe', 'sender bolden over mål', 'rammer stolpen', 'skyder en meter forbi', 'får ikke ram på bolden – den triller forbi', 'banker bolden over overliggeren'];
const corpus = (n, round = 0) => Array.from({ length: n }, (_, i) => {
  const s = i + 1, L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
  return s % 2 ? simulateMatch(me, opp, createRng(s * 131), { round }) : simulateMatch(opp, me, createRng(s * 131), { round });
});
const C = corpus(300);
test('offside: det fulde banner "[DIN OFFSIDE-FÆLDE VIRKER] … dirigerer linjen perfekt" højst én gang pr. halvleg – resten den korte linje', () => {
  let full = 0, short = 0;
  for (const m of C) for (const half of [1, 2]) {
    const ev = m.events.filter((e) => e.label === 'Offside-fælde virker' && e.text.startsWith('✅ [DIN OFFSIDE-FÆLDE') && (half === 1 ? e.min < 45 : e.min >= 45));
    const f = ev.filter((e) => e.text.includes('dirigerer linjen perfekt'));
    assert.ok(f.length <= 1, `${f.length} fulde i ${half}. halvleg`);
    if (ev.length) assert.ok(ev[0].text.startsWith('✅ [DIN OFFSIDE-FÆLDE VIRKER]'), `første er det fulde: ${ev[0].text}`);
    full += f.length; short += ev.length - f.length;
  }
  assert.ok(full >= 30 && short >= 30, `data: ${full} fulde, ${short} korte`);
});
test('hovedstød: båndets tre varianter, aldrig samme to gange i træk for samme spiller; dit/deres åbne spil nævner oplægsgiveren', () => {
  const all = [...HEADER_PROSE.high, ...HEADER_PROSE.mid, ...HEADER_PROSE.low];
  let goals = 0, named = 0; const seen = new Set();
  for (const m of C) {
    const last = new Map();
    for (const e of m.events.filter((x) => x.type === 'HEADER_GOAL')) {
      const pr = all.find((p) => e.text.includes(`– ${p}.`)); assert.ok(pr, e.text); seen.add(pr);
      const who = e.text.match(/(#\d+ [^(]+?) \(\d+ cm\) header/)[1];
      assert.notEqual(last.get(who), pr, `samme prosa to gange i træk: ${who}`); last.set(who, pr);
      goals++;
      if (/MÅÅÅL! /.test(e.text)) { assert.match(e.text, /header bolden ind efter oplæg fra #\d+ .+ – /); named++; }
    }
  }
  assert.ok(goals >= 100 && named >= 30 && seen.size >= 6, `data: ${goals} hovedstødsmål, ${named} i åbent spil, ${seen.size} forskellige prosa`);
});
test('forbi mål: samme "🎯"-tekst gentages ikke i en kamp, før alle seks er brugt', () => {
  let n = 0, rounds = 0;
  for (const m of C) {
    const used = new Set();
    for (const e of m.events.filter((x) => x.type === 'MISS' && x.text.startsWith('🎯'))) {
      const t = MISS_TXT.find((x) => e.text.endsWith(` ${x}.`)); assert.ok(t, e.text);
      assert.ok(!used.has(t), `gentaget før alle var brugt: ${t}`); used.add(t); n++;
      if (used.size === MISS_TXT.length) { used.clear(); rounds++; }
    }
  }
  assert.ok(n >= 250, `data: ${n} forbi-linjer`);   // ≈1 pr. kamp – "alle seks brugt" bevises i engine-branches (tvunget)
});
test('vary + runden: samme kamp i to forskellige runder giver (for nogle aktører) en anden første variant – og samme kamp', () => {
  const a = corpus(40, 0), b = corpus(40, 1);
  let diff = 0;
  a.forEach((m, i) => {
    assert.equal(`${m.homeGoals}-${m.awayGoals}`, `${b[i].homeGoals}-${b[i].awayGoals}`, 'runden ændrer ikke kampen');
    const t = (x) => x.events.filter((e) => e.type === 'TACTIC_WIN').map((e) => e.text).join('|');
    if (t(m) !== t(b[i])) diff++;
  });
  assert.ok(diff >= 20, `data: ${diff} af 40 kampe med andre varianter`);
});

// ---------- Skift i samme pause (T4) og friskheden ved sæsonslut ----------
import { playRound, commitRound } from '../../public/engine/season.js';
const seasonMatches = (() => {
  const out = [];
  for (const seed of [3, 7]) {
    const rng = createRng(seed * 7919), L = createLeague(rng);
    for (let r = 0; r < 10; r++) { const res = playRound(L, rng); out.push(...res.matches); commitRound(L, res, rng); }
  }
  return out;
})();
test('skift lige efter hinanden i samme tick står på samme minut; "tages med i pausen" i 45\', ellers "i samme skifte-pause"', () => {
  let pairs = 0, near45 = 0, nearOther = 0;
  for (const m of seasonMatches) {
    m.events.forEach((e, i) => {
      const p = m.events[i - 1];
      if (e.type === 'SUB' && p?.type === 'SUB' && p.min === e.min && p.isHome === e.isHome) { assert.deepEqual(e.clock, p.clock, `${e.min}: ${JSON.stringify(p.clock)} / ${JSON.stringify(e.clock)}`); pairs++; }
      if (e.type === 'SUB' && /tages med i/.test(e.text)) {
        if (e.min === 45) { assert.match(e.text, /tages med i pausen/); near45++; } else { assert.match(e.text, /tages med i samme skifte-pause/); nearOther++; }
      }
    });
  }
  assert.ok(pairs >= 20 && nearOther >= 1,   // 45'-grenen: tvunget i fatigue-gaps ("samling i 45'")
    `data: ${pairs} skift i samme tick, ${near45} samlet i pausen, ${nearOther} ellers`);
});
test('friskheden: "… til næste runde" – i sæsonens sidste runde "… til første runde i næste sæson" (friskheden følger med)', () => {
  let mid = 0, last = 0;
  for (const seed of [3, 5, 7, 11]) {
    const rng = createRng(seed * 7919), L = createLeague(rng);
    for (let r = 1; r <= 14; r++) {
      const res = playRound(L, rng);
      for (const e of res.matches.flatMap((m) => m.events).filter((x) => x.label === 'Udskiftninger' && x.text.startsWith('🔋'))) {
        if (r === 14) { assert.match(e.text, /friskhed til første runde i næste sæson\.$/); last++; } else { assert.match(e.text, /friskhed til næste runde\.$/); mid++; }
      }
      commitRound(L, res, rng);
    }
  }
  assert.ok(mid >= 10 && last >= 1, `data: ${mid} midt i sæsonen, ${last} i sidste runde`);
});
test('pres (M2): trapWon = referatets offside-fælder for holdet; pressWon tæller dem stadig med; klummen og analysen siger det', () => {
  let traps = 0, offs = 0;
  for (const m of C) for (const [id, r] of Object.entries(m.ownReports ?? {})) {
    const home = r.side === 'home';
    const mine = m.events.filter((e) => e.label === 'Offside-fælde virker' && e.isHome === home).length;
    const theirs = m.events.filter((e) => e.label === 'Offside-fælde virker' && e.isHome !== home).length;
    assert.equal(r.trapWon, mine, `${id}: fælder`); assert.equal(r.oppTrapWon, theirs, `${id}: egne offsides`);
    assert.ok(r.trapWon <= r.pressWon);
    traps += mine; offs += theirs;
  }
  assert.ok(traps >= 50 && offs >= 50, `data: ${traps} fælder, ${offs} egne offsides`);
  // Klummen: med fælder "stoppede opbygningen … (X erobringer, Z offside)"; uden (eller gammelt gem) "vandt bolden"
  const R = (o) => ({ build: 0, buildWon: 0, press: 6, pressWon: 4, crosses: 0, crossesWon: 0, cutbacks: 0, cutbacksBlocked: 0, cutbackGoals: 0, runGoals: 0, counterGoalsAgainst: 0, start: { formation: '4-4-2' }, end: { formation: '4-4-2' }, ...o });
  const v = (r) => buildColumn({ matches: [M({ ownReports: { h1: r } })], viewerTeamId: 'h1', round: 5 }).sections[0].paras.slice(1);
  assert.deepEqual(v(R({ trapWon: 3 })), ['Dit pres stoppede opbygningen 4 af 6 gange (1 erobring, 3 på offside).']);
  assert.deepEqual(v(R({ trapWon: 0 })), ['Dit pres vandt bolden 4 af 6 gange.']);
  assert.deepEqual(v(R({})), ['Dit pres vandt bolden 4 af 6 gange.'], 'gammelt gem uden trapWon');
});
test('pause- og fuldtidsanalysen: uden opbygningsforsøg ingen "0 af 0 gange" – kun presset; med forsøg begge dele', () => {
  let none = 0, some = 0;
  for (const m of C) for (const e of m.events.filter((x) => x.type === 'HALFTIME' || x.type === 'FULLTIME')) {
    assert.ok(!/igennem 0 af 0 gange/.test(e.text), e.text);
    if (/Dit pres (har vundet|vandt|har stoppet|stoppede)/.test(e.text)) none++;
    if (/Din opbygning (er kommet|kom) igennem \d+ af [1-9]/.test(e.text)) some++;
  }
  assert.ok(some >= 100, `data: ${some} med opbygning, ${none} kun pres`);
});

// ---------- Test Manager v3.16.7: huller i grenene ----------
test('rødt kort – kanterne: 0-0 (intet afgørende mål), modstanderens kort tæller ikke som dit, uafgjort bruger SIDSTE mål, flertal', () => {
  const st = (hR, aR) => ({ hPoss: 50, aPoss: 50, hReds: hR, aReds: aR });
  assert.ok(mine(M({ ev: [[30, 'RED', true]], stats: st(1, 0) })).includes('Hjem fik rødt kort undervejs.'), '0-0 med rødt: neutral (ingen crash)');
  // Kun MODSTANDERENS kort står i referatet før det afgørende mål – dit (uden hændelse) er neutralt
  const opp = mine(M({ hG: 1, ev: [[10, 'RED', false], [20, 'GOAL', true, 1, 0]], stats: st(1, 1) }));
  assert.ok(opp.includes('Hjem fik rødt kort undervejs.') && !opp.some((t) => /til trods/.test(t)), opp.join(' | '));
  // Uafgjort 1-1: kort mellem 1-0 og 1-1 → før det sidste mål → "holdt point"
  const draw = mine(M({ hG: 1, aG: 1, ev: [[10, 'GOAL', true, 1, 0], [20, 'RED', true], [30, 'GOAL', false, 1, 1]], stats: st(1, 0) }));
  assert.ok(draw.includes('Hjem holdt point med 10 mand efter udvisningen.'), draw.join(' | '));
  assert.ok(mine(M({ hG: 2, aG: 1, ev: [[10, 'GOAL', true, 1, 0], [20, 'GOAL', false, 1, 1], [30, 'GOAL', true, 2, 1], [80, 'RED', true], [85, 'RED', true]], stats: st(2, 0) })).includes('Hjem fik 2 røde kort undervejs.'));
});
test('"air"-opfølgningen tæller kun MODSTANDERENS dødboldshovedstød; "alle 3 mål"; reglens egen dom uden tilføjelse; "(heraf N offside)"', () => {
  const H = (rows) => rows.map((f, i) => ({ round: i + 1, facts: { a1: { poss: 50, shots: 5, onTarget: 2, corners: 8, aerialWon: 3, counterGoals: 0, setPieceGoals: 0, headerGoals: 0, yellows: 0, reds: 0, reorganised: 0, goals: 1, against: 1, ...f } } }));
  const air = STYLE_RULES.find((r) => r.key === 'air'), hist = H([{}, {}, {}, {}]);
  const fu = (pool, aG, st = { hPoss: 50, aPoss: 50, aCorners: 2 }) => (buildColumn({ matches: [M({ aG, pool, stats: st })], history: hist, viewerTeamId: 'h1', round: 5 }).sections.find((s) => s.id === 'col-next')?.paras ?? []).find((t) => t.startsWith('Før kampen'));
  const pre = `Før kampen skrev jeg, at Ude ${pickBy(air.say, 4, 'air', 'scout')}`;
  assert.equal(fu([['CORNER', 'Hjem'], ['CORNER', 'Hjem'], ['COMBINATION', 'Ude']], 1), `${pre} – det gjorde de ikke mod jer.`, 'dit holds hjørnesparksmål tæller ikke');
  assert.equal(fu([['CORNER', 'Ude'], ['SETPIECE', 'Ude'], ['CORNER', 'Ude']], 3), `${pre} – det holdt også mod jer: alle 3 mål kom på hovedstød efter dødbolde.`);
  assert.equal(fu([['CORNER', 'Ude']], 1, { hPoss: 50, aPoss: 50, aCorners: 8 }), `${pre} – det holdt også mod jer.`, 'reglen holdt af sig selv (8 hjørnespark): ingen tilføjelse');
  const R = (o) => ({ build: 8, buildWon: 2, press: 0, pressWon: 0, crosses: 0, crossesWon: 0, cutbacks: 0, cutbacksBlocked: 0, cutbackGoals: 0, runGoals: 0, counterGoalsAgainst: 0, start: { formation: '4-4-2' }, end: { formation: '4-4-2' }, ...o });
  const v3 = [...Array(40).keys()].map((rd) => buildColumn({ matches: [M({ ownReports: { h1: R({ oppTrapWon: 3 }) } })], viewerTeamId: 'h1', round: rd }).sections[0].paras[1]).find((t) => t?.startsWith('Modstanderens pres'));
  assert.equal(v3, 'Modstanderens pres lukkede 6 af 8 opbygninger (heraf 3 offside).');
});
test('FASE 1 VIRKER for andre hold: tre varianter, vary pr. hold (bot mod bot – dit hold er ikke med)', () => {
  const FASE1 = (a, d) => [`${a} spiller sig igennem ${d}s pres.`, `${a} kommer forbi ${d}s pres.`, `${d}s pres bliver spillet over.`];
  const seen = new Set(); let n = 0;
  for (let s = 1; s <= 40; s++) {
    const L = createLeague(createRng(s * 97)), bots = L.teams.filter((t) => t.isBot), [h, a] = [bots[s % 7], bots[(s + 3) % 7]];
    const m = simulateMatch(h, a, createRng(s * 131));
    const last = new Map();
    for (const e of m.events.filter((x) => x.text?.startsWith('✅ [FASE 1 VIRKER • '))) {
      const att = e.text.match(/^✅ \[FASE 1 VIRKER • (.+?)\] /)[1], def = att === h.name ? a.name : h.name;
      const body = e.text.replace(/^✅ \[FASE 1 VIRKER • .+?\] /, '');
      const v = FASE1(att, def.replace(/s$/, '')).findIndex((t) => body.startsWith(t) || body.startsWith(t.replace(`${def.replace(/s$/, '')}s`, `${def}'`)));
      assert.ok(v >= 0, body); seen.add(v); n++;
      assert.notEqual(last.get(att), v, `samme variant to gange i træk: ${att}`); last.set(att, v);
    }
  }
  assert.ok(n >= 200 && seen.size === 3, `data: ${n} linjer, ${seen.size} varianter`);
});
test('ental: "1 høj bold (1 vundet luftduel …)" og "1 cutback (" står, aldrig "1 høje bolde"/"1 cutbacks"', () => {
  let one = 0;
  for (const m of [...C, ...seasonMatches]) for (const e of m.events.filter((x) => x.type === 'FULLTIME')) {
    assert.ok(!/\b1 høje bolde|\b1 cutbacks|\b1 vundne luftdueller|\b1 afslutninger/.test(e.text), e.text);
    if (/\b1 høj bold|\b1 cutback \(|\b1 vundet luftduel/.test(e.text)) one++;
  }
  assert.ok(one >= 3, `data: ${one} entalsformer`);
});
