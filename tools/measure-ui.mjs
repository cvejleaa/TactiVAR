// Brugerfladens tal (UI-ombygningen F0–F6, backlog nr. 0 – brugeren 2026-11-02: "forvirrende og alt for mange informationer
// klemt sammen"): pr. fane og bredde – sidehøjde, antal distinkte skriftstørrelser og tekstfarver, knapper, tal og ord.
// Kør: node tools/measure-ui.mjs [BASE_URL] [--json]   (uden BASE_URL startes en lokal server på public/)
// Før/efter hvert trin skrives i spec §10b (tallene svinger lidt med den tilfældige liga – derfor "ca.").
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const kandidater = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium', '/usr/bin/chromium'];
export const TAB_KEYS = ['hjem', 'trup', 'taktik', 'kamp', 'liga', 'klub', 'admin'];

export async function measureUi({ base, widths = [1366, 390], afterRound = true } = {}) {
  const executablePath = kandidater.find((p) => p && fs.existsSync(p));
  const port = 5600 + Math.floor(Math.random() * 300);
  const server = base ? null : await startServer(port);
  const url = (base ?? `http://127.0.0.1:${port}`).replace(/\/$/, '') + '/';
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const out = {};
  try {
    for (const w of widths) {
      const g = await (await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 } })).newPage();
      await g.goto(url); await g.waitForSelector('body[data-klar="ja"]');
      if (afterRound) {   // en spillet runde, så Kamp/Liga har indhold
        await g.click('#play-round'); await g.waitForTimeout(300);
        if (await g.$('#skip')) await g.click('#skip');
        await g.waitForTimeout(500);
      }
      for (const k of TAB_KEYS) {
        if (!(await g.$(`#tab-${k}`))) continue;
        await g.click(`#tab-${k}`); await g.waitForSelector(`.tabpane.tab-${k}`); await g.waitForTimeout(150);
        out[`${k}@${w}`] = await g.evaluate(() => {
          const els = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent !== null || e.tagName === 'BODY');
          const txt = els.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
          const app = document.querySelector('#app');
          return {
            height: document.documentElement.scrollHeight,
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            fontSizes: [...new Set(txt.map((e) => getComputedStyle(e).fontSize))].sort((a, b) => parseFloat(a) - parseFloat(b)),
            colors: [...new Set(txt.map((e) => getComputedStyle(e).color))].length,
            buttons: app.querySelectorAll('button').length,
            numbers: (app.innerText.match(/\d+([.,]\d+)?/g) || []).length,
            words: app.innerText.split(/\s+/).filter(Boolean).length,
          };
        });
      }
    }
  } finally { await browser.close(); server?.close?.(); }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.argv.slice(2).find((a) => /^https?:/.test(a));
  const r = await measureUi({ base });
  if (process.argv.includes('--json')) console.log(JSON.stringify(r));
  else for (const [k, v] of Object.entries(r)) console.log(k.padEnd(12), `højde ${v.height}`, `vandret ${v.overflowX}`, `skrift ${v.fontSizes.length} (${v.fontSizes.join(' ')})`, `farver ${v.colors}`, `knapper ${v.buttons}`, `tal ${v.numbers}`, `ord ${v.words}`);
  process.exit(0);
}
