// "📤 Send kampen" (v3.24.3, kamp-id – brugeren: "gemme kampene i firebase med et id, så jeg kan referere til det når vi skal
// justere på motoren"). Ren over fetch (injicérbar i tests). En anonym Firebase-bruger opretter matches/K-XXXX med sit eget
// uid; firestore.rules tillader kun det. Kun den viste kamp og dens gengivelsespakke sendes – aldrig dine noter eller resten
// af ligaen. Endpoints til emulatoren sættes kun af tests (globalThis.TACTIVAR_EMULATOR), aldrig ud fra værtsnavnet.
export const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // uden 0/O/1/I (forveksles, når id'et skrives af)
export const ID_RE = /^K-[A-HJ-NP-Z2-9]{4}$/;
export const JSON_MAX = 880000;   // under reglernes 900.000 (firestore.rules)
const TOKEN_KEY = 'tactivar_uploader';

export const newMatchId = (rand = Math.random) => 'K-' + Array.from({ length: 4 }, () => ID_ALPHABET[Math.floor(rand() * ID_ALPHABET.length)]).join('');

// Indholdet: kampen (som spilleren så den) og pakken, der kan spille den igen. For stort → events[].stats væk, så pakken.
export function buildPayload({ match, pack, version, round, season }) {
  let body = { match, replay: pack ?? null }, json = JSON.stringify(body), trimmed = [];
  if (json.length > JSON_MAX) { body = { ...body, match: { ...match, events: match.events.map(({ stats, ...e }) => e) } }; json = JSON.stringify(body); trimmed.push('stats'); }
  if (json.length > JSON_MAX) { body = { ...body, replay: null }; json = JSON.stringify(body); trimmed.push('replay'); }
  if (json.length > JSON_MAX) return { error: 'Kampen er for stor til at blive sendt.' };
  return { fields: { v: 1, version, round, season, home: match.homeName, away: match.awayName, score: `${match.homeGoals}-${match.awayGoals}`, json }, trimmed, replay: !!body.replay };
}

function endpoints(cfg) {
  const emu = globalThis.TACTIVAR_EMULATOR;
  return {
    signUp: `${emu?.auth ? `http://${emu.auth}/` : 'https://'}identitytoolkit.googleapis.com/v1/accounts:signUp?key=${cfg.apiKey}`,
    refresh: `${emu?.auth ? `http://${emu.auth}/` : 'https://'}securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`,
    docs: `${emu?.firestore ? `http://${emu.firestore}` : 'https://firestore.googleapis.com'}/v1/projects/${cfg.projectId}/databases/(default)/documents`,
  };
}
// Anonym bruger: genbrug refresh-token (samme uid hver gang), ellers en ny
async function anonToken(cfg, storage, fetchFn) {
  const ep = endpoints(cfg);
  let saved = null; try { saved = JSON.parse(storage.getItem(TOKEN_KEY) ?? 'null'); } catch { /* intet */ }
  if (saved?.refreshToken) {
    const r = await fetchFn(ep.refresh, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(saved.refreshToken)}` });
    if (r.ok) { const j = await r.json(); return { token: j.id_token, uid: j.user_id }; }
  }
  const r = await fetchFn(ep.signUp, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  if (!r.ok) throw new Error(`Anonym login fejlede (${r.status}) – er "Anonymous" slået til i Firebase?`);
  const j = await r.json();
  try { storage.setItem(TOKEN_KEY, JSON.stringify({ refreshToken: j.refreshToken })); } catch { /* fuldt lager: ny bruger næste gang */ }
  return { token: j.idToken, uid: j.localId };
}
const toFields = (o) => ({ fields: Object.fromEntries(Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) }])) });

// Svar: { id } eller kaster med en læsbar årsag. Id'et findes allerede (409/403 ved oprettelse) → nyt id, højst 3 forsøg.
export async function uploadMatch(cfg, storage, payloadFields, { fetchFn = fetch, rand = Math.random } = {}) {
  if (!cfg?.apiKey || !cfg?.projectId) throw new Error('Upload er ikke sat op endnu.');
  const { token, uid } = await anonToken(cfg, storage, fetchFn), ep = endpoints(cfg);
  for (let i = 0; i < 3; i++) {
    const id = newMatchId(rand);
    const r = await fetchFn(`${ep.docs}/matches?documentId=${id}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(toFields({ ...payloadFields, uid })) });
    if (r.ok) return { id };
    if (r.status !== 409 && r.status !== 403) throw new Error(`Kampen kunne ikke sendes (${r.status}).`);
    if (r.status === 403 && i === 2) throw new Error('Kampen blev afvist af serveren (403).');
  }
  throw new Error('Kunne ikke finde et ledigt kamp-id – prøv igen.');
}
