// Livsløb, økonomi og transfers (v3.18.0) – konstanter og rene hjælpere ét sted (spec §13; CLAUDE.md "et tal uden kode er
// en påstand"). Intet her trækker på ligaens rng: tilfældighed kommer fra afledte, seedede rng'er (hash af id og sæson), så en
// sæsonovergang er reproducerbar og flytter ikke kampene.
import { createRng } from './rng.js';

// ---------- Afledt tilfældighed ----------
// FNV-1a over en tekst → et 32-bit seed. Samme tekst giver altid samme tal (to indlæsninger giver samme potentiale).
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export const derivedRng = (...parts) => createRng(hashSeed(...parts));

// ---------- Lofter i gemmet ----------
export const MATCH_LOG_CAP = 28;   // kamphistorik pr. spiller (to sæsoner)

// ---------- Kæder og nøgle-evner ----------
// Kædens 3 nøgle-evner: potentialet er et loft for deres gennemsnit; "Alsidig" træner dem; vækst ved sæsonslut vægter dem.
export const KEY_SKILLS = {
  GK: ['goalkeeping', 'positioning', 'passing'],
  DEF: ['positioning', 'intercepting', 'strength'],
  MID: ['passing', 'ballControl', 'stamina'],
  ATT: ['finishing', 'pace', 'ballControl'],
};
export const keyAvg = (p) => KEY_SKILLS[p.line].reduce((a, k) => a + (p.skills?.[k] ?? 0), 0) / 3;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- Potentiale (hemmeligt) ----------
// Loft for nøgle-evnernes snit. Eksisterende spillere (migrering): deterministisk fra id efter alder – 16–19 år snit + 4 ± 2,
// 20–23 år + 2 ± 1, ældre ingen plads; klemt til 4–19 og aldrig under det nuværende snit.
export function initialPotential(p) {
  const r = derivedRng('potential', p.id), avg = keyAvg(p);
  // Ungdomsspillere (v3.18.0) + 4 ± 2,5: de starter lavt (4–8); 10–30 % bliver startere (measure-lifecycle; + 5 gav 35–45 %)
  const room = p.roleTier === 'YOUTH' ? 4 + (r.next() * 5 - 2.5) : p.age <= 19 ? 4 + (r.next() * 4 - 2) : p.age <= 23 ? 2 + (r.next() * 2 - 1) : 0;
  return Math.round(clamp(Math.max(avg, avg + room), 4, 19) * 10) / 10;
}

// ---------- Offentlig værdi og løn (afslører ikke evnerne – kun stjerner, tier og alder, spec §3) ----------
export const VALUE_BY_STARS = [0, 300000, 600000, 1200000, 2400000, 4500000];   // kr. pr. stjerne (0–5)
export const TIER_STARS = { STAR: 4, STARTER: 3, ROTATION: 2, TALENT: 2, YOUTH: 1 };   // ungdom: ubeprøvet (measure-lifecycle)
export const ageFactor = (age) => (age <= 21 ? 1.3 : age <= 27 ? 1 : age <= 30 ? 0.8 : age <= 32 ? 0.55 : 0.35);
export const WAGE_SHARE = 0.06;   // ugeløn = 6 % af værdien
const round = (v, step) => Math.round(v / step) * step;
// Stjernerne bag værdien: med mindst 3 kampe i karrieren de offentlige stjerner (valueStars – sat ved vinduerne), ellers tier'ens
export function starsForValue(p) {
  if ((p.careerGames ?? 0) >= 3 && (p.valueStars ?? p.publicStars) > 0) return clamp(Math.round(p.valueStars ?? p.publicStars), 1, 5);
  return TIER_STARS[p.roleTier] ?? 2;
}
export const publicValue = (p) => Math.max(25000, round(VALUE_BY_STARS[starsForValue(p)] * ageFactor(p.age), 25000));
// Ugelønnen i hele 3.000 kr., så lønnen pr. runde (÷ 3) går op – ingen afrundingsstøj i regnskabet (Spilfører: "1.256.001 kr.")
export const publicWage = (p) => Math.max(3000, round(publicValue(p) * WAGE_SHARE, 3000));

// ---------- Navne (v3.18.0: unikke kortnavne i hele ligaen) ----------
export const FIRST_NAMES_EXTRA = ['Bastian', 'Daniel', 'Elias', 'Felix', 'Hjalte', 'Isak', 'Johan', 'Kristoffer', 'Laurits', 'Nicklas', 'Philip', 'Rune', 'Theo', 'Ulrik', 'Valdemar', 'Yusuf', 'Zakarias', 'Benjamin', 'Dennis', 'Hugo', 'Ida', 'Otto', 'Ruben', 'Tristan', 'Esben', 'Gabriel', 'Henrik', 'Lasse', 'Oskar', 'Vilhelm'];
export const LAST_NAMES_EXTRA = ['Frederiksen', 'Iversen', 'Henriksen', 'Svendsen', 'Mikkelsen', 'Overgaard', 'Bertelsen', 'Nygaard', 'Kjeldsen', 'Damgaard', 'Bisgaard', 'Højgaard', 'Bruun', 'Winther', 'Thygesen', 'Lindberg', 'Krogh', 'Skov', 'Brandt', 'Juhl', 'Vinther', 'Friis', 'Jeppesen', 'Ravn', 'Toft', 'Kragh', 'Beck', 'Søndergaard', 'Østergaard', 'Lassen'];
// Et kortnavn, der ikke er brugt i ligaen (used: Set af kortnavne). Fornavn og efternavn fra de udvidede lister.
export function drawUniqueName(rng, used, first, last) {
  const F = [...first, ...FIRST_NAMES_EXTRA], L = [...last, ...LAST_NAMES_EXTRA];
  for (let i = 0; i < 500; i++) {
    const f = F[Math.floor(rng.next() * F.length)], l = L[Math.floor(rng.next() * L.length)], s = `${f[0]}. ${l}`;
    if (!used.has(s)) { used.add(s); return { name: `${f} ${l}`, shortName: s }; }
  }
  // Udtømt (urealistisk) – et fornavnsforbogstav mere skiller dem
  for (const f of F) for (const l of L) { const s = `${f.slice(0, 2)}. ${l}`; if (!used.has(s)) { used.add(s); return { name: `${f} ${l}`, shortName: s }; } }
  return null;
}
// Gør alle kortnavne i ligaen unikke: den første (holdenes rækkefølge, dit hold først) beholder navnet, de senere får et nyt.
// Returnerer [{ id, from, to }] (til at rette tekster i en gemt liga). rng: en afledt rng – ikke ligaens.
export function uniquifyNames(teams, rng, first, last) {
  const order = [...teams.filter((t) => !t.isBot), ...teams.filter((t) => t.isBot)];
  const seen = new Set(), used = new Set(teams.flatMap((t) => t.squad.map((p) => p.shortName))), renamed = [];   // used: også de endnu ikke gennemgåede
  for (const t of order) for (const p of t.squad) {
    if (!seen.has(p.shortName)) { seen.add(p.shortName); continue; }
    const n = drawUniqueName(rng, used, first, last);
    if (!n) continue;
    renamed.push({ id: p.id, nr: p.shirtNumber, from: p.shortName, to: n.shortName });
    p.name = n.name; p.shortName = n.shortName; seen.add(n.shortName);
  }
  return renamed;
}

// ---------- Kamptruppen (v3.18.0): 11 startere + højst 7 på bænken; resten er reserver ----------
export const BENCH_SIZE = 7;
// Bænken – ÉT sted (QC B2: bane, regneark, Hvis-Så-vælgeren og motoren skal være enige). I truppens rækkefølge, uden startere.
// Højst 7 ikke-startere (18 spillere): alle – udtagelsen betyder først noget med en større trup.
export function matchBenchOf(team) {
  const on = new Set(team.tactics?.lineupSlots ?? []), cand = team.squad.filter((p) => !on.has(p.id));
  if (cand.length <= BENCH_SIZE || !Array.isArray(team.matchBench)) return cand.slice(0, BENCH_SIZE);
  const pickd = new Set(team.matchBench);
  return cand.filter((p) => pickd.has(p.id)).slice(0, BENCH_SIZE);
}
export const reservesOf = (team) => { const b = new Set(matchBenchOf(team).map((p) => p.id)), on = new Set(team.tactics?.lineupSlots ?? []); return team.squad.filter((p) => !on.has(p.id) && !b.has(p.id)); };
// Automatisk udtagelse uden rng og kun på offentlige data (QC B7 – en bots valg må ikke røbe skjulte evner): raske før skadede,
// 1 målmand og mindst 2 forsvarere, 2 midtbanespillere og 1 angriber, så de bedste efter stjerner/tier og friskhed.
// Med 7 eller færre ikke-startere er det dem alle (18 spillere: uændret fra før v3.18.0).
export function autoMatchBench(team) {
  const on = new Set(team.tactics.lineupSlots), cand = team.squad.filter((p) => !on.has(p.id));
  if (cand.length <= BENCH_SIZE) return (team.matchBench = cand.map((p) => p.id));
  const score = (p) => (p.injuryMatchesLeft > 0 ? -100 : 0) + starsForValue(p) * 10 + (p.freshness ?? 100) / 10;
  const best = (list) => list.slice().sort((a, b) => score(b) - score(a) || cand.indexOf(a) - cand.indexOf(b));
  const chosen = new Set();
  for (const [line, n] of [['GK', 1], ['DEF', 2], ['MID', 2], ['ATT', 1]]) for (const p of best(cand.filter((q) => q.line === line)).slice(0, n)) chosen.add(p.id);
  for (const p of best(cand)) { if (chosen.size >= BENCH_SIZE) break; chosen.add(p.id); }
  return (team.matchBench = cand.filter((p) => chosen.has(p.id)).map((p) => p.id));
}

// ---------- Kamphistorik (v3.18.0, spec §10.4 "kampstempel") ----------
// Én tupel pr. kamp: [sæson, sæsonens runde, hjemme-indeks, ude-indeks, hjemmemål, udemål, minutter, karakter, stjerner, mål, oplæg]
// (hold-indeks i league.teams – kompakt, ≈ 35 B). Karakteren (rt, plads 7) er privat: andre hold ser kun stjernerne (QC).
export const LOG = { S: 0, R: 1, H: 2, A: 3, HG: 4, AG: 5, MIN: 6, RT: 7, ST: 8, G: 9, AS: 10 };
export function logMatch(p, entry) { (p.matchLog ||= []).push(entry); if (p.matchLog.length > MATCH_LOG_CAP) p.matchLog.splice(0, p.matchLog.length - MATCH_LOG_CAP); }
// Stemplet: "[Runde 5 • Hjem 2-1 Ude • 90' • 7,4]" (dit hold) / "… • ★★★☆☆" (andre)
// En kamp fra en tidligere sæson får sæsonen med: "[Sæson 1, runde 14 • …]" (Spilfører: runde 1 og 14 stod uden sæson)
export function stampText(e, teams, own, season = e[LOG.S]) {
  const name = (i) => teams[i]?.name ?? '?', grade = own && e[LOG.RT] != null ? String(e[LOG.RT]).replace('.', ',') : '★'.repeat(e[LOG.ST] || 0) + '☆'.repeat(5 - (e[LOG.ST] || 0));
  return `[${e[LOG.S] !== season ? `Sæson ${e[LOG.S]}, runde` : 'Runde'} ${e[LOG.R]} • ${name(e[LOG.H])} ${e[LOG.HG]}-${e[LOG.AG]} ${name(e[LOG.A])} • ${e[LOG.MIN]}' • ${grade}]`;
}

// ---------- Træning pr. spiller (v3.18.0; spec §13 "fredagstræning" – brugerens valg: pr. spiller) ----------
// Fokus gælder, til det ændres (0 klik pr. runde – Spilfører). Fremgang (xp) pr. runde = rate · alder · plads til loftet;
// ved 1,0 stiger evnen +1. Prisen: friskhed (gulv 50) og en lille skaderisiko. Hvile giver friskhed. Kamp-xp: de spillede
// minutter til kædens nøgle-evner. Botterne træner Alsidig (fast pris – fokus kan ikke aflæses af friskheden, QC B7).
export const FOCUS = {
  GENERAL: { label: 'Alsidig', skills: null, rate: 0.03, fresh: -2, inj: 0.004 },   // skills null = kædens nøgle-evner
  STAMINA: { label: 'Kondition', skills: ['stamina'], rate: 0.12, fresh: -5, inj: 0.006 },
  TECH: { label: 'Teknik', skills: ['ballControl', 'passing'], rate: 0.07, fresh: -3, inj: 0.005 },
  FINISH: { label: 'Afslutning', skills: ['finishing'], rate: 0.12, fresh: -3, inj: 0.005 },
  DEFENCE: { label: 'Forsvar', skills: ['intercepting', 'positioning'], rate: 0.07, fresh: -3, inj: 0.005 },
  PHYSICAL: { label: 'Fysik', skills: ['pace', 'strength'], rate: 0.07, fresh: -4, inj: 0.007 },
  KEEPER: { label: 'Målmand', skills: ['goalkeeping'], rate: 0.12, fresh: -2, inj: 0.003, gkOnly: true },
  REST: { label: 'Hvile', skills: [], rate: 0, fresh: 4, inj: 0 },
};
export const MATCH_XP = 0.02, TRAIN_FRESH_FLOOR = 50, TRAIN_INJURY_MATCHES = [1, 2], PLAYED_RELIEF = 2;
export const ageTrain = (age) => (age <= 19 ? 1.5 : age <= 22 ? 1.2 : age <= 25 ? 1 : age <= 29 ? 0.6 : age <= 32 ? 0.35 : 0.2);
// Plads til loftet: nøgle-evnernes snit mod potentialet (0,1–1 – en spiller ved sit loft udvikler sig næsten ikke)
export const roomOf = (p) => clamp(((p.potential ?? keyAvg(p)) - keyAvg(p)) / 3, 0.1, 1);
export const focusSkills = (p, f = FOCUS[p.trainingFocus] ?? FOCUS.GENERAL) => f.skills ?? KEY_SKILLS[p.line];
export const validFocus = (p, key) => !!FOCUS[key] && (!FOCUS[key].gkOnly || p.line === 'GK');
// Fremgang i én evne (+xp); returnerer de evner, der steg (+1). onSkill: genberegning (luftduel, arketype – QC B4).
export function addXp(p, skill, xp, onSkill) {
  p.dev ||= {};
  p.dev[skill] = (p.dev[skill] ?? 0) + xp;
  const up = [];
  while (p.dev[skill] >= 1 && (p.skills[skill] ?? 0) < 20) { p.dev[skill] -= 1; p.skills[skill] += 1; up.push(skill); }
  if ((p.skills[skill] ?? 0) >= 20) p.dev[skill] = Math.min(p.dev[skill], 0.99);
  p.dev[skill] = Math.round(p.dev[skill] * 1000) / 1000;
  if (up.length) onSkill?.(p);
  return up;
}

// ---------- Økonomi (v3.18.0; brugerens valg: tilskuere + præmie − løn) ----------
// Pr. runde: TV-penge til alle, billetindtægt kun til hjemmeholdet, løn = ugeløn / 3 (1 uge = 3 runder). Præmie ved sæsonslut.
// Tilskuere efter de to holds placering FØR runden (runde 1–2: sidste sæsons slutplacering; ny liga 4,5) og hjemmeholdets
// form (point i de seneste 3 kampe). Alle tal er offentlige undtagen kassen og regnskabet (visibility.js, viewTeam).
export const ROUNDS_PER_WEEK = 3, TV_PER_ROUND = 120000, TICKET_PRICE = 90, GATE_BASE = 4000, GATE_MAX = 9000, LEDGER_CAP = 30;
export const PRIZE = [1500000, 1100000, 800000, 600000, 450000, 300000, 200000, 100000];
export const NEW_LEAGUE_PLACE = 4.5;
export const attendance = (placeHome, placeAway, form) => Math.min(GATE_MAX, Math.round(GATE_BASE + 300 * (8 - placeHome) + 150 * (8 - placeAway) + 120 * form));
export const weeklyWages = (team) => team.squad.reduce((a, p) => a + (p.weeklyWage ?? 0), 0);
export const wagesPerRound = (team) => Math.round(weeklyWages(team) / ROUNDS_PER_WEEK);
// Lønbudget pr. uge: 1,7 mio. + 2 % af kassen – "Du kan bruge X kr. mere pr. runde". 1,35 mio. lå under lønnen efter
// genforhandlingen hos de fleste hold (1,0–2,2 mio.), så ingen kunne købe uden at sælge (e2e, sæsonslut)
export const WAGE_BUDGET_BASE = 1700000;
export const wageBudget = (team) => WAGE_BUDGET_BASE + 0.02 * Math.max(0, team.cashBalance ?? 0);
export const wageRoomPerRound = (team) => Math.round((wageBudget(team) - weeklyWages(team)) / ROUNDS_PER_WEEK);
export const formOf = (team) => (team.finance?.form ?? []).reduce((a, b) => a + b, 0);
// Én linje i regnskabet pr. runde; præmien lægges på sæsonens sidste rundes linje
export function bookLedger(team, entry) {
  const f = (team.finance ||= { ledger: [], season: {} });
  const net = (entry.gate ?? 0) + (entry.tv ?? 0) + (entry.wages ?? 0) + (entry.prize ?? 0) + (entry.transfers ?? 0);
  team.cashBalance = (team.cashBalance ?? 0) + net;
  for (const k of ['gate', 'tv', 'wages', 'prize', 'transfers']) if (entry[k]) f.season[k] = (f.season[k] ?? 0) + entry[k];
  const last = f.ledger.at(-1);
  if (last && last.r === entry.r) { for (const k of ['gate', 'tv', 'wages', 'prize', 'transfers']) if (entry[k]) last[k] = (last[k] ?? 0) + entry[k]; last.cash = team.cashBalance; }
  else { f.ledger.push({ ...entry, cash: team.cashBalance }); if (f.ledger.length > LEDGER_CAP) f.ledger.splice(0, f.ledger.length - LEDGER_CAP); }
}

// ---------- Sæsonskiftet (v3.18.0; brugerens valg: +1 år pr. sæson) ----------
// Pension: fra 31 år (MV 33) med stigende sandsynlighed (¼, ½, ¾), sikker ved 34 (MV 36) – measure-lifecycle: snitalder 23–26. Afgjort af en afledt rng pr. spiller og sæson,
// så varslet fra runde 10 ("overvejer at stoppe") og udfaldet ved sæsonslut er det samme.
export const RETIRE_FROM = { field: 31, GK: 33 }, RETIRE_SURE = { field: 34, GK: 36 }, RETIRE_WARN_ROUND = 10, RETIRED_CAP = 40;
export function retireChance(p) {
  const k = p.line === 'GK' ? 'GK' : 'field';
  return p.age >= RETIRE_SURE[k] ? 1 : p.age >= RETIRE_FROM[k] ? (p.age - RETIRE_FROM[k] + 1) / (RETIRE_SURE[k] - RETIRE_FROM[k] + 1) : 0;
}
export const willRetire = (p, season) => { const c = retireChance(p); return c >= 1 || (c > 0 && derivedRng('retire', season, p.id).next() < c); };
// Aldersfald fra 30 år (MV 32): fart og kondition først, positionering og pasning sidst. Træning halverer faldet i de trænede evner.
export const DECLINE_FROM = { field: 30, GK: 32 };
export const DECLINE = [[['pace', 'stamina'], 0.35, 0.15], [['strength', 'ballControl', 'finishing', 'intercepting', 'goalkeeping'], 0.2, 0.1], [['positioning', 'passing'], 0.08, 0.07]];
export function declineSkills(p, season, trained = new Set()) {
  const from = DECLINE_FROM[p.line === 'GK' ? 'GK' : 'field'];
  if (p.age < from) return [];
  const r = derivedRng('decline', season, p.id), y = p.age - from, fell = [];
  for (const [skills, base, step] of DECLINE) for (const s of skills) {
    const c = Math.min(0.9, base + step * y) * (trained.has(s) ? 0.5 : 1);
    if (r.next() < c && p.skills[s] > 1) { p.skills[s] -= 1; fell.push(s); }
  }
  return fell;
}
// Vækst ved sæsonslut for de unge (til og med 23 år): alder · plads til loftet · brug (60 % + 40 % efter sæsonens kampe)
export const GROW_BY_AGE = (age) => (age <= 19 ? 1.2 : age <= 21 ? 0.9 : age <= 23 ? 0.5 : 0);
export function seasonGrowth(p, season, onSkill) {
  const g = GROW_BY_AGE(p.age);
  if (!g) return [];
  const use = Math.min(1, (p.matchLog ?? []).filter((e) => e[LOG.S] === season).length / 14), room = roomOf(p);
  return KEY_SKILLS[p.line].flatMap((s) => addXp(p, s, g * room * (0.6 + 0.4 * use), onSkill));
}
// De evner, spilleren har trænet (Hvile: ingen; botterne: Alsidig)
export const trainedSkills = (p, isBot) => {
  const key = isBot || !validFocus(p, p.trainingFocus) ? 'GENERAL' : p.trainingFocus;
  return new Set(key === 'REST' ? [] : focusSkills(p, FOCUS[key]));
};
// Værdien ved vinduerne: stjernerne glattes som snit af de seneste 5 kampe med stjerner (mindst 3) – ellers uændret
export function refreshValue(p) {
  const st = (p.matchLog ?? []).map((e) => e[LOG.ST]).filter((s) => s > 0).slice(-5);
  if (st.length >= 3) p.valueStars = Math.round((st.reduce((a, b) => a + b, 0) / st.length) * 10) / 10;
}
// Ungdom: 2 tilbud pr. hold. Rygnummer: laveste ledige fra 19.
export const YOUTH_OFFERS = 2, SQUAD_MIN = 18, SQUAD_MAX = 25, LINE_MIN = { GK: 2, DEF: 6, MID: 6, ATT: 3 };
export function freeShirt(team, extra = []) {
  const used = new Set([...team.squad, ...extra].map((p) => p.shirtNumber));
  for (let n = 19; n < 100; n++) if (!used.has(n)) return n;
  for (let n = 1; n < 19; n++) if (!used.has(n)) return n;
  return 99;
}
// Den kæde, der mangler mest i forhold til minimum (de stoppede kæder først)
export function neededLine(team, extra = [], prefer = []) {
  const count = (l) => [...team.squad, ...extra].filter((p) => p.line === l).length;
  for (const l of prefer) if (count(l) < LINE_MIN[l]) return l;
  return Object.keys(LINE_MIN).sort((a, b) => count(a) / LINE_MIN[a] - count(b) / LINE_MIN[b])[0];
}
// Botternes optag – kun offentlige data (QC B7): under 20 begge (under 18 fyldes op), under 22 ét tilbud, ellers intet
export const botYouthTake = (squadSize, offers) => (squadSize < 20 ? offers : squadSize < 22 ? offers.slice(0, 1) : []);

// Reparér opstillingen efter afgange (QC B3): den tomme plads får en fra samme kæde (raske, stjerner, friskhed – offentligt),
// Hvis-Så-skift med en spiller, der er væk, ryddes (alle planer), og bænk og transferliste følger truppen.
const pubScore = (p) => (p.injuryMatchesLeft > 0 ? -100 : 0) + starsForValue(p) * 10 + (p.freshness ?? 100) / 10;
export function repairLineup(team, goneLine = new Map()) {
  const ids = new Set(team.squad.map((p) => p.id)), slots = team.tactics.lineupSlots;
  let changed = false;
  slots.forEach((id, i) => {
    if (ids.has(id)) return;
    const on = new Set(slots), free = team.squad.filter((p) => !on.has(p.id));
    const line = i === 0 ? 'GK' : goneLine.get(id) ?? null;
    const pool = free.filter((p) => (line ? p.line === line : p.line !== 'GK'));
    const best = [pool, free.filter((p) => (i === 0) === (p.line === 'GK')), free].find((l) => l.length) ?? [];
    const pick = best.sort((a, b) => pubScore(b) - pubScore(a))[0];
    if (pick) { slots[i] = pick.id; changed = true; }
  });
  for (const t of [team.tactics, ...(team.tacticPresets ?? [])]) for (const r of t.conditionalRules ?? []) {
    if (r.subOut != null && !ids.has(r.subOut)) r.subOut = null;
    if (r.subIn != null && !ids.has(r.subIn)) r.subIn = null;
  }
  for (const t of team.tacticPresets ?? []) t.lineupSlots = slots.slice();
  const on = new Set(slots);
  team.matchBench = (team.matchBench ?? []).filter((id) => ids.has(id) && !on.has(id));
  if (team.matchBenchAuto !== false || team.isBot) autoMatchBench(team);
  else {
    const cand = team.squad.filter((p) => !on.has(p.id) && !team.matchBench.includes(p.id)).sort((a, b) => pubScore(b) - pubScore(a));
    while (team.matchBench.length < BENCH_SIZE && cand.length) team.matchBench.push(cand.shift().id);
  }
  team.listed = (team.listed ?? []).filter((id) => ids.has(id));
  return changed;
}
