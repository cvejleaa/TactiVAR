// Liga-siden: sidste rundes resultater (med link til referatet) og kampprogrammet.
import { h } from './dom.js';

export function renderLastRound({ round, myTeamId, onOpen }) {
  return h('div', { class: 'panel', id: 'last-round' }, h('h3', {}, `Resultater – runde ${round.round}`),
    h('div', { class: 'fixtures' }, round.matches.map((m, i) => h('button', {
      class: 'fixture' + (m.homeId === myTeamId || m.awayId === myTeamId ? ' mine' : ''), title: 'Åbn referatet i Kamp-fanen', onclick: () => onOpen(i),
    }, h('span', { class: 'fx-team' }, m.homeName), h('strong', { class: 'fx-score' }, `${m.homeGoals}-${m.awayGoals}`), h('span', { class: 'fx-team right' }, m.awayName), h('span', { class: 'fx-link' }, '📺 Referat')))));
}

// Kampprogrammet (v3.11): næste runde (præcis de kampe, ▶ spiller – samme retning), dit
// program for sæsonen med resultater og det fulde program og tidligere sæsoner sammenfoldet.
// Vises ikke under afspilning (resultaterne er bogført og ville afsløre runden).
export function renderSchedule({ league, pairs, myTeamId }) {
  const t = league.teams, md = league.leagueMetadata, start = league.seasonStartRound;
  const name = new Map(t.map((x) => [x.id, x.name]));
  const results = new Map((league.history || []).map((r) => [r.round, r.results || []]));
  const resultOf = (k, hId, aId) => results.get(start + k - 1)?.find((x) => x.h === hId && x.a === aId) || null;
  const nextK = md.round + 2 - start;
  const fixture = (hId, aId, res) => h('div', { class: 'fixture static' + (hId === myTeamId || aId === myTeamId ? ' mine' : '') },
    h('span', { class: 'fx-team' }, name.get(hId)), h('span', { class: 'fx-score' + (res ? '' : ' muted') }, res ? `${res.hG}-${res.aG}` : '–'), h('span', { class: 'fx-team right' }, name.get(aId)));
  const mine = league.schedule.map((ps, i) => ({ k: i + 1, p: ps.find((x) => x.includes(myTeamId)) })).filter((x) => x.p);
  return h('div', { class: 'panel', id: 'schedule' },
    h('h3', { id: 'next-round-title' }, `Næste runde – sæson ${md.seasonNumber}, runde ${nextK} af ${league.schedule.length}`),
    h('div', { class: 'fixtures', id: 'next-round' }, pairs.map(([a, b]) => fixture(t[a].id, t[b].id, null))),
    h('h4', {}, 'Dit program'),
    h('table', { class: 'my-schedule', id: 'my-schedule' }, h('tbody', {}, mine.map(({ k, p: [hId, aId] }) => {
      const home = hId === myTeamId, res = resultOf(k, hId, aId);
      const score = res ? (home ? `${res.hG}-${res.aG}` : `${res.aG}-${res.hG}`) : '–';
      const my = res ? (home ? res.hG - res.aG : res.aG - res.hG) : null;
      return h('tr', { class: (k === nextK ? 'next ' : '') + (my == null ? '' : my > 0 ? 'won' : my < 0 ? 'lost' : 'drawn') },
        h('td', {}, `R${k}`), h('td', { title: home ? 'Hjemme' : 'Ude' }, home ? 'H' : 'U'), h('td', {}, name.get(home ? aId : hId)), h('td', { class: 'st-val' }, score));
    }))),
    h('p', { class: 'muted' }, 'H = hjemme, U = ude. Din score står først (i Hele programmet står hjemmeholdets først). Alle møder alle hjemme og ude; der er ingen hjemmebanefordel.'),
    h('details', { class: 'stats-sec', id: 'full-schedule' }, h('summary', {}, 'Hele programmet'),
      league.schedule.map((ps, i) => h('div', {}, h('h4', {}, `Runde ${i + 1}`), h('div', { class: 'fixtures' }, ps.map(([a, b]) => fixture(a, b, resultOf(i + 1, a, b))))))),
    league.seasons?.length ? h('details', { class: 'stats-sec', id: 'past-seasons' }, h('summary', {}, 'Tidligere sæsoner'),
      league.seasons.slice().reverse().map((s) => h('div', { class: 'past-season' },
        h('h4', {}, `Sæson ${s.seasonNumber}${s.programmed ? '' : ' (uden program)'} – runde ${s.fromRound}–${s.toRound}`),
        h('p', {}, [s.champion ? (s.programmed ? `🏆 Mester: ${s.champion.teamName} (${s.champion.points} point).` : `Førende ved afslutningen: ${s.champion.teamName} (${s.champion.points} point).`) : '', s.myPos ? `Din placering: nr. ${s.myPos}.` : '',
          s.topScorer ? `Topscorer: #${s.topScorer.shirtNumber} ${s.topScorer.shortName} (${s.topScorer.teamName}), ${s.topScorer.goals} mål.` : '',
          s.myBest ? `Din bedste: #${s.myBest.shirtNumber} ${s.myBest.shortName} (${s.myBest.motm}× kampens spiller, ${s.myBest.goals} mål).` : '',
          s.statsFrom > s.fromRound ? `Spillertallene gælder fra sæsonens runde ${s.statsFrom - s.fromRound + 1}.` : ''].filter(Boolean).join(' ')),
        h('ol', { class: 'past-table' }, s.table.map((r) => h('li', { class: r.teamId === myTeamId ? 'mine' : '' }, `${r.teamName} – ${r.points} p (${r.goalsFor}-${r.goalsAgainst})`)))))) : null);
}
