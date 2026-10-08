# Reusable cloud development setup

This commit records the setup work and review below; it does not implement the proposed application changes.

These scripts target the Codex Linux cloud environment, with Node 24, Python 3.12, uv, pip and Docker already available. Use existing isolated checkouts; do not create a worktree unless requested. Keep this repository at `/workspace/knotlink`. The classifier must be at `/workspace/knot_mosaics`, pinned to `5da6ecd41d1f4d9ce9251aafb33605a3e00db38c` from its `backend_connection` branch. If absent, clone it using existing Git authentication and check out that commit; preserve any existing checkout changes.

From `/workspace/knotlink`:

```bash
bash scripts/cloud/install.sh
bash scripts/cloud/start.sh
# Only when the backend is configured with the local knotlink_onboarding database:
KNOTLINK_ONBOARDING_SMOKE=1 server/.venv/bin/python scripts/cloud/smoke.py
```

Installation keeps runtime dependencies outside the repository and installs backend packages in its ignored virtual environment. Startup uses local ports 5000, 5001 and 5173, and preserves MongoDB data at `/workspace/.knotlink/mongo`. Logs and process IDs go to `/workspace/knotlink-environment`. Existing environment overrides are respected. The smoke check assumes local MongoDB and a backend using `knotlink_onboarding`; do not run it against another database or remote services. It creates a game, verifies classification and persistence, then deletes only its own test game and result.

The frontend defaults to `/api`, proxied by Vite to Flask. `VITE_API_URL` can override the browser-facing API address, and `BACKEND_URL` can override the Vite proxy target. See [the connection guide](frontend-backend.md) for current submission behavior and production routing. These setup scripts themselves do not modify gameplay. Ports are used for internal validation; this setup does not establish a browser-accessible deployment.

## Original onboarding review

# Knotlink review and recommended implementation

No source files, dependency declarations, or lockfiles were changed during onboarding. No commits were made.

## Project and current integration
React/Vite renders a mosaic editor and a Knotter versus Unknotter game. Flask owns game sessions and validates moves. A separate SageMath service computes a Jones polynomial to classify completed boards. MongoDB stores completed game results, move sequences, and research metadata. Active games currently live only in Flask memory.

The frontend is already connected through client/src/services/api.js, using VITE_API_URL or http://localhost:5000/api. The UI translates unresolved tile 11 to backend tile -1. Creating a game posts its board and starting player. Selecting a resolution immediately posts a move; Submit Move only fetches status. Classification is a separate POST initiated by the frontend after the last move.

## Proposed source changes, before any commit

1. Connect the services with a clear API contract. Configure a same-origin /api route through a Vite development proxy and a deployment reverse proxy; retain an explicit VITE_API_URL override. Restrict production CORS to intended origins. Add documented local service configuration for Flask, MongoDB and the Sage classifier, and pin the classifier checkout to its backend_connection commit (main does not contain its HTTP service).
2. Make Flask state authoritative in the UI. Keep tile selection local until Submit Move sends exactly one POST. Apply the returned status for the board, player, remaining crossings, completion, and winner; avoid independently toggling the player. Put tile/shape conversion in one adapter. Cancel a selection locally, rather than undoing an already committed move.
3. Repair backend invariants. Validate rectangular, nonempty integer boards, tile ranges, and suitable mosaic connectivity. Validate moves without coercing fractional/string input. Implement undo from the recorded last move, restoring its player and clearing classification/winner. Reset must restore the original board and player and refresh initial-board metadata when a new board is supplied. Add state versions or request IDs so retries and stale clients cannot commit extra moves.
4. Finalize games in the backend. The final accepted move should initiate classification and persistence, independent of a browser pressing another button. Expose distinct states such as playing, classifying, finished, classification_failed and persistence_failed. Permit safe retries and do not announce a durable result when a database write failed.
5. Respect stored research data. Preserve existing games and schema compatibility; use explicit schema versions for additive fields. Keep initial board, final board, actual starting player, ordered moves, classifier version, polynomial, outcome and timestamps. Repeated classification currently upserts but changes created_at; preserve the original creation time. Keep local smoke-test/training data in separate databases, and never bulk-delete research records. Decide whether active games must survive restart before moving beyond a single Flask worker.
6. Display unknown classification explicitly. The classifier returns is_unknot=null for boards above its crossing limit, but the UI currently renders a winner/result anyway. Never turn null into an Unknotter win or a Knot label.
7. Add meaningful integration checks: UI start -> select -> submit -> correct player; undo/reset; completed game -> classifier -> saved record; classifier/database outages and retry; duplicate/stale requests. Fix the existing lint errors separately from environment setup.

## AI self-play

Start with a headless runner using the same backend rules: reset/create, read observation, enumerate legal actions (each unresolved cell with tile 9 or 10), select an action, step, classify, record outcome, repeat. Begin with seeded random agents, then minimax for small boards, then MCTS or learned policies against those baselines. Alternate roles and starting players; split training/evaluation by initial board and use fixed evaluation seeds.

A training-friendly environment can expose reset(seed, board), legal_actions(), and step(action) returning observation, reward, terminated and info. Reward comes from a successfully classified terminal result from the acting player's perspective; classifier failure or an unknown classification must not become a win/loss. A bounded batch runner needs timeouts, cleanup of Flask sessions, classifier caching by board plus classifier version, and episode/policy/seed metadata for reproducible replay.

For higher throughput, share the game engine between Flask and the training adapter instead of driving browser clicks. Keep the browser as a viewer for human play and replay. Persist training episodes to a separate collection/database with an explicit retention policy.

## Scientific limitation
A non-unit Jones polynomial certifies a nontrivial knot, but a unit Jones polynomial alone is not an unconditional proof that a knot is the unknot. The current classifier defines is_unknot by polynomial equality. Therefore the research query requiring both is_unknot=false and Jones polynomial 1 cannot establish a counterexample with this classifier. Store the polynomial separately from an independently established topological label; unresolved cases should be represented explicitly. This also matters for trustworthy AI rewards.

## Reproduced defects during inspection

- Undo restores a tile but leaves the wrong player to move.
- Reset without a supplied board keeps the resolved board instead of restoring the original.
- Reset with a new board leaves initial_board metadata stale.
- Creating an already resolved nonempty board does not mark game_over.
- ESLint reports 4 errors and 3 warnings in existing frontend source.

The torus-board generator is unfinished: it currently places unresolved crossings without constructing a connected mosaic. Use validated fixtures for initial self-play experiments before relying on generated boards.

## Completed environment work

- Installed frontend dependencies with npm ci; Vite production build passed.
- Installed Python 3.11.16 and pinned backend requirements in server/.venv.
- Added the classifier dependency checkout at backend_connection commit 5da6ecd41d1f4d9ce9251aafb33605a3e00db38c; its main branch lacks the HTTP service.
- Started local MongoDB 7.0, SageMath 10.6 classifier, Flask API and Vite development server.
- Used the prebuilt SageMath image and mounted dependencies/code to avoid costly vfs Docker layer copies. Removed canceled-build caches created during onboarding.
- A complete three-move trefoil game passed real HTTP checks, Jones-polynomial classification, Knotter winner determination, MongoDB storage of original/final boards and ordered moves, research stats, and repeat-classification upsert checks.
- Used knotlink_onboarding, a separate database. Removed only the smoke check's own game/result.
- Exercised the installation script again and verified service restart/startup instructions and complete-game smoke after restart.
- Saved install_script, start_skill, and both exact repository checkouts in the environment configuration draft. Saving does not publish; review/save settings and publish through the environment UI.
- Both repository working trees are clean. No application source, tests, dependency declarations or lockfiles changed, and no commits were made.
- Browser interaction, automated AI play, learning and production deployment remain unimplemented/unvalidated. Existing source issues are described above.

Reusable helpers are in `scripts/cloud/`. The environment retains dependencies and data, but live processes need startup after restoration.
