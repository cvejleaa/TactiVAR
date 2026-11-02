// Udelukkelse og tacklinger (v3.27.0, nr. 64 – brugeren 2026-11-02: hvert 4. gule kort, tacklingerne koblet på kortene).
// Del 1 (liga): hele sæsoner med alle hold – udelukkede kampe pr. hold pr. sæson, fordelt på kæde og årsag, flest udelukkede
// samtidig på ét hold, og at ingen udelukket spiller nogensinde kom i kamp. Del 2 (dit valg): dit hold spiller hele sæsoner med
// Forsigtig / Normal / Aggressiv – gule kort og udelukkede kampe pr. sæson, presset vundet og netto mål pr. kamp.
// Kør: node tools/measure-bans.mjs [sæsoner=10] [rod]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function measureBans(seasons = 10, root = resolve(import.meta.dirname, '..')) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { playRound, commitRound } = await imp('public/engine/season.js');
  const r2 = (v) => Math.round(v * 100) / 100;
  // Én sæson; cb(L, res, newBans) efter hver runde. newBans = [{ p, team, add }]
  const season = (seed, prep, cb) => {
    const rng = createRng(seed), L = createLeague(rng);
    prep?.(L);
    for (let r = 0; r < 14; r++) {
      const banned = new Set(L.teams.flatMap((t) => t.squad.filter((p) => p.banMatches > 0).map((p) => p.id)));
      const before = new Map(L.teams.flatMap((t) => t.squad.map((p) => [p.id, p.banMatches ?? 0])));
      const res = playRound(L, rng);
      commitRound(L, res, rng);
      const fresh = L.teams.flatMap((t) => t.squad.map((p) => ({ p, team: t, add: (p.banMatches ?? 0) - Math.max(0, before.get(p.id) - 1) })).filter((x) => x.add > 0));
      cb(L, res, fresh, banned);
    }
  };
  // Del 1: ligaen
  const liga = { teamSeasons: 0, banGames: 0, byLine: {}, byWhy: {}, maxOut: 0, bannedPlayed: 0, apps: 0 };
  for (let s = 1; s <= seasons; s++) season(s * 101, null, (L, res, fresh, banned) => {
    for (const m of res.matches) for (const e of [...m.ratings.home, ...m.ratings.away]) { liga.apps++; if (banned.has(e.playerId)) liga.bannedPlayed++; }
    for (const { p, add } of fresh) { liga.banGames += add; liga.byLine[p.line] = (liga.byLine[p.line] ?? 0) + add; liga.byWhy[p.banWhy] = (liga.byWhy[p.banWhy] ?? 0) + add; }
    for (const t of L.teams) liga.maxOut = Math.max(liga.maxOut, t.squad.filter((p) => p.banMatches > 0).length);
  });
  liga.teamSeasons = seasons * 8;
  const out = { perTeamSeason: r2(liga.banGames / liga.teamSeasons), byLine: liga.byLine, byWhy: liga.byWhy, maxOut: liga.maxOut, bannedPlayed: liga.bannedPlayed, apps: liga.apps };
  // Del 2: dit valg
  out.tackle = {};
  for (const ti of ['CAUTIOUS', 'NORMAL', 'AGGRESSIVE']) {
    let y = 0, bans = 0, gf = 0, ga = 0, pts = 0, games = 0, press = 0, pressWon = 0;
    for (let s = 1; s <= seasons; s++) season(s * 211, (L) => { L.teams.find((t) => !t.isBot).tactics.phases.phase2_defending.tacklingIntensity = ti; }, (L, res, fresh) => {
      const me = L.teams.find((t) => !t.isBot);
      for (const { team, add } of fresh) if (team === me) bans += add;
      const m = res.matches.find((x) => x.homeId === me.id || x.awayId === me.id), home = m.homeId === me.id;
      const my = home ? m.homeGoals : m.awayGoals, op = home ? m.awayGoals : m.homeGoals;
      gf += my; ga += op; games++; pts += my > op ? 3 : my === op ? 1 : 0;
      y += (home ? m.ratings.home : m.ratings.away).reduce((a, e) => a + (e.yellows ?? 0), 0);
      const d = m.ownReports?.[me.id]; if (d) { press += d.press ?? 0; pressWon += d.pressWon ?? 0; }
    });
    out.tackle[ti] = { yellowsPerSeason: r2(y / seasons), banGamesPerSeason: r2(bans / seasons), pressWon: r2(pressWon / Math.max(1, press)), net: r2((gf - ga) / games), ppg: r2(pts / games) };
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await measureBans(Number(process.argv[2] || 10), process.argv[3] ? resolve(process.argv[3]) : undefined), null, 1));
}
