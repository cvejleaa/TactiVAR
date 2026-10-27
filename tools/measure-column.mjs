// Klummen over en sæson (v3.21.2, Spilførerens fund): hvor tit står de samme vendinger, og bærer overskriften din kamp?
// node tools/measure-column.mjs [sæsoner=3] [rod=denne checkout] – rod kan være en worktree af forrige version (før-tallene).
// Pr. sæson (14 runder, dit hold = ligaens menneskehold): overskrift med dit hold, "vendte kampen"/"Comeback" om en sejr med 3+,
// løberboksen (≥ RUNNER_BOX_KM, eller altid før v3.21.2), mest brugte kamp-overskrift (HEADS) og måltekst pr. type.
// ("kampens tema" står i "Mit bud", som kræver programmet – målt i column-v3212.test.mjs.)
// 3 sæsoner = 42 runder, v3.21.1 → v3.21.2: overskrift med dit hold 17 → 23; "vendte kampen"/comeback om en 3+-sejr 1 → 0;
// løberboksen 42 → 16 (≥ 12,3 km); mest brugte kamp-overskrift 10 → 6; mest brugte måltekst 4 → 4.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function measureColumn(seasons = 3, root = resolve(import.meta.dirname, '..')) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { playRound, commitRound } = await imp('public/engine/season.js');
  const { buildColumn } = await imp('public/engine/column.js');
  const MC = await imp('public/ui/matchcenter.js').catch(() => ({}));
  const runnerKm = MC.RUNNER_BOX_KM ?? 0;
  const out = { rounds: 0, mineInTitle: 0, mineStory: 0, bigComeback: 0, runner: 0, headMax: 0, descMax: 0 };
  for (let s = 1; s <= seasons; s++) {
    const rng = createRng(s * 7717), L = createLeague(rng), me = L.teams.find((t) => !t.isBot);
    const heads = new Map(), descs = new Map(), history = [];
    for (let r = 0; r < 14; r++) {
      const res = playRound(L, rng); commitRound(L, res, rng);
      const lr = L.lastRound, table = L.leagueMetadata.standings.slice().sort((a, b) => b.points - a.points).map((x) => ({ teamId: x.teamId, teamName: L.teams.find((t) => t.id === x.teamId)?.name, points: x.points }));
      const col = buildColumn({ matches: lr.matches, gazette: lr.gazette, history: L.history ?? [], table, next: [], viewerTeamId: me.id, round: r + 1 });
      out.rounds++;
      const mine = lr.matches.find((m) => m.homeId === me.id || m.awayId === me.id);
      const myG = mine.homeId === me.id ? mine.homeGoals : mine.awayGoals, opG = mine.homeId === me.id ? mine.awayGoals : mine.homeGoals;
      if (col.title.includes(me.name)) out.mineInTitle++;
      if (myG - opG >= 3 || /kom tilbage|Sent drama: .*vandt|Sent point|hentede/.test(col.title)) out.mineStory++;
      for (const m of lr.matches) if (Math.abs(m.homeGoals - m.awayGoals) >= 3) {
        const w = m.homeGoals > m.awayGoals ? m.homeName : m.awayName;
        const others = col.sections.find((x) => x.id === 'col-others')?.others ?? [];
        if (col.title === `${w} vendte kampen` || others.some((o) => /vendte kampen|Comeback til|kom bagfra/.test(o.note) && o.note.includes(w))) out.bigComeback++;
      }
      const g = lr.gazette;
      if (g?.myRunner && g.myRunner.teamId === me.id && g.myRunner.distanceKm >= runnerKm) out.runner++;
      for (const o of col.sections.find((x) => x.id === 'col-others')?.others ?? []) {
        const k = o.head.replace(/[A-ZÆØÅ][\wæøå.]*( [A-ZÆØÅ][\wæøå.]*)*/g, 'X').replace(/\d+-\d+/g, 'S');
        heads.set(k, (heads.get(k) ?? 0) + 1);
      }
      for (const m of lr.matches) for (const gp of m.goalsPool ?? []) {
        const k = `${gp.kind}|${(gp.desc ?? '').replace(/#\d+ [^,.:–]+?(?=[ ,.:–]| \()/g, 'P')}`;
        descs.set(k, (descs.get(k) ?? 0) + 1);
      }
    }
    out.headMax = Math.max(out.headMax, ...heads.values());
    out.descMax = Math.max(out.descMax, ...descs.values());
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await measureColumn(Number(process.argv[2] || 3), process.argv[3] ? resolve(process.argv[3]) : undefined)));
}
