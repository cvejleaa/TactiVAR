// Spillerkort: offentlige data for alle, evner og mod-kunnen kun for eget hold, VAR-profilen
// for ingen. Scouting-indtryk og private noter vises for alle spillere.
import { publicValue, LOG, stampText } from '../engine/career.js';
import { viewPlayer } from '../engine/visibility.js';
import { h, dec, LOCK } from './dom.js';
import { LINE, POSITION_FULL, SKILL_LABELS, kr, starsEl } from './labels.js';
import { aerialBreakdown } from '../engine/generator.js';
import { runStats } from '../engine/stats.js';
import { COUNTER_KEYS, COUNTER_LABELS, COUNTER_POOL } from '../engine/counter.js';

const dk = (v) => v.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bar = (label, v, max = 20) => h('div', { class: 'bar' }, h('span', { class: 'bar-label' }, label),
  h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${Math.round((v / max) * 100)}%` } })), h('span', { class: 'bar-val' }, String(v)));

export function renderCard({ player: p, team, isOwn, scouting, note, onNote, teams = null, latest = null, onOpenMatch = null }) {
  if (!p) return h('div', { class: 'panel muted' }, 'Klik på en spiller for at se spillerkortet.');
  const head = h('div', { class: 'card-head' },
    h('h3', {}, `#${p.shirtNumber} ${p.name}`),
    h('div', { class: 'muted' }, `${team.name} • ${LINE[p.line]}${POSITION_FULL[p.position] ? ` • ${POSITION_FULL[p.position]}` : ''} • ${p.age} år • ${p.heightCm} cm • ${p.injuryMatchesLeft > 0 ? `🚑 skadet i ${p.injuryMatchesLeft} kamp(e)` : `Friskhed ${p.freshness}%`}`));

  let body;
  if (isOwn) {
    const a = aerialBreakdown(p.heightCm, p.jumpingPower, p.skills.strength, p.skills.positioning);
    const run = runStats(p);
    body = [
      h('div', { class: 'bars' }, SKILL_LABELS.map(([group, list]) => h('div', { class: 'bar-group' }, h('h4', {}, group), list.map(([k, l]) => bar(l, p.skills[k]))))),
      h('div', { class: 'aerial', id: 'aerial-breakdown' },
        h('h4', {}, `✈ Luftduel: ${a.total}/20`),
        h('div', { class: 'muted' }, `Højde-score ${a.heightScore} (${p.heightCm} cm) × 0,35 = ${dk(a.wHeight)} · Spring ${p.jumpingPower} × 0,35 = ${dk(a.wJump)} · Styrke ${p.skills.strength} × 0,15 = ${dk(a.wStr)} · Position ${p.skills.positioning} × 0,15 = ${dk(a.wPos)} → ${dk(a.exact)}`)),
      h('div', { class: 'bar-group', id: 'counter-pool' }, h('h4', {}, '🧠 Mod-kunnen (erfaring mod modstanderes stilarter)'), COUNTER_KEYS.map((k) => bar(COUNTER_LABELS[k], p.counterTactics[k], 100)),
        h('div', { class: 'muted', id: 'counter-used' }, `Erfaring brugt: ${COUNTER_KEYS.reduce((a, k) => a + p.counterTactics[k], 0)}/${COUNTER_POOL} – ved fuld pulje glemmer han lidt af det gamle, når han lærer noget nyt.`)),
      p.archetype ? h('div', { class: 'archbox' }, h('strong', {}, (p.archetype.isUnlocked ? '🌟 ' : '🔒 ') + p.archetype.name), ' – ', p.archetype.description,
        p.archetype.isUnlocked ? null : h('div', { class: 'muted' }, 'Låses op ved: ' + Object.entries(p.archetype.unlockReq).map(([k, v]) => `${k} ${v}`).join(', '))) : null,
      h('div', { class: 'muted', id: 'run-stats' }, run.km90 != null ? `🏃 ${dec(run.km90, 1)} km pr. 90 min · ${run.hiPct != null ? `${run.hiPct} % højintenst` : 'højintenst: kommer efter næste kamp'} · topfart ${dec(p.topSpeedMax, 1)} km/t (alle kampe)` : '🏃 Løbedata kommer efter første kamp'),
      h('div', { class: 'muted', id: 'card-wage' }, `Løn ${kr(p.weeklyWage)}/uge · Værdi ${kr(publicValue(p))} (offentlig – ud fra stjerner og alder)`),
    ];
  } else {
    body = [h('div', { class: 'lockbox' }, `Evner, spring, luftduel, arketype og kontrakt: ${LOCK}`), h('div', {}, 'Offentlig vurdering: ', starsEl(p.publicStars))];
  }

  return h('div', { class: 'panel card', id: 'player-card' }, head, body,
    h('div', { class: 'varbox' }, h('strong', {}, 'VAR-profil: '), 'Kynisme ?? · Teater ?? · VAR-Puls ?? – tallene er skjulte; spillerens VAR-kendelser og scouting-indtrykkene herunder giver fingerpeg'),
    teams ? renderMatchLog(p, isOwn, teams, latest, onOpenMatch) : null,
    h('div', { class: 'scouting' }, h('h4', {}, '🕵️ Scouting-indtryk'), (scouting?.length ? scouting.slice(0, 8) : ['Ingen indtryk endnu.']).map((s) => h('div', { class: 'clue' }, s))),
    h('label', { class: 'notes' }, h('h4', {}, '📝 Dine private noter'),
      h('textarea', { id: 'note-input', rows: 3, placeholder: 'Skriv hvad du har bemærket …', value: note || '', oninput: (e) => onNote(e.target.value) })));
}

// 📜 Kampe (v3.18.0, spec §10.4): de seneste 10 stempler, "Vis alle" og en karrierelinje. Andre hold ser stjerner, ikke karakteren
// (viewPlayer). Kun seneste rundes kamp linker til referatet – og netop den kamp (QC).
function renderMatchLog(p, isOwn, teams, latest, onOpenMatch) {
  const log = viewPlayer(p, isOwn).matchLog ?? [];
  const goals = log.reduce((a, e) => a + (e[LOG.G] || 0), 0), assists = log.reduce((a, e) => a + (e[LOG.AS] || 0), 0);
  const row = (e) => {
    const isLatest = latest && onOpenMatch && e === log.at(-1) && latest.includes([e[LOG.H], e[LOG.A], e[LOG.HG], e[LOG.AG]].join('|'));
    const extra = [e[LOG.G] ? `⚽${e[LOG.G] > 1 ? e[LOG.G] : ''}` : '', e[LOG.AS] ? `🅰${e[LOG.AS] > 1 ? e[LOG.AS] : ''}` : ''].filter(Boolean).join(' ');
    return h('div', { class: 'log-row' }, stampText(e, teams, isOwn), extra ? ` ${extra}` : '',
      isLatest ? h('button', { class: 'linklike log-open', title: 'Åbn referatet af kampen', onclick: () => onOpenMatch(e[LOG.H], e[LOG.A]) }, ' 📺') : null);
  };
  const recent = log.slice(-10).reverse(), older = log.slice(0, -10).reverse();
  return h('div', { class: 'matchlog', id: 'match-log' }, h('h4', {}, '📜 Kampe'),
    h('div', { class: 'muted', id: 'career-line' }, `${p.careerGames ?? 0} ${(p.careerGames ?? 0) === 1 ? 'kamp' : 'kampe'} i karrieren${log.length ? ` · ${goals} mål og ${assists} oplæg i de seneste ${log.length}` : ''}`),
    recent.length ? recent.map(row) : h('div', { class: 'muted' }, 'Ingen kampe endnu.'),
    older.length ? h('details', {}, h('summary', {}, `Vis alle (${log.length})`), older.map(row)) : null);
}
