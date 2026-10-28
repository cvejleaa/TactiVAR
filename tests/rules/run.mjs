// Firestore-reglerne mod emulatoren (v3.24.3, kamp-id): hvem må hvad i matches/{id}. Køres af `npm run test:rules`, der
// starter Auth- og Firestore-emulatoren (firebase emulators:exec) – aldrig mod produktion (projekt demo-tactivar).
// Hver vagt i firestore.rules har sit eget afvist-tilfælde her, og det tilladte tilfælde lykkes – ellers beviser 403 intet.
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099', FS = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-tactivar';
const DOCS = `http://${FS}/v1/projects/${PROJECT}/databases/(default)/documents`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ` ${detail}`}`); };

async function signUp() {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  const j = await r.json(); return { token: j.idToken, uid: j.localId };
}
const field = (v) => (typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v });
const doc = (data) => ({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, field(v)])) });
async function create(id, data, token) {
  const r = await fetch(`${DOCS}/matches?documentId=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(doc(data)) });
  return r.status;
}
const req = (method, path, token, body) => fetch(`${DOCS}/${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }).then((r) => r.status);

const A = await signUp(), B = await signUp();
check('data: to anonyme brugere med hvert sit uid', A.token && B.token && A.uid !== B.uid);
const ok = (uid, extra = {}) => ({ v: 1, uid, version: '3.24.3', round: 5, season: 1, home: 'A', away: 'B', score: '2-1', json: '{"x":1}', ...extra });

check('A opretter sin egen kamp K-7F3Q', (await create('K-7F3Q', ok(A.uid), A.token)) === 200);
check('…men kan ikke læse den (ingen læsning – kun servicekontoen)', (await req('GET', 'matches/K-7F3Q', A.token)) === 403);
check('ulogget kan ikke læse', (await req('GET', 'matches/K-7F3Q')) === 403);
check('A kan ikke ændre den', (await req('PATCH', 'matches/K-7F3Q', A.token, doc(ok(A.uid, { score: '9-0' })))) === 403);
check('A kan ikke slette den', (await req('DELETE', 'matches/K-7F3Q', A.token)) === 403);
check('samme id igen (B) giver konflikt eller afvisning – aldrig overskrivning', [403, 409].includes(await create('K-7F3Q', ok(B.uid), B.token)));
check('ulogget kan ikke oprette', (await create('K-AAAA', ok(A.uid))) === 403);
check('B kan ikke oprette i A\'s navn (uid ≠ token)', (await create('K-BBBB', ok(A.uid), B.token)) === 403);
check('id uden K-mønster afvises', (await create('X-1', ok(A.uid), A.token)) === 403);
check('id med forvekslelige tegn (0/O/1/I) afvises', (await create('K-0O1I', ok(A.uid), A.token)) === 403);
check('ekstra felt afvises', (await create('K-CCCC', ok(A.uid, { admin: 'ja' }), A.token)) === 403);
check('manglende json afvises', (await create('K-DDDD', (({ json, ...r }) => r)(ok(A.uid)), A.token)) === 403);
check('json som tal afvises', (await create('K-EEEE', ok(A.uid, { json: 5 }), A.token)) === 403);
check('forkert v afvises', (await create('K-FFFF', ok(A.uid, { v: 2 }), A.token)) === 403);
check('for stort json (≥ 900.000 tegn) afvises', (await create('K-GGGG', ok(A.uid, { json: 'x'.repeat(900000) }), A.token)) === 403);
check('lige under grænsen (899.999 tegn) tillades', (await create('K-HHHH', ok(A.uid, { json: 'x'.repeat(899999) }), A.token)) === 200);
check('andre samlinger er lukkede (opret)', (await req('POST', 'leagues?documentId=x', A.token, doc({ a: 'b' }))) === 403);
check('andre samlinger er lukkede (læs)', (await req('GET', 'leagues/x', A.token)) === 403);

console.log(`${fail ? `${fail} fejlede` : `Alle ${pass} bestod`}`);
process.exit(fail ? 1 : 0);
