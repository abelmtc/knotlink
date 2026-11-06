"""
Flask API server for the Knotting/Unknotting game.
Provides REST endpoints for game management.
"""

from dotenv import load_dotenv
load_dotenv()  # Must be first before any os.environ.get() calls

from flask import Flask, request, jsonify
from flask_cors import CORS
from game_state import GameState, Player, create_game
from database import init_db, save_game_result
from knot_classifier import classify_mosaic, BoardError
from typing import Dict
import uuid
import requests
import os

app = Flask(__name__)
CORS(app)

try:
    init_db()
    print("Database initialized successfully")
except Exception as e:
    print(f"Warning: Could not initialize database: {e}")

active_games: Dict[str, GameState] = {}
CLASSIFIER_URL = os.environ.get('CLASSIFIER_URL', 'http://localhost:5001/api/classify')
# CLASSIFIER_MODE:
#   "sage"    - only use the SageMath classifier service at CLASSIFIER_URL (previous behavior)
#   "builtin" - only use the pure-Python classifier in knot_classifier.py (no Sage needed)
#   "auto"    - try the Sage service, fall back to the built-in classifier if it is unreachable
#               or rejects the board (default)
CLASSIFIER_MODE = os.environ.get('CLASSIFIER_MODE', 'auto').strip().lower()


class ClassifierUnavailable(Exception):
    def __init__(self, payload, status):
        super().__init__(payload.get("error"))
        self.payload, self.status = payload, status


def _builtin_classify(board):
    try:
        return classify_mosaic(board)
    except BoardError as e:
        raise ClassifierUnavailable({"error": "Invalid board", "details": str(e)}, 400)


def run_classifier(board):
    """Classify a board with the configured classifier. Returns the classifier's JSON dict."""
    if CLASSIFIER_MODE == 'builtin':
        return _builtin_classify(board)
    try:
        response = requests.post(CLASSIFIER_URL, json={'mosaic': board}, timeout=10)
    except requests.exceptions.ConnectionError:
        if CLASSIFIER_MODE == 'auto':
            return _builtin_classify(board)
        raise ClassifierUnavailable({
            "error": "Cannot connect to classifier service",
            "hint": "Make sure classifier_service.py is running on port 5001, or set CLASSIFIER_MODE=auto"
        }, 503)
    except requests.exceptions.Timeout:
        if CLASSIFIER_MODE == 'auto':
            return _builtin_classify(board)
        raise ClassifierUnavailable({"error": "Classifier service timeout"}, 504)
    if response.status_code == 200:
        result = response.json()
        # The Sage service gives up above 22 crossings (is_unknot = null); the built-in row-sweep
        # classifier handles large boards such as 25x25 mosaics.
        if CLASSIFIER_MODE == 'auto' and result.get('is_unknot') is None:
            return _builtin_classify(board)
        return result
    if CLASSIFIER_MODE == 'auto':
        return _builtin_classify(board)
    try:
        details = response.json()
    except ValueError:
        details = response.text
    raise ClassifierUnavailable({"error": "Classifier service error", "details": details}, response.status_code)


@app.route('/api/game/new', methods=['POST'])
def new_game():
    """
    Create a new game instance.

    Expected JSON body:
    {
        "board": [[0, 0, -1, ...], ...],
        "starting_player": "knotter" or "unknotter"
    }
    """
    try:
        data = request.get_json(force=True, silent=False)
        board = data.get('board')
        starting_player = data.get('starting_player', 'knotter')

        if board is None:
            return jsonify({"error": "Board configuration required"}), 400

        game = create_game(board, starting_player)
        game_id = str(uuid.uuid4())
        active_games[game_id] = game

        return jsonify({
            "game_id": game_id,
            "status": game.get_game_status()
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/game/<game_id>/status', methods=['GET'])
def get_game_status(game_id: str):
    """Get current game status."""
    game = active_games.get(game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404
    return jsonify(game.get_game_status()), 200


@app.route('/api/game/<game_id>/move', methods=['POST'])
def make_move(game_id: str):
    """
    Make a move in the game.

    Expected JSON body:
    {
        "row": 0,
        "col": 2,
        "new_tile": 9 or 10
    }
    """
    game = active_games.get(game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    try:
        data = request.get_json(force=True, silent=False)
        row = data.get('row')
        col = data.get('col')
        new_tile = data.get('new_tile')

        if row is None or col is None or new_tile is None:
            return jsonify({"error": "row, col, and new_tile are required"}), 400

        success, message = game.make_move(int(row), int(col), int(new_tile))
        response = {
            "success": success,
            "message": message,
            "status": game.get_game_status()
        }
        return jsonify(response), (200 if success else 400)

    except Exception as e:
        return jsonify({"error": str(e)}), 400
    
@app.route('/api/game/<game_id>/undo', methods=['POST'])
def undo_move(game_id: str):
    """
    Undo the last move by restoring a cell to unresolved (-1).
    Expected JSON body: { "row": 0, "col": 2 }
    """
    game = active_games.get(game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    try:
        data = request.get_json(force=True, silent=False)
        row = data.get('row')
        col = data.get('col')

        if row is None or col is None:
            return jsonify({"error": "row and col are required"}), 400

        row, col = int(row), int(col)
        if row < 0 or row >= game.rows or col < 0 or col >= game.cols:
            return jsonify({"error": f"Position ({row}, {col}) is out of bounds"}), 400

        # Restore cell to unresolved, remove that move from history and give the turn back
        # to the player who made it (otherwise the server's current_player drifts out of
        # sync with the client after an undo).
        game.board[row][col] = -1
        for k in range(len(game.move_history) - 1, -1, -1):
            m = game.move_history[k]
            if m.row == row and m.col == col:
                game.move_history.pop(k)
                game.current_player = m.player
                break
        game.game_over = False
        game.winner = None
        game.is_unknot = None

        return jsonify({
            "success": True,
            "status": game.get_game_status()
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/game/<game_id>/classify', methods=['POST'])
def classify_board(game_id: str):
    """
    Classify the current board state as knot or unknot.
    This can be called anytime to check the current board state.
    """
    game = active_games.get(game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    try:
        # Get current board state
        board = game.get_board_state()
        
        # Check if there are any unresolved crossings
        unresolved = game.has_unresolved_crossings()
        
        # Call the classifier (Sage service and/or built-in, see CLASSIFIER_MODE)
        try:
            classifier_result = run_classifier(board)
        except ClassifierUnavailable as e:
            return jsonify(e.payload), e.status

        # Determine winner if game is complete
        if not unresolved and game.game_over:
            is_unknot = classifier_result.get('is_unknot')
            if is_unknot is not None:
                game.is_unknot = is_unknot
                game.winner = Player.UNKNOTTER if is_unknot else Player.KNOTTER

                # Build move sequence for storage
                move_sequence = [
                    {
                        "row": m.row,
                        "col": m.col,
                        "tile": m.new_tile,
                        "player": m.player.value
                    }
                    for m in game.move_history
                ]

                # Save every completed game to MongoDB
                try:
                    save_game_result(
                        game_id=game_id,
                        initial_board=getattr(game, 'initial_board', board),
                        final_board=board,
                        rows=game.rows,
                        cols=game.cols,
                        num_unresolved=sum(
                            1 for row in getattr(game, 'initial_board', board)
                            for cell in row if cell == -1
                        ),
                        starting_player=getattr(game, 'starting_player_str', 'unknotter'),
                        winner=game.winner.value if game.winner else None,
                        move_sequence=move_sequence,
                        classification=classifier_result,
                    )
                except Exception as db_err:
                    print(f"Warning: Failed to save game to database: {db_err}")
        
        return jsonify({
            "board": board,
            "classification": classifier_result,
            "game_complete": not unresolved,
            "unresolved_crossings": len(game.get_unresolved_positions()),
            "winner": game.winner.value if game.winner else None
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/game/<game_id>/validate', methods=['POST'])
def validate_move(game_id: str):
    """
    Validate a move without executing it.

    Expected JSON body:
    {
        "row": 0,
        "col": 2,
        "new_tile": 9 or 10
    }
    """
    game = active_games.get(game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    try:
        data = request.get_json(force=True, silent=False)
        row = data.get('row')
        col = data.get('col')
        new_tile = data.get('new_tile')

        if row is None or col is None or new_tile is None:
            return jsonify({"error": "row, col, and new_tile are required"}), 400

        is_valid, message = game.is_valid_move(int(row), int(col), int(new_tile))
        return jsonify({"valid": is_valid, "message": message}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/game/<game_id>/reset', methods=['POST'])
def reset_game(game_id: str):
    """
    Reset the game to initial state.

    Optional JSON body:
    {
        "board": [[...]] (optional),
        "starting_player": "knotter" or "unknotter" (optional)
    }
    """
    game = active_games.get(game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    try:
        data = request.get_json(force=True, silent=False) or {}
        board = data.get('board')
        starting_player_str = data.get('starting_player')

        starting_player = None
        if starting_player_str:
            s = starting_player_str.strip().lower()
            if s not in ("knotter", "unknotter"):
                return jsonify({"error": "starting_player must be 'knotter' or 'unknotter'"}), 400
            starting_player = Player.KNOTTER if s == 'knotter' else Player.UNKNOTTER

        game.reset_game(board, starting_player)

        return jsonify({
            "message": "Game reset successfully",
            "status": game.get_game_status()
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/game/<game_id>', methods=['DELETE'])
def delete_game(game_id: str):
    """Delete a game instance."""
    if game_id in active_games:
        del active_games[game_id]
        return jsonify({"message": "Game deleted"}), 200
    return jsonify({"error": "Game not found"}), 404


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "active_games": len(active_games),
                    "classifier_mode": CLASSIFIER_MODE}), 200


@app.route('/api/research/interesting-games', methods=['GET'])
def interesting_games():
    """Return all nontrivial knot results."""
    try:
        from database import get_interesting_games
        games = get_interesting_games()
        for g in games:
            if 'created_at' in g and hasattr(g['created_at'], 'isoformat'):
                g['created_at'] = g['created_at'].isoformat()
        return jsonify(games), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/research/candidates', methods=['GET'])
def jones_poly_one_candidates():
    """Return games where result is nontrivial but Jones polynomial is 1."""
    try:
        from database import get_jones_poly_one_games
        games = get_jones_poly_one_games()
        for g in games:
            if 'created_at' in g and hasattr(g['created_at'], 'isoformat'):
                g['created_at'] = g['created_at'].isoformat()
        return jsonify(games), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/research/stats', methods=['GET'])
def research_stats():
    """Summary statistics."""
    try:
        from database import get_stats
        return jsonify(get_stats()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Run: python server.py
    app.run(debug=True, host='0.0.0.0', port=5000)