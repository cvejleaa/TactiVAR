// v3.21.2 – klummen (Spilførerens sæsonfund): din kamps historie i overskriften, ægte comebacks, sent point og "hentede 0-2",
// "det holdt ikke" i opfølgningen og varianter. På håndbyggede kampe med kendte tal (samme hjælpere som column-mine).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildColumn, STORY, COMEBACK_GAP, COMEBACK_MIN, COMEBACK_MAX_WIN, SCOUT_TAIL } from '../../public/engine/column.js';

const M = ({ h = 'h1', a = 'a1', hn = 'Hjem', an = 'Ude', hG = 0, aG = 0, ev = [] } = {}) => ({
  homeId: h, awayId: a, homeName: hn, awayName: an, homeGoals: hG, awayGoals: aG,
  events: ev.map(([min, type, isHome, eh, ea, plus]) => ({ min, type, isHome, hG: eh, aG: ea, text: 'T', label: 'L', ...(plus != null ? { clock: { m: min, plus } } : {}) })),
  goalsPool: [],
});
const inp = (o) => ({ matches: [], gazette: null, history: [], table: [], next: [], viewerTeamId: 'h1', round: 5, ...o });
const G = (min, home, hG, aG, plus) => [min, 'GOAL', home, hG, aG, plus];
const title = (mine, ...others) => buildColumn(inp({ matches: [mine, ...others] })).title;
const note = (other) => buildColumn(inp({ matches: [M({ hG: 1, aG: 0 }), other] })).sections.find((s) => s.id === 'col-others').others[0].note;
const OC = (ev, hG, aG) => M({ h: 'x', a: 'y', hn: 'X', an: 'Y', hG, aG, ev });

test(`comeback: bagud med ${COMEBACK_GAP}, eller bagud efter pausen (udligning i ${COMEBACK_MIN}. min eller senere – uden tillægstid), og sejr med højst ${COMEBACK_MAX_WIN} – ellers ikke`, () => {
  const isCb = (ev, hG, aG) => /bagfra|vendte|Comeback/.test(note(OC(ev, hG, aG)));
  // Spilførerens fund: 0-1 i 3. minut, så 5-1 – ikke et comeback (før: "Comeback til Ølstykke IF")
  assert.equal(isCb([G(3, false, 0, 1), G(10, true, 1, 1), G(20, true, 2, 1), G(30, true, 3, 1), G(40, true, 4, 1), G(50, true, 5, 1)], 5, 1), false, '0-1 → 5-1');
  assert.equal(isCb([G(3, false, 0, 1), G(30, true, 1, 1), G(60, true, 2, 1)], 2, 1), false, '0-1 kun før pausen (udlignet 30.)');
  assert.equal(isCb([G(3, false, 0, 1), G(46, true, 1, 1), G(60, true, 2, 1)], 2, 1), true, 'bagud til 46. minut');
  assert.equal(isCb([G(3, false, 0, 1), G(45, true, 1, 1, 2), G(60, true, 2, 1)], 2, 1), false, 'udlignet 45+2 = før pausen (QC)');
  assert.equal(isCb([G(3, false, 0, 1), G(10, false, 0, 2), G(20, true, 1, 2), G(30, true, 2, 2), G(40, true, 3, 2)], 3, 2), true, 'bagud 0-2 i første halvleg');
  assert.equal(isCb([G(3, false, 0, 1), G(10, false, 0, 2), G(20, true, 1, 2), G(30, true, 2, 2), G(40, true, 3, 2), G(50, true, 4, 2), G(55, true, 5, 2)], 5, 2), false, 'sejr med 3: storsejr, ikke comeback');
  assert.deepEqual([COMEBACK_GAP, COMEBACK_MIN, COMEBACK_MAX_WIN], [2, 46, 2]);
});

test('overskriften: din kamps historie går forud for de andres (Spilfører: "vi vandt 5-1 ude, men overskriften er \'FC Vejleå vendte kampen\'")', () => {
  const otherCb = OC([G(3, true, 1, 0), G(60, false, 1, 1), G(70, false, 1, 2)], 1, 2);   // Y vender efter pausen
  const otherLate = OC([G(10, true, 1, 0), G(40, false, 1, 1), G(88, true, 2, 1)], 2, 1);
  assert.equal(title(M({ hG: 5, aG: 1 }), otherCb), 'Hjem kørte over Ude', 'din 5-1 slår deres comeback');
  assert.equal(title(M({ hG: 2, aG: 1, ev: [G(10, true, 1, 0), G(40, false, 1, 1), G(89, true, 2, 1)] }), otherCb), 'Sent drama: Hjem vandt det i 89. minut', 'dit sene sejrsmål er en historie');
  assert.equal(title(M({ hG: 2, aG: 1, ev: [G(10, false, 0, 1), G(60, true, 1, 1), G(70, true, 2, 1)] }), otherCb), 'Hjem kom tilbage mod Ude');
  assert.equal(title(M({ hG: 1, aG: 0 }), otherCb), 'Y vendte kampen', 'uden din historie: de andres');
  assert.equal(title(M({ hG: 1, aG: 0 }), otherLate), 'Sent drama: X afgjorde det i 88. minut');
  assert.ok(STORY.myComeback > STORY.myLate && STORY.myLate > STORY.myFightback && STORY.myFightback > STORY.myLevel && STORY.myLevel > STORY.myBig && STORY.myBig > STORY.comeback && STORY.comeback > STORY.late && STORY.upset > STORY.myComeback && STORY.champion > STORY.upset);
});

test('uafgjort (Spilfører: bundholdets store øjeblik): sent point og "hentede 0-2" er din historie – ikke "comeback"', () => {
  const level = M({ hG: 1, aG: 1, ev: [G(30, false, 0, 1), G(88, true, 1, 1)] });
  assert.equal(title(level), 'Sent point: Hjem udlignede i 88. minut');
  assert.ok(buildColumn(inp({ matches: [level] })).sections[0].paras.includes('Udligningen kom i 88. minut.'));
  const back = M({ hG: 2, aG: 2, ev: [G(10, false, 0, 1), G(20, false, 0, 2), G(50, true, 1, 2), G(70, true, 2, 2)] });
  assert.equal(title(back), 'Hjem hentede 0-2 mod Ude');
  assert.ok(buildColumn(inp({ matches: [back] })).sections[0].paras.includes('I var bagud med to mål og hentede et point.'));
  assert.doesNotMatch(title(back), /tilbage|vendte|Comeback/);
  // Modstanderens sene udligning er ikke din historie; en tidlig udligning heller ikke
  assert.doesNotMatch(title(M({ hG: 1, aG: 1, ev: [G(30, true, 1, 0), G(88, false, 1, 1)] })), /Sent point/);
  assert.doesNotMatch(title(M({ hG: 1, aG: 1, ev: [G(30, false, 0, 1), G(60, true, 1, 1)] })), /Sent point/);
});

test('"Mit bud" varierer halen (Spilfører: "det kan blive kampens tema" 10 af 14) – alle haler forekommer, og ingen to runder i træk ens', () => {
  const nx = [{ homeId: 'h1', homeName: 'Hjem', awayId: 'o2', awayName: 'Opp' }];
  const hist = [1, 2, 3].map((r) => ({ round: r, results: [], facts: { o2: { poss: 60, shots: 0, onTarget: 0, corners: 0, aerialWon: 0, counterGoals: 0, setPieceGoals: 0, headerGoals: 0, yellows: 0, reorganised: 0, goals: 1, against: 0 } } }));
  const tail = (round) => buildColumn(inp({ matches: [M({ hG: 1, aG: 0 })], next: nx, history: hist, round })).sections.find((s) => s.id === 'col-next').paras.find((t) => t.startsWith('Mit bud')).split(' – ').at(-1).replace(/\.$/, '');
  const seen = Array.from({ length: 10 }, (_, r) => tail(r + 1));
  assert.deepEqual([...new Set(seen)].sort(), [...SCOUT_TAIL].sort());
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
});

// tools/measure-column.mjs (3 sæsoner = 42 runder) – v3.21.1 → v3.21.2: overskrift med dit hold 17 → 23; comeback om en 3+-sejr 1 → 0;
// løberboksen 42 → 16; mest brugte kamp-overskrift 10 → 6. Båndene er røde på v3.21.1-tallene.
test('målt over 3 sæsoner: din kamp bærer flere overskrifter (≥ 20; før 17), intet comeback om en storsejr (før 1), løberboksen ca. hver 3. runde (før hver), kamp-overskrifterne spredt (≤ 7; før 10)', async () => {
  const { measureColumn } = await import('../../tools/measure-column.mjs');
  const r = await measureColumn(3);
  assert.equal(r.rounds, 42);
  assert.ok(r.mineInTitle >= 20, `din kamp i overskriften ${r.mineInTitle}`);
  assert.equal(r.bigComeback, 0);
  assert.ok(r.runner >= 8 && r.runner <= 21, `løberboksen ${r.runner} af 42`);
  assert.ok(r.headMax <= 7, `mest brugte kamp-overskrift ${r.headMax}`);
});
