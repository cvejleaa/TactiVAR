// End-to-end-test: starter en lokal server på public/ og kører siden i Chromium.
// Kør: npm run test:e2e  (CHROME_PATH kan pege på en eksisterende Chrome/Chromium).
// Med BASE_URL sat (fx https://tactivar.web.app) køres testen mod den side i stedet
// for en lokal server – deploy.yml bruger det som smoke-test efter hvert deploy.
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { startServer } from '../../tools/serve.mjs';

const PORT = Number(process.env.PORT || 5055); // egen port, når flere kørsler deler maskinen
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
  let g = await fresh();
  const rows = () => g.locator('#matrix tbody tr').count();
  const tab = async (k) => { await g.click(`#tab-${k}`); await g.waitForSelector(`.tabpane.tab-${k}`); };
  check('Fire faner, Trup er åben fra start', (await g.locator('#tabs .tab').count()) === 4 && (await g.textContent('#tabs .tab.active')).includes('Trup'));
  check('Ny liga: dit hold vises med 18 spillere', (await rows()) === 18);
  check('Ny liga: ingen "Nyt i kampene"-besked (den er til dem, der opdaterer et gammelt gem)', (await g.locator('#notice').count()) === 0);
  check('Holdvælgeren har 8 hold', (await g.locator('#team-select option').count()) === 8);
  const heads = (await g.locator('#matrix thead th').allTextContents()).map((t) => t.replace(/ [▲▼]$/, ''));
  check('Regnearkets kolonner i rækkefølge (Alder står hvor den skal)', JSON.stringify(heads.slice(0, 21)) === JSON.stringify(['Pos/#', 'Spiller', 'Kæde', 'Natur', 'Alder', 'Frisk/🚑', 'Højde', 'Spring', '✈ Luft', 'PAC', 'STA', 'STR', 'BAL', 'PAS', 'FIN', 'POS', 'INT', 'GK', 'Gns', '⭐ Vurd', '🧠 Mod']), heads.join('|'));
  const modCells = await g.locator('#matrix tbody td.modcell').allTextContents();
  check('Mod-kolonnen viser tre egne værdier, ingen % mod en modstander', modCells.length === 18 && modCells.every((t) => /^\d+ · \d+ · \d+$/.test(t)) && !(await g.textContent('body')).match(/mod-kunnen[^.)]*\d+\s*%|mod [A-ZÆØÅ][^:]*: \d+%/i), modCells[0]);
  const used = await g.textContent('#counter-pool #counter-used');
  const usedN = Number(used.match(/Erfaring brugt: (\d+)\/100/)?.[1]);
  const shown = (await g.textContent('#player-card h3')).match(/^#(\d+)/)[1];
  const expectSum = await g.evaluate((nr) => { const t = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot); const p = t.squad.find((x) => String(x.shirtNumber) === nr); return p.counterTactics.vsPress + p.counterTactics.vsLowBlock + p.counterTactics.vsTrapLong; }, shown);
  check('Spillerkortet viser puljen: erfaring brugt = summen af de tre værdier /100, og hvad der sker, når den er fuld', usedN === expectSum && used.includes('glemmer'), `${used} (forventet ${expectSum})`);
  check('Spillerkortet viser 9 evne-barer og luftduel-udregningen', (await g.locator('#player-card .bars .bar').count()) === 9 && (await g.textContent('#aerial-breakdown')).includes('× 0,35'));
  // v3.8 (Test Manager): kortets overskrift viser spillerens EGEN naturlige position med fuld betegnelse
  const FULL_POS = { GK: 'Målmand', CB: 'Midtstopper', FB: 'Back/wingback (LB/RB/LWB/RWB)', CM: 'Central/defensiv midtbane (CM/CDM)', WM: 'Kant (LM/RM/LW/RW)', AM: 'Offensiv midtbane (CAM/CF)', ST: 'Angriber (ST)' };
  const shownPos = await g.evaluate((nr) => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot).squad.find((x) => String(x.shirtNumber) === nr).position, shown);
  const cardHead = await g.textContent('#player-card .card-head');
  check('Spillerkortet: kæde og naturlig position med fuld betegnelse (kun den ene)', cardHead.includes(` • ${FULL_POS[shownPos]} • `) && Object.values(FULL_POS).filter((t) => cardHead.includes(` • ${t} • `)).length === 1 && !cardHead.includes('(('), `${shownPos}: ${cardHead}`);
  // Opstilling i Trup: regneark, bane, bænk og kort på samme fane – men ikke taktik-indstillingerne
  check('Trup-fanen har regneark, bane, bænk og spillerkort – men ikke taktikken', (await g.isVisible('#matrix')) && (await g.isVisible('#pitch')) && (await g.isVisible('#bench')) && (await g.isVisible('#player-card')) && (await g.locator('#tactics').count()) === 0);
  // Ét fælles byt: start i regnearket (bænkspiller), afslut på banen
  const tName = async (slot) => g.locator(`#pitch .token[data-slot="${slot}"] .token-name`).textContent();
  const benchRow = g.locator('#matrix tbody tr', { hasText: 'BÆNK' }).first();
  const benchShort = (await benchRow.locator('td:nth-child(2)').textContent()).trim();
  await benchRow.locator('button').click();
  await g.click('#pitch .token[data-slot="7"]');
  check('Byt startet i regnearket kan afsluttes på banen', (await tName(7)) === benchShort, `${benchShort} / ${await tName(7)}`);
  await g.locator('#matrix tbody tr', { hasText: benchShort }).locator('button').click();
  await g.locator('#bench .bench-p').first().click();
  check('…og et byt startet i regnearket kan afsluttes på bænken', (await tName(7)) !== benchShort && (await g.locator('#notice').count()) === 0);
  // Et byt startet på banen markeres også i regnearket
  const n7 = await tName(7);
  await g.click('#pitch .token[data-slot="7"]');
  check('Byt startet på banen markeres i regnearket', (await g.locator('#matrix tbody tr.swapping').count()) === 1 && (await g.locator('#matrix tbody tr.swapping').textContent()).includes(n7));
  await g.click('#pitch .token[data-slot="7"]');
  // Samme spiller to gange i regnearket: intet byt, ingen besked
  const posBefore = await g.locator('#matrix tbody tr td:first-child').allTextContents();
  await g.locator('#matrix tbody tr:nth-child(3) button').click(); await g.locator('#matrix tbody tr:nth-child(3) button').click();
  check('Samme spiller valgt to gange: intet byt og ingen besked', JSON.stringify(await g.locator('#matrix tbody tr td:first-child').allTextContents()) === JSON.stringify(posBefore) && (await g.locator('#notice').count()) === 0 && (await g.locator('#matrix tbody tr.swapping').count()) === 0);
  // Bænk → bænk vælger om; holdskift nulstiller valget
  await g.locator('#bench .bench-p').nth(0).click(); await g.locator('#bench .bench-p').nth(1).click();
  check('Bænk efter bænk: det nye valg erstatter det gamle', (await g.locator('#bench .bench-p.active').count()) === 1 && (await g.locator('#bench .bench-p').nth(1).getAttribute('class')).includes('active'));
  await g.selectOption('#team-select', '1'); await g.selectOption('#team-select', '0');
  check('Holdskift nulstiller et påbegyndt byt', (await g.locator('#bench .bench-p.active').count()) === 0 && (await g.locator('#notice').count()) === 0);
  const smallTop = await (async () => { await g.setViewportSize({ width: 1366, height: 768 }); await g.evaluate(() => window.scrollTo(0, 0)); const t = await g.evaluate(() => document.getElementById('pitch').getBoundingClientRect().top); await g.setViewportSize({ width: 1400, height: 1000 }); return t; })();
  // Mindst den øverste tredjedel af banen (angrebet) skal kunne ses uden at scrolle.
  check('Laptop (1366×768): banen begynder højt nok til, at mindst 200 px af den ses i Trup', smallTop < 768 - 200, `${Math.round(smallTop)}px`);
  const ratio = await g.evaluate(() => { const r = document.getElementById('pitch').getBoundingClientRect(); return r.width / r.height; });
  check('Banen bevarer sit forhold 68:80 (ikke strakt)', Math.abs(ratio - 68 / 80) < 0.02, ratio.toFixed(3));
  await tab('taktik');
  check('Taktik-fanen: bane, spillerkort og taktik – men ikke regnearket', (await g.isVisible('#pitch')) && (await g.isVisible('#player-card')) && (await g.locator('#matrix').count()) === 0);
  check('Tre fase-paneler og Hvis-Så-regler', (await g.locator('#tactics fieldset[data-phase]').count()) === 3 && (await g.locator('#rules .rule').count()) === 1);
  const bodyText = await g.textContent('body');
  check('Ingen rå skabelon-rester (${, undefined, NaN, null) på siden', !/\$\{|undefined|NaN|\bnull\b/.test(bodyText));
  const optColors = await g.evaluate(() => { const o = document.querySelector('#team-select option'); const cs = getComputedStyle(o); return [cs.color, cs.backgroundColor]; });
  check('Holdvælgerens valgmuligheder er ikke hvid-på-hvid', optColors[0] !== optColors[1], optColors.join(' / '));

  // Kampprogrammet (v3.11): ingen modstandervælger; knappen nævner programmets næste modstander
  // (regnet direkte fra det gemte program, ikke via pairRound) og hjemme/ude.
  const nextOf = () => g.evaluate(() => {
    const L = JSON.parse(localStorage.getItem('tactivar_save')).league, me = L.teams.find((t) => !t.isBot);
    const k = L.leagueMetadata.round + 2 - L.seasonStartRound, name = (id) => L.teams.find((t) => t.id === id).name;
    const pairs = L.schedule[k - 1], [hId, aId] = pairs.find((p) => p.includes(me.id));
    return { k, opp: name(hId === me.id ? aId : hId), home: hId === me.id, me: me.name, fixtures: pairs.map(([h, a]) => `${name(h)}–${name(a)}`) };
  });
  const nx1 = await nextOf();
  check('Ingen modstandervælger – knappen viser programmets næste modstander og hjemme/ude', (await g.locator('#opponent-select').count()) === 0
    && (await g.textContent('#play-round')) === `▶ Spil runde ${nx1.k} af 14 mod ${nx1.opp} (${nx1.home ? 'hjemme' : 'ude'})` && nx1.k === 1, await g.textContent('#play-round'));
  await g.click('#next-opponent');
  check('Klik på modstanderens navn ved ▶ åbner hans trup til scouting', (await g.textContent('#club-name')) === nx1.opp && (await g.textContent('#tabs .tab.active')).includes('Trup'));
  await g.reload(); await g.waitForSelector('body[data-klar="ja"]'); // tilbage til dit hold med startvalget (testene herunder bygger på det)

  // Sortering på FIN: højeste afslutning øverst
  await tab('trup');
  await g.click('#matrix thead th:nth-child(15)');
  const fins = (await g.locator('#matrix tbody tr td:nth-child(15)').allTextContents()).map(Number);
  check('Sortering på FIN giver højeste først', fins.length === 18 && fins.every((v, i) => i === 0 || fins[i - 1] >= v), fins.join(','));
  // Natur-kolonnen (v3.8): hver rækkes etiket og forklaring stemmer med spillerens gemte position, og sorteringen følger rækkefølgen
  const LABEL_POS = { GK: 'MV', CB: 'CB', FB: 'Back', CM: 'CM', AM: 'OM', WM: 'Kant', ST: 'ANG' };
  const savedPos = await g.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot).squad.map((p) => [p.shortName, p.position])));
  await g.click('#matrix thead th:nth-child(4)');
  const natRows = await g.evaluate(() => [...document.querySelectorAll('#matrix tbody tr')].map((tr) => ({ name: tr.children[1].textContent, label: tr.children[3].textContent.trim(), title: tr.children[3].title })));
  check('Natur: hver spillers etiket og forklaring (title) er hans gemte position', natRows.length === 18 && natRows.every((r) => r.label === LABEL_POS[savedPos[r.name]] && r.title === FULL_POS[savedPos[r.name]]), JSON.stringify(natRows.slice(0, 3)));
  const natIdx = natRows.map((r) => ['GK', 'CB', 'FB', 'CM', 'AM', 'WM', 'ST'].indexOf(savedPos[r.name]));
  check('Natur: sortering stigende MV, CB, Back, CM, OM, Kant, ANG (alle syv forekommer)', natIdx.every((v, i) => i === 0 || natIdx[i - 1] <= v) && new Set(natIdx).size === 7, natIdx.join(','));

  // Træk en spiller ud af zonen
  await tab('taktik');
  await g.locator('#pitch').scrollIntoViewIfNeeded();
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
  await tab('trup');
  const firstName = await g.locator('#matrix tbody tr:first-child td:nth-child(2)').textContent();
  const namesBefore = (await g.locator('#matrix tbody tr td:nth-child(2)').allTextContents()).sort().join();
  check('Gem-status viser klokkeslæt', /Gemt kl\. \d\d/.test(await g.textContent('#save-status')));
  await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
  check('Efter F5: stadig 18 spillere – de samme', (await rows()) === 18 && (await g.locator('#matrix tbody tr td:nth-child(2)').allTextContents()).sort().join() === namesBefore);
  check('Efter F5: den valgte fane huskes', (await g.textContent('#tabs .tab.active')).includes('Trup'));
  await tab('taktik');
  check('Efter F5: trukket position bevaret', (await g.locator('#pitch .token[data-slot="6"]').textContent()).includes('Ude af zone'));
  check('Efter F5: fasevalg bevaret', (await g.inputValue('#tactics select[data-field="pressingHeight"]')) === 'HIGH_GEGENPRESS');
  check('Efter F5: note bevaret', (await g.inputValue('#note-input')) === 'Stærk i luften');
  void firstName;

  // Bytte start ⇄ bænk
  await tab('trup');
  const posOf = async (name) => g.locator('#matrix tbody tr', { hasText: name }).locator('td:first-child').textContent();
  const starter = (await g.locator('#matrix tbody tr:nth-child(2) td:nth-child(2)').textContent());
  const bench = (await g.locator('#matrix tbody tr:nth-child(14) td:nth-child(2)').textContent());
  await g.locator('#matrix tbody tr:nth-child(2) button').click();
  await g.locator('#matrix tbody tr', { hasText: bench }).locator('button').click();
  check('Byt: bænkspilleren overtager pladsen', (await posOf(bench)).startsWith('LB') && (await posOf(starter)).startsWith('BÆNK'));

  // Byt på banen: klik på to brikker (som i v2.5)
  await tab('taktik');
  const nameAt = async (slot) => (await g.locator(`#pitch .token[data-slot="${slot}"] .token-name`).textContent());
  const [n2, n3] = [await nameAt(2), await nameAt(3)];
  await g.click('#pitch .token[data-slot="2"]'); await g.click('#pitch .token[data-slot="3"]');
  check('Klik på to brikker bytter deres pladser', (await nameAt(2)) === n3 && (await nameAt(3)) === n2);
  const [n4, n5] = [await nameAt(4), await nameAt(5)];
  await g.click('#pitch .token[data-slot="4"]'); await tab('trup'); await tab('taktik'); await g.click('#pitch .token[data-slot="5"]');
  check('Et påbegyndt byt afbrydes af fanebyt (intet byt uden varsel)', (await nameAt(4)) === n4 && (await nameAt(5)) === n5);
  await g.click('#pitch .token[data-slot="5"]'); // klik igen = fravælg
  // Indskiftning fra bænken under banen – uden at forlade Taktik
  await g.locator('#bench .bench-p').first().click(); await g.locator('#bench .bench-p').first().click();
  check('Bænken: klik igen på samme bænkspiller fravælger', (await g.locator('#bench .bench-p.active').count()) === 0 && (await g.locator('#notice').count()) === 0);
  const benchBtn = g.locator('#bench .bench-p').first();
  const benchName = (await benchBtn.textContent()).replace(/^#\d+ /, '').replace(/ · \w+$/, '');
  await benchBtn.click(); await g.click('#pitch .token[data-slot="4"]');
  check('Bænken: klik bænkspiller og så brik skifter ind', (await nameAt(4)) === benchName && (await g.locator('#bench .bench-p', { hasText: n4 }).count()) === 1, `${benchName} / ${await nameAt(4)}`);
  await g.click('#pitch .token[data-slot="5"]'); await g.locator('#bench .bench-p').first().click();
  check('Bænken: klik brik og så bænkspiller skifter også ind', (await nameAt(5)) !== n5);
  await tab('trup'); await g.click('#matrix thead th:nth-child(1)'); await tab('taktik');

  // Hver ændring gemmes STRAKS: genindlæs efter hver enkelt handling
  const reload = async () => { await g.reload(); await g.waitForSelector('body[data-klar="ja"]'); };
  await g.selectOption('#formation', '3-5-2'); await reload();
  check('Formation gemmes straks', (await g.inputValue('#formation')) === '3-5-2');
  await g.click('#add-rule'); await reload();
  check('Ny Hvis-Så-regel gemmes straks', (await g.locator('#rules .rule').count()) === 2);
  // Regel 2: "Foran med mindst 2 mål → skift til Plan C"; regel 1: Uafgjort skjuler antal mål
  await g.selectOption('#rules .rule:nth-of-type(2) .rule-margin', '2');
  await g.selectOption('#rules .rule:nth-of-type(2) .rule-target', 'plan:2');
  await g.selectOption('#rules .rule:nth-of-type(1) .rule-cond', 'DRAW');
  await reload();
  check('Hvis-Så: antal mål og skift til egen plan gemmes', (await g.inputValue('#rules .rule:nth-of-type(2) .rule-margin')) === '2' && (await g.inputValue('#rules .rule:nth-of-type(2) .rule-target')) === 'plan:2');
  check('Hvis-Så: "Uafgjort" har intet antal mål', (await g.locator('#rules .rule:nth-of-type(1) .rule-margin').count()) === 0);
  check('Hvis-Så: målvælgeren viser dine planer og markerer den aktive', (await g.locator('#rules .rule:nth-of-type(2) .rule-target option', { hasText: 'aktiv nu' }).count()) === 1);
  // Den aktive plan følger live-taktikken: ændr formation, og "Plan X (…)" i målvælgeren følger med
  await g.selectOption('#formation', '5-3-2'); await reload();
  const activeOpt = await g.locator('#rules .rule:nth-of-type(2) .rule-target option', { hasText: 'aktiv nu' }).textContent();
  check('Hvis-Så: den aktive plan i målvælgeren viser den nye formation', activeOpt.includes('(5-3-2)'), activeOpt);
  const otherPlan = await g.locator('#rules .rule:nth-of-type(2) .rule-target option[value="plan:1"]').textContent();
  check('Hvis-Så: de andre planer ændres ikke af det', !otherPlan.includes('aktiv') && !otherPlan.includes('(5-3-2)'), otherPlan);
  await g.selectOption('#rules .rule:nth-of-type(2) .rule-target', 'form:4-3-3'); await reload();
  check('Hvis-Så: valg af en formation fjerner plan-målet', (await g.inputValue('#rules .rule:nth-of-type(2) .rule-target')) === 'form:4-3-3');
  await g.click('.presets button:nth-child(2)'); await reload();
  check('Plan-skift gemmes straks', (await g.textContent('.presets button.active')).startsWith('Plan B') && (await g.inputValue('#formation')) === '4-3-3');
  const [s7, s8] = [await nameAt(7), await nameAt(8)];
  await g.click('#pitch .token[data-slot="7"]'); await g.click('#pitch .token[data-slot="8"]'); await reload();
  check('Byt gemmes straks', (await nameAt(7)) === s8 && (await nameAt(8)) === s7);
  await g.selectOption('#tactics select[data-field="onBallWon"]', 'KEEP_POSSESSION'); await reload();
  check('Fasevalg gemmes straks', (await g.inputValue('#tactics select[data-field="onBallWon"]')) === 'KEEP_POSSESSION');
  // v3.9: løb uden bold i Fase 1 – starter på Normal, gemmes og overlever F5; hjælpeteksten ses
  check('Løb uden bold: findes i Fase 1 og starter på Normal', (await g.inputValue('#tactics fieldset[data-phase="phase1_buildUp"] select[data-field="offBallRuns"]')) === 'NORMAL');
  await g.selectOption('#tactics select[data-field="offBallRuns"]', 'MANY'); await reload();
  check('Løb uden bold: Mange gemmes og overlever F5', (await g.inputValue('#tactics select[data-field="offBallRuns"]')) === 'MANY');
  const help = await g.locator('#tactics .phase-help').allTextContents();
  check('Hjælpetekst under Fase 1 (fokus og pasningsstil, pris for Mange, fordel ved Få), Fase 2 (modgiften) og Fase 3 (genpres koster løb)', help.length === 3 && help[0].includes('kontraer imod') && help[0].includes('Få') && help[2].includes('Genpres') && help[2].includes('friskhed'), help.join(' | '));
  check('Hjælpeteksten forklarer fokus mod pasningsstil (v3.12) og modgiften i Fase 2',
    help[0].startsWith('Angrebsfokus bestemmer, hvordan chancerne kommer') && help[0].includes('Pasningsstil bestemmer, hvordan bolden kommer frem') && help[0].includes('direkte lange bolde giver også nogle høje bolde')
    && help[1].includes('lav blok fylder feltet og vinder flere luftdueller mod indlæg, men giver plads til cutbacks') && help[1].includes('højt gegenpres lukker kanten'), help.join(' | '));
  // Test Manager v3.9: hjælpeteksten må ikke love det modsatte af motoren (retning, ikke bare ord)
  check('Hjælpeteksten lover det motoren gør (Få: færre kontraer; Lynkontra: flere; Hold: færre; Genpres dæmper; Fald tilbage gratis)',
    help[0].includes('Mange – flere spillere løber sig fri') && help[0].includes('løber flere km') && help[0].includes('Få – færre løb fremad, færre kontraer imod og mindre slid.')
    && help[2].includes('Lynkontra giver flere kontraer') && help[2].includes('Hold på bolden giver færre, men styrker jeres næste opbygning')
    && help[2].includes('Genpres dæmper modstanderens kontraer, men koster løb (friskhed)') && help[2].includes('Fald tilbage koster intet'), help.join(' | '));
  const runsLabel = await g.locator('#tactics label:has(select[data-field="offBallRuns"])').evaluate((l) => l.firstChild.textContent.trim());
  const runsOpts = await g.locator('#tactics select[data-field="offBallRuns"] option').evaluateAll((os) => os.map((o) => `${o.value}=${o.textContent}`).join(','));
  check('Løb uden bold: etiket og valg (Få/Normal/Mange i den rækkefølge)', runsLabel === 'Løb uden bold' && runsOpts === 'FEW=Få,NORMAL=Normal,MANY=Mange', `${runsLabel} / ${runsOpts}`);
  await g.selectOption('#tactics select[data-field="offBallRuns"]', 'NORMAL');

  // Gem-fejl er synlig, aldrig tavs
  await g.evaluate(() => { window.__set = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); }; });
  await g.selectOption('#tactics select[data-field="onBallWon"]', 'FAST_COUNTER');
  check('Gem-fejl vises i fejlboksen og som "IKKE gemt"', (await g.isVisible('#fejlboks')) && (await g.textContent('#save-status')).includes('IKKE gemt'));
  await g.evaluate(() => { Storage.prototype.setItem = window.__set; document.getElementById('fejlboks').hidden = true; document.getElementById('fejlboks').replaceChildren(); });
  await g.click('#save-now');
  check('"Gem nu" gemmer igen efter fejlen', (await g.textContent('#save-status')).includes('Gemt kl.'));

  // Sorteringsvagten: sortér eget hold på FIN, skift til en modstander – rækkefølgen må ikke røbe FIN
  await tab('trup');
  await g.click('#matrix thead th:nth-child(15)');
  await tab('liga');
  await g.click('#standings tbody tr:not(.mine)');
  check('Klik på et hold i ligatabellen åbner holdet i Trup', (await g.textContent('#tabs .tab.active')).includes('Trup') && (await g.isVisible('#matrix')));
  const posCol = await g.locator('#matrix tbody tr td:nth-child(1)').allTextContents();
  check('Modstanderens tabel falder tilbage til opstillingsorden, ikke skjult FIN-orden', posCol[0].startsWith('GK') && !(await g.textContent('#matrix thead')).includes('FIN ▼'));
  await g.selectOption('#team-select', '0');

  // Anti-spionage på et modstanderhold
  await g.selectOption('#team-select', '1');
  const oppText = await g.textContent('#matrix tbody');
  const lockCells = await g.locator('#matrix tbody td.lockcell').count();
  check('Modstander: 13 skjulte kolonner × 18 spillere vises som 🔒 ??', lockCells === 13 * 18, String(lockCells));
  const hiddenCols = await g.evaluate(() => [...document.querySelectorAll('#matrix tbody tr')].flatMap((tr) => [...tr.children].slice(7, 19).map((td) => td.textContent)));
  check('Modstander: spring, luft, de 9 evner og gennemsnit står som 🔒 ?? (12 × 18 celler)', hiddenCols.length === 12 * 18 && hiddenCols.every((t) => t === '🔒 ??'));
  check('Modstander: vurdering vises som stjerner, ikke tal', (await g.locator('#matrix tbody tr td:nth-child(20)').allTextContents()).every((t) => /^[★☆]{5}$|^–$/.test(t)));
  void oppText;
  await g.click('#matrix thead th:nth-child(15)');
  check('Modstander: sortering på FIN afvises med anti-spionage-besked', (await g.textContent('#notice')).includes('Anti-spionage'));
  check('Modstander: spillerkortet skjuler evner og kontrakt', (await g.locator('#player-card .bars').count()) === 0 && (await g.textContent('#player-card')).includes('🔒 ??'));
  await tab('taktik');
  check('Modstander: faser og Hvis-Så-regler er skjulte', (await g.locator('#tactics fieldset').count()) === 0);
  check('Modstander: ingen bænkrække under banen', (await g.locator('#bench').count()) === 0);
  check('Modstander: kun dit hold kan trækkes på banen', (await g.locator('#pitch .token.draggable').count()) === 0);
  check('Modstander: formationen kan ikke ændres og der er ingen byt-knapper', (await g.isDisabled('#formation')) && (await g.locator('#matrix tbody button').count()) === 0);
  check('Modstander: ingen Plan A/B/C og ingen "Nulstil træk" (ville afsløre og ændre deres taktik)', (await g.locator('#tactics .presets').count()) === 0 && (await g.locator('#reset-drag').count()) === 0);
  const oppBefore = await g.locator('#pitch .token[data-slot="2"] .token-name').textContent();
  await g.click('#pitch .token[data-slot="2"]'); await g.click('#pitch .token[data-slot="3"]');
  check('Modstander: klik på to brikker bytter ikke', (await g.locator('#pitch .token[data-slot="2"] .token-name').textContent()) === oppBefore);
  await tab('liga');
  check('Ligatabellen viser ikke andre holds taktiske stil', !(await g.textContent('#standings')).includes('•') && !(await g.textContent('#standings')).includes('Gegenpress'));
  // Layout: Taktik har bane | kort+taktik ved siden af hinanden, stablet på smal skærm
  await tab('taktik');
  const colsAt = async (w) => { await g.setViewportSize({ width: w, height: 900 }); return g.evaluate(() => getComputedStyle(document.querySelector('.tactics-layout')).gridTemplateColumns.split(' ').length); };
  check('Layout: Taktik har 2 kolonner ved 1400 px og 1 ved 700 px', (await colsAt(1400)) === 2 && (await colsAt(700)) === 1);
  await g.setViewportSize({ width: 1400, height: 1000 });
  await tab('trup');
  const sideScroll = await g.evaluate(() => { const w = document.querySelector('.tablewrap'); return w.scrollWidth - w.clientWidth; });
  check('Layout: regnearket kræver ikke sidelæns scroll ved 1400 px', sideScroll <= 1, `${sideScroll}px`);
  check('Layout: siden selv scroller ikke sidelæns', await g.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // ---------- Kampe: Match Center ----------
  await g.selectOption('#team-select', '0');
  await g.selectOption('#team-select', '3'); // kampknappen findes også, mens man scouter
  await tab('liga');
  const nextFx = await g.locator('#next-round .fixture').allTextContents();
  const nx = await nextOf();
  check('Liga før runde 1: programmets 4 kampe (samme retning), din kamp først – ingen resultater endnu', nextFx.length === 4
    && JSON.stringify(nextFx.slice().sort()) === JSON.stringify(nx.fixtures.slice().sort()) && nextFx[0].includes(nx.me) && (await g.locator('#next-round .fixture.mine').textContent()).includes(nx.opp)
    && (await g.locator('#last-round').count()) === 0 && (await g.locator('#my-schedule tr').count()) === 14 && (await g.locator('#my-schedule tr.next').count()) === 1, nextFx.join(' | '));
  check('Kamp-fanen før første runde: tom tilstand med vejledning', await (async () => { await tab('kamp'); return (await g.textContent('#no-matches')).includes('Spil runde'); })());
  await tab('trup');
  await g.click('#play-round');
  await g.waitForSelector('#match-center');
  check('▶ Spil runde åbner Kamp-fanen', (await g.textContent('#tabs .tab.active')).includes('Kamp'));
  check('Under afspilning kan runden ikke startes igen', await g.isDisabled('#play-round'));
  const played = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches.map((m) => `${m.homeName}–${m.awayName}`));
  check('Det spillede er præcis de kampe, Liga-fanen viste før ▶ – samme retning og rækkefølge', JSON.stringify(played) === JSON.stringify(nextFx), played.join(' | '));
  check('Under afspilning: besked om at runden er bogført, og de andre resultater er skjulte', (await g.isVisible('#booked-note')) && !/\d-\d/.test(await g.locator('#match-cards .matchcard:nth-child(2)').textContent()));
  await tab('liga');
  check('Under afspilning: Liga-fanen siger, at tabellen allerede er opdateret – og avisen og resultaterne venter', (await g.isVisible('#booked-league')) && (await g.locator('#gazette').count()) === 0 && (await g.locator('#last-round').count()) === 0 && (await g.locator('#stats').count()) === 0 && (await g.locator('#schedule').count()) === 0); // statistikken og programmet ville afsløre runden
  await tab('kamp');
  await g.click('#skip');
  check('Runden har 4 kampe', (await g.locator('#match-cards .matchcard').count()) === 4);
  const mcText = await g.textContent('#match-center');
  // Dit hold kan være hjemme eller ude (programmet) – karakterarkene står hjemme, ude.
  const own = await g.evaluate(() => (JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0].ratings.home[0].isUserTeam ? 0 : 1));
  check('Referatet indeholder slutfløjt, statistik og karakterark', mcText.includes('SLUTFLØJT') && (await g.isVisible('#match-stats')) && (await g.locator('.ratings').count()) === 2);
  // v3.10.1: dødbolde og gule kort i statistikken til højre – tallene = kampens gemte statistik
  const statRows = await g.locator('#match-stats tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent)));
  const statSaved = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0].stats);
  const rowOf = (label) => statRows.find((r) => r[1] === label);
  check('Kampstatistik: frispark i skudafstand, hjørnespark, straffe (mål) og gule kort som i den gemte kamp',
    rowOf('Hjørnespark')?.[0] === String(statSaved.hCorners) && rowOf('Hjørnespark')?.[2] === String(statSaved.aCorners)
    && rowOf('Frispark i skudafstand')?.[0] === String(statSaved.hFreeKicks) && rowOf('Straffe (mål)')?.[0] === `${statSaved.hPenalties} (${statSaved.hPenaltyGoals})`
    && rowOf('Gule kort')?.[2] === String(statSaved.aYellows) && !!rowOf('Frispark begået / skader'), JSON.stringify(statRows.slice(-5)));
  const feedText = await g.textContent('#feed');
  check('Referatet: ingen evnetal og ingen interne koder', !/\b(FIN|PAS|POS|INT|STA|STR|BAL|PAC)\s*[:=]?\s*\d/.test(feedText) && !/BALANCED|MID_BLOCK|HIGH_GEGENPRESS/.test(mcText));
  const score = (await g.textContent('#score')).trim();
  check('Resultattavlen svarer til slutfløjtet', mcText.includes(`${score.replace(' - ', ' - ')}`) && /\d+ - \d+/.test(score));
  const oppRatings = await g.locator('.ratings').nth(1 - own).locator('td.rating').allTextContents();
  const ownRatings = await g.locator('.ratings').nth(own).locator('td.rating').allTextContents();
  const starColors = await g.evaluate(() => { const s = document.querySelector('.ratings .star-on'), o = document.querySelector('.ratings .star-off'); return s && o ? [getComputedStyle(s).color, getComputedStyle(o).color] : null; });
  check('Stjerner er læsbare: udfyldte og tomme har forskellig farve', !!starColors && starColors[0] !== starColors[1], String(starColors));
  check('Karakterark: eget hold eksakte karakterer, modstander kun stjerner', ownRatings.every((t) => /^\d+\.\d$/.test(t)) && oppRatings.length >= 11 && oppRatings.every((t) => /^[★☆]{5}$/.test(t)));
  // Karakterark: opstillingsorden med plads efter navnet, minibane og ikon-forklaring
  const ownRows = await g.locator('.ratings').nth(own).locator('tbody tr td:first-child').allTextContents();
  check('Karakterark: plads efter navnet, målmanden først', ownRows.length >= 11 && /· GK$/.test(ownRows[0]) && ownRows.every((t) => / · \S/.test(t)), ownRows.slice(0, 3).join(' | '));
  const mpOwn = await g.locator('.ratings').nth(own).locator('.mp-token .mp-val').allTextContents();
  const mpOpp = await g.locator('.ratings').nth(1 - own).locator('.mp-token .mp-val').allTextContents();
  check('Minibane: 11 startere pr. hold – egne med karakter, modstanderens kun stjerner', mpOwn.length === 11 && mpOwn.every((t) => /^\d+\.\d$/.test(t)) && mpOpp.length === 11 && mpOpp.every((t) => /^[★☆]{5}$/.test(t)), `${mpOwn.length}/${mpOpp.length}`);
  const runs = await g.locator('.ratings').nth(own).locator('td.run').allTextContents();
  const runExpect = await g.evaluate(() => { const m = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0]; const own = [m.ratings.home, m.ratings.away].find((l) => l[0].isUserTeam); const e = own.find((x) => x.hiShare != null && x.distanceKm > 0); return `${e.distanceKm.toFixed(1)} km · ${Math.round(e.hiShare)} % HI`; });
  check('Karakterark: HI-andelen er spillerens afrundede tal', runs.some((t) => t.startsWith(runExpect)), runExpect);
  check('Karakterark: dit hold har løbet distance og topfart, modstanderen ikke', runs.length >= 11 && runs.filter((t) => /^\d+\.\d km · \d+ % HI · \d+\.\d km\/t$/.test(t)).length >= 11 && (await g.locator('.ratings').nth(1 - own).locator('td.run').count()) === 0, runs.slice(0, 2).join(' | '));
  // v3.9: "fri" (løb uden bold) kun for dit hold – og opsummeringen kun i din kamp
  const fri = await g.locator('.ratings').nth(own).locator('td.fri').allTextContents();
  const friExpect = await g.evaluate(() => { const m = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0]; const own = [m.ratings.home, m.ratings.away].find((l) => l[0].isUserTeam); return own.filter((e) => e.freeRuns > 0).map((e) => `${e.freeRunsWon}/${e.freeRuns} fri`); });
  check('Karakterark: "fri" for dit hold matcher de gemte løb, modstanderen har ingen kolonne', fri.length >= 11 && JSON.stringify(fri.filter(Boolean).sort()) === JSON.stringify([...friExpect].sort()) /* præcis de spillere med løb – ingen "0/0 fri" til resten; tilfældig liga: ca. hver 5. kamp uden løb, så står alle tomme (unit-testene dækker indholdet) */ && fri.every((t) => t === '' || /^\d+\/\d+ fri$/.test(t)) && (await g.locator('.ratings').nth(1 - own).locator('td.fri').count()) === 0, `${fri.join(',')} / ${friExpect.join(',')}`);
  const runSum = await g.textContent('#match-center');
  check('Fuldtids-analyse med løb uden bold i din kamp', /📊 \[90' FULDTIDS-ANALYSE\] \d+-\d+ til dig\. Du havde \d+% af bolden og \d+ afslutninger \(\d+ på mål\)\. Din opbygning kom igennem \d+ af \d+ gange; dit pres vandt bolden \d+ af \d+ gange\. Dødbolde: \d+ frispark i skudafstand, \d+ hjørnespark, \d+ straffe \(\d+ mål\) · frispark begået \d+, tilkendt \d+\. 🎯 Løb uden bold \(Normal\): \d+ løb, \d+ kom fri \(\d+ mål\) · kontraer imod i alt: \d+ \(\d+ mål\)\./.test(runSum), runSum.match(/🎯[^.]*\./)?.[0] ?? 'mangler');
  check('Fuldtids-analysen viser dit angreb (fokus · pasningsstil) og dit felt (v3.12)', /⚔️ Angreb \((Centralt|Høje indlæg|Lave cutbacks) · (korte pasninger|balanceret|direkte lange bolde)\): (ingen cutbacks eller høje bolde|(\d+ cutbacks \(\d+ mål, \d+ stoppet ved kanten\))?(, )?(\d+ høje bolde \(\d+ vundne luftdueller, \d+ hovedstødsmål\))?)\. 🛡️ Dit felt: modstanderens cutbacks stoppet \d+ af \d+, luftdueller vundet \d+ af \d+\./.test(runSum), runSum.match(/⚔️[^🛡]*🛡️[^.]*\./)?.[0] ?? 'mangler');
  const gzText = await g.textContent('#gazette');
  check('Avisen: en overskrift pr. kamp og dit holds løber med andel højintenst', (await g.locator('#headlines li').count()) === 4 && /Dit holds løber: #\d+ .+ – \d+\.\d km, \d+ % højintenst/.test(gzText), gzText.slice(0, 200));
  const iconTitles = await g.evaluate(() => [...document.querySelectorAll('.ratings .ricon')].map((e) => [e.textContent, e.title]));
  check('Ikonerne i karakterarket har mouse-over-tekst', iconTitles.length > 0 && iconTitles.every(([t, ti]) => ti.length > 3 && !ti.includes('undefined')), JSON.stringify(iconTitles.slice(0, 3)));
  const legendTxt = await g.textContent('#icon-legend');
  check('Ikon-forklaring under karakterarket (til touch)', ['⚽ Mål', '🅰 Oplæg', '🧤 Redninger', '👑 Kampens spiller'].every((x) => legendTxt.includes(x)), legendTxt);
  check('Forklaring af "fri" og HI (rigtig vej rundt: 2/3 = kom fri 2 af 3 gange)', legendTxt.includes('"2/3 fri" = løb uden bold: kom fri 2 af 3 gange') && legendTxt.includes('HI = andel højintenst løb') && legendTxt.endsWith('begge kun dit hold'), legendTxt);
  const por = await g.textContent('#player-of-round');
  const porIsMine = (await g.locator('.ratings').nth(own).textContent()).includes(por.match(/#\d+ [^ ]+ [^ (]+/)[0]);
  check('Avisen kårer rundens spiller – med karakter kun hvis det er din spiller, ellers stjerner', porIsMine ? /karakter \d+\.\d/.test(por) : (/[★☆]{5}/.test(por) && !/karakter/.test(por)), por);
  // v3.12.1: 📍 ved mål i åbent spil viser dit holds positioner i øjeblikket på minibanen
  const snapSaved = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0].events.filter((e) => e.snapshot).length);
  const pins = await g.locator('#feed .snap-btn').count();
  check('📍 står ved præcis de mål, der har et gemt øjebliksbillede', pins === snapSaved, `${pins} / ${snapSaved}`);
  if (pins > 0) {
    const before = await g.locator('.ratings').nth(own).locator('.mp-token').evaluateAll((ts) => ts.map((t) => t.style.left + ',' + t.style.top).join('|'));
    await g.locator('#feed .snap-btn').first().click();
    const after = await g.locator('#snap-pitch .mp-token').evaluateAll((ts) => ts.map((t) => t.style.left + ',' + t.style.top).join('|'));
    check('Klik på 📍: minibanen viser øjebliksbilledet (11 brikker, bolden, flyttet fra startpladserne)', (await g.locator('#snap-pitch .mp-token').count()) === 11 && (await g.locator('#snap-ball').count()) === 1 && after !== before && (await g.locator('#feed .ev.snapped').count()) === 1, after.slice(0, 80));
    await g.click('#snap-back');
    check('↩ Startopstilling går tilbage til minibanen fra kampstart', (await g.locator('#snap-pitch').count()) === 0 && (await g.locator('.ratings').nth(own).locator('.mp-token').count()) === 11);
  }
  // Med faste data: dit mål (scorer og oplæg markeret) og et mål imod (kun dit forsvar) – uafhængigt af tilfældighed
  const snapT = await g.evaluate(async () => {
    const { renderMatchCenter } = await import('/ui/matchcenter.js');
    const { createLeague } = await import('/engine/generator.js');
    const { simulateMatch } = await import('/engine/match.js');
    const { createRng } = await import('/engine/rng.js');
    for (let seed = 1; seed < 400; seed++) {
      const L = createLeague(createRng(seed)), me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t.isBot);
      const m = simulateMatch(me, opp, createRng(seed + 1000));
      const mineI = m.events.findIndex((e) => e.snapshot?.attacking && e.snapshot.assist), theirI = m.events.findIndex((e) => e.snapshot && !e.snapshot.attacking);
      if (mineI < 0 || theirI < 0) continue;
      const draw = (snap) => renderMatchCenter({ mc: { round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount: 0, playing: false, snap }, myTeamId: me.id, on: { snapshot: () => {}, view: () => {}, filter: () => {}, skip: () => {} } });
      const ownIds = new Set(me.squad.map((p) => p.id)), oppNames = opp.squad.map((p) => p.shortName);
      const read = (el) => { const sp = el.querySelector('#snap-pitch'); return sp && { title: sp.querySelector('#snap-title').textContent, n: sp.querySelectorAll('.mp-token').length, scorer: sp.querySelectorAll('.mp-token.scorer').length, assist: sp.querySelectorAll('.mp-token.assist').length, ball: !!sp.querySelector('#snap-ball'), pitches: el.querySelectorAll('#snap-pitch').length, oppName: oppNames.some((n) => sp.textContent.includes(n)), pins: el.querySelectorAll('.snap-btn').length }; };
      const ev = m.events[theirI].snapshot;
      return { a: read(draw(mineI)), b: read(draw(theirI)), none: (() => { const el = draw(null); return { pitches: el.querySelectorAll('#snap-pitch').length, pins: el.querySelectorAll('.snap-btn').length, want: m.events.filter((e) => e.snapshot).length }; })(), ownOnly: ev.pts.every(([id]) => ownIds.has(id)) && ev.scorer === null && ev.pts.length === 11 };
    }
    return null;
  });
  check('Øjebliksbillede, dit mål: 11 brikker, scorer ⚽ og oplæg 🅰 markeret, bolden vist', !!snapT && snapT.a?.n === 11 && snapT.a.scorer === 1 && snapT.a.assist === 1 && snapT.a.ball && snapT.a.pitches === 1 && /mål af #\d+ .+: sådan stod I/.test(snapT.a.title), JSON.stringify(snapT?.a));
  check('Øjebliksbillede, mål imod: kun dit forsvar (ingen scorer, ingen af modstanderens spillere) – gemt uden modstanderens positioner', !!snapT && snapT.b?.n === 11 && snapT.b.scorer === 0 && !snapT.b.oppName && snapT.b.title.includes('modstanderens spillere vises ikke') && snapT.ownOnly, JSON.stringify(snapT?.b));
  check('Uden valgt mål: intet øjebliksbillede, men 📍 ved hvert mål med billede', !!snapT && snapT.none.pitches === 0 && snapT.none.pins === snapT.none.want && snapT.none.want >= 2, JSON.stringify(snapT?.none));
  const allEvents = await g.locator('#feed .ev').count();
  await g.click('#match-center .toolbar button:nth-child(3)');
  check('Filteret "Kun nøglemomenter" viser færre hændelser', (await g.locator('#feed .ev').count()) < allEvents);
  await g.click('#match-cards .matchcard:nth-child(2)');
  check('De øvrige kampe kan åbnes', (await g.textContent('#scoreboard')).includes((await g.textContent('#match-cards .matchcard:nth-child(2)')).split(' ')[0]));
  check('Match Center har ingen Luk-knap (Kamp-fanen er dens plads)', (await g.locator('#close-mc').count()) === 0);
  await tab('liga');
  const stHead = await g.textContent('#standings-title');
  check('Efter slutfløjt: Liga-fanen viser avisen og ingen afspilningsbesked', (await g.isVisible('#gazette')) && (await g.locator('#booked-league').count()) === 0);
  // v3.10: statistik nederst – fire sektioner, tal = gemte data, andre holds private tal findes ikke
  const secs = await g.locator('#stats details.stats-sec > summary').allTextContents();
  check('Statistik: fire sektioner med "fra runde 1" (spillere åben, resten sammenfoldet)', secs.length === 4 && secs[0].startsWith('Spillere (fra runde 1)') && secs[3].startsWith('Dit hold (privat, fra runde 1)') && (await g.locator('#stats-players').getAttribute('open')) !== null && (await g.locator('#stats-teams').getAttribute('open')) === null, secs.join(' | '));
  const scorers = await g.locator('#stats .stat-list[data-key="sGoals"] td.st-val').allTextContents();
  const goalsSaved = await g.evaluate(() => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league; return L.teams.flatMap((t) => t.squad.map((p) => p.sGoals)).filter((n) => n > 0).sort((a, b) => b - a).slice(0, 5); });
  check('Statistik: topscorerlisten matcher de gemte sæsonmål', JSON.stringify(scorers.map((t) => Number(t.trim()))) === JSON.stringify(goalsSaved), `${scorers.join(',')} / ${goalsSaved.join(',')}`);
  await g.click('#stats-teams > summary');
  const teamHead = await g.locator('#team-stats thead th').allTextContents();
  check('Holdtal: ingen kolonner, der kan røbe taktik (skud/xG/kontra/hjørne/VAR)', teamHead.length === 9 && !teamHead.some((t) => /skud|xg|kontra|hjørne|var-/i.test(t)) && (await g.locator('#team-stats tbody tr').count()) === 8, teamHead.join('|'));
  await g.click('#stats-mine > summary');
  check('Dit hold: afslutninger, xG og frie løb står kun her', (await g.textContent('#my-team-stats')).includes('xG') && (await g.locator('#my-players tbody tr').count()) === 18);
  await g.click('#stats-flow > summary');
  const flow = await g.textContent('#flow-summary');
  const flowGoals = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.history.reduce((a, r) => a + r.goals, 0));
  check('Ligaens forløb: mål i alt = historikken', flow.startsWith(`${flowGoals} mål i 4 kampe`) && (await g.locator('#round-bars .round-bar').count()) === 1, flow);
  const res = await g.locator('#last-round .fixture').allTextContents();
  check('Liga: sidste rundes 4 resultater med link til referat', res.length === 4 && res.every((t) => /\d+-\d+/.test(t) && t.includes('Referat')), res.join(' | '));
  check('Liga: næste runde er sæsonens runde 2 af 14', (await g.textContent('#next-round-title')).includes('runde 2 af 14'));
  // Resultater og parringer svarer præcist til det gemte spil (navne, retning, score, runde)
  const fromSave = await g.evaluate(async () => {
    const save = JSON.parse(localStorage.getItem('tactivar_save'));
    const L = save.league, me = L.teams.find((t) => !t.isBot).name, name = (id) => L.teams.find((t) => t.id === id).name;
    return { round: L.lastRound.round, me, results: L.lastRound.matches.map((m) => `${m.homeName}${m.homeGoals}-${m.awayGoals}${m.awayName}📺 Referat`),
      next: L.schedule[1].map(([h, a]) => `${name(h)}–${name(a)}`) };
  });
  check('Liga: resultaterne er sidste rundes kampe med rigtig retning og score', JSON.stringify(res) === JSON.stringify(fromSave.results) && (await g.textContent('#last-round h3')).includes(`runde ${fromSave.round}`), `${res[0]} / ${fromSave.results[0]}`);
  const shownNext = await g.locator('#next-round .fixture').allTextContents();
  check('Liga: næste runde er programmets runde 2 (samme retning), din kamp først', JSON.stringify(shownNext.slice().sort()) === JSON.stringify(fromSave.next.slice().sort()) && shownNext[0].includes(fromSave.me), shownNext.join(' | '));
  const myRow1 = await g.locator('#my-schedule tr').first().locator('td').allTextContents();
  const myScore = await g.evaluate(() => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, m = L.lastRound.matches[0], home = m.ratings.home[0].isUserTeam; return home ? `${m.homeGoals}-${m.awayGoals}` : `${m.awayGoals}-${m.homeGoals}`; });
  check('Dit program: runde 1 med din score først og H/U; runde 2 er markeret som næste', myRow1[0] === 'R1' && myRow1[3] === myScore && ['H', 'U'].includes(myRow1[1]) && (await g.locator('#my-schedule tr').nth(1).getAttribute('class')).includes('next'), myRow1.join('|'));
  const mineRes = await g.locator('#last-round .fixture.mine').allTextContents(), mineNext = await g.locator('#next-round .fixture.mine').allTextContents();
  check('Liga: præcis én kamp markeret som din – i begge lister', mineRes.length === 1 && mineRes[0].includes(fromSave.me) && mineNext.length === 1 && mineNext[0].includes(fromSave.me) && res.filter((t) => t.includes(fromSave.me)).length === 1);
  const third = await g.locator('#last-round .fixture').nth(2).locator('.fx-team').first().textContent();
  await g.locator('#last-round .fixture').nth(2).click();
  check('Klik på et resultat åbner netop den kamps referat i Kamp-fanen', (await g.textContent('#tabs .tab.active')).includes('Kamp') && (await g.locator('#match-cards .matchcard:nth-child(3).active').count()) === 1 && (await g.textContent('#scoreboard')).includes(third) && (await g.locator('#match-center .toolbar button:nth-child(1).active').count()) === 1);
  await tab('liga');
  check('Ligatabellen er opdateret efter runde 1', stHead.includes('sæson 1, efter 1 af 14 runder'), stHead);
  await g.selectOption('#team-select', '2');
  // Spillerkortet viser sæsonens løb (km pr. 90 min og bedste topfart) for en spiller, der har spillet
  const card = await g.evaluate(() => { const t = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot); const p = t.squad.find((x) => x.minutesSum > 0 && x.hiDistSum > 0); return { nr: p.shirtNumber, km: (p.distanceSum / p.minutesSum * 90).toFixed(1), ts: p.topSpeedMax.toFixed(1), hi: Math.round(p.hiKmSum / p.hiDistSum * 100) }; });
  await g.selectOption('#team-select', '0');
  await g.locator('#matrix tbody tr', { has: g.locator('td:first-child', { hasText: new RegExp(`#${card.nr}$`) }) }).first().click();
  const rs = await g.textContent('#run-stats');
  check('Spillerkortet: km pr. 90 min, andel højintenst og topfart for sæsonen', rs.includes(`${card.km} km pr. 90 min`) && rs.includes(` ${card.hi} % højintenst`) && rs.includes(`topfart ${card.ts} km/t`), `${rs} (forventet ${card.km} / ${card.hi} % / ${card.ts})`);
  await tab('liga'); await g.selectOption('#team-select', '2');
  check('Holdvælgeren i Liga-fanen viser holdet i Trup', (await g.textContent('#tabs .tab.active')).includes('Trup') && (await g.textContent('#club-name')) === (await g.locator('#team-select option').nth(2).textContent()));
  await g.selectOption('#team-select', '0');
  await g.locator('#matrix tbody tr:nth-child(2) button').click();
  check('Påbegyndt byt viser besked', (await g.textContent('#notice')).includes('Vælg den spiller'));
  await reload();
  check('Efter F5: runden er gemt', (await g.textContent('#play-round')).includes('runde 2 af 14'));
  await tab('kamp');
  check('Kamp-fanen genviser seneste runde færdigspillet (ikke live)', (await g.isVisible('#match-center')) && (await g.locator('#skip').count()) === 0 && (await g.textContent('#match-center')).includes('runde 1'));
  const evAll = await g.locator('#feed .ev').count();
  // "Rundens mål" i avisen (Liga-fanen) viser kampen og linker til netop dens referat
  await tab('liga');
  const gor = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.gazette.goalOfTheRound);
  if (gor) {
    check('Rundens mål viser, hvilken kamp det faldt i', (await g.textContent('#goal-of-round-match')).includes(gor.match.replace(' - ', ' – ')));
    await g.click('#goal-of-round-match');
    const card = await g.textContent(`#match-cards .matchcard:nth-child(${gor.matchIdx + 1})`);
    check('Linket åbner netop den kamps referat i Kamp-fanen', (await g.textContent('#tabs .tab.active')).includes('Kamp') && (await g.locator(`#match-cards .matchcard:nth-child(${gor.matchIdx + 1}).active`).count()) === 1 && card.startsWith(gor.match.split(' - ')[0]), card);
    const focus = await g.locator('#goal-focus').textContent();
    check('Målet er markeret i referatet og rullet frem', focus.includes(`${gor.min}'`) && focus.includes(gor.scorer) && (await g.locator('#goal-focus').isVisible()) && (await g.evaluate(() => { const r = document.getElementById('goal-focus').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })), focus);
    // Også fra avisen inde i Kamp-fanen (vælg først en anden kamp)
    await g.click(`#match-cards .matchcard:nth-child(${((gor.matchIdx + 1) % 4) + 1})`);
    await g.click('#match-center #goal-of-round-match');
    check('Fra avisen i Kamp-fanen: kampen skiftes, og målet markeres', (await g.locator(`#match-cards .matchcard:nth-child(${gor.matchIdx + 1}).active`).count()) === 1 && (await g.locator('#goal-focus').count()) === 1);
  } else check('Runden havde intet mål (intet link at teste)', true);
  await tab('kamp');
  // Hver handling prøves på en frisk side (uden igangværende Match Center).
  await g.click('#match-cards .matchcard:nth-child(3)');
  const card3 = (await g.locator('#match-cards .matchcard:nth-child(3).active').count()) === 1;
  await reload();
  await g.click('#match-center .toolbar button:nth-child(3)');
  check('Efter F5: Kamp-fanen kan skifte kamp og filter', card3 && (await g.locator('#match-center .toolbar button:nth-child(3).active').count()) === 1 && (await g.locator('#feed .ev').count()) < evAll);
  await tab('liga'); // runde 2 startes fra en anden fane end Kamp

  // Runden er bogført og gemt FØR afspilningen: luk/genindlæs midt i kampen
  await g.click('#play-round');
  await g.waitForSelector('#skip');
  check('▶ Spil runde afbryder et påbegyndt byt og fjerner beskeden', (await g.locator('#notice').count()) === 0);
  const liveCard = await g.textContent('#match-cards .matchcard:nth-child(1)');
  check('Under afspilning viser kort 1 live-stillingen fra 0-0, ikke slutresultatet', /0-0/.test(liveCard), liveCard);
  await reload();
  check('Genindlæst midt i afspilningen: Kamp-fanen viser runde 2 færdigspillet', (await g.textContent('#tabs .tab.active')).includes('Kamp') && (await g.textContent('#match-center')).includes('runde 2') && (await g.locator('#skip').count()) === 0);
  await tab('liga');
  const head2 = await g.textContent('#standings-title');
  check('Genindlæst midt i afspilningen: runde 2 er alligevel bogført og gemt', head2.includes('efter 2 af 14 runder'), head2);

  // Avisen med faste data – begge grene, uafhængigt af tilfældighed
  const gaz = await g.evaluate(async () => {
    const { renderGazette } = await import('/ui/matchcenter.js');
    const base = { totalGoals: 3, totalVarChecks: 1, myResult: 'X', goalOfTheRound: null, defensiveAction: null };
    const p = { playerId: 'p', shirtNumber: 9, shortName: 'A. B', teamName: 'T', rating: 8.7, stars: 5, goals: 2, assists: 1, saves: 0, startCounterMastery: 60, gainedCounterXp: 10 };
    const mine = renderGazette({ ...base, playerOfTheRound: { ...p, teamId: 'me' } }, 'me').querySelector('#player-of-round').textContent;
    const theirs = renderGazette({ ...base, playerOfTheRound: { ...p, teamId: 'them' } }, 'me').querySelector('#player-of-round').textContent;
    return { mine, theirs };
  });
  check('Avisen: din spiller vises med karakter', gaz.mine.includes('karakter 8.7') && gaz.mine.includes('2 mål'), gaz.mine);
  check('Avisen: modstanderens spiller kun med stjerner – aldrig karakteren', gaz.theirs.includes('★★★★★') && !gaz.theirs.includes('8.7') && !gaz.theirs.includes('karakter'), gaz.theirs);

  // Mislykkes backuppen ved "Ny liga" (fuldt lager), står det gamle spil urørt – også efter næste gem
  await g.selectOption('#team-select', '0');
  await tab('trup');
  const keep = await g.evaluate(() => localStorage.getItem('tactivar_save'));
  const clubBefore = await g.textContent('#club-name');
  await g.evaluate(() => { window.__set2 = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k.startsWith('tactivar_backup_')) throw new Error('QuotaExceededError'); return window.__set2.call(this, k, v); }; });
  g.once('dialog', (d) => d.accept());
  await g.click('#new-league');
  check('Ny liga uden mulig backup: fejl vises og spillet er uændret', (await g.textContent('#fejlboks')).includes('sikkerhedskopieres') && (await g.evaluate(() => localStorage.getItem('tactivar_save'))) === keep);
  await g.click('#save-now');
  check('…og det næste gem gemmer stadig det gamle spil', JSON.parse(await g.evaluate(() => localStorage.getItem('tactivar_save'))).league.leagueMetadata.round === JSON.parse(keep).league.leagueMetadata.round && (await g.textContent('#club-name')) === clubBefore);
  await g.evaluate(() => { Storage.prototype.setItem = window.__set2; document.getElementById('fejlboks').hidden = true; document.getElementById('fejlboks').replaceChildren(); });

  // Et gemt spil fra skema 1 migreres, gemmes straks i nyt format og tager kun ÉN backup
  const fixture = fs.readFileSync(new URL('../fixtures/save-schema1.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixture);
  await reload();
  const migNotice = await g.textContent('#notice');
  check('Migrering: beskeden forklarer puljen på 100, Superliga-højderne, friskheden, den naturlige position og kampprogrammet (alle trin fra skema 1 op) – og nævner backuppen', ['100 point', 'Superliga', 'Friskhed', 'Hvis-Så', 'naturlig position', 'kampprogram', 'Sæson 1 (uden program)', 'backup'].every((x) => migNotice.includes(x)), migNotice);
  await reload(); await reload();
  const mig = await g.evaluate(() => ({ schema: JSON.parse(localStorage.getItem('tactivar_save')).schemaVersion, backups: Object.keys(localStorage).filter((k) => k.startsWith('tactivar_backup_')).length }));
  check('Migrering: gemmes straks i skema 6, kun én backup trods tre genindlæsninger', mig.schema === 6 && mig.backups === 1, JSON.stringify(mig));
  await tab('liga'); const migHead = await g.textContent('#standings-title');
  await g.click('#past-seasons > summary');
  const past = await g.textContent('#past-seasons');
  await tab('trup');
  check('Migrering: ligaen fra skema 1 er intakt (18 spillere); runde 1 er arkiveret som sæson 1, og sæson 2 starter', migHead.includes('sæson 2, efter 0 af 14 runder') && past.includes('Sæson 1 (uden program) – runde 1–1') && (await rows()) === 18, `${migHead} / ${past.slice(0, 80)}`);
  check('Migrering: ▶ spiller programmets runde 1 i sæson 2', (await g.textContent('#play-round')).startsWith('▶ Spil runde 1 af 14 mod '));
  // Runden er gemt før v3.5 (uden plads og startformation): Kamp-fanen viser den med listen, uden minibane
  await tab('kamp');
  const oldRows = await g.locator('.ratings').nth(own).locator('tbody tr td:first-child').allTextContents();
  check('Gammel runde uden plads: karakterark med gemt rolle, ingen minibane', (await g.isVisible('#match-center')) && (await g.locator('.minipitch').count()) === 0 && oldRows.length >= 11 && oldRows.every((t) => / · \S/.test(t) && !/undefined|null/.test(t)), oldRows.slice(0, 2).join(' | '));
  await tab('trup');

  // Skema 2 (brugerens egen liga før v3.6): beskeden nævner puljen og højden – ikke Hvis-Så
  const fixture2 = fs.readFileSync(new URL('../fixtures/save-schema2.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixture2);
  await reload();
  const note2 = await g.textContent('#notice');
  check('Migrering fra skema 2: beskeden nævner 100 point og Superliga-højderne, men ikke Hvis-Så og ikke de 5 cm', note2.includes('100 point') && note2.includes('Superliga') && !note2.includes('Hvis-Så') && !note2.includes('5 cm'), note2);
  const h2 = await g.evaluate(() => { const hs = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.flatMap((t) => t.squad.map((p) => p.heightCm)); return [hs.reduce((a, b) => a + b) / hs.length, Math.min(...hs), Math.max(...hs)]; });
  // Et gem fra v3.7.0 (skema 4, uden HI-felter og matchIdx): ingen "undefined"/"NaN", ingen 0 % HI,
  // og linket i Rundens mål findes via kampens navn
  const fixture4 = fs.readFileSync(new URL('../fixtures/save-schema4.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixture4);
  await reload();
  const note4 = await g.textContent('#notice');
  check('Migrering fra skema 4 (v3.8): beskeden forklarer naturlig position og højde pr. position – ikke friskheden eller puljen igen', note4.includes('naturlig position') && note4.includes('backs og kanter lavere') && !note4.includes('Friskhed betyder') && !note4.includes('100 point'), note4);
  await tab('trup');
  const nat = await g.locator('#matrix tbody tr td:nth-child(4)').allTextContents();
  check('Natur-kolonnen viser en position for alle 18 (MV/CB/Back/CM/Kant/OM/ANG)', nat.length === 18 && nat.every((t) => ['MV', 'CB', 'Back', 'CM', 'Kant', 'OM', 'ANG'].includes(t.trim())), nat.join(','));
  const pos4 = await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const ps = d.league.teams.flatMap((t) => t.squad); const m = (k) => { const x = ps.filter((p) => p.position === k).map((p) => p.heightCm); return x.reduce((a, b) => a + b) / x.length; }; return { schema: d.schemaVersion, cb: m('CB'), fb: m('FB') }; });
  check('Migrering fra skema 4: gemt som skema 6, stoppere ≈190 og backs ≈176 cm', pos4.schema === 6 && pos4.cb >= 189 && pos4.cb <= 192 && pos4.fb >= 174.5 && pos4.fb <= 177.5, JSON.stringify(pos4));
  await tab('kamp');
  const old4 = await g.textContent('#match-center');
  check('Gem fra v3.7.0: karakterark og avis uden "undefined"/"NaN" og uden HI-tal', !/undefined|NaN|% HI/.test(old4) && (await g.locator('.ratings td.run').count()) > 0, old4.slice(0, 120));
  await g.click('#match-center #goal-of-round-match');
  const g4 = JSON.parse(fixture4).league.lastRound.gazette.goalOfTheRound;
  check('Gem fra v3.7.0: Rundens mål linker til kampen fundet ud fra navnet', (await g.textContent('#scoreboard')).includes(g4.match.split(' - ')[0]) && (await g.locator('#goal-focus').count()) === 1);
  await tab('trup');
  await g.locator('#matrix tbody tr').first().click();
  check('Gem fra v3.7.0: spillerkortet viser ikke 0 % højintenst, men at tallet kommer', (await g.textContent('#run-stats')).includes('højintenst: kommer efter næste kamp'));

  // v3.10: et gem fra v3.9 (runde 2) – kun v3.11's kampprogram-besked, statistikken starter tom fra runde 3
  const fixtureV39 = fs.readFileSync(new URL('../fixtures/save-v3.9.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixtureV39);
  await reload();
  const v39note = await g.textContent('#notice'); // fanebyt fjerner beskeden
  check('Nyt i v3.12 vises én gang efter opdateringen (sammen med migreringen)', v39note.includes('"Lave cutbacks" giver rigtige cutbacks') && v39note.includes('Direkte lange bolde'), v39note.slice(-200));
  check('Hopper man over en version, får man begge nyheder i rækkefølge (3.12.0 før 3.12.1)', v39note.indexOf('"Lave cutbacks"') >= 0 && v39note.indexOf('"Lave cutbacks"') < v39note.indexOf('Spillerne rykker nu med'), v39note.slice(-300));
  // Test Manager v3.12: nyheden skal være GEMT straks – ellers vises den igen efter F5, hvis man ikke har gjort andet (fanebyt gemmer også)
  await reload();
  check('Nyt i v3.12 er gemt straks: ikke igen efter F5 uden anden handling', (await g.locator('#notice').count()) === 0);
  await tab('liga');
  const v39secs = await g.locator('#stats details.stats-sec > summary').allTextContents();
  check('Gem fra v3.9: kun kampprogram-beskeden; statistikken tæller fra runde 3 og er tom', v39note.startsWith('Dit spil er opdateret: Nu spilles der efter et fast kampprogram') && !v39note.includes('naturlig position') && v39secs[0] === 'Spillere (fra runde 3)' && (await g.locator('#stats .stat-list[data-key="sGoals"]').textContent()).includes('Ingen endnu') && (await g.locator('#fejlboks').isHidden()), v39secs.join(' | '));
  await reload();
  check('…og ikke igen efter næste indlæsning', (await g.locator('#notice').count()) === 0);
  await tab('trup');

  // Skema 3 (v3.6 – den version, de fleste kommer fra): beskeden handler om højder og friskhed
  const fixture3 = fs.readFileSync(new URL('../fixtures/save-schema3.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixture3);
  await reload();
  const note3 = await g.textContent('#notice');
  const dl = g.waitForEvent('download');
  await g.click('#download-migration-backup');
  const bk = await dl;
  check('Migrering: beskeden har en knap, der henter det gamle spil (skema 3) som fil', bk.suggestedFilename().startsWith('tactivar_backup_') && JSON.parse(fs.readFileSync(await bk.path(), 'utf8')).schemaVersion === 3);
  check('Migrering fra skema 3: beskeden nævner Superliga-højderne og friskheden – ikke puljen eller Hvis-Så', note3.includes('Superliga') && note3.includes('Friskhed') && !note3.includes('100 point') && !note3.includes('Hvis-Så'), note3);
  // Advarsel ved ▶ om trætte startere (under 70 %)
  const setStarterFresh = async (v) => { await g.evaluate((val) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const t = d.league.teams.find((x) => !x.isBot); for (const p of t.squad) p.freshness = 100; t.squad.find((p) => p.id === t.tactics.lineupSlots[6]).freshness = val; localStorage.setItem('tactivar_save', JSON.stringify(d)); }, v); await reload(); };
  await setStarterFresh(69);
  check('Advarsel: én starter under 70 % giver "⚠ 1 trætte startere"', (await g.textContent('#tired-warning')).trim() === '⚠ 1 trætte startere');
  await setStarterFresh(70);
  check('Ingen advarsel ved 70 %', (await g.locator('#tired-warning').count()) === 0);
  await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const t = d.league.teams.find((x) => !x.isBot); t.squad.find((p) => !t.tactics.lineupSlots.includes(p.id)).freshness = 10; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
  await reload();
  check('En træt bænkspiller giver ingen advarsel', (await g.locator('#tired-warning').count()) === 0);
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixture2);
  await reload();
  check('Migrering fra skema 2: højderne er gemt som i Superligaen (snit ≈184, 168–201)', h2[0] >= 183.5 && h2[0] <= 185 && h2[1] >= 168 && h2[2] <= 201, h2.map((x) => x.toFixed(1)).join(' / '));

  // Mislykkes backuppen ved migrering (fuldt lager), overskrives det gamle format ikke – og der advares
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixture);
  await g.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('tactivar_backup_')) throw new Error('QuotaExceededError'); return set.call(this, k, v); }; });
  await reload();
  const noBackup = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).schemaVersion);
  check('Migrering uden mulig backup: det gamle format står urørt, og der advares', noBackup === 1 && (await g.textContent('#fejlboks')).includes('kunne ikke tages backup'));
  // …også efter et gem og en ændring (Release Manager v3.11: før overskrev første klik den gamle fil uden backup)
  await g.click('#save-now');
  await g.click('#tab-taktik'); await g.selectOption('#tactics select[data-field="pressingHeight"]', 'LOW_BLOCK');
  const stillOld = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).schemaVersion);
  check('Migrering uden mulig backup: gem og ændringer overskriver ikke den gamle fil – gem-status siger IKKE gemt', stillOld === 1 && (await g.textContent('#save-status')).includes('IKKE gemt') && (await g.textContent('#fejlboks')).includes('IKKE gemt'), String(stillOld));
  const fresh2 = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const g2 = await fresh2.newPage(); await g2.goto(BASE + '/'); await g2.waitForSelector('body[data-klar="ja"]');
  await g.close();
  g = g2; // fortsæt i en ren side uden den kastende setItem

  // Ny liga og import tager backup af det nuværende spil
  await g.selectOption('#team-select', '0');
  await g.click('#play-round'); await g.click('#skip'); // en runde i Kamp-fanen, som Ny liga skal fjerne
  await tab('trup');
  const savedBefore = await g.evaluate(() => localStorage.getItem('tactivar_save'));
  g.once('dialog', (d) => d.accept());
  await g.click('#new-league');
  const backups = async () => g.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('tactivar_backup_')).map((k) => localStorage.getItem(k)));
  check('Ny liga: det gamle spil ligger i backup', (await backups()).includes(savedBefore));
  await tab('kamp');
  check('Ny liga: Kamp-fanen viser ikke den gamle ligas runde', (await g.locator('#match-center').count()) === 0 && (await g.isVisible('#no-matches')));
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
