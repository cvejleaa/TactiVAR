// End-to-end-test: starter en lokal server på public/ og kører siden i Chromium.
// Kør: npm run test:e2e  (CHROME_PATH kan pege på en eksisterende Chrome/Chromium).
// Med BASE_URL sat (fx https://tactivar.web.app) køres testen mod den side i stedet
// for en lokal server – deploy.yml bruger det som smoke-test efter hvert deploy.
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { startServer } from '../../tools/serve.mjs';

const PORT = 5055;
const BASE = (process.env.BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const kandidater = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
const executablePath = kandidater.find((p) => p && fs.existsSync(p));
if (!executablePath) { console.error('❌ Ingen Chrome/Chromium fundet – sæt CHROME_PATH.'); process.exit(1); }

const results = [];
export const check = (name, ok, extra = '') => { results.push(ok); console.log(ok ? '✅' : '❌', name, extra); };

const server = process.env.BASE_URL ? null : await startServer(PORT);
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

  // Fejlfangeren virker: en fejl efter start skal blive SYNLIG (ikke kun stå i en skjult boks)
  await page.evaluate(() => setTimeout(() => { throw new Error('testfejl'); }));
  await page.waitForFunction(() => document.getElementById('fejlboks').textContent.includes('testfejl'), null, { timeout: 3000 });
  check('En uventet fejl vises synligt i fejlboksen', await page.isVisible('#fejlboks'));
  await page.evaluate(() => { Promise.reject(new Error('afvist løfte')); });
  await page.waitForFunction(() => document.getElementById('fejlboks').textContent.includes('afvist løfte'), null, { timeout: 3000 }).catch(() => {});
  check('Et afvist promise vises i fejlboksen', (await page.textContent('#fejlboks')).includes('afvist løfte'));

  // Ukendte stier falder tilbage til forsiden (som Firebase Hosting-rewrite)
  const r = await fetch(BASE + '/findes/ikke');
  check('Ukendt sti giver forsiden', r.ok && (await r.text()).includes('TactiVAR Manager'));
} finally {
  await browser.close();
  server?.close();
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} af ${results.length} FEJLEDE` : `\nAlle ${results.length} bestod`);
process.exit(failed ? 1 : 0);
