import * as E from '../src/knotEngine.js';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
const cat = E.buildCatalog();
// brute force: plain minimax, classifying every leaf with classifyBoard (independent path)
function brute(entry, first) {
  const d = E.buildDiagram(entry.board); const pos = d.crossings.map(x => [x.r, x.c]);
  const b = entry.board.map(r => r.slice());
  const rec = (k, mover) => {
    const open = pos.filter(([r, c]) => b[r][c] === -1);
    if (!open.length) return E.classifyBoard(b).is_unknot ? 'unknotter' : 'knotter';
    let win = false;
    for (const [r, c] of open) for (const t of [9, 10]) {
      b[r][c] = t; const w = rec(k + 1, E.other(mover)); b[r][c] = -1;
      if (w === mover) { win = true; break; }
    }
    return win ? mover : E.other(mover);
  };
  return rec(0, first);
}
for (const e of cat.filter(e => e.crossings <= 6)) {
  const a = E.analyzeShadow(e.board);
  const bk = brute(e, 'knotter'), bu = brute(e, 'unknotter');
  assert(a.winnerIfKnotterFirst === bk && a.winnerIfUnknotterFirst === bu, `${e.id}: K-first→${bk}, U-first→${bu}`);
}
// timing on biggest boards
for (const id of ['pretzel-237', 'torus-2-11', 'pretzel-335', 'dense-rand-6']) {
  const e = cat.find(x => x.id === id); const t0 = Date.now();
  const a = E.analyzeShadow(e.board);
  console.log(`   ${id} (${e.crossings}x): K-first→${a.winnerIfKnotterFirst}, U-first→${a.winnerIfUnknotterFirst}, knotted ${(a.knottedFraction*100).toFixed(1)}% — ${Date.now() - t0} ms`);
}
// AI sanity: AI as winner always wins vs random opponent
const rng = E.mulberry32(7);
for (const id of ['twist-3', 'pretzel-133', 'torus-2-5']) {
  const e = cat.find(x => x.id === id); const g = E.createGame(e.board);
  for (const first of ['knotter', 'unknotter']) {
    const W = E.theoreticalWinner(g, first); let wins = 0;
    for (let trial = 0; trial < 20; trial++) {
      const a = new Array(g.n).fill(0);
      while (a.some(x => !x)) {
        const mover = E.moverOf(a, first);
        let m;
        if (mover === W) m = E.aiMove(g, a, first, rng);
        else { const ms = E.evaluateMoves(g, a, first).moves; m = ms[Math.floor(rng() * ms.length)]; }
        a[m.j] = m.tile;
      }
      if (E.finalOutcome(g, a) === W) wins++;
    }
    assert(wins === 20, `${id} first=${first}: AI playing winner (${W}) won ${wins}/20 vs random`);
  }
}
