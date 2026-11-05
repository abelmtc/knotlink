# Running and deploying KnotLink (frontend + backend)

The React client (`client/`) talks to the Flask API (`server/`) through `client/src/services/api.js`,
using `VITE_API_URL` (default `http://localhost:5000/api`). The backend classifies finished boards
with the SageMath service from `knot_mosaics` when it is reachable, and otherwise with the built-in
pure-Python Jones-polynomial classifier (`server/knot_classifier.py`). MongoDB is optional.

## 1. Local development (no Docker, no Sage, no MongoDB needed)

```bash
# terminal 1: backend
cd server
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python server.py                                       # http://localhost:5000/api/health

# terminal 2: frontend
cd client
npm install
npm run dev                                            # http://localhost:5173
```

Check the connection: `curl http://localhost:5000/api/health` should report
`"classifier_mode": "auto"`. Then open http://localhost:5173/knotting, start a game, and play it to the end.

Backend tests (replay the exact frontend request sequence; no Mongo or Sage needed):

```bash
cd server && python -m unittest discover -s tests -v
```

## 2. Whole stack with one command (Docker)

```bash
docker compose -f docker-compose.standalone.yml up --build
# app: http://localhost:8080    API: http://localhost:5000/api
```

This runs MongoDB, the Flask API (built-in classifier) and the production React build behind nginx,
which forwards `/api` to Flask. For the original Sage setup (needs `../knot_mosaics` on its
`backend_connection` branch), run `cp server/.env.example server/.env` and then `docker compose up --build`.

## 3. Hosted deployment

| Piece | Suggested host | Settings |
|---|---|---|
| Backend | Render / Railway / Fly (Docker) | Root `server/`, uses `server/Dockerfile`, port 5000. Env: `CLASSIFIER_MODE=builtin`, optionally `MONGODB_URI` (e.g. MongoDB Atlas free tier). |
| Frontend | Vercel / Netlify | Root `client/`, build `npm run build`, output `dist`. Env: `VITE_API_URL=https://<your-backend-host>/api`. `client/vercel.json` handles client-side routes. |

`VITE_API_URL` is baked in at build time, so redeploy the frontend after changing it.

Visibility: hosted URLs are reachable by anyone who has the link. To keep the source private,
push this branch to a **private** repository rather than the public `knotlink` repos.

## Configuration reference (server)

| Variable | Default | Meaning |
|---|---|---|
| `CLASSIFIER_MODE` | `auto` | `auto`: Sage service if reachable, else built-in · `sage`: Sage only (previous behavior) · `builtin`: never call Sage |
| `CLASSIFIER_URL` | `http://localhost:5001/api/classify` | Sage classifier endpoint |
| `BUILTIN_CLASSIFIER_MAX_CROSSINGS` | `16` | Above this, the built-in classifier returns `is_unknot: null` |
| `MONGODB_URI` / `MONGODB_DB` | `mongodb://localhost:27017/` / `knotlink` | Result storage (optional) |
| `MONGODB_TIMEOUT_MS` | `2000` | Fail fast when MongoDB is down, instead of hanging requests for 30 s |
