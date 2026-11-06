// VAR-øjeblikket (v3.32.2, docs/spec.md §5 live og §10b): rammen over stillingen, pausen før kendelsen og kampens fx.
// Rene funktioner – app.js og matchcenter.js tegner. Loggen bygges KUN af hændelsens type, var (kind/verdict/cast) og isHome
// plus navnene fra karakterarket: aldrig ev.text (heller ikke for gamle kampe), aldrig taktik, kynisme, teater eller "fælden virkede".
import { gen } from '../engine/clues.js';

// Pausen (D3): så mange tick (á PLAYBACK_MS = 420 ms) springes over efter tjekket, før kendelsen vises – tjek→kendelse
// (1 + 4) × 420 = 2100 ms mod før 420 ms. Rammen står kendelsen + FRAME_AFTER tick (≈ 2 s – Spilfører UI: 2 tick var for kort).
export const VAR_HOLD_TICKS = 4;
export const FRAME_AFTER = 5;
const STARTS = new Set(['VAR_CHECK', 'VAR_PEN', 'VAR_RED']);

// Tjekket og dets kendelse – efter en tabel pr. kind/verdict (ikke "næste mål"). To-trins: kendelsen er den næste hændelse.
// Ét-trins (VAR_PEN/AWARDED, VAR_RED/UPGRADED): hændelsen er selv kendelsen – ingen pause.
export function varSequence(events, i) {
  const e = events[i];
  if (!e || !STARTS.has(e.type) || !e.var) return null;
  const { kind, verdict } = e.var;
  const one = (e.type === 'VAR_PEN' && verdict === 'AWARDED') || (e.type === 'VAR_RED' && verdict === 'UPGRADED');
  const verdictAt = one ? i : i + 1 < events.length ? i + 1 : null;
  return { type: e.type, kind, verdict, check: i, verdictAt, oneStep: one, isHome: e.isHome, cast: e.var.cast ?? null };
}

// Rammen ved den senest viste hændelse (last = indeks i kampens hændelser): det seneste tjek, til og med kendelsen + FRAME_AFTER tick.
// reached = kendelses-hændelsen er vist (først da står kendelseslinjen).
export function varFrame(events, last) {
  for (let i = Math.min(last, events.length - 1); i >= 0 && i >= last - FRAME_AFTER - 1; i--) {
    const seq = varSequence(events, i);
    if (!seq) continue;
    const end = (seq.verdictAt ?? seq.check) + FRAME_AFTER;
    return last <= end ? { seq, reached: seq.verdictAt != null && last >= seq.verdictAt } : null;
  }
  return null;
}

// Pausen efter den netop viste hændelse: kun ved et to-trins tjek med en kendelse
export function holdAfter(events, idx) {
  const seq = varSequence(events, idx);
  return seq && !seq.oneStep && seq.verdictAt != null ? VAR_HOLD_TICKS : 0;
}

// Ét afspilnings-tick (app.js' setInterval): en ventende pause tælles ned – ellers vises næste hændelse ('show') eller slutfløjtet ('end').
export function playbackStep(mc, events) {
  if (mc.hold > 0) { mc.hold--; return 'hold'; }
  mc.shownCount++;
  if (mc.shownCount >= events.length) return 'end';
  mc.hold = holdAfter(events, mc.shownCount - 1);
  return 'show';
}

// Navne fra karakterarket (som playerSpan, engine/clock.js) – id → "#9 Hansen"
export function castNames(m) {
  const map = new Map([...(m.ratings?.home ?? []), ...(m.ratings?.away ?? [])].map((r) => [r.playerId, `#${r.shirtNumber} ${r.shortName}`]));
  return (id) => (typeof id === 'string' ? map.get(id) ?? null : null);
}

const QUESTION = { OFFSIDE: 'offside?', FOUL: 'skub i opspillet?', DIVE: 'filmning?', RED: 'rødt kort?' };
const VERDICT = {
  VAR_CHECK: { STANDS: '✅ Målet står', OVERTURNED: '❌ Målet annulleret' },
  VAR_PEN: { STANDS: '✅ Straffen står', OVERTURNED: '❌ Ingen straffe' },
  VAR_RED: { CONFIRMED: '🟥 Rødt står', DOWNGRADED: '🟨 Rødt bliver gult', UPGRADED: '🟥 Opgraderet til rødt' },
};
// Linjerne i rammen. name: id → navn (castNames); team: isHome → holdnavn. Kendelseslinjen kun, når kendelsen er vist (reached).
export function varLog(seq, reached, name = () => null, team = () => '') {
  if (!seq) return [];
  const c = seq.cast ?? {}, who = name(c.checked), out = [];
  if (seq.type === 'VAR_PEN' && seq.verdict === 'AWARDED') {
    out.push(`📺 Straffe til ${team(seq.isHome)}`.trim());
    if (who) out.push(name(c.fouler) ? `${who} fældet af ${name(c.fouler)}` : `${who} fældet i feltet`);
    return out;
  }
  out.push(seq.type === 'VAR_RED' && seq.verdict === 'UPGRADED' ? '📺 VAR kalder dommeren ud: rødt kort?' : `📺 VAR tjekker: ${QUESTION[seq.kind] ?? 'situationen?'}`);
  if (who) {
    if (seq.kind === 'OFFSIDE') {
      out.push(`${who} tjekkes for offside${c.other ? ' – forreste mand' : ''}`);
      if (name(c.line)) out.push(`afgjort mod ${gen(name(c.line))} placering`);
    } else if (seq.kind === 'FOUL') out.push(name(c.victim) ? `${who} tjekkes for skub mod ${name(c.victim)}` : `${who} tjekkes for skub`);
    else if (seq.kind === 'DIVE') out.push(`${who} tjekkes for filmning`);
    else out.push(`${who} tjekkes`);
  }
  if (reached) { const v = VERDICT[seq.type]?.[seq.verdict]; if (v) out.push(v); }
  return out;
}
// Skærmlæserens linje (#live-status): spørgsmålet ved tjekket, kendelsen ved kendelsen
export const liveLine = (lines, reached) => (reached ? lines.at(-1) : lines[0]) ?? '';

// Kampens fx (D4) – én gang pr. hændelse: seen er et Set af viste indeks i mc (et filterklik i samme tick tegner igen og må ikke
// afspille igen). own(isHome) = dit hold. Rystelse: dit holds endelige mål (GOAL/HEADER_GOAL – aldrig VAR_CHECK) og det endelige
// rødt (RED – aldrig VAR_RED/VAR_NO_RED). Flash ved annulleret mål: rød, når det var DIT mål; grøn, når det var modstanderens.
export function fxFor(last, idx, seen, own) {
  if (!last || seen.has(idx)) return null;
  const fx = (last.type === 'GOAL' || last.type === 'HEADER_GOAL') && own(last.isHome) ? 'fx-shake'
    : last.type === 'RED' ? 'fx-shake'
      : last.type === 'VAR_NO_GOAL' ? (own(last.isHome) ? 'fx-flash-bad' : 'fx-flash-good') : null;
  if (fx) seen.add(idx);
  return fx;
}

// Lyden (D5) ved den netop viste hændelse: bip ved et VAR-tjek, kort jubel ved dit holds mål
export function soundFor(ev, own) {
  if (!ev) return null;
  if (STARTS.has(ev.type)) return 'bip';
  if ((ev.type === 'GOAL' || ev.type === 'HEADER_GOAL') && own(ev.isHome)) return 'cheer';
  return null;
}
