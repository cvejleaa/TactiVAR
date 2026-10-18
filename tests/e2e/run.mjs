// End-to-end-test: starter en lokal server på public/ og kører siden i Chromium.
// Kør: npm run test:e2e  (CHROME_PATH kan pege på en eksisterende Chrome/Chromium).
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { startServer } from '../../tools/serve.mjs';

const PORT = 5055;
const BASE = `http://127.0.0.1:${PORT}`;
const kandidater = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
const executablePath = kandidater.find((p) => p && fs.existsSync(p));

const results = [];
export const check = (name, ok, extra = '') => { results.push(ok); console.log(ok ? '✅' : '❌', name, extra); };

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const fejl = [];
  page.on('pageerror', (e) => fejl.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') fejl.push(m.text()); });

  // --- Fundament: siden starter uden fejl ---
  await page.goto(BASE + '/');
  await page.waitForSelector('body[data-klar="ja"]', { timeout: 10000 });
  check('Siden starter og når klar-tilstand', true);
  check('Versionsnummer vises', /^v\d+\.\d+\.\d+/.test(await page.textContent('#version')));
  check('Fejlboksen er skjult ved normal start', await page.isHidden('#fejlboks'));
  check('Ingen fejl i konsollen', fejl.length === 0, fejl.join(' | '));

  // Fejlfangeren virker: en fejl kastet efter start skal blive synlig, ikke tavs
  await page.evaluate(() => setTimeout(() => { throw new Error('testfejl'); }));
  await page.waitForSelector('#fejlboks:not([hidden])', { timeout: 3000 }).catch(() => {});
  check('En uventet fejl vises i fejlboksen', (await page.textContent('#fejlboks')).includes('testfejl'));

  // Ukendte stier falder tilbage til forsiden (som Firebase Hosting-rewrite)
  const r = await fetch(BASE + '/findes/ikke');
  check('Ukendt sti giver forsiden', r.ok && (await r.text()).includes('TactiVAR Manager'));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} af ${results.length} FEJLEDE` : `\nAlle ${results.length} bestod`);
process.exit(failed ? 1 : 0);
