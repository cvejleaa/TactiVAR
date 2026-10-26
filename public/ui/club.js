// 💼 Klub (v3.18.0): dit holds økonomi – kasse, lønbudget, prognose og regnskab. Kun dit hold (kassen er ejerens, viewTeam).
// Alt vises pr. runde; "1 uge = 3 runder" står én gang (QC B6).
import { h } from './dom.js';
import { kr } from './labels.js';
import { weeklyWages, wagesPerRound, wageBudget, wageRoomPerRound, attendance, formOf, TV_PER_ROUND, TICKET_PRICE, GATE_MAX, PRIZE, ROUNDS_PER_WEEK } from '../engine/career.js';
import { placesBefore } from '../engine/season.js';
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
  const s = team.finance.season ?? {};
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
    h('div', { class: 'muted' }, `Lønbudget pr. uge: ${kr(Math.round(wageBudget(team)))} (1,35 mio. kr. + 2 % af kassen). Præmier: ${PRIZE.map((p, i) => `${i + 1}. ${(p / 1e6).toLocaleString('da-DK')}`).join(' · ')} mio. kr.`),
    h('h4', {}, `Sæsonen indtil nu: ${signed(net(s))}`),
    h('div', { class: 'muted', id: 'club-season' }, `Billetter ${kr(s.gate ?? 0)} · TV ${kr(s.tv ?? 0)} · Løn ${kr(-(s.wages ?? 0))}${s.prize ? ` · Præmie ${kr(s.prize)}` : ''}${s.transfers ? ` · Transfers ${signed(s.transfers)}` : ''}`),
    h('h4', {}, 'Regnskab pr. runde'),
    ledger.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'ledger', id: 'ledger' },
      h('thead', {}, h('tr', {}, ['Runde', 'Tilskuere', 'Billetter', 'TV', 'Løn', 'Præmie/transfers', 'Kasse'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ledger.map((e) => h('tr', {},
        h('td', {}, `S${e.s} R${e.r - (league.seasons?.find((x) => x.seasonNumber === e.s)?.fromRound ?? league.seasonStartRound) + 1}`),
        h('td', { class: 'num' }, e.att ? `${e.att.toLocaleString('da-DK')} af ${GATE_MAX.toLocaleString('da-DK')}` : 'ude'),
        h('td', { class: 'num' }, e.gate ? kr(e.gate) : '–'), h('td', { class: 'num' }, kr(e.tv ?? 0)), h('td', { class: 'num' }, kr(-(e.wages ?? 0))),
        h('td', { class: 'num' }, [e.prize ? `🏆 ${kr(e.prize)}` : '', e.transfers ? signed(e.transfers) : ''].filter(Boolean).join(' ') || '–'),
        h('td', { class: 'num' + (e.cash < 0 ? ' neg' : '') }, kr(e.cash))))))) : h('div', { class: 'muted', id: 'ledger-empty' }, 'Regnskabet starter efter første runde.'));
}
