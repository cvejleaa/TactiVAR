// v3.24.3 (kamp-id), Test Manager: public/state/upload.js (id, nyttelast, anonym bruger, retry), gengivelsespakken og
// tools/fetch-match.mjs mod en FALSK fetch – ingen netværk. Hver assert er skrevet, så netop én mutation bliver rød.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound } from '../../public/engine/season.js';
import { simulateMatch } from '../../public/engine/match.js';
import { saveReplay, loadReplay, replayOf, REPLAY_KEY } from '../../public/state/replay.js';
import { resetGame, SAVE_KEY } from '../../public/state/storage.js';
import { ID_ALPHABET, ID_RE, JSON_MAX, newMatchId, buildPayload, uploadMatch } from '../../public/state/upload.js';

const memStorage = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
const CFG = { apiKey: 'KEY1', projectId: 'proj-x' };
const res = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
// falsk fetch: svarer efter URL-type; logger alle kald. docs = kø af statuskoder for oprettelsen (sidste gentages)
function fakeFetch({ docs = [200], signUp = res(200, { idToken: 'ID-NY', refreshToken: 'RT-NY', localId: 'UID-NY' }), refresh = res(200, { id_token: 'ID-REF', user_id: 'UID-REF' }) } = {}) {
  const calls = []; let d = 0;
  const fn = async (url, opts = {}) => {
    const kind = url.includes('accounts:signUp') ? 'signUp' : url.includes('securetoken') ? 'refresh' : url.includes('/matches?documentId=') ? 'doc' : '?';
    calls.push({ kind, url, opts });
    if (kind === 'signUp') return signUp;
    if (kind === 'refresh') return refresh;
    return res(docs[Math.min(d++, docs.length - 1)]);
  };
  fn.calls = calls; fn.of = (k) => calls.filter((c) => c.kind === k); return fn;
}
// rand der giver et NYT id pr. forsøg: forsøg n → tegn n i alle fire pladser
const seqRand = () => { let n = 0; return () => ((Math.floor(n++ / 4) + 0.5) / ID_ALPHABET.length); };
const ARGS = { version: 'v', round: 1, season: 1 };

// ---------- id'et ----------
test('newMatchId: alfabetet er præcis reglernes tegnsæt (32 tegn, ingen 0/O/1/I), og HVERT tegn kan trækkes og passer til ID_RE', () => {
  assert.equal(ID_ALPHABET.length, 32); assert.equal(new Set(ID_ALPHABET).size, 32);
  for (const bad of '0O1I') assert.ok(!ID_ALPHABET.includes(bad), `alfabetet må ikke have ${bad}`);
  for (const ch of ID_ALPHABET) assert.ok(ID_RE.test(`K-${ch}${ch}${ch}${ch}`), `${ch} afvises af ID_RE`);
  const seen = new Set();
  for (let i = 0; i < 32; i++) { const id = newMatchId(() => (i + 0.5) / 32); assert.equal(id, `K-${ID_ALPHABET[i].repeat(4)}`); seen.add(id[2]); }
  assert.equal(seen.size, 32, 'alle 32 tegn kan trækkes (fanger length-1 og off-by-one)');
  assert.equal(newMatchId(() => 0), 'K-AAAA'); assert.equal(newMatchId(() => 0.999999), 'K-9999');
  for (const bad of ['K-0O1I', 'K-ABCDE', 'K-ABC', 'k-ABCD', 'K-ABCD\n', 'X-ABCD', ' K-ABCD', 'K-AB-D']) assert.ok(!ID_RE.test(bad), bad);
  for (let i = 0; i < 200; i++) assert.ok(ID_RE.test(newMatchId()));   // standard-rand giver gyldige id'er
});

// ---------- nyttelasten ----------
const realMatch = () => { const L = createLeague(createRng(3)), r = playRound(L, createRng(8), { replay: true }); return { m: r.matches[0], pack: r.replay.packs[0] }; };

test('buildPayload: felterne, json = {match, replay}, intet trimmet når det er småt', () => {
  const { m, pack } = realMatch();
  const p = buildPayload({ match: m, pack, version: '3.24.3', round: 4, season: 2 });
  assert.deepEqual(Object.keys(p.fields), ['v', 'version', 'round', 'season', 'home', 'away', 'score', 'json']);
  assert.equal(p.fields.v, 1); assert.equal(p.fields.version, '3.24.3'); assert.equal(p.fields.round, 4); assert.equal(p.fields.season, 2);
  assert.equal(p.fields.home, m.homeName); assert.equal(p.fields.away, m.awayName);
  assert.equal(p.fields.score, `${m.homeGoals}-${m.awayGoals}`);
  assert.deepEqual(p.trimmed, []); assert.equal(p.replay, true);
  const body = JSON.parse(p.fields.json);
  assert.equal(JSON.stringify(body.match), JSON.stringify(m), 'kampen sendes uændret (stats med)');
  assert.equal(body.replay.rngState, pack.rngState); assert.equal(body.replay.home.id, pack.home.id);
  assert.ok(m.events.some((e) => e.stats), 'fixturet har stats på hændelserne – ellers beviser trimning-testene intet');
});

test('buildPayload: uden pakke → replay null og p.replay false (kampen kan stadig sendes)', () => {
  const { m } = realMatch();
  for (const pack of [null, undefined]) { const p = buildPayload({ match: m, pack, ...ARGS }); assert.equal(p.replay, false); assert.equal(JSON.parse(p.fields.json).replay, null); assert.deepEqual(p.trimmed, []); }
});

// en syntetisk kamp, hvis størrelse vi styrer: events med stats + et polstringsfelt
const fake = (statsLen, pad = 0, nEv = 4) => ({ homeName: 'H', awayName: 'A', homeGoals: 1, awayGoals: 0, events: Array.from({ length: nEv }, (_, i) => ({ min: i, text: `e${i}`, stats: 's'.repeat(statsLen) })), pad: 'p'.repeat(pad) });
const sizeOf = (match, replay) => JSON.stringify({ match, replay }).length;
const noStats = (m) => ({ ...m, events: m.events.map(({ stats, ...e }) => e) });

test('buildPayload: for stort → events[].stats væk FØRST (pakken beholdes), og kun stats', () => {
  const pack = { v: 1, rngState: 5, note: 'pakken' }, match = fake(Math.ceil(JSON_MAX / 4), 0, 4);   // stats alene > JSON_MAX
  assert.ok(sizeOf(match, pack) > JSON_MAX);
  const p = buildPayload({ match, pack, ...ARGS });
  assert.deepEqual(p.trimmed, ['stats']); assert.equal(p.replay, true);
  const body = JSON.parse(p.fields.json);
  assert.equal(body.replay.note, 'pakken', 'pakken beholdes, når stats var nok');
  assert.equal(body.match.events.length, 4); assert.ok(body.match.events.every((e) => !('stats' in e) && e.text.startsWith('e')), 'stats væk, resten af hændelsen står');
  assert.equal(body.match.homeName, 'H');
  assert.ok(match.events.every((e) => e.stats), 'den oprindelige kamp (i spillets gem) er ikke rørt');
  assert.ok(p.fields.json.length <= JSON_MAX);
});

test('buildPayload: stadig for stort uden stats → pakken droppes, kampen sendes (trimmed = stats, replay)', () => {
  const pack = { v: 1, rngState: 5, big: 'x'.repeat(JSON_MAX) }, match = fake(1000, 0, 4);
  const p = buildPayload({ match, pack, ...ARGS });
  assert.deepEqual(p.trimmed, ['stats', 'replay']); assert.equal(p.replay, false);
  const body = JSON.parse(p.fields.json); assert.equal(body.replay, null); assert.equal(body.match.events.length, 4);
  assert.ok(!p.error && p.fields.json.length <= JSON_MAX);
});

test('buildPayload: kampen selv for stor → fejl, ingen felter', () => {
  const p = buildPayload({ match: fake(10, JSON_MAX + 5), pack: null, ...ARGS });
  assert.match(p.error, /for stor/); assert.equal(p.fields, undefined);
});

test('buildPayload: grænsen – præcis JSON_MAX tegn trimmes IKKE, JSON_MAX+1 trimmes (trin 1: stats, trin 2: pakke)', () => {
  const base = fake(50, 0, 3);
  const at = { ...base, pad: 'p'.repeat(JSON_MAX - sizeOf(base, null)) };
  assert.equal(sizeOf(at, null), JSON_MAX);
  const p0 = buildPayload({ match: at, pack: null, ...ARGS });
  assert.deepEqual(p0.trimmed, []); assert.ok(p0.fields.json.includes('"stats"'));
  const p1 = buildPayload({ match: { ...at, pad: at.pad + 'p' }, pack: null, ...ARGS });
  assert.deepEqual(p1.trimmed, ['stats']); assert.ok(!p1.fields.json.includes('"stats"'));
  // trin 2: efter stats-trimning præcis JSON_MAX → pakken beholdes; JSON_MAX+1 → pakken droppes
  const pack = { v: 1, f: 'z' }, m = fake(50000, 0, 3), need = JSON_MAX - sizeOf(noStats(m), pack);
  const a = buildPayload({ match: { ...m, pad: 'p'.repeat(need) }, pack, ...ARGS });
  assert.deepEqual(a.trimmed, ['stats']); assert.equal(a.fields.json.length, JSON_MAX); assert.equal(a.replay, true);
  const b = buildPayload({ match: { ...m, pad: 'p'.repeat(need + 1) }, pack, ...ARGS });
  assert.deepEqual(b.trimmed, ['stats', 'replay']); assert.equal(b.replay, false);
  // trin 3: kampen uden stats og uden pakke præcis JSON_MAX → ok; +1 → fejl
  const c = buildPayload({ match: { ...m, pad: 'p'.repeat(JSON_MAX - sizeOf(noStats(m), null)) }, pack: null, ...ARGS });
  assert.ok(!c.error); assert.equal(c.fields.json.length, JSON_MAX);
  const d = buildPayload({ match: { ...m, pad: 'p'.repeat(JSON_MAX - sizeOf(noStats(m), null) + 1) }, pack: null, ...ARGS });
  assert.match(d.error, /for stor/);
});

test('JSON_MAX holder sig under firestore.rules-grænsen (ellers afviser serveren det, klienten mente var ok)', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const lim = Number(/json\.size\(\) < (\d+)/.exec(rules)?.[1]);
  assert.ok(lim > 0, 'reglen om json.size() findes'); assert.ok(JSON_MAX < lim, `JSON_MAX ${JSON_MAX} < regel ${lim}`);
  assert.ok(lim - JSON_MAX < 50000, 'og ikke urimeligt langt under (ellers trimmes kampe unødigt)');
});

// ---------- upload ----------
test('uploadMatch: ikke sat op → afvises UDEN netværkskald', async () => {
  for (const cfg of [null, undefined, {}, { apiKey: 'k' }, { projectId: 'p' }]) {
    const f = fakeFetch();
    await assert.rejects(() => uploadMatch(cfg, memStorage(), { v: 1 }, { fetchFn: f }), /ikke sat op/);
    assert.equal(f.calls.length, 0);
  }
});

test('uploadMatch: ny anonym bruger → signUp, refresh-token gemmes, dokumentet oprettes med rigtige felttyper, uid og Bearer', async () => {
  const f = fakeFetch(), st = memStorage();
  const fields = { v: 1, version: '3.24.3', round: 7, season: 2, home: 'Hjem', away: 'Ude', score: '2-1', json: '{"x":"æøå"}', skip: null, skip2: undefined };
  const { id } = await uploadMatch(CFG, st, fields, { fetchFn: f, rand: () => 0.5 });
  assert.ok(ID_RE.test(id));
  assert.equal(f.of('signUp').length, 1); assert.equal(f.of('refresh').length, 0); assert.equal(f.of('doc').length, 1);
  const su = f.of('signUp')[0]; assert.equal(su.url, 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=KEY1'); assert.equal(su.opts.method, 'POST'); assert.deepEqual(JSON.parse(su.opts.body), { returnSecureToken: true });
  assert.deepEqual(JSON.parse(st.getItem('tactivar_uploader')), { refreshToken: 'RT-NY' });
  const d = f.of('doc')[0];
  assert.equal(d.url, `https://firestore.googleapis.com/v1/projects/proj-x/databases/(default)/documents/matches?documentId=${id}`);
  assert.equal(d.opts.method, 'POST'); assert.equal(d.opts.headers.authorization, 'Bearer ID-NY');
  assert.deepEqual(JSON.parse(d.opts.body), { fields: {
    v: { integerValue: '1' }, version: { stringValue: '3.24.3' }, round: { integerValue: '7' }, season: { integerValue: '2' },
    home: { stringValue: 'Hjem' }, away: { stringValue: 'Ude' }, score: { stringValue: '2-1' }, json: { stringValue: '{"x":"æøå"}' }, uid: { stringValue: 'UID-NY' } } });
});

test('uploadMatch: gemt refresh-token genbruges (samme uid) – INGEN ny signUp; token og uid er fra refresh-svaret', async () => {
  const f = fakeFetch(), st = memStorage({ tactivar_uploader: JSON.stringify({ refreshToken: 'RT æ&=1' }) });
  await uploadMatch(CFG, st, { v: 1, json: '{}' }, { fetchFn: f });
  assert.equal(f.of('signUp').length, 0, 'ingen ny anonym bruger');
  const r = f.of('refresh')[0]; assert.equal(r.url, 'https://securetoken.googleapis.com/v1/token?key=KEY1'); assert.equal(r.opts.method, 'POST');
  assert.equal(r.opts.body, `grant_type=refresh_token&refresh_token=${encodeURIComponent('RT æ&=1')}`);
  assert.equal(r.opts.headers['content-type'], 'application/x-www-form-urlencoded');
  const d = f.of('doc')[0]; assert.equal(d.opts.headers.authorization, 'Bearer ID-REF'); assert.equal(JSON.parse(d.opts.body).fields.uid.stringValue, 'UID-REF');
  assert.equal(JSON.parse(st.getItem('tactivar_uploader')).refreshToken, 'RT æ&=1', 'tokenet i lageret er urørt');
});

test('uploadMatch: refresh afvist → ny anonym bruger, og det nye token overskriver det døde', async () => {
  const f = fakeFetch({ refresh: res(400) }), st = memStorage({ tactivar_uploader: JSON.stringify({ refreshToken: 'DØD' }) });
  await uploadMatch(CFG, st, { v: 1, json: '{}' }, { fetchFn: f });
  assert.equal(f.of('refresh').length, 1); assert.equal(f.of('signUp').length, 1);
  assert.equal(JSON.parse(st.getItem('tactivar_uploader')).refreshToken, 'RT-NY');
  assert.equal(f.of('doc')[0].opts.headers.authorization, 'Bearer ID-NY');
});

test('uploadMatch: ødelagt token-felt / lager der kaster → ny bruger, og upload lykkes alligevel', async () => {
  for (const st of [memStorage({ tactivar_uploader: '{ikke json' }), memStorage({ tactivar_uploader: '{}' }), { getItem() { throw new Error('låst'); }, setItem() { throw new Error('fuldt'); } }]) {
    const f = fakeFetch(); const { id } = await uploadMatch(CFG, st, { v: 1, json: '{}' }, { fetchFn: f });
    assert.ok(ID_RE.test(id)); assert.equal(f.of('signUp').length, 1); assert.equal(f.of('refresh').length, 0);
  }
});

test('uploadMatch: anonym login afvist → læsbar fejl med status, intet dokument forsøgt', async () => {
  const f = fakeFetch({ signUp: res(400) });
  await assert.rejects(() => uploadMatch(CFG, memStorage(), { v: 1, json: '{}' }, { fetchFn: f }), /Kampen kunne ikke sendes lige nu – prøv igen senere \(login: 400\)/);
  assert.equal(f.of('doc').length, 0);
});

test('uploadMatch retry: 409 → NYT id pr. forsøg (ikke samme igen), lykkes på 3. forsøg', async () => {
  const f = fakeFetch({ docs: [409, 409, 200] });
  const { id } = await uploadMatch(CFG, memStorage(), { v: 1, json: '{}' }, { fetchFn: f, rand: seqRand() });
  const ids = f.of('doc').map((c) => /documentId=(.+)$/.exec(c.url)[1]);
  assert.equal(ids.length, 3); assert.equal(new Set(ids).size, 3, `tre forskellige id'er: ${ids}`); assert.equal(id, ids[2], 'returnerer id\'et der lykkedes');
  assert.equal(f.of('signUp').length, 1, 'token hentes én gang, ikke pr. forsøg');
});

test('uploadMatch retry: 403 (reglerne afviser et optaget id) prøves igen; 403 på 1. forsøg og ok på 2.', async () => {
  const f = fakeFetch({ docs: [403, 200] });
  await uploadMatch(CFG, memStorage(), { v: 1, json: '{}' }, { fetchFn: f, rand: seqRand() });
  assert.equal(f.of('doc').length, 2);
});

test('uploadMatch retry-loft: 409 x3 → præcis 3 forsøg og "ledigt kamp-id"; 403 x3 → præcis 3 forsøg og "afvist (403)"', async () => {
  let f = fakeFetch({ docs: [409] });
  await assert.rejects(() => uploadMatch(CFG, memStorage(), { v: 1, json: '{}' }, { fetchFn: f, rand: seqRand() }), /ledigt kamp-id/);
  assert.equal(f.of('doc').length, 3);
  f = fakeFetch({ docs: [403] });
  await assert.rejects(() => uploadMatch(CFG, memStorage(), { v: 1, json: '{}' }, { fetchFn: f, rand: seqRand() }), /afvist af serveren \(403\)/);
  assert.equal(f.of('doc').length, 3);
  f = fakeFetch({ docs: [409, 409, 403] });   // 403 på sidste forsøg er "afvist", ikke "ledigt id"
  await assert.rejects(() => uploadMatch(CFG, memStorage(), { v: 1, json: '{}' }, { fetchFn: f, rand: seqRand() }), /afvist af serveren \(403\)/);
});

test('uploadMatch: andre fejl (500, 401, 400, 429) prøves IKKE igen – ét kald og statuskoden i beskeden', async () => {
  for (const s of [500, 401, 400, 429]) {
    const f = fakeFetch({ docs: [s] });
    await assert.rejects(() => uploadMatch(CFG, memStorage(), { v: 1, json: '{}' }, { fetchFn: f }), new RegExp(`\\(${s}\\)`));
    assert.equal(f.of('doc').length, 1, `status ${s}`);
  }
});

test('uploadMatch: emulator-endpoints kun når globalThis.TACTIVAR_EMULATOR er sat (aldrig ud fra værtsnavn) – ellers kun https', async () => {
  const f = fakeFetch();
  globalThis.TACTIVAR_EMULATOR = { auth: '127.0.0.1:9099', firestore: '127.0.0.1:8080' };
  try { await uploadMatch(CFG, memStorage(), { v: 1, json: '{}' }, { fetchFn: f }); } finally { delete globalThis.TACTIVAR_EMULATOR; }
  assert.equal(f.of('signUp')[0].url, 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=KEY1');
  assert.match(f.of('doc')[0].url, /^http:\/\/127\.0\.0\.1:8080\/v1\/projects\/proj-x\/databases\/\(default\)\/documents\/matches\?documentId=K-/);
  const g = fakeFetch(); await uploadMatch(CFG, memStorage(), { v: 1, json: '{}' }, { fetchFn: g });
  assert.ok(g.calls.every((c) => c.url.startsWith('https://')), 'uden TACTIVAR_EMULATOR: kun https');
});

// ---------- gengivelsespakken (supplement til replay-pack-v3243.test.mjs) ----------
test('pakkerne er FRYSET ved kampstart: commitRound ændrer dem ikke, og de kan stadig spille kampen (structuredClone)', () => {
  const L = createLeague(createRng(5)), rng = createRng(9), r = playRound(L, rng, { replay: true });
  const before = JSON.stringify(r.replay);
  commitRound(L, r, rng);
  assert.equal(JSON.stringify(r.replay), before, 'commitRound (form, friskhed, kort, løn …) ændrer ikke pakkerne');
  r.replay.packs.forEach((p, i) => {
    const again = simulateMatch(p.home, p.away, createRng(p.rngState), p.opts); again.goalsPool.forEach((g) => { g.matchIdx = i; });
    assert.equal(JSON.stringify(again), JSON.stringify(r.matches[i]), `kamp ${i} efter commitRound`);
    assert.notEqual(p.home, L.teams.find((t) => t.id === p.home.id), 'pakkens hold er en kopi, ikke ligaens objekt');
  });
});

test('uden replay:true bygges ingen pakker og rng.state() røres aldrig (måleværktøjerne og bots betaler intet); med replay:true kaldes den én gang pr. kamp', () => {
  const counted = (seed) => { const r = createRng(seed); let n = 0; const s = r.state; r.state = () => { n++; return s(); }; return { r, calls: () => n }; };
  const off = counted(10), L = createLeague(createRng(6)), res0 = playRound(L, off.r);
  assert.equal(off.calls(), 0); assert.equal(res0.replay, undefined);
  const on = counted(10), res1 = playRound(createLeague(createRng(6)), on.r, { replay: true });
  assert.equal(on.calls(), res1.matches.length);
  assert.equal(JSON.stringify(res1.matches), JSON.stringify(res0.matches), 'replay:true ændrer ikke selve kampene');
});

test('rng-tilstanden i pakke i er den lige FØR kamp i: alle forskellige, og første kamp starter ved rundens seed', () => {
  const L = createLeague(createRng(6)), r = playRound(L, createRng(10), { replay: true });
  const s = r.replay.packs.map((p) => p.rngState);
  assert.ok(s.length >= 4); assert.equal(new Set(s).size, s.length, 'alle rng-tilstande er forskellige');
  assert.equal(s[0], createRng(10).state(), 'første kamp starter ved rundens begyndelse (seed 10)');
});

test('replayOf: kræver BÅDE hjemme- og udehold og runde; manglende pakke/replay/indeks giver null', () => {
  const L = createLeague(createRng(3)), r = playRound(L, createRng(5), { replay: true }), m = r.matches[0], p = r.replay.packs[0];
  assert.equal(replayOf(r.replay, r.round, 0, m), p);
  assert.equal(replayOf(r.replay, r.round, 0, { ...m, homeId: 'x' }), null, 'forkert hjemmehold');
  assert.equal(replayOf(r.replay, r.round, 0, { ...m, awayId: 'x' }), null, 'forkert udehold');
  assert.equal(replayOf(r.replay, r.round - 1, 0, m), null); assert.equal(replayOf(r.replay, r.round, 99, m), null);
  assert.equal(replayOf(null, r.round, 0, m), null); assert.equal(replayOf(undefined, r.round, 0, m), null); assert.equal(replayOf({ round: r.round }, r.round, 0, m), null);
});

test('lageret: saveReplay melder false ved fuldt lager; loadReplay afviser ødelagt tekst/forkerte former; resetGame rydder KUN når gemmet lykkedes', () => {
  assert.equal(saveReplay({ setItem() { throw new Error('fuldt'); } }, { round: 1, packs: [] }), false);
  const st = memStorage();
  for (const bad of ['{ikke json', 'null', '"x"', '{"round":1}', '{"round":1.5,"packs":[]}', '{"packs":[]}', '{"round":"1","packs":[]}']) { st.setItem(REPLAY_KEY, bad); assert.equal(loadReplay(st), null, bad); }
  st.setItem(REPLAY_KEY, '{"round":0,"packs":[]}'); assert.deepEqual(loadReplay(st), { round: 0, packs: [] });
  // et gem der ikke kan skrives → resetGame ok:false og gengivelsen står (den gamle liga lever videre)
  const L = createLeague(createRng(4)), r = playRound(L, createRng(5), { replay: true }); saveReplay(st, r.replay);
  const failing = { getItem: (k) => st.getItem(k), removeItem: (k) => st.removeItem(k), setItem: (k, v) => { if (k === SAVE_KEY) throw new Error('fuldt'); st.setItem(k, v); } };
  const out = resetGame(failing, { schemaVersion: 9, league: createLeague(createRng(4)), ui: {}, notes: {} });
  assert.equal(out.ok, false); assert.ok(st.getItem(REPLAY_KEY), 'gengivelsen er ikke ryddet, når det nye spil ikke blev gemt');
});

// ---------- tools/fetch-match.mjs ----------
const withEnv = async (host, fetchStub, fn) => {
  const realFetch = globalThis.fetch, saved = process.env.FIRESTORE_EMULATOR_HOST;
  globalThis.fetch = fetchStub; process.env.FIRESTORE_EMULATOR_HOST = host;
  try { await fn(); } finally { globalThis.fetch = realFetch; if (saved === undefined) delete process.env.FIRESTORE_EMULATOR_HOST; else process.env.FIRESTORE_EMULATOR_HOST = saved; }
};

test('fetch-match: ID_RE-vagten afviser alt der ikke er K-XXXX UDEN at røre netværket (ingen sti-injektion i URL\'en)', async () => {
  const { fetchMatch } = await import('../../tools/fetch-match.mjs'); let n = 0;
  await withEnv('127.0.0.1:1', async () => { n++; return res(404); }, async () => {
    for (const bad of ['K-0O1I', '../../x', 'K-ABCD/../..', 'K-ABCD\n', 'K-abcd', 'K-ABCDE', '', undefined, 'K-ABCD?x=1']) await assert.rejects(() => fetchMatch(bad), /er ikke et kamp-id/, String(bad));
    assert.equal(n, 0, 'intet fetch-kald for ugyldige id\'er');
    await assert.rejects(() => fetchMatch('K-ABCD'), /findes ikke/); assert.equal(n, 1);
  });
});

test('fetch-match: parser feltsvaret (string/integer) og kampen spilles igen identisk; ændret kamp/ingen pakke afsløres', async () => {
  const { fetchMatch, replayMatch } = await import('../../tools/fetch-match.mjs');
  const { m, pack } = realMatch(), p = buildPayload({ match: m, pack, version: '3.24.3', round: 3, season: 1 });
  const fs = Object.fromEntries(Object.entries({ ...p.fields, uid: 'U' }).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v }]));
  let seen;
  await withEnv('h:1', async (url) => { seen = url; return { ok: true, status: 200, json: async () => ({ createTime: 'T', fields: fs }) }; }, async () => {
    const doc = await fetchMatch('K-7F3Q');
    assert.match(seen, /^http:\/\/h:1\/v1\/projects\/demo-tactivar\/databases\/\(default\)\/documents\/matches\/K-7F3Q$/);
    assert.equal(doc.round, 3); assert.equal(doc.season, 1); assert.equal(doc.version, '3.24.3'); assert.equal(doc.score, p.fields.score); assert.equal(doc.id, 'K-7F3Q');
    assert.equal(replayMatch(doc).ok, true, 'identisk');
    const tampered = structuredClone(doc); tampered.body.match.homeGoals += 1;
    assert.equal(replayMatch(tampered).ok, false, 'en ændret kamp (motoren gav noget andet) afsløres');
    const wrongState = structuredClone(doc); wrongState.body.replay.rngState += 1;
    assert.equal(replayMatch(wrongState).ok, false);
    assert.match(replayMatch({ ...doc, body: { ...doc.body, replay: null } }).why, /uden gengivelsespakke/);
  });
});
