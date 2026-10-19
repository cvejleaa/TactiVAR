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
import { playRound, commitRound } from './engine/season.js';
import { renderMatchCenter } from './ui/matchcenter.js';

export const PLAYBACK_MS = 420;
let mc = null;            // Match Center: { round, matches, gazette, viewIdx, filter, shownCount, playing }
let timer = null;

const storage = window.localStorage;
let game = null;          // { league, notes, ui } – det der gemmes
let view = { viewTeamIdx: 0, sortCol: 'pos', sortDesc: false, filter: 'all', selectedPlayerId: null, swapId: null, pitchSwapId: null, notice: '', savedAt: null };

// Skift af hold/visning afbryder et påbegyndt byt, så et senere klik aldrig bytter uden varsel.
const clearSwap = () => { view.swapId = null; view.pitchSwapId = null; };
function showTeam(idx) { view.viewTeamIdx = idx; clearSwap(); view.notice = ''; view.selectedPlayerId = game.league.teams[idx].squad[0].id; render(); }

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
  if (r.status === 'ok') { game = r.state; view.savedAt = r.state.savedAt; if (r.migratedFrom) view.notice = r.migratedFrom === 1 ? 'Dit spil er opdateret: Hvis-Så-regler kan nu sættes til "Bagud/Foran med mindst N mål" og skifte til dine egne planer. Dine regler er bevaret – "Foran med 1" gælder nu fra 1 mål og opefter.' : `Dit spil er opdateret fra et ældre gemme-format (skema ${r.migratedFrom}).`; }
  else if (r.status === 'empty') { game = newGame(); persist(); }
  else return renderLoadError(r);
  view.viewTeamIdx = myIdx();
  view.selectedPlayerId = myTeam().squad[3].id;
  render();
}

function renderLoadError(r) {
  controls.replaceChildren();
  app.replaceChildren(h('div', { class: 'panel errorpanel', id: 'load-error' },
    h('h2', {}, '⚠ Det gemte spil kunne ikke indlæses'),
    h('p', {}, r.error),
    r.backupKey ? h('p', {}, `Dine data er IKKE slettet: de er gemt i browseren under "${r.backupKey}". Hent dem som fil, og send filen med, hvis du vil have dem reddet.`) : null,
    r.backupKey ? h('button', { id: 'download-backup', onclick: () => download(storage.getItem(r.backupKey), `${r.backupKey}.json`) }, '⬇ Hent backup som fil') : null,
    h('div', { class: 'row' },
      h('button', { id: 'start-new', onclick: () => { const g = newGame(); const res = resetGame(storage, g); if (!res.ok) { window.tactivarFejl?.(res.error); return; } game = g; view.viewTeamIdx = myIdx(); render(); } }, '🎲 Start en ny liga'),
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
    game = r.state; view.viewTeamIdx = myIdx(); view.notice = `Spillet er importeret fra ${file.name}.${res.backupKey ? ` Det tidligere spil ligger som backup (${res.backupKey}).` : ''}`; view.savedAt = res.savedAt; render();
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
    h('button', { id: 'play-round', class: 'primary', disabled: !!mc?.playing, onclick: playNextRound }, `▶ Spil runde ${game.league.leagueMetadata.round + 1} mod ${teams[game.ui.opponentIdx].name}`),
    game.league.lastRound && !mc ? h('button', { id: 'open-last', onclick: () => openMatchCenter(game.league.lastRound, false) }, `📺 Se runde ${game.league.lastRound.round}`) : null,
    h('span', { class: 'savestatus' + (view.saveError ? ' failed' : ''), id: 'save-status' }, view.saveError ? '⚠ IKKE gemt' : view.savedAt ? `✔ Gemt kl. ${time(view.savedAt)}` : 'Ikke gemt'),
    h('button', { id: 'save-now', onclick: () => { persist(); render(); } }, '💾 Gem nu'),
    h('button', { id: 'export', onclick: exportFile }, '⬇ Eksportér'),
    importButton(),
    h('button', { id: 'new-league', onclick: () => {
      if (!confirm('Start en helt ny liga? Det nuværende spil gemmes som backup i browseren.')) return;
      const g = newGame(); const r = resetGame(storage, g);
      if (!r.ok) { window.tactivarFejl?.(r.error); return; }
      game = g; view = { ...view, viewTeamIdx: myIdx(), selectedPlayerId: null, notice: r.backupKey ? `Ny liga startet. Det gamle spil ligger som backup (${r.backupKey}).` : 'Ny liga startet.' }; view.savedAt = r.savedAt; render();
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

  const opponentPick = isOwn ? h('div', { class: 'panel row', id: 'opponent-bar' },
    h('label', {}, '🎯 Næste modstander ', select(String(game.ui.opponentIdx), league.teams.map((t, i) => [String(i), t.name]).filter(([i]) => Number(i) !== myIdx()), (v) => change(() => { game.ui.opponentIdx = Number(v); }), { id: 'opponent-select' })),
    h('span', { class: 'muted' }, '🧠 Mod-kolonnen: erfaring mod gegenpress · lav blok · VAR-linje & lange bolde')) : null;

  const matrix = renderMatrix({
    team, isOwn, opponent, ui: { ...view }, notes: game.notes,
    onSort: (c) => { if (view.sortCol === c.key) view.sortDesc = !view.sortDesc; else { view.sortCol = c.key; view.sortDesc = !!c.num; } clearSwap(); view.notice = ''; render(); },
    onBlocked: (c) => { view.notice = `🔒 Anti-spionage: du kan ikke sortere ${team.name} på "${c.label}" – det er skjult information.`; render(); },
    onSelect: (p) => { view.selectedPlayerId = p.id; render(); },
    onFilter: (f) => { view.filter = f; render(); },
    onSwap: (p) => {
      if (!view.swapId) { view.swapId = p.id; view.notice = `🔁 Vælg den spiller, ${p.shortName} skal byttes med.`; render(); return; }
      const a = view.swapId; clearSwap(); view.notice = '';
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
    isOwn ? h('div', { class: 'muted help' }, 'Træk = justér position (målmanden står fast) · Klik på to brikker = byt plads · Bænkspillere skiftes ind med 🔁 i regnearket') : null);

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

  app.replaceChildren(...[
    view.notice ? h('div', { class: 'notice', id: 'notice' }, view.notice) : null,
    mc ? matchCenterEl() : null,
    // Regnearket i fuld bredde øverst (intet sidelæns scroll); spillerkort, bane og
    // taktik + tabel side om side nedenunder.
    h('div', { class: 'layout' },
      h('section', { class: 'top' }, header, opponentPick, matrix),
      h('div', { class: 'cols' },
        h('section', { class: 'c-card' }, card),
        h('section', { class: 'c-pitch' }, pitch),
        h('section', { class: 'c-tac' }, tactics, standings)))].filter(Boolean));
  document.body.dataset.klar = 'ja';
}

// ---------- Kampe ----------
// Runden afvikles og bogføres + gemmes FØR afspilningen (rettet ift. v2.5b, der gemte
// før bogføringen) – lukkes fanen midt i, er runden alligevel talt med én gang.
// Knappen er spærret under afspilning (det er vagten mod at starte to runder).
function playNextRound() {
  const rng = createRng(randomSeed());
  const result = playRound(game.league, game.ui.opponentIdx, rng);
  commitRound(game.league, result, rng);
  persist();
  openMatchCenter(result, true);
}

function openMatchCenter(result, live) {
  clearInterval(timer);
  mc = { round: result.round, matches: result.matches, gazette: result.gazette, viewIdx: 0, filter: 'all', shownCount: live ? 1 : Infinity, playing: live };
  render();
  document.getElementById('match-center')?.scrollIntoView({ block: 'start' });
  if (live) timer = setInterval(() => { mc.shownCount++; if (mc.shownCount >= mc.matches[0].events.length) finishPlayback(); else renderMc(); }, PLAYBACK_MS);
}

function finishPlayback() { clearInterval(timer); timer = null; mc.playing = false; mc.shownCount = Infinity; render(); }

const mcHandlers = {
  skip: finishPlayback,
  close: () => { clearInterval(timer); mc = null; render(); },
  view: (i) => { mc.viewIdx = i; renderMc(); },
  filter: (f) => { mc.filter = f; renderMc(); },
};
const matchCenterEl = () => renderMatchCenter({ mc, myTeamId: myTeam().id, on: mcHandlers });
// Under afspilning tegnes kun Match Center om (ikke hele siden).
function renderMc() { const el = document.getElementById('match-center'); if (el) el.replaceWith(matchCenterEl()); }

start();
