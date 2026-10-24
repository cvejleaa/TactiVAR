// 2D-afspilning af kampen som taktiktavle (v3.16, brugeren: "en 2d simulering af kampen … så vi bedre kan kontrollere
// spil motoren"; valgt: begge hold fuldt synlige, for alle). Kun efter slutfløjt (QC B4: den levende afspilning af
// referatet er uændret, så intet afsløres før tid – Spilførerens "ingen spoling under live").
// Brikkerne er faste DOM-noder pr. spiller-id, som flyttes med CSS-overgange (bolden først, så spillerne – Spilfører),
// og elementet genbruges mellem tegningerne (renderMc erstatter Match Center – QC B4). Ingen opfundne mellembilleder:
// grundbilledet pr. tick (hvert 3. minut) og afslutningernes øjeblikke fra sporet (match.js "Kampens spor").
import { h } from './dom.js';

export const STEP_MS = { frame: 700, moment: 2600 };
export const SPEEDS = [1, 2, 4];

// Trinene: hvert tick sit grundbillede, derefter tick'ets afslutninger i referatets rækkefølge.
export function replaySteps(trace, highlights = false) {
  if (!trace) return [];
  const steps = [];
  for (const f of trace.frames) {
    if (!highlights) steps.push({ kind: 'frame', t: f.t, h: f.h, a: f.a, ball: f.ball, ev: null });
    for (const m of trace.moments.filter((x) => x.t === f.t)) steps.push({ kind: 'moment', t: m.t, h: m.h, a: m.a, ball: m.ball, ev: m.ev, actor: m.scorer ?? m.shooter, assist: m.assist ?? null });
  }
  return steps;
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
  const r = { i: 0, playing: false, speed: 1, highlights: false, timer: null, steps: replaySteps(m.trace), tokens: new Map() };
  const pitch = h('div', { class: 'rp-pitch', id: 'rp-pitch' }, h('div', { class: 'rp-half' }), h('div', { class: 'rp-box top' }), h('div', { class: 'rp-box bottom' }));
  const ball = h('div', { class: 'rp-ball', id: 'rp-ball' }, '●');
  pitch.append(ball);
  const caption = h('div', { class: 'rp-caption', id: 'rp-caption' });
  const playBtn = h('button', { class: 'mini', id: 'rp-play', onclick: () => (r.playing ? pause() : play()) }, '▶ Afspil');
  const speedBtn = h('button', { class: 'mini', id: 'rp-speed', title: 'Hastighed', onclick: () => { r.speed = SPEEDS[(SPEEDS.indexOf(r.speed) + 1) % SPEEDS.length]; speedBtn.textContent = `${r.speed}×`; } }, '1×');
  const hlBtn = h('button', { class: 'mini', id: 'rp-highlights', title: 'Kun afslutningerne i åbent spil og på kontra (mål, redninger, forbi, VAR) – ikke straffe, frispark og hjørnespark', onclick: () => {
    const ev = r.steps[r.i]?.ev; r.highlights = !r.highlights; r.steps = replaySteps(m.trace, r.highlights);
    r.i = ev != null ? Math.max(0, r.steps.findIndex((s) => s.ev === ev)) : 0; flag(hlBtn, 'active', r.highlights); show(); } }, '⭐ Højdepunkter');
  const el = h('div', { class: 'replay', id: 'replay' },
    h('div', { class: 'row' }, h('strong', {}, '🎬 Afspilning'),
      h('span', { class: 'muted' }, ` – taktiktavle ud fra ${m.trace.frames.length} øjebliksbilleder (hvert 3. minut) og afslutningerne i åbent spil (dødbolde – straffe, frispark, hjørnespark – har intet billede). ${m.homeName} angriber opad.`)),
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
  function show() {
    const s = r.steps[r.i];
    if (!s) return;
    // Overgangene følger trinets længde ved alle hastigheder (QC: med faste 1,1 s hang brikkerne bagud ved 2× og 4×).
    // Grundbillede: bolden først (35 %), spillerne glider efter. Afslutning: skytten først, så bolden (Spilfører v3.16: bolden
    // stod i feltet, før der var nogen til at skyde) – alt er fremme ved 80 % af trinet.
    const d = STEP_MS[s.kind] / r.speed, shot = s.kind === 'moment';
    const glide = `${Math.round(d * (shot ? 0.45 : 0.6))}ms ease-in-out ${!shot && r.speed === 1 ? Math.round(d * 0.2) : 0}ms`;
    const bt = shot ? `${Math.round(d * 0.3)}ms ease-out ${Math.round(d * 0.5)}ms` : `${Math.round(d * 0.35)}ms ease-out`;
    ball.style.transition = `left ${bt}, top ${bt}`;
    const here = new Set();
    for (const side of ['h', 'a']) for (const [id, x, y] of s[side]) {
      const t = token(id, side); here.add(id);
      t.style.transition = `left ${glide}, top ${glide}`; t.style.left = x + '%'; t.style.top = y + '%'; t.hidden = false;
      flag(t, 'actor', id === s.actor); flag(t, 'assist', id === s.assist);
    }
    for (const [id, t] of r.tokens) if (!here.has(id)) t.hidden = true;
    ball.style.left = s.ball[0] + '%'; ball.style.top = s.ball[1] + '%';
    // Stillingen og teksten: den seneste hændelse til og med trinet (et øjeblik viser sin egen linje)
    // Et grundbillede tages i starten af tick'et – før dets hændelser, så stillingen er den fra før (aldrig et mål for tidligt)
    const upto = s.ev ?? lastEventIdx(m.events, s.t * 3 - 1);
    const e = m.events[upto] ?? m.events[0];
    caption.textContent = `${s.t * 3}' · ${m.homeName} ${e.hG}-${e.aG} ${m.awayName}${s.kind === 'moment' ? ' · ' + e.text : ''}`;
    flag(caption, 'moment', s.kind === 'moment');
    el.dataset.step = String(r.i);
  }
  function tick() {
    if (!r.playing) return;
    if (r.i >= r.steps.length - 1) { pause(); return; }
    r.i++; show();
    r.timer = setTimeout(tick, STEP_MS[r.steps[r.i].kind] / r.speed);
  }
  function play() { if (r.i >= r.steps.length - 1) r.i = 0; r.playing = true; playBtn.textContent = '⏸ Pause'; show(); r.timer = setTimeout(tick, STEP_MS[r.steps[r.i].kind] / r.speed); }
  function pause() { r.playing = false; clearTimeout(r.timer); playBtn.textContent = '▶ Afspil'; }
  r.jump = (evIdx) => { pause(); if (r.highlights) { r.highlights = false; r.steps = replaySteps(m.trace); flag(hlBtn, 'active', false); } r.i = stepForEvent(r.steps, m.events, evIdx); show(); };
  r.el = el;
  cache.set(m.trace, r); live.add(r);
  show();
  return el;
}
const lastEventIdx = (events, min) => { let i = 0; events.forEach((e, j) => { if (e.min <= min) i = j; }); return i; };
export function replayJump(m, evIdx) { const r = m?.trace && cache.get(m.trace); if (r) { r.jump(evIdx); r.el.scrollIntoView({ block: 'center' }); } }
