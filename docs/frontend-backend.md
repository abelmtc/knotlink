# Frontend/backend connection and self-play roadmap

## Current connection

The React client sends requests to `/api` by default. Vite development and preview servers forward this path to Flask at `http://127.0.0.1:5000`. Set `BACKEND_URL` in the Vite process to change the upstream server. Set `VITE_API_URL` before starting Vite or building to override the browser-facing API base, including its `/api` path. A direct cross-origin URL requires the backend to allow the intended frontend origin.

From `/workspace/knotlink`, prepare and start the local services using:

```bash
bash scripts/cloud/install.sh
bash scripts/cloud/start.sh
curl --fail http://127.0.0.1:5173/api/health
```

The backend needs the SageMath classifier for results and MongoDB for persistence. See [cloud setup](cloud-environment.md) for the classifier checkout, local database, and smoke-check requirements.

Vite proxy settings are development/preview configuration, not a deployed reverse proxy. For a production build, either route `/api` from the frontend host to Flask through your deployment reverse proxy, preserving the `/api` prefix, or build with a reachable `VITE_API_URL`. Do not put a server-only address such as localhost in a browser-facing URL unless the browser runs on that machine. Production deployment is not performed by pushing this source change.

## Game flow

1. Start Game posts a two-dimensional board and starting player to Flask. The UI translates unresolved tile 11 to API tile -1.
2. Choosing tile 9 or 10 previews an unsubmitted selection locally. Cancelling removes the selection without calling the backend undo endpoint.
3. Submit Move posts one selected move. The returned backend status supplies the board, dimensions, player turn, remaining crossings and winner fields. A failed request retains the selection so it can be retried.
4. The last successful move invokes classification. A classifier failure exposes Retry classification without resubmitting that move. An inconclusive classification displays Unknown and Undetermined instead of announcing a winner.
5. The existing backend persists successfully classified completed games. This frontend change does not alter the MongoDB schema, existing records, or database error handling.

## Verification

The production frontend build and lint on the changed JavaScript files pass. Rendered React checks using jsdom and Testing Library exercised real HTTP requests through Vite to Flask, the SageMath classifier, and MongoDB: selection/cancel without a move/undo request, retry after a simulated failed move, backend player turns and crossing counts, retry after a simulated classifier failure, actual trefoil winner and persistence, and simulated inconclusive classification. These checks validate component behavior; they do not constitute visual or real-browser deployment testing.

The existing complete-game smoke check also verifies original-board and move-history persistence and repeat-classification upserts. Test records use the separate knotlink_onboarding database and are cleaned up by their own game IDs. Full-project lint still reports three pre-existing redeclaration errors and three hook dependency warnings in KnotGrid.jsx; this connection change removes the formerly unused helper in the game component.

## Proposed next changes for iterative AI play

1. Repair and test backend undo/reset and initial resolved-board handling; validate integer tiles and connected mosaics. Add game state versions or idempotent move IDs to handle retries after a response is lost. Active games currently live in a single Flask process.
2. Move finalization into the backend so AI and human clients share terminal behavior. Expose explicit classification/persistence status, safe retries, and unknown outcomes. Preserve original timestamps and report database write failures rather than silently treating the result as durable.
3. Add a seeded headless episode runner: create/reset, observe current player and unresolved positions, enumerate both resolutions for each unresolved cell, choose an action, submit, classify, record, clean up, repeat. Initially use validated fixture boards and random policies; the current torus generator is unfinished.
4. Store training episodes separately from research games, with seed, initial board, ordered state/action transitions, role, policy version, classifier version, polynomial, outcome, and timing. Keep retention and cleanup explicit. Use terminal rewards only when classification succeeds and the outcome is known.
5. Establish fixed evaluation boards and seeds, alternate roles/starting players, then compare minimax on small boards and MCTS against random agents before introducing a learned policy. Split training and evaluation by initial board.
6. For larger training runs, expose a reset/step/legal-actions adapter over the same game engine, cache classification by final board plus classifier version, and provide the frontend with a replay/viewer mode. Bound concurrency, timeouts, and session cleanup.

A unit Jones polynomial alone is not an unconditional proof of the unknot. The current classifier uses polynomial equality as its label, so reward validity and research claims require this limitation to be explicit. Keep polynomial evidence separate from an independently established topological label; do not convert an unknown result or service failure into a win/loss.
