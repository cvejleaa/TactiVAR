// Bygger DOM med textContent – aldrig HTML-strenge. Det fjerner hele klassen af citat-/
// escape-fejl, der i Gemini-versionerne gav tomme sider, og lukker for HTML i noter.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function select(value, options, onChange, attrs = {}) {
  return h('select', { ...attrs, onchange: (e) => onChange(e.target.value) },
    options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
}

export const LOCK = '🔒 ??';
// Decimaltal på dansk (v3.16.7, Spilfører: "12.7 km") – komma, ikke punktum
export const dec = (x, d = 1) => x.toFixed(d).replace('.', ',');

// ---------- v3.32.1 (designkritikken R1/R4): fold med hukommelse, ⓘ-hjælp og "mere at rulle" ----------
// Fold ind med husket åben/lukket over gen-tegninger (før kun i stats.js – openSecs). Tilstanden ligger i dette modul (ikke i gemmet):
// id → true/false, så også et standard-ÅBENT fold husker, at det blev lukket (QC). Valget huskes ved klikket på summary (også Enter/
// mellemrum) – ikke i toggle: Chromium sender toggle forsinket, og en gentegning lige efter klikket glemte det (fundet af e2e). Ét sted.
// Ved toggle måles brede tabeller i foldet igen.
const openFolds = new Map();
export function fold({ id, summary, open = false, cls = '', label = null }, ...body) {
  const isOpen = openFolds.has(id) ? openFolds.get(id) : open;
  const d = h('details', { class: cls || null, id, open: isOpen, ontoggle: (e) => markScrollable(e.target) },
    h('summary', { 'aria-label': label, onclick: () => openFolds.set(id, !d.open) }, summary), ...body);   // klikket skifter open bagefter
  return d;
}
// "ⓘ Sådan virker det" (R1): én kort linje synlig, forklaringen bag ⓘ. long er et færdigt element (det beholder sin klasse/sit id, så
// tekst-tjekkene læser det, også lukket). link er slottet til spilguiden (v3.33.0): { text, onClick }. label er emnet: skærmlæseren hører
// "Sådan virker det – Fase 2" – navnet begynder med den synlige tekst (QC, WCAG 2.5.3: talestyring siger det, den ser).
export function help({ id, short, long, label = null, link = null }) {
  return [short ? h('p', { class: 'muted help-short' }, short) : null,
    fold({ id, summary: 'ⓘ Sådan virker det', cls: 'help-more', label: label ? `Sådan virker det – ${label}` : null }, long, link ? h('button', { class: 'linklike help-link', onclick: link.onClick }, link.text) : null)];
}
// Brede tabeller (R4): hver .tablewrap får data-scroll="ja", når indholdet er bredere end rammen (så låses de opt-in stick-1/stick-2-
// kolonner), og data-more="ja", så længe der er mere at rulle mod højre (fade i kanten, style.css). Den låste første kolonnes bredde
// måles og sættes som --stick1-w. Fylder de låste kolonner over 40 % af rammen, låses kun stick-2 (navnet), og pladsen står i
// samme celle (data-stick="navn"). Kaldes til sidst i render(), efter renderMc, ved resize og når et fold åbnes/lukkes.
const watched = new WeakSet();
const setFlag = (el, k, on) => { if (on) el.dataset[k] = 'ja'; else delete el.dataset[k]; };
function markOne(w) {
  const scroll = w.scrollWidth > w.clientWidth + 1;
  setFlag(w, 'scroll', scroll);
  setFlag(w, 'more', scroll && w.scrollLeft + w.clientWidth < w.scrollWidth - 1);
  if (!scroll) { delete w.dataset.stick; return; }
  const s1 = w.querySelector('tbody .stick-1'), s2 = w.querySelector('tbody .stick-2');
  if (!s1 || w.dataset.stick) return;   // afgjort én gang pr. tegning (pladsen i navnecellen ændrer selv bredden)
  const w1 = s1.getBoundingClientRect().width, w2 = s2 ? s2.getBoundingClientRect().width : 0;
  w.style.setProperty('--stick1-w', `${Math.round(w1)}px`);
  w.dataset.stick = s2 && w1 + w2 > 0.4 * w.clientWidth ? 'navn' : 'alle';
}
export function markScrollable(root = document) {
  const list = [...(root.matches?.('.tablewrap') ? [root] : []), ...root.querySelectorAll('.tablewrap')];
  for (const w of list) {
    if (!watched.has(w)) { watched.add(w); w.addEventListener('scroll', () => markOne(w), { passive: true }); }
    markOne(w);
  }
}
export function remarkScrollable(root = document) {
  for (const w of root.querySelectorAll('.tablewrap[data-stick]')) delete w.dataset.stick;
  markScrollable(root);
}
