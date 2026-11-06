// Regneark/scouting-matrix (docs/spec.md §8). Modstanderes skjulte kolonner vises som
// "🔒 ??" og kan ikke sorteres (synlighed afgøres i engine/visibility.js).
import { POSITIONS } from '../engine/generator.js';
import { h, dec, LOCK } from './dom.js';
import { LINE, POSITION, POSITION_FULL, starsEl, outLabel, OUT_TITLE, archetypeOf, archIcon, archReqText } from './labels.js';
import { canSeeField } from '../engine/visibility.js';
import { slotPlaceLabel } from '../engine/formations.js';
import { COUNTER_KEYS } from '../engine/counter.js';
import { matchBenchOf, publicValue } from '../engine/career.js';
import { SKILL_NAME } from './card.js';
import { gainWords } from './training.js';

// Beløb kort: "1,2 mio." / "850.000" (regnearket er bredt nok i forvejen)
const money = (v) => (v >= 1e6 ? `${dec(v / 1e6, 1)} mio.` : v.toLocaleString('da-DK'));

// Mod-kunnen vises som spillerens tre egne værdier – ikke som én % mod en bestemt
// modstander, for den kunne bruges til at regne modstanderens stil ud (brugerens valg).
// Sorteres på den bedste af de tre: med puljen (v3.6) har alle fuldt erfarne samme sum.
const modBest = (p) => Math.max(...COUNTER_KEYS.map((k) => p.counterTactics[k]));

const avgSkill = (p) => Object.values(p.skills).reduce((a, b) => a + b, 0) / 9;
export const avgRating = (p) => (p.ratingGames ? p.ratingSum / p.ratingGames : 0);

// field = det felt synligheden afgøres på; num = tal-kolonne (starter faldende ved sortering).
// v3.32.1 (R4): på en tabel, der ruller vandret, står plads og navn fast (opt-in – style.css .tablewrap[data-scroll])
const STICK = { pos: 'stick-1', name: 'stick-2' };
export const COLUMNS = [
  { key: 'pos', label: 'Pos/#', title: 'Plads i opstillingen / rygnummer', field: 'shirtNumber', value: (p, c) => { const s = c.slotOf(p); return s >= 0 ? s : 100 + p.shirtNumber; } },
  { key: 'name', label: 'Spiller', field: 'shortName', value: (p) => p.shortName, text: true },
  { key: 'line', label: 'Kæde', field: 'line', value: (p) => ['GK', 'DEF', 'MID', 'ATT'].indexOf(p.line) },
  { key: 'natpos', label: 'Natur', title: 'Naturlig position (offentlig) – på en anden plads end sin position yder spilleren mindre i dueller (se Taktik); højden følger positionen. Løbet i kampen følger den plads, spilleren står på (Pos/#)', field: 'position', value: (p) => POSITIONS.indexOf(p.position) },
  { key: 'age', label: 'Alder', field: 'age', value: (p) => p.age, num: true },
  { key: 'fresh', label: 'Frisk/🚑', title: 'Friskhed i % – en træt spiller yder mindre (75 % ≈ 6 %, 50 % ≈ 12,5 % svagere i dueller, afslutninger og luftdueller). En kamp koster efter løbet distance; man kommer sig hurtigere, jo mere træt man er; bænken +15 ekstra – 🚑 = skadet (antal kampe)', field: 'freshness', value: (p) => (p.injuryMatchesLeft > 0 ? -p.injuryMatchesLeft : p.freshness), num: true },
  { key: 'height', label: 'Højde', field: 'heightCm', value: (p) => p.heightCm, num: true },
  { key: 'jump', label: 'Spring', title: 'Spring – trænes med Fysik (indgår i luftduellen)', field: 'jumpingPower', value: (p) => p.jumpingPower, num: true, heat: true, gain: 'jumpingPower' },   // v3.32.0: +N-mærket som evnerne
  { key: 'aerial', label: '✈ Luft', title: 'Samlet luftduel/hovedstød', field: 'aerialPower', value: (p) => p.aerialPower, num: true, heat: true },
  ...[['pace', 'PAC', 'Fart'], ['stamina', 'STA', 'Udholdenhed'], ['strength', 'STR', 'Styrke'], ['ballControl', 'BAL', 'Boldkontrol'], ['passing', 'PAS', 'Pasning'], ['finishing', 'FIN', 'Afslutning'], ['positioning', 'POS', 'Positionering'], ['intercepting', 'INT', 'Erobring'], ['goalkeeping', 'GK', 'Målmandsspil']]
    .map(([k, label, title]) => ({ key: k, label, title, field: 'skills', value: (p) => p.skills[k], num: true, heat: true, skill: true, gain: k })),
  { key: 'avg', label: 'Gns', title: 'Gennemsnit af de 9 kerne-evner – Spring tæller ikke med', field: 'skills', value: avgSkill, num: true, fmt: (v) => dec(v, 1) },
  { key: 'rating', label: '⭐ Vurd', title: 'Eget hold: gennemsnitlig karakter. Modstandere: stjerner', field: 'publicStars', value: (p, c) => (c.isOwn ? avgRating(p) : p.publicStars), num: true },
  { key: 'mod', label: '🧠 Mod', title: 'Erfaring mod stilarter: mod gegenpres / mod lav blok / mod VAR-linje og lange bolde (sorterer på den bedste)', field: 'counterTactics', value: modBest, num: true },
  // v3.19.0 (brugeren: "Hvor står værdien og lønnen for mine egne spillere?"): sidst, så kolonnernes plads i e2e holder. Værdien er
  // offentlig (stjerner, tier og alder), lønnen kun ejerens (weeklyWage er OWNER → 🔒 for modstandere)
  { key: 'value', label: '💰 Værdi', title: 'Offentlig værdi (stjerner og alder) – en anden klub betaler mere (1,3, en starter 1,6)', field: 'publicStars', value: (p) => publicValue(p), num: true, fmt: money },
  { key: 'wage', label: 'Løn/rd', title: 'Løn pr. runde (kun dit hold) – lønbudgettet står i 💼 Klub', field: 'weeklyWage', value: (p) => Math.round(p.weeklyWage / 3), num: true, fmt: (v) => v.toLocaleString('da-DK') },
];

// v3.18.0: truppen er 18–25 – "Alle (N)" sættes ved visningen; Reserver = hverken startere eller på kamptruppens bænk
export const FILTERS = [['all', 'Alle'], ['start', 'Start-11'], ['bench', 'Bænk'], ['reserve', 'Reserver'], ['GK', 'MÅL'], ['DEF', 'FOR'], ['MID', 'MID'], ['ATT', 'ANG']];

export const heatClass = (v) => (v >= 15 ? 'heat-4' : v >= 12 ? 'heat-3' : v >= 8 ? 'heat-2' : 'heat-1');

// Regnearkets rækker i den viste rækkefølge (ren): filter, sortering og synlighedsvagten – også kortpanelets ◀ ▶ (v3.29.0) bladrer
// i netop denne rækkefølge, så panelet og tabellen aldrig er uenige.
export function matrixRows({ team, isOwn, ui }) {
  const slotOf = (p) => team.tactics.lineupSlots.indexOf(p.id);
  const ctx = { team, isOwn, slotOf };
  // Vagten mod "sort-spoofing": en skjult kolonne kan aldrig være sorteringsnøgle for en
  // seer, der ikke må se den – uanset hvad UI-tilstanden siger.
  const wanted = COLUMNS.find((c) => c.key === ui.sortCol) || COLUMNS[0];
  const col = canSeeField(wanted.field, isOwn) ? wanted : COLUMNS[0];
  const desc = col === wanted ? ui.sortDesc : false;
  const benchIds = new Set(matchBenchOf(team).map((p) => p.id));
  const rows = team.squad
    .filter((p) => {
      const s = slotOf(p);
      switch (ui.filter) {
        case 'start': return s >= 0;
        case 'bench': return s < 0 && benchIds.has(p.id);
        case 'reserve': return s < 0 && !benchIds.has(p.id);
        case 'GK': case 'DEF': case 'MID': case 'ATT': return p.line === ui.filter;
        default: return true;
      }
    })
    .map((p) => ({ p, v: col.value(p, ctx) }))
    .sort((a, b) => {
      const d = col.text ? String(a.v).localeCompare(String(b.v), 'da') : a.v - b.v;
      return (desc ? -d : d) || a.p.shirtNumber - b.p.shirtNumber;
    });
  return { rows, col, desc, slotOf, ctx, benchIds };
}

// ui.selectedPlayerId = rækken med lilla omrids: kortpanelets spiller, kun mens panelet er åbent (v3.29.0, app.js sætter det)
// ui.gains (v3.30.0) = Map(id → [evne, …]) fra gainsByPlayer: evner, der steg efter runde ui.gainRound, får et lille "+N"-mærke (CSS ::after
// af data-gain – tallet i cellen er uændret, så sortering og aflæsning ikke rører det). app.js afgør, hvornår mærket må vises.
export function renderMatrix({ team, isOwn, ui, notes, onSort, onSelect, onSwap, onFilter, onBlocked }) {
  const { rows, col, desc, slotOf, ctx, benchIds } = matrixRows({ team, isOwn, ui });
  const gains = ui.gains ?? new Map(), after = `efter runde ${ui.gainRound}`;
  // v3.30.0 (brugeren): "💰 Til salg" efter navnet for spillere på salgslisten. Kun dit eget hold: salgslisten er ejerens
  // (visibility.js viewTeam – Security v3.19.0), og botterne har ingen liste – de sælger uden om den
  const listed = new Set(isOwn ? team.listed ?? [] : []);
  // Pladsen som Plads-cellen på Taktik (v3.33.0-rettelse, QC: Trup sagde "CM #8" om en plads trukket ned i DM-zonen): slotPlaceLabel → "CM→DM"
  const placeOf = (s) => slotPlaceLabel(team.tactics, s);

  const head = h('tr', {}, COLUMNS.map((c) => {
    const allowed = canSeeField(c.field, isOwn);
    return h('th', {
      title: c.title || c.label, class: (c.key === col.key ? 'sorted ' : '') + (allowed ? 'sortable' : 'locked') + (STICK[c.key] ? ` ${STICK[c.key]}` : ''),
      onclick: () => (allowed ? onSort(c) : onBlocked(c)),
    }, c.label, c.key === col.key ? (desc ? ' ▼' : ' ▲') : '');
  }), h('th', {}, 'Arketype/Note'), isOwn && onSwap ? h('th', {}, 'Byt') : null);

  const body = rows.map(({ p }) => {
    const s = slotOf(p);
    const cells = COLUMNS.map((c) => {
      const cls = (c.key === col.key ? 'sorted' : '') + (STICK[c.key] ? ` ${STICK[c.key]}` : '');
      if (!canSeeField(c.field, isOwn)) return h('td', { class: cls + ' lockcell' }, LOCK);
      if (c.key === 'pos') return h('td', { class: cls + (s >= 0 ? ' starter' : ' benchnum') }, s >= 0 ? `${placeOf(s)} #${p.shirtNumber}` : `${benchIds.has(p.id) ? 'BÆNK' : 'RES'} #${p.shirtNumber}`);
      if (c.key === 'name') { const g = gains.get(p.id) ?? [];   // mobilen: summen efter navnet (evne-kolonnerne er rullet væk)
        const sale = listed.has(p.id) ? h('span', { class: 'listed-tag', title: 'Sat til salg – andre klubber byder, når vinduet er åbent' }, '💰 Til salg') : null;
        // data-pos (v3.32.1): pladsen står i navnecellen, når kun navnet kan låses (smal skærm – ui/dom.js markScrollable)
        const pos = s >= 0 ? placeOf(s) : benchIds.has(p.id) ? 'BÆNK' : 'RES';
        return h('td', g.length ? { class: cls + ' player-gain', dataset: { gain: String(g.length), pos }, title: `${gainWords(g)} ${after}` } : { class: cls, dataset: { pos } }, p.shortName, sale); }
      if (c.key === 'line') return h('td', { class: cls }, h('span', { class: 'chip' }, LINE[p.line]));
      if (c.key === 'natpos') return h('td', { class: cls, title: POSITION_FULL[p.position] ?? '' }, POSITION[p.position] ?? '–');
      if (c.key === 'fresh') return h('td', { class: cls }, outLabel(p) ? h('span', { class: 'injury', title: OUT_TITLE }, outLabel(p)) : `${p.freshness}%`);   // v3.27.0: 🚑/⛔
      if (c.key === 'height') return h('td', { class: cls }, `${p.heightCm} cm`);
      if (c.key === 'rating') return h('td', { class: cls }, isOwn ? (avgRating(p) ? dec(avgRating(p), 1) : '–') : starsEl(p.publicStars));
        if (c.key === 'mod') return h('td', { class: cls + ' modcell', title: 'Mod gegenpres / lav blok / VAR-linje og lange bolde' }, COUNTER_KEYS.map((k) => p.counterTactics[k]).join(' · '));
      const v = c.value(p, ctx), n = c.gain ? (gains.get(p.id) ?? []).filter((s) => s === c.gain).length : 0;
      return h('td', { class: cls + (c.heat ? ' ' + heatClass(v) : '') + (n ? ' gain' : ''), ...(n ? { dataset: { gain: String(n) }, title: `+${n} ${SKILL_NAME[c.gain]} ${after}` } : {}) }, c.fmt ? c.fmt(v) : v);
    });
    const ar = isOwn ? archetypeOf(p.archetype) : null;   // v3.31.1: navnet fra tabellen efter id (labels.js)
    const arch = ar ? h('span', { class: ar.isUnlocked ? 'arch on' : 'arch', title: ar.isUnlocked ? `${ar.name} – låst op` : archReqText(ar, p, team.tactics.lineupSlots.includes(p.id)) }, `${archIcon(ar)} ${ar.name}`) : null;   // v3.32.0: kravet i title
    const note = notes[p.id]?.trim() ? h('span', { class: 'note-flag', title: 'Du har en note' }, '📝') : null;
    return h('tr', { class: (ui.selectedPlayerId === p.id ? 'selected ' : '') + (ui.swapId === p.id ? 'swapping' : ''), dataset: { pid: p.id }, tabindex: '-1', onclick: () => onSelect(p) },
      cells, h('td', {}, arch, note),
      isOwn && onSwap ? h('td', {}, h('button', { class: 'mini', title: 'Byt: vælg to spillere', onclick: (e) => { e.stopPropagation(); onSwap(p); } }, '🔁')) : null);
  });

  return h('div', { class: 'panel' },
    h('div', { class: 'toolbar' }, FILTERS.filter(([v]) => v !== 'reserve' || team.squad.length > 18 || ui.filter === 'reserve').map(([v, label]) => h('button', { class: 'mini' + (ui.filter === v ? ' active' : ''), onclick: () => onFilter(v) }, v === 'all' ? `${label} (${team.squad.length})` : label))),

    h('div', { class: 'tablewrap' }, h('table', { id: 'matrix', class: 'matrix' }, h('thead', {}, head), h('tbody', {}, body))));
}
