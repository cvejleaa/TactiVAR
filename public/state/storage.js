// Gem og indlæs spillet i browseren (docs/spec.md §9). Reglen: en ny version må ALDRIG
// slette ligaen. Ældre skemaer migreres additivt; kan data ikke læses, lægges de rå data
// i en backup-nøgle, FØR der tilbydes en ny liga, og fejlen vises.
import { normalizeLeague, normalizeRule } from '../engine/sanitize.js';

export const SAVE_KEY = 'tactivar_save';
export const BACKUP_PREFIX = 'tactivar_backup_';
export const SCHEMA_VERSION = 2;

// Migreringer: MIGRATIONS[n] løfter et gemt objekt fra skema n til n+1. Tilføj en ny,
// hver gang gemme-formatet ændres – sammen med et fixture fra forrige version i
// tests/fixtures/ og en test, der indlæser det (CLAUDE.md, "Farlige kommandoer").
export const MIGRATIONS = {
  // 1 → 2: Hvis-Så-regler får antal mål (margin) og kan pege på en plan (newPlan).
  1: (d) => {
    for (const t of d.league?.teams || []) for (const tac of [t.tactics, ...(t.tacticPresets || [])]) (tac?.conditionalRules || []).forEach(normalizeRule);
    return { ...d, schemaVersion: 2 };
  },
};

export function serialize(state, now = Date.now()) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: now, league: state.league, notes: state.notes, ui: state.ui });
}

// Fortolker en gemt tekst. Returnerer { ok: true, state, migratedFrom } eller { ok: false, error }.
export function parseSave(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'Den gemte fil er ikke gyldig JSON.' }; }
  if (!data || typeof data !== 'object') return { ok: false, error: 'Den gemte fil er tom.' };
  const from = Number(data.schemaVersion);
  if (!Number.isInteger(from) || from < 0) return { ok: false, error: 'Den gemte fil har ingen gyldig skema-version.' };
  if (from > SCHEMA_VERSION) return { ok: false, error: `Den gemte fil er fra en nyere version (skema ${from}) end denne side (skema ${SCHEMA_VERSION}). Genindlæs siden.` };
  for (let v = from; v < SCHEMA_VERSION; v++) {
    if (!MIGRATIONS[v]) return { ok: false, error: `Der findes ingen migrering fra skema ${v}.` };
    data = MIGRATIONS[v](data);
  }
  const { league, problems } = normalizeLeague(data.league);
  if (!league || problems.length) return { ok: false, error: `Ligaen kunne ikke repareres: ${problems.join('; ')}` };
  const ui = { activePresetIndex: 0, opponentIdx: 1, ...data.ui };
  return { ok: true, state: { league, notes: data.notes && typeof data.notes === 'object' ? data.notes : {}, ui, savedAt: data.savedAt ?? null }, migratedFrom: from < SCHEMA_VERSION ? from : null };
}

// storage er window.localStorage (eller en erstatning i tests).
export function loadGame(storage) {
  let raw;
  try { raw = storage.getItem(SAVE_KEY); } catch (e) { return { status: 'error', error: `Browseren tillader ikke at læse gemte data (${e.message}).`, backupKey: null }; }
  if (raw == null) return { status: 'empty' };
  const r = parseSave(raw);
  // Et ældre skema migreres – de rå data gemmes i backup først, så opdateringen kan fortrydes.
  if (r.ok) return { status: 'ok', state: r.state, migratedFrom: r.migratedFrom, backupKey: r.migratedFrom != null ? backupRaw(storage, raw) : null };
  const backupKey = backupRaw(storage, raw);
  return { status: 'error', error: r.error, backupKey };
}

export function backupRaw(storage, raw, now = Date.now()) {
  const key = BACKUP_PREFIX + now;
  try { storage.setItem(key, raw); return key; } catch { return null; }
}

export function saveGame(storage, state, now = Date.now()) {
  try { storage.setItem(SAVE_KEY, serialize(state, now)); return { ok: true, savedAt: now }; }
  catch (e) { return { ok: false, error: `Spillet kunne ikke gemmes (${e.message}).` }; }
}

// Ny liga/import: den eksisterende gemte fil lægges i backup først, så det kan fortrydes.
// Mislykkes backuppen (fx fuldt lager), afbrydes det – det gamle spil overskrives aldrig uden backup.
export function resetGame(storage, newState, now = Date.now()) {
  let raw = null;
  try { raw = storage.getItem(SAVE_KEY); } catch { /* intet at tage backup af */ }
  let backupKey = null;
  if (raw != null) {
    backupKey = backupRaw(storage, raw, now);
    if (!backupKey) return { ok: false, error: 'Det nuværende spil kunne ikke sikkerhedskopieres (er browserens lager fuldt?). Intet er ændret – eksportér spillet først.', backupKey: null };
  }
  const saved = saveGame(storage, newState, now);
  return { ...saved, backupKey };
}

export const exportGame = (state, now = Date.now()) => serialize(state, now);
export const importGame = (text) => parseSave(text);
