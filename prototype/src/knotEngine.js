// knotEngine.js — KnotLink game engine (no dependencies, browser + Node)
//
// Tile convention matches knotlink/server and knot_mosaics/wild_mosaics.py:
//   0 empty | 1 left-down | 2 right-down | 3 up-right | 4 left-up | 5 left-right | 6 up-down
//   7 {down-left, up-right} | 8 {down-right, left-up}
//   9 crossing, horizontal strand OVER | 10 crossing, vertical strand OVER | -1 unresolved crossing
//   (the React UI uses 11 for unresolved; normalizeBoard maps 11 -> -1)
//
// What this module provides
//   * diagram tracing of a mosaic (components, crossings, orientation, writhe)
//   * Kauffman bracket / Jones polynomial and an exact unknot test.  Jones = 1 <=> unknot is a
//     theorem for diagrams with < 25 crossings (Tuzun–Sikora 2021), which covers every board here.
//   * a perfect-play solver of the knotting–unknotting game for both choices of first mover
//   * an AI move policy (wins when it can; sets traps when it is theoretically lost)
//   * knot-shadow generators: twist, (2,q)/(3,q) torus, 2-bridge (Conway notation), pretzel,
//     "deceptive" unknot shadows and dense random mosaics.

export const DIRS = ['up', 'right', 'down', 'left'];
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const OPP = [2, 3, 0, 1];
// y-up unit vectors for travel directions (used for crossing signs)
const VX = [0, 1, 0, -1];
const VY = [1, 0, -1, 0];
const PAIRS = {
  0: [], 1: [[3, 2]], 2: [[1, 2]], 3: [[0, 1]], 4: [[3, 0]], 5: [[3, 1]], 6: [[0, 2]],
  7: [[2, 3], [0, 1]], 8: [[2, 1], [3, 0]],
};
export const MAX_SOLVE = 12;      // playable crossings the solver will handle (small boards)
export const MAX_SOLVE_LARGE = 8; // playable crossings the solver will handle on boards > 14 crossings
export const STATE_SUM_MAX = 14;  // above this many crossings use the row-sweep algorithm
export const MAX_CLASSIFY = 400;  // crossings the classifier will attempt (row sweep)
export const JONES_VERIFIED_BELOW = 25; // Jones = 1 => unknot is proven for < 25 crossings

export const isCrossingTile = (t) => t === -1 || t === 9 || t === 10;
function goes(t, d) {
  if (isCrossingTile(t)) return true;
  const p = PAIRS[t];
  return !!p && p.some((q) => q[0] === d || q[1] === d);
}
function exitDir(t, d) {
  if (isCrossingTile(t)) return OPP[d];
  for (const [a, b] of PAIRS[t]) { if (a === d) return b; if (b === d) return a; }
  return -1;
}
function strandIndex(t, d) {
  const p = PAIRS[t];
  for (let k = 0; k < p.length; k++) if (p[k][0] === d || p[k][1] === d) return k;
  return -1;
}

// ---------------------------------------------------------------------------------------------
// Boards

export function normalizeBoard(input) {
  let b = input;
  if (typeof b === 'string') b = JSON.parse(b);
  return b.map((row) => row.map((v) => { const t = Number(v); return t === 11 ? -1 : t; }));
}

export function validateBoard(board) {
  const errors = [];
  if (!Array.isArray(board) || board.length === 0) return ['Board must be a non-empty 2D array'];
  const cols = board[0].length;
  if (!board.every((r) => Array.isArray(r) && r.length === cols)) return ['All rows must have the same length'];
  const R = board.length;
  for (let r = 0; r < R; r++) for (let c = 0; c < cols; c++) {
    const t = board[r][c];
    if (!Number.isInteger(t) || t < -1 || t > 10) { errors.push(`Bad tile ${t} at (${r},${c})`); continue; }
    for (let d = 0; d < 4; d++) {
      if (!goes(t, d)) continue;
      const rr = r + DR[d], cc = c + DC[d];
      if (rr < 0 || rr >= R || cc < 0 || cc >= cols || !goes(board[rr][cc], OPP[d])) {
        errors.push(`Tile at (${r},${c}) has a loose end going ${DIRS[d]}`);
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Diagram: crossings, arcs between crossing ports, components, orientation

export function buildDiagram(board) {
  const R = board.length, C = board[0].length;
  const crossings = [];
  const xIndex = new Map();
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (isCrossingTile(board[r][c])) { xIndex.set(r * C + c, crossings.length); crossings.push({ r, c, tile: board[r][c] }); }
  }
  const N = crossings.length;
  const visitedSeg = new Set(); // `${r},${c},${strand}`
  const partner = new Int32Array(4 * N).fill(-1);
  const arcCells = new Array(4 * N); // cells walked from port p to its partner (exclusive)

  for (let i = 0; i < N; i++) for (let d = 0; d < 4; d++) {
    const p = 4 * i + d;
    if (partner[p] !== -1) continue;
    let r = crossings[i].r + DR[d], c = crossings[i].c + DC[d], entry = OPP[d];
    const cells = [];
    for (let guard = 0; guard < R * C * 2 + 4; guard++) {
      const t = board[r][c];
      if (isCrossingTile(t)) {
        const q = 4 * xIndex.get(r * C + c) + entry;
        partner[p] = q; partner[q] = p;
        arcCells[p] = cells;
        arcCells[q] = cells.slice().reverse().map((s) => ({ r: s.r, c: s.c, entry: s.exit, exit: s.entry }));
        break;
      }
      const ex = exitDir(t, entry);
      visitedSeg.add(`${r},${c},${strandIndex(t, entry)}`);
      cells.push({ r, c, entry, exit: ex });
      r += DR[ex]; c += DC[ex]; entry = OPP[ex];
    }
  }

  // closed loops with no crossings
  const freeLoops = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const t = board[r][c];
    if (isCrossingTile(t) || !PAIRS[t]) continue;
    PAIRS[t].forEach((pair, k) => {
      if (visitedSeg.has(`${r},${c},${k}`)) return;
      const loop = [];
      let rr = r, cc = c, entry = pair[0];
      for (let guard = 0; guard < R * C * 2 + 4; guard++) {
        const tt = board[rr][cc];
        const key = `${rr},${cc},${strandIndex(tt, entry)}`;
        if (visitedSeg.has(key)) break;
        visitedSeg.add(key);
        const ex = exitDir(tt, entry);
        loop.push({ r: rr, c: cc, entry, exit: ex });
        rr += DR[ex]; cc += DC[ex]; entry = OPP[ex];
      }
      freeLoops.push(loop);
    });
  }

  // components: arcs + straight-through crossings
  const uf = new UF(4 * N);
  for (let p = 0; p < 4 * N; p++) uf.union(p, partner[p]);
  for (let i = 0; i < N; i++) { uf.union(4 * i, 4 * i + 2); uf.union(4 * i + 1, 4 * i + 3); }
  const roots = new Set();
  for (let p = 0; p < 4 * N; p++) roots.add(uf.find(p));
  const components = roots.size + freeLoops.length;

  const diag = { R, C, board, crossings, N, partner, arcCells, freeLoops, components, isKnotShadow: components === 1 };
  if (components === 1 && N > 0) orient(diag);
  return diag;
}

function orient(diag) {
  // walk the single component starting at crossing 0 moving right
  const { N, partner, arcCells, crossings } = diag;
  const passages = []; // {i, dir}
  const path = [];     // cells in travel order incl. crossings: {r,c,entry,exit,crossing}
  let i = 0, dir = 1;
  for (let guard = 0; guard < 2 * N + 2; guard++) {
    passages.push({ i, dir });
    path.push({ r: crossings[i].r, c: crossings[i].c, entry: OPP[dir], exit: dir, crossing: i });
    const p = 4 * i + dir;
    for (const s of arcCells[p]) path.push(s);
    const q = partner[p];
    i = q >> 2; dir = OPP[q & 3];
    if (i === 0 && dir === 1) break;
  }
  const hPass = new Int32Array(N).fill(-1), vPass = new Int32Array(N).fill(-1);
  const hDir = new Int32Array(N), vDir = new Int32Array(N);
  passages.forEach((ps, k) => {
    if (ps.dir === 1 || ps.dir === 3) { hPass[ps.i] = k; hDir[ps.i] = ps.dir; }
    else { vPass[ps.i] = k; vDir[ps.i] = ps.dir; }
  });
  // sign of crossing i if resolved as tile 9 (horizontal over); tile 10 is the negative
  const sign9 = new Int8Array(N);
  const altTile = new Int8Array(N);
  for (let j = 0; j < N; j++) {
    const o = hDir[j], u = vDir[j];
    sign9[j] = VX[o] * VY[u] - VY[o] * VX[u] > 0 ? 1 : -1;
    altTile[j] = hPass[j] % 2 === 0 ? 9 : 10;
  }
  Object.assign(diag, { passages, path, sign9, altTile, hPass, vPass });
}

class UF {
  constructor(n) { this.p = new Int32Array(n); for (let i = 0; i < n; i++) this.p[i] = i; }
  find(x) { const p = this.p; while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
  union(a, b) { a = this.find(a); b = this.find(b); if (a !== b) this.p[a] = b; }
}

// ---------------------------------------------------------------------------------------------
// Kauffman bracket via state sums.
// Geometric smoothing at crossing i: bit 1 = "type 7" pairing {down-left, up-right},
// bit 0 = "type 8" pairing {down-right, up-left}.  The A-smoothing of tile 9 is type 8 and of
// tile 10 is type 7, so with resolution bit r_i = 1 for tile 10, crossing i is A-smoothed in
// state g exactly when g_i == r_i.

function loopTable(diag) {
  if (diag._loops) return diag._loops;
  const { N, partner } = diag;
  const M = 4 * N;
  const parent = new Int32Array(M);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const arcs = [];
  for (let p = 0; p < M; p++) if (partner[p] > p) arcs.push(p, partner[p]);
  const total = 1 << N;
  const L = new Uint8Array(total);
  for (let g = 0; g < total; g++) {
    for (let x = 0; x < M; x++) parent[x] = x;
    let comps = M;
    const un = (a, b) => { a = find(a); b = find(b); if (a !== b) { parent[a] = b; comps--; } };
    for (let k = 0; k < arcs.length; k += 2) un(arcs[k], arcs[k + 1]);
    for (let i = 0; i < N; i++) {
      const b = 4 * i;
      if ((g >> i) & 1) { un(b + 2, b + 3); un(b, b + 1); } else { un(b + 2, b + 1); un(b + 3, b); }
    }
    L[g] = comps + diag.freeLoops.length;
  }
  diag._loops = L;
  return L;
}

const POP = new Uint8Array(1 << 16);
for (let i = 1; i < POP.length; i++) POP[i] = POP[i >> 1] + (i & 1);
const popcount = (x) => POP[x & 0xffff] + POP[x >>> 16];

// Laurent polynomials in A, stored dense with an offset
function polyNew(off) { return { off, c: new Float64Array(2 * off + 1) }; }

function dPowers(maxK, off) {
  // d = -A^2 - A^-2 ; returns array of polys d^k for k = 0..maxK
  const out = [];
  let cur = polyNew(off); cur.c[off] = 1; out.push(cur);
  for (let k = 1; k <= maxK; k++) {
    const nx = polyNew(off);
    for (let e = -off; e <= off; e++) {
      const v = cur.c[e + off]; if (!v) continue;
      if (e + 2 <= off) nx.c[e + 2 + off] -= v;
      if (e - 2 >= -off) nx.c[e - 2 + off] -= v;
    }
    out.push(nx); cur = nx;
  }
  return out;
}

function bracketContext(diag) {
  if (diag._bctx) return diag._bctx;
  const N = diag.N;
  const off = 8 * N + 8;
  diag._bctx = { off, dp: dPowers(N + diag.freeLoops.length + 1, off), L: loopTable(diag) };
  return diag._bctx;
}

// r: bitmask over all N crossings, bit 1 = tile 10.  Returns normalized f(A) = (-A^3)^-w <D>.
export function normalizedBracket(diag, r) {
  const { N } = diag;
  const { off, dp, L } = bracketContext(diag);
  const W = N + diag.freeLoops.length + 2;
  const counts = new Float64Array((N + 1) * W);
  const total = 1 << N;
  for (let g = 0; g < total; g++) counts[popcount(g ^ r) * W + L[g]]++;
  const f = polyNew(off);
  let w = 0;
  for (let i = 0; i < N; i++) w += ((r >> i) & 1) ? -diag.sign9[i] : diag.sign9[i];
  const shiftBase = -3 * w;
  const sgn = (w & 1) ? -1 : 1;
  for (let h = 0; h <= N; h++) {
    const aexp = N - 2 * h + shiftBase;
    for (let l = 1; l < W; l++) {
      const cnt = counts[h * W + l]; if (!cnt) continue;
      const d = dp[l - 1].c;
      for (let e = 0; e < d.length; e++) {
        const v = d[e]; if (!v) continue;
        const idx = e + aexp;
        if (idx >= 0 && idx < f.c.length) f.c[idx] += sgn * cnt * v;
      }
    }
  }
  return f;
}

function isOne(f) {
  for (let i = 0; i < f.c.length; i++) if (f.c[i] !== (i === f.off ? 1 : 0)) return false;
  return true;
}

// Jones polynomial in t from f(A): A^e -> t^(-e/4). Returns [[exponent, coeff], ...] ascending.
export function jonesTerms(f) {
  const terms = [];
  for (let i = f.c.length - 1; i >= 0; i--) {
    const v = f.c[i]; if (!v) continue;
    terms.push([-(i - f.off) / 4, v]);
  }
  return terms;
}

export function formatJones(terms) {
  if (!terms.length) return '0';
  const sup = (e) => (e === 1 ? '' : `^${Number.isInteger(e) ? e : e.toFixed(2)}`);
  let s = '';
  [...terms].sort((a, b) => b[0] - a[0]).forEach(([e, c], k) => {
    const neg = c < 0, a = Math.abs(c);
    const coef = e === 0 ? `${a}` : a === 1 ? '' : `${a}`;
    const mono = e === 0 ? '' : `t${sup(e)}`;
    s += (k === 0 ? (neg ? '-' : '') : neg ? ' - ' : ' + ') + coef + mono;
  });
  return s;
}

export function determinant(terms) {
  // |V(-1)| for knots (integer exponents)
  let s = 0;
  for (const [e, c] of terms) s += c * (Math.round(e) % 2 === 0 ? 1 : -1);
  return Math.abs(s);
}

function resolutionMask(diag, tiles /* array length N of 9/10 */) {
  let r = 0;
  for (let i = 0; i < diag.N; i++) if (tiles[i] === 10) r |= 1 << i;
  return r;
}

// Classify a fully resolved board.  Output mirrors the Sage classifier's JSON fields.
export function classifyBoard(board) {
  const b = normalizeBoard(board);
  const errs = validateBoard(b);
  if (errs.length) return { is_unknot: null, reason: 'invalid_board', errors: errs };
  const diag = buildDiagram(b);
  if (diag.crossings.some((x) => x.tile === -1)) return { is_unknot: null, reason: 'unresolved_crossings', num_crossings: diag.N };
  if (diag.components !== 1) return { is_unknot: null, reason: 'link_not_supported', components: diag.components, num_crossings: diag.N };
  if (diag.N === 0) return { is_unknot: true, reason: 'no_crossings', num_crossings: 0, jones_polynomial: '1' };
  if (diag.N > MAX_CLASSIFY) return { is_unknot: null, reason: 'too_many_crossings', num_crossings: diag.N };
  let f, method;
  try {
    if (diag.N <= STATE_SUM_MAX) { f = normalizedBracket(diag, resolutionMask(diag, diag.crossings.map((x) => x.tile))); method = 'state_sum'; }
    else { f = sweepNormalizedBracket(b, diag); method = 'row_sweep'; if (!f.exact) return { is_unknot: null, reason: 'precision_limit', num_crossings: diag.N }; }
  } catch (err) { return { is_unknot: null, reason: 'too_complex', error: String(err.message || err), num_crossings: diag.N }; }
  const terms = jonesTerms(f);
  const one = isOne(f);
  const reduced = reducedCrossingCount(diag, (i) => diag.crossings[i].tile);
  const base = { num_crossings: diag.N, reduced_crossings: reduced, method, jones_polynomial: formatJones(terms), jones_terms: terms, determinant: determinant(terms) };
  if (!one) return { ...base, is_unknot: false, reason: 'jones_polynomial', certified: true, certified_by: 'jones_not_one' };
  if (reduced < JONES_VERIFIED_BELOW || diag.N < JONES_VERIFIED_BELOW) return { ...base, is_unknot: true, reason: 'jones_polynomial', certified: true, certified_by: reduced === 0 ? 'reidemeister' : 'jones_below_25' };
  // Jones = 1 but the diagram is still >= 25 crossings after simplification: unknot unless this
  // is a counterexample to the Jones unknot conjecture.
  return { ...base, is_unknot: null, reason: 'jones_trivial_unverified', certified: false, research_candidate: true };
}

// Knot data for the alternating resolution of a shadow (used to label catalog entries)
export function alternatingInvariants(diag) {
  if (!diag.isKnotShadow || diag.N === 0 || diag.N > MAX_CLASSIFY) return null;
  let f;
  if (diag.N <= STATE_SUM_MAX) f = normalizedBracket(diag, resolutionMask(diag, Array.from(diag.altTile)));
  else {
    const b = diag.board.map((r) => r.slice());
    diag.crossings.forEach((x, i) => { b[x.r][x.c] = diag.altTile[i]; });
    try { f = sweepNormalizedBracket(b, diag); } catch { return null; }
  }
  const terms = jonesTerms(f);
  const exps = terms.map((t) => t[0]);
  return {
    jones: formatJones(terms), terms, determinant: determinant(terms),
    span: terms.length ? Math.max(...exps) - Math.min(...exps) : 0, unknot: isOne(f),
  };
}

// ---------------------------------------------------------------------------------------------
// Scalable Kauffman bracket: sweep the mosaic cell by cell (a Temperley–Lieb transfer matrix).
// The state is the planar pairing of strand ends on the frontier between processed and
// unprocessed cells, so the cost grows with the number of strands crossing the frontier, not
// with the number of crossings. This is what lets 25×25 boards with dozens of crossings work.

const TRANSPOSE_TILE = { 0: 0, 1: 3, 2: 2, 3: 1, 4: 4, 5: 6, 6: 5, 7: 7, 8: 8, 9: 10, 10: 9, [-1]: -1 };
function transposeBoard(b) {
  const R = b.length, C = b[0].length;
  return Array.from({ length: C }, (_, c) => Array.from({ length: R }, (_, r) => TRANSPOSE_TILE[b[r][c]]));
}
function sweepWidth(b) {
  // largest number of strands crossing a horizontal cut (row-major frontier size)
  let w = 0;
  for (let r = 0; r < b.length; r++) { let k = 0; for (const t of b[r]) if (goes(t, 2)) k++; w = Math.max(w, k); }
  return w;
}
const SMOOTH7 = [[2, 3], [0, 1]], SMOOTH8 = [[2, 1], [3, 0]];

function sweepBracketRaw(board) {
  // returns {lo, c} for <D> (normalized so that a single loop is 1) and the peak state count
  const R = board.length, C = board[0].length;
  let states = new Map();
  const init = new Int16Array(C + 1).fill(-1);
  states.set(init.join(','), { p: init, poly: { lo: 0, c: [1] } });
  let peak = 1, maxAbs = 1;
  const uf = new Int32Array(C + 3);
  const find = (x) => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const t = board[r][c];
    if (t === 0 || t === 5 || t === 6) continue; // these never change the frontier
    const options = t === 9 ? [[SMOOTH8, 1], [SMOOTH7, -1]] : t === 10 ? [[SMOOTH7, 1], [SMOOTH8, -1]] : [[PAIRS[t], 0]];
    const next = new Map();
    const ext = (side) => (side === 0 ? c : side === 3 ? C : side === 2 ? C + 1 : C + 2);
    for (const { p, poly } of states.values()) {
      for (const [pairs, w] of options) {
        for (let i = 0; i < C + 3; i++) uf[i] = i;
        for (let i = 0; i <= C; i++) if (p[i] > i) uf[find(i)] = find(p[i]);
        let usesD = false, usesR = false;
        for (const [a, b] of pairs) {
          if (a === 2 || b === 2) usesD = true;
          if (a === 1 || b === 1) usesR = true;
          const x = find(ext(a)), y = find(ext(b)); if (x !== y) uf[x] = y;
        }
        const np = new Int16Array(C + 1).fill(-1);
        const firstEnd = new Map();
        const slotOf = (n) => (n === C + 1 ? c : n === C + 2 ? C : n);
        const ends = [];
        for (let i = 0; i <= C; i++) if (i !== c && i !== C && p[i] >= 0) ends.push(i);
        if (usesD) ends.push(C + 1);
        if (usesR) ends.push(C + 2);
        const hasEnd = new Set();
        for (const e of ends) {
          const root = find(e); hasEnd.add(root);
          if (firstEnd.has(root)) { const o = firstEnd.get(root); np[slotOf(o)] = slotOf(e); np[slotOf(e)] = slotOf(o); }
          else firstEnd.set(root, e);
        }
        let loops = 0;
        const seen = new Set();
        for (const x of [c, C]) {
          if (p[x] < 0) continue;
          const root = find(x);
          if (!hasEnd.has(root) && !seen.has(root)) { seen.add(root); loops++; }
        }
        let q = { lo: poly.lo + w, c: poly.c };
        for (let k = 0; k < loops; k++) q = polyMulD(q);
        const key = np.join(',');
        const cur = next.get(key);
        if (!cur) next.set(key, { p: np, poly: { lo: q.lo, c: q.c.slice() } });
        else maxAbs = Math.max(maxAbs, polyAddInto(cur, q));
      }
    }
    states = next;
    if (states.size > peak) peak = states.size;
    if (peak > 400000) throw new Error('Diagram too wide for the row sweep');
  }
  const fin = [...states.values()];
  if (fin.length !== 1 || fin[0].p.some((x) => x !== -1)) throw new Error('Sweep did not close up (invalid board?)');
  return { poly: polyDivD(fin[0].poly), peak, exact: maxAbs < 2 ** 52 };
}
function polyMulD(p) {
  const n = p.c.length, c = new Array(n + 4).fill(0);
  for (let i = 0; i < n; i++) { const v = p.c[i]; if (v) { c[i] -= v; c[i + 4] -= v; } }
  return { lo: p.lo - 2, c };
}
function polyAddInto(entry, q) {
  const p = entry.poly;
  const lo = Math.min(p.lo, q.lo), hi = Math.max(p.lo + p.c.length, q.lo + q.c.length);
  if (lo !== p.lo || hi !== p.lo + p.c.length) {
    const c = new Array(hi - lo).fill(0);
    for (let i = 0; i < p.c.length; i++) c[i + p.lo - lo] = p.c[i];
    entry.poly = { lo, c };
  }
  const t = entry.poly; let m = 0;
  for (let i = 0; i < q.c.length; i++) { const k = i + q.lo - t.lo; t.c[k] += q.c[i]; const a = Math.abs(t.c[k]); if (a > m) m = a; }
  return m;
}
function polyDivD(P) {
  // P = d * Q with d = -A^2 - A^-2 = -A^-2 (A^4 + 1)  =>  Q = -A^2 P / (A^4 + 1)
  const r = P.c.map((x) => -x), lo = P.lo + 2, n = r.length;
  if (n < 5) throw new Error('bracket not divisible by d');
  const q = new Array(n - 4).fill(0);
  for (let i = n - 1; i >= 4; i--) { const v = r[i]; if (v) { q[i - 4] = v; r[i] -= v; r[i - 4] -= v; } }
  if (r.some((x) => Math.abs(x) > 1e-9)) throw new Error('bracket not divisible by d');
  return { lo, c: q };
}
function toDense({ lo, c }) {
  const off = Math.max(Math.abs(lo), Math.abs(lo + c.length)) + 2;
  const f = polyNew(off);
  c.forEach((v, i) => { if (v) f.c[lo + i + off] = v; });
  return f;
}

// Normalized bracket f(A) for any resolved board, choosing the cheaper sweep direction.
export function sweepNormalizedBracket(board, diag) {
  const T = transposeBoard(board);
  const useT = sweepWidth(T) < sweepWidth(board);
  const res = sweepBracketRaw(useT ? T : board);
  let { lo, c } = res.poly;
  if (useT) { c = c.slice().reverse(); lo = -(lo + c.length - 1); } // transpose = mirror image: A -> 1/A
  let w = 0;
  diag.crossings.forEach((x, i) => { w += board[x.r][x.c] === 10 ? -diag.sign9[i] : diag.sign9[i]; });
  const sgn = (w & 1) ? -1 : 1;
  const f = toDense({ lo: lo - 3 * w, c: c.map((v) => v * sgn) });
  f.exact = res.exact; f.peak = res.peak;
  return f;
}

// Reidemeister I / II simplification on the Gauss code of a resolved knot diagram.
// Returns the crossing count after removing kinks (RI) and removable bigons (RII): if that is
// < 25, a Jones polynomial of 1 certifies the unknot (Tuzun–Sikora verification).
export function reducedCrossingCount(diag, tileOf /* (crossingIndex) => 9 | 10 */) {
  let seq = diag.passages.map((ps) => ({ i: ps.i, o: (ps.dir === 1 || ps.dir === 3) ? tileOf(ps.i) === 9 : tileOf(ps.i) === 10 }));
  let changed = true;
  while (changed && seq.length) {
    changed = false;
    const n = seq.length;
    for (let k = 0; k < n && !changed; k++) {
      const a = seq[k], b = seq[(k + 1) % n];
      if (a.i === b.i) { seq = seq.filter((x) => x.i !== a.i); changed = true; }
    }
    if (changed) continue;
    for (let k = 0; k < n && !changed; k++) {
      const a = seq[k], b = seq[(k + 1) % n];
      if (a.i === b.i || a.o !== b.o) continue;
      let ka = -1, kb = -1;
      seq.forEach((x, idx) => { if (x.i === a.i && idx !== k) ka = idx; if (x.i === b.i && idx !== (k + 1) % n) kb = idx; });
      const d = Math.abs(ka - kb);
      if (d === 1 || d === n - 1) { seq = seq.filter((x) => x.i !== a.i && x.i !== b.i); changed = true; }
    }
  }
  return seq.length / 2;
}

// ---------------------------------------------------------------------------------------------
// The game

export function createGame(board) {
  const b = normalizeBoard(board);
  const errors = validateBoard(b);
  if (errors.length) return { ok: false, errors };
  const diag = buildDiagram(b);
  if (!diag.isKnotShadow) return { ok: false, errors: [`The shadow has ${diag.components} components; only knot shadows (1 component) are supported.`], diag };
  const playable = [];
  let fixedMask = 0;
  diag.crossings.forEach((x, i) => { if (x.tile === -1) playable.push(i); else if (x.tile === 10) fixedMask |= 1 << i; });
  // exact solving: up to 12 open crossings on small boards (state sum), up to 8 on large ones (row sweep)
  const solvable = diag.N <= STATE_SUM_MAX ? playable.length <= MAX_SOLVE : playable.length <= MAX_SOLVE_LARGE;
  const why = solvable ? '' : `${playable.length} open crossings on a ${diag.N}-crossing board: too many to solve exactly (limit ${diag.N <= STATE_SUM_MAX ? MAX_SOLVE : MAX_SOLVE_LARGE}).`;
  return { ok: true, solvable, why, board: b, diag, playable, n: playable.length, fixedMask, _memo: {} };
}

function leafTable(game) {
  if (game._leaves) return game._leaves;
  const { n, playable, fixedMask, diag } = game;
  const total = 1 << n;
  const leaves = new Uint8Array(total); // 1 = knotted (Knotter wins)
  if (diag.N <= STATE_SUM_MAX) {
    for (let m = 0; m < total; m++) {
      let r = fixedMask;
      for (let j = 0; j < n; j++) if ((m >> j) & 1) r |= 1 << playable[j];
      leaves[m] = isOne(normalizedBracket(diag, r)) ? 0 : 1;
    }
  } else {
    const b = game.board.map((row) => row.slice());
    for (let m = 0; m < total; m++) {
      playable.forEach((i, j) => { const x = diag.crossings[i]; b[x.r][x.c] = (m >> j) & 1 ? 10 : 9; });
      leaves[m] = isOne(sweepNormalizedBracket(b, diag)) ? 0 : 1;
    }
  }
  game._leaves = leaves;
  return leaves;
}

const POW3 = [1]; for (let i = 1; i <= 16; i++) POW3.push(POW3[i - 1] * 3);

function solver(game, first /* 'knotter' | 'unknotter' */) {
  if (game._memo[first]) return game._memo[first];
  const { n } = game;
  const leaves = leafTable(game);
  const memo = new Int8Array(POW3[n]).fill(-1);
  const trit = new Uint8Array(n);
  const kFirst = first === 'knotter';
  // returns 1 if Knotter wins with perfect play from this state
  function val(state, mask, depth) {
    if (depth === n) return leaves[mask];
    const m = memo[state];
    if (m >= 0) return m;
    const moverK = (depth % 2 === 0) === kFirst;
    let res = moverK ? 0 : 1;
    outer: for (let j = 0; j < n; j++) {
      if (trit[j]) continue;
      for (let v = 1; v <= 2; v++) {
        trit[j] = v;
        const r = val(state + v * POW3[j], v === 2 ? mask | (1 << j) : mask, depth + 1);
        trit[j] = 0;
        if (moverK && r === 1) { res = 1; break outer; }
        if (!moverK && r === 0) { res = 0; break outer; }
      }
    }
    memo[state] = res;
    return res;
  }
  const api = {
    // assignment: array length n with 0 (open), 9 or 10
    value(assign) {
      let state = 0, mask = 0, depth = 0;
      for (let j = 0; j < n; j++) {
        trit[j] = 0;
        if (assign[j] === 9) { state += POW3[j]; depth++; }
        else if (assign[j] === 10) { state += 2 * POW3[j]; mask |= 1 << j; depth++; }
      }
      for (let j = 0; j < n; j++) trit[j] = assign[j] === 9 ? 1 : assign[j] === 10 ? 2 : 0;
      const v = val(state, mask, depth);
      trit.fill(0);
      return v;
    },
  };
  game._memo[first] = api;
  return api;
}

export const other = (p) => (p === 'knotter' ? 'unknotter' : 'knotter');

export function moverOf(assign, first) {
  const made = assign.filter((x) => x).length;
  return made % 2 === 0 ? first : other(first);
}

// Winner with perfect play from the empty shadow
export function theoreticalWinner(game, first) {
  return solver(game, first).value(new Array(game.n).fill(0)) ? 'knotter' : 'unknotter';
}

// Every legal move from `assign`, labelled with the perfect-play winner after it is made.
export function evaluateMoves(game, assign, first) {
  const S = solver(game, first);
  const mover = moverOf(assign, first);
  const out = [];
  for (let j = 0; j < game.n; j++) {
    if (assign[j]) continue;
    for (const tile of [9, 10]) {
      const a = assign.slice(); a[j] = tile;
      const done = a.every((x) => x);
      const winner = done ? (leafTable(game)[maskOf(a)] ? 'knotter' : 'unknotter') : (S.value(a) ? 'knotter' : 'unknotter');
      out.push({ j, crossing: game.playable[j], tile, winner, winning: winner === mover });
    }
  }
  return { mover, moves: out, winnerNow: S.value(assign) ? 'knotter' : 'unknotter' };
}

// Final classification of an assignment (works for any board size)
export function classifyAssignment(game, assign) {
  const b = game.board.map((row) => row.slice());
  assign.forEach((t, j) => { if (t) { const x = game.diag.crossings[game.playable[j]]; b[x.r][x.c] = t; } });
  return classifyBoard(b);
}

// Heuristic AI for boards too large to solve: exact search once few crossings remain, otherwise
// play for alternation (Knotter) or against it (Unknotter). Reduced alternating diagrams are
// always knotted, while non-alternating stretches create Reidemeister-removable crossings.
export function heuristicMove(game, assign, first, rng = Math.random, exactBelow = 3) {
  const mover = moverOf(assign, first);
  const open = []; assign.forEach((t, j) => { if (!t) open.push(j); });
  if (open.length <= exactBelow) {
    const memo = new Map();
    const winnerOf = (a) => {
      const k = a.join(',');
      if (memo.has(k)) return memo.get(k);
      let w;
      if (a.every((x) => x)) { const r = classifyAssignment(game, a); w = r.is_unknot === false ? 'knotter' : 'unknotter'; }
      else {
        const m = moverOf(a, first); w = other(m);
        outer: for (let j = 0; j < a.length; j++) { if (a[j]) continue; for (const t of [9, 10]) { const b = a.slice(); b[j] = t; if (winnerOf(b) === m) { w = m; break outer; } } }
      }
      memo.set(k, w); return w;
    };
    const wins = [];
    for (const j of open) for (const tile of [9, 10]) { const b = assign.slice(); b[j] = tile; if (winnerOf(b) === mover) wins.push({ j, tile }); }
    if (wins.length) { const m = wins[Math.floor(rng() * wins.length)]; return { ...m, crossing: game.playable[m.j], why: 'exact' }; }
  }
  const { diag } = game;
  const tileAt = new Map();
  diag.crossings.forEach((x, i) => { if (x.tile !== -1) tileAt.set(i, x.tile); });
  assign.forEach((t, j) => { if (t) tileAt.set(game.playable[j], t); });
  const P = diag.passages, n2 = P.length;
  const overAt = (k, tiles) => { const i = P[k].i, t = tiles.get(i); if (t === undefined) return null; return (P[k].dir === 1 || P[k].dir === 3) ? t === 9 : t === 10; };
  let best = [], bestScore = -Infinity;
  for (const j of open) for (const tile of [9, 10]) {
    const i = game.playable[j];
    const tiles = new Map(tileAt); tiles.set(i, tile);
    let score = 0;
    for (const k of [diag.hPass[i], diag.vPass[i]]) for (const nb of [(k + n2 - 1) % n2, (k + 1) % n2]) {
      const a = overAt(k, tiles), b = overAt(nb, tiles);
      if (a === null || b === null || P[nb].i === i) continue;
      score += a !== b ? 1 : -1;
    }
    if (mover === 'unknotter') score = -score;
    score += rng() * 0.01;
    if (score > bestScore + 1e-9) { bestScore = score; best = [{ j, tile }]; }
  }
  const m = best[0];
  return { ...m, crossing: game.playable[m.j], why: 'heuristic' };
}

function maskOf(a) { let m = 0; a.forEach((x, j) => { if (x === 10) m |= 1 << j; }); return m; }

export function finalOutcome(game, assign) {
  return leafTable(game)[maskOf(assign)] ? 'knotter' : 'unknotter';
}

// AI policy: play a winning move if one exists; otherwise choose the move that leaves the
// opponent the largest fraction of losing replies (a "trap").  rng: () => [0,1)
export function aiMove(game, assign, first, rng = Math.random) {
  const { mover, moves } = evaluateMoves(game, assign, first);
  const winning = moves.filter((m) => m.winning);
  if (winning.length) return { ...winning[Math.floor(rng() * winning.length)], why: 'winning' };
  let best = [], bestScore = -1;
  for (const m of moves) {
    const a = assign.slice(); a[m.j] = m.tile;
    if (a.every((x) => x)) { const sc = 0; if (sc > bestScore) { bestScore = sc; best = [m]; } else if (sc === bestScore) best.push(m); continue; }
    const replies = evaluateMoves(game, a, first).moves;
    const blunders = replies.filter((x) => x.winner === mover).length / replies.length;
    if (blunders > bestScore + 1e-9) { bestScore = blunders; best = [m]; } else if (Math.abs(blunders - bestScore) < 1e-9) best.push(m);
  }
  return { ...best[Math.floor(rng() * best.length)], why: 'trap', trapScore: bestScore };
}

// Full first-mover analysis of a shadow
export function analyzeShadow(board) {
  const g = createGame(board);
  if (!g.ok) return { ok: false, errors: g.errors };
  if (!g.solvable) return { ok: false, unsolvable: true, crossings: g.diag.N, playable: g.n, errors: [g.why] };
  const wK = theoreticalWinner(g, 'knotter');
  const wU = theoreticalWinner(g, 'unknotter');
  const leaves = leafTable(g);
  let knotted = 0; for (const v of leaves) knotted += v;
  return {
    ok: true, crossings: g.diag.N, playable: g.n,
    winnerIfKnotterFirst: wK, winnerIfUnknotterFirst: wU,
    firstMoverMatters: wK !== wU,
    knottedFraction: leaves.length ? knotted / leaves.length : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Shadow generators

function emptyGrid(R, C) { return Array.from({ length: R }, () => new Array(C).fill(0)); }

// Twist region between strand rows y and y+2 with k crossings: columns L M (Q M)^(k-1) R
function twistColumns(k) {
  const L = [5, 2, 4], M = [1, -1, 3], Q = [2, 8, 4], Rr = [2, 4, 5];
  const cols = [L, M];
  for (let i = 1; i < k; i++) cols.push(Q, M);
  cols.push(Rr);
  return cols;
}

function capColumns(pairs, strands, side) {
  // nested caps; returns array of columns (each column array over rows)
  const H = 2 * (strands - 1) + 1;
  const depth = pairs.map(([a, b]) => pairs.filter(([c, d]) => c < a && d > b).length);
  const W = pairs.length ? Math.max(...depth) + 1 : 0;
  const cols = Array.from({ length: W }, () => new Array(H).fill(0));
  pairs.forEach(([a, b], k) => {
    const x = side === 'left' ? depth[k] : W - 1 - depth[k];
    const ya = 2 * a, yb = 2 * b;
    cols[x][ya] = side === 'left' ? 2 : 1;
    cols[x][yb] = side === 'left' ? 3 : 4;
    for (let y = ya + 1; y < yb; y++) cols[x][y] = 6;
    if (side === 'left') { for (let xx = x + 1; xx < W; xx++) { cols[xx][ya] = 5; cols[xx][yb] = 5; } }
    else { for (let xx = 0; xx < x; xx++) { cols[xx][ya] = 5; cols[xx][yb] = 5; } }
  });
  return cols;
}

// segments: [[{gen, count}, ...], ...]  (gens inside one segment act on disjoint strand pairs)
export function platShadow(strands, leftCaps, segments, rightCaps = leftCaps) {
  const H = 2 * (strands - 1) + 1;
  const columns = [...capColumns(leftCaps, strands, 'left')];
  for (const seg of segments) {
    const parts = seg.map(({ gen, count }) => ({ gen, cols: twistColumns(count) }));
    const width = Math.max(...parts.map((p) => p.cols.length));
    for (let x = 0; x < width; x++) {
      const col = new Array(H).fill(0);
      for (let s = 0; s < strands; s++) col[2 * s] = 5;
      for (const p of parts) {
        const y = 2 * p.gen;
        const src = p.cols[x];
        if (src) { col[y] = src[0]; col[y + 1] = src[1]; col[y + 2] = src[2]; }
      }
      columns.push(col);
    }
  }
  columns.push(...capColumns(rightCaps, strands, 'right'));
  const grid = emptyGrid(H, columns.length);
  columns.forEach((col, x) => col.forEach((t, y) => { grid[y][x] = t; }));
  return grid;
}

// Closure of a braid word on k strands (gens are 0-based: g joins strands g, g+1)
export function braidClosureShadow(k, word) {
  const B = k; // first strand row
  const H = B + 2 * (k - 1) + 1;
  const body = [];
  for (const g of word) body.push(...twistColumns(1).map((src) => ({ g, src })));
  const capW = k; // columns for closure on each side
  const C = capW + body.length + capW;
  const grid = emptyGrid(H, C);
  for (let s = 0; s < k; s++) for (let x = capW; x < capW + body.length; x++) grid[B + 2 * s][x] = 5;
  body.forEach(({ g, src }, k2) => {
    const x = capW + k2, y = B + 2 * g;
    grid[y][x] = src[0]; grid[y + 1][x] = src[1]; grid[y + 2][x] = src[2];
  });
  for (let s = 0; s < k; s++) {
    const y = B + 2 * s, top = B - 1 - s, xl = capW - 1 - s, xr = capW + body.length + s;
    for (let x = xl + 1; x < capW; x++) grid[y][x] = 5;
    for (let x = capW + body.length; x < xr; x++) grid[y][x] = 5;
    grid[y][xl] = 3; grid[top][xl] = 2; for (let yy = top + 1; yy < y; yy++) grid[yy][xl] = 6;
    grid[y][xr] = 4; grid[top][xr] = 1; for (let yy = top + 1; yy < y; yy++) grid[yy][xr] = 6;
    for (let x = xl + 1; x < xr; x++) grid[top][x] = 5;
  }
  return grid;
}

export function twoBridgeShadow(conway) {
  // the 4-plat needs an odd-length continued fraction: C(..., a) = C(..., a - 1, 1)
  const cf = conway.slice();
  if (cf.length % 2 === 0) { const a = cf.pop(); if (a > 1) cf.push(a - 1); else cf[cf.length - 1] += 1; cf.push(1); }
  const segs = cf.map((a, k) => [{ gen: k % 2 === 0 ? 1 : 0, count: a }]);
  return platShadow(4, [[0, 1], [2, 3]], segs);
}

export function pretzelShadow(p, q, r) {
  return platShadow(6, [[0, 5], [1, 2], [3, 4]], [[{ gen: 0, count: p }, { gen: 2, count: q }, { gen: 4, count: r }]]);
}

export function toShadow(board) {
  return board.map((row) => row.map((t) => (t === 9 || t === 10 ? -1 : t)));
}

// deterministic PRNG
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Dense random knot mosaic (every cell considered), via randomized backtracking.
export function randomDenseShadow(size, rng, { minX = 4, maxX = 9, tries = 4000 } = {}) {
  const tiles = [0, 1, 2, 3, 4, 5, 6, 7, 8, -1];
  const weight = { 0: 1, 1: 2, 2: 2, 3: 2, 4: 2, 5: 1.2, 6: 1.2, 7: 1, 8: 1, [-1]: 4 };
  for (let attempt = 0; attempt < tries; attempt++) {
    const g = emptyGrid(size, size);
    const ok = fill(0);
    function fill(k) {
      if (k === size * size) return true;
      const r = Math.floor(k / size), c = k % size;
      const needUp = r > 0 && goes(g[r - 1][c], 2);
      const needLeft = c > 0 && goes(g[r][c - 1], 1);
      const cand = tiles.filter((t) => goes(t, 0) === needUp && goes(t, 3) === needLeft
        && !(r === size - 1 && goes(t, 2)) && !(c === size - 1 && goes(t, 1)));
      const order = cand.map((t) => ({ t, w: Math.pow(rng(), 1 / weight[t]) })).sort((a, b) => b.w - a.w);
      for (const { t } of order) { g[r][c] = t; if (fill(k + 1)) return true; }
      g[r][c] = 0;
      return false;
    }
    if (!ok) continue;
    const d = buildDiagram(g);
    if (d.isKnotShadow && d.N >= minX && d.N <= maxX) return g;
  }
  return null;
}

// Random 12-strand plat shadow padded to size×size (default 25×25).
export function largePlatShadow(rng, { size = 25, strands = 12, prob = 0.55, minX = 20, maxX = 60, tries = 500 } = {}) {
  const pairs = []; for (let s = 0; s < strands; s += 2) pairs.push([s, s + 1]);
  const H = 2 * strands - 1;
  const blocks = Math.floor((size - 2 - 2) / 3);
  for (let t = 0; t < tries; t++) {
    const segs = [];
    for (let k = 0; k < blocks; k++) {
      const seg = [];
      for (let g = (k % 2 === 0 ? 1 : 0); g <= strands - 2; g += 2) if (rng() < prob) seg.push({ gen: g, count: 1 });
      if (!seg.length) seg.push({ gen: 1 + 2 * Math.floor(rng() * ((strands - 2) / 2)), count: 1 });
      segs.push(seg);
    }
    const core = platShadow(strands, pairs, segs);
    const d = buildDiagram(core);
    if (!d.isKnotShadow || d.N < minX || d.N > maxX) continue;
    const top = Math.floor((size - H) / 2), left = Math.floor((size - core[0].length) / 2);
    const g = emptyGrid(size, size);
    core.forEach((row, r) => row.forEach((v, c) => { g[r + top][c + left] = v; }));
    return g;
  }
  return null;
}

// Keep `open` crossings nearest the board centre unresolved; resolve the rest (seeded random).
export function openRegion(board, open, rng) {
  const d = buildDiagram(board);
  const cr = (board.length - 1) / 2, cc = (board[0].length - 1) / 2;
  const order = d.crossings.map((x, i) => ({ i, dist: (x.r - cr) ** 2 + (x.c - cc) ** 2 })).sort((a, b) => a.dist - b.dist);
  const keep = new Set(order.slice(0, open).map((o) => o.i));
  const b = board.map((r) => r.slice());
  d.crossings.forEach((x, i) => { b[x.r][x.c] = keep.has(i) ? -1 : (rng() < 0.5 ? 9 : 10); });
  return b;
}

// Knot names for reduced alternating diagrams with <= 7 crossings (identified by crossing
// number and determinant, which is unique in that range).
const KNOT_NAMES = {
  '3:3': '3₁ trefoil', '4:5': '4₁ figure-eight', '5:5': '5₁', '5:7': '5₂', '6:9': '6₁', '6:11': '6₂', '6:13': '6₃',
  '7:7': '7₁', '7:11': '7₂', '7:13': '7₃', '7:15': '7₄', '7:17': '7₅', '7:19': '7₆', '7:21': '7₇',
};

export function buildCatalog() {
  const entries = [];
  let keepFixed = false;
  const add = (id, family, label, board, note = '') => {
    const diag = buildDiagram(board);
    if (!diag.isKnotShadow) return;
    const inv = alternatingInvariants(diag);
    let knot = '';
    if (inv && inv.span === diag.N && diag.N <= 7) knot = KNOT_NAMES[`${diag.N}:${inv.determinant}`] || '';
    entries.push({ id, family, label, board: keepFixed ? board : toShadow(board), crossings: diag.N, knot, determinant: inv ? inv.determinant : null, reduced: inv ? inv.span === diag.N : false, note, rows: board.length, cols: board[0].length });
  };
  // controls: shadows whose every resolution is the unknot
  add('kink-1', 'Deceptive unknot', 'Single kink', [[2, 1, 0], [3, -1, 1], [0, 3, 4]], 'Every resolution is the unknot.');
  for (const k of [3, 5]) add(`band-${k}`, 'Deceptive unknot', `Capped twisted band (${k})`, platShadow(2, [[0, 1]], [[{ gen: 0, count: k }]]), 'Looks twisted; every resolution untwists.');
  // torus knots
  for (const q of [3, 5, 7, 9, 11]) add(`torus-2-${q}`, 'Torus', `T(2,${q})`, twoBridgeShadow([q]));
  add('torus-3-4', 'Torus', 'T(3,4)', braidClosureShadow(3, [0, 1, 0, 1, 0, 1, 0, 1]), 'Braid closure of (σ₁σ₂)⁴; non-alternating knot 8₁₉ when resolved as a positive braid.');
  add('torus-3-5', 'Torus', 'T(3,5)', braidClosureShadow(3, [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]), 'Braid closure of (σ₁σ₂)⁵.');
  // twist knots: n half-twists + clasp
  for (let n = 1; n <= 8; n++) add(`twist-${n}`, 'Twist', `Twist knot, ${n} half-twist${n > 1 ? 's' : ''}`, twoBridgeShadow([n, 2]));
  // other 2-bridge knots (Conway notation)
  for (const cw of [[3, 1, 2], [2, 1, 1, 2], [4, 3], [3, 1, 3], [3, 2, 2], [2, 2, 1, 2], [2, 1, 1, 1, 2], [3, 3, 2], [4, 1, 3], [3, 1, 1, 3]]) {
    add(`2b-${cw.join('')}`, '2-bridge', `C(${cw.join(',')})`, twoBridgeShadow(cw));
  }
  // pretzel knots
  for (const [p, q, r] of [[1, 1, 3], [1, 3, 3], [3, 3, 3], [2, 3, 3], [1, 3, 5], [3, 3, 5], [2, 3, 5], [2, 3, 7]]) {
    add(`pretzel-${p}${q}${r}`, 'Pretzel', `P(${p},${q},${r})`, pretzelShadow(p, q, r));
  }
  // dense mosaics: boards from the repo plus seeded random dense mosaics
  add('dense-repo-trefoil', 'Dense', 'Repo trefoil (4×4)', [[0, 2, 1, 0], [2, -1, -1, 1], [3, -1, 8, 4], [0, 3, 4, 0]]);
  add('dense-repo-default', 'Dense', 'Repo default board (5×5)', [[0, 2, 5, 5, 1], [2, -1, 5, 1, 6], [6, 6, 2, -1, 4], [6, 3, -1, 4, 0], [3, 5, 4, 0, 0]]);
  add('dense-readme', 'Dense', 'README trefoil (5×5)', [[0, 2, 1, 0, 0], [2, 9, 10, 1, 0], [3, 10, 9, 10, 1], [0, 3, 7, 8, 4], [0, 0, 3, 4, 0]]);
  const rng = mulberry32(20261105);
  let made = 0;
  for (const [size, lo, hi] of [[5, 4, 6], [5, 5, 7], [6, 6, 8], [6, 7, 9], [6, 8, 10], [7, 9, 11]]) {
    const g = randomDenseShadow(size, rng, { minX: lo, maxX: hi });
    if (g) add(`dense-rand-${++made}`, 'Dense', `Random dense ${size}×${size} #${made}`, g, 'Seeded random mosaic; may contain reducible crossings.');
  }
  // 25×25 boards: full shadows (exact solving impossible; heuristic AI, Jones via row sweep) and
  // "open region" versions where only the 8 central crossings are in play (solved exactly).
  const rngL = mulberry32(25252525);
  const bigs = [];
  for (const [lo, hi, prob] of [[22, 28, 0.5], [30, 36, 0.7], [37, 46, 0.95]]) { const g = largePlatShadow(rngL, { minX: lo, maxX: hi, prob }); if (g) bigs.push(g); }
  bigs.forEach((g, k) => {
    const n = buildDiagram(g).N;
    add(`large-${k + 1}`, 'Large 25×25', `25×25 plat #${k + 1} (${n} crossings)`, g, 'All crossings open: too large for exact solving. Play two-human or against the heuristic AI; the result is classified by the Jones polynomial (row-sweep algorithm).');
  });
  keepFixed = true;
  bigs.forEach((g, k) => {
    add(`large-${k + 1}-region`, 'Large 25×25', `25×25 plat #${k + 1}, central 8 open`, openRegion(g, 8, rngL), 'Only the 8 crossings nearest the centre are in play; the rest are fixed. Solved exactly.');
  });
  keepFixed = false;
  return entries;
}
