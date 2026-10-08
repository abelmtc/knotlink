import React, { useState } from "react";
import KnotInput from "./components/KnotInput";
import GameGrid from "./components/GameGrid";
import GameAPI from "./services/api";
import "./components/GameStyles.css";

function KnottingUnknottingGame() {
    // Game state
    const [gameId, setGameId] = useState(null);
    const [rows, setRows] = useState(5);
    const [cols, setCols] = useState(5);
    const [board, setBoard] = useState([0, 2, 5, 5, 1, 2, 11, 5, 1, 6, 6, 6, 2, 11, 4, 6, 3, 11, 4, 0, 3, 5, 4, 0, 0]);
    const [firstMove, setFirstMove] = useState(0);
    const [currMove, setCurrMove] = useState(0);
    const [remainingTerms, setRemainingTerms] = useState(board.filter(item => item === 11).length);
    const [pendingMove, setPendingMove] = useState(null);
    
    // UI state
    const [loadBoard, setLoadBoard] = useState(false);
    const [gameBegan, setGameBegan] = useState(false);
    const [gameOver, setGameOver] = useState(false);
    const [winner, setWinner] = useState(null);
    const [classification, setClassification] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState("");

    const applyStatus = (status) => {
        setBoard(status.board.flat().map(tile => tile === -1 ? 11 : tile));
        setRows(status.rows);
        setCols(status.cols);
        setRemainingTerms(status.unresolved_count);
        setCurrMove(status.current_player === "knotter" ? 1 : 0);
        setWinner(status.winner);
    };

    // Wrapper for KnotInput setter
    const wrappedSetter = (_board, _rows, _cols) => {
        setBoard(_board);
        setRemainingTerms(_board.filter(tile => tile === 11).length);
        setRows(_rows);
        setCols(_cols);
        setLoadBoard(false);
    };

    // Set first move
    const setMoves = (event) => {
        setFirstMove(Number(event.target.value));
        setCurrMove(Number(event.target.value));
    };

    // Start the game by creating it in backend
    const startGame = async () => {
        setLoading(true);
        setError(null);
        try {
            // Convert 11s to -1s for backend
            const backendBoard = board.map(tile => tile === 11 ? -1 : tile);
            const board2D = [];
            for (let i = 0; i < rows; i++) {
                board2D.push(backendBoard.slice(i * cols, (i + 1) * cols));
            }
            
            const startingPlayer = firstMove === 0 ? "unknotter" : "knotter";
            const response = await GameAPI.createGame(board2D, startingPlayer);
            
            applyStatus(response.status);
            setGameId(response.game_id);
            setGameBegan(true);
            setMessage("Game started!");
        } catch (err) {
            setError(`Failed to start game: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Submit move to backend
    const doOnSubmitClick = async () => {
        if (loading) return;
        if (!gameId || !pendingMove) {
            setError("No move to submit. Please select a crossing first.");
            return;
        }
        
        setLoading(true);
        setError(null);
        try {
            const response = await GameAPI.makeMove(
                gameId, pendingMove.row, pendingMove.col, pendingMove.tileValue
            );
            const status = response.status;
            applyStatus(status);
            setPendingMove(null);

            // Check if game is over
            if (status.game_over && status.unresolved_count === 0) {
                await classifyAndDetermineWinner();
            } else {
                setMessage(`Move accepted. Next player: ${status.current_player}`);
            }
        } catch (err) {
            setError(`Failed to submit move: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Cancel an unsubmitted selection without changing backend state.
    const undoMove = () => {
        if (loading) return;
        setPendingMove(null);
        setMessage("");
    };

    // Classify board and determine winner
    const classifyAndDetermineWinner = async () => {
        if (!gameId) return;
        
        setLoading(true);
        setError(null);
        try {
            const result = await GameAPI.classifyBoard(gameId);
            
            setClassification(result.classification);
            setWinner(result.winner);
            setGameOver(true);
            
            if (result.winner && result.classification.is_unknot !== null) {
                const winnerName = result.winner === "knotter" ? "Knotter" : "Unknotter";
                const knotType = result.classification.is_unknot ? "an unknot" : "a knot";
                setMessage(`Game Over! The result is ${knotType}. ${winnerName} wins!`);
            } else {
                setMessage("Board resolved. Classification is inconclusive; no winner determined.");
            }
        } catch (err) {
            setError(`Failed to classify board: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Reset game
    const resetGame = async () => {
        if (gameId) {
            try {
                await GameAPI.deleteGame(gameId);
            } catch (err) {
                console.error("Failed to delete game:", err);
            }
        }
        
        setGameId(null);
        setGameBegan(false);
        setGameOver(false);
        setWinner(null);
        setClassification(null);
        setError(null);
        setMessage("");
        setPendingMove(null);
        setRows(5);
        setCols(5);
        setBoard([0, 2, 5, 5, 1, 2, 11, 5, 1, 6, 6, 6, 2, 11, 4, 6, 3, 11, 4, 0, 3, 5, 4, 0, 0]);
        setRemainingTerms(3);
        setFirstMove(0);
        setCurrMove(0);
    };

    return (
        <div className="flex flex-col w-full gap-4 text-black">  
            {/* Error display */}
            {error && (
                <div className="game-alert game-alert-error">
                    <strong className="font-bold">Error: </strong>
                    <span>{error}</span>
                </div>
            )}

            {/* Message display */}
            {message && !error && (
                <div className="game-alert game-alert-info">
                    {message}
                </div>
            )}

            {/* Game setup */}
            {!gameBegan && (
                <>
                    <div className="game-section" style={{alignItems: 'center', width: '80%', margin: '0 auto'}}>
                        {!loadBoard && (
                            <button 
                                onClick={() => setLoadBoard(true)}
                                className="game-btn-primary game-btn-blue game-btn-large"
                            >
                                Load Game Board
                            </button>
                        )}
                        {loadBoard && <KnotInput setter={wrappedSetter} />}
                    </div>
                    <div style={{display: 'flex', flexDirection: 'row', gap: '16px', justifyContent: 'center', alignItems: 'center', margin: '16px 0'}}>
                        <button 
                            onClick={startGame}
                            disabled={loading}
                            className="game-btn-primary game-btn-green game-btn-large"
                        >
                            {loading ? "Starting..." : "Start Game"}
                        </button>
                        <p className="game-text-emphasis">First move:</p>
                        <select 
                            className="game-select" 
                            onChange={setMoves}
                            defaultValue={0}
                            disabled={loading}
                        >
                            <option value={0}>Unknotter</option>
                            <option value={1}>Knotter</option>
                        </select>
                    </div>
                </>
            )}

            {/* Active game UI */}
            {gameBegan && !gameOver && (
                <div className="game-section">
                    <div style={{display: 'flex', flexDirection: 'row', gap: '16px', justifyContent: 'center', alignItems: 'center'}}>
                        <p className="game-text-large">
                            Current move: {currMove === 0 ? "Unknotter" : "Knotter"}
                        </p>
                        <p className="game-text-emphasis">Remaining crossings: {remainingTerms}</p>
                        <p>First move: {firstMove === 0 ? "Unknotter" : "Knotter"}</p>
                        <button 
                            onClick={doOnSubmitClick}
                            disabled={loading || !pendingMove}
                            className="game-btn-primary game-btn-blue"
                            title={!pendingMove ? "Select a crossing first" : "Submit your move"}
                        >
                            {loading ? "Processing..." : "Submit Move"}
                        </button>
                        <button 
                            onClick={undoMove}
                            disabled={loading || !pendingMove}
                            className="game-btn-primary game-btn-red"
                            title={!pendingMove ? "Select a tile first to cancel" : "Cancel your selection"}
                        >
                            Cancel Selection
                        </button>
                    </div>
                    <p style={{textAlign: 'center', fontWeight: '500'}}>
                        {pendingMove 
                            ? "Move selected! Click 'Submit Move' to confirm." 
                            : "Select a highlighted cell below to resolve its crossing"}
                    </p>
                </div>
            )}

            {/* Game over UI */}
            {gameBegan && !gameOver && remainingTerms === 0 && (
                <button onClick={classifyAndDetermineWinner} disabled={loading}>
                    {loading ? "Classifying..." : "Retry classification"}
                </button>
            )}

            {gameOver && (
                <div style={{display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', margin: '16px 0'}}>
                    <div className="game-over-panel">
                        <h2>Game Over!</h2>
                        <p>
                            Winner: <span style={{fontWeight: 'bold'}}>{winner === "knotter" ? "Knotter" : winner === "unknotter" ? "Unknotter" : "Undetermined"}</span>
                        </p>
                        <p style={{fontWeight: '600'}}>
                            Result: {classification?.is_unknot === true ? "Unknot" : classification?.is_unknot === false ? "Knot" : "Unknown"}
                        </p>
                        {classification && (
                            <div style={{marginTop: '16px', fontSize: '0.875rem'}}>
                                <p style={{fontWeight: '600'}}>Classification details:</p>
                                <ul style={{listStyleType: 'disc', listStylePosition: 'inside', marginLeft: '16px'}}>
                                    <li>Method: {classification.reason}</li>
                                    <li>Number of crossings: {classification.num_crossings}</li>
                                </ul>
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={resetGame}
                        className="game-btn-primary game-btn-blue game-btn-large"
                    >
                        Play Again
                    </button>
                </div>
            )}

            {/* Game grid */}
            <GameGrid 
                rows={rows} 
                cols={cols} 
                board={[...board]} 
                canMove={gameBegan && !gameOver && !loading}
                pendingMove={pendingMove}
                setPendingMove={setPendingMove}
            />
        </div>
    );
}

export default KnottingUnknottingGame;
