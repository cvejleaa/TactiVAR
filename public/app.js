// TactiVAR Manager – binder motor, gem og brugerflade sammen.
import { renderStats } from './ui/stats.js';
import { VERSION } from './version.js';
import { createRng, randomSeed } from './engine/rng.js';
import { createLeague } from './engine/generator.js';
import { matchBenchOf, reservesOf, unavailable, FOCUS, willRetire, RETIRE_WARN_ROUND, publicWage, wageRoomPerRound } from './engine/career.js';
import { loadGame, saveGame, resetGame, exportGame, importGame, backupRaw, SAVE_KEY } from './state/storage.js';
import * as act from './state/actions.js';
import { saveReplay, loadReplay, replayOf, rememberSent, loadSent } from './state/replay.js';
import { buildPayload, uploadMatch } from './state/upload.js';
import { FIREBASE } from './firebase-config.js';
import { h, select } from './ui/dom.js';
import { kr, yellowWarn, attText } from './ui/labels.js';
import { renderMatrix, matrixRows } from './ui/matrix.js';
import { renderLineupList, listRows } from './ui/lineup-list.js';
import { renderTrainingTable, gainsByPlayer } from './ui/training.js';
import { renderCard, renderCardPanel, trainingSummary } from './ui/card.js';
import { renderClub, shownCash, renderMarket, renderTransferLog, renderPublicClub } from './ui/club.js';
import { marketInfo, buyPlayer, setListed, acceptOffer, declineOffer, releasePlayer, wageRoom, isStarter, quarantined, nextWindow, quarantineText } from './engine/transfers.js';
import { renderSeasonReport } from './ui/season-report.js';
import { viewTeam, viewRatingEntry } from './engine/visibility.js';
import { lineupPairs, chemRefOf, weakestPair, swapChanges, BAND_WORD, bestPartner, saleChemText, playerPairs, gamesToSettle, bandOf, chemOf, BAND_RANK } from './engine/chemistry.js';
import { renderPitch } from './ui/pitch.js';
import { renderTactics } from './ui/tactics.js';
import { renderStandings } from './ui/standings.js';
import { playRound, commitRound, pairRound, sortStandings, seasonJustEnded } from './engine/season.js';
import { buildColumn } from './engine/column.js';
import { seasonRoundOf, roundsLeftOf } from './engine/schedule.js';
import { renderLastRound, renderSchedule } from './ui/rounds.js';
import { renderMatchCenter, renderGazette } from './ui/matchcenter.js';
import { renderHome } from './ui/home.js';
import { replayJump, clearReplays } from './ui/replay.js';

export const PLAYBACK_MS = 420;
let mc = null;            // Match Center: { round, matches, gazette, viewIdx, filter, shownCount, playing }
// v3.28.0 (UI-ombygningen F1): seks faner med 🏠 Hjem først; ⚙ Admin er en ikonknap i topbaren (stadig gyldig ui.tab). [nøgle, ikon, tekst]
// v3.30.0 (brugeren: "træningen i en egen topfane"): 🏋️ Træning efter Trup – syv faner
const TABS = [['hjem', '🏠', 'Hjem'], ['trup', '👥', 'Trup'], ['traening', '🏋️', 'Træning'], ['taktik', '📋', 'Taktik'], ['kamp', '📺', 'Kamp'], ['liga', '🏆', 'Liga'], ['klub', '💼', 'Klub']];
const TAB_KEYS = [...TABS.map(([k]) => k), 'admin'];
// Den gemte fane (ét sted): en ukendt værdi – også fra et gem før v3.28.0 – åbner Hjem
const tabNow = () => (TAB_KEYS.includes(game.ui.tab) ? game.ui.tab : 'hjem');
// Spil-bjælken står på Hjem og Taktik (der forberedes runden); de andre faner har den lille ▶ i topbaren
const BAR_TABS = ['hjem', 'taktik'];
// Faner, der kan vise et andet hold (scout-bjælken); fra de andre vises holdet i Trup (showTeam)
const SCOUT_TABS = ['trup', 'taktik', 'klub'];
// Seneste runde vist færdigspillet (Kamp-fanen uden igangværende afspilning).
const lastRoundView = (r) => ({ round: r.round, matches: r.matches, gazette: r.gazette, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false });
function showTab(k) {
  if (k === 'admin' && game.ui.tab !== 'admin') view.prevTab = game.ui.tab;   // ⚙ "Se et andet hold" vender tilbage hertil
  if (k === 'hjem' && view.viewTeamIdx !== myIdx()) setViewTeam(myIdx());       // Hjem er altid dit hold – også Trup bagefter
  game.ui.tab = k; clearSwap(); view.notice = ''; view.marketMsg = ''; view.trainMsg = ''; view.trainPid = null; view.card = null; persist(); render(); window.scrollTo(0, 0);
}
let timer = null;

const storage = window.localStorage;
let game = null;          // { league, notes, ui } – det der gemmes
// pitchSwapId = det ene påbegyndte byt, uanset om det startede i regnearket, på banen eller på bænken.
// card (v3.29.0) = det åbne spillerkort-panel { pid, teamIdx, tab, origin, n, msg, bought } – adskilt fra selectedPlayerId (brikkens markering
// og standardvalget); gemmes ikke, så panelet altid starter lukket
let view = { viewTeamIdx: 0, sortCol: 'pos', sortDesc: false, filter: 'all', selectedPlayerId: null, pitchSwapId: null, notice: '', savedAt: null, card: null };

// Skift af hold/visning afbryder et påbegyndt byt, så et senere klik aldrig bytter uden varsel.
const clearSwap = () => { view.pitchSwapId = null; view.pickMsg = ''; };
// Sæson og sæsonens runde for ligaens løbende runde r (efter sæsonslut hører r til den afsluttede sæson)
function seasonAndRound(league, r) {
  const s = (league.seasons ?? []).find((x) => x.programmed !== false && r >= x.fromRound && r <= x.toRound);
  return s ? [s.seasonNumber, r - s.fromRound + 1] : [league.leagueMetadata.seasonNumber ?? 1, r - league.seasonStartRound + 1];
}
function setViewTeam(idx) { view.viewTeamIdx = idx; clearSwap(); view.notice = ''; view.marketMsg = ''; view.trainMsg = ''; view.trainPid = null; view.card = null; view.selectedPlayerId = game.league.teams[idx].squad[0].id; }
// Et hold vises (v3.28.0): fra Hjem/Træning/Kamp/Liga/⚙ i Trup – på Trup, Taktik og Klub bliver man på fanen (Klub viser holdets klubside)
function showTeam(idx) {
  setViewTeam(idx);
  if (['hjem', 'traening', 'kamp', 'liga', 'admin'].includes(game.ui.tab)) { game.ui.tab = 'trup'; persist(); }
  render();
}
// Et nyt spil (ny liga/import) må ikke vise den gamle ligas runde i Kamp-fanen.
function dropMatchView() { clearInterval(timer); timer = null; mc = null; pendingRaw = null; } // nyt spil: den gamle fil er taget backup af (resetGame)

const app = document.getElementById('app');
const controls = document.getElementById('controls');
const tabbar = document.getElementById('tabbar');
const playbar = document.getElementById('playbar');
const cardpanel = document.getElementById('cardpanel');

// ---------- Kortpanelet (v3.29.0, UI-ombygningen F2) ----------
// Spillerkortet står ét sted: #cardpanel uden for siden (fra højre på computer, et ark fra bunden på mobil), kun på Trup og Taktik.
// ÉN vagt afgør, om det vises: et åbnet kort (view.card) for netop den fane og det hold, der vises, med en spiller, der står i holdet
// (eller en kvittering for et køb). Faneskift og holdskift lukker (showTab/setViewTeam); alt andet, der flytter fanen, skjuler det her.
const CARD_TABS = ['trup', 'taktik'];
let cardSeq = 0;   // hver ny åbning får et nummer: panelets rulning bevares inden for samme åbning og nulstilles ved en ny
function cardNow() {
  const c = view.card;
  if (!c || !game || !CARD_TABS.includes(c.tab) || c.tab !== tabNow() || c.teamIdx !== view.viewTeamIdx) return null;
  const p = game.league.teams[c.teamIdx]?.squad.find((x) => x.id === c.pid) ?? null;
  return p || c.bought ? { ...c, p } : null;
}
// Åbn – eller skift spiller i et åbent panel (samme åbning: rulningen og det element, fokus går tilbage til, bevares; origin = selector)
function openCard(pid, origin = null) {
  const open = cardNow();
  view.card = { pid, teamIdx: view.viewTeamIdx, tab: tabNow(), origin: origin ?? open?.origin ?? null, n: open ? open.n : ++cardSeq, msg: '', bought: false };
  render();
  if (!open) document.getElementById('card-close')?.focus({ preventScroll: true });
}
// Luk (✕ og Escape): fokus tilbage til det, der åbnede – fundet igen, for rækken/ⓘ er tegnet om siden
function closeCard() {
  const o = view.card?.origin;
  view.card = null; render();
  if (o) document.querySelector(o)?.focus({ preventScroll: true });
}
// ◀ ▶ bladrer i den viste listes rækkefølge (Trup: regnearkets sortering og filter; Taktik: start-11, bænk, reserver som listen) –
// står spilleren ikke i den filtrerede liste, bladres i hele truppen
function cardOrder(team, isOwn, tab, pid) {
  const ids = (ui) => (tab === 'trup' ? matrixRows({ team, isOwn, ui }).rows.map((r) => r.p.id)
    : (({ starters, bench, reserves }) => [...starters, ...bench, ...reserves].map((p) => p.id))(listRows({ team, isOwn, ui })));
  const shown = ids(view);
  return shown.includes(pid) ? shown : ids({ ...view, filter: 'all', listLine: 'all' });
}
// Escape lukker panelet (én handler) – også med fokus i noten; et igangværende byt afbrydes ikke
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.isComposing || !cardNow()) return;
  e.preventDefault(); closeCard();
});

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
  '3.28.0': '🏠 Andet skridt i den nye brugerflade: en ny Hjem-fane samler sidste runde, din placering, "Før du spiller" (udelukkede, skadede, trætte og 🟨 – med et link til at løse det), næste modstander og tabellen omkring dig. ▶ Spil runde står nu i en bjælke i bunden af Hjem og Taktik (på de andre faner som en lille ▶ øverst med de samme tegn), og modstanderens navn er et separat 🔍-link. Holdvælgeren er flyttet til Liga ("Se et hold"), og ser du et andet hold, siger en lilla bjælke det – med "← Dit hold". ⚙ øverst til højre har gem, eksport, import og versionen. På mobil står fanerne i bunden. Næste skridt: spillerkortet som ét panel.',
  '3.31.0': '📰 Fjerde skridt i den nye brugerflade: avisen står nu kun på Liga – lige under tabellen. Hjem og Kamp viser rundens overskrift med et link dertil. Hjem viser også kampens spiller 👑 ved sidste runde og modstanderens seneste 3 som farvede piller (V/U/T, ældste først), og 🔍 er væk fra Spil-bjælken på Hjem – næste kamp-kortet har linket.',
  '3.30.0': '🏋️ Træningen har fået sin egen fane: Hjem · Trup · Træning · Taktik · Kamp · Liga · Klub. Træningsfokus sættes nu på 🏋️ Træning – spillerkortet viser, hvad han træner, og linker dertil ("ændr i Træning ›"). Øverst på Træning står rundens fremskridt, og hvem der er nærmest et +1. I Trup-regnearket får en evne, der steg efter sidste runde, et lille grønt +1 ved tallet (på mobil også efter navnet). 💰 Økonomi: spillere med under 3 kampe i karrieren starter på de stjerner, de i snit får efter en sæson (fx 2,9 i stedet for 2) – også i din liga, så deres værdi stiger nu og lønnen ved næste sæsonslut – så lønnen ikke fordobles efter de første 3 kampe – og lønnen er 5,5 % af værdien (før 6 %). Tilskuerne følger placeringen mere, så 9.000 kan nås (1. hjemme mod 2. efter tre sejre i træk); kampene viser nu deres tilskuertal (👥) i referatet, på Liga ved sidste runde og ved din kamp på Hjem. Spillere, du har sat til salg, har "💰 Til salg" efter navnet i Trup.',
  '3.29.1': '📱 Rettelse: på en smal skærm kunne ▶ Spil runde løbe ud over kanten, når modstanderen har et langt navn. Nu forkortes kun navnet (…), og "▶ Spil runde N" står altid helt.',
  '3.29.0': '🗂 Tredje skridt i den nye brugerflade: spillerkortet åbnes nu som ét panel – på computer fra højre, på mobil fra bunden – i stedet for at stå nederst på siden. På Trup åbner et klik på en spiller kortet. På Taktik betyder et klik stadig byt; kortet åbnes med ⓘ ved navnet i listen (eller "Se kort ›" i byt-beskeden), og et klik på et andet holds spiller åbner det. ◀ ▶ bladrer i listen, ✕ eller Esc lukker. Næste skridt: Hjem-indholdet og avisen ét sted.',
  '3.27.1': '🎨 Første skridt i den nye brugerflade: roligere farver og fem skriftstørrelser i stedet for tyve – det er stadig de samme sider. Næste skridt: ny ramme med en Hjem-fane og ▶ Spil runde i bunden.',
  '3.27.0': '⛔ Udelukkelse for kort: direkte rødt kort giver 2 kampes udelukkelse, rødt for to gule 1 kamp, og hvert 4. gule kort i sæsonen 1 kamp. Det gælder alle hold, og udelukkelsen afsones over sæsonskiftet. Du ser det før runden (⛔ #nr ved ▶ Spil runde, ⛔ i listerne og på spillerkortet, også 🟨 3 – næste gule giver udelukkelse), og en udelukket starter erstattes automatisk. 🦶 Tacklinger virker nu (Taktik → Fase 2): Aggressiv vinder flere dueller i presset, men begår flere frispark og får flere kort – Forsigtig omvendt.',
  '3.26.1': '🔋 Sommerpausen giver energien tilbage: ved sæsonskiftet er hele truppen 100 % frisk igen (skader løber videre) – og faste startere falder igen over de første runder. Derfor nævner referatet i sæsonens sidste runde ikke længere, hvad udskiftningerne sparede. Og 🏃 "Dit holds løber" er taget ud af avisen – den gav intet at handle på; km, højintenst løb og topfart står stadig i karakterarket.',
  '3.26.0': '↔ Angrebsside (Taktik → Fase 1): vælg Venstre, Begge eller Højre for jeres cutbacks og indlæg. Det er en lille fordel – ca. ét styret kantangreb pr. kamp, mest ved Lave cutbacks. Begge læner sig lidt mod den side, hvor jeres kant står stærkest; et fast valg rammer siden ca. 3 af 4 gange, men ved cutbacks læser deres back dér det. Målt: Begge finder selv en svag back, og et fast valg er højst lige så godt. Fuldtidsanalysen viser kantangreb pr. side med deres back – og Dit felt, når de tydeligt gik på den ene af dine sider (mindst 5, ¾).',
  '3.25.0': '⚙ Midtbanen vinder bolden: flere spillere på midten giver nu mere boldbesiddelse (med aftagende udbytte – den femte giver mindre end den fjerde), og kampe med 85–90 % bold er næsten forsvundet. Ved formationen i Taktik står, hvor mange I har på midten.',
  '3.24.6': '↔ Kantpladser: dybden afgør nu, om det er en kant- eller back-plads. I 3-5-2 er LWB/RWB kantpladser på midtbanen, så dine kanter står der uden straf og tæller med i midtbanens samspil – trækker du en spiller ned mod egen bane, bliver det en back-plads. Og kamprapportens to karakterark står nu i samme højde (kort, opstilling og liste).',
  '3.24.5': '🧤 Målmandens redninger: tallet skelner nu mellem svære og lette – "🧤9 (2 svære)". Karakteren følger de svære redninger; et skud lige på målmanden løfter den kun lidt.',
  '3.24.4': '📤 Kamp-id er slået til: efter slutfløjt i seneste runde kan du sende den viste kamp og få et id (fx K-7F3Q) – så kan den findes og spilles igen, når kampmotoren justeres.',
  '3.24.3': '📤 Kamp-id: i Match Center kan den viste kamp i seneste runde sendes med et kort id (fx K-7F3Q) – så kan den findes og spilles igen, når kampmotoren justeres. Kun den ene kamp sendes, ikke dit spil. Dine sendte id\'er står under "📤 Sendte kampe".',
  '3.24.2': '🤝 Samspil siger det nu: når to spillere har spillet sig stærkt sammen i en runde, står det øverst i Trup efter runden (og hvis et stærkt par mistede det, fordi de ikke spillede sammen). Under Taktik-banen står, hvor mange af dine par der spiller stærkt.',
  '3.24.1': '🧒 Rettelse: en ungdomsspiller, der rykkes op ved sæsonslut (af dig eller automatisk til 18), kan – som et køb – først sælges ved næste sæsonslut. Før kunne han sælges straks uden at have spillet. Kortet siger nu, hvornår en spiller kan handles igen.',
  '3.24.0': '🤝 Samspil: spillere, der spiller kampe side om side, finder hinanden – det gør opbygningen lidt lettere og forsvaret bedre mod løb i ryggen. Et nyt køb er fremmed for alle i ca. 8 kampe. Se stregerne mellem dine spillere i Taktik (tyk = stærkt, stiplet = fremmede), din bedste makker på spillerkortet, og hvad et byt eller et salg bryder.',
  '3.22.1': '🎬 Afspilningen viser nu afleveringen før målet og før afslutninger efter en cutback, et løb eller et indlæg: bolden går fra oplæggeren til skytten, der står onside på linje med forsvaret – derefter løber han igennem og afslutter (et indlæg går i luften direkte ind i feltet). Før så det ud, som om han stod offside. Målene i den runde, du allerede har spillet, vises også rigtigt.',
  '3.22.0': '📊 Kampens tal: klik på en af dine spillere efter kampen. Under hans heat map står, hvor mange bolde han erobrede og tabte, og 🤝 hvem han spillede sammen med – cutbacks, indlæg, løb og dødbolde, med minut og udfald. Kun det, kampen selv afgjorde.',
  '3.21.2': '📰 Klummen handler mere om dig: din kamps store øjeblik – et comeback, et sent sejrsmål, et sent point, at I rejste jer fra to mål bagud, eller en storsejr – går nu forud for de andre kampe i overskriften. "Comeback" bruges kun, når et hold var bagud med to eller stadig bagud efter pausen. Stil-gættene kræver bedre belæg, "Mit bud" og kamp-overskrifterne varierer mere, og 🏃 Dit holds løber vises kun, når løbet er værd at nævne.',
  '3.21.1': '🔁 Du sidder ikke længere fast på transfermarkedet: du kan sælge, selv om du kun har 18 spillere – en ungdomsspiller fra akademiet kommer ind i samme kæde. Er du over lønbudgettet, kan du stadig købe for den løn, du har sparet ved salget i vinduet (lønnen bliver aldrig højere end før salget). Byder ingen, kan du fritstille en spiller gratis. Højst 2 salg pr. vindue – også for dig. 💼 Klub viser, hvad et salg frigør, før du trykker.',
  '3.21.0': '🏃 Spillerne bevæger sig i kampen: hver spiller glider rundt om sin plads efter sin rolle og holdets pres, og motoren regner på de samme pladser, som du ser i 2D-afspilningen. Heat map\'et viser derfor hans område – en midtbanespiller dækker nu over en fjerdedel af banen (kilometertallet er stadig et skøn). En af de nærmeste går i pres og dækker løberen i midten (på kanten backen på hans side), så din opstilling afgør, hvem der tager duellen: 🤼 i karakterarket viser hvor mange dueller hver af dine spillere vandt.',
  '3.20.2': 'Heat map\'et i karakterarket er finere (12 × 18 felter) og tæller vejen, spilleren løb mellem kampens øjebliksbilleder, og farven er udglattet, så du ser hans område og ikke enkelte firkanter. Kortet bygger på kampens øjebliksbilleder (ét hvert 3. minut) og viser hans område, ikke hver meter. Kilometertallet er et skøn ud fra hans rolle og kondition – det er ikke målt på kortet, og det står nu også under kortet.',
  '3.20.1': 'Rettelser: 📋 Taktik har formation, faser og Hvis-Så lige under banen, og tabellerne har ikke længere deres egen rulning (kun referatet i kampen ruller). Efter kampen står afspilningen til venstre med statistik og referat ved siden af. 🏆 Liga viser "Bedste snit" for sæsonen (stjernerne fra hver kamp, mindst 3 kampe) og "Rundens bedste", og rundens spiller får en rigtig begrundelse (taktiske dueller, holdt nullet).',
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
// En fejl i klummen må ikke tage Liga-fanen (eller Hjems og Kamps overskrift) med: columnNow giver null, renderGazette viser den
// gamle avis, og fejlen står i fejlboksen (Release Manager).
// v3.31.0 (QC på F3): bygges ÉN gang pr. runde (gemt pr. lastRound-objekt – et nyt ved hver runde, genindlæsning og import), så
// fejlboksen (errors.js fjerner ikke dubletter) kun får én linje, også når Liga, Hjem og Kamp alle tegnes. Kaldes aldrig under
// afspilning: dér er lastRound den runde, der afspilles (vagterne står hos kalderne – Liga, home.js og Kamps .to-home-linje).
let columnCache = null;   // { lr, col }
function columnNow() {
  const lr = game.league.lastRound;
  if (columnCache && columnCache.lr === lr) return columnCache.col;
  let col = null;
  try { col = buildColumnNow(); } catch (e) { console.error(e); window.tactivarFejl?.(`Klummen kunne ikke bygges – avisen vises i stedet (${e.message}).`); }
  columnCache = { lr, col };
  return col;
}
// Rundens overskrift (v3.31.0, F3) til Hjems 📰-kort og Kamps link: klummens titel, ellers den gamle avis' første overskrift (den
// samme som Ligas første #headlines-punkt), ellers "Rundens avis". null før første runde. Ingen afspilningsvagt her – se columnNow.
function paperHeadline() {
  const lr = game.league.lastRound;
  if (!lr?.matches?.length) return null;
  return columnNow()?.title || lr.gazette?.headlines?.[0] || 'Rundens avis';
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
      const note = migrationNotice(r.migratedFrom);
      if (note) view.notice = note + (r.backupKey ? ' Det gamle spil ligger som backup i browseren.' : '');
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
  return t.squad.filter((p) => t.tactics.lineupSlots.slice(t.subsLimit ? 1 : 0).includes(p.id) && !unavailable(p) && p.freshness < tiredLimit());
}

// Dine startere, der ikke kan spille (v3.27.0): skadet eller udelukket – samme vagt som kampen (career.js unavailable)
const outStarters = () => { const t = myTeam(); return t.tactics.lineupSlots.map((id) => t.squad.find((p) => p.id === id)).filter((p) => p && unavailable(p)); };

// Før runden (v3.28.0): ÉN kilde til advarslerne – Spil-bjælken, den lille ▶ og Hjem-listen bruger kun denne (e2e: paritet).
// 🟨 kun for startere (labels.js yellowWarn: 1 gult fra udelukkelse, også ved 7).
const ISSUE_ICON = { ban: '⛔', injury: '🚑', tired: '⚠', yellow: '🟨' };
const ISSUE_ORDER = ['ban', 'injury', 'tired', 'yellow'];   // det værste først
function preMatchIssues() {
  const t = myTeam(), out = outStarters(), nm = (p) => `#${p.shirtNumber} ${p.shortName}`;
  const starters = t.tactics.lineupSlots.map((id) => t.squad.find((p) => p.id === id)).filter(Boolean);
  return [
    ...out.map((p) => ({ kind: p.banMatches > 0 ? 'ban' : 'injury', id: p.id, nr: p.shirtNumber,
      text: `${nm(p)} ${p.banMatches > 0 ? 'er udelukket' : 'er skadet'} – erstattes automatisk` })),
    ...tiredStarters().map((p) => ({ kind: 'tired', id: p.id, nr: p.shirtNumber, text: `${nm(p)} er ${Math.round(p.freshness)} % frisk` })),
    ...starters.filter((p) => !out.includes(p) && yellowWarn(p)).map((p) => ({ kind: 'yellow', id: p.id, nr: p.shirtNumber, text: `${nm(p)}: ${yellowWarn(p)}` })),
  ];
}
// Advarslerne samlet til piller/linjer: én pr. spiller, de trætte samlet i én (som før: "N startere under din grænse")
function issueGroups(issues = preMatchIssues()) {
  const lim = myTeam().subsLimit, tired = issues.filter((i) => i.kind === 'tired');
  const n = tired.length, st = n === 1 ? 'starter' : 'startere';
  const tiredText = lim ? `${n} ${st} under din grænse (${lim} %) – skiftes ud tidligt (fra 3. minut, højst 3 ad gangen, hvis en frisk afløser i samme kæde sidder på bænken – det bruger et skift)` : `${n} ${n === 1 ? 'træt starter' : 'trætte startere'} – yder mindre (50 % ≈ 12,5 % svagere)`;
  return ISSUE_ORDER.flatMap((k) => (k === 'tired'
    ? (tired.length ? [{ kind: k, ids: tired.map((i) => i.id), nrs: tired.map((i) => i.nr), pill: `⚠ ${tired.length}`, text: `${tiredText}: ${tired.map((i) => i.text).join(', ')}` }] : [])
    : issues.filter((i) => i.kind === k).map((i) => ({ kind: k, ids: [i.id], nrs: [i.nr], pill: `${ISSUE_ICON[k]} #${i.nr}`, text: i.text }))));
}

// Forklaringen på en migrering – både ved indlæsning og ved import af en ældre fil.
function migrationNotice(from) {
  if (from == null) return '';
  const lines = [
    from <= 1 ? 'Hvis-Så-regler kan nu sættes til "Bagud/Foran med mindst N mål" og skifte til dine egne planer – "Foran med 1" gælder fra 1 mål og opefter.' : '',
    from <= 2 ? 'Mod-kunnen er sat ca. 45 % ned (alle hold): hver spiller har nu højst 100 point fordelt på de tre stilarter – lærer han noget nyt, glemmer han lidt af det gamle.' : '',
    from <= 3 ? 'Spillerhøjderne er rettet efter Superliga-målinger (ligasnit ca. 184 cm, 168–201 cm) – hver spiller beholder sin plads i højde-rækkefølgen i sin kæde, og luftduellerne er regnet om. Friskhed betyder nu noget: en kamp koster efter løbet distance, og en træt spiller yder mindre (50 % friskhed ≈ 12,5 % svagere).' : '',
    from <= 5 ? 'Nu spilles der efter et fast kampprogram: 14 runder, hvor alle møder alle hjemme og ude – se det på Liga-fanen. Modstandervælgeren er væk; ▶ spiller altid programmets næste runde. Tabellen indtil nu er arkiveret som "Sæson 1 (uden program)" under Tidligere sæsoner, og en ny sæson starter med nulstillet tabel og sæsonstatistik (spillere og friskhed er uændrede). Clean sheets tælles kun for målmænd.' : '',
    from <= 6 ? 'Ny i v3.18: træning, aldring, økonomi og transfers – se 💼 Klub. Alle spillere bliver et år ældre ved sæsonslut, lønnen følger nu de offentlige stjerner og alderen, og spillere med samme kortnavn på tværs af holdene har fået et nyt navn.' : '',
    from <= 4 ? 'Hver spiller har nu en naturlig position (kolonnen "Natur"), og højden følger Superliga-dokumentets tabel pr. position: midtstoppere og målmænd højere, backs og kanter lavere. Den højeste i hver position er stadig den højeste – i hver kæde blev de højeste til stoppere/angribere og de laveste til backs/kanter. Luftduellerne er regnet om. Løbene i kampen følger nu den plads, spilleren står på (CM løber længst, kanter og wingbacks har flest højintense løb) – sæsonens km og andel højintenst på spillerkortet blander indtil videre den gamle og den nye beregning.' : '',
    from <= 7 ? dmNotice() : '',
    // 8 → 9 (v3.23.0): en kort linje, så backup-knappen vises (Release Manager: ellers kunne backuppen ikke findes) – samspillet har
    // ingen virkning i kampene endnu og nævnes kun som forberedelse
    from <= 8 ? 'Forberedelse til samspil: hvert hold har fået et samspilstal for spillerne på nabopladser – det ændrer intet i kampene endnu.' : '',
  ].filter(Boolean);
  return lines.length ? 'Dit spil er opdateret: ' + lines.join(' ') : '';
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
    dropMatchView(); game = r.state; game.ui.tab = 'hjem'; view.viewTeamIdx = myIdx(); view.notice = `Spillet er importeret fra ${file.name}.${res.backupKey ? ` Det tidligere spil ligger som backup (${res.backupKey}).` : ''} ${migrationNotice(r.migratedFrom)}`.trim(); view.savedAt = res.savedAt; render();
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

// Topbaren (v3.28.0, én linje): VAR · dit klubnavn · gem-kvitteringen · den lille ▶ (på faner uden Spil-bjælken) · ⚙
const playTitle = (next) => `Spil runde ${next.k} af ${game.league.schedule.length} mod ${next.opp.name} (${next.home ? 'hjemme' : 'ude'})`;
function renderControls() {
  const tab = tabNow(), next = nextMatch(), playing = !!mc?.playing;
  document.getElementById('top-club').textContent = myTeam().name;
  // Den lille ▶ viser de samme tegn som bjælken (kompakt: antal pr. slags) – under afspilning slået fra og uden tegn
  const groups = playing ? [] : issueGroups();
  const counts = ISSUE_ORDER.map((k) => [k, groups.filter((g) => g.kind === k).reduce((a, g) => a + g.ids.length, 0)]).filter(([, n]) => n > 0);
  controls.replaceChildren(...[
    // Gem-kvitteringen står altid synlig (spec §9 – svaret på "nulstiller ved refresh"); et klik åbner ⚙ Admin (gem, eksport, import)
    h('button', { class: 'savestatus' + (view.saveError ? ' failed' : ''), id: 'save-status', title: 'Gem, eksportér, importér og ny liga står i ⚙ Admin', onclick: () => showTab('admin') }, view.saveError ? '⚠ IKKE gemt' : view.savedAt ? ['✔ ', h('span', { class: 'save-txt' }, 'Gemt kl. '), time(view.savedAt)] : 'Ikke gemt'),
    BAR_TABS.includes(tab) ? null : h('button', { id: 'play-round', class: 'primary mini-play', disabled: playing, onclick: playNextRound, title: [playTitle(next), ...groups.map((g) => g.text)].join('\n') },
      '▶ ', h('span', { class: 'mini-lbl' }, 'Runde '), h('span', { class: 'mini-num' }, String(next.k)), counts.length ? h('span', { id: 'mini-warn' }, ' ' + counts.map(([k, n]) => `${ISSUE_ICON[k]}${n}`).join(' ')) : null),
    gearButton(tab)].filter(Boolean));
}
const gearButton = (tab) => h('button', { id: 'tab-admin', class: 'gear' + (tab === 'admin' ? ' active' : ''), title: 'Admin: gem, eksportér, importér, ny liga – og se et andet hold', 'aria-label': 'Admin', onclick: () => showTab('admin') }, '⚙');

// Spil-bjælken (v3.28.0) på Hjem og Taktik – altid én linje: advarsler som korte piller (kun Taktik; Hjem har listen lige over),
// modstanderen som SEPARAT link (før lå navnet i knappen, og et klik på navnet spillede runden) og ▶ Spil runde
function renderPlayBar(tab) {
  const next = nextMatch(), playing = !!mc?.playing, L = game.league, groups = tab === 'taktik' && !playing ? issueGroups() : [];
  const worst = groups[0]?.kind;
  const pill = (g) => h('button', { class: `pill pill-${g.kind}`, id: g.kind === 'tired' ? 'tired-warning' : null, dataset: { kind: g.kind, nrs: g.nrs.join(',') }, title: g.text,
    onclick: () => fixIssue(g.ids, 'taktik') }, g.pill);
  const out = groups.filter((g) => g.kind === 'ban' || g.kind === 'injury');
  const chips = groups.length > 3
    ? [h('button', { class: `pill pill-${worst}`, id: 'issue-count', title: groups.map((g) => g.text).join('\n'), onclick: () => showTab('hjem') }, `${ISSUE_ICON[worst]} ${groups.length} ting`)]
    : [out.length ? h('span', { id: 'out-warning', class: 'pills', title: `${out.map((g) => g.text).join(', ')} – af den bedste i samme kæde på bænken. Stil selv om her på Taktik` }, out.map(pill)) : null, ...groups.filter((g) => !out.includes(g)).map(pill)];
  // Smal skærm (Spilfører UI): ved præcis 3 piller vises i stedet én tæller (CSS), så knappen kan bære modstanderens navn
  const mobileCount = groups.length === 3 ? h('button', { class: `pill pill-${worst} count-narrow`, title: groups.map((g) => g.text).join('\n'), onclick: () => showTab('hjem') }, `${ISSUE_ICON[worst]} 3 ting`) : null;
  return h('div', { class: 'playbar-in' + (tab === 'hjem' ? ' no-opp' : ''), id: 'play-bar' },
    groups.length ? h('span', { class: 'pills' + (mobileCount ? ' wide-only' : ''), id: 'bar-issues' }, chips) : null, mobileCount,
    // v3.31.0 (Spilfører UI på F1): ingen 🔍 på Hjem – næste kamp-kortet har linket; ▶ står samme sted (.no-opp → margin-left: auto)
    tab === 'hjem' ? null : h('button', { id: 'next-opponent', class: 'linklike opp-link', title: `Se ${next.opp.name} – kun offentlige data`, onclick: () => showTeam(L.teams.indexOf(next.opp)) }, `🔍 ${next.opp.name}`),
    h('button', { id: 'play-round', class: 'primary', disabled: playing, onclick: playNextRound, title: playTitle(next) },
      `▶ Spil runde ${next.k}`, h('span', { class: 'play-of' }, ` af ${L.schedule.length}`), h('span', { class: 'play-opp' }, ` · ${next.opp.name} (${next.home ? 'hjemme' : 'ude'})`)));
}
// Et link, der skal LØSE noget (Hjem-listen, pillerne), viser altid dit eget hold – og vælger spilleren (brikken markeres)
function fixIssue(ids, target) {
  setViewTeam(myIdx());
  if (ids?.length) view.selectedPlayerId = ids[0];
  game.ui.tab = target; persist(); render();
  document.querySelector(target === 'taktik' ? '#pitch' : '.tabpane')?.scrollIntoView({ block: 'start' });
}
// Holdvælgeren (v3.28.0): kun på Liga ("Se et hold") og i scout-bjælken – ét element ad gangen, samme id
const teamSelect = () => select(String(view.viewTeamIdx), game.league.teams.map((t, i) => [String(i), (t.isBot ? '' : '★ ') + t.name]), (v) => showTeam(Number(v)), { id: 'team-select', title: 'Vælg hold at se' });

// ⚙ Admin (v3.19.0): gem, eksport/import og ny liga – sjældne og farlige handlinger samlet ét sted
function renderAdmin() {
  return h('div', { class: 'panel admin', id: 'admin' },
    h('h3', {}, '⚙ Admin ', h('span', { id: 'version', class: 'muted' }, 'v' + VERSION)),
    h('p', { id: 'admin-save' }, view.saveError ? '⚠ Spillet er IKKE gemt – eksportér det som fil, så intet går tabt. ' : view.savedAt ? `✔ Spillet gemmes automatisk i browseren – senest kl. ${time(view.savedAt)}. ` : 'Spillet er ikke gemt endnu. ',
      h('button', { id: 'save-now', onclick: () => { persist(); render(); } }, '💾 Gem nu')),
    h('p', {}, 'Flyt spillet til en anden browser eller tag en sikkerhedskopi: ', h('button', { id: 'export', onclick: exportFile }, '⬇ Eksportér'), ' ', importButton()),
    h('p', {}, 'Start forfra – det nuværende spil gemmes som backup i browseren: ',
      h('button', { id: 'new-league', onclick: () => {
        if (!confirm('Start en helt ny liga? Det nuværende spil gemmes som backup i browseren.')) return;
        const g = newGame(); const r = resetGame(storage, g);
        if (!r.ok) { window.tactivarFejl?.(r.error); return; }
        dropMatchView(); game = g; view = { ...view, viewTeamIdx: myIdx(), selectedPlayerId: null, notice: r.backupKey ? `Ny liga startet. Det gamle spil ligger som backup (${r.backupKey}).` : 'Ny liga startet.' }; view.savedAt = r.savedAt; game.ui.tab = 'hjem'; persist(); render();
      } }, '🎲 Ny liga')),
    // Reserven til holdvalget (v3.28.0; hovedvejene er Liga-tabellen, næste modstander og scout-bjælken): et valg vender tilbage
    // til fanen, man kom fra, hvis den kan vise et andet hold – ellers Trup
    h('p', {}, h('label', { for: 'admin-team' }, 'Se et andet hold: '),
      select('', [['', 'Vælg hold …'], ...game.league.teams.map((t, i) => [String(i), (t.isBot ? '' : '★ ') + t.name])], (v) => {
        if (v === '') return;
        game.ui.tab = SCOUT_TABS.includes(view.prevTab) ? view.prevTab : 'trup'; setViewTeam(Number(v)); persist(); render(); window.scrollTo(0, 0);
      }, { id: 'admin-team' })));
}

// Én tegning ad gangen (v3.13, fundet af e2e): replaceChildren fjerner et fokuseret felt, dets change-hændelse
// fyrer midt i tegningen og bad om en ny – "node to be removed is no longer a child". Den tegnes bagefter.
let rendering = false, renderAgain = false;
// Salg/fritstilling af din spiller (v3.21.1): svaret til listen – med akademispilleren, der kom ind i stedet (ved 18 eller kædens minimum)
function transferMsg(id, act, verb) {
  const mine = myTeam(), name = mine.squad.find((p) => p.id === id)?.shortName ?? 'Spilleren', ids = new Set(mine.squad.map((p) => p.id));
  const err = act();
  if (err) return `🔁 ${err}`;
  const y = mine.squad.find((p) => !ids.has(p.id));
  return `🔁 ${name} er ${verb}.${y ? ` #${y.shirtNumber} ${y.shortName} (${y.age} år) kommer ind fra akademiet${mine.tactics.lineupSlots.includes(y.id) ? ' – og starter i hans plads' : ''}.` : ''}`;
}
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
  controls.replaceChildren(gearButton('admin')); playbar.replaceChildren(); document.body.classList.remove('has-bar');
  cardpanel.replaceChildren(); cardpanel.hidden = true; cardpanel.dataset.open = 'nej'; document.body.classList.remove('card-open');   // intet halvt tegnet kort
  app.replaceChildren(h('div', { class: 'notice', id: 'render-error' }, `⚠ Siden kunne ikke tegnes (${e.message}). Dit spil er urørt i browseren – eksportér det som fil herunder, før du prøver andet.`), h('div', { class: 'tabpane tab-admin' }, renderAdmin()));
  document.body.dataset.klar = 'ja';
}
// Fanerne (v3.28.0): én nav-DOM – på computer under topbaren, på mobil fast i bunden (ikon over teksten)
function drawTabs(tab) {
  tabbar.replaceChildren(h('nav', { class: 'tabs', id: 'tabs' }, TABS.map(([k, ico, label]) => h('button', { id: `tab-${k}`, class: 'tab' + (k === tab ? ' active' : ''), title: label, onclick: () => showTab(k) },
    h('span', { class: 'tab-ico' }, ico), h('span', { class: 'tab-txt' }, ` ${label}`)))));
}
function renderNow() {
  const league = game.league;
  const team = league.teams[view.viewTeamIdx];
  const isOwn = !team.isBot;
  const mine = myTeam();
  // Fokus i panelet (v3.29.0, QC): panelets indhold tegnes om, så et fokuseret felt/knap (✕, ◀ ▶, til salg, træning) får fokus igen
  // ud fra sit id bagefter. Noten tegnes aldrig om, mens man skriver: onNote kalder kun renderControls, aldrig render().
  const refocus = cardpanel.contains(document.activeElement) ? document.activeElement.id || null : null;
  // Fanen afgøres først: topbaren, bjælken og kortet afhænger af den (træning sættes kun på 🏋️ Træning, v3.30.0 – før kun i Trup)
  // QC v3.28.0: fanen normaliseres HER (ny liga, første besøg og import sætter ingen) – så læser showTeam/showTab aldrig en ukendt værdi
  const tab = (game.ui.tab = tabNow());
  drawTabs(tab);
  renderControls();
  const cs = cardNow(), sel = cs?.p ?? null;   // kortpanelets spiller (vagten: cardNow)
  // Sidste rundes træningsrapport (v3.30.0, ÉN kilde for Træning-fanen og Trups "+N"): kun dit hold har en, og under afspilningen
  // skjules den – den er for den runde, der afspilles, og ville afsløre den før fløjtet
  const ownRep = !mc?.playing ? league.trainingReport?.[mine.id] ?? null : null, ownRound = ownRep ? seasonAndRound(league, ownRep.round)[1] : null;
  // "+N" i Trup: kun når dit hold vises (en solgt spillers id står stadig i din rapport) og ikke lige efter sæsonslut – aldersfaldet
  // i sæsonskiftet kan have spist et +1 fra samme runde (QC v3.30.0)
  const gains = isOwn && ownRep && !seasonJustEnded(league) ? gainsByPlayer(ownRep) : new Map();
  const anyGain = team.squad.some((p) => gains.has(p.id));

  // Trup (v3.28.0): klubhovedet med kassen er flyttet til Hjem – Trup har en kort linje; en modstanders kasse er skjult
  const header = h('div', { class: 'panel clubhead' },
    h('div', {}, h('h2', { id: 'club-name' }, team.name), h('span', { class: 'muted' }, isOwn ? ' – dit hold' : ' – modstanderhold, kun offentlige data og stjerner')),
    isOwn ? null : h('div', { class: 'right' }, h('span', { class: 'muted' }, 'Klubkasse '), h('strong', {}, '🔒 Skjult'), ' ',
      h('button', { class: 'linklike', id: 'public-club-link', title: 'Offentlig klubside: spillere med pris, transfers og pensioner', onclick: () => showTab('klub') }, '💼 Klubside')));
  const matrix = renderMatrix({
    team, isOwn, ui: { ...view, swapId: view.pitchSwapId, selectedPlayerId: sel?.id ?? null, gains, gainRound: ownRound }, notes: game.notes,
    onSort: (c) => { if (view.sortCol === c.key) view.sortDesc = !view.sortDesc; else { view.sortCol = c.key; view.sortDesc = !!c.num; } clearSwap(); view.notice = ''; render(); },
    onBlocked: (c) => { view.notice = `🔒 Anti-spionage: du kan ikke sortere ${team.name} på "${c.label}" – det er skjult information.`; render(); },
    // v3.29.0: et klik på en række åbner kortpanelet (eller skifter spiller i det) – før rullede mobilen ned til kortet under tabellen
    onSelect: (p) => { view.selectedPlayerId = p.id; openCard(p.id, `#matrix tr[data-pid="${p.id}"]`); },
    onFilter: (f) => { view.filter = f; render(); },
    onSwap: null,   // v3.19.0: opstillingen sker kun på Taktik (Spilfører: ét sted)
  });

  // Seneste rundes kampe (kun efter afspilningen): kortets 📺 åbner netop den kamp (hold-indeks og stilling)
  const lr = league.lastRound, latest = lr && !mc?.playing ? lr.matches.map((m) => [league.teams.findIndex((t) => t.id === m.homeId), league.teams.findIndex((t) => t.id === m.awayId), m.homeGoals, m.awayGoals].join('|')) : null;
  const card = sel ? renderCard({ player: sel, team, isOwn, scouting: league.scouting[mine.id]?.[sel?.id], note: sel ? game.notes[sel.id] : '',
    onNote: (v) => { game.notes[sel.id] = v; persist(); renderControls(); }, teams: league.teams, latest,
    // TM: målmanden har ingen par (motoren læser ham ikke) – intet samspil på hans kort, ingen "ca. 8 kampe" ved køb
    chem: isOwn && sel && sel.position !== 'GK' ? chemCard(team, sel) : null,
    market: !sel || mc?.playing ? null : isOwn ? { own: true, listed: (team.listed ?? []).includes(sel.id), onList: (on) => change(() => setListed(league, team, sel.id, on)), saleChem: saleChemText(team, chemRefOf(league), sel.id), block: quarantined(sel, nextWindow(league)) ? quarantineText(sel) : null }
      : { ...marketInfo(league, mine, team, sel), settle: sel.position === 'GK' ? null : gamesToSettle(chemRefOf(league)), starter: isStarter(team, sel), wage: Math.round(publicWage(sel) / 3), room: Math.round(wageRoom(league, mine) / 3), cashAfter: mine.cashBalance - marketInfo(league, mine, team, sel).price, onBuy: () => {
        // QC v3.29.0: kvitteringen står også i panelet – efter et køb står spilleren ikke længere i holdet, og panelet viser kvitteringen, til det lukkes
        const err = buyPlayer(league, mine, sel.id), m = err ? `💰 ${err}` : `💰 ${sel.shortName} er købt og står nu i din trup.`;
        view.notice = m; if (view.card) Object.assign(view.card, { msg: m, bought: !err, boughtName: sel.shortName }); change(() => {}); } },
    hideLog: mc?.playing && league.lastRound ? seasonAndRound(league, league.lastRound.round) : null,
    // Under afspilningen af sæsonens sidste runde er det stadig den afsluttede sæson, der vises
    season: mc?.playing && league.lastRound ? seasonAndRound(league, league.lastRound.round)[0] : league.leagueMetadata.seasonNumber ?? 1, starter: !!sel && team.tactics.lineupSlots.includes(sel.id),
    retiring: !!sel && seasonRoundOf(league, league.leagueMetadata.round) >= RETIRE_WARN_ROUND && willRetire(sel, league.leagueMetadata.seasonNumber ?? 1),
    // v3.30.0: "ændr i Træning ›" åbner 🏋️ Træning med hans række markeret og rullet frem – står han ikke i den valgte kæde, vises alle
    onTrainLink: isOwn ? () => { const id = sel.id, line = sel.line; showTab('traening'); if ((view.trainLine ?? 'all') !== 'all' && view.trainLine !== line) view.trainLine = 'all';
      view.trainPid = id; render(); document.querySelector(`#training-table tr[data-pid="${id}"]`)?.scrollIntoView({ block: 'center' }); } : null,
    onOpenMatch: (hi, ai) => { const i = lr.matches.findIndex((m) => m.homeId === league.teams[hi]?.id && m.awayId === league.teams[ai]?.id); if (i >= 0) openReport(i); } }) : null;

  const pitch = h('div', { class: 'panel' }, h('h3', { id: 'pitch-title' }, `${team.name} – ${team.tactics.baseFormation}`), isOwn ? null : h('div', { class: 'muted', id: 'pitch-opp' }, 'Modstanderhold – kun offentlige data'),
    // Ringen (QC/Spilfører UI v3.29.0): byt i gang, ellers panelets spiller, ellers den gamle markering (fixIssue) – aldrig to lilla på to spillere
    renderPitch({ team, isOwn, ui: { ...view, selectedPlayerId: view.pitchSwapId ?? sel?.id ?? view.selectedPlayerId }, pairs: isOwn ? lineupPairs(team, chemRefOf(league)) : null,
      // Egen brik: byt som før – panelet åbnes og skifter IKKE (brugerens valg 2026-11-02); et andet hold: klik åbner kortet
      onSelect: (p, own) => { if (own) { view.listLine = p.line; pickForSwap(team, p); } else { view.selectedPlayerId = p.id; view.listLine = p.line; openCard(p.id, `.lp-info[data-pid="${p.id}"]`); } },
      onTokenSwap: (a, b) => { clearSwap(); view.notice = ''; withChem(team, () => change(() => act.swapPlayers(team, a, b))); },
      onMove: (slot, pos) => { clearSwap(); change(() => act.moveSlot(team, slot, pos)); } }),
    isOwn ? h('div', { class: 'muted help' }, 'Træk = justér position (målmanden står fast) · Klik på en brik = vælg (listen viser hans kæde) · Klik på en anden = byt · ⓘ i listen = spillerkortet') : null,
    isOwn ? chemLegend(lineupPairs(team, chemRefOf(league))) : null);

  // Spillerlisten ved banen (v3.19.0): opstilling, bænk og reserver ét sted
  const lineupList = renderLineupList({ team, isOwn, ui: { ...view, swapId: view.pitchSwapId, cardId: sel?.id ?? null }, msg: isOwn ? view.pickMsg ?? '' : '',
    // v3.29.0: ⓘ og "Se kort ›" åbner kortpanelet; et klik på din egen række er stadig byt (og rører ikke panelet)
    onInfo: (p) => openCard(p.id, `.lp-info[data-pid="${p.id}"]`),
    onPickCard: isOwn ? (id) => openCard(id, `.lp-info[data-pid="${id}"]`) : null,
    onPick: (p) => (isOwn ? pickForSwap(team, p) : (view.selectedPlayerId = p.id, openCard(p.id, `.lp-info[data-pid="${p.id}"]`))),
    onSort: (c) => { if (view.listSort === c.key) view.listSortAsc = !view.listSortAsc; else { view.listSort = c.key; view.listSortAsc = false; } render(); },
    onBlocked: (c) => { view.notice = `🔒 Anti-spionage: du kan ikke sortere ${team.name} på "${c.label}" – det er skjult information.`; render(); },
    onLine: (v) => { view.listLine = v; render(); },
    onAutoBench: () => change(() => act.setAutoBench(team)) });

  const tactics = renderTactics({ team, isOwn, ui: game.ui, on: {
    formation: (f) => {   // QC K3: sig, hvad der skete, når brikkerne flytter sig
      const before = team.tactics.lineupSlots.slice();
      withChem(team, () => change(() => act.setFormation(team, f)));
      const moved = team.tactics.lineupSlots.filter((id, i) => id !== before[i]).length, out = act.outOfPositionCount(team);
      view.notice = `${f}: ${moved ? `${moved} spillere er flyttet, så flest står på deres naturlige position` : 'ingen behøvede at flytte'}${out ? ` – ${out} står uden for position (se ⚠ på banen)` : ''}.`;
      render();
    },
    preset: (i) => withChem(team, () => change(() => { act.switchPreset(team, game.ui.activePresetIndex, i); game.ui.activePresetIndex = i; })),
    resetDrag: () => change(() => act.resetDrag(team)),
    arrange: () => { let moved = 0; withChem(team, () => { moved = act.arrangeLineup(team); }); view.notice = moved ? '⇄ De 11 er flyttet, så flest står på deres naturlige position.' : '⇄ De 11 står allerede bedst muligt efter position.'; change(() => {}); },
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
    // paper er en funktion (v3.31.0): home.js kalder den kun uden for afspilningen – dens ENE vagt – så klummen aldrig bygges for den runde, der afspilles
    hjem: () => [renderHome({ ...homeData(), playing: !!mc?.playing, paper: paperHeadline, on: homeHandlers })],
    // Opstilling sker i Trup: tallene og sorteringen over banen (brugeren: "nærmest umuligt at
    // opstille sit hold, da informationerne og sorteringsmulighederne ligger på 2 forskellige faner").
    trup: () => [header,
      // Sæsonslut under afspilning (som bogført-før-afspilning): runden er bogført, og sæsonskiftet er sket
      mc?.playing && seasonJustEnded(league) ? h('div', { class: 'notice', id: 'turnover-booked' }, '🗓 Sæsonen sluttede med denne runde: alle er blevet et år ældre, og sæsonrapporten med ungdomstilbuddene står på Liga, når kampene er spillet.') : null,
      // v3.30.0: træningen står på sin egen fane – her kun "+N" i regnearket og, når der er nogen, hvad de betyder og hvor træningen står
      h('div', { class: 'muted help trup-help', id: 'trup-help' }, 'Klik på en spiller for at åbne spillerkortet',
        anyGain ? h('span', { id: 'trup-gain-help' }, ` · +N = antal +1 efter runde ${ownRound} (træning og kampe) · træningen står på `,
          h('button', { class: 'linklike', id: 'trup-to-training', onclick: () => showTab('traening') }, '🏋️ Træning ›')) : null,
        // QC v3.30.0: lige efter sæsonslut er alle blevet et år ældre, så tallene kan være faldet – derfor ingen "+N" her, selv om Træning viser rundens +1
        !anyGain && isOwn && ownRep && seasonJustEnded(league) && gainsByPlayer(ownRep).size ? h('span', { id: 'trup-gain-aged' }, ' · ingen +N lige efter sæsonslut: alle er blevet et år ældre – rundens +1 står på ',
          h('button', { class: 'linklike', id: 'trup-to-training', onclick: () => showTab('traening') }, '🏋️ Træning ›')) : null), matrix],
    // 🏋️ Træning (v3.30.0): altid DIT hold – bygget fra mine, uanset hvilket hold der vises i Trup (ingen scout-bjælke, intet kortpanel).
    // Øverst rundens opsamling (fra Trup), så hele træningsfladen; det ENE sted, fokus sættes
    traening: () => [trainingSummary(ownRep, mine, ownRound, () => showTab('taktik')),
      renderTrainingTable({ team: mine, report: ownRep, roundLabel: ownRound, selectedId: view.trainPid ?? null, line: view.trainLine ?? 'all', onLine: (v) => { view.trainLine = v; view.trainMsg = ''; view.trainPid = null; render(); }, msg: view.trainMsg ?? '',
        onFocus: (id, k) => change(() => act.setFocus(mine, id, k)),
        onFocusMany: (ids, k) => { const n = act.setFocusMany(mine, ids, k); view.trainMsg = `🏋️ ${n} spiller${n === 1 ? '' : 'e'} træner nu ${FOCUS[k].label}${n < ids.length ? ` (${ids.length - n} kan ikke – Målmand er kun for målmænd)` : ''}.`; change(() => {}); } })],
    // Taktik (v3.19.0): banen og spillerlisten side om side – opstillingen ét sted; faser og Hvis-Så nedenunder
    // v3.20.1 (brugeren: "langt ned til taktikindstillingerne"): indstillingerne under banen; v3.29.0: kortet står i panelet
    taktik: () => [h('div', { class: 'tactics-layout taktik-layout' }, h('section', { class: 'tk-pitch' }, pitch), h('section', { class: 'tk-list' }, lineupList), h('section', { class: 'tk-tactics' }, tactics))],
    // Efter fløjtet (v3.28.0, Spilfører UI: nederst blev den ikke fundet): vejen videre øverst – kun når den viste runde er den seneste og ikke afspilles
    // v3.31.0 (F3): avisen står kun på Liga – linjen her bærer rundens overskrift som link dertil
    kamp: () => [shown && !shown.playing && shown.round === league.lastRound?.round ? toHomeLine() : null,
      shown ? renderMatchCenter({ mc: sendState(shown), myTeamId: mine.id, on: mcHandlers }) : h('div', { class: 'panel empty', id: 'no-matches' }, 'Ingen kampe spillet endnu. Tryk ▶ Spil runde på 🏠 Hjem (eller ▶ øverst) – modstanderen følger kampprogrammet på Liga-fanen.'),
      ],
    liga: () => [mc?.playing ? h('div', { class: 'notice', id: 'booked-league' }, '📺 Runden spilles i Kamp-fanen – tabellen herunder er allerede opdateret med den.') : null,
      !mc?.playing ? renderSeasonReport({ league, mine,
        onTake: (id) => { const err = act.takeYouth(mine, id, game.league); view.notice = err ? `🧒 ${err}` : '🧒 Ungdomsspilleren er rykket op i truppen.'; change(() => {}); },
        onDrop: (id) => change(() => act.dropYouth(mine, id)) }) : null,
      // Holdvælgeren (v3.28.0): her og i scout-bjælken – før i topbaren
      h('div', { class: 'row see-team', id: 'see-team' }, h('label', { for: 'team-select' }, 'Se et hold:'), teamSelect(), h('span', { class: 'muted' }, 'eller klik på et hold i tabellen')),
      standings,
      // Avisen (v3.31.0, F3): KUN her, lige under tabellen – hvor Hjems "Læs hele avisen ›" og Kamps 📰-link lander (#gazette)
      league.lastRound && !mc?.playing ? renderGazette(league.lastRound.gazette, mine.id, openGoal, league.lastRound.matches, columnNow(), openReport) : null,
      // Resultaterne skjules under afspilningen, ligesom avisen (ellers afsløres de).
      league.lastRound && !mc?.playing ? renderLastRound({ round: league.lastRound, myTeamId: mine.id, onOpen: openReport, seasonRound: seasonAndRound(league, league.lastRound.round)[1] }) : null,
      // Programmet skjules også under afspilningen (det viser den bogførte rundes resultat).
      !mc?.playing ? renderSchedule({ league, pairs: pairRound(league), myTeamId: mine.id }) : null,
      !mc?.playing ? renderTransferLog({ league }) : null,
      // Statistikken skjules også under afspilningen (den er bogført og ville afsløre runden).
      !mc?.playing ? renderStats({ league, myTeamId: mine.id }) : null],
    admin: () => [renderAdmin()],
    klub: () => (!isOwn ? [renderPublicClub({ league, pub: viewTeam(team, false), me: mine, playing: !!mc?.playing, msg: view.marketMsg ?? '',
      onBack: () => showTeam(myIdx()),
      onBuy: (id) => { const name = team.squad.find((p) => p.id === id)?.shortName; const err = buyPlayer(league, mine, id); view.marketMsg = err ? `💰 ${err}` : `💰 ${name} er købt og står nu i din trup.`; change(() => {}); } })] : null) ?? [renderClub({ league, team: mine, playing: !!mc?.playing }), renderMarket({ league, team: mine, playing: !!mc?.playing,
      // v3.21.1: beskeden ved listen (QC) – og den nye akademispiller ved navn, hvis han kom ind
      onAccept: (id) => { view.marketMsg = transferMsg(id, () => acceptOffer(league, mine, id), 'solgt'); change(() => {}); },
      onRelease: (id) => { view.marketMsg = transferMsg(id, () => releasePlayer(league, mine, id), 'fritstillet'); change(() => {}); },
      onDecline: (id) => change(() => { view.marketMsg = ''; declineOffer(league, mine, id); }), onUnlist: (id) => change(() => { view.marketMsg = ''; setListed(league, mine, id, false); }),
      line: view.marketLine ?? 'all', onLine: (v) => { view.marketLine = v; view.marketMsg = ''; render(); }, msg: view.marketMsg ?? '',
      // Bekræftelsen står ved listen (QC: beskeden øverst var uden for skærmen, når man stod nede i listen)
      onBuy: (id) => { const name = league.teams.flatMap((t) => t.squad).find((p) => p.id === id)?.shortName; const err = buyPlayer(league, mine, id); view.marketMsg = err ? `💰 ${err}` : `💰 ${name} er købt og står nu i din trup.`; change(() => {}); } })],
  }[tab]();
  // v3.20.1: tabellerne ruller ikke selv længere. Sidens position bevares af browseren (replaceChildren er ét skridt, højden
  // er den samme) – Test Manager: en genskabelse her var død kode (mutationen overlevede); e2e måler, at siden står stille.
  // Scout-bjælken (v3.28.0, lilla = hvor du er): på Trup, Taktik og Klub, når et andet hold vises – skift hold uden at forlade fanen
  const scout = !isOwn && SCOUT_TABS.includes(tab) ? h('div', { class: 'scoutbar', id: 'scout-banner' },
    h('span', { id: 'scout-txt' }, '👁 ', h('span', { class: 'scout-long' }, `Du ser ${team.name} – kun offentlige data`)), teamSelect(),
    h('button', { id: 'scout-back', class: 'mini', onclick: () => showTeam(myIdx()) }, '← Dit hold')) : null;
  const bar = BAR_TABS.includes(tab);
  playbar.replaceChildren(...(bar ? [renderPlayBar(tab)] : []));
  document.body.classList.toggle('has-bar', bar);
  app.replaceChildren(...[
    scout,
    view.notice ? h('div', { class: 'notice', id: 'notice' }, view.notice,
      view.backupKey && storage.getItem(view.backupKey) ? h('button', { class: 'mini', id: 'download-migration-backup', onclick: () => download(storage.getItem(view.backupKey), `${view.backupKey}.json`) }, ' ⬇ Hent backup som fil') : null) : null,
    h('div', { class: `tabpane tab-${tab}` }, ...content.filter(Boolean)),
  ].filter(Boolean));
  document.documentElement.style.setProperty('--top-h', `${document.querySelector('.topbar').offsetHeight}px`);   // scout-bjælken står under den faste topbar
  // Kortpanelet (v3.29.0): under topbaren OG scout-bjælken (med dens afstand), over Spil-bjælken
  const sb = document.getElementById('scout-banner');
  document.documentElement.style.setProperty('--scout-h', `${sb ? sb.offsetHeight + 16 : 0}px`);
  document.documentElement.style.setProperty('--bar-h', `${playbar.offsetHeight}px`);
  drawCardPanel(cs, card, team, isOwn, tab, refocus);
  document.body.dataset.klar = 'ja';
}
// Panelets indhold – #cardpanel er rulle-elementet og står fast i index.html; kun indholdet skiftes. Rulningen bevares inden for samme
// åbning (også ved ◀ ▶, så evner kan sammenlignes) og nulstilles ved en ny.
function drawCardPanel(cs, card, team, isOwn, tab, refocus) {
  const st = cardpanel.scrollTop, sameOpen = !!cs && cardpanel.dataset.n === String(cs.n);
  if (!cs) {
    cardpanel.replaceChildren(); cardpanel.hidden = true; cardpanel.dataset.open = 'nej'; cardpanel.dataset.n = '';
    document.body.classList.remove('card-open');
    return;
  }
  const p = cs.p, ids = p ? cardOrder(team, isOwn, tab, p.id) : [], i = ids.indexOf(p?.id);
  const goto = (j) => (j >= 0 && j < ids.length ? () => openCard(ids[j]) : null);
  const toSquad = cs.bought ? h('button', { class: 'linklike', id: 'panel-to-squad', onclick: () => { const id = cs.pid; showTeam(myIdx()); if (tabNow() !== 'trup') showTab('trup'); view.selectedPlayerId = id; openCard(id, `#matrix tr[data-pid="${id}"]`); } }, `Se ${cs.boughtName ?? 'ham'} i din trup ›`) : null;
  cardpanel.replaceChildren(...renderCardPanel({ card: card ?? h('div', { class: 'panel cp-receipt' }, toSquad),
    title: p ? `#${p.shirtNumber} ${p.name}` : '💰 Købt', onClose: closeCard, nav: !!p, onPrev: p ? goto(i - 1) : null, onNext: p ? goto(i + 1) : null,
    pickMsg: tab === 'taktik' && isOwn ? view.pickMsg ?? '' : '', msg: cs.msg ?? '' }).filter(Boolean));
  cardpanel.hidden = false; cardpanel.dataset.open = 'ja'; cardpanel.dataset.n = String(cs.n);
  cardpanel.setAttribute('aria-labelledby', card ? 'card-title' : 'cp-title');
  document.body.classList.add('card-open');
  cardpanel.scrollTop = sameOpen ? st : 0;
  if (refocus) { document.getElementById(refocus)?.focus({ preventScroll: true }); if (!cardpanel.contains(document.activeElement)) document.getElementById('card-close')?.focus({ preventScroll: true }); }
}

// ---------- 🏠 Hjem (v3.28.0) ----------
// Tabellen, som Liga viser den (renderStandings): lige efter sæsonslut slutstillingen, ellers sæsonens tabel
function tableNow() { const last = seasonJustEnded(game.league); return last ? last.table : sortStandings(game.league.leagueMetadata.standings); }
const placeOf = (rows, id) => rows.findIndex((s) => s.teamId === id) + 1;
// Hjem-fanens tal – alt regnes her fra de samme kilder som resten af appen; under afspilning skjuler home.js det, der er bogført
function homeData() {
  const L = game.league, mine = myTeam(), lr = L.lastRound, table = tableNow(), myPos = placeOf(table, mine.id), ended = !!seasonJustEnded(L);
  const m = lr?.matches?.find((x) => x.homeId === mine.id || x.awayId === mine.id);
  let last = null;
  if (m) {
    const home = m.homeId === mine.id, diff = home ? m.homeGoals - m.awayGoals : m.awayGoals - m.homeGoals;
    const scorers = (home ? m.ratings.home : m.ratings.away).filter((e) => e.goals > 0).map((e) => (e.goals > 1 ? `${e.shortName} (${e.goals})` : e.shortName));
    // ↑/↓ (QC-runde 2): kun fra sæsonens 2. runde – tabellen uden sidste runde, sorteret med samme funktion som Liga-tabellen
    let move = null;
    if (!ended && lr.round >= L.seasonStartRound && seasonRoundOf(L, lr.round) >= 2) {
      const prev = L.leagueMetadata.standings.map((x) => ({ ...x })), by = (id) => prev.find((x) => x.teamId === id);
      for (const r of lr.matches) {
        const a = by(r.homeId), b = by(r.awayId);
        a.goalsFor -= r.homeGoals; a.goalsAgainst -= r.awayGoals; b.goalsFor -= r.awayGoals; b.goalsAgainst -= r.homeGoals;
        a.points -= r.homeGoals > r.awayGoals ? 3 : r.homeGoals === r.awayGoals ? 1 : 0; b.points -= r.awayGoals > r.homeGoals ? 3 : r.homeGoals === r.awayGoals ? 1 : 0;
      }
      move = placeOf(sortStandings(prev), mine.id) - myPos;
    }
    // Kampens spiller (v3.31.0, F3) gennem visibility.js som avisens Rundens spiller: en modstander uden karakter (kun ejeren ser tallet)
    const motm = m.ratings.motm ? viewRatingEntry(m.ratings.motm, m.ratings.motm.teamId === mine.id) : null;
    last = { idx: lr.matches.indexOf(m), round: seasonAndRound(L, lr.round)[1], text: `${m.homeName} ${m.homeGoals} – ${m.awayGoals} ${m.awayName}`,
      result: diff > 0 ? 'won' : diff < 0 ? 'lost' : 'drawn', scorers, move, att: attText(m), motm };
  }
  const next = nextMatch(), opp = next.opp;
  // Modstanderens 3 seneste – kun fra indeværende sæson (QC-runde 2)
  const form = (L.history || []).filter((r) => r.round >= L.seasonStartRound).flatMap((r) => (r.results || []).filter((x) => x.h === opp.id || x.a === opp.id)
    .map((x) => { const d = x.h === opp.id ? x.hG - x.aG : x.aG - x.hG; return d > 0 ? 'V' : d < 0 ? 'T' : 'U'; })).slice(-3);
  const rep = L.trainingReport?.[mine.id], known = new Set(mine.squad.map((p) => p.id));
  const training = rep ? { round: seasonAndRound(L, rep.round)[1], gains: rep.gains.filter((x) => known.has(x.id)).length, injuries: rep.injuries.filter((id) => known.has(id)).length, strong: rep.strong?.up?.length ?? 0 } : null;
  const start = Math.max(0, Math.min(table.length - 5, myPos - 3));
  return {
    club: { name: mine.name, cash: shownCash(mine, !!mc?.playing), delta: mine.finance.ledger.length ? shownCash(mine, false) - shownCash(mine, true) : null },
    last, place: myPos, ended, roundsPlayed: L.leagueMetadata.round + 1 - L.seasonStartRound,
    next: { k: next.k, of: L.schedule.length, name: opp.name, home: next.home, place: placeOf(table, opp.id), form },
    issues: issueGroups(), youth: mine.youthOffers?.length ?? 0,
    training: training && (training.gains || training.injuries || training.strong) ? training : null,
    table: table.slice(start, start + 5).map((r) => ({ pos: placeOf(table, r.teamId), name: r.teamName, points: r.points, mine: r.teamId === mine.id })),
  };
}
const homeHandlers = {
  kamp: () => { const L = game.league, i = L.lastRound?.matches.findIndex((x) => x.homeId === myTeam().id || x.awayId === myTeam().id); if (!mc?.playing && L.lastRound && i >= 0) openReport(i); else showTab('kamp'); },
  liga: () => showTab('liga'), klub: () => showTab('klub'), traening: () => fixIssue(null, 'traening'), taktik: () => fixIssue(null, 'taktik'),
  // "Læs hele avisen ›" (Hjem) og "📰 «overskrift» ›" (Kamp): Liga, rullet til avisen (#gazette har scroll-margin-top under topbaren)
  paper: () => { showTab('liga'); document.getElementById('gazette')?.scrollIntoView({ block: 'start' }); },
  opp: () => showTeam(game.league.teams.indexOf(nextMatch().opp)),
  fix: (ids) => fixIssue(ids, 'taktik'),
};
// "Næste: runde N mod X (ude) · Forbered › · 📰 «overskrift» ›" øverst på Kamp efter fløjtet → Hjem / avisen på Liga (v3.31.0)
function toHomeLine() {
  const n = nextMatch(), head = paperHeadline();
  return h('div', { class: 'panel to-home' }, `Næste: runde ${n.k} mod ${n.opp.name} (${n.home ? 'hjemme' : 'ude'}) · `, h('button', { class: 'linklike', id: 'to-home', onclick: () => showTab('hjem') }, 'Forbered ›'),
    head ? [' · ', h('button', { class: 'linklike', id: 'kamp-paper-link', title: 'Rundens avis står på Liga', onclick: homeHandlers.paper }, `📰 «${head}» ›`)] : null);
}

// Samspil på spillerkortet (v3.24.0): ingen par i holdets tabel = fremmed for alle (et køb – eller en reserve, hvis par er glemt)
function chemCard(team, p) {
  const ref = chemRefOf(game.league), isNew = !Object.keys(team.chemistry ?? {}).some((k) => k.split('|').includes(p.id));
  return { isNew, best: isNew ? null : bestPartner(team, ref, p.id), pairs: playerPairs(team, ref, p.id) };
}
const strongCount = (pairs) => { const n = pairs.filter((x) => x.band === 'staerkt').length; return n === 0 ? '' : n === pairs.length ? 'De spiller alle stærkt sammen. ' : `${n} af ${pairs.length} par spiller stærkt. `; };
// Samspil (v3.24.0): forklaringen under banen og det svageste par i ord (Spilfører UI: på mobil er det eneste måde at se et pars bånd)
function chemLegend(pairs) {
  const w = weakestPair(pairs), key = (b) => h('span', { class: `chem-key ${b}` });
  return h('div', { class: 'chem-legend', id: 'chem-legend' },
    h('div', {}, '🤝 Samspil mellem naboer: ', key('staerkt'), 'stærkt ', key('sammen'), 'spillet sammen ', key('finder'), 'finder hinanden ', key('fremmede'), 'fremmede'),
    // QC: kun en advarsel, når der er noget at advare om – og hvad samspil gør i kampen
    // v3.24.2 (Spilfører UI/QC): tallet for stærke par står i alle tilstande
    h('div', { id: 'chem-weakest' }, (w && BAND_RANK[w.band] < BAND_RANK.sammen ? `Svagest lige nu: ${w.label} (${BAND_WORD[w.band]}). ` : 'Alle par har spillet sig sammen. ')
      + strongCount(pairs) + 'Samspil hjælper opbygningen og forsvaret mod løb i ryggen – par spiller sig sammen med kampe side om side.'));
}
// Byt og formation (v3.24.0): sig det, når et pars samspil skifter bånd – ved spillerlisten (QC/Spilfører UI: ikke øverst på siden)
function withChem(team, fn) {
  const ref = chemRefOf(game.league), before = lineupPairs(team, ref);
  fn();
  const ch = swapChanges(before, lineupPairs(team, ref));
  if (ch.length) { view.pickMsg = `🤝 ${ch.join(' · ')}`; render(); }
}

// Ét byt-sted (v3.19.0, før tre kopier): første klik vælger; andet klik: en starter med i spil → byt (swapPlayers),
// bænk ⇄ reserve → kamptruppen (swapBench), samme spiller → fravælg, bænk → bænk / reserve → reserve → nyt valg.
function pickForSwap(team, p) {
  const a = view.pitchSwapId;
  view.selectedPlayerId = p.id;
  const kind = act.swapKind(team, a, p.id);
  if (kind === 'deselect') { clearSwap(); view.notice = ''; render(); return; }
  if (kind === 'swap' || kind === 'bench') { clearSwap(); view.notice = ''; withChem(team, () => change(() => act.pickForSwap(team, a, p.id))); return; }
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
  const result = playRound(game.league, rng, { replay: true });
  saveReplay(storage, result.replay); delete result.replay;   // v3.24.3: gengivelsen ligger for sig selv, ikke i gemmet
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

// Link fra avisens "Rundens mål" (Liga-fanen – v3.31.0 står avisen kun dér): åbn kampen, markér målet og rul til det.
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
  filter: (f) => { mc ||= lastRoundView(game.league.lastRound); mc.filter = f; renderMc(); },
  // v3.24.3 (kamp-id): send den viste kamp (kun seneste runde – ældre kampe gemmes ikke)
  send: async (i) => {
    mc ||= lastRoundView(game.league.lastRound);
    const m = mc.matches[i], round = mc.round, [season, sr] = seasonAndRound(game.league, round);
    const p = buildPayload({ match: m, pack: replayOf(loadReplay(storage), round, i, m), version: VERSION, round: sr, season });
    if (p.error) { window.tactivarFejl?.(p.error); return; }
    mc.sending = i; renderMc();
    try {
      const { id } = await uploadMatch(FIREBASE, storage, p.fields); m.sentAs = { id, replay: p.replay }; persist();
      rememberSent(storage, { id, label: `Sæson ${season} runde ${sr}: ${m.homeName} ${m.homeGoals}-${m.awayGoals} ${m.awayName}`, replay: p.replay });
    }
    catch (e) { window.tactivarFejl?.(`📤 ${e.message}`); }
    finally { mc.sending = null; renderMc(); }
  },
  copyId: (id) => (navigator.clipboard ? navigator.clipboard.writeText(id).then(() => true, () => false) : Promise.resolve(false)),
};
// Kan den viste kamp sendes? Kun seneste runde, og kun når upload er sat op (ellers en forklaring i stedet for knappen)
// QC v3.24.3: mangler gengivelsespakken (fuldt lager, anden liga), siges det FØR afsendelse – og de sendte id'er står i en liste,
// der overlever næste runde
const sendState = (v = mc) => {
  if (!v) return v;
  const latest = game.league.lastRound && v.round === game.league.lastRound.round;
  v.canSend = !!(FIREBASE && latest);
  v.sendWhy = !latest ? 'Kun seneste runde kan sendes – ældre runder gemmes ikke, så de kan ikke spilles igen.' : !FIREBASE ? '📤 Kamp-id: ikke sat op endnu' : null;
  v.noReplay = v.canSend && !v.playing && !replayOf(loadReplay(storage), v.round, v.viewIdx, v.matches[v.viewIdx]);
  v.sent = v.playing ? [] : loadSent(storage);
  return v;
};
const matchCenterEl = () => (sendState(), renderMatchCenter({ mc, myTeamId: myTeam().id, on: mcHandlers }));
// Under afspilning tegnes kun Match Center om (ikke hele siden).
function renderMc() { const el = document.getElementById('match-center'); if (el) el.replaceWith(matchCenterEl()); }

start();
