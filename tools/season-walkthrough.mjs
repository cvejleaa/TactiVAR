// Spilførerens sæson-gennemgang (brugeren 2026-10-23: "spilføreren skal køre en hel sæson igennem, læse alle referater
// og kigge på UI – på den måde slipper jeg måske for at skulle teste hver gang").
// Spiller en hel sæson (14 runder) i den rigtige side i Chromium som en bruger: ▶ Spil runde, ⏭ spring frem.
// Gemmer i OUT (standard walkthrough/): pr. runde alle fire kampes referater, statistik og klummen som tekst, og
// skærmbilleder af Kamp-fanen (din kamp + det første 📍-billede) og Liga-fanen; til sidst slutstillingen og fejl.
// Spilføreren (domaene-raadgiver) læser mappen bagefter – den kan ikke selv køre browseren.
// v3.16 (brugeren: "spilføreren skal gennemspille 1 sæson mere, men hvor der nu kigger på alle funktionaliteter og især
// spilmotor"): også alle faner (Trup, Taktik, Kamp, Liga med statistik), pr. runde afspilningen (et mål og et højdepunkt),
// heat map for holdet og målscoreren, og kontrolværktøjets rapport for alle fire kampe (tools/trace-invariants.mjs) –
// samlet i spor.md.
//   node tools/season-walkthrough.mjs [OUT]        (BASE_URL=https://tactivar.web.app for den live side)
import { evMin } from '../public/engine/clock.js';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { checkTrace } from './trace-invariants.mjs';

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
  const spor = [];
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
      if (m.stoppage) lines.push(`- ⏱️ Tillægstid: 1. halvleg ${m.stoppage[0].S} min (heraf ${m.stoppage[0].var} VAR), 2. halvleg ${m.stoppage[1].S} min (heraf ${m.stoppage[1].var} VAR)`);
      // v3.17.0: [skjult] = står i data, ikke i Kamp-fanen (botternes gentagne FASE-linjer); [lille] = halvchancen (nedtonet)
      for (const e of m.events) lines.push(`- ${evMin(e)} ${e.quiet ? '[skjult] ' : ''}${e.minor ? '[lille] ' : ''}${e.text}${e.snapshot ? '  📍' : ''}`);
      const s = m.stats || {}, ps = (s.hPoss ?? 0) + (s.aPoss ?? 0) || 1, hp = Math.round((s.hPoss ?? 0) / ps * 100);   // som i Kamp-fanen (procent)
      lines.push('', `Kamptal (hjemme/ude): besiddelse ${hp} %/${100 - hp} % · skud ${s.hShots}/${s.aShots} · på mål ${s.hOnTarget}/${s.aOnTarget} · hjørner ${s.hCorners}/${s.aCorners} · gule ${s.hYellows}/${s.aYellows}`, '');
    }
    // Kontrolværktøjet på rundens fire kampe (sporet i den gemte runde)
    for (const m of L.lastRound.matches) {
      const r = checkTrace(m), f = r.finding;
      spor.push(`R${L.lastRound.round} ${m.homeName}–${m.awayName}: fejl ${r.errors.length}${r.errors.length ? " (" + r.errors.slice(0, 3).join("; ") + ")" : ""} · mål med billede ${f.goals} (scorer ved feltet ${f.scorerInBox}, langskud ${f.longshotOk}/${f.longshots}, kontramål langt ude ${f.counterFar}) · forreste bag sidste forsvarer ${f.frontBehind}/${f.frontFrames} · ${(JSON.stringify(m.trace ?? {}).length / 1024).toFixed(1)} KB`);
      for (const mo of m.trace?.moments ?? []) {
        const e = m.events[mo.ev], pts = mo[mo.side], who = pts.find((q) => q[0] === (mo.scorer ?? mo.shooter));
        lines.push(`  · spor ${m.homeName}–${m.awayName} ${evMin(e)} ${mo.kind}${who ? ` skytte (${who[1]},${who[2]})` : ''} bold (${mo.ball}) – ${e.text.slice(0, 90)}`);
      }
    }
    await tab('kamp'); await box();
    await shot(`${nn}-kamp.png`);
    // Afspilningen: et mål (eller første afslutning) og et grundbillede; heat map for holdet og for målscoreren
    if (await page.locator('#rp-pitch').count()) {
      const goalBtn = page.locator('#feed .ev.goal .replay-btn, #feed .ev.header_goal .replay-btn').first();
      await ((await goalBtn.count()) ? goalBtn : page.locator('#feed .replay-btn').first()).click().catch(() => {});
      await page.waitForTimeout(2400); await page.locator('#replay').screenshot({ path: path.join(OUT, `${nn}-afspilning-maal.png`) });   // øjeblikket er færdigt ved 80 % af 2,6 s (Spilfører)
      lines.push('', `Afspilning (mål/afslutning): ${(await page.textContent('#rp-caption')).trim()}`);
      await page.click('#rp-prev'); await page.waitForTimeout(1000); await page.locator('#replay').screenshot({ path: path.join(OUT, `${nn}-afspilning-foer.png`) });
      lines.push(`Afspilning (trinet før): ${(await page.textContent('#rp-caption')).trim()}`);
      await page.click('#heat-btn').catch(() => {});
      if (await page.locator('#heat-pitch').count()) {
        await page.locator('#heat-pitch').screenshot({ path: path.join(OUT, `${nn}-heat-hold.png`) });
        const scorerRow = page.locator('.ratings tr[title]', { hasText: '⚽' }).first();
        if (await scorerRow.count()) { await scorerRow.click(); await page.waitForTimeout(200); await page.locator('#heat-pitch').screenshot({ path: path.join(OUT, `${nn}-heat-spiller.png`) }); }
        lines.push(`Heat map: ${(await page.textContent('#heat-title')).trim()} – ${(await page.textContent('#heat-note')).trim()} | ${(await page.textContent('#heat-thirds').catch(() => '')).trim()}`);
        await page.click('#heat-back').catch(() => {});
      }
    } else lines.push('', 'Ingen afspilning i Kamp-fanen.');
    const pin = page.locator('#feed .snap-btn').first();
    if (await pin.count()) { await pin.click(); await shot(`${nn}-kamp-mal-billede.png`); }
    await tab('liga'); await box();
    lines.push('## Liga-fanen (klummen og tabellen, som tekst)', '', (await page.textContent('#gazette').catch(() => '(ingen avis)')).trim(), '', (await page.textContent('#standings-title')).trim());
    await shot(`${nn}-liga.png`);
    // v3.18.0: Klub (økonomi og transfermarked) efter hver runde som tekst, billede efter runde 1, 7 og 14
    await tab('klub');
    lines.push('', '## Klub-fanen (som tekst)', '', (await page.textContent('.tabpane').catch(() => '')).trim());
    if ([1, 7, 14].includes(r)) await shot(`${nn}-klub.png`);
    fs.writeFileSync(path.join(OUT, `${nn}-runde.md`), lines.join('\n'));
    console.log(`runde ${r}: ${L.lastRound.matches.map((m) => `${m.homeName} ${m.homeGoals}-${m.awayGoals} ${m.awayName}`).join(' · ')}`);
  }
  await tab('liga'); await page.locator('#stats details').evaluateAll((ds) => ds.forEach((d) => { d.open = true; }));
  await shot('15-saesonslut-liga.png');
  await tab('trup'); await shot('15-saesonslut-trup.png');
  await tab('taktik'); await shot('15-saesonslut-taktik.png');
  // v3.18.0: sæsonrapporten, Klub, eget kort (træning, 📜 Kampe, marked) og en bots kort (💰 pris) – og første runde af sæson 2
  const extra = ['# Sæsonslut og sæson 2 (v3.18.0)', ''];
  await tab('liga'); extra.push('## Sæsonrapporten', '', (await page.textContent('#season-report').catch(() => '(ingen)')).trim(), '');
  await page.locator('#season-report').screenshot({ path: path.join(OUT, '15-saesonrapport.png') }).catch(() => {});
  extra.push('## Transfers på Liga', '', (await page.textContent('#transfer-log').catch(() => '(ingen)')).trim(), '');
  await tab('klub'); extra.push('## Klub', '', (await page.textContent('.tabpane')).trim(), ''); await shot('15-saesonslut-klub.png');
  await tab('trup'); await page.click('#matrix tbody tr:nth-child(9)');
  extra.push('## Eget spillerkort', '', (await page.textContent('#player-card')).trim(), ''); await page.locator('#player-card').screenshot({ path: path.join(OUT, '15-kort-eget.png') });
  await page.selectOption('#team-select', '2'); await page.click('#matrix tbody tr:nth-child(14)');
  extra.push('## En anden klubs spillerkort', '', (await page.textContent('#player-card')).trim(), ''); await page.locator('#player-card').screenshot({ path: path.join(OUT, '15-kort-bot.png') });
  await page.selectOption('#team-select', '0');
  await page.click('#play-round'); await page.waitForSelector('#skip'); await page.click('#skip');
  await tab('trup'); extra.push('## Trup efter sæson 2, runde 1', '', (await page.textContent('.tabpane')).trim().slice(0, 1500), ''); await shot('16-saeson2-trup.png');
  await tab('klub'); extra.push('## Klub efter sæson 2, runde 1', '', (await page.textContent('.tabpane')).trim(), ''); await shot('16-saeson2-klub.png');
  await tab('liga'); extra.push('## Liga efter sæson 2, runde 1', '', (await page.textContent('.tabpane')).trim().slice(0, 3000), ''); await shot('16-saeson2-liga.png');
  fs.writeFileSync(path.join(OUT, '15-saesonslut-og-saeson2.md'), extra.join('\n'));
  fs.writeFileSync(path.join(OUT, 'spor.md'), ['# Kontrolværktøjet (tools/trace-invariants.mjs) pr. kamp', '', ...spor].join('\n'));
} finally {
  fs.writeFileSync(path.join(OUT, 'fejl.txt'), fejl.length ? fejl.join('\n') : 'Ingen sidefejl, konsolfejl eller fejlboks under hele sæsonen.');
  await browser.close(); server?.close();
}
console.log(`Gemt i ${OUT} – ${fejl.length} fejl.`);
