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

  // Byt på banen: klik på to brikker (som i v2.5)
  const nameAt = async (slot) => (await g.locator(`#pitch .token[data-slot="${slot}"] .token-name`).textContent());
  const [n2, n3] = [await nameAt(2), await nameAt(3)];
  await g.click('#pitch .token[data-slot="2"]'); await g.click('#pitch .token[data-slot="3"]');
  check('Klik på to brikker bytter deres pladser', (await nameAt(2)) === n3 && (await nameAt(3)) === n2);
  const [n4, n5] = [await nameAt(4), await nameAt(5)];
  await g.click('#pitch .token[data-slot="4"]'); await g.click('#matrix thead th:nth-child(4)'); await g.click('#pitch .token[data-slot="5"]');
  check('Et påbegyndt byt afbrydes af sortering (intet byt uden varsel)', (await nameAt(4)) === n4 && (await nameAt(5)) === n5);
  await g.click('#matrix thead th:nth-child(1)');

  // Hver ændring gemmes STRAKS: genindlæs efter hver enkelt handling
  const reload = async () => { await g.reload(); await g.waitForSelector('body[data-klar="ja"]'); };
  await g.selectOption('#formation', '3-5-2'); await reload();
  check('Formation gemmes straks', (await g.inputValue('#formation')) === '3-5-2');
  await g.click('#add-rule'); await reload();
  check('Ny Hvis-Så-regel gemmes straks', (await g.locator('#rules .rule').count()) === 2);
  await g.click('.presets button:nth-child(2)'); await reload();
  check('Plan-skift gemmes straks', (await g.textContent('.presets button.active')).startsWith('Plan B') && (await g.inputValue('#formation')) === '4-3-3');
  const [s7, s8] = [await nameAt(7), await nameAt(8)];
  await g.click('#pitch .token[data-slot="7"]'); await g.click('#pitch .token[data-slot="8"]'); await reload();
  check('Byt gemmes straks', (await nameAt(7)) === s8 && (await nameAt(8)) === s7);
  await g.selectOption('#tactics select[data-field="onBallWon"]', 'KEEP_POSSESSION'); await reload();
  check('Fasevalg gemmes straks', (await g.inputValue('#tactics select[data-field="onBallWon"]')) === 'KEEP_POSSESSION');

  // Gem-fejl er synlig, aldrig tavs
  await g.evaluate(() => { window.__set = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); }; });
  await g.selectOption('#tactics select[data-field="onBallWon"]', 'FAST_COUNTER');
  check('Gem-fejl vises i fejlboksen og som "IKKE gemt"', (await g.isVisible('#fejlboks')) && (await g.textContent('#save-status')).includes('IKKE gemt'));
  await g.evaluate(() => { Storage.prototype.setItem = window.__set; document.getElementById('fejlboks').hidden = true; document.getElementById('fejlboks').replaceChildren(); });
  await g.click('#save-now');
  check('"Gem nu" gemmer igen efter fejlen', (await g.textContent('#save-status')).includes('Gemt kl.'));

  // Sorteringsvagten: sortér eget hold på FIN, skift til en modstander – rækkefølgen må ikke røbe FIN
  await g.click('#matrix thead th:nth-child(14)');
  await g.click('#standings tbody tr:not(.mine)');
  const posCol = await g.locator('#matrix tbody tr td:nth-child(1)').allTextContents();
  check('Modstanderens tabel falder tilbage til opstillingsorden, ikke skjult FIN-orden', posCol[0].startsWith('GK') && !(await g.textContent('#matrix thead')).includes('FIN ▼'));
  await g.selectOption('#team-select', '0');

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
  check('Modstander: formationen kan ikke ændres og der er ingen byt-knapper', (await g.isDisabled('#formation')) && (await g.locator('#matrix tbody button').count()) === 0);
  const oppBefore = await g.locator('#pitch .token[data-slot="2"] .token-name').textContent();
  await g.click('#pitch .token[data-slot="2"]'); await g.click('#pitch .token[data-slot="3"]');
  check('Modstander: klik på to brikker bytter ikke', (await g.locator('#pitch .token[data-slot="2"] .token-name').textContent()) === oppBefore);
  check('Ligatabellen viser holdenes typiske stil', (await g.textContent('#standings')).includes('•'));
  await g.click('#wide-toggle');
  check('Bred visning kan slås til og fra på et bot-hold', (await g.locator('.grid.wide').count()) === 1 && (await g.click('#wide-toggle'), (await g.locator('.grid.wide').count()) === 0));

  // ---------- Kampe: Match Center ----------
  await g.selectOption('#team-select', '0');
  await g.selectOption('#team-select', '3'); // kampknappen findes også, mens man scouter
  await g.click('#play-round');
  await g.waitForSelector('#match-center');
  check('Under afspilning kan runden ikke startes igen', await g.isDisabled('#play-round'));
  check('Under afspilning: besked om at runden er bogført, og de andre resultater er skjulte', (await g.isVisible('#booked-note')) && !/\d-\d/.test(await g.locator('#match-cards .matchcard:nth-child(2)').textContent()));
  await g.click('#skip');
  check('Runden har 4 kampe', (await g.locator('#match-cards .matchcard').count()) === 4);
  const mcText = await g.textContent('#match-center');
  check('Referatet indeholder slutfløjt, statistik og karakterark', mcText.includes('SLUTFLØJT') && (await g.isVisible('#match-stats')) && (await g.locator('.ratings').count()) === 2);
  const feedText = await g.textContent('#feed');
  check('Referatet: ingen evnetal og ingen interne koder', !/\b(FIN|PAS|POS|INT|STA|STR|BAL|PAC)\s*[:=]?\s*\d/.test(feedText) && !/BALANCED|MID_BLOCK|HIGH_GEGENPRESS/.test(mcText));
  const score = (await g.textContent('#score')).trim();
  check('Resultattavlen svarer til slutfløjtet', mcText.includes(`${score.replace(' - ', ' - ')}`) && /\d+ - \d+/.test(score));
  const oppRatings = await g.locator('.ratings').nth(1).locator('td.rating').allTextContents();
  const ownRatings = await g.locator('.ratings').nth(0).locator('td.rating').allTextContents();
  check('Karakterark: eget hold eksakte karakterer, modstander kun stjerner', ownRatings.every((t) => /^\d+\.\d$/.test(t)) && oppRatings.length >= 11 && oppRatings.every((t) => /^[★☆]{5}$/.test(t)));
  const por = await g.textContent('#player-of-round');
  const porIsMine = (await g.locator('.ratings').nth(0).textContent()).includes(por.match(/#\d+ [^ ]+ [^ (]+/)[0]);
  check('Avisen kårer rundens spiller – med karakter kun hvis det er din spiller, ellers stjerner', porIsMine ? /karakter \d+\.\d/.test(por) : (/[★☆]{5}/.test(por) && !/karakter/.test(por)), por);
  const allEvents = await g.locator('#feed .ev').count();
  await g.click('#match-center .toolbar button:nth-child(3)');
  check('Filteret "Kun nøglemomenter" viser færre hændelser', (await g.locator('#feed .ev').count()) < allEvents);
  await g.click('#match-cards .matchcard:nth-child(2)');
  check('De øvrige kampe kan åbnes', (await g.textContent('#scoreboard')).includes((await g.textContent('#match-cards .matchcard:nth-child(2)')).split(' ')[0]));
  await g.click('#close-mc');
  const stHead = await g.locator('#standings').locator('xpath=..').locator('h3').textContent();
  check('Ligatabellen er opdateret efter runde 1', stHead.includes('efter 1 runde'), stHead);
  await reload();
  check('Efter F5: runden er gemt og kan genses', (await g.isVisible('#open-last')) && (await g.textContent('#play-round')).includes('runde 2'));

  // Ny liga og import tager backup af det nuværende spil
  await g.selectOption('#team-select', '0');
  const savedBefore = await g.evaluate(() => localStorage.getItem('tactivar_save'));
  g.once('dialog', (d) => d.accept());
  await g.click('#new-league');
  const backups = async () => g.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('tactivar_backup_')).map((k) => localStorage.getItem(k)));
  check('Ny liga: det gamle spil ligger i backup', (await backups()).includes(savedBefore));
  const exported = await g.evaluate(() => localStorage.getItem('tactivar_save'));
  await g.setInputFiles('#import-file', { name: 'gammel.json', mimeType: 'application/json', buffer: Buffer.from(savedBefore) });
  await g.waitForFunction(() => document.getElementById('notice')?.textContent.includes('importeret'));
  check('Import: indlæser filen og lægger det forrige spil i backup', (await backups()).includes(exported) && (await rows()) === 18);

  // Ødelagt gemt spil: aldrig tom side, data bevaret i backup
  await g.evaluate(() => localStorage.setItem('tactivar_save', '{"schemaVersion":1,"league":{"teams":[]}}'));
  await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
  check('Ødelagt gemt spil: synlig fejl med backup-nøgle i stedet for tom side', (await g.isVisible('#load-error')) && (await g.textContent('#load-error')).includes('tactivar_backup_'));
  const backupOk = await g.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('tactivar_backup_') && localStorage.getItem(k).includes('"teams":[]')));
  check('Ødelagt gemt spil: de rå data ligger i backup', backupOk);
  check('Ødelagt gemt spil: knap til at hente backuppen som fil', await g.isVisible('#download-backup'));
  await g.click('#start-new');
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
