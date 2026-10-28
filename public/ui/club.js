// 💼 Klub (v3.18.0): dit holds økonomi – kasse, lønbudget, prognose og regnskab. Kun dit hold (kassen er ejerens, viewTeam).
// Alt vises pr. runde; "1 uge = 3 runder" står én gang (QC B6).
import { h } from './dom.js';
import { kr, LINE, POSITION, starsEl } from './labels.js';
import { weeklyWages, wagesPerRound, wageBudget, wageRoomPerRound, attendance, formOf, TV_PER_ROUND, TICKET_PRICE, GATE_MAX, PRIZE, ROUNDS_PER_WEEK, publicValue, publicWage, starsForValue } from '../engine/career.js';
import { placesBefore } from '../engine/season.js';
import { windowOf, marketInfo, wageCap, wageRoom, needsYouth, wageFreed, saleBlock, YOUTH_WAGE, SALES_PER_WINDOW } from '../engine/transfers.js';
import { TEAM_PUBLIC_FIELDS } from '../engine/visibility.js';
import { SEASON_ROUNDS, seasonRoundOf } from '../engine/schedule.js';
import { saleChemText, chemRefOf, gamesToSettle } from '../engine/chemistry.js';

// Dine salg tilbage i vinduet (samme tæller som transfers.js sellBlock)
const salesLeft = (league, team) => { const w = windowOf(league); return SALES_PER_WINDOW - (w != null && league.windowSales?.w === w ? league.windowSales.n?.[team.id] ?? 0 : 0); };
const net = (e) => (e.gate ?? 0) + (e.tv ?? 0) + (e.wages ?? 0) + (e.prize ?? 0) + (e.transfers ?? 0);
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + kr(Math.abs(n));
// Under afspilningen er runden bogført, men kampene ikke vist: kassen og regnskabet vises som før runden (præmien ville afsløre slutstillingen)
export const shownLedger = (team, playing) => (playing ? team.finance.ledger.slice(0, -1) : team.finance.ledger);
export const shownCash = (team, playing) => (playing && team.finance.ledger.length ? team.cashBalance - net(team.finance.ledger.at(-1)) : team.cashBalance);

// Prognose til sæsonslut: de resterende runder (TV − løn, billetter i hjemmekampene efter placeringen nu) + præmien for pladsen nu
export function forecast(league, team) {
  const next = league.leagueMetadata.round + 1, from = seasonRoundOf(league, next);
  const places = placesBefore(league, next), myPlace = places.get(team.id);
  let sum = 0, home = 0;
  for (let r = from; r <= SEASON_ROUNDS; r++) {
    sum += TV_PER_ROUND - wagesPerRound(team);
    const pair = league.schedule[r - 1]?.find(([a, b]) => a === team.id || b === team.id);
    if (pair && pair[0] === team.id) { home++; sum += attendance(myPlace, places.get(pair[1]), formOf(team)) * TICKET_PRICE; }
  }
  const prize = PRIZE[Math.round(myPlace) - 1] ?? 0;
  return { rounds: SEASON_ROUNDS - from + 1, home, prize, end: team.cashBalance + sum + prize };
}

export function renderClub({ league, team, playing }) {
  if (playing) return h('div', { class: 'panel notice', id: 'club-booked' }, '📺 Runden spilles i Kamp-fanen – regnskabet viser den, når kampene er spillet.');
  const cash = team.cashBalance, room = wageRoomPerRound(team), fc = forecast(league, team);
  // v3.21.1: efter et salg i vinduet er loftet din løn før salget, hvis den var over budgettet (transfers.js wageCap)
  const capRoom = wageCap(league, team) > wageBudget(team) ? Math.round(wageRoom(league, team) / ROUNDS_PER_WEEK) : 0;
  const ledger = shownLedger(team, false).slice().reverse();
  // Lige efter sæsonslut er den nye sæson tom: vis den afsluttede (Spilfører/egen gennemgang: "Sæsonen indtil nu: 0 kr.")
  const cur = team.finance.season ?? {}, ended = !Object.keys(cur).length && team.finance.lastSeason;
  const s = ended ? team.finance.lastSeason : cur;
  const row = (label, v, id) => h('tr', id ? { id } : {}, h('th', {}, label), h('td', { class: 'num' }, v));
  return h('div', { class: 'panel club', id: 'club' },
    h('h3', {}, '💼 Klub – økonomi'),
    // Én linje, der gør fanen forståelig (Spilfører): sidste sæson og retningen for denne
    h('p', { id: 'club-headline' }, [team.finance.lastSeason && Object.keys(team.finance.lastSeason).length ? `Sidste sæson: ${signed(net(team.finance.lastSeason))}` : null,
      `Denne sæson forventet: ${signed(Math.round((fc.end - cash) / 1000) * 1000)}`].filter(Boolean).join(' · ')),
    h('table', { class: 'club-sum' }, h('tbody', {},
      row('Klubkasse', h('strong', { class: cash < 0 ? 'neg' : '' }, kr(cash)), 'club-cash'),
      row('Løn', `${kr(wagesPerRound(team))} pr. runde (${kr(weeklyWages(team))} pr. uge – 1 uge = ${ROUNDS_PER_WEEK} runder)`, 'club-wages'),
      row('Lønbudget', room >= 0 ? `Du kan bruge ${kr(Math.max(room, capRoom))} mere pr. runde i løn${capRoom > room ? ' (din løn før salget i vinduet)' : ''}` : capRoom > 0
        ? `Du er ${kr(-room)} over budgettet pr. runde – efter dit salg i vinduet må du dog købe for op til ${kr(capRoom)} pr. runde i løn (lønnen bliver ikke højere end før salget)`
        : `Du er ${kr(-room)} over budgettet pr. runde – sælg eller fritstil en spiller i et åbent vindue, så kan du købe for den løn, du sparer`, 'club-room'),
      row('Indtægter pr. runde', `TV ${kr(TV_PER_ROUND)} · billetter i hjemmekampe (op til ${GATE_MAX.toLocaleString('da-DK')} tilskuere à ${TICKET_PRICE} kr.)`),
      row('Prognose ved sæsonslut', h('span', { class: fc.end < 0 ? 'neg' : '' }, `${kr(Math.round(fc.end / 1000) * 1000)} (${fc.rounds} runde${fc.rounds === 1 ? '' : 'r'}, ${fc.home} hjemme, præmie for pladsen nu ${kr(fc.prize)})`), 'club-forecast'))),
    fc.end < 0 ? h('div', { class: 'notice', id: 'club-warning' }, `⚠ Kassen ender i minus ved sæsonslut, hvis intet ændres. Ingen sælges automatisk – du vælger selv. I minus kan du ikke købe spillere.`) : null,
    h('div', { class: 'muted' }, `Lønbudget: ${kr(Math.round(wageBudget(team) / ROUNDS_PER_WEEK))} pr. runde (1,7 mio. kr. pr. uge + 2 % af kassen). Præmier: ${PRIZE.map((p, i) => `${i + 1}. ${(p / 1e6).toLocaleString('da-DK')}`).join(' · ')} mio. kr.`),
    h('h4', {}, `${ended ? 'Den afsluttede sæson' : 'Sæsonen indtil nu'}: ${signed(net(s))}`),
    h('div', { class: 'muted', id: 'club-season' }, `Billetter ${kr(s.gate ?? 0)} · TV ${kr(s.tv ?? 0)} · Løn ${kr(Math.abs(s.wages ?? 0))}${s.prize ? ` · Præmie ${kr(s.prize)}` : ''}${s.transfers ? ` · Transfers ${signed(s.transfers)}` : ''}`),
    h('h4', {}, 'Regnskab pr. runde'),
    ledger.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'ledger', id: 'ledger' },
      h('thead', {}, h('tr', {}, ['Runde', 'Tilskuere', 'Billetter', 'TV', 'Løn', 'Præmie/transfers', 'Kasse'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ledger.map((e) => h('tr', {},
        h('td', {}, `S${e.s} R${e.r - (league.seasons?.find((x) => x.seasonNumber === e.s)?.fromRound ?? league.seasonStartRound) + 1}`),
        h('td', { class: 'num' }, e.att ? `${e.att.toLocaleString('da-DK')} af ${GATE_MAX.toLocaleString('da-DK')}` : 'ude'),
        h('td', { class: 'num' }, e.gate ? kr(e.gate) : '–'), h('td', { class: 'num' }, kr(e.tv ?? 0)), h('td', { class: 'num' }, kr(Math.abs(e.wages ?? 0))),
        h('td', { class: 'num' }, [e.prize ? `🏆 ${kr(e.prize)}` : '', e.transfers ? signed(e.transfers) : ''].filter(Boolean).join(' ') || '–'),
        h('td', { class: 'num' + (e.cash < 0 ? ' neg' : '') }, kr(e.cash))))))) : h('div', { class: 'muted', id: 'ledger-empty' }, 'Regnskabet starter efter første runde.'));
}

// 🔁 Transfermarked (v3.18.0): vinduet, dine spillere til salg med botternes bud, og hvordan man køber
export function renderMarket({ league, team, playing, onAccept, onDecline, onUnlist, onRelease = null, onBuy = null, onLine = null, line = 'all', msg = '' }) {
  if (playing) return null;
  const w = windowOf(league), offers = (league.offers ?? []).filter((o) => o.from === team.id);
  const listed = (team.listed ?? []).map((id) => team.squad.find((p) => p.id === id)).filter(Boolean);
  const teamName = (id) => league.teams.find((t) => t.id === id)?.name ?? '?';
  const sold = SALES_PER_WINDOW - salesLeft(league, team);
  return h('div', { class: 'panel market', id: 'market' },
    h('h3', {}, '🔁 Transfermarked'),
    h('p', { id: 'window-state', class: w != null ? 'open' : 'muted' }, w != null
      ? '🟢 Vinduet er åbent til næste runde. Køb i listen herunder (eller på en spillers kort) – prisen er fast.'
      : '🔴 Vinduet er lukket. Det åbner før sæsonens runde 8 og ved sæsonslut. Spillere til salg får bud, når det åbner.'),
    h('h4', {}, `Dine spillere til salg (${listed.length})`),
    // v3.21.1 (QC/Spilfører): hvad et salg giver, FØR klikket – lønnen, der frigøres, og om en ungdomsspiller kommer ind
    w != null ? h('div', { class: 'muted', id: 'sales-left' }, `Salg i vinduet: ${sold} af ${SALES_PER_WINDOW}${sold >= SALES_PER_WINDOW ? ' – næste salg i næste vindue' : ''}.`) : null,
    listed.length ? listed.map((p) => {
      const o = offers.find((x) => x.playerId === p.id), youth = needsYouth(team, p), freed = Math.round(wageFreed(team, p) / 3), block = w != null ? saleBlock(league, team, p) : null;
      // Netto (QC): akademispillerens løn trækkes fra – samme tal som købsloftet
      const gain = youth ? `${freed > 0 ? `frigør ${kr(freed)} pr. runde i løn` : 'frigør ingen løn'} – en ungdomsspiller kommer ind fra akademiet i samme kæde (1★, ${kr(Math.round(YOUTH_WAGE / 3))} pr. runde)`
        : `frigør ${kr(freed)} pr. runde i løn`;
      return h('div', { class: 'market-row', dataset: { pid: p.id } }, `#${p.shirtNumber} ${p.shortName} (${kr(publicValue(p))}) `,
        block ? h('span', { class: 'muted' }, `${block} `)
          : o ? [h('strong', {}, `Bud fra ${teamName(o.to)}: ${kr(o.price)} `), h('button', { class: 'mini offer-accept', onclick: () => onAccept(p.id) }, 'Sælg'), h('button', { class: 'mini offer-decline', onclick: () => onDecline(p.id) }, 'Afvis')]
          : h('span', { class: 'muted' }, w != null ? 'Intet bud – ingen klub har råd og plads lige nu. ' : 'Venter på vinduet. '),
        // Fritstil kun uden bud (QC: uigenkaldelig, ikke ved siden af Sælg) og kun når et salg er muligt
        w != null && onRelease && !o && !block ? h('button', { class: 'mini release', onclick: () => onRelease(p.id) }, 'Fritstil (gratis)') : null,
        h('button', { class: 'mini linklike', onclick: () => onUnlist(p.id) }, 'Fjern fra listen'),
        w != null && !block ? h('div', { class: 'muted market-gain' }, `${o ? 'Salg' : 'Salg eller fritstilling (uden betaling – kan ikke fortrydes)'} ${gain}.`) : null,
        // Samspil (v3.24.0): samme linje som på kortet ved "Til salg" – kun stærke par med hans naboer nu
        (() => { const t = saleChemText(team, chemRefOf(league), p.id); return t ? h('div', { class: 'muted market-chem' }, t) : null; })());
    }) : h('p', { class: 'muted', id: 'market-empty' }, 'Ingen. Sæt en spiller til salg på hans spillerkort (dit hold).'),
    w != null && onBuy ? renderForSale(league, team, onBuy, onLine, line, msg) : null);
}

// Til salg i ligaen (v3.18.1): de andre klubbers spillere med fast pris og Køb – kun dem, du faktisk kan købe nu (årsagen står ellers
// på kortet). Filter pr. kæde; sorteret efter stjerner, så pris.
function renderForSale(league, me, onBuy, onLine, line, msg = '') {
  const rows = league.teams.filter((t) => t.isBot).flatMap((t) => t.squad.map((p) => ({ t, p, m: marketInfo(league, me, t, p) })))
    .filter((o) => !o.m.reason && (line === 'all' || o.p.line === line))
    // Stjernerne bag værdien (før første kamp: tier'ens) – de offentlige stjerner er 0 ved sæsonstart (QC)
    .sort((a, b) => starsForValue(b.p) - starsForValue(a.p) || a.m.price - b.m.price);
  return h('div', { id: 'for-sale' },
    h('h4', {}, `Til salg i ligaen – du kan købe ${rows.length}`),
    msg ? h('div', { class: 'notice', id: 'for-sale-msg' }, msg) : null,
    // Samspil (v3.24.0, QC: prisen hvor man køber): én linje for alle køb – antallet af kampe regnet ud af modellen
    h('div', { class: 'muted', id: 'for-sale-chem' }, `🤝 Et køb er fremmed for alle i truppen – ca. ${gamesToSettle(chemRefOf(league))} kampe ved siden af de samme, før han har spillet sig ind.`),
    h('div', { class: 'toolbar' }, [['all', 'Alle'], ['GK', 'MÅL'], ['DEF', 'FOR'], ['MID', 'MID'], ['ATT', 'ANG']].map(([v, l]) => h('button', { class: 'mini' + (line === v ? ' active' : ''), onclick: () => onLine?.(v) }, l))),
    rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'ledger', id: 'for-sale-table' },
      // Køb først (360 px: sidste kolonne lå uden for skærmen – QC); Klub og Løn skjules på smal skærm
      h('thead', {}, h('tr', {}, [['', ''], ['Spiller', ''], ['Pris', ''], ['Pos', ''], ['Alder', ''], ['Vurd', ''], ['Klub', 'wide'], ['Løn hos dig/runde', 'wide']].map(([x, c]) => h('th', { class: c }, x)))),
      h('tbody', {}, rows.map(({ t, p, m }) => h('tr', { dataset: { pid: p.id } },
        h('td', {}, h('button', { class: 'mini buy-row', onclick: () => onBuy(p.id) }, '💰 Køb')),
        h('td', {}, `#${p.shirtNumber} ${p.shortName}`), h('td', { class: 'num' }, kr(m.price)), h('td', {}, `${LINE[p.line]} · ${POSITION[p.position] ?? ''}`), h('td', { class: 'num' }, p.age),
        h('td', {}, starsEl(p.publicStars)), h('td', { class: 'wide' }, t.name), h('td', { class: 'num wide' }, kr(Math.round(publicWage(p) / 3)))))))) :
      h('p', { class: 'muted', id: 'for-sale-empty' }, line === 'all' ? (wageRoom(league, me) <= 0 ? (salesLeft(league, me) > 0 ? 'Ingen lige nu – du er over lønbudgettet: sæt en spiller til salg eller fritstil ham, så kan du købe for den løn, du sparer (se Lønbudget øverst i 💼 Klub).' : `Ingen lige nu – du er over lønbudgettet og har brugt dine ${SALES_PER_WINDOW} salg i vinduet.`) : 'Ingen lige nu – kassen eller lønbudgettet er for lille (se øverst i 💼 Klub), eller klubberne har solgt deres 2 i dette vindue.') : 'Ingen i denne kæde lige nu – prøv "Alle".'));
}

// Ligaens transfers (offentligt): de seneste skifter og fritstillinger
export function renderTransferLog({ league }) {
  const log = (league.transferLog ?? []).slice(-12).reverse();
  if (!log.length) return null;
  const name = (id) => league.teams.find((t) => t.id === id)?.name ?? '?';
  return h('div', { class: 'panel', id: 'transfer-log' }, h('h3', {}, '🔁 Transfers'),
    log.map((e) => h('div', { class: 'tlog-row' }, e.kind === 'release' ? `S${e.s}: ${e.name} er fritstillet af ${name(e.from)}.` : `S${e.s}: ${e.name} ${name(e.from)} → ${name(e.to)} for ${kr(e.price)}`)));
}

// Offentlig klubside (v3.19.0, brugeren: et modstanderhold må ikke vise de samme klubinformationer som dit eget). Tegnes KUN fra
// viewTeam(team, false) – kasse, løn og regnskab findes ikke i det objekt (vagten er visibility.js, ikke denne funktion).
export function renderPublicClub({ league, pub, me, playing, onBuy, onBack, msg = '' }) {
  // Vagt på positiv tilstedeværelse: kun en viewTeam-visning tegnes – et råt hold (med kasse og løn) afvises (Test Manager)
  if (!Object.keys(pub).every((k) => TEAM_PUBLIC_FIELDS.includes(k))) throw new Error('Den offentlige klubside må kun tegnes fra viewTeam(team, false).');
  const name = (id) => league.teams.find((t) => t.id === id)?.name ?? '?';
  const log = (league.transferLog ?? []).filter((e) => e.from === pub.id || e.to === pub.id).slice(-10).reverse();
  const retired = (league.retired ?? []).filter((r) => r.teamId === pub.id).slice(-8).reverse();
  const players = pub.squad.slice().sort((a, b) => ['GK', 'DEF', 'MID', 'ATT'].indexOf(a.line) - ['GK', 'DEF', 'MID', 'ATT'].indexOf(b.line) || a.shirtNumber - b.shirtNumber);
  return h('div', { class: 'panel club public-club', id: 'public-club' },
    h('h3', {}, `💼 Offentlig klubside – ${pub.name}`),
    h('p', {}, h('button', { id: 'back-to-club', onclick: onBack }, '← Til din klub'), h('span', { class: 'muted' }, `  ${pub.squad.length} spillere · 🔒 kasse, løn og regnskab er klubbens egne`)),
    msg ? h('div', { class: 'notice', id: 'public-club-msg' }, msg) : null,
    playing ? h('p', { class: 'muted' }, '📺 Runden spilles – handel venter til kampene er spillet.') : h('div', { class: 'tablewrap' }, h('table', { class: 'ledger', id: 'public-squad' },
      h('thead', {}, h('tr', {}, ['', 'Spiller', 'Pos', 'Alder', 'Vurd', 'Værdi', 'Pris', 'Løn hos dig/rd'].map((x) => h('th', {}, x)))),
      h('tbody', {}, players.map((p) => {
        const m = marketInfo(league, me, pub, p);
        return h('tr', { dataset: { pid: p.id } },
          h('td', {}, m.reason ? h('span', { class: 'muted', title: m.reason }, '–') : h('button', { class: 'mini buy-row', onclick: () => onBuy(p.id) }, '💰 Køb')),
          h('td', {}, `#${p.shirtNumber} ${p.shortName}`), h('td', {}, `${LINE[p.line]} · ${POSITION[p.position] ?? ''}`), h('td', { class: 'num' }, p.age),
          h('td', {}, starsEl(p.publicStars)), h('td', { class: 'num' }, kr(publicValue(p))), h('td', { class: 'num', title: m.reason ?? '' }, kr(m.price)), h('td', { class: 'num' }, kr(Math.round(publicWage(p) / 3))));
      })))),
    // Under afspilningen skjules transfers og pensioner som på Liga (QC: ens)
    playing ? null : h('h4', {}, 'Transfers'), playing ? null : log.length ? log.map((e) => h('div', { class: 'tlog-row' }, e.kind === 'release' ? `S${e.s}: ${e.name} fritstillet.` : `S${e.s}: ${e.name} ${name(e.from)} → ${name(e.to)} for ${kr(e.price)}`)) : h('p', { class: 'muted' }, 'Ingen endnu.'),
    playing ? null : h('h4', {}, 'Stoppet'), playing ? null : retired.length ? retired.map((r) => h('div', {}, `S${r.season}: ${r.name} (${r.age} år, ${r.games} kampe)`)) : h('p', { class: 'muted' }, 'Ingen endnu.'));
}
