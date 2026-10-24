// Heat map af kampens spor (v3.16, brugeren: "et heat map for kampen, både for holdet, men også for den enkelte spiller").
// Spilføreren: positionerne alene er formlen fra positions.js – "der hvor du satte ham" – så kortet viser også HÆNDELSERNE:
// hvor han afsluttede (mål, redning, forbi), hvor han scorede og lagde op. Tallene regnes af sporet (match.js "Kampens
// spor"), i holdets egne koordinater: lille y = ved modstanderens mål (holdet angriber opad på kortet).
// Dit hold og dine spillere fuldt; modstanderen kun groft i tredjedele (brugerens valg 2026-10-24). Det er et
// præsentationsvalg, ikke anti-spionage: afspilningen viser begge hold fuldt (spec §3).
export const COLS = 6, ROWS = 9;

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
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (const [id, x, y] of tracePoints(trace, side, playerId)) {
    if (playerId == null && id === gkId) continue;
    g[Math.min(ROWS - 1, Math.floor(y / (100 / ROWS)))][Math.min(COLS - 1, Math.floor(x / (100 / COLS)))]++;
  }
  const max = Math.max(1, ...g.flat());
  return g.map((r) => r.map((v) => v / max));
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
