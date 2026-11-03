// 🏠 Hjem (v3.28.0, UI-ombygningen F1): det ene sted, hvor runden forberedes – klubben, sidste runde, "Før du spiller",
// næste kamp og et udsnit af tabellen. Tallene regnes i app.js (homeData) fra de samme kilder som resten af appen; her tegnes de.
// Under afspilning (playing) skjules alt, der er bogført og ville afsløre runden – resultat, placering, kassens ændring,
// "Før du spiller", minitabellen og modstanderens placering og form (som Liga-fanen). Den ENE vagt står i denne funktion.
import { h } from './dom.js';
import { kr } from './labels.js';

const RESULT_WORD = { won: 'Sejr', drawn: 'Uafgjort', lost: 'Nederlag' };
const signedKr = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + kr(Math.abs(n));

export function renderHome({ club, last, place, ended, roundsPlayed, next, issues, youth, training, table, playing, on }) {
  const head = h('div', { class: 'panel home-club', id: 'home-club' },
    h('div', {}, h('h2', { id: 'club-name' }, club.name), h('div', { class: 'muted' }, 'Dit hold')),
    h('div', { class: 'right' }, h('div', { class: 'muted' }, 'Klubkasse'),
      h('button', { class: 'linklike', id: 'club-link', title: 'Økonomi, lønbudget og regnskab', onclick: on.klub }, h('strong', {}, kr(club.cash)), ' 💼'),
      !playing && club.delta != null ? h('div', { class: 'muted', id: 'cash-delta' }, `${signedKr(club.delta)} siden sidste runde`) : null));

  const nextCard = h('div', { class: 'panel home-next', id: 'home-next' },
    h('div', { class: 'lbl' }, `Næste kamp · runde ${next.k} af ${next.of}`),
    h('div', { class: 'home-big' }, next.name, h('span', { class: 'muted' }, ` · ${next.home ? 'hjemme' : 'ude'}`)),
    playing ? null : h('div', { class: 'muted', id: 'home-opp-form' }, `${roundsPlayed > 0 && !ended ? `Nr. ${next.place} · ` : ''}seneste 3: ${next.form.length ? next.form.join(' ') : 'ingen kampe i sæsonen endnu'}`),
    h('button', { class: 'linklike', id: 'home-opp-link', onclick: on.opp }, `🔍 Se ${next.name} – kun offentlige data ›`));

  if (playing) {
    return h('div', { class: 'home', id: 'home' }, head,
      h('div', { class: 'notice', id: 'home-playing' }, '📺 Runden spilles i Kamp-fanen – resultatet, tabellen og kassens ændring står her, når kampene er spillet. ',
        h('button', { class: 'linklike', onclick: on.kamp }, 'Se kampen ›')),
      nextCard);
  }

  const lastCard = last
    ? h('div', { class: 'panel home-last', id: 'home-last' },
      h('div', { class: 'home-last-main' },
        h('div', { class: 'lbl' }, `Sidste runde · runde ${last.round}`),
        h('div', { class: 'home-score' }, last.text),
        h('div', { class: 'muted' }, `${RESULT_WORD[last.result]} · ${last.scorers.length ? `Mål: ${last.scorers.join(', ')}` : 'ingen af dine mål'}`),
        last.att ? h('div', { class: 'muted', id: 'home-att' }, `${last.att} tilskuere`) : null),
      h('div', { class: 'right' },
        h('div', { class: 'home-place', id: 'home-place' }, `Nr. ${place}`, last.move ? h('span', { id: 'home-move', class: last.move > 0 ? 'up' : 'down' }, last.move > 0 ? ` ↑${last.move}` : ` ↓${-last.move}`) : null),
        h('div', { class: 'muted' }, ended ? 'slutstilling' : 'i tabellen'),
        h('button', { class: 'linklike', id: 'home-kamp', onclick: on.kamp }, 'Se kampen ›')))
    : h('div', { class: 'panel home-last', id: 'home-first' }, h('div', { class: 'lbl' }, 'Sæsonen'), h('div', {}, roundsPlayed > 0 ? `Nr. ${place} i tabellen.` : 'Sæsonen er ikke begyndt – din første kamp står herunder. Stil holdet på 📋 Taktik, og tryk ▶ Spil runde.'));

  const rows = issues.map((g) => h('div', { class: 'todo-row', dataset: { kind: g.kind, nrs: g.nrs.join(',') } },
    h('span', { class: `pill pill-${g.kind}` }, g.pill), h('span', { class: 'todo-txt' }, g.text),
    h('button', { class: 'linklike', onclick: () => on.fix(g.ids) }, 'Taktik ›')));
  const todo = h('div', { class: 'panel home-todo', id: 'home-todo' },
    h('div', { class: 'row lbl-row' }, h('div', { class: 'lbl' }, `Før du spiller runde ${next.k}`), issues.length ? h('span', { class: `pill pill-${issues[0].kind}` }, `${issues.length} ting`) : null),
    issues.length || youth ? null : h('div', { class: 'todo-row', id: 'home-ready' }, h('span', { class: 'pill pill-ok' }, '✔'), h('span', { class: 'todo-txt' }, 'Holdet er klar')),
    rows,
    youth ? h('div', { class: 'todo-row', id: 'youth-pending' }, h('span', { class: 'pill pill-ok' }, '🧒'), h('span', { class: 'todo-txt' }, `${youth} ungdomstilbud venter i sæsonrapporten`),
      h('button', { class: 'linklike', onclick: on.liga }, 'Liga ›')) : null,
    training ? h('div', { class: 'todo-row', id: 'home-training' }, h('span', { class: 'pill pill-info' }, '🏋️'),
      h('span', { class: 'todo-txt' }, `Efter runde ${training.round}: ` + [training.gains ? `${training.gains} fremskridt` : '', training.injuries ? `${training.injuries} skadet i træningen` : '', training.strong ? `${training.strong} ${training.strong === 1 ? 'nyt stærkt par' : 'nye stærke par'}` : ''].filter(Boolean).join(' · ')),
      // v3.30.0: fremskridt og skader står på 🏋️ Træning; er der KUN nye stærke par, står stregerne på Taktik (Spilfører UI)
      training.gains || training.injuries ? h('button', { class: 'linklike', onclick: on.traening }, 'Træning ›') : h('button', { class: 'linklike', onclick: on.taktik }, 'Taktik ›')) : null);

  const mini = h('div', { class: 'panel home-table', id: 'home-table' },
    h('div', { class: 'lbl' }, ended ? 'Slutstillingen' : 'Tabellen'),
    h('table', { class: 'mini-table' }, h('tbody', {}, table.map((r) => h('tr', { class: r.mine ? 'mine' : '' }, h('td', {}, r.pos), h('td', {}, r.name), h('td', { class: 'pts' }, r.points))))),
    h('button', { class: 'linklike', id: 'home-table-link', onclick: on.liga }, 'Hele tabellen ›'));

  return h('div', { class: 'home home-grid', id: 'home' }, head,
    h('div', { class: 'home-main' }, lastCard, todo),
    h('div', { class: 'home-side' }, nextCard, mini));
}
