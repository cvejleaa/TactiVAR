// v3.16.3: "samme kampe" som påstand med kode (CLAUDE.md "Et tal uden kode er en påstand"). tools/fingerprint.mjs hasher de
// 400 seedede kampe UDEN prosa og visningsfelter (noprose): tal, id'er, typer og minutter. En udgivelse, der kun ændrer tekst
// eller visning (som v3.16.3), lader denne værdi stå; trace-golden(-broad) skifter derimod ved hver tekstændring.
// Værdien ændres KUN bevidst ved en motorændring (og commit-teksten siger hvorfor) – aldrig for at få en tekstændring grøn.
// e45a5498… er v3.16.2-motoren (målt på 887851e og på v3.16.3 med `node tools/fingerprint.mjs 400`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../../tools/fingerprint.mjs';

// v3.16.6 M5 (motor, bevidst): frisparket i samme tick som kortet/skaden er den forseelse – ét rng-træk færre (før e45a5498…)
// v3.16.6 M4: modstanderens løbs-cutback står i referatet (nye hændelser) (før 3bd4687d…)
const NOPROSE_400 = 'fc304e5d8f124b343c342c079d45befd27498b392ade56d13d02968f2ef6fae2';

test('fingeraftryk uden prosa: de 400 seedede kampe er de samme som ved sidste bevidste motorændring (v3.16.6 M5)', async () => {
  const r = await fingerprint(400);
  assert.equal(r.noprose, NOPROSE_400);
  assert.notEqual(r.full, r.noprose, 'data: prosaen er faktisk fjernet i noprose');
});
