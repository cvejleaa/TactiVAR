// Fixturet tests/fixtures/save-v3.33.0.json (v3.33.1, gemmeformat 10): lavet med v3.33.0-koden – kør mod en worktree af bc5b1fb:
//   node tools/make-save-v3330.mjs <worktree> 7 tests/fixtures/save-v3.33.0.json   (ny liga + 9 runder)
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import fs from 'node:fs';
const root = resolve(process.argv[2]);
const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
const { createRng } = await imp('public/engine/rng.js');
const { createLeague } = await imp('public/engine/generator.js');
const { playRound, commitRound } = await imp('public/engine/season.js');
const { serialize, parseSave } = await imp('public/state/storage.js');
const { willRetire } = await imp('public/engine/career.js');
const seed = Number(process.argv[3] || 7);
let L = createLeague(createRng(seed));
// gennem normalizeLeague som appen
L = parseSave(serialize({ league: L, notes: {}, ui: { activePresetIndex: 0, tab: 'hjem' } })).state.league;
// Sæson 1 har ingen 31+: alderen sættes i gemmet (felt 34 = sikker; en 31-årig, der IKKE stopper; en bot-spiller 34)
const me = L.teams.find((t) => !t.isBot), bot = L.teams.find((t) => t.isBot);
const fld = me.squad.filter((p) => p.line !== 'GK');
fld[fld.length - 1].age = 34;
const stay = fld.slice(0, -1).reverse().find((p) => { const a = p.age; p.age = 31; const r = willRetire(p, 1); if (r) p.age = a; return !r; });
console.log('stay', stay?.shortName, 'sure', fld[fld.length - 1].shortName);
bot.squad.filter((p) => p.line !== 'GK').at(-1).age = 34;
const rng = createRng(seed * 13);
for (let r = 0; r < 9; r++) { const res = playRound(L, rng); commitRound(L, res, rng); }
const all = L.teams.flatMap((t) => t.squad.map((p) => ({ p, t })));
const old = all.filter(({ p }) => p.age >= 31);
console.log('round', L.leagueMetadata.round, 'old', old.map(({ p, t }) => `${p.shortName} ${p.line} ${p.age} ${t.isBot ? 'bot' : 'MIG'} retire=${willRetire(p, 1)}`).join(' | '));
console.log('dist>0', all.filter(({ p }) => p.distanceSum > 0).length);
if (process.argv[4]) fs.writeFileSync(process.argv[4], serialize({ league: L, notes: {}, ui: { activePresetIndex: 0, tab: 'hjem' } }, 1762500000000));
