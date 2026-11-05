// v3.32.1 (designkritikkens røde R1–R5): fold med hukommelse og ⓘ-hjælp (ui/dom.js), "mere at rulle"-markeringen (markScrollable),
// Kamp-underfanerne og fuldtids-linjen (ui/matchcenter.js) og Taktiks fem ⓘ (ui/tactics.js) – mod et minimalt DOM med rigtige data.
// e2e måler y-positionerne, rækkehøjderne og fade/sticky i Chromium; her bindes indholdet: hvad der står i hver fane, og hvad der IKKE må.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  querySelectorAll() { return []; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { fold, help, markScrollable } = await import('../../public/ui/dom.js');
const { renderMatchCenter, fullTimeLine, paneOf, MC_PANES } = await import('../../public/ui/matchcenter.js');
const { renderTactics, PHASE_SHORT, RULES_SHORT } = await import('../../public/ui/tactics.js');
const { clearReplays } = await import('../../public/ui/replay.js');
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id);
const hasCls = (e, c) => e.className.split(' ').includes(c);
const isOpen = (d) => d.attrs.open === '' || d.open === true;
// Brugeren klikker på summary: klik-hændelsen kommer FØR browseren skifter open (standardhandlingen) – derefter toggle
const toggle = (d) => { d.open = isOpen(d); d.children[0].listeners.click({}); d.open = !d.open; if (!d.open) delete d.attrs.open; d.listeners.toggle?.({ target: d }); };

test('fold: husker åben OG lukket over gentegning (pr. id) – et standard-åbent fold, der lukkes, tegnes lukket igen', () => {
  const mk = (open) => fold({ id: 'u-fold-a', summary: 'Titel', open, cls: 'stats-sec' }, 'indhold');
  const a = mk(false);
  assert.equal(a.tag, 'details'); assert.equal(a.className, 'stats-sec'); assert.equal(a.children[0].tag, 'summary'); assert.equal(a.children[0].textContent, 'Titel');
  assert.equal(isOpen(a), false, 'lukket fra start');
  toggle(a); assert.equal(isOpen(mk(false)), true, 'åbnet → åben ved næste tegning');
  toggle(mk(false)); assert.equal(isOpen(mk(false)), false, 'lukket igen → lukket');
  // standard-åben (Statistikkens "Spillere"): lukket af brugeren skal blive lukket (QC: "husker lukket eksplicit")
  const b = fold({ id: 'u-fold-b', summary: 'S', open: true }, 'x');
  assert.equal(isOpen(b), true);
  toggle(b);
  assert.equal(isOpen(fold({ id: 'u-fold-b', summary: 'S', open: true }, 'x')), false);
  // et andet id påvirkes ikke
  assert.equal(isOpen(fold({ id: 'u-fold-c', summary: 'S', open: true }, 'x')), true);
});

test('help: kort linje synlig + "ⓘ Sådan virker det" med aria-label – det lange element står uændret (klasse/id) inde i foldet, og linket er slottet til guiden', () => {
  const long = document.createElement('p'); long.className = 'muted phase-help'; long.textContent = 'Den lange forklaring';
  const [short, more] = help({ id: 'u-help', short: 'Kort linje', long, label: 'Fase 9' });
  assert.equal(short.className, 'muted help-short'); assert.equal(short.textContent, 'Kort linje');
  assert.equal(more.tag, 'details'); assert.equal(more.className, 'help-more'); assert.equal(more.attrs.id, 'u-help');
  assert.equal(more.children[0].textContent, 'ⓘ Sådan virker det'); assert.equal(more.children[0].attrs['aria-label'], 'Sådan virker det – Fase 9');   // navnet begynder med den synlige tekst (WCAG 2.5.3)
  assert.equal(more.children[1], long); assert.equal(isOpen(more), false);
  assert.equal(more.children.length, 2, 'intet link uden link');
  const withLink = help({ id: 'u-help2', short: '', long, link: { text: '📖 Læs mere i guiden ›', onClick: () => {} } });
  assert.equal(withLink[0], null, 'ingen tom kort linje');
  assert.equal(withLink[1].children[2].textContent, '📖 Læs mere i guiden ›');
});

// Et falsk rulle-element: bredde, rulning og de låste celler
function wrap({ scrollWidth, clientWidth, scrollLeft = 0, w1 = 60, w2 = 90, stick = true }) {
  const cell = (w) => ({ getBoundingClientRect: () => ({ width: w }) });
  const props = {};
  return { scrollWidth, clientWidth, scrollLeft, dataset: {}, listeners: {}, style: { setProperty: (k, v) => { props[k] = v; } }, props,
    matches: (s) => s === '.tablewrap', querySelectorAll: () => [],
    querySelector: (s) => (!stick ? null : s === 'tbody .stick-1' ? cell(w1) : s === 'tbody .stick-2' ? cell(w2) : null),
    addEventListener(k, f) { this.listeners[k] = f; } };
}

test('markScrollable: data-scroll når tabellen er bredere end rammen, data-more så længe der er mere til højre – og væk ved enden', () => {
  const w = wrap({ scrollWidth: 1194, clientWidth: 324 });
  markScrollable(w);
  assert.deepEqual([w.dataset.scroll, w.dataset.more], ['ja', 'ja']);
  w.scrollLeft = 1194 - 324; w.listeners.scroll();
  assert.deepEqual([w.dataset.scroll, w.dataset.more], ['ja', undefined], 'rullet til enden: ingen fade');
  w.scrollLeft = 300; w.listeners.scroll();
  assert.equal(w.dataset.more, 'ja');
  const fits = wrap({ scrollWidth: 1100, clientWidth: 1100 });
  markScrollable(fits);
  assert.deepEqual([fits.dataset.scroll, fits.dataset.more, fits.dataset.stick], [undefined, undefined, undefined], 'passer: ingen markering og intet låst');
  const onePx = wrap({ scrollWidth: 1101, clientWidth: 1100 });   // afrunding (1 px) tæller ikke som bredere
  markScrollable(onePx); assert.equal(onePx.dataset.scroll, undefined);
});

test('markScrollable: den låste 1. kolonnes bredde som --stick1-w; over 40 % af rammen låses kun navnet (data-stick="navn")', () => {
  // 390 px: rammen 324, Pos 68 + Spiller 93 = 161 > 129,6 (40 %) → kun navnet
  const narrow = wrap({ scrollWidth: 1194, clientWidth: 324, w1: 68, w2: 93 });
  markScrollable(narrow);
  assert.equal(narrow.props['--stick1-w'], '68px'); assert.equal(narrow.dataset.stick, 'navn');
  // bredere ramme: 161 < 40 % af 600 → begge låst
  const wide = wrap({ scrollWidth: 1194, clientWidth: 600, w1: 68, w2: 93 });
  markScrollable(wide); assert.equal(wide.dataset.stick, 'alle');
  // kun én låst kolonne (Træning, regnskabet): altid 'alle'
  const one = wrap({ scrollWidth: 900, clientWidth: 324, w1: 120, w2: 0 }); one.querySelector = (s) => (s === 'tbody .stick-1' ? { getBoundingClientRect: () => ({ width: 120 }) } : null);
  markScrollable(one); assert.equal(one.dataset.stick, 'alle');
  // kampvælgeren har ingen låste kolonner – kun fade
  const chips = wrap({ scrollWidth: 900, clientWidth: 324, stick: false });
  markScrollable(chips); assert.deepEqual([chips.dataset.more, chips.dataset.stick], ['ja', undefined]);
});

// ---------- Kamp-underfanerne ----------
function played(seed = 3) {
  const L = createLeague(createRng(seed)), me = L.teams.find((t) => !t.isBot), opp = L.teams.find((t) => t.isBot);
  const m = simulateMatch(me, opp, createRng(seed + 100));
  return { me, m, other: simulateMatch(L.teams.filter((t) => t.isBot)[1], L.teams.filter((t) => t.isBot)[2], createRng(seed + 200)) };
}
const on = { snapshot() {}, view() {}, filter() {}, skip() {}, replay() {}, heat() {}, pane() {}, send() {}, copyId() {} };
const draw = (m, me, mc = {}) => { clearReplays(); return renderMatchCenter({ mc: { round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false, canSend: false, sendWhy: '📤 Kamp-id: ikke sat op endnu', sent: [], ...mc }, myTeamId: me.id, on }); };
const count = (root, pred) => all(root, pred).length;
const what = (root) => ({
  feed: byId(root, 'feed').length, replay: byId(root, 'replay').length, stats: byId(root, 'match-stats').length,
  ratings: count(root, (e) => hasCls(e, 'ratings')), legend: byId(root, 'icon-legend').length,
});

test('underfanerne: hver fane viser KUN sit – 🎬 afspilning + referat, 📊 statistik, 👥 karakterark + forklaring', () => {
  const { me, m } = played();
  assert.ok(m.trace && m.events.length > 20, 'testen har data');
  const r = draw(m, me, { pane: 'replay' }), s = draw(m, me, { pane: 'stats' }), p = draw(m, me, { pane: 'players' });
  assert.deepEqual(what(r), { feed: 1, replay: 1, stats: 0, ratings: 0, legend: 0 });
  assert.deepEqual(what(s), { feed: 0, replay: 0, stats: 1, ratings: 0, legend: 0 });
  assert.deepEqual(what(p), { feed: 0, replay: 0, stats: 0, ratings: 2, legend: 1 });
  // statistikken har sine 13 rækker med kampens tal (ikke en tom tabel)
  assert.equal(count(byId(s, 'match-stats')[0], (e) => e.tag === 'tr'), 14);
  // fanerækken: tre knapper, den valgte aktiv og aria-pressed
  for (const [root, k] of [[r, 'replay'], [s, 'stats'], [p, 'players']]) {
    const tabs = byId(root, 'mc-tabs')[0];
    assert.equal(hasCls(tabs, 'toolbar'), false, 'ikke .toolbar (referatets filterrække)');
    assert.deepEqual(tabs.children.map((b) => [b.attrs.id, b.textContent, hasCls(b, 'active'), b.attrs['aria-pressed']]),
      MC_PANES.map(([id, l]) => [`mc-tab-${id}`, l, id === k, id === k ? 'true' : 'false']));
  }
  assert.deepEqual(MC_PANES.map(([, l]) => l), ['🎬 Afspilning & referat', '📊 Statistik', '👥 Spillerne']);
});

test('underfanerne: ukendt/undefined fane (openMatchCenter) er den første; et klik kalder on.pane med fanens nøgle', () => {
  assert.equal(paneOf({}), 'replay'); assert.equal(paneOf({ pane: undefined }), 'replay'); assert.equal(paneOf({ pane: 'bogus' }), 'replay');
  assert.equal(paneOf({ pane: 'players' }), 'players');
  const { me, m } = played();
  assert.deepEqual(what(draw(m, me, {})), { feed: 1, replay: 1, stats: 0, ratings: 0, legend: 0 });
  const got = [];
  clearReplays();
  const root = renderMatchCenter({ mc: { round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false }, myTeamId: me.id, on: { ...on, pane: (k) => got.push(k) } });
  for (const b of byId(root, 'mc-tabs')[0].children) b.listeners.click();
  assert.deepEqual(got, ['replay', 'stats', 'players']);
});

test('under live-afspilning: ingen faner, ingen fuldtids-linje og intet "⋯ Mere" – referat og statistik som før', () => {
  const { me, m } = played();
  const live = draw(m, me, { playing: true, shownCount: 10, pane: 'players' });
  assert.equal(byId(live, 'mc-tabs').length, 0); assert.equal(byId(live, 'mc-ft').length, 0); assert.equal(byId(live, 'mc-more').length, 0);
  assert.deepEqual(what(live), { feed: 1, replay: 0, stats: 1, ratings: 0, legend: 0 });
  assert.equal(byId(live, 'mc-main')[0].className, 'mc-grid');
});

test('fuldtids-linjen: resultatet og den taktiske dom (duelText) fra fuldtids-analysen – fast i alle tre faner, kun i din kamp, uden resten af analysen', () => {
  const { me, m, other } = played();
  const ft = m.events.find((e) => e.type === 'FULLTIME').text;
  const [res] = ft.replace(/^📊 \[FULDTIDS-ANALYSE\] /, '').split('. ');
  assert.match(res, /^(Sejr \d+-\d+ til dig|Nederlag \d+-\d+|Uafgjort \d+-\d+)$/);
  const want = fullTimeLine(m.events);
  assert.ok(want.startsWith(`${res}. `), want);
  // den taktiske dom – og IKKE boldbesiddelsen (v3.32.1-udkastet viste "Du havde 47% af bolden …")
  assert.match(want, /(Din opbygning (kom|er kommet) igennem \d+ af|Dit pres (vandt|stoppede))/);
  assert.ok(!want.includes('af bolden') && !want.includes('Dødbolde'), want);
  const tone = /^Sejr/.test(res) ? 'ft-win' : /^Nederlag/.test(res) ? 'ft-loss' : 'ft-draw';
  for (const k of ['replay', 'stats', 'players']) {
    const line = byId(draw(m, me, { pane: k }), 'mc-ft');
    assert.equal(line.length, 1, k); assert.equal(line[0].textContent, `📊 ${want}`); assert.equal(line[0].className, `mc-ft ${tone}`, k);
    assert.ok(!line[0].textContent.includes('Dødbolde') && !line[0].textContent.includes('[FULDTIDS-ANALYSE]'), 'kun den korte linje');
  }
  // en kamp uden dit hold har ingen analyse – og ingen linje, men en usynlig pladsholder af samme højde (fanerne hopper ikke, QC)
  assert.equal(fullTimeLine(other.events), null);
  const o = draw(other, me, {});
  assert.equal(byId(o, 'mc-ft').length, 0);
  const all = []; (function walk(n) { if (n && typeof n === 'object') { all.push(n); (n.children || []).forEach(walk); } })(o);
  const ph = all.filter((n) => typeof n.className === 'string' && n.className.split(' ').includes('mc-ft-tom'));
  assert.equal(ph.length, 1); assert.equal(ph[0].attrs['aria-hidden'], 'true');
});

test('"⋯ Mere": send-boksen og listen over sendte kampe er foldet ind nederst – ikke ved overskriften', () => {
  const { me, m } = played();
  const root = draw(m, me, { sent: [{ id: 'K-ABCD', label: 'Sæson 1 runde 1: A 1-0 B', replay: true }] });
  const more = byId(root, 'mc-more')[0];
  assert.equal(more.tag, 'details'); assert.equal(more.children[0].textContent, '⋯ Mere');
  assert.equal(byId(more, 'send-off')[0].textContent, '📤 Kamp-id: ikke sat op endnu');
  assert.ok(byId(more, 'sent-list')[0].textContent.includes('K-ABCD'));
  assert.equal(root.children.at(-1), more, 'nederst i panelet');
  const head = root.children[0];
  assert.equal(byId(head, 'send-off').length + byId(head, 'send-match').length, 0, 'intet i overskriftsrækken');
});

test('kampvælgeren: én række i en .tablewrap (fade/rulning), rundens kampe i rækkefølge – din kamp (rundens første) forrest', () => {
  const { me, m, other } = played();
  clearReplays();
  const root = renderMatchCenter({ mc: { round: 1, matches: [m, other], gazette: null, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false }, myTeamId: me.id, on });
  const cards = byId(root, 'match-cards')[0], w = all(root, (e) => e.children.includes(cards))[0];
  assert.ok(hasCls(w, 'tablewrap') && hasCls(w, 'cards-wrap'));
  assert.deepEqual(cards.children.map((b) => b.textContent.split(' 👑')[0]), [`${m.homeName} ${m.homeGoals}-${m.awayGoals} ${m.awayName}`, `${other.homeName} ${other.homeGoals}-${other.awayGoals} ${other.awayName}`]);
});

// ---------- Taktik: fem ⓘ ----------
test('Taktik: præcis 5 "ⓘ Sådan virker det" (3 faser, Hvis-Så, udskiftninger) – lukkede, med navngivne aria-labels; de lange tekster står i foldene', () => {
  const L = createLeague(createRng(4)), team = L.teams[0];
  const root = renderTactics({ team, isOwn: true, ui: { activePresetIndex: 0 }, on: new Proxy({}, { get: () => () => {} }) });
  const more = all(root, (e) => e.tag === 'details' && hasCls(e, 'help-more'));
  assert.equal(more.length, 5);
  assert.deepEqual(more.map((d) => d.attrs.id), ['help-phase1_buildUp', 'help-phase2_defending', 'help-phase3_transition', 'help-rules', 'help-subs']);
  assert.deepEqual(more.map((d) => d.children[0].attrs['aria-label']), ['Sådan virker det – Fase 1', 'Sådan virker det – Fase 2', 'Sådan virker det – Fase 3', 'Sådan virker det – Hvis-Så-reglerne', 'Sådan virker det – udskiftningerne']);
  assert.ok(more.every((d) => !isOpen(d)), 'lukket fra start');
  // det lange står INDE i foldet (ikke ved siden af) – og intet .phase-help/#subs-help uden for et fold
  const phaseHelp = all(root, (e) => hasCls(e, 'phase-help'));
  assert.equal(phaseHelp.length, 3);
  assert.ok(phaseHelp.every((p) => more.some((d) => d.children.includes(p))));
  assert.ok(more[0].textContent.includes('Angrebsfokus bestemmer, hvordan chancerne kommer'));
  assert.ok(more[4].children.includes(byId(root, 'subs-help')[0]) && byId(root, 'subs-help')[0].textContent.includes('højst 5 udskiftninger i højst 3 pauser'));
  // de korte linjer: én pr. fold, kort nok til én linje ved 390 px (målt i Chromium: ca. 48 tegn)
  const shorts = all(root, (e) => hasCls(e, 'help-short')).map((e) => e.textContent);
  assert.deepEqual(shorts, [...Object.values(PHASE_SHORT), RULES_SHORT, 'Træt spiller ud under grænsen · højst 5 skift']);
  assert.ok(shorts.every((t) => t.length >= 30 && t.length <= 48), shorts.map((t) => t.length).join(','));
  // modstanderens taktik: ingen faser – og ingen ⓘ
  const opp = renderTactics({ team: L.teams[1], isOwn: false, ui: { activePresetIndex: 0 }, on: {} });
  assert.equal(all(opp, (e) => hasCls(e, 'help-more')).length, 0);
});
