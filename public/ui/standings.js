// Ligatabel: 3/1/0, sorteret på point → målforskel → scorede mål. Klik på et hold = scout det.
import { h } from './dom.js';
import { sortStandings, seasonJustEnded, championText } from '../engine/season.js';

// VAR ± – én celle for begge tabeller. Et arkiv fra før v3.16.3 har ingen varNet: "–".
export const varCell = (s) => (s.varNet == null ? '–' : s.varNet > 0 ? `+${s.varNet}` : String(s.varNet));

export function renderStandings({ league, onPick, viewTeamId, playing = false }) {
  // Lige efter sæsonslut (ingen runde spillet i den nye sæson): slutstillingen – ikke den nye sæsons nulstillede tabel
  // (brugeren v3.14.3: "man kan derfor ikke længere se slutstillingen for sæsonen").
  const last = seasonJustEnded(league);
  if (last) return finalTable(league, last, onPick, viewTeamId, playing);
  const rows = sortStandings(league.leagueMetadata.standings);
  return h('div', { class: 'panel' }, h('h3', { id: 'standings-title' }, `${league.leagueMetadata.name} – sæson ${league.leagueMetadata.seasonNumber}, efter ${league.leagueMetadata.round + 1 - league.seasonStartRound} af ${league.schedule.length} runder`),
    h('div', { class: 'tablewrap-x' }, h('table', { class: 'standings', id: 'standings' },
      h('thead', {}, h('tr', {}, ['#', 'Hold', 'K', 'V', 'U', 'T', 'Mål', 'VAR ±', 'P'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((s, i) => h('tr', { class: (s.isBot ? '' : 'mine ') + (s.teamId === viewTeamId ? 'viewing' : ''), onclick: () => onPick(s.teamId), title: 'Klik for at scoute holdet' },
        h('td', {}, i + 1), h('td', {}, s.teamName), h('td', {}, s.played), h('td', {}, s.won), h('td', {}, s.drawn), h('td', {}, s.lost),
        h('td', {}, `${s.goalsFor}-${s.goalsAgainst}`), h('td', {}, varCell(s)), h('td', { class: 'pts' }, s.points)))))));
}

function finalTable(league, last, onPick, viewTeamId, playing) {
  const mine = new Set(league.teams.filter((t) => !t.isBot).map((t) => t.id));
  return h('div', { class: 'panel' }, h('h3', { id: 'standings-title' }, `${league.leagueMetadata.name} – slutstilling, sæson ${last.seasonNumber}`),
    // Mesteren røbes ikke, mens sæsonens sidste runde spilles (QC v3.14.3) – tabellen er allerede bogført.
    last.champion && !playing ? h('p', { id: 'standings-champion' }, `🏆 ${championText(last.champion, last.myPos)}. Sæson ${league.leagueMetadata.seasonNumber} starter med næste runde.`) : null,
    h('div', { class: 'tablewrap-x' }, h('table', { class: 'standings', id: 'standings' },
      h('thead', {}, h('tr', {}, ['#', 'Hold', 'K', 'V', 'U', 'T', 'Mål', 'VAR ±', 'P'].map((x) => h('th', {}, x)))),
      h('tbody', {}, last.table.map((s, i) => h('tr', { class: (mine.has(s.teamId) ? 'mine ' : '') + (s.teamId === viewTeamId ? 'viewing' : ''), onclick: () => onPick(s.teamId), title: 'Klik for at scoute holdet' },
        h('td', {}, i + 1), h('td', {}, s.teamName), h('td', {}, s.played), h('td', {}, s.won), h('td', {}, s.drawn), h('td', {}, s.lost),
        h('td', {}, `${s.goalsFor}-${s.goalsAgainst}`), h('td', {}, varCell(s)), h('td', { class: 'pts' }, s.points)))))));
}
