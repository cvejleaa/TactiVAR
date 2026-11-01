// v3.24.4, Test Manager: den RIGTIGE public/firebase-config.js (e2e tvinger den altid – så ingen anden test ser den).
// Positiv tilstedeværelse: projektet er præcis 'tactivar' (samme som .firebaserc og deploy.yml).
// Mutationer, der skal gøre den rød: projectId 'earch-93dae' / 'tactivar-x' / 'TactiVAR', FIREBASE = null, apiKey tom/"fake", ekstra felt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIREBASE } from '../../public/firebase-config.js';
import { uploadMatch } from '../../public/state/upload.js';

test('firebase-config.js: opsat (ikke null) med præcis apiKey + projectId – ingen ekstra felter, der kunne pege et andet sted hen', () => {
  assert.ok(FIREBASE !== null && typeof FIREBASE === 'object', 'null = kamp-id slået fra');
  assert.deepEqual(Object.keys(FIREBASE).sort(), ['apiKey', 'projectId']);
});

test('firebase-config.js: projectId er præcis "tactivar" og lig med .firebaserc (aldrig fx earch-93dae)', () => {
  assert.equal(FIREBASE.projectId, 'tactivar');
  const rc = JSON.parse(readFileSync(new URL('../../.firebaserc', import.meta.url), 'utf8'));
  assert.equal(FIREBASE.projectId, rc.projects.default);
});

test('firebase-config.js: apiKey har Google-web-nøglens form (AIza + 35 tegn) – ikke tom, "fake" eller en pladsholder', () => {
  assert.match(FIREBASE.apiKey, /^AIza[0-9A-Za-z_-]{35}$/);
});

test('firebase-config.js: hele vejen – uploadMatch med den rigtige config rammer kun tactivars Firestore og bruger nøglen (falsk fetch, intet netværk)', async () => {
  const urls = [];
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  const fetchFn = async (url) => { urls.push(url); return url.includes('accounts:signUp') ? ok({ idToken: 'I', refreshToken: 'R', localId: 'U' }) : ok({}); };
  const m = new Map(); const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: () => null, length: 0 };
  await uploadMatch(FIREBASE, storage, { v: 1, json: '{}' }, { fetchFn });
  assert.ok(urls.some((u) => u.startsWith('https://firestore.googleapis.com/v1/projects/tactivar/databases/(default)/documents/matches?documentId=K-')), urls.join(' | '));
  assert.ok(urls.some((u) => u === 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FIREBASE.apiKey), urls.join(' | '));
  assert.ok(urls.every((u) => u.startsWith('https://')), 'kun https');
});
