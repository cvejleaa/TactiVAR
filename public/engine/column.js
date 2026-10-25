// Journalist-klummen (v3.14, spec §6 og §10.3; brugeren: "avisen er stadig kedelig"). Fem afsnit: din kamp,
// de øvrige kampe, rundens spiller og mål, formen og næste runde – plus en overskrift efter rundens største
// historie. Bygges VED VISNING for den, der ser (brugeren: afsnit 1 "skal varieres så det er den indlogget
// spillers hold det indeholder"), ud fra de gemte kampe – så gamle gem også får en klumme, og formen og
// optakten passer til tabellen lige over.
//
// Anti-spionage (§3): klummen ser kun kampene gennem publicFacts – det, referatet viser offentligt. Den får
// aldrig holdene, aldrig en hændelses tekst eller label (labels kan røbe fx offside-fælden), aldrig private
// karakterfelter og kun SEERENS egen kamprapport (ownReport). Stil-gæt (brugerens valg) beskriver kampe ud fra
// de offentlige tal – aldrig en indstilling ved navn, aldrig noget om pres (intet offentligt tal måler pres).
// Ingen tilfældighed: varianter vælges ud fra runden og kampens tal (samme runde → samme klumme).
import { RATING_PRIVATE_FIELDS, viewOwnReport } from './visibility.js';
import { pickBy, gen, pl } from './clues.js';
import { inMinute } from './clock.js';

// De felter på en karakterlinje, klummen må læse (ingen af RATING_PRIVATE_FIELDS – testet).
export const RATING_PUBLIC = ['playerId', 'shirtNumber', 'shortName', 'teamId', 'teamName', 'goals', 'assists', 'saves', 'aerialWins', 'stars', 'isMotM'];
if (RATING_PUBLIC.some((k) => RATING_PRIVATE_FIELDS.includes(k))) throw new Error('RATING_PUBLIC indeholder et privat felt');

export { pickBy } from './clues.js';   // bor i clues.js (v3.16.3 – også referatets varianter)

const GOAL_TYPES = new Set(['GOAL', 'HEADER_GOAL', 'VAR_GOAL']);
// De offentlige fakta pr. hold i en kamp – den lukkede liste, stil-gættene må bygge på (QC B2: positiv assertion).
export const PUBLIC_FACT_KEYS = ['poss', 'shots', 'onTarget', 'corners', 'aerialWon', 'counterGoals', 'setPieceGoals', 'headerGoals', 'yellows', 'reds', 'reorganised', 'goals', 'against'];
const SET_PIECE = new Set(['PENALTY', 'FREEKICK', 'CORNER', 'SETPIECE']);

// Eneste indgang til en kamp. Alt andet i klummen læser kun det, denne returnerer.
export function publicFacts(m, idx = 0) {
  const st = m.stats ?? {}, possSum = (st.hPoss ?? 0) + (st.aPoss ?? 0) || 1;
  const events = (m.events ?? []).filter((e) => GOAL_TYPES.has(e.type) || ['SUB', 'INJURY', 'RED'].includes(e.type) || (e.type === 'TRIGGER' && e.category === 'HIGHLIGHT'))   // et Hvis-Så-skift, der ikke blev udført, er ingen omorganisering (QC F16)
    .map((e) => ({ type: e.type, min: e.min, clock: e.clock ?? null, isHome: e.isHome, hG: e.hG, aG: e.aG }));
  const goals = (m.goalsPool ?? []).map((g) => ({ kind: g.kind, min: g.min, scorer: g.scorer, teamName: g.teamName }));
  const side = (h) => {
    const p = h ? 'h' : 'a', name = h ? m.homeName : m.awayName, mine = goals.filter((g) => g.teamName === name);
    return Object.freeze({
      id: h ? m.homeId : m.awayId, name, goals: h ? m.homeGoals : m.awayGoals, against: h ? m.awayGoals : m.homeGoals,
      formation: m.startFormations?.[h ? 'home' : 'away'] ?? null, endFormation: m.endState?.[h ? 'home' : 'away']?.formation ?? null,
      poss: Math.round(((st[p + 'Poss'] ?? 0) / possSum) * 100), shots: st[p + 'Shots'] ?? 0, onTarget: st[p + 'OnTarget'] ?? 0,
      corners: st[p + 'Corners'] ?? 0, aerialWon: st[p + 'AerialWon'] ?? 0, yellows: st[p + 'Yellows'] ?? 0, reds: st[p + 'Reds'] ?? 0,
      counterGoals: mine.filter((g) => g.kind === 'COUNTER').length, setPieceGoals: mine.filter((g) => SET_PIECE.has(g.kind)).length,
      headerGoals: mine.filter((g) => g.kind === 'HEADER').length,   // kun åbent spil (QC: HeaderGoals tæller dødbolde med)
      reorganised: events.filter((e) => e.type === 'TRIGGER' && e.isHome === h).length,
    });
  };
  // Kun de offentlige felter læses – direkte, ikke ved at kopiere hele linjen (kanarien: en kopi læser også karakteren).
  const ratings = [...(m.ratings?.home ?? []), ...(m.ratings?.away ?? [])]
    .map((e) => Object.fromEntries(RATING_PUBLIC.map((k) => [k, e[k]])));
  return Object.freeze({ idx, home: side(true), away: side(false), events, goals, ratings });
}
// Til runde-historikken (scouting af næste modstander): kun de offentlige tal pr. hold.
export const compactFacts = (f) => Object.fromEntries([f.home, f.away].map((s) => [s.id, Object.fromEntries(PUBLIC_FACT_KEYS.map((k) => [k, s[k]]))]));


// Kampens drama ud fra stillingen efter hvert mål (offentligt i referatet).
function drama(f) {
  const g = f.events.filter((e) => GOAL_TYPES.has(e.type));
  const last = g.at(-1), diff = f.home.goals - f.away.goals;
  // Sent sejrsmål: vinderen scorede sidst, i 80.+, til 1 måls forskel – altså fra uafgjort (QC F1: ikke et reduceringsmål).
  // Sent = 80. minut eller senere på uret, når det findes (QC v3.16.4: ellers "sent drama … i 79. minut")
  const late = last && (last.clock ? last.clock.m + (last.clock.plus ?? 0) : last.min) >= 80 && Math.abs(diff) === 1 && last.isHome === (diff > 0) && last.hG - last.aG === diff ? (diff > 0 ? f.home : f.away) : null;
  const behind = (h) => g.some((e) => (h ? e.hG - e.aG : e.aG - e.hG) <= -1);
  const comeback = diff > 0 && behind(true) ? f.home : diff < 0 && behind(false) ? f.away : null;
  return { late, comeback, lateMin: last?.min, lateAt: inMinute(last?.clock ?? { m: last?.min }) };   // lateAt: "i 87. minut" / "i tillægstiden" (v3.16.4)
}

// Stil-gæt for ét hold ud fra offentlige tal (QC B2: om kampen, i datid; aldrig indstillingens navn eller pres).
// basis = de fakta, gættet bygger på – testet ⊆ PUBLIC_FACT_KEYS.
export const STYLE_RULES = [
  { key: 'air', basis: ['headerGoals', 'goals', 'corners'], test: (s) => (s.headerGoals >= 1 && s.headerGoals * 2 >= s.goals) || s.corners >= 7,   // QC F3: hovedstød mindst halvdelen af målene
    say: ['fik bolden ind i feltet via indlæg og hjørner', 'fandt vejen via indlæg og hjørner', 'søgte hovedet i feltet', 'bombarderede feltet med høje bolde', 'var farlige i luften'] },
  { key: 'break', basis: ['counterGoals'], test: (s) => s.counterGoals >= 1,
    say: ['slog til i omstillingerne', 'straffede boldtab med hurtige angreb', 'var dødbringende, når bolden blev vundet', 'gik hurtigt fremad efter erobringer', 'udnyttede den åbne bane bag forsvaret'] },
  { key: 'ball', basis: ['poss'], test: (s) => s.poss >= 58,
    say: ['havde bolden det meste af tiden', 'styrede rytmen med bolden', 'spillede roligt bolden rundt', 'satte sig på kampen med bolden', 'lod modstanderen løbe efter bolden'] },
  { key: 'wait', basis: ['poss', 'goals'], test: (s) => s.poss <= 42 && s.goals >= 1,
    say: ['havde under halvdelen af bolden og scorede alligevel', 'klarede sig uden meget af bolden', 'scorede, selv om de havde bolden mindst', 'fik meget ud af lidt', 'var effektive på få muligheder'] },
  { key: 'shots', basis: ['shots'], test: (s) => s.shots >= 12,
    say: ['skød fra alle vinkler', 'pressede mange afslutninger igennem', 'testede målmanden igen og igen', 'havde skudstøvlerne på', 'afsluttede, hver gang muligheden bød sig'] },
  { key: 'dead', basis: ['setPieceGoals'], test: (s) => s.setPieceGoals >= 1,
    say: ['fik dødboldene til at tælle', 'var skarpe på de faste situationer', 'slog til på dødbolde', 'var farlige, når bolden lå stille', 'høstede på standardsituationerne'] },
  { key: 'switch', basis: ['reorganised'], test: (s) => s.reorganised >= 1,
    say: ['skiftede om undervejs', 'omorganiserede sig i løbet af kampen', 'ændrede ansigt midt i kampen', 'lagde om i løbet af kampen', 'fandt en ny opstilling undervejs'] },
];
export const styleGuess = (s) => STYLE_RULES.filter((r) => r.test(s));
const say = (rule, round, key) => pickBy(rule.say, round, rule.key, key);

// Seerens taktik, som den blev spillet (ownReport, gemt ved kampen) – kun for seerens eget hold.
const TXT = { SHORT: 'de korte pasninger', BALANCED: 'den balancerede opbygning', DIRECT_LONG: 'de lange bolde', HIGH_CROSSES: 'de høje indlæg', LOW_CUTBACKS: 'cutbacks fra baglinjen', CENTRAL: 'spillet gennem midten' };
function yourVerdict(r, mine, round) {
  if (!r) return [];
  const ph = r.end?.phases?.phase1_buildUp ?? {}, out = [];
  const same = r.start?.phases?.phase1_buildUp?.passingStyle === ph.passingStyle;   // QC F6: ændret undervejs → intet stilnavn
  const TXTp = (k) => (same ? TXT[k] : null);
  if (r.build >= 4 && r.buildWon / r.build >= 0.65) out.push([3, pickBy([`Din opbygning kom igennem ${r.buildWon} af ${pl(r.build, 'gang', 'gange')} – ${TXTp(ph.passingStyle) ?? 'opbygningen'} bar spillet.`, `${r.buildWon} af ${r.build} angreb kom forbi presset – ${TXTp(ph.passingStyle) ?? 'opbygningen'} virkede.`, `Opbygningen sad: ${r.buildWon} af ${pl(r.build, 'gang', 'gange')} kom I igennem.`], round, 'b')]);
  if (r.build >= 4 && r.buildWon / r.build <= 0.4) out.push([3, pickBy([`Din opbygning sad fast – kun ${r.buildWon} af ${pl(r.build, 'gang', 'gange')} kom I igennem.`, `Kun ${r.buildWon} af ${r.build} opbygninger kom forbi presset; ${TXTp(ph.passingStyle) ?? 'opbygningen'} ${r.buildWon ? 'sad fast' : 'fandt ingen vej'}.`, `Modstanderens pres lukkede ${r.build - r.buildWon} af ${r.build} opbygninger.`], round, 'bf')]);
  if (ph.attackFocus === 'HIGH_CROSSES' && mine.headerGoals >= 1) out.push([4, `${mine.headerGoals === 1 ? 'Et hovedstødsmål' : `${mine.headerGoals} hovedstødsmål`} fra åbent spil: ${TXT.HIGH_CROSSES} betalte sig.`]);
  if (ph.attackFocus === 'HIGH_CROSSES' && r.crosses >= 3 && !mine.headerGoals) out.push([2, `${r.crosses} høje bolde i feltet, men intet hovedstødsmål – ${r.crossesWon * 2 < r.crosses ? 'kun ' : ''}${r.crossesWon} ${r.crossesWon === 1 ? 'luftduel' : 'luftdueller'} blev vundet.`]);
  if (r.cutbackGoals >= 1) out.push([4, `${r.cutbackGoals === 1 ? 'En cutback' : `${r.cutbackGoals} cutbacks`} fra baglinjen endte i nettet.`]);
  if (r.cutbacks >= 3 && r.cutbacksBlocked / r.cutbacks >= 0.6) out.push([2, `Kanten blev lukket: ${r.cutbacksBlocked} af ${r.cutbacks} cutback-forsøg stoppet.`]);
  // Årsagen kun med belæg (QC F2); uden den ingen "Det kostede:" – det lovede en årsag (Spilfører v3.16.6, R12)
  if (r.counterGoalsAgainst >= 1) out.push([3, ph.offBallRuns === 'MANY' ? `Det kostede: ${r.counterGoalsAgainst === 1 ? 'et kontramål' : `${r.counterGoalsAgainst} kontramål`} imod, da bolden blev tabt med mange spillere fremme.`
    : r.counterGoalsAgainst === 1 ? 'Ét af målene imod kom på kontra.' : `${r.counterGoalsAgainst} af målene imod kom på kontra.`]);
  if (r.press >= 4 && r.pressWon / r.press >= 0.5) out.push([2, `Dit pres vandt bolden ${r.pressWon} af ${pl(r.press, 'gang', 'gange')}.`]);
  if (r.runGoals >= 1) out.push([3, `Løbene uden bold gav ${r.runGoals === 1 ? 'et mål' : `${r.runGoals} mål`}.`]);
  if (r.start?.formation && r.end?.formation && r.start.formation !== r.end.formation) out.push([2, pickBy([`Skiftet fra ${r.start.formation} til ${r.end.formation} undervejs.`, `I gik fra ${r.start.formation} til ${r.end.formation} i løbet af kampen.`, `Formationen blev lagt om fra ${r.start.formation} til ${r.end.formation}.`, `Undervejs blev ${r.start.formation} til ${r.end.formation}.`, `Holdet sluttede i ${r.end.formation} efter at have startet i ${r.start.formation}.`], round, 'sw')]);   // neutralt: skiftet alene beviser ikke udfaldet (QC F4)
  return out.sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, t]) => t);   // højst 2 sætninger om dit hold (Spilfører)
}

// Form ud fra resultaterne i sæsonen (history.results).
function streaks(history) {
  const seq = {};
  for (const r of history) for (const x of r.results ?? []) {
    (seq[x.h] ||= []).push(x.hG > x.aG ? 'W' : x.hG < x.aG ? 'L' : 'D');
    (seq[x.a] ||= []).push(x.aG > x.hG ? 'W' : x.aG < x.hG ? 'L' : 'D');
  }
  const run = (s, pred) => { let n = 0; for (let i = s.length - 1; i >= 0 && pred(s[i]); i--) n++; return n; };
  return Object.fromEntries(Object.entries(seq).map(([id, s]) => [id, { win: run(s, (x) => x === 'W'), lose: run(s, (x) => x === 'L'), unbeaten: run(s, (x) => x !== 'L'), winless: run(s, (x) => x !== 'W'), prevWin: run(s.slice(0, -1), (x) => x === 'W'), last: s.at(-1) }]));
}

// Seerens næste modstander set gennem hans seneste (op til 3) offentlige kampe – optakt-scouting (brugerens valg).
function scout(history, teamId, uptoRound = Infinity) {
  const past = history.filter((r) => r.round <= uptoRound && r.facts?.[teamId]).slice(-3).map((r) => r.facts[teamId]);
  if (!past.length) return null;
  const sum = Object.fromEntries(PUBLIC_FACT_KEYS.map((k) => [k, past.reduce((a, f) => a + (f[k] ?? 0), 0) / past.length]));
  const rule = STYLE_RULES.find((r) => r.test({ ...sum, headerGoals: sum.headerGoals >= 0.5 ? 1 : 0, counterGoals: sum.counterGoals >= 0.5 ? 1 : 0, setPieceGoals: sum.setPieceGoals >= 0.5 ? 1 : 0, reorganised: sum.reorganised >= 0.5 ? 1 : 0, goals: sum.goals >= 1 ? 1 : 0 }));
  return { n: past.length, rule };
}

// Klummen for én seer. input: { matches, gazette, history (sæsonens runder, inkl. den spillede), table (sorteret
// [{teamId, teamName, points}]), next ([{homeId, homeName, awayId, awayName}] – næste runde efter programmet),
// viewerTeamId, round (ligarunde), seasonRound, newSeason }.
export function buildColumn({ matches = [], gazette = null, history = [], table = [], next = [], viewerTeamId = null, round = 0, newSeason = false, champion = null, roundsLeft = null }) {
  const facts = matches.map((m, i) => publicFacts(m, i));
  const vi = facts.findIndex((f) => f.home.id === viewerTeamId || f.away.id === viewerTeamId);
  const vf = vi >= 0 ? facts[vi] : null;
  const report = vi >= 0 ? viewOwnReport(matches[vi], viewerTeamId) : null;   // KUN seerens egen (visibility.js)
  const [me, opp] = vf ? (vf.home.id === viewerTeamId ? [vf.home, vf.away] : [vf.away, vf.home]) : [null, null];
  const form = streaks(history);
  const stories = [];
  const sections = [];

  // 1. Din kamp
  if (vf) {
    const d = drama(vf), res = me.goals > me.against ? 'W' : me.goals < me.against ? 'L' : 'D', score = `${me.goals}-${me.against}`, rev = `${me.against}-${me.goals}`;   // vinderens mål først (QC F7)
    const open = { W: [`Sejr til ${me.name}: ${score} over ${opp.name}.`, `${me.name} tog de tre point mod ${opp.name} (${score}).`, `${score} – ${me.name} slog ${opp.name}.`],
      L: [`${opp.name} slog ${me.name} ${rev}.`, `${opp.name} var for stærke for ${me.name} – ${rev}.`, `${me.name} tabte ${rev} til ${opp.name}.`],
      D: [`${me.name} og ${opp.name} delte point efter ${score}.`, `Uafgjort ${score} mellem ${me.name} og ${opp.name}.`, `Et point hver: ${me.name} – ${opp.name} ${score}.`] }[res];
    const paras = [pickBy(open, round, 'open', me.id)];
    if (d.comeback === me) paras.push('I kom bagfra – det siger noget om moralen.');
    else if (d.late === me) paras.push(`Sejrsmålet kom ${d.lateAt}.`);
    else if (d.late === opp) paras.push(`Det gjorde ondt: ${opp.name} afgjorde det ${d.lateAt}.`);
    paras.push(...yourVerdict(report, me, round));
    // Efter dommen over dit hold (Spilfører v3.16.3: "… mistede en mand på rødt kort. Det kostede: et kontramål imod." læstes som årsag)
    // Røde kort (v3.16.3, Spilfører: klummen nævnte aldrig en udvisning) – offentlige fakta (referatet), begge hold
    // Varianten følger resultatet (QC v3.16.3: "kostede" lovede en årsag til et nederlag, også efter en sejr)
    const down = `${me.reds > 1 ? `${me.reds} røde kort` : 'Et rødt kort'}`, men = 11 - me.reds;
    // Kortet skal være kommet FØR det afgørende mål (v3.16.7, Spilfører: "vandt med 10 mand" efter et kort i 90+5'): det mål,
    // hvorefter vinderen førte resten af kampen; ved uafgjort det sidste mål. Rækkefølgen i referatet, ikke minuttet (QC).
    const isMe = (e) => e.isHome === (vf.home.id === me.id);
    const firstRed = vf.events.findIndex((e) => e.type === 'RED' && isMe(e));
    const gl = vf.events.map((e, i) => ({ e, i })).filter(({ e }) => GOAL_TYPES.has(e.type));
    const lead = ({ e }) => (vf.home.id === me.id ? e.hG - e.aG : e.aG - e.hG);
    const decisive = res === 'D' ? gl.at(-1) : gl.findLast((g, j) => (res === 'W' ? lead(g) > 0 : lead(g) < 0) && (j === 0 || (res === 'W' ? lead(gl[j - 1]) <= 0 : lead(gl[j - 1]) >= 0)));
    const redFirst = me.reds && firstRed >= 0 && decisive && firstRed < decisive.i;
    if (me.reds && !redFirst) paras.push(`${me.name} ${me.reds > 1 ? `fik ${me.reds} røde kort` : 'fik rødt kort'} undervejs.`);
    else if (me.reds) paras.push(res === 'W' ? `${down} til trods: ${me.name} vandt med ${men} mand.` : res === 'L' ? pickBy([`${down} kostede: ${me.name} måtte spille med ${men} mand.`, `Med ${men} mand efter ${me.reds > 1 ? 'udvisningerne' : 'udvisningen'} blev det op ad bakke.`], round, 'red', me.id) : `${me.name} holdt point med ${men} mand efter ${me.reds > 1 ? 'udvisningerne' : 'udvisningen'}.`);
    // Modstanderens kort uden påstand om, hvor længe de var færre (kortets minut er ikke en offentlig fakta her – Spilfører)
    if (opp.reds) paras.push(`${opp.name} ${opp.reds > 1 ? `fik ${opp.reds} røde kort` : 'fik rødt kort'} undervejs.`);
    sections.push({ id: 'col-mine', title: 'Din kamp', paras });
    if (res === 'W' && me.goals - me.against >= 3) stories.push([55, `${me.name} kørte over ${opp.name}`]);
    if (d.comeback === me) stories.push([65, `${me.name} kom tilbage mod ${opp.name}`]);
    if (form[me.id]?.prevWin >= 3 && res !== 'W') stories.push([50, `${gen(me.name)} sejrsstime er slut`]);
  }

  // 2. De øvrige kampe – en fed overskrift pr. kamp (skimbart) og én sætning med det mest bemærkelsesværdige.
  const others = facts.filter((f) => f.idx !== vi).map((f) => {
    const d = drama(f), w = f.home.goals > f.away.goals ? f.home : f.away.goals > f.home.goals ? f.away : null;
    let note;
    if (d.comeback) note = pickBy([`${d.comeback.name} kom bagfra og vandt.`, `${d.comeback.name} vendte kampen.`, `Comeback til ${d.comeback.name}.`], round, 'cb', f.idx);
    else if (d.late) note = pickBy([`Afgjort ${d.lateAt}.`, `${d.late.name} slog til sent – ${d.lateAt}.`, `Sejrsmålet faldt ${d.lateAt}.`], round, 'late', f.idx);
    else {
      // Ved uafgjort ingen "ventede/havde bolden mindst"-forklaring (Spilfører v3.16: den forklarer en sejr, ikke et point)
      const who = w ?? f.home, g = styleGuess(who).filter((r) => w || r.key !== 'wait')[0];
      note = g ? `${who.name} ${say(g, round, f.idx)}.` : '';
    }
    if (d.comeback) stories.push([70, `${d.comeback.name} vendte kampen`]);
    if (d.late) stories.push([60, `Sent drama: ${d.late.name} afgjorde det ${d.lateAt}`]);
    return { idx: f.idx, head: headlineOf(f, round), note };
  });
  if (others.length) sections.push({ id: 'col-others', title: 'De øvrige kampe', others });

  // 3. Rundens spiller og mål (begrundet i offentlige handlinger; karakteren kun for seerens egen spiller – UI'et).
  if (gazette) {
    const p = gazette.playerOfTheRound, star = p && facts.flatMap((f) => f.ratings).find((e) => e.playerId === p.playerId);
    // Kriteriet er karakteren (UI'et siger "rundens bedste karakter"); kampens spiller nævnes først, så "1 mål" ikke står
    // alene, når en holdkammerat scorede to (Spilfører v3.16.4)
    const why = star ? [star.isMotM && 'kampens spiller', star.goals && `${star.goals} mål`, star.assists && `${star.assists} oplæg`, star.saves && `${star.saves} redninger`, star.aerialWins >= 3 && `${star.aerialWins} vundne luftdueller`].filter(Boolean) : [];
    sections.push({ id: 'col-stars', title: 'Rundens spiller og mål', player: p ? { playerId: p.playerId, teamId: p.teamId, why: why.length ? `Begrundelse: ${why.join(', ')}.` : 'Begrundelse: stabil hele kampen.' } : null,
      goal: gazette.goalOfTheRound ? true : null, defensive: !gazette.goalOfTheRound && gazette.defensiveAction ? true : null });
  }

  // 4. Formen – stimer og rundens overraskelse (kun sæsonens resultater; ét gæt ad gangen).
  const formParas = [];
  if (gazette?.upset) { formParas.push(`Rundens overraskelse: nr. ${gazette.upset.winnerPos} ${gazette.upset.winner} slog nr. ${gazette.upset.loserPos} ${gazette.upset.loser} ${gazette.upset.score}.`); stories.push([90, `Overraskelse: ${gazette.upset.winner} slog ${gazette.upset.loser}`]); }
  const name = (id) => table.find((t) => t.teamId === id)?.teamName ?? '';
  const hot = Object.entries(form).filter(([, s]) => s.win >= 3).sort((a, b) => b[1].win - a[1].win)[0];
  const cold = Object.entries(form).filter(([, s]) => s.lose >= 3).sort((a, b) => b[1].lose - a[1].lose)[0];
  if (hot) formParas.push(pickBy([`${name(hot[0])} har vundet ${hot[1].win} i træk.`, `${hot[1].win} sejre i træk til ${name(hot[0])}.`, `${name(hot[0])} er i flyvende form: ${hot[1].win} sejre i træk.`], round, 'hot', hot[0]));
  if (cold) formParas.push(pickBy([`${name(cold[0])} har tabt ${cold[1].lose} i træk.`, `Krise hos ${name(cold[0])}: ${cold[1].lose} nederlag i træk.`, `${name(cold[0])} kan ikke finde vejen: ${cold[1].lose} nederlag i træk.`], round, 'cold', cold[0]));
  if (table.length && history.length >= 2) {
    const gap = table[1] ? table[0].points - table[1].points : null;
    // Titlen afgjort før tid (Spilfører v3.16.4): et forspring på MERE end 3 point pr. resterende runde kan ikke indhentes –
    // ved lige point afgør målforskel, så lighed er ikke afgjort. roundsLeft kommer fra programmet (app.js), ikke fra historikken.
    const decided = !newSeason && roundsLeft > 0 && gap != null && gap > 3 * roundsLeft;
    // Overskrift kun i runden, det blev afgjort (Spilfører på planen: ellers samme overskrift resten af sæsonen) – pointene
    // før runden regnes af rundens resultater i historikken
    const earned = {};
    for (const x of history.at(-1)?.results ?? []) {
      earned[x.h] = (earned[x.h] ?? 0) + (x.hG > x.aG ? 3 : x.hG === x.aG ? 1 : 0);
      earned[x.a] = (earned[x.a] ?? 0) + (x.aG > x.hG ? 3 : x.hG === x.aG ? 1 : 0);
    }
    const before = (t) => t.points - (earned[t.teamId] ?? 0);
    const wasDecided = decided && before(table[0]) - Math.max(...table.slice(1).map(before)) > 3 * (roundsLeft + 1);
    if (decided && !wasDecided) stories.push([95, `${table[0].teamName} er mester før tid`]);
    formParas.push(decided ? `🏆 ${table[0].teamName} er mester – ${roundsLeft === 1 ? 'én runde' : `${roundsLeft} runder`} før tid (${gap} point foran ${table[1].teamName}).` : newSeason ? null : gap === 0 ? `${table[0].teamName} og ${table[1].teamName} står lige i toppen med ${table[0].points} point.` : `${table[0].teamName} fører med ${table[0].points} point${gap != null ? `, ${gap} foran ${table[1].teamName}` : ''}.`);
  }
  // Ved sæsonslut står mesteren i banneret og avisens sæsonslut-afsnit – ikke en tredje gang her (v3.16.7, Spilfører/QC)
  const fp = formParas.filter(Boolean);
  if (fp.length) sections.push({ id: 'col-form', title: 'Formen', paras: fp });

  // 5. Næste runde – seerens modstander set gennem hans seneste offentlige kampe, og opfølgning på sidste gæt.
  const preview = [];
  if (opp) {
    // Hvad journalisten skrev om netop denne modstander før runden (samme regel på historikken før runden) – holdt det?
    const before = scout(history, opp.id, round - 1);
    if (before?.rule) {
      // Dommen siger kun, hvad kampens tal bærer (v3.16.7, Spilfører/QC): 'wait' holder med under halvdelen af bolden og mål
      // (42 % er gættets tærskel, ikke sandhedens); 'air' tæller hovedstød efter dødbolde med (headerGoals er kun åbent spil).
      const k = before.rule.key, said = `Før kampen skrev jeg, at ${opp.name} ${pickBy(before.rule.say, round - 1, k, 'scout')}`;
      const spHead = vf.goals.filter((g) => g.teamName === opp.name && (g.kind === 'CORNER' || g.kind === 'SETPIECE')).length;
      const airAll = opp.headerGoals + spHead;
      const held = k === 'wait' ? opp.poss < 50 && opp.goals >= 1 : k === 'air' ? before.rule.test(opp) || (airAll >= 1 && airAll * 2 >= opp.goals) : before.rule.test(opp);
      const why = k === 'wait' && opp.goals >= 1 && !before.rule.test(opp) ? (held ? ` – de scorede med ${opp.poss} % af bolden` : `, men de havde ${opp.poss} % af bolden mod jer`)
        : k === 'air' && held && spHead && !before.rule.test(opp) ? ` – ${spHead === opp.goals ? (spHead === 1 ? 'deres eneste mål' : spHead === 2 ? 'begge deres mål' : `alle ${spHead} mål`) : `${spHead} af deres mål`} kom på hovedstød efter dødbolde` : '';
      preview.push(held ? `${said} – det holdt også mod jer${why}.` : k === 'wait' && opp.goals >= 1 ? `${said} – de scorede igen${why}.` : `${said} – det gjorde de ikke mod jer.`);
    }
  }
  const nx = next.find((x) => x.homeId === viewerTeamId || x.awayId === viewerTeamId);
  if (nx) {
    const nOpp = nx.homeId === viewerTeamId ? { id: nx.awayId, name: nx.awayName } : { id: nx.homeId, name: nx.homeName };
    const sc = scout(history, nOpp.id);
    preview.push(`${newSeason ? 'Ny sæson: ' : 'Næste runde: '}${nx.homeId === viewerTeamId ? `${nOpp.name} kommer på besøg` : `ude mod ${nOpp.name}`}.${newSeason ? '' : form[nOpp.id]?.win >= 2 ? ` De har vundet ${form[nOpp.id].win} i træk.` : form[nOpp.id]?.lose >= 2 ? ` De har tabt ${form[nOpp.id].lose} i træk.` : ''}`);
    if (sc?.rule && !newSeason) preview.push(`Mit bud ud fra ${sc.n === 1 ? 'deres seneste kamp' : `deres seneste ${sc.n} kampe`}: ${nOpp.name} ${pickBy(sc.rule.say, round, sc.rule.key, 'scout')} – det kan blive kampens tema.`);   // v3.16.7: "… ud fra" stod efter verbet
  }
  if (preview.length) sections.push({ id: 'col-next', title: 'Næste runde', paras: preview });

  // Overskriften: rundens største historie (Spilfører) – ellers dit resultat eller rundens største sejr.
  stories.sort((a, b) => b[0] - a[0]);
  const title = stories[0]?.[1] ?? (vf ? headlineOf(vf, round) : others[0]?.head ?? 'Runden');
  return { title, sections };
}

// Overskrift pr. kamp (genbruger avisens tre varianter pr. udfald).
const HEADS = {
  BIG: [(w, l, s) => `${w} knuser ${l} ${s}`, (w, l, s) => `Opvisning: ${w} sender ${l} hjem med ${s}`, (w, l, s) => `${l} får klø – ${w} vinder ${s}`],
  WIN: [(w, l, s) => `${w} slår ${l} ${s}`, (w, l, s) => `${w} snupper sejren mod ${l} (${s})`, (w, l, s) => `Tre point til ${w} efter ${s} mod ${l}`],
  DRAW0: [(h, a) => `Målløst mellem ${h} og ${a}`, (h, a) => `Taktisk skak: ${h} og ${a} deler 0-0`, (h, a) => `Ingen vinder – ${h} og ${a} spiller 0-0`],
  DRAW: [(h, a, s) => `Point deles: ${h} – ${a} ${s}`, (h, a, s) => `${h} og ${a} skilles ${s}`, (h, a, s) => `Uafgjort ${s} mellem ${h} og ${a}`],
};
export function headlineOf(f, round) {
  const hG = f.home.goals, aG = f.away.goals, pick = (list) => list[(hG * 7 + aG * 3 + round) % list.length];
  if (hG === aG) return hG === 0 ? pick(HEADS.DRAW0)(f.home.name, f.away.name) : pick(HEADS.DRAW)(f.home.name, f.away.name, `${hG}-${aG}`);
  const [w, l, s] = hG > aG ? [f.home.name, f.away.name, `${hG}-${aG}`] : [f.away.name, f.home.name, `${aG}-${hG}`];
  return pick(Math.abs(hG - aG) >= 3 ? HEADS.BIG : HEADS.WIN)(w, l, s);
}
