// v3.26.1 Test Manager: løberboksen er fjernet – også for den, der IKKE er ejeren af løberen, og uanset km.
// Hullet: forfatterens tests viser kun h1 (ejeren) med 13,2 km; en genindført boks "kun for andre seere"
// (teamId !== myTeamId) eller ved andre km-værdier overlevede (B3). Vi dækker begge visninger (klumme + gammel avis),
// begge seere og både lav/høj km, og at de øvrige afsnit stadig står (så testen ikke er grøn på en tom avis).
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { renderGazette } = await import('../../public/ui/matchcenter.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const txt = (el) => (el ? el.textContent : '');
const COL = { title: 'Hjem kørte over Ude', sections: [
  { id: 'col-mine', title: 'Din kamp', paras: ['Sejr til Hjem: 4-0 over Ude.'] },
  { id: 'col-next', title: 'Næste runde', paras: ['Næste runde: Opp2 kommer på besøg.'] } ] };
const G = (o = {}) => ({
  totalGoals: 7, totalVarChecks: 3, myResult: 'Resultat', headlines: ['Gammel overskrift'],
  playerOfTheRound: { playerId: 'p1', teamId: 'a1', shirtNumber: 9, shortName: 'Hansen', teamName: 'Ude', rating: 8.4, stars: 4 },
  goalOfTheRound: { kind: 'COUNTER', desc: 'Flot kontra', match: 'Hjem - Ude', matchIdx: 1 }, ...o,
});
const MATCHES = [{}, {}, {}, {}];

test('ingen løberboks hos nogen seer, med eller uden klumme, ved 11,0 / 12,3 / 13,2 km – men avisen/klummen står stadig', () => {
  for (const teamId of ['h1', 'a1']) for (const km of [11, 12.3, 13.2]) for (const col of [COL, null]) {
    const run = { teamId, shirtNumber: 8, shortName: 'Løber', distanceKm: km, hiShare: 10, topSpeed: 29.8 };
    for (const viewer of ['h1', 'a1']) {
      const el = renderGazette(G({ myRunner: run }), viewer, null, MATCHES, col);
      const label = `${viewer} ser løber fra ${teamId}, ${km} km, ${col ? 'klumme' : 'gammel avis'}`;
      assert.ok(byId(el, 'my-runner') === undefined, label);
      assert.ok(!txt(el).includes('Dit holds løber') && !txt(el).includes('🏃') && !txt(el).includes('topfart'), label);
      // positiv tilstedeværelse: resten af visningen er der
      assert.ok(col ? byId(el, 'col-title') !== undefined && byId(el, 'col-mine') !== undefined : txt(byId(el, 'headlines')).includes('Gammel overskrift'), label);
    }
  }
});
