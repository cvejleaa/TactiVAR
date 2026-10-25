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
const LEAD_DESC = /^#\d+ .+? (løber sig fri|når baglinjen) /;
// Alle måltyper får kampens brugte tekster – også hovedstødsmålene (HEADER, CORNER, SETPIECE; rettet efter TM-hjælperens fund).
const WITH_USED = new Set(['LONGSHOT', 'DRIBBLE', 'COUNTER', 'CUTBACK', 'COMBINATION', 'PENALTY', 'FREEKICK', 'HEADER', 'CORNER', 'SETPIECE']);
test('ingen gentaget måltekst i en kamp, før typens tre er brugt (Spilfører: "missil fra langt ude" i 8 af 13 langskud) – 200 kampe', () => {
  let groups = 0, multi = 0;
  for (const m of M200) {
    const per = {};
    // Dit holds løb (v3.16.3): Rundens mål er linjens egen fortælling, ikke describeGoal – genkendt positivt på indledningen
    for (const g of m.goalsPool) if (WITH_USED.has(g.kind) && !LEAD_DESC.test(g.desc)) (per[g.kind] ??= []).push(variantOf(g));
    for (const [kind, js] of Object.entries(per)) {
      assert.ok(js.every((j) => j >= 0), `${kind}: hver beskrivelse er en af typens tekster`);
      const first = js.slice(0, 3);
      assert.equal(new Set(first).size, first.length, `${kind}: ${js.join(',')}`);
      groups++; if (js.length >= 2) multi++;
    }
  }
  assert.ok(groups > 300 && multi > 45, `data: ${groups} typer i kampe, ${multi} med mindst to mål af samme type`);   // v3.17.0: > 60 → > 45 (53 – færre mål af samme type pr. kamp, da halvchancen giver to nye typer)
});
test('hovedstødsmålene (HEADER/CORNER/SETPIECE) får også kampens brugte tekster (fund, rettet: describeGoal blev kaldt uden goalTexts i luftduel-grenen)', () => {
  let multi = 0;
  for (const m of M200) {
    const per = {};
    // Før stod her !WITH_USED – tom, efter at hovedstødsmålene kom med (grøn uden data). Nu: netop de tre typer, med datavagt.
    for (const g of m.goalsPool) if (['HEADER', 'CORNER', 'SETPIECE'].includes(g.kind)) (per[g.kind] ??= []).push(variantOf(g));
    for (const [kind, js] of Object.entries(per)) {
      assert.ok(js.every((j) => j >= 0), kind); const first = js.slice(0, 3); assert.equal(new Set(first).size, first.length, `${kind}: ${js.join(',')}`);
      if (js.length >= 2) multi++;
    }
  }
  assert.ok(multi >= 4, `data: ${multi} kampe med mindst to hovedstødsmål af samme type`);   // 5
});

// ---------- Varianter uden rng: vary = pickBy(liste, n, familie, aktør) – n = aktørens n'te brug i kampen ----------
// v3.16.3 (Spilfører: "styrer midtbanen" tre gange for samme spiller i én kamp – pickBy på tick'et ramte samme variant hvert
// 4. tick): hver (familie, aktør) går én variant videre, hver gang den bruges i kampen. Reglen: aktørens n'te forekomst (0, 1, …)
// i en kamp er pickBy(listen, n, familie, id) – så samme aktør får aldrig samme variant to gange i træk, og alle varianter
// bruges, før en gentages. id'et findes ud fra tag'et i hændelsens holds karakterark (hjemme/ude efter isHome).
const MID = ['styrer midtbanen', 'finder den frie mand', 'spiller sig ud af presset', 'vender op og sætter spillet i gang'];
const CLEAR = ['stiger højest og clearer', 'vinder duellen og header væk', 'kommer først og rydder', 'hamrer bolden ud af feltet'];
const REORG_LABEL = ['omorganiserer sig', 'skifter form', 'flytter rundt'];
const REORG_TEXT = ['Holdet omorganiserer sig på banen.', 'Holdet skifter form – spillerne får nye pladser.', 'Træneren flytter rundt på holdet.'];
const LYN = ['Din lynkontra løber ind i et organiseret forsvar.', 'Modstanderen når hjem, før lynkontraen kommer i gang.', 'Lynkontraen bremses – de er hurtigt tilbage i position.'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Pr. familie: én post pr. forekomst med kampens nr. (mi), aktørens id og n = hvor mange gange aktøren har haft familien før i kampen.
function families(ms) {
  const out = { mid: [], clear: [], reorg: [], lyn: [] };
  ms.forEach((m, mi) => {
    const idOf = (home, t) => (home ? m.ratings.home : m.ratings.away).find((e) => tag(e) === t)?.playerId;
    const seen = new Map();
    const push = (fam, x) => { const k = `${fam}|${x.id}`, n = seen.get(k) ?? 0; seen.set(k, n + 1); out[fam].push({ ...x, mi, n, r: m.round ?? 0 }); };   // r: runden (v3.16.7 – vary starter fra runden)
    for (const e of m.events) {
      const mid = e.type === 'TACTIC_WIN' && e.text.match(new RegExp(`(#\\d+ \\S+(?: \\S+)*?) (${MID.map(esc).join('|')})\\.$`));
      if (mid) push('mid', { min: e.min, id: idOf(e.isHome, mid[1]), v: mid[2] });
      const cl = e.label === 'Luftduel i feltet' && e.text.match(new RegExp(`\\] [^:]+: (#\\d+ .+?) \\(\\d+ cm\\) (${CLEAR.map(esc).join('|')}) foran #\\d+ .+ \\((.+)\\)\\.$`));
      if (cl) push('clear', { min: e.min, id: idOf(e.isHome, cl[1]), v: cl[2], team: cl[3], att: e.isHome ? m.awayName : m.homeName });
      if (e.type === 'TRIGGER' && e.text.startsWith('🔁')) push('reorg', { min: e.min, id: e.isHome ? m.homeId : m.awayId, label: e.label.replace(`${e.isHome ? m.homeName : m.awayName} `, ''), v: e.text.replace(/^🔁 \[.+?\] /, '') });
      const ly = e.label === 'Fase 2 pres virker' && e.text.match(new RegExp(`: (#\\d+ .+?) erobrer bolden .* (${LYN.map(esc).join('|')})$`));
      if (ly) push('lyn', { min: e.min, id: idOf(e.isHome, ly[1]), v: ly[2] });
    }
  });
  return out;
}
function season(seed, rounds) {
  const rng = createRng(seed), L = createLeague(rng), out = [];
  for (let r = 0; r < rounds; r++) { const res = playRound(L, rng); commitRound(L, res, rng); out.push(...L.lastRound.matches); }
  return out;
}
const SEASON = [...season(21, 14), ...season(22, 14)];
const F = families([...M200, ...SEASON]);
// Forekomsterne grupperet pr. (kamp, aktør) i kampens rækkefølge
const runs = (fam) => { const g = new Map(); for (const x of fam) { const k = `${x.mi}|${x.id}`; (g.get(k) ?? g.set(k, []).get(k)).push(x); } return [...g.values()]; };
// Fælles for alle fire familier: (1) n'te forekomst = pickBy(liste, n, familie, id); (2) aldrig samme variant to gange i træk for
// samme aktør i en kamp; (3) de første min(antal, listens længde) forekomster er alle forskellige; (4) alle varianter forekommer.
function varyRule(fam, list, key, { min, minRepeat, minFull }) {
  assert.ok(fam.length > min && fam.every((x) => x.id), `data: ${fam.length} forekomster`);
  for (const x of fam) assert.equal(x.v, pickBy(list, x.n + x.r, key, x.id), JSON.stringify(x));
  const g = runs(fam), rep = g.filter((r) => r.length >= 2), full = g.filter((r) => r.length >= list.length);
  assert.ok(rep.length > minRepeat && full.length > minFull, `data: ${rep.length} aktører med mindst 2 i en kamp, ${full.length} med mindst ${list.length}`);
  for (const r of rep) {
    for (let i = 1; i < r.length; i++) assert.notEqual(r[i].v, r[i - 1].v, `samme variant to gange i træk: ${JSON.stringify(r.map((x) => [x.min, x.v]))}`);
    const first = r.slice(0, list.length).map((x) => x.v);
    assert.equal(new Set(first).size, first.length, `alle varianter før en gentagelse: ${first.join(' | ')}`);
  }
  assert.deepEqual([...new Set(fam.map((x) => x.v))].sort(), [...list].sort(), 'alle varianter forekommer');
  return { rep: rep.length, full: full.length };
}
test('variant "styrer midtbanen" (4): vary – playmakerens n\'te gang i kampen er pickBy(listen, n, "mid", id); aldrig samme to gange i træk; alle fire før en gentagelse', () => {
  varyRule(F.mid, MID, 'mid', { min: 2000, minRepeat: 300, minFull: 50 });   // 2369 forekomster, 616 aktører med ≥ 2 i en kamp, 96 med ≥ 4
});
test('variant "stiger højest og clearer" (4): vary pr. forsvarer ("clear") – og skytten står med SIT hold', () => {
  varyRule(F.clear, CLEAR, 'clear', { min: 1000, minRepeat: 200, minFull: 20 });   // 1171, 289, 30
  for (const x of F.clear) assert.equal(x.team, x.att, 'foran #X (angriberens hold)');
});
// I de seedede kampe omorganiserer et hold sig højst én gang pr. kamp (0 hold med to) – gentagelsen bevises derfor på kampe,
// hvor bot-holdet har fem Hvis-Så-formationsskift (ANY, minut 10-50), som hjemme- og som udehold.
const REORG5 = Array.from({ length: 12 }, (_, i) => {
  const L = createLeague(createRng(500 + i)), me = L.teams.find((t) => !t.isBot), bot = L.teams.find((t) => t.isBot);
  bot.tactics.conditionalRules = ['4-3-3', '4-4-2', '4-2-3-1', '4-3-3', '4-4-2'].map((f, j) => ({ condition: 'ANY', minuteTrigger: 10 * (j + 1), action: 'FORMATION', newFormation: f }));
  return i % 2 ? simulateMatch(me, bot, createRng(900 + i)) : simulateMatch(bot, me, createRng(900 + i));
});
test('variant "omorganiserer sig" (3): vary pr. hold ("reorg"); etiket og tekst er samme variant (etiketten flytter ikke tælleren) – og stadig hverken regel, formation eller minut', () => {
  varyRule(F.reorg, REORG_TEXT, 'reorg', { min: 60, minRepeat: -1, minFull: -1 });   // 178 → 91 forekomster (v3.17.0: egen Hvis-Så pr. bot-profil), ingen gentagelse i en kamp
  const R5 = families(REORG5).reorg;
  assert.ok(R5.length >= 50, `data: ${R5.length} omorganiseringer i ${REORG5.length} kampe`);
  varyRule(R5, REORG_TEXT, 'reorg', { min: 49, minRepeat: 10, minFull: 10 });   // 60, 12 hold med 5 hver
  for (const x of [...F.reorg, ...R5]) {
    assert.equal(x.label, pickBy(REORG_LABEL, x.n + x.r, 'reorg', x.id), JSON.stringify(x));
    assert.equal(REORG_LABEL.indexOf(x.label), REORG_TEXT.indexOf(x.v), 'etiket og tekst følges ad');
  }
});
test('variant "Din lynkontra løber ind i …" (3): vary pr. presser ("lyn")', () => {
  varyRule(F.lyn, LYN, 'lyn', { min: 300, minRepeat: 40, minFull: 4 });   // 328, 50, 6
});
// Tælleren er pr. KAMP: samme aktør starter forfra i næste kamp (n = 0) – en tæller på tværs af kampene (eller pr. tick) ville
// give en anden første variant. Og pr. AKTØR: to playmakere i samme kamp har hver sin tæller.
test('vary: tælleren starter forfra i hver kamp og er pr. aktør – hver aktørs første forekomst i en kamp er pickBy(listen, 0, familie, id)', () => {
  let firsts = 0, multi = 0;
  for (const [fam, list, key] of [[F.mid, MID, 'mid'], [F.clear, CLEAR, 'clear'], [F.reorg, REORG_TEXT, 'reorg'], [F.lyn, LYN, 'lyn']]) {
    for (const r of runs(fam)) { assert.equal(r[0].v, pickBy(list, r[0].r, key, r[0].id)); firsts++; }
    const perMatch = new Map();
    for (const x of fam) (perMatch.get(x.mi) ?? perMatch.set(x.mi, new Set()).get(x.mi)).add(x.id);
    multi += [...perMatch.values()].filter((s) => s.size >= 2).length;
  }
  assert.ok(firsts > 1000 && multi > 100, `data: ${firsts} første forekomster, ${multi} kampe med flere aktører i samme familie`);
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
