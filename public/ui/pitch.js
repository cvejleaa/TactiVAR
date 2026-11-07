// Taktiktavlen: "Rolle-anker & frit træk" (docs/spec.md §4). Målmanden og modstanderens
// brikker kan ikke trækkes; uden for ankerradius 28 vises "⚠ Ude af zone (-20%)".
import { h } from './dom.js';
import { FORMATIONS, MAX_ANCHOR_RADIUS, slotPosition, isOutOfZone, clampPos, slotFitOf, slotKindText, slotPlaceLabel, CENTRAL_ROLES, fitOf } from '../engine/formations.js';
import { POSITION_FULL, fitCost, outLabel, roleLabel } from './labels.js';
import { BAND_WORD } from '../engine/chemistry.js';

// pairs (v3.24.0, kun dit hold): samspillet mellem nabopladser (chemistry.js lineupPairs) – streger under brikkerne, og hver brik
// nævner sine par i title (QC: en streg med pointer-events:none kan ikke vise et tooltip)
export function renderPitch({ team, isOwn, ui, onMove, onSelect, onTokenSwap, pairs = null }) {
  const coords = FORMATIONS[team.tactics.baseFormation];
  const byId = new Map(team.squad.map((p) => [p.id, p]));
  const pitch = h('div', { class: 'pitch', id: 'pitch' }, h('div', { class: 'pitch-line mid' }), h('div', { class: 'pitch-box top' }), h('div', { class: 'pitch-box bottom' }));
  const anchorRing = h('div', { class: 'anchor-ring', hidden: true });
  pitch.append(anchorRing);
  // Fokus (v3.32.3, brugeren 6/11: "hvem den valgte spiller spiller godt sammen med"): den valgte i et byt (pitchSwapId – valg = start
  // byt) på banen – hans streger fremhæves (.focus), de andre dæmpes (svg data-focus), og naboernes brikker får en ring i båndets farve
  const fslot = isOwn && pairs?.length && ui.pitchSwapId ? team.tactics.lineupSlots.indexOf(ui.pitchSwapId) : -1;
  const mates = new Map(fslot > 0 ? pairs.filter((x) => x.i === fslot || x.j === fslot).map((x) => [x.i === fslot ? x.b.id : x.a.id, x.band]) : []);
  if (isOwn && pairs?.length) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'chem-lines'); svg.setAttribute('id', 'chem-lines'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
    if (fslot > 0) svg.dataset.focus = String(fslot);
    for (const x of pairs) {
      const a = slotPosition(team.tactics, x.i), b = slotPosition(team.tactics, x.j), l = document.createElementNS(ns, 'line');
      for (const [k, v] of [['x1', a.x], ['y1', a.y], ['x2', b.x], ['y2', b.y]]) l.setAttribute(k, String(v));
      l.setAttribute('class', `chem chem-${x.band}${fslot > 0 && (x.i === fslot || x.j === fslot) ? ' focus' : ''}`); l.dataset.pair = `${x.i}-${x.j}`;
      svg.append(l);
    }
    pitch.append(svg);
  }
  const pairText = (pid) => (pairs ?? []).filter((x) => x.a.id === pid || x.b.id === pid).map((x) => { const m = x.a.id === pid ? x.b : x.a; return `samspil med #${m.shirtNumber} ${m.shortName}: ${BAND_WORD[x.band]}`; }).join(' · ');

  team.tactics.lineupSlots.forEach((pid, slot) => {
    const p = byId.get(pid);
    const pos = slotPosition(team.tactics, slot);
    const out = isOutOfZone(team.tactics, slot);
    const custom = !!team.tactics.customCoords?.[slot];
    // v3.20.0: uden for position – vises sammen med zone-flaget (begge koster), tallet fra tabellen
    const fit = p ? slotFitOf(team.tactics, slot, p.position) : 1, kind = slotKindText(coords[slot].r, pos.y);   // v3.24.6: pladsens dybde
    // Flagene står i .token-flags (bredde 0, så et langt flag ikke gør brikken bred); ved kanten vokser de indad (edge-l/edge-r),
    // så banen (overflow: hidden) ikke skærer dem af (Spilfører UI 2, v3.33.0-rettelse)
    const flags = [
      p && p.banMatches > 0 ? h('span', { class: 'token-flag' }, `⛔ udelukket`) : out ? h('span', { class: 'token-flag' }, '⚠ Ude af zone (-20%)') : custom && fit >= 1 ? h('span', { class: 'token-flag ok' }, '✅ Custom pos') : null,
      fit < 1 ? posFlag(kind && kind !== 'kant-/back-plads' ? kind : null, fit) : null].filter(Boolean);   // QC v3.24.6: pladstypen synligt (mobil)
    const token = h('div', {
      class: `token${pos.x < EDGE_X ? ' edge-l' : pos.x > 100 - EDGE_X ? ' edge-r' : ''}${out ? ' out' : custom ? ' custom' : ''}${ui.selectedPlayerId === pid ? ' selected' : ''}${ui.pitchSwapId === pid ? ' swapping' : ''}${p && outLabel(p) ? ' injured' : ''}${p?.banMatches > 0 ? ' banned' : ''}${mates.has(pid) ? ` mate mate-${mates.get(pid)}` : ''}`,
      style: { left: pos.x + '%', top: pos.y + '%' }, dataset: { slot: String(slot), fit: String(fit) }, title: `${slotPlaceLabel(team.tactics, slot)}${kind ? ` (${kind})` : ''} – ${p ? p.name : '?'}${p ? ` · naturlig: ${POSITION_FULL[p.position] ?? p.position}${fit < 1 ? ` – her ${fitCost(fit)} i dueller` : ''}` : ''}${p && isOwn && pairs?.length && pairText(pid) ? ` · 🤝 ${pairText(pid)}` : ''}`,
    }, h('span', { class: 'token-num' }, p ? String(p.shirtNumber) : '?'), h('span', { class: 'token-name' }, p ? p.shortName : '?'),
      flags.length ? h('div', { class: 'token-flags' }, flags) : null);
    token.addEventListener('click', () => {
      if (!p || token.dataset.dragged) { delete token.dataset.dragged; return; }
      // Eget hold: første klik vælger, klik på en anden brik bytter de to (som i v2.5).
      if (isOwn && ui.pitchSwapId && ui.pitchSwapId !== pid) onTokenSwap(ui.pitchSwapId, pid);
      else onSelect(p, isOwn);
    });
    if (isOwn && slot > 0) attachDrag(token, pitch, anchorRing, coords[slot], slot, onMove, p);
    pitch.append(token);
  });
  return pitch;
}

// Spilfører UI 2 (v3.33.0-rettelse): "✅ Custom pos" vises ikke, når der også står et pladsflag – de to lå oven i hinanden og i naboen.
// Pladsflaget har en kort form (data-short), som CSS viser ≤ 600 px: "⚠ DM-plads −2,5 %" på to linjer (textContent er den lange – title og tests).
const EDGE_X = 25;
const posFlag = (kind, fit) => h('span', { class: 'token-flag pos', dataset: { short: `⚠ ${kind ?? 'Uden for pos.'}\n${fitCost(fit)}` } }, `⚠ Uden for position${kind ? ` – ${kind}` : ''} (${fitCost(fit)})`);
// liveText (v3.33.0-rettelse, Spilfører UI 1): etiketten under træk siger følgen for NETOP ham – pladstypen, hans pris eller ✓ (fitOf, samme
// tabel som flaget) og "ude af zone". tone: 'ok' (grøn) passer, 'warn' (gul) koster – egen farve, ikke "Ude af zone"-flagets lyserøde.
export function liveText(anchor, y, position, out) {
  const k = slotKindText(anchor.r, y) ?? `${roleLabel(anchor.r)}-plads`, fit = position ? fitOf(position, anchor.r, y) : 1;
  return { text: `→ ${k}${fit < 1 ? ` · ${fitCost(fit)}` : position ? ' ✓' : ''}${out ? ' · ude af zone' : ''}`, tone: fit < 1 || out ? 'warn' : 'ok' };
}
function attachDrag(token, pitch, ring, anchor, slot, onMove, player = null) {
  token.classList.add('draggable');
  token.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    token.setPointerCapture(e.pointerId);
    const rect = pitch.getBoundingClientRect();
    let moved = false, last = null, live = null, liveBox = null;
    // v3.33.0: pladstypen live under trækket ("→ DM-plads") – den samme slotKindText som title og flaget, ud fra den trukne dybde.
    // QC (efter rettelserne): flagene fra visningen skjules under trækket (.dragging) – ellers stod "⚠ … DM-plads" over "→ CM-plads ✓".
    // Etiketten står i sin egen boks med bredde 0, så den vokser indad ved kanten som flagene (edge-l/edge-r) og ikke skæres af banen.
    token.classList.add('dragging');
    if (CENTRAL_ROLES.has(anchor.r) || slotKindText(anchor.r, anchor.y)) { live = h('span', { class: 'token-flag kind-live' }); liveBox = h('div', { class: 'token-live' }, live); token.append(liveBox); }
    Object.assign(ring.style, { left: anchor.x + '%', top: anchor.y + '%', width: MAX_ANCHOR_RADIUS * 2 + '%', height: (MAX_ANCHOR_RADIUS * 2 * rect.width) / rect.height + '%' });
    ring.hidden = false;
    const move = (ev) => {
      last = clampPos({ x: ((ev.clientX - rect.left) / rect.width) * 100, y: ((ev.clientY - rect.top) / rect.height) * 100 });
      moved = true;
      token.style.left = last.x + '%'; token.style.top = last.y + '%';
      const out = Math.hypot(last.x - anchor.x, last.y - anchor.y) > MAX_ANCHOR_RADIUS;
      token.classList.toggle('out', out);
      if (live) { const t = liveText(anchor, last.y, player?.position, out); live.textContent = t.text; live.className = `token-flag kind-live ${t.tone}`; }
    };
    const up = () => {
      token.removeEventListener('pointermove', move); token.removeEventListener('pointerup', up);
      ring.hidden = true; liveBox?.remove(); token.classList.remove('dragging');
      if (moved && last) { token.dataset.dragged = '1'; onMove(slot, { x: Math.round(last.x * 10) / 10, y: Math.round(last.y * 10) / 10 }); }
    };
    token.addEventListener('pointermove', move); token.addEventListener('pointerup', up);
  });
}
