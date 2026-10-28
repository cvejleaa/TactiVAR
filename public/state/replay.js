// Gengivelsespakken for den seneste runde (v3.24.3, kamp-id): ligger under sin egen nøgle – ikke i gemmet (så det ikke vokser
// med ~2 hold pr. kamp, og backups og eksport ikke bærer rundens rng-tilstande). Overskrives hver runde; ryddes ved ny liga.
export const REPLAY_KEY = 'tactivar_replay';
export function saveReplay(storage, replay) {
  try { storage.setItem(REPLAY_KEY, JSON.stringify(replay)); return true; } catch { return false; }   // fuldt lager: kampen kan sendes uden gengivelse
}
export function loadReplay(storage) {
  try { const r = JSON.parse(storage.getItem(REPLAY_KEY) ?? 'null'); return r && Number.isInteger(r.round) && Array.isArray(r.packs) ? r : null; } catch { return null; }
}
export function clearReplay(storage) { try { storage.removeItem(REPLAY_KEY); } catch { /* intet */ } }
// Pakken til en bestemt kamp i runden – kun når runden og holdene passer (ellers er den fra en anden runde/liga)
export function replayOf(replay, round, idx, match) {
  const p = replay?.round === round ? replay.packs?.[idx] : null;
  return p && p.home?.id === match.homeId && p.away?.id === match.awayId ? p : null;
}
// Sendte kamp-id'er (QC v3.24.3: id'et må ikke forsvinde med næste runde). De nyeste 30, under egen nøgle; ryddes IKKE ved
// ny liga – kampene ligger stadig i Firestore og kan stadig hentes.
export const SENT_KEY = 'tactivar_sent';
export const SENT_MAX = 30;
export function loadSent(storage) {
  try { const l = JSON.parse(storage.getItem(SENT_KEY) ?? '[]'); return Array.isArray(l) ? l.filter((x) => typeof x?.id === 'string' && typeof x.label === 'string') : []; } catch { return []; }
}
export function rememberSent(storage, entry) {
  const l = [entry, ...loadSent(storage).filter((x) => x.id !== entry.id)].slice(0, SENT_MAX);
  try { storage.setItem(SENT_KEY, JSON.stringify(l)); return true; } catch { return false; }
}
