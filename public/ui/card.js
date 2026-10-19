// Spillerkort: offentlige data for alle, evner og mod-kunnen kun for eget hold, VAR-profilen
// for ingen. Scouting-indtryk og private noter vises for alle spillere.
import { h, LOCK } from './dom.js';
import { LINE, SKILL_LABELS, kr, starsEl } from './labels.js';
import { aerialBreakdown } from '../engine/generator.js';
import { COUNTER_KEYS, COUNTER_LABELS } from '../engine/counter.js';

const dk = (v) => v.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bar = (label, v, max = 20) => h('div', { class: 'bar' }, h('span', { class: 'bar-label' }, label),
  h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${Math.round((v / max) * 100)}%` } })), h('span', { class: 'bar-val' }, String(v)));

export function renderCard({ player: p, team, isOwn, opponent, scouting, note, onNote }) {
  if (!p) return h('div', { class: 'panel muted' }, 'Klik på en spiller for at se spillerkortet.');
  const head = h('div', { class: 'card-head' },
    h('h3', {}, `#${p.shirtNumber} ${p.name}`),
    h('div', { class: 'muted' }, `${team.name} • ${LINE[p.line]} • ${p.age} år • ${p.heightCm} cm • ${p.injuryMatchesLeft > 0 ? `🚑 skadet i ${p.injuryMatchesLeft} kamp(e)` : `Friskhed ${p.freshness}%`}`));

  let body;
  if (isOwn) {
    const a = aerialBreakdown(p.heightCm, p.jumpingPower, p.skills.strength, p.skills.positioning);
    body = [
      h('div', { class: 'bars' }, SKILL_LABELS.map(([group, list]) => h('div', { class: 'bar-group' }, h('h4', {}, group), list.map(([k, l]) => bar(l, p.skills[k]))))),
      h('div', { class: 'aerial', id: 'aerial-breakdown' },
        h('h4', {}, `✈ Luftduel: ${a.total}/20`),
        h('div', { class: 'muted' }, `Højde-score ${a.heightScore} (${p.heightCm} cm) × 0,35 = ${dk(a.wHeight)} · Spring ${p.jumpingPower} × 0,35 = ${dk(a.wJump)} · Styrke ${p.skills.strength} × 0,15 = ${dk(a.wStr)} · Position ${p.skills.positioning} × 0,15 = ${dk(a.wPos)} → ${dk(a.exact)}`)),
      h('div', { class: 'bar-group' }, h('h4', {}, '🧠 Mod-kunnen (erfaring mod modstanderes stilarter)'), COUNTER_KEYS.map((k) => bar(COUNTER_LABELS[k], p.counterTactics[k], 100))),
      p.archetype ? h('div', { class: 'archbox' }, h('strong', {}, (p.archetype.isUnlocked ? '🌟 ' : '🔒 ') + p.archetype.name), ' – ', p.archetype.description,
        p.archetype.isUnlocked ? null : h('div', { class: 'muted' }, 'Låses op ved: ' + Object.entries(p.archetype.unlockReq).map(([k, v]) => `${k} ${v}`).join(', '))) : null,
      h('div', { class: 'muted' }, `Løn ${kr(p.weeklyWage)}/uge · Værdi ${kr(p.marketValue)}`),
    ];
  } else {
    body = [h('div', { class: 'lockbox' }, `Evner, spring, luftduel, arketype og kontrakt: ${LOCK}`), h('div', {}, 'Offentlig vurdering: ', starsEl(p.publicStars))];
  }

  return h('div', { class: 'panel card', id: 'player-card' }, head, body,
    h('div', { class: 'varbox' }, h('strong', {}, 'VAR-profil: '), 'Kynisme ?? · Teater ?? · VAR-Puls ?? – afsløres gennem kampe'),
    h('div', { class: 'scouting' }, h('h4', {}, '🕵️ Scouting-indtryk'), (scouting?.length ? scouting.slice(0, 8) : ['Ingen indtryk endnu.']).map((s) => h('div', { class: 'clue' }, s))),
    h('label', { class: 'notes' }, h('h4', {}, '📝 Dine private noter'),
      h('textarea', { id: 'note-input', rows: 3, placeholder: 'Skriv hvad du har bemærket …', value: note || '', oninput: (e) => onNote(e.target.value) })));
}
