// v3.16.3 (tekster – kampene uændrede, se fingerprint.test.mjs): ejefald, målteksterne uden gentagelse, varianter uden rng og
// ingen minutter i referatets tekster. Hver test har data (vagter på antal), og hver regel er efterprøvet ved mutation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { playRound, commitRound } from '../../public/engine/season.js';
import { gen, pickBy, describeGoal, GOAL_KINDS } from '../../public/engine/clues.js';
import { pickBy as columnPickBy } from '../../public/engine/column.js';

const tag = (e) => `#${e.shirtNumber} ${e.shortName}`;
// De 400 kampe fra fingeraftrykket (samme seeds) – her de første n
const matches = (n) => Array.from({ length: n }, (_, i) => {
  const s = i + 1, L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
  return s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
});
const M200 = matches(200);

// ---------- Ejefald (gen) ----------
test('gen: "Roskilde Rovers\'", "Aarhus\'", "Lyngby Tacticians\'", "Max\'", "Kjærs", "Hansens" – og pickBy bor i clues.js (column.js re-eksporterer den samme)', () => {
  assert.deepEqual(['Roskilde Rovers', 'Aarhus', 'Lyngby Tacticians', 'Max', 'Fritz', 'Kjær', 'Hansen', '#8 J. Kjær', 'FC Vejleå'].map(gen),
    ["Roskilde Rovers'", "Aarhus'", "Lyngby Tacticians'", "Max'", "Fritz'", 'Kjærs', 'Hansens', '#8 J. Kjærs', 'FC Vejleås']);
  assert.equal(gen('KRONBORG UNITED'), 'KRONBORG UNITEDs'); assert.equal(gen('BOS'), "BOS'", 'stort S');
  assert.equal(columnPickBy, pickBy, 'én funktion, ikke to kopier');
});
test('ejefald i referatet: "Roskilde Rovers\' pres" står, og ingen "ss " i 200 kampes referater (før: "Roverss pres", "Tacticianss")', () => {
  const texts = M200.flatMap((m) => m.events.map((e) => e.text));
  assert.ok(texts.length > 5000, `data: ${texts.length} linjer`);   // 7455
  assert.ok(texts.some((t) => t.includes("Roskilde Rovers' pres")), 'data: Roskilde Rovers presser i udvalget');
  assert.ok(texts.some((t) => t.includes("Lyngby Tacticians' pres")));
  const bad = texts.filter((t) => /ss /.test(t));
  assert.deepEqual(bad.slice(0, 3), []);
  // Spillernavne på -s/-x/-z: ejefaldet med apostrof, aldrig "…ss"
  const names = new Set(M200.flatMap((m) => [...m.ratings.home, ...m.ratings.away].map((e) => e.shortName)).filter((n) => /[sxz]$/i.test(n)));
  assert.ok(texts.every((t) => ![...names].some((n) => t.includes(`${n}s `))), 'intet "Navns " for et navn på -s/-x/-z');
});

// ---------- describeGoal: samme rng-forbrug, ingen gentagelse i en kamp ----------
const counting = (vals) => { let n = 0; return { get n() { return n; }, next: () => vals[n++ % vals.length] }; };
test('describeGoal: præcis ét rng.next() pr. kald – med og uden brugte tekster, også når den springer videre (ellers ændres kampene)', () => {
  for (const kind of GOAL_KINDS) {
    const used = new Set(), r = counting([0]), plain = counting([0]);
    const texts = [0, 1, 2, 3].map(() => describeGoal(kind, 'S', 'A', 50, r, used));
    describeGoal(kind, 'S', 'A', 50, plain); describeGoal(kind, 'S', 'A', 50, plain);
    assert.equal(r.n, 4, `${kind}: fire kald, fire træk`); assert.equal(plain.n, 2);
    // rng'en siger hver gang tekst 0: 0, så næste ubrugte (1, 2), og når alle er brugt, rng'ens valg igen (0)
    assert.equal(new Set(texts.slice(0, 3)).size, 3, `${kind}: tre forskellige, før en gentages`);
    assert.equal(texts[3], texts[0], `${kind}: alle brugt → rng'ens tekst`);
    assert.equal(texts[0], describeGoal(kind, 'S', 'A', 50, { next: () => 0 }), 'første kald = uden used');
  }
  // Springet går videre i rækkefølge: rng 0,5 (tekst 1) i en kamp, hvor 1 er brugt → 2; hvor 1 og 2 er brugt → 0
  const at = (j) => describeGoal('COUNTER', 'S', 'A', 50, { next: () => (j + 0.5) / 3 });
  assert.equal(describeGoal('COUNTER', 'S', 'A', 50, { next: () => 0.5 }, new Set(['COUNTER:1'])), at(2));
  assert.equal(describeGoal('COUNTER', 'S', 'A', 50, { next: () => 0.5 }, new Set(['COUNTER:1', 'COUNTER:2'])), at(0));
  assert.equal(describeGoal('COUNTER', 'S', 'A', 50, { next: () => 0.5 }, new Set(['DRIBBLE:1'])), at(1), 'nøglen er typen + teksten');
});

// Hvilken af typens tre tekster en beskrivelse er (skabelonen med pladsholdere → regex)
const TMPL = Object.fromEntries(GOAL_KINDS.map((k) => [k, [0, 1, 2].map((j) => {
  const t = describeGoal(k, 'SSS', 'AAA', 0, { next: () => (j + 0.5) / 3 });
  return new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/SSS'|SSSs|SSS|AAA'|AAAs|AAA/g, '.+?')}$`);
})]));
const variantOf = (g) => TMPL[g.kind].findIndex((r) => r.test(g.desc));
// Alle måltyper får kampens brugte tekster – også hovedstødsmålene (HEADER, CORNER, SETPIECE; rettet efter TM-hjælperens fund).
const WITH_USED = new Set(['LONGSHOT', 'DRIBBLE', 'COUNTER', 'CUTBACK', 'COMBINATION', 'PENALTY', 'FREEKICK', 'HEADER', 'CORNER', 'SETPIECE']);
test('ingen gentaget måltekst i en kamp, før typens tre er brugt (Spilfører: "missil fra langt ude" i 8 af 13 langskud) – 200 kampe', () => {
  let groups = 0, multi = 0;
  for (const m of M200) {
    const per = {};
    for (const g of m.goalsPool) if (WITH_USED.has(g.kind)) (per[g.kind] ??= []).push(variantOf(g));
    for (const [kind, js] of Object.entries(per)) {
      assert.ok(js.every((j) => j >= 0), `${kind}: hver beskrivelse er en af typens tekster`);
      const first = js.slice(0, 3);
      assert.equal(new Set(first).size, first.length, `${kind}: ${js.join(',')}`);
      groups++; if (js.length >= 2) multi++;
    }
  }
  assert.ok(groups > 300 && multi > 60, `data: ${groups} typer i kampe, ${multi} med mindst to mål af samme type`);
});
test('hovedstødsmålene (HEADER/CORNER/SETPIECE) får også kampens brugte tekster (fund, rettet) – describeGoal kaldes uden goalTexts i luftduel-grenen', () => {
  for (const m of M200) {
    const per = {};
    for (const g of m.goalsPool) if (!WITH_USED.has(g.kind)) (per[g.kind] ??= []).push(variantOf(g));
    for (const [kind, js] of Object.entries(per)) { const first = js.slice(0, 3); assert.equal(new Set(first).size, first.length, `${kind}: ${js.join(',')}`); }
  }
});

// ---------- Varianter uden rng: pickBy(liste, tick = minut / 3, id) ----------
// Hver familie: alle varianter forekommer over mange kampe, og hver forekomst er netop pickBy(listen, minuttet, id'et) – samme
// (minut, id) giver altså samme tekst. id'et findes ud fra tag'et i hændelsens holds karakterark (hjemme/ude efter isHome).
const MID = ['styrer midtbanen', 'finder den frie mand', 'spiller sig ud af presset', 'vender op og sætter spillet i gang'];
const CLEAR = ['stiger højest og clearer', 'vinder duellen og header væk', 'kommer først og rydder', 'hamrer bolden ud af feltet'];
const REORG_LABEL = ['omorganiserer sig', 'skifter form', 'flytter rundt'];
const REORG_TEXT = ['Holdet omorganiserer sig på banen.', 'Holdet skifter form – spillerne får nye pladser.', 'Træneren flytter rundt på holdet.'];
const LYN = ['Din lynkontra løber ind i et organiseret forsvar.', 'Modstanderen når hjem, før lynkontraen kommer i gang.', 'Lynkontraen bremses – de er hurtigt tilbage i position.'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function families(ms) {
  const out = { mid: [], clear: [], reorg: [], lyn: [] };
  for (const m of ms) {
    const idOf = (home, t) => (home ? m.ratings.home : m.ratings.away).find((e) => tag(e) === t)?.playerId;
    for (const e of m.events) {
      const mid = e.type === 'TACTIC_WIN' && e.text.match(new RegExp(`(#\\d+ \\S+(?: \\S+)*?) (${MID.map(esc).join('|')})\\.$`));
      if (mid) out.mid.push({ min: e.min, id: idOf(e.isHome, mid[1]), v: mid[2] });
      const cl = e.label === 'Luftduel i feltet' && e.text.match(new RegExp(`\\] [^:]+: (#\\d+ .+?) \\(\\d+ cm\\) (${CLEAR.map(esc).join('|')}) foran #\\d+ .+ \\((.+)\\)\\.$`));
      if (cl) out.clear.push({ min: e.min, id: idOf(e.isHome, cl[1]), v: cl[2], team: cl[3], att: e.isHome ? m.awayName : m.homeName });
      if (e.type === 'TRIGGER' && e.text.startsWith('🔁')) out.reorg.push({ min: e.min, id: e.isHome ? m.homeId : m.awayId, label: e.label.replace(`${e.isHome ? m.homeName : m.awayName} `, ''), v: e.text.replace(/^🔁 \[.+?\] /, '') });
      const ly = e.label === 'Fase 2 pres virker' && e.text.match(new RegExp(`: (#\\d+ .+?) erobrer bolden .* (${LYN.map(esc).join('|')})$`));
      if (ly) out.lyn.push({ min: e.min, id: idOf(e.isHome, ly[1]), v: ly[2] });
    }
  }
  return out;
}
function season(seed, rounds) {
  const rng = createRng(seed), L = createLeague(rng), out = [];
  for (let r = 0; r < rounds; r++) { const res = playRound(L, rng); commitRound(L, res, rng); out.push(...L.lastRound.matches); }
  return out;
}
const SEASON = [...season(21, 14), ...season(22, 14)];
const F = families([...M200, ...SEASON]);

test('variant "styrer midtbanen" (4): alle fire forekommer, og hver er pickBy(listen, tick'et, playmakerens id)', () => {
  assert.ok(F.mid.length > 2000 && F.mid.every((x) => x.id), `data: ${F.mid.length}`);
  assert.deepEqual([...new Set(F.mid.map((x) => x.v))].sort(), [...MID].sort());
  for (const x of F.mid) assert.equal(x.v, pickBy(MID, x.min / 3, x.id), JSON.stringify(x));
});
test('variant "stiger højest og clearer" (4): alle fire forekommer, hver er pickBy(listen, tick'et, forsvarerens id), og skytten står med SIT hold', () => {
  assert.ok(F.clear.length > 200 && F.clear.every((x) => x.id), `data: ${F.clear.length}`);
  assert.deepEqual([...new Set(F.clear.map((x) => x.v))].sort(), [...CLEAR].sort());
  for (const x of F.clear) { assert.equal(x.v, pickBy(CLEAR, x.min / 3, x.id), JSON.stringify(x)); assert.equal(x.team, x.att, 'foran #X (angriberens hold)'); }
});
test('variant "omorganiserer sig" (3): etiket og tekst er samme variant (pickBy på minut og hold-id), alle tre forekommer – og stadig hverken regel, formation eller minut', () => {
  assert.ok(F.reorg.length > 100, `data: ${F.reorg.length}`);
  assert.deepEqual([...new Set(F.reorg.map((x) => x.v))].sort(), [...REORG_TEXT].sort());
  for (const x of F.reorg) {
    assert.equal(x.v, pickBy(REORG_TEXT, x.min / 3, x.id)); assert.equal(x.label, pickBy(REORG_LABEL, x.min / 3, x.id));
    assert.equal(REORG_LABEL.indexOf(x.label), REORG_TEXT.indexOf(x.v), 'etiket og tekst følges ad');
  }
});
test('variant "Din lynkontra løber ind i …" (3): alle tre forekommer, hver er pickBy(listen, tick'et, presserens id)', () => {
  assert.ok(F.lyn.length > 100 && F.lyn.every((x) => x.id), `data: ${F.lyn.length}`);
  assert.deepEqual([...new Set(F.lyn.map((x) => x.v))].sort(), [...LYN].sort());
  for (const x of F.lyn) assert.equal(x.v, pickBy(LYN, x.min / 3, x.id), JSON.stringify(x));
});
// FUND (rettet): alle kampens minutter er tick-minutter (deleligt med 3), så pickBy på minuttet gav med tre varianter altid samme
// variant pr. hold/presser. Nu vælges der på tick'et (min / 3) – vogtes her.
test('et hold/en presser får mindst to forskellige af de tre varianter over en sæson (minuttet er altid deleligt med 3)', () => {
  for (const fam of [F.reorg, F.lyn]) {
    const per = new Map();
    for (const x of fam) per.set(x.id, (per.get(x.id) ?? new Set()).add(x.v));
    const many = [...per.values()].filter((s) => s.size > 0);
    assert.ok([...per.entries()].filter(([, s]) => s.size === 1).length < many.length / 2, `${[...per.values()].map((s) => s.size).join(',')}`);
  }
});

// ---------- Ingen minutter i teksterne ----------
test('referatets tekster (og scouting-observationerne) har intet "N. minut", "N. min" eller "\' PAUSE" – 50 kampe; minuttet står ved linjen', () => {
  const ms = M200.slice(0, 50);
  const texts = ms.flatMap((m) => m.events.map((e) => e.text)), obs = ms.flatMap((m) => m.observations.map((o) => o.text));
  assert.ok(texts.length > 1500 && obs.length > 100, `data: ${texts.length} linjer, ${obs.length} observationer`);
  assert.ok(ms.every((m) => m.events.some((e) => e.type === 'HALFTIME' && e.text.startsWith('⏸️ [PAUSE-ANALYSE] '))), 'pausen uden 45\'');
  assert.ok(ms.some((m) => m.events.some((e) => e.type === 'TRIGGER')), 'data: Hvis-Så/omorganisering i udvalget');
  for (const t of texts) { assert.doesNotMatch(t, /\d+\. minut|' PAUSE|I \d+\. min/, t); }
  for (const t of obs) assert.doesNotMatch(t, /\d+\. min/, t);
  assert.ok(obs.some((t) => /^(Scoring|VAR-tjek|Luftduel|Udvist|Kamp-skade|VAR-annullering) \(mod [^)]+\): /.test(t)), 'observationerne har "(mod Hold)"');
});
