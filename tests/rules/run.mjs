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
// Test Manager (v3.24.3): version-vagten (string, ≤ 16 tegn) og id-grænserne havde ingen afvist-tilfælde
check('version som tal afvises', (await create('K-JJJJ', ok(A.uid, { version: 3 }), A.token)) === 403);
check('version på 17 tegn afvises', (await create('K-KKKK', ok(A.uid, { version: 'x'.repeat(17) }), A.token)) === 403);
check('version på præcis 16 tegn tillades', (await create('K-LLLL', ok(A.uid, { version: 'x'.repeat(16) }), A.token)) === 200);
check('id med 5 tegn (K-ABCDE) afvises', (await create('K-ABCDE', ok(A.uid), A.token)) === 403);
check('id med 3 tegn (K-ABC) afvises', (await create('K-ABC', ok(A.uid), A.token)) === 403);
check('id med små bogstaver (K-abcd) afvises', (await create('K-abcd', ok(A.uid), A.token)) === 403);
check('id uden bindestreg (KABCD) afvises', (await create('KABCD', ok(A.uid), A.token)) === 403);
check('alfabetets første og sidste tegn (K-AZ29) tillades', (await create('K-AZ29', ok(A.uid), A.token)) === 200);
check('uid som tal afvises (uid == auth.uid er en streng)', (await create('K-MMMM', ok(A.uid, { uid: 5 }), A.token)) === 403);
check('v som tekst "1" afvises', (await create('K-NNNN', ok(A.uid, { v: '1' }), A.token)) === 403);
check('for stort json (≥ 400.000 tegn) afvises', (await create('K-GGGG', ok(A.uid, { json: 'x'.repeat(400000) }), A.token)) === 403);
check('lige under grænsen (399.999 tegn) tillades', (await create('K-HHHH', ok(A.uid, { json: 'x'.repeat(399999) }), A.token)) === 200);
check('andre samlinger er lukkede (opret)', (await req('POST', 'leagues?documentId=x', A.token, doc({ a: 'b' }))) === 403);
check('andre samlinger er lukkede (læs)', (await req('GET', 'leagues/x', A.token)) === 403);

// Angreb (Security Reviewer, v3.24.3): læsning ad ALLE REST-veje, skrivning ad omveje og andre stier. Hver afvisning har en
// positiv kontrol (emulatorens ejer-adgang 'owner' = samme forespørgsel uden regler giver 200) – ellers kunne 403 bare
// betyde en forkert formet forespørgsel.
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const rpc = (verb, token, body) => fetch(`${DOCS}:${verb}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then((r) => r.status);
const allMatches = { structuredQuery: { from: [{ collectionId: 'matches' }] } };
check('liste over alle kampe afvises (A)', (await req('GET', 'matches', A.token)) === 403);
check('liste over alle kampe afvises (ulogget)', (await req('GET', 'matches')) === 403);
check('kontrol: listen virker med ejer-adgang', (await req('GET', 'matches', 'owner')) === 200);
check('B kan ikke læse A\'s kamp', (await req('GET', 'matches/K-7F3Q', B.token)) === 403);
check('runQuery på kampene afvises', (await rpc('runQuery', B.token, allMatches)) === 403);
check('kontrol: runQuery virker med ejer-adgang', (await rpc('runQuery', 'owner', allMatches)) === 200);
check('collectionGroup-forespørgsel på "matches" afvises', (await rpc('runQuery', B.token, { structuredQuery: { from: [{ collectionId: 'matches', allDescendants: true }] } })) === 403);
check('optælling (runAggregationQuery count) afvises', (await rpc('runAggregationQuery', B.token, { structuredAggregationQuery: { ...allMatches, aggregations: [{ alias: 'n', count: {} }] } })) === 403);
check('kontrol: optælling virker med ejer-adgang', (await rpc('runAggregationQuery', 'owner', { structuredAggregationQuery: { ...allMatches, aggregations: [{ alias: 'n', count: {} }] } })) === 200);
check('batchGet af A\'s kamp afvises', (await rpc('batchGet', B.token, { documents: [`${ROOT}/matches/K-7F3Q`] })) === 403);
check('kontrol: batchGet virker med ejer-adgang', (await rpc('batchGet', 'owner', { documents: [`${ROOT}/matches/K-7F3Q`] })) === 200);
check('commit: sletning af egen kamp afvises', (await rpc('commit', A.token, { writes: [{ delete: `${ROOT}/matches/K-7F3Q` }] })) === 403);
check('commit: transform på eksisterende kamp afvises', (await rpc('commit', A.token, { writes: [{ transform: { document: `${ROOT}/matches/K-7F3Q`, fieldTransforms: [{ fieldPath: 'score', setToServerValue: 'REQUEST_TIME' }] } }] })) === 403);
check('commit: oprettelse med transform på et NYT felt afvises (hasOnly ser transforms)', (await rpc('commit', A.token, { writes: [{ update: { name: `${ROOT}/matches/K-JJJ2`, fields: doc(ok(A.uid)).fields }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'admin', setToServerValue: 'REQUEST_TIME' }] }] })) === 403);
check('kontrol: commit-oprettelse uden transform tillades', (await rpc('commit', A.token, { writes: [{ update: { name: `${ROOT}/matches/K-JJJ3`, fields: doc(ok(A.uid)).fields }, currentDocument: { exists: false } }] })) === 200);
check('PATCH med currentDocument.exists=false på optaget id: konflikt eller afvisning – aldrig overskrivning', [403, 409].includes(await req('PATCH', 'matches/K-7F3Q?currentDocument.exists=false', B.token, doc(ok(B.uid)))));
check('underdokument matches/K-7F3Q/x/y afvises', (await req('POST', 'matches/K-7F3Q/x?documentId=y', A.token, doc({ a: 'b' }))) === 403);
check('en "matches"-samling under en anden sti afvises', (await req('POST', 'foo/bar/matches?documentId=K-JJJ4', A.token, doc(ok(A.uid)))) === 403);
check('auto-id (uden documentId) afvises', (await req('POST', 'matches', A.token, doc(ok(A.uid)))) === 403);
check('id med små bogstaver afvises', (await create('k-jjj5', ok(A.uid), A.token)) === 403);
check('id med 5 tegn afvises', (await create('K-JJJJ6', ok(A.uid), A.token)) === 403);
check('version som tal afvises', (await create('K-JJJ7', ok(A.uid, { version: 3 }), A.token)) === 403);
check('version over 16 tegn afvises', (await create('K-JJJ7', ok(A.uid, { version: 'x'.repeat(17) }), A.token)) === 403);
check('kontrol: version på præcis 16 tegn tillades', (await create('K-JJJ8', ok(A.uid, { version: 'x'.repeat(16) }), A.token)) === 200);
check('deploy-tjekket (deploy.yml): ulogget læsning af tjek/x giver 403', (await req('GET', 'tjek/x')) === 403);

// Security v3.24.3: felterne ved siden af json typetjekkes (rød på reglerne uden typevagterne, grøn med)
{
  const val = (v) => (v === null ? { nullValue: null } : typeof v === 'number' ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue: v });
  const vdoc = (d) => ({ fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, val(v)])) });
  const make = (id, d) => req('POST', `matches?documentId=${id}`, A.token, vdoc(d));
  const t = (extra = {}) => ok(A.uid, { home: 'Lyngby Tacticians', ...extra });
  check('round som streng afvises', (await make('K-TTT2', t({ round: 'x' }))) === 403);
  check('round = null afvises', (await make('K-TTT3', t({ round: null }))) === 403);
  check('season som map afvises', (await make('K-TTT4', t({ season: { a: [1, 2] } }))) === 403);
  check('home over 60 tegn afvises (fx 140.000 tegn)', (await make('K-TTT5', t({ home: 'Æ'.repeat(140000) }))) === 403);
  check('away som liste afvises', (await make('K-TTT6', t({ away: ['x'] }))) === 403);
  check('score som liste afvises', (await make('K-TTT7', t({ score: [1, 2] }))) === 403);
  check('score med fri tekst (styretegn) afvises', (await make('K-TTT8', t({ score: '\u001b]0;x\u0007' }))) === 403);
  check('serverTimestamp i round afvises', (await rpc('commit', A.token, { writes: [{ update: { name: `${ROOT}/matches/K-TTT9`, fields: vdoc(t()).fields }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'round', setToServerValue: 'REQUEST_TIME' }] }] })) === 403);
  check('kontrol: home på præcis 60 tegn, score 10-10, runde 99 tillades', (await make('K-TTTA', t({ home: 'x'.repeat(60), score: '10-10', round: 99 }))) === 200);
  check('kontrol: uden round/season/home/away/score tillades (klienten udelader null)', (await make('K-TTTB', (({ round, season, home, away, score, ...x }) => x)(t()))) === 200);
}

// Klienten (public/state/upload.js) mod emulatoren: en rigtig kamp sendes, hentes med emulatorens ejer-adgang (som
// servicekontoen i produktion) og spilles igen – samme kamp
{
  const { buildPayload, uploadMatch, ID_RE } = await import('../../public/state/upload.js');
  const { createRng } = await import('../../public/engine/rng.js');
  const { createLeague } = await import('../../public/engine/generator.js');
  const { playRound } = await import('../../public/engine/season.js');
  const { simulateMatch } = await import('../../public/engine/match.js');
  globalThis.TACTIVAR_EMULATOR = { auth: AUTH, firestore: FS };
  const mem = new Map(), storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  const L = createLeague(createRng(3)), res = playRound(L, createRng(8), { replay: true });
  const p = buildPayload({ match: res.matches[0], pack: res.replay.packs[0], version: '3.24.3', round: 1, season: 1 });
  const { id } = await uploadMatch({ apiKey: 'fake', projectId: PROJECT }, storage, p.fields);
  check('upload.js: kampen sendes og får et id på formen K-XXXX', ID_RE.test(id), id);
  const got = await fetch(`${DOCS}/matches/${id}`, { headers: { authorization: 'Bearer owner' } }).then((r) => r.json());
  check('dokumentet bærer brugerens uid og kampens stilling', got.fields?.uid?.stringValue?.length > 5 && got.fields?.score?.stringValue === `${res.matches[0].homeGoals}-${res.matches[0].awayGoals}`, JSON.stringify(got).slice(0, 200));
  const body = JSON.parse(got.fields.json.stringValue), pk = body.replay;
  const again = simulateMatch(pk.home, pk.away, createRng(pk.rngState), pk.opts); again.goalsPool.forEach((g) => { g.matchIdx = 0; });
  check('kampen hentet fra Firestore spilles igen identisk (pakken overlever rundturen)', JSON.stringify(again) === JSON.stringify(body.match));
  const { id: id2 } = await uploadMatch({ apiKey: 'fake', projectId: PROJECT }, storage, p.fields);
  const got2 = await fetch(`${DOCS}/matches/${id2}`, { headers: { authorization: 'Bearer owner' } }).then((r) => r.json());
  const { fetchMatch, replayMatch } = await import('../../tools/fetch-match.mjs');
  const doc = await fetchMatch(id), rr = replayMatch(doc);
  check('tools/fetch-match.mjs henter kampen med id og spiller den igen: identisk', doc.body.match.homeName === res.matches[0].homeName && rr.ok === true, JSON.stringify({ ok: rr.ok, why: rr.why }));
  check('anden upload genbruger den anonyme bruger (samme uid)', got2.fields.uid.stringValue === got.fields.uid.stringValue && id2 !== id);
}

console.log(`${fail ? `${fail} fejlede` : `Alle ${pass} bestod`}`);
process.exit(fail ? 1 : 0);
