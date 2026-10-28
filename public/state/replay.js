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
