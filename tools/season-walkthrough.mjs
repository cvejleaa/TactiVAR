// Spilførerens sæson-gennemgang (brugeren 2026-10-23: "spilføreren skal køre en hel sæson igennem, læse alle referater
// og kigge på UI – på den måde slipper jeg måske for at skulle teste hver gang").
// Spiller en hel sæson (14 runder) i den rigtige side i Chromium som en bruger: ▶ Spil runde, ⏭ spring frem.
// Gemmer i OUT (standard walkthrough/): pr. runde alle fire kampes referater, statistik og klummen som tekst, og
// skærmbilleder af Kamp-fanen (din kamp + det første 📍-billede) og Liga-fanen; til sidst slutstillingen og fejl.
// Spilføreren (domaene-raadgiver) læser mappen bagefter – den kan ikke selv køre browseren.
//   node tools/season-walkthrough.mjs [OUT]        (BASE_URL=https://tactivar.web.app for den live side)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const OUT = path.resolve(process.argv[2] || 'walkthrough');
const PORT = Number(process.env.PORT || 5077);
const BASE = (process.env.BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const exe = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!exe) { console.error('Ingen Chrome/Chromium fundet – sæt CHROME_PATH.'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const server = process.env.BASE_URL ? null : await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const fejl = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  page.on('pageerror', (e) => fejl.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') fejl.push(`console: ${m.text()}`); });
  await page.goto(BASE + '/');
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); });
  await page.reload(); await page.waitForSelector('body[data-klar="ja"]');
  const tab = async (k) => { await page.click(`#tab-${k}`); await page.waitForSelector(`.tabpane.tab-${k}`); };
  const shot = (name) => page.screenshot({ path: path.join(OUT, name), fullPage: true });
  const box = async () => ((await page.locator('#fejlboks').isVisible()) ? fejl.push(`fejlboks: ${await page.textContent('#fejlboks')}`) : 0);

  for (const k of ['trup', 'taktik']) { await tab(k); await shot(`00-${k}.png`); }
  const league = () => page.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league);
  for (let r = 1; r <= 14; r++) {
    const label = await page.textContent('#play-round');
    await page.click('#play-round'); await page.waitForSelector('#skip'); await page.click('#skip');
    await page.waitForFunction(() => !document.querySelector('#skip'));
    const L = await league(), nn = String(r).padStart(2, '0');
    const me = L.teams.find((t) => !t.isBot);
    // Referaterne: alle fire kampe, som de står i Kamp-fanen (tekst), plus kamptal.
    const lines = [`# Runde ${r} (${label.trim()})`, ''];
    for (const m of L.lastRound.matches) {
      const mine = m.homeId === me.id || m.awayId === me.id;
      lines.push(`## ${m.homeName} ${m.homeGoals}-${m.awayGoals} ${m.awayName}${mine ? '  ← dit hold' : ''}`, '');
      for (const e of m.events) lines.push(`- ${e.min}' ${e.text}${e.snapshot ? '  📍' : ''}`);
      const s = m.stats || {}, ps = (s.hPoss ?? 0) + (s.aPoss ?? 0) || 1, hp = Math.round((s.hPoss ?? 0) / ps * 100);   // som i Kamp-fanen (procent)
      lines.push('', `Kamptal (hjemme/ude): besiddelse ${hp} %/${100 - hp} % · skud ${s.hShots}/${s.aShots} · på mål ${s.hOnTarget}/${s.aOnTarget} · hjørner ${s.hCorners}/${s.aCorners} · gule ${s.hYellows}/${s.aYellows}`, '');
    }
    await tab('kamp'); await box();
    await shot(`${nn}-kamp.png`);
    const pin = page.locator('#feed .snap-btn').first();
    if (await pin.count()) { await pin.click(); await shot(`${nn}-kamp-mal-billede.png`); }
    await tab('liga'); await box();
    lines.push('## Liga-fanen (klummen og tabellen, som tekst)', '', (await page.textContent('#gazette').catch(() => '(ingen avis)')).trim(), '', (await page.textContent('#standings-title')).trim());
    await shot(`${nn}-liga.png`);
    fs.writeFileSync(path.join(OUT, `${nn}-runde.md`), lines.join('\n'));
    console.log(`runde ${r}: ${L.lastRound.matches.map((m) => `${m.homeName} ${m.homeGoals}-${m.awayGoals} ${m.awayName}`).join(' · ')}`);
  }
  await tab('liga'); await page.locator('#stats details').evaluateAll((ds) => ds.forEach((d) => { d.open = true; }));
  await shot('15-saesonslut-liga.png');
  await tab('trup'); await shot('15-saesonslut-trup.png');
} finally {
  fs.writeFileSync(path.join(OUT, 'fejl.txt'), fejl.length ? fejl.join('\n') : 'Ingen sidefejl, konsolfejl eller fejlboks under hele sæsonen.');
  await browser.close(); server?.close();
}
console.log(`Gemt i ${OUT} – ${fejl.length} fejl.`);
