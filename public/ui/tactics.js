// Formation, Plan A/B/C, de tre kampfaser og Hvis-Så-reglerne (docs/spec.md §4).
import { h, select, help as help_ } from './dom.js';
import { PHASE_OPTIONS, CONDITIONS, MARGINS, POSITION } from './labels.js';
import { FORMATION_NAMES, FORMATIONS, lineOfRole } from '../engine/formations.js';
// "5 på midten · mere bold" (v3.25.0, nr. 38): formationens midtbanepladser efter ankrets dybde – samme tælling som motoren
export const midCountOf = (f) => (FORMATIONS[f] || FORMATIONS['4-4-2']).filter((c, i) => i > 0 && lineOfRole(c.r, c.y) === 'MID').length;
const midCountText = (f) => { const n = midCountOf(f); return `${n} på midten · ${n >= 5 ? 'mere bold' : n <= 3 ? 'mindre bold' : 'normal boldbesiddelse'}`; };
import { matchBenchOf } from '../engine/career.js';
import { MAX_RULES } from '../state/actions.js';
import { MATCH_RULES } from '../engine/match-rules.js';
import { SUBS_LIMIT } from '../engine/freshness.js';
import { SIDE } from '../engine/match.js';

const PHASES = [
  ['phase1_buildUp', 'Fase 1 – Opbygning & indlæg', [['passingStyle', 'Pasningsstil'], ['attackFocus', 'Angrebsfokus'], ['attackSide', 'Angrebsside'], ['offBallRuns', 'Løb uden bold']],
    `Angrebsfokus bestemmer, hvordan chancerne kommer: høje indlæg til den, der står i feltet, lave cutbacks fra baglinjen, eller centralt gennem løb og afslutninger. Pasningsstil bestemmer, hvordan bolden kommer frem (direkte lange bolde giver også nogle høje bolde, når fokus ikke er høje indlæg). Løb uden bold: Mange – flere spillere løber sig fri og kommer med ind i feltet (også midtbane, backs og wingbacks), men holdet står ubalanceret, når bolden tabes, og løber flere km. Få – færre løb fremad, færre kontraer imod og mindre slid. ` + `Angrebsside: hvor jeres indlæg og cutbacks kommer fra (ikke de centrale angreb) – en lille fordel, ca. ét styret kantangreb pr. kamp, og mest ved Lave cutbacks. Begge: lidt oftere dér, hvor jeres kant står stærkest mod deres back. Venstre/Højre: ca. ${Math.round(SIDE.CHOICE * 4)} af 4 kantangreb dér – også når den anden side var bedre; ved cutbacks læser deres back på den side det. Målt: Begge finder selv en svag back – et fast valg er højst lige så godt, så brug det kun, når du vil styre siden.`],
  ['phase2_defending', 'Fase 2 – Pres, offside & tacklinger', [['pressingHeight', 'Pres'], ['offsideTrap', 'Offside-fælde'], ['tacklingIntensity', 'Tacklinger']],
    'Pres og feltet: lav blok fylder feltet og vinder flere luftdueller mod indlæg, men giver plads til cutbacks; højt gegenpres lukker kanten, før den når baglinjen. Tacklinger: Aggressiv vinder flere dueller i presset, men begår flere frispark og får flere gule kort (hvert 4. gule kort i sæsonen giver 1 kamps udelukkelse) – Forsigtig omvendt.'],
  ['phase3_transition', 'Fase 3 – De første 5 sekunder', [['onBallWon', 'Ved erobring'], ['onBallLost', 'Ved boldtab']],
    'Ved erobring: Lynkontra giver flere kontraer, når I vinder bolden; Hold på bolden giver færre, men styrker jeres næste opbygning. Ved boldtab: Genpres dæmper modstanderens kontraer, men koster løb (friskhed); Fald tilbage koster intet.'],
];

// v3.32.1 (R1, designkritikken: "forklaringstekst kvæler kontrollerne"): én kort linje pr. fase synlig (QC: ca. 70 tegn – målt i Chromium står
// højst ca. 48 tegn på én linje ved 390 px, så de er kortere), den lange forklaring bag "ⓘ Sådan virker det" (ui/dom.js help – husker åben/lukket over gentegning)
export const PHASE_SHORT = {
  phase1_buildUp: 'Fokus giver chancetypen, løb flere i feltet',
  phase2_defending: 'Pres styrer feltet; hårde tacklinger giver kort',
  phase3_transition: 'Lynkontra: flere kontraer · genpres: mere slid',
};
export const RULES_SHORT = 'Skift plan, formation eller spiller undervejs';
const PHASE_NAME = { phase1_buildUp: 'Fase 1', phase2_defending: 'Fase 2', phase3_transition: 'Fase 3' };
const PLAN_NAMES = ['Plan A', 'Plan B', 'Plan C'];

export function renderTactics({ team, isOwn, ui, on }) {
  const t = team.tactics;
  const disabled = !isOwn;
  const formations = FORMATION_NAMES.map((f) => [f, f]);
  // Mål for et Hvis-Så-skift: en af dine planer, en formation eller (v3.13) en udskiftning.
  const targetOf = (r) => (r.action === 'SUB' ? 'sub:' : Number.isInteger(r.newPlan) ? `plan:${r.newPlan}` : `form:${r.newFormation}`);
  const targetSelect = (r, i) => h('select', { class: 'rule-target', disabled, onchange: (e) => {
    const [kind, v] = e.target.value.split(':');
    on.rule(i, kind === 'sub' ? { action: 'SUB', newPlan: null } : kind === 'plan' ? { action: 'SHIFT', newPlan: Number(v) } : { action: 'SHIFT', newPlan: null, newFormation: v });
  } },
  h('option', { value: 'sub:', selected: targetOf(r) === 'sub:' }, '🔄 Udskiftning'),
  h('optgroup', { label: 'Dine planer' }, PLAN_NAMES.map((n, p) => h('option', { value: `plan:${p}`, selected: targetOf(r) === `plan:${p}` },
    `${n} (${team.tacticPresets[p]?.baseFormation ?? '?'})${p === ui.activePresetIndex ? ' – aktiv nu' : ''}`))),
  h('optgroup', { label: 'Kun formation' }, formations.map(([f]) => h('option', { value: `form:${f}`, selected: targetOf(r) === `form:${f}` }, f))));
  // Udskiftning i en regel: spiller ud (fra startopstillingen) og ind (fra bænken), angivet med id, så det følger
  // spilleren, ikke pladsen. En advarsel står straks, hvis reglen ikke længere passer til opstillingen (Spilfører).
  const nameOf = (p) => { const pos = POSITION[p.position] ?? p.line; return `#${p.shirtNumber} ${p.shortName}${pos ? ` (${pos})` : ''}`; };   // v3.20.0: positionen – indskifteren overtager pladsen
  const starters = t.lineupSlots.map((id) => team.squad.find((p) => p.id === id)).filter(Boolean);
  const benchPl = matchBenchOf(team);   // v3.18.0: kun kamptruppens bænk kan skiftes ind
  const subPicker = (r, i) => {
    const warn = [r.subOut && !t.lineupSlots.includes(r.subOut) ? `${nameOf(team.squad.find((p) => p.id === r.subOut) ?? { shirtNumber: '?', shortName: 'spilleren' })} står ikke i startopstillingen` : '',
      r.subIn && t.lineupSlots.includes(r.subIn) ? `${nameOf(team.squad.find((p) => p.id === r.subIn))} står ikke på bænken` : '',
      // v3.18.0 (QC): en reserve er ikke i kamptruppen – skiftet kan ikke ske, før han er udtaget til bænken
      r.subIn && !t.lineupSlots.includes(r.subIn) && !benchPl.some((p) => p.id === r.subIn) && team.squad.some((p) => p.id === r.subIn) ? `${nameOf(team.squad.find((p) => p.id === r.subIn))} er reserve – udtag ham til bænken i spillerlisten` : '',
      !r.subOut || !r.subIn ? 'vælg begge spillere' : ''].filter(Boolean);
    return h('span', { class: 'rule-sub' },
      select(r.subOut ?? '', [['', 'ud: vælg'], ...starters.slice(1).map((p) => [p.id, `ud: ${nameOf(p)}`])], (v) => on.rule(i, { subOut: v || null }), { disabled, class: 'rule-sub-out' }),
      ' ⇄ ',
      select(r.subIn ?? '', [['', 'ind: vælg'], ...benchPl.map((p) => [p.id, `ind: ${nameOf(p)}`])], (v) => on.rule(i, { subIn: v || null }), { disabled, class: 'rule-sub-in' }),
      warn.length ? h('span', { class: 'rule-warn' }, ` ⚠ ${warn.join('; ')}`) : null);
  };
  return h('div', { class: 'panel tactics' + (isOwn ? '' : ' readonly'), id: 'tactics' },
    h('div', { class: 'row' },
      h('label', {}, 'Formation ', select(t.baseFormation, formations, on.formation, { id: 'formation', disabled })),
      // v3.25.0 (nr. 38): antallet på midten afgør boldbesiddelsen – vist ved formationen, hvor valget tages
      h('span', { class: 'muted', id: 'mid-count', title: 'Midtbanen vinder bolden: flere på midten giver mere besiddelse (aftagende – den femte giver mindre end den fjerde), men færre i forsvar eller angreb. Spillernes aflevering og boldkontrol tæller også – men forskellen mellem holdene har et loft, så ingen kamp bliver ensidig.' }, midCountText(t.baseFormation)),
      isOwn ? h('div', { class: 'presets' }, ['Plan A', 'Plan B', 'Plan C'].map((l, i) => h('button', { class: 'mini' + (ui.activePresetIndex === i ? ' active' : ''), onclick: () => on.preset(i) }, l + (ui.activePresetIndex === i ? ' (aktiv)' : '')))) : null,
      isOwn ? h('button', { class: 'mini', id: 'reset-drag', onclick: on.resetDrag }, '↺ Nulstil træk') : null,
      isOwn ? h('button', { class: 'mini', id: 'arrange-lineup', disabled, title: 'Flyt de 11 på banen rundt, så flest står på deres naturlige position – ingen kommer ind eller ud. Sker også selv, når du skifter formation.', onclick: on.arrange }, '⇄ Stil op efter position') : null),
    !isOwn ? h('div', { class: 'lockbox' }, 'Du ser kun modstanderens startopstilling. 🔒 Deres faser, planer, Hvis-Så-regler og udskiftningsgrænse er skjulte.') : null,
    !isOwn ? null : PHASES.map(([phase, title, fields, help]) => h('fieldset', { class: 'phase', dataset: { phase } }, h('legend', {}, title),
      fields.map(([f, label]) => h('label', {}, label + ' ', select(t.phases[phase][f], PHASE_OPTIONS[f], (v) => on.phase(phase, f, v), { disabled, dataset: { field: f } }))),
      help ? help_({ id: `help-${phase}`, short: PHASE_SHORT[phase], label: `Sådan virker ${PHASE_NAME[phase]}`, long: h('p', { class: 'muted phase-help' }, help) }) : null)),
    !isOwn ? null : h('fieldset', { class: 'phase rules', id: 'rules' }, h('legend', {}, `Hvis-Så-regler (maks ${MAX_RULES}, hver udløses højst én gang pr. kamp)`),
      t.conditionalRules.map((r, i) => h('div', { class: 'rule' },
        'Fra minut ', h('input', { type: 'number', min: 1, max: 89, value: String(r.minuteTrigger), disabled, onchange: (e) => on.rule(i, { minuteTrigger: Math.max(1, Math.min(89, Number(e.target.value) || 1)) }) }),
        ' hvis ', select(r.condition, CONDITIONS, (v) => on.rule(i, { condition: v }), { disabled, class: 'rule-cond' }),
        r.condition === 'DRAW' || r.condition === 'ANY' ? null : select(String(r.margin || 1), MARGINS, (v) => on.rule(i, { margin: Number(v) }), { disabled, class: 'rule-margin' }),
        ' → ', targetSelect(r, i),
        r.action === 'SUB' ? subPicker(r, i) : null,
        isOwn ? h('button', { class: 'mini', title: 'Slet regel', onclick: () => on.removeRule(i) }, '✕') : null)),
      isOwn && t.conditionalRules.length < MAX_RULES ? h('button', { class: 'mini', id: 'add-rule', onclick: on.addRule }, '+ Tilføj regel') : null,
      help_({ id: 'help-rules', short: RULES_SHORT, label: 'Sådan virker Hvis-Så-reglerne', long: h('div', { class: 'muted help rules-help' }, 'Skift til en plan eller formation tager formationen (og planens trukne positioner og faser) med – de 11 på banen fordeles efter deres naturlige position, og det er DISSE regler, der gælder resten af kampen (planens egne Hvis-Så-regler bruges ikke midt i en kamp). En udskiftning: indskifteren overtager pladsen; den sker i første tick fra minuttet (der spilles i 3-minutters ryk), tæller med i udskiftningerne og pauserne, og bænkspilleren bruges ikke til træthedsskift. Reglerne hører til planen – skifter du plan, gælder den plans regler.') })),
    // Udskiftninger under kampen (v3.13): holdets grænse – gælder alle planer, hele kampen.
    !isOwn ? null : h('fieldset', { class: 'phase subs', id: 'subs' }, h('legend', {}, 'Udskiftninger under kampen'),
      h('label', {}, 'Skift en træt spiller ud, når hans friskhed i kampen er under ',
        select(String(team.subsLimit ?? 0), [['0', 'Fra – kun skadesskift'], ...Array.from({ length: (SUBS_LIMIT.max - SUBS_LIMIT.min) / 5 + 1 }, (_, i) => SUBS_LIMIT.min + i * 5).map((v) => [String(v), `${v} %`])], (v) => on.subs(Number(v)), { id: 'subs-limit', disabled })),
      help_({ id: 'help-subs', short: `Træt spiller ud under grænsen · højst ${MATCH_RULES.maxSubs} skift`, label: 'Sådan virker udskiftningerne',
        long: h('p', { class: 'muted subs-help', id: 'subs-help' }, `Friskheden falder i løbet af kampen efter pladsens løb, dit pres og spillerens udholdenhed (STA): en central midtbane med STA 6 taber ca. 20 point på 90 minutter, med STA 10 ca. 16, med STA 16 ca. 11 – og en træt spiller yder mindre (20 tabte point ≈ 12 % svagere). Eksempel: en midtbane med STA 10, der starter på 80 %, rammer 70 % efter ca. 55 minutter. Grænsen gælder i hele kampen og for alle planer; der skiftes ind fra bænken i samme kæde. Bruges en pause, tages også dem med, der er tæt på grænsen. Reglerne: højst ${MATCH_RULES.maxSubs} udskiftninger i højst ${MATCH_RULES.maxWindows} pauser (halvlegen tæller ikke) – skadesskift tæller med. Målmanden skiftes kun ved skade.`) })));
}
