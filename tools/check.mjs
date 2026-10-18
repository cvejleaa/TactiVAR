// Statisk tjek af public/: hver .js-fil skal kunne parses, og hver relativ import skal
// pege på en fil, der findes. Fanger den klasse af fejl, der i Gemini-versionerne gav
// "spillerne forsvinder" (én syntaksfejl stoppede hele siden).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(new URL('../public', import.meta.url).pathname);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
  }
})(ROOT);

let fejl = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    fejl++; console.error(`❌ Syntaksfejl i ${path.relative(ROOT, f)}:\n${e.stderr}`);
  }
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const spec = m[1] || m[2];
    const target = path.resolve(path.dirname(f), spec);
    if (!fs.existsSync(target)) { fejl++; console.error(`❌ ${path.relative(ROOT, f)} importerer ${spec}, som ikke findes`); }
  }
}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="(?!https?:|#|data:)([^"]+)"/g)) {
  if (!fs.existsSync(path.join(ROOT, m[1]))) { fejl++; console.error(`❌ index.html henviser til ${m[1]}, som ikke findes`); }
}
console.log(fejl ? `${fejl} fejl` : `✅ ${files.length} filer tjekket`);
process.exit(fejl ? 1 : 0);
