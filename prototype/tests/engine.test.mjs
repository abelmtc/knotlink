import * as E from '../src/knotEngine.js';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };

// 1. kinked unknot: both resolutions unknot
for (const t of [9, 10]) {
  const r = E.classifyBoard([[2,1,0],[3,t,1],[0,3,4]]);
  assert(r.is_unknot === true, `kink with tile ${t} is unknot (Jones ${r.jones_polynomial})`);
}
// 2. repo trefoil smoke-test resolution (9,10,10) -> knot (matches Sage smoke test)
let r = E.classifyBoard([[0,2,1,0],[2,9,10,1],[3,10,8,4],[0,3,4,0]]);
assert(r.is_unknot === false, `repo trefoil (9,10,10) knotted, Jones ${r.jones_polynomial}, det ${r.determinant}`);
// all 8 resolutions of repo trefoil: exactly 2 knotted (both alternating ones)
let knotted = 0;
for (const a of [9,10]) for (const b of [9,10]) for (const c of [9,10]) {
  const x = E.classifyBoard([[0,2,1,0],[2,a,b,1],[3,c,8,4],[0,3,4,0]]); if (!x.is_unknot) knotted++;
}
assert(knotted === 2, `trefoil shadow: ${knotted}/8 resolutions knotted (expect 2)`);
// README trefoil-ish board
r = E.classifyBoard([[0,2,1,0,0],[2,9,10,1,0],[3,10,9,10,1],[0,3,7,8,4],[0,0,3,4,0]]);
console.log('README board:', r.is_unknot, r.jones_polynomial, 'det', r.determinant);

// 3. catalog: determinants & reducedness
const cat = E.buildCatalog();
const expectDet = {
  'torus-2-3':3,'torus-2-5':5,'torus-2-7':7,'torus-2-9':9,'torus-2-11':11,
  'twist-1':3,'twist-2':5,'twist-3':7,'twist-4':9,'twist-5':11,'twist-6':13,'twist-7':15,'twist-8':17,
  'pretzel-113':7,'pretzel-133':15,'pretzel-333':27,'pretzel-233':21,'pretzel-135':23,'pretzel-335':39,'pretzel-235':31,'pretzel-237':41,
  '2b-312':11,'2b-2112':13,'2b-43':13,'2b-313':15,'2b-322':17,'2b-2212':19,'2b-21112':21,
};
for (const e of cat) {
  const exp = expectDet[e.id];
  const tag = `${e.id.padEnd(20)} ${String(e.crossings).padStart(2)}x ${e.rows}x${e.cols} det=${e.determinant} reduced=${e.reduced} ${e.knot}`;
  if (exp !== undefined) assert(e.determinant === exp, tag + ` (expect det ${exp})`); else console.log('   ', tag);
}
const ids = new Set(cat.map(e=>e.id));
for (const k of Object.keys(expectDet)) assert(ids.has(k), `catalog has ${k}`);
// deceptive unknot shadows: every resolution unknot
for (const id of ['kink-1','band-3','band-5']) {
  const a = E.analyzeShadow(cat.find(e=>e.id===id).board);
  assert(a.ok && a.knottedFraction === 0, `${id}: knotted fraction ${a.knottedFraction}`);
}
// T(3,4): positive braid resolution should have Jones of 8_19: t^3 + t^5 - t^8
const t34 = cat.find(e=>e.id==='torus-3-4');
const d34 = E.buildDiagram(t34.board);
for (const tiles of [new Array(d34.N).fill(9), new Array(d34.N).fill(10)]) {
  const b = t34.board.map(row=>row.slice()); d34.crossings.forEach((x,i)=>{ b[x.r][x.c]=tiles[i]; });
  console.log('   T(3,4) all-', tiles[0], '->', E.classifyBoard(b).jones_polynomial);
}
