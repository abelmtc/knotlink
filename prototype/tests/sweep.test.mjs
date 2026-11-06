import * as E from '../src/knotEngine.js';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } };
const rng = E.mulberry32(5);
let n = 0;
const fmt = (f) => E.formatJones(E.jonesTerms(f));
for (const e of E.buildCatalog()) {
  const d = E.buildDiagram(e.board);
  if (d.N > 14) continue;
  for (let k = 0; k < 10; k++) {
    const b = e.board.map(r => r.slice()); let mask = 0;
    d.crossings.forEach((x, i) => { const t = rng() < 0.5 ? 9 : 10; b[x.r][x.c] = t; if (t === 10) mask |= 1 << i; });
    const a = fmt(E.normalizedBracket(d, mask)), s = fmt(E.sweepNormalizedBracket(b, d));
    assert(a === s, `${e.id}: state-sum ${a} vs sweep ${s}`); n++;
  }
}
console.log(`sweep == state sum on ${n} random resolutions`, process.exitCode ? 'WITH FAILURES' : 'ok');
// transposed board must give the same knot type up to mirror
const tre = [[0,2,1,0],[2,9,10,1],[3,10,8,4],[0,3,4,0]];
console.log('trefoil classify:', E.classifyBoard(tre).jones_polynomial);
// reduction: deceptive band reduces to 0
const band = E.buildCatalog().find(e => e.id === 'band-5');
const bb = band.board.map(r => r.map(t => t === -1 ? 9 : t));
console.log('band-5 resolved:', JSON.stringify(E.classifyBoard(bb)).slice(0, 160));
