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
