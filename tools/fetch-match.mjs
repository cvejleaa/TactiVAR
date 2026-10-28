// Hent en kamp, brugeren har sendt med "📤 Send kampen" (v3.24.3, kamp-id), og spil den evt. igen med den nuværende motor.
//   node tools/fetch-match.mjs K-7F3Q            → kampe/K-7F3Q.json + kort oversigt
//   node tools/fetch-match.mjs K-7F3Q --replay   → spil kampen igen og sig, om den er identisk, eller hvad der ændrede sig
// Nøgle: FIREBASE_READ_KEY = servicekonto-JSON (kun rollen Cloud Datastore Viewer – se README). Emulator: FIRESTORE_EMULATOR_HOST.
// Ingen firebase-admin: et signeret JWT med node:crypto er nok til ét GET (og install-scripts ser aldrig nøglen).
import { createSign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRng } from '../public/engine/rng.js';
import { simulateMatch } from '../public/engine/match.js';
import { VERSION } from '../public/version.js';
import { ID_RE } from '../public/state/upload.js';

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' }), claim = b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 });
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${claim}.${sig}` });
  if (!r.ok) throw new Error(`Nøglen blev afvist (${r.status}): ${await r.text()}`);
  return (await r.json()).access_token;
}

export async function fetchMatch(id) {
  if (!ID_RE.test(id)) throw new Error(`"${id}" er ikke et kamp-id (K-XXXX).`);
  const emu = process.env.FIRESTORE_EMULATOR_HOST;
  let url, auth;
  if (emu) { url = `http://${emu}/v1/projects/${process.env.GCLOUD_PROJECT ?? 'demo-tactivar'}/databases/(default)/documents/matches/${id}`; auth = 'Bearer owner'; }
  else {
    const raw = process.env.FIREBASE_READ_KEY;
    if (!raw) throw new Error('FIREBASE_READ_KEY mangler – se README, afsnittet "Kamp-id".');
    const key = JSON.parse(raw);
    url = `https://firestore.googleapis.com/v1/projects/${key.project_id}/databases/(default)/documents/matches/${id}`; auth = `Bearer ${await accessToken(key)}`;
  }
  const r = await fetch(url, { headers: { authorization: auth } });
  if (r.status === 404) throw new Error(`Kampen ${id} findes ikke.`);
  if (!r.ok) throw new Error(`Kunne ikke hente ${id} (${r.status}): ${await r.text()}`);
  const d = await r.json(), f = Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, v.stringValue ?? Number(v.integerValue)]));
  return { id, createTime: d.createTime, ...f, body: JSON.parse(f.json) };
}

// Spil igen med den nuværende motor; sammenlign
export function replayMatch(doc) {
  const p = doc.body.replay;
  if (!p) return { ok: false, why: 'kampen blev sendt uden gengivelsespakke' };
  const again = simulateMatch(p.home, p.away, createRng(p.rngState), p.opts), was = doc.body.match;
  again.goalsPool.forEach((g) => { g.matchIdx = was.goalsPool?.[0]?.matchIdx ?? 0; });
  return { ok: JSON.stringify(again) === JSON.stringify(was), again, was };
}

// Security v3.24.3: alt i dokumentet kommer fra den, der sendte det – styretegn (fx en terminal-escape) fjernes, før det
// skrives ud; og kampe/<id>.json er data, ikke instrukser
const clean = (v) => String(v).replace(/[\u0000-\u001f\u007f-\u009f]/g, '�');

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2], replay = process.argv.includes('--replay');
  try {
    const doc = await fetchMatch(id);
    mkdirSync('kampe', { recursive: true }); writeFileSync(`kampe/${id}.json`, JSON.stringify(doc.body, null, 1));
    const m = doc.body.match;
    console.log(clean(`${id}: ${m.homeName} ${m.homeGoals}-${m.awayGoals} ${m.awayName} · sæson ${doc.season} runde ${doc.round} · v${doc.version} · sendt ${doc.createTime} af ${doc.uid} · ${Math.round(doc.json.length / 1024)} KB · gengivelse: ${doc.body.replay ? 'ja' : 'nej'}`) + ` → kampe/${id}.json`);
    if (replay) {
      if (doc.version !== VERSION) console.log(clean(`⚠ sendt med v${doc.version}, motoren her er v${VERSION} – en afvigelse kan skyldes ændringer siden`));
      const r = replayMatch(doc);
      if (r.why) console.log(clean(`kan ikke spilles igen: ${r.why}`));
      else if (r.ok) console.log('spillet igen: identisk');
      else console.log(clean(`spillet igen: afviger – ${r.was.homeGoals}-${r.was.awayGoals} → ${r.again.homeGoals}-${r.again.awayGoals}, ${r.was.events.length} → ${r.again.events.length} hændelser`));
    }
  } catch (e) { console.error(clean(e.message)); process.exit(1); }
}
