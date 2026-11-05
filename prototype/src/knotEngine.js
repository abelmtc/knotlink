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
export const MAX_SOLVE = 12;      // playable crossings the solver will handle
export const MAX_CLASSIFY = 20;   // crossings the classifier will handle

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
  const f = normalizedBracket(diag, resolutionMask(diag, diag.crossings.map((x) => x.tile)));
  const terms = jonesTerms(f);
  return {
    is_unknot: isOne(f), reason: 'jones_polynomial', num_crossings: diag.N,
    jones_polynomial: formatJones(terms), jones_terms: terms, determinant: determinant(terms),
  };
}

// Knot data for the alternating resolution of a shadow (used to label catalog entries)
export function alternatingInvariants(diag) {
  if (!diag.isKnotShadow || diag.N === 0 || diag.N > MAX_CLASSIFY) return null;
  const f = normalizedBracket(diag, resolutionMask(diag, Array.from(diag.altTile)));
  const terms = jonesTerms(f);
  const exps = terms.map((t) => t[0]);
  return {
    jones: formatJones(terms), terms, determinant: determinant(terms),
    span: terms.length ? Math.max(...exps) - Math.min(...exps) : 0, unknot: isOne(f),
  };
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
  if (playable.length > MAX_SOLVE) return { ok: false, errors: [`${playable.length} playable crossings; the solver supports up to ${MAX_SOLVE}.`], diag };
  if (diag.N > MAX_SOLVE + 2) return { ok: false, errors: [`${diag.N} crossings; the solver supports up to ${MAX_SOLVE + 2}.`], diag };
  return { ok: true, board: b, diag, playable, n: playable.length, fixedMask, _memo: {} };
}

function leafTable(game) {
  if (game._leaves) return game._leaves;
  const { n, playable, fixedMask, diag } = game;
  const total = 1 << n;
  const leaves = new Uint8Array(total); // 1 = knotted (Knotter wins)
  for (let m = 0; m < total; m++) {
    let r = fixedMask;
    for (let j = 0; j < n; j++) if ((m >> j) & 1) r |= 1 << playable[j];
    leaves[m] = isOne(normalizedBracket(diag, r)) ? 0 : 1;
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

// Knot names for reduced alternating diagrams with <= 7 crossings (identified by crossing
// number and determinant, which is unique in that range).
const KNOT_NAMES = {
  '3:3': '3₁ trefoil', '4:5': '4₁ figure-eight', '5:5': '5₁', '5:7': '5₂', '6:9': '6₁', '6:11': '6₂', '6:13': '6₃',
  '7:7': '7₁', '7:11': '7₂', '7:13': '7₃', '7:15': '7₄', '7:17': '7₅', '7:19': '7₆', '7:21': '7₇',
};

export function buildCatalog() {
  const entries = [];
  const add = (id, family, label, board, note = '') => {
    const diag = buildDiagram(board);
    if (!diag.isKnotShadow) return;
    const inv = alternatingInvariants(diag);
    let knot = '';
    if (inv && inv.span === diag.N && diag.N <= 7) knot = KNOT_NAMES[`${diag.N}:${inv.determinant}`] || '';
    entries.push({ id, family, label, board: toShadow(board), crossings: diag.N, knot, determinant: inv ? inv.determinant : null, reduced: inv ? inv.span === diag.N : false, note, rows: board.length, cols: board[0].length });
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
  return entries;
}
