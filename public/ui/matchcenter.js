// Broadcast Match Center (docs/spec.md §5–6): de 4 kampe i runden, live-afspilning af
// din kamp, tidslinje, statistik, karakterark og TactiVAR Avisen. Karakterer for
// modstandere vises kun som stjerner (engine/visibility.js).
import { h } from './dom.js';
import { starsEl } from './labels.js';
import { viewRatingEntry } from '../engine/visibility.js';
import { GOAL_KIND_LABEL, goalMatchIdx } from '../engine/gazette.js';
import { FORMATIONS } from '../engine/formations.js';
import { isStarter, placeLabel, lineupSort } from './lineup.js';

export const REPORT_FILTERS = [['all', 'Alle hændelser'], ['tactic', 'Kun taktik'], ['key', 'Kun nøglemomenter']];
const KEY_TYPES = new Set(['GOAL', 'HEADER_GOAL', 'VAR_GOAL', 'VAR_NO_GOAL', 'INJURY', 'SUB', 'TRIGGER', 'END', 'HALFTIME', 'FULLTIME']);
const ICON = { GOAL: '⚽', HEADER_GOAL: '⚽', VAR_GOAL: '📺', VAR_NO_GOAL: '📺', INJURY: '🚑', SUB: '🔄', TRIGGER: '📋', FOUL: '🟨' };

export function filterEvents(events, filter) {
  if (filter === 'tactic') return events.filter((e) => e.category === 'TACTIC' || e.type === 'TRIGGER' || e.tactical);   // v3.13: dine træthedsskift og Hvis-Så-skift
  if (filter === 'key') return events.filter((e) => KEY_TYPES.has(e.type));
  return events;
}

function statsRows(m, st) {
  const pct = Math.round((st.hPoss / (st.hPoss + st.aPoss)) * 100);
  const rows = [
    ['Boldbesiddelse', `${pct}%`, `${100 - pct}%`],
    ['Vundne taktiske dueller', st.hTacticSuccess, st.aTacticSuccess],
    ['Afslutninger', st.hShots, st.aShots],
    ['Skud på mål', st.hOnTarget, st.aOnTarget],
    ['Expected goals (xG)', st.hXg.toFixed(2), st.aXg.toFixed(2)],
    ['Vundne luftdueller', st.hAerialWon, st.aAerialWon],
    ['VAR-tjek', st.hVarChecks, st.aVarChecks],
    ['Frispark begået / skader', `${st.hFouls} / ${st.hInjuries}`, `${st.aFouls} / ${st.aInjuries}`],
    // Dødbolde (v3.10.1, brugeren: "den her info bør også fremgå af højreside med statistik").
    // Kampe fra før v3.10 har ikke tallene – de vises som "–".
    ['Frispark i skudafstand', st.hFreeKicks ?? '–', st.aFreeKicks ?? '–'],
    ['Hjørnespark', st.hCorners ?? '–', st.aCorners ?? '–'],
    ['Straffe (mål)', st.hPenalties != null ? `${st.hPenalties} (${st.hPenaltyGoals})` : '–', st.aPenalties != null ? `${st.aPenalties} (${st.aPenaltyGoals})` : '–'],
    ['Gule kort', st.hYellows ?? '–', st.aYellows ?? '–'],
  ];
  return h('table', { class: 'mstats', id: 'match-stats' }, h('thead', {}, h('tr', {}, h('th', {}, m.homeName), h('th', {}, ''), h('th', {}, m.awayName))),
    h('tbody', {}, rows.map(([l, a, b]) => h('tr', {}, h('td', {}, String(a)), h('th', {}, l), h('td', {}, String(b))))));
}

function timeline(events) {
  return h('div', { class: 'timeline', id: 'timeline' }, h('div', { class: 'tl-half' }),
    events.filter((e) => e.plot).map((e) => h('span', { class: 'tl-mark ' + (e.isHome ? 'home' : 'away'), style: { left: `${(e.min / 90) * 100}%` }, title: `${e.min}' ${e.label}` }, ICON[e.type] || '•')));
}

// Spilletid: "90'" for hele kampen, ellers ind–ud.
export const minutes = (e) => (e.minIn <= 1 && e.minOut === 90 ? "90'" : `${e.minIn <= 1 ? 0 : e.minIn}'–${e.minOut}'`);

// Ikonerne i karakterarket. title giver mouse-over; forklaringen under arket dækker touch.
export const RATING_ICONS = [['⚽', 'Mål'], ['🅰', 'Oplæg'], ['🧤', 'Redninger'], ['✈', 'Vundne luftdueller'], ['🟨', 'Gult kort'], ['🚑', 'Skadet'], ['👑', 'Kampens spiller'], ['🧠', 'Mod-kunnen (erfaring) optjent i kampen']];
const TIP = Object.fromEntries(RATING_ICONS);
// Mål og oplæg gentages (⚽⚽); redninger og luftdueller står som tal (🧤4).
const REPEAT = new Set(['⚽', '🅰']);
const icon = (sym, n = 0) => h('span', { class: 'ricon', title: TIP[sym] + (n ? `: ${n}` : '') }, !n ? sym : REPEAT.has(sym) ? sym.repeat(n) : `${sym}${n}`);
function ratingsTable(list, isOwn, title, formation, snap = null, onSnap = null) {
  const rows = lineupSort(list).map((e) => ({ ...viewRatingEntry(e, isOwn), place: placeLabel(e, formation) }));
  return h('div', { class: 'ratings' }, h('h4', {}, title),
    // Øjebliksbillede ved et mål (kun dit hold, v3.12.1) – ellers startopstillingen.
    isOwn && snap ? snapPitch(rows, snap, onSnap)
      : formation && rows.some((e) => isStarter(e) && e.slot != null) ? miniPitch(rows.filter(isStarter), formation, isOwn) : null,
    h('table', {}, h('tbody', {}, rows.map((e) => h('tr', { class: e.isMotM ? 'motm' : '' },
      h('td', {}, `#${e.shirtNumber} ${e.shortName}`, h('span', { class: 'place' }, ` · ${e.place}`)), h('td', { class: 'muted' }, minutes(e)),
      h('td', { class: 'icons' }, e.goals ? icon('⚽', e.goals) : null, e.assists ? icon('🅰', e.assists) : null, e.saves ? icon('🧤', e.saves) : null, e.aerialWins ? icon('✈', e.aerialWins) : null,
        e.yellowCard ? icon('🟨') : null, e.injured ? icon('🚑') : null, e.isMotM ? icon('👑') : null),
      h('td', { class: 'rating' }, isOwn ? e.rating.toFixed(1) : starsEl(e.stars)),
      isOwn ? h('td', { class: 'run', title: 'Løbet distance · andel højintenst løb (over ca. 20 km/t) · topfart – kun dit hold (det røber udholdenhed og fart)' }, e.distanceKm > 0 ? `${e.distanceKm.toFixed(1)} km${e.hiShare != null ? ` · ${Math.round(e.hiShare)} % HI` : ''}${e.topSpeed ? ` · ${e.topSpeed.toFixed(1)} km/t` : ''}` : '–') : null,
      isOwn ? h('td', { class: 'fri', title: 'Løb uden bold: kom fri / forsøg – kun dit hold (det røber positionering og fart)' }, e.freeRuns ? `${e.freeRunsWon ?? 0}/${e.freeRuns} fri` : '') : null,
      isOwn ? h('td', { class: 'xp', title: `${TIP['🧠']} – ved fuld pulje glemmer han lidt af de andre stilarter` }, `+${e.gainedCounterXp} 🧠`) : null)))));
}

// Startopstillingen som lille bane med karakter (eget hold) eller stjerner (modstander).
function miniPitch(rows, formation, isOwn) {
  const coords = FORMATIONS[formation];
  return h('div', { class: 'minipitch-wrap' }, h('div', { class: 'muted' }, `Startopstilling (${formation}) – indskiftere og formationsskift står i listen`),
    h('div', { class: 'minipitch' }, rows.filter((e) => e.slot != null && coords[e.slot]).map((e) => h('div', {
      class: 'mp-token' + (e.isMotM ? ' motm' : ''), style: { left: coords[e.slot].x + '%', top: coords[e.slot].y + '%' }, title: `${coords[e.slot].r} – #${e.shirtNumber} ${e.shortName}`,
    }, h('span', { class: 'mp-val' }, isOwn ? e.rating.toFixed(1) : starsEl(e.stars)), h('span', { class: 'mp-name' }, `${coords[e.slot].r} ${e.shortName}`)))));
}

// Hvor dit hold stod, da et mål faldt (v3.12.1, brugeren: "Vi måler hvor langt de løber … løbe uden
// bold" – og valgte at kunne SE det). Brikkerne findes via spiller-id (også indskiftere); scoreren og
// oplægsgiveren markeres, bolden står, hvor den kom. Ved et mål imod: dit forsvar i øjeblikket.
function snapPitch(rows, { ev, snap }, onSnap) {
  const byId = new Map(rows.map((e) => [e.playerId, e]));
  const who = (id) => byId.get(id);
  const sc = who(snap.scorer);
  const head = snap.attacking ? `${ev.min}' – mål${sc ? ` af #${sc.shirtNumber} ${sc.shortName}` : ''}: sådan stod I` : `${ev.min}' – mål imod: sådan stod dit forsvar (modstanderens spillere vises ikke)`;
  return h('div', { class: 'minipitch-wrap', id: 'snap-pitch' }, h('div', { class: 'row' }, h('strong', { id: 'snap-title' }, head),
    h('button', { class: 'mini', id: 'snap-back', onclick: () => onSnap(null) }, '↩ Startopstilling')),
    h('div', { class: 'minipitch' },
      snap.pts.map(([id, x, y]) => { const e = who(id); if (!e) return null;
        const mark = id === snap.scorer ? ' scorer' : id === snap.assist ? ' assist' : '';
        return h('div', { class: 'mp-token' + mark, dataset: { pid: id }, style: { left: x + '%', top: y + '%' }, title: `#${e.shirtNumber} ${e.shortName}${mark === ' scorer' ? ' – målscorer' : mark === ' assist' ? ' – oplæg' : ''}` },
          h('span', { class: 'mp-val' }, id === snap.scorer ? '⚽' : id === snap.assist ? '🅰' : `#${e.shirtNumber}`), h('span', { class: 'mp-name' }, e.shortName)); }),
      h('div', { class: 'mp-ball', id: 'snap-ball', title: 'Bolden', style: { left: snap.ball[0] + '%', top: snap.ball[1] + '%' } }, '●')),
    h('div', { class: 'muted' }, snap.attacking ? 'Spillerne rykker med i kampen: frem når I har bolden, mod boldsiden – og løb uden bold fører flere ind i feltet.' : 'Dit forsvar står efter dit pres og boldsiden.'));
}

const legend = (isOwn = true) => h('div', { class: 'muted legend', id: 'icon-legend' }, RATING_ICONS.map(([s, t]) => `${s} ${t}`).join(' · ') + ' · 📍 i referatet = se hvor dit hold stod, da målet faldt (åbent spil og kontra, efter slutfløjt) · HI = andel højintenst løb (over ca. 20 km/t) · "2/3 fri" = løb uden bold: kom fri 2 af 3 gange – begge kun dit hold');

// onOpenMatch(i): åbner referatet af kamp i i runden (Liga: skift til Kamp; Kamp: vis kampen).
// matches: rundens kampe – bruges til at finde kampen for mål fra før v3.7.1 (uden matchIdx).
// column (v3.14, column.js): klummen bygget for seeren. Uden den (gamle visninger/tests) den gamle avis.
// onOpenReport(i): åbner kamp i's referat (kampoverskrifterne i "De øvrige kampe").
export function renderGazette(g, myTeamId, onOpenMatch = null, matches = null, column = null, onOpenReport = null) {
  if (g && column) return renderColumn(g, myTeamId, onOpenMatch, matches, column, onOpenReport);
  const goal = g?.goalOfTheRound;
  const goalIdx = goalMatchIdx(goal, matches);
  if (!g) return null;
  // Rundens spiller går gennem visibility.js: modstandere vises kun med stjerner.
  const pr = g.playerOfTheRound ? viewRatingEntry(g.playerOfTheRound, g.playerOfTheRound.teamId === myTeamId) : null;
  const feats = pr ? [pr.goals ? `${pr.goals} mål` : '', pr.assists ? `${pr.assists} oplæg` : '', pr.saves ? `${pr.saves} redninger` : ''].filter(Boolean).join(' • ') : '';
  return h('div', { class: 'panel gazette', id: 'gazette' }, h('h3', {}, '📰 TactiVAR Avisen'),
    // Sæsonslut (v3.11): mesteren og din placering står øverst.
    g.seasonEnd ? h('p', { id: 'season-end', class: 'season-end' }, h('strong', {}, `🏆 Sæson ${g.seasonEnd.seasonNumber} er slut: `),
      [g.seasonEnd.champion ? `${g.seasonEnd.champion.teamName} er mester med ${g.seasonEnd.champion.points} point.` : '', g.seasonEnd.myPos ? `Du sluttede nr. ${g.seasonEnd.myPos}.` : '',
        g.seasonEnd.topScorer ? `Topscorer: #${g.seasonEnd.topScorer.shirtNumber} ${g.seasonEnd.topScorer.shortName} (${g.seasonEnd.topScorer.teamName}), ${g.seasonEnd.topScorer.goals} mål.` : '',
        'En ny sæson starter med nulstillet tabel – se Tidligere sæsoner på Liga-fanen.'].filter(Boolean).join(' ')) : null,
    h('p', {}, `Runden bød på ${g.totalGoals} scoringer og ${g.totalVarChecks} VAR-tjek på tværs af de 4 stadions. ${g.myResult}`),
    pr ? h('p', { id: 'player-of-round' }, h('strong', { title: 'Bedste karakter i runden' }, '🏆 Rundens spiller: '), `#${pr.shirtNumber} ${pr.shortName} (${pr.teamName}) – `, 'rating' in pr ? `karakter ${pr.rating.toFixed(1)}` : starsEl(pr.stars), feats ? ` • ${feats}` : '') : null,
    g.headlines?.length ? h('ul', { class: 'headlines', id: 'headlines' }, g.headlines.map((x) => h('li', {}, x))) : null,
    g.goalOfTheRound ? h('p', { id: 'goal-of-round' }, h('strong', {}, '🚀 Rundens mål'), GOAL_KIND_LABEL[g.goalOfTheRound.kind] ? ` (${GOAL_KIND_LABEL[g.goalOfTheRound.kind]})` : '', h('strong', {}, ': '), g.goalOfTheRound.desc,
      // Hvilken kamp – som link til referatet, når runden ved det (fra v3.7.1).
      g.goalOfTheRound.match ? ' ' : null,
      g.goalOfTheRound.match ? (onOpenMatch && goalIdx >= 0
        ? h('button', { class: 'linklike', id: 'goal-of-round-match', title: 'Åbn referatet af kampen – målet er markeret', onclick: () => onOpenMatch(goalIdx, goal) }, `📺 ${g.goalOfTheRound.match.replace(' - ', ' – ')}`)
        : h('span', { class: 'muted' }, `(${g.goalOfTheRound.match.replace(' - ', ' – ')})`)) : null) : null,
    g.upset ? h('p', { id: 'upset' }, h('strong', {}, '😮 Rundens overraskelse: '), `${g.upset.winner} (nr. ${g.upset.winnerPos}) slog ${g.upset.loser} (nr. ${g.upset.loserPos}) ${g.upset.score}.`) : null,
    g.myRunner && g.myRunner.teamId === myTeamId ? h('p', { id: 'my-runner' }, h('strong', {}, '🏃 Dit holds løber: '), `#${g.myRunner.shirtNumber} ${g.myRunner.shortName} – ${g.myRunner.distanceKm.toFixed(1)} km${g.myRunner.hiShare != null ? `, ${Math.round(g.myRunner.hiShare)} % højintenst` : ''}${g.myRunner.topSpeed ? `, topfart ${g.myRunner.topSpeed.toFixed(1)} km/t` : ''}.`) : null,
    !g.goalOfTheRound && g.defensiveAction ? h('p', {}, h('strong', {}, '🛡 Rundens defensive aktion: '), `#${g.defensiveAction.shirtNumber} ${g.defensiveAction.shortName} (${g.defensiveAction.teamName}) holdt nullet.`) : null);
}

// Klummen: overskrift efter rundens største historie, afsnit med fede indledninger (skimbart), bokse under.
function renderColumn(g, myTeamId, onOpenMatch, matches, col, onOpenReport) {
  const goal = g.goalOfTheRound, goalIdx = goalMatchIdx(goal, matches);
  const pr = g.playerOfTheRound ? viewRatingEntry(g.playerOfTheRound, g.playerOfTheRound.teamId === myTeamId) : null;
  const sec = (s, ...body) => h('section', { class: 'col-sec', id: s.id }, h('h4', {}, s.title), ...body);
  const paras = (s) => (s.paras ?? []).filter(Boolean).map((t) => h('p', {}, t));
  return h('div', { class: 'panel gazette column', id: 'gazette' }, h('h3', {}, '📰 TactiVAR Avisen'),
    h('h2', { class: 'col-title', id: 'col-title' }, col.title),
    g.seasonEnd ? h('p', { id: 'season-end', class: 'season-end' }, h('strong', {}, `🏆 Sæson ${g.seasonEnd.seasonNumber} er slut: `),
      [g.seasonEnd.champion ? `${g.seasonEnd.champion.teamName} er mester med ${g.seasonEnd.champion.points} point.` : '', g.seasonEnd.myPos ? `Du sluttede nr. ${g.seasonEnd.myPos}.` : '',
        g.seasonEnd.topScorer ? `Topscorer: #${g.seasonEnd.topScorer.shirtNumber} ${g.seasonEnd.topScorer.shortName} (${g.seasonEnd.topScorer.teamName}), ${g.seasonEnd.topScorer.goals} mål.` : '',
        'En ny sæson starter med nulstillet tabel – se Tidligere sæsoner på Liga-fanen.'].filter(Boolean).join(' ')) : null,
    h('p', { class: 'muted' }, `Runden bød på ${g.totalGoals} scoringer og ${g.totalVarChecks} VAR-tjek på tværs af de ${matches?.length ?? 4} stadions.`),
    ...col.sections.map((s) => {
      if (s.id === 'col-others') return sec(s, h('ul', { class: 'headlines', id: 'headlines' }, s.others.map((o) => h('li', {},
        onOpenReport ? h('button', { class: 'linklike col-match', title: 'Åbn referatet', onclick: () => onOpenReport(o.idx) }, h('strong', {}, o.head)) : h('strong', {}, o.head), o.note ? ` – ${o.note}` : ''))));
      if (s.id === 'col-stars') return sec(s,
        pr ? h('p', { id: 'player-of-round' }, h('strong', { title: 'Bedste karakter i runden' }, '🏆 Rundens spiller: '), `#${pr.shirtNumber} ${pr.shortName} (${pr.teamName}) – `, 'rating' in pr ? `karakter ${pr.rating.toFixed(1)}` : starsEl(pr.stars), s.player?.why ? ` • ${s.player.why}` : '') : null,
        goal ? h('p', { id: 'goal-of-round' }, h('strong', {}, '🚀 Rundens mål'), GOAL_KIND_LABEL[goal.kind] ? ` (${GOAL_KIND_LABEL[goal.kind]})` : '', h('strong', {}, ': '), goal.desc,
          goal.match ? ' ' : null,
          goal.match ? (onOpenMatch && goalIdx >= 0
            ? h('button', { class: 'linklike', id: 'goal-of-round-match', title: 'Åbn referatet af kampen – målet er markeret', onclick: () => onOpenMatch(goalIdx, goal) }, `📺 ${goal.match.replace(' - ', ' – ')}`)
            : h('span', { class: 'muted' }, `(${goal.match.replace(' - ', ' – ')})`)) : null) : null,
        !goal && g.defensiveAction ? h('p', {}, h('strong', {}, '🛡 Rundens defensive aktion: '), `#${g.defensiveAction.shirtNumber} ${g.defensiveAction.shortName} (${g.defensiveAction.teamName}) holdt nullet.`) : null);
      if (s.id === 'col-form') return sec(s, ...(s.paras ?? []).map((t) => h('p', { id: t.startsWith('Rundens overraskelse') ? 'upset' : null }, t)));
      return sec(s, ...paras(s));
    }),
    g.myRunner && g.myRunner.teamId === myTeamId ? h('p', { id: 'my-runner', class: 'col-box' }, h('strong', {}, '🏃 Dit holds løber: '), `#${g.myRunner.shirtNumber} ${g.myRunner.shortName} – ${g.myRunner.distanceKm.toFixed(1)} km${g.myRunner.hiShare != null ? `, ${Math.round(g.myRunner.hiShare)} % højintenst` : ''}${g.myRunner.topSpeed ? `, topfart ${g.myRunner.topSpeed.toFixed(1)} km/t` : ''}.`) : null);
}

const snapOf = (m, mc) => (mc.snap != null && m.events[mc.snap]?.snapshot ? { ev: m.events[mc.snap], snap: m.events[mc.snap].snapshot } : null);
// mc = { round, matches, gazette, viewIdx, filter, shownCount, playing, snap }
export function renderMatchCenter({ mc, myTeamId, on, column = null }) {
  const m = mc.matches[mc.viewIdx];
  const all = m.events;
  const shown = mc.playing ? all.slice(0, mc.shownCount) : all;
  const last = shown.at(-1) || all[0];
  const isOwnSide = (side) => (side === 'home' ? m.homeId : m.awayId) === myTeamId;
  const feed = filterEvents(shown, mc.filter).slice().reverse();
  return h('div', { class: 'panel matchcenter', id: 'match-center' },
    h('div', { class: 'row' }, h('h3', {}, `📺 Match Center – runde ${mc.round}`),
      mc.playing ? h('button', { class: 'mini', id: 'skip', onclick: on.skip }, '⚡ Spring til slutfløjt') : null,
),
    mc.playing ? h('div', { class: 'muted', id: 'booked-note' }, 'Runden er allerede bogført og gemt – tabellen og truppen er opdateret, også hvis du lukker siden nu.') : null,
    h('div', { class: 'cards', id: 'match-cards' }, mc.matches.map((x, i) => h('button', { class: 'matchcard' + (i === mc.viewIdx ? ' active' : ''), disabled: mc.playing && i !== 0, onclick: () => on.view(i) },
      // Under afspilning afsløres de andre kampes resultater ikke før slutfløjt.
      mc.playing ? (i === 0 ? `${x.homeName} ${last.hG}-${last.aG} ${x.awayName}` : `${x.homeName} – ${x.awayName}`) : [`${x.homeName} ${x.homeGoals}-${x.awayGoals} ${x.awayName}`, x.ratings.motm ? h('span', { title: 'Kampens spiller' }, ` 👑 ${x.ratings.motm.shortName}`) : null]))),
    h('div', { class: 'scoreboard', id: 'scoreboard' },
      h('div', {}, h('strong', {}, m.homeName), h('div', { class: 'muted' }, m.homeTacticStr)),
      h('div', { class: 'score' }, h('div', { id: 'score' }, `${last.hG} - ${last.aG}`), h('div', { class: 'muted', id: 'minute' }, mc.playing ? `${last.min}'` : 'Slut')),
      h('div', { class: 'right' }, h('strong', {}, m.awayName), h('div', { class: 'muted' }, m.awayTacticStr))),
    timeline(shown),
    last.varMsg && mc.playing ? h('div', { class: 'varbanner' }, `📺 VAR: ${last.varMsg}`) : null,
    h('div', { class: 'mc-grid' },
      h('div', {}, h('div', { class: 'toolbar' }, REPORT_FILTERS.map(([v, l]) => h('button', { class: 'mini' + (mc.filter === v ? ' active' : ''), onclick: () => on.filter(v) }, l))),
        // Et mål åbnet fra avisen markeres i referatet (samme minut, samme målscorer).
        h('div', { class: 'feed', id: 'feed' }, feed.map((e) => { const focus = mc.focus && /GOAL/.test(e.type) && e.min === mc.focus.min && e.text.includes(mc.focus.scorer);
          // Mål med øjebliksbillede (kun efter slutfløjt): 📍 viser, hvor dit hold stod.
          const pin = e.snapshot && !mc.playing ? h('button', { class: 'mini snap-btn', title: e.snapshot.attacking ? 'Se hvor dit hold stod, da målet faldt' : 'Se hvor dit forsvar stod, da målet faldt', onclick: () => on.snapshot(all.indexOf(e)) }, '📍') : null;
          return h('div', { class: `ev ${e.category.toLowerCase()} ${e.type.toLowerCase()}${focus ? ' focus' : ''}${mc.snap === all.indexOf(e) ? ' snapped' : ''}`, id: focus ? 'goal-focus' : null }, h('span', { class: 'ev-min' }, `${e.min}'`), e.text, pin); }))),
      h('div', {}, statsRows(m, last.stats))),
    // Karakterarkene side om side under referatet (stablet på smal skærm).
    mc.playing ? null : h('div', { class: 'ratings-grid' },
      ratingsTable(m.ratings.home, isOwnSide('home'), `${m.homeName} – karakterer`, m.startFormations?.home, snapOf(m, mc), on.snapshot),
      ratingsTable(m.ratings.away, isOwnSide('away'), `${m.awayName} – karakterer`, m.startFormations?.away, snapOf(m, mc), on.snapshot)),
    mc.playing ? null : legend(),
    mc.playing ? null : renderGazette(mc.gazette, myTeamId, on.openGoal, mc.matches, column, on.view));
}
