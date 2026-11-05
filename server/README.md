# Knot Game Backend

Flask-based backend server for the Knotting/Unknotting game. Manages game state, validates moves, and integrates with the classifier service to determine winners.

## Overview

The Knotting/Unknotting game is a two-player strategy game played on a knot mosaic:
- **Knotter** tries to create a knotted result
- **Unknotter** tries to create an unknot
- Players alternate resolving unresolved crossings (`-1`) into either tile `9` or `10`
- When all crossings are resolved, the classifier determines the winner using the Jones polynomial

## Architecture
```
┌─────────────────┐          HTTP          ┌──────────────────────┐
│   Game Server   │ ─────────────────────> │ Classifier Service   │
│   (Flask)       │     /api/classify      │ (SageMath + Flask)   │
│   Port 5000     │ <───────────────────── │   Port 5001          │
└─────────────────┘                        └──────────────────────┘
     knotlink/server                        knot_mosaics repo
```

## Setup

### Prerequisites
- Python 3.11+
- Docker Desktop (for containerized deployment)
- Classifier service (from the [`knot_mosaics`](https://github.com/andrew-tawfeek/knot_mosaics) repo)
- Both this repository (`knotlink`) and `knot_mosaics` need to be in the same parent directory (e.g., `lab/`)

## Repository Layout Assumptions

These instructions assume you have this repo (`knotlink`) and the classifier repo (`knot_mosaics`).

They should live side-by-side in a common parent directory, which we'll call `lab/`:

```bash
lab/
├── knotlink/               # this repo
└── knot_mosaics/           # classifier repo
```

## Quickstart: Run the Game with Docker (Recommended)

These steps assume:

- You have both `knotlink` and `knot_mosaics` checked out
- They live in a common folder, e.g.:

  ```bash
  lab/
  ├── docker-compose.yml
  ├── knotlink/
  └── knot_mosaics/

### Docker Deployment

**From the project root (`lab/` directory):**
```bash
# Build and run both services
cd knotlink
docker-compose up --build

# Run in background
docker-compose up -d

# Stop services
docker-compose down
```

Services will be available at:
- Game backend: `http://localhost:5000`
- Classifier: `http://localhost:5001`

### Local Development

1. **Create virtual environment:**
```bash
cd server
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

2. **Install dependencies:**
```bash
pip install -r requirements.txt
```

3. **Run the server:**
```bash
python server.py
```

Server runs on `http://localhost:5000`

## API Endpoints

### Health Check
```bash
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "active_games": 2
}
```

### Create New Game
```bash
POST /api/game/new
Content-Type: application/json

{
  "board": [[0,2,1,0], [2,-1,-1,1], [3,-1,8,4], [0,3,4,0]],
  "starting_player": "knotter"
}
```

Response:
```json
{
  "game_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": {
    "current_player": "knotter",
    "game_over": false,
    "board": [[0,2,1,0], [2,-1,-1,1], [3,-1,8,4], [0,3,4,0]],
    "unresolved_count": 3,
    "unresolved_positions": [[1,1], [1,2], [2,1]],
    "move_count": 0
  }
}
```

### Get Game Status
```bash
GET /api/game/{game_id}/status
```

### Make a Move
```bash
POST /api/game/{game_id}/move
Content-Type: application/json

{
  "row": 1,
  "col": 1,
  "new_tile": 9
}
```

Response:
```json
{
  "success": true,
  "message": "Move accepted. Next player: unknotter",
  "status": {
    "current_player": "unknotter",
    "game_over": false,
    "unresolved_count": 2,
    "move_count": 1
  }
}
```

### Validate Move (without executing)
```bash
POST /api/game/{game_id}/validate
Content-Type: application/json

{
  "row": 1,
  "col": 1,
  "new_tile": 9
}
```

### Classify Board and Determine Winner
```bash
POST /api/game/{game_id}/classify
```

Response:
```json
{
  "board": [[0,2,1,0], [2,9,10,1], [3,10,8,4], [0,3,4,0]],
  "classification": {
    "is_unknot": false,
    "reason": "jones_polynomial",
    "num_crossings": 3,
    "gauss_code": [[2,-3,1,-2,3,-1], [1,1,1]]
  },
  "game_complete": true,
  "unresolved_crossings": 0,
  "winner": "knotter"
}
```

### Reset Game
```bash
POST /api/game/{game_id}/reset
Content-Type: application/json

{
  "board": [[...]],  // optional
  "starting_player": "unknotter"  // optional
}
```

### Delete Game
```bash
DELETE /api/game/{game_id}
```

## Tile Reference

| Value | Description |
|-------|-------------|
| `-1` | **Unresolved crossing** (gameplay) |
| `0` | Empty tile |
| `1-4` | Corner tiles (different orientations) |
| `5` | Horizontal connection |
| `6` | Vertical connection |
| `7-8` | Non-crossing double connection tiles |
| `9` | Crossing (under-over orientation) |
| `10` | Crossing (over-under orientation) |

## Example Game Flow

### 1. Create a trefoil knot game
```bash
curl -X POST http://localhost:5000/api/game/new \
  -H "Content-Type: application/json" \
  -d '{"board": [[0,2,1,0], [2,-1,-1,1], [3,-1,8,4], [0,3,4,0]], "starting_player": "knotter"}'
```

### 2. Make moves (3 unresolved crossings)
```bash
# Save the game_id from previous response
GAME_ID="your-game-id-here"

# Move 1: Knotter
curl -X POST http://localhost:5000/api/game/$GAME_ID/move \
  -H "Content-Type: application/json" \
  -d '{"row": 1, "col": 1, "new_tile": 9}'

# Move 2: Unknotter
curl -X POST http://localhost:5000/api/game/$GAME_ID/move \
  -H "Content-Type: application/json" \
  -d '{"row": 1, "col": 2, "new_tile": 10}'

# Move 3: Knotter
curl -X POST http://localhost:5000/api/game/$GAME_ID/move \
  -H "Content-Type: application/json" \
  -d '{"row": 2, "col": 1, "new_tile": 10}'
```

### 3. Classify and determine winner
```bash
curl -X POST http://localhost:5000/api/game/$GAME_ID/classify
```

**Result:** Trefoil is a knot → Knotter wins!

## Configuration

### Classifier mode

`CLASSIFIER_MODE` chooses how finished boards are classified:

- `auto` (default): call the Sage classifier at `CLASSIFIER_URL`; if it is unreachable or rejects
  the board, use the built-in pure-Python classifier (`knot_classifier.py`, Jones polynomial via
  the Kauffman bracket, same response fields).
- `sage`: only the Sage service (returns 503 when it is down, the previous behavior).
- `builtin`: never call Sage. The game server then runs on its own, with no `knot_mosaics` checkout.

See `DEPLOY.md` in the repository root for running the full stack.

### Classifier Service URL

Set via environment variable:
```bash
export CLASSIFIER_URL=http://classifier:5001/api/classify
python server.py
```

Or modify in `server.py`:
```python
CLASSIFIER_URL = os.environ.get('CLASSIFIER_URL', 'http://localhost:5001/api/classify')
```

### Debug Mode

In `server.py`, toggle debug mode:
```python
app.run(debug=True, host='0.0.0.0', port=5000)  # Development
app.run(debug=False, host='0.0.0.0', port=5000)  # Production
```

## Project Structure
```
server/
├── server.py              # Flask API endpoints
├── game_state.py          # Game logic and state management
├── generate_torus_knot.py # Generate torus knot starting positions
├── requirements.txt       # Python dependencies
├── Dockerfile            # Docker container definition
├── .dockerignore         # Files to exclude from Docker
└── .venv/                # Virtual environment (not in git)
```

## Troubleshooting

### "Cannot connect to classifier service"
- Ensure classifier service is running on port 5001
- Check Docker: `docker ps` should show both containers
- Test classifier health: `curl http://localhost:5001/api/health`

### "Game not found" error
- Game IDs are session-based and cleared on server restart
- Use the exact `game_id` returned from `/api/game/new`

### Port already in use
```bash
# Find and kill process using port 5000
lsof -ti:5000 | xargs kill -9

# Or use a different port
app.run(port=5001)
```

## Testing

### Quick test script
```bash
#!/bin/bash
# test_game.sh

# Create game
RESPONSE=$(curl -s -X POST http://localhost:5000/api/game/new \
  -H "Content-Type: application/json" \
  -d '{"board": [[2,1,0],[3,-1,1],[0,3,4]], "starting_player": "knotter"}')

GAME_ID=$(echo $RESPONSE | grep -o '"game_id":"[^"]*"' | cut -d'"' -f4)
echo "Game ID: $GAME_ID"

# Make move
curl -X POST http://localhost:5000/api/game/$GAME_ID/move \
  -H "Content-Type: application/json" \
  -d '{"row": 1, "col": 1, "new_tile": 9}'

# Classify
curl -X POST http://localhost:5000/api/game/$GAME_ID/classify | python3 -m json.tool
```

## Production Deployment

For production deployment:

1. **Set `debug=False`** in `server.py`
2. **Use environment variables** for configuration
3. **Deploy with Docker** using docker-compose
4. **Add authentication** if needed
5. **Use a production WSGI server** (gunicorn, uwsgi)
6. **Add monitoring** and logging
7. **Set up HTTPS** with reverse proxy (nginx)

### Production docker-compose example
See the `docker-compose.yml` in the project root.

## License

[Add your license here]

## Contributors

Abel Mesfin