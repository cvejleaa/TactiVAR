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
// TM v3.30.0: et link, der fører det forkerte sted hen, skal give et NAVNGIVET rødt tjek – ikke 30 s timeout og en stak. Vent kort, og lad checket dømme.
const soft = (pg, sel) => pg.waitForSelector(sel, { timeout: 4000 }).catch(() => null);

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
  await page.click('#tab-admin');   // v3.28.0: versionen står i ⚙ Admin (før i topbaren)
  check('Versionsnummer vises i ⚙ Admin', /^v\d+\.\d+\.\d+/.test(await page.textContent('#admin #version')));
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
  const f1tm = async () => {
    // ---------- UI-ombygningen F1, Test Manager (v3.28.0): kilderne bag Hjem-tallene med BESTEMTE tal ----------
    // Forfatterens e2e kontrollerede at Hjem/bjælken/den lille ▶ SIGER DET SAMME, men ikke hvad kilderne er: 🟨 for en bænkspiller eller en
    // udelukket med 3 gule, den trætte gruppes #numre og antal, afrundingen, ↑/↓'s hver enkelt delposter (kun regnet ud fra én tilfældig
    // runde), modstanderens form (V/T/U, de 3 SENESTE, kun denne sæson), minitabellens vindue, og at kassen under afspilning er FØR runden.
    {
      const tp = await fresh();
      const tt = async (k) => { await tp.click(`#tab-${k}`); await tp.waitForSelector(`.tabpane.tab-${k}`); };
      const reloadT = async () => { await tp.reload(); await tp.waitForSelector('body[data-klar="ja"]'); };
      const mod = (f, arg) => tp.evaluate(([src, a]) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const r = (0, eval)('(' + src + ')')(d, a); localStorage.setItem('tactivar_save', JSON.stringify(d)); return r; }, [f.toString(), arg ?? null]);
      // QC B1: frisk liga UDEN et fane-klik (ui.tab er ikke sat) – 🔍 på Hjem skal åbne modstanderen i Trup, og Hjem viser bagefter dit hold
      await tp.click('#home-opp-link'); await tp.waitForSelector('.tabpane.tab-trup');
      check('Frisk liga, ingen fane valgt: 🔍 på Hjem åbner modstanderen i Trup med scout-bjælken', (await tp.locator('#scout-banner').count()) === 1);
      await tp.click('#scout-back'); await tp.waitForSelector('.tabpane.tab-trup');
      // (0) ny liga, før første runde: ingen "Sidste runde", sæsonens start og næste kamp med programmets længde (14 runder)
      await tt('hjem');
      const nx0 = await tp.evaluate(() => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, me = L.teams.find((t) => !t.isBot).id, pr = L.schedule[0].find(([a, b]) => a === me || b === me); return { opp: L.teams.find((t) => t.id === (pr[0] === me ? pr[1] : pr[0])).name, home: pr[0] === me, n: L.schedule.length }; });
      const hu = nx0.home ? 'hjemme' : 'ude';
      // v3.31.0 (Spilfører UI på F1): ingen 🔍 i bjælken på Hjem – næste kamp-kortet har linket; på Taktik står den, og ▶ står samme sted på begge
      const playX = () => tp.evaluate(() => Math.round(document.querySelector('#play-bar #play-round').getBoundingClientRect().right));
      const xHjem = await playX();
      check('Spil-bjælken (Hjem): "▶ Spil runde 1 af 14 · X (hjemme/ude)" – og INGEN 🔍-link (næste kamp-kortet har det)',
        (await tp.textContent('#play-bar #play-round')) === `▶ Spil runde 1 af ${nx0.n} · ${nx0.opp} (${hu})` && (await tp.locator('#play-bar #next-opponent').count()) === 0 && (await tp.getAttribute('#play-bar #play-round', 'title')) === `Spil runde 1 af ${nx0.n} mod ${nx0.opp} (${hu})` && !(await tp.textContent('#play-bar')).includes('🔍'), await tp.textContent('#play-bar'));
      await tt('taktik');
      const xTaktik = await playX();
      check('Spil-bjælken (Taktik): modstanderen som separat 🔍-link – og ▶ står samme sted som på Hjem (højre kant)', (await tp.textContent('#play-bar #next-opponent')) === `🔍 ${nx0.opp}` && xHjem === xTaktik && xHjem > 1000, `Hjem ${xHjem} | Taktik ${xTaktik}`);
      await tt('trup');
      // v3.31.1: Spil-bjælken også på Trup (før den lille ▶ i topbaren) – samme knap og forklaring, ingen tegn uden advarsler, intet ▶ i topbaren
      check('Spil-bjælken (Trup, ingen advarsler): "▶ Spil runde 1 af 14 · X (hjemme/ude)" med forklaringen og 🔍 – ingen tegn, intet ▶ i topbaren',
        (await tp.textContent('#playbar #play-round')) === `▶ Spil runde 1 af ${nx0.n} · ${nx0.opp} (${hu})` && (await tp.getAttribute('#playbar #play-round', 'title')) === `Spil runde 1 af ${nx0.n} mod ${nx0.opp} (${hu})` && (await tp.locator('#bar-issues, #issue-count').count()) === 0 && (await tp.locator('.topbar #play-round').count()) === 0 && (await tp.textContent('#play-bar #next-opponent')) === `🔍 ${nx0.opp}`);
      await tt('hjem');
      check('Hjem før første runde: "Sæsonen er ikke begyndt" (ikke "Nr. x i tabellen") og "Næste kamp · runde 1 af 14"', (await tp.textContent('#home-first')).includes('Sæsonen er ikke begyndt') && (await tp.locator('#home-last').count()) === 0
        && (await tp.textContent('#home-next')).startsWith('Næste kamp · runde 1 af 14') && (await tp.locator('#cash-delta').count()) === 0
        && (await tp.locator('#home-paper, #home-motm').count()) === 0 && (await tp.locator('#home-first').count()) === 1, await tp.textContent('#home-first'));   // v3.31.0: intet 📰-kort og intet 👑 før runde 1 (ingen avis endnu)   // ingen regnskabslinje endnu → ingen "±0 kr. siden sidste runde"
      // (1) advarslernes kilder: udelukket MED 3 gule = kun ⛔; 7 gule = 🟨; bænk med 3 gule = intet; grænse 80: 78,6 → "79 % frisk"; to trætte = ét ⚠ 2
      const S = await mod((d) => { const me = d.league.teams.find((t) => !t.isBot), sl = me.tactics.lineupSlots, P = (i) => me.squad.find((x) => x.id === sl[i]);
        me.subsLimit = 80; Object.assign(P(9), { banMatches: 2, banWhy: 'DIRECT', banYellows: 3, freshness: 40 });   // QC: udelukket OG træt = kun ⛔, ikke også ⚠
        P(6).banYellows = 7; P(4).freshness = 78.6; P(5).freshness = 60;
        const bench = me.squad.find((x) => !sl.includes(x.id)); bench.banYellows = 3; bench.freshness = 10;
        const tiredIds = me.squad.filter((x) => [sl[4], sl[5]].includes(x.id)).map((x) => x.id);   // rækkefølge som truppen (tiredStarters)
        return { ban: P(9).shirtNumber, yel: P(6).shirtNumber, t1: P(4).shirtNumber, t2: P(5).shirtNumber, bench: bench.shirtNumber, first: me.squad.find((x) => x.id === tiredIds[0]).shirtNumber }; });
      await reloadT(); await tt('taktik');
      const pills = await tp.locator('#bar-issues .pill').allTextContents(), tiredNrs = (await tp.getAttribute('#tired-warning', 'data-nrs')).split(',').map(Number).sort((a, b) => a - b), tiredTitle = await tp.getAttribute('#tired-warning', 'title');
      check('Advarslernes kilder, Taktik: ⛔ (udelukket med 3 gule: ikke også 🟨), ⚠ 2 (de to trætte) og 🟨 (7 gule) – bænken med 3 gule/træt giver intet',
        JSON.stringify(pills) === JSON.stringify([`⛔ #${S.ban}`, '⚠ 2', `🟨 #${S.yel}`]) && JSON.stringify(tiredNrs) === JSON.stringify([S.t1, S.t2].sort((a, b) => a - b)), pills.join(' | ') + ' | ' + tiredNrs);
      check('Den trætte gruppes forklaring: grænsen 80 %, "79 % frisk" (rundet, ikke 78) og "60 % frisk" – og ingen bænkspiller', tiredTitle.startsWith('2 startere under din grænse (80 %) – skiftes ud tidligt (fra 3. minut, højst 3 ad gangen, hvis en frisk afløser i samme kæde sidder på bænken – det bruger et skift): ') && tiredTitle.includes(' er 79 % frisk') && tiredTitle.includes(' er 60 % frisk') && !tiredTitle.includes(`#${S.bench} `), tiredTitle);
      await tp.click('#tired-warning');
      const selNr = await tp.evaluate(() => [...document.querySelectorAll('#pitch .token.selected')].map((t) => t.querySelector('.token-num')?.textContent));
      check('Et tryk på ⚠-pillen markerer den FØRSTE trætte (i truppens rækkefølge) på banen', JSON.stringify(selNr) === JSON.stringify([String(S.first)]), JSON.stringify(selNr) + ' forventet ' + S.first);
      await tt('hjem');
      // v3.31.1 (brugeren 3/11: "Ja, også på Hjem"): pillerne står også i bjælken på Hjem – de samme som på Taktik; stadig ingen 🔍
      { const homePills = await tp.locator('#play-bar #bar-issues .pill').allTextContents();
        check('Hjem: Spil-bjælken har de SAMME piller som Taktik (⛔ #nr, ⚠ 2, 🟨 #nr) – og ingen 🔍 (v3.31.0)',
          JSON.stringify(homePills) === JSON.stringify([`⛔ #${S.ban}`, '⚠ 2', `🟨 #${S.yel}`]) && (await tp.locator('#play-bar #play-round').count()) === 1 && (await tp.locator('#play-bar #next-opponent').count()) === 0, homePills.join(' | ')); }
      const rows = await tp.evaluate(() => [...document.querySelectorAll('#home-todo .todo-row[data-kind]')].map((r) => `${r.dataset.kind}:${r.dataset.nrs.split(',').map(Number).sort((a, b) => a - b)}`));
      check('Advarslernes kilder, Hjem: præcis tre rækker – ban, tired (begge #numre), yellow (7 gule, "🟨 7") – ikke en fjerde 🟨 for den udelukkede eller bænken',
        JSON.stringify(rows) === JSON.stringify([`ban:${S.ban}`, `tired:${[S.t1, S.t2].sort((a, b) => a - b)}`, `yellow:${S.yel}`]) && (await tp.textContent('#home-todo .todo-row[data-kind="yellow"] .todo-txt')).includes('🟨 7 – næste gule kort'), rows.join(' | '));
      await tp.click('#home-todo .todo-row[data-kind="tired"] .linklike'); await tp.waitForSelector('.tabpane.tab-taktik');
      const selNr3 = await tp.evaluate(() => [...document.querySelectorAll('#pitch .token.selected')].map((t) => t.querySelector('.token-num')?.textContent));
      check('Hjem: "Taktik ›" på en række åbner Taktik og markerer den første af de trætte på banen', JSON.stringify(selNr3) === JSON.stringify([String(S.first)]), JSON.stringify(selNr3));
      const clubName = await tp.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot).name);
      await tt('liga'); await tp.selectOption('#team-select', '1'); await tp.waitForSelector('.tabpane.tab-trup');
      check('Topbaren siger dit klubnavn – også mens du ser et andet hold', (await tp.textContent('#top-club')) === clubName && (await tp.textContent('#club-name')) !== clubName, `${await tp.textContent('#top-club')} | ${await tp.textContent('#club-name')}`);
      await tp.click('#scout-back');
      await tt('liga');
      // v3.31.1: Liga har bjælken med pillerne (før den lille ▶ med "⛔1 ⚠2 🟨1"); smal-tælleren (skjult på computer) siger det kompakt – spillere, ikke grupper
      { const lp = await tp.locator('#play-bar #bar-issues .pill').allTextContents(), narrow = await tp.textContent('#play-bar .count-narrow');
        check('Liga: Spil-bjælken med pillerne ⛔ #nr, ⚠ 2, 🟨 #nr – og tælleren for smal skærm tæller spillere: "⛔1 ⚠2 🟨1"', JSON.stringify(lp) === JSON.stringify([`⛔ #${S.ban}`, '⚠ 2', `🟨 #${S.yel}`]) && narrow === '⛔1 ⚠2 🟨1', `${lp.join(' | ')} / ${narrow}`); }
      // det værste først: skadet (🚑) står FØR trætte (⚠) og 🟨 – udelukkelsen er hævet, spilleren skadet i stedet
      await mod((d, nr) => { const p = d.league.teams.find((t) => !t.isBot).squad.find((x) => x.shirtNumber === nr); Object.assign(p, { banMatches: 0, banWhy: null, banYellows: 0, injuryMatchesLeft: 2 }); }, S.ban);
      await reloadT(); await tt('taktik');
      const pills2 = await tp.locator('#bar-issues .pill').allTextContents();
      check('Rækkefølgen er det værste først: 🚑 skadet, ⚠ trætte, 🟨 gult', JSON.stringify(pills2) === JSON.stringify([`🚑 #${S.ban}`, '⚠ 2', `🟨 #${S.yel}`]), pills2.join(' | '));
      // fire grupper (🚑, ⚠, 🟨, 🟨) → én tæller-pille, farvet efter det værste, og et tryk fører til Hjem-listen med alle fire
      await mod((d) => { const me = d.league.teams.find((t) => !t.isBot); me.squad.find((x) => x.id === me.tactics.lineupSlots[7]).banYellows = 3; });
      await reloadT(); await tt('taktik');
      const cnt = await tp.textContent('#issue-count'), cls = await tp.getAttribute('#issue-count', 'class');
      const cntTitle = await tp.getAttribute('#issue-count', 'title');
      await tp.click('#issue-count'); await tp.waitForSelector('.tabpane.tab-hjem');
      // v3.31.1: tælleren viser slags kompakt (SPILLERE pr. slags: 🚑1 ⚠2 🟨2); "4 ting" (GRUPPER – = Hjems tæller = antal rækker) står i title
      const homeCnt = await tp.textContent('#home-todo .lbl-row .pill');
      check('Tæller-pillen "🚑1 ⚠2 🟨2" (farvet efter det værste, "4 ting" i title) fører til Hjem-listen med de fire – og Hjem siger "4 ting" (grupper)', cnt === '🚑1 ⚠2 🟨2' && cntTitle.startsWith('4 ting:\n') && cls.includes('pill-injury') && (await tp.locator('#home-todo .todo-row[data-kind]').count()) === 4 && homeCnt === '4 ting', cnt + ' | ' + cls + ' | ' + homeCnt + ' | ' + cntTitle.slice(0, 20));
      // tre grupper med både udelukket og skadet: begge ligger i #out-warning (erstattes automatisk), ⚠ udenfor
      await mod((d) => { const me = d.league.teams.find((t) => !t.isBot), P = (i) => me.squad.find((x) => x.id === me.tactics.lineupSlots[i]); P(7).banYellows = 0; P(6).banYellows = 0; P(3).banMatches = 1; P(3).banWhy = 'DIRECT'; });
      await reloadT(); await tt('taktik');
      const outPills = await tp.locator('#out-warning .pill').allTextContents(), allPills = await tp.locator('#bar-issues .pill').allTextContents();
      check('Spil-bjælken: #out-warning rummer BÅDE ⛔ udelukket og 🚑 skadet (ikke kun udelukkede), ⚠ trætte står udenfor den', outPills.length === 2 && outPills[0].startsWith('⛔ #') && outPills[1].startsWith('🚑 #') && allPills.length === 3 && allPills[2] === '⚠ 2', outPills.join(' | ') + ' / ' + allPills.join(' | '));
      // under afspilning står der ingen piller i bjælken (de er bogført), og knappen er slået fra
      await tp.click('#tab-liga'); await tp.click('#play-round'); await tp.waitForSelector('#skip'); await tt('taktik');
      // v3.31.1 (backlog: "viser næste runde, mens man ser denne"): knappen siger, hvilken runde der spilles – ingen næste modstander
      check('Taktik under afspilning: ingen piller i Spil-bjælken (advarslerne er bogført), ▶ er slået fra og siger "📺 Runde 1 spilles …" – ingen 🔍 til næste modstander', (await tp.locator('#play-bar #bar-issues').count()) === 0 && (await tp.isDisabled('#play-bar #play-round')) && (await tp.textContent('#play-bar #play-round')) === '📺 Runde 1 spilles …' && (await tp.locator('#play-bar #next-opponent').count()) === 0, await tp.textContent('#play-bar #play-round'));
      await tp.context().close();
    }
    {
      const tp = await fresh();
      const tt = async (k) => { await tp.click(`#tab-${k}`); await tp.waitForSelector(`.tabpane.tab-${k}`); };
      const reloadT = async () => { await tp.reload(); await tp.waitForSelector('body[data-klar="ja"]'); };
      const mod = (f, arg) => tp.evaluate(([src, a]) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const r = (0, eval)('(' + src + ')')(d, a); localStorage.setItem('tactivar_save', JSON.stringify(d)); return r; }, [f.toString(), arg ?? null]);
      const playOne = async () => { await tp.click('#play-round'); await tp.waitForSelector('#skip'); await tp.click('#skip'); await tp.waitForSelector('.to-home'); };
      await playOne(); await playOne();   // runde 2 er spillet: ↑/↓ regnes fra nu
      // (2) (flyttet til blokken nedenfor: ↑/↓ skal testes i sæsonens PRÆCIS 2. runde, så der må ikke være spillet en 3.)
      // (3) ↑/↓: seks bestemte stillinger (tal EFTER runden; min kamp er altid kamp 0 hjemme) – hvert led i "tabellen uden sidste runde" flytter min plads i mindst én
      // [point, mål for, mål imod] pr. hold (hold 0 = mig) og kampene [hjem, ude, hjemmemål, udemål]; forventningerne er regnet uden for appen (tools/tm-f1-scenarier.py (python3 tools/tm-f1-scenarier.py gentager søgningen))
      const SC = [
        { now: [[9, 12, 6], [10, 8, 12], [14, 11, 12], [13, 11, 8], [8, 11, 5], [14, 11, 11], [12, 14, 5], [13, 11, 9]], m: [[0, 1, 1, 0], [2, 3, 2, 0], [4, 5, 0, 0], [6, 7, 0, 3]], exp: 'Nr. 7 ↑1' },
        { now: [[13, 9, 11], [13, 8, 8], [14, 11, 12], [12, 9, 10], [9, 13, 8], [14, 11, 9], [8, 11, 6], [9, 13, 9]], m: [[0, 1, 0, 2], [2, 3, 3, 1], [4, 5, 2, 2], [6, 7, 3, 3]], exp: 'Nr. 4 ↓2' },
        { now: [[12, 14, 5], [11, 9, 11], [11, 13, 7], [10, 12, 10], [8, 11, 6], [14, 9, 11], [10, 11, 5], [11, 8, 9]], m: [[0, 1, 3, 1], [2, 3, 1, 1], [4, 5, 0, 1], [6, 7, 1, 3]], exp: 'Nr. 2 ↑3' },
        { now: [[12, 12, 8], [12, 8, 9], [10, 10, 6], [11, 10, 6], [14, 8, 9], [8, 12, 5], [8, 11, 6], [14, 14, 5]], m: [[0, 1, 1, 1], [2, 3, 3, 1], [4, 5, 0, 3], [6, 7, 1, 1]], exp: 'Nr. 3 ↑1' },
        { now: [[14, 10, 12], [9, 11, 5], [10, 12, 6], [13, 12, 11], [8, 10, 6], [13, 11, 5], [9, 12, 7], [13, 8, 11]], m: [[0, 1, 2, 2], [2, 3, 1, 1], [4, 5, 1, 2], [6, 7, 2, 0]], exp: 'Nr. 1 ↑1' },
        { now: [[12, 12, 8], [10, 10, 11], [12, 11, 6], [9, 13, 12], [12, 12, 5], [14, 10, 7], [9, 10, 11], [12, 10, 6]], m: [[0, 1, 3, 2], [2, 3, 1, 0], [4, 5, 0, 2], [6, 7, 2, 3]], exp: 'Nr. 4 ↑1' }];
      const setSc = (sc) => mod((d, s) => { const L = d.league, me = L.teams.findIndex((t) => !t.isBot), order = [me, ...L.teams.map((_, i) => i).filter((i) => i !== me)], T = (i) => L.teams[order[i]];
        s.now.forEach(([p, gf, ga], i) => { Object.assign(L.leagueMetadata.standings.find((x) => x.teamId === T(i).id), { points: p, goalsFor: gf, goalsAgainst: ga }); });
        s.m.forEach(([h, a, hg, ag], k) => Object.assign(L.lastRound.matches[k], { homeId: T(h).id, awayId: T(a).id, homeName: T(h).name, awayName: T(a).name, homeGoals: hg, awayGoals: ag })); }, sc);
      const got = [];
      for (const sc of SC) { await setSc(sc); await reloadT(); await tt('hjem'); got.push(await tp.textContent('#home-place')); }
      check('Hjem ↑/↓: seks bestemte stillinger (hvert led – hjemmemål for/imod, udemål for/imod, point, uafgjort – og sorteringen) giver præcis det forventede', JSON.stringify(got) === JSON.stringify(SC.map((s) => s.exp)), got.join(' | '));
      await setSc(SC[0]); await reloadT(); await tt('hjem'); const once = await tp.textContent('#home-place'), tabOnce = await tp.textContent('#home-table');
      await tt('liga'); await tt('hjem');
      check('Hjem tegnet igen giver det samme (↑/↓ regnes på en kopi – tabellens egne tal røres ikke)', (await tp.textContent('#home-place')) === once && (await tp.textContent('#home-table')) === tabOnce, once + ' | ' + (await tp.textContent('#home-place')));
      const ptsNow = await tp.evaluate(() => [...document.querySelectorAll('#home-table tr')].map((r) => r.lastChild.textContent));
      check('Minitabellens point er ligaens (ikke de udregnede før-runden-tal)', JSON.stringify(ptsNow) === JSON.stringify(['13', '12', '10', '9', '8']), ptsNow.join());   // stilling 1: plads 4–8 af 14·14·13·13·12·10·9·8
      // (4) minitabellens vindue: 5 rækker omkring dig, aldrig uden for tabellen (plads 1, 3, 4, 5 og 7 af 8)
      const win = async (rank) => { await mod((d, r) => { const L = d.league, me = L.teams.findIndex((t) => !t.isBot), others = L.teams.map((_, i) => i).filter((i) => i !== me), seq = [];
          for (let pos = 1; pos <= 8; pos++) seq.push(pos === r ? me : others.shift());
          seq.forEach((ti, k) => Object.assign(L.leagueMetadata.standings.find((x) => x.teamId === L.teams[ti].id), { points: 40 - 3 * k, goalsFor: 20, goalsAgainst: 10 })); }, rank);
        await reloadT(); await tt('hjem');
        return tp.evaluate(() => [...document.querySelectorAll('#home-table tr')].map((r) => [r.firstChild.textContent, r.children[1].textContent, r.lastChild.textContent, r.className])); };
      const winOk = {}; let myName = null;
      for (const [rank, lo, hi] of [[1, 1, 5], [3, 1, 5], [4, 2, 6], [5, 3, 7], [7, 4, 8]]) {
        const rowsW = await win(rank); myName ??= await tp.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot).name);
        winOk[rank] = rowsW.length === 5 && rowsW.every(([pos, , pts], k) => Number(pos) === lo + k && Number(pts) === 40 - 3 * (lo + k - 1)) && rowsW.filter((r) => r[3] === 'mine').length === 1 && rowsW[rank - lo][3] === 'mine' && rowsW[rank - lo][1] === myName;
      }
      check('Minitabellen: 5 rækker omkring dig – plads 1 og 3 → 1–5, 4 → 2–6, 5 → 3–7, 7 → 4–8 (aldrig under 1 eller over 8), dit hold markeret og point som tabellen', Object.values(winOk).every(Boolean), JSON.stringify(winOk));
      // (5) modstanderens form: de 3 SENESTE (ældst → nyest) fra denne sæson, V/T/U set fra HAM (hjemme- og udekampe)
      const oppName = (await tp.textContent('#home-opp-link')).replace(/^🔍 Se | – kun offentlige data ›$/g, '');   // v3.31.0: ingen 🔍 i bjælken på Hjem
      const form = async (list) => { await mod((d, a) => { const L = d.league, opp = L.teams.find((t) => t.name === a.opp).id, other = L.teams.find((t) => !t.isBot).id, ss = L.seasonStartRound;
          L.history = a.list.map(([k, home, hG, aG]) => ({ round: ss + k, results: [home ? { h: opp, a: other, hG, aG } : { h: other, a: opp, hG, aG }] })); }, { opp: oppName, list });
        await reloadT(); await tt('hjem'); return tp.textContent('#home-opp-form'); };
      // [runde i sæsonen (−1 = FØR sæsonen), han hjemme?, hjemmemål, udemål]
      const f1 = await form([[-1, true, 5, 0], [0, true, 2, 0], [1, true, 0, 1], [2, false, 1, 1], [3, false, 0, 2], [4, false, 3, 1]]);
      const oppPlace = await tp.evaluate((n) => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, id = L.teams.find((t) => t.name === n).id;
        return L.leagueMetadata.standings.slice().sort((x, y) => y.points - x.points || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor).findIndex((x) => x.teamId === id) + 1; }, oppName);
      check('Modstanderens placering på Hjem er HAM i tabellen (ikke din)', f1.startsWith(`Nr. ${oppPlace} · `), `${f1} | forventet Nr. ${oppPlace}`);
      check('Modstanderens form: de 3 seneste i sæsonen, ældst først, set fra ham – uafgjort U, udesejr V (0–2 ude), udenederlag T (3–1 ude)', /^Nr\. \d · seneste 3 \(ældste → nyeste\): U V T$/.test(f1), f1);
      // v3.31.0 (Spilfører UI på F1): bogstaverne er piller – grøn/grå/rød efter resultatet og title fra HANS side
      const pillsF = await tp.evaluate(() => [...document.querySelectorAll('#home-opp-form .form-pill')].map((e) => [e.textContent, e.className, e.title, getComputedStyle(e).backgroundColor]));
      check('Formpillerne: U V T i rækkefølge, klasse form-U/V/T, title "<modstander>: Uafgjort/Vundet/Tabt" og tre forskellige farver', JSON.stringify(pillsF.map((x) => x.slice(0, 3))) === JSON.stringify([['U', 'form-pill form-U', `${oppName}: Uafgjort`], ['V', 'form-pill form-V', `${oppName}: Vundet`], ['T', 'form-pill form-T', `${oppName}: Tabt`]]) && new Set(pillsF.map((x) => x[3])).size === 3, JSON.stringify(pillsF));
      const f2 = await form([[-1, true, 5, 0], [0, true, 0, 1]]);
      check('Modstanderens form: kun denne sæson tæller (et resultat før sæsonen er ikke med) – T alene', f2.endsWith('seneste 3 (ældste → nyeste): T'), f2);
      const f3 = await form([[-1, true, 5, 0]]);
      check('Modstanderens form: ingen kampe i denne sæson endnu → teksten siger det', f3.endsWith('seneste 3: ingen kampe i sæsonen endnu'), f3);
      const f4 = await form([[0, true, 1, 0], [1, false, 2, 2], [2, true, 0, 0]]);
      check('Modstanderens form: præcis 3 kampe → alle tre (V U U), også en hjemmekamp uden sejr', f4.endsWith('seneste 3 (ældste → nyeste): V U U'), f4);
      // (6) din kamp ude: resultatet og målscorerne er DINE (udeholdets), ikke hjemmeholdets
      await mod((d) => { const L = d.league, me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t !== me && t.isBot), m = L.lastRound.matches[0];
        Object.assign(m, { homeId: opp.id, awayId: me.id, homeName: opp.name, awayName: me.name, homeGoals: 1, awayGoals: 2 });
        m.ratings.home = [{ shortName: 'HjemmeM', goals: 1 }]; m.ratings.away = [{ shortName: 'UdeM', goals: 2 }, { shortName: 'UdeN', goals: 1 }, { shortName: 'UdeO', goals: 0 }]; });
      await reloadT(); await tt('hjem'); const lastTxt = await tp.textContent('#home-last');
      { const want = await tp.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0].att), got = (await tp.locator('#home-att').count()) ? await tp.textContent('#home-att') : null;
        check('v3.30.0 (QC) Hjem: din kamp i sidste runde viser sit tilskuertal – netop den kamps', Number.isInteger(want) && want >= 4000 && got === `👥 ${want.toLocaleString('da-DK')} tilskuere`, JSON.stringify({ want, got })); }
      check('Hjem, din kamp ude: "Sejr" (udemålene 2 > 1) og målscorerne er udeholdets – "UdeM (2), UdeN" (ikke hjemmeholdets, ikke 0 mål)', lastTxt.includes('Sejr · Mål: UdeM (2), UdeN') && !lastTxt.includes('HjemmeM') && !lastTxt.includes('UdeO'), lastTxt);
      // uafgjort og nederlag (som udehold): 1–1 → "Uafgjort", hjemme 2 – ude 1 → "Nederlag"
      const goalsSet = async (hg, ag) => { await mod((d, g2) => { Object.assign(d.league.lastRound.matches[0], { homeGoals: g2[0], awayGoals: g2[1] }); }, [hg, ag]); await reloadT(); await tt('hjem'); return tp.textContent('#home-last'); };
      const drawTxt = await goalsSet(1, 1), lostTxt = await goalsSet(2, 1);
      check('Hjem, din kamp: 1–1 giver "Uafgjort", 2–1 til hjemmeholdet (dig ude) giver "Nederlag"', drawTxt.includes('Uafgjort ·') && !drawTxt.includes('Sejr') && lostTxt.includes('Nederlag ·') && !lostTxt.includes('Sejr'), `${drawTxt} | ${lostTxt}`);
      // sæsonens runde (ikke ligaens): sæsonen startede i ligaens runde 2 → runde 2 er sæsonens 1. – i "Sidste runde" og i træningslinjen; træningsudfaldet tæller fremskridt/skader/NYE stærke par (kun op)
      await mod((d) => { const L = d.league, me = L.teams.find((t) => !t.isBot), r = L.lastRound.round; L.seasonStartRound = r;
        L.trainingReport = { [me.id]: { round: r, gains: [{ id: me.squad[0].id, skill: Object.keys(me.squad[0].skills)[0] }, { id: me.squad[1].id, skill: Object.keys(me.squad[1].skills)[0] }], injuries: [me.squad[2].id, 'solgt-spiller'], strong: { up: [['a', 'b'], ['c', 'd'], ['e', 'f']], down: [['g', 'h']] } } }; });
      await reloadT(); await tt('hjem');
      check('Hjem: "Sidste runde" og træningslinjen bruger SÆSONENS runde (1, ikke ligaens 2); 2 fremskridt · 1 skadet · 3 nye stærke par (kun op, ikke ned)',
        (await tp.textContent('#home-last')).includes('Sidste runde · runde 1') && (await tp.textContent('#home-training')) === '🏋️Efter runde 1: 2 fremskridt · 1 skadet i træningen · 3 nye stærke parTræning ›', await tp.textContent('#home-training').catch(() => 'mangler'));
      // v3.30.0: "+N" i Trup-regnearket – præcis de to evner i rapporten, med antal og evnens navn efter SÆSONENS runde; tallet i cellen er stadig et tal
      { await tt('trup');
        const gx = await tp.evaluate(async () => { const { SKILL_NAME } = await import('/ui/card.js'), d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), p0 = me.squad[0], k = Object.keys(p0.skills)[0];
          const cells = [...document.querySelectorAll('#matrix td.gain')], c0 = document.querySelector(`#matrix tr[data-pid="${p0.id}"] td.gain`), a = c0 && getComputedStyle(c0, '::after');
          const help = document.getElementById('trup-gain-help');
          return { n: cells.length, title: c0?.title, want: `+1 ${SKILL_NAME[k]} efter runde 1`, gain: c0?.dataset.gain, num: c0 ? Number(c0.textContent) : null, val: p0.skills[k], content: a?.content, bg: a?.backgroundColor, disp: a?.display,
            name: getComputedStyle(document.querySelector(`#matrix tr[data-pid="${p0.id}"] td.player-gain`), '::after').display, help: help?.textContent ?? null }; });
        check('v3.30.0 Trup: "+1" præcis på de 2 evner i rapporten – title "+1 <evne> efter runde 1" (sæsonens runde), et lille grønt mærke (::after viser "+1" fra data-gain), og cellens tekst er stadig tallet',
          gx.n === 2 && gx.title === gx.want && gx.gain === '1' && gx.num === gx.val && gx.content === '"+1"' && gx.bg === 'rgb(11, 51, 38)' && gx.disp === 'inline-block' && gx.name === 'none', JSON.stringify(gx));
        check('v3.30.0 Trup: hjælpelinjen forklarer "+1" (kun når der er mærker) og linker til Træning', gx.help === ' · +N = antal +1 efter runde 1 (træning og kampe) · træningen står på 🏋️ Træning ›', JSON.stringify(gx.help));
        await tp.click('#trup-to-training'); await soft(tp, '.tabpane.tab-traening');
        check('v3.30.0 Trup: "🏋️ Træning ›" i hjælpelinjen åbner Træning', (await tp.textContent('#tabs .tab.active')).includes('Træning') && (await tp.isVisible('#training-table'))); }
      // linkene fører det rigtige sted hen
      await tt('hjem'); await tp.click('#home-table-link'); await tp.waitForSelector('.tabpane.tab-liga');
      check('Hjem: "Hele tabellen ›" åbner Liga', (await tp.textContent('#tabs .tab.active')).includes('Liga'));
      await tt('hjem'); await tp.click('#home-training .linklike'); await soft(tp, '.tabpane.tab-traening');
      check('Hjem: træningslinjens "Træning ›" åbner 🏋️ Træning (dit hold, opsamlingen øverst)', (await tp.textContent('#tabs .tab.active')).includes('Træning') && (await tp.locator('#scout-banner').count()) === 0 && (await tp.isVisible('#training-summary')) && (await tp.isVisible('#training-table')));
      await mod((d) => { const L = d.league, me = L.teams.find((t) => !t.isBot); L.trainingReport = { [me.id]: { round: L.lastRound.round, gains: [], injuries: [], strong: { up: [], down: [['g', 'h']] } } }; });
      await reloadT(); await tt('hjem');
      // v3.30.0 (TM): KUN nye stærke par → knappen hedder "Taktik ›" og åbner Taktik (stregerne står dér), ikke Træning – ledningen (homeHandlers.taktik) var kun set i unit
      await mod((d) => { const L = d.league, me = L.teams.find((t) => !t.isBot); L.trainingReport = { [me.id]: { round: L.lastRound.round, gains: [], injuries: [], strong: { up: [['a', 'b']], down: [] } } }; });
      await reloadT(); await tt('hjem');
      const sLink = await tp.locator('#home-training .linklike').allTextContents();
      if (sLink.length === 1) await tp.click('#home-training .linklike');
      await soft(tp, '.tabpane.tab-taktik');
      check('Hjem: kun nye stærke par → linket hedder "Taktik ›" og åbner Taktik (ikke Træning)', JSON.stringify(sLink) === JSON.stringify(['Taktik ›']) && (await tp.textContent('#tabs .tab.active')).includes('Taktik') && (await tp.locator('.tabpane.tab-traening').count()) === 0, JSON.stringify(sLink));
      await mod((d) => { const L = d.league, me = L.teams.find((t) => !t.isBot); L.trainingReport = { [me.id]: { round: L.lastRound.round, gains: [], injuries: [], strong: { up: [], down: [['g', 'h']] } } }; });
      await reloadT(); await tt('hjem');
      check('Hjem: et træningsudfald uden fremskridt, skader og nye stærke par giver ingen træningslinje (kun et fald i samspil tæller ikke)', (await tp.locator('#home-training').count()) === 0);
      await tp.context().close();
    }
    {
      // Mobil 390×844, Test Manager: forfatterens mål (højde på chrome, nav ≥ 44, intet vandret) lod bjælkens PLACERING, knappens højde, navigationens tekster
      // og skjulningen af modstanderen/"Runde" overleve: bjælken skal stå fladt OVER navigationen (ikke bag den), knappen mindst 44 px, tekst under hvert ikon
      const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), mp = await mctx.newPage();
      await mp.goto(BASE + '/'); await mp.waitForSelector('body[data-klar="ja"]');
      await mp.click('#tab-taktik'); await mp.waitForSelector('.tabpane.tab-taktik');
      const m1 = await mp.evaluate(() => { const rc = (q) => document.querySelector(q).getBoundingClientRect(), bar = rc('#playbar'), nav = rc('#tabbar'), btn = rc('#play-bar #play-round'), disp = (q) => getComputedStyle(document.querySelector(q)).display, pb = document.getElementById('playbar');
        return { gap: Math.round((nav.top - bar.bottom) * 10) / 10, btnH: Math.round(btn.height), of: disp('.play-of'), opp: disp('.play-opp'), oppLink: disp('#play-bar #next-opponent'), btnCut: btn.width < document.querySelector('#play-bar #play-round').scrollWidth - 1, btnTxt: document.querySelector('#play-bar #play-round').textContent, barOver: pb.scrollWidth - pb.clientWidth, barH: Math.round(bar.height),
          labels: [...document.querySelectorAll('#tabs .tab')].map((b) => { const t = b.querySelector('.tab-txt').getBoundingClientRect(), i = b.querySelector('.tab-ico').getBoundingClientRect(); return [b.querySelector('.tab-txt').textContent.trim(), Math.round(t.width), t.top >= i.bottom - 1]; }) }; });
      check('390 px, Taktik: Spil-bjælken står FLADT over navigationen (ikke bag den), ▶-knappen er mindst 44 px, "af 14" er skjult, modstanderen står i KNAPPEN (Spilfører UI: 🔍 skjules – før blev navnet skåret ned til to bogstaver) uden at blive skåret, og bjælken løber ikke over',
        Math.abs(m1.gap) <= 1 && m1.btnH >= 44 && m1.of === 'none' && m1.opp !== 'none' && m1.oppLink === 'none' && !m1.btnCut && m1.barOver <= 0 && m1.barH <= 64, JSON.stringify(m1));
      check('390 px: hver navigationsknap har sin tekst UNDER ikonet (Hjem, Trup, Træning, Taktik, Kamp, Liga, Klub)', JSON.stringify(m1.labels.map((x) => x[0])) === JSON.stringify(['Hjem', 'Trup', 'Træning', 'Taktik', 'Kamp', 'Liga', 'Klub']) && m1.labels.every(([, w, under]) => w > 12 && under), JSON.stringify(m1.labels));
      // v3.29.1 (CI på main var rød: "Nordkysten BK (hjemme)" løb 20 px over – ligaens navne er tilfældige): et langt og et kort navn, hver gang.
      // Knappen må krympe, og KUN modstanderens navn forkortes med …; "▶ Spil runde N" står helt, og navnet beholder mindst 80 px (ikke to bogstaver)
      const longName = async (name) => { await mp.evaluate((name) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); for (const t of d.league.teams) if (t.isBot) t.name = name;
        localStorage.setItem('tactivar_save', JSON.stringify(d)); }, name);
        await mp.reload(); await mp.waitForSelector('body[data-klar="ja"]'); if (!(await mp.locator('.tabpane.tab-taktik').count())) { await mp.click('#tab-taktik'); await mp.waitForSelector('.tabpane.tab-taktik'); }
        return mp.evaluate(() => { const pb = document.getElementById('playbar'), btn = document.querySelector('#play-bar #play-round'), o = btn.querySelector('.play-opp'), r = document.createRange();
          r.setStart(btn.firstChild, 0); r.setEnd(btn.firstChild, btn.firstChild.length); const lab = r.getBoundingClientRect(), bb = btn.getBoundingClientRect(), ob = o.getBoundingClientRect();
          return { over: pb.scrollWidth - pb.clientWidth, label: btn.firstChild.textContent, labelIn: lab.left >= bb.left - 0.5 && lab.right <= ob.left + 0.5, oppW: Math.round(ob.width), oppCut: o.scrollWidth > o.clientWidth + 1, oppRight: ob.right <= bb.right + 0.5, txt: o.textContent,
          // Test Manager: mellemrummet før "·" (white-space: pre – med nowrap fjernes det, og "runde 1·" klistres sammen), "…" (text-overflow) og at gruppen står midt i knappen
          dotGap: (() => { const q = document.createRange(), i = o.firstChild.textContent.indexOf('·'); q.setStart(o.firstChild, i); q.setEnd(o.firstChild, i + 1); return Math.round((q.getBoundingClientRect().left - lab.right) * 10) / 10; })(),
          ell: getComputedStyle(o).textOverflow, clip: getComputedStyle(o).overflowX, off: Math.round(((lab.left - bb.left) - (bb.right - ob.right)) * 10) / 10 }; }); };
      const ln = await longName('Vestjyske Boldklub af 1902'), sn = await longName('AB');
      check('390 px, Taktik: et LANGT modstandernavn ("Vestjyske Boldklub af 1902") – bjælken løber ikke over, "▶ Spil runde N" står helt, og kun navnet forkortes (mindst 80 px) – et kort navn ("AB") forkortes ikke',
        ln.over <= 0 && ln.labelIn && /^▶ Spil runde \d+$/.test(ln.label) && ln.oppCut && ln.oppW >= 80 && ln.oppRight && /\((hjemme|ude)\)$/.test(ln.txt) && sn.over <= 0 && !sn.oppCut && sn.labelIn && /AB \((hjemme|ude)\)$/.test(sn.txt), JSON.stringify({ ln, sn }));
      check('390 px, Taktik: mellemrummet før "·" består (≥ 2 px mellem "▶ Spil runde N" og "·"; nowrap giver 0), det afkortede navn har "…" (text-overflow) og skjuler resten, og et kort navn står midt i knappen (tekst + navn lige langt fra kanterne)',
        ln.dotGap >= 2 && sn.dotGap >= 2 && ln.ell === 'ellipsis' && ln.clip === 'hidden' && Math.abs(sn.off) <= 2, JSON.stringify({ ln: [ln.dotGap, ln.ell, ln.clip, ln.off], sn: [sn.dotGap, sn.off] }));
      await mp.click('#tab-liga'); await mp.waitForSelector('.tabpane.tab-liga');
      // v3.31.1: Liga har Spil-bjælken som Taktik (før den lille ▶ "▶ R1" i topbaren) – fladt over navigationen, modstanderen i knappen
      const m2 = await mp.evaluate(() => { const bar = document.querySelector('#playbar').getBoundingClientRect(), nav = document.querySelector('#tabbar').getBoundingClientRect(), b = document.querySelector('#playbar #play-round');
        return { top: document.querySelector('.topbar').getBoundingClientRect().height, inTop: document.querySelectorAll('.topbar #play-round').length, gap: Math.round((nav.top - bar.bottom) * 10) / 10, of: getComputedStyle(document.querySelector('#playbar .play-of')).display, h: Math.round(b.getBoundingClientRect().height), label: b.firstChild.textContent, over: document.documentElement.scrollWidth - innerWidth }; });
      check('390 px, Liga: Spil-bjælken står fladt over navigationen med "▶ Spil runde 1" (≥ 44 px, "af 14" skjult) – intet ▶ i topbaren, der er én linje', m2.inTop === 0 && Math.abs(m2.gap) <= 1 && m2.of === 'none' && m2.h >= 44 && m2.label === '▶ Spil runde 1' && m2.top <= 56 && m2.over <= 0, JSON.stringify(m2));
      await mctx.close();
    }
    {
      // En fejl i en tegning EFTER en vellykket: fejlsiden fjerner det, den forrige tegning efterlod – Spil-bjælken (v3.31.1 på alle faner), ▶ og has-bar-polstringen
      const boom = async (start, next) => {
        const c = await browser.newContext({ viewport: { width: 1400, height: 1000 } }), pg = await c.newPage(); pg.on('pageerror', () => {});
        await pg.route('**/ui/matrix.js', async (route) => { const r = await route.fetch(); route.fulfill({ response: r, body: (await r.text()).replace('export function renderMatrix({ team, isOwn, ui, notes, onSort, onSelect, onSwap, onFilter, onBlocked }) {', "$&\n  if (window.__boom) throw new Error('boom');") }); });
        await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]');
        if (start !== 'hjem') { await pg.click(`#tab-${start}`); await pg.waitForSelector(`.tabpane.tab-${start}`); }
        const before = await pg.evaluate(() => ({ play: document.querySelectorAll('#play-round').length, bar: document.getElementById('playbar').children.length, has: document.body.classList.contains('has-bar') }));
        await pg.evaluate(() => { window.__boom = true; }); await pg.click(`#tab-${next}`); await pg.waitForSelector('#render-error');
        const after = await pg.evaluate(() => ({ play: document.querySelectorAll('#play-round').length, controls: [...document.querySelectorAll('#controls > *')].map((e) => e.id), bar: document.getElementById('playbar').children.length, has: document.body.classList.contains('has-bar') }));
        await c.close(); return { before, after }; };
      const fa = await boom('hjem', 'klub'), fb = await boom('trup', 'klub');
      check('Fejl i en tegning efter en vellykket: Spil-bjælken og has-bar er væk (Hjem før: bjælke + has-bar)', fa.before.bar === 1 && fa.before.has && fa.after.bar === 0 && !fa.after.has && fa.after.play === 0, JSON.stringify(fa));
      check('Fejl i en tegning efter en vellykket: topbaren har kun ⚙, ingen død ▶ og ingen bjælke (Trup før: Spil-bjælken + has-bar, v3.31.1)', fb.before.play === 1 && fb.before.bar === 1 && fb.before.has && JSON.stringify(fb.after.controls) === JSON.stringify(['tab-admin']) && fb.after.play === 0 && fb.after.bar === 0 && !fb.after.has, JSON.stringify(fb));
    }
    {
      // ⚙ "Se et andet hold" (reserven) vender tilbage til fanen, man kom fra, hvis den kan vise et andet hold – ellers Trup; scout-bjælken og desktop-topbaren
      const tp = await fresh();
      const tt = async (k) => { await tp.click(`#tab-${k}`); await tp.waitForSelector(`.tabpane.tab-${k}`); };
      const myName = await tp.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot).name);
      const viaGear = async (from, twice = false) => { await tt(from); await tp.click('#tab-admin'); await tp.waitForSelector('#admin'); if (twice) await tp.click('#tab-admin');
        const want = await tp.evaluate(() => { const o = [...document.querySelectorAll('#admin-team option')].find((x) => x.value === '2'); return o.textContent; });
        await tp.selectOption('#admin-team', '2'); await tp.waitForSelector('#scout-banner, .tabpane:not(.tab-admin)');
        const where = await tp.evaluate(() => document.querySelector('.tabpane').className.match(/tab-(\w+)/)[1]), banner = (await tp.locator('#scout-banner').count()) ? await tp.textContent('#scout-txt') : null;
        await tp.click('#scout-back').catch(() => {}); return { where, banner, want }; };
      const got = {};
      for (const [from, twice, key] of [['taktik', false, 'taktik'], ['klub', false, 'klub'], ['trup', false, 'trup'], ['liga', false, 'liga'], ['kamp', false, 'kamp'], ['hjem', false, 'hjem'], ['taktik', true, 'taktik2x']]) got[key] = await viaGear(from, twice);
      const want = { taktik: 'taktik', klub: 'klub', trup: 'trup', liga: 'trup', kamp: 'trup', hjem: 'trup', taktik2x: 'taktik' };
      check('⚙ "Se et andet hold": Taktik/Klub/Trup vender tilbage til samme fane, Liga/Kamp/Hjem lander i Trup, og et dobbelt ⚙-klik glemmer ikke fanen – altid med scout-bjælken for det valgte hold',
        Object.entries(want).every(([k, w]) => got[k].where === w && got[k].banner && got[k].banner.includes(got[k].want.replace('★ ', ''))), JSON.stringify(got));
      // scout-bjælken står kun på Trup/Taktik/Klub: et andet hold vist i Trup og så Kamp eller Liga → ingen bjælke; og Trup for dit eget hold har ingen "🔒 Skjult"
      await tt('liga'); await tp.selectOption('#team-select', '1'); await tp.waitForSelector('.tabpane.tab-trup');
      const hdr = { other: await tp.locator('#public-club-link').count(), txt: (await tp.textContent('.clubhead')).includes('🔒 Skjult') };
      await tt('kamp'); const onKamp = await tp.locator('#scout-banner').count(); await tt('liga'); const onLiga = await tp.locator('#scout-banner').count();
      check('Scout-bjælken står ikke på Kamp og Liga (selv om et andet hold er valgt), og Trup viser "🔒 Skjult" + offentlig klubside for et andet hold', onKamp === 0 && onLiga === 0 && hdr.other === 1 && hdr.txt);
      await tt('trup'); await tp.click('#scout-back');
      check('Trup for DIT hold: ingen "🔒 Skjult" og intet offentligt klublink – klubnavnet står, kassen står på Hjem', (await tp.locator('#public-club-link').count()) === 0 && !(await tp.textContent('.clubhead')).includes('Skjult') && (await tp.textContent('#club-name')) === myName);
      // scout-bjælken sidder fast UNDER den faste topbar (desktop): efter en rulning ned står den lige under topbaren, ikke bag den
      // v3.29.0: på Taktik og 600 px høj – modstanderens Trup er uden kortet ikke længere høj nok til at rulle (y var 0)
      await tt('liga'); await tp.selectOption('#team-select', '1'); await tp.waitForSelector('#scout-banner'); await tt('taktik'); await tp.setViewportSize({ width: 1400, height: 600 });
      await tp.evaluate(() => window.scrollTo(0, 700)); await tp.waitForTimeout(50);
      const pos = await tp.evaluate(() => ({ top: document.querySelector('.topbar').getBoundingClientRect().bottom, sc: document.querySelector('#scout-banner').getBoundingClientRect().top, y: window.scrollY }));
      check('Desktop: scout-bjælken er sticky lige under topbaren (ikke bag den og ikke et fast tal)', pos.y > 300 && Math.abs(pos.sc - pos.top) <= 1.5, JSON.stringify(pos));
      await tp.context().close();
    }
    {
      // Hjem → Kamp: din kamp står som nr. 3 af 4 (ikke først), så "Se kampen ›" skal åbne PRÆCIS den – og under afspilning er der kun den ene
      const tp = await fresh();
      const tt = async (k) => { await tp.click(`#tab-${k}`); await tp.waitForSelector(`.tabpane.tab-${k}`); };
      // kassen under afspilning er FØR runden (rundens linje er bogført, men ville afsløre resultatet) – efter fløjtet er den ændret
      await tt('hjem'); const cash0 = await tp.textContent('#club-link');
      await tp.click('#play-round'); await tp.waitForSelector('#skip'); await tt('hjem'); const cashPlaying = await tp.textContent('#club-link');
      await tt('kamp'); await tp.click('#skip'); await tp.waitForSelector('.to-home'); await tt('hjem'); const cashAfter = await tp.textContent('#club-link');
      check('Under afspilning står kassen på Hjem som FØR runden – efter fløjtet er den ændret', cashPlaying === cash0 && cashAfter !== cash0, `${cash0} | ${cashPlaying} | ${cashAfter}`);
      await tp.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), ms = d.league.lastRound.matches; [ms[0], ms[2]] = [ms[2], ms[0]]; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
      await tp.reload(); await tp.waitForSelector('body[data-klar="ja"]'); await tt('hjem');
      await tp.click('#home-kamp'); await tp.waitForSelector('.tabpane.tab-kamp');
      const act = await tp.evaluate(() => [...document.querySelectorAll('#match-cards .matchcard')].map((b) => b.classList.contains('active')));
      check('Hjem: "Se kampen ›" åbner Kamp med DIN kamp valgt (kort 3 af 4)', JSON.stringify(act) === JSON.stringify([false, false, true, false]), JSON.stringify(act));
      await tt('hjem'); await tp.click('#play-round'); await tp.waitForSelector('#skip'); await tt('hjem');
      await tp.click('#home-playing .linklike'); await tp.waitForSelector('.tabpane.tab-kamp');
      check('Hjem under afspilning: "Se kampen ›" åbner Kamp (ikke en rapport) – afspilningen kører stadig', (await tp.isVisible('#skip')) && (await tp.locator('#match-center').count()) === 1)
      check('Kamp under afspilning: ingen "Forbered ›"-linje endnu (den kommer efter fløjtet)', (await tp.locator('#to-home').count()) === 0 && (await tp.locator('#skip').count()) === 1);
      await tp.click('#skip'); await tp.waitForSelector('#to-home');
      check('Kamp efter fløjtet: "Forbered ›" står nu', (await tp.locator('#to-home').count()) === 1);
      await tp.context().close();
    }
  };
  // v3.29.0 (UI-ombygningen F2): spillerkortet står i et panel og skal åbnes – Trup: et klik på rækken; Taktik: ⓘ (aldrig et klik på rækken –
  // det er byt og ville forstyrre byt-testene). Uden pid: standardspilleren, som kortet viste før uden klik (dit hold: den 4. i truppen –
  // startvalget; et andet hold: den første). Venter, til kortet står i panelet.
  const openCardOn = async (pg, pid = null) => {
    const t = await pg.evaluate(() => document.querySelector('.tabpane')?.className.match(/tab-(\w+)/)?.[1]);
    if (pid == null) pid = await pg.evaluate(() => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, v = document.querySelector('#scout-banner #team-select')?.value;
      return v != null ? L.teams[Number(v)].squad[0].id : L.teams.find((x) => !x.isBot).squad[3].id; });
    if (t === 'trup') await pg.click(`#matrix tbody tr[data-pid="${pid}"]`);
    else {
      if (!(await pg.locator(`#lineup-list .lp-info[data-pid="${pid}"]`).count())) await pg.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();   // listen er filtreret til en anden kæde
      // TM: uden ⓘ kan kortet ikke åbnes på Taktik – et rødt tjek med forklaring i stedet for en 30 s timeout og en stak (kun ⓘ-mutationen faldt tidligere ikke pænt)
      if (!(await pg.locator(`#lineup-list .lp-info[data-pid="${pid}"]`).count())) { check('F2: ⓘ står på Taktik-listens række – ellers kan spillerkortet ikke åbnes dér (brugerens valg: klik = byt, ⓘ = kort)', false, `ingen .lp-info for ${pid}`); throw new Error('ⓘ mangler på Taktik-listen'); }
      await pg.click(`#lineup-list .lp-info[data-pid="${pid}"]`);
    }
    await pg.waitForSelector('#cardpanel[data-open="ja"] #player-card');
    return pid;
  };
  const f2 = async () => {
    // ---------- UI-ombygningen F2 (v3.29.0): spillerkortet som ét panel (#cardpanel) – kan køres alene med F2_ONLY=1 ----------
    // Brugerens valg 2026-11-02: på Taktik er et klik på din egen brik/række stadig byt – kortet åbnes med ⓘ; panelet kun på Trup og Taktik.
    const tp = await fresh();
    const tt = async (k) => { await tp.click(`#tab-${k}`); await tp.waitForSelector(`.tabpane.tab-${k}`); };
    const st = () => tp.evaluate(() => { const pc = document.getElementById('cardpanel'), a = document.activeElement;
      return { open: pc.dataset.open, hidden: pc.hidden, kids: pc.children.length, cards: document.querySelectorAll('#player-card').length, inApp: document.querySelectorAll('#app #player-card').length,
        title: document.getElementById('cp-title')?.textContent ?? null, act: a?.id || null, actPid: a?.dataset?.pid ?? null, actCls: a?.className ?? '', y: Math.round(scrollY) }; });
    const save = () => tp.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')));
    const mine = (d) => d.league.teams.find((t) => !t.isBot);
    const nm = (p) => `#${p.shirtNumber} ${p.name}`;
    const row = (pid) => tp.click(`#matrix tbody tr[data-pid="${pid}"]`);
    const marked = (sel) => tp.evaluate((s) => [...document.querySelectorAll(s)].map((r) => r.dataset.pid), sel);
    // (1) starter lukket – også når siden åbner direkte på Trup (ui.tab gemt): standardvalget (squad[3]) åbner IKKE panelet
    await tp.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); d.ui.tab = 'trup'; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
    await tp.reload(); await tp.waitForSelector('body[data-klar="ja"]');
    const s0 = await st();
    check('F2: panelet starter lukket – også når siden åbner på Trup (hidden, data-open="nej", intet kort)', (await tp.isVisible('.tabpane.tab-trup')) && s0.open === 'nej' && s0.hidden && s0.kids === 0 && s0.cards === 0
      && (await marked('#matrix tr.selected')).length === 0, JSON.stringify(s0));
    check('F2 Trup: hjælpelinjen over regnearket siger, at et valg åbner kortet (v3.32.1: "Vælg" – ikke "Klik")', (await tp.textContent('#trup-help')) === 'Vælg en spiller for at åbne spillerkortet');
    const P = mine(await save()).squad;
    // (2) Trup: et klik åbner – ét kort, i panelet; ✕ får fokus; rækken får omridset
    await row(P[5].id);
    const s1 = await st();
    check('F2 Trup: et klik på en række åbner panelet med netop ham – ét kort, i panelet og intet på siden; ✕ har fokus; kun hans række har omridset',
      s1.open === 'ja' && !s1.hidden && s1.cards === 1 && s1.inApp === 0 && s1.title === nm(P[5]) && (await tp.textContent('#card-title')) === nm(P[5]) && (await tp.getAttribute('#cardpanel', 'aria-labelledby')) === 'card-title'
      && s1.act === 'card-close' && s1.y === 0 && JSON.stringify(await marked('#matrix tr.selected')) === JSON.stringify([P[5].id]), JSON.stringify(s1));
    await row(P[6].id);
    const s1b = await st();
    check('F2 Trup: et klik på en anden række skifter spiller i det åbne panel (stadig ét kort)', s1b.open === 'ja' && s1b.cards === 1 && s1b.title === nm(P[6]) && JSON.stringify(await marked('#matrix tr.selected')) === JSON.stringify([P[6].id]), JSON.stringify(s1b));
    // (3) ✕ og Escape lukker – fokus tilbage på den række, der åbnede
    await tp.click('#card-close');
    const s2 = await st();
    check('F2: ✕ lukker – intet kort, fokus tilbage på rækken (fundet igen efter gentegningen), intet omrids', s2.open === 'nej' && s2.hidden && s2.kids === 0 && s2.cards === 0 && s2.actPid === P[6].id && (await marked('#matrix tr.selected')).length === 0, JSON.stringify(s2));
    await row(P[7].id); await tp.keyboard.press('Escape');
    const s3 = await st();
    check('F2: Escape lukker panelet – fokus tilbage på rækken', s3.open === 'nej' && s3.cards === 0 && s3.actPid === P[7].id, JSON.stringify(s3));
    await row(P[7].id); await tp.click('#note-input'); await tp.keyboard.press('Escape');
    check('F2: Escape lukker også med fokus i noten', (await st()).open === 'nej');
    // (4) noten beholder fokus under skrivning: samme felt (onNote tegner aldrig siden om), teksten står og er gemt
    await row(P[7].id); await tp.click('#note-input'); await tp.evaluate(() => { document.getElementById('note-input').__f2 = 1; });
    await tp.keyboard.type('Hurtig i ryggen');
    const nt = await tp.evaluate(() => { const a = document.activeElement; return { id: a.id, same: a.__f2 === 1, v: a.value }; });
    check('F2: noten i panelet beholder fokus under skrivning – samme felt (ingen gentegning), teksten står og er gemt', nt.id === 'note-input' && nt.same && nt.v === 'Hurtig i ryggen' && (await save()).notes[P[7].id] === 'Hurtig i ryggen', JSON.stringify(nt));
    // (5) fokus i panelet genskabes efter en gentegning (til salg = change → render)
    await tp.click('#list-toggle');
    const lf = await tp.evaluate(() => ({ id: document.activeElement.id, on: document.getElementById('list-toggle').checked }));
    check('F2: "Til salg" i panelet beholder fokus efter gentegningen (genskabt ud fra id)', lf.id === 'list-toggle' && lf.on && mine(await save()).listed.includes(P[7].id), JSON.stringify(lf));
    await tp.click('#list-toggle');   // tilbage
    // (6) rulningen: bevares ved gentegning og ved ◀ ▶ (samme åbning), nulstilles ved en ny åbning
    const room = await tp.evaluate(() => { const pc = document.getElementById('cardpanel'); return pc.scrollHeight - pc.clientHeight; });
    const top0 = Math.min(150, room - 120);   // lavt nok til, at næste spillers (kortere) kort også kan stå der
    await tp.evaluate((t) => { document.getElementById('cardpanel').scrollTop = t; document.getElementById('list-toggle').click(); }, top0);   // DOM-klik: Playwright ruller ellers selv
    const sc1 = await tp.evaluate(() => document.getElementById('cardpanel').scrollTop);
    await tp.evaluate(() => document.getElementById('list-toggle').click());
    await tp.evaluate(() => document.getElementById('card-next').click());
    const sc2 = await tp.evaluate(() => document.getElementById('cardpanel').scrollTop);
    await tp.click('#card-close'); await row(P[2].id);
    const sc3 = await tp.evaluate(() => document.getElementById('cardpanel').scrollTop);
    check('F2: panelets rulning står stille ved gentegning og ved ▶ (samme åbning) og starter øverst ved en ny åbning', top0 > 100 && Math.abs(sc1 - top0) <= 1 && Math.abs(sc2 - top0) <= 1 && sc3 === 0, JSON.stringify({ room, top0, sc1, sc2, sc3 }));
    // (7) ◀ ▶ på Trup: regnearkets aktuelle rækkefølge (sorteret på FIN), aldrig byt; fokus bliver på knappen
    await tp.click('#matrix thead th:nth-child(15)');
    const order = await tp.evaluate(() => [...document.querySelectorAll('#matrix tbody tr')].map((r) => r.dataset.pid));
    await tp.click('#card-close'); await row(order[0]);
    const prev0 = await tp.isDisabled('#card-prev');
    await tp.click('#card-next'); const t1 = (await st()).title, f1 = (await st()).act;
    await tp.click('#card-next'); await tp.click('#card-prev'); const t2 = (await st()).title;
    const byId = (id) => P.find((x) => x.id === id);
    check('F2 Trup: ◀ ▶ bladrer i regnearkets rækkefølge (sorteret på FIN) – ◀ slået fra på den første, fokus bliver på ▶', prev0 && t1 === nm(byId(order[1])) && t2 === nm(byId(order[1])) && f1 === 'card-next'
      && JSON.stringify(await marked('#matrix tr.selected')) === JSON.stringify([order[1]]), JSON.stringify({ prev0, t1, t2, f1 }));
    // (8) faneskift lukker: Trup → Taktik, og Trup → Liga → Trup (panelet må ikke dukke op igen)
    await tt('taktik');
    const s4 = await st();
    await tt('trup');
    const s5 = await st();
    await row(P[4].id); await tt('liga'); await tt('trup');
    const s6 = await st();
    check('F2: faneskift lukker – Trup → Taktik, tilbage til Trup og Trup → Liga → Trup: panelet dukker ikke op igen', [s4, s5, s6].every((x) => x.open === 'nej' && x.cards === 0), JSON.stringify([s4.open, s5.open, s6.open]));
    // (9) Taktik, dit hold: ⓘ på hver række; et klik på din egen brik åbner IKKE – det bytter som før
    await tt('taktik');
    const D1 = mine(await save()), slots0 = D1.tactics.lineupSlots.slice(), byP = (id) => D1.squad.find((x) => x.id === id);
    const info = await tp.evaluate(() => ({ rows: document.querySelectorAll('#lineup-list tr.lp-row').length, infos: [...document.querySelectorAll('#lineup-list tr.lp-row .lp-info')].map((b) => [b.dataset.pid, b.getAttribute('aria-label'), b.closest('tr').dataset.pid]),
      size: (({ width, height }) => [width, height])(document.querySelector('.lp-info')?.getBoundingClientRect() ?? { width: 0, height: 0 }), cell: document.querySelector('#lineup-list tr.lp-row td:nth-child(2) .lp-name').textContent, help: document.getElementById('list-help')?.textContent ?? '' }));
    check('F2 Taktik: ⓘ forrest i navnecellen på hver række (aria-label "Spillerkort: #nr Navn"), mindst 28 px – cellens tekst er stadig "#nr Navn", hjælpeteksten nævner ⓘ',
      info.rows === 18 && info.infos.length === 18 && info.infos.every(([pid, lbl, rp]) => pid === rp && lbl === `Spillerkort: #${byP(pid).shirtNumber} ${byP(pid).shortName}`) && info.size.every((x) => x >= 28) && /^#\d+ /.test(info.cell) && info.help.startsWith('ⓘ ved navnet = spillerkortet'), JSON.stringify({ ...info, infos: info.infos.length }));
    await tp.click('#pitch .token[data-slot="9"]');
    const s7 = await st();
    check('F2 Taktik: et klik på din egen brik åbner IKKE panelet – det starter et byt som før (beskeden ved listen)', s7.open === 'nej' && s7.cards === 0 && (await tp.textContent('#pick-msg')).includes(byP(slots0[9]).shortName), JSON.stringify(s7));
    await tp.click('#pitch .token[data-slot="9"]');   // fravælg
    await tp.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();   // brikken filtrerede listen til hans kæde
    // ⓘ åbner; derefter ændrer et klik på din egen brik eller række IKKE panelets spiller (byttet sker som før)
    await tp.click(`#lineup-list .lp-info[data-pid="${slots0[2]}"]`);
    const s8 = await st();
    check('F2 Taktik: ⓘ åbner panelet med netop ham (✕ har fokus, hans række har omridset)', s8.open === 'ja' && s8.cards === 1 && s8.inApp === 0 && s8.title === nm(byP(slots0[2])) && s8.act === 'card-close' && JSON.stringify(await marked('#lineup-list tr.carded')) === JSON.stringify([slots0[2]]), JSON.stringify(s8));
    await tp.click('#pitch .token[data-slot="5"]');
    const s9 = await st(), ppm = await tp.textContent('#panel-pick-msg').then((t) => t.replace(' – luk kortet (✕) for at vælge', '')).catch(() => 'mangler');
    check('F2 Taktik: åbent panel + klik på din egen brik → panelet viser stadig samme spiller, og byt-beskeden står også i panelets hoved', s9.open === 'ja' && s9.title === nm(byP(slots0[2])) && ppm.includes(byP(slots0[5]).shortName) && ppm === await tp.textContent('#pick-msg').then((t) => t.replace(' Se kort ›', '')), `${s9.title} | ${ppm}`);
    const benchPid = await tp.evaluate(() => document.querySelector('#bench tr.bench-p')?.dataset.pid);
    await tp.click(`#bench tr.bench-p[data-pid="${benchPid}"] td:first-child`);
    const s10 = await st(), slots1 = mine(await save()).tactics.lineupSlots;
    check('F2 Taktik: …og et klik på din egen række gennemfører byttet uden at skifte panelets spiller ("Se kort ›" væk, når byttet er gjort)', s10.title === nm(byP(slots0[2])) && slots1[5] === benchPid && (await tp.locator('#pick-card').count()) === 0, `${s10.title} | ${slots1[5]} ${benchPid}`);
    // (10) ⓘ under et byt: åbner kun kortet – byttet og beskeden står urørt (stopPropagation)
    const slotsA = slots1.slice();
    await tp.click('#pitch .token[data-slot="3"]');
    const bench2 = await tp.evaluate(() => document.querySelector('#bench tr.bench-p .lp-info')?.dataset.pid ?? [...document.querySelectorAll('#lineup-list tr.bench-p .lp-info')][0]?.dataset.pid);
    await tp.click(`#lineup-list .lp-info[data-pid="${bench2}"]`);
    const s11 = await st(), slots2 = mine(await save()).tactics.lineupSlots, pm11 = await tp.textContent('#pick-msg').catch(() => 'mangler');
    check('F2 Taktik: ⓘ midt i et byt åbner kun hans kort – opstillingen er uændret, og byt-beskeden står endnu', s11.title === nm(D1.squad.find((x) => x.id === bench2)) && slots2.join() === slotsA.join()
      && pm11.includes(D1.squad.find((x) => x.id === slotsA[3]).shortName) && (await tp.locator('#lineup-list tr.active').count()) === 1, `${s11.title} | ${pm11}`);
    // (11) "Se kort ›" i byt-beskeden åbner den valgte spiller
    const hasPickCard = (await tp.locator('#pick-card').count()) === 1;
    check('F2 Taktik: "Se kort ›" (#pick-card) står i byt-beskeden, mens et byt er i gang', hasPickCard);
    if (hasPickCard) await tp.click('#pick-card');
    check('F2 Taktik: "Se kort ›" i byt-beskeden viser den spiller, der er valgt til byttet – stadig intet byt', (await st()).title === nm(D1.squad.find((x) => x.id === slotsA[3])) && mine(await save()).tactics.lineupSlots.join() === slotsA.join());
    await tp.keyboard.press('Escape');
    check('F2 Taktik: Escape lukker panelet, men afbryder ikke byttet (beskeden og den valgte række står)', (await st()).open === 'nej' && (await tp.locator('#pick-msg').count()) === 1 && (await tp.locator('#lineup-list tr.active').count()) === 1);
    await tp.click('#pitch .token[data-slot="3"]');   // fravælg
    // (12) ◀ ▶ på Taktik: listens rækkefølge (start-11 i pladsernes orden …), bytter aldrig
    await tp.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();
    const D2 = mine(await save()), ids2 = await tp.evaluate(() => [...document.querySelectorAll('#lineup-list tr.lp-row')].map((r) => r.dataset.pid));
    await tp.click(`#lineup-list .lp-info[data-pid="${ids2[0]}"]`);
    const pv = await tp.isDisabled('#card-prev');
    await tp.click('#card-next');
    const s12 = await st();
    check('F2 Taktik: ▶ går til næste i listen (start-11 i pladsernes orden) – og bytter aldrig (opstillingen uændret, ingen byt-besked)', pv && ids2[0] === D2.tactics.lineupSlots[0] && s12.title === nm(D2.squad.find((x) => x.id === ids2[1]))
      && mine(await save()).tactics.lineupSlots.join() === D2.tactics.lineupSlots.join() && (await tp.locator('#pick-msg').count()) === 0, `${s12.title} | ${pv}`);
    // (13) v3.30.0: "Træner: X – ændr i Træning ›" er et link: 🏋️ Træning med HANS række markeret (kortet sætter ikke selv fokus)
    const hasLink = (await tp.locator('#cardpanel #card-train-link').count()) === 1;
    check('F2: "Træner: X – ændr i Træning ›" er et link (#card-train-link), ikke ren tekst – og kortet har intet fokusvalg', hasLink && (await tp.locator('#cardpanel #focus-select, #cardpanel select').count()) === 0);
    if (hasLink) await tp.click('#card-train-link');
    await soft(tp, '.tabpane.tab-traening');
    const s13 = await st(), sel13 = await tp.evaluate(() => [...document.querySelectorAll('#training-table tr.selected')].map((r) => r.dataset.pid));
    check('v3.30.0: "ændr i Træning ›" på kortet (Taktik) åbner Træning med præcis hans række markeret, panelet lukket og rækkens fokusvalg synligt',
      (await tp.isVisible('.tabpane.tab-traening')) && s13.open === 'nej' && JSON.stringify(sel13) === JSON.stringify([ids2[1]]) && (await tp.isVisible(`#training-table tr.selected[data-pid="${ids2[1]}"] select.train-focus`)), JSON.stringify({ s13, sel13, want: ids2[1] }));
    // TM: markeringen (view.trainPid) hænger ikke ved – forlader man Træning og kommer tilbage, er ingen række markeret
    await tt('trup'); await tt('traening');
    check('v3.30.0: efter et besøg på en anden fane er ingen række på Træning markeret (markeringen følger linket, ikke fanen)', (await tp.locator('#training-table tr.selected').count()) === 0 && (await tp.locator('#training-table tbody tr').count()) > 0);
    // TM: linket RULLER rækken frem (lavt vindue, sidste spiller i truppen) og beholder et filter, der allerede er hans kæde; et filter på en anden kæde
    // nulstilles (mutationer: scrollIntoView fjernet / "altid nulstil" var grønne). Et nyt filter-valg fjerner markeringen.
    { const LBL = { GK: 'MÅL', DEF: 'FOR', MID: 'MID', ATT: 'ANG' };
      const lastP = await tp.evaluate(() => { const q = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot).squad.at(-1); return { id: q.id, line: q.line }; });
      const viaLink = async (filterLbl) => { await tt('traening'); await tp.click(`#training .toolbar button:text-is("${filterLbl}")`); await tt('trup');
        await tp.click(`#matrix tbody tr[data-pid="${lastP.id}"]`); if (await tp.locator('#card-train-link').count()) await tp.click('#card-train-link'); await soft(tp, '.tabpane.tab-traening');
        return tp.evaluate((pid) => { const r = document.querySelector(`#training-table tr[data-pid="${pid}"]`)?.getBoundingClientRect();
          return { row: !!r, inView: !!r && r.top >= 0 && r.bottom <= innerHeight, active: document.querySelector('#training .toolbar button.active')?.textContent, rows: document.querySelectorAll('#training-table tbody tr').length, sel: document.querySelectorAll('#training-table tr.selected').length }; }, lastP.id); };
      const vp0 = tp.viewportSize();
      await tp.setViewportSize({ width: vp0.width, height: 500 });
      const v1 = await viaLink('Alle');
      check('v3.30.0: "ændr i Træning ›" for sidste mand i truppen ruller hans række ind i billedet (lavt vindue) og markerer den', v1.row && v1.inView && v1.sel === 1 && v1.active === 'Alle', JSON.stringify(v1));
      const v2 = await viaLink(LBL[lastP.line]);
      check('v3.30.0: står kortets spiller allerede i det valgte filter (hans egen kæde), bliver filteret stående – kun hans kæde vises', v2.row && v2.active === LBL[lastP.line] && v2.rows < 18 && v2.rows > 0 && v2.sel === 1, JSON.stringify(v2));
      const other = Object.values(LBL).find((l) => l !== LBL[lastP.line]);
      const v3 = await viaLink(other);
      check('v3.30.0: står han IKKE i det valgte filter, nulstilles det til "Alle" så hans række findes', v3.row && v3.active === 'Alle' && v3.rows === 18 && v3.sel === 1, JSON.stringify(v3));
      // TM: vælg HANS EGEN kæde – så hans række stadig er i listen; ellers skjules den af filteret, og "ingen markering" er sand uanset koden (mutation: view.trainPid = null i onLine fjernet var grøn)
      const viaOwn = await viaLink('Alle'); await tp.click(`#training .toolbar button:text-is("${LBL[lastP.line]}")`);
      const after = await tp.evaluate((pid) => ({ row: document.querySelectorAll(`#training-table tr[data-pid="${pid}"]`).length, sel: document.querySelectorAll('#training-table tr.selected').length }), lastP.id);
      check('v3.30.0: et nyt filter-valg fjerner markeringen af rækken fra linket – også når hans række stadig står i listen', viaOwn.sel === 1 && after.row === 1 && after.sel === 0, JSON.stringify({ viaOwn, after }));
      await tp.click('#training .toolbar button:text-is("Alle")');
      const cur = await tp.evaluate(() => getComputedStyle(document.querySelector('#training-table tbody tr')).cursor);
      await tt('trup'); const curM = await tp.evaluate(() => getComputedStyle(document.querySelector('#matrix tbody tr')).cursor); await tt('traening');
      check('v3.30.0: rækkerne på Træning er ikke klikbare (cursor: default) mens regnearkets rækker er (pointer) – et klik på en række gør intet her', cur === 'default' && curM === 'pointer', `${cur} / ${curM}`);
      await tp.setViewportSize(vp0); }
    // (14) 1400 px: fast til højre under topbaren, over Spil-bjælken, ingen vandret rulning; siden giver plads (listen/regnearket dækkes ikke)
    const geo = (sel) => tp.evaluate((s) => { const r = (q) => document.querySelector(q)?.getBoundingClientRect(), pc = r('#cardpanel'), bar = r('#playbar'), tb = r('.topbar'), sb = r('#scout-banner');
      return { l: pc.left, r: pc.right, w: pc.width, t: pc.top, b: pc.bottom, barTop: bar.height ? bar.top : innerHeight, tbB: tb.bottom, sbB: sb ? sb.bottom : null, sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, contR: (document.querySelector(s)?.closest('.tablewrap') ?? document.querySelector(s))?.getBoundingClientRect().right }; }, sel);   // regnearket: den synlige ramme (tabellen ruller vandret i den)
    await tt('trup'); await tp.click(`#matrix tbody tr[data-pid="${ids2[1]}"]`);   // v3.30.0: linket ovenfor landede på Træning (uden panel) – kortet åbnes i Trup
    const g1 = await geo('#matrix');
    await tt('taktik'); await tp.click(`#lineup-list .lp-info[data-pid="${ids2[4]}"]`);
    const g2 = await geo('#lineup-list');
    check('F2 1400 px: panelet står fast til højre (420 px) under topbaren og over Spil-bjælken, uden vandret rulning – regnearket (Trup) og listen (Taktik) står til venstre for det',
      [g1, g2].every((x) => Math.abs(x.r - 1400) < 1 && Math.abs(x.w - 420) < 1 && x.t >= x.tbB - 1 && x.b <= x.barTop + 1 && x.sw <= x.iw && x.contR <= x.l + 1) && g2.barTop < g2.ih, JSON.stringify({ g1, g2 }));
    // (15) et andet hold på Taktik: et klik på brik eller række åbner (der er intet byt); holdskift lukker – og panelet kommer ikke igen
    await tt('liga'); await tp.selectOption('#team-select', '1'); await tp.waitForSelector('.tabpane.tab-trup'); await tt('taktik');
    const O = (await save()).league.teams[1], oSlots = O.tactics.lineupSlots;
    await tp.click('#pitch .token[data-slot="4"]');
    const s15 = await st();
    await tp.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();
    await tp.click(`#lineup-list tr.lp-row[data-pid="${oSlots[6]}"] td:first-child`);
    const s16 = await st(), g3 = await geo('#lineup-list');
    check('F2 Taktik, et andet hold: et klik på hans brik åbner kortet, et klik på en række skifter (intet byt) – panelet står under scout-bjælken',
      s15.open === 'ja' && s15.title === nm(O.squad.find((x) => x.id === oSlots[4])) && s16.title === nm(O.squad.find((x) => x.id === oSlots[6])) && (await save()).league.teams[1].tactics.lineupSlots.join() === oSlots.join() && g3.t >= g3.sbB - 1, JSON.stringify({ s15: s15.title, s16: s16.title, t: g3.t, sb: g3.sbB }));
    await tt('trup'); await row(O.squad[2].id);
    await tp.selectOption('#scout-banner #team-select', '2'); await tp.waitForSelector('.tabpane.tab-trup');
    const s17 = await st();
    await tp.selectOption('#scout-banner #team-select', '1'); await tp.waitForSelector('.tabpane.tab-trup');
    const s18 = await st();
    await row(O.squad[2].id); await tp.click('#scout-back'); await tp.waitForSelector('.tabpane.tab-trup');
    const s19 = await st();
    check('F2: holdskift lukker (scout-bjælkens vælger og "← Dit hold") – data-open="nej", og tilbage på holdet dukker panelet ikke op igen', [s17, s18, s19].every((x) => x.open === 'nej' && x.cards === 0), JSON.stringify([s17.open, s18.open, s19.open]));
    // (16) vagten: ▶ Spil runde fra Taktik flytter fanen uden showTab – panelet vises ikke på Kamp
    await tt('taktik'); await tp.click(`#lineup-list .lp-info[data-pid="${ids2[1]}"]`);
    await tp.click('#play-bar #play-round'); await tp.waitForSelector('#match-center');
    const s20 = await st();
    check('F2: panelet vises kun på Trup og Taktik – ▶ Spil runde fra Taktik med åbent panel → Kamp uden panel', s20.open === 'nej' && s20.cards === 0, JSON.stringify(s20));
    await tp.click('#skip');
    await tp.context().close();
    // (17) en fejl i tegningen med åbent panel: fejlsiden tømmer og skjuler panelet (intet halvt kort ved siden af fejlsiden)
    {
      const c = await browser.newContext({ viewport: { width: 1400, height: 1000 } }), pg = await c.newPage(); pg.on('pageerror', () => {});
      await pg.route('**/ui/matrix.js', async (route) => { const r = await route.fetch(); route.fulfill({ response: r, body: (await r.text()).replace('export function renderMatrix({ team, isOwn, ui, notes, onSort, onSelect, onSwap, onFilter, onBlocked }) {', "$&\n  if (window.__boom) throw new Error('boom');") }); });
      await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]');
      await pg.click('#tab-trup'); await pg.waitForSelector('.tabpane.tab-trup'); await pg.locator('#matrix tbody tr').nth(1).click();
      const before = await pg.getAttribute('#cardpanel', 'data-open');
      await pg.evaluate(() => { window.__boom = true; }); await pg.evaluate(() => document.querySelector('#matrix tbody tr:nth-child(3)').click()); await pg.waitForSelector('#render-error');
      const after = await pg.evaluate(() => { const pc = document.getElementById('cardpanel'); return { open: pc.dataset.open, hidden: pc.hidden, kids: pc.children.length, body: document.body.classList.contains('card-open') }; });
      check('F2: en fejl i tegningen med åbent panel – fejlsiden tømmer og skjuler panelet', before === 'ja' && after.open === 'nej' && after.hidden && after.kids === 0 && !after.body, JSON.stringify({ before, after }));
      await c.close();
    }
    // (18) 768 px: et ark fra bunden over Spil-bjælken (højst 70 %), fuld bredde
    {
      const c = await browser.newContext({ viewport: { width: 768, height: 900 } }), pg = await c.newPage();
      await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]'); await pg.click('#tab-taktik'); await pg.waitForSelector('.tabpane.tab-taktik');
      await pg.locator('#lineup-list .lp-info').first().click(); await pg.waitForSelector('#cardpanel[data-open="ja"]');
      const m = await pg.evaluate(() => { const pc = document.getElementById('cardpanel').getBoundingClientRect(), bar = document.getElementById('playbar').getBoundingClientRect(); return { l: pc.left, r: pc.right, h: pc.height, b: pc.bottom, barTop: bar.top, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
      check('F2 768 px: arket står fra bunden i fuld bredde over Spil-bjælken, højst 70 % af højden, ingen vandret rulning', m.l === 0 && m.r === 768 && Math.abs(m.b - m.barTop) <= 1 && m.h <= m.ih * 0.7 + 1 && m.sw <= m.iw, JSON.stringify(m));
      await c.close();
    }
    // (19) 390 px: tryk på den øverste brik → "Se kort ›" står synligt over Spil-bjælken; arket over navigationen (hen over Spil-bjælken), højst 70 %,
    // ✕ ◀ ▶ og ⓘ mindst 44 px, ingen vandret rulning – og kortet ses uden at rulle siden (backlog nr. 5: før 3.400 px nede)
    {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 } }), pg = await c.newPage();
      await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]'); await pg.click('#tab-taktik'); await pg.waitForSelector('.tabpane.tab-taktik');
      const topSlot = await pg.evaluate(() => [...document.querySelectorAll('#pitch .token')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0].dataset.slot);
      await pg.click(`#pitch .token[data-slot="${topSlot}"]`);
      const lk = await pg.evaluate(() => { const r = document.getElementById('pick-card')?.getBoundingClientRect(), bar = document.getElementById('playbar').getBoundingClientRect(); return r ? { t: r.top, b: r.bottom, h: r.height, barTop: bar.top, y: scrollY, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id } : null; });
      check('F2 390 px: tryk på den øverste brik → "Se kort ›" står synligt over Spil-bjælken uden at rulle (backlog nr. 5)', !!lk && lk.t >= 0 && lk.b <= lk.barTop && lk.hit === 'pick-card' && lk.y === 0, JSON.stringify(lk));
      const who = await pg.evaluate((s) => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), p = me.squad.find((x) => x.id === me.tactics.lineupSlots[Number(s)]); return `#${p.shirtNumber} ${p.name}`; }, topSlot);
      await pg.click('#pick-card'); await pg.waitForSelector('#cardpanel[data-open="ja"]');
      const m = await pg.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(), pc = r('#cardpanel'), nav = r('#tabbar'), bar = r('#playbar'), card = r('#player-card');
        const sz = (q) => [r(q).width, r(q).height];
        return { b: pc.bottom, navTop: nav.top, h: pc.height, ih: innerHeight, l: pc.left, rr: pc.right, sw: document.documentElement.scrollWidth, iw: innerWidth, y: scrollY, cardTop: card.top,
          close: sz('#card-close'), prev: sz('#card-prev'), next: sz('#card-next'), info: sz('.lp-info'), barCovered: document.getElementById('cardpanel').contains(document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2)),
          title: document.getElementById('cp-title').textContent }; });
      check('F2 390 px: "Se kort ›" åbner arket med den valgte spiller – over navigationen (ikke bag den), hen over Spil-bjælken, højst 70 % af højden, ingen vandret rulning',
        m.title === who && m.b <= m.navTop + 0.5 && m.h <= m.ih * 0.7 + 1 && m.l === 0 && m.rr === 390 && m.sw <= m.iw && m.barCovered, JSON.stringify(m));
      check('F2 390 px: ✕, ◀, ▶ og ⓘ er mindst 44 × 44 px', [m.close, m.prev, m.next, m.info].every(([w, hh]) => w >= 44 && hh >= 44), JSON.stringify([m.close, m.prev, m.next, m.info]));
      check('F2 390 px: kortet ses uden at rulle siden (kortets top inden for skærmen; før 3.437 px nede)', m.y === 0 && m.cardTop >= 0 && m.cardTop < m.ih - 200, JSON.stringify({ y: m.y, cardTop: m.cardTop }));
      await pg.keyboard.press('Escape');
      await pg.click('#tab-trup'); await pg.waitForSelector('.tabpane.tab-trup');
      await pg.locator('#matrix tbody tr').nth(4).click(); await pg.waitForSelector('#cardpanel[data-open="ja"]');
      const t = await pg.evaluate(() => ({ y: scrollY, top: document.getElementById('player-card').getBoundingClientRect().top, ih: innerHeight }));
      check('F2 390 px, Trup: et tryk på en række åbner arket – siden ruller ikke (før: scrollIntoView ned til kortet under tabellen)', t.y === 0 && t.top > 0 && t.top < t.ih - 200, JSON.stringify(t));
      // v3.30.0: sat til salg → "💰 Til salg" efter navnet i hans række, helt synligt ved 390 px (inden for skærmen) – kun på ham
      const salePid = await pg.evaluate(() => document.querySelectorAll('#matrix tbody tr')[4].dataset.pid);
      await pg.click('#list-toggle'); await pg.keyboard.press('Escape');
      const sale = await pg.evaluate((pid) => { const tags = [...document.querySelectorAll('#matrix .listed-tag')], r = tags[0]?.getBoundingClientRect();
        return { n: tags.length, pid: tags[0]?.closest('tr').dataset.pid, txt: tags[0]?.textContent, title: tags[0]?.title, l: r?.left, rr: r?.right, w: r?.width, vis: tags[0] ? getComputedStyle(tags[0]).display : null }; }, salePid);
      check('390 px, Trup: "💰 Til salg" står efter navnet på netop den spiller, du satte til salg – synligt inden for skærmen',
        sale.n === 1 && sale.pid === salePid && sale.txt === '💰 Til salg' && sale.title === 'Sat til salg – andre klubber byder, når vinduet er åbent' && sale.vis !== 'none' && sale.w > 20 && sale.l >= 0 && sale.rr <= 390, JSON.stringify(sale));
      await c.close();
    }
  };
  const f2tm = async () => {
    // ---------- UI-ombygningen F2, Test Manager (v3.29.0): det forfatterens F2-blok lod overleve – kan køres alene med TM_F2_ONLY=1 ----------
    // Forfatterens tjek læste ◀ ▶ kun ét skridt fra listens start, Escape kun med tasten Escape (ikke isComposing/andre taster/"lukket"), fokus kun efter ✕ på
    // Trup, køb-kvitteringen kun i den fulde kørsel (og kun hvis noget kunne købes), og bredderne 768/1400/390 – ikke grænserne 600/601, 900/901, 1199/1200.
    // ◀ ▶ trykkes kun, når de er til – en mutation, der slår dem fra, skal give et rødt tjek (titlen er forkert), ikke en 30 s timeout
    const go = async (pg, id) => { if (!(await pg.isDisabled(id))) await pg.click(id); };
    const tt = async (pg, k) => { await pg.click(`#tab-${k}`); await pg.waitForSelector(`.tabpane.tab-${k}`); };
    const save = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')));
    const mine = (d) => d.league.teams.find((t) => !t.isBot);
    const nm = (p) => `#${p.shirtNumber} ${p.name}`;
    const title = (pg) => pg.evaluate(() => document.getElementById('cp-title')?.textContent ?? null);
    const act = (pg) => pg.evaluate(() => { const a = document.activeElement; return { id: a?.id || '', pid: a?.dataset?.pid ?? null, tag: a?.tagName ?? '', cls: a?.className ?? '', inPanel: !!a?.closest?.('#cardpanel'), inMatrix: !!a?.closest?.('#matrix') }; });
    const edit = async (pg, fn, arg = null) => { await pg.evaluate(({ src, arg }) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); new Function('d', 'arg', src)(d, arg); localStorage.setItem('tactivar_save', JSON.stringify(d)); }, { src: fn, arg }); await pg.reload(); await pg.waitForSelector('body[data-klar="ja"]'); };
    // (A) Trup: ▶ gennem HELE regnearkets rækkefølge, til den sidste (▶ slået fra), og ◀ hele vejen tilbage – aldrig tabt fokus, aldrig byt
    {
      const tp = await fresh();
      await tt(tp, 'trup');
      const order = await tp.evaluate(() => [...document.querySelectorAll('#matrix tbody tr')].map((r) => r.dataset.pid));
      const P = mine(await save(tp)).squad, by = (id) => P.find((x) => x.id === id), slots0 = mine(await save(tp)).tactics.lineupSlots.join();
      await tp.click(`#matrix tbody tr[data-pid="${order[0]}"]`);
      const seen = [await title(tp)];
      for (let i = 1; i < order.length; i++) { await go(tp, '#card-next'); seen.push(await title(tp)); }
      const lastState = { next: await tp.isDisabled('#card-next'), prev: await tp.isDisabled('#card-prev'), a: await act(tp), sel: await tp.evaluate(() => [...document.querySelectorAll('#matrix tr.selected')].map((r) => r.dataset.pid)) };
      check('F2 TM Trup: ▶ går gennem hele regnearkets rækkefølge (18 skridt) – ▶ er slået fra på den sidste, ◀ er til, og fokus er stadig i panelet (✕), ikke tabt til siden',
        JSON.stringify(seen) === JSON.stringify(order.map((id) => nm(by(id)))) && lastState.next && !lastState.prev && lastState.a.inPanel && lastState.a.id === 'card-close' && JSON.stringify(lastState.sel) === JSON.stringify([order[17]]), JSON.stringify({ seen: seen.length, lastState }));
      const back = [await title(tp)];
      for (let i = order.length - 2; i >= 0; i--) { await go(tp, '#card-prev'); back.push(await title(tp)); }
      const firstState = { prev: await tp.isDisabled('#card-prev'), next: await tp.isDisabled('#card-next'), a: await act(tp) };
      check('F2 TM Trup: ◀ går hele vejen tilbage til den første (◀ slået fra, fokus i panelet) – og ingen byt undervejs (opstillingen uændret)',
        JSON.stringify(back) === JSON.stringify(order.slice().reverse().map((id) => nm(by(id)))) && firstState.prev && !firstState.next && firstState.a.inPanel && mine(await save(tp)).tactics.lineupSlots.join() === slots0, JSON.stringify({ back: back.length, firstState }));
      // fokus tilbage: åbnet på række 3, bladret to skridt – ✕ giver fokus til regnearkets række (den, der åbnede), ikke til siden
      await tp.click('#card-close'); await tp.click(`#matrix tbody tr[data-pid="${order[2]}"]`); await go(tp, '#card-next'); await go(tp, '#card-next'); await tp.click('#card-close');
      const fa = await act(tp);
      check('F2 TM Trup: åbnet på en række og bladret med ▶ – ✕ lægger fokus på en række i regnearket (den, der åbnede), ikke på siden', fa.tag === 'TR' && fa.inMatrix && fa.pid === order[2], JSON.stringify(fa));
      // en spiller, filteret skjuler: panelet består, og ◀ ▶ bladrer i hele truppen (i regnearkets rækkefølge) i stedet for at dø
      const startIds = new Set(slots0.split(','));
      const benchPid = order.find((id) => !startIds.has(id)), bi = order.indexOf(benchPid);
      const tb = (t) => tp.locator('.panel:has(> .tablewrap > #matrix) > .toolbar button', { hasText: t }).first();
      await tp.click(`#matrix tbody tr[data-pid="${benchPid}"]`); await tb('Start-11').click();
      const hid = { open: await tp.getAttribute('#cardpanel', 'data-open'), rows: await tp.locator('#matrix tbody tr').count(), has: await tp.locator(`#matrix tbody tr[data-pid="${benchPid}"]`).count(), t: await title(tp) };
      await go(tp, '#card-next'); const tn = await title(tp);
      await tp.click('#card-close'); await tb('Alle').click(); await tp.click(`#matrix tbody tr[data-pid="${benchPid}"]`); await tb('Start-11').click();
      await go(tp, '#card-prev'); const tpv = await title(tp);
      check('F2 TM Trup: spilleren er skjult af filteret (Start-11) – panelet står, og ▶/◀ bladrer i hele truppen i regnearkets rækkefølge (næste/forrige i den ufiltrerede liste)',
        bi > 0 && hid.open === 'ja' && hid.rows === 11 && hid.has === 0 && hid.t === nm(by(benchPid)) && tn === nm(by(order[bi + 1])) && tpv === nm(by(order[bi - 1])), JSON.stringify({ hid, tn, tpv, want: [nm(by(order[bi + 1])), nm(by(order[bi - 1]))] }));
      // filteret SKAL følges, når spilleren står i det: Start-11 og en starter, hvis næste række i hele truppen er en bænkspiller → ▶ går til den næste STARTER
      await tp.click('#card-close'); await tb('Alle').click();
      // sorteret på navn (derefter andre kolonner, hvis starterne tilfældigvis stod samlet): starterne og bænken blandes, så næste STARTER ≠ næste række
      const isS = (id) => startIds.has(id);
      let ord2 = [], k = -1, nextS = null;
      for (const col of [2, 3, 15, 4, 5, 6, 7]) {
        await tb('Alle').click(); await tp.click(`#matrix thead th:nth-child(${col})`);
        ord2 = await tp.evaluate(() => [...document.querySelectorAll('#matrix tbody tr')].map((r) => r.dataset.pid));
        k = ord2.findIndex((id, i) => isS(id) && i + 1 < ord2.length && !isS(ord2[i + 1]) && ord2.slice(i + 2).some(isS)); if (k >= 0) { nextS = ord2.slice(k + 1).find(isS); break; }
      }
      if (k >= 0) { await tp.click(`#matrix tbody tr[data-pid="${ord2[k]}"]`); await tb('Start-11').click(); await go(tp, '#card-next'); }
      const tf = await title(tp);
      check('F2 TM Trup: med filteret Start-11 og en starter åben går ▶ til den næste starter i regnearket (springer bænken over) – ikke til næste række i hele truppen', k >= 0 && tf === nm(by(nextS)) && tf !== nm(by(ord2[k + 1])), JSON.stringify({ k, tf, want: nextS && nm(by(nextS)), unfiltered: k >= 0 && nm(by(ord2[k + 1])), flags: ord2.map((id) => (isS(id) ? 'S' : 'b')).join(''), n: ord2.length, same: JSON.stringify(ord2) === JSON.stringify(order) }));
      await tp.context().close();
    }
    // (B) Taktik: ▶ gennem start-11, bænk OG reserver (en 19. spiller lægges ind) – ◀ tilbage; filter-fallback; fokus tilbage til ⓘ
    {
      const tp = await fresh();
      await edit(tp, "const me = d.league.teams.find((t) => !t.isBot), o = d.league.teams.find((t) => t.isBot); const x = o.squad.pop(); x.id = 'plr_tm_res'; x.shirtNumber = 77; x.name = 'Rasmus Reserve'; x.shortName = 'R. Reserve'; me.squad.push(x); delete me.matchBench;");
      await tt(tp, 'taktik');
      await tp.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();
      const ids = await tp.evaluate(() => [...document.querySelectorAll('#lineup-list tr.lp-row')].map((r) => r.dataset.pid));
      const D = mine(await save(tp)), by = (id) => D.squad.find((x) => x.id === id), slots0 = D.tactics.lineupSlots.join();
      const sect = await tp.evaluate(() => ({ infos: document.querySelectorAll('#lineup-list tr.lp-row .lp-info').length, res: document.querySelectorAll('#lineup-list tr.reserve-p').length, bench: document.querySelectorAll('#lineup-list tr.bench-p').length, start: document.querySelectorAll('#lineup-list tr.start-p').length }));
      check('F2 TM Taktik: fixturet har alle tre sektioner (11 start-p, 7 bænk, 1 reserve), og ⓘ på alle 19 rækker – ellers måler ◀ ▶-testen under ingenting', sect.start === 11 && sect.bench === 7 && sect.res === 1 && sect.infos === 19 && ids.length === 19 && ids[18] === 'plr_tm_res', JSON.stringify(sect));
      await tp.click(`#lineup-list .lp-info[data-pid="${ids[0]}"]`);
      const seen = [await title(tp)];
      for (let i = 1; i < ids.length; i++) { await go(tp, '#card-next'); seen.push(await title(tp)); }
      const end = { next: await tp.isDisabled('#card-next'), prev: await tp.isDisabled('#card-prev'), a: await act(tp), carded: await tp.evaluate(() => [...document.querySelectorAll('#lineup-list tr.carded')].map((r) => r.dataset.pid)) };
      check('F2 TM Taktik: ▶ går gennem start-11, bænk og reserver i listens rækkefølge (19 skridt) – ▶ slået fra på reserven, fokus i panelet, og kun reserven har omridset',
        JSON.stringify(seen) === JSON.stringify(ids.map((id) => nm(by(id)))) && end.next && !end.prev && end.a.inPanel && JSON.stringify(end.carded) === JSON.stringify(['plr_tm_res']), JSON.stringify({ n: seen.length, end }));
      const back = [await title(tp)];
      for (let i = ids.length - 2; i >= 0; i--) { await go(tp, '#card-prev'); back.push(await title(tp)); }
      check('F2 TM Taktik: ◀ går hele vejen tilbage (◀ slået fra på den første) – og bytter aldrig (opstillingen uændret, ingen byt-besked)',
        JSON.stringify(back) === JSON.stringify(ids.slice().reverse().map((id) => nm(by(id)))) && (await tp.isDisabled('#card-prev')) && mine(await save(tp)).tactics.lineupSlots.join() === slots0 && (await tp.locator('#pick-msg').count()) === 0, JSON.stringify({ n: back.length }));
      // fokus tilbage til ⓘ (genfundet efter gentegningen), og omridset forsvinder ved lukning (også på siden)
      await tp.click('#card-close');
      await tp.click(`#lineup-list .lp-info[data-pid="${ids[3]}"]`);
      const ol = await tp.evaluate(() => { const r = document.querySelector('#lineup-list tr.carded'); return r ? { pid: r.dataset.pid, style: getComputedStyle(r).outlineStyle, w: getComputedStyle(r).outlineWidth } : null; });
      await tp.keyboard.press('Escape');
      const fx = await act(tp), carded0 = await tp.locator('#lineup-list tr.carded').count();
      check('F2 TM Taktik: den åbnede spillers række har et synligt omrids (solid, 1 px) – og efter Escape er omridset væk og fokus på hans ⓘ', ol && ol.pid === ids[3] && ol.style === 'solid' && ol.w === '1px' && carded0 === 0 && fx.cls.includes('lp-info') && fx.pid === ids[3], JSON.stringify({ ol, fx, carded0 }));
      // et klik på din egen række med panelet LUKKET åbner ikke panelet (kun byt)
      await tp.click(`#lineup-list tr.lp-row[data-pid="${ids[12]}"] td:first-child`);
      const own = { open: await tp.getAttribute('#cardpanel', 'data-open'), msg: await tp.locator('#pick-msg').count() };
      check('F2 TM Taktik: et klik på din egen række (panelet lukket) starter et byt og åbner ikke panelet', own.open === 'nej' && own.msg === 1, JSON.stringify(own));
      await tp.click(`#lineup-list tr.lp-row[data-pid="${ids[12]}"] td:first-child`);   // fravælg
      // "Se kort ›": lukker man bagefter, går fokus til ⓘ på den valgte (ikke tabt)
      await tp.click(`#pitch .token[data-slot="3"]`); await tp.click('#pick-card'); await tp.click('#card-close');
      const sk = await act(tp);
      check('F2 TM Taktik: "Se kort ›" → ✕ lægger fokus på den valgte spillers ⓘ', sk.cls.includes('lp-info') && sk.pid === D.tactics.lineupSlots[3], JSON.stringify(sk));
      await tp.click(`#pitch .token[data-slot="3"]`);   // fravælg
      // listen er filtreret til en anden kæde end panelets spiller → ◀ ▶ bladrer i den ufiltrerede liste (R1)
      await tp.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();
      const defPid = D.tactics.lineupSlots.find((id) => by(id).line === 'DEF'), attSlot = D.tactics.lineupSlots.findIndex((id) => by(id).line === 'ATT');
      await tp.click(`#lineup-list .lp-info[data-pid="${defPid}"]`);
      await tp.click(`#pitch .token[data-slot="${attSlot}"]`);   // brikken filtrerer listen til ANG og starter et byt
      const shown = await tp.evaluate(() => [...document.querySelectorAll('#lineup-list tr.lp-row')].length), di = ids.indexOf(defPid);
      await go(tp, '#card-next'); const t1 = await title(tp);
      await go(tp, '#card-prev'); await go(tp, '#card-prev'); const t2 = await title(tp);
      check('F2 TM Taktik: listen er filtreret til en anden kæde (ANG) end panelets spiller – ◀ ▶ bladrer alligevel i hele listen (næste/forrige i den ufiltrerede rækkefølge)', shown < 10 && t1 === nm(by(ids[di + 1])) && t2 === nm(by(ids[di - 1])), JSON.stringify({ shown, t1, t2, want: [nm(by(ids[di + 1])), nm(by(ids[di - 1]))] }));
      // listen filtreret til FOR og en forsvarer åben: ▶ fra den sidste startende forsvarer går til den første forsvarer på bænken (filtrerede liste), ikke til næste starter (midtbane)
      await tp.click(`#pitch .token[data-slot="${attSlot}"]`); await tp.click('#card-close');   // fravælg byttet og luk
      await tp.locator('#lineup-list .toolbar button', { hasText: 'FOR' }).click();
      const dIds = await tp.evaluate(() => [...document.querySelectorAll('#lineup-list tr.lp-row')].map((r) => r.dataset.pid)), nDef = D.tactics.lineupSlots.filter((id) => by(id).line === 'DEF').length;
      await tp.click(`#lineup-list .lp-info[data-pid="${dIds[nDef - 1]}"]`); await go(tp, '#card-next'); const tdn = await title(tp);
      const unf = ids[ids.indexOf(dIds[nDef - 1]) + 1];
      check('F2 TM Taktik: med listen filtreret til FOR går ▶ fra den sidste startende forsvarer til den første forsvarer på bænken (listens rækkefølge) – ikke til næste starter i hele listen', dIds.length > nDef && tdn === nm(by(dIds[nDef])) && dIds[nDef] !== unf, JSON.stringify({ tdn, want: nm(by(dIds[nDef])), unfiltered: nm(by(unf)), nDef, n: dIds.length }));
      await tp.context().close();
    }
    // (C) Escape: kun tasten Escape, ikke under tekstindtastning med IME (isComposing), og kun når panelet er åbent (en lukket side sluger ikke Escape)
    {
      const tp = await fresh();
      await tt(tp, 'trup');
      const key = (k, init = {}) => tp.evaluate(({ k, init }) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })), { k, init });
      const open = () => tp.getAttribute('#cardpanel', 'data-open');
      const closedFree = await key('Escape');   // lukket: dispatchEvent giver true, hvis ingen har kaldt preventDefault
      await tp.locator('#matrix tbody tr').nth(2).click();
      const r1 = await key('Escape', { isComposing: true }), o1 = await open();
      const r2 = await key('Enter'), o2 = await open();
      const r3 = await key('a'), o3 = await open();
      const r4 = await key('Escape'), o4 = await open();
      check('F2 TM Escape: en lukket side sluger ikke Escape (ikke afbrudt), IME-Escape (isComposing), Enter og et bogstav lader panelet stå – kun et rigtigt Escape lukker, og det afbrydes (preventDefault)',
        closedFree === true && o1 === 'ja' && r1 === true && o2 === 'ja' && r2 === true && o3 === 'ja' && r3 === true && o4 === 'nej' && r4 === false, JSON.stringify({ closedFree, o1, r1, o2, r2, o3, r3, o4, r4 }));
      await tp.context().close();
    }
    // (D) køb: kvitteringen står i panelet (ikke lukket tavst) – spilleren er ikke længere i holdet, så der er intet kort, kun kvitteringen og vejen til ham
    {
      const tp = await fresh();
      await edit(tp, "const me = d.league.teams.find((t) => !t.isBot); me.cashBalance += 80000000;");
      const pick = (skip) => tp.evaluate(async (skip) => { const { marketInfo } = await import('/engine/transfers.js'); const l = JSON.parse(localStorage.getItem('tactivar_save')).league, me = l.teams.find((t) => !t.isBot);
        for (const [i, t] of l.teams.entries()) if (t.isBot) for (const p of t.squad) { if (skip.includes(p.id)) continue; const m = marketInfo(l, me, t, p); if (!m.reason) return { i, id: p.id, shortName: p.shortName }; } return null; }, skip);
      const seeOther = async (i, tab) => { await tt(tp, 'liga'); await tp.selectOption('#team-select', String(i)); await tp.waitForSelector('.tabpane.tab-trup'); if (tab === 'taktik') await tt(tp, 'taktik'); };
      const receipt = (id) => tp.evaluate((id) => { const pc = document.getElementById('cardpanel'), a = document.activeElement, lab = pc.getAttribute('aria-labelledby');
        return { open: pc.dataset.open, title: document.getElementById('cp-title')?.textContent, cards: pc.querySelectorAll('#player-card').length, notice: document.getElementById('panel-notice')?.textContent ?? null,
          prevD: document.getElementById('card-prev')?.disabled, nextD: document.getElementById('card-next')?.disabled, lab, labText: document.getElementById(lab)?.textContent ?? null, body: document.body.classList.contains('card-open'),
          rowGone: !document.querySelector(`#matrix tr[data-pid="${id}"], #lineup-list tr[data-pid="${id}"]`), inPanel: !!a?.closest('#cardpanel'), toSquad: document.getElementById('panel-to-squad')?.textContent ?? null }; }, id);
      const b1 = await pick([]);
      check('F2 TM køb: fixturet har en spiller, der kan købes (ellers er kvitteringstesten tom)', !!b1, JSON.stringify(b1));
      await seeOther(b1.i, 'trup');
      await tp.click(`#matrix tbody tr[data-pid="${b1.id}"]`); await tp.click('#buy-player');
      const r1 = await receipt(b1.id), want = `💰 ${b1.shortName} er købt og står nu i din trup.`;
      check('F2 TM køb (Trup): kvitteringen står i panelet – "💰 Købt", teksten, intet kort, ingen ◀ ▶ (de ville ikke gøre noget), panelet navngivet af kvitteringen, fokus i panelet, spilleren væk fra den gamle trup og et link til ham',
        r1.open === 'ja' && r1.title === '💰 Købt' && r1.cards === 0 && r1.notice === want && r1.prevD === undefined && r1.nextD === undefined && r1.lab === 'cp-title' && r1.labText === '💰 Købt' && r1.body && r1.rowGone && r1.inPanel && r1.toSquad === `Se ${b1.shortName} i din trup ›`, JSON.stringify(r1));
      await tp.click('#panel-to-squad');
      const me1 = mine(await save(tp)).squad.find((x) => x.id === b1.id);
      const t1 = await tp.evaluate((id) => ({ trup: !!document.querySelector('.tabpane.tab-trup'), scout: document.querySelectorAll('#scout-banner').length, title: document.getElementById('cp-title')?.textContent, cards: document.querySelectorAll('#cardpanel #player-card').length,
        sel: [...document.querySelectorAll('#matrix tr.selected')].map((r) => r.dataset.pid), notice: document.querySelectorAll('#panel-notice').length, lab: document.getElementById('cardpanel').getAttribute('aria-labelledby'), a: document.activeElement.id, open: document.getElementById('cardpanel').dataset.open }), b1.id);
      check('F2 TM køb: "Se X i din trup ›" åbner Trup for DIT hold (ingen scout-bjælke) med panelet på netop ham – kortet, ikke kvitteringen, rækken markeret og ✕ i fokus',
        !!me1 && t1.trup && t1.scout === 0 && t1.open === 'ja' && t1.title === nm(me1) && t1.cards === 1 && JSON.stringify(t1.sel) === JSON.stringify([b1.id]) && t1.notice === 0 && t1.lab === 'card-title' && t1.a === 'card-close', JSON.stringify({ t1, want: me1 && nm(me1) }));
      await tp.keyboard.press('Escape');
      const f1 = await act(tp);
      check('F2 TM køb: Escape på kortet lukker, og fokus går til hans række i din trup (den, der åbnede)', (await tp.getAttribute('#cardpanel', 'data-open')) === 'nej' && f1.tag === 'TR' && f1.pid === b1.id, JSON.stringify(f1));
      // Taktik: samme flow; et klik på en anden spillers ⓘ bagefter erstatter kvitteringen med hans kort (og kvitteringen er væk)
      const b2 = await pick([b1.id]);
      check('F2 TM køb: fixturet har endnu en spiller, der kan købes (Taktik)', !!b2, JSON.stringify(b2));
      await seeOther(b2.i, 'taktik');
      if (!(await tp.locator(`#lineup-list .lp-info[data-pid="${b2.id}"]`).count())) await tp.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();
      await tp.click(`#lineup-list .lp-info[data-pid="${b2.id}"]`); await tp.click('#buy-player');
      const r2 = await receipt(b2.id);
      check('F2 TM køb (Taktik): samme kvittering i panelet – og et andet holds liste har ikke længere ham', r2.open === 'ja' && r2.title === '💰 Købt' && r2.cards === 0 && r2.notice === `💰 ${b2.shortName} er købt og står nu i din trup.` && r2.prevD === undefined && r2.nextD === undefined && r2.rowGone && r2.inPanel && r2.toSquad === `Se ${b2.shortName} i din trup ›`, JSON.stringify(r2));
      const other = await tp.evaluate(() => document.querySelector('#lineup-list .lp-info').dataset.pid);
      await tp.click(`#lineup-list .lp-info[data-pid="${other}"]`);
      const r3 = await receipt(other);
      const O = (await save(tp)).league.teams[b2.i].squad.find((x) => x.id === other);
      check('F2 TM køb: et klik på en anden spillers ⓘ erstatter kvitteringen med hans kort (ingen kvittering, ◀ ▶ virker igen)', r3.open === 'ja' && r3.title === nm(O) && r3.cards === 1 && r3.notice === null && r3.toSquad === null && r3.lab === 'card-title', JSON.stringify(r3));
      // "Se X i din trup ›" fra TAKTIK (et andet holds liste): fanen skifter til Trup og panelet står på ham dér (ikke et kort på Taktik)
      const b3 = await pick([b1.id, b2.id]);
      check('F2 TM køb: fixturet har en tredje spiller, der kan købes (Taktik → "Se X i din trup ›")', !!b3, JSON.stringify(b3));
      await seeOther(b3.i, 'taktik');
      if (!(await tp.locator(`#lineup-list .lp-info[data-pid="${b3.id}"]`).count())) await tp.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();
      await tp.click(`#lineup-list .lp-info[data-pid="${b3.id}"]`); await tp.click('#buy-player'); await tp.click('#panel-to-squad');
      const me3 = mine(await save(tp)).squad.find((x) => x.id === b3.id);
      const t3 = await tp.evaluate((id) => ({ trup: !!document.querySelector('.tabpane.tab-trup'), taktik: !!document.querySelector('.tabpane.tab-taktik'), scout: document.querySelectorAll('#scout-banner').length, title: document.getElementById('cp-title')?.textContent, cards: document.querySelectorAll('#cardpanel #player-card').length,
        sel: [...document.querySelectorAll('#matrix tr.selected')].map((r) => r.dataset.pid) }), b3.id);
      check('F2 TM køb: "Se X i din trup ›" fra et andet holds TAKTIK åbner Trup for dit hold med panelet på ham', !!me3 && t3.trup && !t3.taktik && t3.scout === 0 && t3.title === nm(me3) && t3.cards === 1 && JSON.stringify(t3.sel) === JSON.stringify([b3.id]), JSON.stringify({ t3, want: me3 && nm(me3) }));
      await tp.context().close();
    }
    // (E) bredderne: grænserne for side/ark (900/901), ark over navigationen (600/601), plads til panelet (1199/1200), panelets bredde og lag
    {
      const geo = (pg) => pg.evaluate(() => { const r = (q) => document.querySelector(q)?.getBoundingClientRect(), pcEl = document.getElementById('cardpanel'), pc = pcEl.getBoundingClientRect(), bar = r('#playbar'), nav = r('#tabbar'), tb = r('.topbar'), list = r('#lineup-list');
        const hit = (x, y) => pcEl.contains(document.elementFromPoint(x, y));
        return { l: pc.left, r: pc.right, w: pc.width, t: pc.top, b: pc.bottom, h: pc.height, barTop: bar.height ? bar.top : innerHeight, navTop: nav.top, tbB: tb.bottom, iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth,
          pr: parseFloat(getComputedStyle(document.querySelector('main')).paddingRight), listR: list?.right ?? null, cls: document.body.classList.contains('card-open'), over: getComputedStyle(pcEl).overscrollBehaviorY, ovy: getComputedStyle(pcEl).overflowY,
          hit: [hit(pc.left + pc.width / 2, pc.top + pc.height / 2), hit(pc.left + 8, pc.top + 8), hit(pc.right - 8, pc.bottom - 8)] }; });
      const at = async (w, h = 900) => { const c = await browser.newContext({ viewport: { width: w, height: h } }), pg = await c.newPage(); await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]'); await tt(pg, 'taktik');
        const closed = await geo(pg); await pg.evaluate(() => document.querySelector('#lineup-list .lp-info').click()); await pg.waitForSelector('#cardpanel[data-open="ja"] #player-card'); const open = await geo(pg); return { c, pg, closed, open }; };
      const W = {};
      for (const w of [1199, 1200, 1000, 901, 900, 601, 600]) { const x = await at(w); W[w] = x; }
      const o = (w) => W[w].open, cl = (w) => W[w].closed, near = (a, b, d = 1.5) => Math.abs(a - b) <= d;
      check('F2 TM 1200 px: siden giver plads – main har padding-right = panelets bredde (420) + 1 rem, listen står til venstre for panelet, og efter lukning er pladsen og body.card-open væk',
        near(o(1200).w, 420) && near(o(1200).pr, 436) && o(1200).listR <= o(1200).l + 1 && o(1200).cls && o(1200).sw <= o(1200).iw, JSON.stringify(o(1200)));
      await W[1200].pg.keyboard.press('Escape'); const after1200 = await geo(W[1200].pg);
      check('F2 TM 1200 px: efter lukning er main-padding og body.card-open som før', near(after1200.pr, cl(1200).pr) && !after1200.cls && cl(1200).pr < 100, JSON.stringify({ after: after1200.pr, before: cl(1200).pr, cls: after1200.cls }));
      check('F2 TM 1199 px: under 1200 gives der ikke plads (panelet 420 px står over listens højre kant – kendt) – main-padding uændret, men panelet er stadig en fast side til højre uden vandret rulning',
        near(o(1199).pr, cl(1199).pr) && near(o(1199).w, 420) && near(o(1199).r, 1199) && o(1199).sw <= o(1199).iw, JSON.stringify({ o: o(1199).pr, c: cl(1199).pr, w: o(1199).w }));
      check('F2 TM 1000 px: panelets bredde er 40 % af vinduet (400 px), fast til højre under topbaren og over Spil-bjælken', near(o(1000).w, 400) && near(o(1000).l, 600) && o(1000).t >= o(1000).tbB - 1 && o(1000).b <= o(1000).barTop + 1 && o(1000).sw <= o(1000).iw, JSON.stringify(o(1000)));
      check('F2 TM 901 px: stadig et sidepanel (ikke et ark) – højre kant 901, bredde 40 % (≈ 360), under topbaren', o(901).l > 400 && near(o(901).r, 901) && near(o(901).w, 360.4) && o(901).t >= o(901).tbB - 1, JSON.stringify(o(901)));
      check('F2 TM 900 px: arket – fuld bredde, højst 70 % af højden, bunden ved Spil-bjælken (601–900: over bjælken, ikke over navigationen)', o(900).l === 0 && o(900).r === 900 && o(900).h <= 900 * 0.7 + 1 && near(o(900).b, o(900).barTop) && o(900).t > o(900).tbB, JSON.stringify(o(900)));
      check('F2 TM 601 px: arket står over Spil-bjælken (bunden = bjælkens top), ikke bag navigationen – og navigationen er endnu i toppen', near(o(601).b, o(601).barTop) && o(601).navTop < 200, JSON.stringify(o(601)));
      check('F2 TM 600 px: navigationen står i bunden, og arket står OVER den (bunden ≤ navigationens top) – hen over Spil-bjælken', o(600).navTop > 600 && Math.abs(o(600).b - o(600).navTop) <= 0.6 && o(600).b > o(600).barTop - 1, JSON.stringify(o(600)));
      check('F2 TM lag og rulning ved alle bredder: intet ligger ovenpå panelet (midte og to hjørner rammer panelet), og det ruller selv uden at give rulningen videre (overflow-y auto, overscroll contain)',
        Object.keys(W).every((w) => o(w).hit.every(Boolean) && o(w).over === 'contain' && o(w).ovy === 'auto' && o(w).sw <= o(w).iw), JSON.stringify(Object.keys(W).map((w) => [w, o(w).hit, o(w).over, o(w).ovy])));
      // v3.31.1: Trup har også Spil-bjælken – arket står over den (601: bunden = bjælkens top) – eller over navigationen og hen over bjælken (600)
      for (const w of [601, 600]) { const pg = W[w].pg; await pg.keyboard.press('Escape'); await tt(pg, 'trup'); await pg.locator('#matrix tbody tr').nth(2).click(); await pg.waitForSelector('#cardpanel[data-open="ja"] #player-card'); W[w].trup = await geo(pg); }
      check('F2 TM Trup (med Spil-bjælke, v3.31.1): 601 px: arkets bund er bjælkens top (over skærmens bund); 600 px: navigationens top – hen over bjælken', near(W[601].trup.b, W[601].trup.barTop, 1) && W[601].trup.barTop < W[601].trup.ih - 20 && Math.abs(W[600].trup.b - W[600].trup.navTop) <= 0.6 && W[600].trup.navTop > 600 && W[600].trup.b > W[600].trup.barTop - 1, JSON.stringify({ a: [W[601].trup.b, W[601].trup.barTop, W[601].trup.ih], b: [W[600].trup.b, W[600].trup.navTop, W[600].trup.barTop] }));
      for (const w of Object.keys(W)) await W[w].c.close();
    }
    // (F) byt i gang på smal skærm: beskeden med "Se kort ›" er fastgjort over Spil-bjælken (≤ 900 px) – men står i listen på computer og efter byttet,
    // og arket lægger sig OVER den (beskeden dækker aldrig panelet)
    {
      const topTok = (pg) => pg.evaluate(() => [...document.querySelectorAll('#pitch .token')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0].dataset.slot);
      const msg = (pg) => pg.evaluate(() => { const m = document.getElementById('pick-msg'), c = document.getElementById('pick-card'); if (!m) return null; const mr = m.getBoundingClientRect(), cr = c?.getBoundingClientRect(), bar = document.getElementById('playbar').getBoundingClientRect(), nav = document.getElementById('tabbar').getBoundingClientRect();
        return { pos: getComputedStyle(m).position, live: m.classList.contains('pick-live'), cb: cr?.bottom ?? null, hit: cr ? document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2)?.id : null, mb: mr.bottom, mt: mr.top, barTop: bar.top, navTop: nav.top, ih: innerHeight }; });
      const ctx = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h } }), pg = await c.newPage(); await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]'); await tt(pg, 'taktik'); return { c, pg }; };
      // 768: fastgjort over Spil-bjælken
      { const { c, pg } = await ctx(768, 900); await pg.click(`#pitch .token[data-slot="${await topTok(pg)}"]`); const m = await msg(pg);
        check('F2 TM 768 px: byt i gang → beskeden med "Se kort ›" er fastgjort over Spil-bjælken (fixed, bunden ved bjælkens top − 6) og kan trykkes', m && m.live && m.pos === 'fixed' && m.mb <= m.barTop && m.mb >= m.barTop - 14 && m.hit === 'pick-card', JSON.stringify(m)); await c.close(); }
      // 1400: samme besked står i listen (ikke fastgjort)
      { const { c, pg } = await ctx(1400, 900); await pg.click(`#pitch .token[data-slot="${await topTok(pg)}"]`); const m = await msg(pg);
        check('F2 TM 1400 px: byt i gang → beskeden står i listen (ikke fixed) og kan trykkes', m && m.pos !== 'fixed' && m.hit === 'pick-card', JSON.stringify(m)); await c.close(); }
      // 390: fastgjort over Spil-bjælken, arket ovenpå, og efter byttet står kvitteringen i listen igen (ikke fastgjort, ikke pick-live)
      { const { c, pg } = await ctx(390, 844);
        await edit(pg, "const me = d.league.teams.find((t) => !t.isBot), o = d.league.teams.find((t) => t.isBot); const x = o.squad.pop(); x.id = 'plr_tm_res'; x.shirtNumber = 77; x.name = 'Rasmus Reserve'; x.shortName = 'R. Reserve'; me.squad.push(x); delete me.matchBench;"); await tt(pg, 'taktik');
        await pg.click(`#pitch .token[data-slot="${await topTok(pg)}"]`); const m = await msg(pg);
        check('F2 TM 390 px: byt i gang → beskeden er fastgjort over Spil-bjælken, som står over navigationen (bunden ≤ bjælkens top, bjælkens top ≤ navigationens top)', m && m.live && m.pos === 'fixed' && m.mb <= m.barTop && m.barTop <= m.navTop + 0.5 && m.hit === 'pick-card', JSON.stringify(m));
        await pg.evaluate(() => document.querySelector('#lineup-list tr.bench-p .lp-info').click()); await pg.waitForSelector('#cardpanel[data-open="ja"] #player-card');
        const cover = await pg.evaluate(() => { const r = document.getElementById('pick-msg').getBoundingClientRect(); return { inPanel: document.getElementById('cardpanel').contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)), pm: !!document.getElementById('panel-pick-msg') }; });
        check('F2 TM 390 px: med arket åbent under et byt dækker arket den fastgjorte besked (ikke omvendt), og beskeden står også i arkets hoved', cover.inPanel && cover.pm, JSON.stringify(cover));
        await pg.keyboard.press('Escape');
        // byttet gennemføres med en fremmed (reserven): samspillet skifter bånd, og 🤝-beskeden står bagefter – i listen, ikke fastgjort
        await pg.evaluate(() => [...document.querySelectorAll('#lineup-list .toolbar button')].find((b) => b.textContent === 'Alle').click());
        await pg.evaluate(() => document.querySelector('#lineup-list tr.reserve-p').click());
        const m2 = await msg(pg), txt = await pg.evaluate(() => document.getElementById('pick-msg')?.textContent ?? null);
        check('F2 TM 390 px: efter byttet står 🤝-beskeden i listen – ikke pick-live, ikke fastgjort, uden "Se kort ›" (kun mens et byt er i gang)', m2 && txt.startsWith('🤝') && !m2.live && m2.pos !== 'fixed' && m2.hit == null && (await pg.locator('#pick-card').count()) === 0, JSON.stringify({ m2, txt })); await c.close(); }
    }
    // (G) Trup: træningsoversigten har hele bredden (ingen kortkolonne); panelets hoved sidder fast øverst, når panelet rulles, og kortets egen overskrift er skjult (hovedet viser navnet)
    {
      const c = await browser.newContext({ viewport: { width: 1400, height: 700 } }), tp = await c.newPage(); await tp.goto(BASE + '/'); await tp.waitForSelector('body[data-klar="ja"]'); await tt(tp, 'traening');
      // v3.30.0: træningsoversigten står på sin egen fane – med fanens fulde bredde (ingen kortkolonne, intet kortpanel på Træning)
      const lay = await tp.evaluate(() => ({ w: document.getElementById('training').getBoundingClientRect().width, pw: document.querySelector('.tabpane').getBoundingClientRect().width }));
      check('F2 TM Træning: træningsoversigten har fanens hele bredde – ikke 2:3 ved siden af et kort', lay.w > 600 && Math.abs(lay.w - lay.pw) <= 2, JSON.stringify(lay));
      await tt(tp, 'trup');
      await tp.locator('#matrix tbody tr').nth(2).click();
      await tp.evaluate(() => { document.getElementById('cardpanel').scrollTop = 200; });
      const hd = await tp.evaluate(() => { const pc = document.getElementById('cardpanel'), h = document.querySelector('.cp-head').getBoundingClientRect(), t = document.getElementById('card-title').getBoundingClientRect(), cs = getComputedStyle(document.getElementById('card-title'));
        return { st: pc.scrollTop, headTop: h.top, panelTop: pc.getBoundingClientRect().top, closeHit: document.elementFromPoint(document.getElementById('card-close').getBoundingClientRect().left + 5, document.getElementById('card-close').getBoundingClientRect().top + 5)?.id, tw: t.width, th: t.height, pos: cs.position }; });
      check('F2 TM panelet: rullet 200 px sidder hovedet (✕ ◀ ▶) stadig øverst og kan trykkes; kortets egen h3 er skjult (1 × 1 px, absolut) – navnet står kun i hovedet',
        hd.st > 100 && Math.abs(hd.headTop - hd.panelTop) <= 1.5 && hd.closeHit === 'card-close' && hd.tw <= 2 && hd.th <= 2 && hd.pos === 'absolute', JSON.stringify(hd));
      await c.close();
    }
    // (R) Rollernes rettelser før merge (QC forbehold 1, Spilfører UI S1–S3): banens lilla ring følger panelet – byt i gang går forrest;
    // panelets kopi af byt-beskeden kun hvor listen er dækket (< 1200 px) og lukke-hintet kun på arket (≤ 900 px)
    {
      const tp = await fresh();
      const ring = () => tp.evaluate(() => [...document.querySelectorAll('#pitch .token.selected')].map((t) => t.dataset.slot));
      // et andet hold: klik brik 4 → ⓘ på plads 6 → ringen står på panelets nye spiller (før: blev på brik 4)
      await tt(tp, 'liga'); await tp.selectOption('#team-select', '1'); await tp.waitForSelector('#scout-banner'); await tt(tp, 'taktik');
      await tp.click('#pitch .token[data-slot="4"]');
      const r0 = await ring();
      const other = (await save(tp)).league.teams[1].tactics.lineupSlots;
      await tp.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();   // brikken filtrerede listen til hans kæde
      await tp.click(`#lineup-list .lp-info[data-pid="${other[6]}"]`);
      const r1 = await tp.evaluate(() => ({ nr: document.getElementById('cp-title').textContent.match(/^#(\d+)/)[1],
        ring: [...document.querySelectorAll('#pitch .token.selected')].map((x) => x.querySelector('.token-num').textContent) }));
      check('F2 roller: et andet hold – ringen står på brik 4 ved klikket og FØLGER panelet ved ⓘ på en anden (aldrig to lilla markeringer på to spillere)',
        JSON.stringify(r0) === '["4"]' && JSON.stringify(r1.ring) === JSON.stringify([r1.nr]), JSON.stringify({ r0, r1 }));
      // dit hold: byt i gang med A (brik 9) og ⓘ på B → ringen bliver på A (byttet går forrest); byttet afsluttet → ringen på panelets spiller
      await tp.click('#scout-back'); await tp.waitForSelector('#scout-banner', { state: 'detached' });
      if (!(await tp.locator('.tabpane.tab-taktik').count())) await tt(tp, 'taktik');
      const slots = mine(await save(tp)).tactics.lineupSlots;
      await tp.click('#pitch .token[data-slot="9"]');
      await tp.click(`#lineup-list .lp-info[data-pid="${slots[10]}"]`);   // brikken filtrerer listen til hans kæde – B er fra samme kæde
      const a1 = { ring: await ring(), title: await title(tp) };
      await tp.click('#pitch .token[data-slot="5"]');   // byttet 9 ⇄ 5 afsluttes
      const a2 = { ring: await ring(), title: await title(tp), swapped: mine(await save(tp)).tactics.lineupSlots[9] === slots[5] };
      check('F2 roller: dit hold – byt i gang med brik 9 og ⓘ på en anden: ringen bliver på 9 (byttet går forrest); efter byttet står ringen på panelets spiller (plads 10), ikke på den sidst klikkede brik',
        JSON.stringify(a1.ring) === '["9"]' && a1.title === nm(mine(await save(tp)).squad.find((x) => x.id === slots[10])) && a2.swapped && JSON.stringify(a2.ring) === '["10"]', JSON.stringify({ a1, a2 }));
      // panelets kopi af byt-beskeden: skjult ved 1400 (listen ses ved siden af), synlig med lukke-hint ved 390; hintet skjult ved 1000
      await tp.click('#pitch .token[data-slot="7"]');
      const vis = () => tp.evaluate(() => { const m = document.getElementById('panel-pick-msg'), hnt = m?.querySelector('.cp-close-hint'); return { m: !!m && m.offsetParent !== null, hint: !!hnt && hnt.offsetParent !== null, text: m?.innerText ?? null }; });
      const w1400 = await vis();
      await tp.setViewportSize({ width: 1000, height: 900 }); const w1000 = await vis();
      await tp.setViewportSize({ width: 390, height: 844 }); const w390 = await vis();
      check('F2 roller: panelets byt-besked er skjult ved 1400 (listens besked ses), vises uden lukke-hint ved 1000 og med "luk kortet (✕) for at vælge" ved 390',
        !w1400.m && w1000.m && !w1000.hint && w390.m && w390.hint && w390.text.includes('luk kortet (✕) for at vælge'), JSON.stringify({ w1400, w1000, w390 }));
      await tp.context().close();
    }
  };
  const f3 = async () => {
    // ---------- UI-ombygningen F3 (v3.31.0): Hjem-indhold og avisen ét sted – kan køres alene med F3_ONLY=1 ----------
    // Assertér på INDHOLDET (overskriften = Ligas #col-title, 👑 med netop de tal, seeren må se) og på det, der IKKE må stå (modstanderens
    // karakter, 📰/👑 under afspilning). Ved 1366 og 390.
    for (const [w, hgt] of [[1366, 900], [390, 844]]) {
      const c = await browser.newContext({ viewport: { width: w, height: hgt } }), p = await c.newPage();
      p.on('pageerror', (e) => fejl.push(e.message));
      const tt = async (k) => { await p.click(`#tab-${k}`); await p.waitForSelector(`.tabpane.tab-${k}`); };
      const reloadP = async () => { await p.reload(); await p.waitForSelector('body[data-klar="ja"]'); };
      await p.goto(BASE + '/'); await p.waitForSelector('body[data-klar="ja"]');
      const playX = () => p.evaluate(() => Math.round(document.querySelector('#play-bar #play-round').getBoundingClientRect().right));
      await tt('hjem'); const xH = await playX(); await tt('taktik'); const xT = await playX();
      check(`F3 ${w}: ▶ står samme sted i Spil-bjælken på Hjem (uden 🔍) og Taktik`, xH === xT && (await p.locator('#play-bar #next-opponent').count()) === 1, `${xH} | ${xT}`);
      await p.click('#play-round'); await p.waitForSelector('#skip');
      await tt('hjem');
      check(`F3 ${w}: under afspilning intet 📰-kort og intet 👑 på Hjem – næste kamp står`, (await p.locator('#home-paper, #home-motm').count()) === 0 && (await p.isVisible('#home-next')) && (await p.isVisible('#home-playing')));
      await tt('kamp');
      check(`F3 ${w}: under afspilning ingen 📰-link i Kamp`, (await p.locator('#kamp-paper-link').count()) === 0 && (await p.locator('#skip').count()) === 1);
      await p.click('#skip'); await soft(p, '#kamp-paper-link');
      await tt('liga');
      const title = await p.textContent('#col-title');
      const order = await p.evaluate(() => { const gz = document.getElementById('gazette'), st = document.getElementById('standings')?.closest('.panel'), lr = document.getElementById('last-round');
        return { next: !!gz && st?.nextElementSibling === gz, before: !!gz && !!lr && !!(gz.compareDocumentPosition(lr) & Node.DOCUMENT_POSITION_FOLLOWING), n: document.querySelectorAll('#gazette').length }; });
      check(`F3 ${w}: Liga – avisen (ét eksemplar) står lige under tabellen, før sidste runde`, order.next && order.before && order.n === 1, JSON.stringify(order));
      await tt('hjem');
      const head = await p.textContent('#home-paper-title').catch(() => 'mangler');
      const pos = await p.evaluate(() => { const pp = document.getElementById('home-paper'); return { main: !!pp?.parentElement?.classList.contains('home-main'), afterTodo: pp?.previousElementSibling?.id === 'home-todo', txt: pp?.textContent }; });
      { const ord = await p.evaluate(() => { const y = (id) => Math.round(document.getElementById(id)?.getBoundingClientRect().top ?? -1); return { last: y('home-last'), todo: y('home-todo'), next: y('home-next'), paper: y('home-paper') }; });
        check(`F3 ${w} (QC): rækkefølgen på Hjem – ${w < 900 ? 'én kolonne: næste kamp før avisen' : 'avisen i venstre kolonne under Før du spiller'}`,
          ord.last >= 0 && ord.todo > ord.last && ord.paper > ord.todo && (w < 900 ? ord.next > ord.todo && ord.paper > ord.next : ord.next < ord.todo), JSON.stringify(ord)); }
      check(`F3 ${w}: Hjems 📰-kort har netop klummens overskrift (= #col-title på Liga) og står i venstre kolonne efter "Før du spiller"`, head === title && title.length > 5 && pos.main && pos.afterTodo && pos.txt === `📰 Avisen${title}Læs hele avisen ›`, `${head} | ${title} | ${JSON.stringify(pos)}`);
      const landing = async (sel) => { await p.click(sel); await soft(p, '.tabpane.tab-liga'); await p.waitForTimeout(100);
        return p.evaluate(() => { const top = document.querySelector('.topbar').getBoundingClientRect().bottom, gz = document.querySelector('#gazette'), h3 = gz?.querySelector('h3')?.getBoundingClientRect(), ct = document.querySelector('#col-title')?.getBoundingClientRect();
          return { tab: document.querySelector('#tabs .tab.active')?.textContent.trim(), edge: Math.round(Math.max(0, top)), h3: h3 ? Math.round(h3.top) : null, ct: ct ? Math.round(ct.top) : null, vh: innerHeight, y: Math.round(scrollY) }; }); };
      const lands = (l) => l.tab?.includes('Liga') && l.y > 0 && l.h3 >= l.edge && l.h3 <= l.edge + 100 && l.ct > l.h3 && l.ct < l.vh / 2;
      const fromHome = await landing('#home-paper-link');
      check(`F3 ${w}: "Læs hele avisen ›" åbner Liga rullet til avisen – toppen lige under topbaren (ikke bag den), overskriften synlig`, lands(fromHome), JSON.stringify(fromHome));
      await tt('kamp');
      const kampLink = await p.textContent('#kamp-paper-link').catch(() => 'mangler'), kampGz = await p.locator('.tabpane.tab-kamp #gazette, .tabpane.tab-kamp #col-title').count();
      check(`F3 ${w}: Kamp efter fløjtet har INGEN avis (hverken #gazette eller klummens overskrift) – kun linket`, kampGz === 0 && kampLink !== 'mangler', `${kampGz} | ${kampLink}`);
      const fromKamp = await landing('#kamp-paper-link');
      check(`F3 ${w}: Kamps "📰 «${title.slice(0, 20)}…» ›" har netop overskriften og lander samme sted`, kampLink === `📰 «${title}» ›` && lands(fromKamp), `${kampLink} | ${JSON.stringify(fromKamp)}`);
      // 👑 kampens spiller: dit hold med karakteren, en modstander med holdnavn og UDEN tal (visibility.js) – sat i gemmet, så begge tilfælde prøves
      const setMotm = (own) => p.evaluate((own) => { const d = JSON.parse(localStorage.getItem('tactivar_save')), L = d.league, me = L.teams.find((t) => !t.isBot).id;
        const m = L.lastRound.matches.find((x) => x.homeId === me || x.awayId === me), mine = m.homeId === me ? m.ratings.home : m.ratings.away, theirs = m.homeId === me ? m.ratings.away : m.ratings.home;
        const e = (own ? mine : theirs).filter((x) => !x.red && typeof x.rating === 'number').sort((a, b) => b.rating - a.rating)[0];
        m.ratings.motm = e; localStorage.setItem('tactivar_save', JSON.stringify(d));
        return { nr: e.shirtNumber, name: e.shortName, team: e.teamName, r: e.rating.toFixed(1).replace('.', ',') }; }, own);
      const own = await setMotm(true); await reloadP(); await tt('hjem');
      const tOwn = await p.textContent('#home-motm').catch(() => 'mangler');
      check(`F3 ${w}: 👑 dit hold – "👑 Kampens spiller: #${own.nr} ${own.name} · karakter ${own.r}"`, tOwn === `👑 Kampens spiller: #${own.nr} ${own.name} · karakter ${own.r}`, tOwn);
      const opp = await setMotm(false); await reloadP(); await tt('hjem');
      const tOpp = await p.textContent('#home-motm').catch(() => 'mangler');
      check(`F3 ${w}: 👑 modstanderen – "#${opp.nr} ${opp.name} (${opp.team})" uden karakter (${opp.r}) eller "undefined"`, tOpp === `👑 Kampens spiller: #${opp.nr} ${opp.name} (${opp.team})` && !tOpp.includes('karakter') && !tOpp.includes(opp.r) && !tOpp.includes('undefined'), tOpp);
      await c.close();
    }
  };

  // ---------- UI-ombygningen F3, Test Manager (v3.31.0): det forfatterens F3-blok lod overleve – kan køres alene med TM_F3_ONLY=1 ----------
  // Pillernes FARVER (V grøn / T rød / U grå – ikke kun "tre forskellige"), overskriftens rækkefølge (klummens titel FØR den gamle avis),
  // "Rundens avis"-fallbacken, cachen på tværs af runder (en gammel klumme efter runde 2), kampens spiller fra MIN kamp (ikke den første)
  // og at Liga ikke har avisen under afspilning. Assertér på det, der IKKE må stå ("ZZZ", runde 1's overskrift) og på indholdet.
  const f3tm = async () => {
    const c = await browser.newContext({ viewport: { width: 1366, height: 900 } }), p = await c.newPage();
    p.on('pageerror', (e) => fejl.push(e.message));
    const tt = async (k) => { await p.click(`#tab-${k}`); await p.waitForSelector(`.tabpane.tab-${k}`); };
    const reloadP = async () => { await p.reload(); await p.waitForSelector('body[data-klar="ja"]'); };
    const setSave = async (fn) => { await p.evaluate((src) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); new Function('d', src)(d); localStorage.setItem('tactivar_save', JSON.stringify(d)); }, `(${fn.toString()})(d)`); };
    const play = async () => { await tt('hjem'); await p.click('#play-round'); await p.waitForSelector('#skip'); };
    await p.goto(BASE + '/'); await p.waitForSelector('body[data-klar="ja"]');

    // Pillernes farver (CSS): V grøn, T rød, U grå – bagrund og skrift (et V↔T-bytte eller U = V gør kun "tre forskellige farver" rødt, hvis det ikke er et bytte)
    const cols = await p.evaluate(() => { const out = {}; for (const k of ['V', 'U', 'T']) { const s = document.createElement('span'); s.className = `form-pill form-${k}`; s.textContent = k; document.body.append(s);
      const cs = getComputedStyle(s); out[k] = [cs.backgroundColor, cs.color].map((x) => x.match(/\d+/g).slice(0, 3).map(Number)); s.remove(); } return out; });
    const green = ([r, g, b]) => g - r >= 20 && g >= b, red = ([r, g, b]) => r - g >= 20 && r >= b, grey = (c) => !green(c) && !red(c);
    check('F3 TM: formpillernes farver – V grøn, T rød, U grå (bagrund og skrift hver for sig)', cols.V.every(green) && cols.T.every(red) && cols.U.every(grey), JSON.stringify(cols));

    // Runde 1 → runde 2 UDEN genindlæsning: overskriften må ikke være runde 1's (cachen er pr. lastRound-objekt)
    await play(); await p.click('#skip'); await soft(p, '#kamp-paper-link');
    await tt('liga'); const t1 = await p.textContent('#col-title');
    await play(); await p.click('#skip'); await soft(p, '#kamp-paper-link');
    const kamp2 = await p.textContent('#kamp-paper-link').catch(() => 'mangler');
    await tt('liga'); const t2live = await p.textContent('#col-title');
    await tt('hjem'); const h2live = await p.textContent('#home-paper-title').catch(() => 'mangler');
    await reloadP(); await tt('liga'); const t2fresh = await p.textContent('#col-title');
    check('F3 TM: efter runde 2 (uden genindlæsning) har Liga, Hjem og Kamp runde 2\'s overskrift – ikke runde 1\'s cachede', t1 !== t2fresh && t2live === t2fresh && h2live === t2fresh && kamp2 === `📰 «${t2fresh}» ›`, `r1: ${t1} | r2: ${t2fresh} | live: ${t2live} | ${h2live} | ${kamp2}`);

    // Overskriften = klummens titel, også når den gamle avis har en anden første overskrift (ellers vandt den gamle)
    await setSave((d) => { d.league.lastRound.gazette.headlines[0] = 'ZZZ gammel avisoverskrift'; });
    await reloadP(); await tt('liga'); const t3 = await p.textContent('#col-title'); await tt('hjem');
    const h3 = await p.textContent('#home-paper-title').catch(() => 'mangler'); await tt('kamp'); const k3 = await p.textContent('#kamp-paper-link').catch(() => 'mangler');
    check('F3 TM: Hjems og Kamps overskrift er klummens titel (= #col-title), ikke den gamle avis\' første overskrift', h3 === t3 && k3 === `📰 «${t3}» ›` && !h3.includes('ZZZ') && !k3.includes('ZZZ') && t3.length > 5, `${t3} | ${h3} | ${k3}`);

    // Kampens spiller fra MIN kamp – også når den ikke er den første (de andre kampe har en anden kampens spiller), og uanset om jeg er
    // hjemme eller ude: ejerskabet afgøres af motm.teamId = mit hold (ikke af hjemmeholdet) – kampen spejles (hjemme ↔ ude) i gemmet,
    // så begge sider prøves hver gang, ikke kun den, terningen gav (spejlingen sker én gang, før 3. kørsel). Dit hold: med karakteren; modstanderens: med holdnavn, uden tal.
    for (const mirror of [false, true]) for (const own of [true, false]) {
      await p.evaluate(([own, mirror, src]) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); new Function('d', 'own', 'mirror', src)(d, own, mirror); localStorage.setItem('tactivar_save', JSON.stringify(d)); window.__tmInfo = globalThis.__tm; }, [own, mirror && own, `
        const L = d.league, me = L.teams.find((t) => !t.isBot).id, ms = L.lastRound.matches;
        let i = ms.findIndex((x) => x.homeId === me || x.awayId === me); if (i === 0) { [ms[0], ms[1]] = [ms[1], ms[0]]; i = 1; }
        const ok = (x) => typeof x.rating === 'number' && !x.red, top = (a) => a.filter(ok).sort((x, y) => y.rating - x.rating)[0];
        const m = ms[i]; if (mirror) { for (const [a, b] of [['homeId', 'awayId'], ['homeName', 'awayName'], ['homeGoals', 'awayGoals']]) [m[a], m[b]] = [m[b], m[a]]; [m.ratings.home, m.ratings.away] = [m.ratings.away, m.ratings.home]; }
        const mineSide = m.homeId === me ? m.ratings.home : m.ratings.away, theirs = m.homeId === me ? m.ratings.away : m.ratings.home;
        ms.forEach((x, j) => { x.ratings.motm = j === i ? top(own ? mineSide : theirs) : top([...x.ratings.home, ...x.ratings.away]); });
        globalThis.__tm = { idx: i, home: m.homeId === me, others: ms.filter((x, j) => j !== i).map((x) => '#' + x.ratings.motm.shirtNumber + ' ' + x.ratings.motm.shortName), want: ms[i].ratings.motm };`]);
      const info = await p.evaluate(() => window.__tmInfo);
      const e = info.want, who = `#${e.shirtNumber} ${e.shortName}`, r = e.rating.toFixed(1).replace('.', ',');
      const want = own ? `👑 Kampens spiller: ${who} · karakter ${r}` : `👑 Kampens spiller: ${who} (${e.teamName})`;
      await reloadP(); await tt('hjem');
      const motm = await p.textContent('#home-motm').catch(() => 'mangler');
      check(`F3 TM: 👑 ${own ? 'mit hold' : 'modstanderen'}, jeg er ${info.home ? 'hjemme' : 'ude'}, min kamp er nr. ${info.idx + 1} (de andres: ${info.others.join(', ')}) – "${want}"`,
        info.idx > 0 && !info.others.includes(who) && motm === want && (own || !/karakter|\d,\d/.test(motm)), `${motm} | ${want}`);
    }

    // Liga under afspilning: ingen avis (hverken klumme eller gammel) – ville afsløre runden
    await play(); await tt('liga');
    check('F3 TM: Liga under afspilning har hverken #gazette eller #col-title (men tabellen og beskeden)', (await p.locator('#gazette, #col-title').count()) === 0 && (await p.locator('#standings').count()) === 1 && (await p.locator('#booked-league').count()) === 1);
    await tt('kamp'); await p.click('#skip'); await soft(p, '#kamp-paper-link'); await tt('liga');
    check('F3 TM: Liga efter afspilningen har avisen igen (præcis ét eksemplar)', (await p.locator('#gazette').count()) === 1 && (await p.locator('#col-title').count()) === 1);

    // "Rundens avis": klummen kan ikke bygges, og den gamle avis har ingen overskrifter → Hjem og Kamp falder til sidste udvej – aldrig tomt, "undefined" eller et skjult kort
    const fixtureV3120 = fs.readFileSync(new URL('../fixtures/save-v3.12.0.json', import.meta.url), 'utf8');
    const broken = JSON.parse(fixtureV3120); broken.league.lastRound.matches[0].goalsPool = 5; broken.league.lastRound.gazette.headlines = [];
    await p.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, JSON.stringify(broken));
    await reloadP(); await tt('hjem');
    const hf = await p.textContent('#home-paper-title').catch(() => 'mangler'), hcard = await p.textContent('#home-paper').catch(() => 'mangler'); await tt('kamp');
    const kf = await p.textContent('#kamp-paper-link').catch(() => 'mangler');
    check('F3 TM: uden klumme og uden gamle overskrifter står "Rundens avis" på Hjem og i Kamps link', hf === 'Rundens avis' && hcard === '📰 AvisenRundens avisLæs hele avisen ›' && kf === '📰 Rundens avis ›' && !/undefined|null/.test(hcard + kf), `${hf} | ${hcard} | ${kf}`);
    await p.evaluate(() => { const b = document.getElementById('fejlboks'); if (b) { b.hidden = true; b.textContent = ''; } });
    await c.close();
  };
  if (process.env.F2_ONLY) { await f2(); const bad = results.filter((x) => !x).length; console.log(bad ? `${bad} FEJLEDE` : 'bestod'); await browser.close(); server?.close(); process.exit(bad ? 1 : 0); }   // kun F2-blokken (kortpanelet – hurtig mutationskørsel)
  if (process.env.TM_V3320_ONLY) { await v3320tm(); const bad = results.filter((x) => !x).length; console.log(bad ? `${bad} FEJLEDE` : 'bestod'); console.log(fejl.join(' | ')); await browser.close(); server?.close(); process.exit(bad ? 1 : 0); }   // kun Test Managers v3.32.0-blok
  if (process.env.TM_V3312_ONLY) { await v3312tm(); const bad = results.filter((x) => !x).length; console.log(bad ? `${bad} FEJLEDE` : 'bestod'); console.log(fejl.join(' | ')); await browser.close(); server?.close(); process.exit(bad ? 1 : 0); }   // kun Test Managers v3.31.2-blok
  if (process.env.V3312_ONLY) { await v3312(); const bad = results.filter((x) => !x).length; console.log(bad ? `${bad} FEJLEDE` : 'bestod'); console.log(fejl.join(' | ')); await browser.close(); server?.close(); process.exit(bad ? 1 : 0); }   // kun v3.31.2-blokken
  if (process.env.V3311_ONLY) { await v3311(); await v3311tm(); const bad = results.filter((x) => !x).length; console.log(bad ? `${bad} FEJLEDE` : 'bestod'); await browser.close(); server?.close(); process.exit(bad ? 1 : 0); }   // kun v3.31.1-blokken (Spil-bjælken på alle faner – hurtig mutationskørsel)
  if (process.env.TM_F2_ONLY) { await f2tm(); const bad = results.filter((x) => !x).length; console.log(bad ? `${bad} FEJLEDE` : 'bestod'); await browser.close(); server?.close(); process.exit(bad ? 1 : 0); }   // kun F2-blokken (kortpanelet – hurtig mutationskørsel)
  if (process.env.TM_F3_ONLY) { await f3tm(); const bad = results.filter((x) => !x).length; console.log(bad ? `${bad} FEJLEDE` : 'bestod'); await browser.close(); server?.close(); process.exit(bad ? 1 : 0); }   // kun TM's F3-blok (hurtig mutationskørsel)
  if (process.env.F3_ONLY) { await f3(); const bad = results.filter((x) => !x).length; console.log(bad ? `${bad} FEJLEDE` : 'bestod'); await browser.close(); server?.close(); process.exit(bad ? 1 : 0); }   // kun F3-blokken (Hjem-indhold og avisen ét sted – hurtig mutationskørsel)
  if (process.env.TM_F1_ONLY) { await f1tm(); const bad = results.filter((x) => !x).length; console.log(bad ? `${bad} FEJLEDE` : 'bestod'); await browser.close(); server?.close(); process.exit(bad ? 1 : 0); }   // kun Test Managerens F1-blok (hurtig mutationskørsel)
  let g = await fresh();
  const openCard = (pid = null, pg = g) => openCardOn(pg, pid);
  const rows = () => g.locator('#matrix tbody tr').count();
  const tab = async (k) => { await g.click(`#tab-${k}`); await g.waitForSelector(`.tabpane.tab-${k}`); };
  // v3.32.1 (R3): Kamp-underfanerne efter fløjtet – 'replay' (afspilning & referat), 'stats', 'players'
  const pane = async (k, pg = g) => { await pg.click(`#mc-tab-${k}`); await pg.waitForSelector(`#mc-tab-${k}.active`); };
  // v3.28.0 (UI-ombygningen F1): holdvælgeren står kun på Liga og i scout-bjælken. Hjælperen vælger på Liga og vender tilbage til
  // fanen, testen stod på, hvis den kan vise et andet hold (Trup/Taktik/Klub) – ellers står man i Trup, som før fra Kamp/Liga/Admin.
  const seeTeam = async (i, pg = g) => {
    const cur = await pg.evaluate(() => document.querySelector('.tabpane')?.className.match(/tab-(\w+)/)?.[1]);
    await pg.click('#tab-liga'); await pg.waitForSelector('.tabpane.tab-liga');
    await pg.selectOption('#team-select', String(i)); await pg.waitForSelector('.tabpane.tab-trup');
    if (['taktik', 'klub'].includes(cur)) { await pg.click(`#tab-${cur}`); await pg.waitForSelector(`.tabpane.tab-${cur}`); }
  };
  check('F1/v3.30.0: syv faner (🏠 Hjem først, 🏋️ Træning efter Trup) og ⚙ som ikonknap i topbaren uden for fanerækken – Hjem er åben ved ny liga', (await g.locator('.topbar #tabs .tab').count()) === 7
    && JSON.stringify((await g.locator('#tabs .tab .tab-txt').allTextContents()).map((t) => t.trim())) === JSON.stringify(['Hjem', 'Trup', 'Træning', 'Taktik', 'Kamp', 'Liga', 'Klub'])
    && (await g.locator('.topbar #controls #tab-admin').count()) === 1 && (await g.locator('#tabs #tab-admin').count()) === 0 && (await g.textContent('#tabs .tab.active')).includes('Hjem') && (await g.isVisible('#home')));
  // v3.30.0: syv faner + klub + gem + ⚙ må ikke gå på to linjer – ved 1024, 768 og 601 px (før rettelsen: 601–690 px gav 129 px i stedet for 87)
  { await tab('trup'); const tops = {};
    for (const w of [1400, 1024, 768, 601]) { await g.setViewportSize({ width: w, height: 1000 }); await g.waitForTimeout(50);
      tops[w] = await g.evaluate(() => ({ h: Math.round(document.querySelector('.topbar').getBoundingClientRect().height), rows: new Set([...document.querySelectorAll('#tabs .tab')].map((t) => Math.round(t.getBoundingClientRect().top))).size })); }
    // CI's Chrome har bredere skrift end den lokale Chromium (CI: 601 px gav 2 rækker, lokalt 1) – efterlign det med letter-spacing, så testen
    // ikke afhænger af browserens skrift: fanerne skal krympe (… i teksten), ikke gå på to linjer og ikke give vandret rulning
    await g.setViewportSize({ width: 601, height: 1000 }); await g.waitForTimeout(50);
    const wide = await g.evaluate(() => { const st = document.createElement('style'); st.id = 'wide-font'; st.textContent = '.topbar .tab { letter-spacing: .12em; }'; document.head.append(st);
      const r = { h: Math.round(document.querySelector('.topbar').getBoundingClientRect().height), rows: new Set([...document.querySelectorAll('#tabs .tab')].map((t) => Math.round(t.getBoundingClientRect().top))).size, sw: document.documentElement.scrollWidth };
      st.remove(); return r; });
    await g.setViewportSize({ width: 1400, height: 1000 }); await tab('hjem');
    check('v3.30.0: topbaren står på samme højde med alle syv faner på én række ved 1400, 1024, 768 og 601 px', Object.values(tops).every((t) => t.rows === 1 && t.h === tops[1400].h && t.h <= 100), JSON.stringify(tops));
    check('v3.30.0 (CI): også med bredere skrift ved 601 px står fanerne på én række uden vandret rulning (før: 2 rækker, 129 px)', wide.rows === 1 && wide.h === tops[1400].h && wide.sw <= 601, JSON.stringify(wide)); }
  check('F1: topbaren har ingen holdvælger og intet ▶ på Hjem – knappen står i Spil-bjælken', (await g.locator('.topbar #team-select').count()) === 0 && (await g.locator('.topbar #play-round').count()) === 0 && (await g.isVisible('#playbar #play-bar #play-round')));
  // v3.31.1: Spil-bjælken på ALLE faner – på hver fane præcis ét #play-round, i bjælken, intet i topbaren (positiv tilstedeværelse pr. fane)
  { const where = {};
    for (const k of ['hjem', 'trup', 'traening', 'taktik', 'kamp', 'liga', 'klub', 'admin']) { await tab(k); where[k] = await g.evaluate(() => [document.querySelectorAll('#playbar #play-bar').length, document.querySelectorAll('.topbar #play-round').length, document.querySelectorAll('#play-round').length].join('')); }
    check('v3.31.1: Spil-bjælken på alle 8 faner (Hjem, Trup, Træning, Taktik, Kamp, Liga, Klub, ⚙) – intet ▶ i topbaren, altid ét #play-round', JSON.stringify(where) === JSON.stringify({ hjem: '101', trup: '101', traening: '101', taktik: '101', kamp: '101', liga: '101', klub: '101', admin: '101' }), JSON.stringify(where)); }
  await tab('trup');
  check('Ny liga: dit hold vises med 18 spillere', (await rows()) === 18);
  check('Ny liga: ingen "Nyt i kampene"-besked (den er til dem, der opdaterer et gammelt gem)', (await g.locator('#notice').count()) === 0);
  await tab('liga');
  check('Holdvælgeren (på Liga, "Se et hold") har 8 hold', (await g.locator('#see-team #team-select option').count()) === 8);
  // UI-ombygningen F0 (v3.27.1): højst 6 skriftstørrelser pr. fane (12/14/16/20/28 + 10 på brikkerne) – før 7–15 pr. fane
  // (node tools/measure-ui.mjs). Kun synlig tekst tæller.
  for (const k of ['hjem', 'trup', 'traening', 'taktik', 'liga', 'klub']) {
    await tab(k);
    const sizes = await g.evaluate(() => [...new Set([...document.querySelectorAll('body *')].filter((e) => e.offsetParent !== null
      && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => getComputedStyle(e).fontSize))]);
    check(`F0: ${k} bruger højst 6 skriftstørrelser fra skalaen`, sizes.length <= 6 && sizes.every((x) => ['10px', '12px', '14px', '16px', '20px', '28px'].includes(x)), sizes.join(' '));
  }
  // F0 (Test Manager): vagten ovenfor ser kun fire faner FØR første runde – Kamp (mest tekst: afspilning, referat, statistik,
  // karakterark, banegrafik) og Admin er ikke med, og 390 px (media query .topbar h1 / .tab) slet ikke. Her: alle seks faner, live
  // og efter en runde, på 1400 og 390 px. Højst 6 størrelser pr. fane og i alt, alle fra skalaen; 10 px KUN inde i banegrafikken
  // (.pitch/.minipitch/.rp-pitch) – ellers kunne en brødtekst sættes til 10 px uden at tælle eller listen bryde; body 14 px / linjehøjde 1,35.
  {
    const SKALA = ['10px', '12px', '14px', '16px', '20px', '28px'];
    const maal = (pg) => pg.evaluate(() => { const set = new Set(), graf = [];
      for (const e of document.querySelectorAll('body *')) {   // select/input har ingen tekstknude (kun <option>) – de måles for sig
        if (e.offsetParent === null || !([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.matches('select, input, textarea'))) continue;
        const s = getComputedStyle(e).fontSize; set.add(s);
        if (s === '10px' && !e.closest('.pitch, .minipitch, .rp-pitch')) graf.push(e.tagName.toLowerCase() + '.' + [...e.classList].join('.')); }
      // tallene på brikkerne ER 10 px (--fs-graf) – en --fs-graf sat til 12 px smelter ellers sammen med skalaen og ses ikke
      const brikker = [...document.querySelectorAll('.token-name, .rp-token, .mp-name')].filter((e) => e.offsetParent !== null).map((e) => getComputedStyle(e).fontSize);
      return { sizes: [...set], graf, brikker }; });
    check('F0: fejlboksen (.fejlboks, synlig efter den bevidste testfejl ovenfor) står i brødtekst-størrelse 14 px',
      (await page.isVisible('#fejlboks')) && (await page.evaluate(() => getComputedStyle(document.getElementById('fejlboks')).fontSize)) === '14px');
    const alle = new Set();
    for (const w of [1400, 390]) {
      const c = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 1000 } }), pg = await c.newPage();
      await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]');
      const body = await pg.evaluate(() => { const s = getComputedStyle(document.body); return [s.fontSize, s.lineHeight]; });
      check(`F0 ${w} px: brødtekst 14 px med linjehøjde 1,35 (18,9 px)`, body[0] === '14px' && body[1] === '18.9px', body.join(' / '));
      // RM v3.27.1: iOS zoomer ved fokus i felter under 16 px – på smal skærm er alle synlige felter 16 px (før F0 arvede de 16 px;
      // uden media-reglen ville de være 14 – og select.mini 12)
      if (w < 600) { await pg.click('#tab-taktik'); await pg.waitForSelector('.tabpane.tab-taktik');
        const felter = await pg.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter((e) => e.offsetParent !== null).map((e) => getComputedStyle(e).fontSize));
        check('F0 390 px: alle synlige felter (select/input) er 16 px – ingen iOS-zoom', felter.length >= 3 && felter.every((x) => x === '16px'), felter.length + ': ' + [...new Set(felter)].join(' ')); }
      const mal = async (navn) => { const m = await maal(pg); m.sizes.forEach((x) => alle.add(x));
        check(`F0 ${w} px ${navn}: højst 6 skriftstørrelser, alle fra skalaen, 10 px kun på banegrafikken`,
          m.sizes.length <= 6 && m.sizes.every((x) => SKALA.includes(x)) && m.graf.length === 0 && m.brikker.every((x) => x === '10px'), m.sizes.join(' ') + ' | 10px uden for banen: ' + m.graf.join(',')); };
      const t = async (k) => { await pg.click(`#tab-${k}`); await pg.waitForSelector(`.tabpane.tab-${k}`); };
      for (const k of ['trup', 'traening', 'taktik', 'liga', 'klub', 'admin']) { await t(k); await mal(k + ' (ny liga)'); }
      await t('liga'); const mit = await pg.inputValue('#team-select'); await pg.selectOption('#team-select', mit === '1' ? '2' : '1'); await pg.waitForSelector('.tabpane.tab-trup'); await pg.click('#matrix thead th:nth-child(15)');   // modstander: sortering på FIN afvises → .notice
      check(`F0 ${w} px: beskeden (.notice) står i brødtekst-størrelse 14 px`, (await pg.locator('#notice').count()) === 1 && (await pg.locator('#notice').evaluate((e) => getComputedStyle(e).fontSize)) === '14px');
      await mal('trup (modstander, med besked)'); await pg.selectOption('#scout-banner #team-select', mit);   // v3.28.0: holdvælgeren står på Liga og i scout-bjælken (TM: F0-blokken brugte den fra Trup og kastede)
      await pg.click('#play-round'); await pg.waitForSelector('#match-center'); await mal('kamp (live)');
      await pg.click('#skip'); await pg.waitForFunction(() => !document.querySelector('#skip') && document.querySelector('#match-center #mc-tabs'));
      for (const k of ['kamp', 'trup', 'traening', 'taktik', 'liga', 'klub', 'admin']) { await t(k); await mal(k + ' (efter runden)'); }
      // v3.32.1: Kamps andre underfaner (statistik, karakterark) måles også
      await t('kamp'); for (const k of ['stats', 'players']) { await pg.click(`#mc-tab-${k}`); await pg.waitForSelector(`#mc-tab-${k}.active`); await mal(`kamp – fanen ${k} (efter runden)`); }
      await c.close();
    }
    check('F0: hele appen (alle faner, begge bredder) bruger højst 6 skriftstørrelser – før 20', alle.size <= 6, [...alle].join(' '));
  }
  await tab('trup');
  const heads = (await g.locator('#matrix thead th').allTextContents()).map((t) => t.replace(/ [▲▼]$/, ''));
  check('Regnearkets kolonner i rækkefølge (Alder står hvor den skal)', JSON.stringify(heads.slice(0, 21)) === JSON.stringify(['Pos/#', 'Spiller', 'Kæde', 'Natur', 'Alder', 'Frisk/🚑', 'Højde', 'Spring', '✈ Luft', 'PAC', 'STA', 'STR', 'BAL', 'PAS', 'FIN', 'POS', 'INT', 'GK', 'Gns', '⭐ Vurd', '🧠 Mod']), heads.join('|'));
  const ownMoney = await g.evaluate(() => { const hs = [...document.querySelectorAll('#matrix thead th')].map((t) => t.textContent.replace(/ [▲▼]$/, '')); const i = hs.indexOf('💰 Værdi'); return { last: hs.slice(i, i + 2), cells: [...document.querySelectorAll('#matrix tbody tr')].map((tr) => [tr.children[i].textContent, tr.children[i + 1].textContent]) }; });
  check('Trup: værdi og løn pr. runde for dine spillere står i regnearket (v3.19.0)', JSON.stringify(ownMoney.last) === JSON.stringify(['💰 Værdi', 'Løn/rd']) && ownMoney.cells.length === 18 && ownMoney.cells.every(([v, w]) => /\d/.test(v) && /^\d{1,3}(\.\d{3})*$/.test(w)), JSON.stringify(ownMoney));
  const modCells = await g.locator('#matrix tbody td.modcell').allTextContents();
  check('Mod-kolonnen viser tre egne værdier, ingen % mod en modstander', modCells.length === 18 && modCells.every((t) => /^\d+ · \d+ · \d+$/.test(t)) && !(await g.textContent('body')).match(/mod-kunnen[^.)]*\d+\s*%|mod [A-ZÆØÅ][^:]*: \d+%/i), modCells[0]);
  await openCard();   // v3.29.0: kortet åbnes i panelet (før stod standardspilleren under regnearket uden klik)
  const used = await g.textContent('#counter-pool #counter-used');
  const usedN = Number(used.match(/Erfaring brugt: (\d+)\/100/)?.[1]);
  const shown = (await g.textContent('#player-card h3')).match(/^#(\d+)/)[1];
  const expectSum = await g.evaluate((nr) => { const t = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot); const p = t.squad.find((x) => String(x.shirtNumber) === nr); return p.counterTactics.vsPress + p.counterTactics.vsLowBlock + p.counterTactics.vsTrapLong; }, shown);
  check('Spillerkortet viser puljen: erfaring brugt = summen af de tre værdier /100, og hvad der sker, når den er fuld', usedN === expectSum && used.includes('glemmer'), `${used} (forventet ${expectSum})`);
  // v3.30.0: træningsfokus sættes KUN på 🏋️ Træning – kortet viser fokus og linker dertil (v3.18.0–v3.29.x: på kortet i Trup)
  const focusSaved = async () => g.evaluate((nr) => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot).squad.find((x) => String(x.shirtNumber) === nr).trainingFocus, shown);
  const shownId = await g.evaluate((nr) => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot).squad.find((x) => String(x.shirtNumber) === nr).id, shown);
  check('Træning: kortet i Trup har intet fokusvalg – "Træner: …" og linket "ændr i Træning ›"', (await g.locator('#cardpanel #focus-select, #cardpanel select').count()) === 0
    && (await g.textContent('#card-train-note')).startsWith('Træner: ') && (await g.textContent('#card-train-link')) === 'ændr i Træning ›');
  if (await g.locator('#card-train-link').count()) await g.click('#card-train-link'); await soft(g, '.tabpane.tab-traening');
  check('Træning: linket fra kortet i Trup åbner Træning med hans række markeret (og kun den)', JSON.stringify(await g.evaluate(() => [...document.querySelectorAll('#training-table tr.selected')].map((r) => r.dataset.pid))) === JSON.stringify([shownId]));
  await g.selectOption(`#training-table tr[data-pid="${shownId}"] select`, 'FINISH');
  const focusRow = await g.locator(`#training-table tr[data-pid="${shownId}"] select`).evaluate((el) => el.options[el.selectedIndex].text);
  await tab('trup'); await openCard(shownId);
  check('Træning: fokus valgt på Træning er gemt og står på kortet i Trup (med fremdriften)', focusRow === 'Afslutning' && (await focusSaved()) === 'FINISH' && (await g.textContent('#card-training')).includes('Træner: Afslutning') && /næste \+1 om ca\. \d+ runde|går langsomt \(mere end en sæson/.test(await g.textContent('#card-training')), focusRow);
  await tab('traening');
  await g.selectOption('#focus-many', 'REST');
  check('Træning: massehandlingen i oversigten sætter fokus for alle viste (18) – bekræftelsen står ved tabellen', (await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot).squad.filter((p) => p.trainingFocus === 'REST').length)) === 18 && (await g.textContent('#train-msg')).includes('18 spillere'));
  // TM: bekræftelsen (view.trainMsg) hører til besøget – efter et besøg på en anden fane står den ikke længere (mutation: nulstillingen i showTab fjernet var grøn)
  await tab('trup'); await tab('traening');
  check('Træning: massehandlingens bekræftelse er væk, når man kommer tilbage fra en anden fane (men fokus er stadig gemt)', (await g.locator('#train-msg').count()) === 0 && (await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot).squad.filter((p) => p.trainingFocus === 'REST').length)) === 18);
  await g.selectOption(`#training-table tr[data-pid="${shownId}"] select`, 'FINISH');
  await tab('trup'); await openCard(shownId);
  check('Spillerkortet viser 10 evne-barer (9 evner + Spring, v3.32.0) og luftduel-udregningen', (await g.locator('#player-card .bars .bar').count()) === 10 && (await g.locator('#player-card .bars .bar-label').allTextContents()).filter((t) => t === 'Spring').length === 1 && (await g.textContent('#aerial-breakdown')).includes('× 0,35'));
  // v3.8 (Test Manager): kortets overskrift viser spillerens EGEN naturlige position med fuld betegnelse
  // v3.31.1 (brugeren: danske positionskoder): parentesen er den korte form (DM, OM, ANG) – ikke CDM/CAM/ST
  const FULL_POS = { GK: 'Målmand', CB: 'Midtstopper (MS)', FB: 'Back/kantback (dybe kantpladser)', DM: 'Defensiv midtbane (DM)', CM: 'Central midtbane (CM)', WM: 'Kant (høje kantpladser)', AM: 'Offensiv midtbane (OM)', ST: 'Angriber (ANG)' };
  const shownPos = await g.evaluate((nr) => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot).squad.find((x) => String(x.shirtNumber) === nr).position, shown);
  const cardHead = await g.textContent('#player-card .card-head');
  check('Spillerkortet: kæde og naturlig position med fuld betegnelse (kun den ene)', cardHead.includes(` • ${FULL_POS[shownPos]} • `) && Object.values(FULL_POS).filter((t) => cardHead.includes(` • ${t} • `)).length === 1 && !cardHead.includes('(('), `${shownPos}: ${cardHead}`);
  // v3.19.0 (brugeren): banen og opstillingen er flyttet til Taktik – Trup er regneark, træning og kort
  check('Trup-fanen har regneark og spillerkortet (i panelet, ikke på siden) – men ikke banen, bænken, byt-knapper, taktikken eller træningsoversigten (v3.30.0: på Træning)', (await g.isVisible('#matrix')) && (await g.locator('#training-table, #training').count()) === 0 && (await g.isVisible('#cardpanel #player-card')) && (await g.locator('#app #player-card').count()) === 0 && (await g.locator('#pitch').count()) === 0 && (await g.locator('#bench').count()) === 0 && (await g.locator('#tactics').count()) === 0 && !(await g.locator('#matrix thead').textContent()).includes('Byt'));
  await tab('taktik');
  // v3.24.0 samspil: én streg pr. par, motoren læser (ikke angriberparret), alle "spillet sammen" ved start; legenden nævner det svageste par
  { const want = await g.evaluate(async () => { const m = await import('/engine/chemistry.js'), d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot);
      return { n: m.readPairs(me.tactics.baseFormation).length, all: m.neighbourPairs(me.tactics.baseFormation).length }; });
    const lines = await g.evaluate(() => [...document.querySelectorAll('#pitch #chem-lines line.chem')].map((l) => l.getAttribute('class')));
    check('Samspil: Taktik-banen har én streg pr. par, motoren læser (ikke angriberparret), alle "spillet sammen" ved start', lines.length === want.n && want.n < want.all && lines.every((c) => c.includes('chem-sammen')), JSON.stringify({ want, lines: lines.length }));
    check('Samspil: legenden under banen – ved start ingen advarsel (alle spillet sammen), hvad samspil gør, intet 0–100-tal', /^Alle par har spillet sig sammen\. Samspil hjælper opbygningen og forsvaret mod løb i ryggen/.test(await g.textContent('#chem-weakest')) && !/\d/.test((await g.textContent('#chem-legend')).replace(/#\d+/g, '')), await g.textContent('#chem-legend')); }
  // Et par spillet stærkt sammen: tyk streg, kortets bedste makker og salgslinjen nævner makkeren
  { const pair = await g.evaluate(async () => { const m = await import('/engine/chemistry.js'), d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), s = me.tactics.lineupSlots;
      const [i, j] = m.readPairs(me.tactics.baseFormation)[0]; me.chemistry[m.pairKey(s[i], s[j])] = [85, 0]; localStorage.setItem('tactivar_save', JSON.stringify(d));
      const by = (id) => me.squad.find((p) => p.id === id); return { a: by(s[i]), b: by(s[j]) }; });
    await g.reload(); await g.waitForSelector('body[data-klar="ja"]'); await tab('taktik');
    check('Samspil: et stærkt par får en tyk streg (chem-staerkt), resten er uændrede', (await g.locator('#pitch #chem-lines line.chem-staerkt').count()) === 1);
    // v3.24.2: legenden tæller de stærke par; Trup-panelet siger, hvilket par der blev stærkt i runden (navne fra truppen), og linker til Taktik
    { const nLines = await g.locator('#pitch #chem-lines line.chem').count();
      check('Samspil: legenden tæller de stærke par ("1 af N par spiller stærkt")', (await g.textContent('#chem-weakest')).includes(`Alle par har spillet sig sammen. 1 af ${nLines} par spiller stærkt.`), await g.textContent('#chem-weakest'));
      await g.evaluate((pr) => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot); d.league.trainingReport = { [me.id]: { round: d.league.leagueMetadata.round || 1, gains: [], injuries: [], strong: { up: [[pr.a.id, pr.b.id]], down: [] } } }; localStorage.setItem('tactivar_save', JSON.stringify(d)); }, pair);
      await g.reload(); await g.waitForSelector('body[data-klar="ja"]'); await tab('traening');
      const ts = await g.textContent('#training-strong').catch(() => '');
      check('Samspil: Træning-panelet (v3.30.0, før Trup) siger, at parret nu spiller stærkt sammen – med numre og navne – og linker til Taktik', ts.startsWith(`🤝 #${pair.a.shirtNumber} ${pair.a.shortName} og #${pair.b.shirtNumber} ${pair.b.shortName} spiller nu stærkt sammen.`) && ts.includes('se stregerne på Taktik'), ts);
      await g.locator('#training-strong button.linklike').click();
      check('Samspil: linket åbner Taktik med stregerne', (await g.locator('#pitch #chem-lines line.chem-staerkt').count()) === 1); }
    await tab('trup');
    await g.locator('#matrix tbody tr', { hasText: pair.a.shortName }).first().click();
    const best = await g.textContent('#card-best'), list = await g.textContent('#list-chem').catch(() => '');
    check('Samspil: spillerkortet viser den stærke makker, og salgslinjen siger at et salg bryder parret', best === `🤝 Bedste makker: #${pair.b.shirtNumber} ${pair.b.shortName} (samspil: stærkt)` && list.includes(`#${pair.b.shirtNumber} ${pair.b.shortName}`) && list.includes('et salg bryder parret'), best + ' | ' + list);
    // en anden klubs spiller: købelinjen ved prisen
    await seeTeam('1');
    const gk1 = await g.evaluate(() => { const t = JSON.parse(localStorage.getItem('tactivar_save')).league.teams[1]; return { gk: t.squad.find((x) => x.position === 'GK').id, out: t.squad.find((x) => x.position !== 'GK').id }; });
    await g.locator(`#matrix tbody tr[data-pid="${gk1.gk}"]`).click();
    check('Samspil: en anden klubs målmand – ingen købelinje om samspil (målmanden har ingen par)', (await g.locator('#buy-terms').count()) === 1 && (await g.locator('#buy-chem').count()) === 0);
    await g.locator(`#matrix tbody tr[data-pid="${gk1.out}"]`).click();
    check('Samspil: en anden klubs spiller – købeboksen siger "fremmed for alle – ca. 8 kampe"', (await g.textContent('#buy-chem')) === '🤝 Ny i truppen: fremmed for alle – ca. 8 kampe ved siden af de samme, før han har spillet sig ind.' && (await g.locator('#card-chem').count()) === 0);
    await seeTeam('0'); await tab('taktik'); }
  // v3.24.0 (Test Manager): samspillets LEDNINGER gennem appen – kendte værdier og EKSAKT tekst. Forfatterens tjek var grønne uden withChem
  // (byt-beskeden blev kun tjekket for "0 eller starter med 🤝"), uden Klub-linjerne og uden at stregernes klasse/position/tooltip blev læst.
  // Egen liga (fresh) pr. blok, så de ændrede par ikke smitter af på de senere tjek. Opstillingen er 4-4-2 (1 LB, 2–3 CB, 4 RB, 5 LM, 6–7 CM,
  // 8 RM, 9–10 ST), ligaens snit 78 og ALLE par på 78 ("spillet sammen"), bortset fra dem, scenariet nævner.
  {
    let p = await fresh();
    const ptab = async (k) => { await p.click(`#tab-${k}`); await p.waitForSelector(`.tabpane.tab-${k}`); };
    const benchIds = () => p.evaluate(() => { const me = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot); return [...document.querySelectorAll('#bench tr.bench-p')].map((r) => r.dataset.pid).filter((id) => me.squad.find((x) => x.id === id).position !== 'GK'); });
    const prep = async (body, arg = {}) => p.evaluate(async ({ body, arg }) => {
      const m = await import('/engine/chemistry.js'), d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot);
      me.tactics.baseFormation = '4-4-2'; d.league.leagueMetadata.chemRef = arg.ref ?? 78;
      const base = arg.base ?? 78;
      for (const k of Object.keys(me.chemistry)) me.chemistry[k] = [base, 0];
      for (const x of me.squad) for (const y of me.squad) if (x.id < y.id && x.position !== 'GK' && y.position !== 'GK') me.chemistry[m.pairKey(x.id, y.id)] ??= [base, 0];
      const s = me.tactics.lineupSlots, by = (id) => me.squad.find((x) => x.id === id), sh = (id) => `#${by(id).shirtNumber} ${by(id).shortName}`, set = (a, b, v) => { me.chemistry[m.pairKey(a, b)] = [v, 0]; };
      const out = await new (Object.getPrototypeOf(async () => {}).constructor)('m', 'd', 'me', 's', 'by', 'sh', 'set', 'arg', body)(m, d, me, s, by, sh, set, arg);
      localStorage.setItem('tactivar_save', JSON.stringify(d));
      return out;
    }, { body, arg });
    const reload = async (k = 'taktik') => { await p.reload(); await p.waitForSelector('body[data-klar="ja"]'); await ptab(k); };
    const msg = async () => ((await p.locator('#pick-msg').count()) ? p.textContent('#pick-msg') : '(ingen)');
    await ptab('taktik');
    // En bænkspiller X kommer ind på plads 2 (CB): ½-delen af tre par skifter bånd. Midtstopper-parret (2-3) og 2-6 falder to bånd, 1-2 ét; højst 2 vises, største fald først
    const swapBody = 'const x = arg.bench; set(x, s[3], 30); set(x, s[6], 30); set(x, s[1], 65); return { X: sh(x), s1: sh(s[1]), s6: sh(s[6]) };';
    let b0 = (await benchIds())[0];
    let info = await prep(swapBody, { bench: b0 }); await reload();
    await p.locator(`#bench tr.bench-p[data-pid="${b0}"]`).click(); await p.click('#pitch .token[data-slot="2"]');
    const want1 = `🤝 Midtstopper-parret: spillet sammen → fremmede · ${info.X} og ${info.s6}: spillet sammen → fremmede`;
    check('Samspil-byt: bænkspiller i listen → brik på banen – beskeden nævner de to største fald, største først, og ikke det tredje (finder hinanden)', (await msg()) === want1, `${await msg()} | ${want1}`);
    await reload(); b0 = (await benchIds())[0];
    info = await prep(swapBody, { bench: b0 }); await reload();
    await p.click('#pitch .token[data-slot="2"]'); await p.locator(`#bench tr.bench-p[data-pid="${b0}"]`).click();
    check('Samspil-byt: brik på banen → bænkspiller i listen giver samme besked (pickForSwap-vejen)', (await msg()) === `🤝 Midtstopper-parret: spillet sammen → fremmede · ${info.X} og ${info.s6}: spillet sammen → fremmede`, await msg());
    // Ligaens snit 84 og alle par på 84 (= "spillet sammen"); 62 er "finder hinanden" ved 84 – men ved snit 78 var 84 "stærkt" og beskeden "stærkt → finder hinanden" (withChem skal bruge ligaens snit)
    info = await prep('set(s[1], s[3], 62); return { a: sh(s[1]), b: sh(s[3]) };', { ref: 84, base: 84 }); await reload();
    await p.click('#pitch .token[data-slot="2"]'); await p.click('#pitch .token[data-slot="3"]');
    check('Samspil-byt: to brikker på banen byttet (ligaens snit 84) → ét par skifter bånd, og beskeden nævner kun det', (await msg()) === `🤝 ${info.a} og ${info.b}: spillet sammen → finder hinanden`, `${await msg()} | ${info.a} / ${info.b}`);
    // Formation, plan og "Stil op efter position" flytter spillerne rundt – beskeden er den samme, som swapChanges giver for før/efter (forventningen regnes fra det GEMTE før og efter)
    const misplace = 'const a = s[1], b = s[9]; s[1] = b; s[9] = a; for (const o of me.squad) if (o.position !== "GK") { if (o.id !== a) set(a, o.id, 30); if (o.id !== a && o.id !== b) set(b, o.id, 86); } set(a, b, 30); if (arg.preset) { me.tacticPresets[1] = structuredClone(me.tactics); me.tacticPresets[1].baseFormation = "4-3-3"; } return 1;';
    for (const [kind, act] of [['"Stil op efter position"', () => p.click('#arrange-lineup')], ['formationsskift 4-4-2 → 4-3-3', () => p.selectOption('#formation', '4-3-3')], ['Plan B (4-3-3)', () => p.locator('.presets button', { hasText: 'Plan B' }).click()]]) {
      p = await fresh(); await ptab('taktik');   // ny liga pr. scenarie: opstillingen står, som den er genereret
      await prep(misplace, { preset: kind.startsWith('Plan') }); await reload();
      const before = await p.evaluate(() => localStorage.getItem('tactivar_save'));
      await act();
      const res = await p.evaluate(async (b) => { const m = await import('/engine/chemistry.js'), ref = 78, pick = (raw) => JSON.parse(raw).league.teams.find((t) => !t.isBot);
        return { exp: m.swapChanges(m.lineupPairs(pick(b), ref), m.lineupPairs(pick(localStorage.getItem('tactivar_save')), ref)), slots: pick(localStorage.getItem('tactivar_save')).tactics.lineupSlots.join() !== pick(b).tactics.lineupSlots.join() }; }, before);
      check(`Samspil-byt: ${kind} – spillerne flytter, og beskeden ved listen er præcis de par, hvis bånd skiftede (forventet ud fra det gemte før og efter)`, res.slots && res.exp.length > 0 && (await msg()) === `🤝 ${res.exp.join(' · ')}`, `${await msg()} | ${JSON.stringify(res)}`);
    }
    // Stregerne, legenden, tooltip og kortet med kendte bånd: 2-3 fremmede, 1-2 finder hinanden, 6-7 stærkt, resten spillet sammen
    info = await prep('set(s[2], s[3], 30); set(s[1], s[2], 65); set(s[6], s[7], 90); return { s: s.slice(), p1: sh(s[1]), p2: sh(s[2]), p3: sh(s[3]), p4: sh(s[4]), p6: sh(s[6]), p7: sh(s[7]) };'); await reload();
    const lines = await p.evaluate(() => [...document.querySelectorAll('#pitch #chem-lines line.chem')].map((l) => ({ pair: l.dataset.pair, cls: l.getAttribute('class'), x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2') })));
    const pos = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#pitch .token')].map((t) => [t.dataset.slot, [parseFloat(t.style.left), parseFloat(t.style.top)]])));
    const WANT = { '1-2': 'finder', '2-3': 'fremmede', '6-7': 'staerkt' };
    check('Samspil: hver streg har sit pars bånd som klasse (2-3 fremmede, 1-2 finder, 6-7 stærkt, de andre ni spillet sammen)', lines.length === 12 && lines.every((l) => l.cls === `chem chem-${WANT[l.pair] ?? 'sammen'}`), JSON.stringify(lines.map((l) => [l.pair, l.cls])));
    check('Samspil: hver streg går fra den ene plads til den andens brik (koordinaterne er pladsernes, i rækkefølge)', lines.every((l) => { const [i, j] = l.pair.split('-'); return pos[i][0] === l.x1 && pos[i][1] === l.y1 && pos[j][0] === l.x2 && pos[j][1] === l.y2; }), JSON.stringify(lines[0]) + JSON.stringify(pos[1]));
    const tail = ' Samspil hjælper opbygningen og forsvaret mod løb i ryggen – par spiller sig sammen med kampe side om side.';
    check('Samspil: legenden nævner det SVAGESTE par (fremmede slår finder hinanden), med navn og ord', (await p.textContent('#chem-weakest')) === `Svagest lige nu: Midtstopper-parret (fremmede). 1 af 12 par spiller stærkt.${tail}`, await p.textContent('#chem-weakest'));
    const title3 = await p.getAttribute('#pitch .token[data-slot="3"]', 'title');
    check('Samspil: brikkens tooltip nævner hans par med naboerne i rækkefølge, med bånd', title3.endsWith(` · 🤝 samspil med ${info.p2}: fremmede · samspil med ${info.p4}: spillet sammen · samspil med ${info.p7}: spillet sammen`), title3);
    await prep('set(s[1], s[2], 65); return 1;'); await reload();   // prep nulstiller alle par til 78: kun 1-2 er "finder hinanden"
    check('Samspil: kun et "finder hinanden"-par → legenden advarer med numrene og ordet', (await p.textContent('#chem-weakest')) === `Svagest lige nu: ${info.p1} og ${info.p2} (finder hinanden).${tail}`, await p.textContent('#chem-weakest'));
    // v3.24.2 (Test Manager): tallet i legenden har tre grene – ingen (dækket ovenfor: ingen sætning), nogle ("N af M") og alle ("Alle N par …")
    await prep('return 1;', { base: 90 }); await reload();   // alle 12 par på 90 = stærkt ved snit 78
    check('Samspil: alle par stærkt → legenden siger "De spiller alle stærkt sammen." (ikke "12 af 12")', (await p.textContent('#chem-weakest')) === `Alle par har spillet sig sammen. De spiller alle stærkt sammen.${tail}`, await p.textContent('#chem-weakest'));
    await prep('set(s[1], s[2], 90); set(s[6], s[7], 90); return 1;'); await reload();
    check('Samspil: to af 12 par stærkt → legenden siger "2 af 12 par spiller stærkt."', (await p.textContent('#chem-weakest')) === `Alle par har spillet sig sammen. 2 af 12 par spiller stærkt.${tail}`, await p.textContent('#chem-weakest'));
    // Kortet: en starter (naboerne nu), en "ny" spiller uden par
    const card = await prep('set(s[2], s[3], 30); const y = arg.bench; for (const k of Object.keys(me.chemistry)) if (k.split("|").includes(y)) delete me.chemistry[k]; return { y, n3: sh(s[3]), p2: sh(s[2]), p4: sh(s[4]), p7: sh(s[7]) };', { bench: (await benchIds()).at(-1) }); await reload('trup');
    await p.locator(`#matrix tbody tr[data-pid="${info.s[3]}"]`).click();
    check('Samspil: kortet viser hans par med naboerne nu i ord, og "ingen særlig makker" uden et stærkt par', (await p.textContent('#card-pairs')) === `Samspil med naboerne nu: ${card.p2} fremmede · ${card.p4} spillet sammen · ${card.p7} spillet sammen` && (await p.textContent('#card-best')) === '🤝 Ingen særlig makker endnu', await p.textContent('#card-chem'));
    await p.locator(`#matrix tbody tr[data-pid="${card.y}"]`).click();
    check('Samspil: en spiller uden et eneste par (et køb) står som "fremmed for alle" og har ingen naboliste', (await p.textContent('#card-best')) === '🤝 Fremmed for alle i truppen – indtil han spiller kampe ved siden af de samme' && (await p.locator('#card-pairs').count()) === 0);
    // FUND (Test Manager): målmænd har ingen par i tabellen (seedet springer dem over), så chemCard() tog dem for "nye" – både din startmålmand og reserven
    // stod som "Fremmed for alle i truppen – indtil han spiller kampe ved siden af de samme". Kortet må ikke sige det om en målmand.
    const gkId = await p.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot).squad.find((x) => x.position === 'GK').id);
    await p.locator(`#matrix tbody tr[data-pid="${gkId}"]`).click();
    check('Samspil: din målmand (som aldrig har par) står IKKE som "fremmed for alle i truppen" på kortet', (await p.locator('#card-best').count()) === 0 || !(await p.textContent('#card-best')).includes('Fremmed for alle'), `card-chem: ${await p.locator('#card-chem').count()}`);
    // Klub: ligaens snit 84 – 90 er stærkt (kun ved dét snit tæller 82 IKKE), og købelinjen regner kampene ved dét snit (10, ikke 8)
    const kl = await prep('me.listed = [s[2], s[6]]; set(s[2], s[3], 90); set(s[6], s[7], 82); return { a: s[2], b: s[6], m3: sh(s[3]) };', { ref: 84 }); await reload('klub');
    check('Samspil, Klub: din spiller til salg med et stærkt par viser salgslinjen med makkeren – og en med 82 ved snit 84 gør ikke', (await p.textContent(`.market-row[data-pid="${kl.a}"] .market-chem`)) === `🤝 Stærkt samspil med ${kl.m3} – et salg bryder parret.` && (await p.locator(`.market-row[data-pid="${kl.b}"] .market-chem`).count()) === 0, await p.textContent('#market'));
    check('Samspil, Klub: "Til salg i ligaen" siger, hvor mange kampe et køb tager ved ligaens snit (84 → ca. 10)', (await p.textContent('#for-sale-chem')) === '🤝 Et køb er fremmed for alle i truppen – ca. 10 kampe ved siden af de samme, før han har spillet sig ind.', await p.textContent('#for-sale-chem'));
    await ptab('trup'); await seeTeam('1', p);
    await p.locator(`#matrix tbody tr[data-pid="${await p.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams[1].squad.find((x) => x.position !== 'GK').id)}"]`).click();   // målmanden har ingen købelinje
    check('Samspil: købeboksen på kortet bruger også ligaens snit (84 → ca. 10 kampe)', (await p.textContent('#buy-chem')) === '🤝 Ny i truppen: fremmed for alle – ca. 10 kampe ved siden af de samme, før han har spillet sig ind.', await p.textContent('#card-market'));
    // En modstander: ingen streger, ingen legende, intet samspil i tooltip eller kort
    await ptab('taktik'); await openCardOn(p);   // v3.29.0: modstanderens kort åbnet (ⓘ), så "intet samspil på kortet" ser et kort
    check('Samspil: en modstanders bane har ingen streger, ingen legende og ingen 🤝 i brikkernes tooltip', (await p.locator('#chem-lines').count()) === 0 && (await p.locator('#chem-legend').count()) === 0 && (await p.locator('#pitch .token[title*="🤝"]').count()) === 0 && (await p.locator('#cardpanel #player-card').count()) === 1 && (await p.locator('#card-chem').count()) === 0);
  }
  // Ét fælles byt (pickForSwap): bænkspiller i listen → brik på banen
  const tName = async (slot) => g.locator(`#pitch .token[data-slot="${slot}"] .token-name`).textContent();
  const benchRow = g.locator('#bench tr.bench-p').first();
  const benchShort = (await benchRow.locator('td:nth-child(2) .lp-name').textContent()).replace(/^#\d+ /, '').trim();
  await benchRow.click();
  // Rullepositionen i listen bevares ved et klik (QC): rul ned, klik en bænkspiller, stå samme sted
  await g.setViewportSize({ width: 1400, height: 600 });
  // v3.20.1: listen har ingen egen rulning (brugeren: "ingen grund til en indlejret scroll") – SIDEN står samme sted efter et klik
  const inner = await g.evaluate(() => [...document.querySelectorAll('.tablewrap')].map((el) => el.scrollHeight - el.clientHeight));
  await g.evaluate(() => window.scrollTo(0, document.querySelector('#bench').getBoundingClientRect().top + window.scrollY - 100));
  const st0 = await g.evaluate(() => window.scrollY);
  // klik via DOM (Playwright ruller ellers selv rækken ind): vælg og fravælg en række, der står synligt
  for (let i = 0; i < 2; i++) await g.evaluate(() => [...document.querySelectorAll('#bench tr.bench-p')].find((r) => r.getBoundingClientRect().top > 60).click());
  check('Taktik: ingen indlejret scroll i tabellerne, og siden står samme sted, når den tegnes om', inner.every((d) => d <= 1) && st0 > 0 && Math.abs((await g.evaluate(() => window.scrollY)) - st0) < 2, `${inner} · ${st0}`);
  await g.setViewportSize({ width: 1400, height: 1000 });
  check('Taktik: valgt bænkspiller markeres i listen og får en besked ved listen', (await g.locator('#bench tr.active').count()) === 1 && (await g.textContent('#pick-msg')).includes(benchShort));
  await g.click('#pitch .token[data-slot="7"]');
  check('Byt startet i listen kan afsluttes på banen', (await tName(7)) === benchShort, `${benchShort} / ${await tName(7)}`);
  // …og en brik → en bænkspiller i listen (listen viser brikkens kæde)
  await g.click('#pitch .token[data-slot="7"]');
  check('Klik på en brik filtrerer listen til hans kæde', (await g.locator('#lineup-list .toolbar button.active').textContent()) !== 'Alle' && (await g.locator('#bench tr.active').count()) === 1);
  await g.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();   // valget bevares, når filteret skiftes
  await g.locator('#bench tr.bench-p').first().click();
  // v3.24.0: efter byttet må der stå en samspilsbesked (🤝) – ikke byt-beskeden (🔁)
  check('…og et byt startet på banen kan afsluttes i listen', (await tName(7)) !== benchShort && ((await g.locator('#pick-msg').count()) === 0 || (await g.textContent('#pick-msg')).startsWith('🤝')));
  // Samme spiller to gange: intet byt, ingen besked
  const t3 = await tName(3);
  await g.click('#pitch .token[data-slot="3"]'); await g.click('#pitch .token[data-slot="3"]');
  check('Samme spiller valgt to gange: intet byt og ingen besked', (await tName(3)) === t3 && (await g.locator('#pick-msg').count()) === 0 && (await g.locator('#bench tr.active').count()) === 0);
  // Bænk → bænk vælger om; holdskift nulstiller valget
  await g.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();
  await g.locator('#bench tr.bench-p').nth(0).click(); await g.locator('#bench tr.bench-p').nth(1).click();
  check('Bænk efter bænk: det nye valg erstatter det gamle', (await g.locator('#bench tr.bench-p.active').count()) === 1 && (await g.locator('#bench tr.bench-p').nth(1).getAttribute('class')).includes('active'));
  await seeTeam('1'); await seeTeam('0');
  check('Holdskift nulstiller et påbegyndt byt', (await g.locator('#bench tr.active').count()) === 0 && (await g.locator('#pick-msg').count()) === 0);
  await tab('taktik');
  const smallTop = await (async () => { await g.setViewportSize({ width: 1366, height: 768 }); await g.evaluate(() => window.scrollTo(0, 0)); const t = await g.evaluate(() => document.getElementById('pitch').getBoundingClientRect().top); await g.setViewportSize({ width: 1400, height: 1000 }); return t; })();
  check('Laptop (1366×768): banen begynder højt nok til, at mindst 200 px af den ses i Taktik', smallTop < 768 - 200, `${Math.round(smallTop)}px`);
  const ratio = await g.evaluate(() => { const r = document.getElementById('pitch').getBoundingClientRect(); return r.width / r.height; });
  check('Banen bevarer sit forhold 68:80 (ikke strakt)', Math.abs(ratio - 68 / 80) < 0.02, ratio.toFixed(3));
  await tab('taktik'); await openCard();
  check('Taktik: træning kan ikke sættes her – kortet siger, hvad han træner, og linker til Træning', (await g.locator('#focus-select').count()) === 0 && (await g.textContent('#card-train-note')).includes('ændr i Træning ›') && (await g.locator('#cardpanel #card-train-link').count()) === 1);
  check('Taktik-fanen: bane, spillerliste og taktik – spillerkortet i panelet (ⓘ) – men ikke regnearket', (await g.isVisible('#pitch')) && (await g.isVisible('#lineup-list')) && (await g.isVisible('#cardpanel #player-card')) && (await g.locator('#app #player-card').count()) === 0 && (await g.locator('#matrix').count()) === 0);
  check('Tre fase-paneler og Hvis-Så-regler', (await g.locator('#tactics fieldset[data-phase]').count()) === 3 && (await g.locator('#rules .rule').count()) === 1);
  const bodyText = await g.textContent('body');
  check('Ingen rå skabelon-rester (${, undefined, NaN, null) på siden', !/\$\{|undefined|NaN|\bnull\b/.test(bodyText));
  await tab('liga');
  const optColors = await g.evaluate(() => { const o = document.querySelector('#team-select option'); const cs = getComputedStyle(o); return [cs.color, cs.backgroundColor]; });
  check('Holdvælgerens valgmuligheder er ikke hvid-på-hvid', optColors[0] !== optColors[1], optColors.join(' / '));
  await tab('taktik');

  // Kampprogrammet (v3.11): ingen modstandervælger; knappen nævner programmets næste modstander
  // (regnet direkte fra det gemte program, ikke via pairRound) og hjemme/ude.
  const nextOf = () => g.evaluate(() => {
    const L = JSON.parse(localStorage.getItem('tactivar_save')).league, me = L.teams.find((t) => !t.isBot);
    const k = L.leagueMetadata.round + 2 - L.seasonStartRound, name = (id) => L.teams.find((t) => t.id === id).name;
    const pairs = L.schedule[k - 1], [hId, aId] = pairs.find((p) => p.includes(me.id));
    return { k, opp: name(hId === me.id ? aId : hId), home: hId === me.id, me: me.name, fixtures: pairs.map(([h, a]) => `${name(h)}–${name(a)}`) };
  });
  const nx1 = await nextOf();
  check('Ingen modstandervælger – Spil-bjælken viser programmets næste modstander og hjemme/ude', (await g.locator('#opponent-select').count()) === 0
    && (await g.textContent('#play-round')) === `▶ Spil runde ${nx1.k} af 14 · ${nx1.opp} (${nx1.home ? 'hjemme' : 'ude'})` && nx1.k === 1, await g.textContent('#play-round'));
  // v3.28.0: modstanderen er et SEPARAT link ved knappen (før i knappen – et klik på navnet spillede runden). Fra Taktik bliver man på Taktik.
  await g.click('#next-opponent');
  const pitchTitle = () => g.textContent('#pitch-title');
  check('🔍 i Spil-bjælken på Taktik: modstanderens bane – man bliver på Taktik, scout-bjælken siger det, og ingen runde er spillet', (await g.textContent('#tabs .tab.active')).includes('Taktik')
    && (await pitchTitle()).startsWith(`${nx1.opp} – `) && (await g.isVisible('#scout-banner')) && (await g.textContent('#scout-txt')).includes(`Du ser ${nx1.opp}`)
    && (await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound == null)), await pitchTitle());
  // Scout-bjælkens vælger skifter hold uden at forlade fanen
  const thirdIdx = await g.evaluate((o) => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.findIndex((t) => t.isBot && t.name !== o), nx1.opp);
  await g.selectOption('#scout-banner #team-select', String(thirdIdx));
  const thirdName = await g.evaluate((i) => JSON.parse(localStorage.getItem('tactivar_save')).league.teams[i].name, thirdIdx);
  check('Scout-bjælkens holdvælger skifter hold og bliver på Taktik', (await g.textContent('#tabs .tab.active')).includes('Taktik') && (await pitchTitle()).startsWith(`${thirdName} – `), await pitchTitle());
  await g.click('#scout-back');
  check('"← Dit hold" i scout-bjælken viser dit eget hold – stadig på Taktik, og bjælken er væk', (await g.textContent('#tabs .tab.active')).includes('Taktik') && (await pitchTitle()).startsWith(`${nx1.me} – `)
    && (await g.isVisible('#chem-legend')) && (await g.locator('#scout-banner').count()) === 0, await pitchTitle());
  // Hjem: næste modstander er en hovedvej til hans trup (fra Hjem → Trup)
  await tab('hjem');
  await g.click('#home-opp-link');
  check('Hjem: "🔍 Se X" ved næste kamp åbner hans trup i Trup med scout-bjælken', (await g.textContent('#tabs .tab.active')).includes('Trup') && (await g.textContent('#club-name')) === nx1.opp && (await g.isVisible('#scout-banner')));
  // Hjem er altid dit hold: står man på et andet hold, viser Hjem – og Trup bagefter – dit eget
  await tab('hjem'); await tab('trup');
  check('Hjem-fanen skifter til dit eget hold – Trup bagefter viser dit hold, ikke det scoutede', (await g.textContent('#club-name')) === nx1.me && (await g.locator('#scout-banner').count()) === 0, await g.textContent('#club-name'));
  await g.reload(); await g.waitForSelector('body[data-klar="ja"]'); // tilbage til dit hold med startvalget (testene herunder bygger på det)

  // Sortering på FIN: højeste afslutning øverst
  await tab('trup');
  await g.click('#matrix thead th:nth-child(15)');
  const fins = (await g.locator('#matrix tbody tr td:nth-child(15)').allTextContents()).map(Number);
  check('Sortering på FIN giver højeste først', fins.length === 18 && fins.every((v, i) => i === 0 || fins[i - 1] >= v), fins.join(','));
  // Natur-kolonnen (v3.8): hver rækkes etiket og forklaring stemmer med spillerens gemte position, og sorteringen følger rækkefølgen
  const LABEL_POS = { GK: 'MV', CB: 'MS', FB: 'Back', DM: 'DM', CM: 'CM', AM: 'OM', WM: 'Kant', ST: 'ANG' };
  const savedPos = await g.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot).squad.map((p) => [p.shortName, p.position])));
  await g.click('#matrix thead th:nth-child(4)');
  const natRows = await g.evaluate(() => [...document.querySelectorAll('#matrix tbody tr')].map((tr) => ({ name: tr.children[1].textContent, label: tr.children[3].textContent.trim(), title: tr.children[3].title })));
  check('Natur: hver spillers etiket og forklaring (title) er hans gemte position', natRows.length === 18 && natRows.every((r) => r.label === LABEL_POS[savedPos[r.name]] && r.title === FULL_POS[savedPos[r.name]]), JSON.stringify(natRows.slice(0, 3)));
  const natIdx = natRows.map((r) => ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'WM', 'ST'].indexOf(savedPos[r.name]));
  check('Natur: sortering stigende MV, MS, Back, DM, CM, OM, Kant, ANG (alle otte forekommer – v3.20.0: DM)', natIdx.every((v, i) => i === 0 || natIdx[i - 1] <= v) && new Set(natIdx).size === 8, natIdx.join(','));

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
  await openCard(); await g.fill('#note-input', 'Stærk i luften');
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
  await openCard();   // samme standardspiller som noten blev skrevet på
  check('Efter F5: note bevaret', (await g.inputValue('#note-input')) === 'Stærk i luften');
  void firstName;

  // Bytte start ⇄ bænk
  await tab('trup');
  const posOf = async (name) => g.locator('#matrix tbody tr', { hasText: name }).locator('td:first-child').textContent();
  const starter = (await g.locator('#matrix tbody tr:nth-child(2) td:nth-child(2)').textContent());
  const bench = (await g.locator('#matrix tbody tr:nth-child(14) td:nth-child(2)').textContent());
  // v3.19.0: byttet sker i spillerlisten på Taktik; regnearket i Trup viser resultatet
  await tab('taktik');
  await g.locator('#lineup-list tr.lp-row', { hasText: starter }).click();
  await g.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();
  await g.locator('#lineup-list tr.lp-row', { hasText: bench }).click();
  await tab('trup');
  check('Byt: bænkspilleren overtager pladsen (v3.31.2: VB, ikke LB)', (await posOf(bench)).startsWith('VB ') && (await posOf(starter)).startsWith('BÆNK'));

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
  // Test Manager v3.16.3: ejefald i notebeskeden (app.js gen) – et navn på -s får apostrof ("T. Jens' plads", ikke "T. Jenss"/"T. Jens's");
  // spilleren omdøbes i det gemte spil (tilfældige navne ender sjældent på -s), siden genindlæses
  await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), t = d.league.teams.find((x) => !x.isBot); t.squad.find((p) => p.id === t.tactics.lineupSlots[6]).shortName = 'T. Jens'; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
  await g.reload(); await g.waitForSelector('body[data-klar="ja"]'); await tab('taktik');
  await g.click('#pitch .token[data-slot="6"]');
  const swapNote = await g.textContent('#pick-msg');
  check('Et påbegyndt byt nævner spilleren ved listen: "T. Jens skal byttes med"', swapNote.includes('T. Jens skal byttes med'), swapNote);
  await g.click('#pitch .token[data-slot="6"]'); // fravælg igen
  // Indskiftning fra bænken under banen – uden at forlade Taktik
  await g.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();
  await g.locator('#bench .bench-p').first().click(); await g.locator('#bench .bench-p').first().click();
  check('Bænken: klik igen på samme bænkspiller fravælger', (await g.locator('#bench .bench-p.active').count()) === 0 && (await g.locator('#pick-msg').count()) === 0);
  const benchBtn = g.locator('#bench .bench-p').first();
  const benchName = (await benchBtn.locator('td:nth-child(2) .lp-name').textContent()).replace(/^#\d+ /, '').trim();
  await benchBtn.click(); await g.click('#pitch .token[data-slot="4"]');
  check('Bænken: klik bænkspiller og så brik skifter ind', (await nameAt(4)) === benchName && (await g.locator('#bench .bench-p', { hasText: n4 }).count()) === 1, `${benchName} / ${await nameAt(4)}`);
  await g.click('#pitch .token[data-slot="5"]'); await g.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click(); await g.locator('#bench .bench-p').first().click();
  check('Bænken: klik brik og så bænkspiller skifter også ind', (await nameAt(5)) !== n5);
  await tab('trup'); await g.click('#matrix thead th:nth-child(1)'); await tab('taktik');

  // v3.20.0: uden for position – ny liga i 4-4-2 har intet flag; et bytte LB ⇄ ANG giver ⚠ (−6 %) på begge brikker og i listen;
  // "⇄ Stil op efter position" sætter dem tilbage og siger det
  { const g0 = await fresh(); await g0.click('#tab-taktik');
    check('Ny liga: ingen af dine brikker er uden for position, og forklaringen står ved listen', (await g0.locator('#pitch .token').count()) === 11 && (await g0.locator('#pitch .token-flag.pos').count()) === 0 && (await g0.textContent('#fit-help')).includes('naboplads (fx DM på CM, back på kant) −2,5 %'));
    const name = async (s) => (await g0.locator(`#pitch .token[data-slot="${s}"] .token-name`).textContent()).trim();
    const n1 = await name(1), n9 = await name(9);
    await g0.click('#pitch .token[data-slot="1"]'); await g0.click('#pitch .token[data-slot="9"]');
    await g0.locator('#lineup-list .toolbar button', { hasText: 'Alle' }).click();   // et klik på en brik filtrerer listen til kæden
    const flag = async (s) => (await g0.locator(`#pitch .token[data-slot="${s}"] .token-flag.pos`).textContent().catch(() => '')).trim();
    check('Byt LB ⇄ ANG: begge brikker viser "⚠ Uden for position (−6 %)" (LB-pladsen siger back-plads, v3.24.6), de andre intet, og listen markerer pladserne', (await name(1)) === n9 && (await flag(1)) === '⚠ Uden for position – back-plads (−6 %)' && (await flag(9)) === '⚠ Uden for position (−6 %)'
      && (await g0.locator('#pitch .token-flag.pos').count()) === 2 && (await g0.locator('#lineup-table td.lp-place.off-pos').count()) === 2 && (await g0.textContent('#lineup-table td.lp-place.off-pos')).includes('−6 %'));
    await g0.click('#arrange-lineup');
    check('"⇄ Stil op efter position" flytter dem tilbage, fjerner flagene og siger det', (await name(1)) === n1 && (await name(9)) === n9 && (await g0.locator('#pitch .token-flag.pos').count()) === 0 && (await g0.textContent('#notice')).includes('naturlige position'));
    await g0.selectOption('#formation', '4-2-3-1');
    check('Formationsskift i Taktik: de 11 fordeles, og beskeden siger hvor mange der flyttede', (await g0.textContent('#notice')).startsWith('4-2-3-1: ') && (await g0.textContent('#notice')).includes('flyttet'), await g0.textContent('#notice'));
    await g0.context().close(); }

  // Hver ændring gemmes STRAKS: genindlæs efter hver enkelt handling
  const reload = async () => { await g.reload(); await g.waitForSelector('body[data-klar="ja"]'); };
  // v3.25.0 (nr. 38, Test Manager): "N på midten · mere/mindre bold" ved formationsvælgeren følger den valgte formation – straks (uden genindlæsning)
  // og efter genindlæsning; teksterne er bogstavelige (4 = normal, ikke "mere"; 3-5-2 har 5 på midten, 5-3-2 kun 3 – ankrets dybde)
  const MID_TXT = { '4-4-2': '4 på midten · normal boldbesiddelse', '4-3-3': '3 på midten · mindre bold', '4-2-3-1': '5 på midten · mere bold', '3-5-2': '5 på midten · mere bold', '3-4-3': '4 på midten · normal boldbesiddelse', '5-3-2': '3 på midten · mindre bold', '5-4-1': '4 på midten · normal boldbesiddelse', '4-1-4-1': '5 på midten · mere bold', '4-4-1-1': '4 på midten · normal boldbesiddelse', '4-3-1-2': '4 på midten · normal boldbesiddelse' };
  const midTxt = async () => (await g.locator('#mid-count').count()) === 1 ? (await g.textContent('#mid-count')).trim() : null;
  const midOk = async () => (await midTxt()) === MID_TXT[await g.inputValue('#formation')];
  check('#mid-count: startformationen viser sin tekst (data: ét felt)', await midOk(), await midTxt());
  await g.selectOption('#formation', '3-5-2');
  check('#mid-count: 3-5-2 → "5 på midten · mere bold" straks efter valget', (await midTxt()) === '5 på midten · mere bold', await midTxt());
  await g.selectOption('#formation', '4-3-3');
  check('#mid-count: 4-3-3 → "3 på midten · mindre bold" straks efter valget (teksten følger, den hænger ikke fast)', (await midTxt()) === '3 på midten · mindre bold', await midTxt());
  await g.selectOption('#formation', '3-5-2');
  await g.selectOption('#formation', '3-5-2'); await reload();
  check('Formation gemmes straks', (await g.inputValue('#formation')) === '3-5-2');
  check('#mid-count: efter genindlæsning stadig 3-5-2s tekst', await midOk() && (await midTxt()) === '5 på midten · mere bold', await midTxt());
  // v3.24.6 (brugeren: "i en 3-5-2 … 2 midtbane kanter der får straf"): 3-5-2's LWB/RWB er kant-pladser – en kant dér
  // passer 100 %, en back betaler nabo-prisen; 5-3-2's (dybe) LWB/RWB er back-pladser
  {
    const wide = async (f) => g.evaluate((f) => { const d = JSON.parse(localStorage.getItem('tactivar_save')), t = d.league.teams.find((x) => !x.isBot);
      return [...document.querySelectorAll('#pitch .token[data-slot]')].map((el) => ({ slot: +el.dataset.slot, fit: +el.dataset.fit, title: el.title,
        pos: t.squad.find((p) => p.id === t.tactics.lineupSlots[+el.dataset.slot])?.position })).filter((x) => /^[VH]KB /.test(x.title)); }, f);   // v3.31.2: VKB/HKB
    const w = await wide('3-5-2');
    check('3-5-2: VKB/HKB er kant-pladser – kant 100 %, back −2,5 % (og brikken siger "kant-plads")', w.length === 2 && w.every((x) => x.title.includes('(kant-plads)') && x.fit === (x.pos === 'WM' ? 1 : x.pos === 'FB' ? 0.975 : x.fit)), JSON.stringify(w));
  }
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
  check('5-3-2: VKB/HKB er back-pladser', (await g.locator('#pitch .token[data-slot]').evaluateAll((els) => els.filter((el) => /^[VH]KB /.test(el.title)).map((el) => el.title.includes('(back-plads)')))).filter(Boolean).length === 2);
  const activeOpt = await g.locator('#rules .rule:nth-of-type(2) .rule-target option', { hasText: 'aktiv nu' }).textContent();
  check('Hvis-Så: den aktive plan i målvælgeren viser den nye formation', activeOpt.includes('(5-3-2)'), activeOpt);
  const otherPlan = await g.locator('#rules .rule:nth-of-type(2) .rule-target option[value="plan:1"]').textContent();
  check('Hvis-Så: de andre planer ændres ikke af det', !otherPlan.includes('aktiv') && !otherPlan.includes('(5-3-2)'), otherPlan);
  await g.selectOption('#rules .rule:nth-of-type(2) .rule-target', 'form:4-3-3'); await reload();
  check('Hvis-Så: valg af en formation fjerner plan-målet', (await g.inputValue('#rules .rule:nth-of-type(2) .rule-target')) === 'form:4-3-3');
  await g.click('.presets button:nth-child(2)'); await reload();
  check('Plan-skift gemmes straks', (await g.textContent('.presets button.active')).startsWith('Plan B') && (await g.inputValue('#formation')) === '4-3-3');
  check('#mid-count: planskift til Plan B (4-3-3) opdaterer teksten', (await midTxt()) === '3 på midten · mindre bold', await midTxt());
  const [s7, s8] = [await nameAt(7), await nameAt(8)];
  await g.click('#pitch .token[data-slot="7"]'); await g.click('#pitch .token[data-slot="8"]'); await reload();
  check('Byt gemmes straks', (await nameAt(7)) === s8 && (await nameAt(8)) === s7);
  await g.selectOption('#tactics select[data-field="onBallWon"]', 'KEEP_POSSESSION'); await reload();
  check('Fasevalg gemmes straks', (await g.inputValue('#tactics select[data-field="onBallWon"]')) === 'KEEP_POSSESSION');
  // v3.26.0 (nr. 39, Test Manager): Angrebsside står i Fase 1 mellem Angrebsfokus og Løb uden bold, standard Begge, valget gemmes straks
  {
    const sideSel = '#tactics fieldset[data-phase="phase1_buildUp"] select[data-field="attackSide"]';
    const fields = await g.locator('#tactics fieldset[data-phase="phase1_buildUp"] select').evaluateAll((els) => els.map((e) => e.dataset.field));
    check('Angrebsside: Fase 1 har feltet mellem Angrebsfokus og Løb uden bold', fields.join() === 'passingStyle,attackFocus,attackSide,offBallRuns', fields.join());
    check('Angrebsside: Venstre (VK/VB) / Begge / Højre (HK/HB), et nyt spil står på Begge', (await g.locator(`${sideSel} option`).allTextContents()).join('|') === 'Venstre (VK/VB)|Begge|Højre (HK/HB)' && (await g.inputValue(sideSel)) === 'BOTH');
    { const help = await g.textContent('#tactics fieldset[data-phase="phase1_buildUp"] .phase-help');   // QC v3.26.0: ærlig om effekten
    check('Angrebsside: hjælpeteksten nævner ca. 3 af 4, den lille effekt og at deres back læser et fast valg ved cutbacks', /ca\. 3 af 4 kantangreb/.test(help) && help.includes('en lille fordel, ca. ét styret kantangreb pr. kamp') && help.includes('ved cutbacks læser deres back på den side det') && help.includes('Begge finder selv en svag back – et fast valg er højst lige så godt'), help.slice(-300)); }
    await g.selectOption(sideSel, 'LEFT'); await reload();
    check('Angrebsside: Venstre gemmes straks og overlever F5', (await g.inputValue(sideSel)) === 'LEFT');
    await g.selectOption(sideSel, 'BOTH'); await reload();
    check('Angrebsside: tilbage til Begge gemmes', (await g.inputValue(sideSel)) === 'BOTH');
  }
  // v3.13: udskiftningsgrænsen (holdets, ikke planens) og en manuel Hvis-Så-udskiftning
  check('Udskiftninger: feltet står under Hvis-Så med 70 % for et nyt spil og forklarer reglerne (5 skift, 3 pauser)', (await g.inputValue('#subs-limit')) === '70' && (await g.textContent('#subs-help')).includes('højst 5 udskiftninger i højst 3 pauser'));
  await g.selectOption('#subs-limit', '80'); await reload();
  check('Udskiftningsgrænsen gemmes straks og overlever F5', (await g.inputValue('#subs-limit')) === '80');
  await g.click('.presets button:nth-child(1)'); await reload();
  check('Udskiftningsgrænsen følger holdet, ikke planen (Plan A viser også 80 %)', (await g.inputValue('#subs-limit')) === '80');
  await g.click('.presets button:nth-child(2)'); await reload();
  await g.selectOption('#subs-limit', '0'); await reload();
  await g.click('#add-rule'); await reload();
  const R = () => g.locator('#rules .rule').last();   // den nye regel (Plan B har sine egne regler)
  await R().locator('.rule-target').selectOption('sub:'); await reload();
  check('Hvis-Så-udskiftning: valg af "🔄 Udskiftning" giver vælgere for ud og ind og beder om begge spillere', (await R().locator('.rule-sub-out').count()) === 1 && (await R().locator('.rule-warn').textContent()).includes('vælg begge spillere'));
  await R().locator('.rule-cond').selectOption('ANY');
  await R().locator('input[type=number]').fill('3'); await R().locator('input[type=number]').dispatchEvent('change');
  const outOpt = await R().locator('.rule-sub-out option').nth(6).getAttribute('value');
  const inOpt = await R().locator('.rule-sub-in option').nth(2).getAttribute('value');
  await R().locator('.rule-sub-out').selectOption(outOpt); await R().locator('.rule-sub-in').selectOption(inOpt); await reload();
  check('Hvis-Så-udskiftning: "uanset stilling" skjuler antal mål, spillerne gemmes og der er ingen advarsel', (await R().locator('.rule-margin').count()) === 0 && (await R().locator('.rule-sub-out').inputValue()) === outOpt && (await R().locator('.rule-sub-in').inputValue()) === inOpt && (await R().locator('.rule-warn').count()) === 0);
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
  await tab('admin'); await g.click('#save-now');
  check('"Gem nu" gemmer igen efter fejlen', (await g.textContent('#save-status')).includes('Gemt kl.'));

  // Sorteringsvagten: sortér eget hold på FIN, skift til en modstander – rækkefølgen må ikke røbe FIN
  await tab('trup');
  await g.click('#matrix thead th:nth-child(15)');
  await tab('liga');
  await g.click('#standings tbody tr:not(.mine)');
  check('Klik på et hold i ligatabellen åbner holdet i Trup', (await g.textContent('#tabs .tab.active')).includes('Trup') && (await g.isVisible('#matrix')));
  const posCol = await g.locator('#matrix tbody tr td:nth-child(1)').allTextContents();
  check('Modstanderens tabel falder tilbage til opstillingsorden, ikke skjult FIN-orden', posCol[0].startsWith('MV #') && !(await g.textContent('#matrix thead')).includes('FIN ▼'));
  // v3.30.0: 🏋️ Træning er ALTID dit hold – også når Trup viser en modstander (ingen scout-bjælke, ingen af hans spillere, ingen "+N" fra ham)
  { const other = await g.textContent('#club-name');
    await tab('traening');
    const tr = await g.evaluate(() => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, me = L.teams.find((t) => !t.isBot), ids = [...document.querySelectorAll('#training-table tbody tr[data-pid]')].map((r) => r.dataset.pid);
      return { n: ids.length, mine: ids.every((id) => me.squad.some((p) => p.id === id)), all: me.squad.length }; });
    check('v3.30.0: Træning fra en modstander i Trup viser DIT hold – alle rækker er dine, ingen scout-bjælke', tr.n === tr.all && tr.mine && (await g.locator('#scout-banner').count()) === 0, JSON.stringify(tr) + ' | Trup viste ' + other);
    await tab('trup');
    check('v3.30.0: tilbage i Trup står den scoutede modstander stadig (Træning skifter ikke holdet)', (await g.textContent('#club-name')) === other && (await g.locator('#scout-banner').count()) === 1); }
  // v3.30.0 (TM): "+N" hører kun til DIT hold. En solgt spillers +1 står stadig i din rapport (sanitize rydder den først ved indlæsning) –
  // hos botten, der har købt ham, må hans række intet mærke have (mutation: `isOwn &&` fjernet ved gains i app.js var grøn). Positivt: rapporten
  // HAR hans +1 (gemt), hans række FINDES hos botten, og dit eget hold har stadig sit mærke (den anden spiller) og hjælpelinjen.
  { const ps = await fresh();
    const info = await ps.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), L = d.league, me = L.teams.find((t) => !t.isBot), bot = L.teams.find((t) => t.isBot);
      const sold = me.squad.find((p) => p.line === 'MID' && !me.tactics.lineupSlots.includes(p.id)), kept = me.squad.find((p) => p !== sold && p.line !== 'GK');
      L.trainingReport = { [me.id]: { round: 1, gains: [{ id: sold.id, skill: 'pace' }, { id: kept.id, skill: 'passing' }], injuries: [], strong: { up: [], down: [] } } };
      me.listed = [sold.id]; L.offers = [{ playerId: sold.id, from: me.id, to: bot.id, price: 500000, w: (L.leagueMetadata.seasonNumber ?? 1) * 2 }];
      localStorage.setItem('tactivar_save', JSON.stringify(d)); return { sold: sold.id, kept: kept.id, botIdx: L.teams.indexOf(bot) }; });
    await ps.reload(); await ps.waitForSelector('body[data-klar="ja"]'); await ps.click('#tab-trup'); await ps.waitForSelector('.tabpane.tab-trup');
    const before = { cells: await ps.locator('#matrix td.gain').count(), names: await ps.locator('#matrix td.player-gain').count() };
    await ps.click('#tab-klub'); await ps.waitForSelector('.tabpane.tab-klub');
    if (await ps.locator('.offer-accept').count()) await ps.locator('.offer-accept').first().click();
    const moved = await ps.evaluate((i) => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, me = L.teams.find((t) => !t.isBot);
      return { inBot: L.teams[i.botIdx].squad.some((p) => p.id === i.sold), inMine: me.squad.some((p) => p.id === i.sold), stillInReport: L.trainingReport[me.id].gains.some((x) => x.id === i.sold) }; }, info);
    await ps.click('#tab-liga'); await ps.selectOption('#team-select', String(info.botIdx)); await ps.waitForSelector('.tabpane.tab-trup');
    const bot = { row: await ps.locator(`#matrix tr[data-pid="${info.sold}"]`).count(), cells: await ps.locator('#matrix td.gain').count(), names: await ps.locator('#matrix td.player-gain').count(), help: await ps.locator('#trup-gain-help').count() };
    // Træning mens Trup viser botten: rapporten (opsamling + "Sidste runde"), fokus-valget og rækkerne er DINE – ikke botten (mutationer: summary/rapport/setFocus
    // bygget fra det viste hold var grønne, fordi kun tabellens rækker blev målt). Spilleren, du beholdt, har +1 Pasning i rapporten.
    await ps.click('#tab-traening'); await ps.waitForSelector('.tabpane.tab-traening');
    await ps.selectOption(`#training-table tr[data-pid="${info.kept}"] select`, 'FINISH');
    const tn = await ps.evaluate((i) => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, me = L.teams.find((t) => !t.isBot), q = me.squad.find((p) => p.id === i.kept), row = document.querySelector(`#training-table tr[data-pid="${i.kept}"]`);
      return { name: q.shortName, focus: q.trainingFocus, lastCol: row.lastElementChild.textContent, summary: document.getElementById('training-summary')?.textContent ?? null, next: document.getElementById('training-next')?.textContent ?? null }; }, info);
    check('v3.30.0 Træning mens Trup viser en modstander: opsamlingen, "Sidste runde" og fokus-valget er DINE (rapporten for dit hold, fokus gemt på din spiller)',
      tn.focus === 'FINISH' && tn.lastCol === '+1 Pasning' && !!tn.summary && tn.summary.includes(`${tn.name} +1 Pasning`) && !!tn.next && !tn.next.startsWith('Ingen +1'), JSON.stringify(tn));
    await ps.selectOption('#focus-many', 'REST');
    const mass = await ps.evaluate(() => ({ rest: JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot).squad.filter((p) => p.trainingFocus === 'REST').length, msg: document.getElementById('train-msg')?.textContent ?? null }));
    check('v3.30.0 Træning mens Trup viser en modstander: "Sæt fokus for de viste" gælder dine 18 (gemt), ikke botten', mass.rest === 18 && !!mass.msg && mass.msg.includes('18 spillere'), JSON.stringify(mass));
    await ps.click('#tab-trup'); await ps.waitForSelector('.tabpane.tab-trup');
    await ps.click('#scout-back'); await ps.waitForSelector('.tabpane.tab-trup');
    const mineNow = { cells: await ps.locator('#matrix td.gain').count(), names: await ps.locator('#matrix td.player-gain').count(), help: await ps.locator('#trup-gain-help').count(), soldRow: await ps.locator(`#matrix tr[data-pid="${info.sold}"]`).count() };
    check('v3.30.0 Trup, modstander: en solgt spillers +1 (stadig i din rapport) giver intet "+N" hos botten, der har ham – hverken i evnen, ved navnet eller i hjælpelinjen',
      before.cells === 2 && before.names === 2 && moved.inBot && !moved.inMine && moved.stillInReport && bot.row === 1 && bot.cells === 0 && bot.names === 0 && bot.help === 0, JSON.stringify({ before, moved, bot }));
    check('v3.30.0 Trup, dit hold igen: kun den, du beholdt, har sit "+N" (1 evne, 1 navn) og hjælpelinjen står', mineNow.cells === 1 && mineNow.names === 1 && mineNow.help === 1 && mineNow.soldRow === 0, JSON.stringify(mineNow));
    await ps.context().close(); }
  await seeTeam('0');

  // Anti-spionage på et modstanderhold
  await seeTeam('1');
  const oppText = await g.textContent('#matrix tbody');
  const lockCells = await g.locator('#matrix tbody td.lockcell').count();
  check('Modstander: 14 skjulte kolonner × 18 spillere vises som 🔒 ?? (v3.19.0: + løn; træningen står i sin egen oversigt)', lockCells === 14 * 18, String(lockCells));
  const oppMoney = await g.evaluate(() => { const hs = [...document.querySelectorAll('#matrix thead th')].map((t) => t.textContent); const i = hs.findIndex((t) => t.startsWith('💰 Værdi')); return [...document.querySelectorAll('#matrix tbody tr')].map((tr) => [tr.children[i].textContent, tr.children[i + 1].textContent]); });
  check('Modstander: værdien er offentlig, lønnen låst (v3.19.0)', oppMoney.every(([v, w]) => /\d/.test(v) && w === '🔒 ??'), JSON.stringify(oppMoney[0]));
  const hiddenCols = await g.evaluate(() => [...document.querySelectorAll('#matrix tbody tr')].flatMap((tr) => [...tr.children].slice(7, 19).map((td) => td.textContent)));
  check('Modstander: spring, luft, de 9 evner og gennemsnit står som 🔒 ?? (12 × 18 celler)', hiddenCols.length === 12 * 18 && hiddenCols.every((t) => t === '🔒 ??'));
  check('Modstander: vurdering vises som stjerner, ikke tal', (await g.locator('#matrix tbody tr td:nth-child(20)').allTextContents()).every((t) => /^[★☆]{5}$|^–$/.test(t)));
  void oppText;
  await g.click('#matrix thead th:nth-child(15)');
  check('Modstander: sortering på FIN afvises med anti-spionage-besked', (await g.textContent('#notice')).includes('Anti-spionage'));
  check('Modstander: klubkassen er skjult og linker ikke til Klub (v3.18.0)', (await g.textContent('.clubhead .right')).includes('🔒 Skjult') && (await g.locator('#club-link').count()) === 0);
  // v3.19.0: offentlig klubside – modstanderens spillere med pris, transfers og pensioner; kasse, løn og regnskab findes ikke
  await g.click('#public-club-link');
  const oppCash = await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); return d.league.teams[Number(document.getElementById('team-select').value)].cashBalance; });
  const pubText = await g.textContent('#public-club');
  check('Modstander i Klub: offentlig klubside med spillere og pris – ingen kasse, løn eller regnskab', (await g.isVisible('#public-club')) && (await g.locator('#public-squad tbody tr').count()) === 18
    && (await g.locator('#club-cash').count()) === 0 && (await g.locator('#ledger').count()) === 0 && !pubText.includes(oppCash.toLocaleString('da-DK')) && pubText.includes('Til din klub'), pubText.slice(0, 120));
  await g.click('#back-to-club');
  check('"← Til din klub" viser din egen klub (kasse og regnskab) – og scout-bjælken er væk', (await g.isVisible('#club')) && (await g.isVisible('#club-cash')) && (await g.locator('#scout-banner').count()) === 0);
  await seeTeam('1'); await tab('trup'); await openCard();
  check('Modstander: spillerkortet skjuler evner og kontrakt', (await g.locator('#player-card .bars').count()) === 0 && (await g.textContent('#player-card')).includes('🔒 ??'));
  await tab('taktik');
  check('Modstander: faser, Hvis-Så-regler og udskiftningsgrænse er skjulte', (await g.locator('#tactics fieldset').count()) === 0 && (await g.locator('#subs-limit').count()) === 0 && (await g.textContent('#tactics .lockbox')).includes('udskiftningsgrænse'));
  check('Modstander: spillerlisten viser friskhed og stjerner, men evnerne er låst, og der er ingen Udtag automatisk', (await g.locator('#lineup-list td.lockcell').count()) >= 18 && (await g.locator('#auto-bench').count()) === 0 && (await g.locator('#lineup-list tbody tr.lp-row').first().textContent()).match(/[★☆–]/));
  await g.click('#lineup-list thead th.locked');
  check('Modstander: sortering af listen på en skjult evne afvises (samme vagt som regnearket)', (await g.textContent('#notice')).includes('Anti-spionage'));
  check('Modstander: kun dit hold kan trækkes på banen', (await g.locator('#pitch .token.draggable').count()) === 0);
  check('Modstander: formationen kan ikke ændres og der er ingen byt-knapper', (await g.isDisabled('#formation')) && (await g.locator('#matrix tbody button').count()) === 0);
  check('Modstander: ingen Plan A/B/C og ingen "Nulstil træk" (ville afsløre og ændre deres taktik)', (await g.locator('#tactics .presets').count()) === 0 && (await g.locator('#reset-drag').count()) === 0);
  const oppBefore = await g.locator('#pitch .token[data-slot="2"] .token-name').textContent();
  await g.click('#pitch .token[data-slot="2"]'); await g.click('#pitch .token[data-slot="3"]');
  check('Modstander: klik på to brikker bytter ikke', (await g.locator('#pitch .token[data-slot="2"] .token-name').textContent()) === oppBefore);
  await tab('liga');
  check('Ligatabellen viser ikke andre holds taktiske stil', !(await g.textContent('#standings')).includes('•') && !/gegenpres/i.test(await g.textContent('#standings')));
  // Layout: Taktik har bane | kort+taktik ved siden af hinanden, stablet på smal skærm
  await tab('taktik');
  const colsAt = async (w) => { await g.setViewportSize({ width: w, height: 900 }); return g.evaluate(() => getComputedStyle(document.querySelector('.tactics-layout')).gridTemplateColumns.split(' ').length); };
  check('Layout: Taktik har 2 kolonner ved 1400 px og 1 ved 700 px', (await colsAt(1400)) === 2 && (await colsAt(700)) === 1);
  // v3.20.1 (brugeren: "langt ned til taktikindstillingerne"): indstillingerne står lige under banen; v3.29.0 (F2): kortet står i panelet,
  // så indstillingerne har hele bredden under bane | liste – og der er intet kort på siden
  await g.setViewportSize({ width: 1400, height: 900 });
  { const r = await g.evaluate(() => { const b = (s) => document.querySelector(s).getBoundingClientRect(); return { pitch: b('#pitch'), tac: b('#tactics'), list: b('#lineup-list'), cards: document.querySelectorAll('#app #player-card, #app .tk-card').length }; });
    check('Layout: Taktik-indstillingerne står under banen i hele bredden, listen til højre for banen – intet kort på siden (F2: panelet)', r.tac.top - r.pitch.bottom < 60 && Math.abs(r.tac.left - r.pitch.left) < 80 && r.list.left > r.pitch.right - 1 && r.tac.right >= r.list.right - 1 && r.tac.top >= r.list.top && r.cards === 0, JSON.stringify({ gap: Math.round(r.tac.top - r.pitch.bottom), tacL: Math.round(r.tac.left), tacR: Math.round(r.tac.right), listR: Math.round(r.list.right), cards: r.cards })); }
  await g.setViewportSize({ width: 390, height: 844 });
  { const y = await g.evaluate(() => ['#pitch', '#lineup-list', '#tactics'].map((s) => document.querySelector(s).getBoundingClientRect().top));
    check('Layout på mobil (390 px): bane, spillerliste, indstillinger – byt-listen lige under banen, intet kort på siden', y.every((v, i) => i === 0 || v > y[i - 1]) && (await g.locator('#app #player-card').count()) === 0, y.map(Math.round).join(' < ')); }
  await g.setViewportSize({ width: 1400, height: 900 });
  await g.setViewportSize({ width: 1400, height: 1000 });
  await tab('trup');
  const sideScroll = await g.evaluate(() => { const w = document.querySelector('.tablewrap'); return w.scrollWidth - w.clientWidth; });
  check('Layout: regnearket kræver ikke sidelæns scroll ved 1400 px', sideScroll <= 1, `${sideScroll}px`);
  { await seeTeam('0'); await tab('trup'); await g.setViewportSize({ width: 1366, height: 768 });
    const side = (id) => g.evaluate((id) => { const w = document.getElementById(id)?.closest('.tablewrap'); return w ? w.scrollWidth - w.clientWidth : 'mangler'; }, id);
    const tw = [await side('matrix')]; await tab('traening'); tw.push(await side('training-table')); await tab('trup');
    check('Layout (1366 px): regnearket i Trup og træningsoversigten på Træning ruller ikke sidelæns (QC v3.20.1: 758 px i 625)', tw.every((d) => d !== 'mangler' && d <= 1), tw.join(','));
    // Ingen indlejret LODRET scroll på nogen fane (brugeren v3.20.1; TM: målingen stod kun på Taktik)
    const vert = {};
    for (const k of ['trup', 'traening', 'liga', 'klub']) { await tab(k); vert[k] = await g.evaluate(() => [...document.querySelectorAll('.tablewrap')].map((w) => w.scrollHeight - w.clientHeight)); }
    check('Layout: ingen tabel på Trup, Træning, Liga eller Klub har egen lodret rulning', Object.values(vert).every((l) => l.every((d) => d <= 1)) && vert.trup.length >= 1 && vert.traening.length >= 1, JSON.stringify(vert));
    await tab('trup');
    await g.setViewportSize({ width: 1400, height: 1000 }); }
  check('Layout: siden selv scroller ikke sidelæns', await g.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // ---------- v3.32.1: designkritikkens røde (R1–R5) – målt i Chromium ved 390×844, 1366×768 og 1366×900 ----------
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } }), p = await c.newPage(), egne = [];
    p.on('pageerror', (e) => egne.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('body[data-klar="ja"]');
    const tt = async (k) => { await p.click(`#tab-${k}`); await p.waitForSelector(`.tabpane.tab-${k}`); };
    const paneP = async (k) => { await p.click(`#mc-tab-${k}`); await p.waitForSelector(`#mc-tab-${k}.active`); };
    const settle = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const size = async (w, hh) => { await p.setViewportSize({ width: w, height: hh }); await p.waitForTimeout(250); await settle(); };   // resize-måling er forsinket 120 ms
    // R1 Taktik (390): præcis 5 ⓘ, alle lukkede; de lange tekster findes (textContent), men står IKKE på skærmen; de korte står på én linje
    await tt('taktik');
    const r1 = await p.evaluate(() => {
      const more = [...document.querySelectorAll('#tactics details.help-more')], vis = (e) => !!e && e.checkVisibility({ visibilityProperty: true });   // lukket <details>: indholdet er skjult (content-visibility), ikke væk
      const shorts = [...document.querySelectorAll('#tactics .help-short')].map((e) => ({ t: e.textContent, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) }));
      return { n: more.length, open: more.filter((d) => d.open).length, labels: more.map((d) => d.querySelector('summary').getAttribute('aria-label')), sumH: more.map((d) => Math.round(d.querySelector('summary').getBoundingClientRect().height)),
        longVisible: [...document.querySelectorAll('#tactics .phase-help, #subs-help, #tactics .rules-help')].filter(vis).length, longN: document.querySelectorAll('#tactics .phase-help').length,
        longTxt: document.querySelector('#tactics fieldset[data-phase="phase1_buildUp"] .phase-help')?.textContent ?? '', shorts };
    });
    check('R1 Taktik (390): præcis 5 "ⓘ Sådan virker det" – alle lukket, navngivet (Fase 1–3, Hvis-Så, udskiftninger), summary ≥ 44 px høj', r1.n === 5 && r1.open === 0
      && JSON.stringify(r1.labels) === JSON.stringify(['Sådan virker det – Fase 1', 'Sådan virker det – Fase 2', 'Sådan virker det – Fase 3', 'Sådan virker det – Hvis-Så-reglerne', 'Sådan virker det – udskiftningerne']) && r1.sumH.every((x) => x >= 44), JSON.stringify(r1.labels) + ' ' + r1.sumH);
    check('R1 Taktik (390): de lange forklaringer står IKKE på skærmen, men findes (indholdet intakt) – og hver kort linje står på én linje', r1.longVisible === 0 && r1.longN === 3 && r1.longTxt.startsWith('Angrebsfokus bestemmer') && r1.shorts.length === 5 && r1.shorts.every((x) => x.lines === 1 && x.t.length > 20), JSON.stringify(r1.shorts));
    const wid = await p.evaluate(() => [...document.querySelectorAll('#tactics fieldset.phase')].map((f) => { const fw = f.getBoundingClientRect().width, s = f.querySelector('.help-short'), d = f.querySelector('details.help-more');
      return s && d ? [Math.round(s.getBoundingClientRect().width / fw * 100), Math.round(d.getBoundingClientRect().width / fw * 100)] : null; }).filter(Boolean));
    check('R1 Taktik (390) TM: den korte linje og ⓘ-folden fylder hver fases fulde bredde (egen linje under valgene, ikke klemt ind ved siden af en select)', wid.length >= 3 && wid.every(([a, b]) => a >= 85 && b >= 85), JSON.stringify(wid));
    // Åbn Fase 2, skift en indstilling (gentegning af hele siden) → Fase 2 er stadig åben, Fase 1 stadig lukket; luk den igen → lukket efter næste gentegning
    await p.click('#help-phase2_defending > summary');
    const before = await p.selectOption('#tactics select[data-field="passingStyle"]', { index: 0 }).then(() => p.inputValue('#tactics select[data-field="passingStyle"]'));
    await p.selectOption('#tactics select[data-field="passingStyle"]', { index: 1 }); await settle();
    const reOpen = await p.evaluate(() => ({ f2: document.getElementById('help-phase2_defending').open, f1: document.getElementById('help-phase1_buildUp').open, vis: document.querySelector('#help-phase2_defending .phase-help').checkVisibility() }));
    await p.click('#help-phase2_defending > summary'); await p.selectOption('#tactics select[data-field="passingStyle"]', before); await settle();
    const reClosed = await p.evaluate(() => document.getElementById('help-phase2_defending').open);
    check('R1 Taktik: foldet husker åben over en gentegning (skift af indstilling) – og lukket, når det lukkes igen; de andre røres ikke', reOpen.f2 && reOpen.vis && !reOpen.f1 && reClosed === false, JSON.stringify({ reOpen, reClosed }));
    // R5 Trup: rækkerne ≥ 44 px ved 390 og < 36 ved 1366 (før: ca. 25 ved begge)
    await tt('trup');
    const rowsH = () => p.evaluate(() => [...document.querySelectorAll('#matrix tbody tr')].map((r) => Math.round(r.getBoundingClientRect().height)));
    const h390 = await rowsH();
    // R4 Trup (390): rammen ruller (data-scroll), kanten toner ud (mask-image), Spiller står fast – og efter rul til enden er fade'et væk
    const r4 = () => p.evaluate(() => {
      const w = document.querySelector('#matrix').closest('.tablewrap'), cs = getComputedStyle(w), name = document.querySelector('#matrix tbody td.stick-2'), pos = document.querySelector('#matrix tbody td.stick-1');
      return { scroll: w.dataset.scroll ?? null, more: w.dataset.more ?? null, stick: w.dataset.stick ?? null, mask: cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage, namePos: getComputedStyle(name).position, posPos: getComputedStyle(pos).position,
        nameLeft: Math.round(name.getBoundingClientRect().left - w.getBoundingClientRect().left), before: getComputedStyle(name, '::before').content, dataPos: name.dataset.pos, sw: w.scrollWidth, cw: w.clientWidth };
    });
    const a = await r4();
    await p.evaluate(() => { const w = document.querySelector('#matrix').closest('.tablewrap'); w.scrollLeft = w.scrollWidth; w.dispatchEvent(new Event('scroll')); }); await settle();
    const b = await r4();
    check('R5 Trup: hver række er mindst 44 px høj ved 390 (18 rækker – før 25 px)', h390.length === 18 && h390.every((x) => x >= 44), h390.join(','));
    check('R4 Trup (390): tabellen er bredere end rammen og markeret – fade i højre kant (mask-image) og Spiller låst (sticky)', a.scroll === 'ja' && a.more === 'ja' && /linear-gradient/.test(a.mask ?? '') && a.namePos === 'sticky' && a.sw > a.cw + 100, JSON.stringify(a));
    check('R4 Trup (390): over 40 % til Pos + Spiller → kun Spiller låst, og pladsen står i samme celle ("VKB "/"BÆNK " før navnet)', a.stick === 'navn' && a.posPos === 'static' && !!a.dataPos && a.before === `"${a.dataPos} "`, JSON.stringify({ stick: a.stick, posPos: a.posPos, before: a.before, dataPos: a.dataPos }));
    check('R4 Trup (390): rullet til enden er fade\'et væk, og navnet står stadig fast i venstre kant', b.scroll === 'ja' && b.more === null && (b.mask === 'none' || !b.mask) && b.nameLeft >= -1 && b.nameLeft <= 2, JSON.stringify(b));
    // Uigennemsigtige låste celler: "byt i gang" (🔁) og den sorterede kolonne – ellers skinner de forbirullede tal igennem
    // (byt startes kun på Taktik siden v3.19.0 og ryddes ved fanebyt – rækken markeres her direkte, så CSS-reglen måles)
    await p.evaluate(() => document.querySelectorAll('#matrix tbody tr')[2].classList.add('swapping'));
    const bg = await p.evaluate(() => { const tr = document.querySelector('#matrix tbody tr.swapping'); return tr ? { swap: getComputedStyle(tr.querySelector('td.stick-2')).backgroundColor, n: document.querySelectorAll('#matrix tbody tr.swapping').length } : null; });
    const bgSorted = await p.evaluate(() => getComputedStyle(document.querySelector('#matrix thead th.stick-1')).backgroundColor);
    check('R4 Trup: en låst celle er uigennemsigtig i "byt i gang"-rækken (#3b2622) og i den sorterede kolonne (#251453)', bg?.n === 1 && bg.swap === 'rgb(59, 38, 34)' && bgSorted === 'rgb(37, 20, 83)', JSON.stringify({ bg, bgSorted }));
    await p.evaluate(() => document.querySelector('#matrix tbody tr.swapping').classList.remove('swapping'));
    // ---- Test Manager (v3.32.1): fade-retningen, låste cellers udseende og position i begge tilstande, Træning rullet til enden ----
    const maskA = a.mask ?? '';
    check('R4 Trup (390) TM: kanten toner ud mod HØJRE (gradient "to left", 40 px = 2,5 rem) – ikke venstre/andet', /to left/.test(maskA) && /\b40px\b/.test(maskA), maskA);
    const lockS = await p.evaluate(() => {
      const nm = (n) => document.querySelector(`#matrix tbody tr:nth-child(${n}) td.stick-2`), cs = (e) => getComputedStyle(e);
      const sel = document.querySelector('#matrix tbody tr:nth-child(6)'); sel.classList.add('selected');
      const selShadow = cs(sel.querySelector('td.stick-2')).boxShadow; sel.classList.remove('selected');
      return { bg: cs(nm(1)).backgroundColor, bgPos: cs(document.querySelector('#matrix tbody tr:nth-child(1) td.stick-1')).backgroundColor, divider: cs(nm(1)).boxShadow, selShadow };
    });
    await p.hover('#matrix tbody tr:nth-child(4)');
    const hoverBg = await p.evaluate(() => getComputedStyle(document.querySelector('#matrix tbody tr:nth-child(4) td.stick-2')).backgroundColor);
    await p.mouse.move(0, 0);
    check('R4 Trup (390) TM: den låste navne-celle er uigennemsigtig (ellers skinner de forbirullede tal igennem) og har en delelinje mod højre', lockS.bg !== 'rgba(0, 0, 0, 0)' && /inset/.test(lockS.divider) && /-1px 0px 0px 0px/.test(lockS.divider), JSON.stringify(lockS));
    check('R4 Trup (390) TM: den valgte række har lilla over- og underkant også i den låste celle, og hover farver den låste celle med resten af rækken (#1e293b)', /0px 1px 0px 0px inset/.test(lockS.selShadow) && /0px -1px 0px 0px inset/.test(lockS.selShadow) && hoverBg === 'rgb(30, 41, 59)', JSON.stringify({ sel: lockS.selShadow, hoverBg }));
    // R4 Træning og Klub-regnskabet (390): samme regel (låst første kolonne, fade)
    await tt('traening');
    const tr4 = await p.evaluate(() => { const w = document.querySelector('#training-table').closest('.tablewrap'); return { scroll: w.dataset.scroll ?? null, more: w.dataset.more ?? null, first: getComputedStyle(document.querySelector('#training-table tbody td.stick-1')).position }; });
    check('R4 Træning (390): fade og Spiller låst – samme regel som Trup', tr4.scroll === 'ja' && tr4.more === 'ja' && tr4.first === 'sticky', JSON.stringify(tr4));
    // Test Manager: Træning rullet til enden – Spiller (krop og overskrift) står stadig i venstre kant (left: 0), fade'et er væk, cellen er uigennemsigtig
    await p.evaluate(() => { const w = document.querySelector('#training-table').closest('.tablewrap'); w.scrollLeft = w.scrollWidth; w.dispatchEvent(new Event('scroll')); }); await settle();
    const tr4e = await p.evaluate(() => { const w = document.querySelector('#training-table').closest('.tablewrap'), l = w.getBoundingClientRect().left, td = document.querySelector('#training-table tbody td.stick-1'), th = document.querySelector('#training-table thead th.stick-1');
      return { more: w.dataset.more ?? null, td: Math.round(td.getBoundingClientRect().left - l), th: Math.round(th.getBoundingClientRect().left - l), thPos: getComputedStyle(th).position, bg: getComputedStyle(td).backgroundColor, sw: w.scrollWidth, cw: w.clientWidth }; });
    check('R4 Træning (390) TM: rullet til enden står Spiller (krop OG overskrift) stadig i venstre kant og er uigennemsigtig – fade\'et er væk', tr4e.more === null && Math.abs(tr4e.td) <= 2 && Math.abs(tr4e.th) <= 2 && tr4e.thPos === 'sticky' && tr4e.bg !== 'rgba(0, 0, 0, 0)' && tr4e.sw > tr4e.cw + 100, JSON.stringify(tr4e));
    // Test Manager: 600 px er stadig "smal" (44 px-rækker), 601 er det ikke; ved 600 er Pos + Spiller under 40 % → BEGGE låst (data-stick="alle"), navnet efter Pos
    // (resize UDEN gentegning: Trup står åben ved 390 med data-stick="navn"; drejes/ændres vinduet til 600, måles forfra → "alle")
    await tt('trup'); const before600 = await p.evaluate(() => document.querySelector('#matrix').closest('.tablewrap').dataset.stick ?? null);
    await size(600, 900);
    const h600 = await rowsH(), s600 = await p.evaluate(() => { const w = document.querySelector('#matrix').closest('.tablewrap'); w.scrollLeft = w.scrollWidth; w.dispatchEvent(new Event('scroll'));
      return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => { const l = w.getBoundingClientRect().left, pos = document.querySelector('#matrix tbody td.stick-1'), nm = document.querySelector('#matrix tbody td.stick-2');
        res({ stick: w.dataset.stick ?? null, scroll: w.dataset.scroll ?? null, posPos: getComputedStyle(pos).position, pos: Math.round(pos.getBoundingClientRect().left - l), name: Math.round(nm.getBoundingClientRect().left - l), posW: Math.round(pos.getBoundingClientRect().width), var: w.style.getPropertyValue('--stick1-w') }); }))); });
    check('R4 Trup (390→600, uden gentegning): vinduet ændres, og de brede tabeller måles forfra – "navn" (smal) bliver til "alle"', before600 === 'navn' && s600.stick === 'alle', JSON.stringify({ before600, s600 }));
    check('R5 Trup (600): rækkerne er stadig mindst 44 px (grænsen er 600 px, ikke 400)', h600.length === 18 && h600.every((x) => x >= 44), h600.join(','));
    check('R4 Trup (600): Pos + Spiller under 40 % af rammen → begge står fast (data-stick="alle"), navnet lige efter Pos (left = Pos-bredden), også rullet til enden', s600.scroll === 'ja' && s600.stick === 'alle' && s600.posPos === 'sticky' && Math.abs(s600.pos) <= 2 && Math.abs(s600.name - s600.posW) <= 2 && s600.var === `${s600.posW}px`, JSON.stringify(s600));
    await size(601, 900); await tt('trup');
    const h601 = await rowsH(), s601 = await p.evaluate(() => { const w = document.querySelector('#matrix').closest('.tablewrap'); return { scroll: w.dataset.scroll ?? null, stick: w.dataset.stick ?? null, pos: getComputedStyle(document.querySelector('#matrix tbody td.stick-1')).position, name: getComputedStyle(document.querySelector('#matrix tbody td.stick-2')).position }; });
    check('R5 Trup (601): rækkerne er tætte igen (< 36 px) – grænsen for de høje rækker er 600 px', h601.length === 18 && h601.every((x) => x < 36), h601.join(','));
    check('R4 Trup (601): de låste kolonner gælder også over 600 px, så snart tabellen ruller (ikke en mobil-regel)', s601.scroll === 'ja' && s601.stick === 'alle' && s601.pos === 'sticky' && s601.name === 'sticky', JSON.stringify(s601));
    // Test Manager: (pointer: coarse) – en berøringsskærm uden smal bredde (tablet, 1000 px) får også 44 px-rækker; en mus ved samme bredde gør ikke
    { const cc = await browser.newContext({ viewport: { width: 1000, height: 800 }, hasTouch: true }), pc = await cc.newPage();
      await pc.goto(BASE + '/'); await pc.waitForSelector('body[data-klar="ja"]'); await pc.click('#tab-trup'); await pc.waitForSelector('.tabpane.tab-trup');
      const co = await pc.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, rows: [...document.querySelectorAll('#matrix tbody tr')].map((r) => Math.round(r.getBoundingClientRect().height)) }));
      const cm = await browser.newContext({ viewport: { width: 1000, height: 800 } }), pm = await cm.newPage();
      await pm.goto(BASE + '/'); await pm.waitForSelector('body[data-klar="ja"]'); await pm.click('#tab-trup'); await pm.waitForSelector('.tabpane.tab-trup');
      const mo = await pm.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, rows: [...document.querySelectorAll('#matrix tbody tr')].map((r) => Math.round(r.getBoundingClientRect().height)) }));
      check('R5 Trup (1000 px, berøring): (pointer: coarse) giver 44 px-rækker – og samme bredde med mus gør ikke (< 36 px)', co.coarse && !mo.coarse && co.rows.length === 18 && co.rows.every((x) => x >= 44) && mo.rows.every((x) => x < 36), JSON.stringify({ co, mo }));
      await cc.close(); await cm.close(); }
    // R5/R4 ved 1366×768: tætte rækker, ingen sidelæns rul, ingen markering, intet låst
    await size(1366, 768); await tt('trup');
    const h1366 = await rowsH(), d = await r4();
    check('R5 Trup (1366): rækkerne er stadig tætte (< 36 px) – 44 px-reglen lækker ikke til computeren', h1366.length === 18 && h1366.every((x) => x < 36), h1366.join(','));
    check('R4 Trup (1366): tabellen passer – ingen data-scroll/data-more, ingen fade og intet låst', d.scroll === null && d.more === null && (d.mask === 'none' || !d.mask) && d.namePos === 'static', JSON.stringify(d));
    // ---------- Kamp: live, så fløjtet ----------
    // CI v3.32.1: lange holdnavne (de tilfældige navne gav grønt lokalt og rødt i CI) – testen måler det værste tilfælde, ikke ligaens lodtrækning
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); d.league.teams.forEach((t, i) => { t.name = ['Nordkysten Boldklub', 'Lyngby Tacticians FC', 'Roskilde Rovers United', 'Kronborg United IF'][i % 4]; }); localStorage.setItem('tactivar_save', JSON.stringify(d)); });
    await p.reload(); await p.waitForSelector('body[data-klar="ja"]');
    await size(390, 844);
    await p.click('#play-round'); await p.waitForSelector('#skip');
    check('R3 under live-afspilning: ingen underfaner, ingen fuldtids-linje og intet "⋯ Mere"', (await p.locator('#mc-tabs, #mc-ft, #mc-more').count()) === 0 && (await p.getAttribute('#mc-main', 'class')) === 'mc-grid');
    await p.click('#skip'); await p.waitForSelector('#mc-tabs'); await p.evaluate(() => window.scrollTo(0, 0)); await settle();
    // Første skærm (390×844, 1366×768, 1366×900): ▶ over Spil-bjælken, banen begynder på skærmen; knapper → tekst → bane (i den rækkefølge)
    const first = () => p.evaluate(() => { const b = (s) => document.querySelector(s)?.getBoundingClientRect(); const bar = b('#playbar'), nav = innerWidth <= 600 ? b('.tabbar') : null;
      const free = Math.min(bar?.height ? bar.top : innerHeight, nav?.height ? nav.top : innerHeight);
      return { y: Math.round(scrollY), ih: innerHeight, free: Math.round(free), play: Math.round(b('#rp-play').bottom), ctrl: Math.round(b('.rp-controls').bottom), cap: Math.round(b('#rp-caption').top), capB: Math.round(b('#rp-caption').bottom), pitch: Math.round(b('#rp-pitch').top), pitchH: Math.round(b('#rp-pitch').height),
        send: document.querySelector('#send-match, #send-off')?.checkVisibility() ? 1 : 0, intro: document.querySelector('#replay-help span').checkVisibility() ? 1 : 0, introOpen: document.getElementById('replay-help').open }; });
    const ys = {};
    ys['390×844'] = await first();
    await size(1366, 768); await p.evaluate(() => window.scrollTo(0, 0)); ys['1366×768'] = await first();
    await size(1366, 900); await p.evaluate(() => window.scrollTo(0, 0)); ys['1366×900'] = await first();
    const okY = (v) => v.y === 0 && v.play <= v.free && v.pitch < v.ih - 200 && v.ctrl <= v.cap + 1 && v.capB <= v.pitch + 1;
    const tabs = await p.evaluate(() => [...document.querySelectorAll('#mc-tabs > button')].map((b) => [Math.round(b.getBoundingClientRect().top), b.scrollWidth <= b.clientWidth + 1]));
    check('R2 efter fløjtet: ▶ Afspil over Spil-bjælken (og bundnavigationen), banen begynder mindst 200 px over bunden – ved 390×844, 1366×768 og 1366×900 (før: ▶ ved y 1230/1036/1043)', Object.values(ys).every(okY), JSON.stringify(ys));
    check('R3 (CI v3.32.1): ved 1366 står de tre underfaner på én række med hele teksten', new Set(tabs.map(([y]) => y)).size === 1 && tabs.length === 3 && tabs.every(([, full]) => full), JSON.stringify(tabs));
    check('R2 efter fløjtet: knapperne står OVER teksten, teksten over banen; banens højde er clamp(16rem, 100svh − 26rem, 32rem) – 428 / 352 / 484 px', Object.values(ys).every((v) => v.ctrl <= v.cap + 1 && v.capB <= v.pitch + 1) && ys['390×844'].pitchH === 428 && ys['1366×768'].pitchH === 352 && ys['1366×900'].pitchH === 484, JSON.stringify(Object.fromEntries(Object.entries(ys).map(([k, v]) => [k, v.pitchH]))));
    check('R2 efter fløjtet: "📤 Send kampen" og intro-teksten står IKKE på første skærm (⋯ Mere og ⓘ er lukket)', Object.values(ys).every((v) => v.send === 0 && v.intro === 0 && !v.introOpen) && (await p.getAttribute('#mc-more', 'open')) === null);
    await size(390, 844);
    const chips = await p.evaluate(() => { const cs = [...document.querySelectorAll('#match-cards .matchcard')].map((x) => Math.round(x.getBoundingClientRect().top)), w = document.querySelector('#match-cards').closest('.tablewrap'); return { tops: cs, more: w.dataset.more ?? null, mine: document.querySelector('#match-cards .matchcard').classList.contains('active') }; });
    check('R2 kampvælgeren (390): én linje (4 kampe, samme top), rullelig med fade – din kamp forrest og valgt', chips.tops.length === 4 && new Set(chips.tops).size === 1 && chips.more === 'ja' && chips.mine, JSON.stringify(chips));
    // Test Manager: 44 px-flader på Kamp (390) – underfanerne, "⋯ Mere" og "ⓘ Om tavlen"; på computeren er "⋯ Mere" lav (< 36 px)
    const tap = () => p.evaluate(() => { const hh = (s) => Math.round(document.querySelector(s).getBoundingClientRect().height); return { tabs: [...document.querySelectorAll('#mc-tabs button')].map((b) => Math.round(b.getBoundingClientRect().height)), more: hh('#mc-more > summary'), tavle: hh('#replay-help > summary'), play: hh('#rp-play'), filters: [...document.querySelectorAll('#feed-filters button')].map((b) => Math.round(b.getBoundingClientRect().height)),
      ft: (() => { const f = document.querySelector('#mc-ft'); return f ? { cls: f.className, color: getComputedStyle(f).color, parent: getComputedStyle(f.parentElement).color } : null; })() }; });
    const tap390 = await tap();
    check('Kamp (390) TM: underfanerne, "⋯ Mere" og "ⓘ Om tavlen" er mindst 44 px høje', tap390.tabs.length === 3 && tap390.tabs.every((x) => x >= 44) && tap390.more >= 44 && tap390.tavle >= 44, JSON.stringify(tap390));
    // Spilfører UI (v3.32.1): ▶ Afspil og referatets filtre er selve handlingen – også 44 px (før 23 px)
    check('Kamp (390): ▶ Afspil og referatets filtre er mindst 44 px høje', tap390.play >= 44 && tap390.filters.length >= 3 && tap390.filters.every((x) => x >= 44), JSON.stringify(tap390));
    // Fuldtids-linjen farves efter udfaldet: sejr grøn (#4ade80), nederlag rød (#f87171), uafgjort som teksten omkring
    const ftCol = { 'mc-ft ft-win': 'rgb(74, 222, 128)', 'mc-ft ft-loss': 'rgb(248, 113, 113)' };
    check('Kamp: fuldtids-linjen har udfaldets farve (sejr grøn, nederlag rød, uafgjort neutral)', !!tap390.ft && (ftCol[tap390.ft.cls] ? tap390.ft.color === ftCol[tap390.ft.cls] : tap390.ft.cls === 'mc-ft ft-draw' && tap390.ft.color === tap390.ft.parent), JSON.stringify(tap390.ft));
    const head390 = await p.evaluate(() => { const one = (e) => !!e && e.getBoundingClientRect().height < parseFloat(getComputedStyle(e).fontSize) * 1.9;
      return { link: document.querySelector('.to-home #kamp-paper-link') ? one(document.querySelector('.to-home #kamp-paper-link')) : null, muted: [...document.querySelectorAll('#scoreboard > div:not(.score) > .muted')].map(one),
        rpTitle: getComputedStyle(document.querySelector('#replay .rp-head > strong')).display, tabRows: new Set([...document.querySelectorAll('#mc-tabs > button')].map((b) => Math.round(b.getBoundingClientRect().top))).size }; });
    check('Kamp (390) TM: lange holdnavne – avisens link og taktiklinjerne under holdnavnene står på én linje, "🎬 Afspilning"-titlen skjules (fanen siger det), og underfanerne står på én række', head390.link === true && head390.muted.length === 2 && head390.muted.every(Boolean) && head390.rpTitle === 'none' && head390.tabRows === 1, JSON.stringify(head390));
    await paneP('stats');
    const ms = await p.evaluate(() => { const t = document.querySelector('#match-stats'), w = t.closest('.tablewrap'), tw = t.getBoundingClientRect().width;
      return { over: w.scrollWidth - w.clientWidth, clipped: [...t.querySelectorAll('th, td')].filter((c) => c.scrollWidth > c.clientWidth + 1).length, labelShare: Math.round(t.querySelector('tbody th').getBoundingClientRect().width / tw * 100), names: [...t.querySelectorAll('thead th')].map((x) => x.textContent).filter(Boolean) }; });
    await paneP('replay');
    check('Kamp-statistikken (390) TM: med lange holdnavne passer tabellen i rammen, ingen celle er klippet, og etiketten får ca. 40 % af bredden', ms.names.length === 2 && ms.names.every((x) => x.length >= 15) && ms.over <= 1 && ms.clipped === 0 && ms.labelShare >= 35 && ms.labelShare <= 45, JSON.stringify(ms));
    const tabBg = await p.evaluate(() => [...document.querySelectorAll('#mc-tabs button')].map((x) => getComputedStyle(x).backgroundColor));
    check('Kamp (390) TM: den aktive underfane er farvet anderledes end de to andre', tabBg.length === 3 && tabBg[1] === tabBg[2] && tabBg[0] !== tabBg[1], tabBg.join(' | '));
    await size(1366, 768);
    const tap1366 = await tap();
    check('Kamp (1366) TM: 44 px-reglen lækker ikke til computeren – "⋯ Mere", "ⓘ Om tavlen" og fanerne er lavere end 36 px', tap1366.more < 36 && tap1366.tavle < 36 && tap1366.tabs.every((x) => x < 36) && tap1366.play < 36 && tap1366.filters.every((x) => x < 36), JSON.stringify(tap1366));
    // Test Manager: afspilning og referat side om side fra 901 px, under hinanden til og med 899 px (breakpointet er 900)
    const gridAt = async (w) => { await size(w, 900); return p.evaluate(() => { const r = document.querySelector('#replay').getBoundingClientRect(), f = document.querySelector('#feed').getBoundingClientRect(); return { side: f.left >= r.right - 1 && f.top < r.bottom, stacked: f.top >= r.bottom - 1 }; }); };
    const g899 = await gridAt(899), g901 = await gridAt(901);
    check('Kamp TM: referatet står under tavlen ved 899 px og ved siden af den ved 901 px (breakpointet 900)', g899.stacked && !g899.side && g901.side && !g901.stacked, JSON.stringify({ g899, g901 }));
    // Test Manager: banens højde er clamp(16rem, 100svh − 26rem, 32rem) – de tre målte størrelser ligger alle i midten; her gulvet (844×390, liggende telefon) og loftet (1366×1000)
    const pitchAt = async (w, hh) => { await size(w, hh); return p.evaluate(() => { const r = document.querySelector('#rp-pitch').getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; }); };
    const pl = await pitchAt(844, 390), pt = await pitchAt(1366, 1000);
    check('R2 banen TM: gulv 16 rem = 256 px høj og 174 px bred ved 844×390 (liggende telefon), loft 32 rem = 512 px høj og 348 px bred ved 1366×1000', pl.h === 256 && Math.abs(pl.w - 174) <= 1 && pt.h === 512 && Math.abs(pt.w - 348) <= 1, JSON.stringify({ pl, pt }));
    await size(390, 844); await p.evaluate(() => window.scrollTo(0, 0));
    // Fuldtids-linjen: de to første sætninger af fuldtids-analysen – fast under stillingen i alle tre faner
    const ftWant = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), m = d.league.lastRound.matches[0], t = m.events.find((e) => e.type === 'FULLTIME').text.replace(/^📊 \[FULDTIDS-ANALYSE\] /, '').split(/(?<=\.)\s+/); return `📊 ${t[0]} ${t[2] ?? t[1]}`; });   // resultatet + den taktiske dom (3. sætning)
    const ft = {};
    // R3: hver fane viser KUN sit; fokus på fane-knappen bagefter (tastatur); fanen bevares ved skift af kamp
    const shows = () => p.evaluate(() => ({ feed: document.querySelectorAll('#feed').length, replay: document.querySelectorAll('#replay').length, stats: document.querySelectorAll('#match-stats').length, ratings: document.querySelectorAll('.ratings').length, legend: document.querySelectorAll('#icon-legend').length,
      active: document.querySelector('#mc-tabs button.active')?.id, pressed: document.querySelector('#mc-tabs button[aria-pressed="true"]')?.id, focus: document.activeElement?.id, ft: document.querySelector('#mc-ft')?.textContent, ftBelowScore: document.querySelector('#mc-ft').getBoundingClientRect().top >= document.querySelector('#timeline').getBoundingClientRect().bottom - 1 }));
    const sh = { replay: await shows() };
    await paneP('stats'); sh.stats = await shows();
    await paneP('players'); sh.players = await shows();
    for (const [k, v] of Object.entries(sh)) ft[k] = v.ft === ftWant && v.ftBelowScore;
    const want = { replay: [1, 1, 0, 0, 0], stats: [0, 0, 1, 0, 0], players: [0, 0, 0, 2, 1] };
    check('R3 underfanerne: 🎬 viser afspilning + referat, 📊 kun statistikken, 👥 kun karakterarkene + forklaringen – intet andet', Object.entries(want).every(([k, w]) => JSON.stringify([sh[k].feed, sh[k].replay, sh[k].stats, sh[k].ratings, sh[k].legend]) === JSON.stringify(w)), JSON.stringify(sh));
    check('R3 underfanerne: den valgte er aktiv og aria-pressed, og fokus står på dens knap efter skiftet', sh.replay.active === 'mc-tab-replay' && sh.stats.active === 'mc-tab-stats' && sh.stats.pressed === 'mc-tab-stats' && sh.stats.focus === 'mc-tab-stats' && sh.players.focus === 'mc-tab-players', JSON.stringify(sh));
    check('R3 fuldtids-linjen: "📊 <resultat>. <taktisk dom>" (opbygning/pres – ikke boldbesiddelsen) står under tidslinjen i alle tre faner', Object.values(ft).every(Boolean) && /^📊 (Sejr|Nederlag|Uafgjort) \d+-\d+.*\. (Din opbygning|Dit pres)/.test(ftWant) && !ftWant.includes('af bolden') && !ftWant.includes('Dødbolde'), `${ftWant} | ${JSON.stringify(ft)}`);
    check('R4 kampvælgeren (390) TM: fade\'et står stadig efter fanebyt (renderMc måler de nye tabeller forfra)', await p.evaluate(() => document.querySelector('#match-cards').closest('.tablewrap').dataset.more === 'ja'));
    await p.click('#match-cards .matchcard:nth-child(2)');
    check('R3: fanen bevares, når en anden af rundens kampe vælges', (await p.locator('#mc-tab-players.active').count()) === 1 && (await p.locator('#match-cards .matchcard:nth-child(2).active').count()) === 1 && (await p.locator('.ratings').count()) === 2);
    check('R4 kampvælgeren (390) TM: ... og efter valg af en anden kamp', await p.evaluate(() => document.querySelector('#match-cards').closest('.tablewrap').dataset.more === 'ja'));
    // openReport lander rigtigt – altid første fane med netop den kamp, også fra "👥 Spillerne"
    const land = () => p.evaluate(() => { const f = document.getElementById('feed')?.getBoundingClientRect(), bar = document.querySelector('#playbar').getBoundingClientRect().top, nav = document.querySelector('.tabbar').getBoundingClientRect();
      const free = innerWidth <= 600 ? Math.min(bar, nav.top) : bar;
      return { tab: document.querySelector('#tabs .tab.active')?.id, pane: document.querySelector('#mc-tabs button.active')?.id, card: [...document.querySelectorAll('#match-cards .matchcard')].findIndex((x) => x.classList.contains('active')), score: document.querySelector('#scoreboard strong').textContent,
        feedTop: f ? Math.round(f.top) : null, free: Math.round(free), y: Math.round(scrollY), play: Math.round(document.getElementById('rp-play')?.getBoundingClientRect().bottom ?? -1) }; });
    const names = await p.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches.map((m) => m.homeName));
    await tt('liga'); await p.locator('#last-round .fixture').nth(2).click(); await p.waitForSelector('.tabpane.tab-kamp'); await settle();
    const fromLiga = await land();
    const ligaFeed = await p.evaluate(() => { const f = document.getElementById('feed').getBoundingClientRect(), bar = document.querySelector('#playbar').getBoundingClientRect().top, nav = document.querySelector('.tabbar').getBoundingClientRect().top; return { top: Math.round(f.top), bottom: Math.round(f.bottom), free: Math.round(Math.min(bar, nav)) }; });
    check('openReport fra Liga (390) TM: referatet rulles helt frem OVER Spil-bjælken og bundnavigationen (scroll-margin) – ikke skjult bag dem', ligaFeed.top >= 0 && ligaFeed.bottom <= ligaFeed.free + 1, JSON.stringify(ligaFeed));
    await paneP('stats'); await tt('liga'); await p.locator('#col-others .col-match').first().click(); await p.waitForSelector('.tabpane.tab-kamp'); await settle();
    const fromPaper = await land();
    const paperIdx = await p.evaluate(() => [...document.querySelectorAll('#match-cards .matchcard')].findIndex((x) => x.classList.contains('active')));
    await paneP('players'); await tt('hjem'); await p.click('#home-kamp'); await p.waitForSelector('.tabpane.tab-kamp'); await settle();
    const fromHome = await land();
    check('openReport fra Liga (390): Kamp, fanen 🎬 Afspilning & referat, netop kamp 3 – og referatet er rullet frem over bjælkerne', fromLiga.tab === 'tab-kamp' && fromLiga.pane === 'mc-tab-replay' && fromLiga.card === 2 && fromLiga.score === names[2] && fromLiga.feedTop >= 0 && fromLiga.feedTop < fromLiga.free - 40, JSON.stringify(fromLiga));
    check('openReport fra avisen (fra fanen 📊): tilbage i 🎬 Afspilning & referat med avisens kamp (ikke din)', fromPaper.pane === 'mc-tab-replay' && paperIdx > 0 && fromPaper.score === names[paperIdx] && fromPaper.feedTop < fromPaper.free - 40, JSON.stringify({ fromPaper, paperIdx }));
    check('Hjem "Se kampen ›" (fra fanen 👥): 🎬 Afspilning & referat med din kamp – øverst, ▶ Afspil på første skærm', fromHome.pane === 'mc-tab-replay' && fromHome.card === 0 && fromHome.y === 0 && fromHome.play > 0 && fromHome.play <= fromHome.free, JSON.stringify(fromHome));
    await size(1366, 768); await paneP('players'); await tt('hjem'); await p.click('#home-kamp'); await p.waitForSelector('.tabpane.tab-kamp'); await settle();
    const home1366 = await land();
    check('Hjem "Se kampen ›" (1366×768): ▶ Afspil og referatet står begge på første skærm', home1366.pane === 'mc-tab-replay' && home1366.card === 0 && home1366.play <= home1366.free && home1366.feedTop < home1366.free - 100, JSON.stringify(home1366));
    // Test Manager: openReport ved 1366×768 (Liga → kamp 3) ruller kun lige nok ('nearest') – tavlen og ▶ bliver på skærmen, siden hopper ikke til referatets top
    await size(1366, 768); await tt('liga'); await p.evaluate(() => window.scrollTo(0, 0)); await p.locator('#last-round .fixture').nth(2).click(); await p.waitForSelector('.tabpane.tab-kamp'); await settle();
    const lig1366 = await land();
    check('openReport fra Liga (1366×768) TM: kun lige nok rulning – ▶ Afspil og referatet står begge på skærmen (ikke rullet til referatets top)', lig1366.card === 2 && lig1366.pane === 'mc-tab-replay' && lig1366.play > 0 && lig1366.play <= lig1366.free && lig1366.feedTop >= 0 && lig1366.feedTop < lig1366.free - 100 && lig1366.y < 250, JSON.stringify(lig1366));   // 'nearest' ≈ 171 px (med botkampens pladsholder for fuldtids-linjen; før < 150); 'start' (fejlen) ≈ 350 px
    // Test Manager: fanen sætter fokus på sin knap UDEN at rulle siden (preventScroll) – også når knappen står under folden (390×360)
    await size(390, 360); await p.evaluate(() => window.scrollTo(0, 0)); await settle();
    const fo0 = await p.evaluate(() => ({ y: scrollY, tabTop: Math.round(document.querySelector('#mc-tab-stats').getBoundingClientRect().top), ih: innerHeight }));
    await p.evaluate(() => document.querySelector('#mc-tab-stats').click()); await p.waitForSelector('#mc-tab-stats.active'); await settle();
    const fo1 = await p.evaluate(() => ({ y: scrollY, focus: document.activeElement?.id }));
    check('R3 fokus TM: et klik på underfanen (nede under folden ved 390×360) flytter fokus til knappen uden at rulle siden', fo0.y === 0 && fo0.tabTop > fo0.ih - 120 && fo1.focus === 'mc-tab-stats' && fo1.y === 0, JSON.stringify({ fo0, fo1 }));
    await paneP('replay'); await size(1366, 768);
    // Fra spillerkortets kampe (📺 ved seneste kamp): samme indgang
    await paneP('stats'); await tt('trup');
    const pid = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot); return me.tactics.lineupSlots[5]; });
    await p.click(`#matrix tr[data-pid="${pid}"]`); await p.waitForSelector('#cardpanel .log-open');
    await p.click('#cardpanel .log-open'); await p.waitForSelector('.tabpane.tab-kamp'); await settle();
    const fromCard = await land();
    check('openReport fra spillerkortet (📺, fra fanen 📊): 🎬 Afspilning & referat med hans kamp (din)', fromCard.tab === 'tab-kamp' && fromCard.pane === 'mc-tab-replay' && fromCard.card === 0, JSON.stringify(fromCard));
    // "Statistik"s standard-åbne fold (Liga) husker lukket over gentegning (QC: "husker lukket eksplicit")
    await tt('liga'); await p.click('#stats-players > summary'); await tt('trup'); await tt('liga');
    check('Liga-statistikkens "Spillere" (åben fra start) bliver lukket, når den er lukket – også efter fanebyttet', (await p.getAttribute('#stats-players', 'open')) === null);
    // Test Manager: Klub-regnskabet (390) – Runde står fast i venstre kant (krop og overskrift), også rullet til enden
    await size(390, 844); await tt('klub');
    const led = await p.evaluate(() => { const w = document.querySelector('#ledger').closest('.tablewrap'); w.scrollLeft = w.scrollWidth; w.dispatchEvent(new Event('scroll'));
      return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => { const l = w.getBoundingClientRect().left, td = document.querySelector('#ledger tbody td.stick-1'), th = document.querySelector('#ledger thead th.stick-1');
        res({ scroll: w.dataset.scroll ?? null, stick: w.dataset.stick ?? null, more: w.dataset.more ?? null, td: Math.round(td.getBoundingClientRect().left - l), th: Math.round(th.getBoundingClientRect().left - l), tdPos: getComputedStyle(td).position, thPos: getComputedStyle(th).position, rows: document.querySelectorAll('#ledger tbody tr').length, sw: w.scrollWidth, cw: w.clientWidth }); }))); });
    check('R4 Klub-regnskabet (390): Runde står fast i venstre kant (krop og overskrift), også rullet til enden – og fade\'et er væk', led.scroll === 'ja' && led.stick === 'alle' && led.more === null && led.rows >= 1 && led.tdPos === 'sticky' && led.thPos === 'sticky' && Math.abs(led.td) <= 2 && Math.abs(led.th) <= 2, JSON.stringify(led));
    check('v3.32.1-blokken: ingen sidefejl', egne.length === 0, egne.join(' | '));
    await c.close();
  }

  // ---------- v3.32.2: VAR-øjeblikket og spilfornemmelsen – lyd, CSS-animationer, reduceret bevægelse, 44 px (deterministiske dele) ----------
  // Rammen, loggen, pausen og fx'enes regler er bundet i tests/unit/var-moment-v3322.test.mjs (runden her er tilfældig – VAR er ikke givet).
  {
    // AudioContext stubbes og tælles: med lyd fra (standard) må den ALDRIG oprettes – heller ikke ved ▶ Spil runde
    const stubAC = () => {
      window.__acNew = 0;
      const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {} });
      window.AudioContext = class { constructor() { window.__acNew++; this.state = 'running'; this.currentTime = 0; this.destination = {}; }
        createOscillator() { return { type: '', frequency: param(), connect() {}, start() {}, stop() {} }; } createGain() { return { gain: param(), connect() {} }; } resume() { return Promise.resolve(); } };
      window.webkitAudioContext = window.AudioContext;
    };
    const fxNames = (p) => p.evaluate(() => {
      const box = document.createElement('div'); box.id = 'u-fx'; document.body.append(box);
      const out = {};
      for (const c of ['fx-shake', 'fx-flash-bad', 'fx-flash-good', 'var-mark']) { const e = document.createElement('div'); e.className = c; box.append(e); const cs = getComputedStyle(e); out[c] = { name: cs.animationName, ms: parseFloat(cs.animationDuration) * 1000, shadow: cs.boxShadow }; }
      box.remove(); return out;
    });
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } }); await c.addInitScript(stubAC);
    const p = await c.newPage(), egne = []; p.on('pageerror', (e) => egne.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('body[data-klar="ja"]');
    await p.click('#play-round'); await p.waitForSelector('#skip');
    const s0 = await p.evaluate(() => ({ ac: window.__acNew, pressed: document.getElementById('sound-toggle')?.getAttribute('aria-pressed'), key: localStorage.getItem('tactivar_sound'), txt: document.getElementById('sound-toggle')?.textContent }));
    check('v3.32.2 lyd: FRA som standard – ▶ Spil runde opretter ingen AudioContext, kontakten står ved ⚡ som "🔇 Lyd fra"', s0.ac === 0 && s0.pressed === 'false' && s0.key === null && s0.txt === '🔇 Lyd fra', JSON.stringify(s0));
    const hts = await p.evaluate(() => {
      const b = document.createElement('button'); b.id = 'var-show'; b.className = 'mini'; b.textContent = 'Vis kendelsen ›'; document.getElementById('match-center').append(b);
      const r = Object.fromEntries(['skip', 'sound-toggle', 'var-show'].map((id) => [id, Math.round(document.getElementById(id).getBoundingClientRect().height)]));
      b.remove(); const row = document.getElementById('skip').parentElement; r.sameRow = row.contains(document.getElementById('sound-toggle')); return r;
    });
    check('v3.32.2 (390): ⚡ Spring til slutfløjt, lydkontakten og "Vis kendelsen ›" er ≥ 44 px høje (⚡ før 23 px) – kontakten i ⚡\'s række', hts.skip >= 44 && hts['sound-toggle'] >= 44 && hts['var-show'] >= 44 && hts.sameRow, JSON.stringify(hts));
    const save0 = await p.evaluate(() => localStorage.getItem('tactivar_save'));
    await p.click('#sound-toggle');
    const s1 = await p.evaluate(() => ({ ac: window.__acNew, pressed: document.getElementById('sound-toggle')?.getAttribute('aria-pressed'), key: localStorage.getItem('tactivar_sound'), save: localStorage.getItem('tactivar_save') }));
    check('v3.32.2 lyd: kontakten slår lyden til (AudioContext oprettes i klikket), husker under tactivar_sound – og ligaens gem er uændret', s1.ac === 1 && s1.pressed === 'true' && s1.key === '1' && s1.save === save0, JSON.stringify({ ...s1, save: s1.save === save0 }));
    await p.click('#skip'); await p.waitForSelector('.to-home');
    await p.reload(); await p.waitForSelector('body[data-klar="ja"]');
    if (!(await p.locator('#match-center').count())) { await p.click('#tab-kamp'); await p.waitForSelector('#match-center'); }
    const s2 = await p.evaluate(() => ({ pressed: document.getElementById('sound-toggle')?.getAttribute('aria-pressed'), ac: window.__acNew }));
    check('v3.32.2 lyd: valget huskes over genindlæsning (kontakten også efter fløjtet) – og ingen AudioContext før næste klik', s2.pressed === 'true' && s2.ac === 0, JSON.stringify(s2));
    await p.click('#sound-toggle');
    check('v3.32.2 lyd: slået fra igen → "0" under nøglen', (await p.evaluate(() => localStorage.getItem('tactivar_sound'))) === '0' && (await p.getAttribute('#sound-toggle', 'aria-pressed')) === 'false');
    const anim = await fxNames(p);
    check('v3.32.2 CSS: uden reduceret bevægelse har rystelse, flash (rød/grøn) og VAR-pulsen en animation – rystelse og flash ≤ 400 ms (gentegningen hvert 420 ms skærer dem ikke over)',
      anim['fx-shake'].name === 'fx-shake' && anim['fx-flash-bad'].name === 'fx-flash-bad' && anim['fx-flash-good'].name === 'fx-flash-good' && anim['var-mark'].name === 'var-pulse'
      && ['fx-shake', 'fx-flash-bad', 'fx-flash-good'].every((k) => anim[k].ms > 0 && anim[k].ms <= 400), JSON.stringify(anim));
    check('v3.32.2: #live-status (aria-live="polite") findes ved fejlboksen', (await p.getAttribute('#live-status', 'aria-live')) === 'polite');
    check('v3.32.2-blokken (lyd/CSS): ingen sidefejl og ingen fejlboks', egne.length === 0 && (await p.locator('#fejlboks:not([hidden])').count()) === 0, egne.join(' | '));
    await c.close();
    // Reduceret bevægelse (ny browserkontekst): ingen animation – flashen er en statisk kant i samme farve
    const cr = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), pr = await cr.newPage();
    await pr.goto(BASE + '/'); await pr.waitForSelector('body[data-klar="ja"]');
    const red = await fxNames(pr);
    check('v3.32.2 CSS (prefers-reduced-motion: reduce): ingen rystelse, ingen puls, ingen flash-animation – flashen er en statisk kant (rød/grøn)',
      Object.values(red).every((x) => x.name === 'none') && /239, 68, 68/.test(red['fx-flash-bad'].shadow) && /16, 185, 129/.test(red['fx-flash-good'].shadow), JSON.stringify(red));
    await cr.close();
    // Uden AudioContext (ældre browser) og med lyden slået til: ingen lyd, ingen fejlboks, ingen sidefejl
    const cn = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await cn.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; try { localStorage.setItem('tactivar_sound', '1'); } catch { /* intet */ } });
    const pn = await cn.newPage(), egneN = []; pn.on('pageerror', (e) => egneN.push(e.message));
    await pn.goto(BASE + '/'); await pn.waitForSelector('body[data-klar="ja"]');
    await pn.click('#play-round'); await pn.waitForSelector('#skip'); await pn.waitForTimeout(1500);
    await pn.click('#sound-toggle'); await pn.click('#sound-toggle'); await pn.click('#skip'); await pn.waitForSelector('.to-home');
    check('v3.32.2 lyd uden AudioContext: runden spiller, kontakten virker – ingen fejlboks og ingen sidefejl', egneN.length === 0 && (await pn.locator('#fejlboks:not([hidden])').count()) === 0 && (await pn.getAttribute('#sound-toggle', 'aria-pressed')) === 'true', egneN.join(' | '));
    await cn.close();
  }

  // ---------- v3.32.2 TM: VAR-øjeblikket tick for tick (deterministisk: seedet Math.random, tvungne VAR-tjek, falsk klokke) ----------
  // Rammen, pausen, #live-status, fx-klasserne og lyden følger HVER hændelse i runden (gemt FØR afspilningen) – målt mod gemmets egne
  // hændelser, ikke mod appens hjælpefunktioner. VAR_RULES tvinges via en route på match-rules.js (kontrolleret mod "ikke fundet").
  {
    const FORCED = { GOAL_CHECK_P: 1, GOAL_FOUL_SHARE: 0.27, OFFSIDE_FLAG_P: 0.043, PEN_CHECK_P: 1, PEN_OFFSIDE_SHARE: 0.31, PEN_AWARD_P: 0.02, RED_CHECK_P: 1, RED_UPGRADE_P: 0.5 };
    const T0 = Date.UTC(2026, 0, 1, 10, 0, 0), TICK = 420;
    const STARTS = new Set(['VAR_CHECK', 'VAR_PEN', 'VAR_RED']);
    const oneStepOf = (e) => (e.type === 'VAR_PEN' && e.var?.verdict === 'AWARDED') || (e.type === 'VAR_RED' && e.var?.verdict === 'UPGRADED');
    // v3.32.2-rettelsen (QC/Spilfører UI): kendelsen nævner holdet (t) og er grøn for dit hold, når den er god for det (GOOD: for holdet selv)
    const gen = (n) => (/[sxz]$/i.test(n) ? `${n}'` : `${n}s`);
    const VERDICT = { 'VAR_CHECK:STANDS': (t) => `✅ ${gen(t)} mål står`, 'VAR_CHECK:OVERTURNED': (t) => `❌ ${gen(t)} mål annulleret`, 'VAR_PEN:STANDS': (t) => `✅ Straffen til ${t} står`, 'VAR_PEN:OVERTURNED': (t) => `❌ Ingen straffe til ${t}`,
      'VAR_RED:CONFIRMED': (t) => `🟥 Rødt til ${t} står`, 'VAR_RED:DOWNGRADED': (t) => `🟨 Rødt til ${t} bliver gult`, 'VAR_RED:UPGRADED': (t) => `🟥 Opgraderet: rødt til ${t}` };
    const GOOD = { STANDS: true, AWARDED: true, OVERTURNED: false, CONFIRMED: false, UPGRADED: false, DOWNGRADED: true };
    const CLOSES = new Set(['GOAL', 'HEADER_GOAL', 'RED']);
    const QUESTION = { OFFSIDE: 'offside?', FOUL: 'skub i opspillet?', DIVE: 'filmning?', RED: 'rødt kort?' };
    const GOALS = new Set(['GOAL', 'HEADER_GOAL']);
    // Falsk klokke + seedet Math.random + AudioContext-stub, der logger toner og stop (stop() UDEN argument = stopSounds)
    const mk = async ({ sound = false, acState = 'running', width = 1280, height = 900, seedA = 0x9e3779b9 } = {}) => {
      const c = await browser.newContext({ viewport: { width, height } });
      await c.addInitScript(({ sound, acState, seedA }) => {
        let a = seedA;
        Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        if (sound) { try { localStorage.setItem('tactivar_sound', '1'); } catch { /* intet */ } }
        const ac = window.__ac = { n: 0, resumes: 0, tones: [], stopsNow: [] };
        const param = (o) => ({ setValueAtTime(f) { o.f ??= f; }, linearRampToValueAtTime() {} });
        window.AudioContext = class { constructor() { ac.n++; this.state = acState; this.currentTime = 0; this.destination = {}; }
          resume() { ac.resumes++; this.state = 'running'; return Promise.resolve(); }
          createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
          createOscillator() { const o = { id: ac.tones.length, type: '', connect() {}, start() {}, stop(t) { if (t === undefined) ac.stopsNow.push(o.id); } }; o.frequency = param(o); ac.tones.push(o); return o; } };
        window.webkitAudioContext = window.AudioContext;
        window.__live = [];
        document.addEventListener('DOMContentLoaded', () => {
          const box = document.getElementById('live-status');
          new MutationObserver(() => window.__live.push(box.textContent)).observe(box, { childList: true, characterData: true, subtree: true });
        });
      }, { sound, acState, seedA });
      await c.route(/match-rules\.js/, async (route) => {
        const r = await route.fetch(), body = await r.text(), re = /export const VAR_RULES = Object\.freeze\(\{[^}]*\}\);/;
        if (!re.test(body)) throw new Error('VAR_RULES ikke fundet i match-rules.js');
        await route.fulfill({ response: r, body: body.replace(re, `export const VAR_RULES = Object.freeze(${JSON.stringify(FORCED)});`) });
      });
      await c.clock.install({ time: T0 });
      const p = await c.newPage(), egne = []; p.on('pageerror', (e) => egne.push(e.message)); p.on('dialog', (d) => d.accept());
      await p.goto(BASE + '/'); await p.waitForSelector('body[data-klar="ja"]');
      await p.clock.pauseAt(T0 + 60000);
      return { c, p, egne };
    };
    const snap = (p) => p.evaluate(() => {
      const $ = (s) => document.querySelector(s), fr = $('#var-frame'), r = (e) => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right }; };
      const board = $('#mc-board'), sb = $('#scoreboard'), tl = $('#mc-board .timeline');
      const ac = window.__ac;
      return {
        playing: !!$('#skip'), score: $('#score')?.textContent ?? null, scoreCls: $('#score')?.className ?? '', boardCls: board?.className ?? '', minute: $('#minute')?.textContent ?? null,
        card0: $('#match-cards .matchcard')?.textContent ?? null,
        frame: fr ? { role: fr.getAttribute('role'), label: fr.getAttribute('aria-label'), cls: fr.className,
          tones: [...fr.querySelectorAll('#var-log li')].map((li) => li.dataset.tone ?? ''), liColor: [...fr.querySelectorAll('#var-log li')].map((li) => getComputedStyle(li).color),
          vbox: (() => { const v = fr.querySelector('#var-log li.verdict'); return v ? r(v) : null; })(), need: Math.max(...[...fr.children].map((x) => x.getBoundingClientRect().bottom)) - fr.getBoundingClientRect().top + 2, cH: fr.getBoundingClientRect().height, tabindex: fr.getAttribute('tabindex'), lines: [...fr.querySelectorAll('#var-log li')].map((li) => li.textContent), show: !!fr.querySelector('#var-show'), btn: fr.querySelector('#var-show') ? r(fr.querySelector('#var-show')) : null,
          delay: parseFloat(fr.querySelector('.var-mark').style.animationDelay), kind: fr.dataset.kind, verdict: fr.dataset.verdict, box: r(fr),
          border: getComputedStyle(fr).borderTopColor, bg: getComputedStyle(fr).backgroundColor, weights: [...fr.querySelectorAll('#var-log li')].map((li) => +getComputedStyle(li).fontWeight), sizes: [...fr.querySelectorAll('#var-log li')].map((li) => parseFloat(getComputedStyle(li).fontSize)),
          hit: (() => { const q = r(sb), el = document.elementFromPoint((q.l + q.r) / 2, (q.t + q.b) / 2); return !!el?.closest('#var-frame'); })(),
          // stillingen og minuttet er ALTID synlige: elementet midt i #score/#minute er elementet selv (eller dets tekst) – ikke rammen
          scoreHit: ['score', 'minute'].every((id) => { const x = document.getElementById(id), q = r(x), el = document.elementFromPoint((q.l + q.r) / 2, (q.t + q.b) / 2); return el === x || x.contains(el); }),
          ff: $('#feed-filters') ? r($('#feed-filters')).t : null } : null,
        names: [$('#scoreboard strong')?.textContent ?? '', $('#scoreboard .right strong')?.textContent ?? ''],
        stray: [...document.querySelectorAll('#match-center [role="status"], #match-center [aria-live]')].length,
        geo: board ? { board: r(board), sb: r(sb), tl: tl ? r(tl) : null, next: board.nextElementSibling ? board.nextElementSibling.getBoundingClientRect().top : null } : null,
        scoreOp: $('#score') ? +getComputedStyle($('#score')).opacity : null,
        sr: (() => { const q = document.getElementById('live-status').getBoundingClientRect(); return { w: q.width, h: q.height, pos: getComputedStyle(document.getElementById('live-status')).position }; })(),
        live: document.getElementById('live-status').textContent, active: document.activeElement?.id ?? '',
        tones: ac.tones.map((o) => [o.f, o.type]), stopsNow: ac.stopsNow.length, ac: ac.n, resumes: ac.resumes, liveWrites: window.__live.length,
      };
    });
    const oracle = (p) => p.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('tactivar_save')), m = s.league.lastRound.matches[0];
      return { events: m.events.map((e) => ({ type: e.type, isHome: e.isHome, hG: e.hG, aG: e.aG, text: e.text, var: e.var ?? null })), homeId: m.homeId, awayId: m.awayId, homeName: m.homeName, awayName: m.awayName, mine: s.league.teams.find((t) => !t.isBot).id };
    });
    const ticks = async (p, n) => { for (let i = 0; i < n; i++) await p.clock.runFor(TICK); };

    // ---- A: en hel runde med lyd til, tick for tick (1280 px, AudioContext starter 'suspended') ----
    const A = await mk({ sound: true, acState: 'suspended' });
    {
      const { p, egne } = A;
      await p.click('#play-round');
      const D = await oracle(p), evs = D.events, n = evs.length, own = (home) => (home ? D.homeId : D.awayId) === D.mine;
      // Lukke-reglen (v3.32.2-rettelsen): et nyt GOAL/HEADER_GOAL/RED EFTER kendelsen lukker rammen før de 5 tick
      const frameOf = (L, close = true) => { for (let s = L; s >= Math.max(0, L - 6); s--) { const e = evs[s]; if (!STARTS.has(e.type) || !e.var) continue; const one = oneStepOf(e), v = one ? s : s + 1 < n ? s + 1 : null;
        if (L > (v ?? s) + 5) return null; if (close) for (let j = (v ?? s) + (one ? 2 : 1); j <= L; j++) if (CLOSES.has(evs[j].type)) return null; return { s, one, v, e, reached: v != null && L >= v }; } return null; };
      const teamOf = (home) => (home ? D.homeName : D.awayName);
      const F = { frame: [], score: [], fx: [], tone: [], hold: [], delay: [], geo: [], css: [], vtone: [] }, seen = { two: 0, one: 0, oneKept: 0, hold: 0, ownGoalTicks: 0, flash: 0, pendingTicks: 0, bip: 0, closed: 0, good: 0, bad: 0 };
      const s0 = await snap(p), startAc = { n: s0.ac, resumes: s0.resumes, tones: s0.tones };
      const expectedLive = []; let said = null, prev = s0, L = 0, hold = 0, t0 = { s: null, tick: 0 }, base = null;
      const verify = (L, snapNow, step, tick, before) => {
        const e = evs[L], fr = frameOf(L), pend = !!fr && fr.e.type === 'VAR_CHECK' && !fr.reached, tag = `t${tick} L${L} ${e.type}`;
        if (step === 'hold') {   // pausen: INTET tegnes om – stillingen, minuttet og rammen er uændrede, ingen nye toner
          for (const k of ['score', 'minute', 'card0', 'scoreCls', 'boardCls']) if (snapNow[k] !== before[k]) F.hold.push(`${tag} ${k}: ${before[k]} -> ${snapNow[k]}`);
          if (JSON.stringify(snapNow.frame?.lines) !== JSON.stringify(before.frame?.lines)) F.hold.push(`${tag} ramme ændret`);
          if (snapNow.tones.length !== before.tones.length) F.hold.push(`${tag} tone i pausen`);
          if (snapNow.liveWrites !== before.liveWrites) F.hold.push(`${tag} #live-status skrevet i pausen`);
          seen.hold++; return;
        }
        if (!fr) { if (snapNow.frame) F.frame.push(`${tag} ramme uden VAR`); }
        else if (!snapNow.frame) F.frame.push(`${tag} ramme mangler (tjek ${fr.s})`);
        else {
          const f = snapNow.frame, lines = f.lines;
          if (f.role !== 'group' || f.label !== 'VAR-tjek' || f.tabindex !== '-1') F.frame.push(`${tag} role/aria-label/tabindex ${f.role}/${f.label}/${f.tabindex}`);
          if (snapNow.stray !== 0) F.frame.push(`${tag} ${snapNow.stray} role=status/aria-live i Match Center (#live-status er eneste annoncør)`);
          if (f.cls.split(' ').includes('reached') !== fr.reached) F.frame.push(`${tag} reached-klasse ${f.cls} vs ${fr.reached}`);
          if (f.show !== (!fr.reached && !fr.one)) F.frame.push(`${tag} "Vis kendelsen ›" ${f.show} vs ${!fr.reached && !fr.one}`);
          if (f.kind !== fr.e.var.kind || f.verdict !== (fr.reached ? fr.e.var.verdict : '')) F.frame.push(`${tag} data ${f.kind}/${f.verdict}`);
          const first = fr.e.type === 'VAR_PEN' && fr.e.var.verdict === 'AWARDED' ? `📺 Straffe til ` : fr.one ? '📺 VAR kalder dommeren ud: rødt kort?' : `📺 VAR tjekker: ${QUESTION[fr.e.var.kind]}`;
          if (!lines[0]?.startsWith(first)) F.frame.push(`${tag} første linje "${lines[0]}" vs "${first}"`);
          const verdictRe = /^(✅|❌|🟨|🟥 Rødt står)/;
          if (fr.reached && !fr.one) { const want = VERDICT[`${fr.e.type}:${fr.e.var.verdict}`](teamOf(fr.e.isHome)); if (lines.at(-1) !== want) F.frame.push(`${tag} kendelse "${lines.at(-1)}" vs "${want}"`); if (lines.length < 2) F.frame.push(`${tag} for få linjer`); }
          // tonen: KUN kendelseslinjen (den sidste – den første ved dømt straffe) er farvet, grøn hvis god for DIT hold
          const vi = fr.e.type === 'VAR_PEN' && fr.e.var.verdict === 'AWARDED' ? 0 : fr.reached ? lines.length - 1 : -1;
          const wantTone = vi < 0 ? null : GOOD[fr.e.var.verdict] === own(fr.e.isHome) ? 'good' : 'bad';
          const toneNow = f.tones.map((t) => t.replace('v-', ''));
          if (JSON.stringify(toneNow) !== JSON.stringify(lines.map((_, i) => (i === vi ? wantTone : '')))) F.vtone.push(`${tag} toner ${JSON.stringify(toneNow)} vs ${wantTone}@${vi}`);
          if (vi >= 0 && f.liColor[vi] !== (wantTone === 'good' ? 'rgb(110, 231, 183)' : 'rgb(252, 165, 165)')) F.vtone.push(`${tag} farve ${f.liColor[vi]} (${wantTone})`);
          if (vi >= 0) seen[wantTone]++;
          if (!fr.reached && lines.some((l) => verdictRe.test(l) || /annulleret|står$|Ingen straffe|bliver gult/.test(l))) F.frame.push(`${tag} kendelse for tidligt: ${lines}`);
          if (fr.one && fr.e.type === 'VAR_RED' && lines.at(-1) !== VERDICT['VAR_RED:UPGRADED'](teamOf(fr.e.isHome))) F.frame.push(`${tag} ét-trins rødt: ${lines}`);
          if (fr.one && fr.e.type === 'VAR_PEN' && lines[0] !== `📺 Straffe til ${teamOf(fr.e.isHome)}`) F.frame.push(`${tag} ét-trins straffe: ${lines}`);
          if (lines.some((l) => l === fr.e.text || (evs[fr.v ?? fr.s].text && l === evs[fr.v ?? fr.s].text))) F.frame.push(`${tag} ev.text i rammen`);
          if (t0.s !== fr.s) t0 = { s: fr.s, tick };
          const wantDelay = -(((tick - t0.tick) * TICK) % 1000);
          if (Math.abs(f.delay - wantDelay) > 1) F.delay.push(`${tag} delay ${f.delay} vs ${wantDelay}`);
          const g = snapNow.geo;
          // v3.32.2-rettelsen: rammen står UNDER stillingen (over tidslinjen), inden i tavlen – stillingen og minuttet er altid synlige
          if (!(f.box.t >= g.sb.b - 1 && f.box.t <= g.tl.t + 1 && f.box.b >= g.tl.b - 1 && f.box.l >= g.board.l - 1 && f.box.r <= g.board.r + 1)) F.geo.push(`${tag} ramme ${JSON.stringify(f.box)} vs stilling ${JSON.stringify(g.sb)} / tidslinje ${JSON.stringify(g.tl)}`);
          if (f.hit || !f.scoreHit) F.geo.push(`${tag} rammen dækker stillingen/minuttet`);
          if (f.ff == null || f.box.b > f.ff + 0.5) F.geo.push(`${tag} rammen løber ind over filterrækken: ${f.box.b} > ${f.ff}`);
          if (f.box.r - f.box.l > 704.5) F.geo.push(`${tag} rammen er ${f.box.r - f.box.l} px bred (> 44rem)`);
          if (f.need > f.cH + 0.5) F.geo.push(`${tag} indholdet (${f.need}) er højere end rammen (${f.cH}) – klippet`);
          if (f.vbox && (f.vbox.b > f.box.b + 0.5 || f.vbox.t < f.box.t)) F.geo.push(`${tag} kendelseslinjen står uden for rammen`);
          if (f.btn && f.box.r - f.btn.r > 16) F.geo.push(`${tag} "Vis kendelsen ›" står ikke til højre: ${f.box.r} vs ${f.btn.r}`);
          if (base != null && Math.abs(g.next - base) > 1) F.geo.push(`${tag} siden skubbet: ${base} -> ${g.next}`);
          const key = `${fr.s}:${fr.reached}`;
          if (key !== said) { said = key; expectedLive.push(fr.reached ? lines.at(-1) : lines[0]); }
          if (fr.one) seen.one++; else if (fr.reached && fr.v === L) seen.two++;
          if (fr.one && L === fr.v + 1 && CLOSES.has(evs[L].type)) seen.oneKept++;   // ét-trins: følgen (straffemål/RED) lukker IKKE rammen (QC/Spilfører UI v3.32.2)
        }
        if (!fr && frameOf(L, false)) seen.closed++;   // lukket før tid af et nyt mål/rødt (tælles i data-tjekket)
        if (!fr && base == null && snapNow.geo) base = snapNow.geo.next;
        if (snapNow.sr.w > 1 || snapNow.sr.h > 1 || snapNow.sr.pos !== 'absolute') F.css.push(`${tag} #live-status er synlig: ${JSON.stringify(snapNow.sr)}`);
        if (fr && snapNow.frame) {
          const f = snapNow.frame, REACHED = 'rgb(196, 181, 253)', alpha = +(f.bg.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1);
          if ((f.border === REACHED) !== fr.reached) F.css.push(`${tag} kantfarve ${f.border} (reached ${fr.reached})`);
          if (!(alpha >= 0.9) || f.bg === 'rgba(0, 0, 0, 0)') F.css.push(`${tag} rammens baggrund ${f.bg}`);
          const w = f.weights, z = f.sizes;
          if (fr.reached ? !(w.at(-1) >= 800 && z.at(-1) > z[0] && (w.length < 2 || w[0] >= 700)) : !(w[0] >= 700 && w.slice(1).every((x) => x <= 500))) F.css.push(`${tag} skrifttyper ${w} / ${z}`);
        }
        const wantScore = `${e.hG} - ${e.aG}${pend ? ' ?' : ''}`;
        if (snapNow.score !== wantScore) F.score.push(`${tag} score "${snapNow.score}" vs "${wantScore}"`);
        if ((snapNow.scoreOp < 0.9) !== pend) F.css.push(`${tag} score-opacitet ${snapNow.scoreOp} vs pend ${pend}`);
        if (snapNow.scoreCls.split(' ').includes('score-pending') !== pend) F.score.push(`${tag} score-pending ${snapNow.scoreCls} vs ${pend}`);
        if (/\d-\d \?/.test(snapNow.card0 ?? '') !== pend) F.score.push(`${tag} kampkortet "${snapNow.card0}" vs pend ${pend}`);
        if (pend) seen.pendingTicks++;
        const shake = (GOALS.has(e.type) && own(e.isHome)) || e.type === 'RED';
        const flash = e.type === 'VAR_NO_GOAL' ? (own(e.isHome) ? 'fx-flash-bad' : 'fx-flash-good') : null;
        if (snapNow.scoreCls.split(' ').includes('fx-shake') !== shake) F.fx.push(`${tag} shake ${snapNow.scoreCls} vs ${shake}`);
        const flashNow = ['fx-flash-bad', 'fx-flash-good'].filter((k) => snapNow.boardCls.split(' ').includes(k));
        if (JSON.stringify(flashNow) !== JSON.stringify(flash ? [flash] : [])) F.fx.push(`${tag} flash ${snapNow.boardCls} vs ${flash}`);
        if (shake && GOALS.has(e.type)) seen.ownGoalTicks++; if (flash) seen.flash++;
        const wantTones = STARTS.has(e.type) ? [[880, 'square'], [880, 'square']] : GOALS.has(e.type) && own(e.isHome) ? [[523, 'sawtooth'], [659, 'sawtooth'], [784, 'sawtooth']] : [];
        const got = snapNow.tones.slice(before.tones.length);
        if (JSON.stringify(got) !== JSON.stringify(wantTones)) F.tone.push(`${tag} toner ${JSON.stringify(got)} vs ${JSON.stringify(wantTones)}`);
        if (STARTS.has(e.type)) seen.bip++;
      };
      const whistleOk = startAc.n === 1 && startAc.resumes === 1 && JSON.stringify(startAc.tones) === JSON.stringify([[2900, 'triangle']]);
      verify(0, s0, 'show', 0, { ...s0, tones: s0.tones.slice(0, 1) });
      let endSnap = null, endBefore = null;
      for (let tick = 1; tick <= n * 7 + 10; tick++) {
        await p.clock.runFor(TICK);
        let st;
        if (hold > 0) { hold--; st = 'hold'; } else { L++; if (L + 1 >= n) st = 'end'; else { st = 'show'; const e = evs[L]; hold = STARTS.has(e.type) && e.var && !oneStepOf(e) && L + 1 < n ? 4 : 0; } }
        const now = await snap(p);
        if (st === 'end') { endSnap = now; endBefore = prev; break; }
        verify(L, now, st, tick, prev);
        prev = now;
      }
      const dumpF = (k) => `${F[k].length}: ${F[k].slice(0, 3).join(' || ')}`;
      check('v3.32.2 TM e2e: data i runden (tvungne VAR-tjek) – mindst ét to-trins tjek med pause og ét ét-trins tjek, hvis følge (straffemål/RED) ikke lukker rammen, fx og lyd at måle på (lukning før tid: unit var-moment-v3322-fix + modellen tick for tick)', seen.two >= 1 && seen.oneKept >= 1 && seen.hold >= 4 && seen.pendingTicks >= 1 && seen.bip >= 1 && n > 20, JSON.stringify({ ...seen, n }));
      check('v3.32.2 TM e2e: rammen følger HVER hændelse – til stede fra tjek til kendelse + 5 (lukket før tid af et nyt mål/rødt), role=group "VAR-tjek", rigtig første linje, kendelsen med holdnavn først ved kendelsen, aldrig ev.text', F.frame.length === 0, dumpF('frame'));
      check('v3.32.2-rettelsen e2e: kendelseslinjen (og kun den) er grøn, når den er god for dit hold, ellers rød – begge forekommer', F.vtone.length === 0 && seen.good >= 1 && seen.bad >= 1, `${dumpF('vtone')} ${JSON.stringify({ good: seen.good, bad: seen.bad })}`);
      check('v3.32.2 TM e2e: pausen – mellem tjek og kendelse (4 tick) tegnes intet om: stilling, minut, ramme, toner og #live-status uændrede', F.hold.length === 0, dumpF('hold'));
      check('v3.32.2 TM e2e: stillingen er hændelsens tal; "?" (og score-pending) står KUN under et mål-tjek før kendelsen – også i kampkortet', F.score.length === 0, dumpF('score'));
      check('v3.32.2 TM e2e: rystelse kun ved dit endelige mål/rødt, flash rød ved dit annullerede mål og grøn ved deres – ellers intet', F.fx.length === 0, dumpF('fx'));
      check('v3.32.2 TM e2e: lyden pr. hændelse – bip (2 × 880 firkant) ved hvert tjek, jubel (3 savtakstoner) ved DIT mål, intet ved deres mål', F.tone.length === 0, dumpF('tone'));
      check('v3.32.2 TM e2e: pulsens animation-delay er negativ fra rammens første tegning (ikke forfra ved hver gentegning)', F.delay.length === 0, dumpF('delay'));
      check('v3.32.2 TM e2e: rammen står under stillingen (over tidslinjen), stillingen og minuttet er synlige, ≤ 44rem, ikke over filterrækken, intet klippet – og den skubber ikke siden', F.geo.length === 0, dumpF('geo'));
      check('v3.32.2 TM e2e: CSS i brug – #live-status er skjult (sr-only), "?"-stillingen nedtonet, rammens kant skifter ved kendelsen, baggrunden dækker, kendelseslinjen er fremhævet', F.css.length === 0, dumpF('css'));
      const kf = await p.evaluate(() => {
        const out = {};
        for (const c of ['fx-shake', 'fx-flash-bad', 'fx-flash-good', 'var-mark']) {
          const e = document.createElement('div'); e.className = c; document.body.append(e);
          const a = e.getAnimations()[0], t = a?.effect?.getTiming(); out[c] = { kf: a ? a.effect.getKeyframes().map((k) => ({ t: k.transform, s: k.boxShadow, o: k.opacity })) : null, it: t?.iterations };
          e.remove();
        }
        return out;
      });
      const shakeX = (kf['fx-shake'].kf ?? []).map((k) => k.t).join('|');
      check('v3.32.2 TM e2e: keyframes – rystelsen svinger ±5/±3 px og ender i ro (én gang), flashen starter rød/grøn og ender gennemsigtig, pulsen dæmper til .45 og gentages uendeligt',
        /translateX\(-5px\)/.test(shakeX) && /translateX\(5px\)/.test(shakeX) && /translateX\(-3px\)/.test(shakeX) && /translateX\(3px\)/.test(shakeX) && kf['fx-shake'].it === 1
        && /239, 68, 68/.test(kf['fx-flash-bad'].kf?.[0].s) && /rgba\(0, 0, 0, 0\)/.test(kf['fx-flash-bad'].kf?.at(-1).s) && !/3px/.test(kf['fx-flash-bad'].kf?.at(-1).s.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px/, ''))
        && /16, 185, 129/.test(kf['fx-flash-good'].kf?.[0].s) && /rgba\(0, 0, 0, 0\)/.test(kf['fx-flash-good'].kf?.at(-1).s) && !/3px/.test(kf['fx-flash-good'].kf?.at(-1).s.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px/, ''))
        && (kf['var-mark'].kf ?? []).some((k) => +k.o === 0.45) && (kf['var-mark'].kf ?? []).some((k) => +k.o === 1) && kf['var-mark'].it === Infinity, JSON.stringify(kf));
      const live = await p.evaluate(() => window.__live);
      check('v3.32.2 TM e2e: #live-status skrives KUN ved tjekket (spørgsmålet) og ved kendelsen (sidste linje) – én gang pr. nøgle', JSON.stringify(live) === JSON.stringify(expectedLive) && live.length >= 2, JSON.stringify({ live, expectedLive }));
      check('v3.32.2 TM e2e: ▶ åbner lyden i klikket – ÉN AudioContext, genoptaget fra "suspended", og fløjtet er én 2900-tone', whistleOk, JSON.stringify(startAc));
      const fin = endSnap, toneBefore = endBefore.tones.length;
      check('v3.32.2 TM e2e: naturligt slut – kontrolleren er væk, alle ventende toner stoppet (stop() uden tid), og slutfløjtet er 3 triangeltoner à 2900',
        fin && !fin.playing && fin.stopsNow === endBefore.tones.length && JSON.stringify(fin.tones.slice(toneBefore)) === JSON.stringify([[2900, 'triangle'], [2900, 'triangle'], [2900, 'triangle']]), JSON.stringify({ stops: fin?.stopsNow, before: toneBefore, now: fin?.tones.length }));
      await ticks(p, 30);
      const after = await snap(p);
      check('v3.32.2 TM e2e: efter slutfløjtet kommer der ingen flere toner og ingen flere skrivninger i #live-status', after.tones.length === fin.tones.length && after.liveWrites === fin.liveWrites, `${after.tones.length} vs ${fin.tones.length}`);
      const stopsBefore = after.stopsNow, tonesBefore = after.tones.length;
      await p.click('#play-round');
      const nxt = await snap(p);
      check('v3.32.2-rettelsen e2e: #live-status tømmes, når en ny runde starter live (forrige rundes kendelse står ikke over den nye)', fin.live !== '' && after.live === fin.live && nxt.live === '', JSON.stringify({ fin: fin.live, nxt: nxt.live }));
      check('v3.32.2 TM e2e: ny runde – det gamle slutfløjt stoppes, ét nyt fløjt, og samme AudioContext (ikke oprettet igen, ikke genoptaget igen)',
        nxt.stopsNow === stopsBefore + 3 && nxt.tones.length === tonesBefore + 1 && nxt.ac === 1 && nxt.resumes === 1, JSON.stringify({ stops: [stopsBefore, nxt.stopsNow], tones: [tonesBefore, nxt.tones.length], ac: nxt.ac, resumes: nxt.resumes }));
      const D2 = await oracle(p);
      await p.click('#sound-toggle');
      const off = await snap(p);
      check('v3.32.2 TM e2e: kontakten fra midt i runden stopper de ventende toner (fløjtet) og gemmer "0"', off.stopsNow === nxt.stopsNow + 1 && (await p.evaluate(() => localStorage.getItem('tactivar_sound'))) === '0', JSON.stringify({ a: nxt.stopsNow, b: off.stopsNow }));
      await ticks(p, D2.events.length * 7 + 5);
      const quiet = await snap(p);
      check('v3.32.2 TM e2e: med lyden fra kommer der ingen toner resten af runden – heller ikke slutfløjtet', quiet.tones.length === off.tones.length && !quiet.playing, `${quiet.tones.length} vs ${off.tones.length}`);
      check('v3.32.2 TM e2e: ingen sidefejl i lyd-/VAR-runden', egne.length === 0, egne.join(' | '));
    }
    await A.c.close();

    // ---- B: lyd til, men man forlader Kamp-fanen midt i runden → ingen lyd (hverken hændelser eller slutfløjt) ----
    const B = await mk({ sound: true });
    {
      const { p } = B;
      await p.click('#play-round');
      const D = await oracle(p);
      await ticks(p, 2);
      const before0 = await snap(p);
      await p.click('#tab-kamp');   // Kamp → Kamp: intet stoppes
      const before = await snap(p);
      await p.click('#tab-liga');
      const left = await snap(p);
      check('v3.32.2-rettelsen e2e: at forlade Kamp stopper de ventende toner (fløjtet: stop() uden tid) – Kamp → Kamp stopper intet', before0.stopsNow === 0 && before.stopsNow === 0 && left.stopsNow === 1, JSON.stringify({ a: before0.stopsNow, kamp: before.stopsNow, liga: left.stopsNow }));
      await ticks(p, D.events.length * 7 + 10);
      const aft = await snap(p);
      check('v3.32.2 TM e2e: lyd udenfor Kamp – efter et fanebyt midt i runden kommer ingen bip, jubel eller slutfløjt', before.tones.length === 1 && aft.tones.length === 1, JSON.stringify({ b: before.tones.length, a: aft.tones.length }));
    }
    await B.c.close();

    // ---- C: "Vis kendelsen ›" (390 px), ⚡ og nyt spil midt i runden ----
    const C = await mk({ sound: true, width: 390, height: 844 });
    {
      const { p } = C;
      await p.click('#play-round');
      const D = await oracle(p), evs = D.events, n = evs.length;
      const idx = evs.findIndex((e, i) => STARTS.has(e.type) && e.var && !oneStepOf(e) && i + 1 < n);
      await ticks(p, idx);
      const atCheck = await snap(p);
      const geo = await p.evaluate(() => ({ show: Math.round(document.getElementById('var-show')?.getBoundingClientRect().height ?? 0), skip: Math.round(document.getElementById('skip').getBoundingClientRect().height),
        snd: Math.round(document.getElementById('sound-toggle').getBoundingClientRect().height), w: ['skip', 'sound-toggle', 'var-show'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().width)), row: Math.round(document.getElementById('skip').parentElement.getBoundingClientRect().height),
        row0: (() => { const b = [document.getElementById('skip'), document.getElementById('sound-toggle')], row = b[0].parentElement, old = b.map((x) => x.style.cssText); b.forEach((x) => { x.style.minHeight = '0'; x.style.marginBlock = '0'; });
          const h = Math.round(row.getBoundingClientRect().height); b.forEach((x) => { x.style.minHeight = '44px'; }); const h2 = Math.round(row.getBoundingClientRect().height); b.forEach((x, i) => { x.style.cssText = old[i]; }); return [h, h2]; })() }));
      check('v3.32.2 TM e2e (390): den RIGTIGE "Vis kendelsen ›" står i rammen og ⚡ og lydkontakten er ≥ 44 px, uden at rækken med overskriften vokser (≤ 8 px højere end uden 44 px-reglerne: 61 → 66, ikke 82)', !!atCheck.frame?.show && geo.show >= 44 && geo.skip >= 44 && geo.snd >= 44 && geo.w.every((x) => x >= 44) && geo.row - geo.row0[0] <= 8, JSON.stringify(geo));
      await ticks(p, 2);
      const mid = await snap(p);
      check('v3.32.2 TM e2e: efter 2 pausetick står tjekket stadig (spørgsmålet, "?", knappen)', mid.score === atCheck.score && mid.score.endsWith(' ?') && mid.frame.show && !mid.frame.cls.includes('reached'), mid.score);
      await p.click('#var-show');
      const v = await snap(p), e1 = evs[idx + 1];
      check('v3.32.2 TM e2e: "Vis kendelsen ›" viser kendelsen STRAKS (næste hændelse), knappen er væk, "?" er væk, fokus er på rammen, og #live-status siger kendelsen',
        v.frame?.cls.includes('reached') && !v.frame.show && v.score === `${e1.hG} - ${e1.aG}` && v.active === 'var-frame' && v.live === v.frame.lines.at(-1) && /^(✅|❌)/.test(v.live), JSON.stringify({ score: v.score, active: v.active, live: v.live, lines: v.frame?.lines }));
      await ticks(p, 1);
      const nx = await snap(p), e2 = evs[idx + 2];
      check('v3.32.2 TM e2e: efter knappen går afspilningen videre ét tick ad gangen (ingen ny pause)', nx.score.startsWith(`${e2.hG} - ${e2.aG}`) && nx.playing, nx.score);
      // Fokus-fallback (v3.32.2-rettelsen): fokus står i rammen – når rammen forsvinder, går det til ⚡ (ikke tabt til <body>)
      let gone = null, inFrame = nx.active;
      for (let k = 0; k < 40 && !gone; k++) { await ticks(p, 1); const q = await snap(p); if (q.frame) inFrame = q.active; else gone = q; }
      check('v3.32.2-rettelsen e2e: fokus i rammen → rammen forsvinder → fokus på ⚡ (#skip)', inFrame === 'var-frame' && gone?.playing && gone.active === 'skip', JSON.stringify({ inFrame, gone: gone?.active, playing: gone?.playing }));
      await p.click('#skip');
      const sk = await snap(p);
      await ticks(p, 40);
      const sk2 = await snap(p);
      check('v3.32.2 TM e2e: ⚡ stopper alle ventende toner (stop() uden tid) og giver ét slutfløjt – og intet mere bagefter', !sk.playing && sk.stopsNow === sk.tones.length - 3 && sk.tones.slice(-3).every((t) => t[1] === 'triangle') && sk2.tones.length === sk.tones.length, JSON.stringify({ stops: sk.stopsNow, tones: sk.tones.length, after: sk2.tones.length }));
      await p.click('#play-round');
      const w = await snap(p);
      await p.click('#tab-admin'); await p.waitForSelector('#new-league'); await p.click('#new-league');
      const nl = await snap(p);
      check('v3.32.2 TM e2e: "Ny liga" midt i en runde stopper de ventende toner (dropMatchView)', nl.stopsNow >= w.stopsNow + 1, JSON.stringify({ a: w.stopsNow, b: nl.stopsNow }));
    }
    await C.c.close();

    // ---- D: 44 px-reglen gælder ved 600 px og ikke ved 601 px (media-grænsen) ----
    for (const [w, ok] of [[600, true], [601, false]]) {
      const D = await mk({ width: w, height: 900 });
      await D.p.click('#play-round');
      const hh = await D.p.evaluate(() => ['skip', 'sound-toggle'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().height)));
      check(`v3.32.2 TM e2e (${w} px): ⚡ og lydkontakten er ${ok ? '≥ 44 px' : 'under 44 px (reglen gælder kun til og med 600)'}`, ok ? hh.every((x) => x >= 44) : hh.every((x) => x < 44), JSON.stringify(hh));
      await D.c.close();
    }

    // ---- E (v3.32.2-rettelsen, QC/Spilfører UI): rammen ved 390 og 1366 px tick for tick – stillingen og minuttet altid synlige,
    // rammen ikke ind over filterrækken, ≤ 44rem (704 px) bred, intet klippet, og siden skubbes ikke ----
    // Ved 390 også seed 1: dens højeste ramme (3 linjer + "Vis kendelsen ›" på egen række, ca. 117 px) passer IKKE i 7rem (112 px –
    // computerens højde), så data-vagten (maxNeed > 112) beviser, at 9,5rem-reglen ≤ 600 px er nødvendig
    for (const [w, ht, seedA] of [[390, 844, 0x9e3779b9], [390, 844, 1], [1366, 900, 0x9e3779b9]]) {
      const E = await mk({ width: w, height: ht, seedA });
      const { p, egne } = E;
      await p.click('#play-round');
      const bad = [], st = { frames: 0, maxW: 0, minGap: Infinity, maxNeed: 0, next: new Set() };
      for (let k = 0; k < 900; k++) {
        const q = await snap(p);
        if (!q.playing) break;
        if (q.geo?.next != null) st.next.add(Math.round(q.geo.next));
        if (q.frame) {
          const f = q.frame; st.frames++; st.maxNeed = Math.max(st.maxNeed, f.need); st.maxW = Math.max(st.maxW, f.box.r - f.box.l); st.minGap = Math.min(st.minGap, f.ff - f.box.b);
          if (!f.scoreHit || f.hit) bad.push(`t${k} stillingen/minuttet dækket`);
          if (f.ff == null || f.box.b > f.ff + 0.5) bad.push(`t${k} bund ${f.box.b} > filterrækken ${f.ff}`);
          if (f.box.r - f.box.l > 704.5) bad.push(`t${k} bredde ${f.box.r - f.box.l}`);
          if (f.need > f.cH + 0.5) bad.push(`t${k} klippet: ${f.need} > ${f.cH} (${f.lines.join(' / ')})`);
        }
        await p.clock.runFor(TICK);
      }
      check(`v3.32.2-rettelsen e2e (${w} px, seed ${seedA}): rammen dækker aldrig stillingen/minuttet, når ikke filterrækken, er ≤ 704 px bred og klipper intet – siden skubbes ikke (data: ≥ 3 tick med ramme)`,
        bad.length === 0 && st.frames >= 3 && st.next.size === 1 && egne.length === 0, JSON.stringify({ bad: bad.slice(0, 3), frames: st.frames, maxW: st.maxW, maxNeed: st.maxNeed, minGap: st.minGap, next: [...st.next], egne }));
      if (seedA === 1) check('v3.32.2-rettelsen e2e (390 px, data-vagt): mindst én ramme er højere end 7rem (112 px) – så 9,5rem-zonen på telefon er bevist', st.maxNeed > 112, String(st.maxNeed));
      await E.c.close();
    }
  }

  // ---------- Kampe: Match Center ----------
  await seeTeam('0');
  await seeTeam('3'); // kampknappen findes også, mens man scouter
  await tab('liga');
  const nextFx = await g.locator('#next-round .fixture').allTextContents();
  const nx = await nextOf();
  check('Liga før runde 1: programmets 4 kampe (samme retning), din kamp først – ingen resultater endnu', nextFx.length === 4
    && JSON.stringify(nextFx.slice().sort()) === JSON.stringify(nx.fixtures.slice().sort()) && nextFx[0].includes(nx.me) && (await g.locator('#next-round .fixture.mine').textContent()).includes(nx.opp)
    && (await g.locator('#last-round').count()) === 0 && (await g.locator('#my-schedule tr').count()) === 14 && (await g.locator('#my-schedule tr.next').count()) === 1, nextFx.join(' | '));
  check('Kamp-fanen før første runde: tom tilstand med vejledning', await (async () => { await tab('kamp'); return (await g.textContent('#no-matches')).includes('Spil runde'); })());
  // v3.27.0 (nr. 64): en udelukket starter står ved ▶ Spil runde og i Trup FØR runden, spiller ikke, nævnes i referatet og er fri bagefter
  const banned = await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot); const p = me.squad.find((x) => x.id === me.tactics.lineupSlots[9]); p.banMatches = 1; p.banWhy = 'YELLOWS'; localStorage.setItem('tactivar_save', JSON.stringify(d)); return { id: p.id, nr: p.shirtNumber, name: p.shortName }; });
  await reload(); await tab('taktik');   // v3.28.0: advarslerne står i Spil-bjælken på Taktik (før i topbaren)
  { const warn = await g.textContent('#out-warning'); await tab('trup'); const cell = await g.locator(`#matrix tr[data-pid="${banned.id}"] .injury`).textContent();
    check('Udelukkelse før runden: "⛔ #nr" i Spil-bjælken og "⛔ 1" i Trup-tabellen', warn.includes(`⛔ #${banned.nr}`) && !warn.includes('🚑') && cell.includes('⛔ 1'), `${warn} | ${cell}`);
    await g.click(`#matrix tr[data-pid="${banned.id}"]`);
    check('Spillerkortet: "⛔ udelukket i 1 kamp (4. gule kort i sæsonen)"', (await g.textContent('#card-ban')) === '⛔ udelukket i 1 kamp (4. gule kort i sæsonen)', await g.textContent('#card-ban').catch(() => 'mangler')); }
  // v3.27.0 Test Manager: advarslen ved ▶ Spil runde – skadet OG udelukket starter, begge tegn og ental, en udelukket på BÆNKEN tæller ikke,
  // og forklaringen (title) siger hvem og hvorfor; 🟨-varslen på spillerkortet ved 3 tællende gule (de uafhængige app.js-grene outStarters/out-warning)
  const mixed = await g.evaluate((banId) => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), sl = me.tactics.lineupSlots;
    const inj = me.squad.find((x) => x.id === sl[3]), both = me.squad.find((x) => x.id === sl[5]), bench = me.squad.find((x) => !sl.includes(x.id)), warn = me.squad.find((x) => x.id === sl[6]);
    inj.injuryMatchesLeft = 2; both.banMatches = 1; both.injuryMatchesLeft = 1; bench.banMatches = 2; bench.banWhy = 'DIRECT'; warn.banYellows = 3;
    localStorage.setItem('tactivar_save', JSON.stringify(d)); return { warnNr: warn.shirtNumber, injId: inj.id, bothId: both.id, benchId: bench.id, inj: inj.shirtNumber, injN: inj.shortName, both: both.shirtNumber, bench: bench.shirtNumber, banNr: me.squad.find((x) => x.id === banId).shirtNumber, banN: me.squad.find((x) => x.id === banId).shortName, warn: warn.id }; }, banned.id);
  await reload(); await tab('taktik');
  // v3.28.0: én kilde (preMatchIssues) – Spil-bjælken og Hjem-listen siger det samme (v3.31.1: bjælken på alle faner). Over 3 piller: én tæller-pille farvet efter det værste.
  { const w = await g.locator('#issue-count'), txt = await w.textContent(), title = await w.getAttribute('title');
    check('Spil-bjælken, 4 advarsler: én tæller-pille "⛔2 🚑1 🟨1" (spillere pr. slags, farvet efter det værste, "4 ting" i title) i stedet for 4 piller', txt === '⛔2 🚑1 🟨1' && title.startsWith('4 ting:\n') && (await w.getAttribute('class')).includes('pill-ban') && (await g.locator('#bar-issues .pill').count()) === 1, txt);
    check('Tæller-pillens forklaring: skadet 🚑, udelukket ⛔ og begge (som udelukket) og 🟨 – ikke en udelukket på bænken', title.includes(`#${mixed.inj} ${mixed.injN} er skadet`) && title.includes(`#${banned.nr} ${banned.name} er udelukket`) && title.includes(`#${mixed.both} `) && title.includes(`#${mixed.warnNr} `) && title.includes('næste gule kort giver 1 kamps udelukkelse') && !title.includes(`#${mixed.bench} `), title);
    // Paritet (QC): samme slags og #numre på Hjem-listen og i bjælken på Trup (v3.31.1; før den lille ▶) – forventningen er de fire, testen selv har sat
    const want = { ban: [banned.nr, mixed.both].sort((a, b) => a - b).join(), injury: String(mixed.inj), yellow: String(mixed.warnNr) };
    await tab('hjem');
    const rowsHome = await g.evaluate(() => [...document.querySelectorAll('#home-todo .todo-row[data-kind]')].map((r) => [r.dataset.kind, r.dataset.nrs]));
    const byKind = (rs) => Object.fromEntries(['ban', 'injury', 'yellow'].map((k) => [k, rs.filter(([x]) => x === k).flatMap(([, n]) => n.split(',').map(Number)).sort((a, b) => a - b).join()]));
    check('Paritet: Hjem-listen har præcis de fire – ⛔ to, 🚑 én, 🟨 én (ikke bænkspilleren)', rowsHome.length === 4 && JSON.stringify(byKind(rowsHome)) === JSON.stringify(want) && !(await g.textContent('#home-todo')).includes(`#${mixed.bench} `), JSON.stringify(rowsHome));
    await tab('trup');
    const mini = await g.textContent('#playbar #issue-count', { timeout: 3000 }).catch(() => 'mangler'), miniTitle = (await g.getAttribute('#playbar #issue-count', 'title').catch(() => null)) ?? '';
    check('Paritet: Spil-bjælken på Trup viser de samme tegn kompakt ("⛔2 🚑1 🟨1") og de samme #numre i forklaringen – ikke bænkspilleren', mini.trim() === '⛔2 🚑1 🟨1' && [banned.nr, mixed.both, mixed.inj, mixed.warnNr].every((n) => miniTitle.includes(`#${n} `)) && !miniTitle.includes(`#${mixed.bench} `) && (await g.locator('.topbar #play-round').count()) === 0, `${mini} | ${miniTitle}`);
    await g.click(`#matrix tr[data-pid="${mixed.warn}"]`);
    check('Spillerkortet: "🟨 3 – næste gule kort giver 1 kamps udelukkelse" ved 3 tællende gule – og ingen ⛔-boks', (await g.textContent('#card-yellow')) === '🟨 3 – næste gule kort giver 1 kamps udelukkelse' && (await g.locator('#card-ban').count()) === 0); }
  await g.evaluate((m) => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), P = (id) => me.squad.find((x) => x.id === id);   // tilbage til den ene udelukkede (forfatterens) + 🟨
    P(m.injId).injuryMatchesLeft = 0; Object.assign(P(m.bothId), { banMatches: 0, injuryMatchesLeft: 0 }); Object.assign(P(m.benchId), { banMatches: 0, banWhy: null });
    localStorage.setItem('tactivar_save', JSON.stringify(d)); }, mixed);
  // To advarsler (≤ 3): pillerne står hver for sig i bjælken – samme #numre som Hjem og bjælken på Liga; et tryk vælger spilleren på banen
  await reload(); await tab('taktik');
  { const pills = await g.locator('#bar-issues .pill').allTextContents();
    check('Spil-bjælken, 2 advarsler: to piller "⛔ #nr" og "🟨 #nr" (ingen tæller-pille)', JSON.stringify(pills) === JSON.stringify([`⛔ #${banned.nr}`, `🟨 #${mixed.warnNr}`]) && (await g.locator('#issue-count').count()) === 0, pills.join(' | '));
    await tab('hjem'); const home = await g.evaluate(() => [...document.querySelectorAll('#home-todo .todo-row[data-kind]')].map((r) => `${r.dataset.kind}:${r.dataset.nrs}`).join());
    await tab('liga'); const mini = (await g.locator('#playbar #bar-issues .pill').allTextContents()).join(' | ');
    check('Paritet med 2: Hjem-listen og Spil-bjælken på Liga siger det samme som pillerne på Taktik', home === `ban:${banned.nr},yellow:${mixed.warnNr}` && mini === pills.join(' | '), `${home} | ${mini}`);
    // Pillen løser noget: den viser altid dit eget hold (også når et andet hold vises på Taktik) og markerer brikken
    await tab('taktik'); await seeTeam(1);
    await g.click('#bar-issues .pill-yellow');
    const sel = await g.evaluate(() => [...document.querySelectorAll('#pitch .token.selected')].map((t) => t.querySelector('.token-num')?.textContent));
    check('Et tryk på 🟨-pillen (mens et andet hold vises) skifter til dit hold og markerer hans brik', JSON.stringify(sel) === JSON.stringify([String(mixed.warnNr)]) && (await g.locator('#scout-banner').count()) === 0 && (await pitchTitle()).startsWith(`${nx1.me} – `), JSON.stringify(sel)); }
  await g.evaluate((m) => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot); me.squad.find((x) => x.id === m.warn).banYellows = 0; localStorage.setItem('tactivar_save', JSON.stringify(d)); }, mixed);
  await reload();
  await g.click('#play-round');
  await g.waitForSelector('#match-center');
  { const after = await g.evaluate((id) => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), m = d.league.lastRound.matches.find((x) => x.homeId === me.id || x.awayId === me.id);
      return { played: [...m.ratings.home, ...m.ratings.away].some((e) => e.playerId === id), note: m.events.some((e) => e.text.includes('er udelukket og erstattes')), ban: me.squad.find((x) => x.id === id).banMatches }; }, banned.id);
    check('Udelukkelse i kampen: han står ikke i karakterarket, referatet siger "er udelukket og erstattes", og han er fri efter runden', !after.played && after.note && after.ban === 0, JSON.stringify(after)); }
  check('▶ Spil runde åbner Kamp-fanen', (await g.textContent('#tabs .tab.active')).includes('Kamp'));
  check('Under afspilning kan runden ikke startes igen', await g.isDisabled('#play-round'));
  check('Under afspilning: kampsiden som før (referat | statistik) – afspilningen kommer først efter slutfløjt', (await g.getAttribute('#mc-main', 'class')) === 'mc-grid' && (await g.locator('#mc-main .mc-replay').count()) === 0);
  await seeTeam('0'); await tab('klub');   // v3.19.0: et valgt modstanderhold viser hans offentlige klubside
  check('Under afspilning: Klub viser ikke regnskabet (præmien ville afsløre slutstillingen)', (await g.isVisible('#club-booked')) && (await g.locator('#ledger').count()) === 0);
  await seeTeam('3'); await tab('kamp');
  const played = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches.map((m) => `${m.homeName}–${m.awayName}`));
  check('Det spillede er præcis de kampe, Liga-fanen viste før ▶ – samme retning og rækkefølge', JSON.stringify(played) === JSON.stringify(nextFx), played.join(' | '));
  check('Under afspilning: besked om at runden er bogført, og de andre resultater er skjulte', (await g.isVisible('#booked-note')) && !/\d-\d/.test(await g.locator('#match-cards .matchcard:nth-child(2)').textContent()));
  await tab('liga');
  check('Under afspilning: Liga-fanen siger, at tabellen allerede er opdateret – og avisen og resultaterne venter', (await g.isVisible('#booked-league')) && (await g.locator('#gazette').count()) === 0 && (await g.locator('#last-round').count()) === 0 && (await g.locator('#stats').count()) === 0 && (await g.locator('#schedule').count()) === 0); // statistikken og programmet ville afsløre runden
  await tab('kamp');
  await g.click('#skip');
  check('Runden har 4 kampe', (await g.locator('#match-cards .matchcard').count()) === 4);
  // v3.28.0: efter fløjtet står vejen videre ØVERST på Kamp (Spilfører UI: nederst ved y≈3300 blev den ikke fundet) → Hjem
  { const nx2 = await nextOf(), line = await g.locator('.to-home').textContent().catch(() => 'mangler');
    const above = await g.evaluate(() => { const a = document.querySelector('.to-home'), b = document.querySelector('#match-center'); return !!a && !!b && a.getBoundingClientRect().bottom <= b.getBoundingClientRect().top; });
    check('Kamp efter fløjtet: "Forbered ›"-linjen står OVER kampcentret (ikke nederst)', above);
    const pre = `Næste: runde 2 mod ${nx2.opp} (${nx2.home ? 'hjemme' : 'ude'}) · Forbered › · 📰 «`;
    check('Kamp efter fløjtet: "Næste: runde 2 mod X (hjemme/ude) · Forbered › · 📰 «overskrift» ›" (v3.31.0: avisen står på Liga)', line.startsWith(pre) && line.endsWith('» ›') && line.length > pre.length + 5 && !/undefined|null/.test(line), line);
    await g.click('#to-home');
    check('"Forbered ›" åbner Hjem', (await g.textContent('#tabs .tab.active')).includes('Hjem') && (await g.isVisible('#home-todo')));
    await tab('kamp'); }
  check('Træning: fokusset gælder stadig efter runden (0 klik pr. runde)', (await focusSaved()) === 'FINISH');
  // v3.18.0 Klub: regnskabets første linje er runden; kassen i klubhovedet er den samme og linker til Klub
  await seeTeam('0'); await tab('klub');
  const led = await g.evaluate(() => { const t = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot); return { cash: t.cashBalance, n: t.finance.ledger.length }; });
  const cashTxt = await g.textContent('#club-cash');
  check('Klub: kasse, løn pr. runde, lønbudget og prognose – og regnskabet har rundens linje', led.n === 1 && (await g.locator('#ledger tbody tr').count()) === 1
    && cashTxt.replace(/\D/g, '') === String(led.cash) && (await g.textContent('#club-wages')).includes('pr. runde') && /Du kan bruge|over budgettet/.test(await g.textContent('#club-room')) && (await g.isVisible('#club-forecast')), cashTxt);
  // v3.28.0: klubhovedet med kassen står på Hjem – samme kasse som Klub, ændringen er rundens linje i regnskabet, og et klik åbner Klub
  await tab('hjem');
  { const net = await g.evaluate(() => { const e = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot).finance.ledger.at(-1); return (e.gate ?? 0) + (e.tv ?? 0) + (e.wages ?? 0) + (e.prize ?? 0) + (e.transfers ?? 0); });
    const cashH = await g.textContent('#club-link'), delta = await g.textContent('#cash-delta');
    check('Hjem: klubkassen er Klubs kasse, og "siden sidste runde" er rundens linje i regnskabet (med fortegn)', cashH.replace(/\D/g, '') === String(led.cash) && delta === `${net > 0 ? '+' : net < 0 ? '−' : '±'}${Math.abs(net).toLocaleString('da-DK')} kr. siden sidste runde` && net !== 0, `${cashH} | ${delta} | ${net}`); }
  await g.click('#club-link');
  check('Klubkassen i Hjem-fanens klubhoved åbner Klub', (await g.textContent('#tabs .tab.active')).includes('Klub'));
  await seeTeam('3'); await tab('kamp');
  // v3.32.1: karakterarket står i "👥 Spillerne" – teksten samles fra begge faner
  await pane('players'); const mcPlayers = await g.textContent('#match-center'); await pane('replay');
  const mcText = (await g.textContent('#match-center')) + mcPlayers;
  // v3.16.3: minuttet står ved linjen ("3'"), ikke i teksten
  check('Din Hvis-Så-udskiftning (uanset stilling, fra minut 3) står i referatet i 3. minut, og indskifteren står i karakterarket', /(?<!\d)3'🔄 \[.+ • Hvis-Så\] #\d+ .+ ud – #\d+ .+ ind \(din Hvis-Så-regel\)\./.test(mcText) && /ind på/.test(mcText), (mcText.match(/🔄[^.]*\./) || ['ingen'])[0]);
  // Dit hold kan være hjemme eller ude (programmet) – karakterarkene står hjemme, ude.
  const own = await g.evaluate(() => (JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0].ratings.home[0].isUserTeam ? 0 : 1));
  await pane('stats');
  check('Referatet indeholder slutfløjt, statistik (fanen 📊) og karakterark (fanen 👥)', mcText.includes('SLUTFLØJT') && (await g.isVisible('#match-stats')) && (await g.locator('.ratings').count()) === 0 && mcPlayers.includes('karakterer'));
  // v3.10.1: dødbolde og gule kort i statistikken til højre – tallene = kampens gemte statistik
  const statRows = await g.locator('#match-stats tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent)));
  const statSaved = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0].stats);
  const rowOf = (label) => statRows.find((r) => r[1] === label);
  check('Kampstatistik: frispark i skudafstand, hjørnespark, straffe (mål) og gule kort som i den gemte kamp',
    rowOf('Hjørnespark')?.[0] === String(statSaved.hCorners) && rowOf('Hjørnespark')?.[2] === String(statSaved.aCorners)
    && rowOf('Frispark i skudafstand')?.[0] === String(statSaved.hFreeKicks) && rowOf('Straffe (mål)')?.[0] === `${statSaved.hPenalties} (${statSaved.hPenaltyGoals})`
    && rowOf('Gule kort')?.[2] === String(statSaved.aYellows) && !!rowOf('Frispark begået / skader'), JSON.stringify(statRows.slice(-5)));
  await pane('replay'); const feedText = await g.textContent('#feed');
  check('Referatet: ingen evnetal og ingen interne koder', !/\b(FIN|PAS|POS|INT|STA|STR|BAL|PAC)\s*[:=]?\s*\d/.test(feedText) && !/BALANCED|MID_BLOCK|HIGH_GEGENPRESS/.test(mcText));
  const score = (await g.textContent('#score')).trim();
  check('Resultattavlen svarer til slutfløjtet', mcText.includes(`${score.replace(' - ', ' - ')}`) && /\d+ - \d+/.test(score));
  await pane('players'); const oppRatings = await g.locator('.ratings').nth(1 - own).locator('td.rating').allTextContents();
  const ownRatings = await g.locator('.ratings').nth(own).locator('td.rating').allTextContents();
  const starColors = await g.evaluate(() => { const s = document.querySelector('.ratings .star-on'), o = document.querySelector('.ratings .star-off'); return s && o ? [getComputedStyle(s).color, getComputedStyle(o).color] : null; });
  check('Stjerner er læsbare: udfyldte og tomme har forskellig farve', !!starColors && starColors[0] !== starColors[1], String(starColors));
  check('Karakterark: eget hold eksakte karakterer, modstander kun stjerner', ownRatings.every((t) => /^\d+,\d$/.test(t)) && oppRatings.length >= 11 && oppRatings.every((t) => /^[★☆]{5}$/.test(t)));
  // Karakterark: opstillingsorden med plads efter navnet, minibane og ikon-forklaring
  const ownRows = await g.locator('.ratings').nth(own).locator('tbody tr td:first-child').allTextContents();
  check('Karakterark: plads efter navnet, målmanden først (v3.31.2: MV)', ownRows.length >= 11 && /· MV$/.test(ownRows[0]) && ownRows.every((t) => / · \S/.test(t)), ownRows.slice(0, 3).join(' | '));
  const mpOwn = await g.locator('.ratings').nth(own).locator('.mp-token .mp-val').allTextContents();
  const mpOpp = await g.locator('.ratings').nth(1 - own).locator('.mp-token .mp-val').allTextContents();
  check('Minibane: 11 startere pr. hold – egne med karakter, modstanderens kun stjerner', mpOwn.length === 11 && mpOwn.every((t) => /^\d+,\d$/.test(t)) && mpOpp.length === 11 && mpOpp.every((t) => /^[★☆]{5}$/.test(t)), `${mpOwn.length}/${mpOpp.length}`);
  const runs = await g.locator('.ratings').nth(own).locator('td.run').allTextContents();
  const runExpect = await g.evaluate(() => { const m = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0]; const own = [m.ratings.home, m.ratings.away].find((l) => l[0].isUserTeam); const e = own.find((x) => x.hiShare != null && x.distanceKm > 0); return `${e.distanceKm.toFixed(1).replace('.', ',')} km · ${Math.round(e.hiShare)} % HI`; });
  check('Karakterark: HI-andelen er spillerens afrundede tal', runs.some((t) => t.startsWith(runExpect)), runExpect);
  // Alle dine viser distancen; mindst 9 også HI og topfart (en, der kun var på banen kort, har ingen topfart – tilfældigt i e2e)
  check('Karakterark: dit hold har løbet distance og topfart, modstanderen ikke', runs.length >= 11 && runs.filter((t) => /^\d+,\d km/.test(t)).length >= 11 && runs.filter((t) => /^\d+,\d km · \d+ % HI · \d+,\d km\/t$/.test(t)).length >= 9 && (await g.locator('.ratings').nth(1 - own).locator('td.run').count()) === 0, runs.join(' | '));
  // v3.9: "fri" (løb uden bold) kun for dit hold – og opsummeringen kun i din kamp
  const fri = await g.locator('.ratings').nth(own).locator('td.fri').allTextContents();
  const friExpect = await g.evaluate(() => { const m = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0]; const own = [m.ratings.home, m.ratings.away].find((l) => l[0].isUserTeam); return own.filter((e) => e.freeRuns > 0).map((e) => `${e.freeRunsWon}/${e.freeRuns} fri`); });
  check('Karakterark: "fri" for dit hold matcher de gemte løb, modstanderen har ingen kolonne', fri.length >= 11 && JSON.stringify(fri.filter(Boolean).sort()) === JSON.stringify([...friExpect].sort()) /* præcis de spillere med løb – ingen "0/0 fri" til resten; tilfældig liga: ca. hver 5. kamp uden løb, så står alle tomme (unit-testene dækker indholdet) */ && fri.every((t) => t === '' || /^\d+\/\d+ fri$/.test(t)) && (await g.locator('.ratings').nth(1 - own).locator('td.fri').count()) === 0, `${fri.join(',')} / ${friExpect.join(',')}`);
  // v3.21.0 (Security Reviewer F2): 🤼 kun for dit hold – præcis de gemte duel-tal, og ingen kolonne i modstanderens ark
  const duel = await g.locator('.ratings').nth(own).locator('td.duel').allTextContents();
  const duelExpect = await g.evaluate(() => { const m = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0]; const own = [m.ratings.home, m.ratings.away].find((l) => l[0].isUserTeam); return { mine: own.filter((e) => e.duels > 0).map((e) => `${e.duelsWon}/${e.duels} 🤼`), opp: [m.ratings.home, m.ratings.away].find((l) => !l[0].isUserTeam).filter((e) => e.duels > 0).length }; });
  check('Karakterark: 🤼 for dit hold matcher de gemte dueller, modstanderen har ingen kolonne', duel.length >= 11 && duelExpect.mine.length > 0 /* modstanderens tal er gemt (motoren), men vises ikke: */ && JSON.stringify(duel.filter(Boolean).sort()) === JSON.stringify([...duelExpect.mine].sort()) && (await g.locator('.ratings').nth(1 - own).locator('td.duel').count()) === 0, JSON.stringify({ duel, duelExpect }));
  await pane('replay'); const runSum = await g.textContent('#match-center');
  check('Fuldtids-analyse med løb uden bold i din kamp', /📊 \[FULDTIDS-ANALYSE\] (Sejr \d+-\d+ til dig|Nederlag \d+-\d+|Uafgjort \d+-\d+)\. Du havde \d+% af bolden og \d+ afslutning(er)? \(\d+ på mål\)\. ((Din opbygning kom igennem \d+ af \d+ gange?( \((af de \d+ stop var \d+|alle \d+ stop var|stoppet var) offside\))?; d|D)it pres (vandt bolden \d+ af \d+ gange?|stoppede opbygningen \d+ af \d+ gange? \(\d+ erobring(er)?, \d+ på offside\))|Din opbygning kom igennem \d+ af \d+ gange?( \((af de \d+ stop var \d+|alle \d+ stop var|stoppet var) offside\))?)\. Dødbolde: \d+ frispark i skudafstand, \d+ hjørnespark, \d+ straffespark \(\d+ mål\) · frispark begået \d+, tilkendt \d+\. 🎯 Løb uden bold \(Normal\): \d+ løb, \d+ kom fri \(\d+ mål\) · kontraer imod i alt: \d+ \(\d+ mål\)\./.test(runSum), runSum.match(/🎯[^.]*\./)?.[0] ?? 'mangler');
  check('Fuldtids-analysen viser dit angreb (fokus · pasningsstil) og dit felt (v3.12)', /⚔️ Angreb \((Centralt|Høje indlæg|Lave cutbacks) · (korte pasninger|balanceret|direkte lange bolde)\): (ingen cutbacks eller høje bolde|(\d+ cutbacks? \(\d+ mål, \d+ stoppet ved kanten\))?(, )?(\d+ (høje bolde|høj bold) \(\d+ (vundne luftdueller|vundet luftduel) i åbent spil, \d+ hovedstødsmål\))?)\. 🛡️ Dit felt: modstanderens cutbacks stoppet \d+ af \d+ · luftdueller i åbent spil vundet \d+ af \d+\./.test(runSum), runSum.match(/⚔️[^🛡]*🛡️[^.]*\./)?.[0] ?? 'mangler');
  // v3.31.0 (F3, avisen ét sted): Kamp har INGEN avis – kun linket i .to-home-linjen øverst, med klummens overskrift; det lander på avisen på Liga
  { const kampHas = await g.locator('#match-center #gazette, .tabpane.tab-kamp #gazette, .tabpane.tab-kamp #col-title, .tabpane.tab-kamp #goal-of-round-match').count();
    const linkTxt = await g.textContent('.to-home #kamp-paper-link').catch(() => 'mangler');
    await g.click('.to-home #kamp-paper-link'); await soft(g, '.tabpane.tab-liga');
    const land = await g.evaluate(() => { const top = document.querySelector('.topbar').getBoundingClientRect().bottom, gz = document.querySelector('#gazette'), h3 = gz?.querySelector('h3')?.getBoundingClientRect(), ct = document.querySelector('#col-title')?.getBoundingClientRect();
      return { tab: document.querySelector('#tabs .tab.active')?.textContent, top: Math.round(top), h3: h3 ? Math.round(h3.top) : null, ct: ct ? Math.round(ct.top) : null, vh: innerHeight, y: Math.round(scrollY), title: document.querySelector('#col-title')?.textContent }; });
    check('Kamp: ingen avis i Kamp-fanen (hverken #gazette, klummen eller Rundens mål) – kun 📰-linket', kampHas === 0 && linkTxt !== 'mangler', `${kampHas} | ${linkTxt}`);
    check('Kamp: 📰-linket bærer netop klummens overskrift (= #col-title på Liga)', linkTxt === `📰 «${land.title}» ›`, `${linkTxt} | ${land.title}`);
    check('Kamp: 📰-linket åbner Liga rullet til avisen – avisens top lige UNDER topbaren (scroll-margin-top), ikke bag den', land.tab?.includes('Liga') && land.y > 0 && land.h3 >= land.top && land.h3 <= land.top + 40 && land.ct > land.h3 && land.ct < land.vh / 2, JSON.stringify(land)); }
  const gzText = await g.textContent('#gazette');
  // v3.14: avisen er en klumme – overskrift, "Din kamp", de 3 øvrige kampe (fed overskrift, klik = referatet),
  // rundens spiller og mål, næste runde; dit holds løber står stadig som boks.
  const colIds = await g.locator('#gazette .col-sec').evaluateAll((ss) => ss.map((x) => x.id));
  // v3.21.2: løberboksen kun ved ≥ 12,3 km (RUNNER_BOX_KM) – ellers ingen boks
  const runKm = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound?.gazette?.myRunner?.distanceKm ?? 0);
  check('Klummen: overskrift, "Din kamp" først, 3 øvrige kampe, rundens spiller og mål, næste runde – og ingen løberboks (v3.26.1)', (await g.locator('#col-title').count()) === 1 && colIds[0] === 'col-mine' && colIds.includes('col-others') && colIds.includes('col-stars') && colIds.includes('col-next')
    && (await g.locator('#headlines li').count()) === 3 && !gzText.includes('Dit holds løber') /* v3.26.1: boksen er fjernet, også ved ≥ 12,3 km */, `${colIds.join(',')} | ${runKm} km | ${gzText.slice(0, 160)}`);
  const myMatchTxt = await g.textContent('#col-mine');
  const myName = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot).name);
  check('Klummen, "Din kamp": handler om dit hold (seeren)', myMatchTxt.includes(myName), myMatchTxt.slice(0, 160));
  const por = await g.textContent('#player-of-round');   // avisens Rundens spiller (Liga) – sammenlignes med karakterarket i Kamp nedenfor
  await tab('kamp'); await pane('players');   // tilbage til kampcentret (karakterarkene nedenfor)
  const iconTitles = await g.evaluate(() => [...document.querySelectorAll('.ratings .ricon')].map((e) => [e.textContent, e.title]));
  check('Ikonerne i karakterarket har mouse-over-tekst', iconTitles.length > 0 && iconTitles.every(([t, ti]) => ti.length > 3 && !ti.includes('undefined')), JSON.stringify(iconTitles.slice(0, 3)));
  const legendTxt = await g.textContent('#icon-legend');
  check('Ikon-forklaring under karakterarket (til touch)', ['⚽ Mål', '🅰 Oplæg', '🧤 Redninger', '👑 Kampens spiller'].every((x) => legendTxt.includes(x)), legendTxt);
  check('Forklaring af "fri", 🤼 og HI (rigtig vej rundt: 2/3 = kom fri 2 af 3 gange)', legendTxt.includes('"2/3 fri" = løb uden bold: kom fri 2 af 3 gange') && legendTxt.includes('HI = andel højintenst løb') && legendTxt.includes('"2/3 🤼" = dueller vundet') && legendTxt.endsWith('alle tre kun dit hold'), legendTxt);
  const porIsMine = (await g.locator('.ratings').nth(own).textContent()).includes(por.match(/#\d+ [^ ]+ [^ (]+/)[0]);
  check('Avisen kårer rundens spiller – med karakter kun hvis det er din spiller, ellers "rundens bedste karakter" (v3.16.3, ingen stjerner)', porIsMine ? /karakter \d+,\d/.test(por) : (por.includes('rundens bedste karakter') && !/[★☆]/.test(por) && !/karakter \d/.test(por)), por);
  // v3.16.3: 📍 kun hvor afspilningen ikke har afslutningen (QC: ellers to knapper, én handling) – i en ny kamp har hvert mål med
  // billede en 🎬, så 📍 står kun ved et mål med billede UDEN øjeblik i sporet. 📍-flowet køres længere nede på et gem uden spor.
  const pinWant = await g.evaluate(() => { const m = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0]; const mo = new Set((m.trace?.moments ?? []).map((x) => x.ev)); return { snaps: m.events.filter((e) => e.snapshot).length, noFilm: m.events.filter((e, i) => e.snapshot && !mo.has(i)).length, trace: !!m.trace }; });
  await pane('replay'); const pinsLive = await g.locator('#feed .snap-btn').count();
  check('📍 står kun ved mål med gemt øjebliksbillede uden 🎬 (kamp med spor)', pinWant.trace && pinsLive === pinWant.noFilm, `${pinsLive} / ${pinWant.noFilm} (billeder i alt ${pinWant.snaps})`);
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
      // v3.32.1: øjebliksbilledet står i "👥 Spillerne", 📍/🎬 i referatet (første fane)
      const draw = (snap, pane = 'players') => renderMatchCenter({ mc: { round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount: 0, playing: false, snap, pane }, myTeamId: me.id, on: { snapshot: () => {}, view: () => {}, filter: () => {}, skip: () => {} } });
      const ownIds = new Set(me.squad.map((p) => p.id)), oppNames = opp.squad.map((p) => p.shortName);
      const read = (el) => { const sp = el.querySelector('#snap-pitch'); return sp && { title: sp.querySelector('#snap-title').textContent, n: sp.querySelectorAll('.mp-token').length, scorer: sp.querySelectorAll('.mp-token.scorer').length, assist: sp.querySelectorAll('.mp-token.assist').length, ball: !!sp.querySelector('#snap-ball'), pitches: el.querySelectorAll('#snap-pitch').length, oppName: oppNames.some((n) => sp.textContent.includes(n)), pins: el.querySelectorAll('.snap-btn').length }; };
      const ev = m.events[theirI].snapshot;
      return { a: read(draw(mineI)), b: read(draw(theirI)), none: (() => { const el = draw(null), elR = draw(null, 'replay'); const { trace, ...old } = m; const elOld = renderMatchCenter({ mc: { round: 1, matches: [old], gazette: null, viewIdx: 0, filter: 'all', shownCount: 0, playing: false, snap: null }, myTeamId: me.id, on: { snapshot: () => {}, view: () => {}, filter: () => {}, skip: () => {} } }); return { pitches: el.querySelectorAll('#snap-pitch').length, pins: elR.querySelectorAll('.snap-btn').length, films: elR.querySelectorAll('.replay-btn').length, pinsOld: elOld.querySelectorAll('.snap-btn').length, want: m.events.filter((e) => e.snapshot).length }; })(), ownOnly: ev.pts.every(([id]) => ownIds.has(id)) && ev.scorer === null && ev.pts.length === 11 };
    }
    return null;
  });
  check('Øjebliksbillede, dit mål: 11 brikker, scorer ⚽ og oplæg 🅰 markeret, bolden vist', !!snapT && snapT.a?.n === 11 && snapT.a.scorer === 1 && snapT.a.assist === 1 && snapT.a.ball && snapT.a.pitches === 1 && /mål af #\d+ .+: sådan stod I/.test(snapT.a.title), JSON.stringify(snapT?.a));
  check('Øjebliksbillede, mål imod: kun dit forsvar (ingen scorer, ingen af modstanderens spillere) – gemt uden modstanderens positioner', !!snapT && snapT.b?.n === 11 && snapT.b.scorer === 0 && !snapT.b.oppName && snapT.b.title.includes('sådan stod dit forsvar, da bolden blev spillet') && snapT.ownOnly, JSON.stringify(snapT?.b));
  // v3.16.3: med spor 🎬 i stedet for 📍; uden spor (gammelt gem) 📍 ved hvert mål med billede
  check('Uden valgt mål: intet øjebliksbillede; med spor 🎬 og ingen 📍, uden spor 📍 ved hvert mål med billede', !!snapT && snapT.none.pitches === 0 && snapT.none.pins === 0 && snapT.none.films >= snapT.none.want && snapT.none.pinsOld === snapT.none.want && snapT.none.want >= 2, JSON.stringify(snapT?.none));
  // v3.16: 2D-afspilning og heat map efter slutfløjt (brikker for begge hold, 🎬 springer til hændelsen, ▶ kører, heat map for dit hold)
  if (await g.locator('#replay #rp-pitch').count()) {
    const rp0 = await g.evaluate(() => ({ tokens: [...document.querySelectorAll('#rp-pitch .rp-token')].filter((t) => !t.hidden).length, home: document.querySelectorAll('#rp-pitch .rp-token.home').length, away: document.querySelectorAll('#rp-pitch .rp-token.away').length, own: document.querySelectorAll('#rp-pitch .rp-token.own').length, films: document.querySelectorAll('#feed .replay-btn').length, moments: (() => { const lr = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound; const idx = [...document.querySelectorAll('#match-cards .matchcard')].findIndex((c) => c.classList.contains('active')); return lr.matches[Math.max(0, idx)].trace?.moments.length ?? -1; })() }));
    check('Afspilning: begge hold på taktiktavlen (7–11 hver), dit hold markeret, 🎬 ved afslutningerne i referatet', rp0.home >= 7 && rp0.away >= 7 && rp0.own >= 7 && rp0.films >= 1 && rp0.films === rp0.moments, JSON.stringify(rp0));   // præcis én 🎬 pr. gemt afslutning (før ≥ 3 – en kamp med 2 afslutninger gav falsk rød mod live)
    const filmText = await g.locator('#feed .replay-btn').first().evaluate((b) => b.parentElement.textContent);
    await g.locator('#feed .replay-btn').first().click();
    const cap = await g.textContent('#rp-caption');
    // Test Manager v3.16: den gamle check var tom, hvis springet ikke skete (et grundbillede har ingen tekst-del: ''.includes('') er sandt)
    const capParts = cap.split(' · '), jumpedStep = Number(await g.getAttribute('#replay', 'data-step'));
    check('Afspilning: 🎬 springer til hændelsen – undertekst = referatets linje', capParts.length >= 3 && jumpedStep > 0 && filmText.replace(/^\d+'/, '').includes(capParts.slice(2).join(' · ').slice(0, 30)), `${cap} | ${filmText} | trin ${jumpedStep}`);
    // v3.22.1 (brugeren: "så er målscorer offside, alle modstanderne er langt fremme"): en afslutning efter en aflevering – bolden
    // først hos oplæggeren, mens skytten står onside på linjen (recv), så løber han ind og afslutter (samme trin)
    { const pick = await g.evaluate(() => { const lr = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound; const idx = [...document.querySelectorAll('#match-cards .matchcard')].findIndex((c) => c.classList.contains('active'));
        const o = lr.matches[Math.max(0, idx)].trace.moments.find((x) => x.from && x.recv && document.querySelector(`#feed .replay-btn[data-ev="${x.ev}"]`)); return o ? { ev: o.ev, from: o.from, shooter: o.scorer ?? o.shooter } : null; });
      if (pick) {
        await g.locator(`#feed .replay-btn[data-ev="${pick.ev}"]`).click();
        const read = () => g.evaluate(({ from, shooter }) => { const st = (el) => el && [el.style.left, el.style.top]; const tok = (id) => document.querySelector(`#rp-pitch .rp-token[data-pid="${id}"]`);
          return { leg: document.querySelector('#replay').dataset.leg, ball: st(document.querySelector('#rp-ball')), from: st(tok(from)), shooter: st(tok(shooter)) }; }, pick);
        const a = await read(); await g.waitForTimeout(1750); const b = await read();
        check('Afspilning: afleveringen før afslutningen – bolden hos oplæggeren, mens skytten står bag bolden på linjen; derefter løber han ind med bolden',
          a.leg === 'pass' && JSON.stringify(a.ball) === JSON.stringify(a.from) && b.leg === 'shot' && JSON.stringify(b.ball) === JSON.stringify(b.shooter) && JSON.stringify(a.shooter) !== JSON.stringify(b.shooter), JSON.stringify([a, b]));
      } }   // ingen aflevering i denne kamp: benene er bevist deterministisk i replay-legs-v3221-tm.test.mjs (TM: en altid-grøn else-gren beviser intet)
    await g.locator('#feed .replay-btn').last().click();   // den tidligste afslutning – så er der trin efter den
    const s0 = await g.getAttribute('#replay', 'data-step');
    await g.click('#rp-next'); const s1 = await g.getAttribute('#replay', 'data-step');
    // Test Manager v3.16: 1600 ms var for kort – et øjeblik (afslutning) varer 2600 ms, og trinnet efter den tidligste afslutning kan selv være
    // en afslutning (to skud i samme tick) → ingen bevægelse og falsk rød ("2 → 3 → 3"). 2800 ms rummer altid mindst ét trin.
    await g.click('#rp-play'); await g.waitForTimeout(2800); await g.click('#rp-play');
    const s2 = await g.getAttribute('#replay', 'data-step');
    check('Afspilning: ⏭ og ▶ flytter frem', Number(s1) === Number(s0) + 1 && Number(s2) > Number(s1), `${s0} → ${s1} → ${s2}`);
    // QC v3.16: synlighed målt som tegnet (computed style), ikke .hidden – en udskiftet/udvist må aldrig stå på tavlen. Gå til
    // sidste trin (flest skift er sket) og tæl de viste brikker pr. hold.
    await g.evaluate(() => { const n = document.querySelector('#rp-next'); for (let i = 0; i < 400; i++) n.click(); });
    const vis = await g.evaluate(() => ['home', 'away'].map((c) => [...document.querySelectorAll(`#rp-pitch .rp-token.${c}`)].filter((t) => getComputedStyle(t).display !== 'none').length));
    const totalTok = await g.evaluate(() => document.querySelectorAll('#rp-pitch .rp-token').length);
    check('Afspilning: højst 11 viste brikker pr. hold i sidste trin (udskiftede skjult – målt som tegnet)', vis.every((n) => n >= 7 && n <= 11) && (totalTok <= 22 || vis[0] + vis[1] < totalTok), `${vis} af ${totalTok} brikker`);
    // v3.20.1 (brugeren: "udnyttelsen af pladsen lige efter en kamp"): afspilningen til venstre og (v3.32.1) referatet ved siden af – statistikken har sin egen fane
    { const r = await g.evaluate(() => { const b = (s) => document.querySelector(s).getBoundingClientRect(); return { rp: b('#replay'), feed: b('#feed'), stats: document.querySelectorAll('#match-stats').length }; });
      check('Efter kampen (1400 px): afspilningen til venstre og referatet til højre ved siden af den – statistikken står ikke her (egen fane)', r.feed.left >= r.rp.right - 1 && r.feed.top < r.rp.bottom && r.stats === 0 && (await g.evaluate(() => getComputedStyle(document.querySelector('.mc-feed')).gridRowStart)) === 'feed', JSON.stringify({ rpR: Math.round(r.rp.right), feedL: Math.round(r.feed.left), feedT: Math.round(r.feed.top), rpB: Math.round(r.rp.bottom), stats: r.stats }));
      await g.setViewportSize({ width: 390, height: 844 }); await g.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));   // vent på layout (TM: race)
      const overflow = () => g.evaluate(() => { const W = window.innerWidth; return document.documentElement.scrollWidth <= W + 1 ? 'ok' : document.documentElement.scrollWidth + ' · ' + [...document.querySelectorAll('#app *')].filter((e) => e.getBoundingClientRect().right > W + 2 && !e.closest('.ratings, .tablewrap')).slice(0, 5).map((e) => e.tagName + '#' + e.id + '.' + e.className).join(' | '); });
      const ov = {}; for (const k of ['replay', 'stats', 'players']) { await pane(k); ov[k] = await overflow(); }
      // R4: kampstatistikken passer i bredden ved 390 (table-layout: fixed) – ingen vandret rul i sin ramme
      await pane('stats'); const msW = await g.evaluate(() => { const w = document.querySelector('#match-stats').closest('.tablewrap'); return w.scrollWidth - w.clientWidth; });
      check('Efter kampen på mobil (390 px): ingen af de tre faner ruller siden sidelæns (karakterarkene ruller selv) – og kampstatistikken passer i sin ramme', Object.values(ov).every((v) => v === 'ok') && msW <= 1, JSON.stringify({ ov, msW }));
      await pane('players'); await g.setViewportSize({ width: 1400, height: 1000 }); }
    // v3.20.0 (brugeren): dit ark viser fra start holdets heat map OG startopstillingen – som modstanderens (zoner + opstilling)
    await g.waitForSelector('#heat-pitch');
    const heat = await g.evaluate(() => ({ cells: document.querySelectorAll('#heat-pitch .heat-cell').length, title: document.querySelector('#heat-title').textContent, thirds: document.querySelector('#heat-thirds')?.textContent ?? '', btn: document.querySelectorAll('#heat-btn').length,
      lineups: [...document.querySelectorAll('.ratings .minipitch-wrap')].filter((w) => w.firstElementChild?.textContent.startsWith('Startopstilling')).length }));
    check('Heat map: dit hold som felter fra start (uden knap), modstanderen kun groft i tredjedele – og begge ark har startopstillingen', heat.cells >= 6 && /Holdet/.test(heat.title) && /Tyngdepunkt \(groft\)/.test(heat.thirds) && heat.btn === 0 && heat.lineups === 2, JSON.stringify(heat));
    // v3.22.0 Kampens tal: klik på din spiller → erobringer/bolde tabt og samarbejde under hans heat map – tallene er dem i gemmets
    // handlingslog (trace.acts) for ham; modstanderens ark har ingen (kun dit hold)
    { const team = await g.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('tactivar_save')), lr = d.league.lastRound, me = d.league.teams.find((t) => !t.isBot).id;
        const m = lr.matches.find((x) => x.homeId === me || x.awayId === me), side = m.homeId === me ? 'h' : 'a';
        const combos = m.trace.acts.filter((x) => ['cb', 'run', 'cross', 'long', 'corner', 'fk'].includes(x[1]) && x[2] === side).length;
        const opp = m.trace.acts.filter((x) => ['cb', 'run', 'cross', 'long', 'corner', 'fk'].includes(x[1]) && x[2] !== side).length;
        return { combos, opp, items: document.querySelectorAll('#mn-combos li').length, title: document.querySelector('#mn-combos strong')?.textContent, ball: document.querySelectorAll('#mn-ball').length };
      });
      check('Holdets samarbejde: under holdets heat map står alle dit holds kombinationer (ikke modstanderens) – erobringer først ved klik på en spiller',
        team.title === '🤝 Holdets samarbejde' && team.items === team.combos && team.ball === 0, JSON.stringify(team)); }
    { const row = g.locator('.ratings tr[title^="Vis hans heat map"]').nth(5);
      await row.click(); await g.waitForSelector('#match-numbers');
      const mn = await g.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('tactivar_save')), lr = d.league.lastRound, me = d.league.teams.find((t) => !t.isBot).id;
        const m = lr.matches.find((x) => x.homeId === me || x.awayId === me), side = m.homeId === me ? 'h' : 'a';
        const title = document.querySelector('#heat-title').textContent, nr = Number(title.match(/#(\d+)/)[1]);
        const pid = (side === 'h' ? m.ratings.home : m.ratings.away).find((e) => e.shirtNumber === nr).playerId;
        const won = m.trace.acts.filter((x) => ['press', 'trap', 'flank', 'tackle'].includes(x[1]) && x[2] === side && x[3] === pid).length;
        const combos = m.trace.acts.filter((x) => ['cb', 'run', 'cross', 'long', 'corner', 'fk'].includes(x[1]) && x[2] === side && (x[3] === pid || x[4] === pid)).length;
        return { text: document.querySelector('#match-numbers').textContent, n: document.querySelectorAll('#match-numbers').length, won, combos, items: document.querySelectorAll('#mn-combos li').length };
      });
      check('Kampens tal: dine spillers erobringer og samarbejde står under hans heat map – samme tal som kampens handlingslog, kun ét sted (dit hold)',
        mn.n === 1 && mn.text.includes(`${mn.won} erobring`) && mn.items === mn.combos && /Samarbejde/.test(mn.text) && (mn.combos > 0 || /ingen cutbacks/.test(mn.text)), JSON.stringify(mn));
      await g.click('#heat-team'); }
    // 📍 erstatter kun startopstillingen; heat map'et bliver stående, og ↩ giver startopstillingen tilbage
    await pane('replay');
    if (await g.locator('#feed .snap-btn').count()) {
      const view = async () => ({ snap: await g.locator('#snap-pitch').count(), heat: await g.locator('#heat-pitch').count() });
      await g.locator('#feed .snap-btn').first().click(); await g.waitForSelector('#mc-tab-players.active'); const afterPin = await view();   // v3.32.1: 📍 skifter til "👥 Spillerne"
      await g.click('#snap-back'); const afterBack = await view();
      check('📍 viser øjebliksbilledet i stedet for startopstillingen, heat map\'et står stadig; ↩ giver startopstillingen', afterPin.snap === 1 && afterPin.heat === 1 && afterBack.snap === 0 && afterBack.heat === 1, JSON.stringify([afterPin, afterBack]));
    }
  } else check('Afspilning findes efter en spillet runde', false, (await g.locator('#replay').textContent().catch(() => 'intet #replay')) + ' | mc ' + (await g.locator('#match-center').count()));
  // v3.16.3: 📍 i et gem fra før afspilningen (v3.12.1–v3.15: øjebliksbilleder, intet spor) – sporet fjernes fra det gemte spil,
  // siden genindlæses, og 📍-flowet køres i den rigtige app; bagefter lægges det oprindelige gem tilbage.
  const savedWithTrace = await g.evaluate(() => localStorage.getItem('tactivar_save'));
  // TM v3.22.0: et spor fra før Kampens tal (v3.14–v3.21: heat map, men ingen trace.acts) viser forklaringen – ikke 0 erobringer / 0 bolde tabt
  { await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); for (const m of d.league.lastRound.matches) delete m.trace.acts; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
    await reload(); await tab('kamp'); await pane('players');
    await g.locator('.ratings tr[title^="Vis hans heat map"]').nth(5).click(); await g.waitForSelector('#match-numbers');
    const old = await g.evaluate(() => ({ text: document.querySelector('#match-numbers').textContent, n: document.querySelectorAll('#match-numbers').length, balls: document.querySelectorAll('#mn-ball, #mn-combos').length }));
    check('Kampens tal: et spor uden handlingslog (før v3.22.0) forklarer, at tallene findes fra v3.22.0 – ingen 0-tal', old.n === 1 && old.balls === 0 && old.text === '📊 Kampens tal findes for kampe spillet fra v3.22.0.', JSON.stringify(old));
    // TM v3.22.0: visningen af erobringer, bolde tabt, offside og kombinationer bevist for HVER spiller på dit ark. Spillets egne tal er
    // tilfældige pr. kørsel (randomSeed) og rummer ofte kun 1–2 kombinationer – så en kendt handlingslog lægges i det gemte spor og
    // genindlæses: alle seks arter, begge retninger, alle tre udfald, mål ikke i tidsrækkefølge, modstanderens poster (tabt/offside) og
    // en modstander-kombination, der ikke må tælles. Forventningen er skrevet med egne bogstavelige tekster (ikke heatmap.js' COMBO_LABEL).
    // Mutation: byt pil, udfald, art, medspiller, minut, rækkefølge, offside/tabt eller side → rød.
    { await g.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot).id;
        const m = d.league.lastRound.matches.find((x) => x.homeId === me || x.awayId === me), mine = m.homeId === me ? 'h' : 'a', opp = mine === 'h' ? 'a' : 'h';
        const P = (mine === 'h' ? m.ratings.home : m.ratings.away).map((e) => e.playerId), Q = (mine === 'h' ? m.ratings.away : m.ratings.home).map((e) => e.playerId);
        m.trace.acts = [[50, 'corner', mine, P[1], P[2], 0], [12, 'cb', mine, P[3], P[1], 2], [30, 'cross', mine, P[2], P[4], 1], [75, 'long', mine, P[4], P[1], 2], [20, 'run', mine, P[5], P[1], 1], [60, 'fk', mine, P[1], P[6], 0],
          [10, 'press', mine, P[1], Q[1], null], [11, 'trap', mine, P[2], Q[2], null], [13, 'flank', mine, P[3], Q[3], null], [14, 'tackle', mine, P[3], Q[3], null],
          [15, 'press', opp, Q[1], P[1], null], [16, 'trap', opp, Q[2], P[1], null], [17, 'flank', opp, Q[3], P[1], null], [18, 'tackle', opp, Q[4], P[5], null], [19, 'press', opp, Q[1], P[2], null],
          [40, 'cross', opp, Q[1], Q[2], 2]];
        localStorage.setItem('tactivar_save', JSON.stringify(d)); });
      await reload(); await tab('kamp'); await pane('players');
      const labels = { cb: 'cutback', run: 'løb og aflevering', cross: 'indlæg', long: 'lang bold', corner: 'hjørnespark', fk: 'frisparksindlæg' }, outs = { 2: '⚽ mål', 1: 'afslutning, ikke mål', 0: 'clearet' };
      const exp = await g.evaluate(async ({ labels, outs }) => {
        const { evMin, fmtMin, tickClock } = await import('./engine/clock.js');   // referatets ur: linjen i tick'et, der nævner modtageren
        const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot).id;
        const m = d.league.lastRound.matches.find((x) => x.homeId === me || x.awayId === me), side = m.homeId === me ? 'h' : 'a', list = side === 'h' ? m.ratings.home : m.ratings.away;
        const nm = (id) => { const r = list.find((e) => e.playerId === id); return `#${r.shirtNumber} ${r.shortName}`; };
        const plr = (n, one, many) => `${n} ${n === 1 ? one : many}`;
        const minOf = (t, to) => { const ev = m.events.find((x) => x.min === t && typeof x.text === 'string' && x.text.includes(nm(to))); return ev ? evMin(ev) : fmtMin(tickClock(t / 3, m.stoppage ?? null)); };
        return list.map((e) => {
          const A = m.trace.acts, wins = A.filter((x) => ['press', 'trap', 'flank', 'tackle'].includes(x[1]) && x[2] === side && x[3] === e.playerId).length;
          const lost = A.filter((x) => ['press', 'flank', 'tackle'].includes(x[1]) && x[2] !== side && x[4] === e.playerId).length;
          const off = A.filter((x) => x[1] === 'trap' && x[2] !== side && x[4] === e.playerId).length;
          const combos = A.filter((x) => labels[x[1]] && x[2] === side && (x[3] === e.playerId || x[4] === e.playerId))
            .sort((p, q) => p[0] - q[0]).map((x) => `${x[3] === e.playerId ? `til ${nm(x[4])}` : `fra ${nm(x[3])}`}: ${labels[x[1]]}, ${minOf(x[0], x[4])} – ${outs[x[5]]}`);
          return { nr: e.shirtNumber, ball: `${plr(wins, 'erobring', 'erobringer')} · ${plr(lost, 'bold tabt', 'bolde tabt')}${off ? ` · fanget offside ${plr(off, 'gang', 'gange')}` : ''}`, combos: combos.length ? combos.join(' | ') : 'ingen cutbacks, indlæg, løb eller dødbolde med en medspiller i denne kamp' };
        });
      }, { labels, outs });
      const bad = [];
      for (const x of exp) {
        await g.locator('.ratings tr[title^="Vis hans heat map"]').filter({ hasText: `#${x.nr} ` }).first().click(); await g.waitForSelector('#match-numbers');
        const got = await g.evaluate(() => ({ ball: document.querySelector('#mn-ball').textContent.replace(/^📊 Kampens tal: /, ''), combos: document.querySelectorAll('#mn-combos li').length ? [...document.querySelectorAll('#mn-combos li')].map((li) => li.textContent).join(' | ') : document.querySelector('#mn-combos').textContent.replace(/^🤝 Samarbejde/, '') }));
        if (got.ball !== x.ball || got.combos !== x.combos) bad.push(`#${x.nr}: ${JSON.stringify(got)} ≠ ${JSON.stringify(x)}`);
      }
      const all = exp.map((x) => x.ball + ' | ' + x.combos).join('\n');
      check('Kampens tal: hver af dine spillere viser præcis sine erobringer, bolde tabt, offside og kombinationer (til/fra, medspiller, art, referatets minut, udfald) ud fra handlingsloggen',
        bad.length === 0 && exp.length >= 11 && all.includes('fanget offside 1 gang') && all.includes('til #') && all.includes('fra #') && all.includes('afslutning, ikke mål') && all.includes('⚽ mål') && all.includes('clearet') && all.includes('ingen cutbacks'), `${bad.slice(0, 2).join(' | ')}`);
    }
    await g.evaluate((s) => localStorage.setItem('tactivar_save', s), savedWithTrace); }
  await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); for (const m of d.league.lastRound.matches) delete m.trace; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
  await reload(); await tab('kamp');
  // v3.12.1: 📍 ved mål i åbent spil viser dit holds positioner i øjeblikket på minibanen
  const snapSaved = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0].events.filter((e) => e.snapshot).length);
  const pins = await g.locator('#feed .snap-btn').count();
  check('Gem uden spor: 📍 står ved præcis de mål, der har et gemt øjebliksbillede – og ingen 🎬', pins === snapSaved && (await g.locator('#feed .replay-btn').count()) === 0, `${pins} / ${snapSaved}`);
  if (pins > 0) {
    await g.locator('#feed .snap-btn').first().click();
    // Release Manager v3.13: før sammenlignede checken med startopstillingen (≈ 6 % falsk rød, når billedet tilfældigt
    // lignede). Nu: brikkerne på minibanen er PRÆCIS et gemt øjebliksbillede (spiller-id og koordinater).
    const shown = (await g.locator('#snap-pitch .mp-token').evaluateAll((ts) => ts.map((t) => `${t.dataset.pid}@${parseFloat(t.style.left)},${parseFloat(t.style.top)}`))).sort().join('|');
    const saved = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[0].events.filter((e) => e.snapshot).map((e) => e.snapshot.pts.map(([id, x, y]) => `${id}@${x},${Math.max(1, Math.min(99, Math.round((50 + (y - 50) * 1.175) * 10) / 10))}`).sort().join('|')));   // v3.16.3: y i banens skala (50 + (y − 50)·1,175), regnet her
    // v3.15: efter et rødt kort har billedet 10 (eller færre) brikker – antallet skal passe med det gemte billede (saved.includes)
    const nTok = await g.locator('#snap-pitch .mp-token').count();
    const onPlayers = (await g.locator('#mc-tab-players.active').count()) === 1; await pane('replay');   // v3.32.1: 📍 skiftede til "👥 Spillerne"; markeringen står i referatet
    check('Klik på 📍: "👥 Spillerne" åbnes, og minibanen viser et gemt øjebliksbillede præcist (7–11 brikker på deres gemte pladser, bolden) – linjen er markeret i referatet', onPlayers && nTok >= 7 && nTok <= 11 && nTok === shown.split('|').length && saved.includes(shown) && (await g.locator('#feed .ev.snapped').count()) === 1, shown.slice(0, 80));
    await pane('players'); const ballN = await g.locator('#snap-ball').count(); check('Klik på 📍: bolden står på minibanen', ballN === 1);
    // Test Manager v3.12.1: et mål IMOD mod mellemblok med bolden midt i banen viser præcis startopstillingen (ingen forskydning) – kun dine egne mål SKAL stå anderledes
    // Test Manager v3.12.1: et nyt valg af kamp (også den aktive) fjerner billedet – ellers hænger et gammelt øjebliksbillede ved
    await g.locator('#match-cards .matchcard.active').click();
    const snapGone = (await g.locator('#snap-pitch').count()) === 0 && (await g.locator('#mc-tab-players.active').count()) === 1; await pane('replay');
    check('Valg af kamp fjerner øjebliksbilledet (mc.snap nulstilles) – fanen bevares', snapGone && (await g.locator('#feed .ev.snapped').count()) === 0);
    await g.locator('#feed .snap-btn').first().click(); await g.waitForSelector('#snap-pitch');
    await g.click('#snap-back');
    check('↩ Startopstilling går tilbage til minibanen fra kampstart', (await g.locator('#snap-pitch').count()) === 0 && (await g.locator('.ratings').nth(own).locator('.mp-token').count()) === 11);
  }
  await g.evaluate((f) => localStorage.setItem('tactivar_save', f), savedWithTrace);
  await reload(); await tab('kamp');
  check('Gemmet med spor er tilbage: afspilningen findes igen', (await g.locator('#replay #rp-pitch').count()) === 1);
  const allEvents = await g.locator('#feed .ev').count();
  await g.click('#feed-filters button:nth-child(3)');
  check('Filteret "Kun nøglemomenter" viser færre hændelser', (await g.locator('#feed .ev').count()) < allEvents);
  await g.click('#match-cards .matchcard:nth-child(2)');
  check('De øvrige kampe kan åbnes', (await g.textContent('#scoreboard')).includes((await g.textContent('#match-cards .matchcard:nth-child(2)')).split(' ')[0]));
  check('Match Center har ingen Luk-knap (Kamp-fanen er dens plads)', (await g.locator('#close-mc').count()) === 0);
  await tab('liga');
  const stHead = await g.textContent('#standings-title');
  check('Efter slutfløjt: Liga-fanen viser avisen og ingen afspilningsbesked', (await g.isVisible('#gazette')) && (await g.locator('#booked-league').count()) === 0);
  // v3.10: statistik nederst – fire sektioner, tal = gemte data, andre holds private tal findes ikke
  const secs = await g.locator('#stats details.stats-sec > summary').allTextContents();
  check('Statistik: fire sektioner for sæsonen (spillere åben, resten sammenfoldet), ingen linje om manglende runder', secs.length === 4 && secs[0] === 'Spillere (sæson 1)' && secs[3] === 'Dit hold (privat, sæson 1)' && (await g.locator('#stats-gap').count()) === 0 && (await g.locator('#stats-players').getAttribute('open')) !== null && (await g.locator('#stats-teams').getAttribute('open')) === null, secs.join(' | '));
  const scorers = await g.locator('#stats .stat-list[data-key="sGoals"] td.st-val').allTextContents();
  const goalsSaved = await g.evaluate(() => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league; return L.teams.flatMap((t) => t.squad.map((p) => p.sGoals)).filter((n) => n > 0).sort((a, b) => b - a).slice(0, 5); });
  check('Statistik: topscorerlisten matcher de gemte sæsonmål', JSON.stringify(scorers.map((t) => Number(t.trim()))) === JSON.stringify(goalsSaved), `${scorers.join(',')} / ${goalsSaved.join(',')}`);
  await g.click('#stats-teams > summary');
  const teamHead = await g.locator('#team-stats thead th').allTextContents();
  check('Holdtal: ingen kolonner, der kan røbe taktik (skud/xG/kontra/hjørne/VAR)', teamHead.length === 10 && teamHead.includes('🟥') && !teamHead.some((t) => /skud|xg|kontra|hjørne|var-/i.test(t)) && (await g.locator('#team-stats tbody tr').count()) === 8, teamHead.join('|'));
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
    return { round: L.lastRound.round, me, results: L.lastRound.matches.map((m) => `${m.homeName}${m.homeGoals}-${m.awayGoals}${m.awayName}📺 Referat👥 ${m.att.toLocaleString('da-DK')}`),   // v3.30.0: tilskuerne fra den gemte kamp
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
  check('Klik på et resultat åbner netop den kamps referat i Kamp-fanen', (await g.textContent('#tabs .tab.active')).includes('Kamp') && (await g.locator('#match-cards .matchcard:nth-child(3).active').count()) === 1 && (await g.textContent('#scoreboard')).includes(third) && (await g.locator('#feed-filters button:nth-child(1).active').count()) === 1 && (await g.locator('#mc-tab-replay.active').count()) === 1);
  const att3 = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[2].att);
  check('Referatet: tilskuerne under resultatet er netop den kamps (v3.30.0)', Number.isInteger(att3) && att3 >= 4000 && (await g.textContent('#scoreboard #attendance')) === `👥 ${att3.toLocaleString('da-DK')} tilskuere`, String(att3));
  await tab('liga');
  check('Ligatabellen er opdateret efter runde 1', stHead.includes('sæson 1, efter 1 af 14 runder'), stHead);
  await seeTeam('2');
  // Spillerkortet viser sæsonens løb (km pr. 90 min og bedste topfart) for en spiller, der har spillet
  const card = await g.evaluate(() => { const t = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot); const p = t.squad.find((x) => x.minutesSum > 0 && x.hiDistSum > 0); return { nr: p.shirtNumber, km: (p.distanceSum / p.minutesSum * 90).toFixed(1).replace('.', ','), ts: p.topSpeedMax.toFixed(1).replace('.', ','), hi: Math.round(p.hiKmSum / p.hiDistSum * 100) }; });
  await seeTeam('0');
  await g.locator('#matrix tbody tr', { has: g.locator('td:first-child', { hasText: new RegExp(`#${card.nr}$`) }) }).first().click();
  const rs = await g.textContent('#run-stats');
  check('Spillerkortet: km pr. 90 min, andel højintenst og topfart for sæsonen', rs.includes(`${card.km} km pr. 90 min`) && rs.includes(` ${card.hi} % højintenst`) && rs.includes(`topfart ${card.ts} km/t`), `${rs} (forventet ${card.km} / ${card.hi} % / ${card.ts})`);
  await tab('liga'); await g.selectOption('#team-select', '2');   // Liga-vælgeren selv (ikke seeTeam)
  check('Holdvælgeren i Liga-fanen viser holdet i Trup', (await g.textContent('#tabs .tab.active')).includes('Trup') && (await g.textContent('#club-name')) === (await g.locator('#team-select option').nth(2).textContent()));
  await seeTeam('0');
  await tab('taktik'); await g.locator('#lineup-list tr.lp-row').nth(1).click();
  check('Påbegyndt byt viser besked ved listen', (await g.textContent('#pick-msg')).includes('skal byttes med'));
  await reload();
  check('Efter F5: runden er gemt', (await g.textContent('#play-round')).includes('runde 2 af 14'));
  await tab('kamp');
  check('Kamp-fanen genviser seneste runde færdigspillet (ikke live)', (await g.isVisible('#match-center')) && (await g.locator('#skip').count()) === 0 && (await g.textContent('#match-center')).includes('runde 1'));
  // v3.24.5 (brugeren: "9 redninger … 3 stjerner"): karakterarket viser de svære redninger for sig – og forklarer det i legenden
  {
    const hit = await g.evaluate(() => { const lr = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound;
      for (const [i, m] of lr.matches.entries()) for (const e of [...m.ratings.home, ...m.ratings.away]) if (e.bigSaves != null && e.bigSaves < e.saves) return { i, saves: e.saves, big: e.bigSaves, name: e.shortName };
      return null; });
    if (hit) {
      await g.click(`#match-cards .matchcard:nth-child(${hit.i + 1})`); await pane('players');
      const want = `🧤${hit.saves} (${hit.big ? `${hit.big} ${hit.big === 1 ? 'svær' : 'svære'}` : 'alle lette'})`;
      const icons = await g.locator('.ratings td.icons .ricon.nowrap').allTextContents();
      check('Karakterarket: målmandens 🧤 viser de svære for sig, i ét stykke (nowrap)', icons.includes(want), `${want} | ${icons.join(' ')}`);
      check('Legenden forklarer svære/lette (mobil har ingen hover)', (await g.textContent('#icon-legend')).includes('heraf 2 svære'));
      await g.click('#match-cards .matchcard:nth-child(1)');
    } else check('Karakterarket: data – en målmand med lette redninger i runden', false, 'ingen i runde 1');
  }
  // v3.24.6 (brugeren: "vi skal have allignet informationerne her på kamprapporten"): de to ark side om side – titel, kort,
  // opstilling og liste starter i samme højde
  {
    const tops = await g.evaluate(() => [...document.querySelectorAll('.ratings-grid > .ratings')].map((r) => [...r.children].map((c) => Math.round(c.getBoundingClientRect().top))));
    check('Kamprapporten: de to karakterark står i samme højde (4 blokke, ens top)', tops.length === 2 && tops[0].length === 4 && tops[1].length === 4 && tops[0].every((t, i) => Math.abs(t - tops[1][i]) <= 1) && tops[0][2] > tops[0][1], JSON.stringify(tops));
  }
 await pane('replay'); const evAll = await g.locator('#feed .ev').count();
  // "Rundens mål" i avisen (Liga-fanen) viser kampen og linker til netop dens referat
  await tab('liga');
  const gor = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.gazette.goalOfTheRound);
  if (gor) {
    check('Rundens mål viser, hvilken kamp det faldt i', (await g.textContent('#goal-of-round-match')).includes(gor.match.replace(' - ', ' – ')));
    await g.click('#goal-of-round-match');
    const card = await g.textContent(`#match-cards .matchcard:nth-child(${gor.matchIdx + 1})`);
    check('Linket åbner netop den kamps referat i Kamp-fanen', (await g.textContent('#tabs .tab.active')).includes('Kamp') && (await g.locator(`#match-cards .matchcard:nth-child(${gor.matchIdx + 1}).active`).count()) === 1 && card.startsWith(gor.match.split(' - ')[0]), card);
    const focus = await g.locator('#goal-focus').textContent();
    // v3.16.4: linjen står på hændelsens ur (e.clock), ikke tick-minuttet (gor.min)
    const gorMin = await g.evaluate((x) => { const e = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches[x.matchIdx].events.find((v) => /GOAL/.test(v.type) && v.min === x.min && v.text.includes(x.scorer)); return e?.clock ? (e.clock.plus ? `${e.clock.m}+${e.clock.plus}'` : `${e.clock.m}'`) : null; }, gor);
    check('Målet er markeret i referatet og rullet frem', gorMin !== null && focus.startsWith(gorMin) && focus.includes(gor.scorer) && (await g.locator('#goal-focus').isVisible()) && (await g.evaluate(() => { const r = document.getElementById('goal-focus').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })), focus);
    // v3.31.0 (F3): Rundens mål findes ikke længere i Kamp-fanen (avisen står kun på Liga) – men linket virker stadig derfra, også efter en anden kamp er valgt
    await g.click(`#match-cards .matchcard:nth-child(${((gor.matchIdx + 1) % 4) + 1})`);
    const inKamp = await g.locator('.tabpane.tab-kamp #goal-of-round-match').count();
    await tab('liga'); await g.click('#goal-of-round-match');
    check('Rundens mål: intet link i Kamp (avisen er på Liga) – fra Liga skiftes kampen igen, og målet markeres', inKamp === 0 && (await g.locator(`#match-cards .matchcard:nth-child(${gor.matchIdx + 1}).active`).count()) === 1 && (await g.locator('#goal-focus').count()) === 1, `i Kamp: ${inKamp}`);
  } else check('Runden havde intet mål (intet link at teste)', true);
  await tab('kamp');
  // Hver handling prøves på en frisk side (uden igangværende Match Center).
  await g.click('#match-cards .matchcard:nth-child(3)');
  const card3 = (await g.locator('#match-cards .matchcard:nth-child(3).active').count()) === 1;
  await reload();
  await g.click('#feed-filters button:nth-child(3)');
  check('Efter F5: Kamp-fanen kan skifte kamp og filter', card3 && (await g.locator('#feed-filters button:nth-child(3).active').count()) === 1 && (await g.locator('#feed .ev').count()) < evAll);
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
  check('Avisen: din spiller vises med karakter', gaz.mine.includes('karakter 8,7') && gaz.mine.includes('2 mål'), gaz.mine);
  check('Avisen: modstanderens spiller som "rundens bedste karakter" (v3.16.3) – aldrig tallet, ingen stjerner', gaz.theirs.includes('– rundens bedste karakter') && !gaz.theirs.includes('8,7') && !/[★☆]/.test(gaz.theirs) && !/karakter \d/.test(gaz.theirs), gaz.theirs);

  // Mislykkes backuppen ved "Ny liga" (fuldt lager), står det gamle spil urørt – også efter næste gem
  await seeTeam('0');
  await tab('trup');
  const clubBefore = await g.textContent('#club-name');
  await tab('admin');   // v3.19.0: knapperne står i Admin – fanevalget gemmes, så referencen tages efter skiftet
  const keep = await g.evaluate(() => localStorage.getItem('tactivar_save'));
  await g.evaluate(() => { window.__set2 = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k.startsWith('tactivar_backup_')) throw new Error('QuotaExceededError'); return window.__set2.call(this, k, v); }; });
  g.once('dialog', (d) => d.accept());
  await g.click('#new-league');
  check('Ny liga uden mulig backup: fejl vises og spillet er uændret', (await g.textContent('#fejlboks')).includes('sikkerhedskopieres') && (await g.evaluate(() => localStorage.getItem('tactivar_save'))) === keep);
  await g.click('#save-now'); await tab('trup');
  check('…og det næste gem gemmer stadig det gamle spil', JSON.parse(await g.evaluate(() => localStorage.getItem('tactivar_save'))).league.leagueMetadata.round === JSON.parse(keep).league.leagueMetadata.round && (await g.textContent('#club-name')) === clubBefore);
  await g.evaluate(() => { Storage.prototype.setItem = window.__set2; document.getElementById('fejlboks').hidden = true; document.getElementById('fejlboks').replaceChildren(); });

  // Et gemt spil fra skema 1 migreres, gemmes straks i nyt format og tager kun ÉN backup
  const fixture = fs.readFileSync(new URL('../fixtures/save-schema1.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixture);
  await reload();
  const migNotice = await g.textContent('#notice');
  check('Migrering: beskeden forklarer puljen på 100, Superliga-højderne, friskheden, den naturlige position og kampprogrammet (alle trin fra skema 1 op) – og nævner backuppen', ['100 point', 'Superliga', 'Friskhed', 'Hvis-Så-regler kan nu sættes', 'naturlig position', 'kampprogram', 'Sæson 1 (uden program)', 'backup'].every((x) => migNotice.includes(x)), migNotice);
  await reload(); await reload();
  const mig = await g.evaluate(() => ({ schema: JSON.parse(localStorage.getItem('tactivar_save')).schemaVersion, backups: Object.keys(localStorage).filter((k) => k.startsWith('tactivar_backup_')).length }));
  check('Migrering: gemmes straks i nyeste skema (9 fra v3.23.0), kun én backup trods tre genindlæsninger', mig.schema === 9 && mig.backups === 1, JSON.stringify(mig));
  await tab('liga'); const migHead = await g.textContent('#standings-title');
  await g.click('#past-seasons > summary');
  const past = await g.textContent('#past-seasons');
  await tab('trup');
  check('Migrering: ligaen fra skema 1 er intakt (18 spillere); runde 1 er arkiveret som sæson 1, og sæson 2 starter', migHead.includes('sæson 2, efter 0 af 14 runder') && past.includes('Sæson 1 (uden program) – runde 1–1') && (await rows()) === 18, `${migHead} / ${past.slice(0, 80)}`);
  check('Migrering: ▶ spiller programmets runde 1 i sæson 2', (await g.textContent('#playbar #play-round')).startsWith('▶ Spil runde 1 af 14') && (await g.getAttribute('#playbar #play-round', 'title')).startsWith('Spil runde 1 af 14 mod '));
  // Runden er gemt før v3.5 (uden plads og startformation): Kamp-fanen viser den med listen, uden minibane
  await tab('kamp'); await pane('players');
  const oldRows = await g.locator('.ratings').nth(own).locator('tbody tr td:first-child').allTextContents();
  check('Gammel runde uden plads: karakterark med gemt rolle, ingen minibane', (await g.isVisible('#match-center')) && (await g.locator('.minipitch').count()) === 0 && oldRows.length >= 11 && oldRows.every((t) => / · \S/.test(t) && !/undefined|null/.test(t)), oldRows.slice(0, 2).join(' | '));
  await tab('trup');

  // Skema 2 (brugerens egen liga før v3.6): beskeden nævner puljen og højden – ikke Hvis-Så
  const fixture2 = fs.readFileSync(new URL('../fixtures/save-schema2.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixture2);
  await reload();
  const note2 = await g.textContent('#notice');
  check('Migrering fra skema 2: beskeden nævner 100 point og Superliga-højderne, men ikke Hvis-Så og ikke de 5 cm', note2.includes('100 point') && note2.includes('Superliga') && !note2.includes('Hvis-Så-regler kan nu sættes') && !note2.includes('5 cm'), note2);   // v3.16.4: nyheden nævner "Hvis-Så-regel" – vagten gælder skema 1-beskeden om Hvis-Så
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
  check('Natur-kolonnen viser en position for alle 18 (MV/MS/Back/DM/CM/Kant/OM/ANG) – og én DM efter migreringen (v3.20.0)', nat.length === 18 && nat.every((t) => ['MV', 'MS', 'Back', 'DM', 'CM', 'Kant', 'OM', 'ANG'].includes(t.trim())) && nat.filter((t) => t.trim() === 'DM').length === 1, nat.join(','));
  const pos4 = await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const ps = d.league.teams.flatMap((t) => (t.isBot ? t.squad.filter((p) => !t.tactics.lineupSlots.includes(p.id)) : t.squad)); const m = (k) => { const x = ps.filter((p) => p.position === k).map((p) => p.heightCm); return x.reduce((a, b) => a + b) / x.length; }; return { schema: d.schemaVersion, cb: m('CB'), fb: m('FB') }; });
  check('Migrering fra skema 4: gemt som skema 9, stoppere ≈190 og backs ≈176 cm (botternes startere fik i 7 → 8 den rolle, de spillede – uden for målingen)', pos4.schema === 9 && pos4.cb >= 189 && pos4.cb <= 192 && pos4.fb >= 174.5 && pos4.fb <= 177.5, JSON.stringify(pos4));
  await tab('kamp');
  const old4 = (await g.textContent('#match-center')) + (await pane('players'), await g.textContent('#match-center')) + (await pane('stats'), await g.textContent('#match-center'));   // v3.32.1: alle tre faner
  await pane('players');
  check('Gem fra v3.7.0: karakterark uden "undefined"/"NaN" og uden HI-tal – og ingen avis i Kamp (v3.31.0)', !/undefined|NaN|% HI/.test(old4) && (await g.locator('.ratings td.run').count()) > 0 && (await g.locator('#match-center #gazette').count()) === 0, old4.slice(0, 120));
  await tab('liga');
  const old4gz = await g.textContent('#gazette');
  check('Gem fra v3.7.0: avisen på Liga uden "undefined"/"NaN"', old4gz.length > 40 && !/undefined|NaN/.test(old4gz), old4gz.slice(0, 120));
  await g.click('#goal-of-round-match');
  const g4 = JSON.parse(fixture4).league.lastRound.gazette.goalOfTheRound;
  check('Gem fra v3.7.0: Rundens mål linker til kampen fundet ud fra navnet', (await g.textContent('#scoreboard')).includes(g4.match.split(' - ')[0]) && (await g.locator('#goal-focus').count()) === 1);
  await tab('trup');
  await g.locator('#matrix tbody tr').first().click();
  check('Gem fra v3.7.0: spillerkortet viser ikke 0 % højintenst, men at tallet kommer', (await g.textContent('#run-stats')).includes('højintenst: kommer efter næste kamp'));

  // v3.12.1: et gem fra den live v3.12.0 (skema 6, runde 3, ingen øjebliksbilleder) – Release Manager
  const fixtureV3120 = fs.readFileSync(new URL('../fixtures/save-v3.12.0.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixtureV3120);
  await reload();
  const v3120note = (await g.locator('#notice').count()) ? await g.textContent('#notice') : '';
  check('Gem fra v3.12.0: kun nyheden for 3.12.1 (ikke 3.12.0 igen) – og kun livsløbs-migreringen (v3.18.0, skema 6 → 7)', v3120note.includes('Spillerne rykker nu med') && !v3120note.includes('"Lave cutbacks"') && v3120note.includes('Ny i v3.18') && !v3120note.includes('kampprogram:'), v3120note.slice(0, 160));
  // Test Manager v3.13: nyheden for 3.13 (udskiftninger) vises efter 3.12.1's, og de gamle hold får deres grænse (dit 70, botternes profil)
  check('Gem fra v3.12.0: nyheden for 3.13 om udskiftninger kommer efter 3.12.1-nyheden', v3120note.includes('Udskiftninger under kampen: friskheden falder') && v3120note.indexOf('Spillerne rykker nu med') >= 0 && v3120note.indexOf('Spillerne rykker nu med') < v3120note.indexOf('Udskiftninger under kampen: friskheden falder'), v3120note.slice(-200));
  check('Gem fra v3.12.0: holdene får udskiftningsgrænse efter deres profil (dit hold 70, botterne 75/65/75/70/70/65/75)', JSON.stringify(await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.map((t) => t.subsLimit))) === JSON.stringify([70, 75, 65, 75, 70, 70, 65, 75]));
  await tab('kamp');
  { const pins = await g.locator('#feed .snap-btn').count(), feedN = await g.locator('#feed').count(); await pane('players');
    check('Gem fra v3.12.0: runde 3 i Kamp-fanen uden 📍, startopstillingen på minibanen og ingen fejl', feedN === 1 && (await g.textContent('#match-center')).includes('runde 3') && pins === 0 && (await g.locator('#snap-pitch').count()) === 0 && (await g.locator('.minipitch').count()) >= 1 && (await g.isHidden('#fejlboks'))); }
  check('Gem fra v3.12.0: Kamp har ingen avis (v3.31.0 – den står på Liga), men 📰-linket', (await g.locator('#match-center #gazette').count()) === 0 && (await g.locator('#kamp-paper-link').count()) === 1);
  await tab('liga');
  const oldCol = await g.textContent('#gazette');
  check('Gem fra v3.12.0: avisen er en klumme (bygget af de gemte kampe) med "Din kamp" og uden "undefined"', (await g.locator('#gazette #col-mine').count()) === 1 && !/undefined|NaN/.test(oldCol), oldCol.slice(0, 160));
  // Release Manager v3.14: en fejl i klummen tager ikke Liga-fanen med – den gamle avis vises, og fejlen står i fejlboksen
  const broken = JSON.parse(fixtureV3120); broken.league.lastRound.matches[0].goalsPool = 5;   // kun klummen læser den ved visning
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, JSON.stringify(broken));
  await reload(); await tab('liga');
  check('Fejl i klummen: Liga-fanen viser den gamle avis (overskrifter, ingen "Din kamp") og fejlen i fejlboksen', (await g.locator('#gazette #headlines li').count()) >= 1 && (await g.locator('#gazette #col-mine').count()) === 0 && (await g.isVisible('#fejlboks')) && (await g.textContent('#fejlboks')).includes('Klummen kunne ikke bygges'), await g.textContent('#fejlboks'));
  // v3.31.0 (QC på F3): Hjem og Kamp tager også overskriften – fra den gamle avis (= Ligas første overskrift), og fejlboksen får stadig kun ÉN linje
  { const first = await g.locator('#gazette #headlines li').first().textContent();
    await tab('hjem'); const homeHead = await g.textContent('#home-paper-title').catch(() => 'mangler');
    await tab('kamp'); const kampHead = await g.textContent('#kamp-paper-link').catch(() => 'mangler');
    await tab('liga'); await tab('hjem');
    const lines = await g.evaluate(() => [...document.querySelectorAll('#fejlboks > div')].filter((d) => d.textContent.includes('Klummen kunne ikke bygges')).length);
    check('Fejl i klummen: Hjem og Kamp viser den gamle avis\' første overskrift – og fejlboksen har ÉN linje, selv om Liga, Hjem og Kamp er tegnet flere gange', homeHead === first && kampHead === `📰 «${first}» ›` && lines === 1, `${homeHead} | ${kampHead} | ${first} | ${lines} linjer`); }
  await g.evaluate(() => { const b = document.getElementById('fejlboks'); b.hidden = true; b.textContent = ''; });

  // v3.10: et gem fra v3.9 (runde 2) – kun v3.11's kampprogram-besked, statistikken starter tom fra runde 3
  // v3.20.0 (QC): et gem fra v3.19.0 med dit hold i 4-3-3 – beskeden navngiver din DM og tæller dine uden for position = flagene på Taktik
  const fixtureV319 = fs.readFileSync(new URL('../fixtures/save-v3.19.0.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixtureV319);
  await reload();
  { const note = await g.textContent('#notice'), dm = await g.evaluate(() => { const t = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot); const p = t.squad.find((x) => x.position === 'DM'); return `#${p.shirtNumber} ${p.shortName}`; });
    await tab('taktik'); const flags = await g.locator('#pitch .token-flag.pos').count(), n = Number((note.match(/: (\d+) af dine står uden for position/) ?? [])[1]);
    check('Gem fra v3.19.0: beskeden navngiver din DM, siger at din opstilling er urørt, og antallet uden for position = flagene på Taktik', note.includes(`${dm} nu DM`) && note.includes('Din egen opstilling er ikke ændret') && flags >= 1 && n === flags && (await g.locator('#arrange-lineup').isVisible()), `${flags} flag · ${note.slice(0, 400)}`); }
  // v3.23.0 (Release Manager): et gem fra v3.22.1 (skema 8) – en kort besked om samspillet, så backup-knappen findes; gemt som 9
  const fixtureV3221 = fs.readFileSync(new URL('../fixtures/save-v3.22.1.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixtureV3221);
  await reload();
  { const note = await g.textContent('#notice').catch(() => ''), saved = await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); return { schema: d.schemaVersion, chem: Object.keys(d.league.teams[0].chemistry ?? {}).length, backups: Object.keys(localStorage).filter((k) => k.startsWith('tactivar_backup_')).length }; });
    check('Gem fra v3.22.1 (skema 8): kort besked om samspillet med backup-knap, gemt som skema 9 med samspilstabel', note.startsWith('Dit spil er opdateret: Forberedelse til samspil') && (await g.locator('#download-migration-backup').isVisible()) && saved.schema === 9 && saved.chem > 50 && saved.backups === 1, JSON.stringify(saved) + ' ' + note.slice(0, 200)); }
  const fixtureV39 = fs.readFileSync(new URL('../fixtures/save-v3.9.json', import.meta.url), 'utf8');
  await g.evaluate((f) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', f); }, fixtureV39);
  await reload();
  const v39note = await g.textContent('#notice'); // fanebyt fjerner beskeden
  check('Nyt i v3.12 vises én gang efter opdateringen (sammen med migreringen)', v39note.includes('"Lave cutbacks" giver rigtige cutbacks') && v39note.includes('Direkte lange bolde'), v39note.slice(-200));
  check('Nyhederne står som to sætninger efter hinanden, kun adskilt af ét mellemrum', v39note.includes('i fuldtids-analysen. Spillerne rykker nu med'), v39note.slice(-300));
  check('Hopper man over en version, får man begge nyheder i rækkefølge (3.12.0 før 3.12.1)', v39note.indexOf('"Lave cutbacks"') >= 0 && v39note.indexOf('"Lave cutbacks"') < v39note.indexOf('Spillerne rykker nu med'), v39note.slice(-300));
  // Test Manager v3.26.0: nyheden om Angrebsside er ærlig (lille fordel, målt: et fast valg er højst lige så godt) og kommer med, når man hopper over versioner
  check('Nyt i v3.26.0: Angrebsside – lille fordel, mest ved Lave cutbacks, "Målt: … højst lige så godt", Dit felt ved mindst 5 og ¾', v39note.includes('Det er en lille fordel – ca. ét styret kantangreb pr. kamp, mest ved Lave cutbacks.') && v39note.includes('Målt: Begge finder selv en svag back, og et fast valg er højst lige så godt.') && v39note.includes('(mindst 5, ¾)') && !v39note.includes('(mindst 3'), v39note.slice(-700));
  // Test Manager v3.12: nyheden skal være GEMT straks – ellers vises den igen efter F5, hvis man ikke har gjort andet (fanebyt gemmer også)
  await reload();
  check('Nyt i v3.12 er gemt straks: ikke igen efter F5 uden anden handling', (await g.locator('#notice').count()) === 0);
  await tab('liga');
  const v39secs = await g.locator('#stats details.stats-sec > summary').allTextContents();
  check('Gem fra v3.9: kun kampprogram-beskeden; statistikken tæller for den nye sæson og er tom', v39note.startsWith('Dit spil er opdateret: Nu spilles der efter et fast kampprogram') && !v39note.includes('naturlig position') && v39secs[0] === 'Spillere (sæson 2)' && (await g.locator('#stats .stat-list[data-key="sGoals"]').textContent()).includes('Ingen endnu') && (await g.locator('#fejlboks').isHidden()), v39secs.join(' | '));
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
  check('Migrering fra skema 3: beskeden nævner Superliga-højderne og friskheden – ikke puljen eller Hvis-Så', note3.includes('Superliga') && note3.includes('Friskhed') && !note3.includes('100 point') && !note3.includes('Hvis-Så-regler kan nu sættes'), note3);
  // Advarsel ved ▶ om startere under din udskiftningsgrænse (v3.13: gemt før v3.13 → 70 %; uden grænse: 70 %)
  const setStarterFresh = async (v, limit) => { await g.evaluate(([val, lim]) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const t = d.league.teams.find((x) => !x.isBot); for (const p of t.squad) p.freshness = 100; t.squad.find((p) => p.id === t.tactics.lineupSlots[6]).freshness = val; if (lim !== undefined) t.subsLimit = lim; localStorage.setItem('tactivar_save', JSON.stringify(d)); }, [v, limit]); await reload(); await tab('taktik'); };
  // v3.28.0: pillen "⚠ N" i Spil-bjælken på Taktik, forklaringen i title og på Hjem. Fraværstjek kun efter positiv tilstedeværelse af bjælken.
  const tiredNo = await g.evaluate(() => { const t = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((x) => !x.isBot); const p = t.squad.find((x) => x.id === t.tactics.lineupSlots[6]); return `#${p.shirtNumber} ${p.shortName}`; });
  const noTired = async () => (await g.isVisible('#playbar #play-bar #play-round')) && (await g.locator('#tired-warning').count()) === 0;
  await setStarterFresh(69);
  check('Advarsel: én markspiller under din grænse (70 %) – pillen "⚠ 1", forklaringen siger hvem', (await g.textContent('#tired-warning')) === '⚠ 1' && (await g.getAttribute('#tired-warning', 'title')) === `1 starter under din grænse (70 %) – skiftes ud tidligt (fra 3. minut, højst 3 ad gangen, hvis en frisk afløser i samme kæde sidder på bænken – det bruger et skift): ${tiredNo} er 69 % frisk`, await g.getAttribute('#tired-warning', 'title'));
  await tab('hjem');
  check('Hjem: samme linje under "Før du spiller"', (await g.textContent('#home-todo .todo-row[data-kind="tired"] .todo-txt')) === `1 starter under din grænse (70 %) – skiftes ud tidligt (fra 3. minut, højst 3 ad gangen, hvis en frisk afløser i samme kæde sidder på bænken – det bruger et skift): ${tiredNo} er 69 % frisk`);
  await setStarterFresh(70);
  check('Ingen advarsel ved 70 % (bjælken står der)', await noTired());
  await setStarterFresh(78, 80);
  check('Advarslen følger grænsen: 78 % er under en grænse på 80 % (QC: før fast 70)', (await g.getAttribute('#tired-warning', 'title')).includes('under din grænse (80 %)'));
  await setStarterFresh(69, 0);
  check('Grænse Fra: advarslen om trætte startere under 70 % som før', (await g.getAttribute('#tired-warning', 'title')).startsWith('1 træt starter – yder mindre'));
  await setStarterFresh(100, 70);
  await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const t = d.league.teams.find((x) => !x.isBot); t.squad.find((p) => !t.tactics.lineupSlots.includes(p.id)).freshness = 10; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
  await reload(); await tab('taktik');
  check('En træt bænkspiller giver ingen advarsel (bjælken står der)', await noTired());
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
  await tab('admin'); await g.click('#save-now');
  await g.click('#tab-taktik'); await g.selectOption('#tactics select[data-field="pressingHeight"]', 'LOW_BLOCK');
  const stillOld = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).schemaVersion);
  check('Migrering uden mulig backup: gem og ændringer overskriver ikke den gamle fil – gem-status siger IKKE gemt', stillOld === 1 && (await g.textContent('#save-status')).includes('IKKE gemt') && (await g.textContent('#fejlboks')).includes('IKKE gemt'), String(stillOld));
  const fresh2 = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const g2 = await fresh2.newPage(); await g2.goto(BASE + '/'); await g2.waitForSelector('body[data-klar="ja"]');
  await g.close();
  g = g2; // fortsæt i en ren side uden den kastende setItem

  // Ny liga og import tager backup af det nuværende spil
  await seeTeam('0');
  await g.click('#play-round'); await g.click('#skip'); // en runde i Kamp-fanen, som Ny liga skal fjerne
  await tab('admin');   // knapperne står i Admin (v3.19.0); fanevalget gemmes, så referencen tages efter skiftet
  const savedBefore = await g.evaluate(() => localStorage.getItem('tactivar_save'));
  g.once('dialog', (d) => d.accept());
  await g.click('#new-league');
  const backups = async () => g.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('tactivar_backup_')).map((k) => localStorage.getItem(k)));
  check('Ny liga: det gamle spil ligger i backup', (await backups()).includes(savedBefore));
  check('Ny liga i ⚙ Admin åbner Hjem (ikke Admin og ikke Trup)', (await g.getAttribute('#tabs .tab.active', 'id')) === 'tab-hjem' && (await g.isVisible('#home')));   // TM: kun fejlsidens "Start ny" var testet
  await tab('kamp');
  check('Ny liga: Kamp-fanen viser ikke den gamle ligas runde', (await g.locator('#match-center').count()) === 0 && (await g.isVisible('#no-matches')));
  await tab('admin');
  const exported = await g.evaluate(() => localStorage.getItem('tactivar_save'));
  await g.setInputFiles('#import-file', { name: 'gammel.json', mimeType: 'application/json', buffer: Buffer.from(savedBefore) });
  await g.waitForFunction(() => document.getElementById('notice')?.textContent.includes('importeret'));
  const importedOn = await g.getAttribute('#tabs .tab.active', 'id');   // v3.28.0: en import åbner Hjem (som en ny liga)
  await tab('trup');
  check('Import: indlæser filen, åbner Hjem og lægger det forrige spil i backup', (await backups()).includes(exported) && importedOn === 'tab-hjem' && (await rows()) === 18, importedOn);

  // v3.14 Test Manager: klummen bygges ved visning (app.js columnNow) – fra Liga-fanen (kampoverskrifterne åbner referatet)
  // og ved sæsonslut (den afsluttede sæsons tabel og forløb; næste runde er en NY sæsons). Ingen af delene var set af e2e:
  // en liga spilles i node til runde 13, gemmes og indlæses, og runde 14 spilles i browseren.
  {
    const { createRng } = await import('../../public/engine/rng.js');
    const { createLeague } = await import('../../public/engine/generator.js');
    const { playRound, commitRound } = await import('../../public/engine/season.js');
    const { serialize } = await import('../../public/state/storage.js');
    const { VERSION } = await import('../../public/version.js');
    const rng = createRng(2024), L = createLeague(rng);
    for (let r = 0; r < 13; r++) commitRound(L, playRound(L, rng), rng);
    await g.evaluate((s) => { for (const k of Object.keys(localStorage)) if (k.startsWith('tactivar_')) localStorage.removeItem(k); localStorage.setItem('tactivar_save', s); }, serialize({ league: L, notes: {}, ui: { activePresetIndex: 0, seenVersion: VERSION } }));
    await reload();
    await tab('liga');
    const names = () => g.evaluate(() => { const l = JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound; return l.matches.map((m) => [m.homeName, m.awayName]); });
    const sbTeams = async () => [await g.locator('#scoreboard strong').first().textContent(), await g.locator('#scoreboard .right strong').textContent()];
    check('Liga-fanen (runde 13): avisen er klummen med tre øvrige kampe og et afsnit om næste runde', (await g.locator('#gazette #col-title').count()) === 1 && (await g.locator('#gazette #headlines li').count()) === 3 && (await g.locator('#gazette #col-next').count()) === 1);
    const head0 = await g.locator('#gazette #headlines li').nth(1).textContent(), btnTxt = await g.locator('#gazette #headlines li .col-match').nth(1).textContent();
    await g.locator('#gazette #headlines li .col-match').nth(1).click();
    await g.waitForSelector('.tabpane.tab-kamp');
    const expectedMatch = (await names()).find(([h1, a1]) => btnTxt.includes(h1) && btnTxt.includes(a1));
    check('Liga-fanen: et klik på en kampoverskrift i klummen åbner DEN kamp i Kamp-fanen', JSON.stringify(await sbTeams()) === JSON.stringify(expectedMatch) && head0.startsWith(btnTxt), `${btnTxt} → ${(await sbTeams()).join(' – ')}`);
    // v3.31.0 (F3): Kamp har ingen klumme – en anden kampoverskrift vælges fra Liga, og Kamp viser den kamp i stedet
    const kampGz = await g.locator('.tabpane.tab-kamp #gazette').count();
    await tab('liga');
    const btn0 = await g.locator('#gazette #headlines li .col-match').nth(0).textContent();
    await g.locator('#gazette #headlines li .col-match').nth(0).click(); await g.waitForSelector('.tabpane.tab-kamp');
    const exp0 = (await names()).find(([h1, a1]) => btn0.includes(h1) && btn0.includes(a1));
    check('Kampoverskrifterne i klummen (kun på Liga – ikke i Kamp) skifter den viste kamp (indekset følger overskriften)', kampGz === 0 && JSON.stringify(await sbTeams()) === JSON.stringify(exp0), `${kampGz} | ${btn0} → ${(await sbTeams()).join(' – ')}`);
    // Runde 14 = sæsonens sidste
    await tab('trup');
    await g.click('#play-round');
    await g.waitForSelector('#skip');
    await g.click('#skip');
    await tab('liga');
    const sv = await g.evaluate(async () => {
      const { pairRound } = await import('/engine/season.js');
      const l = JSON.parse(localStorage.getItem('tactivar_save')).league, me = l.teams.find((t) => !t.isBot);
      const [h, a] = pairRound(l).find(([x, y]) => l.teams[x].id === me.id || l.teams[y].id === me.id), home = l.teams[h].id === me.id;
      const t = l.lastRound.gazette.seasonEnd.table;
      return { end: !!l.lastRound.gazette.seasonEnd, round: l.lastRound.round, opp: (home ? l.teams[a] : l.teams[h]).name, home, top: [t[0].teamName, t[0].points, t[1].teamName, t[1].points], myName: me.name };
    });
    check('Sæsonslut: runde 14 afslutter sæsonen (forudsætning)', sv.end && sv.round === 14, JSON.stringify(sv));
    // v3.18.0: sæsonrapporten med ungdomstilbuddene; Tag op flytter spilleren ind i truppen
    const nBefore = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot).squad.length);
    check('Sæsonslut, Liga: sæsonrapporten – ældre, ny løn og 2 ungdomstilbud med Tag op / Lad gå', (await g.isVisible('#season-report')) && (await g.textContent('#sr-aged')).includes('et år ældre')
      && (await g.textContent('#sr-wages')).includes('pr. runde') && (await g.locator('#youth-offers .youth-offer').count()) === 2 && !/undefined|NaN/.test(await g.textContent('#season-report')));
    const takenId = await g.locator('#youth-offers .youth-offer').first().getAttribute('data-yid');
    await g.locator('#youth-offers .youth-take').first().click();
    const nAfter = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot).squad.length);
    check('Sæsonslut: Tag op – spilleren er i truppen (gemt), og ét tilbud er tilbage', nAfter === nBefore + 1 && (await g.locator('#youth-offers .youth-offer').count()) === 1, `${nBefore} → ${nAfter}`);
    // v3.24.1 (Test Manager): Tag op i APPEN sender ligaen videre – den optagne har lastMove = vinduets id i det gemte spil, og i Klub står
    // karantænen som årsag (ingen Sælg/Fritstil) – ellers kan han sælges straks for ≈ 350.000 kr. (pengemaskine)
    const tq = await g.evaluate(async (id) => {
      const { windowOf } = await import('/engine/transfers.js');
      const l = JSON.parse(localStorage.getItem('tactivar_save')).league, p = l.teams.find((t) => !t.isBot).squad.find((x) => x.id === id);
      return { w: windowOf(l), lm: p?.lastMove };
    }, takenId);
    check('Sæsonslut: Tag op giver karantæne som et køb – lastMove = vinduets id i det gemte spil', tq.w != null && tq.lm === tq.w, JSON.stringify(tq));
    await g.evaluate((id) => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot); me.listed = [id]; localStorage.setItem('tactivar_save', JSON.stringify(d)); }, takenId);
    await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
    await tab('klub');
    const qRow = g.locator(`.market-row[data-pid="${takenId}"]`), qTxt = await qRow.textContent();
    check('Sæsonslut, Klub: den optagne ungdomsspiller til salg viser karantænen ("kom til klubben i dette eller sidste vindue") – hverken Sælg, Fritstil eller bud',
      qTxt.includes('kom til klubben i dette eller sidste vindue – kan handles igen ved sæsonslut før sæson') && !qTxt.includes('skiftede klub') && (await qRow.locator('.offer-accept, .release').count()) === 0 && !qTxt.includes('Bud fra'), qTxt);
    await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot); me.listed = []; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
    await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
    await tab('trup');
    await tab('hjem');   // v3.28.0: ungdomstilbuddet står under "Før du spiller" på Hjem (før i Trup)
    { const fin = await g.evaluate(() => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, t = L.seasons.at(-1).table, me = L.teams.find((x) => !x.isBot); return { rows: t.map((r) => `${r.teamName}|${r.points}`), mine: me.name }; });
      const shownRows = await g.evaluate(() => [...document.querySelectorAll('#home-table tr')].map((r) => `${r.children[1].textContent}|${r.lastChild.textContent}`));
      const at = fin.rows.findIndex((x, i) => shownRows.every((y, k) => fin.rows[i + k] === y));
      check('Sæsonslut, Hjem: "Slutstillingen" (ikke "Tabellen"), pladsen er "slutstilling" uden ↑/↓, og minitabellen er et stykke af SLUTstillingen med dit hold',
        (await g.textContent('#home-table .lbl')) === 'Slutstillingen' && (await g.textContent('#home-last')).includes('slutstilling') && (await g.locator('#home-move').count()) === 0
        && at >= 0 && shownRows.length === 5 && shownRows.some((x) => x.startsWith(fin.mine + '|')), JSON.stringify({ shownRows, fin: fin.rows })); }
    check('Sæsonslut, Hjem: "1 ungdomstilbud venter" med link til Liga', (await g.textContent('#youth-pending')).includes('1 ungdomstilbud') && (await g.locator('#youth-pending button').textContent()) === 'Liga ›');
    // v3.18.0 transfers: vinduet er åbent ved sæsonslut – køb en spiller, der kan købes, til den viste faste pris
    const buyable = await g.evaluate(async () => {
      const { marketInfo } = await import('/engine/transfers.js');
      const l = JSON.parse(localStorage.getItem('tactivar_save')).league, me = l.teams.find((t) => !t.isBot);
      for (const [i, t] of l.teams.entries()) if (t.isBot) for (const p of t.squad) { const m = marketInfo(l, me, t, p); if (!m.reason) return { i, id: p.id, price: m.price, cash: me.cashBalance, n: me.squad.length }; }
      return null;
    });
    if (buyable) {
      await seeTeam(String(buyable.i));
      await g.click(`#matrix tbody tr[data-pid="${buyable.id}"]`);
      const btn = await g.textContent('#buy-player'), bName = await g.evaluate((id) => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.flatMap((t) => t.squad).find((p) => p.id === id).shortName, buyable.id);
      await g.click('#buy-player');
      const after = await g.evaluate((id) => { const me = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot); return { cash: me.cashBalance, n: me.squad.length, has: me.squad.some((p) => p.id === id) }; }, buyable.id);
      check('Transfer: "Køb for X kr." på kortet køber spilleren til netop den pris (gemt)', btn.replace(/\D/g, '') === String(buyable.price) && after.has && after.n === buyable.n + 1 && after.cash === buyable.cash - buyable.price, `${btn} / ${JSON.stringify(after)}`);
      // v3.29.0 (QC): panelet lukker ikke tavst efter købet – kvitteringen står i panelet (spilleren står ikke længere i holdet), med vejen til ham
      check('Transfer (F2): kvitteringen står i panelet efter købet – "💰 X er købt …", intet kort og "Se X i din trup ›"', (await g.getAttribute('#cardpanel', 'data-open')) === 'ja'
        && (await g.textContent('#cardpanel #panel-notice')) === `💰 ${bName} er købt og står nu i din trup.` && (await g.locator('#cardpanel #player-card').count()) === 0 && (await g.textContent('#panel-to-squad')).includes(bName), await g.textContent('#cardpanel'));
      await tab('liga');
      check('Transfer: står i ligaens transferliste', (await g.textContent('#transfer-log')).includes('→'));
      // v3.18.1: listen "Til salg i ligaen" i Klub – Køb i listen køber den første spiller til den viste pris
      // Kassen fyldes op først: købet på kortet kan have tømt den, og så er listen (med rette) tom – CI v3.18.1 ventede forgæves
      await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')); d.league.teams.find((t) => !t.isBot).cashBalance += 20000000; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
      await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
      await tab('klub');
      const row = g.locator('#for-sale-table tbody tr').first();
      const sale = { id: await row.getAttribute('data-pid'), price: Number((await row.locator('td').nth(2).textContent()).replace(/\D/g, '')) };
      const before = await g.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot).cashBalance);
      await row.locator('.buy-row').click();
      const after2 = await g.evaluate((id) => { const me = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot); return { cash: me.cashBalance, has: me.squad.some((p) => p.id === id) }; }, sale.id);
      check('Transfer: "💰 Køb" i listen Til salg i ligaen køber til den viste pris – bekræftelsen står ved listen', after2.has && after2.cash === before - sale.price && (await g.textContent('#for-sale-msg')).includes('er købt'), JSON.stringify({ sale, before, after2 }));
      // v3.21.1 (brugeren: "låser mig for meget som manager"): sæt en reserve til salg; rækken viser, hvad et salg frigør, og Fritstil
      const rel = await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), p = me.squad.find((x) => x.line === 'ATT' && !me.tactics.lineupSlots.includes(x.id)) ?? me.squad.find((x) => x.line === 'MID' && !me.tactics.lineupSlots.includes(x.id)); me.listed = [p.id]; localStorage.setItem('tactivar_save', JSON.stringify(d)); return { id: p.id, name: p.shortName, n: me.squad.length }; });
      await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
      await tab('klub');
      const relRow = g.locator(`.market-row[data-pid="${rel.id}"]`);
      check('Transfer: din spiller til salg viser før klikket, hvad et salg frigør i løn, og "Salg i vinduet: 0 af 2"', (await relRow.locator('.market-gain').textContent()).includes('frigør') && (await g.textContent('#sales-left')).includes('0 af 2'), await relRow.textContent());
      await relRow.locator('.release').click();
      const relAfter = await g.evaluate((id) => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot); return { n: me.squad.length, gone: !me.squad.some((p) => p.id === id), log: d.league.transferLog.some((e) => e.id === id && e.kind === 'release') }; }, rel.id);
      check('Transfer: "Fritstil (gratis)" – han er væk (gemt, i transferlisten som fritstillet), beskeden står ved listen, og salget tæller', relAfter.gone && relAfter.log && relAfter.n === rel.n - 1 && (await g.textContent('#for-sale-msg')).includes(`${rel.name} er fritstillet`) && (await g.textContent('#sales-left')).includes('1 af 2'), JSON.stringify(relAfter));
      // v3.21.1 (Test Manager): ved 18 henter en fritstilling en akademispiller – beskeden nævner ham ved navn (" og starter i hans plads" kræver, at han er bedst i kæden – kan ikke styres her)
      const acad = await g.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), MIN = { GK: 2, DEF: 6, MID: 6, ATT: 3 }, cnt = (l) => me.squad.filter((x) => x.line === l).length;
        for (const x of me.squad.slice().reverse()) if (me.squad.length > 18 && !me.tactics.lineupSlots.includes(x.id) && cnt(x.line) > MIN[x.line]) me.squad = me.squad.filter((y) => y !== x);
        const ids = new Set(me.squad.map((x) => x.id)), s = me.squad.find((x) => x.line === 'MID' && me.tactics.lineupSlots.includes(x.id));
        me.matchBench = (me.matchBench ?? []).filter((id) => ids.has(id)); me.listed = [s.id];
        localStorage.setItem('tactivar_save', JSON.stringify(d)); return { id: s.id, name: s.shortName, n: me.squad.length, ids: [...ids] };
      });
      await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
      await tab('klub');
      await g.locator(`.market-row[data-pid="${acad.id}"] .release`).click();
      const acadAfter = await g.evaluate((old) => { const me = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot), y = me.squad.find((x) => !old.includes(x.id)); return { n: me.squad.length, y: y && { name: y.shortName, line: y.line, age: y.age, no: y.shirtNumber } }; }, acad.ids);
      const acadMsg = await g.textContent('#for-sale-msg');
      check('Transfer: Fritstil af en starter ved 18 -> beskeden nævner akademispilleren ved nummer, navn og alder ("kommer ind fra akademiet"), han er i samme kæde – og truppen er stadig 18',
        acad.n === 18 && acadAfter.n === 18 && acadAfter.y?.line === 'MID' && acadMsg === `🔁 ${acad.name} er fritstillet. #${acadAfter.y.no} ${acadAfter.y.name} (${acadAfter.y.age} år) kommer ind fra akademiet.`, JSON.stringify({ acad: { ...acad, ids: undefined }, acadAfter, acadMsg }));
      // v3.21.1 (Test Manager): kortets "du har X pr. runde til løn" følger LOFTET (lønnen før vinduets første salg), ikke budgettet – ledningen er i app.js
      // (uden et salg over budgettet er de to tal ens, så loftet sættes direkte: lønnen + 5.000.000 -> 1.666.667 kr. pr. runde, langt over budgettet)
      await g.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot); (d.league.windowSales.before ||= {})[me.id] = me.squad.reduce((a, p) => a + (p.weeklyWage ?? 0), 0) + 5000000; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
      await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
      await tab('trup');
      await seeTeam(String(buyable.i));
      await g.locator('#matrix tbody tr').first().click();
      const terms = await g.textContent('#buy-terms');
      check('Transfer: kortets "du har … pr. runde til løn" er loftet efter salget (lønnen før salget), ikke budgettet', terms.includes(`du har ${(1666667).toLocaleString('da-DK')} kr. pr. runde til løn`), terms);
      await seeTeam('0');
    } else check('Transfer: en spiller kan købes ved sæsonslut (forudsætning)', false);
    await tab('liga');
    check('Sæsonslut, Liga: sæsonboksen og klummen står sammen', (await g.locator('#gazette #season-end').count()) === 1 && (await g.locator('#gazette #col-title').count()) === 1);
    const colNext = await g.locator('#gazette #col-next p').allTextContents();
    const ny = colNext.filter((t) => t.startsWith('Ny sæson: '));   // opfølgningen på sidste gæt ("Før kampen …") står før, og må gerne være der
    check('Sæsonslut: næste runde er den NYE sæsons runde 1 — "Ny sæson:" sidst, rigtig modstander og retning, intet bud om hans stil', ny.length === 1 && colNext.at(-1) === ny[0] && ny[0].includes(sv.opp) && (sv.home ? ny[0].includes(`${sv.opp} kommer på besøg`) : ny[0].includes(`ude mod ${sv.opp}`)) && !colNext.join(' ').includes('Mit bud') && !colNext.some((t) => t.startsWith('Næste runde')), colNext.join(' | '));
    // v3.14.3 (brugeren: "man kan ikke længere se slutstillingen"): tabellen viser slutstillingen og mesteren
    const stTitle = await g.textContent('#standings-title'), champ = (await g.locator('#standings-champion').count()) ? await g.textContent('#standings-champion') : '';
    check('Sæsonslut, Liga: tabellen er slutstillingen for den afsluttede sæson, med mesteren', /slutstilling, sæson \d+$/.test(stTitle) && champ.startsWith(`🏆 ${sv.top[0]} er mester `) && champ.includes(` ${sv.top[1]} point`) && champ.endsWith('starter med næste runde.'), `${stTitle} | ${champ}`);
    const colForm = (await g.locator('#gazette #col-form p').allTextContents()).join(' | ');
    const [t0, p0, t1, p1] = sv.top;
    // v3.16.7: ved sæsonslut står mesteren i banneret og avisens sæsonboks – ikke en tredje gang i Formen; og aldrig "fører" (QC F9)
    const formOk = (t) => p0 !== 0 && !t.includes('er mester') && !/fører med|står lige i toppen/.test(t);
    check('Sæsonslut: Formen gentager ikke mesteren og siger ikke "fører" (den nye sæsons nulstillede tabel)', formOk(colForm), `${colForm} | mester ${t0} ${p0}, ${t1} ${p1}`);
    // v3.31.0 (F3): Kamp har ingen avis – Kamps link og Hjems 📰-kort bærer netop klummens overskrift (sæsonslut-klummen)
    { const colTitle = await g.textContent('#gazette #col-title');
      await tab('kamp'); const kampLink = await g.textContent('#kamp-paper-link').catch(() => 'mangler'), kampGz = await g.locator('.tabpane.tab-kamp #gazette').count();
      await tab('hjem'); const homeHead = await g.textContent('#home-paper-title').catch(() => 'mangler');
      check('Sæsonslut: Kamp har ingen avis, men 📰 «klummens overskrift» ›, og Hjems 📰-kort har samme overskrift', kampGz === 0 && kampLink === `📰 «${colTitle}» ›` && homeHead === colTitle && colTitle.length > 5, `${colTitle} | ${kampLink} | ${homeHead}`);
      await tab('kamp'); }
    // Test Manager v3.16.3: mesterteksten følger den regel, der afgjorde det — på ALLE tre steder (klummen får champion fra app.js).
    // Et tilfældigt forløb afgøres sjældent på målforskel, så mesteren i det gemte spil sættes til en målforskels-afgørelse (samme point).
    const tie = await g.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('tactivar_save')), se = d.league.lastRound.gazette.seasonEnd, c = se.champion, t = se.table;
      const mk = (r, gd, gf) => ({ teamName: r.teamName, points: c.points, goalDiff: gd, goalsFor: gf });
      const champion = { ...c, ...mk(t[0], 7, 22), runnerUp: mk(t[1], 4, 30) };
      se.champion = champion; d.league.seasons.at(-1).champion = champion;
      localStorage.setItem('tactivar_save', JSON.stringify(d));
      return { first: t[0].teamName, second: t[1].teamName, points: c.points, myPos: se.myPos };
    });
    await g.reload(); await g.waitForSelector('body[data-klar="ja"]'); await tab('liga');
    const tieTxt = `${tie.first} er mester på målforskel – ${tie.myPos === 2 ? 'I' : `${tie.first} og ${tie.second}`} endte begge på ${tie.points} point`;
    const tieCol = (await g.locator('#gazette #col-form p').allTextContents()).join(' | '), tieBox = await g.textContent('#gazette #season-end'), tieTable = (await g.locator('#standings-champion').count()) ? await g.textContent('#standings-champion') : '';
    check('Sæsonslut: afgjort på målforskel står der i avisens sæsonboks og slutstillingen (ens tekst) – ikke en tredje gang i Formen (v3.16.7)', !tieCol.includes('er mester') && tieBox.includes(`${tieTxt}.`) && tieTable.includes(`${tieTxt}.`), `${tieCol} | ${tieBox} | ${tieTable}`);
    // v3.30.0 (QC): lige efter sæsonslut ingen "+N" i Trup – aldersfaldet i sæsonskiftet kan have spist et +1 fra samme runde. Positivt datakrav:
    // rapporten HAR +1 for truppen (og Træning viser dem), sæsonen er netop slut – men regnearket har ingen mærker
    { const se = await g.evaluate(async () => { const { seasonJustEnded } = await import('/engine/season.js'), d = JSON.parse(localStorage.getItem('tactivar_save')), L = d.league, me = L.teams.find((t) => !t.isBot);
        L.trainingReport[me.id].gains.push({ id: me.squad[0].id, skill: 'passing' }, { id: me.squad[1].id, skill: 'pace' }); localStorage.setItem('tactivar_save', JSON.stringify(d));
        return { ended: !!seasonJustEnded(L), n: L.trainingReport[me.id].gains.filter((x) => me.squad.some((p) => p.id === x.id)).length }; });
      await g.reload(); await g.waitForSelector('body[data-klar="ja"]'); await tab('trup');
      const marks = await g.locator('#matrix td.gain, #matrix td.player-gain, #trup-gain-help').count();
      const aged = (await g.locator('#trup-gain-aged').count()) ? await g.textContent('#trup-gain-aged') : '';
      check('v3.30.0 Sæsonslut (QC): Trup siger hvorfor der ingen "+N" er, og linker til Træning', aged === ' · ingen +N lige efter sæsonslut: alle er blevet et år ældre – rundens +1 står på 🏋️ Træning ›', JSON.stringify(aged));
      await tab('traening'); const sum = await g.textContent('#training-summary').catch(() => '');
      check('v3.30.0 Sæsonslut: ingen "+N" i Trup lige efter sæsonskiftet – selv om rapporten har +1 for truppen (de står på Træning)', se.ended && se.n >= 2 && marks === 0 && sum.includes('+1'), JSON.stringify({ se, marks, sum })); }
  }

  // Ødelagt gemt spil: aldrig tom side, data bevaret i backup
  await g.evaluate(() => localStorage.setItem('tactivar_save', '{"schemaVersion":1,"league":{"teams":[]}}'));
  await g.reload(); await g.waitForSelector('body[data-klar="ja"]');
  check('Ødelagt gemt spil: synlig fejl med backup-nøgle i stedet for tom side', (await g.isVisible('#load-error')) && (await g.textContent('#load-error')).includes('tactivar_backup_'));
  const backupOk = await g.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('tactivar_backup_') && localStorage.getItem(k).includes('"teams":[]')));
  check('Ødelagt gemt spil: de rå data ligger i backup', backupOk);
  check('Ødelagt gemt spil: knap til at hente backuppen som fil', await g.isVisible('#download-backup'));
  await g.click('#start-new');
  await g.waitForSelector('.tabpane');
  check('Ny liga fra fejlsiden åbner Hjem (v3.28.0)', (await g.getAttribute('#tabs .tab.active', 'id')) === 'tab-hjem' && (await g.isVisible('#home')));
  await tab('trup');
  check('Ny liga fra fejlsiden giver 18 spillere', (await rows()) === 18);
  // Security v3.19.0: en fejl i tegningen (her: regnearket kaster) giver faner og ⚙ Admin med Eksportér – ikke en hvid side
  {
    const c = await browser.newContext({ viewport: { width: 1400, height: 1000 } }), pg = await c.newPage(), egne = [];
    pg.on('pageerror', (e) => egne.push(e.message));
    await pg.route('**/ui/matrix.js', async (route) => { const r = await route.fetch(); route.fulfill({ response: r, body: (await r.text()).replace('export function renderMatrix({ team, isOwn, ui, notes, onSort, onSelect, onSwap, onFilter, onBlocked }) {', '$&\n  throw new Error(\'testfejl i regnearket\');') }); });
    await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]');
    check('Fejl i tegningen: fejlbesked, faner og ⚙ Admin med Eksportér, Importér og Ny liga', (await pg.textContent('#render-error')).includes('testfejl i regnearket')
      && (await pg.locator('#tabs .tab').count()) >= 5 && (await pg.isVisible('#export')) && (await pg.isVisible('#new-league')) && (await pg.locator('#matrix').count()) === 0 && (await pg.textContent('#fejlboks')).includes('matrix.js:'), egne.join(' | '));
    await c.close();
  }
  // v3.24.3 kamp-id: "📤 Send kampen" hele vejen – firebase-config.js og Googles endpoints er udskiftet her (aldrig mod rigtig
  // Firebase, heller ikke når testen kører mod live). Uden opsætning: forklaring i stedet for knappen.
  {
    const c = await browser.newContext({ viewport: { width: 1400, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] }), pg = await c.newPage(), egne = [], posts = [];
    // v3.32.1 (R2): "📤 Send kampen" står under "⋯ Mere" – foldet åbnes (og huskes, til siden genindlæses)
    const more = async () => { await pg.waitForSelector('#mc-more'); if ((await pg.getAttribute('#mc-more', 'open')) === null) await pg.click('#mc-more > summary'); };
    pg.on('pageerror', (e) => egne.push(e.message));
    let cfg = 'export const FIREBASE = null;';
    await pg.route('**/firebase-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: cfg }));
    await pg.route('**/identitytoolkit.googleapis.com/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ idToken: 'tok', localId: 'uid-e2e', refreshToken: 'ref' }) }));
    await pg.route('**/securetoken.googleapis.com/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id_token: 'tok', user_id: 'uid-e2e' }) }));
    await pg.route('**/firestore.googleapis.com/**', (route) => { posts.push({ url: route.request().url(), body: JSON.parse(route.request().postData() ?? '{}'), auth: route.request().headers().authorization }); route.fulfill({ contentType: 'application/json', body: '{}' }); });
    await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]');
    await pg.click('#play-round'); await pg.click('#skip');
    check('Kamp-id uden opsætning: forklaring, ingen knap', (await pg.textContent('#send-off')).includes('ikke sat op endnu') && (await pg.locator('#send-match').count()) === 0 && (await pg.locator('#sent-list').count()) === 0);
    cfg = "export const FIREBASE = { apiKey: 'fake', projectId: 'tactivar' };";
    await pg.reload(); await pg.waitForSelector('body[data-klar="ja"]'); await pg.click('#tab-kamp');
    const note = await pg.textContent('#send-note');
    check('Kamp-id: knappen har sin forklaring synligt (mobil har ingen hover) – og ingen advarsel, når gengivelsen findes', note.includes('send før næste runde') && !note.includes('Gengivelsen mangler'), note);
    check('Kamp-id (v3.32.1): knappen står foldet ind under "⋯ Mere" – ikke synlig, før foldet åbnes', !(await pg.isVisible('#send-match')) && (await pg.getAttribute('#mc-more', 'open')) === null);
    await more(); await pg.click('#send-match'); await pg.waitForSelector('#sent-as');
    const sent = await pg.textContent('#sent-as'), id = sent.match(/K-[A-HJ-NP-Z2-9]{4}/)?.[0];
    const f = posts[0]?.body?.fields, body = f ? JSON.parse(f.json.stringValue) : null;
    check('Kamp-id: sendt som K-XXXX med eget uid, kampen og gengivelsespakken (rng-tilstand + to hold)', !!id && !sent.includes('uden gengivelse') && posts.length === 1 && posts[0].url.includes(`documentId=${id}`) && posts[0].auth === 'Bearer tok'
      && f.uid.stringValue === 'uid-e2e' && Number.isInteger(body?.replay?.rngState) && body.replay.home.id === body.match.homeId && body.replay.away.id === body.match.awayId && f.score.stringValue === `${body.match.homeGoals}-${body.match.awayGoals}`, sent);
    await pg.click('#copy-id'); await pg.waitForFunction(() => document.getElementById('copy-id').textContent !== 'Kopiér');
    check('Kamp-id: Kopiér kvitterer og lægger id\'et i udklipsholderen', (await pg.textContent('#copy-id')) === 'Kopieret ✓' && (await pg.evaluate(() => navigator.clipboard.readText())) === id);
    // en anden kamp uden gengivelse (pakken væk, fx fuldt lager): advarsel før og efter
    await pg.evaluate(() => localStorage.removeItem('tactivar_replay'));
    await pg.reload(); await pg.waitForSelector('body[data-klar="ja"]'); await pg.click('#tab-kamp');
    check('Kamp-id efter F5: den sendte kamp viser stadig sit id', (await pg.textContent('#sent-as')).includes(id));
    await pg.click('#match-cards .matchcard:nth-child(2)');
    check('Kamp-id uden gengivelsespakke: advarsel før afsendelse', (await pg.textContent('#send-note')).includes('Gengivelsen mangler'));
    await more(); await pg.click('#send-match'); await pg.waitForSelector('#sent-as');
    check('Kamp-id uden gengivelsespakke: "uden gengivelse" ved id\'et, og pakken er ikke sendt', (await pg.textContent('#sent-as')).includes('uden gengivelse') && JSON.parse(posts[1].body.fields.json.stringValue).replay === null);
    // næste runde: kampene kan ikke sendes længere, men id'erne står i listen
    await pg.click('#play-round'); await pg.click('#skip');
    const list = await pg.locator('#sent-list').textContent({ timeout: 3000 }).catch(() => 'ingen #sent-list');
    check('Kamp-id efter næste runde: begge id\'er står under "📤 Sendte kampe", det uden gengivelse markeret', list.includes('Sendte kampe (2)') && list.includes(id) && (list.match(/K-[A-HJ-NP-Z2-9]{4}/g) ?? []).length === 2 && (list.match(/uden gengivelse/g) ?? []).length === 1 && list.includes('Sæson 1 runde 1'), list);
    check('Kamp-id: ingen sidefejl', egne.length === 0 && (await pg.isHidden('#fejlboks')), egne.join(' | '));
    await c.close();
  }
  // ---------- Kamp-id (v3.24.3, Test Manager): "📤 Send kampen" i Match Center ----------
  // firebase-config.js tvinges i begge retninger (null / sat op), og Googles endpoints er falske: INTET når det rigtige netværk.
  {
    const { replayMatch } = await import('../../tools/fetch-match.mjs');
    const versionTxt = () => fs.readFileSync(new URL('../../public/version.js', import.meta.url), 'utf8').match(/'([^']+)'/)[1];
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const open = async ({ firebase, docStatus = 200, signUpStatus = 200, gate = null }) => {
      const c = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
      await c.addInitScript(() => { window.__clip = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__clip.push(t); return Promise.resolve(); } }, configurable: true }); });
      const pg = await c.newPage(), errs = [], log = { signUp: [], refresh: [], doc: [] };
      pg.on('pageerror', (e) => errs.push(e.message));
      await pg.route('**/firebase-config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: firebase ? "export const FIREBASE = { apiKey: 'K', projectId: 'p' };" : 'export const FIREBASE = null;' }));
      await pg.route(/googleapis\.com/, async (r) => {
        const rq = r.request(), url = rq.url();
        if (rq.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
        const json = (status, o) => r.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
        if (url.includes('accounts:signUp')) { log.signUp.push(url); return json(signUpStatus, { idToken: 'IDTOK', refreshToken: 'RTOK', localId: 'UID1' }); }
        if (url.includes('securetoken')) { log.refresh.push({ url, body: rq.postData() }); return json(200, { id_token: 'IDTOK2', user_id: 'UID1' }); }
        if (url.includes('/matches?documentId=')) { log.doc.push({ url, auth: rq.headers().authorization, body: rq.postDataJSON() }); if (gate) await gate; return json(docStatus, {}); }
        return json(404, {});
      });
      await pg.goto(BASE + '/'); await pg.waitForSelector('body[data-klar="ja"]');
      return { pg, log, errs, ctx: c };
    };
    const playOne = async (pg) => { await pg.click('#play-round'); await pg.waitForSelector('#match-center'); return pg; };
    // v3.32.1 (R2): "📤 Send kampen" står under "⋯ Mere" – foldet åbnes efter fløjtet og efter genindlæsning (det huskes inden for siden)
    const more = async (pg) => { await pg.waitForSelector('#mc-more'); if ((await pg.getAttribute('#mc-more', 'open')) === null) await pg.click('#mc-more > summary'); };
    const finish = async (pg) => { await pg.click('#skip'); await pg.waitForSelector('#skip', { state: 'detached' }); await more(pg); };
    const saved = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('tactivar_save')).league.lastRound.matches.map((m) => ({ h: m.homeName, a: m.awayName, hid: m.homeId, hg: m.homeGoals, ag: m.awayGoals, sentAs: m.sentAs ?? null })));

    // A) upload ikke sat op: ingen knap, en forklaring – og intet netværk
    {
      const { pg, log, errs, ctx } = await open({ firebase: false });
      await playOne(pg);
      check('Send kampen: under afspilning er hverken knap eller forklaring der', (await pg.locator('#send-match, #send-off, #sent-as').count()) === 0);
      await finish(pg);
      check('Send kampen: uden Firebase-opsætning står "ikke sat op endnu" – ingen knap, intet sendt-mærke, ingen skjult hover-tekst (QC: mobil)', (await pg.textContent('#send-off')) === '📤 Kamp-id: ikke sat op endnu' && (await pg.getAttribute('#send-off', 'title')) === null && (await pg.locator('#send-match').count()) === 0 && (await pg.locator('#sent-as').count()) === 0);
      await pg.reload(); await pg.waitForSelector('body[data-klar="ja"]');
      check('Send kampen: forklaringen står også efter genindlæsning (kampsiden tegnet fra gemmet)', (await pg.textContent('#send-off')) === '📤 Kamp-id: ikke sat op endnu' && (await pg.locator('#send-match').count()) === 0);
      const stor = await pg.evaluate(() => ({ replay: JSON.parse(localStorage.getItem('tactivar_replay') ?? 'null'), save: localStorage.getItem('tactivar_save') }));
      check('Gengivelsen ligger under sin egen nøgle (runde 1, fire pakker med rng-tilstand) og IKKE i spillets gem', stor.replay?.round === 1 && stor.replay.packs.length === 4 && stor.replay.packs.every((p) => Number.isInteger(p.rngState) && p.home?.id && p.away?.id) && !stor.save.includes('rngState') && !stor.save.includes('"packs"'));
      check('Send kampen: uden opsætning kaldes Google aldrig', log.signUp.length + log.refresh.length + log.doc.length === 0 && errs.length === 0, errs.join(' | '));
      // Ny liga rydder gengivelsen (den forrige ligas pakker hører ikke til den nye)
      await pg.click('#tab-admin'); pg.once('dialog', (d) => d.accept()); await pg.click('#new-league');
      check('Ny liga rydder gengivelsen', (await pg.evaluate(() => localStorage.getItem('tactivar_replay'))) === null);
      await ctx.close();
    }

    // B) opsat: knap → sender → id; hele forløbet mod falske endpoints
    {
      let release; const gate = new Promise((r) => { release = r; });
      const { pg, log, errs, ctx } = await open({ firebase: true, gate });
      await playOne(pg);
      check('Send kampen: knappen vises først efter slutfløjt (ikke under afspilning)', (await pg.locator('#send-match').count()) === 0);
      await finish(pg);
      const m0 = (await saved(pg))[0], m1 = (await saved(pg))[1];
      check('Send kampen: opsat + seneste runde → knap "📤 Send kampen", aktiv, ingen forklaring og intet sendt-mærke', (await pg.textContent('#send-match')) === '📤 Send kampen' && (await pg.isEnabled('#send-match')) && (await pg.locator('#send-off, #sent-as').count()) === 0);
      check('Send kampen: ingen netværkskald før der klikkes', log.signUp.length + log.refresh.length + log.doc.length === 0);
      await pg.click('#send-match');
      await pg.waitForFunction(() => document.getElementById('send-match')?.textContent === '📤 Sender …');
      check('Send kampen: mens der sendes er knappen deaktiveret og siger "Sender …" (ingen dobbeltsend)', await pg.isDisabled('#send-match'));
      await pg.click('#match-cards .matchcard:nth-child(2)');
      check('Send kampen: mens kamp 1 sendes, har kamp 2 stadig sin egen aktive "📤 Send kampen" (ikke "Sender …")', (await pg.textContent('#send-match')) === '📤 Send kampen' && (await pg.isEnabled('#send-match')));
      await pg.click('#match-cards .matchcard:nth-child(1)');
      check('Send kampen: tilbage på kamp 1 siger den stadig "Sender …" og er deaktiveret', (await pg.textContent('#send-match')) === '📤 Sender …' && (await pg.isDisabled('#send-match')));
      release();
      await pg.waitForSelector('#sent-as');
      const idTxt = await pg.textContent('#sent-as'), id = /K-[A-HJ-NP-Z2-9]{4}/.exec(idTxt)?.[0];
      check('Send kampen: efter svaret står "📤 Sendt som K-XXXX" med Kopiér-knap – og send-knappen er væk', !!id && idTxt.startsWith(`📤 Sendt som ${id}`) && (await pg.textContent('#copy-id')) === 'Kopiér' && (await pg.locator('#send-match, #send-off').count()) === 0, idTxt);
      const d = log.doc[0], f = d.body.fields, body = JSON.parse(f.json.stringValue);
      check('Send kampen: anonym bruger oprettet over https, dokumentet POSTet til matches?documentId=<id> med Bearer og uid', log.signUp.length === 1 && log.signUp[0].startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=K') && d.url === `https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/matches?documentId=${id}` && d.auth === 'Bearer IDTOK' && f.uid.stringValue === 'UID1', JSON.stringify([log.signUp, d.url, d.auth]));
      check('Send kampen: felterne er KAMP 1 i runde 1 (hold, stilling, version, runde, sæson) – ikke en anden kamp', f.home.stringValue === m0.h && f.away.stringValue === m0.a && f.score.stringValue === `${m0.hg}-${m0.ag}` && f.version.stringValue === versionTxt() && f.round.integerValue === '1' && f.season.integerValue === '1' && f.v.integerValue === '1', JSON.stringify(f).slice(0, 300));
      const rr = replayMatch({ body });
      check('Send kampen: gengivelsespakken i det sendte spiller kampen IGEN identisk med den, brugeren så (appen → motor)', body.match.homeName === m0.h && body.replay?.home?.id === m0.hid && rr.ok === true, JSON.stringify({ ok: rr.ok, why: rr.why, replayHome: body.replay?.home?.id, hid: m0.hid }));
      await pg.click('#copy-id');
      check('Kopiér-knappen lægger netop id\'et på udklipsholderen', JSON.stringify(await pg.evaluate(() => window.__clip)) === JSON.stringify([id]));
      check('Send kampen: sendt-mærket gemmes på kampen i spillets gem (kun kamp 1)', JSON.stringify((await saved(pg)).map((m) => m.sentAs?.id ?? null)) === JSON.stringify([id, null, null, null]) && (await saved(pg))[0].sentAs.replay === true);
      // en anden kamp i samme runde: egen knap, egen pakke, samme anonyme bruger (refresh – ikke en ny signUp)
      await pg.click('#match-cards .matchcard:nth-child(2)');
      check('Send kampen: kamp 2 har sin egen knap og intet sendt-mærke', (await pg.locator('#send-match').count()) === 1 && (await pg.locator('#sent-as').count()) === 0);
      await pg.click('#send-match'); await pg.waitForSelector('#sent-as');
      const id2 = /K-[A-HJ-NP-Z2-9]{4}/.exec(await pg.textContent('#sent-as'))?.[0], b2 = JSON.parse(log.doc[1].body.fields.json.stringValue), f2 = log.doc[1].body.fields;
      check('Send kampen: kamp 2 sendes med SIN pakke (hold, stilling og gentagelse stemmer), og er et andet id', !!id2 && id2 !== id && f2.home.stringValue === m1.h && b2.replay?.home?.id === m1.hid && b2.match.homeName === m1.h && replayMatch({ body: b2 }).ok === true && log.doc[1].url.endsWith(`documentId=${id2}`));
      check('Send kampen: anden afsendelse genbruger brugeren (refresh-token, samme uid) – ingen ny signUp', log.signUp.length === 1 && log.refresh.length === 1 && log.refresh[0].url.startsWith('https://securetoken.googleapis.com/v1/token?key=K') && log.refresh[0].body === 'grant_type=refresh_token&refresh_token=RTOK' && log.doc[1].auth === 'Bearer IDTOK2' && f2.uid.stringValue === 'UID1', JSON.stringify(log.refresh));
      await pg.click('#match-cards .matchcard:nth-child(1)');
      check('Send kampen: tilbage på kamp 1 står dens id stadig', (await pg.textContent('#sent-as')).includes(id));
      await pg.reload(); await pg.waitForSelector('body[data-klar="ja"]');
      check('Send kampen: id\'et overlever genindlæsning (gemt), og der kan ikke sendes igen', (await pg.textContent('#sent-as')).includes(id) && (await pg.locator('#send-match').count()) === 0);
      // runde 2: nye kampe, nyt sendt-mærke (ikke runde 1's), gengivelsen overskrevet, og runde/sæson i dokumentet er RUNDE 2 / SÆSON 1 (i runde 1 er begge 1 – et bytte ses først her)
      await pg.click('#play-round'); await pg.waitForSelector('#match-center'); await finish(pg);
      check('Send kampen: efter runde 2 har kamp 1 ingen sendt-mærke (runde 1\'s id hører til runde 1) og knappen er tilbage', (await pg.locator('#sent-as').count()) === 0 && (await pg.locator('#send-match').count()) === 1);
      check('Gengivelsen er overskrevet med runde 2 (ikke en pulje af alle runder)', await pg.evaluate(() => { const r = JSON.parse(localStorage.getItem('tactivar_replay')); return r.round === 2 && r.packs.length === 4 && r.packs.every((p) => p.opts.round === 2); }));
      const m2 = (await saved(pg))[0];
      await pg.click('#send-match'); await pg.waitForSelector('#sent-as');
      const f3 = log.doc[2].body.fields, b3 = JSON.parse(f3.json.stringValue);
      check('Send kampen: runde 2 sendes med round = 2 og season = 1 og netop runde 2\'s kamp og pakke', f3.round.integerValue === '2' && f3.season.integerValue === '1' && f3.home.stringValue === m2.h && b3.replay?.opts?.round === 2 && replayMatch({ body: b3 }).ok === true, JSON.stringify([f3.round, f3.season]));
      check('Send kampen: ingen sidefejl', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }

    // C) fejl: serveren afviser → synlig fejl, knappen kommer tilbage, intet gemmes som sendt
    for (const [navn, opt, tekst] of [['Firestore 500', { docStatus: 500 }, '📤 Kampen kunne ikke sendes (500).'], ['anonym login afvist', { signUpStatus: 400 }, '📤 Kampen kunne ikke sendes lige nu – prøv igen senere (login: 400).']]) {
      const { pg, log, ctx } = await open({ firebase: true, ...opt });
      await playOne(pg); await finish(pg);
      await pg.click('#send-match');
      await pg.waitForFunction((t) => document.getElementById('fejlboks')?.textContent.includes(t), tekst.slice(0, 20));
      await pg.waitForFunction(() => document.getElementById('send-match')?.textContent === '📤 Send kampen');
      check(`Send kampen (${navn}): fejlen vises, knappen er tilbage og aktiv, intet "Sendt som", intet gemt som sendt`, (await pg.textContent('#fejlboks')).includes(tekst) && (await pg.isEnabled('#send-match')) && (await pg.locator('#sent-as').count()) === 0 && (await saved(pg)).every((m) => m.sentAs === null), await pg.textContent('#fejlboks'));
      await ctx.close();
    }

    // D) mangler gengivelsen (fuldt lager, ryddet): kampen sendes alligevel – uden pakke, og det siges i det gemte
    {
      const { pg, log, ctx } = await open({ firebase: true });
      await playOne(pg); await finish(pg);
      await pg.evaluate(() => localStorage.removeItem('tactivar_replay'));
      await pg.reload(); await pg.waitForSelector('body[data-klar="ja"]');
      await more(pg); await pg.click('#send-match'); await pg.waitForSelector('#sent-as');
      const b = JSON.parse(log.doc[0].body.fields.json.stringValue);
      check('Send kampen uden gengivelse: kampen sendes med replay = null, og sendt-mærket husker det (replay: false)', b.replay === null && b.match.homeName === (await saved(pg))[0].h && (await saved(pg))[0].sentAs.replay === false);
      await ctx.close();
    }
  }
  // ---------- UI-ombygningen F1 (v3.28.0): gamle gem, afspilningsvagten på Hjem, ↑/↓, mobil 390×844 ----------
  {
    const pf = await fresh();
    const ptab = async (k) => { await pf.click(`#tab-${k}`); await pf.waitForSelector(`.tabpane.tab-${k}`); };
    const reloadP = async () => { await pf.reload(); await pf.waitForSelector('body[data-klar="ja"]'); };
    // Gamle gem: en gemt fane fra før v3.28.0 åbner den samme (Trup, ⚙ Admin); en ukendt åbner Hjem
    for (const [saved, want, sel] of [['trup', 'trup', '#matrix'], ['traening', 'traening', '#training-table'], ['admin', 'admin', '#admin'], ['xyz', 'hjem', '#home']]) {
      await pf.evaluate((t) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); d.ui.tab = t; localStorage.setItem('tactivar_save', JSON.stringify(d)); }, saved);
      await reloadP();
      const pane = await pf.evaluate(() => document.querySelector('.tabpane').className);
      const marked = want === 'admin' ? (await pf.getAttribute('#tab-admin', 'class')).includes('active') && (await pf.locator('#tabs .tab.active').count()) === 0
        : (await pf.getAttribute('#tabs .tab.active', 'id')) === `tab-${want}`;
      check(`Gemt ui.tab = '${saved}' åbner ${{ admin: '⚙ Admin', hjem: 'Hjem', trup: 'Trup', traening: 'Træning' }[want]}`, pane.includes(`tab-${want}`) && (await pf.isVisible(sel)) && marked, pane);
    }
    // Afspilningsvagten på Hjem (QC-runde 2): før runde 2 står resultat, placering, kasse-ændring, "Før du spiller", minitabellen og
    // modstanderens placering og form (positiv tilstedeværelse) – under afspilningen af runde 2 ingen af dem (de er bogført og ville afsløre runden)
    await ptab('hjem'); await pf.click('#play-round'); await pf.click('#skip');
    await ptab('hjem');
    check('Efter runde 1: placeringen står på Hjem uden ↑/↓ (først fra sæsonens 2. runde)', (await pf.isVisible('#home-place')) && (await pf.locator('#home-move').count()) === 0, await pf.textContent('#home-place'));
    await pf.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), p = me.squad.find((x) => x.id === me.tactics.lineupSlots[9]);
      for (const x of me.squad) Object.assign(x, { injuryMatchesLeft: 0, banMatches: 0, banYellows: 0, freshness: 100 });   // kun den ene ⛔ (runde 1 kan have givet skader/kort)
      p.banMatches = 2; p.banWhy = 'DIRECT';
      // v3.30.0: alle evner under 20 et hår fra +1, så runde 2 med sikkerhed giver +1 (startere får kamp-xp) – afspilningsvagten nedenfor har data
      for (const x of me.squad) for (const k of Object.keys(x.skills)) if (x.skills[k] < 20) (x.dev ||= {})[k] = 0.995;
      localStorage.setItem('tactivar_save', JSON.stringify(d)); });
    await reloadP(); await ptab('hjem');
    const HIDDEN = ['#home-last', '#home-place', '#cash-delta', '#home-todo', '#home-table', '#home-opp-form', '#home-motm', '#home-paper'];   // v3.31.0: 👑 og 📰
    const present = () => pf.evaluate((ids) => ids.filter((x) => document.querySelector(x)), HIDDEN);
    const before = await present(), formBefore = await pf.textContent('#home-opp-form');
    await ptab('liga'); const miniBefore = (await pf.locator('#playbar #bar-issues .pill').allTextContents()).join(' | ');
    check('Før runde 2: Hjem viser resultat, placering, kasse-ændring, "Før du spiller", minitabel og modstanderens form – bjælken på Liga har ⛔', before.length === HIDDEN.length && /^Nr\. \d · seneste 3 \(ældste → nyeste\): [VUT]$/.test(formBefore) && /^⛔ #\d+$/.test(miniBefore), `${before} | ${formBefore} | ${miniBefore}`);
    await pf.click('#play-round'); await pf.waitForSelector('#skip');
    let gpRound = null;
    // v3.30.0: rundens +1 er bogført før afspilningen – under den ingen "+N" i Trup og ingen opsamling på Træning (positivt: gemmet HAR +1)
    { const gp = await pf.evaluate(() => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, me = L.teams.find((t) => !t.isBot), g = L.trainingReport?.[me.id]?.gains ?? [];
        return { n: g.length, distinct: new Set(g.filter((x) => me.squad.some((p) => p.id === x.id)).map((x) => `${x.id}|${x.skill}`)).size, players: new Set(g.filter((x) => me.squad.some((p) => p.id === x.id)).map((x) => x.id)).size }; });
      await ptab('trup'); const during = await pf.locator('#matrix td.gain, #matrix td.player-gain, #trup-gain-help').count();
      await ptab('traening'); const sumDuring = await pf.locator('#training-summary').count(), tblDuring = await pf.locator('#training-table').count();
      check('v3.30.0 Under afspilning: ingen "+N" i Trup og ingen opsamling på Træning (tabellen står) – selv om gemmet har rundens +1', gp.n > 0 && during === 0 && sumDuring === 0 && tblDuring === 1, JSON.stringify({ gp, during, sumDuring }));
      gpRound = gp; }
    check('Under afspilning (Træning): Spil-bjælkens ▶ er slået fra og siger "📺 Runde 2 spilles …" – uden tegn og uden næste modstander', (await pf.isDisabled('#playbar #play-round')) && (await pf.textContent('#playbar #play-round')) === '📺 Runde 2 spilles …' && (await pf.locator('#playbar #bar-issues, #playbar #next-opponent, .topbar #play-round').count()) === 0, await pf.textContent('#playbar #play-round'));
    await ptab('hjem');
    check('Under afspilning, Hjem: "📺 Runden spilles i Kamp-fanen" – ingen resultat, placering, kasse-ændring, "Før du spiller", minitabel eller modstanderform',
      (await pf.isVisible('#home-playing')) && (await pf.isVisible('#home-next')) && (await pf.isVisible('#club-link')) && (await present()).length === 0 && (await pf.isDisabled('#playbar #play-round')), JSON.stringify(await present()));
    await ptab('kamp'); await pf.click('#skip');
    { const gp = gpRound; await ptab('trup');
      const after = await pf.evaluate(() => ({ cells: document.querySelectorAll('#matrix td.gain').length, names: document.querySelectorAll('#matrix td.player-gain').length }));
      check('v3.30.0 Efter afspilningen: "+N" på præcis de (spiller, evne), rapporten har – og på navnet for hver spiller med +1', after.cells === gp.distinct && after.names === gp.players && gp.distinct > 0, JSON.stringify({ gp, after })); }
    await ptab('hjem');
    // ↑/↓ efter runde 2: forventningen regnet her fra gemmet (tabellen før runde 2 = tabellen minus rundens kampe, sorteret point → målforskel → mål)
    const mv = await pf.evaluate(() => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, me = L.teams.find((t) => !t.isBot).id;
      const sort = (rows) => rows.slice().sort((a, b) => b.p - a.p || (b.f - b.a) - (a.f - a.a) || b.f - a.f);
      const now = L.leagueMetadata.standings.map((x) => ({ id: x.teamId, p: x.points, f: x.goalsFor, a: x.goalsAgainst })), prev = now.map((x) => ({ ...x }));
      for (const m of L.lastRound.matches) { const h = prev.find((x) => x.id === m.homeId), a = prev.find((x) => x.id === m.awayId);
        h.f -= m.homeGoals; h.a -= m.awayGoals; a.f -= m.awayGoals; a.a -= m.homeGoals; h.p -= m.homeGoals > m.awayGoals ? 3 : m.homeGoals === m.awayGoals ? 1 : 0; a.p -= m.awayGoals > m.homeGoals ? 3 : m.homeGoals === m.awayGoals ? 1 : 0; }
      const pos = (rows) => sort(rows).findIndex((x) => x.id === me) + 1; return { now: pos(now), d: pos(prev) - pos(now) }; });
    const placeTxt = await pf.textContent('#home-place');
    check('Efter runde 2: Hjem viser alt igen, placeringen og ↑/↓ regnet uden sidste runde', (await present()).length === HIDDEN.length
      && placeTxt === `Nr. ${mv.now}${mv.d > 0 ? ` ↑${mv.d}` : mv.d < 0 ? ` ↓${-mv.d}` : ''}`, `${placeTxt} | ${JSON.stringify(mv)}`);
    await pf.context().close();

    // Mobil 390×844 (QC): nav-knapperne mindst 44 px; den faste chrome (Spil-bjælke + bundnavigation – topbaren ruller væk) højst 130 px med
    // 3 advarsler. Før v3.28.0 var den faste topbar alene 137 px (844 − 707); én linje i bjælken ≈ 118 px, to linjer ≈ 160 px → rød.
    // Indholdshøjden på Taktik mellem bjælkerne er en BUND (≥ 650 px; før 707, nu ≈ 726) – også med scout-bjælken (≈ 682).
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), mp = await mctx.newPage();
    mp.on('pageerror', (e) => fejl.push(e.message));
    await mp.goto(BASE + '/'); await mp.waitForSelector('body[data-klar="ja"]');
    await mp.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), s = me.tactics.lineupSlots, P = (i) => me.squad.find((p) => p.id === s[i]);
      P(9).banMatches = 1; P(3).injuryMatchesLeft = 2; P(6).banYellows = 3; localStorage.setItem('tactivar_save', JSON.stringify(d)); });
    await mp.reload(); await mp.waitForSelector('body[data-klar="ja"]');
    const mtab = async (k) => { await mp.click(`#tab-${k}`); await mp.waitForSelector(`.tabpane.tab-${k}`); };
    await mtab('taktik');
    const nav = await mp.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.bottom)]; }));
    check('390×844: syv nav-knapper i bunden af skærmen, hver mindst 44 × 44 px', nav.length === 7 && nav.every(([w, hh, b]) => w >= 44 && hh >= 44 && b === 844), JSON.stringify(nav));
    const chrome = async () => { await mp.evaluate(() => window.scrollTo(0, 400)); return mp.evaluate(() => {
      const bar = document.querySelector('#playbar').getBoundingClientRect(), top = document.querySelector('.topbar').getBoundingClientRect(), sc = document.querySelector('#scout-banner')?.getBoundingClientRect();
      const content = bar.top - Math.max(0, top.bottom, sc ? sc.bottom : 0);
      return { content: Math.round(content), chrome: Math.round(innerHeight - content), bar: Math.round(bar.height), topGone: top.bottom <= 0, pills: document.querySelectorAll('#bar-issues .pill').length }; }); };
    const c1 = await chrome();
    const nb = await mp.evaluate(() => { const v = (q) => { const e = document.querySelector(q); return !!e && e.getBoundingClientRect().width > 0; }, b = document.querySelector('#play-bar #play-round');
      return { count: v('#play-bar .count-narrow') ? document.querySelector('#play-bar .count-narrow').textContent : null, pillsShown: v('#bar-issues'), cut: b.getBoundingClientRect().width < b.scrollWidth - 1, txt: b.textContent }; });
    const oppM = await mp.evaluate(() => { const L = JSON.parse(localStorage.getItem('tactivar_save')).league, me = L.teams.find((t) => !t.isBot).id, pr = L.schedule[0].find(([a, b]) => a === me || b === me); return L.teams.find((t) => t.id === (pr[0] === me ? pr[1] : pr[0])).name; });
    check('390×844, Taktik med 3 advarsler (Spilfører UI): én tæller "⛔1 🚑1 🟨1" (v3.31.1: slags kompakt) i stedet for tre piller, og knappen viser modstanderen helt', nb.count === '⛔1 🚑1 🟨1' && !nb.pillsShown && !nb.cut && nb.txt.includes(oppM), JSON.stringify(nb) + ' | ' + oppM);
    check('390×844, Taktik med 3 advarsler: fast chrome ≤ 130 px (før 137), bjælken én linje, topbaren rullet væk', c1.chrome <= 130 && c1.bar <= 64 && c1.topGone, JSON.stringify(c1));
    check('390×844: indholdshøjden på Taktik mellem bjælkerne ≥ 650 px (før 707)', c1.content >= 650, JSON.stringify(c1));
    await seeTeam(1, mp);
    const c2 = await chrome();
    check('390×844, Taktik med et andet hold: scout-bjælken står fast øverst og tælles med – indholdet stadig ≥ 650 px', (await mp.isVisible('#scout-banner')) && c2.content >= 650 && c2.chrome > c1.chrome, JSON.stringify(c2));
    await mp.click('#scout-back');
    const over = {};
    for (const k of ['hjem', 'taktik', 'trup', 'traening', 'liga']) {
      await mtab(k); await mp.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await mp.waitForTimeout(50);
      over[k] = await mp.evaluate(() => { const pane = document.querySelector('.tabpane').getBoundingClientRect(), bar = document.querySelector('#playbar').getBoundingClientRect(), nav = document.querySelector('#tabbar').getBoundingClientRect();
        const limit = bar.height ? bar.top : nav.top; return [Math.round(limit - pane.bottom), document.documentElement.scrollWidth - innerWidth]; });
    }
    check('390×844: sidste element står over bjælken/navigationen, og ingen fane ruller vandret (Hjem, Taktik, Trup, Træning, Liga)', Object.values(over).every(([gap, x]) => gap >= 0 && x <= 0), JSON.stringify(over));
    // v3.30.0 (TM): syv faner ved 320 px (≈ 45 px pr. knap): teksten står på én linje, forkortes med … og bliver inden for sin knap – ingen vandret rulning
    { await mtab('trup'); await mp.setViewportSize({ width: 320, height: 700 }); await mp.waitForTimeout(50);   // Trup: Liga ruller allerede 33 px vandret ved 320 px (ikke dette)
      const t320 = await mp.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, btns: [...document.querySelectorAll('#tabs .tab')].map((b) => { const t = b.querySelector('.tab-txt'), br = b.getBoundingClientRect(), tr = t.getBoundingClientRect(), cs = getComputedStyle(t);
        return { txt: t.textContent.trim(), w: Math.round(br.width), inside: tr.left >= br.left - 0.5 && tr.right <= br.right + 0.5, ws: cs.whiteSpace, to: cs.textOverflow, ov: cs.overflow, h: Math.round(tr.height) }; }) }));
      check('320×700: syv nav-knapper à ≥ 44 px, hver tekst på én linje (nowrap, …) og inden for sin knap – ingen vandret rulning',
        t320.over <= 0 && t320.btns.length === 7 && t320.btns.every((b) => b.w >= 44 && b.inside && b.ws === 'nowrap' && b.to === 'ellipsis' && b.ov === 'hidden' && b.h <= 20), JSON.stringify(t320));
      await mp.setViewportSize({ width: 390, height: 844 }); }
    // v3.30.0 (TM): på mobil står summen "+N" efter NAVNET (evne-kolonnerne er rullet væk) – ::after er skjult på computer og tegnet her.
    // Spiller 0 har to +1 (FIN) og ét (PAC) = "+3"; en anden spiller har intet. Mærket skal være synligt i viewporten, i mærkets farver, med title.
    await mp.evaluate(() => { const d = JSON.parse(localStorage.getItem('tactivar_save')), me = d.league.teams.find((t) => !t.isBot), p0 = me.squad[0];
      d.league.trainingReport = { [me.id]: { round: 1, gains: [{ id: p0.id, skill: 'finishing' }, { id: p0.id, skill: 'finishing' }, { id: p0.id, skill: 'pace' }], injuries: [], strong: { up: [], down: [] } } };
      localStorage.setItem('tactivar_save', JSON.stringify(d)); });
    await mp.reload(); await mp.waitForSelector('body[data-klar="ja"]'); await mtab('trup');
    const mg = await mp.evaluate(() => { const me = JSON.parse(localStorage.getItem('tactivar_save')).league.teams.find((t) => !t.isBot), p0 = me.squad[0], td = document.querySelector(`#matrix tr[data-pid="${p0.id}"] td.player-gain`);
      const a = td && getComputedStyle(td, '::after'), r = td?.getBoundingClientRect();
      return { names: document.querySelectorAll('#matrix td.player-gain').length, cells: document.querySelectorAll('#matrix td.gain').length, title: td?.title, gain: td?.dataset.gain, disp: a?.display, content: a?.content, bg: a?.backgroundColor, color: a?.color,
        inView: !!r && r.left >= 0 && r.right <= innerWidth, help: document.getElementById('trup-gain-help')?.textContent ?? null, over: document.documentElement.scrollWidth - innerWidth }; });
    check('390×844, Trup: "+3" efter navnet (mærke i .pill-ok-farver, synligt i viewporten) med title "+2 Afslutning, +1 Fart efter runde 1" – og hjælpelinjen står',
      mg.names === 1 && mg.cells === 2 && mg.gain === '3' && mg.title === '+2 Afslutning, +1 Fart efter runde 1' && mg.disp === 'inline-block' && mg.content === '"+3"' && mg.bg === 'rgb(11, 51, 38)' && mg.color === 'rgb(110, 231, 183)' && mg.inView && mg.over <= 0
        && !!mg.help && mg.help.includes('+N = antal +1 efter runde 1'), JSON.stringify(mg));
    await mctx.close();
  }
  // ---------- v3.31.1 (brugeren 3/11: "spil knappen er placeret forskelligt på de enkelte faner") ----------
  // Spil-bjælken på ALLE faner (7 + ⚙) ved 1366 og 390: præcis ét ▶ (i bjælken, intet i topbaren), samme højre kant på alle faner – også
  // under afspilning og på Kamp efter fløjtet – og de SAMME piller som Taktik (data: én udelukket + to trætte). Tælleren viser slags
  // kompakt og fører til Hjem-listen (fra Liga og på Hjem). Under afspilning: slået fra med "📺 Runde N spilles …".
  // (funktionserklæring: hejses, så V3311_ONLY=1 kan køre blokken alene ovenfor)
  async function v3311() {
    const TABS8 = ['hjem', 'trup', 'traening', 'taktik', 'kamp', 'liga', 'klub', 'admin'];
    for (const [w, hgt] of [[1366, 900], [390, 844]]) {
      const c = await browser.newContext({ viewport: { width: w, height: hgt } }), p = await c.newPage();
      p.on('pageerror', (e) => fejl.push(e.message));
      await p.goto(BASE + '/'); await p.waitForSelector('body[data-klar="ja"]');
      const tt = async (k) => { await p.click(`#tab-${k}`); await p.waitForSelector(`.tabpane.tab-${k}`); };
      const mod = (f, arg) => p.evaluate(([src, a]) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const r = (0, eval)('(' + src + ')')(d, a); localStorage.setItem('tactivar_save', JSON.stringify(d)); return r; }, [f.toString(), arg ?? null]);
      const S = await mod((d) => { const me = d.league.teams.find((t) => !t.isBot), sl = me.tactics.lineupSlots, P = (i) => me.squad.find((x) => x.id === sl[i]);
        for (const x of me.squad) Object.assign(x, { injuryMatchesLeft: 0, banMatches: 0, banYellows: 0, freshness: 100 });
        me.subsLimit = 80; Object.assign(P(9), { banMatches: 1, banWhy: 'DIRECT' }); P(4).freshness = 60; P(5).freshness = 70;
        return { ban: P(9).shirtNumber }; });
      await p.reload(); await p.waitForSelector('body[data-klar="ja"]');
      const bar = () => p.evaluate(() => { const b = document.querySelector('#playbar #play-round');
        return { n: document.querySelectorAll('#play-round').length, top: document.querySelectorAll('.topbar #play-round, #controls #play-round').length, x: b ? Math.round(b.getBoundingClientRect().right) : null, vis: !!b && b.getBoundingClientRect().width > 0,
          pills: [...document.querySelectorAll('#playbar #bar-issues .pill')].map((e) => e.textContent), opp: document.querySelectorAll('#playbar #next-opponent').length, dis: !!b?.disabled, txt: b?.textContent ?? null, has: document.body.classList.contains('has-bar') }; });
      const R = {};
      for (const k of TABS8) { await tt(k); R[k] = await bar(); }
      const want = [`⛔ #${S.ban}`, '⚠ 2'];
      check(`v3.31.1 ${w}: Spil-bjælken på alle 8 faner – præcis ét ▶, i bjælken og synligt, intet i topbaren, has-bar overalt`, TABS8.every((k) => R[k].n === 1 && R[k].top === 0 && R[k].vis && R[k].has && !R[k].dis), JSON.stringify(R));
      check(`v3.31.1 ${w}: ▶'s højre kant er den samme på alle 8 faner (yderst til højre)`, new Set(TABS8.map((k) => R[k].x)).size === 1 && R.hjem.x > w - 40, JSON.stringify(TABS8.map((k) => R[k].x)));
      check(`v3.31.1 ${w}: bjælkens piller er de samme som Taktiks på alle faner – også Hjem og ⚙ (⛔ #nr, ⚠ 2)`, TABS8.every((k) => JSON.stringify(R[k].pills) === JSON.stringify(want)), JSON.stringify(TABS8.map((k) => [k, R[k].pills])));
      check(`v3.31.1 ${w}: 🔍 næste modstander i bjælken på alle faner undtagen Hjem (Kamp før første runde har den)`, TABS8.every((k) => R[k].opp === (k === 'hjem' ? 0 : 1)), JSON.stringify(TABS8.map((k) => [k, R[k].opp])));
      if (w === 1366) check('v3.31.1: html ruller altid lodret (overflow-y: scroll) – bjælken er lige bred på korte og lange sider', (await p.evaluate(() => getComputedStyle(document.documentElement).overflowY)) === 'scroll');
      // Tælleren: fire grupper (⛔, ⚠ 2, 🟨, 🟨) → "⛔1 ⚠2 🟨2"; et tryk fra Liga viser Hjem med listen i synsfeltet; på Hjem ruller den dertil
      await mod((d) => { const me = d.league.teams.find((t) => !t.isBot), sl = me.tactics.lineupSlots; me.squad.find((x) => x.id === sl[6]).banYellows = 3; me.squad.find((x) => x.id === sl[7]).banYellows = 3; });
      await p.reload(); await p.waitForSelector('body[data-klar="ja"]'); await tt('liga');
      // blødt (TM v3.30.0): mangler tælleren på Liga, skal det give et NAVNGIVET rødt tjek – ikke 30 s timeout
      const cnt = await p.textContent('#playbar #issue-count', { timeout: 3000 }).catch(() => 'mangler'), cTitle = (await p.getAttribute('#playbar #issue-count', 'title', { timeout: 3000 }).catch(() => null)) ?? '';
      await p.setViewportSize({ width: w, height: 260 });   // lav nok til, at listen er ude af syne, når siden er rullet til bunden (også Hjem på 1366)
      const inView = () => p.evaluate(() => { const r = document.getElementById('home-todo')?.getBoundingClientRect(), bar = document.getElementById('playbar').getBoundingClientRect(); return r ? { top: Math.round(r.top), ok: r.top >= 0 && r.top < bar.top - 40 } : null; });
      await p.click('#playbar #issue-count', { timeout: 3000 }).catch(() => {}); await soft(p, '.tabpane.tab-hjem'); await p.waitForTimeout(50);
      const fromLiga = await inView();
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(50);
      const beforeHome = await inView();
      await p.click('#playbar #issue-count', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(50);
      const onHome = await inView(), stillHome = (await p.locator('.tabpane.tab-hjem').count()) === 1;
      await p.setViewportSize({ width: w, height: hgt });
      check(`v3.31.1 ${w}: tælleren viser slags kompakt "⛔1 ⚠2 🟨2" (spillere pr. slags), "4 ting" i title`, cnt === '⛔1 ⚠2 🟨2' && cTitle.startsWith('4 ting:\n') && cTitle.includes(`#${S.ban} `), `${cnt} | ${cTitle}`);
      check(`v3.31.1 ${w}: tælleren fra Liga → Hjem med "Før du spiller" i synsfeltet; på Hjem (rullet ned, listen ude af syne) ruller den dertil og bliver på Hjem`,
        !!fromLiga?.ok && beforeHome && !beforeHome.ok && !!onHome?.ok && stillHome, JSON.stringify({ fromLiga, beforeHome, onHome, stillHome }));
      // Under afspilning: slået fra, "📺 Runde 1 spilles …", ingen piller, ingen 🔍 – på alle faner, ▶ samme sted
      await tt('taktik'); await p.click('#playbar #play-round'); await p.waitForSelector('#skip');
      const P2 = {};
      for (const k of TABS8) { await tt(k); P2[k] = await bar(); }
      check(`v3.31.1 ${w}: under afspilning på alle 8 faner: ▶ slået fra med "📺 Runde 1 spilles …" – ingen piller og ingen næste modstander, samme højre kant`,
        TABS8.every((k) => P2[k].n === 1 && P2[k].dis && P2[k].txt === '📺 Runde 1 spilles …' && P2[k].pills.length === 0 && P2[k].opp === 0 && P2[k].x === R.hjem.x), JSON.stringify(TABS8.map((k) => [k, P2[k].txt, P2[k].dis, P2[k].pills.length, P2[k].opp, P2[k].x])));
      // Kamp efter fløjtet: "Forbered ›" øverst – derfor intet 🔍 i bjælken; ▶ samme sted, næste runde
      await tt('kamp'); await p.click('#skip'); await p.waitForSelector('#to-home');
      const K = await bar();
      check(`v3.31.1 ${w}: Kamp efter fløjtet – intet 🔍 i bjælken (Forbered › står øverst), ▶ Spil runde 2 samme sted`, K.opp === 0 && K.x === R.hjem.x && !K.dis && K.txt.startsWith('▶ Spil runde 2') && (await p.locator('#playbar .playbar-in.no-opp').count()) === 1, JSON.stringify(K));
      if (w === 390) {
        // Mobil 390×667: sidste række i Trup kan rulles fri af bjælken
        await p.setViewportSize({ width: 390, height: 667 }); await tt('trup');
        await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(50);
        const last = await p.evaluate(() => { const rows = document.querySelectorAll('#matrix tbody tr'), r = rows[rows.length - 1].getBoundingClientRect(), bar = document.getElementById('playbar').getBoundingClientRect(); return { b: Math.round(r.bottom), barTop: Math.round(bar.top), n: rows.length }; });
        check('v3.31.1 390×667: sidste række i Trup kan rulles fri af Spil-bjælken', last.n >= 18 && last.b <= last.barTop, JSON.stringify(last));
      }
      await c.close();
    }
  }
  // ---------- v3.31.1, Test Manager: det forfatterens blok lod overleve (kan køres sammen med den med V3311_ONLY=1) ----------
  // Tællerens slags-rækkefølge og antal SPILLERE pr. slags (alle fire slags, forskellige antal), titlens linjer, nyhedsteksten (NEWS),
  // Hjem-tælleren ruller UNDER den faste topbar og lader beskeden stå, polstringen under bjælken, runde-nummeret i sæson 2 under afspilning,
  // 🔍 på de andre faner efter fløjtet (kun Kamp mister den), og de tekster ingen anden test læser (pillens og knappens title, tom Kamp).
  async function v3311tm() {
    const fresh = async (w, hgt) => { const c = await browser.newContext({ viewport: { width: w, height: hgt } }), p = await c.newPage(); p.on('pageerror', (e) => fejl.push(e.message)); await p.goto(BASE + '/'); await p.waitForSelector('body[data-klar="ja"]'); return { c, p }; };
    const mod = (p, f, arg) => p.evaluate(([src, a]) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const r = (0, eval)('(' + src + ')')(d, a); localStorage.setItem('tactivar_save', JSON.stringify(d)); return r; }, [f.toString(), arg ?? null]);
    const reload = async (p) => { await p.reload(); await p.waitForSelector('body[data-klar="ja"]'); };
    const tt = async (p, k) => { await p.click(`#tab-${k}`); await p.waitForSelector(`.tabpane.tab-${k}`); };
    const opp = (p) => p.locator('#playbar #next-opponent').count();
    // (A) alle fire slags, forskellige antal spillere: ⛔2 🚑1 ⚠3 🟨2 (6 grupper) – ved 1366 og 390
    for (const [w, hgt] of [[1366, 900], [390, 844]]) {
      const { c, p } = await fresh(w, hgt);
      const empty = await (async () => { await tt(p, 'kamp'); return p.textContent('#no-matches'); })();
      await tt(p, 'hjem');   // (tab-klik sletter beskeden – derfor står Hjem FØR gemmet ændres og siden genindlæses)
      check(`v3.31.1 TM ${w}: tom Kamp-fane siger "Tryk ▶ Spil runde nederst" (ikke "øverst"/"på Hjem")`, empty === 'Ingen kampe spillet endnu. Tryk ▶ Spil runde nederst – modstanderen følger kampprogrammet på Liga-fanen.', empty);
      const S = await mod(p, (d) => { const me = d.league.teams.find((t) => !t.isBot), sl = me.tactics.lineupSlots, P = (i) => me.squad.find((x) => x.id === sl[i]);
        for (const x of me.squad) Object.assign(x, { injuryMatchesLeft: 0, banMatches: 0, banYellows: 0, freshness: 100 });
        me.subsLimit = 80; for (const i of [8, 9]) Object.assign(P(i), { banMatches: 1, banWhy: 'DIRECT' }); P(7).injuryMatchesLeft = 2;
        [60, 65, 70].forEach((f, j) => { P(4 + j).freshness = f; }); for (const i of [1, 2]) P(i).banYellows = 3;
        d.ui.seenVersion = '3.31.0';   // NEWS: nyheden om 3.31.1 står som besked på Hjem ved næste indlæsning
        return { yel: [P(1).shirtNumber, P(2).shirtNumber] }; });
      await reload(p);
      const note = (await p.textContent('#notice', { timeout: 3000 }).catch(() => '')) ?? '';
      check(`v3.31.1 TM ${w}: nyheden for 3.31.1 står i NEWS og vises som besked ved opdatering`, note.includes('▶ Spil runde står nu samme sted på alle faner'), note.slice(0, 120));
      const cnt = await p.textContent('#playbar #issue-count', { timeout: 3000 }).catch(() => 'mangler'), cls = (await p.getAttribute('#playbar #issue-count', 'class').catch(() => '')) ?? '', title = (await p.getAttribute('#playbar #issue-count', 'title').catch(() => '')) ?? '', ln = title.split('\n');
      check(`v3.31.1 TM ${w}: tælleren har alle fire slags i rækkefølgen ⛔ 🚑 ⚠ 🟨 med antal SPILLERE ("⛔2 🚑1 ⚠3 🟨2") og farves efter det værste`, cnt === '⛔2 🚑1 ⚠3 🟨2' && cls.includes('pill-ban'), `${cnt} | ${cls}`);
      check(`v3.31.1 TM ${w}: tællerens title er "6 ting:" + én linje pr. gruppe (2 udelukkede, 1 skadet, de trætte samlet, 2 gule), delt med linjeskift`,
        ln.length === 7 && ln[0] === '6 ting:' && /er udelukket/.test(ln[1]) && /er udelukket/.test(ln[2]) && /er skadet/.test(ln[3]) && /^3 startere under din grænse/.test(ln[4]) && /🟨 3/.test(ln[5]) && /🟨 3/.test(ln[6]), JSON.stringify(ln.map((l) => l.slice(0, 40))));
      // Hjem: tryk på tælleren ruller til listen – UNDER den faste topbar – og lader beskeden stå (showTab ville slette den)
      await p.setViewportSize({ width: w, height: 260 });
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(50);
      await p.click('#playbar #issue-count'); await p.waitForTimeout(80);
      const sc = await p.evaluate(() => { const r = document.getElementById('home-todo').getBoundingClientRect(), fixedBottom = Math.max(0, ...[...document.querySelectorAll('body *')].filter((e) => { const s = getComputedStyle(e).position, b = e.getBoundingClientRect(); return (s === 'fixed' || s === 'sticky') && b.top <= 1 && b.height > 0 && b.height < 200; }).map((e) => e.getBoundingClientRect().bottom));
        return { top: Math.round(r.top), fixedBottom: Math.round(fixedBottom), note: !!document.getElementById('notice') }; });
      // computer: topbaren er fast (sticky) – listen skal lande UNDER den; mobil (≤ 600 px): topbaren ruller med, listen bare i synsfeltet
      check(`v3.31.1 TM ${w}: tælleren på Hjem ruller listen i synsfeltet – på computer UNDER den faste topbar (scroll-margin på #home-todo) – og lader beskeden stå`, (w === 1366 ? sc.fixedBottom > 20 && sc.top >= sc.fixedBottom - 1 : sc.top >= 0) && sc.top < 200 && sc.note, JSON.stringify(sc));
      await p.setViewportSize({ width: w, height: hgt });
      if (w === 1366) {
        await tt(p, 'trup'); await p.setViewportSize({ width: w, height: 500 });
        const pad = await p.evaluate(() => ({ pad: parseFloat(getComputedStyle(document.body).paddingBottom), bar: document.getElementById('playbar').getBoundingClientRect().height }));
        check('v3.31.1 TM 1366: bunden af siden står fri af Spil-bjælken (body-polstringen ≥ bjælkens højde)', pad.bar > 30 && pad.pad >= pad.bar, JSON.stringify(pad));
      }
      await c.close();
    }
    // (C) højst tre grupper: de udelukkede/skadede som piller med forklaringen (komma-delt) og "Stil selv om på 📋 Taktik"
    { const { c, p } = await fresh(1366, 900);
      await mod(p, (d) => { const me = d.league.teams.find((t) => !t.isBot), sl = me.tactics.lineupSlots, P = (i) => me.squad.find((x) => x.id === sl[i]);
        for (const x of me.squad) Object.assign(x, { injuryMatchesLeft: 0, banMatches: 0, banYellows: 0, freshness: 100 }); Object.assign(P(9), { banMatches: 1, banWhy: 'DIRECT' }); P(8).injuryMatchesLeft = 2; });
      await reload(p);
      const t = (await p.getAttribute('#playbar #out-warning', 'title', { timeout: 3000 }).catch(() => null)) ?? 'mangler';
      check('v3.31.1 TM: pillernes forklaring: "#nr X er udelukket …, #nr Y er skadet … – af den bedste i samme kæde på bænken. Stil selv om på 📋 Taktik"',
        /^#\d+ .+ er udelukket – erstattes automatisk, #\d+ .+ er skadet – erstattes automatisk – af den bedste i samme kæde på bænken\. Stil selv om på 📋 Taktik$/.test(t), t);
      await c.close(); }
    // (D) sæson 2 (runde 4 globalt = sæsonens runde 1): "📺 Runde 1 spilles …", forklaringen, og 🔍 efter fløjtet kun væk på Kamp (og Hjem)
    { const { c, p } = await fresh(1366, 900);
      await mod(p, (d) => { d.league.leagueMetadata.round = 3; d.league.leagueMetadata.seasonNumber = 2; d.league.seasonStartRound = 4; });
      await reload(p);
      const nxt = await p.textContent('#playbar #play-round');
      await tt(p, 'taktik'); await p.click('#playbar #play-round'); await p.waitForSelector('#skip');
      const pl = { txt: await p.textContent('#playbar #play-round'), title: await p.getAttribute('#playbar #play-round', 'title') };
      await tt(p, 'kamp'); const during = await p.locator('#to-home').count();
      check('v3.31.1 TM: under afspilning har Kamp ikke "Forbered ›" (den hører til efter fløjtet)', during === 0, String(during));
      check('v3.31.1 TM: i sæson 2 siger knappen under afspilning sæsonens runde ("📺 Runde 1 spilles …", ikke den globale 4) og forklarer hvorfor den er slået fra',
        nxt.startsWith('▶ Spil runde 1 af 14') && pl.txt === '📺 Runde 1 spilles …' && pl.title === 'Runden spilles i 📺 Kamp – næste runde kan spilles bagefter', `${nxt} | ${JSON.stringify(pl)}`);
      await tt(p, 'kamp'); await p.click('#skip'); await p.waitForSelector('#to-home');
      const O = {}; for (const k of ['kamp', 'liga', 'trup', 'klub', 'traening', 'taktik', 'admin', 'hjem']) { await tt(p, k); O[k] = await opp(p); }
      check('v3.31.1 TM: efter fløjtet mister KUN Kamp (og Hjem) 🔍 i bjælken – Liga, Trup, Klub, Træning, Taktik og ⚙ har den stadig', JSON.stringify(O) === JSON.stringify({ kamp: 0, liga: 1, trup: 1, klub: 1, traening: 1, taktik: 1, admin: 1, hjem: 0 }), JSON.stringify(O));
      await reload(p); const O2 = {}; for (const k of ['kamp', 'liga']) { await tt(p, k); O2[k] = await opp(p); }
      check('v3.31.1 TM: efter genindlæsning (den seneste runde som færdigspillet visning): Kamp uden 🔍 og med "Forbered ›", Liga med 🔍', O2.kamp === 0 && O2.liga === 1 && (await (async () => { await tt(p, 'kamp'); return p.locator('#to-home').count(); })()) === 1, JSON.stringify(O2));
      await c.close(); }
  }
  // ---------- v3.31.2 (brugerens ønsker 3/11): arketypen på Taktik, 📊 Statistik på kortet, danske koder og bjælken ved 601/667 px ----------
  // Kan køres alene med V3312_ONLY=1 (funktionserklæring: hejses). Data: to spillere med arketype, en uden; en kendt kamphistorik i
  // sæson 2 og 1 for dit hold og to andre hold (A, B); en modstanders spiller med historik; 3 advarsler til bjælken.
  async function v3312() {
    const c = await browser.newContext({ viewport: { width: 1366, height: 900 } }), p = await c.newPage();
    p.on('pageerror', (e) => fejl.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('body[data-klar="ja"]');
    const tt = async (k) => { await p.click(`#tab-${k}`); await p.waitForSelector(`.tabpane.tab-${k}`); };
    const mod = (f, arg) => p.evaluate(([src, a]) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const r = (0, eval)('(' + src + ')')(d, a); localStorage.setItem('tactivar_save', JSON.stringify(d)); return r; }, [f.toString(), arg ?? null]);
    const S = await mod((d) => {
      const L = d.league, me = L.teams.find((t) => !t.isBot), M = L.teams.indexOf(me), sl = me.tactics.lineupSlots, P = (i) => me.squad.find((x) => x.id === sl[i]);
      const A = L.teams.findIndex((t, i) => t.isBot && i !== M), B = L.teams.findIndex((t, i) => t.isBot && i !== M && i !== A);
      const a = P(6), b = P(7), z = P(8), q = L.teams[A].squad.find((x) => x.line === 'MID');
      a.archetype = { id: 'REGISTA', name: 'Regista', description: 'gammel', unlockReq: { passing: 13, ballControl: 13 }, isUnlocked: false };
      a.skills.passing = 11; a.skills.ballControl = 13; a.trainingFocus = 'GENERAL';   // v3.32.0: kravteksten med nu/krav og fokus
      b.archetype = { id: 'PRESSING_MONSTER', name: 'Pressing Monster', description: 'gammel', unlockReq: { stamina: 14, intercepting: 12 }, isUnlocked: true };
      z.archetype = null;
      L.leagueMetadata.seasonNumber = 2;
      // [S, R, H, A, HG, AG, MIN, RT, ST, G, AS] – kampen A–B i sæson 1 er ikke hans holds
      Object.assign(a, { careerGames: 40, sGames: 2, sMinutes: 165, sGoals: 2, sAssists: 1, sMotm: 1, sYellow: 1, sRed: 0, lastMove: null,
        matchLog: [[1, 10, A, B, 1, 1, 90, 6.1, 3, 0, 0], [1, 12, M, A, 2, 0, 90, 7.0, 4, 1, 0], [1, 13, B, M, 0, 1, 60, 6.4, 3, 0, 1], [2, 1, M, B, 3, 1, 90, 7.8, 4, 2, 1], [2, 2, A, M, 1, 1, 75, 6.6, 3, 0, 0]] });
      Object.assign(q, { careerGames: 20, sGames: 1, sMotm: 1, sYellow: 0, sRed: 0, lastMove: null, matchLog: [[2, 1, A, B, 2, 2, 90, 8.4, 5, 1, 0], [2, 2, M, A, 0, 1, 90, 7.7, 4, 1, 0]] });
      L.lastSeasonStats = { seasonNumber: 1, players: { [a.id]: { sGames: 2, sMotm: 1, sYellow: 3, sRed: 1, t: me.id, n: a.shortName, nr: a.shirtNumber } } };
      return { a: a.id, b: b.id, z: z.id, q: q.id, A, me: me.name, opp: L.teams[A].name, oppArch: L.teams[A].squad.filter((x) => x.archetype).length };
    });
    await p.reload(); await p.waitForSelector('body[data-klar="ja"]');
    await tt('taktik');
    const arch = (w) => p.evaluate((S) => Object.fromEntries([S.a, S.b, S.z].map((id) => { const tr = document.querySelector(`#lineup-table tr[data-pid="${id}"]`), l = tr.querySelector('.lp-arch'), i = tr.querySelector('.lp-arch-ico');
      const vis = (e) => !!e && e.getBoundingClientRect().width > 0;
      return [id, { line: vis(l) ? l.textContent : null, ico: vis(i) ? i.textContent.trim() : null, title: i?.title ?? null }]; })), S);
    const w1 = await arch();
    check('v3.31.2 Taktik-listen ≥ 900 px: "🔒 Regista (spilfordeler)" / "🌟 Presmonster" som linje under navnet, intet ved en uden arketype; title = beskrivelse + krav',
      w1[S.a].line === '🔒 Regista (spilfordeler)' && w1[S.b].line === '🌟 Presmonster' && !w1[S.a].ico && w1[S.z].line === null && w1[S.z].title === null
      && w1[S.a].title === 'Arketype: Regista (spilfordeler) – Slår pasninger direkte fra Fase 1 til Fase 3 · Låses op ved: Pasning 11/13 – trænes med Teknik · Boldkontrol 13/13 ✓', JSON.stringify(w1));
    await p.setViewportSize({ width: 800, height: 900 }); await p.waitForTimeout(50);
    const w2 = await arch();
    check('v3.31.2 Taktik-listen < 900 px: kun ikonet efter navnet (🔒/🌟), ingen linje', w2[S.a].ico === '🔒' && w2[S.b].ico === '🌟' && !w2[S.a].line && !w2[S.b].line && w2[S.z].ico === null, JSON.stringify(w2));
    await p.setViewportSize({ width: 1366, height: 900 });
    // Danske pladskoder: listen, banen og Trup – ingen engelske
    const EN = /\b(LB|RB|LWB|RWB|CDM|CAM|LM|RM|LW|RW|ST|CF|CB)\b/;
    const codes = await p.evaluate(() => ({ place: [...document.querySelectorAll('#lineup-table td.lp-place')].map((e) => e.textContent.split(' ')[0]), tok: [...document.querySelectorAll('#pitch .token[data-slot]')].map((e) => e.title.split(' ')[0]),
      all: document.querySelector('#lineup-list').textContent + [...document.querySelectorAll('#pitch .token, #lineup-list [title]')].map((e) => e.title).join(' ') }));
    check('v3.31.2 Taktik (4-4-2): pladserne MV, VB, MS, MS, HB, VM, CM, CM, HM, ANG, ANG i listen og på brikkerne – ingen engelske koder',
      codes.place.slice(0, 11).join() === 'MV,VB,MS,MS,HB,VM,CM,CM,HM,ANG,ANG' && codes.tok.join() === codes.place.slice(0, 11).join() && !EN.test(codes.all), JSON.stringify(codes.place) + ' ' + (codes.all.match(EN) ?? ''));
    // 📊 Statistik på kortet (åbnet fra ⓘ på Taktik)
    const stats = async () => { await p.waitForSelector('#cardpanel[data-open="ja"] #player-card'); return p.evaluate(() => { const t = document.querySelector('#cardpanel #card-stats-table');
      const card = document.querySelector('#cardpanel #player-card'), kids = [...card.children].map((e) => e.id || e.className);
      return { title: document.querySelector('#cardpanel #card-stats h4')?.textContent, head: t ? [...t.querySelectorAll('thead th')].map((e) => e.textContent) : null,
        rows: t ? Object.fromEntries([...t.querySelectorAll('tbody tr')].map((r) => [r.children[0].textContent, [...r.children].slice(1).map((c) => c.textContent)])) : null, kids,
        text: document.querySelector('#cardpanel #card-stats')?.textContent ?? '' }; }); };
    await p.click(`.lp-info[data-pid="${S.a}"]`);
    const st = await stats();
    check('v3.31.2 📊 Statistik på kortet: lige efter hovedet (før evnerne), Sæson 2 / Sæson 1 kun for dit hold – kampe, min., mål, oplæg, snit, 👑, 🟨, 🟥',
      st.title === `📊 Statistik for ${S.me}` && st.kids.indexOf('card-stats') === 1 && st.kids.indexOf('bars') > 1 && JSON.stringify(st.head) === JSON.stringify(['', 'Sæson 2', 'Sæson 1'])
      && JSON.stringify(st.rows) === JSON.stringify({ Kampe: ['2', '2'], 'Min.': ['165', '150'], Mål: ['2', '1'], Oplæg: ['1', '1'], Snit: ['7,2', '6,7'], '👑': ['1', '1'], '🟨': ['1', '3'], '🟥': ['0', '1'] }), JSON.stringify(st));
    // mobil 390: tabellen i arket uden vandret rul
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(50);
    const m = await p.evaluate(() => { const cp = document.querySelector('#cardpanel'), t = document.querySelector('#cardpanel #card-stats-table').getBoundingClientRect();
      return { over: cp.scrollWidth - cp.clientWidth, page: document.documentElement.scrollWidth - innerWidth, right: Math.round(t.right), w: innerWidth }; });
    check('v3.31.2 📊 Statistik ved 390 px: ingen vandret rul i panelet eller på siden, tabellen inden for skærmen', m.over <= 0 && m.page <= 0 && m.right <= m.w, JSON.stringify(m));
    await p.setViewportSize({ width: 1366, height: 900 });
    await p.click('#card-close');
    // modstanderen: hans liste uden arketyper, hans spillers tabel uden Snit
    await p.click('#tab-liga'); await p.waitForSelector('.tabpane.tab-liga');
    await p.selectOption('#team-select', String(S.A)); await p.waitForSelector('.tabpane.tab-trup'); await tt('taktik');
    const oa = await p.evaluate(() => document.querySelectorAll('#lineup-list .lp-arch, #lineup-list .lp-arch-ico').length);
    check('v3.31.2 Et andet holds Taktik-liste: ingen arketype-mærker, selv om hans spillere har en', S.oppArch >= 2 && oa === 0, `${S.oppArch} / ${oa}`);
    await p.click(`.lp-info[data-pid="${S.q}"]`);
    const so = await stats();
    check('v3.31.2 📊 Statistik for modstanderens spiller: samme tabel UDEN Snit (karakteren 8,4/7,7 står ikke)',
      so.title === `📊 Statistik for ${S.opp}` && JSON.stringify(Object.keys(so.rows ?? {})) === JSON.stringify(['Kampe', 'Min.', 'Mål', 'Oplæg', '👑', '🟨', '🟥']) && JSON.stringify(so.rows.Kampe) === JSON.stringify(['2', '0'])
      && !/8,4|7,7|8,1|Snit/.test(so.text), JSON.stringify(so));
    await p.click('#card-close'); await p.click('#scout-back');
    // Bjælken ved 601 og 667 px med 3 piller + 🔍: ▶ må ikke skubbes ud over højre kant (QC-forbehold fra v3.31.1)
    await mod((d) => { const me = d.league.teams.find((t) => !t.isBot), sl = me.tactics.lineupSlots, P = (i) => me.squad.find((x) => x.id === sl[i]);
      for (const x of me.squad) Object.assign(x, { injuryMatchesLeft: 0, banMatches: 0, banYellows: 0, freshness: 100 });
      P(9).banMatches = 1; P(9).banWhy = 'DIRECT'; P(3).injuryMatchesLeft = 2; P(6).banYellows = 3;
      const pr = d.league.schedule[0].find(([x, y]) => x === me.id || y === me.id); d.league.teams.find((t) => t.id === (pr[0] === me.id ? pr[1] : pr[0])).name = 'Nordkysten Boldklub af 1921';   // langt navn: før rettelsen 23 px ude ved 601
    });
    await p.reload(); await p.waitForSelector('body[data-klar="ja"]'); await tt('taktik');
    const edge = {};
    for (const w of [601, 667, 700]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(50);
      edge[w] = await p.evaluate(() => { const b = document.querySelector('#play-bar #play-round').getBoundingClientRect(), o = document.querySelector('#play-bar #next-opponent');
        const of = document.querySelector('#play-bar #play-round .play-of').getBoundingClientRect();
        return { right: Math.round(b.right), w: document.documentElement.clientWidth, pills: document.querySelectorAll('#bar-issues .pill').length, opp: !!o && o.getBoundingClientRect().width > 0, txt: document.querySelector('#play-bar #play-round').textContent, ofIn: of.width > 0 && of.right <= b.right + 0.5 }; }); }
    check('v3.31.2 Bjælken ved 601/667/700 px med 3 piller, 🔍 og et langt holdnavn: ▶\'s højre kant ≤ bredden, og "▶ Spil runde 1 af 14" står helt (kun navnet forkortes)', Object.values(edge).every((e) => e.right <= e.w && e.pills === 3 && e.opp && e.txt.startsWith('▶ Spil runde 1 af 14 · Nordkysten') && e.ofIn), JSON.stringify(edge));
    await c.close();
  }
  // ---------- v3.31.2 TM: mutanter, den første blok lod overleve – breakpointet 900 px på kanten, navnets … i bjælken, tabellens højrejustering
  // og at appen sender hideLog (kortets statistik og 📜 Kampe tæller IKKE den runde, der afspilles). Kan køres alene med TM_V3312_ONLY=1.
  async function v3312tm() {
    const c = await browser.newContext({ viewport: { width: 1366, height: 900 } }), p = await c.newPage();
    p.on('pageerror', (e) => fejl.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('body[data-klar="ja"]');
    const tt = async (k) => { await p.click(`#tab-${k}`); await p.waitForSelector(`.tabpane.tab-${k}`); };
    const mod = (f, arg) => p.evaluate(([src, a]) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const r = (0, eval)('(' + src + ')')(d, a); localStorage.setItem('tactivar_save', JSON.stringify(d)); return r; }, [f.toString(), arg ?? null]);
    const S = await mod((d) => {
      const me = d.league.teams.find((t) => !t.isBot), sl = me.tactics.lineupSlots, P = (i) => me.squad.find((x) => x.id === sl[i]);
      P(6).archetype = { id: 'REGISTA', name: 'Regista', description: 'gammel', unlockReq: { passing: 13, ballControl: 13 }, isUnlocked: false };
      const pr = d.league.schedule[0].find(([x, y]) => x === me.id || y === me.id); d.league.teams.find((t) => t.id === (pr[0] === me.id ? pr[1] : pr[0])).name = 'Nordkysten Boldklub af 1921';
      for (const x of me.squad) Object.assign(x, { injuryMatchesLeft: 0, banMatches: 0, banYellows: 0, freshness: 100 });
      return { a: P(6).id, st: P(3).id };
    });
    await p.reload(); await p.waitForSelector('body[data-klar="ja"]'); await tt('taktik');
    // Arketype-mærket flytter sig præcis ved 900 px: 899 = kun ikonet, 900 = linjen under navnet
    const vis = () => p.evaluate((id) => { const tr = document.querySelector(`#lineup-table tr[data-pid="${id}"]`), v = (e) => !!e && e.getBoundingClientRect().width > 0;
      return { line: v(tr.querySelector('.lp-arch')), ico: v(tr.querySelector('.lp-arch-ico')) }; }, S.a);
    const bp = {};
    for (const w of [850, 899, 900, 1000]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(50); bp[w] = await vis(); }
    check('v3.31.2 TM: arketype-mærket ved 850/899 px kun ikonet, ved 900/1000 px kun linjen (grænsen er præcis 900)',
      [850, 899].every((w) => bp[w].ico && !bp[w].line) && [900, 1000].every((w) => bp[w].line && !bp[w].ico), JSON.stringify(bp));
    // Bjælken: navnet forkortes med … ved 601 px (før rettelsen skubbede det ▶ ud), men står helt ved 1366 px
    const bar = () => p.evaluate(() => { const o = document.querySelector('#play-bar #play-round .play-opp'), cs = getComputedStyle(o), of = document.querySelector('#play-bar #play-round .play-of').getBoundingClientRect();
      return { cut: o.scrollWidth > o.clientWidth, ellipsis: cs.textOverflow, over: cs.overflow, full: o.textContent, ofH: Math.round(of.height), ofW: Math.round(of.width), btnH: Math.round(document.querySelector('#play-bar #play-round').getBoundingClientRect().height) }; });
    await p.setViewportSize({ width: 601, height: 900 }); await p.waitForTimeout(50);
    const b1 = await bar();
    await p.setViewportSize({ width: 1366, height: 900 }); await p.waitForTimeout(50);
    const b2 = await bar();
    check('v3.31.2 TM: bjælkens modstandernavn forkortes med … ved 601 px (afkortet, text-overflow: ellipsis) og står helt ved 1366 px', b1.cut && b1.ellipsis === 'ellipsis' && b1.over === 'hidden' && !b2.cut && b2.full.includes('Nordkysten Boldklub af 1921')
      && b1.ofH === b2.ofH && b1.ofW === b2.ofW && b1.btnH === b2.btnH, JSON.stringify([b1, b2]));   // " af 14" brydes ikke og krympes ikke: samme højde og bredde som ved 1366
    // Appen sender hideLog: efter runde 1 har en starter 1 kamp; under afspilningen af runde 2 stadig 1 (kortets statistik og 📜 Kampe), efter fløjtet 2
    await tt('taktik'); await p.click('#play-round'); await p.waitForSelector('#skip'); await tt('kamp'); await p.click('#skip'); await p.waitForSelector('.to-home');
    // spilleren vælges efter runde 1: en rask, ikke udelukket starter, der spillede den (så han også er med i runde 2)
    S.st = await mod((d) => { const me = d.league.teams.find((t) => !t.isBot); return me.tactics.lineupSlots.slice(1, 11).find((id) => { const x = me.squad.find((q) => q.id === id); return x.matchLog.length === 1 && !x.injuryMatchesLeft && !x.banMatches && x.freshness >= 60; }); });
    check('v3.31.2 TM data: en rask starter fra runde 1', !!S.st);
    const stats = async () => { await tt('trup'); await p.click(`#matrix tr[data-pid="${S.st}"]`); await p.waitForSelector('#cardpanel[data-open="ja"] #card-stats');
      return p.evaluate(() => { const t = document.querySelector('#cardpanel #card-stats-table'), g = (k) => [...t.querySelectorAll(`tr[data-k="${k}"] td`)].map((e) => e.textContent), log = document.querySelector('#cardpanel #match-log');
        return { games: g('games'), motm: g('motm'), yellow: g('yellow'), logRows: log ? log.querySelectorAll('.log-row').length : -1, align: getComputedStyle(t.querySelector('td.num')).textAlign }; }); };
    const s1 = await stats(); await p.click('#card-close');
    await tt('taktik'); await p.click('#play-round'); await p.waitForSelector('#skip');
    const s2 = await stats(); await p.click('#card-close');
    await tt('kamp'); await p.click('#skip'); await p.waitForSelector('.to-home');
    const s3 = await stats();
    check('v3.31.2 TM: kortets statistik tæller ikke runden, der afspilles (Kampe 1 → 1 under afspilning → 2 efter fløjtet), 👑/🟨 er "–" under afspilning, og 📜 Kampe følger med',
      s1.games[0] === '1' && s2.games[0] === '1' && s3.games[0] === '2' && s2.motm[0] === '–' && s2.yellow[0] === '–' && s3.motm[0] !== '–' && s2.logRows === s1.logRows && s3.logRows === s1.logRows + 1, JSON.stringify([s1, s2, s3]));
    check('v3.31.2 TM: tallene i statistik-tabellen er højrejusteret', s1.align === 'right' || s1.align === 'end', s1.align);
    await c.close();
  }
  // ---------- v3.32.0, Test Manager (Spring kan trænes med Fysik): appens LEDNING – nyheden i NEWS, fokusvalget på Træning og "+1 Spring" i rapporten,
  // Træning-fanen og Trup, før OG efter en genindlæsning (sanitize.js droppede Spring-gains). Kan køres alene med TM_V3320_ONLY=1.
  async function v3320tm() {
    const c = await browser.newContext({ viewport: { width: 1366, height: 900 } }), p = await c.newPage();
    p.on('pageerror', (e) => fejl.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('body[data-klar="ja"]');
    const tt = async (k) => { await p.click(`#tab-${k}`); await p.waitForSelector(`.tabpane.tab-${k}`); };
    const mod = (f, arg) => p.evaluate(([src, a]) => { const d = JSON.parse(localStorage.getItem('tactivar_save')); const r = (0, eval)('(' + src + ')')(d, a); localStorage.setItem('tactivar_save', JSON.stringify(d)); return r; }, [f.toString(), arg ?? null]);
    const S = await mod((d) => {
      const me = d.league.teams.find((t) => !t.isBot), on = new Set(me.tactics.lineupSlots);
      for (const x of me.squad) Object.assign(x, { injuryMatchesLeft: 0, banMatches: 0, banYellows: 0, freshness: 100 });
      const q = me.squad.find((x) => x.line === 'DEF' && !on.has(x.id));   // en reserve: spiller ingen kamp, kan ikke blive skadet i den
      Object.assign(q, { age: 20, jumpingPower: 13, trainingFocus: 'PHYSICAL', dev: { jumpingPower: 0.999 } });
      q.potential = 20;
      d.ui.seenVersion = '3.31.2';   // NEWS: nyheden om 3.32.0 står som besked på Hjem ved næste indlæsning
      return { q: q.id, j: q.jumpingPower };
    });
    await p.reload(); await p.waitForSelector('body[data-klar="ja"]');
    const note = (await p.textContent('#notice', { timeout: 3000 }).catch(() => '')) ?? '';
    check('v3.32.0 TM: nyheden for 3.32.0 står i NEWS og vises som besked ved opdatering (Fysik træner Fart, Styrke og Spring)', note.includes('Spring kan nu trænes') && note.includes('Fysik træner Fart, Styrke og Spring'), note.slice(0, 120));
    await tt('traening');
    const opts = await p.$$eval(`#training-table tr[data-pid="${S.q}"] select option`, (os) => os.map((o) => o.textContent));
    const many = await p.$$eval('#focus-many option', (os) => os.map((o) => o.textContent));
    check('v3.32.0 TM: Træning-fanen viser "Fysik – Fart, Styrke, Spring" pr. spiller og i massehandlingen, og Alsidig med spillerens egne evner',
      opts.includes('Fysik – Fart, Styrke, Spring') && many.includes('Fysik – Fart, Styrke, Spring') && many.includes('Alsidig – kædens nøgle-evner') && opts.some((o) => /^Alsidig – \w/.test(o) && !o.includes('kædens')), JSON.stringify([opts, many]));
    check('v3.32.0 TM: fremdriften viser SPR for Fysik-spilleren', /SPR 1,0|SPR 0,9|SPR 1\.0/.test(await p.textContent(`#training-table tr[data-pid="${S.q}"] td.train-prog`)), await p.textContent(`#training-table tr[data-pid="${S.q}"] td.train-prog`));
    await tt('taktik'); await p.click('#play-round'); await p.waitForSelector('#skip');
    await tt('kamp'); await p.click('#skip'); await p.waitForSelector('.to-home');
    const seen = async (where) => {
      await tt('traening');
      const last = await p.textContent(`#training-table tr[data-pid="${S.q}"] td:last-child`);
      await tt('trup');
      const cell = await p.evaluate((id) => { const td = [...document.querySelectorAll(`#matrix tr[data-pid="${id}"] td.gain`)].find((e) => /Spring/.test(e.title)); return td ? { title: td.title, val: td.textContent } : null; }, S.q);
      check(`v3.32.0 TM ${where}: Træning "Sidste runde" siger +1 Spring, og Trup-cellen i Spring-kolonnen er mærket (+1 Spring efter runde 1, værdi ${S.j + 1})`,
        last.includes('+1 Spring') && cell !== null && cell.title === '+1 Spring efter runde 1' && cell.val === String(S.j + 1), JSON.stringify({ last, cell }));
    };
    await seen('efter runden');
    await p.reload(); await p.waitForSelector('body[data-klar="ja"]');
    await seen('efter genindlæsning');
    await c.close();
  }
  await f1tm();
  await f2();
  await f2tm();
  await f3();
  await f3tm();
  await v3311();
  await v3311tm();
  await v3312();
  await v3312tm();
  await v3320tm();
  check('Ingen sidefejl under hele forløbet', fejl.length === 0, fejl.join(' | '));
} finally {
  await browser.close();
  server?.close();
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} af ${results.length} FEJLEDE` : `\nAlle ${results.length} bestod`);
process.exit(failed ? 1 : 0);
