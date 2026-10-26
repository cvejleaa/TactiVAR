// Gem og indlæs spillet i browseren (docs/spec.md §9). Reglen: en ny version må ALDRIG
// slette ligaen. Ældre skemaer migreres additivt; kan data ikke læses, lægges de rå data
// i en backup-nøgle, FØR der tilbydes en ny liga, og fejlen vises.
import { normalizeLeague, normalizeRule } from '../engine/sanitize.js';
import { COUNTER_KEYS, scaleIntoPool, counterFloor } from '../engine/counter.js';
import { heightAtQuantile, assignPositions, teamCareerDefaults, FIRST_NAMES, LAST_NAMES } from '../engine/generator.js';
import { initialPotential, publicWage, uniquifyNames, derivedRng } from '../engine/career.js';
import { buildSchedule } from '../engine/schedule.js';
import { FORMATIONS, lineOfRole, positionOfRole, arrangeByFit } from '../engine/formations.js';
import { endSeason } from '../engine/season.js';

export const SAVE_KEY = 'tactivar_save';
export const BACKUP_PREFIX = 'tactivar_backup_';
export const SCHEMA_VERSION = 8;

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
  // 5 → 6 (v3.11, brugeren: "Kampprogram"): ligaen får et fast program på 14 runder. Tabellen,
  // der indtil nu bare er vokset, arkiveres som sæson 1 (uden program), og sæson 2 starter med
  // programmet og nulstillet sæsonstatistik – dermed forsvinder også forsvarernes clean sheets
  // (brugeren: "Det er kun målmanden der får Clean sheet"; fra nu tæller kun plads 0, ratings.js).
  // Spillere, friskhed og ligaens forløb bevares. Programmet bygges ud fra holdenes rækkefølge
  // (ingen tilfældighed), så to indlæsninger af samme fil giver samme program.
  5: (d) => {
    const L = d.league;
    if (!L || !Array.isArray(L.teams)) return { ...d, schemaVersion: 6 };
    const md = (L.leagueMetadata ||= {});
    md.seasonNumber ||= 1;
    L.seasonStartRound = 1;
    if ((md.round || 0) > 0 && Array.isArray(md.standings)) endSeason(L, md.round, false);
    L.schedule = buildSchedule(L.teams.map((t) => t.id));
    return { ...d, schemaVersion: 6 };
  },
  // 6 → 7 (v3.18.0, livsløb/økonomi/transfers): additive felter – ingen spiller ældes, ingen forsvinder. Navne-dubletter på
  // tværs af holdene omdøbes (brugeren), og teksterne rettes med (referat, arkiv, spejder-indtryk). Lønnen sættes efter de
  // offentlige data (én lønmodel, QC B6); markedsværdien efter evnerne fjernes (den røbede dem).
  6: (d) => {
    const L = d.league;
    if (!L || !Array.isArray(L.teams)) return { ...d, schemaVersion: 7 };
    for (const t of L.teams) {
      for (const p of t.squad || []) {
        p.trainingFocus ??= 'GENERAL'; p.dev ??= {}; p.matchLog ??= []; p.careerGames ??= p.ratingGames ?? 0;
        if (p.skills && p.line) p.potential ??= initialPotential(p);
        delete p.marketValue;
        p.weeklyWage = publicWage(p);
      }
      if (Array.isArray(t.squad) && t.tactics?.lineupSlots) Object.assign(t, { ...teamCareerDefaults(t.squad, t.tactics.lineupSlots), ...pick(t, ['matchBench', 'matchBenchAuto', 'finance', 'listed', 'youthOffers']) });
    }
    L.nextPlayerSeq ??= 1; L.transferLog ??= []; L.retired ??= []; L.offers ??= [];
    if (L.teams.every((t) => Array.isArray(t.squad))) {
      const renamed = uniquifyNames(L.teams, derivedRng('names-v7', L.leagueMetadata?.id ?? 'liga'), FIRST_NAMES, LAST_NAMES);
      fixNameTexts(L, renamed);
    }
    return { ...d, schemaVersion: 7 };
  },
  // 7 → 8 (v3.20.0): DM som naturlig position, og spil uden for position koster. Offentlige regler, intet andet ændres
  // (ingen højde, alder eller evner). Pr. hold ÉN CM → DM: (1) en CM på en CDM-plads, (2) en CM uden for startopstillingen,
  // der ikke er STAR, laveste rygnummer, (3) en CM, der ikke er STAR, laveste rygnummer. Botterne: som i en ny liga står
  // deres startere på pladsens position, når kæden passer, og de 11 fordeles efter position (samme 11 – QC B1: ellers fik
  // botterne straffen hver runde). Dit hold: kun DM-reglen – din opstilling og dine spilleres positioner røres ikke.
  7: (d) => {
    const L = d.league;
    if (!L || !Array.isArray(L.teams)) return { ...d, schemaVersion: 8 };
    for (const t of L.teams) {
      const squad = Array.isArray(t.squad) ? t.squad : [], slots = t.tactics?.lineupSlots ?? [], roles = (FORMATIONS[t.tactics?.baseFormation] || FORMATIONS['4-4-2']).map((s) => s.r);
      const byId = new Map(squad.map((p) => [p.id, p]));
      // Positionen bliver den rolle, han har spillet for botten (højden røres ikke – en migreret bots stopper kan være 178 cm)
      if (t.isBot) slots.forEach((id, i) => { const p = byId.get(id), to = roles[i] && positionOfRole(roles[i]); if (p && to && p.line === lineOfRole(roles[i])) p.position = to; });
      if (!squad.some((p) => p.position === 'DM')) {
        const cms = squad.filter((p) => p.position === 'CM').sort((a, b) => a.shirtNumber - b.shirtNumber);
        const onCdm = cms.find((p) => roles[slots.indexOf(p.id)] === 'CDM');
        const pick = onCdm ?? cms.find((p) => !slots.includes(p.id) && p.roleTier !== 'STAR') ?? cms.find((p) => p.roleTier !== 'STAR');
        if (pick) pick.position = 'DM';
      }
      if (t.isBot && slots.length === 11 && slots.every((id) => byId.has(id))) t.tactics.lineupSlots = arrangeByFit(slots.map((id) => byId.get(id)), t.tactics.baseFormation).map((p) => p.id);
    }
    return { ...d, schemaVersion: 8 };
  },
};
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// Et omdøbt kortnavn står i tekster (v3.18.0): "#nr Kort Navn" i referat og arkiv, kortnavnet i hans spejder-indtryk og i
// poster med hans id. Kun "#nr gammelt" erstattes – står to spillere med samme nummer og navn, er teksten tvetydig alligevel.
function fixNameTexts(L, renamed) {
  if (!renamed.length) return;
  const byId = new Map(renamed.map((r) => [r.id, r]));
  const walk = (v) => {
    if (typeof v === 'string') { for (const r of renamed) if (v.includes(`#${r.nr} ${r.from}`)) v = v.replaceAll(`#${r.nr} ${r.from}`, `#${r.nr} ${r.to}`); return v; }
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = walk(v[i]); return v; }
    if (v && typeof v === 'object') {
      const r = byId.get(v.playerId ?? v.id);
      if (r && v.shortName === r.from) v.shortName = r.to;
      for (const k of Object.keys(v)) v[k] = walk(v[k]);
    }
    return v;
  };
  walk(L.lastRound); walk(L.seasons); walk(L.lastSeasonStats); walk(L.history);
  for (const book of Object.values(L.scouting || {})) for (const r of renamed) {
    if (Array.isArray(book?.[r.id])) book[r.id] = book[r.id].map((s) => (typeof s === 'string' ? s.replaceAll(r.from, r.to) : s));
  }
}
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
  const { league, problems, notes } = normalizeLeague(data.league);
  if (!league || problems.length) return { ok: false, error: `Ligaen kunne ikke repareres: ${problems.join('; ')}` };
  const { opponentIdx, ...ui } = { activePresetIndex: 0, ...data.ui }; // modstandervælgeren findes ikke længere (v3.11)
  return { ok: true, state: { league, notes: data.notes && typeof data.notes === 'object' ? data.notes : {}, ui, savedAt: data.savedAt ?? null }, migratedFrom: from < SCHEMA_VERSION ? from : null, repairs: notes ?? [] };
}

// storage er window.localStorage (eller en erstatning i tests).
export function loadGame(storage) {
  let raw;
  try { raw = storage.getItem(SAVE_KEY); } catch (e) { return { status: 'error', error: `Browseren tillader ikke at læse gemte data (${e.message}).`, backupKey: null }; }
  if (raw == null) return { status: 'empty' };
  let r;
  // En fil, der får reparationen til at fejle, giver fejlvisningen med backup – aldrig en blank side (Security v3.18.0)
  try { r = parseSave(raw); } catch (e) { r = { ok: false, error: `Det gemte spil kunne ikke læses (${e.message}).` }; }
  // Et ældre skema migreres – de rå data gemmes i backup først, så opdateringen kan fortrydes.
  if (r.ok) return { status: 'ok', state: r.state, migratedFrom: r.migratedFrom, repairs: r.repairs, backupKey: r.migratedFrom != null || r.repairs?.length ? backupRaw(storage, raw) : null };
  const backupKey = backupRaw(storage, raw);
  return { status: 'error', error: r.error, backupKey };
}

// Højst BACKUP_KEEP backups (v3.18.0, brugeren: et gem på ≈ 750 KB fyldte ellers browserens lager efter 5–6 backups): er den
// rå tekst lig den nyeste backup, laves ingen ny (fejlsiden genindlæst skubber ikke backuppen fra før migreringen ud); ellers
// ryddes de ældste FØR der skrives (fuldt lager), og den nye er altid blandt de beholdte.
export const BACKUP_KEEP = 3;
export function backupKeys(storage) {
  const keys = [];
  try { for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(BACKUP_PREFIX)) keys.push(k); } } catch { /* ingen liste */ }
  return keys.sort((a, b) => Number(a.slice(BACKUP_PREFIX.length)) - Number(b.slice(BACKUP_PREFIX.length)));
}
export function backupRaw(storage, raw, now = Date.now()) {
  const old = backupKeys(storage), newest = old.at(-1);
  try { if (newest && storage.getItem(newest) === raw) return newest; } catch { /* læs fejlede – tag en ny */ }
  for (const k of old.slice(0, Math.max(0, old.length - (BACKUP_KEEP - 1)))) { try { storage.removeItem(k); } catch { /* lad stå */ } }
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
export const importGame = (text) => { try { return parseSave(text); } catch (e) { return { ok: false, error: `Filen kunne ikke læses (${e.message}).` }; } };
