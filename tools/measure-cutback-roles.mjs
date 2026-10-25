// Hvem laver og lukker cutbacks (v3.16.7 M3, Spilfører: midtstoppere laver cutbacks, angribere lukker kanten i eget felt).
// Kantmanden = spilleren i "kommer forbi"/"lukker kanten mod"-linjen fra cutback() (løbs-cutbacks er løberens egne og tælles ikke),
// backen = den, der kom forbi eller lukkede. Rollen er spillerens plads i formationen (karakterarkets role). Pr. formation.
// Kør: node tools/measure-cutback-roles.mjs [antal] [rod]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const WIDE = new Set(['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW']);
const ATT = new Set(['ST', 'CF', 'LW', 'RW', 'CAM']);
export async function measureCutbackRoles(N = 1500, root = resolve(import.meta.dirname, '..')) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const out = { cutbacks: 0, wingerWide: 0, wingerCentral: 0, backWideOrDef: 0, backAttacker: 0, byFormation: {} };
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const m = s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
    const role = new Map([...m.ratings.home, ...m.ratings.away].map((e) => [`#${e.shirtNumber} ${e.shortName}|${e.teamName}`, e.role]));
    const form = { [m.homeName]: m.startFormations?.home, [m.awayName]: m.startFormations?.away };
    m.events.forEach((e, i) => {
      // cutback(): "↩️ [att] W kommer forbi B" (ikke løbs-cutbacken, der følger efter "løber sig fri"-løbet) og "🛡️ [def] B lukker kanten mod W (att)"
      let w, b, att, def;
      const a = e.type === 'INFO' && e.text.match(/^↩️ \[(.+?)\] (#\d+ .+?) kommer forbi (#\d+ .+?) og spiller bolden tilbage i feltet\.$/);
      const c = e.type === 'INFO' && e.text.match(/^🛡️ \[(.+?)\] (#\d+ .+?) lukker kanten mod (#\d+ .+?) \((.+)\)\.$/);
      const own = e.type === 'INFO' && e.text.match(/^❌ Dit cutback-forsøg stoppes: (#\d+ .+?) \((.+?)\) lukker kanten mod (#\d+ .+?)\.$/);
      if (a) { att = a[1]; w = a[2]; b = a[3]; def = att === m.homeName ? m.awayName : m.homeName; }
      else if (c) { def = c[1]; b = c[2]; w = c[3]; att = c[4]; }
      else if (own) { b = own[1]; def = own[2]; w = own[3]; att = def === m.homeName ? m.awayName : m.homeName; }
      else return;
      const wr = role.get(`${w}|${att}`), br = role.get(`${b}|${def}`);
      if (!wr || !br) return;
      const f = (out.byFormation[form[att]] ||= { n: 0, central: 0 });
      out.cutbacks++; f.n++;
      if (WIDE.has(wr)) out.wingerWide++; else { out.wingerCentral++; f.central++; }
      if (ATT.has(br)) out.backAttacker++; else out.backWideOrDef++;
    });
  }
  return out;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await measureCutbackRoles(Number(process.argv[2] || 1500), process.argv[3] ? resolve(process.argv[3]) : undefined), null, 1));
