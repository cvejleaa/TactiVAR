// Liga-siden: sidste rundes resultater (med link til referatet) og næste rundes kampe.
import { h } from './dom.js';

export function renderLastRound({ round, myTeamId, onOpen }) {
  return h('div', { class: 'panel', id: 'last-round' }, h('h3', {}, `Resultater – runde ${round.round}`),
    h('div', { class: 'fixtures' }, round.matches.map((m, i) => h('button', {
      class: 'fixture' + (m.homeId === myTeamId || m.awayId === myTeamId ? ' mine' : ''), title: 'Åbn referatet i Kamp-fanen', onclick: () => onOpen(i),
    }, h('span', { class: 'fx-team' }, m.homeName), h('strong', { class: 'fx-score' }, `${m.homeGoals}-${m.awayGoals}`), h('span', { class: 'fx-team right' }, m.awayName), h('span', { class: 'fx-link' }, '📺 Referat')))));
}

// Parringen følger pairRound: din kamp er mod den modstander, der er valgt ved ▶, og de
// øvrige par følger af det valg (der er endnu intet fast kampprogram – spec §10.7).
export function renderNextRound({ league, pairs, myTeamId }) {
  const t = league.teams;
  return h('div', { class: 'panel', id: 'next-round' }, h('h3', {}, `Næste runde – runde ${league.leagueMetadata.round + 1}`),
    h('div', { class: 'fixtures' }, pairs.map(([a, b]) => h('div', { class: 'fixture static' + (t[a].id === myTeamId || t[b].id === myTeamId ? ' mine' : '') },
      h('span', { class: 'fx-team' }, t[a].name), h('span', { class: 'fx-score muted' }, '–'), h('span', { class: 'fx-team right' }, t[b].name)))),
    h('div', { class: 'muted' }, 'Hele programmet afhænger af den modstander, du vælger ved ▶ Spil runde – de øvrige hold parres ud fra dit valg.'));
}
