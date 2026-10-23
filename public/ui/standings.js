// Ligatabel: 3/1/0, sorteret på point → målforskel → scorede mål. Klik på et hold = scout det.
import { h } from './dom.js';
import { sortStandings } from '../engine/season.js';

export function renderStandings({ league, onPick, viewTeamId }) {
  // Lige efter sæsonslut (ingen runde spillet i den nye sæson): slutstillingen – ikke den nye sæsons nulstillede tabel
  // (brugeren v3.14.3: "man kan derfor ikke længere se slutstillingen for sæsonen").
  const md = league.leagueMetadata, last = league.seasons?.at(-1);
  if (last?.programmed && last.table?.length && md.round + 1 === league.seasonStartRound) return finalTable(league, last, onPick, viewTeamId);
  const rows = sortStandings(league.leagueMetadata.standings);
  return h('div', { class: 'panel' }, h('h3', { id: 'standings-title' }, `${league.leagueMetadata.name} – sæson ${league.leagueMetadata.seasonNumber}, efter ${league.leagueMetadata.round + 1 - league.seasonStartRound} af ${league.schedule.length} runder`),
    h('div', { class: 'tablewrap-x' }, h('table', { class: 'standings', id: 'standings' },
      h('thead', {}, h('tr', {}, ['#', 'Hold', 'K', 'V', 'U', 'T', 'Mål', 'VAR ±', 'P'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((s, i) => h('tr', { class: (s.isBot ? '' : 'mine ') + (s.teamId === viewTeamId ? 'viewing' : ''), onclick: () => onPick(s.teamId), title: 'Klik for at scoute holdet' },
        h('td', {}, i + 1), h('td', {}, s.teamName), h('td', {}, s.played), h('td', {}, s.won), h('td', {}, s.drawn), h('td', {}, s.lost),
        h('td', {}, `${s.goalsFor}-${s.goalsAgainst}`), h('td', {}, s.varNet > 0 ? `+${s.varNet}` : s.varNet), h('td', { class: 'pts' }, s.points)))))));
}

function finalTable(league, last, onPick, viewTeamId) {
  const mine = new Set(league.teams.filter((t) => !t.isBot).map((t) => t.id));
  return h('div', { class: 'panel' }, h('h3', { id: 'standings-title' }, `${league.leagueMetadata.name} – slutstilling, sæson ${last.seasonNumber}`),
    last.champion ? h('p', { id: 'standings-champion' }, `🏆 Mester: ${last.champion.teamName} (${last.champion.points} point). Sæson ${league.leagueMetadata.seasonNumber} starter med næste runde.`) : null,
    h('div', { class: 'tablewrap-x' }, h('table', { class: 'standings', id: 'standings' },
      h('thead', {}, h('tr', {}, ['#', 'Hold', 'K', 'V', 'U', 'T', 'Mål', 'VAR ±', 'P'].map((x) => h('th', {}, x)))),
      h('tbody', {}, last.table.map((s, i) => h('tr', { class: (mine.has(s.teamId) ? 'mine ' : '') + (s.teamId === viewTeamId ? 'viewing' : ''), onclick: () => onPick(s.teamId), title: 'Klik for at scoute holdet' },
        h('td', {}, i + 1), h('td', {}, s.teamName), h('td', {}, s.played), h('td', {}, s.won), h('td', {}, s.drawn), h('td', {}, s.lost),
        h('td', {}, `${s.goalsFor}-${s.goalsAgainst}`), h('td', {}, '–'), h('td', { class: 'pts' }, s.points)))))));
}
