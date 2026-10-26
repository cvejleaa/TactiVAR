// TactiVAR Manager – binder motor, gem og brugerflade sammen.
import { renderStats } from './ui/stats.js';
import { VERSION } from './version.js';
import { createRng, randomSeed } from './engine/rng.js';
import { createLeague } from './engine/generator.js';
import { matchBenchOf, reservesOf, FOCUS, willRetire, RETIRE_WARN_ROUND, publicWage, wageRoomPerRound } from './engine/career.js';
import { loadGame, saveGame, resetGame, exportGame, importGame, backupRaw, SAVE_KEY } from './state/storage.js';
import * as act from './state/actions.js';
import { h, select } from './ui/dom.js';
import { kr } from './ui/labels.js';
import { renderMatrix } from './ui/matrix.js';
import { renderLineupList } from './ui/lineup-list.js';
import { renderTrainingTable } from './ui/training.js';
import { renderCard, trainingSummary } from './ui/card.js';
import { renderClub, shownCash, renderMarket, renderTransferLog, renderPublicClub } from './ui/club.js';
import { marketInfo, buyPlayer, setListed, acceptOffer, declineOffer, isStarter } from './engine/transfers.js';
import { renderSeasonReport } from './ui/season-report.js';
import { viewTeam } from './engine/visibility.js';
import { renderPitch } from './ui/pitch.js';
import { renderTactics } from './ui/tactics.js';
import { renderStandings } from './ui/standings.js';
import { playRound, commitRound, pairRound, sortStandings, seasonJustEnded } from './engine/season.js';
import { buildColumn } from './engine/column.js';
import { seasonRoundOf, roundsLeftOf } from './engine/schedule.js';
import { renderLastRound, renderSchedule } from './ui/rounds.js';
import { renderMatchCenter, renderGazette } from './ui/matchcenter.js';
import { replayJump, clearReplays } from './ui/replay.js';

export const PLAYBACK_MS = 420;
let mc = null;            // Match Center: { round, matches, gazette, viewIdx, filter, shownCount, playing }
// v3.19.0: fanerne står i den faste topbar (brugeren); Gem/Eksportér/Importér/Ny liga i ⚙ Admin. [nøgle, ikon, tekst]
const TABS = [['trup', '👥', 'Trup'], ['taktik', '📋', 'Taktik'], ['kamp', '📺', 'Kamp'], ['liga', '🏆', 'Liga'], ['klub', '💼', 'Klub'], ['admin', '⚙', 'Admin']];
// Seneste runde vist færdigspillet (Kamp-fanen uden igangværende afspilning).
const lastRoundView = (r) => ({ round: r.round, matches: r.matches, gazette: r.gazette, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false });
function showTab(k) { game.ui.tab = k; clearSwap(); view.notice = ''; view.marketMsg = ''; persist(); render(); window.scrollTo(0, 0); }
let timer = null;

const storage = window.localStorage;
let game = null;          // { league, notes, ui } – det der gemmes
// pitchSwapId = det ene påbegyndte byt, uanset om det startede i regnearket, på banen eller på bænken.
let view = { viewTeamIdx: 0, sortCol: 'pos', sortDesc: false, filter: 'all', selectedPlayerId: null, pitchSwapId: null, notice: '', savedAt: null };

// Skift af hold/visning afbryder et påbegyndt byt, så et senere klik aldrig bytter uden varsel.
const clearSwap = () => { view.pitchSwapId = null; view.pickMsg = ''; };
// Holdvælgeren viser holdet i Trup, hvis man står i Kamp/Liga/Admin (der ville valget ellers ikke ses).
// Sæson og sæsonens runde for ligaens løbende runde r (efter sæsonslut hører r til den afsluttede sæson)
function seasonAndRound(league, r) {
  const s = (league.seasons ?? []).find((x) => x.programmed !== false && r >= x.fromRound && r <= x.toRound);
  return s ? [s.seasonNumber, r - s.fromRound + 1] : [league.leagueMetadata.seasonNumber ?? 1, r - league.seasonStartRound + 1];
}
function showTeam(idx) {
  view.viewTeamIdx = idx; clearSwap(); view.notice = ''; view.marketMsg = ''; view.trainMsg = ''; view.selectedPlayerId = game.league.teams[idx].squad[0].id;
  if (game.ui.tab === 'kamp' || game.ui.tab === 'liga' || game.ui.tab === 'admin') { game.ui.tab = 'trup'; persist(); }   // Klub bliver: den viser holdets klubside
  render();
}
// Et nyt spil (ny liga/import) må ikke vise den gamle ligas runde i Kamp-fanen.
function dropMatchView() { clearInterval(timer); timer = null; mc = null; pendingRaw = null; } // nyt spil: den gamle fil er taget backup af (resetGame)

const app = document.getElementById('app');
const controls = document.getElementById('controls');
const tabbar = document.getElementById('tabbar');
document.getElementById('version').textContent = 'v' + VERSION;

const myIdx = () => game.league.teams.findIndex((t) => !t.isBot);
const myTeam = () => game.league.teams[myIdx()];

function newGame() {
  return { league: createLeague(createRng(randomSeed())), notes: {}, ui: { activePresetIndex: 0, seenVersion: VERSION } };
}

// Nyt i en version, der ikke ændrer gemme-formatet (vises én gang, ved første indlæsning).
// a nyere end b ("3.12.1" > "3.12.0"); en ukendt/manglende version er ældst.
const newerThan = (a, b) => { const x = String(a ?? '0').split('.').map(Number), y = String(b ?? '0').split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
const NEWS = {
  '3.12.0': 'Nyt i kampene: Angrebsfokus bestemmer nu, hvordan chancerne kommer – "Lave cutbacks" giver rigtige cutbacks fra baglinjen, og "Direkte lange bolde" tvinger ikke længere chancerne op i luften. Bolden går til den, der står nærmest, hvor den spilles hen (også dine trukne positioner). Dine hovedstødsspillere kan nu vinde luftduellerne. Modgift: lav blok mod indlæg, højt gegenpres mod cutbacks. Se dit angreb og dit felt i fuldtids-analysen.',
  '3.12.1': 'Spillerne rykker nu med i kampen: frem når I har bolden og mod boldsiden – og løb uden bold fører flere ind i feltet, så også midtbanen og backs kommer til at score. Målene fordeler sig nu tæt på Superligaens: flere fra midtbanen og forsvaret, langskud fra kanten af feltet, færre kontramål. Efter slutfløjt kan du trykke 📍 ved et mål fra åbent spil eller kontra for at se, hvor dit hold stod.',
  '3.13.0': 'Udskiftninger under kampen: friskheden falder nu i løbet af kampen – mest for spillere med lav udholdenhed (STA) – og en træt spiller yder mindre. Under Taktik → "Udskiftninger under kampen" vælger du, hvornår en træt spiller skiftes ud (sat til 70 %; kan slås fra). Der må skiftes 5 gange i 3 pauser som i FIFA/UEFA-turneringer, og dine regler under Taktik kan nu også lave en udskiftning – fx i et bestemt minut uanset stilling.',
  '3.14.0': 'Avisen er blevet en klumme: rundens største historie som overskrift, din kamp med journalistens vurdering af dine valg, de øvrige kampe, rundens spiller og mål, formen i ligaen – og en optakt til din næste kamp med et bud på modstanderens stil ud fra hans seneste kampe. Runden efter følger journalisten op på, om buddet holdt.',
  '3.14.1': 'Rettelser: VAR tjekker nu offside for den forreste – scorer en spiller længere tilbage, er det hans forreste holdkammerat, der tjekkes, og billedet ved målet viser skytten, hvor han skød fra. Statistikken på Liga-fanen gælder sæsonen.',
  '3.14.2': 'Rettelse: Ved et VAR-tjek står den tjekkede nu, hvor han stod (forrest), i billedet ved målet – ikke flyttet bag en holdkammerat.',
  '3.14.3': 'Rettelser: Langskud tages fra skudafstand (ikke fra egen banehalvdel) i billedet ved målet, referatet fortæller et oplæg én gang, og efter sæsonens sidste runde viser tabellen slutstillingen og mesteren, til næste sæson går i gang.',
  '3.20.1': 'Rettelser: 📋 Taktik har formation, faser og Hvis-Så lige under banen, og tabellerne ruller ikke længere for sig selv. Efter kampen står afspilningen til venstre med statistik og referat ved siden af. 🏆 Liga viser "Bedste snit" for sæsonen (stjernerne fra hver kamp, mindst 3 kampe) og "Rundens bedste", og rundens spiller får en rigtig begrundelse (taktiske dueller, holdt nullet).',
  '3.20.0': 'Det koster nu at spille uden for sin position (naboplads −2,5 %, andet −6 %, målmand ⇄ markspiller −15 % i dueller): ⚠ på brikken og i listen på 📋 Taktik viser hvem, og forklaringen står under listen. Skifter du formation (også med Hvis-Så eller Plan B/C), flyttes de 11 selv, så flest står rigtigt – knappen "⇄ Stil op efter position" gør det samme. Botterne stiller op efter position, og ungdomsspillere får den position, holdet mangler.',
  '3.19.0': '🧭 Nyt layout: fanerne står fast i topbaren, og Gem, Eksportér, Importér og Ny liga er flyttet til ⚙ Admin (gem-kvitteringen står stadig øverst). Opstillingen er samlet på 📋 Taktik: banen med en spillerliste ved siden af – klik på en brik, så viser listen hans kæde med de vigtigste evner, og klik på en anden spiller for at bytte. 👥 Trup har nu kolonnerne 💰 Værdi og Løn/rd og en samlet 🏋️ træningsoversigt – træning sættes kun dér. Bænken udtages ved listen ("Udtag automatisk"), og regnearkets 🔁-knapper er væk. Står du i 💼 Klub og vælger et andet hold, ser du hans offentlige klubside med priser og Køb.',
  '3.18.1': '💰 Nu kan du købe: de andre klubber sælger også, når de kun har 18 spillere (de henter selv en ungdomsspiller), og 💼 Klub → Transfermarked viser alle spillere, du kan købe lige nu, med pris og Køb-knap.',
  '3.18.0': '🏋️ Livsløb: vælg træning pr. spiller på spillerkortet (den gælder, til du ændrer den). Alle bliver et år ældre ved sæsonslut, de ældste stopper (de varsles fra runde 10), og der kommer ungdomstilbud. 💼 Klub viser økonomien – tilskuere, TV, løn og præmie – og transfermarkedet: køb en anden klubs spiller til den faste pris på kortet, når vinduet er åbent (før runde 8 og ved sæsonslut). Kampe står på kortet under 📜 Kampe. Truppen må være 18–25; bænken er de 7 udtagne.',
  '3.17.0': '⚽ Kampene ligner rigtig fodbold: omkring 25 afslutninger pr. kamp, og knap hvert tredje skud på mål går ind. De mange små skud – fra kanten, en løs bold i feltet, en let redning – står nedtonet i referatet og springes over i ⭐ Højdepunkter, medmindre de går ind; målmanden betyder noget for dem. Din opbygning tæller nu: kommer I igennem presset, får I langt oftere en stor chance – og det samme gælder modstanderens opbygning mod jeres pres. Botterne har hver deres Hvis-Så, og en skadet spiller, der er skiftet ud, nævnes ikke igen. Dødbolde slås af kant- og midtbanespillere, færre FASE-linjer i de andre kampe, og Rundens mål nævner ikke typen to gange. Sæsonens snit og spejderens "seneste 3 kampe" blander gamle og nye kampe den første tid.',
  '3.16.7': '🗞️ Klummen og referatet siger kun det, kampen viser: rigtige procenter, "Det kostede" kun med en årsag, et rødt kort "til trods" kun når det kom før det afgørende mål, og mesteren ikke tre gange på samme side. VAR tjekker ikke offside på hjørnespark eller på den, der selv spillede bolden, og linjedommeren vinker ikke efter en cutback. Dit pres og din offside-fælde tælles hver for sig. Cutbacks laves af kant og back, og færre gentagelser i referatet (offside-fælden, hovedstød, skud forbi). Decimalkomma og ental/flertal.',
  '3.16.6': '🔧 Rettede fejl i kampene: en haltende spiller bliver på banen, men tager ikke straffe og dødbolde ("#9 halter – #10 tager straffen") og skiftes automatisk ud i pausen, hvis der er et skift tilbage (det bruger et af dine skift). Botterne skifter for træthed først fra pausen og gemmer et skift til skader. En hvilet spiller kommer ikke ind for en skadet. Oplægget går aldrig til skytten selv, frisparket kommer fra samme forseelse som kortet, og modstanderens cutbacks står alle i referatet.',
  '3.16.5': '📰 Rettede tekster: dit opspil står nu før redningen, et rødt kort som VAR lader stå siger det, og et Hvis-Så-skift med færre mand siger "med ti mand". Klummen siger, når mesterskabet er afgjort før tid, og om rundens spiller også var kampens spiller. Kampene er uændrede.',
  '3.16.4': '⏱️ Rigtige minutter: referatet, tidslinjen, karakterarket og afspilningen viser nu kampens minut (7\', 38\', 45+2\', 90+4\') i stedet for kun hvert 3. minut. Hver halvleg får tillægstid efter det, der skete – skift, mål, kort, skader og VAR-tjek – og referatet siger, hvor meget der blev lagt til, og hvor meget af det VAR stod for. En Hvis-Så-regel står aldrig før det minut, du har sat. Kampene er uændrede; seneste runde fra før opdateringen viser de gamle minutter.',
  '3.16.3': '🎬 Afspilningen vender nu altid sådan, at dit hold angriber opad – også på udebane – og målmanden står ved sin mållinje. Startopstillingen under modstanderens zone-kort vender som kortet. 📍 ved målene er afløst af 🎬, der viser samme mål i afspilningen. Referatet: færre gentagelser ("styrer midtbanen", "stiger højest", "omorganiserer sig" og lynkontraen; en kamp gentager ikke en måltekst), rigtigt ejefald ("Rovers\' pres"), begge holdnavne når to spillere nævnes, og minuttet står ved linjen i stedet for i teksten. Klummen nævner røde kort, skriver "X slog Y 1-0" og forklarer ikke et uafgjort resultat med "havde bolden mindst". Sæsonslut: Liga-statistikken viser den afsluttede sæson, indtil den nye er i gang, VAR± står i slutstillingen, og mesterskabet siger, om det blev afgjort på point, målforskel eller scorede mål. Kampene er uændrede.',
  '3.16.2': '🎬 Afspilningen viser nu, hvor skuddet ender: efter hver afslutning går bolden i nettet, ind til målmanden, der redder, til forsvareren, der blokerer, på stolpen, over eller forbi – som referatet siger, og målet er tegnet på banen. 🎬 i referatet viser afslutningen og standser på udfaldet. Og har holdet bare bolden to gange i træk med samme spiller, spiller det den rundt bagfra, så billedet ikke står stille. Kampene er uændrede.',
  '3.16.1': '🎬 Afspilningen ligner nu fodbold: holdene står i deres formation – ingen linjer, hvor hele holdet står på samme sted, og ingen brikker oven i hinanden (en spiller ved en modspiller træder et skridt til siden). Ved afsparket står begge hold i egen halvdel. Hvert 3. minut viser billedet, hvordan duellen gik: bolden hos opspilleren, hos angriberen, når holdet spiller sig frem, hos den, der erobrede den, eller ved den, der blev fanget offside. Modstanderen har fået et groft kort: banen i 3 × 3 felter set fra din side med andelen pr. felt og deres afslutninger. Kampene ændrer sig lidt, fordi spillernes placering indgår i, hvem der får bolden – målniveauet er det samme. Seneste runde fra før opdateringen viser de gamle billeder, indtil næste runde er spillet.',
  '3.16.0': '🎬 Afspilning og 🔥 heat map: efter slutfløjt kan du se kampen som taktiktavle i Kamp-fanen – begge hold og bolden hvert 3. minut og ved hver afslutning i åbent spil og på kontra (dødbolde har intet billede), med ▶ afspil, trin frem og tilbage, hastighed og ⭐ Højdepunkter. 🎬 ved en afslutning i referatet springer dertil. I karakterarket viser 🔥 Heat map, hvor dit hold stod og afsluttede – klik på en spiller for hans eget kort med afslutningerne (mål, reddet, forbi). Modstanderen ses kun groft (tyngdepunkt i tredjedele). Samtidig regnes holdenes placering nu i forhold til hinanden: angriberne står på modstanderens offside-linje (ikke bag den), og den, der vinder sit løb, slipper igennem; uden bold rykker holdet sammen efter sit pres (lav blok dybt, gegenpres højt); mod en lav blok skydes der oftere udefra; kontraens skytte løber ind i feltet. Kampene ændrer sig lidt – målniveauet er det samme. Afspilning findes for seneste runde.',
  '3.15.1': 'VAR som i virkeligheden: VAR er ikke længere en chancetype – chancen afgøres først (mål, redning eller forbi), og VAR tjekker bagefter. Et mål kan tjekkes for offside eller et frispark i opspillet: du ser bolden i nettet og stillingen tælle op, så kendelsen – og annulleres målet, falder stillingen tilbage. VAR tjekker også straffespark (filmning giver gult) og kan selv give et, dommeren ikke så, og det tjekker røde kort (et kan blive gult, en grov tackling kan blive rødt). Linjedommeren kan løfte flaget efter en afslutning. Skud kan nu gå forbi, over, på stolpen eller blive blokeret – færre skud på mål, som i Superligaen. VAR ± i tabellen tæller nu kun de kendelser, VAR ændrede (et godkendt mål tæller ikke længere +1).',
  '3.15.0': 'Røde kort: andet gule kort giver rødt, og en grov tackling kan give direkte rødt. Den udviste må ikke erstattes – holdet spiller resten af kampen med ti mand og bliver både svagere og hurtigere træt. (Karantæne kommer senere.) Kampens spiller: mål tæller nu fuldt ud, vundne dueller på midtbanen mindre, og resultatet tæller med – en målmand på det tabende hold vinder sjældent. Træthedsskift sker højst tre ad gangen (også i pausen), så et hold ikke bruger alle sine skift på én gang.',
};

// Et migreret spil, hvis gamle fil ikke kunne tages backup af (fuldt lager): den gamle fil må
// ikke overskrives, før backuppen er lykkedes – hvert gem prøver igen (Release Manager v3.11:
// ellers slettede første klik den gamle liga uden backup).
let pendingRaw = null;

function persist() {
  if (pendingRaw) {
    const key = backupRaw(storage, pendingRaw);
    if (!key) {
      view.saveError = 'Det gamle spil kunne ikke tages backup af';
      window.tactivarFejl?.('Spillet er IKKE gemt: det gamle spil kunne ikke tages backup af (er browserens lager fuldt?). Eksportér med ⬇ Eksportér i ⚙ Admin, og ryd plads i browseren.');
      return;
    }
    pendingRaw = null; view.backupKey = key;
  }
  const r = saveGame(storage, game);
  if (r.ok) { view.savedAt = r.savedAt; view.saveError = null; }
  else { view.saveError = r.error; window.tactivarFejl?.(r.error); }
}

// Én ændring = ændr, gem, tegn igen. Modstanderhold tilbyder ingen redigering (låste
// felter, ingen byt-knapper, ingen træk) – det er vagten, og e2e-testen holder øje med den.
// Den aktive plan holdes lig med live-taktikken, så Hvis-Så-regler til "Plan A" er det, man ser.
// Klummen for den, der ser (v3.14): bygges ved visning ud fra den sidste runde, sæsonens forløb, tabellen og
// næste runde i programmet. Efter sæsonslut: den afsluttede sæsons forløb og tabel, og næste runde er en ny sæsons.
// En fejl i klummen må ikke tage Liga- og Kamp-fanen med: den gamle avis vises, og fejlen står i fejlboksen (Release Manager).
function columnNow() {
  try { return buildColumnNow(); } catch (e) { console.error(e); window.tactivarFejl?.(`Klummen kunne ikke bygges – avisen vises i stedet (${e.message}).`); return null; }
}
function buildColumnNow() {
  const L = game.league, lr = L.lastRound;
  if (!lr?.matches?.length) return null;
  const end = lr.gazette?.seasonEnd, from = end ? end.fromRound : L.seasonStartRound ?? 1;
  const history = (L.history || []).filter((r) => r.round >= from && r.round <= lr.round);
  const table = (end ? end.table : sortStandings(L.leagueMetadata.standings)).map((r) => ({ teamId: r.teamId, teamName: r.teamName, points: r.points }));
  let next = [];
  try { next = pairRound(L).map(([hI, aI]) => ({ homeId: L.teams[hI].id, homeName: L.teams[hI].name, awayId: L.teams[aI].id, awayName: L.teams[aI].name })); } catch { next = []; }
  return buildColumn({ matches: lr.matches, gazette: lr.gazette, history, table, next, viewerTeamId: myTeam().id, round: lr.round, newSeason: !!end, champion: end?.champion ?? null,
    roundsLeft: roundsLeftOf(L, lr.round, !!end) });
}

function change(fn) { fn(); act.syncActivePreset(myTeam(), game.ui.activePresetIndex); persist(); render(); }

function start() {
  const r = loadGame(storage);
  if (r.status === 'error') return renderLoadError(r);
  if (r.status === 'empty') { game = newGame(); persist(); }
  else {
    game = r.state; view.savedAt = r.state.savedAt;
    if (r.repairs?.length) view.notice = `🛠 ${r.repairs.join(' ')}`;
    if (r.migratedFrom != null) {
      view.notice = migrationNotice(r.migratedFrom) + (r.backupKey ? ' Det gamle spil ligger som backup i browseren.' : '');
      view.backupKey = r.backupKey || null; // knap i beskeden: hent den gamle version som fil
      // Gem straks i det nye format (ellers tog hver genindlæsning en ny backup) – men kun
      // når backuppen af det gamle format lykkedes; ellers står det gamle urørt, og der advares.
      if (r.backupKey) persist();
      else { pendingRaw = storage.getItem(SAVE_KEY); window.tactivarFejl?.('Dit spil er opdateret, men der kunne ikke tages backup af det gamle format (er browserens lager fuldt?). Eksportér spillet med ⬇ Eksportér i ⚙ Admin som sikkerhed.'); }
    }
  }
  if (game.ui.seenVersion !== VERSION) {
    // Alle nyheder siden den version, spilleren sidst så (v3.12.1: hopper man fra 3.11 til 3.12.1, får man også 3.12.0's).
    const news = Object.keys(NEWS).filter((v) => newerThan(v, game.ui.seenVersion) && !newerThan(v, VERSION)).sort((a, b) => (newerThan(a, b) ? 1 : -1)).map((v) => NEWS[v]);
    if (news.length && r.status === 'ok') view.notice = [view.notice, ...news].filter(Boolean).join(' ');
    game.ui.seenVersion = VERSION; persist();
  }
  view.viewTeamIdx = myIdx();
  view.selectedPlayerId = myTeam().squad[3].id;
  render();
}

// Startere under din udskiftningsgrænse (v3.13, QC: advarslen fulgte før en fast 70 %, også når grænsen
// var en anden) – de skiftes ud i første tick. Uden grænse: under 70 % (under en fast starters ligevægt).
const tiredLimit = () => myTeam().subsLimit || 70;
function tiredStarters() {
  const t = myTeam();
  // Målmanden skiftes ikke for træthed – han tælles kun uden grænse (QC v3.13).
  return t.squad.filter((p) => t.tactics.lineupSlots.slice(t.subsLimit ? 1 : 0).includes(p.id) && p.freshness < tiredLimit()).length;
}

// Forklaringen på en migrering – både ved indlæsning og ved import af en ældre fil.
function migrationNotice(from) {
  if (from == null) return '';
  return 'Dit spil er opdateret: ' + [
    from <= 1 ? 'Hvis-Så-regler kan nu sættes til "Bagud/Foran med mindst N mål" og skifte til dine egne planer – "Foran med 1" gælder fra 1 mål og opefter.' : '',
    from <= 2 ? 'Mod-kunnen er sat ca. 45 % ned (alle hold): hver spiller har nu højst 100 point fordelt på de tre stilarter – lærer han noget nyt, glemmer han lidt af det gamle.' : '',
    from <= 3 ? 'Spillerhøjderne er rettet efter Superliga-målinger (ligasnit ca. 184 cm, 168–201 cm) – hver spiller beholder sin plads i højde-rækkefølgen i sin kæde, og luftduellerne er regnet om. Friskhed betyder nu noget: en kamp koster efter løbet distance, og en træt spiller yder mindre (50 % friskhed ≈ 12,5 % svagere).' : '',
    from <= 5 ? 'Nu spilles der efter et fast kampprogram: 14 runder, hvor alle møder alle hjemme og ude – se det på Liga-fanen. Modstandervælgeren er væk; ▶ spiller altid programmets næste runde. Tabellen indtil nu er arkiveret som "Sæson 1 (uden program)" under Tidligere sæsoner, og en ny sæson starter med nulstillet tabel og sæsonstatistik (spillere og friskhed er uændrede). Clean sheets tælles kun for målmænd.' : '',
    from <= 6 ? 'Ny i v3.18: træning, aldring, økonomi og transfers – se 💼 Klub. Alle spillere bliver et år ældre ved sæsonslut, lønnen følger nu de offentlige stjerner og alderen, og spillere med samme kortnavn på tværs af holdene har fået et nyt navn.' : '',
    from <= 4 ? 'Hver spiller har nu en naturlig position (kolonnen "Natur"), og højden følger Superliga-dokumentets tabel pr. position: midtstoppere og målmænd højere, backs og kanter lavere. Den højeste i hver position er stadig den højeste – i hver kæde blev de højeste til stoppere/angribere og de laveste til backs/kanter. Luftduellerne er regnet om. Løbene i kampen følger nu den plads, spilleren står på (CM løber længst, kanter og wingbacks har flest højintense løb) – sæsonens km og andel højintenst på spillerkortet blander indtil videre den gamle og den nye beregning.' : '',
    from <= 7 ? dmNotice() : '',
  ].filter(Boolean).join(' ');
}
// 7 → 8 (v3.20.0, QC): hvem der blev DM på dit hold, og hvor mange af dine der nu står uden for position – din opstilling er urørt
function dmNotice() {
  const t = myTeam(), dm = t.squad.find((p) => p.position === 'DM'), out = act.outOfPositionCount(t);
  return `🛡️ Defensiv midtbane (DM) er en ny position${dm ? ` – på dit hold er #${dm.shirtNumber} ${dm.shortName} nu DM` : ''}. Din egen opstilling er ikke ændret${out ? `: ${out} af dine står uden for position (⚠ på 📋 Taktik) – tryk "⇄ Stil op efter position", eller lad dem stå, hvis det er bevidst` : ', og alle står på deres position'}.`;
}

function renderLoadError(r) {
  controls.replaceChildren();
  app.replaceChildren(h('div', { class: 'panel errorpanel', id: 'load-error' },
    h('h2', {}, '⚠ Det gemte spil kunne ikke indlæses'),
    h('p', {}, r.error),
    r.backupKey ? h('p', {}, `Dine data er IKKE slettet: de er gemt i browseren under "${r.backupKey}". Hent dem som fil, og send filen med, hvis du vil have dem reddet.`) : null,
    r.backupKey ? h('button', { id: 'download-backup', onclick: () => download(storage.getItem(r.backupKey), `${r.backupKey}.json`) }, '⬇ Hent backup som fil') : null,
    h('div', { class: 'row' },
      h('button', { id: 'start-new', onclick: () => { const g = newGame(); const res = resetGame(storage, g); if (!res.ok) { window.tactivarFejl?.(res.error); return; } dropMatchView(); game = g; view.viewTeamIdx = myIdx(); render(); } }, '🎲 Start en ny liga'),
      importButton())));
  document.body.dataset.klar = 'ja';
}

function importButton() {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'import-file', onchange: async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = importGame(await file.text());
    if (!r.ok) { window.tactivarFejl?.(`Import mislykkedes: ${r.error}`); return; }
    const res = resetGame(storage, r.state);
    if (!res.ok) { window.tactivarFejl?.(res.error); return; }
    dropMatchView(); game = r.state; game.ui.tab = 'trup'; view.viewTeamIdx = myIdx(); view.notice = `Spillet er importeret fra ${file.name}.${res.backupKey ? ` Det tidligere spil ligger som backup (${res.backupKey}).` : ''} ${migrationNotice(r.migratedFrom)}`.trim(); view.savedAt = res.savedAt; render();
  } });
  return h('span', {}, input, h('button', { onclick: () => input.click() }, '⬆ Importér'));
}

function download(text, name) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}
const exportFile = () => download(exportGame(game), `tactivar-${new Date().toISOString().slice(0, 10)}.json`);

const time = (ms) => new Date(ms).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Din næste kamp efter programmet: sæsonens runde, modstander og hjemme/ude.
function nextMatch() {
  const L = game.league, mine = myIdx(), pair = pairRound(L).find((p) => p.includes(mine));
  return { k: seasonRoundOf(L, L.leagueMetadata.round + 1), opp: L.teams[pair[0] === mine ? pair[1] : pair[0]], home: pair[0] === mine };
}

function renderControls() {
  const teams = game.league.teams, next = nextMatch();
  controls.replaceChildren(...[
    select(String(view.viewTeamIdx), teams.map((t, i) => [String(i), (t.isBot ? '' : '★ ') + t.name]), (v) => showTeam(Number(v)), { id: 'team-select', title: 'Vælg hold at se' }),
    // Kampknapperne står i topbaren, så de findes i alle visninger (også når man scouter).
    // Modstanderen følger programmet (v3.11); navnet ved siden af åbner hans trup til scouting.
    h('button', { id: 'play-round', class: 'primary', disabled: !!mc?.playing, onclick: playNextRound }, `▶ Spil runde ${next.k} af ${game.league.schedule.length}`, h('span', { class: 'play-opp' }, ` mod ${next.opp.name} (${next.home ? 'hjemme' : 'ude'})`)),
    h('button', { id: 'next-opponent', class: 'mini', title: `Scout ${next.opp.name}`, onclick: () => { game.ui.tab = 'trup'; persist(); showTeam(teams.indexOf(next.opp)); } }, `🔍 ${next.opp.name}`),
    tiredStarters() ? h('span', { class: 'tired', id: 'tired-warning', title: myTeam().subsLimit
      ? `Markspillere under din udskiftningsgrænse (${myTeam().subsLimit} %) skiftes ud fra 3. minut (højst 3 ad gangen), hvis der er en frisk afløser i samme kæde på bænken – det bruger et skift og en pause. Overvej at rotere på Taktik`
      : 'Startere under 70 % friskhed – trætte spillere yder mindre (50 % ≈ 12,5 % svagere). Overvej at rotere på Taktik' },
    '⚠ ', h('span', { class: 'tired-txt' }, myTeam().subsLimit ? `${tiredStarters()} startere under din grænse (${myTeam().subsLimit} %) – skiftes ud tidligt` : `${tiredStarters()} trætte startere`)) : null,
    // Gem-kvitteringen står altid synlig (spec §9 – svaret på "nulstiller ved refresh"); et klik åbner ⚙ Admin (gem, eksport, import)
    h('button', { class: 'savestatus' + (view.saveError ? ' failed' : ''), id: 'save-status', title: 'Gem, eksportér, importér og ny liga står i ⚙ Admin', onclick: () => showTab('admin') }, view.saveError ? '⚠ IKKE gemt' : view.savedAt ? ['✔ ', h('span', { class: 'save-txt' }, 'Gemt kl. '), time(view.savedAt)] : 'Ikke gemt')].filter(Boolean));
}

// ⚙ Admin (v3.19.0): gem, eksport/import og ny liga – sjældne og farlige handlinger samlet ét sted
function renderAdmin() {
  return h('div', { class: 'panel admin', id: 'admin' },
    h('h3', {}, '⚙ Admin'),
    h('p', { id: 'admin-save' }, view.saveError ? '⚠ Spillet er IKKE gemt – eksportér det som fil, så intet går tabt. ' : view.savedAt ? `✔ Spillet gemmes automatisk i browseren – senest kl. ${time(view.savedAt)}. ` : 'Spillet er ikke gemt endnu. ',
      h('button', { id: 'save-now', onclick: () => { persist(); render(); } }, '💾 Gem nu')),
    h('p', {}, 'Flyt spillet til en anden browser eller tag en sikkerhedskopi: ', h('button', { id: 'export', onclick: exportFile }, '⬇ Eksportér'), ' ', importButton()),
    h('p', {}, 'Start forfra – det nuværende spil gemmes som backup i browseren: ',
      h('button', { id: 'new-league', onclick: () => {
        if (!confirm('Start en helt ny liga? Det nuværende spil gemmes som backup i browseren.')) return;
        const g = newGame(); const r = resetGame(storage, g);
        if (!r.ok) { window.tactivarFejl?.(r.error); return; }
        dropMatchView(); game = g; view = { ...view, viewTeamIdx: myIdx(), selectedPlayerId: null, notice: r.backupKey ? `Ny liga startet. Det gamle spil ligger som backup (${r.backupKey}).` : 'Ny liga startet.' }; view.savedAt = r.savedAt; game.ui.tab = 'trup'; persist(); render();
      } }, '🎲 Ny liga')));
}

// Én tegning ad gangen (v3.13, fundet af e2e): replaceChildren fjerner et fokuseret felt, dets change-hændelse
// fyrer midt i tegningen og bad om en ny – "node to be removed is no longer a child". Den tegnes bagefter.
let rendering = false, renderAgain = false;
function render() {
  if (rendering) { renderAgain = true; return; }
  rendering = true;
  try { renderNow(); } catch (e) { renderFailed(e); } finally { rendering = false; }
  if (renderAgain) { renderAgain = false; render(); }
}
// En fejl i tegningen må ikke give en hvid side uden udvej (Security v3.19.0: Eksportér/Importér/Ny liga står kun i Admin):
// fanerne og ⚙ Admin tegnes alligevel, med fejlen øverst. Data i browseren røres ikke.
function renderFailed(e) {
  console.error(e);
  // Fejlboksen får den også, med stedet (før gik den som en ufanget fejl dertil – QC)
  const where = /[\w-]+\.js:\d+/.exec(e.stack ?? '')?.[0];
  window.tactivarFejl?.(`Fejl: ${e.message}${where ? ` (${where})` : ''}`);
  drawTabs('admin');
  app.replaceChildren(h('div', { class: 'notice', id: 'render-error' }, `⚠ Siden kunne ikke tegnes (${e.message}). Dit spil er urørt i browseren – eksportér det som fil herunder, før du prøver andet.`), h('div', { class: 'tabpane tab-admin' }, renderAdmin()));
  document.body.dataset.klar = 'ja';
}
// Fanerne i topbaren (v3.19.0): på smal skærm kun ikonet – teksten står stadig i DOM'en (skjult)
function drawTabs(tab) {
  tabbar.replaceChildren(h('nav', { class: 'tabs', id: 'tabs' }, TABS.map(([k, ico, label]) => h('button', { id: `tab-${k}`, class: 'tab' + (k === tab ? ' active' : ''), title: label, onclick: () => showTab(k) },
    h('span', { class: 'tab-ico' }, ico), h('span', { class: 'tab-txt' }, ` ${label}`)))));
}
function renderNow() {
  const league = game.league;
  const team = league.teams[view.viewTeamIdx];
  const isOwn = !team.isBot;
  const selected = team.squad.find((p) => p.id === view.selectedPlayerId) || null;
  const mine = myTeam();
  renderControls();

  const header = h('div', { class: 'panel clubhead' },
    h('div', {}, h('h2', { id: 'club-name' }, team.name), h('div', { class: 'muted' }, isOwn ? 'Dit hold – alle egne data er synlige' : 'Modstanderhold – kun offentlige data og stjerner')),
    h('div', { class: 'right' }, h('div', { class: 'muted' }, 'Klubkasse'), viewTeam(team, isOwn).cashBalance != null
      ? h('button', { class: 'linklike', id: 'club-link', title: 'Økonomi, lønbudget og regnskab', onclick: () => showTab('klub') }, h('strong', {}, kr(shownCash(team, !!mc?.playing))), ' 💼')
      : h('div', {}, h('strong', {}, '🔒 Skjult'), ' ', h('button', { class: 'linklike', id: 'public-club-link', title: 'Offentlig klubside: spillere med pris, transfers og pensioner', onclick: () => showTab('klub') }, '💼 Klubside'))));

  // Fanen afgøres før kortet: træning sættes kun i Trup (v3.19.0)
  const tab = TABS.some(([k]) => k === game.ui.tab) ? game.ui.tab : 'trup';
  drawTabs(tab);
  const matrix = renderMatrix({
    team, isOwn, ui: { ...view, swapId: view.pitchSwapId }, notes: game.notes,
    onSort: (c) => { if (view.sortCol === c.key) view.sortDesc = !view.sortDesc; else { view.sortCol = c.key; view.sortDesc = !!c.num; } clearSwap(); view.notice = ''; render(); },
    onBlocked: (c) => { view.notice = `🔒 Anti-spionage: du kan ikke sortere ${team.name} på "${c.label}" – det er skjult information.`; render(); },
    onSelect: (p) => { view.selectedPlayerId = p.id; render(); if (window.innerWidth < 900) document.getElementById('player-card')?.scrollIntoView({ block: 'start' }); },
    onFilter: (f) => { view.filter = f; render(); },
    onSwap: null,   // v3.19.0: opstillingen sker kun på Taktik (Spilfører: ét sted)
  });

  // Seneste rundes kampe (kun efter afspilningen): kortets 📺 åbner netop den kamp (hold-indeks og stilling)
  const lr = league.lastRound, latest = lr && !mc?.playing ? lr.matches.map((m) => [league.teams.findIndex((t) => t.id === m.homeId), league.teams.findIndex((t) => t.id === m.awayId), m.homeGoals, m.awayGoals].join('|')) : null;
  const card = renderCard({ player: selected, team, isOwn, scouting: league.scouting[mine.id]?.[selected?.id], note: selected ? game.notes[selected.id] : '',
    onNote: (v) => { game.notes[selected.id] = v; persist(); renderControls(); }, teams: league.teams, latest,
    onFocus: isOwn && tab === 'trup' ? (k) => change(() => act.setFocus(team, selected.id, k)) : null,
    trainNote: isOwn && tab !== 'trup',
    market: !selected || mc?.playing ? null : isOwn ? { own: true, listed: (team.listed ?? []).includes(selected.id), onList: (on) => change(() => setListed(league, team, selected.id, on)) }
      : { ...marketInfo(league, mine, team, selected), starter: isStarter(team, selected), wage: Math.round(publicWage(selected) / 3), room: wageRoomPerRound(mine), cashAfter: mine.cashBalance - marketInfo(league, mine, team, selected).price, onBuy: () => { const err = buyPlayer(league, mine, selected.id); view.notice = err ? `💰 ${err}` : `💰 ${selected.shortName} er købt og står nu i din trup.`; change(() => {}); } },
    hideLog: mc?.playing && league.lastRound ? seasonAndRound(league, league.lastRound.round) : null,
    // Under afspilningen af sæsonens sidste runde er det stadig den afsluttede sæson, der vises
    season: mc?.playing && league.lastRound ? seasonAndRound(league, league.lastRound.round)[0] : league.leagueMetadata.seasonNumber ?? 1, starter: !!selected && team.tactics.lineupSlots.includes(selected.id),
    retiring: !!selected && seasonRoundOf(league, league.leagueMetadata.round) >= RETIRE_WARN_ROUND && willRetire(selected, league.leagueMetadata.seasonNumber ?? 1),
    onOpenMatch: (hi, ai) => { const i = lr.matches.findIndex((m) => m.homeId === league.teams[hi]?.id && m.awayId === league.teams[ai]?.id); if (i >= 0) openReport(i); } });

  const pitch = h('div', { class: 'panel' }, h('h3', { id: 'pitch-title' }, `${team.name} – ${team.tactics.baseFormation}`), isOwn ? null : h('div', { class: 'muted', id: 'pitch-opp' }, 'Modstanderhold – kun offentlige data'),
    renderPitch({ team, isOwn, ui: view,
      onSelect: (p, own) => { if (own) { view.listLine = p.line; pickForSwap(team, p); } else { view.selectedPlayerId = p.id; view.listLine = p.line; render(); } },
      onTokenSwap: (a, b) => { clearSwap(); view.notice = ''; change(() => act.swapPlayers(team, a, b)); },
      onMove: (slot, pos) => { clearSwap(); change(() => act.moveSlot(team, slot, pos)); } }),
    isOwn ? h('div', { class: 'muted help' }, 'Træk = justér position (målmanden står fast) · Klik på en brik = vælg (listen viser hans kæde) · Klik på en anden = byt') : null);

  // Spillerlisten ved banen (v3.19.0): opstilling, bænk og reserver ét sted
  const lineupList = renderLineupList({ team, isOwn, ui: { ...view, swapId: view.pitchSwapId }, msg: isOwn ? view.pickMsg ?? '' : '',
    onPick: (p) => (isOwn ? pickForSwap(team, p) : (view.selectedPlayerId = p.id, render())),
    onSort: (c) => { if (view.listSort === c.key) view.listSortAsc = !view.listSortAsc; else { view.listSort = c.key; view.listSortAsc = false; } render(); },
    onBlocked: (c) => { view.notice = `🔒 Anti-spionage: du kan ikke sortere ${team.name} på "${c.label}" – det er skjult information.`; render(); },
    onLine: (v) => { view.listLine = v; render(); },
    onAutoBench: () => change(() => act.setAutoBench(team)) });

  const tactics = renderTactics({ team, isOwn, ui: game.ui, on: {
    formation: (f) => {   // QC K3: sig, hvad der skete, når brikkerne flytter sig
      const before = team.tactics.lineupSlots.slice();
      change(() => act.setFormation(team, f));
      const moved = team.tactics.lineupSlots.filter((id, i) => id !== before[i]).length, out = act.outOfPositionCount(team);
      view.notice = `${f}: ${moved ? `${moved} spillere er flyttet, så flest står på deres naturlige position` : 'ingen behøvede at flytte'}${out ? ` – ${out} står uden for position (se ⚠ på banen)` : ''}.`;
      render();
    },
    preset: (i) => change(() => { act.switchPreset(team, game.ui.activePresetIndex, i); game.ui.activePresetIndex = i; }),
    resetDrag: () => change(() => act.resetDrag(team)),
    arrange: () => { const moved = act.arrangeLineup(team); view.notice = moved ? '⇄ De 11 er flyttet, så flest står på deres naturlige position.' : '⇄ De 11 står allerede bedst muligt efter position.'; change(() => {}); },
    phase: (ph, f, v) => change(() => act.setPhase(team, ph, f, v)),
    rule: (i, patch) => change(() => act.updateRule(team, i, patch)),
    addRule: () => change(() => act.addRule(team)),
    removeRule: (i) => change(() => act.removeRule(team, i)),
    subs: (v) => change(() => act.setSubsLimit(team, v)),
  } });

  const standings = renderStandings({ league, playing: !!mc?.playing, viewTeamId: team.id, onPick: (id) => showTeam(league.teams.findIndex((t) => t.id === id)) });

  // Faner: ét emne ad gangen (brugerens ønske: "et noget rodet layout").
  const shown = mc || (league.lastRound ? lastRoundView(league.lastRound) : null);
  // Hver fane bygges kun, når den vises: banen og kortet er ét DOM-element og kan kun stå ét sted.
  const content = {
    // Opstilling sker i Trup: tallene og sorteringen over banen (brugeren: "nærmest umuligt at
    // opstille sit hold, da informationerne og sorteringsmulighederne ligger på 2 forskellige faner").
    trup: () => [header,
      // Sæsonslut under afspilning (som bogført-før-afspilning): runden er bogført, og sæsonskiftet er sket
      mc?.playing && seasonJustEnded(league) ? h('div', { class: 'notice', id: 'turnover-booked' }, '🗓 Sæsonen sluttede med denne runde: alle er blevet et år ældre, og sæsonrapporten med ungdomstilbuddene står på Liga, når kampene er spillet.') : null,
      !mc?.playing && mine.youthOffers?.length ? h('div', { class: 'notice', id: 'youth-pending' }, `🧒 ${mine.youthOffers.length} ungdomstilbud venter – `, h('button', { class: 'linklike', onclick: () => showTab('liga') }, 'se sæsonrapporten på Liga')) : null,
      isOwn && !mc?.playing ? trainingSummary(league.trainingReport?.[team.id], team, league.trainingReport?.[team.id] ? seasonAndRound(league, league.trainingReport[team.id].round)[1] : null) : null, matrix,
      h('div', { class: 'tactics-layout' }, h('section', {}, card),
        h('section', {}, isOwn ? renderTrainingTable({ team, report: !mc?.playing ? league.trainingReport?.[team.id] : null, line: view.trainLine ?? 'all', onLine: (v) => { view.trainLine = v; view.trainMsg = ''; render(); }, msg: view.trainMsg ?? '',
          onFocus: (id, k) => change(() => act.setFocus(team, id, k)),
          onFocusMany: (ids, k) => { const n = act.setFocusMany(team, ids, k); view.trainMsg = `🏋️ ${n} spiller${n === 1 ? '' : 'e'} træner nu ${FOCUS[k].label}${n < ids.length ? ` (${ids.length - n} kan ikke – Målmand er kun for målmænd)` : ''}.`; change(() => {}); } }) : null))],
    // Taktik (v3.19.0): banen og spillerlisten side om side – opstillingen ét sted; kortet under listen; faser og Hvis-Så nedenunder
    // v3.20.1 (brugeren: "langt ned til taktikindstillingerne"): indstillingerne under banen, listen og kortet ved siden af
    taktik: () => [h('div', { class: 'tactics-layout' }, h('section', {}, pitch, tactics), h('section', {}, lineupList, card))],
    kamp: () => [shown ? renderMatchCenter({ mc: shown, myTeamId: mine.id, on: mcHandlers, column: !shown.playing && shown.round === league.lastRound?.round ? columnNow() : null }) : h('div', { class: 'panel empty', id: 'no-matches' }, 'Ingen kampe spillet endnu. Tryk ▶ Spil runde i topbaren – modstanderen følger kampprogrammet på Liga-fanen.')],
    liga: () => [mc?.playing ? h('div', { class: 'notice', id: 'booked-league' }, '📺 Runden spilles i Kamp-fanen – tabellen herunder er allerede opdateret med den.') : null,
      !mc?.playing ? renderSeasonReport({ league, mine,
        onTake: (id) => { const err = act.takeYouth(mine, id); view.notice = err ? `🧒 ${err}` : '🧒 Ungdomsspilleren er rykket op i truppen.'; change(() => {}); },
        onDrop: (id) => change(() => act.dropYouth(mine, id)) }) : null,
      standings,
      // Resultaterne skjules under afspilningen, ligesom avisen (ellers afsløres de).
      league.lastRound && !mc?.playing ? renderLastRound({ round: league.lastRound, myTeamId: mine.id, onOpen: openReport, seasonRound: seasonAndRound(league, league.lastRound.round)[1] }) : null,
      // Programmet skjules også under afspilningen (det viser den bogførte rundes resultat).
      !mc?.playing ? renderSchedule({ league, pairs: pairRound(league), myTeamId: mine.id }) : null,
      !mc?.playing ? renderTransferLog({ league }) : null,
      league.lastRound && !mc?.playing ? renderGazette(league.lastRound.gazette, mine.id, openGoal, league.lastRound.matches, columnNow(), openReport) : null,
      // Statistikken skjules også under afspilningen (den er bogført og ville afsløre runden).
      !mc?.playing ? renderStats({ league, myTeamId: mine.id }) : null],
    admin: () => [renderAdmin()],
    klub: () => (!isOwn ? [renderPublicClub({ league, pub: viewTeam(team, false), me: mine, playing: !!mc?.playing, msg: view.marketMsg ?? '',
      onBack: () => showTeam(myIdx()),
      onBuy: (id) => { const name = team.squad.find((p) => p.id === id)?.shortName; const err = buyPlayer(league, mine, id); view.marketMsg = err ? `💰 ${err}` : `💰 ${name} er købt og står nu i din trup.`; change(() => {}); } })] : null) ?? [renderClub({ league, team: mine, playing: !!mc?.playing }), renderMarket({ league, team: mine, playing: !!mc?.playing,
      onAccept: (id) => { const err = acceptOffer(league, mine, id); view.notice = err ? `🔁 ${err}` : '🔁 Spilleren er solgt.'; change(() => {}); },
      onDecline: (id) => change(() => declineOffer(league, mine, id)), onUnlist: (id) => change(() => setListed(league, mine, id, false)),
      line: view.marketLine ?? 'all', onLine: (v) => { view.marketLine = v; view.marketMsg = ''; render(); }, msg: view.marketMsg ?? '',
      // Bekræftelsen står ved listen (QC: beskeden øverst var uden for skærmen, når man stod nede i listen)
      onBuy: (id) => { const name = league.teams.flatMap((t) => t.squad).find((p) => p.id === id)?.shortName; const err = buyPlayer(league, mine, id); view.marketMsg = err ? `💰 ${err}` : `💰 ${name} er købt og står nu i din trup.`; change(() => {}); } })],
  }[tab]();
  // v3.20.1: tabellerne ruller ikke selv længere – sidens position bevares (et klik i listen må ikke springe til toppen)
  const pageY = window.scrollY;
  app.replaceChildren(...[
    view.notice ? h('div', { class: 'notice', id: 'notice' }, view.notice,
      view.backupKey && storage.getItem(view.backupKey) ? h('button', { class: 'mini', id: 'download-migration-backup', onclick: () => download(storage.getItem(view.backupKey), `${view.backupKey}.json`) }, ' ⬇ Hent backup som fil') : null) : null,
    h('div', { class: `tabpane tab-${tab}` }, ...content.filter(Boolean)),
  ].filter(Boolean));
  if (window.scrollY !== pageY) window.scrollTo(0, pageY);
  document.body.dataset.klar = 'ja';
}

// Ét byt-sted (v3.19.0, før tre kopier): første klik vælger; andet klik: en starter med i spil → byt (swapPlayers),
// bænk ⇄ reserve → kamptruppen (swapBench), samme spiller → fravælg, bænk → bænk / reserve → reserve → nyt valg.
function pickForSwap(team, p) {
  const a = view.pitchSwapId;
  view.selectedPlayerId = p.id;
  const kind = act.swapKind(team, a, p.id);
  if (kind === 'deselect') { clearSwap(); view.notice = ''; render(); return; }
  if (kind === 'swap' || kind === 'bench') { clearSwap(); view.notice = ''; change(() => act.pickForSwap(team, a, p.id)); return; }
  const slots = team.tactics.lineupSlots, benchIds = matchBenchOf(team).map((x) => x.id);
  view.pitchSwapId = p.id;
  view.pickMsg = slots.includes(p.id) ? `🔁 Klik på den spiller, ${p.shortName} skal byttes med – på banen eller i listen.`
    : benchIds.includes(p.id) ? `🔁 Klik på den brik, ${p.shortName} skal skiftes ind for – eller en reserve, der skal tage hans plads på bænken.`
      : `🔁 Klik på den bænkspiller, ${p.shortName} skal tage pladsen fra – eller en brik.`;
  render();
}

// ---------- Kampe ----------
// Runden afvikles og bogføres + gemmes FØR afspilningen (rettet ift. v2.5b, der gemte
// før bogføringen) – lukkes fanen midt i, er runden alligevel talt med én gang.
// Knappen er spærret under afspilning (det er vagten mod at starte to runder).
function playNextRound() {
  clearSwap(); view.notice = '';
  const rng = createRng(randomSeed());
  const result = playRound(game.league, rng);
  commitRound(game.league, result, rng);
  game.ui.tab = 'kamp'; // gemmes med runden, så F5 midt i afspilningen lander i Kamp
  persist();
  openMatchCenter(result, true);
}

function openMatchCenter(result, live) {
  clearInterval(timer); clearReplays();
  mc = { round: result.round, matches: result.matches, gazette: result.gazette, viewIdx: 0, filter: 'all', shownCount: live ? 1 : Infinity, playing: live };
  game.ui.tab = 'kamp';
  render();
  window.scrollTo(0, 0);
  if (live) timer = setInterval(() => { mc.shownCount++; if (mc.shownCount >= mc.matches[0].events.length) finishPlayback(); else renderMc(); }, PLAYBACK_MS);
}

// Link fra avisens "Rundens mål" (Liga- og Kamp-fanen): åbn kampen, markér målet og rul til det.
function openGoal(i, goal) {
  mc = lastRoundView(game.league.lastRound); mc.viewIdx = i;
  mc.focus = { min: goal.min, scorer: goal.scorer };
  game.ui.tab = 'kamp'; clearSwap(); view.notice = ''; persist(); render();
  (document.getElementById('goal-focus') || document.getElementById('match-center'))?.scrollIntoView({ block: 'center' });
}

// Link fra Liga-siden til referatet af én kamp i seneste runde. Under afspilning vises
// resultaterne slet ikke (vagten står ét sted: i liga-fanens render).
function openReport(i) {
  mc = lastRoundView(game.league.lastRound); mc.viewIdx = i;
  showTab('kamp');
}

function finishPlayback() { clearInterval(timer); timer = null; mc.playing = false; mc.shownCount = Infinity; render(); }

const mcHandlers = {
  skip: finishPlayback,
  // Uden igangværende afspilning vises seneste runde; et valg af kamp/filter gemmer den som mc.
  view: (i) => { mc ||= lastRoundView(game.league.lastRound); mc.viewIdx = i; mc.focus = null; mc.snap = null; renderMc(); },
  // Øjebliksbillede ved et mål (v3.12.1): vis på dit holds minibane og rul derhen; null = startopstillingen.
  // Heat map (v3.16): null = af; { playerId: null } = holdet; { playerId } = én spiller.
  // v3.20.0: heat map'et står altid over opstillingen – det og 📍 (der erstatter opstillingen) udelukker ikke længere hinanden
  heat: (v) => { mc ||= lastRoundView(game.league.lastRound); mc.heat = v; renderMc(); },
  // 2D-afspilningen springer til hændelsen (referatets 🎬).
  replay: (m, i) => replayJump(m, i),
  snapshot: (i) => { mc ||= lastRoundView(game.league.lastRound); mc.snap = i; renderMc(); if (i != null) document.getElementById('snap-pitch')?.scrollIntoView({ block: 'center' }); },
  openGoal: (i, goal) => openGoal(i, goal),
  filter: (f) => { mc ||= lastRoundView(game.league.lastRound); mc.filter = f; renderMc(); },
};
const matchCenterEl = () => renderMatchCenter({ mc, myTeamId: myTeam().id, on: mcHandlers, column: mc && !mc.playing && game.league.lastRound && mc.round === game.league.lastRound.round ? columnNow() : null });
// Under afspilning tegnes kun Match Center om (ikke hele siden).
function renderMc() { const el = document.getElementById('match-center'); if (el) el.replaceWith(matchCenterEl()); }

start();
