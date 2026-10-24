// v3.16.3: "samme kampe" som påstand med kode (CLAUDE.md "Et tal uden kode er en påstand"). tools/fingerprint.mjs hasher de
// 400 seedede kampe UDEN prosa og visningsfelter (noprose): tal, id'er, typer og minutter. En udgivelse, der kun ændrer tekst
// eller visning (som v3.16.3), lader denne værdi stå; trace-golden(-broad) skifter derimod ved hver tekstændring.
// Værdien ændres KUN bevidst ved en motorændring (og commit-teksten siger hvorfor) – aldrig for at få en tekstændring grøn.
// e45a5498… er v3.16.2-motoren (målt på 887851e og på v3.16.3 med `node tools/fingerprint.mjs 400`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../../tools/fingerprint.mjs';

const NOPROSE_400 = 'e45a54981216aa239fe83a3981fcb3a7fc577461e5b295cddff01d3d501b1b0d';

test('fingeraftryk uden prosa: de 400 seedede kampe er de samme som i v3.16.2 (kun tekst og visning er ændret)', async () => {
  const r = await fingerprint(400);
  assert.equal(r.noprose, NOPROSE_400);
  assert.notEqual(r.full, r.noprose, 'data: prosaen er faktisk fjernet i noprose');
});
