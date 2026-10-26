// 💼 Klub (v3.18.0): dit holds økonomi – kasse, lønbudget, prognose og regnskab. Kun dit hold (kassen er ejerens, viewTeam).
// Alt vises pr. runde; "1 uge = 3 runder" står én gang (QC B6).
import { h } from './dom.js';
import { kr } from './labels.js';
import { weeklyWages, wagesPerRound, wageBudget, wageRoomPerRound, attendance, formOf, TV_PER_ROUND, TICKET_PRICE, GATE_MAX, PRIZE, ROUNDS_PER_WEEK, publicValue } from '../engine/career.js';
import { placesBefore } from '../engine/season.js';
import { windowOf } from '../engine/transfers.js';
import { SEASON_ROUNDS, seasonRoundOf } from '../engine/schedule.js';

const net = (e) => (e.gate ?? 0) + (e.tv ?? 0) + (e.wages ?? 0) + (e.prize ?? 0) + (e.transfers ?? 0);
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + kr(Math.abs(n));
// Under afspilningen er runden bogført, men kampene ikke vist: kassen og regnskabet vises som før runden (præmien ville afsløre slutstillingen)
export const shownLedger = (team, playing) => (playing ? team.finance.ledger.slice(0, -1) : team.finance.ledger);
export const shownCash = (team, playing) => (playing && team.finance.ledger.length ? team.cashBalance - net(team.finance.ledger.at(-1)) : team.cashBalance);

// Prognose til sæsonslut: de resterende runder (TV − løn, billetter i hjemmekampene efter placeringen nu) + præmien for pladsen nu
export function forecast(league, team) {
  const next = league.leagueMetadata.round + 1, from = seasonRoundOf(league, next);
  const places = placesBefore(league, next), myPlace = places.get(team.id);
  let sum = 0, home = 0;
  for (let r = from; r <= SEASON_ROUNDS; r++) {
    sum += TV_PER_ROUND - wagesPerRound(team);
    const pair = league.schedule[r - 1]?.find(([a, b]) => a === team.id || b === team.id);
    if (pair && pair[0] === team.id) { home++; sum += attendance(myPlace, places.get(pair[1]), formOf(team)) * TICKET_PRICE; }
  }
  const prize = PRIZE[Math.round(myPlace) - 1] ?? 0;
  return { rounds: SEASON_ROUNDS - from + 1, home, prize, end: team.cashBalance + sum + prize };
}

export function renderClub({ league, team, playing }) {
  if (playing) return h('div', { class: 'panel notice', id: 'club-booked' }, '📺 Runden spilles i Kamp-fanen – regnskabet viser den, når kampene er spillet.');
  const cash = team.cashBalance, room = wageRoomPerRound(team), fc = forecast(league, team);
  const ledger = shownLedger(team, false).slice().reverse();
  // Lige efter sæsonslut er den nye sæson tom: vis den afsluttede (Spilfører/egen gennemgang: "Sæsonen indtil nu: 0 kr.")
  const cur = team.finance.season ?? {}, ended = !Object.keys(cur).length && team.finance.lastSeason;
  const s = ended ? team.finance.lastSeason : cur;
  const row = (label, v, id) => h('tr', id ? { id } : {}, h('th', {}, label), h('td', { class: 'num' }, v));
  return h('div', { class: 'panel club', id: 'club' },
    h('h3', {}, '💼 Klub – økonomi'),
    h('table', { class: 'club-sum' }, h('tbody', {},
      row('Klubkasse', h('strong', { class: cash < 0 ? 'neg' : '' }, kr(cash)), 'club-cash'),
      row('Løn', `${kr(wagesPerRound(team))} pr. runde (${kr(weeklyWages(team))} pr. uge – 1 uge = ${ROUNDS_PER_WEEK} runder)`, 'club-wages'),
      row('Lønbudget', room >= 0 ? `Du kan bruge ${kr(room)} mere pr. runde i løn` : `Du er ${kr(-room)} over budgettet pr. runde`, 'club-room'),
      row('Indtægter pr. runde', `TV ${kr(TV_PER_ROUND)} · billetter i hjemmekampe (op til ${GATE_MAX.toLocaleString('da-DK')} tilskuere à ${TICKET_PRICE} kr.)`),
      row('Prognose ved sæsonslut', h('span', { class: fc.end < 0 ? 'neg' : '' }, `${kr(Math.round(fc.end / 1000) * 1000)} (${fc.rounds} runder, ${fc.home} hjemme, præmie for pladsen nu ${kr(fc.prize)})`), 'club-forecast'))),
    fc.end < 0 ? h('div', { class: 'notice', id: 'club-warning' }, `⚠ Kassen ender i minus ved sæsonslut, hvis intet ændres. Ingen sælges automatisk – du vælger selv. I minus kan du ikke købe spillere.`) : null,
    h('div', { class: 'muted' }, `Lønbudget pr. uge: ${kr(Math.round(wageBudget(team)))} (1,7 mio. kr. + 2 % af kassen). Præmier: ${PRIZE.map((p, i) => `${i + 1}. ${(p / 1e6).toLocaleString('da-DK')}`).join(' · ')} mio. kr.`),
    h('h4', {}, `${ended ? 'Den afsluttede sæson' : 'Sæsonen indtil nu'}: ${signed(net(s))}`),
    h('div', { class: 'muted', id: 'club-season' }, `Billetter ${kr(s.gate ?? 0)} · TV ${kr(s.tv ?? 0)} · Løn ${kr(Math.abs(s.wages ?? 0))}${s.prize ? ` · Præmie ${kr(s.prize)}` : ''}${s.transfers ? ` · Transfers ${signed(s.transfers)}` : ''}`),
    h('h4', {}, 'Regnskab pr. runde'),
    ledger.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'ledger', id: 'ledger' },
      h('thead', {}, h('tr', {}, ['Runde', 'Tilskuere', 'Billetter', 'TV', 'Løn', 'Præmie/transfers', 'Kasse'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ledger.map((e) => h('tr', {},
        h('td', {}, `S${e.s} R${e.r - (league.seasons?.find((x) => x.seasonNumber === e.s)?.fromRound ?? league.seasonStartRound) + 1}`),
        h('td', { class: 'num' }, e.att ? `${e.att.toLocaleString('da-DK')} af ${GATE_MAX.toLocaleString('da-DK')}` : 'ude'),
        h('td', { class: 'num' }, e.gate ? kr(e.gate) : '–'), h('td', { class: 'num' }, kr(e.tv ?? 0)), h('td', { class: 'num' }, kr(Math.abs(e.wages ?? 0))),
        h('td', { class: 'num' }, [e.prize ? `🏆 ${kr(e.prize)}` : '', e.transfers ? signed(e.transfers) : ''].filter(Boolean).join(' ') || '–'),
        h('td', { class: 'num' + (e.cash < 0 ? ' neg' : '') }, kr(e.cash))))))) : h('div', { class: 'muted', id: 'ledger-empty' }, 'Regnskabet starter efter første runde.'));
}

// 🔁 Transfermarked (v3.18.0): vinduet, dine spillere til salg med botternes bud, og hvordan man køber
export function renderMarket({ league, team, playing, onAccept, onDecline, onUnlist }) {
  if (playing) return null;
  const w = windowOf(league), offers = (league.offers ?? []).filter((o) => o.from === team.id);
  const listed = (team.listed ?? []).map((id) => team.squad.find((p) => p.id === id)).filter(Boolean);
  const teamName = (id) => league.teams.find((t) => t.id === id)?.name ?? '?';
  return h('div', { class: 'panel market', id: 'market' },
    h('h3', {}, '🔁 Transfermarked'),
    h('p', { id: 'window-state', class: w != null ? 'open' : 'muted' }, w != null
      ? '🟢 Vinduet er åbent til næste runde. Køb: vælg et andet hold i holdvælgeren og klik på en spiller – prisen står på kortet.'
      : '🔴 Vinduet er lukket. Det åbner før sæsonens runde 8 og ved sæsonslut. Spillere til salg får bud, når det åbner.'),
    h('h4', {}, `Dine spillere til salg (${listed.length})`),
    listed.length ? listed.map((p) => {
      const o = offers.find((x) => x.playerId === p.id);
      return h('div', { class: 'market-row', dataset: { pid: p.id } }, `#${p.shirtNumber} ${p.shortName} (${kr(publicValue(p))}) `,
        o ? [h('strong', {}, `Bud fra ${teamName(o.to)}: ${kr(o.price)} `), h('button', { class: 'mini offer-accept', onclick: () => onAccept(p.id) }, 'Sælg'), h('button', { class: 'mini offer-decline', onclick: () => onDecline(p.id) }, 'Afvis')]
          : h('span', { class: 'muted' }, w != null ? 'Intet bud – ingen klub har råd og plads lige nu. ' : 'Venter på vinduet. '),
        h('button', { class: 'mini linklike', onclick: () => onUnlist(p.id) }, 'Fjern fra listen'));
    }) : h('p', { class: 'muted', id: 'market-empty' }, 'Ingen. Sæt en spiller til salg på hans spillerkort (dit hold).'));
}

// Ligaens transfers (offentligt): de seneste skifter og fritstillinger
export function renderTransferLog({ league }) {
  const log = (league.transferLog ?? []).slice(-12).reverse();
  if (!log.length) return null;
  const name = (id) => league.teams.find((t) => t.id === id)?.name ?? '?';
  return h('div', { class: 'panel', id: 'transfer-log' }, h('h3', {}, '🔁 Transfers'),
    log.map((e) => h('div', { class: 'tlog-row' }, e.kind === 'release' ? `S${e.s}: ${e.name} er fritstillet af ${name(e.from)}.` : `S${e.s}: ${e.name} ${name(e.from)} → ${name(e.to)} for ${kr(e.price)}.`)));
}
