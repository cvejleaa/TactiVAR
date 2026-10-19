// Tester selve det statiske tjek (tools/check.mjs) mod små fixture-mapper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = new URL('../../tools/check.mjs', import.meta.url).pathname;
function run(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-'));
  for (const [name, src] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), src);
  return spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' });
}

test('gyldige filer består', () => {
  assert.equal(run({ 'a.js': "import { b } from './b.js'; import './c.js';", 'b.js': 'export const b = 1;', 'c.js': '' }).status, 0);
});
test('syntaksfejl fanges', () => {
  const r = run({ 'a.js': 'let = ;' });
  assert.equal(r.status, 1); assert.match(r.stderr, /Syntaksfejl i a\.js/);
});
test('manglende modul fanges – også bare side-effect-import', () => {
  assert.equal(run({ 'a.js': "import { x } from './mangler.js';" }).status, 1);
  assert.equal(run({ 'a.js': "import './mangler.js';" }).status, 1);
});
test('index.html med henvisning til manglende fil fanges', () => {
  assert.equal(run({ 'index.html': '<script src="mangler.js"></script>' }).status, 1);
});
