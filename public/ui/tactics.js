// Formation, Plan A/B/C, de tre kampfaser og Hvis-Så-reglerne (docs/spec.md §4).
import { h, select } from './dom.js';
import { PHASE_OPTIONS, CONDITIONS, MARGINS } from './labels.js';
import { FORMATION_NAMES } from '../engine/formations.js';
import { MAX_RULES } from '../state/actions.js';

const PHASES = [
  ['phase1_buildUp', 'Fase 1 – Opbygning & indlæg', [['passingStyle', 'Pasningsstil'], ['attackFocus', 'Angrebsfokus']]],
  ['phase2_defending', 'Fase 2 – Pres, offside & tacklinger', [['pressingHeight', 'Pres'], ['offsideTrap', 'Offside-fælde'], ['tacklingIntensity', 'Tacklinger']]],
  ['phase3_transition', 'Fase 3 – De første 5 sekunder', [['onBallWon', 'Ved erobring'], ['onBallLost', 'Ved boldtab']]],
];

const PLAN_NAMES = ['Plan A', 'Plan B', 'Plan C'];

export function renderTactics({ team, isOwn, ui, on }) {
  const t = team.tactics;
  const disabled = !isOwn;
  const formations = FORMATION_NAMES.map((f) => [f, f]);
  // Mål for et Hvis-Så-skift: en af dine planer eller en formation.
  const targetOf = (r) => (Number.isInteger(r.newPlan) ? `plan:${r.newPlan}` : `form:${r.newFormation}`);
  const targetSelect = (r, i) => h('select', { class: 'rule-target', disabled, onchange: (e) => {
    const [kind, v] = e.target.value.split(':');
    on.rule(i, kind === 'plan' ? { newPlan: Number(v) } : { newPlan: null, newFormation: v });
  } },
  h('optgroup', { label: 'Dine planer' }, PLAN_NAMES.map((n, p) => h('option', { value: `plan:${p}`, selected: targetOf(r) === `plan:${p}` },
    `${n} (${team.tacticPresets[p]?.baseFormation ?? '?'})${p === ui.activePresetIndex ? ' – aktiv nu' : ''}`))),
  h('optgroup', { label: 'Kun formation' }, formations.map(([f]) => h('option', { value: `form:${f}`, selected: targetOf(r) === `form:${f}` }, f))));
  return h('div', { class: 'panel tactics' + (isOwn ? '' : ' readonly'), id: 'tactics' },
    h('div', { class: 'row' },
      h('label', {}, 'Formation ', select(t.baseFormation, formations, on.formation, { id: 'formation', disabled })),
      isOwn ? h('div', { class: 'presets' }, ['Plan A', 'Plan B', 'Plan C'].map((l, i) => h('button', { class: 'mini' + (ui.activePresetIndex === i ? ' active' : ''), onclick: () => on.preset(i) }, l + (ui.activePresetIndex === i ? ' (aktiv)' : '')))) : null,
      isOwn ? h('button', { class: 'mini', id: 'reset-drag', onclick: on.resetDrag }, '↺ Nulstil træk') : null),
    !isOwn ? h('div', { class: 'lockbox' }, 'Modstanderens formation og typiske stil er offentlige. 🔒 De præcise faser og Hvis-Så-regler er skjulte – læs kampreferaterne for at aflure dem.') : null,
    !isOwn ? null : PHASES.map(([phase, title, fields]) => h('fieldset', { class: 'phase', dataset: { phase } }, h('legend', {}, title),
      fields.map(([f, label]) => h('label', {}, label + ' ', select(t.phases[phase][f], PHASE_OPTIONS[f], (v) => on.phase(phase, f, v), { disabled, dataset: { field: f } }))))),
    !isOwn ? null : h('fieldset', { class: 'phase rules', id: 'rules' }, h('legend', {}, `Hvis-Så-regler (maks ${MAX_RULES}, hver udløses højst én gang pr. kamp)`),
      t.conditionalRules.map((r, i) => h('div', { class: 'rule' },
        'Fra minut ', h('input', { type: 'number', min: 1, max: 89, value: String(r.minuteTrigger), disabled, onchange: (e) => on.rule(i, { minuteTrigger: Math.max(1, Math.min(89, Number(e.target.value) || 1)) }) }),
        ' hvis ', select(r.condition, CONDITIONS, (v) => on.rule(i, { condition: v }), { disabled, class: 'rule-cond' }),
        r.condition === 'DRAW' ? null : select(String(r.margin || 1), MARGINS, (v) => on.rule(i, { margin: Number(v) }), { disabled, class: 'rule-margin' }),
        ' → skift til ', targetSelect(r, i),
        isOwn ? h('button', { class: 'mini', title: 'Slet regel', onclick: () => on.removeRule(i) }, '✕') : null)),
      isOwn && t.conditionalRules.length < MAX_RULES ? h('button', { class: 'mini', id: 'add-rule', onclick: on.addRule }, '+ Tilføj regel') : null,
      h('div', { class: 'muted help' }, 'Skift til en plan tager planens formation, trukne positioner og faser med – spillerne beholder deres pladser, og det er DISSE regler, der gælder resten af kampen (planens egne Hvis-Så-regler bruges ikke midt i en kamp).')));
}
