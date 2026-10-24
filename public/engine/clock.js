// Rigtige minutter (v3.16.4, brugeren: "rigtige minutter (45+2, 90+3)" og "der er også tillægstid for VAR"). Motoren regner
// stadig i tick à 3 minutter (e.min – skift-vinduer, Hvis-Så, friskhed, karakterminutter og sporets t er uændrede); uret er
// et VISNINGSfelt (e.clock), lagt på bagefter ud fra referatets rækkefølge – intet rng-træk, så ingen kamp ændres.
//  - Pausen (HALFTIME) er grænsen: alt før den er 1.–45.+S1, alt efter 46.–90.+S2 (QC v3.16.4 C1: pause-tick'ets spil står i
//    referatet EFTER pause-analysen – det er anden halvlegs første minutter). Første halvleg har 14 tick, anden 16.
//  - Hændelserne i et tick fordeles stigende i tick'ets vindue; det sidste tick i hver halvleg strækkes ind i tillægstiden.
//  - En Hvis-Så-hændelse står aldrig før reglens minut (minClock – QC C3).
//  - Tillægstiden regnes af det, der skete i halvlegen (alt står i referatet), og gemmes som felt (m.stoppage – QC C4).
export const STOPPAGE_MAX = 8;
const VAR_REVIEW = new Set(['OVERTURNED', 'AWARDED', 'DOWNGRADED', 'UPGRADED']);   // dommeren til skærmen: +1 minut
const HALF = [{ ticks: 14, from: 1, base: 45 }, { ticks: 16, from: 46, base: 90 }];

// Tillægstid for en halvleg: 1 + ½ pr. skifte-vindue + ½ pr. mål + ¼ pr. kort + 1 pr. skade + 1 pr. VAR-tjek (+1 ved omstødt
// kendelse). Rundes op, højst STOPPAGE_MAX; "heraf VAR" er højst totalen (QC C5). Pause-skift (minut 45) tæller ikke.
export function stoppageFor(evs) {
  const windows = new Set(evs.filter((e) => e.type === 'SUB' && e.min !== 45).map((e) => e.min)).size;
  const goals = evs.filter((e) => e.type === 'GOAL' || e.type === 'HEADER_GOAL').length;
  const cards = evs.filter((e) => (e.type === 'FOUL' && /Gult/.test(e.label ?? '')) || e.type === 'RED' || e.type === 'VAR_RED').length;
  const injuries = evs.filter((e) => e.type === 'INJURY').length;
  const v = evs.filter((e) => e.var).reduce((a, e) => a + 1 + (VAR_REVIEW.has(e.var.verdict) ? 1 : 0), 0);
  const S = Math.min(STOPPAGE_MAX, Math.ceil(1 + 0.5 * (windows + goals) + 0.25 * cards + injuries + v));
  return { S, var: Math.min(S, v) };
}

// Vinduet for tick k i en halvleg (k = 1 … ticks), som hele minutter; det sidste strækkes til base + S.
function windowOf(h, k, S) {
  const len = 45, n = HALF[h].ticks, from = HALF[h].from;
  const a = from + Math.floor(((k - 1) * len) / n), b = k === n ? HALF[h].base + S : from - 1 + Math.floor((k * len) / n);
  return [a, Math.max(a, b)];
}
const asClock = (h, m) => (m > HALF[h].base ? { m: HALF[h].base, plus: m - HALF[h].base } : { m });

// Lægger e.clock på hver hændelse. minClock: Map(hændelsens indeks → tidligste minut). Returnerer [{S, var}, {S, var}].
export function assignClock(events, minClock = new Map()) {
  const ht = events.findIndex((e) => e.type === 'HALFTIME');
  if (ht < 0) return null;
  const endIdx = events.findIndex((e) => e.type === 'END' || e.type === 'FULLTIME');
  const stop = [stoppageFor(events.slice(0, ht)), stoppageFor(events.slice(ht + 1, endIdx < 0 ? events.length : endIdx))];
  const halves = [[0, ht], [ht + 1, endIdx < 0 ? events.length : endIdx]];
  halves.forEach(([s, e], h) => {
    const groups = new Map();
    for (let i = s; i < e; i++) {
      const k = h === 0 ? Math.max(1, Math.ceil(events[i].min / 3)) : Math.max(1, Math.round(events[i].min / 3) - 14);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    }
    let prev = h === 0 ? 1 : 46;
    for (const k of [...groups.keys()].sort((x, y) => x - y)) {
      const idx = groups.get(k), [a, b] = windowOf(h, Math.min(k, HALF[h].ticks), stop[h].S), n = idx.length;
      idx.forEach((i, j) => {
        let m = Math.max(prev, a + Math.floor((j * (b - a + 1)) / n), minClock.get(i) ?? 0);
        prev = m;
        events[i].clock = asClock(h, m);
      });
    }
  });
  events[ht].clock = { m: 45, plus: stop[0].S };
  for (let i = Math.max(0, endIdx); endIdx >= 0 && i < events.length; i++) events[i].clock = { m: 90, plus: stop[1].S };
  return stop;
}

// Visning
export const fmtMin = (c) => (c ? (c.plus ? `${c.m}+${c.plus}'` : `${c.m}'`) : '');
export const evMin = (e) => (e?.clock ? fmtMin(e.clock) : `${e?.min ?? 0}'`);   // gamle gem uden ur: tick-minuttet
export const clockNum = (c) => c.m + (c.plus ?? 0);
// Grundbilledets ur (afspilningen): tick t (0 = afspark) → vinduets start; uden stoppage (gamle kampe) t·3.
export function tickClock(t, stoppage) {
  if (!stoppage) return { m: t * 3 };
  if (t <= 0) return { m: 0 };
  const h = t <= 14 ? 0 : 1, k = h === 0 ? t : t - 14;
  return asClock(h, windowOf(h, k, stoppage[h].S)[0]);
}

// Tidslinjens position (0–1): første halvleg 0 … (45+S1)/T, anden halvleg efter den; T = 90 + S1 + S2. Halvlegsstregen står
// på (45+S1)/T (QC C6: med m/90 lå 45+3 til højre for 46'). Uden ur: e.min / 90 som før.
export function timelinePos(e, stoppage) {
  if (!e.clock || !stoppage) return Math.min(1, (e.min ?? 0) / 90);
  const [S1, S2] = [stoppage[0].S, stoppage[1].S], T = 90 + S1 + S2, c = clockNum(e.clock);
  return Math.min(1, (e.clock.m <= 45 ? c : c + S1) / T);
}
export const halfPos = (stoppage) => (stoppage ? (45 + stoppage[0].S) / (90 + stoppage[0].S + stoppage[1].S) : 0.5);
// Et minut i løbende tekst (klummen): "i 87. minut" / "i tillægstiden".
export const inMinute = (c) => (c?.plus ? 'i tillægstiden' : `i ${c?.m ?? 0}. minut`);
// Spillernes ind- og udminut efter referatets ur (QC C6): indskiftning og udskiftning fra SUB-linjen ("🔄 X ind for Y"),
// udvisning og skade fra linjen, der nævner spilleren i hans udminut (e.min = minOut – to ens navne på hvert sit hold skilles).
export function playerSpan(events, entries) {
  const tagOf = (r) => `#${r.shirtNumber} ${r.shortName}`, span = new Map();
  for (const r of entries) {
    const t = tagOf(r), s = {};
    for (const e of events) {
      if (!e.clock) continue;
      if (e.type === 'SUB' && e.min === r.minIn && e.label?.startsWith(`🔄 ${t} ind for `)) s.in = e.clock;
      if (e.type === 'SUB' && e.min === r.minOut && e.label?.endsWith(` ind for ${t}`)) s.out = e.clock;
      if (!s.out && (e.type === 'RED' || e.type === 'VAR_RED' || e.type === 'INJURY') && e.min === r.minOut && e.text?.includes(t)) s.out = e.clock;
    }
    span.set(r.playerId, s);
  }
  return span;
}
