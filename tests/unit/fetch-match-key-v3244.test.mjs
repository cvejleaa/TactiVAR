// v3.24.4: læsenøglen kan lægges i Claude-miljøets "Miljøvariabler" som to linjer (e-mail + private_key, som i JSON-filen
// med \n) – brugeren kan ikke indsætte en flerlinjet JSON-fil dér. Nøglen skal kunne signere (ellers afviser Google).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign, createVerify } from 'node:crypto';
import { readKey } from '../../tools/fetch-match.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const asInFile = JSON.stringify(pem).slice(1, -1);   // sådan står den i JSON-filen: én linje med \n
const signs = (k) => createVerify('RSA-SHA256').update('x').verify(publicKey, createSign('RSA-SHA256').update('x').sign(k.private_key));

test('to miljøvariabler (som kopieret fra JSON-filen, med eller uden anførselstegn) giver en nøgle, der kan signere', () => {
  assert.ok(asInFile.includes('\\n') && !asInFile.includes('\n'), 'data: én linje med \\n');
  for (const v of [asInFile, `"${asInFile}"`, ` ${asInFile} `]) {
    const k = readKey({ FIREBASE_READ_EMAIL: '"github-read@tactivar.iam.gserviceaccount.com"', FIREBASE_READ_PRIVATE_KEY: v });
    assert.equal(k.client_email, 'github-read@tactivar.iam.gserviceaccount.com');
    assert.equal(k.project_id, 'tactivar');
    assert.equal(k.private_key, pem);
    assert.ok(signs(k));
  }
});

test('hele JSON-filen virker stadig; mangler nøglen, siges hvilke variabler', () => {
  const k = readKey({ FIREBASE_READ_KEY: JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: pem, project_id: 'tactivar' }) });
  assert.ok(signs(k));
  assert.throws(() => readKey({}), /FIREBASE_READ_EMAIL og FIREBASE_READ_PRIVATE_KEY/);
  assert.throws(() => readKey({ FIREBASE_READ_EMAIL: 'x' }), /mangler/);
});
