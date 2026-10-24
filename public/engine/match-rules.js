// Udskiftningsreglerne (v3.13, brugeren: "Antallet af udskiftninger skal kunne defineres af
// systemadministrator, men skal som udgangspunkt følge FIFA/UEFAs regler for turneringer").
// Systemadministratoren ændrer tallene HER og deployer – trin 1 har ingen admin-side; med login og
// server (trin 2) flyttes de til serveren. Standard = IFAB Law 3 (fast siden 2022), som UEFA og FIFA
// bruger i turneringer: 5 udskiftninger pr. hold i højst 3 pauser i spillet – halvlegen tæller ikke
// som en pause. Skadesskift tæller med i begge. Bevidst udeladt: ekstra hjernerystelses-skift og
// ekstra skift i forlænget spilletid (motoren har hverken diagnose eller forlængelse). Bænken er
// truppen minus de 11 (18 − 11 = 7). Ændres tallene, gælder de fra næste kamp.
export const MATCH_RULES = Object.freeze({ maxSubs: 5, maxWindows: 3 });

// Højst så mange Hvis-Så-regler pr. plan (v3.13: 8, før 5 – udskiftninger deler pladserne med planskift).
export const MAX_RULES = 8;

// Udvisninger (v3.15, Spilførerens sæsongennemgang: 0 røde kort og 8 dobbelt-gule på en sæson). Andet gule kort giver
// rødt; et direkte rødt kort kommer kun ved den grove tackling, der skader en modspiller (DIRECT_RED_P af dem). Holdet
// spiller med en mand mindre – ingen indskiftning for en udvist (fodboldregel). Med færre mand er hver spiller svagere
// i duellerne (SHORT_PER_MAN pr. manglende mand, fordi gennemsnit og lodtrækning ellers ikke mærker det – QC) og
// bliver hurtigere træt (SHORT_DRAIN: tabet af friskhed pr. 90 min stiger så mange gange pr. manglende mand).
// Målt (2500 kampe, et rødt kort, mindst 20 min tilbage): med 0,04 scorer holdet med ti mand 1,06 og lukker 1,93 ind pr. 90
// min efter udvisningen (uden straf 1,33 / 1,49; med 0,08 0,57 / 2,78) – på linje med virkeligheden (færre mål, flere imod).
// En spiller med gult kort holder igen: kun SECOND_YELLOW_P af hans kortværdige frispark giver andet gule (ellers ≈0,6
// udvisninger pr. kamp, fordi kortene samles på de få forsvars- og midtbanespillere – Superligaen ≈0,1).
export const CARD_RULES = Object.freeze({ DIRECT_RED_P: 0.07, SECOND_YELLOW_P: 0.17, SHORT_PER_MAN: 0.04, SHORT_DRAIN: 0.25 });
// Højst så mange træthedsskift pr. hold ad gangen (v3.15, brugerens valg "spred skift"; Spilfører: en trippeludskiftning
// er normal) – også i pausen ved 45', som ikke koster en skifte-pause. Flere trætte end loftet bruger altså flere pauser.
export const FATIGUE_SUBS_AT_ONCE = 3;
// En kamp kræver mindst 7 spillere (IFAB Law 3) – motoren udviser aldrig under det (ingen afbrudt kamp).
export const MIN_PLAYERS = 7;
// VAR som i virkeligheden (v3.15.1, brugeren: "VAR skal virke som i virkeligheden … nogle gange tjekker for offside
// selv om der ikke scores og andre for røde kort, andre igen for om der er straffespark"). VAR er ikke længere en
// chancetype (før: 22 % af chancerne afgjort af VAR, 0,50 annullerede mål pr. kamp – målt i measure-duels.mjs var):
// chancen afgøres først, og VAR tjekker bagefter situationen. Alle tal er lodtrækninger (ingen tærskel, der afslører en
// spillers skjulte trin) og afhænger aldrig af modstanderens indstillinger (§3). Værdierne findes ikke andre steder i
// motoren og er indbyrdes forskellige, så testenes scriptede rng (chance(p) pr. værdi) kan skelne dem (QC; vagt i
// var-check.test.mjs).
//  GOAL_CHECK_P     et mål tjekkes synligt (offside på den forreste – eller frispark i opspillet, GOAL_FOUL_SHARE)
//  OFFSIDE_FLAG_P   en afslutning, der ikke går ind: linjedommerens flag var oppe (ikke VAR, tæller ikke som VAR-tjek)
//  PEN_CHECK_P      en straffe tjekkes (filmning – den fældedes theatre – eller offside i opspillet, PEN_OFFSIDE_SHARE)
//  PEN_AWARD_P      pr. tick: VAR kalder dommeren ud og giver et straffespark, han ikke så
//  RED_CHECK_P      et direkte rødt kort tjekkes (cynicism: jo mere kynisk, jo oftere står kortet)
//  RED_UPGRADE_P    en grov tackling, der kun gav frispark, kan opgraderes til rødt
export const VAR_RULES = Object.freeze({ GOAL_CHECK_P: 0.131, GOAL_FOUL_SHARE: 0.27, OFFSIDE_FLAG_P: 0.043, PEN_CHECK_P: 0.26, PEN_OFFSIDE_SHARE: 0.31, PEN_AWARD_P: 0.0023, RED_CHECK_P: 0.53, RED_UPGRADE_P: 0.041 });
// Forbi (v3.15.1, Spilfører: 67 % af skuddene gik på mål – Superligaen ≈ 33–35 %): en afslutning, keeperen ikke skal
// redde, går forbi, over, på stolpen eller blokeres med MISS_P; en blokeret giver hjørnespark med MISS_CORNER_P.
export const MISS_P = 0.62, MISS_BLOCK_SHARE = 0.6, MISS_CORNER_P = 0.88;
