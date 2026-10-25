// 2D-afspilning af kampen som taktiktavle (v3.16, brugeren: "en 2d simulering af kampen … så vi bedre kan kontrollere
// spil motoren"; valgt: begge hold fuldt synlige, for alle). Kun efter slutfløjt (QC B4: den levende afspilning af
// referatet er uændret, så intet afsløres før tid – Spilførerens "ingen spoling under live").
// Brikkerne er faste DOM-noder pr. spiller-id, som flyttes med CSS-overgange (bolden først, så spillerne – Spilfører),
// og elementet genbruges mellem tegningerne (renderMc erstatter Match Center – QC B4). Ingen opfundne mellembilleder:
// grundbilledet pr. tick (hvert 3. minut) og afslutningernes øjeblikke fra sporet (match.js "Kampens spor"). Ét tegnet trin
// (v3.16.2): efter et mål, en redning eller et skud forbi går bolden derhen, referatet siger – tegnet ud fra udfaldet, ikke motoren.
import { h } from './dom.js';
import { evMin, fmtMin, tickClock } from '../engine/clock.js';

// Banens skala i tegningen (v3.16.3, Spilfører: målmanden stod 10 % ude, forsvarerne aldrig i eget felt): formationernes
// y 90/10 (målmanden) tegnes ved mållinjen (≈97/3) – kun visningen; motoren og sporet er uændrede. Symmetrisk om 50, så
// samme skala gælder begge hold.
export const DRAW_K = 1.175;
export const drawY = (y) => Math.max(1, Math.min(99, Math.round((50 + (y - 50) * DRAW_K) * 10) / 10));
export const STEP_MS = { frame: 700, moment: 2600, shot: 1100 };
export const SPEEDS = [1, 2, 4];

// Trinene: hvert tick sit grundbillede, derefter tick'ets afslutninger i referatets rækkefølge – hver med et trin mere, hvor
// bolden går derhen, skuddet endte (v3.16.2, brugeren: "Man ser aldrig bolden nærme sig målmanden som udfører en redning").
export function replaySteps(trace, highlights = false, events = null, idOf = null) {
  if (!trace) return [];
  const steps = [];
  for (const f of trace.frames) {
    if (!highlights) steps.push({ kind: 'frame', t: f.t, h: f.h, a: f.a, ball: f.ball, ev: null, poss: f.poss ?? null, duel: f.lost ? 'lost' : f.run ? 'run' : f.offside ? 'offside' : f.poss ? 'ball' : null });
    // Højdepunkter: halvchancen (v3.17.0, half) kun som mål – ellers blev uddraget en halv afspilning (Spilfører)
    for (const m of trace.moments.filter((x) => x.t === f.t && !(highlights && x.half && !x.scorer))) {
      const step = { kind: 'moment', t: m.t, h: m.h, a: m.a, ball: m.ball, ev: m.ev, actor: m.scorer ?? m.shooter, assist: m.assist ?? null };
      steps.push(step);
      const end = shotEnd(m, events?.[m.ev], idOf);
      // endPlayer: endepunktet er en spillers plads (redning, blokering) og tegnes som brikkerne; ellers et mållinje-punkt
      if (end) steps.push({ ...step, kind: 'shot', ball: end, over: shotOver(m, events?.[m.ev]), endPlayer: [...m.h, ...m.a].some((q) => q[1] === end[0] && q[2] === end[1]) });
    }
  }
  return steps;
}
// Hvor skuddet endte, i sporets fælles koordinater (hjemme angriber mod y 0, ude mod y 100) – efter referatets linje (QC
// v3.16.2: "forbi" er blokeret, stolpen, over eller forbi, og billedet må ikke modsige teksten). Målmanden = forsvarets spiller
// nærmest målets midte (også efter en udvisning). Målet er tegnet (x 44–56, 3 dybt):
//  - mål: i nettet (y 2/98) ved siden af målmanden, mod skyttens side;   - redning: hos målmanden;
//  - blokeret: hos forsvarets markspiller nærmest skytten;   - stolpen: på stolpen (x 44/56) på skyttens side;
//  - over: over overliggeren (x 50, y 0,5/99,5);   - ellers forbi: uden for stolpen på den fjerne side (x 38/62).
// VAR-tjek, annulleret mål og flag har intet trin – kendelsen er ingen boldbane.
const SHOT_END = new Set(['GOAL', 'HEADER_GOAL', 'SAVE', 'MISS']);
// Over mål: bolden ender over målet (x 50) – men set ovenfra lå det punkt i det tegnede net, som et mål (QC v3.16.2), så trinnet
// får sit eget træk: bolden vokser og toner ud (den flyver over overliggeren), klassen .over på bolden.
export const shotOver = (m, ev) => m.kind === 'MISS' && ev?.label !== 'Blokeret' && /over (mål|overliggeren)/.test(ev?.text ?? '');
export function shotEnd(m, ev = null, idOf = null) {
  if (!SHOT_END.has(m.kind) || !m.ball) return null;
  const top = m.side === 'h', def = m[top ? 'a' : 'h'] ?? [], line = (dy) => (top ? dy : 100 - dy);
  if (!def.length) return null;
  const near = (pts, x, y) => pts.reduce((b, q) => (Math.hypot(q[1] - x, q[2] - y) < Math.hypot(b[1] - x, b[2] - y) ? q : b));
  const gk = near(def, 50, line(0)), left = m.ball[0] < 50;
  if (m.kind === 'SAVE') return [gk[1], gk[2]];
  if (m.kind === 'MISS') {
    const field = def.filter((q) => q !== gk);
    if (ev?.label === 'Blokeret' && field.length) {
      // Blokeren, referatet nævner (idOf: "#7 M. Kjær" → spiller-id), ellers forsvarets markspiller nærmest skytten
      const named = idOf && ev.text.match(/(#\d+ .+?) kaster sig ind/), q = named && field.find((p) => p[0] === idOf(named[1]));
      const b = q ?? near(field, m.ball[0], m.ball[1]); return [b[1], b[2]];
    }
    if (/stolpe/.test(ev?.text ?? '') && !/forbi den lange stolpe/.test(ev.text)) return [left ? 44 : 56, line(3)];   // stolpen i målets forkant
    if (/over (mål|overliggeren)/.test(ev?.text ?? '')) return [50, line(0.5)];
    return [left ? 62 : 38, line(2)];
  }
  return [Math.min(55, Math.max(45, gk[1] + (m.ball[0] < gk[1] ? -5 : 5))), line(2)];
}
// Trinet for en hændelse i referatet: dens øjeblik, ellers grundbilledet i dens tick.
export function stepForEvent(steps, events, evIdx) {
  const i = steps.findIndex((s) => s.ev === evIdx);
  if (i >= 0) return i;
  const t = Math.round((events[evIdx]?.min ?? 0) / 3);
  return Math.max(0, steps.findIndex((s) => s.t === t));
}

// Klasser uden classList (virker også i testenes lille DOM)
const flag = (el, c, on) => { const k = new Set(el.className.split(' ').filter(Boolean)); if (on) k.add(c); else k.delete(c); el.className = [...k].join(' '); };
// Ét afspilningselement pr. kamp (nøglen er kampens spor – QC: en streng-nøgle som "runde:kamp" kolliderede med andre
// ligaers kampe, fx i testene, og flyttede elementet ud af siden).
let cache = new WeakMap();
const live = new Set();
export function clearReplays() { for (const r of live) clearTimeout(r.timer); live.clear(); cache = new WeakMap(); }

// m: kampen; ownSide: 'h' | 'a' | null (dit hold markeres).
export function replayEl(m, ownSide) {
  if (!m.trace) return h('div', { class: 'muted', id: 'replay' }, '🎬 Ingen afspilning – kampen er spillet før v3.16 (afspilning findes for seneste runde).');
  if (cache.has(m.trace)) return cache.get(m.trace).el;
  const who = new Map([...m.ratings.home, ...m.ratings.away].map((e) => [e.playerId, e]));
  const byTag = new Map([...who.values()].map((e) => [`#${e.shirtNumber} ${e.shortName}`, e.playerId])), idOf = (t) => byTag.get(t);
  // Dit hold angriber altid opad (v3.16.3, Spilfører – én regel for alle visninger): er du udehold, spejles tavlen. I kampe
  // uden dit hold angriber hjemmeholdet opad (sporets egne koordinater).
  const flip = ownSide === 'a', vx = (x) => (flip ? 100 - x : x), vy = (y) => drawY(flip ? 100 - y : y), vLine = (y) => (flip ? 100 - y : y);
  const r = { i: 0, playing: false, speed: 1, highlights: false, timer: null, steps: replaySteps(m.trace, false, m.events, idOf), tokens: new Map() };
  const pitch = h('div', { class: 'rp-pitch', id: 'rp-pitch' }, h('div', { class: 'rp-half' }), h('div', { class: 'rp-box top' }), h('div', { class: 'rp-box bottom' }), h('div', { class: 'rp-goal top' }), h('div', { class: 'rp-goal bottom' }));
  const ball = h('div', { class: 'rp-ball', id: 'rp-ball' }, '●');
  pitch.append(ball);
  const caption = h('div', { class: 'rp-caption', id: 'rp-caption' });
  const playBtn = h('button', { class: 'mini', id: 'rp-play', onclick: () => (r.playing ? pause() : play()) }, '▶ Afspil');
  const speedBtn = h('button', { class: 'mini', id: 'rp-speed', title: 'Hastighed', onclick: () => { r.speed = SPEEDS[(SPEEDS.indexOf(r.speed) + 1) % SPEEDS.length]; speedBtn.textContent = `${r.speed}×`; } }, '1×');
  const hlBtn = h('button', { class: 'mini', id: 'rp-highlights', title: 'Kun afslutningerne i åbent spil og på kontra (mål, redninger, forbi, VAR) – ikke straffe, frispark og hjørnespark, og de små skud kun, når de gik ind', onclick: () => {
    clearTimeout(r.timer); const ev = r.steps[r.i]?.ev; r.highlights = !r.highlights; r.steps = replaySteps(m.trace, r.highlights, m.events, idOf);
    const at = ev != null ? r.steps.findIndex((s) => s.ev === ev) : -1;   // en sprunget halvchance: nærmeste trin efter den (QC – før trin 0)
    r.i = at >= 0 ? at : ev != null ? Math.max(0, r.steps.findIndex((s) => s.ev > ev)) : 0; flag(hlBtn, 'active', r.highlights); show();
    // Kører afspilningen, fortsætter den fra det nye trin (RM v3.16.2: ryddet timer uden ny standsede den tavst med "⏸ Pause")
    if (r.playing) r.timer = setTimeout(tick, STEP_MS[r.steps[r.i].kind] / r.speed); } }, '⭐ Højdepunkter');
  const el = h('div', { class: 'replay', id: 'replay' },
    h('div', { class: 'row' }, h('strong', {}, '🎬 Afspilning'),
      h('span', { class: 'muted' }, ` – taktiktavle ud fra ${m.trace.frames.length} øjebliksbilleder (hvert 3. minut) og afslutningerne i åbent spil (dødbolde – straffe, frispark, hjørnespark – har intet billede). ${flip ? m.awayName : m.homeName} angriber opad.`)),
    pitch, caption,
    h('div', { class: 'rp-controls' },
      h('button', { class: 'mini', id: 'rp-prev', title: 'Et trin tilbage', onclick: () => { pause(); r.i = Math.max(0, r.i - 1); show(); } }, '⏮'),
      playBtn,
      h('button', { class: 'mini', id: 'rp-next', title: 'Et trin frem', onclick: () => { pause(); r.i = Math.min(r.steps.length - 1, r.i + 1); show(); } }, '⏭'),
      speedBtn, hlBtn));

  function token(id, side) {
    if (r.tokens.has(id)) return r.tokens.get(id);
    const e = who.get(id);
    const t = h('div', { class: `rp-token ${side === 'h' ? 'home' : 'away'}${side === ownSide ? ' own' : ''}`, dataset: { pid: id }, title: e ? `#${e.shirtNumber} ${e.shortName} (${side === 'h' ? m.homeName : m.awayName})` : '' }, e ? String(e.shirtNumber) : '?');
    pitch.append(t); r.tokens.set(id, t);   // bolden ligger øverst via z-index
    return t;
  }
  function place(s, transition) {
    const here = new Set();
    for (const side of ['h', 'a']) for (const [id, x, y] of s[side]) {
      const t = token(id, side); here.add(id);
      t.style.transition = transition; t.style.left = vx(x) + '%'; t.style.top = vy(y) + '%'; t.hidden = false;
      flag(t, 'actor', id === s.actor); flag(t, 'assist', id === s.assist);
    }
    for (const [id, t] of r.tokens) if (!here.has(id)) t.hidden = true;
  }
  function show() {
    const s = r.steps[r.i];
    if (!s) return;
    // Overgangene følger trinets længde ved alle hastigheder (QC: med faste 1,1 s hang brikkerne bagud ved 2× og 4×).
    // Grundbillede: bolden først (35 %), spillerne glider efter. Afslutning: skytten først, så bolden (Spilfører v3.16: bolden
    // stod i feltet, før der var nogen til at skyde) – alt er fremme ved 80 % af trinet.
    if (s.kind === 'shot') {   // kun bolden flytter sig – fra skytten derhen, skuddet endte
      const d = STEP_MS.shot / r.speed, bt = `${Math.round(d * 0.6)}ms ease-in`;
      ball.style.transition = `left ${bt}, top ${bt}, transform ${bt}, opacity ${bt}`;
      ball.style.left = vx(s.ball[0]) + '%'; ball.style.top = (s.endPlayer ? vy(s.ball[1]) : vLine(s.ball[1])) + '%'; flag(ball, 'over', !!s.over);
      // Brikkerne står som i øjeblikket – også når man kommer baglæns fra et senere trin (QC v3.16.2: ellers gik bolden ved ⏮
      // hen til en tom plads); fremad flytter de sig ikke, for pladserne er de samme.
      place(s, 'none');
      const e = m.events[s.ev] ?? m.events[0];
      caption.textContent = `${evMin(e)} · ${m.homeName} ${e.hG}-${e.aG} ${m.awayName} · ${e.text}`;
      flag(caption, 'moment', true);
      el.dataset.step = String(r.i);
      return;
    }
    const d = STEP_MS[s.kind] / r.speed, shot = s.kind === 'moment';
    const glide = `${Math.round(d * (shot ? 0.45 : 0.6))}ms ease-in-out ${!shot && r.speed === 1 ? Math.round(d * 0.2) : 0}ms`;
    const bt = shot ? `${Math.round(d * 0.3)}ms ease-out ${Math.round(d * 0.5)}ms` : `${Math.round(d * 0.35)}ms ease-out`;
    ball.style.transition = `left ${bt}, top ${bt}`; flag(ball, 'over', false);
    place(s, `left ${glide}, top ${glide}`);
    ball.style.left = vx(s.ball[0]) + '%'; ball.style.top = vy(s.ball[1]) + '%';
    // Stillingen og teksten: den seneste hændelse til og med trinet (et øjeblik viser sin egen linje)
    // Et grundbillede er tick'ets duel, før afslutningerne (v3.16.1) – stillingen er den fra før (aldrig et mål for tidligt),
    // og teksten siger, hvordan duellen gik (QC v3.16.1: ellers står bolden pludselig hos modspilleren uden forklaring)
    const upto = s.ev ?? lastEventIdx(m.events, s.t * 3 - 1);
    const e = m.events[upto] ?? m.events[0];
    // Uret (v3.16.4): et øjeblik står på sin hændelses minut, et grundbillede på tick'ets første minut (QC C6 – billedet kommer
    // før tick'ets afslutninger, så dets minut må ikke ligge efter deres)
    caption.textContent = `${s.kind === 'moment' ? evMin(e) : fmtMin(tickClock(s.t, m.stoppage))} · ${m.homeName} ${e.hG}-${e.aG} ${m.awayName}${s.kind === 'moment' ? ' · ' + e.text : duelText(s, m)}`;
    flag(caption, 'moment', s.kind === 'moment');
    el.dataset.step = String(r.i);
  }
  function tick() {
    if (!r.playing) return;
    if (r.i >= r.steps.length - 1) { pause(); return; }
    r.i++; show();
    r.timer = setTimeout(tick, STEP_MS[r.steps[r.i].kind] / r.speed);
  }
  function play() { clearTimeout(r.timer); if (r.i >= r.steps.length - 1) r.i = 0; r.playing = true; playBtn.textContent = '⏸ Pause'; show(); r.timer = setTimeout(tick, STEP_MS[r.steps[r.i].kind] / r.speed); }
  function pause() { r.playing = false; clearTimeout(r.timer); playBtn.textContent = '▶ Afspil'; }
  // 🎬: afslutningen og dens udfald – står på udfaldet (QC v3.16.2: ellers stoppede springet med bolden ved skytten)
  r.jump = (evIdx) => {
    pause(); if (r.highlights) { r.highlights = false; r.steps = replaySteps(m.trace, false, m.events, idOf); flag(hlBtn, 'active', false); }
    r.i = stepForEvent(r.steps, m.events, evIdx); show();
    if (r.steps[r.i + 1]?.kind === 'shot' && r.steps[r.i + 1].ev === r.steps[r.i].ev) r.timer = setTimeout(() => { r.i++; show(); }, STEP_MS.moment / r.speed);
  };
  r.el = el;
  cache.set(m.trace, r); live.add(r);
  show();
  return el;
}
const DUEL_TEXT = { ball: (a) => `${a} har bolden`, run: (a) => `${a} spiller sig frem til angriberen`, lost: (a, d) => `${d} erobrer bolden`, offside: (a) => `${a}: fanget offside` };
export const duelText = (s, m) => {
  if (!s.duel) return '';
  const [a, d] = s.poss === 'h' ? [m.homeName, m.awayName] : [m.awayName, m.homeName];
  return ' · ' + DUEL_TEXT[s.duel](a, d);
};
const lastEventIdx = (events, min) => { let i = 0; events.forEach((e, j) => { if (e.min <= min) i = j; }); return i; };
export function replayJump(m, evIdx) { const r = m?.trace && cache.get(m.trace); if (r) { r.jump(evIdx); r.el.scrollIntoView({ block: 'center' }); } }
