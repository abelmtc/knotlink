import * as E from '../src/knotEngine.js';
let t0 = Date.now();
const cat = E.buildCatalog();
console.log('catalog built in', Date.now() - t0, 'ms;', cat.length, 'entries');
for (const e of cat.filter(e => e.family === 'Large 25×25')) {
  const d = E.buildDiagram(e.board);
  console.log(`${e.id}: ${e.rows}x${e.cols}, ${e.crossings} crossings, alt det=${e.determinant}, open=${d.crossings.filter(x => x.tile === -1).length}`);
  // classify a random full resolution with the row sweep
  const rng = E.mulberry32(1); const b = e.board.map(r => r.slice());
  d.crossings.forEach(x => { if (b[x.r][x.c] === -1) b[x.r][x.c] = rng() < .5 ? 9 : 10; });
  t0 = Date.now(); const r = E.classifyBoard(b);
  console.log(`   random resolution: is_unknot=${r.is_unknot} reason=${r.reason} reduced=${r.reduced_crossings} method=${r.method} jones=${(r.jones_polynomial||'').slice(0,60)} — ${Date.now() - t0} ms`);
  // alternating resolution must be certified knotted with span = N (reduced alternating)
  const alt = e.board.map(r => r.slice()); d.crossings.forEach((x, i) => { alt[x.r][x.c] = d.altTile[i]; });
  const ra = E.classifyBoard(alt);
  const exps = ra.jones_terms.map(t => t[0]); console.log(`   alternating: knotted=${ra.is_unknot === false}, Jones span ${Math.max(...exps) - Math.min(...exps)}`);
  if (e.id.endsWith('region')) {
    t0 = Date.now(); const a = E.analyzeShadow(e.board);
    console.log(`   solver: K first→${a.winnerIfKnotterFirst}, U first→${a.winnerIfUnknotterFirst} — ${Date.now() - t0} ms`);
  } else {
    const g = E.createGame(e.board); const a = new Array(g.n).fill(0); t0 = Date.now(); let exactMs = 0;
    while (a.some(x => !x)) { const t1 = Date.now(); const m = E.heuristicMove(g, a, 'knotter', rng); if (m.why === 'exact') exactMs += Date.now() - t1; a[m.j] = m.tile; }
    const r2 = E.classifyAssignment(g, a);
    console.log(`   heuristic self-play: ${r2.is_unknot === false ? 'knotter' : r2.is_unknot ? 'unknotter' : 'undetermined'} wins (reduced ${r2.reduced_crossings}) — ${Date.now() - t0} ms (endgame search ${exactMs} ms)`);
  }
}
