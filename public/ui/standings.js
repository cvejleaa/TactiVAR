// Ligatabel: 3/1/0, sorteret på point → målforskel → scorede mål. Klik på et hold = scout det.
import { h } from './dom.js';
import { sortStandings } from '../engine/season.js';
import { opponentTacticKeys } from '../engine/counter.js';

export function renderStandings({ league, onPick, viewTeamId }) {
  const rows = sortStandings(league.leagueMetadata.standings);
  return h('div', { class: 'panel' }, h('h3', { id: 'standings-title' }, `${league.leagueMetadata.name} – efter ${league.leagueMetadata.round} runde(r)`),
    h('div', { class: 'tablewrap-x' }, h('table', { class: 'standings', id: 'standings' },
      h('thead', {}, h('tr', {}, ['#', 'Hold', 'Typisk stil', 'K', 'V', 'U', 'T', 'Mål', 'VAR ±', 'P'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((s, i) => h('tr', { class: (s.isBot ? '' : 'mine ') + (s.teamId === viewTeamId ? 'viewing' : ''), onclick: () => onPick(s.teamId), title: 'Klik for at scoute holdet' },
        h('td', {}, i + 1), h('td', {}, s.teamName), h('td', { class: 'muted style' }, opponentTacticKeys(league.teams.find((t) => t.id === s.teamId)).label), h('td', {}, s.played), h('td', {}, s.won), h('td', {}, s.drawn), h('td', {}, s.lost),
        h('td', {}, `${s.goalsFor}-${s.goalsAgainst}`), h('td', {}, s.varNet > 0 ? `+${s.varNet}` : s.varNet), h('td', { class: 'pts' }, s.points)))))));
}
