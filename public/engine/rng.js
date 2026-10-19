// Seedet tilfældighedsgenerator (mulberry32). Hele motoren trækker tilfældighed herfra,
// så en kamp med samme seed altid giver samme forløb – det er det, testene bygger på.
export function createRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    // Heltal i [min, max], begge inklusive
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

export const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;
