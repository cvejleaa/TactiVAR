// v3.24.0 – samspillets virkning og visning (brugerens landstræner: "hvordan spillerne arbejder/tænker sammen"; brugeren valgte
// "i forhold til ligaen"). Virkningen: opbygningen (opspillerens naboer) og løbsduellens markør, målt mod ligaens snit – intet rng,
// så kampene er uændrede ved udgangspunktet (fingerprint.test.mjs). Visningen: ét sæt bånd på samme skala som virkningen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chemScale, bandOf, BAND_WORD, readPairs, lineupPairs, weakestPair, swapChanges, bestPartner, playerPairs, gamesToSettle, pairKey,
  CHEM_TOP, CHEM_BASE, STRANGER, neighbourPairs, saleChemText } from '../../public/engine/chemistry.js';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { FORMATIONS } from '../../public/engine/formations.js';

test('skalaen: fremmede = −1, ligaens snit = 0, et fast par i ligevægt (86) = +1 – lige meget hver vej; over loftet kun ned', () => {
  assert.equal(CHEM_TOP, 86);
  assert.equal(chemScale(STRANGER, 78), -1); assert.equal(chemScale(78, 78), 0); assert.equal(chemScale(86, 78), 1);
  assert.equal(chemScale(82, 78), 0.5); assert.equal(chemScale(54, 78), -0.5); assert.equal(chemScale(20, 78), -1, 'klemt');
  assert.equal(chemScale(90, 88), 0, 'snit over loftet: ingen bonus'); assert.equal(chemScale(100, 78), 1);
});

test('båndene: på samme skala som virkningen (QC) – fremmede ≤ −0,5 < finder hinanden ≤ −0,15 < spillet sammen < 0,4 ≤ stærkt; snittet er påkrævet', () => {
  const at = (v) => bandOf(v, 78);
  // ved snit 78: −0,5 ↔ 54, −0,15 ↔ 70,8, 0,4 ↔ 81,2
  assert.deepEqual([30, 54, 54.1, 70.7, 70.9, 78, 81.1, 81.3, 86].map(at), ['fremmede', 'fremmede', 'finder', 'finder', 'sammen', 'sammen', 'sammen', 'staerkt', 'staerkt']);
  assert.equal(bandOf(83, 82), 'sammen', 'følger ligaen: 83 er stærkt ved snit 78, men kun "spillet sammen" ved snit 82');
  assert.equal(bandOf(83, 78), 'staerkt');
  assert.throws(() => bandOf(80));
  assert.deepEqual(Object.values(BAND_WORD), ['fremmede', 'finder hinanden', 'spillet sammen', 'stærkt']);
});

test('par, motoren læser: mindst én forsvarer eller midtbane – angriberparret vises ikke (QC/Spilfører: det påvirker intet)', () => {
  const ps = readPairs('4-4-2'), c = FORMATIONS['4-4-2'];
  assert.ok(!ps.some(([i, j]) => c[i].r === 'ST' && c[j].r === 'ST'), 'ST-ST ude');
  assert.ok(neighbourPairs('4-4-2').some(([i, j]) => c[i].r === 'ST' && c[j].r === 'ST'), 'data: ST-ST er naboer');
  assert.ok(ps.some(([i, j]) => c[i].r === 'CM' && c[j].r === 'ST'), 'CM-ST med – opspillerens nabo');
  assert.equal(ps.length, neighbourPairs('4-4-2').length - 1);
});

test('holdets par: navne, når de er entydige, ellers numrene; svageste par; byt-beskeden siger kun bånd, der skiftede (største fald først, højst 2)', () => {
  const L = createLeague(createRng(3)), t = L.teams.find((x) => !x.isBot), slots = t.tactics.lineupSlots, f = t.tactics.baseFormation, c = FORMATIONS[f];
  const ps = lineupPairs(t, CHEM_BASE);
  assert.ok(ps.length > 8 && ps.every((x) => x.band === 'sammen'), 'seed: alle "spillet sammen"');
  const labels = ps.map((x) => x.label);
  assert.equal(new Set(labels.filter((l) => !l.startsWith('#'))).size, labels.filter((l) => !l.startsWith('#')).length, 'et navn står kun én gang');
  const cb = ps.find((x) => c[x.i].r === 'CB' && c[x.j].r === 'CB');
  if (f === '4-4-2' || f === '4-3-3') assert.equal(cb.label, 'Midtstopper-parret');
  // Midtstopper-parret bliver fremmede, et andet par finder hinanden
  t.chemistry[pairKey(slots[cb.i], slots[cb.j])] = [30, 0];
  const other = ps.find((x) => x !== cb); t.chemistry[pairKey(slots[other.i], slots[other.j])] = [65, 0];
  const after = lineupPairs(t, CHEM_BASE);
  assert.deepEqual(weakestPair(after).label, cb.label);
  assert.deepEqual(swapChanges(ps, after), [`${cb.label}: spillet sammen → fremmede`, `${other.label}: spillet sammen → finder hinanden`]);
  assert.deepEqual(swapChanges(ps, ps), [], 'intet skiftede: ingen besked');
});

test('spillerkortet: bedste makker kun ved "stærkt"; hans par med naboerne nu; et køb er ca. 8 kampe om at spille sig ind', () => {
  const L = createLeague(createRng(4)), t = L.teams.find((x) => !x.isBot), slots = t.tactics.lineupSlots;
  const [i, j] = readPairs(t.tactics.baseFormation)[0], f = t.tactics.baseFormation, c = FORMATIONS[f];
  assert.equal(bestPartner(t, CHEM_BASE, slots[i]), null, 'på snittet: ingen bedste makker');
  t.chemistry[pairKey(slots[i], slots[j])] = [81.1, 0]; assert.equal(bestPartner(t, CHEM_BASE, slots[i]), null, 'lige under stærkt');
  t.chemistry[pairKey(slots[i], slots[j])] = [84, 0]; assert.equal(bestPartner(t, CHEM_BASE, slots[i]).mate.id, slots[j]);
  assert.ok(playerPairs(t, CHEM_BASE, slots[i]).some((x) => x.mate.id === slots[j] && x.band === 'staerkt'));
  // QC: kun par, motoren læser, og kun naboer nu – et stærkt angriberpar eller en tidligere nabo er ingen "bedste makker"
  const st = neighbourPairs(f).find(([a, b]) => c[a].r === 'ST' && c[b].r === 'ST');
  if (st) { t.chemistry[pairKey(slots[st[0]], slots[st[1]])] = [90, 0]; assert.equal(bestPartner(t, CHEM_BASE, slots[st[0]]), null, 'ST-ST stærkt: ingen makker'); }
  const bench = t.squad.find((p) => !slots.includes(p.id));
  t.chemistry[pairKey(slots[i], bench.id)] = [90, 0];
  assert.equal(bestPartner(t, CHEM_BASE, slots[i]).mate.id, slots[j], 'en stærk tidligere nabo (nu på bænken) tæller ikke');
  assert.equal(bestPartner(t, CHEM_BASE, bench.id), null, 'bænk: ingen makker trods stærkt par');
  assert.equal(saleChemText(t, CHEM_BASE, slots[i]), `🤝 Stærkt samspil med #${t.squad.find((p) => p.id === slots[j]).shirtNumber} ${t.squad.find((p) => p.id === slots[j]).shortName} – et salg bryder parret.`);
  assert.equal(saleChemText(t, CHEM_BASE, bench.id), null);
  assert.deepEqual(playerPairs(t, CHEM_BASE, bench.id), [], 'bænk: ingen naboer');
  assert.equal(gamesToSettle(78), 8); assert.ok(gamesToSettle(82) >= gamesToSettle(78));
});

test('fuldtids-analysen: din midtbane ved kampstart – "ikke spillet sig sammen" ved fremmede, "spillet sig sammen" ved stærkt, intet på snittet', () => {
  const run = (v) => {
    const L = createLeague(createRng(9)), me = L.teams.find((x) => !x.isBot), opp = L.teams.find((x) => x.isBot);
    for (const k of Object.keys(me.chemistry)) me.chemistry[k] = [v, 0];
    return simulateMatch(me, opp, createRng(9), { chemRef: CHEM_BASE }).events.find((e) => e.type === 'FULLTIME')?.text ?? '';
  };
  assert.match(run(30), /🤝 Samspil: din midtbane har ikke spillet sig sammen endnu \(fremmede\)/);
  assert.match(run(84), /🤝 Samspil: din midtbane har spillet sig sammen \(stærkt\)/);
  assert.doesNotMatch(run(CHEM_BASE), /🤝/);
});

// tools/measure-chemistry.mjs effect: hold A med alle par på fremmede/snit/fast mod B på snittet, begge baner. Før v3.24.0 (ingen
// kobling): alle tre ens – spænd 0 → rødt. N 2000 (tre seed-sæt, Spilfører motor): samlet fremmede −0,05…−0,12, fast +0,05…+0,09 i
// forhold til snittet; løbsduellen alene ±0,02. Båndene er derfor skrevet med plads til seeds: fortegn pr. kobling på fremmede-siden,
// samlet fast > snit, spænd ≥ 0,06.
test('målt: hver kobling koster for fremmede, samlet giver et fast par mere end snittet, og spændet er mærkbart (≥ 0,06 mål/kamp; før 0)', async () => {
  const { measureEffect } = await import('../../tools/measure-chemistry.mjs');
  const r = await measureEffect(800);
  assert.ok(r.build.fremmede < r.build.ref && r.build.fast > r.build.ref, JSON.stringify(r.build));
  assert.ok(r.run.fremmede < r.run.ref, JSON.stringify(r.run));
  assert.ok(r.both.fast > r.both.ref && r.both.ref > r.both.fremmede, JSON.stringify(r.both));
  assert.ok(r.both.fast - r.both.fremmede >= 0.06, `spænd ${r.both.fast - r.both.fremmede}`);
  // Øvre grænse (Test Manager): samme måling (N 800, faste seeds) giver spænd 0,074 ved ½ × vægtene, 0,181 ved 1 ×, 0,250 ved 2 × – standardfejl ca.
  // 0,07, så mål/kamp kan IKKE skelne ½ × og 2 × fra 1 × med sikkerhed (se chemistry-v3240-effect.test.mjs: duellernes vundne andel kan, og vægtene er pinnet).
  // Grænsen her fanger kun store fejl (≥ 3 ×, en kobling talt dobbelt); den står på 0,32, så en støjflytning ved ændret rng-forbrug ikke gør den rød.
  assert.ok(r.both.fast - r.both.fremmede <= 0.32, `spænd ${r.both.fast - r.both.fremmede} (0,181 ved 1 ×)`);
});
