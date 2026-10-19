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
  fejl.length = 0;

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

  // ---------- Spillet (regressionsnettet i docs/spec.md §9b) ----------
  fejl.length = 0; // de bevidste testfejl ovenfor tæller ikke med
  const fresh = async () => { const c = await browser.newContext({ viewport: { width: 1400, height: 1000 } }); const pg = await c.newPage(); pg.on('pageerror', (e) => fejl.push(e.message)); await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]'); return pg; };
  const g = await fresh();
  const rows = () => g.locator('#matrix tbody tr').count();
  check('Ny liga: dit hold vises med 18 spillere', (await rows()) === 18);
  check('Holdvælgeren har 8 hold', (await g.locator('#team-select option').count()) === 8);
  const heads = (await g.locator('#matrix thead th').allTextContents()).map((t) => t.replace(/ [▲▼]$/, ''));
  check('Regnearkets kolonner i rækkefølge (Alder står hvor den skal)', JSON.stringify(heads.slice(0, 20)) === JSON.stringify(['Pos/#', 'Spiller', 'Kæde', 'Alder', 'Frisk/🚑', 'Højde', 'Spring', '✈ Luft', 'PAC', 'STA', 'STR', 'BAL', 'PAS', 'FIN', 'POS', 'INT', 'GK', 'Gns', '⭐ Vurd', '🧠 Mod']), heads.join('|'));
  check('Spillerkortet viser 9 evne-barer og luftduel-udregningen', (await g.locator('#player-card .bars .bar').count()) === 9 && (await g.textContent('#aerial-breakdown')).includes('× 0,35'));
  check('Tre fase-paneler og Hvis-Så-regler', (await g.locator('#tactics fieldset[data-phase]').count()) === 3 && (await g.locator('#rules .rule').count()) === 1);
  const bodyText = await g.textContent('body');
  check('Ingen rå skabelon-rester (${, undefined, NaN, null) på siden', !/\$\{|undefined|NaN|\bnull\b/.test(bodyText));
  const optColors = await g.evaluate(() => { const o = document.querySelector('#team-select option'); const cs = getComputedStyle(o); return [cs.color, cs.backgroundColor]; });
  check('Holdvælgerens valgmuligheder er ikke hvid-på-hvid', optColors[0] !== optColors[1], optColors.join(' / '));

  // Sortering på FIN: højeste afslutning øverst
  await g.click('#matrix thead th:nth-child(14)');
  const fins = (await g.locator('#matrix tbody tr td:nth-child(14)').allTextContents()).map(Number);
  check('Sortering på FIN giver højeste først', fins.length === 18 && fins.every((v, i) => i === 0 || fins[i - 1] >= v), fins.join(','));

  // Træk en spiller ud af zonen
  const tok = g.locator('#pitch .token[data-slot="6"]');
  const box = await tok.boundingBox(); const pbox = await g.locator('#pitch').boundingBox();
  await g.mouse.move(box.x + box.width / 2, box.y + 10); await g.mouse.down();
  await g.mouse.move(pbox.x + pbox.width * 0.9, pbox.y + pbox.height * 0.12, { steps: 8 }); await g.mouse.up();
  await g.waitForTimeout(100);
  check('Trukket ud af zonen markeres "⚠ Ude af zone (-20%)"', (await g.locator('#pitch .token[data-slot="6"]').textContent()).includes('Ude af zone'));
  const gkBox = await g.locator('#pitch .token[data-slot="0"]').boundingBox();
  await g.mouse.move(gkBox.x + gkBox.width / 2, gkBox.y + 10); await g.mouse.down(); await g.mouse.move(pbox.x + 20, pbox.y + 20, { steps: 5 }); await g.mouse.up();
  const gkAfter = await g.locator('#pitch .token[data-slot="0"]').boundingBox();
  check('Målmanden kan ikke trækkes', Math.abs(gkAfter.x - gkBox.x) < 1 && Math.abs(gkAfter.y - gkBox.y) < 1);

  // Fasevalg, note og bytte – og alt overlever genindlæsning
  await g.selectOption('#tactics select[data-field="pressingHeight"]', 'HIGH_GEGENPRESS');
  await g.fill('#note-input', 'Stærk i luften');
  const firstName = await g.locator('#matrix tbody tr:first-child td:nth-child(2)').textContent();
  const namesBefore = (await g.locator('#matrix tbody tr td:nth-child(2)').allTextContents()).sort().join();
  check('Gem-status viser klokkeslæt', /Gemt kl\. \d\d/.test(await g.textContent('#save-status')));
  await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
  check('Efter F5: stadig 18 spillere – de samme', (await rows()) === 18 && (await g.locator('#matrix tbody tr td:nth-child(2)').allTextContents()).sort().join() === namesBefore);
  check('Efter F5: trukket position bevaret', (await g.locator('#pitch .token[data-slot="6"]').textContent()).includes('Ude af zone'));
  check('Efter F5: fasevalg bevaret', (await g.inputValue('#tactics select[data-field="pressingHeight"]')) === 'HIGH_GEGENPRESS');
  check('Efter F5: note bevaret', (await g.inputValue('#note-input')) === 'Stærk i luften');
  void firstName;

  // Bytte start ⇄ bænk
  const posOf = async (name) => g.locator('#matrix tbody tr', { hasText: name }).locator('td:first-child').textContent();
  const starter = (await g.locator('#matrix tbody tr:nth-child(2) td:nth-child(2)').textContent());
  const bench = (await g.locator('#matrix tbody tr:nth-child(14) td:nth-child(2)').textContent());
  await g.locator('#matrix tbody tr:nth-child(2) button').click();
  await g.locator('#matrix tbody tr', { hasText: bench }).locator('button').click();
  check('Byt: bænkspilleren overtager pladsen', (await posOf(bench)).startsWith('LB') && (await posOf(starter)).startsWith('BÆNK'));

  // Anti-spionage på et modstanderhold
  await g.selectOption('#team-select', '1');
  const oppText = await g.textContent('#matrix tbody');
  const lockCells = await g.locator('#matrix tbody td.lockcell').count();
  check('Modstander: 13 skjulte kolonner × 18 spillere vises som 🔒 ??', lockCells === 13 * 18, String(lockCells));
  const hiddenCols = await g.evaluate(() => [...document.querySelectorAll('#matrix tbody tr')].flatMap((tr) => [...tr.children].slice(6, 18).map((td) => td.textContent)));
  check('Modstander: spring, luft, de 9 evner og gennemsnit står som 🔒 ?? (12 × 18 celler)', hiddenCols.length === 12 * 18 && hiddenCols.every((t) => t === '🔒 ??'));
  check('Modstander: vurdering vises som stjerner, ikke tal', (await g.locator('#matrix tbody tr td:nth-child(19)').allTextContents()).every((t) => /^[★☆]{5}$|^–$/.test(t)));
  void oppText;
  await g.click('#matrix thead th:nth-child(14)');
  check('Modstander: sortering på FIN afvises med anti-spionage-besked', (await g.textContent('#notice')).includes('Anti-spionage'));
  check('Modstander: spillerkortet skjuler evner og kontrakt', (await g.locator('#player-card .bars').count()) === 0 && (await g.textContent('#player-card')).includes('🔒 ??'));
  check('Modstander: faser og Hvis-Så-regler er skjulte', (await g.locator('#tactics fieldset').count()) === 0);
  check('Modstander: kun dit hold kan trækkes på banen', (await g.locator('#pitch .token.draggable').count()) === 0);

  // Ødelagt gemt spil: aldrig tom side, data bevaret i backup
  await g.evaluate(() => localStorage.setItem('tactivar_save', '{"schemaVersion":1,"league":{"teams":[]}}'));
  await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
  check('Ødelagt gemt spil: synlig fejl med backup-nøgle i stedet for tom side', (await g.isVisible('#load-error')) && (await g.textContent('#load-error')).includes('tactivar_backup_'));
  const backupOk = await g.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('tactivar_backup_') && localStorage.getItem(k).includes('"teams":[]')));
  check('Ødelagt gemt spil: de rå data ligger i backup', backupOk);
  await g.click('#load-error button');
  await g.waitForSelector('#matrix');
  check('Ny liga fra fejlsiden giver 18 spillere', (await rows()) === 18);
  check('Ingen sidefejl under hele forløbet', fejl.length === 0, fejl.join(' | '));
} finally {
  await browser.close();
  server?.close();
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} af ${results.length} FEJLEDE` : `\nAlle ${results.length} bestod`);
process.exit(failed ? 1 : 0);
