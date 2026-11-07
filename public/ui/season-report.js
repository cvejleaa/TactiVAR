// 📋 Sæsonrapport (v3.18.0): dit holds sæsonskifte – præmie, ny løn, udvikling, afsked og ungdomstilbuddene (Tag op / Lad gå).
// v3.33.1 (brugeren: "sæsonrapport skal være på enten Hjem eller Klub, da den vedrører min klub"): står på 🏠 Hjem (home.js – efter
// afspilnings-vagten) fra sæsonslut, til den nye sæsons første runde er spillet (tilbuddene udløber da). Klub linker hertil.
import { h, dec } from './dom.js';
import { kr, LINE, POSITION_FULL } from './labels.js';
import { roomPoints, keyAvg, wagesPerRound } from '../engine/career.js';
import { forecast } from './club.js';
import { roomWords } from './card.js';

// Perioden, rapporten står i – ÉT prædikat for Hjem (rapporten) og Klub ("📋 Sæsonrapport ›"): sæsonskiftets rapport for netop den
// afsluttede sæson, og ingen runde spillet i den nye. Under afspilningen af sæsonens sidste runde vises den ikke (home.js/app.js).
export function seasonReportShown(league) {
  const rep = league.turnoverReport, last = league.seasons?.at(-1);
  return !!rep && !!last && rep.season === last.seasonNumber && league.leagueMetadata.round + 1 === league.seasonStartRound;
}
export function renderSeasonReport({ league, mine, onTake, onDrop, onKlub = null }) {
  if (!seasonReportShown(league)) return null;
  const rep = league.turnoverReport, last = league.seasons.at(-1);
  const name = (id) => mine.squad.find((p) => p.id === id)?.shortName ?? '?';
  const teamName = (id) => league.teams.find((t) => t.id === id)?.name ?? '?';
  const myRetired = rep.retired.filter((r) => r.teamId === mine.id), others = rep.retired.filter((r) => r.teamId !== mine.id);
  const autoTaken = rep.youthTaken.filter((y) => y.teamId === mine.id), botTaken = rep.youthTaken.filter((y) => y.teamId !== mine.id).length;
  const prize = mine.finance?.lastSeason?.prize;
  const offers = mine.youthOffers ?? [];
  const youth = offers.length ? h('div', { id: 'youth-offers' },
    h('h4', {}, `🧒 Ungdomstilbud – svar før næste runde, ellers går de (truppen: ${mine.squad.length} af 25)`),
    h('div', { class: 'muted', id: 'youth-note' }, 'En ungdomsspiller, du tager op, kan – som et køb – først sælges ved næste sæsonslut.'),
    offers.map((y) => h('div', { class: 'youth-offer', dataset: { yid: y.id } },
      h('span', {}, `#${y.shirtNumber} ${y.name} – ${LINE[y.line]}${POSITION_FULL[y.position] ? `, ${POSITION_FULL[y.position]}` : ''}, ${y.age} år · nøglesnit ${dec(keyAvg(y), 1)} · skøn: ${roomWords(roomPoints(y))} · løn ${kr(Math.round(y.weeklyWage / 3))} pr. runde `),
      h('button', { class: 'mini youth-take', onclick: () => onTake(y.id) }, 'Tag op'),
      h('button', { class: 'mini youth-drop', onclick: () => onDrop(y.id) }, 'Lad gå')))) : null;
  const d = Math.round((forecast(league, mine).end - mine.cashBalance) / 1000) * 1000;
  // Handlingen først (ungdomstilbuddene), så præmie, aldring, løn og prognose (QC/Spilfører klub)
  return h('div', { class: 'panel season-report', id: 'season-report' },
    h('h3', {}, `📋 Sæson ${rep.season} er slut${last.myPos ? ` – nr. ${last.myPos} af ${last.table.length}` : ''}`),
    youth,
    h('ul', {},
      prize ? h('li', { id: 'sr-prize' }, `🏆 Præmie for ${last.myPos}. pladsen: ${kr(prize)}`) : null,
      h('li', { id: 'sr-aged' }, `🎂 Alle spillere er blevet et år ældre. Fra 30 år falder evnerne lidt hver sæson – mindre i de evner, de træner.`),
      h('li', { id: 'sr-wages' }, rep.wages ? `💼 Lønnen er genforhandlet efter stjerner og alder: ${kr(rep.wages.before)} → ${kr(rep.wages.after)} pr. runde (${rep.wages.after >= rep.wages.before ? '+' : '−'}${Math.round(Math.abs(rep.wages.after / Math.max(1, rep.wages.before) - 1) * 100)} %).` : `💼 Lønnen er genforhandlet efter stjerner og alder: ${kr(wagesPerRound(mine))} pr. runde nu.`),
      h('li', { id: 'sr-forecast' }, `📊 Med samme placering ${d >= 0 ? 'vokser' : 'falder'} kassen ca. ${kr(Math.abs(d))} i sæson ${rep.season + 1}. `,
        onKlub ? h('button', { class: 'linklike', id: 'sr-to-klub', onclick: onKlub }, '💼 Klub ›') : null),
      rep.best.length ? h('li', { id: 'sr-best' }, `📈 Mest udviklet: ${rep.best.map((b) => `${name(b.id)} +${b.n} evne${b.n === 1 ? '' : 'r'}`).join(' · ')}`) : null,
      ...myRetired.map((r) => h('li', { class: 'sr-retired' }, `👋 #${r.nr} ${r.name} stopper karrieren efter ${r.games} kampe (${r.age} år).`)),
      others.length ? h('li', { id: 'sr-others' }, `I resten af ligaen stoppede ${others.length}: ${others.slice(0, 5).map((r) => `${r.shortName} (${teamName(r.teamId)})`).join(', ')}${others.length > 5 ? ' …' : ''}`) : null,
      autoTaken.length ? h('li', { id: 'sr-auto' }, `🧒 ${autoTaken.length} ungdomsspiller${autoTaken.length === 1 ? '' : 'e'} er rykket op automatisk, så truppen er på 18: ${autoTaken.map((y) => name(y.id)).join(', ')}. Som et køb kan de først sælges ved næste sæsonslut.`) : null,
      botTaken ? h('li', {}, `De andre klubber tog ${botTaken} ungdomsspiller${botTaken === 1 ? '' : 'e'} op.`) : null));
}
