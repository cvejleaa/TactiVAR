// Spillerkort: offentlige data for alle, evner og mod-kunnen kun for eget hold, VAR-profilen
// for ingen. Scouting-indtryk og private noter vises for alle spillere.
import { publicValue, LOG, stampText, KEY_SKILLS, trainingEstimate, FOCUS, focusSkills, validFocus, ageTrain, roomOf, MATCH_XP, PLAYED_RELIEF, TRAIN_FRESH_FLOOR } from '../engine/career.js';
import { viewPlayer } from '../engine/visibility.js';
import { h, dec, LOCK, select } from './dom.js';
import { LINE, POSITION_FULL, SKILL_LABELS, kr, starsEl } from './labels.js';
import { aerialBreakdown } from '../engine/generator.js';
import { runStats } from '../engine/stats.js';
import { COUNTER_KEYS, COUNTER_LABELS, COUNTER_POOL } from '../engine/counter.js';

const dk = (v) => v.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bar = (label, v, max = 20) => h('div', { class: 'bar' }, h('span', { class: 'bar-label' }, label),
  h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${Math.round((v / max) * 100)}%` } })), h('span', { class: 'bar-val' }, String(v)));

export function renderCard({ player: p, team, isOwn, scouting, note, onNote, teams = null, latest = null, onOpenMatch = null, onFocus = null, retiring = false, market = null, hideLog = null, season = null, starter = false, trainNote = false }) {
  if (!p) return h('div', { class: 'panel muted' }, 'Klik på en spiller for at se spillerkortet.');
  const head = h('div', { class: 'card-head' },
    h('h3', {}, `#${p.shirtNumber} ${p.name}`),
    retiring ? h('div', { class: 'notice', id: 'card-retiring' }, `👋 ${p.shortName} overvejer at stoppe efter sæsonen (${p.age} år).`) : null,
    h('div', { class: 'muted' }, `${team.name} • ${LINE[p.line]}${POSITION_FULL[p.position] ? ` • ${POSITION_FULL[p.position]}` : ''} • ${p.age} år • ${p.heightCm} cm • ${p.injuryMatchesLeft > 0 ? `🚑 skadet i ${p.injuryMatchesLeft} kamp${p.injuryMatchesLeft === 1 ? '' : 'e'}` : `Friskhed ${p.freshness}%`}`));

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
      onFocus ? renderTraining(p, onFocus, starter) : trainNote ? h('div', { class: 'muted', id: 'card-train-note' }, `🏋️ Træner: ${FOCUS[trainingEstimate(p).key].label} – ændr i Trup`) : null,
      h('div', { class: 'muted', id: 'card-wage' }, `Løn ${kr(Math.round(p.weeklyWage / 3))} pr. runde · Værdi ${kr(publicValue(p))} (offentlig – ud fra stjerner og alder)`),
    ];
  } else {
    body = [h('div', { class: 'lockbox' }, `Evner, spring, luftduel, arketype og kontrakt: ${LOCK}`), h('div', {}, 'Offentlig vurdering: ', starsEl(p.publicStars))];
  }

  return h('div', { class: 'panel card', id: 'player-card' }, head, body,
    h('div', { class: 'varbox' }, h('strong', {}, 'VAR-profil: '), 'Kynisme ?? · Teater ?? · VAR-Puls ?? – tallene er skjulte; spillerens VAR-kendelser og scouting-indtrykkene herunder giver fingerpeg'),
    market ? renderMarketBox(p, market) : null,
    teams ? renderMatchLog(p, isOwn, teams, latest, onOpenMatch, hideLog, season) : null,
    h('div', { class: 'scouting' }, h('h4', {}, '🕵️ Scouting-indtryk'), (scouting?.length ? scouting.slice(0, 8) : ['Ingen indtryk endnu.']).map((s) => h('div', { class: 'clue' }, s))),
    h('label', { class: 'notes' }, h('h4', {}, '📝 Dine private noter'),
      h('textarea', { id: 'note-input', rows: 3, placeholder: 'Skriv hvad du har bemærket …', value: note || '', oninput: (e) => onNote(e.target.value) })));
}

// 🏋️ Træning (v3.18.0): fokus, hvad det træner, fremdrift pr. evne og ejerens skøn i ord (tallet – potentialet – er skjult)
export const SKILL_NAME = Object.fromEntries(SKILL_LABELS.flatMap(([, list]) => list));
export const roomWords = (room) => (room >= 0.6 ? 'har meget mere i sig' : room >= 0.3 ? 'har mere i sig' : 'er tæt på sit loft');
// Næste +1 i ord – samme tekst på kortet og i træningsoversigten
export const nextText = (n, why) => (!n || n === Infinity ? '' : n > 14 ? `går langsomt (mere end en sæson: ${why})` : `næste +1 om ca. ${n} runde${n === 1 ? '' : 'r'}`);
export const priceText = (e) => (e.fresh > 0 ? `+${e.fresh} friskhed pr. runde` : `${e.fresh} friskhed pr. runde (${e.playedFresh} når han har spillet; ikke under ${TRAIN_FRESH_FLOOR} %) · lille skaderisiko`);
function renderTraining(p, onFocus, starter = false) {
  const e = trainingEstimate(p, starter), key = e.key, price = priceText(e);
  const lines = e.lines.map(({ skill: s, dev: d, top, n }) => {
    if (top) return h('div', { class: 'train-line' }, `${SKILL_NAME[s]} 20 – helt i top`);
    return h('div', { class: 'train-line' }, h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${Math.round(d * 100)}%` } })),
      ` ${SKILL_NAME[s]} ${dec(d, 1)}/1,0${n ? ` – ${nextText(n, e.why)}` : ''}`);
  });
  return h('div', { class: 'trainbox', id: 'card-training' },
    h('h4', {}, '🏋️ Træning'),
    select(key, Object.entries(FOCUS).filter(([k]) => validFocus(p, k)).map(([k, x]) => [k, x.label]), onFocus, { id: 'focus-select' }),
    h('span', { class: 'muted' }, ` ${price}`),
    lines,
    h('div', { class: 'muted', id: 'train-estimate' }, `Skøn: ${p.shortName} ${roomWords(roomOf(p))} · ${p.age} år – jo yngre, jo hurtigere. Kampe giver også lidt (${dec(MATCH_XP, 2)} pr. 90 min i kædens nøgle-evner).`));
}

// 💰 Marked på kortet: en bots spiller har en fast, synlig pris; din egen kan sættes til salg (QC: fast pris, ingen forhandling)
function renderMarketBox(p, m) {
  if (m.own) return h('div', { class: 'marketbox', id: 'card-market' }, h('h4', {}, '💰 Marked'),
    h('label', {}, h('input', { type: 'checkbox', id: 'list-toggle', checked: m.listed, onchange: (e) => m.onList(e.target.checked) }), ' Til salg – de andre klubber byder, når transfervinduet er åbent (se 💼 Klub)'));
  return h('div', { class: 'marketbox', id: 'card-market' }, h('h4', {}, '💰 Marked'),
    h('div', {}, `Pris: ${kr(m.price)} (offentlig værdi ${kr(publicValue(p))}${m.starter ? ' · starter: +60 %' : ' · +30 %'})`),
    h('div', { class: 'muted', id: 'buy-terms' }, `Hans løn hos dig: ${kr(m.wage)} pr. runde · du har ${kr(Math.max(0, m.room))} pr. runde til løn (budgettet – efter et salg din løn før salget) · kassen efter købet: ${kr(m.cashAfter)}`),
    m.reason ? h('div', { class: 'muted', id: 'buy-reason' }, m.reason) : h('button', { id: 'buy-player', onclick: m.onBuy }, `💰 Køb for ${kr(m.price)}`));
}

// Rundens opsamling i Trup (Spilfører): "M. Jensen +1 Afslutning" og træningsskader – kun dit hold (rapporten findes kun for det)
// roundLabel: sæsonens runde (report.round er ligaens løbende runde – "runde 15" i sæson 2)
export function trainingSummary(report, team, roundLabel = report?.round) {
  if (!report || !(report.gains.length || report.injuries.length)) return null;
  const name = (id) => team.squad.find((p) => p.id === id)?.shortName ?? '?';
  const by = new Map();
  const known = new Set(team.squad.map((p) => p.id));   // solgte/stoppede spillere står ikke som "?" (QC K2)
  for (const g of report.gains.filter((x) => known.has(x.id))) { const k = `${g.id}|${g.skill}`; by.set(k, (by.get(k) ?? 0) + 1); }
  const ups = [...by].map(([k, n]) => { const [id, s] = k.split('|'); return `${name(id)} +${n} ${SKILL_NAME[s]}`; });
  const inj = report.injuries.filter((id) => known.has(id)).map((id) => `🚑 ${name(id)} skadet i træningen`);
  if (!ups.length && !inj.length) return null;
  return h('div', { class: 'panel train-summary', id: 'training-summary' }, h('strong', {}, `🏋️ Træning og kampe efter runde ${roundLabel}: `), [...ups, ...inj].join(' · '));
}

// 📜 Kampe (v3.18.0, spec §10.4): de seneste 10 stempler, "Vis alle" og en karrierelinje. Andre hold ser stjerner, ikke karakteren
// (viewPlayer). Kun seneste rundes kamp linker til referatet – og netop den kamp (QC).
// hideLog = [sæson, runde]: runden, der afspilles lige nu, står ikke (QC: resultat, mål og karakter ville afsløre den)
function renderMatchLog(p, isOwn, teams, latest, onOpenMatch, hideLog = null, season = null) {
  const all = viewPlayer(p, isOwn).matchLog ?? [];
  const log = hideLog ? all.filter((e) => !(e[LOG.S] === hideLog[0] && e[LOG.R] === hideLog[1])) : all;
  const games = (p.careerGames ?? 0) - (all.length - log.length);
  const goals = log.reduce((a, e) => a + (e[LOG.G] || 0), 0), assists = log.reduce((a, e) => a + (e[LOG.AS] || 0), 0);
  const row = (e) => {
    const isLatest = latest && onOpenMatch && e === log.at(-1) && latest.includes([e[LOG.H], e[LOG.A], e[LOG.HG], e[LOG.AG]].join('|'));
    const extra = [e[LOG.G] ? `⚽${e[LOG.G] > 1 ? e[LOG.G] : ''}` : '', e[LOG.AS] ? `🅰${e[LOG.AS] > 1 ? e[LOG.AS] : ''}` : ''].filter(Boolean).join(' ');
    return h('div', { class: 'log-row' }, stampText(e, teams, isOwn, season ?? e[LOG.S]), extra ? ` ${extra}` : '',
      isLatest ? h('button', { class: 'linklike log-open', title: 'Åbn referatet af kampen', onclick: () => onOpenMatch(e[LOG.H], e[LOG.A]) }, ' 📺') : null);
  };
  const recent = log.slice(-10).reverse(), older = log.slice(0, -10).reverse();
  return h('div', { class: 'matchlog', id: 'match-log' }, h('h4', {}, '📜 Kampe'),
    h('div', { class: 'muted', id: 'career-line' }, `${games} ${games === 1 ? 'kamp' : 'kampe'} i karrieren${log.length ? ` · ${goals} mål og ${assists} oplæg i de seneste ${log.length}` : ''}`),
    recent.length ? recent.map(row) : h('div', { class: 'muted' }, 'Ingen kampe endnu.'),
    older.length ? h('details', {}, h('summary', {}, `Vis alle (${log.length})`), older.map(row)) : null);
}
