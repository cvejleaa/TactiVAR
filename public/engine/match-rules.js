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
