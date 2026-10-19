// TactiVAR Manager – binder motor, gem og brugerflade sammen.
import { VERSION } from './version.js';
import { createRng, randomSeed } from './engine/rng.js';
import { createLeague } from './engine/generator.js';
import { loadGame, saveGame, resetGame, exportGame, importGame } from './state/storage.js';
import * as act from './state/actions.js';
import { h, select } from './ui/dom.js';
import { kr } from './ui/labels.js';
import { renderMatrix } from './ui/matrix.js';
import { renderCard } from './ui/card.js';
import { renderPitch } from './ui/pitch.js';
import { renderTactics } from './ui/tactics.js';
import { renderStandings } from './ui/standings.js';
import { playRound, commitRound, pairRound } from './engine/season.js';
import { renderLastRound, renderNextRound } from './ui/rounds.js';
import { renderMatchCenter, renderGazette } from './ui/matchcenter.js';

export const PLAYBACK_MS = 420;
let mc = null;            // Match Center: { round, matches, gazette, viewIdx, filter, shownCount, playing }
const TABS = [['trup', '👥 Trup'], ['taktik', '📋 Taktik'], ['kamp', '📺 Kamp'], ['liga', '🏆 Liga']];
// Seneste runde vist færdigspillet (Kamp-fanen uden igangværende afspilning).
const lastRoundView = (r) => ({ round: r.round, matches: r.matches, gazette: r.gazette, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false });
function showTab(k) { game.ui.tab = k; clearSwap(); view.notice = ''; persist(); render(); window.scrollTo(0, 0); }
let timer = null;

const storage = window.localStorage;
let game = null;          // { league, notes, ui } – det der gemmes
// pitchSwapId = det ene påbegyndte byt, uanset om det startede i regnearket, på banen eller på bænken.
let view = { viewTeamIdx: 0, sortCol: 'pos', sortDesc: false, filter: 'all', selectedPlayerId: null, pitchSwapId: null, notice: '', savedAt: null };

// Skift af hold/visning afbryder et påbegyndt byt, så et senere klik aldrig bytter uden varsel.
const clearSwap = () => { view.pitchSwapId = null; };
// Holdvælgeren viser holdet i Trup, hvis man står i Kamp/Liga (der ville valget ellers ikke ses).
function showTeam(idx) {
  view.viewTeamIdx = idx; clearSwap(); view.notice = ''; view.selectedPlayerId = game.league.teams[idx].squad[0].id;
  if (game.ui.tab === 'kamp' || game.ui.tab === 'liga') { game.ui.tab = 'trup'; persist(); }
  render();
}
// Et nyt spil (ny liga/import) må ikke vise den gamle ligas runde i Kamp-fanen.
function dropMatchView() { clearInterval(timer); timer = null; mc = null; }

const app = document.getElementById('app');
const controls = document.getElementById('controls');
document.getElementById('version').textContent = 'v' + VERSION;

const myIdx = () => game.league.teams.findIndex((t) => !t.isBot);
const myTeam = () => game.league.teams[myIdx()];

function newGame() {
  return { league: createLeague(createRng(randomSeed())), notes: {}, ui: { activePresetIndex: 0, opponentIdx: 1 } };
}

function persist() {
  const r = saveGame(storage, game);
  if (r.ok) { view.savedAt = r.savedAt; view.saveError = null; }
  else { view.saveError = r.error; window.tactivarFejl?.(r.error); }
}

// Én ændring = ændr, gem, tegn igen. Modstanderhold tilbyder ingen redigering (låste
// felter, ingen byt-knapper, ingen træk) – det er vagten, og e2e-testen holder øje med den.
// Den aktive plan holdes lig med live-taktikken, så Hvis-Så-regler til "Plan A" er det, man ser.
function change(fn) { fn(); act.syncActivePreset(myTeam(), game.ui.activePresetIndex); persist(); render(); }

function start() {
  const r = loadGame(storage);
  if (r.status === 'error') return renderLoadError(r);
  if (r.status === 'empty') { game = newGame(); persist(); }
  else {
    game = r.state; view.savedAt = r.state.savedAt;
    if (r.migratedFrom != null) {
      view.notice = migrationNotice(r.migratedFrom) + (r.backupKey ? ' Det gamle spil ligger som backup i browseren.' : '');
      view.backupKey = r.backupKey || null; // knap i beskeden: hent den gamle version som fil
      // Gem straks i det nye format (ellers tog hver genindlæsning en ny backup) – men kun
      // når backuppen af det gamle format lykkedes; ellers står det gamle urørt, og der advares.
      if (r.backupKey) persist();
      else window.tactivarFejl?.('Dit spil er opdateret, men der kunne ikke tages backup af det gamle format (er browserens lager fuldt?). Eksportér spillet med ⬇ Eksportér som sikkerhed.');
    }
  }
  view.viewTeamIdx = myIdx();
  view.selectedPlayerId = myTeam().squad[3].id;
  render();
}

// Startere under 70 % friskhed på dit hold (advarsel ved ▶) – under en fast starters ligevægt (≈75 %).
function tiredStarters() {
  const t = myTeam();
  return t.squad.filter((p) => t.tactics.lineupSlots.includes(p.id) && p.freshness < 70).length;
}

// Forklaringen på en migrering – både ved indlæsning og ved import af en ældre fil.
function migrationNotice(from) {
  if (from == null) return '';
  return 'Dit spil er opdateret: ' + [
    from <= 1 ? 'Hvis-Så-regler kan nu sættes til "Bagud/Foran med mindst N mål" og skifte til dine egne planer – "Foran med 1" gælder fra 1 mål og opefter.' : '',
    from <= 2 ? 'Mod-kunnen er sat ca. 45 % ned (alle hold): hver spiller har nu højst 100 point fordelt på de tre stilarter – lærer han noget nyt, glemmer han lidt af det gamle.' : '',
    from <= 3 ? 'Spillerhøjderne er rettet efter Superliga-målinger (ligasnit ca. 184 cm, 168–201 cm) – hver spiller beholder sin plads i højde-rækkefølgen i sin kæde, og luftduellerne er regnet om. Friskhed betyder nu noget: en kamp koster efter løbet distance, og en træt spiller yder mindre (50 % friskhed ≈ 12,5 % svagere).' : '',
  ].filter(Boolean).join(' ');
}

function renderLoadError(r) {
  controls.replaceChildren();
  app.replaceChildren(h('div', { class: 'panel errorpanel', id: 'load-error' },
    h('h2', {}, '⚠ Det gemte spil kunne ikke indlæses'),
    h('p', {}, r.error),
    r.backupKey ? h('p', {}, `Dine data er IKKE slettet: de er gemt i browseren under "${r.backupKey}". Hent dem som fil, og send filen med, hvis du vil have dem reddet.`) : null,
    r.backupKey ? h('button', { id: 'download-backup', onclick: () => download(storage.getItem(r.backupKey), `${r.backupKey}.json`) }, '⬇ Hent backup som fil') : null,
    h('div', { class: 'row' },
      h('button', { id: 'start-new', onclick: () => { const g = newGame(); const res = resetGame(storage, g); if (!res.ok) { window.tactivarFejl?.(res.error); return; } dropMatchView(); game = g; view.viewTeamIdx = myIdx(); render(); } }, '🎲 Start en ny liga'),
      importButton())));
  document.body.dataset.klar = 'ja';
}

function importButton() {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'import-file', onchange: async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = importGame(await file.text());
    if (!r.ok) { window.tactivarFejl?.(`Import mislykkedes: ${r.error}`); return; }
    const res = resetGame(storage, r.state);
    if (!res.ok) { window.tactivarFejl?.(res.error); return; }
    dropMatchView(); game = r.state; view.viewTeamIdx = myIdx(); view.notice = `Spillet er importeret fra ${file.name}.${res.backupKey ? ` Det tidligere spil ligger som backup (${res.backupKey}).` : ''} ${migrationNotice(r.migratedFrom)}`.trim(); view.savedAt = res.savedAt; render();
  } });
  return h('span', {}, input, h('button', { onclick: () => input.click() }, '⬆ Importér'));
}

function download(text, name) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}
const exportFile = () => download(exportGame(game), `tactivar-${new Date().toISOString().slice(0, 10)}.json`);

const time = (ms) => new Date(ms).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function renderControls() {
  const teams = game.league.teams;
  controls.replaceChildren(...[
    select(String(view.viewTeamIdx), teams.map((t, i) => [String(i), (t.isBot ? '' : '★ ') + t.name]), (v) => showTeam(Number(v)), { id: 'team-select', title: 'Vælg hold at se' }),
    // Kampknapperne står i topbaren, så de findes i alle visninger (også når man scouter).
    // Modstandervælgeren står ved ▶, fordi Mod-tallene og knappen begge gælder den valgte modstander.
    h('button', { id: 'play-round', class: 'primary', disabled: !!mc?.playing, onclick: playNextRound }, `▶ Spil runde ${game.league.leagueMetadata.round + 1} mod`),
    tiredStarters() ? h('span', { class: 'tired', id: 'tired-warning', title: 'Startere under 70 % friskhed – trætte spillere yder mindre (50 % ≈ 12,5 % svagere). Overvej at rotere i Trup' }, `⚠ ${tiredStarters()} trætte startere`) : null,
    select(String(game.ui.opponentIdx), teams.map((t, i) => [String(i), t.name]).filter(([i]) => Number(i) !== myIdx()), (v) => change(() => { game.ui.opponentIdx = Number(v); }), { id: 'opponent-select', title: 'Næste modstander', disabled: !!mc?.playing }),
    h('span', { class: 'savestatus' + (view.saveError ? ' failed' : ''), id: 'save-status' }, view.saveError ? '⚠ IKKE gemt' : view.savedAt ? `✔ Gemt kl. ${time(view.savedAt)}` : 'Ikke gemt'),
    h('button', { id: 'save-now', onclick: () => { persist(); render(); } }, '💾 Gem nu'),
    h('button', { id: 'export', onclick: exportFile }, '⬇ Eksportér'),
    importButton(),
    h('button', { id: 'new-league', onclick: () => {
      if (!confirm('Start en helt ny liga? Det nuværende spil gemmes som backup i browseren.')) return;
      const g = newGame(); const r = resetGame(storage, g);
      if (!r.ok) { window.tactivarFejl?.(r.error); return; }
      dropMatchView(); game = g; view = { ...view, viewTeamIdx: myIdx(), selectedPlayerId: null, notice: r.backupKey ? `Ny liga startet. Det gamle spil ligger som backup (${r.backupKey}).` : 'Ny liga startet.' }; view.savedAt = r.savedAt; render();
    } }, '🎲 Ny liga')].filter(Boolean));
}

function render() {
  const league = game.league;
  const team = league.teams[view.viewTeamIdx];
  const isOwn = !team.isBot;
  const opponent = league.teams[game.ui.opponentIdx] || league.teams[1];
  const selected = team.squad.find((p) => p.id === view.selectedPlayerId) || null;
  const mine = myTeam();
  renderControls();

  const header = h('div', { class: 'panel clubhead' },
    h('div', {}, h('h2', { id: 'club-name' }, team.name), h('div', { class: 'muted' }, isOwn ? 'Dit hold – alle egne data er synlige' : 'Modstanderhold – kun offentlige data og stjerner')),
    h('div', { class: 'right' }, h('div', { class: 'muted' }, 'Klubkasse'), h('strong', {}, isOwn ? kr(team.cashBalance) : '🔒 Skjult')));

  const matrix = renderMatrix({
    team, isOwn, opponent, ui: { ...view, swapId: view.pitchSwapId }, notes: game.notes,
    onSort: (c) => { if (view.sortCol === c.key) view.sortDesc = !view.sortDesc; else { view.sortCol = c.key; view.sortDesc = !!c.num; } clearSwap(); view.notice = ''; render(); },
    onBlocked: (c) => { view.notice = `🔒 Anti-spionage: du kan ikke sortere ${team.name} på "${c.label}" – det er skjult information.`; render(); },
    onSelect: (p) => { view.selectedPlayerId = p.id; render(); },
    onFilter: (f) => { view.filter = f; render(); },
    onSwap: (p) => {
      if (!view.pitchSwapId) { view.pitchSwapId = p.id; view.notice = `🔁 Vælg den spiller, ${p.shortName} skal byttes med (i regnearket, på banen eller på bænken).`; render(); return; }
      const a = view.pitchSwapId; clearSwap(); view.notice = '';
      change(() => act.swapPlayers(team, a, p.id));
    },
  });

  const card = renderCard({ player: selected, team, isOwn, opponent, scouting: league.scouting[mine.id]?.[selected?.id], note: selected ? game.notes[selected.id] : '',
    onNote: (v) => { game.notes[selected.id] = v; persist(); renderControls(); } });

  const pitch = h('div', { class: 'panel' }, h('h3', {}, `Taktiktavle – ${team.tactics.baseFormation}`),
    renderPitch({ team, isOwn, ui: view,
      onSelect: (p, own) => { view.selectedPlayerId = p.id; view.pitchSwapId = own ? (view.pitchSwapId === p.id ? null : p.id) : null; view.notice = view.pitchSwapId ? `🔁 Klik på en anden brik for at bytte ${p.shortName}s plads.` : ''; render(); },
      onTokenSwap: (a, b) => { clearSwap(); view.notice = ''; change(() => act.swapPlayers(team, a, b)); },
      onMove: (slot, pos) => { clearSwap(); change(() => act.moveSlot(team, slot, pos)); } }),
    isOwn ? renderBench(team) : null,
    isOwn ? h('div', { class: 'muted help' }, 'Træk = justér position (målmanden står fast) · Klik på to brikker = byt plads · Klik på en bænkspiller og så en brik = skift ind') : null);

  const tactics = renderTactics({ team, isOwn, ui: game.ui, on: {
    formation: (f) => change(() => act.setFormation(team, f)),
    preset: (i) => change(() => { act.switchPreset(team, game.ui.activePresetIndex, i); game.ui.activePresetIndex = i; }),
    resetDrag: () => change(() => act.resetDrag(team)),
    phase: (ph, f, v) => change(() => act.setPhase(team, ph, f, v)),
    rule: (i, patch) => change(() => act.updateRule(team, i, patch)),
    addRule: () => change(() => act.addRule(team)),
    removeRule: (i) => change(() => act.removeRule(team, i)),
  } });

  const standings = renderStandings({ league, viewTeamId: team.id, onPick: (id) => showTeam(league.teams.findIndex((t) => t.id === id)) });

  // Faner: ét emne ad gangen (brugerens ønske: "et noget rodet layout").
  const tab = TABS.some(([k]) => k === game.ui.tab) ? game.ui.tab : 'trup';
  const shown = mc || (league.lastRound ? lastRoundView(league.lastRound) : null);
  // Hver fane bygges kun, når den vises: banen og kortet er ét DOM-element og kan kun stå ét sted.
  const content = {
    // Opstilling sker i Trup: tallene og sorteringen over banen (brugeren: "nærmest umuligt at
    // opstille sit hold, da informationerne og sorteringsmulighederne ligger på 2 forskellige faner").
    trup: () => [header, matrix, h('div', { class: 'tactics-layout lineup-layout' }, h('section', {}, pitch), h('section', {}, card))],
    // Kortet står også i Taktik, så et klik på en brik viser spilleren uden fanebyt.
    taktik: () => [h('div', { class: 'tactics-layout' }, h('section', {}, pitch), h('section', {}, card, tactics))],
    kamp: () => [shown ? renderMatchCenter({ mc: shown, myTeamId: mine.id, on: mcHandlers }) : h('div', { class: 'panel empty', id: 'no-matches' }, 'Ingen kampe spillet endnu. Vælg modstander i topbaren og tryk ▶ Spil runde.')],
    liga: () => [mc?.playing ? h('div', { class: 'notice', id: 'booked-league' }, '📺 Runden spilles i Kamp-fanen – tabellen herunder er allerede opdateret med den.') : null,
      standings,
      // Resultaterne skjules under afspilningen, ligesom avisen (ellers afsløres de).
      league.lastRound && !mc?.playing ? renderLastRound({ round: league.lastRound, myTeamId: mine.id, onOpen: openReport }) : null,
      renderNextRound({ league, pairs: pairRound(league, game.ui.opponentIdx), myTeamId: mine.id }),
      league.lastRound && !mc?.playing ? renderGazette(league.lastRound.gazette, mine.id, openGoal, league.lastRound.matches) : null],
  }[tab]();
  app.replaceChildren(...[
    h('nav', { class: 'tabs', id: 'tabs' }, TABS.map(([k, label]) => h('button', { id: `tab-${k}`, class: 'tab' + (k === tab ? ' active' : ''), onclick: () => showTab(k) }, label))),
    view.notice ? h('div', { class: 'notice', id: 'notice' }, view.notice,
      view.backupKey && storage.getItem(view.backupKey) ? h('button', { class: 'mini', id: 'download-migration-backup', onclick: () => download(storage.getItem(view.backupKey), `${view.backupKey}.json`) }, ' ⬇ Hent backup som fil') : null) : null,
    h('div', { class: `tabpane tab-${tab}` }, ...content.filter(Boolean)),
  ].filter(Boolean));
  document.body.dataset.klar = 'ja';
}

// Bænken under banen: klik bænkspiller → klik brik (eller omvendt) = skift ind.
function renderBench(team) {
  const bench = team.squad.filter((p) => !team.tactics.lineupSlots.includes(p.id));
  return h('div', { class: 'bench', id: 'bench' }, h('h4', {}, 'Bænk'), bench.map((p) => h('button', {
    class: 'mini bench-p' + (view.pitchSwapId === p.id ? ' active' : '') + (p.injuryMatchesLeft > 0 ? ' injured' : ''), dataset: { pid: p.id },
    title: `${p.name} (${p.line})${p.injuryMatchesLeft > 0 ? ` – skadet i ${p.injuryMatchesLeft} kamp(e)` : ''}`,
    onclick: () => {
      const a = view.pitchSwapId;
      if (a && a !== p.id && team.tactics.lineupSlots.includes(a)) { clearSwap(); view.notice = ''; change(() => act.swapPlayers(team, a, p.id)); return; }
      view.selectedPlayerId = p.id; view.pitchSwapId = a === p.id ? null : p.id;
      view.notice = view.pitchSwapId ? `🔁 Klik på den brik, ${p.shortName} skal skiftes ind for.` : ''; render();
    },
  }, `#${p.shirtNumber} ${p.shortName} · ${p.line}`)));
}

// ---------- Kampe ----------
// Runden afvikles og bogføres + gemmes FØR afspilningen (rettet ift. v2.5b, der gemte
// før bogføringen) – lukkes fanen midt i, er runden alligevel talt med én gang.
// Knappen er spærret under afspilning (det er vagten mod at starte to runder).
function playNextRound() {
  clearSwap(); view.notice = '';
  const rng = createRng(randomSeed());
  const result = playRound(game.league, game.ui.opponentIdx, rng);
  commitRound(game.league, result, rng);
  game.ui.tab = 'kamp'; // gemmes med runden, så F5 midt i afspilningen lander i Kamp
  persist();
  openMatchCenter(result, true);
}

function openMatchCenter(result, live) {
  clearInterval(timer);
  mc = { round: result.round, matches: result.matches, gazette: result.gazette, viewIdx: 0, filter: 'all', shownCount: live ? 1 : Infinity, playing: live };
  game.ui.tab = 'kamp';
  render();
  window.scrollTo(0, 0);
  if (live) timer = setInterval(() => { mc.shownCount++; if (mc.shownCount >= mc.matches[0].events.length) finishPlayback(); else renderMc(); }, PLAYBACK_MS);
}

// Link fra avisens "Rundens mål" (Liga- og Kamp-fanen): åbn kampen, markér målet og rul til det.
function openGoal(i, goal) {
  mc = lastRoundView(game.league.lastRound); mc.viewIdx = i;
  mc.focus = { min: goal.min, scorer: goal.scorer };
  game.ui.tab = 'kamp'; clearSwap(); view.notice = ''; persist(); render();
  (document.getElementById('goal-focus') || document.getElementById('match-center'))?.scrollIntoView({ block: 'center' });
}

// Link fra Liga-siden til referatet af én kamp i seneste runde. Under afspilning vises
// resultaterne slet ikke (vagten står ét sted: i liga-fanens render).
function openReport(i) {
  mc = lastRoundView(game.league.lastRound); mc.viewIdx = i;
  showTab('kamp');
}

function finishPlayback() { clearInterval(timer); timer = null; mc.playing = false; mc.shownCount = Infinity; render(); }

const mcHandlers = {
  skip: finishPlayback,
  // Uden igangværende afspilning vises seneste runde; et valg af kamp/filter gemmer den som mc.
  view: (i) => { mc ||= lastRoundView(game.league.lastRound); mc.viewIdx = i; mc.focus = null; renderMc(); },
  openGoal: (i, goal) => openGoal(i, goal),
  filter: (f) => { mc ||= lastRoundView(game.league.lastRound); mc.filter = f; renderMc(); },
};
const matchCenterEl = () => renderMatchCenter({ mc, myTeamId: myTeam().id, on: mcHandlers });
// Under afspilning tegnes kun Match Center om (ikke hele siden).
function renderMc() { const el = document.getElementById('match-center'); if (el) el.replaceWith(matchCenterEl()); }

start();
