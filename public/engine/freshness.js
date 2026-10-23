// Friskhed – før, under og efter kampen (v3.13 samlet ét sted; season.js og match.js bruger den,
// så match.js aldrig importerer season.js).
// Friskhed (v3.7, brugeren: "kun 3 af mine spillere der har under 100% i friskhed"; før
// −4…9 og straks +8 igen). Kampen koster efter løbet distance – højt pres koster altså mere –
// og udholdenhed dæmper: km·(1,5 − STA·0,03). Restitution til næste runde: 41 % af det, der
// mangler op til 100 (v3.10.1, brugeren: "næsten alle mine spillere er langt nede i friskhed" –
// valgt ≈80 %; før 35 %; ikke brugt: +15 oveni) – jo mere træt, jo hurtigere kommer han sig.
// Ligevægt for en fast starter f = 100 − 1,44·pris (QC: med fast +5 endte alle på bunden, og
// rotation blev en fast afgift): CM (pris ≈14) ≈80 %, STA 20 (≈10) ≈86 %, målmand ≈88 %.
export const REST_SHARE = 0.41, REST_BENCH = 15, FRESH_FLOOR = 50;
export const matchCost = (km, stamina) => Math.round(km * (1.5 - stamina * 0.03));
export const restore = (f) => Math.min(100, f + Math.round(REST_SHARE * (100 - f)));
export const afterMatchFreshness = (fresh, km, stamina, noise = 0) => Math.max(FRESH_FLOOR, restore(fresh - Math.max(0, matchCost(km, stamina) + noise)));

// Friskhed i kampen (v3.13, brugeren: "Friskhed skal ændre sig i løbet af kampen, ellers en stamina ikke
// så vigtig en evne"). Prisen ovenfor rammer kun mellem kampene og ændrer sig næsten ikke med STA (højt
// STA løber flere km: CM STA 6 ≈ 15, STA 16 ≈ 13 – QC/Spilfører). I kampen taber spilleren
// pladsens grund-km · pres/løb · (IN_MATCH_BASE − IN_MATCH_STA·STA) point på 90 min – uden STA på km'en:
// CM STA 6 ≈ 20, STA 10 ≈ 16,5, STA 16 ≈ 11. Hvert tabt point gør ham TIRED_PER_POINT svagere oven i
// friskheden fra før kampen (20 point → 12 %). Friskheden efter kampen regnes som før (km-prisen).
export const IN_MATCH_BASE = 2.2, IN_MATCH_STA = 0.08, IN_MATCH_MIN = 0.3, TIRED_PER_POINT = 0.006;
export const drainFactor = (stamina) => Math.max(IN_MATCH_MIN, IN_MATCH_BASE - IN_MATCH_STA * (stamina ?? 10));

// Holdets udskiftningsgrænse (v3.13, brugeren: grænsen hører til holdet og "skal kunne angives i taktik
// opsætningen, så hvert hold selv vælger"): en træt spiller skiftes ud, når hans friskhed i kampen er
// under grænsen – i hvilket som helst minut. 0 = fra. NEAR: når en pause alligevel bruges, tages også dem
// med, der højst er NEAR over grænsen (ellers brugte hvert skift sin egen pause – QC). Indskifteren skal
// selv være mindst NEAR over grænsen.
export const SUBS_LIMIT = Object.freeze({ min: 50, max: 85, def: 70, near: 5 });
export const clampSubsLimit = (v) => (v === 0 || v === '0' ? 0 : Math.max(SUBS_LIMIT.min, Math.min(SUBS_LIMIT.max, Math.round(Number(v) || SUBS_LIMIT.def))));
