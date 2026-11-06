# KnotLink Strategy Lab (standalone prototype)

A single-page, dependency-free prototype that runs entirely in the browser. It is separate from the
React app in `client/` and does not change it.

- **Knot catalog:** twist, torus, 2-bridge, pretzel, "deceptive" unknot, dense mosaics, and 25×25 boards. Click a picture to play it.
- **Scales to 25×25:** the Jones polynomial uses a row sweep (Temperley–Lieb transfer matrix) for big boards. Results are certified (Jones ≠ 1, or Jones = 1 after Reidemeister simplification below 25 crossings); anything else is flagged as a research candidate.
- **Perfect-play solver:** for every shadow and both choices of first mover (does it matter who goes first?).
- **Human vs AI:** the human gets the side with the winning strategy; strict mode rejects moves that give up the win.
- **First-mover atlas**, **3D view**, and per-move experiment logging (copy as CSV).

Open `docs/index.html` in a browser, or enable GitHub Pages (Settings → Pages → Deploy from a branch → `/docs`).

Edit `src/knotEngine.js` or `src/app.template.html`, then rebuild with `node prototype/build.mjs`.
Tests: `node prototype/tests/engine.test.mjs && node prototype/tests/solver.test.mjs && node prototype/tests/sweep.test.mjs && node prototype/tests/large.test.mjs`.

Finished diagrams are classified by the Jones polynomial (Kauffman bracket). Jones = 1 implies the
unknot for diagrams under 25 crossings, so the classification is exact for these boards.
The server-side classifier `server/knot_classifier.py` implements the same algorithm.
