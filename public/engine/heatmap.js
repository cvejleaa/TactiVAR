// Heat map af kampens spor (v3.16, brugeren: "et heat map for kampen, både for holdet, men også for den enkelte spiller").
// Spilføreren: positionerne alene er formlen fra positions.js – "der hvor du satte ham" – så kortet viser også HÆNDELSERNE:
// hvor han afsluttede (mål, redning, forbi), hvor han scorede og lagde op. Tallene regnes af sporet (match.js "Kampens
// spor"), i holdets egne koordinater: lille y = ved modstanderens mål (holdet angriber opad på kortet).
// Dit hold og dine spillere fuldt; modstanderen kun groft i tredjedele (brugerens valg 2026-10-24). Det er et
// præsentationsvalg, ikke anti-spionage: afspilningen viser begge hold fuldt (spec §3).
// v3.20.2 (brugeren: "13,6 km passer ikke med de få markeringer"): 12 × 18 felter, bevægelsen MELLEM billederne tæller med,
// og en let udglatning – før 6 × 9 felter med kun de 31 øjebliksbilleder (en zonespiller landede i 3–4 felter).
export const COLS = 12, ROWS = 18;
export const PATH_STEP = 2, PATH_WEIGHT = 0.5;   // et punkt pr. 2 enheder på vejen mellem to billeder, halv vægt

const own = (side, [id, x, y]) => (side === 'h' ? [id, x, y] : [id, 100 - x, 100 - y]);

// Alle punkter for holdet (eller én spiller): grundbillederne (pr. tick) og øjeblikkene (afslutninger).
export function tracePoints(trace, side, playerId = null) {
  if (!trace) return [];
  const out = [];
  for (const f of [...trace.frames, ...trace.moments]) for (const q of f[side] || []) {
    if (playerId != null ? q[0] === playerId : true) out.push(own(side, q));
  }
  return out;
}

// Tæthed i COLS × ROWS felter, 0–1 (det tætteste felt = 1). Målmanden tæller ikke med i holdets kort.
export function heatGrid(trace, side, playerId = null, gkId = null) {
  const sm = blur(heatCounts(trace, side, playerId, gkId)), max = Math.max(...sm.flat());
  return max > 0 ? sm.map((r) => r.map((v) => v / max)) : sm;
}
// Den rå optælling pr. felt (før udglatning): billeder og øjeblikke vægt 1, vejen imellem PATH_WEIGHT (paths: false = uden).
export function heatCounts(trace, side, playerId = null, gkId = null, { paths = true } = {}) {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const add = (x, y, w) => { g[Math.min(ROWS - 1, Math.max(0, Math.floor(y / (100 / ROWS))))][Math.min(COLS - 1, Math.max(0, Math.floor(x / (100 / COLS))))] += w; };
  const skip = (id) => playerId == null && id === gkId;
  for (const [id, x, y] of tracePoints(trace, side, playerId)) if (!skip(id)) add(x, y, 1);
  if (paths) for (const [id, x, y] of tracePaths(trace, side, playerId)) if (!skip(id)) add(x, y, PATH_WEIGHT);
  return g;
}
// Vejen mellem to på hinanden følgende billeder (efter t), pr. spiller – kun når han er på banen i BEGGE (en indskifter
// får ingen streg fra bænken). Punkterne ligger mellem endepunkterne (dem tæller tracePoints), PATH_STEP fra hinanden.
export function tracePaths(trace, side, playerId = null) {
  if (!trace) return [];
  const frames = trace.frames.slice().sort((a, b) => a.t - b.t), out = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = new Map((frames[i - 1][side] || []).map((q) => [q[0], own(side, q)]));
    for (const q of frames[i][side] || []) {
      if (playerId != null && q[0] !== playerId) continue;
      const a = prev.get(q[0]); if (!a) continue;
      const b = own(side, q), n = Math.ceil(Math.hypot(b[1] - a[1], b[2] - a[2]) / PATH_STEP);
      for (let k = 1; k < n; k++) out.push([q[0], a[1] + ((b[1] - a[1]) * k) / n, a[2] + ((b[2] - a[2]) * k) / n]);
    }
  }
  return out;
}
// Let udglatning: 3 × 3 med vægtene 1-2-1 (hjørne 1, kant 2, midte 4), kanterne uden for kortet tæller ikke
export function blur(g) {
  const W = [1, 2, 1];
  return g.map((row, r) => row.map((_, c) => {
    let s = 0, w = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const v = g[r + dr]?.[c + dc]; if (v === undefined) continue;
      const k = W[dr + 1] * W[dc + 1]; s += v * k; w += k;
    }
    return s / w;
  }));
}

// Afslutningerne (og målene/oplæggene) i sporet for holdet eller én spiller – med udfaldet fra referatet.
const OUTCOME = { GOAL: 'goal', HEADER_GOAL: 'goal', SAVE: 'save', MISS: 'miss', OFFSIDE_FLAG: 'offside', VAR_NO_GOAL: 'disallowed', VAR_CHECK: null };
export function shotsOf(trace, side, playerId = null) {
  if (!trace) return [];
  return trace.moments.filter((m) => m.side === side && m.shooter != null && OUTCOME[m.kind] && (playerId == null || m.shooter === playerId || m.assist === playerId))
    .map((m) => {
      const who = m.shooter === playerId || playerId == null ? m.shooter : m.assist;
      const q = m[side].find((p) => p[0] === who) ?? [who, ...m.ball];
      const [, x, y] = own(side, q);
      return { x, y, t: m.t, outcome: m.shooter === who ? OUTCOME[m.kind] : 'assist', ev: m.ev };
    });
}

// Modstanderen groft: andel af holdets punkter i egen tredjedel, midten og angrebstredjedelen (målmanden ikke med).
export function thirds(trace, side, gkId = null) {
  const t = [0, 0, 0];
  for (const [id, , y] of tracePoints(trace, side)) { if (id === gkId) continue; t[y >= 66.7 ? 0 : y >= 33.3 ? 1 : 2]++; }
  const n = t[0] + t[1] + t[2] || 1;
  return { defence: t[0] / n, middle: t[1] / n, attack: t[2] / n };
}

// Modstanderen groft som kort (v3.16.1, brugeren: "Der er ingen heat map for modstander"; Spilfører: vend det fra din side,
// procent i hvert felt, ingen enkeltspillere). 3 × 3 zoner set fra DIN side: modstanderen angriber nedad mod dit mål, og
// kolonne 0 er din venstre side. rows[0] = hans egen tredjedel (øverst), rows[2] = ved dit mål. Målmanden tæller ikke med.
export function zones(trace, side, gkId = null) {
  const z = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let n = 0;
  for (const [id, x, y] of tracePoints(trace, side)) {
    if (id === gkId) continue;
    // Hans egne koordinater (lille y = ved dit mål) → din visning: dit mål nederst, din venstre = hans højre (spejlet x)
    const row = y >= 66.7 ? 0 : y >= 33.3 ? 1 : 2, col = 100 - x < 33.3 ? 0 : 100 - x < 66.7 ? 1 : 2;
    z[row][col]++; n++;
  }
  return z.map((r) => r.map((v) => v / (n || 1)));
}
// Modstanderens afslutninger på samme kort (Spilfører: "hvor de var farlige mod mig") – står allerede i referatet.
export function zoneShots(trace, side) {
  return shotsOf(trace, side).map((s) => ({ ...s, x: 100 - s.x, y: 100 - s.y }));
}
