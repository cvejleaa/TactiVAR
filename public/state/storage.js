// Gem og indlæs spillet i browseren (docs/spec.md §9). Reglen: en ny version må ALDRIG
// slette ligaen. Ældre skemaer migreres additivt; kan data ikke læses, lægges de rå data
// i en backup-nøgle, FØR der tilbydes en ny liga, og fejlen vises.
import { normalizeLeague, normalizeRule } from '../engine/sanitize.js';
import { COUNTER_KEYS, scaleIntoPool, counterFloor } from '../engine/counter.js';
import { heightAtQuantile, assignPositions } from '../engine/generator.js';

export const SAVE_KEY = 'tactivar_save';
export const BACKUP_PREFIX = 'tactivar_backup_';
export const SCHEMA_VERSION = 5;

// Migreringer: MIGRATIONS[n] løfter et gemt objekt fra skema n til n+1. Tilføj en ny,
// hver gang gemme-formatet ændres – sammen med et fixture fra forrige version i
// tests/fixtures/ og en test, der indlæser det (CLAUDE.md, "Farlige kommandoer").
export const MIGRATIONS = {
  // 1 → 2: Hvis-Så-regler får antal mål (margin) og kan pege på en plan (newPlan).
  1: (d) => {
    for (const t of d.league?.teams || []) for (const tac of [t.tactics, ...(t.tacticPresets || [])]) (tac?.conditionalRules || []).forEach(normalizeRule);
    return { ...d, schemaVersion: 2 };
  },
  // 2 → 3 (v3.6, brugerens ønske): mod-kunnen på den nye skala (×0,55, inden for puljen på
  // 100 – "man kan ikke være god imod alt") og spillerne 5 cm lavere ("snit på 186 cm, hvor
  // den gennemsnitlige dansker er 181"). Rækkefølgen mellem spillerne bevares (svagt: bunden kan samle nogle); luftduellen
  // genberegnes af normalizeLeague, og højden i scouting-indtrykkene rettes med.
  2: (d) => {
    const newHeight = new Map();
    for (const t of d.league?.teams || []) for (const p of t.squad || []) {
      if (p.counterTactics) {
        const floor = counterFloor(Number.isFinite(p.age) ? p.age : 20);
        const ct = Object.fromEntries(COUNTER_KEYS.map((k) => [k, Math.max(floor, Math.round((p.counterTactics[k] ?? 15) * HEIGHT_AND_COUNTER.counterScale))]));
        p.counterTactics = scaleIntoPool(ct, floor);
      }
      if (Number.isFinite(p.heightCm)) { newHeight.set(p.id, [p.heightCm, p.heightCm - HEIGHT_AND_COUNTER.heightShift]); p.heightCm -= HEIGHT_AND_COUNTER.heightShift; }
    }
    fixHeightTexts(d, newHeight);
    return { ...d, schemaVersion: 3 };
  },
  // 3 → 4 (v3.7, brugeren: "at skære 5 cm af alle spillere holder ikke … højeste spiller 193 cm"
  // og dokumentet "Spillerhøjde i Superligaen": ligasnit ≈184, 168–201). Pr. kæde lægges ligaens
  // spillere på generatorens fordeling efter rang: den højeste forsvarsspiller bliver ved med at
  // være den højeste, og hele ligaen får Superligaens snit og spredning. Holdprofilen kan ikke
  // genskabes for en eksisterende liga (snittet bruges).
  3: (d) => {
    const byLine = {};
    for (const t of d.league?.teams || []) for (const p of t.squad || []) if (Number.isFinite(p.heightCm)) (byLine[p.line] ||= []).push(p);
    const newHeight = new Map();
    for (const [line, list] of Object.entries(byLine)) {
      list.sort((a, b) => a.heightCm - b.heightCm || String(a.id).localeCompare(String(b.id)));
      list.forEach((p, i) => {
        const h = heightAtQuantile(line, (i + 0.5) / list.length, HEIGHT_V37);
        newHeight.set(p.id, [p.heightCm, h]); p.heightCm = h;
      });
    }
    fixHeightTexts(d, newHeight);
    return { ...d, schemaVersion: 4 };
  },
  // 4 → 5 (v3.8, dokumentets nye tabel "højde pr. position"): hver spiller får en naturlig
  // position (pr. hold og kæde efter højde – de højeste bliver stoppere/angribere, de laveste
  // backs/kanter), og højden lægges pr. position på generatorens fordeling efter rang i hele
  // ligaen. Den højeste stopper forbliver den højeste stopper.
  4: (d) => {
    const byPos = {};
    for (const t of d.league?.teams || []) {
      assignPositions(t.squad || []);
      for (const p of t.squad || []) if (Number.isFinite(p.heightCm)) (byPos[p.position] ||= []).push(p);
    }
    const newHeight = new Map();
    for (const [pos, list] of Object.entries(byPos)) {
      list.sort((a, b) => a.heightCm - b.heightCm || String(a.id).localeCompare(String(b.id)));
      list.forEach((p, i) => {
        const h = heightAtQuantile(pos, (i + 0.5) / list.length);
        newHeight.set(p.id, [p.heightCm, h]); p.heightCm = h;
      });
    }
    fixHeightTexts(d, newHeight);
    return { ...d, schemaVersion: 5 };
  },
};
// v3.7's fordeling pr. kæde – frosset, så migreringen 3 → 4 altid giver de samme højder.
export const HEIGHT_V37 = {
  GK: { mid: 192, dice: 4, min: 168, max: 201 }, DEF: { mid: 186, dice: 6, min: 168, max: 201 },
  MID: { mid: 179.5, dice: 6, min: 168, max: 201 }, ATT: { mid: 181, dice: 6, min: 168, max: 201 },
};

// Højden står i nogle tekster ("Navn (193 cm)"): scouting-indtryk og seneste rundes referat.
function fixHeightTexts(d, newHeight) {
  const fix = (pid, s) => { const h = newHeight.get(pid); return h && typeof s === 'string' ? s.replaceAll(`(${h[0]} cm)`, `(${h[1]} cm)`) : s; };
  for (const book of Object.values(d.league?.scouting || {})) for (const [pid, list] of Object.entries(book || {})) {
    if (Array.isArray(list)) book[pid] = list.map((s) => fix(pid, s));
  }
  // I referatet står spilleren som "#nr Kort Navn (N cm)" – ret pr. spiller.
  const players = (d.league?.teams || []).flatMap((t) => t.squad || []);
  for (const m of d.league?.lastRound?.matches || []) for (const e of m.events || []) {
    if (typeof e.text !== 'string' || !e.text.includes(' cm)')) continue;
    for (const p of players) {
      const h = newHeight.get(p.id);
      if (h) e.text = e.text.replaceAll(`#${p.shirtNumber} ${p.shortName} (${h[0]} cm)`, `#${p.shirtNumber} ${p.shortName} (${h[1]} cm)`);
    }
  }
}
export const HEIGHT_AND_COUNTER = { counterScale: 0.55, heightShift: 5 };

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
