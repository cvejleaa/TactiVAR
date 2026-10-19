// Taktiktavlen: "Rolle-anker & frit træk" (docs/spec.md §4). Målmanden og modstanderens
// brikker kan ikke trækkes; uden for ankerradius 28 vises "⚠ Ude af zone (-20%)".
import { h } from './dom.js';
import { FORMATIONS, MAX_ANCHOR_RADIUS, slotPosition, isOutOfZone, clampPos } from '../engine/formations.js';

export function renderPitch({ team, isOwn, ui, onMove, onSelect }) {
  const coords = FORMATIONS[team.tactics.baseFormation];
  const byId = new Map(team.squad.map((p) => [p.id, p]));
  const pitch = h('div', { class: 'pitch', id: 'pitch' }, h('div', { class: 'pitch-line mid' }), h('div', { class: 'pitch-box top' }), h('div', { class: 'pitch-box bottom' }));
  const anchorRing = h('div', { class: 'anchor-ring', hidden: true });
  pitch.append(anchorRing);

  team.tactics.lineupSlots.forEach((pid, slot) => {
    const p = byId.get(pid);
    const pos = slotPosition(team.tactics, slot);
    const out = isOutOfZone(team.tactics, slot);
    const custom = !!team.tactics.customCoords?.[slot];
    const token = h('div', {
      class: `token${out ? ' out' : custom ? ' custom' : ''}${ui.selectedPlayerId === pid ? ' selected' : ''}${p?.injuryMatchesLeft > 0 ? ' injured' : ''}`,
      style: { left: pos.x + '%', top: pos.y + '%' }, dataset: { slot: String(slot) }, title: `${coords[slot].r} – ${p ? p.name : '?'}`,
    }, h('span', { class: 'token-num' }, p ? String(p.shirtNumber) : '?'), h('span', { class: 'token-name' }, p ? p.shortName : '?'),
      out ? h('span', { class: 'token-flag' }, '⚠ Ude af zone (-20%)') : custom ? h('span', { class: 'token-flag ok' }, '✅ Custom pos') : null);
    token.addEventListener('click', () => p && onSelect(p));
    if (isOwn && slot > 0) attachDrag(token, pitch, anchorRing, coords[slot], slot, onMove);
    pitch.append(token);
  });
  return pitch;
}

function attachDrag(token, pitch, ring, anchor, slot, onMove) {
  token.classList.add('draggable');
  token.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    token.setPointerCapture(e.pointerId);
    const rect = pitch.getBoundingClientRect();
    let moved = false, last = null;
    Object.assign(ring.style, { left: anchor.x + '%', top: anchor.y + '%', width: MAX_ANCHOR_RADIUS * 2 + '%', height: (MAX_ANCHOR_RADIUS * 2 * rect.width) / rect.height + '%' });
    ring.hidden = false;
    const move = (ev) => {
      last = clampPos({ x: ((ev.clientX - rect.left) / rect.width) * 100, y: ((ev.clientY - rect.top) / rect.height) * 100 });
      moved = true;
      token.style.left = last.x + '%'; token.style.top = last.y + '%';
      token.classList.toggle('out', Math.hypot(last.x - anchor.x, last.y - anchor.y) > MAX_ANCHOR_RADIUS);
    };
    const up = () => {
      token.removeEventListener('pointermove', move); token.removeEventListener('pointerup', up);
      ring.hidden = true;
      if (moved && last) onMove(slot, { x: Math.round(last.x * 10) / 10, y: Math.round(last.y * 10) / 10 });
    };
    token.addEventListener('pointermove', move); token.addEventListener('pointerup', up);
  });
}
