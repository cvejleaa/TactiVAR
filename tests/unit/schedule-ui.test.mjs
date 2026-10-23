// Kampprogrammet på Liga-fanen (public/ui/rounds.js, v3.11) mod et minimalt DOM – samme greb som
// stats-ui.test.mjs: kendte, forskellige tal, så en ombyttet retning eller score bliver rød.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  get id() { return this.attrs.id; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { pairRound } = await import('../../public/engine/season.js');
const { renderSchedule } = await import('../../public/ui/rounds.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const cells = (tr) => tr.children.map((c) => c.textContent);

test('kampprogrammet: næste runde i spillerækkefølge, dit program med din score først og H/U, næste runde markeret, hele programmet med hjemme-ude-score', () => {
  const L = createLeague(createRng(8)), me = L.teams.find((t) => !t.isBot), name = (id) => L.teams.find((t) => t.id === id).name;
  // To spillede runder med kendte, forskellige scorer (hjemme hG, ude aG)
  L.leagueMetadata.round = 2;
  L.history = [1, 2].map((round) => ({ round, results: L.schedule[round - 1].map(([h, a], i) => ({ h, a, hG: i + round, aG: 2 * i })) }));
  const el = renderSchedule({ league: L, pairs: pairRound(L), myTeamId: me.id });
  assert.equal(byId(el, 'next-round-title').textContent, 'Næste runde – sæson 1, runde 3 af 14');
  const fx = all(byId(el, 'next-round'), (e) => e.className.split(' ').includes('fixture')).map((f) => f.textContent);
  assert.deepEqual(fx, pairRound(L).map(([h, a]) => `${L.teams[h].name}–${L.teams[a].name}`));
  assert.ok(fx[0].includes(me.name));
  assert.deepEqual(fx.slice().sort(), L.schedule[2].map(([h, a]) => `${name(h)}–${name(a)}`).sort());
  const rows = all(byId(el, 'my-schedule'), (e) => e.tag === 'tr');
  assert.equal(rows.length, 14);
  rows.forEach((tr, k) => {
    const [h, a] = L.schedule[k].find((p) => p.includes(me.id)), home = h === me.id;
    const c = cells(tr);
    assert.deepEqual(c.slice(0, 3), [`R${k + 1}`, home ? 'H' : 'U', name(home ? a : h)], `række ${k + 1}`);
    if (k < 2) {
      const r = L.history[k].results.find((x) => x.h === h && x.a === a);
      assert.equal(c[3], home ? `${r.hG}-${r.aG}` : `${r.aG}-${r.hG}`, 'din score først');
      const d = home ? r.hG - r.aG : r.aG - r.hG;
      assert.equal(tr.className.trim(), d > 0 ? 'won' : d < 0 ? 'lost' : 'drawn');
    } else assert.equal(c[3], '–');
  });
  assert.equal(rows[2].className.trim(), 'next');
  assert.ok(rows.filter((r) => r.className.includes('next')).length === 1);
  // Hele programmet: runde 1 med resultater i hjemme-ude-rækkefølge, runde 3 uden
  const full = byId(el, 'full-schedule');
  const r1 = all(full, (e) => e.className.split(' ').includes('fixture')).slice(0, 4).map((f) => f.textContent);
  assert.deepEqual(r1, L.history[0].results.map((x) => `${name(x.h)}${x.hG}-${x.aG}${name(x.a)}`));
  const r3 = all(full, (e) => e.className.split(' ').includes('fixture')).slice(8, 12).map((f) => f.textContent);
  assert.ok(r3.every((t) => t.includes('–')));
  assert.equal(byId(el, 'past-seasons'), undefined, 'ingen tidligere sæsoner endnu');
});

test('kampprogrammet: tidligere sæsoner med mester, din placering, topscorer og din bedste – nyeste først, dit hold markeret', () => {
  const L = createLeague(createRng(9)), me = L.teams.find((t) => !t.isBot), bot = L.teams.find((t) => t.isBot);
  const row = (t, points) => ({ teamId: t.id, teamName: t.name, played: 14, won: 0, drawn: 0, lost: 0, goalsFor: points + 1, goalsAgainst: 3, points });
  L.seasons = [
    { seasonNumber: 1, fromRound: 1, toRound: 6, programmed: false, statsFrom: 4, table: [row(bot, 12), row(me, 9)], champion: { teamId: bot.id, teamName: bot.name, points: 12 }, myPos: 2,
      topScorer: { shirtNumber: 9, shortName: 'A. Topp', teamName: bot.name, goals: 7 }, myBest: { shirtNumber: 10, shortName: 'B. Bedst', motm: 3, goals: 2 } },
    { seasonNumber: 2, fromRound: 7, toRound: 20, programmed: true, table: [row(me, 30), row(bot, 25)], champion: { teamId: me.id, teamName: me.name, points: 30 }, myPos: 1, topScorer: null, myBest: null },
  ];
  L.seasonStartRound = 21; L.leagueMetadata.round = 20; L.leagueMetadata.seasonNumber = 3;
  const past = byId(renderSchedule({ league: L, pairs: pairRound(L), myTeamId: me.id }), 'past-seasons');
  const heads = all(past, (e) => e.tag === 'h4').map((x) => x.textContent);
  assert.deepEqual(heads, ['Sæson 2 – runde 7–20', 'Sæson 1 (uden program) – runde 1–6']);
  const ps = all(past, (e) => e.tag === 'p').map((x) => x.textContent);
  assert.equal(ps[0], `🏆 Mester: ${me.name} (30 point). Din placering: nr. 1.`);
  assert.equal(ps[1], `Førende ved afslutningen: ${bot.name} (12 point). Din placering: nr. 2. Topscorer: #9 A. Topp (${bot.name}), 7 mål. Din bedste: #10 B. Bedst (3× kampens spiller, 2 mål). Spillertallene gælder fra sæsonens runde 4.`);
  const lis = all(past, (e) => e.tag === 'li');
  assert.deepEqual(lis.slice(2).map((l) => [l.textContent, l.className]), [[`${bot.name} – 12 p (13-3)`, ''], [`${me.name} – 9 p (10-3)`, 'mine']]);
});

// ---------- Test Manager v3.11: huller fundet ved mutationstest ----------
// Dit program, når du er udehold: score først hos dig, rækkefarve fra din side, "mine"-markering og tomme/udfyldte resultater i det fulde program.
test('kampprogrammet: udekampe vises med din score først og din farve, din kamp er markeret i hele programmet, kampe uden resultat er dæmpet', () => {
  const L = createLeague(createRng(8)), me = L.teams.find((t) => !t.isBot), name = (id) => L.teams.find((t) => t.id === id).name;
  L.leagueMetadata.round = 13;
  // Udfald fra MIT synspunkt pr. runde (cyklus V, T, U) – med forskellig score hjemme og ude, så ombyttede sider ses
  const OUT = ['V', 'T', 'U'], SCORE = { home: { V: [2, 0], T: [0, 1], U: [1, 1] }, away: { V: [0, 2], T: [3, 1], U: [2, 2] } };
  const want = [], seen = { home: 0, away: 0 }; // udfaldet cykler for sig hjemme og ude, så alle seks kombinationer forekommer
  L.history = Array.from({ length: 13 }, (_, i) => {
    const round = i + 1;
    return {
      round, results: L.schedule[i].map(([h, a], j) => {
        if (!(h === me.id || a === me.id)) return { h, a, hG: 5 + j, aG: 6 + j };
        const home = h === me.id, out = OUT[seen[home ? 'home' : 'away']++ % 3], [hG, aG] = SCORE[home ? 'home' : 'away'][out];
        want.push({ k: round, home, out, text: home ? `${hG}-${aG}` : `${aG}-${hG}` });
        return { h, a, hG, aG };
      }),
    };
  });
  const el = renderSchedule({ league: L, pairs: pairRound(L), myTeamId: me.id });
  assert.ok(want.some((w) => !w.home && w.out === 'V') && want.some((w) => !w.home && w.out === 'T') && want.some((w) => w.home && w.out === 'T'), 'fixturet dækker udesejr, udenederlag og hjemmenederlag');
  const rows = all(byId(el, 'my-schedule'), (e) => e.tag === 'tr');
  want.forEach((w) => {
    const tr = rows[w.k - 1], c = cells(tr);
    assert.equal(c[3], w.text, `runde ${w.k} (${w.home ? 'hjemme' : 'ude'}): din score først`);
    assert.equal(tr.className.trim(), { V: 'won', T: 'lost', U: 'drawn' }[w.out], `runde ${w.k} (${w.home ? 'hjemme' : 'ude'}, ${w.out})`);
  });
  assert.equal(cells(rows[13])[3], '–'); assert.equal(rows[13].className.trim(), 'next');
  // Hele programmet: 14 overskrifter, præcis én "mine"-kamp pr. runde (også som udehold), resultater kun for spillede runder
  const full = byId(el, 'full-schedule');
  assert.deepEqual(all(full, (e) => e.tag === 'h4').map((x) => x.textContent), Array.from({ length: 14 }, (_, i) => `Runde ${i + 1}`));
  const fx = all(full, (e) => e.className.split(' ').includes('fixture'));
  assert.equal(fx.length, 56);
  fx.forEach((f, n) => {
    const k = Math.floor(n / 4), [h, a] = L.schedule[k][n % 4], isMine = h === me.id || a === me.id;
    assert.equal(f.className.split(' ').includes('mine'), isMine, `runde ${k + 1}: ${name(h)}–${name(a)}`);
    const score = f.children[1];
    if (k < 13) { assert.ok(/^\d+-\d+$/.test(score.textContent), score.textContent); assert.ok(!score.className.includes('muted'), 'spillet kamp er ikke dæmpet'); }
    else { assert.equal(score.textContent, '–'); assert.ok(score.className.split(' ').includes('muted'), 'kamp uden resultat er dæmpet'); }
  });
  // Næste runde (runde 14): din kamp er markeret, uanset hjemme/ude, og alle er dæmpet (intet resultat endnu)
  const nf = all(byId(el, 'next-round'), (e) => e.className.split(' ').includes('fixture'));
  assert.equal(nf.filter((f) => f.className.split(' ').includes('mine')).length, 1);
  assert.ok(nf.every((f) => f.children[1].className.split(' ').includes('muted')));
});

// Avisen ved sæsonslut (public/ui/matchcenter.js renderGazette)
test('avisen ved sæsonslut: titel med sæsonnummer, mester med point, din placering, topscorer og afslutning – og intet uden seasonEnd', async () => {
  const { renderGazette } = await import('../../public/ui/matchcenter.js');
  const base = { totalGoals: 7, totalVarChecks: 3, myResult: 'Resultat.' };
  const end = { seasonNumber: 4, champion: { teamName: 'Mester FC', points: 33 }, myPos: 2, topScorer: { shirtNumber: 9, shortName: 'A. Topp', teamName: 'Hold B', goals: 17 } };
  const p = (g) => byId(renderGazette(g, 'x'), 'season-end');
  assert.equal(p({ ...base, seasonEnd: end }).textContent,
    '🏆 Sæson 4 er slut: Mester FC er mester med 33 point. Du sluttede nr. 2. Topscorer: #9 A. Topp (Hold B), 17 mål. En ny sæson starter med nulstillet tabel – se Tidligere sæsoner på Liga-fanen.');
  assert.equal(p({ ...base, seasonEnd: { seasonNumber: 1, champion: null, myPos: null, topScorer: null } }).textContent,
    '🏆 Sæson 1 er slut: En ny sæson starter med nulstillet tabel – se Tidligere sæsoner på Liga-fanen.');
  assert.equal(p(base), undefined, 'ingen sæsonslut-linje midt i sæsonen');
});
