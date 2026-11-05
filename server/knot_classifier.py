"""
Built-in knot classifier (pure Python, no SageMath).

Classifies a fully resolved knot mosaic as knot / unknot with the Jones polynomial, computed
from the Kauffman bracket state sum. It returns the same JSON fields as the SageMath classifier
service in the knot_mosaics repo (is_unknot, reason, num_crossings, jones_polynomial), so the
game server can use either one interchangeably.

Correctness note: a Jones polynomial different from 1 proves the knot is non-trivial, and
Jones = 1 implies the unknot for every diagram with fewer than 25 crossings (verified by
Tuzun & Sikora). Boards above MAX_CROSSINGS return is_unknot = None.

Tile convention (same as game_state.py and knot_mosaics/wild_mosaics.py):
  0 empty | 1 left-down | 2 right-down | 3 up-right | 4 left-up | 5 left-right | 6 up-down
  7 {down-left, up-right} | 8 {down-right, left-up}
  9 crossing, horizontal strand over | 10 crossing, vertical strand over | -1 unresolved
"""

import os
from typing import Dict, List, Optional

UP, RIGHT, DOWN, LEFT = 0, 1, 2, 3
DR = (-1, 0, 1, 0)
DC = (0, 1, 0, -1)
OPP = (2, 3, 0, 1)
VX = (0, 1, 0, -1)   # y-up travel vectors, used for crossing signs
VY = (1, 0, -1, 0)
PAIRS = {
    0: [], 1: [(LEFT, DOWN)], 2: [(RIGHT, DOWN)], 3: [(UP, RIGHT)], 4: [(LEFT, UP)],
    5: [(LEFT, RIGHT)], 6: [(UP, DOWN)], 7: [(DOWN, LEFT), (UP, RIGHT)], 8: [(DOWN, RIGHT), (LEFT, UP)],
}
CROSSING_TILES = (-1, 9, 10)

MAX_CROSSINGS = int(os.environ.get("BUILTIN_CLASSIFIER_MAX_CROSSINGS", "16"))


class BoardError(ValueError):
    pass


def _is_crossing(t: int) -> bool:
    return t in CROSSING_TILES


def _goes(t: int, d: int) -> bool:
    if _is_crossing(t):
        return True
    return any(d in p for p in PAIRS.get(t, []))


def _exit(t: int, d: int) -> int:
    if _is_crossing(t):
        return OPP[d]
    for a, b in PAIRS[t]:
        if a == d:
            return b
        if b == d:
            return a
    raise BoardError(f"tile {t} has no connection {d}")


def _strand(t: int, d: int) -> int:
    for k, p in enumerate(PAIRS[t]):
        if d in p:
            return k
    return -1


def validate_board(board: List[List[int]]) -> List[str]:
    if not isinstance(board, list) or not board or not all(isinstance(r, list) for r in board):
        return ["Board must be a non-empty 2D list"]
    cols = len(board[0])
    if any(len(r) != cols for r in board):
        return ["All rows must have the same length"]
    rows = len(board)
    errors = []
    for r in range(rows):
        for c in range(cols):
            t = board[r][c]
            if not isinstance(t, int) or isinstance(t, bool) or t < -1 or t > 10:
                errors.append(f"Bad tile {t!r} at ({r},{c})")
                continue
            for d in range(4):
                if not _goes(t, d):
                    continue
                rr, cc = r + DR[d], c + DC[d]
                if not (0 <= rr < rows and 0 <= cc < cols) or not _goes(board[rr][cc], OPP[d]):
                    errors.append(f"Tile at ({r},{c}) has a loose end")
    return errors


class _Diagram:
    """Crossings, the arcs joining crossing ports, components and crossing signs."""

    def __init__(self, board: List[List[int]]):
        self.board = board
        R, C = len(board), len(board[0])
        self.crossings = [(r, c) for r in range(R) for c in range(C) if _is_crossing(board[r][c])]
        index = {pos: i for i, pos in enumerate(self.crossings)}
        N = self.N = len(self.crossings)
        partner = [-1] * (4 * N)
        visited = set()
        limit = 2 * R * C + 4

        for i, (r0, c0) in enumerate(self.crossings):
            for d in range(4):
                p = 4 * i + d
                if partner[p] != -1:
                    continue
                r, c, entry = r0 + DR[d], c0 + DC[d], OPP[d]
                for _ in range(limit):
                    t = board[r][c]
                    if _is_crossing(t):
                        q = 4 * index[(r, c)] + entry
                        partner[p], partner[q] = q, p
                        break
                    ex = _exit(t, entry)
                    visited.add((r, c, _strand(t, entry)))
                    r, c, entry = r + DR[ex], c + DC[ex], OPP[ex]
        self.partner = partner

        # closed loops that contain no crossing
        self.free_loops = 0
        for r in range(R):
            for c in range(C):
                t = board[r][c]
                if _is_crossing(t):
                    continue
                for k, pair in enumerate(PAIRS[t]):
                    if (r, c, k) in visited:
                        continue
                    self.free_loops += 1
                    rr, cc, entry = r, c, pair[0]
                    for _ in range(limit):
                        tt = board[rr][cc]
                        key = (rr, cc, _strand(tt, entry))
                        if key in visited:
                            break
                        visited.add(key)
                        ex = _exit(tt, entry)
                        rr, cc, entry = rr + DR[ex], cc + DC[ex], OPP[ex]

        # components of the shadow
        parent = list(range(4 * N))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a, b):
            a, b = find(a), find(b)
            if a != b:
                parent[a] = b

        for p in range(4 * N):
            union(p, partner[p])
        for i in range(N):
            union(4 * i, 4 * i + 2)
            union(4 * i + 1, 4 * i + 3)
        self.components = len({find(p) for p in range(4 * N)}) + self.free_loops

        self.sign9 = None
        if self.components == 1 and N > 0:
            self._orient()

    def _orient(self):
        """Walk the single component; record the direction of travel through each crossing."""
        N, partner = self.N, self.partner
        h_dir, v_dir = [0] * N, [0] * N
        i, d = 0, RIGHT
        for _ in range(2 * N + 2):
            if d in (RIGHT, LEFT):
                h_dir[i] = d
            else:
                v_dir[i] = d
            q = partner[4 * i + d]
            i, d = q >> 2, OPP[q & 3]
            if i == 0 and d == RIGHT:
                break
        # sign of crossing j when resolved as tile 9 (horizontal over); tile 10 is the negative
        self.sign9 = [1 if VX[h_dir[j]] * VY[v_dir[j]] - VY[h_dir[j]] * VX[v_dir[j]] > 0 else -1
                      for j in range(N)]

    def loop_counts(self) -> List[int]:
        """Number of loops for every geometric smoothing state g (bit 1 = 'type 7' pairing)."""
        N, partner = self.N, self.partner
        M = 4 * N
        arcs = [(p, partner[p]) for p in range(M) if partner[p] > p]
        out = [0] * (1 << N)
        for g in range(1 << N):
            parent = list(range(M))
            comps = M

            def find(x):
                while parent[x] != x:
                    parent[x] = parent[parent[x]]
                    x = parent[x]
                return x

            def union(a, b):
                nonlocal comps
                a, b = find(a), find(b)
                if a != b:
                    parent[a] = b
                    comps -= 1

            for a, b in arcs:
                union(a, b)
            for i in range(N):
                base = 4 * i
                if (g >> i) & 1:
                    union(base + DOWN, base + LEFT)
                    union(base + UP, base + RIGHT)
                else:
                    union(base + DOWN, base + RIGHT)
                    union(base + LEFT, base + UP)
            out[g] = comps + self.free_loops
        return out


def _poly_mul(a: Dict[int, int], b: Dict[int, int]) -> Dict[int, int]:
    out: Dict[int, int] = {}
    for e1, c1 in a.items():
        for e2, c2 in b.items():
            out[e1 + e2] = out.get(e1 + e2, 0) + c1 * c2
    return {e: c for e, c in out.items() if c}


def normalized_bracket(diag: _Diagram) -> Dict[int, int]:
    """f(A) = (-A^3)^(-w) <D>, as {exponent of A: coefficient}.

    The A-smoothing of tile 9 is the 'type 8' pairing and of tile 10 the 'type 7' pairing, so
    with r_i = 1 for tile 10, crossing i is A-smoothed in state g exactly when g_i == r_i.
    """
    N = diag.N
    r = 0
    for i, (row, col) in enumerate(diag.crossings):
        if diag.board[row][col] == 10:
            r |= 1 << i
    loops = diag.loop_counts()
    counts: Dict[tuple, int] = {}
    for g, L in enumerate(loops):
        key = (bin(g ^ r).count("1"), L)
        counts[key] = counts.get(key, 0) + 1

    d = {2: -1, -2: -1}  # loop value -A^2 - A^-2
    d_pow = [{0: 1}]
    bracket: Dict[int, int] = {}
    for (h, L), cnt in counts.items():
        while len(d_pow) < L:
            d_pow.append(_poly_mul(d_pow[-1], d))
        for e, c in d_pow[L - 1].items():
            exp = e + N - 2 * h
            bracket[exp] = bracket.get(exp, 0) + cnt * c

    w = sum(-diag.sign9[i] if (r >> i) & 1 else diag.sign9[i] for i in range(N))
    sign = -1 if w % 2 else 1
    return {e - 3 * w: sign * c for e, c in bracket.items() if c}


def _format_jones(f: Dict[int, int]) -> str:
    """Jones polynomial in t (A = t^(-1/4)), formatted like '-t^4 + t^3 + t'."""
    terms = sorted(((-e / 4, c) for e, c in f.items() if c), reverse=True)
    if not terms:
        return "0"
    parts = []
    for k, (e, c) in enumerate(terms):
        e_str = str(int(e)) if float(e).is_integer() else f"{e:g}"
        mono = "" if e == 0 else ("t" if e == 1 else f"t^{e_str}")
        coef = str(abs(c)) if (e == 0 or abs(c) != 1) else ""
        sign = ("-" if c < 0 else "") if k == 0 else (" - " if c < 0 else " + ")
        parts.append(f"{sign}{coef}{mono}")
    return "".join(parts)


def classify_mosaic(board: List[List[int]], max_crossings: Optional[int] = None) -> dict:
    """Classify a resolved mosaic. Raises BoardError for malformed input."""
    errors = validate_board(board)
    if errors:
        raise BoardError("; ".join(errors[:5]))
    diag = _Diagram(board)
    limit = MAX_CROSSINGS if max_crossings is None else max_crossings
    base = {"num_crossings": diag.N, "classifier": "builtin"}
    if any(board[r][c] == -1 for r, c in diag.crossings):
        return {**base, "is_unknot": None, "reason": "unresolved_crossings", "gauss_code": None}
    if diag.components != 1:
        return {**base, "is_unknot": None, "reason": "link_not_supported",
                "components": diag.components, "gauss_code": None}
    if diag.N == 0:
        return {**base, "is_unknot": True, "reason": "no_crossings", "gauss_code": None,
                "jones_polynomial": "1"}
    if diag.N > limit:
        return {**base, "is_unknot": None, "reason": "too_many_crossings", "gauss_code": None,
                "error": f"Built-in classifier handles up to {limit} crossings"}
    f = normalized_bracket(diag)
    return {**base, "is_unknot": f == {0: 1}, "reason": "jones_polynomial", "gauss_code": None,
            "jones_polynomial": _format_jones(f)}
