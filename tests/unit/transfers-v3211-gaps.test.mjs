// v3.21.1 – huller fundet ved mutationstest af transfer-låsen: acceptOffers egen sellBlock, 18-klausulen (salg fra kæden med overskud),
// kæde-klausulen ved 19, ungdomsspillerens karantæne (dig og botter, næste vindue), `before` ved to salg og ved vinduesskift,
// loftet for botter, fritstillingens bogføring – og visningen (Lønbudget, Salg i vinduet, frigør-linjen, Fritstil-knappen).
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.handlers = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, f) { this.handlers[k] = f; }
  get id() { return this.attrs.id; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { setListed, acceptOffer, releasePlayer, buyPlayer, marketInfo, wageCap, wageRoom, openWindow, windowOf, needsYouth } = await import('../../public/engine/transfers.js');
const { weeklyWages, wageBudget, wageRoomPerRound, LINE_MIN } = await import('../../public/engine/career.js');
const { renderMarket, renderClub } = await import('../../public/ui/club.js');
const { kr } = await import('../../public/ui/labels.js');

const fresh = (s = 8) => createLeague(createRng(s));
const own = (L) => L.teams.find((t) => !t.isBot);
const reserve = (t, line) => t.squad.find((p) => p.line === line && !t.tactics.lineupSlots.includes(p.id));
const count = (t, line) => t.squad.filter((p) => p.line === line).length;
const overBy = (me, over) => { me.squad[1].weeklyWage += wageBudget(me) - weeklyWages(me) + over; };
const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const youthOf = (t) => t.squad.filter((p) => p.id.startsWith('plr_y'));
const flat = (p) => ({ ...structuredClone(p), id: `x_${p.id}`, shortName: 'X. Klon', shirtNumber: 90 + (p.shirtNumber % 9) });

test('acceptOffer har sin egen sellBlock: tre bud lagt før salgene – det tredje afvises ("solgt 2"), og en karantæne efter buddet afvises', () => {
  const L = fresh(), me = own(L);
  const [a, b, c] = ['DEF', 'MID', 'ATT'].map((l) => reserve(me, l));
  for (const p of [a, b, c]) setListed(L, me, p.id, true);
  assert.equal(L.offers.filter((o) => o.from === me.id).length, 3, 'data: tre bud ligger');
  assert.equal(acceptOffer(L, me, a.id), null);
  assert.equal(acceptOffer(L, me, b.id), null);
  assert.match(acceptOffer(L, me, c.id), /solgt 2/);
  assert.ok(me.squad.includes(c), 'c blev ikke solgt');
  // Karantæne: spilleren skiftede klub efter buddet blev lagt
  const L2 = fresh(), m2 = own(L2), d = reserve(m2, 'DEF');
  setListed(L2, m2, d.id, true);
  assert.ok(L2.offers.some((o) => o.playerId === d.id), 'data: bud');
  d.lastMove = windowOf(L2);
  assert.match(acceptOffer(L2, m2, d.id), /kom til klubben/);
  assert.ok(m2.squad.includes(d));
});

test('ved 18 sælger du fra kæden MED overskud (den eneste klausul, der gælder): en ungdomsspiller kommer ind, og needsYouth siger det før klikket', () => {
  const L = fresh(), me = own(L);
  assert.equal(me.squad.length, 18);
  const line = Object.keys(LINE_MIN).find((l) => count(me, l) > LINE_MIN[l]), p = reserve(me, line);
  assert.ok(line && p, `data: kæden med overskud (${line}) har en reserve`);
  assert.equal(needsYouth(me, p), true, '18 - 1 < 18');
  assert.equal(releasePlayer(L, me, p.id), null);
  assert.equal(me.squad.length, 18, '17 + ungdomsspilleren');
  assert.equal(youthOf(me).length, 1);
  assert.equal(youthOf(me)[0].line, line, 'i samme kæde');
});

test('ved 19 sælger du fra en kæde PÅ minimum: ungdomsspilleren kommer ind (kæde-klausulen alene); ved 19 over minimum kommer ingen', () => {
  const L = fresh(), me = own(L);
  me.squad.push(flat(reserve(me, 'ATT')));
  assert.equal(me.squad.length, 19);
  const gk = reserve(me, 'GK');
  assert.equal(count(me, 'GK'), LINE_MIN.GK);
  assert.equal(needsYouth(me, gk), true, 'kæden ville komme under minimum');
  assert.equal(releasePlayer(L, me, gk.id), null);
  assert.equal(me.squad.length, 19, '18 + ungdomsmålmanden');
  assert.deepEqual(youthOf(me).map((y) => y.line), ['GK']);
});

test('ungdomsspilleren er i karantæne i vinduet OG det næste (lastMove = vinduet, ikke vinduet - 1) – også hos en bot', () => {
  const L = fresh(), me = own(L), w = windowOf(L);
  const line = Object.keys(LINE_MIN).find((l) => count(me, l) > LINE_MIN[l]);
  assert.equal(releasePlayer(L, me, reserve(me, line).id), null);
  const y = youthOf(me)[0];
  assert.equal(y.lastMove, w);
  // En bot, der sælger ved 18: hendes ungdomsspiller kan ikke købes videre straks
  const bot = L.teams.find((t) => t.isBot), q = reserve(bot, 'DEF'); me.cashBalance = 50000000;
  assert.equal(bot.squad.length, 18);
  assert.equal(buyPlayer(L, me, q.id), null);
  const by = youthOf(bot)[0];
  assert.equal(by.lastMove, w, 'botten henter en ungdomsspiller med karantæne');
  assert.match(marketInfo(L, me, bot, by).reason, /kom til klubben/);
  // Næste vindue (før runde 8): stadig karantæne
  L.leagueMetadata.round = 7; openWindow(L);
  assert.equal(windowOf(L), w + 1);
  assert.match(releasePlayer(L, me, y.id), /kom til klubben/);
});

test('`before` er lønnen før vinduets FØRSTE salg: efter to salg er loftet stadig den første løn (ikke den lavere løn før andet salg)', () => {
  const L = fresh(), me = own(L); overBy(me, 300000);
  const before = weeklyWages(me), [a, b] = [reserve(me, 'DEF'), reserve(me, 'MID')];
  setListed(L, me, a.id, true); assert.equal(acceptOffer(L, me, a.id), null);
  const afterFirst = weeklyWages(me);
  assert.ok(afterFirst < before, `data: første salg sænkede lønnen (${before} -> ${afterFirst})`);
  assert.equal(releasePlayer(L, me, b.id), null);
  assert.ok(weeklyWages(me) < afterFirst, 'data: andet salg sænkede den yderligere');
  assert.ok(before > wageBudget(me), 'data: loftet er ikke bare budgettet');
  assert.equal(wageCap(L, me), before, `loft = løn før første salg (${before}), ikke før andet (${afterFirst})`);
  assert.equal(wageRoom(L, me), before - weeklyWages(me));
});

test('vinduesskift UDEN openWindow (gemt liga): det gamle `before` gælder ikke, og et nyt salg registrerer sit eget', () => {
  const L = fresh(), me = own(L); overBy(me, 300000);
  assert.equal(releasePlayer(L, me, reserve(me, 'DEF').id), null);   // vindue 2
  const old = L.windowSales.before[me.id];
  L.leagueMetadata.round = 7;                                       // vindue 3 – openWindow er ikke kaldt
  assert.equal(windowOf(L), 3);
  assert.equal(wageCap(L, me), wageBudget(me), 'nyt vindue: intet salg endnu, gammelt tal gælder ikke');
  const now = weeklyWages(me);
  assert.ok(now < old, 'data: lønnen er faldet siden');
  assert.equal(releasePlayer(L, me, reserve(me, 'MID').id), null);
  assert.equal(L.windowSales.w, 3);
  assert.equal(L.windowSales.before[me.id], now, 'nyt vindue: lønnen før DETTE vindues første salg');
  assert.equal(wageCap(L, me), Math.max(wageBudget(me), now));
  assert.ok(now > wageBudget(me), 'data: loftet er `now`, ikke budgettet');
});

test('lukket vindue: loftet er budgettet, selv om du solgte i det forrige', () => {
  const L = fresh(), me = own(L); overBy(me, 300000);
  assert.equal(releasePlayer(L, me, reserve(me, 'DEF').id), null);
  assert.ok(wageCap(L, me) > wageBudget(me), 'data: loft over budget i vinduet');
  L.leagueMetadata.round = 3;
  assert.equal(windowOf(L), null);
  assert.equal(wageCap(L, me), wageBudget(me));
});

test('botter får aldrig et lønloft fra salg: wageCap = budgettet, også når en bot over budgettet har solgt', () => {
  const L = fresh(), me = own(L), bot = L.teams.find((t) => t.isBot); me.cashBalance = 50000000;
  overBy(bot, 100000);
  const q = bot.squad.filter((p) => !bot.tactics.lineupSlots.includes(p.id)).sort((x, y) => x.weeklyWage - y.weeklyWage)[0];
  assert.equal(buyPlayer(L, me, q.id), null);
  assert.equal(L.windowSales.n[bot.id], 1, 'data: botten har solgt');
  assert.ok(weeklyWages(bot) > wageBudget(bot), 'data: botten er stadig over budgettet');
  assert.equal(wageCap(L, bot), wageBudget(bot));
  assert.equal(L.windowSales.before?.[bot.id], undefined, 'botter registreres ikke');
});

test('fritstilling og salg: spilleren forlader til-salg-listen, fritstilling er gratis (log: pris 0, to null), og kun DIN spiller kan fritstilles', () => {
  const L = fresh(), me = own(L), [a, b] = [reserve(me, 'DEF'), reserve(me, 'MID')];
  setListed(L, me, a.id, true); setListed(L, me, b.id, true);
  assert.ok(me.listed.includes(a.id) && me.listed.includes(b.id));
  const cash = me.cashBalance;
  assert.equal(releasePlayer(L, me, a.id), null);
  assert.deepEqual(me.listed, [b.id], 'a er væk fra listen');
  assert.equal(me.cashBalance, cash, 'ingen penge');
  assert.deepEqual(L.transferLog.at(-1), { s: 1, r: 0, id: a.id, name: a.shortName, from: me.id, to: null, price: 0, kind: 'release' });
  assert.ok(L.offers.every((o) => o.playerId !== a.id), 'buddet på a er væk');
  assert.equal(acceptOffer(L, me, b.id), null);
  assert.deepEqual(me.listed, [], 'b er væk fra listen efter salget');
  // Ikke din
  const bot = L.teams.find((t) => t.isBot), n = bot.squad.length, other = reserve(bot, 'ATT');
  assert.match(releasePlayer(L, me, other.id), /ikke i din trup/);
  assert.match(releasePlayer(L, me, 'findes_ikke'), /ikke i din trup/);
  assert.equal(bot.squad.length, n);
  assert.ok(bot.squad.includes(other));
});

// ---------- visningen ----------
const market = (L, me, extra = {}) => { const calls = { rel: [], acc: [] }; return { calls, el: renderMarket({ league: L, team: me, playing: false, onAccept: (id) => calls.acc.push(id), onDecline() {}, onUnlist() {}, onRelease: (id) => calls.rel.push(id), ...extra }) }; };
const rowOf = (el, p) => all(el, (e) => e.dataset.pid === p.id)[0];

test('Salg i vinduet: "0 af 2" / "1 af 2" / "2 af 2 – næste salg i næste vindue"; gammelt vindues tal gælder ikke; lukket vindue viser intet', () => {
  const L = fresh(), me = own(L), w = windowOf(L);
  const txt = () => byId(market(L, me).el, 'sales-left')?.textContent;
  assert.equal(txt(), 'Salg i vinduet: 0 af 2.');
  L.windowSales = { w, n: { [me.id]: 1 } };
  assert.equal(txt(), 'Salg i vinduet: 1 af 2.');
  L.windowSales = { w, n: { [me.id]: 2 } };
  assert.equal(txt(), 'Salg i vinduet: 2 af 2 – næste salg i næste vindue.');
  L.windowSales = { w: w - 1, n: { [me.id]: 2 } };
  assert.equal(txt(), 'Salg i vinduet: 0 af 2.', 'tallet fra et gammelt vindue');
  L.windowSales = { w, n: { [me.id]: 2 } };
  L.leagueMetadata.round = 3;
  assert.equal(windowOf(L), null);
  assert.equal(txt(), undefined, 'lukket vindue: ingen linje');
});

test('frigør-linjen: lønnen pr. runde (ugeløn / 3), og ungdomsspilleren nævnes KUN når han kommer ind; ingen linje og ingen Fritstil i lukket vindue', () => {
  const L = fresh(), me = own(L), line = Object.keys(LINE_MIN).find((l) => count(me, l) > LINE_MIN[l]), p = reserve(me, line);
  p.weeklyWage = 30000;
  setListed(L, me, p.id, true);
  const gain = (el) => all(rowOf(el, p), (e) => e.className === 'muted market-gain').map((e) => e.textContent);
  // Netto (QC v3.21.1): 30.000 − akademispillerens 24.000 = 6.000 pr. uge = 2.000 pr. runde; med bud står kun "Salg" (Fritstil skjult)
  assert.deepEqual(gain(market(L, me).el), [`Salg frigør ${kr(2000)} pr. runde i løn – en ungdomsspiller kommer ind fra akademiet i samme kæde (1★, ${kr(8000)} pr. runde).`]);
  me.squad.push(flat(reserve(me, line)));   // 19 og kæden over minimum: ingen ungdomsspiller
  assert.equal(needsYouth(me, p), false);
  assert.deepEqual(gain(market(L, me).el), [`Salg frigør ${kr(10000)} pr. runde i løn.`]);
  L.offers = L.offers.filter((o) => o.playerId !== p.id);   // uden bud: også fritstilling (uigenkaldelig – står der)
  assert.deepEqual(gain(market(L, me).el), [`Salg eller fritstilling (uden betaling – kan ikke fortrydes) frigør ${kr(10000)} pr. runde i løn.`]);
  L.leagueMetadata.round = 3;
  const closed = market(L, me).el;
  assert.deepEqual(gain(closed), []);
  assert.deepEqual(all(closed, (e) => e.className === 'mini release'), []);
});

test('Fritstil-knappen: kun uden bud (QC: uigenkaldelig, ikke ved siden af Sælg), kun i åbent vindue, kun med onRelease, kun under 2 salg – og den kalder onRelease', () => {
  const L = fresh(), me = own(L), w = windowOf(L), p = reserve(me, 'DEF');
  setListed(L, me, p.id, true);
  assert.ok(L.offers.some((o) => o.playerId === p.id), 'data: buddet (Sælg-knappen) findes');
  const btns = (el) => all(rowOf(el, p), (e) => e.className === 'mini release');
  assert.equal(btns(market(L, me).el).length, 0, 'med bud: ingen Fritstil');
  L.offers = L.offers.filter((o) => o.playerId !== p.id);
  const { el, calls } = market(L, me);
  assert.equal(btns(el).length, 1);
  btns(el)[0].handlers.click();
  assert.deepEqual(calls.rel, [p.id]); assert.deepEqual(calls.acc, []);
  L.windowSales = { w, n: { [me.id]: 1 } };
  assert.equal(btns(market(L, me).el).length, 1, '1 salg: stadig muligt');
  L.windowSales = { w, n: { [me.id]: 2 } };
  assert.equal(btns(market(L, me).el).length, 0, '2 salg: ingen knap');
  L.windowSales = { w, n: {} };
  assert.equal(btns(market(L, me, { onRelease: null }).el).length, 0, 'uden onRelease: ingen knap');
});

test('Lønbudget i 💼 Klub: tre tilstande – under budgettet / over uden salg / over efter salg (loftet = lønnen før salget)', () => {
  const L = fresh(), me = own(L);
  const room = () => byId(renderClub({ league: L, team: me, playing: false }), 'club-room').children[1].textContent;
  assert.equal(room(), `Du kan bruge ${kr(wageRoomPerRound(me))} mere pr. runde i løn`);
  overBy(me, 300000);
  assert.equal(room(), `Du er ${kr(-wageRoomPerRound(me))} over budgettet pr. runde – sælg eller fritstil en spiller i et åbent vindue, så kan du købe for den løn, du sparer`);
  const before = weeklyWages(me);
  assert.equal(releasePlayer(L, me, reserve(me, 'DEF').id), null);
  assert.ok(wageRoomPerRound(me) < 0, 'data: stadig over budgettet efter salget');
  const cap = Math.round((before - weeklyWages(me)) / 3);
  assert.ok(cap > 0);
  assert.equal(room(), `Du er ${kr(-wageRoomPerRound(me))} over budgettet pr. runde – efter dit salg i vinduet må du dog købe for op til ${kr(cap)} pr. runde i løn (lønnen bliver ikke højere end før salget)`);
});

test('"Til salg i ligaen" uden rækker: over lønbudgettet (også præcis 0 i luft) -> sælg/fritstil-teksten; ellers kassen/lønbudgettet', () => {
  const L = fresh(), me = own(L);
  const empty = () => byId(market(L, me, { onBuy() {} }).el, 'for-sale-empty')?.textContent;
  me.cashBalance = 0;
  assert.ok(wageRoom(L, me) > 0);
  assert.match(empty(), /^Ingen lige nu – kassen eller lønbudgettet er for lille/);
  me.cashBalance = 20000000;
  me.squad[1].weeklyWage += wageRoom(L, me);   // præcis 0 i luft (cap = budget)
  assert.equal(wageRoom(L, me), 0);
  assert.match(empty(), /^Ingen lige nu – du er over lønbudgettet: sæt en spiller til salg eller fritstil ham/);
  me.squad[1].weeklyWage += 50000;
  assert.match(empty(), /^Ingen lige nu – du er over lønbudgettet/);
});
