// Kør: npm run serve & node tools/measure-layout.mjs http://127.0.0.1:5000  (v3.10.1, QC)
// Måler statistik-layoutet i Chromium: vandret overløb ved 360 px og stjerner, der klippes.
import { chromium } from 'playwright-core';
const [base] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const w of [360, 1280, 1920]) {
  const p = await (await browser.newContext({ viewport: { width: w, height: 900 } })).newPage();
  await p.goto(base); await p.waitForSelector('body[data-klar="ja"]');
  await p.click('#play-round'); await p.click('#skip').catch(() => {});
  await p.click('#tab-liga'); await p.waitForSelector('#stats');
  const r = await p.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    clippedVals: [...document.querySelectorAll('.st-val')].filter((td) => td.scrollWidth > td.clientWidth + 1).length,
    vals: document.querySelectorAll('.st-val').length,
    nameWidth: Math.round(document.querySelector('.st-name')?.getBoundingClientRect().width ?? 0),
  }));
  console.log(w, JSON.stringify(r));
}
await browser.close();
