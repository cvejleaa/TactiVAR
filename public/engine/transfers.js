// Transfers (v3.18.0; brugerens valg: vinduer + fast pris). Vinduerne er åbne før sæsonens runde 1 og før runde 8.
// Køb fra en bot: fast, synlig pris = offentlig værdi · 1,3 (1,6 for en starter). Bud fra botterne på dine spillere til salg:
// 0,9–1,0 · værdien. Alt, botterne vælger, bygger på offentlige data (stjerner, alder, kæde, truppens størrelse – QC B7).
import { publicValue, publicWage, repairLineup, freeShirt, refreshValue, autoMatchBench, bookLedger, weeklyWages, wageBudget, derivedRng, LINE_MIN, SQUAD_MIN, SQUAD_MAX } from './career.js';
import { seasonRoundOf } from './schedule.js';
import { generatePlayer, neededPosition } from './generator.js';

export const BUY_MARKUP = 1.3, STARTER_MARKUP = 1.6, SALES_PER_WINDOW = 2, WINDOW_ROUNDS = [1, 8], TRANSFER_LOG_CAP = 40, BOT_BUY_CASH = 2000000;
const round25k = (v) => Math.round(v / 25000) * 25000;

// Vinduet: åbent, når næste runde er sæsonens runde 1 eller 8. Id'et tæller vinduerne (2 pr. sæson) – til karantæne og salgsgrænse.
export function windowOf(league) {
  const sr = seasonRoundOf(league, league.leagueMetadata.round + 1);
  return WINDOW_ROUNDS.includes(sr) ? (league.leagueMetadata.seasonNumber ?? 1) * 2 + (sr === 8 ? 1 : 0) : null;
}
export const isStarter = (team, p) => team.tactics.lineupSlots.includes(p.id);
export const askPrice = (team, p) => round25k(publicValue(p) * (isStarter(team, p) ? STARTER_MARKUP : BUY_MARKUP));
// Karantæne: den, der skiftede klub i vindue W, kan ikke skifte igen i W eller W + 1 ("et helt vindue")
export const quarantined = (p, w) => p.lastMove != null && w - p.lastMove <= 1;
const salesOf = (league, teamId, w) => (league.windowSales?.w === w ? league.windowSales.n[teamId] ?? 0 : 0);
const lineCount = (team, line) => team.squad.filter((p) => p.line === line).length;

// Hvorfor dette salg ikke kan ske (null = det kan): lukket vindue, karantæne, højst 2 salg pr. vindue. En bot sælger også ved 18 i
// truppen eller minimum i kæden – den henter selv en ungdomsspiller i samme kæde (v3.18.1: i v3.18.0 havde alle botter 18 i hele
// sæson 1, så intet kunne købes).
function sellBlock(league, seller, p, w) {
  if (w == null) return 'Transfervinduet er lukket – det åbner før sæsonens runde 8 og ved sæsonslut.';
  if (quarantined(p, w)) return `${p.shortName} skiftede klub i sidste vindue og kan ikke handles igen endnu.`;
  if (salesOf(league, seller.id, w) >= SALES_PER_WINDOW) return `${seller.name} har solgt ${SALES_PER_WINDOW} spillere i dette vindue.`;
  return null;
}
// credit: din lønkredit i vinduet (wageCredit) – over budgettet må du købe, hvis lønnen ikke stiger (v3.21.1)
function buyBlock(buyer, price, wage, credit = 0) {
  if (buyer.squad.length >= SQUAD_MAX) return `Truppen er fuld (${SQUAD_MAX} spillere).`;
  if ((buyer.cashBalance ?? 0) < 0) return 'Klubkassen er i minus – ingen køb, før den er i plus.';
  if (buyer.cashBalance < price) return 'Der er ikke penge nok i klubkassen.';
  if (overBudget(buyer, wage) && wage > credit) return credit > 0
    ? `Lønnen ville komme over lønbudgettet – dit salg i vinduet dækker kun ${fmtKr(credit)} kr./uge (han får ${fmtKr(wage)}).`
    : 'Lønnen ville komme over lønbudgettet – sælg en spiller, så kan du købe for den løn, han havde.';
  return null;
}
const overBudget = (team, wage) => weeklyWages(team) + wage > wageBudget(team);
const fmtKr = (v) => Math.round(v).toLocaleString('da-DK');
// Lønkreditten (v3.21.1, brugeren: "Jeg kan ikke sælge fordi jeg kun har 18 spillere, men kan heller ikke købe fordi jeg har brugt
// mit lønbudget"): ugelønnen for dine solgte spillere i vinduet minus ungdomsspillerne, der kom ind i stedet. Over budgettet må du
// købe for højst den løn – lønnen stiger ikke i forhold til før salget. Ligger i windowSales, så den nulstilles med vinduet.
export const wageCredit = (league, team, w = windowOf(league)) => (w != null && league.windowSales?.w === w ? league.windowSales.credit?.[team.id] ?? 0 : 0);
function addCredit(league, team, delta) {
  const c = (league.windowSales.credit ||= {});
  c[team.id] = Math.max(0, (c[team.id] ?? 0) + delta);
}

// Til kortet: prisen og om du kan købe – eller hvorfor ikke
export function marketInfo(league, buyer, seller, p) {
  const price = askPrice(seller, p), w = windowOf(league);
  return { price, reason: sellBlock(league, seller, p, w) ?? buyBlock(buyer, price, publicWage(p), buyer.isBot ? 0 : wageCredit(league, buyer, w)) };
}

// Selve skiftet: løn genforhandles, nyt nummer ved behov, regnskab hos begge, offentlig log, opstillingerne repareres
function move(league, p, seller, buyer, price, kind = 'buy') {
  const w = windowOf(league), r = league.leagueMetadata.round, s = league.leagueMetadata.seasonNumber ?? 1;
  const oldWage = p.weeklyWage ?? 0;
  seller.squad = seller.squad.filter((x) => x.id !== p.id);
  // Under 18 eller under minimum i kæden kommer en ungdomsspiller ind i samme kæde – for botterne (v3.18.1) og for dig (v3.21.1:
  // før kunne du ikke sælge ved 18, og over lønbudgettet heller ikke købe – du sad fast)
  const youth = (seller.squad.length < SQUAD_MIN || lineCount(seller, p.line) < LINE_MIN[p.line]) ? refillYouth(league, seller, p.line, `${w}-${p.id}`, p.shortName) : null;
  repairLineup(seller, new Map([[p.id, p.line]]));
  if (buyer) {
    if (buyer.squad.some((x) => x.shirtNumber === p.shirtNumber)) p.shirtNumber = freeShirt(buyer);
    p.weeklyWage = publicWage(p); p.lastMove = w; p.trainingFocus = 'GENERAL';
    buyer.squad.push(p);
    if (buyer.matchBenchAuto !== false || buyer.isBot) autoMatchBench(buyer);
    bookLedger(buyer, { r, s, transfers: -price });
  }
  if (price) bookLedger(seller, { r, s, transfers: price });
  league.windowSales = league.windowSales?.w === w ? league.windowSales : { w, n: {} };
  league.windowSales.n[seller.id] = (league.windowSales.n[seller.id] ?? 0) + 1;
  if (!seller.isBot) addCredit(league, seller, oldWage - (youth?.weeklyWage ?? 0));
  league.transferLog = [...(league.transferLog ?? []), { s, r, id: p.id, name: p.shortName, from: seller.id, to: buyer?.id ?? null, price, kind }].slice(-TRANSFER_LOG_CAP);
  league.offers = (league.offers ?? []).filter((o) => o.playerId !== p.id);
}

// En bot, der sælger under 18 eller under minimum i kæden, henter en ungdomsspiller i samme kæde (afledt rng, nyt id, unikt navn)
// (taken: den solgtes kortnavn – han er hverken hos sælger eller køber lige nu, QC)
function refillYouth(league, team, line, key, taken = null) {
  const ids = new Set(league.teams.flatMap((t) => t.squad.map((x) => x.id))), used = new Set(league.teams.flatMap((t) => t.squad.map((x) => x.shortName)));
  if (taken) used.add(taken);
  let id;
  do { id = `plr_y${league.nextPlayerSeq ?? 1}`; league.nextPlayerSeq = (league.nextPlayerSeq ?? 1) + 1; } while (ids.has(id));
  const y = generatePlayer(derivedRng('refill', key), line, 'YOUTH', freeShirt(team), league.teams.indexOf(team), used, 0, neededPosition(team, line), id);
  team.squad.push(y);
  return y;
}

// Dit køb af en bots spiller. Svar: null = købt, ellers årsagen.
export function buyPlayer(league, buyer, playerId) {
  const seller = league.teams.find((t) => t.isBot && t.squad.some((p) => p.id === playerId));
  if (!seller) return 'Spilleren kan ikke købes.';
  const p = seller.squad.find((x) => x.id === playerId), { price, reason } = marketInfo(league, buyer, seller, p);
  if (reason) return reason;
  const wage = publicWage(p), useCredit = overBudget(buyer, wage);
  move(league, p, seller, buyer, price);
  if (useCredit) addCredit(league, buyer, -wage);   // købet over budgettet bruger af kreditten
  return null;
}

// Til salg: din liste. I et åbent vindue byder botterne straks (og igen, når næste vindue åbner).
export function setListed(league, team, playerId, on) {
  team.listed = (team.listed ?? []).filter((id) => id !== playerId);
  if (on && team.squad.some((p) => p.id === playerId)) { team.listed.push(playerId); makeOffers(league, team); }
  else league.offers = (league.offers ?? []).filter((o) => o.playerId !== playerId);
}
// Bud: den bot, der mangler mest i kæden (så færrest i truppen, så flest penge), byder 0,9–1,0 · værdien – hvis den har råd og plads
export function makeOffers(league, team) {
  const w = windowOf(league);
  if (w == null) return;
  for (const id of team.listed ?? []) {
    if ((league.offers ?? []).some((o) => o.playerId === id)) continue;
    const p = team.squad.find((x) => x.id === id);
    if (!p || quarantined(p, w)) continue;
    const price = round25k(publicValue(p) * (0.9 + 0.1 * derivedRng('offer', w, id).next()));
    const bot = league.teams.filter((t) => t.isBot && !buyBlock(t, price, publicWage(p)))
      .sort((a, b) => lineCount(a, p.line) / LINE_MIN[p.line] - lineCount(b, p.line) / LINE_MIN[p.line] || a.squad.length - b.squad.length || b.cashBalance - a.cashBalance)[0];
    if (bot) (league.offers ||= []).push({ playerId: id, from: team.id, to: bot.id, price, w });
  }
}
export function acceptOffer(league, team, playerId) {
  const o = (league.offers ?? []).find((x) => x.playerId === playerId && x.from === team.id);
  const bot = o && league.teams.find((t) => t.id === o.to), p = team.squad.find((x) => x.id === playerId);
  if (!o || !bot || !p || o.w !== windowOf(league)) return 'Buddet er udløbet.';
  if (buyBlock(bot, o.price, publicWage(p))) return `${bot.name} kan ikke længere betale.`;
  move(league, p, team, bot, o.price);
  team.listed = (team.listed ?? []).filter((id) => id !== playerId);
  return null;
}
export const declineOffer = (league, team, playerId) => { league.offers = (league.offers ?? []).filter((o) => !(o.playerId === playerId && o.from === team.id)); };

// Når et vindue åbner (efter runde 7 og efter sæsonskiftet): værdierne opdateres, botterne handler indbyrdes, og der bydes
// på dine spillere til salg. Botterne i minus sælger eller fritstiller (kun botter – dine spillere forsvinder aldrig automatisk, B5).
export function openWindow(league) {
  const w = windowOf(league);
  if (w == null) return;
  for (const t of league.teams) for (const p of t.squad) refreshValue(p);
  league.windowSales = { w, n: {} }; league.offers = [];
  const bots = league.teams.filter((t) => t.isBot);
  // 1) Botter i minus: sælg den dyreste ikke-starter, der kan undværes, til en bot med råd – ellers fritstil den ældste
  for (const t of bots) {
    for (let guard = 0; guard < 8 && t.cashBalance < 0 && t.squad.length > SQUAD_MIN; guard++) {
      const cand = t.squad.filter((p) => !isStarter(t, p) && !sellBlock(league, t, p, w)).sort((a, b) => publicValue(b) - publicValue(a));
      const p = cand[0];
      if (!p) break;
      const price = askPrice(t, p), buyer = bots.find((b) => b !== t && !buyBlock(b, price, publicWage(p)) && lineCount(b, p.line) < LINE_MIN[p.line] + 2);
      if (buyer) move(league, p, t, buyer, price);
      else { const old = cand.slice().sort((a, b) => b.age - a.age)[0]; move(league, old, t, null, 0, 'release'); }
    }
  }
  // 2) Botter under minimum i en kæde køber fra en anden bot (den billigste, der kan undværes)
  for (const t of bots) for (const line of Object.keys(LINE_MIN)) {
    if (lineCount(t, line) >= LINE_MIN[line]) continue;
    const offers = bots.filter((s) => s !== t).flatMap((s) => s.squad.filter((p) => p.line === line && !isStarter(s, p) && !sellBlock(league, s, p, w)).map((p) => ({ s, p, price: askPrice(s, p) })))
      .filter((o) => !buyBlock(t, o.price, publicWage(o.p))).sort((a, b) => a.price - b.price);
    if (offers[0]) move(league, offers[0].p, offers[0].s, t, offers[0].price);
  }
  // 3) Botter med råd (over 2 mio. kr., og 1,5 mio. tilbage) og plads (under 22) forstærker den tyndeste kæde med én spiller fra en bot med overskud
  for (const t of bots.slice().sort((a, b) => b.cashBalance - a.cashBalance)) {
    if (t.cashBalance < BOT_BUY_CASH || t.squad.length >= 22) continue;
    const line = Object.keys(LINE_MIN).sort((a, b) => lineCount(t, a) / LINE_MIN[a] - lineCount(t, b) / LINE_MIN[b])[0];
    const best = bots.filter((s) => s !== t && lineCount(s, line) > LINE_MIN[line] + 1).flatMap((s) => s.squad.filter((p) => p.line === line && !isStarter(s, p) && !sellBlock(league, s, p, w)).map((p) => ({ s, p, price: askPrice(s, p) })))
      .filter((o) => o.price <= t.cashBalance - 1500000 && !buyBlock(t, o.price, publicWage(o.p))).sort((a, b) => publicValue(b.p) - publicValue(a.p) || a.price - b.price)[0];
    if (best) move(league, best.p, best.s, t, best.price);
  }
  for (const t of league.teams.filter((x) => !x.isBot)) makeOffers(league, t);
}
