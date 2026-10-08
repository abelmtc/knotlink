// client/src/services/api.js
const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

/**
 * API service for communicating with the game backend
 */
class GameAPI {
  /**
   * Create a new game
   * @param {number[][]} board - Initial board configuration
   * @param {string} startingPlayer - "knotter" or "unknotter"
   * @returns {Promise<{game_id: string, status: object}>}
   */
  async createGame(board, startingPlayer) {
    const response = await fetch(`${API_BASE_URL}/game/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        board,
        starting_player: startingPlayer,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create game');
    }

    return response.json();
  }

  /**
   * Get game status
   * @param {string} gameId - Game ID
   * @returns {Promise<object>}
   */
  async getGameStatus(gameId) {
    const response = await fetch(`${API_BASE_URL}/game/${gameId}/status`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get game status');
    }

    return response.json();
  }

  /**
   * Make a move
   * @param {string} gameId - Game ID
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @param {number} newTile - New tile value (9 or 10)
   * @returns {Promise<{success: boolean, message: string, status: object}>}
   */
  async makeMove(gameId, row, col, newTile) {
    const response = await fetch(`${API_BASE_URL}/game/${gameId}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        row,
        col,
        new_tile: newTile,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to make move');
    }

    return response.json();
  }

  /**
   * Undos a move
   * @param {string} gameId - Game ID
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @returns {Promise<{}>}
   */
  async undoMove(gameId, row, col) {
    const response = await fetch(`${API_BASE_URL}/game/${gameId}/undo`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ row, col }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to undo move');
    }

    return response.json();
  }

  /**
   * Classify the board and determine winner
   * @param {string} gameId - Game ID
   * @returns {Promise<object>}
   */
  async classifyBoard(gameId) {
    const response = await fetch(`${API_BASE_URL}/game/${gameId}/classify`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to classify board');
    }

    return response.json();
  }

  /**
   * Validate a move without executing it
   * @param {string} gameId - Game ID
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @param {number} newTile - New tile value (9 or 10)
   * @returns {Promise<{valid: boolean, message: string}>}
   */
  async validateMove(gameId, row, col, newTile) {
    const response = await fetch(`${API_BASE_URL}/game/${gameId}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        row,
        col,
        new_tile: newTile,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to validate move');
    }

    return response.json();
  }

  /**
   * Reset the game
   * @param {string} gameId - Game ID
   * @param {number[][]} board - Optional new board
   * @param {string} startingPlayer - Optional new starting player
   * @returns {Promise<object>}
   */
  async resetGame(gameId, board = null, startingPlayer = null) {
    const body = {};
    if (board) body.board = board;
    if (startingPlayer) body.starting_player = startingPlayer;

    const response = await fetch(`${API_BASE_URL}/game/${gameId}/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset game');
    }

    return response.json();
  }

  /**
   * Delete a game
   * @param {string} gameId - Game ID
   * @returns {Promise<object>}
   */
  async deleteGame(gameId) {
    const response = await fetch(`${API_BASE_URL}/game/${gameId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete game');
    }

    return response.json();
  }

  /**
   * Health check
   * @returns {Promise<{status: string, active_games: number}>}
   */
  async healthCheck() {
    const response = await fetch(`${API_BASE_URL}/health`);

    if (!response.ok) {
      throw new Error('Health check failed');
    }

    return response.json();
  }
}

export default new GameAPI();