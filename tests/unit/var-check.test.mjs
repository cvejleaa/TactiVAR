// v3.15.1 – VAR som i virkeligheden (brugeren: "VAR skal virke som i virkeligheden … nogle gange tjekker for offside selv
// om der ikke scores og andre for røde kort, andre igen for om der er straffespark"). VAR er ikke længere en chancetype:
// chancen afgøres først, VAR tjekker bagefter. Testene tvinger tjekkene (chance(p) for netop VAR_RULES-værdien) i rigtige,
// seedede kampe og læser referatet, kamptallene og karakterarkene – ikke motorens egne tællere.
// Erstatter var-gaps.test.mjs (VAR-chancegrenen findes ikke mere); den forreste og billedet: var-front.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { VAR_RULES } from '../../public/engine/match-rules.js';

const GOALS = new Set(['GOAL', 'HEADER_GOAL']);
// force: { p: true | false | brøk } – en brøk trækkes på kampens egen rng, så kampen stadig er tilfældig.
const forced = (r, force) => ({ ...r, chance: (p) => (p in force ? (typeof force[p] === 'number' ? r.next() < force[p] : force[p]) : r.chance(p)) });
function games(n, force, seed0 = 1) {
  const out = [];
  for (let s = seed0; s < seed0 + n; s++) {
    const L = createLeague(createRng(s)), H = L.teams[s % 8], A = L.teams[(s + 3) % 8];
    out.push({ H, A, m: simulateMatch(H, A, forced(createRng(s * 31), force)) });
  }
  return out;
}
const after = (m, e) => m.events[m.events.indexOf(e) + 1];
const before = (m, e) => m.events[m.events.indexOf(e) - 1];
const score = (e) => [e.hG, e.aG];

const GOAL_CHECKS = games(80, { [VAR_RULES.GOAL_CHECK_P]: true });

test('mål-tjekket: "Bolden er i nettet" med stillingen talt op – så målet (samme stilling) eller annulleringen (stillingen tilbage)', () => {
  let ok = 0, no = 0;
  for (const { m } of GOAL_CHECKS) for (const e of m.events.filter((x) => x.type === 'VAR_CHECK')) {
    const [h0, a0] = score(before(m, e)), up = e.isHome ? [h0 + 1, a0] : [h0, a0 + 1];
    assert.deepEqual(score(e), up, `stillingen tælles op i tjekket: ${e.text}`);
    assert.match(e.text, /^📺 \[.+ • \d+-\d+\] Bolden er i nettet – men VAR kigger på det: (stod #\d+ .+ offside|skubbede #\d+ .+ #\d+ .+ i opspillet)\? …$/);
    assert.ok(e.varMsg, 'VAR-banneret i afspilningen');
    const v = after(m, e);
    assert.equal(v.isHome, e.isHome);
    if (GOALS.has(v.type)) { ok++; assert.deepEqual(score(v), up); assert.match(v.text, / 📺 VAR: målet står – .+\.$/); assert.equal(e.var.verdict, 'STANDS'); }
    else { no++; assert.equal(v.type, 'VAR_NO_GOAL'); assert.deepEqual(score(v), [h0, a0], 'stillingen falder tilbage'); assert.match(v.text, /MÅLET ANNULLERES!/); assert.equal(e.var.verdict, 'OVERTURNED'); }
  }
  assert.ok(ok >= 40 && no >= 20, `data: ${ok} godkendt, ${no} annulleret`);
});

test('et annulleret mål tæller ingen steder: slutresultat, Rundens mål, målscorere og skud på mål følger kun de godkendte', () => {
  let dis = 0;
  for (const { m } of GOAL_CHECKS) {
    for (const [home, goals, list] of [[true, m.homeGoals, m.ratings.home], [false, m.awayGoals, m.ratings.away]]) {
      const evs = m.events.filter((e) => e.isHome === home && (GOALS.has(e.type)));
      assert.equal(evs.length, goals, 'slutresultatet = målhændelserne');
      assert.equal(list.reduce((a, e) => a + e.goals, 0), goals, 'karakterarkenes mål');
      assert.ok(m.stats[home ? 'hOnTarget' : 'aOnTarget'] >= goals);
      dis += m.events.filter((e) => e.isHome === home && e.type === 'VAR_NO_GOAL').length;
    }
    assert.equal(m.goalsPool.length, m.homeGoals + m.awayGoals, 'Rundens mål-puljen');
    // Et annulleret mål ændrer ikke skud på mål: tallet i annulleringen = tallet før tjekket
    for (const e of m.events.filter((x) => x.type === 'VAR_NO_GOAL')) {
      const c = before(m, e), side = e.isHome ? 'hOnTarget' : 'aOnTarget';
      assert.equal(e.stats[side], before(m, c).stats[side], e.text);
    }
  }
  assert.ok(dis >= 20, `data: annullerede ${dis}`);
});

test('frispark i opspillet: den samme spiller nævnes i tjekket og i kendelsen, og et annulleret mål giver frispark til modstanderen', () => {
  let n = 0;
  for (const { m } of games(60, { [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: true })) for (const e of m.events.filter((x) => x.type === 'VAR_CHECK')) {
    const who = e.text.match(/skubbede (#\d+ .+?) (#\d+ .+?) i opspillet/);
    assert.ok(who, e.text);
    const v = after(m, e);
    if (v.type === 'VAR_NO_GOAL') { n++; assert.ok(v.text.includes(`${who[1]} skubbede ${who[2]}`), v.text); const f = e.isHome ? 'hFouls' : 'aFouls'; assert.equal(v.stats[f], e.stats[f] + 1, 'frisparket tælles'); }
    else assert.ok(v.text.includes(`📺 VAR: målet står – ${who[1]} gik til bolden`), v.text);
  }
  assert.ok(n >= 10, `data: ${n}`);
});

test('offside-tjekket: den tjekkede får observationen (godkendt: timingen, annulleret: "for tidligt af sted")', () => {
  let n = 0;
  for (const { m, H, A } of GOAL_CHECKS) for (const e of m.events.filter((x) => x.type === 'VAR_CHECK' && x.var.kind === 'OFFSIDE')) {
    const name = e.text.match(/stod (#\d+ .+?) offside\?/)[1];
    const p = [...H.squad, ...A.squad].find((x) => `#${x.shirtNumber} ${x.shortName}` === name);
    const o = m.observations.filter((x) => x.playerId === p.id && new RegExp(`^VAR-(tjek|annullering) \\(${e.min}\\. min`).test(x.text));
    assert.ok(o.length >= 1, `${name}: ${e.text}`);
    if (e.var.verdict === 'OVERTURNED') assert.ok(o.some((x) => /for tidligt af sted/.test(x.text)));
    n++;
  }
  assert.ok(n >= 40, `data: ${n}`);
});

test('VAR ± (stillingen) tæller kun de kendelser, VAR ændrede: annulleret mål −1, straffe annulleret −1, givet +1, rødt trukket tilbage +1, opgraderet −1 – et godkendt tjek 0 (før +1)', () => {
  const force = { [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.PEN_CHECK_P]: true, [VAR_RULES.PEN_AWARD_P]: 0.02, [VAR_RULES.RED_CHECK_P]: true, [VAR_RULES.RED_UPGRADE_P]: 0.5 };
  const seen = {};
  for (const { m } of games(200, force)) {
    let net = 0;
    for (const e of m.events) {
      const v = e.var; if (!v) continue;
      seen[`${e.type}:${v.verdict}`] = (seen[`${e.type}:${v.verdict}`] ?? 0) + 1;
      const sign = e.isHome ? 1 : -1;   // fortegnet for det hold, hændelsen står på (angriberen; ved rødt: holdet, der begik frisparket)
      if (v.verdict === 'OVERTURNED' || v.verdict === 'UPGRADED') net -= sign;
      if (v.verdict === 'AWARDED' || v.verdict === 'DOWNGRADED') net += sign;
    }
    assert.equal(m.homeVarNet, net, JSON.stringify(m.events.filter((e) => e.var).map((e) => [e.type, e.isHome, e.var.verdict])));
    // VAR-tjek i kamptallene = de synlige tjek (mål, straffe, røde kort) – linjedommerens flag er ikke VAR
    for (const home of [true, false]) assert.equal(m.stats[home ? 'hVarChecks' : 'aVarChecks'], m.events.filter((e) => e.var && e.isHome === home).length);
  }
  for (const k of ['VAR_CHECK:STANDS', 'VAR_CHECK:OVERTURNED', 'VAR_PEN:STANDS', 'VAR_PEN:OVERTURNED', 'VAR_PEN:AWARDED', 'VAR_RED:CONFIRMED', 'VAR_RED:DOWNGRADED', 'VAR_RED:UPGRADED']) assert.ok((seen[k] ?? 0) >= 3, `${k}: ${JSON.stringify(seen)}`);
});

test('straffe-VAR: en annulleret straffe tælles ikke (ingen straffe, skud eller afslutning) – filmning giver gult; en stående eller VAR-givet straffe sparkes', () => {
  let over = 0, dive = 0, kicked = 0;
  for (const { m } of games(200, { [VAR_RULES.PEN_CHECK_P]: true, [VAR_RULES.PEN_AWARD_P]: 0.02 })) for (const e of m.events.filter((x) => x.type === 'VAR_PEN')) {
    const n = after(m, e), side = e.isHome ? 'h' : 'a';
    if (e.var.verdict === 'OVERTURNED') {
      over++;
      for (const f of ['Penalties', 'Shots', 'OnTarget']) assert.equal(m.events.filter((x) => x.min === e.min).at(-1).stats[side + f], e.stats[side + f], `${f}: ${e.text}`);
      if (e.var.kind === 'DIVE') { dive++; assert.match(e.text, /Dommeren går ud til skærmen … ingen kontakt\. Straffesparket annulleres\./); assert.ok(n.type === 'FOUL' ? / for filmning\.$/.test(n.text) : n.type === 'RED', n.text); assert.equal(n.isHome, e.isHome, 'den fældede får kortet'); }
      else assert.match(e.text, /stod offside i opspillet, før #\d+ .+ blev fældet\./);
    } else {
      kicked++;
      assert.ok(/STRAFFESPARK/.test(n.text) && ['GOAL', 'SAVE'].includes(n.type), n.text);
      assert.equal(n.stats[side + 'Penalties'], e.stats[side + 'Penalties'] + 1);
      if (e.var.verdict === 'AWARDED') assert.match(e.text, /efter at have set skærmen dømmer han straffespark!$/);
    }
  }
  assert.ok(over >= 10 && dive >= 5 && kicked >= 20, `data: annulleret ${over} (filmning ${dive}), sparket ${kicked}`);
});

test('rødt-kort-VAR: bekræftet → udvisning; trukket tilbage → gult (ingen udvisning, medmindre han havde gult); opgraderet → udvisning', () => {
  const c = { CONFIRMED: 0, DOWNGRADED: 0, UPGRADED: 0 };
  for (const { m } of games(400, { [VAR_RULES.RED_CHECK_P]: true, [VAR_RULES.RED_UPGRADE_P]: true, 0.06: 0.15 })) for (const e of m.events.filter((x) => x.type === 'VAR_RED')) {
    const n = after(m, e); c[e.var.verdict]++;
    assert.equal(n.isHome, e.isHome);
    if (e.var.verdict === 'DOWNGRADED') assert.ok(n.type === 'FOUL' ? / efter VAR-tjekket\.$/.test(n.text) : /^🟨🟥/.test(n.text), n.text);
    else assert.ok(n.type === 'RED' && /^🟥 .+ Direkte rødt kort/.test(n.text), n.text);
  }
  assert.ok(c.CONFIRMED >= 5 && c.DOWNGRADED >= 3 && c.UPGRADED >= 5, JSON.stringify(c));
});

test('forbi: et skud forbi eller blokeret er ikke på mål og ingen redning', () => {
  let miss = 0;
  for (const { m } of games(40, {})) for (const e of m.events.filter((x) => x.type === 'MISS')) {
    miss++;
    const side = /^🧱/.test(e.text) ? (e.isHome ? 'a' : 'h') : (e.isHome ? 'h' : 'a');   // en blokering står på forsvarets side
    assert.equal(e.stats[side + 'OnTarget'], before(m, e).stats[side + 'OnTarget'], e.text);
    assert.match(e.text, /^(🎯 \[.+\] #\d+ .+ (skyder|sender|rammer|får|banker) .+\.|🧱 \[.+\] #\d+ .+ kaster sig ind foran .+ fra #\d+ .+ \(.+\)\.)$/);
  }
  assert.ok(miss >= 80, `data: ${miss}`);
});

test('linjedommerens flag: afslutningen tæller ikke som på mål og er intet VAR-tjek', () => {
  let n = 0;
  for (const { m } of games(60, { [VAR_RULES.OFFSIDE_FLAG_P]: true })) for (const e of m.events.filter((x) => x.type === 'OFFSIDE_FLAG')) {
    n++;
    const att = e.isHome ? 'a' : 'h';   // flaget står på forsvarets side
    assert.equal(e.stats[att + 'OnTarget'], before(m, e).stats[att + 'OnTarget']);
    assert.equal(e.stats[att + 'VarChecks'], before(m, e).stats[att + 'VarChecks']);
    assert.ok(!e.var && !/VAR/.test(e.text), e.text);
    assert.match(e.text, /^🚩 \[.+\] Linjedommeren løfter flaget efter afslutningen fra #\d+ .+ – (#\d+ .+ \(.+\) stod offside i opspillet|han \(.+\) stod offside)\.$/);
  }
  assert.ok(n >= 30, `data: ${n}`);
});
