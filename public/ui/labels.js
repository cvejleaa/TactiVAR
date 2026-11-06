import { FIT, ROLE_LABEL, roleLabel } from '../engine/formations.js';
// Pladskoderne (v3.31.2): tabellen står i formations.js (motoren bruger den i referatet) – her videre til brugerfladen
export { ROLE_LABEL, roleLabel };
import { BAN, FOCUS, skillOf, focusOfSkill, validFocus, trainingEstimate } from '../engine/career.js';
import { ARCHETYPES } from '../engine/generator.js';
// Danske visningsnavne for motorens værdier.
// Tilskuerne på en kamp (v3.30.0, match.att – offentligt): "👥 7.840". Ældre kampe uden tallet viser intet (null), aldrig "undefined"/0.
export const attText = (m) => (Number.isInteger(m?.att) && m.att > 0 ? `👥 ${m.att.toLocaleString('da-DK')}` : null);
export const LINE = { GK: 'MÅL', DEF: 'FOR', MID: 'MID', ATT: 'ANG' };
// Naturlig position (v3.8) med tavlens ord; den fulde betegnelse står i title.
// v3.31.2: CB → MS (ellers "MS" som plads og "CB" som position i samme række)
export const POSITION = { GK: 'MV', CB: 'MS', FB: 'Back', DM: 'DM', CM: 'CM', WM: 'Kant', AM: 'OM', ST: 'ANG' };
// v3.31.1 (brugeren: danske positionskoder): parentesen er den korte form fra POSITION – ikke CDM/CAM/ST
export const POSITION_FULL = { GK: 'Målmand', CB: 'Midtstopper (MS)', FB: 'Back/kantback (dybe kantpladser)', DM: 'Defensiv midtbane (DM)', CM: 'Central midtbane (CM)', WM: 'Kant (høje kantpladser)', AM: 'Offensiv midtbane (OM)', ST: 'Angriber (ANG)' };
// Særpræget, som det vises (v3.31.1): navn og beskrivelse fra ARCHETYPES efter id – spillerens gemte kopi kan have det gamle engelske navn.
// Låst op og kravene er spillerens egne. Et ukendt id viser kopien.
const ARCH_BY_ID = Object.fromEntries(Object.values(ARCHETYPES).flat().map((a) => [a.id, a]));
export const archetypeOf = (a) => (a ? { ...a, name: ARCH_BY_ID[a.id]?.name ?? a.name, description: ARCH_BY_ID[a.id]?.description ?? a.description } : null);
// Arketypens mærke (v3.31.2 – ét sted for kortet, Trup og Taktik): 🌟 låst op / 🔒 låst, og kravene med evnernes danske navne. a = archetypeOf(...)
export const archIcon = (a) => (a.isUnlocked ? '🌟' : '🔒');
// Kravteksten (v3.32.0, backlog 0c – brugeren: "jeg kan ikke se hans jumpingpower … og hvordan jeg kan træne ham i det"): for
// ejerens spiller p nu/krav pr. evne, ✓ ved opfyldt, og for det, der mangler, hvilket fokus der træner det – fx
// "Låses op ved: Styrke 13/13 ✓ · Spring 13/14 – trænes med Fysik". Træner han fokusset i forvejen: "(det gør han nu; …)" med
// skønnet for næste +1 (trainingEstimate – går det langsomt, står hvorfor). To mangler med samme fokus: "– begge trænes med Fysik".
// KUN ejerens spiller (evnerne er private – vagterne i card.js, lineup-list.js og matrix.js). Uden p: kun kravene.
export const archReqText = (a, p = null, starter = false) => {   // QC v3.32.0: starter = samme skøn som kortets træningsboks
  const da = Object.fromEntries(SKILL_LABELS.flatMap(([, list]) => list));   // SKILL_LABELS står længere nede
  const req = Object.entries(a.unlockReq ?? {});
  if (!p) return 'Låses op ved: ' + req.map(([k, v]) => `${da[k] ?? k} ${v}`).join(', ');
  const items = req.map(([k, v]) => { const now = skillOf(p, k) ?? 0; return { k, v, now, ok: now >= v, focus: focusOfSkill(k) }; });
  const miss = items.filter((i) => !i.ok);
  const shared = miss.length >= 2 && miss.every((i) => i.focus && i.focus === miss[0].focus) ? miss[0].focus : null;
  const cur = validFocus(p, p.trainingFocus) ? p.trainingFocus : 'GENERAL';
  const hint = (focus, skills, many = '') => {
    if (!focus) return '';
    let now = '';
    if (cur === focus) {
      const e = trainingEstimate(p, starter), n = Math.min(...e.lines.filter((l) => skills.includes(l.skill)).map((l) => l.n ?? Infinity));
      now = ` (det gør han nu${n === Infinity ? '' : n > 14 ? `; går langsomt${e.why === 'fokus og alder' ? '' : ` – ${e.why}`}` : `; næste +1 om ca. ${n} runde${n === 1 ? '' : 'r'}`})`;
    }
    return ` – ${many}trænes med ${FOCUS[focus].label}${now}`;
  };
  const parts = items.map((i) => `${da[i.k] ?? i.k} ${i.now}/${i.v}${i.ok ? ' ✓' : shared ? '' : hint(i.focus, [i.k])}`);
  return 'Låses op ved: ' + parts.join(' · ') + (shared ? hint(shared, miss.map((i) => i.k), miss.length === 2 ? 'begge ' : 'alle ') : '');
};

export const PHASE_OPTIONS = {
  passingStyle: [['SHORT', 'Korte pasninger'], ['BALANCED', 'Balanceret'], ['DIRECT_LONG', 'Direkte lange bolde']],
  attackFocus: [['CENTRAL', 'Centralt'], ['HIGH_CROSSES', 'Høje indlæg'], ['LOW_CUTBACKS', 'Lave cutbacks']],
  offBallRuns: [['FEW', 'Få'], ['NORMAL', 'Normal'], ['MANY', 'Mange']],
  attackSide: [['LEFT', `Venstre (${ROLE_LABEL.LW}/${ROLE_LABEL.LB})`], ['BOTH', 'Begge'], ['RIGHT', `Højre (${ROLE_LABEL.RW}/${ROLE_LABEL.RB})`]],   // v3.26.0 (nr. 39) – set fra jeres eget hold
  pressingHeight: [['LOW_BLOCK', 'Lav blok'], ['MID_BLOCK', 'Mellemblok'], ['HIGH_GEGENPRESS', 'Højt gegenpres']],
  offsideTrap: [['OFF', 'Ingen offside-fælde'], ['NORMAL', 'Normal linje'], ['EXTREME_VAR_LINE', 'Ekstrem VAR-linje']],
  tacklingIntensity: [['CAUTIOUS', 'Forsigtig'], ['NORMAL', 'Normal'], ['AGGRESSIVE', 'Aggressiv']],
  onBallWon: [['FAST_COUNTER', 'Lynkontra'], ['KEEP_POSSESSION', 'Hold på bolden']],
  onBallLost: [['COUNTER_PRESS_5S', 'Genpres i 5 sek.'], ['DROP_BACK', 'Fald tilbage']],
};
export const CONDITIONS = [['TRAILING', 'Bagud med mindst'], ['LEADING', 'Foran med mindst'], ['DRAW', 'Uafgjort'], ['ANY', 'Uanset stilling']];
export const MARGINS = [1, 2, 3, 4, 5].map((n) => [String(n), `${n} mål`]);
export const SKILL_LABELS = [
  ['Fysik & luft', [['pace', 'Fart'], ['stamina', 'Udholdenhed'], ['strength', 'Styrke'], ['jumpingPower', 'Spring']]],   // Spring: p.jumpingPower (career.js skillOf)
  ['Teknik', [['ballControl', 'Boldkontrol'], ['passing', 'Pasning'], ['finishing', 'Afslutning']]],
  ['Taktik & defensiv', [['positioning', 'Positionering'], ['intercepting', 'Erobring'], ['goalkeeping', 'Målmandsspil']]],
];
export const stars = (n) => (n > 0 ? '★'.repeat(n) + '☆'.repeat(5 - n) : '–');
// Samme tekst som stars(), men udfyldte stjerner i guld og tomme dæmpet, så de kan læses.
export function starsEl(n) {
  const el = document.createElement('span');
  el.className = 'stars';
  el.title = n > 0 ? `${n} af 5 stjerner` : 'Ingen kampe endnu';
  if (!(n > 0)) { el.textContent = '–'; return el; }
  const on = document.createElement('span'); on.className = 'star-on'; on.textContent = '★'.repeat(n);
  const off = document.createElement('span'); off.className = 'star-off'; off.textContent = '☆'.repeat(5 - n);
  el.append(on, off);
  return el;
}
export const kr = (n) => n.toLocaleString('da-DK') + ' kr.';

// Uden for position (v3.20.0): prisen regnes fra tabellen (formations.js FIT) – aldrig skrevet ind som tal i en tekst
export const fitCost = (f) => `−${String(Math.round((1 - f) * 1000) / 10).replace('.', ',')} %`;
export const FIT_HELP = `Uden for position: egen plads 100 %, naboplads (fx DM på CM, back på kant) ${fitCost(FIT.near)}, anden markplads ${fitCost(FIT.other)}, målmand ⇄ markspiller ${fitCost(FIT.keeper)} – i dueller, afslutninger, pres og løb (ikke boldbesiddelsen). Pladsen følger dybden – spilleren gør ikke. Kantpladser (${['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM'].map(roleLabel).join('/')}): højt en kant-plads, dybt en back-plads. Midten (${['CDM', 'CM', 'CAM'].map(roleLabel).join('/')}): dybt en DM-plads, i midten en CM-plads, højt en OM-plads. Imellem passer begge; trækker du en spiller, følger prisen med (på midten også rollen: "CM→DM").`;

// Udelukkelse (v3.27.0, nr. 64): ét sted for ord og tegn. ⛔ – ikke 🟥, som i karakterarket betyder "udvist i kampen" (QC).
export const BAN_WHY = { DIRECT: 'direkte rødt kort', SECOND_YELLOW: 'rødt kort for to gule', YELLOWS: `${BAN.YELLOW_EVERY}. gule kort i sæsonen` };
const kampe = (n) => `${n} kamp${n === 1 ? '' : 'e'}`;
// Kort tegn til lister og banen: "🚑 2", "⛔ 1" eller begge. Tom streng = spilleklar.
export const outLabel = (p) => [p.injuryMatchesLeft > 0 ? `🚑 ${p.injuryMatchesLeft}` : '', p.banMatches > 0 ? `⛔ ${p.banMatches}` : ''].filter(Boolean).join(' · ');
export const banText = (p) => (p.banMatches > 0 ? `⛔ udelukket i ${kampe(p.banMatches)}${BAN_WHY[p.banWhy] ? ` (${BAN_WHY[p.banWhy]})` : ''}` : '');
// Advarslen før det tællende gule kort: "🟨 3 – næste gule kort giver 1 kamps udelukkelse"
export const yellowWarn = (p) => ((p.banYellows ?? 0) % BAN.YELLOW_EVERY === BAN.YELLOW_EVERY - 1 ? `🟨 ${p.banYellows} – næste gule kort giver 1 kamps udelukkelse` : '');
export const OUT_TITLE = `🚑 = skadet, ⛔ = udelukket (antal kampe). Udelukket: direkte rødt ${kampe(BAN.DIRECT)}, rødt for to gule ${kampe(BAN.SECOND_YELLOW)}, hvert ${BAN.YELLOW_EVERY}. gule kort i sæsonen 1 kamp`;
