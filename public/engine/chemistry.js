// Samspil (v3.23.0, brugerens landstræner: "det han sætter vægt på, er hvordan spillerne arbejder/tænker sammen") – ÉT sted for
// modellen; docs/spec.md §5. Par af spillere på nabopladser spiller sig sammen med fælles minutter; et nyt køb er fremmed for alle.
// team.chemistry = { "idA|idB": [samspil 0–100, sidste fælles runde] } (id'er sorteret). Rent modul: ingen rng, ingen import af
// season.js. v3.23.0 er data uden virkning i kampene (PR-A); virkningen og visningen kommer samtidig i v3.24.0 (QC: ingen usynlig skat).
import { FORMATIONS, lineOfRole } from './formations.js';

export const CHEM_MAX = 100;
// Seedet: ligevægten for botternes opstillinger (QC: ikke et gæt – ellers drifter ligaen den første sæson). tools/measure-chemistry.mjs
// base (4 seeds × 4 sæsoner, LEAK 0,02, K 0,08): 78,6 i 4. sæson (spredning 5,0; uden LEAK 97,6 – alle par mættede).
export const CHEM_BASE = 78;
export const STRANGER = 30;                           // et nyt køb er fremmed for alle (QC: en kendt og begrænset pris)
// Aftagende vækst (Spilfører klub: lineær vækst mættede faste par ved runde 7, så stabilitet var værdiløs og rotation gratis):
// samspil += K · (100 − samspil) · fælles minutter/90 – en ny mand når holdets niveau på ≈ 8 kampe, en fast kerne vokser i ≈ 2 sæsoner.
export const K_GAIN = 0.14;
// Ligevægt under loftet (målt: uden den nåede botternes faste par 97,6 af 100, og samspil kunne kun straffe – brugeren valgte
// "i forhold til ligaen"): hvert par trækkes LEAK pr. runde mod fremmede, så et fast par ender på (100·K + STRANGER·LEAK)/(K + LEAK)
// ≈ 86, et par med halvdelen af kampene ≈ 77 – der er noget at vinde ved en fast kerne, og virkningen måles mod ligaens snit (chemRef).
export const LEAK = 0.035;
export const ABSENT_ROUNDS = 3, DECAY = 5;            // kun efter 3+ runder uden fælles minutter – aldrig pr. hvilet kamp (Spilfører)
export const NEIGHBOUR_DIST = 29;                     // afstand mellem pladser i FORMATIONS-koordinater (CB-CB 24, CM-ST 28; ikke LW-ST 33)
export const PAIR_CAP = 300;                          // loft pr. hold i gemmet (sanitize)

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Nabopladserne i en formation (markpladserne 1–10; målmanden har ingen par). Hver markplads har mindst én nabo – findes ingen
// inden for NEIGHBOUR_DIST, er den nærmeste hans nabo (QC: den enlige angriber i 4-3-3 havde ellers aldrig en makker).
const cache = new Map();
export function neighbourPairs(formation) {
  if (cache.has(formation)) return cache.get(formation);
  const c = FORMATIONS[formation] ?? FORMATIONS['4-4-2'], d = (i, j) => Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y);
  const out = new Set();
  for (let i = 1; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (d(i, j) <= NEIGHBOUR_DIST) out.add(`${i}-${j}`);
  for (let i = 1; i < c.length; i++) {
    if ([...out].some((k) => k.split('-').map(Number).includes(i))) continue;
    let best = -1;
    for (let j = 1; j < c.length; j++) if (j !== i && (best < 0 || d(i, j) < d(i, best))) best = j;
    out.add(i < best ? `${i}-${best}` : `${best}-${i}`);
  }
  const list = [...out].map((k) => k.split('-').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  cache.set(formation, list);
  return list;
}

// Seed (ÉN funktion – ny liga, migrering og et hold uden tabel): alle par af markspillere i truppen står på BASE ("truppen har
// spillet sammen før") – så hverken en ny liga eller et migreret gem spiller anderledes i runde 1 (QC: seedet skal dække hvert par,
// motoren kan læse).
export function seedChemistry(team, round = 0) {
  const ids = team.squad.filter((p) => p.position !== 'GK').map((p) => p.id), chem = {};
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) chem[pairKey(ids[i], ids[j])] = [CHEM_BASE, round];
  team.chemistry = chem;
  return team;
}

// Samspillet mellem to spillere: ingen tabel (håndbyggede testhold) = BASE (neutral); et par, tabellen ikke kender = fremmede.
export function chemOf(team, a, b) {
  if (!team?.chemistry) return CHEM_BASE;
  return team.chemistry[pairKey(a, b)]?.[0] ?? STRANGER;
}

// Fælles minutter på nabopladser i én kamp (arkets slot/minIn/minOut – også indskiftere fra deres minut). Hvis-Så kan flytte
// pladser uden at opdatere arkets slot – accepteret tilnærmelse (spec §5).
const startMin = (e) => ((e.minIn ?? 1) <= 1 ? 0 : e.minIn);
export function sharedMinutes(ratings, formation) {
  const bySlot = new Map();
  for (const e of ratings) if (e.slot != null && e.slot > 0) (bySlot.get(e.slot) ?? bySlot.set(e.slot, []).get(e.slot)).push(e);
  const out = [];
  for (const [i, j] of neighbourPairs(formation)) for (const a of bySlot.get(i) ?? []) for (const b of bySlot.get(j) ?? []) {
    const min = Math.min(a.minOut ?? 90, b.minOut ?? 90) - Math.max(startMin(a), startMin(b));
    if (min > 0 && a.playerId !== b.playerId) out.push([a.playerId, b.playerId, min]);
  }
  return out;
}

// Efter en kamp: aftagende vækst for hvert nabopar med fælles minutter.
export function applyChemistry(team, ratings, formation, round) {
  const chem = team.chemistry ?? seedChemistry(team, round).chemistry;
  for (const [a, b, min] of sharedMinutes(ratings, formation)) {
    const k = pairKey(a, b), v = chem[k]?.[0] ?? STRANGER;
    chem[k] = [Math.min(CHEM_MAX, Math.round((v + K_GAIN * (CHEM_MAX - v) * Math.min(90, min) / 90) * 10) / 10), round];
  }
  return team;
}

// Efter runden: alle par trækkes LEAK mod fremmede (ligevægten); par uden fælles minutter i ABSENT_ROUNDS runder falder desuden
// DECAY pr. runde – når de er nede på fremmede, slettes de (et ukendt par ER fremmede).
export function decayChemistry(team, round) {
  const chem = team.chemistry;
  if (!chem) return team;
  for (const [k, [v, last]] of Object.entries(chem)) {
    const nv = Math.round((v - LEAK * (v - STRANGER) - (round - last >= ABSENT_ROUNDS ? DECAY : 0)) * 10) / 10;
    if (nv <= STRANGER + 0.5) delete chem[k]; else chem[k] = [nv, last];
  }
  return team;
}

// Ligaens snit (v3.23.0, brugerens valg "i forhold til ligaen"): middel samspil af de nabopar, alle hold stiller op med lige nu –
// virkningen i kampene (v3.24.0) måles mod det, så samspil hverken inflaterer over sæsonerne eller kun kan straffe.
// Ligaens snit til virkningen: det gemte (sat efter hver runde), ellers regnet nu – efter en migrering eller i en ny liga (QC).
export const chemRefOf = (league) => { const v = league?.leagueMetadata?.chemRef; return Number.isFinite(v) ? Math.max(STRANGER, Math.min(CHEM_MAX, v)) : leagueChemRef(league); };
export function leagueChemRef(league) {
  let n = 0, sum = 0;
  for (const t of league.teams) {
    const slots = t.tactics?.lineupSlots ?? [];
    for (const [i, j] of neighbourPairs(t.tactics?.baseFormation)) if (slots[i] && slots[j]) { sum += chemOf(t, slots[i], slots[j]); n++; }
  }
  return n ? Math.round((sum / n) * 10) / 10 : CHEM_BASE;
}

// Salg, køb, pension: par med en spiller, der ikke længere er i truppen, slettes (en ny mand har ingen par = fremmede).
export function pruneChemistry(team) {
  if (!team.chemistry) return team;
  const ids = new Set(team.squad.map((p) => p.id));
  for (const k of Object.keys(team.chemistry)) { const [a, b] = k.split('|'); if (!ids.has(a) || !ids.has(b)) delete team.chemistry[k]; }
  return team;
}

// Gemmet (sanitize): kun par af to forskellige spillere i truppen, samspil 0–100 og en heltalsrunde; højst PAIR_CAP pr. hold
// (de højeste beholdes). null = feltet mangler eller har forkert form – så seedes holdet (seedChemistry).
export function cleanChemistry(chem, ids) {
  if (!chem || typeof chem !== 'object' || Array.isArray(chem)) return null;
  const ok = Object.entries(chem).filter(([k, v]) => {
    const [a, b, ...rest] = k.split('|');
    return !rest.length && a !== b && ids.has(a) && ids.has(b) && k === pairKey(a, b) && Array.isArray(v) && v.length === 2
      && Number.isFinite(v[0]) && v[0] >= 0 && v[0] <= CHEM_MAX && Number.isInteger(v[1]) && v[1] >= 0;
  }).sort((x, y) => y[1][0] - x[1][0]).slice(0, PAIR_CAP);
  return ok.length ? Object.fromEntries(ok) : null;   // ingen gyldige par: seedes igen (QC – ellers var hele holdet tavst fremmede)
}

// ---------- Virkningen i kampene (v3.24.0) ----------
// Skalaen omkring ligaens snit (ref = chemRefOf): fremmede (30) = −1, et fast par i ligevægt (CHEM_TOP ≈ 86) = +1 – så en fast
// kerne kan mærkes lige så meget som et nyt køb koster (QC: nævneren ref − 30 under, CHEM_TOP − ref over). ref ≥ CHEM_TOP: kun ned.
export const CHEM_TOP = Math.round(((100 * K_GAIN + STRANGER * LEAK) / (K_GAIN + LEAK)) * 10) / 10;   // 86,0
export function chemScale(v, ref) {
  if (v >= ref) return ref >= CHEM_TOP ? 0 : Math.min(1, (v - ref) / (CHEM_TOP - ref));
  return -Math.min(1, (ref - v) / Math.max(1, ref - STRANGER));
}
// En spillers samspil på sin plads lige nu: middel over hans nabopar blandt de spillere, der står på banen (starters i slot-orden).
export function slotChem(team, starters, formation, slot) {
  if (!(slot > 0)) return null;
  const vals = [];
  for (const [i, j] of neighbourPairs(formation)) {
    if (i !== slot && j !== slot) continue;
    const o = starters[i === slot ? j : i];
    if (o) vals.push(chemOf(team, starters[slot].id, o.id));
  }
  return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
}

// ---------- Visningen (v3.24.0) – ét sted for bånd, ord og de par, motoren læser ----------
// Båndet afgøres på den SAMME skala som virkningen (QC: rå point skiftede ord, når ligaens snit flyttede sig); ordene er de eneste,
// spilleren ser – intet 0–100-tal (QC B3). ref er påkrævet: visning og kamp må ikke kunne skilles ad.
export const BANDS = [['fremmede', -0.5], ['finder', -0.15], ['sammen', 0.4], ['staerkt', Infinity]];
export const BAND_WORD = { fremmede: 'fremmede', finder: 'finder hinanden', sammen: 'spillet sammen', staerkt: 'stærkt' };
export function bandOf(v, ref) {
  if (!Number.isFinite(ref)) throw new Error('bandOf kræver ligaens snit');
  const sc = chemScale(v, ref);
  return sc <= -0.5 ? 'fremmede' : sc <= -0.15 ? 'finder' : sc < 0.4 ? 'sammen' : 'staerkt';
}
// De par, motoren læser (QC/Spilfører: et angriberpar påvirker intet og vises ikke): mindst én af de to er forsvarer eller midtbane.
export function readPairs(formation) {
  const c = FORMATIONS[formation] ?? FORMATIONS['4-4-2'];
  return neighbourPairs(formation).filter(([i, j]) => [i, j].some((k) => ['DEF', 'MID'].includes(lineOfRole(c[k].r))));
}
const SIDE = (r) => (r.startsWith('L') ? 'L' : r.startsWith('R') ? 'R' : null);
function pairName(ra, rb) {
  const both = (set) => set.has(ra) && set.has(rb), one = (set) => set.has(ra) || set.has(rb);
  if (ra === 'CB' && rb === 'CB') return 'Midtstopper-parret';
  if (both(new Set(['CM', 'CDM', 'CAM']))) return 'Den centrale midtbane';
  const wide = new Set(['LB', 'LWB', 'LM', 'LW', 'RB', 'RWB', 'RM', 'RW']);
  if (both(wide) && SIDE(ra) && SIDE(ra) === SIDE(rb)) return SIDE(ra) === 'L' ? 'Venstre side' : 'Højre side';
  return null;
}
// Holdets par i opstillingen lige nu (kun dem, motoren læser): navn (eller numrene, når navnet ikke er entydigt), værdi og bånd.
export function lineupPairs(team, ref) {
  const c = FORMATIONS[team.tactics.baseFormation] ?? FORMATIONS['4-4-2'], slots = team.tactics.lineupSlots, byId = new Map(team.squad.map((p) => [p.id, p]));
  const raw = readPairs(team.tactics.baseFormation).map(([i, j]) => ({ i, j, a: byId.get(slots[i]), b: byId.get(slots[j]) })).filter((x) => x.a && x.b)
    .map((x) => { const v = chemOf(team, x.a.id, x.b.id); return { ...x, v, band: bandOf(v, ref), name: pairName(c[x.i].r, c[x.j].r) }; });
  const count = new Map(); for (const x of raw) if (x.name) count.set(x.name, (count.get(x.name) ?? 0) + 1);
  return raw.map((x) => ({ ...x, label: x.name && count.get(x.name) === 1 ? x.name : `#${x.a.shirtNumber} ${x.a.shortName} og #${x.b.shirtNumber} ${x.b.shortName}` }));
}
export const BAND_RANK = { fremmede: 0, finder: 1, sammen: 2, staerkt: 3 };
// Det svageste par (legenden) – laveste bånd, så laveste værdi.
export const weakestPair = (pairs) => pairs.slice().sort((x, y) => BAND_RANK[x.band] - BAND_RANK[y.band] || x.v - y.v)[0] ?? null;
// Byt: de par, hvis bånd skiftede (QC: båndet, ikke point) – største fald først, højst 2. Par sammenlignes på pladserne.
export function swapChanges(before, after) {
  const was = new Map(before.map((x) => [`${x.i}-${x.j}`, x]));
  return after.map((x) => ({ x, w: was.get(`${x.i}-${x.j}`) })).filter(({ x, w }) => w && w.band !== x.band)
    .sort((p, q) => (BAND_RANK[p.x.band] - BAND_RANK[p.w.band]) - (BAND_RANK[q.x.band] - BAND_RANK[q.w.band])).slice(0, 2)
    .map(({ x, w }) => `${x.label}: ${BAND_WORD[w.band]} → ${BAND_WORD[x.band]}`);
}
// En spillers par med hans naboer i opstillingen lige nu (bænk: ingen).
export const playerPairs = (team, ref, pid) => lineupPairs(team, ref).filter((x) => x.a.id === pid || x.b.id === pid).map((x) => ({ ...x, mate: x.a.id === pid ? x.b : x.a }));
// Bedste makker: kun når parret er stærkt (QC: ellers fik næsten alle en "bedste makker").
export function bestPartner(team, ref, pid) {
  const byId = new Map(team.squad.map((p) => [p.id, p])); let best = null;
  for (const [k, [v]] of Object.entries(team.chemistry ?? {})) {
    const [a, b] = k.split('|'); if (a !== pid && b !== pid) continue;
    const mate = byId.get(a === pid ? b : a);
    if (mate && bandOf(v, ref) === 'staerkt' && (!best || v > best.v)) best = { mate, v };
  }
  return best;
}
// Kampe fra fremmede til "spillet sammen" for en fast mand ved siden af de samme (købelinjen – regnet, ikke skrevet fast; QC).
export function gamesToSettle(ref) {
  let v = STRANGER, n = 0;
  while (bandOf(v, ref) !== 'sammen' && bandOf(v, ref) !== 'staerkt' && n < 60) { v = v + K_GAIN * (CHEM_MAX - v); v = v - LEAK * (v - STRANGER); n++; }
  return n;
}
