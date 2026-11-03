// Spillerkort: offentlige data for alle, evner og mod-kunnen kun for eget hold, VAR-profilen
// for ingen. Observationer (scouting) og private noter vises for alle spillere.
import { publicValue, LOG, stampText, KEY_SKILLS, trainingEstimate, FOCUS, focusSkills, ageTrain, roomPoints, MATCH_XP, PLAYED_RELIEF, TRAIN_FRESH_FLOOR } from '../engine/career.js';
import { viewPlayer } from '../engine/visibility.js';
import { h, dec, LOCK } from './dom.js';
import { LINE, POSITION_FULL, SKILL_LABELS, kr, starsEl, banText, yellowWarn, archetypeOf, archIcon, archReqText } from './labels.js';
import { aerialBreakdown } from '../engine/generator.js';
import { runStats } from '../engine/stats.js';
import { WINDOW_ROUNDS } from '../engine/transfers.js';
import { BAND_WORD } from '../engine/chemistry.js';
import { COUNTER_KEYS, COUNTER_LABELS, COUNTER_POOL } from '../engine/counter.js';

const dk = (v) => v.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bar = (label, v, max = 20) => h('div', { class: 'bar' }, h('span', { class: 'bar-label' }, label),
  h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${Math.round((v / max) * 100)}%` } })), h('span', { class: 'bar-val' }, String(v)));

// chem (v3.24.0, kun dit hold): { best, pairs, isNew } fra chemistry.js – samspillet med hans naboer i ord (intet 0–100-tal, QC)
// onTrainLink (v3.30.0): "ændr i Træning ›" i træningsblokken åbner 🏋️ Træning med spillerens række markeret. Kortet sætter ALDRIG
// fokus selv (brugeren: træningen sættes ét sted – nu Træning-fanen); det viser fokus, fremdriften og skønnet, ens på Trup og Taktik
// lastSeason (v3.31.2) = league.lastSeasonStats – 👑/🟨/🟥 for sidste sæson i 📊 Statistik
export function renderCard({ player: p, team, isOwn, scouting, note, onNote, teams = null, latest = null, onOpenMatch = null, retiring = false, market = null, hideLog = null, season = null, starter = false, chem = null, onTrainLink = null, lastSeason = null }) {
  if (!p) return h('div', { class: 'panel muted' }, 'Klik på en spiller for at se spillerkortet.');
  const head = h('div', { class: 'card-head' },
    h('h3', {}, `#${p.shirtNumber} ${p.name}`),
    retiring ? h('div', { class: 'notice', id: 'card-retiring' }, `👋 ${p.shortName} overvejer at stoppe efter sæsonen (${p.age} år).`) : null,
    h('div', { class: 'muted' }, `${team.name} • ${LINE[p.line]}${POSITION_FULL[p.position] ? ` • ${POSITION_FULL[p.position]}` : ''} • ${p.age} år • ${p.heightCm} cm • ${p.injuryMatchesLeft > 0 ? `🚑 skadet i ${p.injuryMatchesLeft} kamp${p.injuryMatchesLeft === 1 ? '' : 'e'}` : `Friskhed ${p.freshness} %`}`),
    // v3.27.0: udelukkelsen (offentlig) og advarslen før det tællende gule kort
    banText(p) ? h('div', { class: 'notice ban', id: 'card-ban' }, banText(p)) : null,
    yellowWarn(p) ? h('div', { class: 'muted', id: 'card-yellow' }, yellowWarn(p)) : null);

  let body;
  if (isOwn) {
    const a = aerialBreakdown(p.heightCm, p.jumpingPower, p.skills.strength, p.skills.positioning);
    const run = runStats(p), arch = archetypeOf(p.archetype);
    body = [
      h('div', { class: 'bars' }, SKILL_LABELS.map(([group, list]) => h('div', { class: 'bar-group' }, h('h4', {}, group), list.map(([k, l]) => bar(l, p.skills[k]))))),
      h('div', { class: 'aerial', id: 'aerial-breakdown' },
        h('h4', {}, `✈ Luftduel: ${a.total}/20`),
        h('div', { class: 'muted' }, `Højde-score ${a.heightScore} (${p.heightCm} cm) × 0,35 = ${dk(a.wHeight)} · Spring ${p.jumpingPower} × 0,35 = ${dk(a.wJump)} · Styrke ${p.skills.strength} × 0,15 = ${dk(a.wStr)} · Position ${p.skills.positioning} × 0,15 = ${dk(a.wPos)} → ${dk(a.exact)}`)),
      h('div', { class: 'bar-group', id: 'counter-pool' }, h('h4', {}, '🧠 Erfaring mod stilarter'), COUNTER_KEYS.map((k) => bar(COUNTER_LABELS[k], p.counterTactics[k], 100)),
        h('div', { class: 'muted', id: 'counter-used' }, `Erfaring brugt: ${COUNTER_KEYS.reduce((a, k) => a + p.counterTactics[k], 0)}/${COUNTER_POOL} – ved fuld pulje glemmer han lidt af det gamle, når han lærer noget nyt.`)),
      // Arketypen (v3.31.1; v3.31.2 "arketype" – brugerens ord): navn og beskrivelse fra tabellen efter id, kravene med evnernes danske navne
      arch ? h('div', { class: 'archbox', id: 'card-arch' }, h('strong', {}, `${archIcon(arch)} ${arch.name}`), ' – ', arch.description,
        arch.isUnlocked ? null : h('div', { class: 'muted', id: 'card-arch-req' }, archReqText(arch))) : null,
      h('div', { class: 'muted', id: 'run-stats' }, run.km90 != null ? `🏃 ${dec(run.km90, 1)} km pr. 90 min · ${run.hiPct != null ? `${run.hiPct} % højintenst` : 'højintenst: kommer efter næste kamp'} · topfart ${dec(p.topSpeedMax, 1)} km/t (alle kampe)` : '🏃 Løbedata kommer efter første kamp'),
      renderTraining(p, starter, onTrainLink),
      h('div', { class: 'muted', id: 'card-wage' }, `Løn ${kr(Math.round(p.weeklyWage / 3))} pr. runde · Værdi ${kr(publicValue(p))} (offentlig – ud fra stjerner og alder)`),
      chem ? renderChem(chem) : null,
    ];
  } else {
    body = [h('div', { class: 'lockbox' }, `Evner, spring, luftduel, arketype og kontrakt: ${LOCK}`), h('div', {}, 'Offentlig vurdering: ', starsEl(p.publicStars))];
  }

  // 📊 Statistik (v3.31.2) lige efter hovedet – brugeren leder "i sidebjælken", og 📜 Kampe ligger langt nede
  const stats = teams ? renderCardStats(cardStats(p, { isOwn, teamIdx: teams.indexOf(team), teamId: team.id, season, hideLog, lastSeason }), team) : null;
  return h('div', { class: 'panel card', id: 'player-card' }, head, stats, body,
    h('div', { class: 'varbox' }, h('strong', {}, 'VAR-profil: '), 'Kynisme ?? · Teater ?? · VAR-puls ?? – tallene er skjulte; spillerens VAR-kendelser og observationerne herunder giver fingerpeg'),
    market ? renderMarketBox(p, market) : null,
    teams ? renderMatchLog(p, isOwn, teams, latest, onOpenMatch, hideLog, season) : null,
    h('div', { class: 'scouting' }, h('h4', {}, '🕵️ Observationer'), (scouting?.length ? scouting.slice(0, 8) : ['Ingen indtryk endnu.']).map((s) => h('div', { class: 'clue' }, s))),
    h('label', { class: 'notes' }, h('h4', {}, '📝 Dine private noter'),
      h('textarea', { id: 'note-input', rows: 3, placeholder: 'Skriv hvad du har bemærket …', value: note || '', oninput: (e) => onNote(e.target.value) })));
}

// Kortpanelet (v3.29.0, UI-ombygningen F2): ét panel uden for siden – hoved med ◀ ▶ (bladrer i listens rækkefølge, bytter aldrig),
// navnet og ✕; under det byt-beskeden og kvitteringen (køb) og så kortet. Kortets egen h3 skjules i panelet (CSS) og navngiver dialogen.
// card = renderCard(...) eller null (kun kvitteringen: spilleren er købt og står ikke længere i holdet)
// nav = false: kvitteringen uden spiller – ingen ◀ ▶, der ikke gør noget (Spilfører UI v3.29.0)
export function renderCardPanel({ card, title, onClose, nav = true, onPrev = null, onNext = null, pickMsg = '', msg = '' }) {
  const h3 = card?.querySelector?.('.card-head h3');
  if (h3) h3.id = 'card-title';
  return [
    h('div', { class: 'cp-head' },
      nav ? h('button', { class: 'cp-nav', id: 'card-prev', type: 'button', title: 'Forrige spiller i listen', 'aria-label': 'Forrige spiller', disabled: !onPrev, onclick: () => onPrev?.() }, '◀') : null,
      nav ? h('button', { class: 'cp-nav', id: 'card-next', type: 'button', title: 'Næste spiller i listen', 'aria-label': 'Næste spiller', disabled: !onNext, onclick: () => onNext?.() }, '▶') : null,
      h('strong', { class: 'cp-title', id: 'cp-title' }, title),
      h('button', { class: 'cp-close', id: 'card-close', type: 'button', title: 'Luk spillerkortet (Esc)', 'aria-label': 'Luk spillerkortet', onclick: onClose }, '✕')),
    pickMsg ? h('div', { class: 'notice cp-msg', id: 'panel-pick-msg' }, pickMsg, h('span', { class: 'cp-close-hint' }, ' – luk kortet (✕) for at vælge')) : null,
    msg ? h('div', { class: 'notice cp-msg', id: 'panel-notice' }, msg) : null,
    card,
  ];
}

// 🏋️ Træning (v3.18.0): fokus, hvad det træner, fremdrift pr. evne og ejerens skøn i ord (tallet – potentialet – er skjult)
export const SKILL_NAME = Object.fromEntries(SKILL_LABELS.flatMap(([, list]) => list));
// Skønnet i ord (v3.31.2, brugeren 3/11: "endnu ikke set en ungdomsspiller der ikke har betegnelsen 'har meget mere i sig'"): efter
// pladsen i evne-POINT (career.js roomPoints = potentiale − nøglesnit), fem trin. Før: roomOf (0,1–1) med 0,6/0,3 – ungdommen
// (snit + 4 ± 2,5) lå med ≈ 91 % i "meget mere" (tools/measure-youth-words.mjs). 0,45 = trainingEstimate's "tæt på sit loft"
// (roomOf ≤ 0,15). Topordet er relativt og lover ikke et niveau (Spilfører klub: 4,5 point over snit 7 er kun startniveau).
export const ROOM_WORDS = [[0.45, 'er tæt på sit loft'], [1.5, 'har lidt mere i sig'], [3, 'har mere i sig'], [5.5, 'har meget mere i sig'], [Infinity, 'har langt mere i sig']];
export const roomWords = (points) => ROOM_WORDS.find(([lim]) => points < lim)[1];
// QC v3.31.2: rækkefølgen skal kunne læses – "meget mere" og "langt mere" ligner hinanden, så skalaen står synligt på Træning
export const ROOM_SCALE = `Skøn fra lavest til højest: ${ROOM_WORDS.map(([, w]) => w.replace(/^(er|har) /, '')).join(' → ')}`;
// Næste +1 i ord – samme tekst på kortet og i træningsoversigten
export const nextText = (n, why) => (!n || n === Infinity ? '' : n > 14 ? `går langsomt (mere end en sæson: ${why})` : `næste +1 om ca. ${n} runde${n === 1 ? '' : 'r'}`);
export const priceText = (e) => (e.fresh > 0 ? `+${e.fresh} friskhed pr. runde` : `${e.fresh} friskhed pr. runde (${e.playedFresh} når han har spillet; ikke under ${TRAIN_FRESH_FLOOR} %) · lille skaderisiko`);
function renderTraining(p, starter = false, onTrainLink = null) {
  const e = trainingEstimate(p, starter), key = e.key, price = priceText(e);
  const lines = e.lines.map(({ skill: s, dev: d, top, n }) => {
    if (top) return h('div', { class: 'train-line' }, `${SKILL_NAME[s]} 20 – helt i top`);
    return h('div', { class: 'train-line' }, h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${Math.round(d * 100)}%` } })),
      ` ${SKILL_NAME[s]} ${dec(d, 1)}/1,0${n ? ` – ${nextText(n, e.why)}` : ''}`);
  });
  return h('div', { class: 'trainbox', id: 'card-training' },
    h('h4', {}, '🏋️ Træning'),
    h('div', { id: 'card-train-note' }, `Træner: ${FOCUS[key].label} – `,
      onTrainLink ? h('button', { class: 'linklike', id: 'card-train-link', onclick: onTrainLink }, 'ændr i Træning ›') : 'ændr i Træning',
      h('span', { class: 'muted' }, ` · ${price}`)),
    lines,
    h('div', { class: 'muted', id: 'train-estimate' }, `Skøn: ${p.shortName} ${roomWords(roomPoints(p))} · ${p.age} år – jo yngre, jo hurtigere. Kampe giver også lidt (${dec(MATCH_XP, 2)} pr. 90 min i kædens nøgle-evner).`));
}

// 🤝 Samspil (v3.24.0): bedste makker kun ved "stærkt" (QC); hans par med de naboer, han står ved lige nu (bænk: ingen)
function renderChem({ best, pairs, isNew }) {
  return h('div', { id: 'card-chem' },
    h('div', { id: 'card-best' }, isNew ? '🤝 Fremmed for alle i truppen – indtil han spiller kampe ved siden af de samme'
      : best ? `🤝 Bedste makker: #${best.mate.shirtNumber} ${best.mate.shortName} (samspil: stærkt)` : '🤝 Ingen særlig makker endnu'),
    pairs.length ? h('div', { class: 'muted', id: 'card-pairs' }, 'Samspil med naboerne nu: ' + pairs.map((x) => `#${x.mate.shirtNumber} ${x.mate.shortName} ${BAND_WORD[x.band]}`).join(' · ')) : null);
}

// 💰 Marked på kortet: en bots spiller har en fast, synlig pris; din egen kan sættes til salg (QC: fast pris, ingen forhandling)
function renderMarketBox(p, m) {
  if (m.own) return h('div', { class: 'marketbox', id: 'card-market' }, h('h4', {}, '💰 Marked'),
    h('label', {}, h('input', { type: 'checkbox', id: 'list-toggle', checked: m.listed, onchange: (e) => m.onList(e.target.checked) }), ' Til salg – de andre klubber byder, når transfervinduet er åbent (se 💼 Klub)'),
    // v3.24.1 (QC): i karantæne – ingen bud, før den slutter; sig hvornår her, ikke kun i Klub
    m.block ? h('div', { class: 'muted', id: 'list-block' }, `🔒 ${m.block}`) : null,
    // Samspil (v3.24.0, QC/Spilfører UI): prisen ved beslutningen – kun stærke par med hans naboer nu, 🤝 (ikke ⚠ – det er ingen afgift)
    m.saleChem ? h('div', { class: 'muted', id: 'list-chem' }, m.saleChem) : null);
  return h('div', { class: 'marketbox', id: 'card-market' }, h('h4', {}, '💰 Marked'),
    h('div', {}, `Pris: ${kr(m.price)} (offentlig værdi ${kr(publicValue(p))}${m.starter ? ' · startspiller: +60 %' : ' · +30 %'})`),
    h('div', { class: 'muted', id: 'buy-terms' }, `Hans løn hos dig: ${kr(m.wage)} pr. runde · du har ${kr(Math.max(0, m.room))} pr. runde til løn (budgettet – efter et salg din løn før salget) · kassen efter købet: ${kr(m.cashAfter)}`),
    m.settle ? h('div', { class: 'muted', id: 'buy-chem' }, `🤝 Ny i truppen: fremmed for alle – ca. ${m.settle} kampe ved siden af de samme, før han har spillet sig ind.`) : null,
    m.reason ? h('div', { class: 'muted', id: 'buy-reason' }, m.reason) : h('button', { id: 'buy-player', onclick: m.onBuy }, `💰 Køb for ${kr(m.price)}`));
}

// Rundens opsamling – øverst på 🏋️ Træning (v3.30.0; før i Trup, Spilfører): "M. Jensen +1 Afslutning" og træningsskader – kun dit hold (rapporten findes kun for det)
// roundLabel: sæsonens runde (report.round er ligaens løbende runde – "runde 15" i sæson 2)
// v3.24.2 (Spilfører UI/QC): øverst de par, der blev stærke i runden (og dem, der holdt op, fordi de ikke spillede sammen) –
// navne ud fra truppen nu (id'er gemt, ikke pladsens navn); fra 4 par kun antallet; link til stregerne på Taktik.
const pairWords = (team, [a, b]) => { const p = team.squad.find((x) => x.id === a), q = team.squad.find((x) => x.id === b); return p && q ? `#${p.shirtNumber} ${p.shortName} og #${q.shirtNumber} ${q.shortName}` : null; };
export function strongLines(team, strong) {
  const up = (strong?.up ?? []).map((x) => pairWords(team, x)).filter(Boolean), down = (strong?.down ?? []).map((x) => pairWords(team, x)).filter(Boolean);
  const lines = [];
  if (up.length === 1) lines.push(`🤝 ${up[0]} spiller nu stærkt sammen.`);
  else if (up.length > 1) lines.push(up.length >= 4 ? `🤝 ${up.length} par spiller nu stærkt sammen.` : `🤝 Spiller nu stærkt sammen: ${up.join(' · ')}.`);
  const downs = down.length === 1 ? `${down[0]} spiller ikke længere stærkt sammen – de spillede ikke sammen i runden.`
    : down.length >= 4 ? `${down.length} par spiller ikke længere stærkt sammen – de spillede ikke sammen i runden.`
    : down.length ? `Spiller ikke længere stærkt sammen (de spillede ikke sammen i runden): ${down.join(' · ')}.` : null;
  return { up: lines, down: downs ? [downs] : [] };
}
export function trainingSummary(report, team, roundLabel = report?.round, onTaktik = null) {
  const sl = report ? strongLines(team, report.strong) : { up: [], down: [] }, strong = [...sl.up, ...sl.down];
  if (!report || !(report.gains.length || report.injuries.length || strong.length)) return null;
  const name = (id) => team.squad.find((p) => p.id === id)?.shortName ?? '?';
  const by = new Map();
  const known = new Set(team.squad.map((p) => p.id));   // solgte/stoppede spillere står ikke som "?" (QC K2)
  for (const g of report.gains.filter((x) => known.has(x.id))) { const k = `${g.id}|${g.skill}`; by.set(k, (by.get(k) ?? 0) + 1); }
  const ups = [...by].map(([k, n]) => { const [id, s] = k.split('|'); return `${name(id)} +${n} ${SKILL_NAME[s]}`; });
  const inj = report.injuries.filter((id) => known.has(id)).map((id) => `🚑 ${name(id)} skadet i træningen`);
  if (!ups.length && !inj.length && !strong.length) return null;
  return h('div', { class: 'panel train-summary', id: 'training-summary' },
    // QC: hver linje for sig; linket hører til op-linjen (stregerne viser de stærke)
    strong.length ? h('div', { id: 'training-strong' },
      sl.up.length ? h('div', { class: 'strong-up' }, sl.up[0], onTaktik ? [' ', h('button', { class: 'linklike', onclick: onTaktik }, 'se stregerne på Taktik')] : null) : null,
      sl.down.length ? h('div', { class: 'muted strong-down' }, sl.down[0]) : null) : null,
    ups.length || inj.length ? h('div', {}, h('strong', {}, `🏋️ Træning og kampe efter runde ${roundLabel}: `), [...ups, ...inj].join(' · ')) : null);
}

// 📊 Statistik for holdet (v3.31.2, brugeren 3/11: "en spillers statistik for holdet opgjort i sidebjælken"). Ren – unit-testet.
// To kolonner: sæson N og N−1 (historikken er 28 kampe = to sæsoner – intet "I alt"). Ingen ændring af gemmeformatet:
// - Kampe, minutter, mål, oplæg og snit (kun dit hold – karakteren er privat) fra matchLog, filtreret på holdets indeks (LOG.H/LOG.A) og
//   sæsonen, med samme hideLog som 📜 Kampe (runden, der afspilles, står ikke).
// - 👑/🟨/🟥 (målmand: 🧤 clean sheets) står ikke i loggen: sæson N fra s*-felterne – kun når han ikke er skiftet midt i sæsonen
//   (lastMove efter sæsonens første vindue, N·2) og ikke under afspilning; N−1 fra league.lastSeasonStats, når øjebliksbilledet er dette
//   hold (v.t) og han ikke skiftede midt i N−1. Ellers null ("–").
// Kun kampe efter hans skifte til holdet tælles (lastMove), så kampe mod den nye klub fra før købet står ikke for den.
// → { rows: [{ s, games, min, goals, assists, avg, motm, yellow, red, cs }], empty: null | 'none' | 'unsaved', gk }
export function cardStats(p, { isOwn, teamIdx, teamId, season, hideLog = null, lastSeason = null }) {
  const v = viewPlayer(p, isOwn), all = v.matchLog ?? [];
  const log = hideLog ? all.filter((e) => !(e[LOG.S] === hideLog[0] && e[LOG.R] === hideLog[1])) : all;
  // QC v3.31.2: kun kampe EFTER hans skifte til holdet (lastMove = vinduet: 2·S før runde 1, 2·S+1 før runde 8) – ellers tælles
  // kampene MOD den nye klub med (dobbeltturnering: alle møder alle, så det skete ved næsten hvert køb)
  const after = (e) => p.lastMove == null || e[LOG.S] * 2 + (e[LOG.R] >= WINDOW_ROUNDS[1] ? 1 : 0) >= p.lastMove;
  const mine = log.filter((e) => after(e) && (e[LOG.H] === teamIdx || e[LOG.A] === teamIdx));
  const gk = p.line === 'GK', S = season ?? 1;
  const empty = mine.length ? null : !all.length && (p.careerGames ?? 0) > 0 ? 'unsaved' : 'none';
  const sum = (es, i) => es.reduce((a, e) => a + (e[i] || 0), 0);
  const cards = (s) => {
    if (s === S) {
      if (hideLog || (p.lastMove != null && p.lastMove > S * 2)) return null;
      return { motm: v.sMotm ?? 0, yellow: v.sYellow ?? 0, red: v.sRed ?? 0, cs: v.sCleanSheets ?? 0 };
    }
    if (!lastSeason || lastSeason.seasonNumber !== s || p.lastMove === s * 2 + 1) return null;
    const st = lastSeason.players?.[p.id];
    if (!st) return { motm: 0, yellow: 0, red: 0, cs: 0 };   // øjebliksbilledet gemmer kun spillere med tal ≠ 0
    if (st.t !== teamId) return null;
    return { motm: st.sMotm ?? 0, yellow: st.sYellow ?? 0, red: st.sRed ?? 0, cs: st.sCleanSheets ?? 0 };
  };
  const rows = [S, S - 1].map((s) => {
    const es = mine.filter((e) => e[LOG.S] === s), rated = isOwn ? es.filter((e) => e[LOG.RT] != null) : [];
    return { s, games: es.length, min: sum(es, LOG.MIN), goals: sum(es, LOG.G), assists: sum(es, LOG.AS),
      avg: isOwn ? (rated.length ? Math.round((rated.reduce((a, e) => a + e[LOG.RT], 0) / rated.length) * 10) / 10 : null) : undefined, ...(cards(s) ?? { motm: null, yellow: null, red: null, cs: null }) };
  }).filter((r) => r.s >= 1);
  return { rows, empty, gk, own: isOwn };
}
function renderCardStats(st, team) {
  const title = h('h4', {}, `📊 Statistik for ${team.name}`);
  if (st.empty) return h('div', { class: 'card-stats', id: 'card-stats' }, title,
    h('div', { class: 'muted', id: 'card-stats-empty' }, st.empty === 'unsaved' ? 'Kampene før kamphistorikken (v3.18) er ikke gemt' : `Ingen kampe for ${team.name} endnu`));
  const cell = (v) => (v == null ? '–' : typeof v === 'number' && !Number.isInteger(v) ? dec(v, 1) : typeof v === 'number' ? v.toLocaleString('da-DK') : String(v));
  const ROWS = [['Kampe', 'games'], ['Min.', 'min'], ['Mål', 'goals'], ['Oplæg', 'assists'], ...(st.own ? [['Snit', 'avg', 'Snitkarakter (kun dit hold)']] : []),
    ['👑', 'motm', 'Kampens spiller'], ['🟨', 'yellow', 'Gule kort'], ['🟥', 'red', 'Røde kort'], ...(st.gk ? [['🧤', 'cs', 'Clean sheets']] : [])];
  return h('div', { class: 'card-stats', id: 'card-stats' }, title,
    h('table', { class: 'stats-mini', id: 'card-stats-table' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), st.rows.map((r) => h('th', { class: 'num' }, `Sæson ${r.s}`)))),
      h('tbody', {}, ROWS.map(([label, k, tip]) => h('tr', { dataset: { k } }, h('th', { title: tip ?? '' }, label), st.rows.map((r) => h('td', { class: 'num' }, cell(r[k]))))))),
    st.rows.some((r) => r.motm == null) ? h('div', { class: 'muted', id: 'card-stats-note' }, '– = ikke opgjort: kortene og 👑 gemmes pr. sæson, ikke pr. kamp (skiftet klub, ikke gemt for sidste sæson, eller runden afspilles)') : null);
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
