import React, { useState, useEffect } from "react";
import KnotInput from "./components/KnotInput";
import GameGrid from "./components/GameGrid";
import BoardLayout, { Panel, Field, Segmented } from "./components/BoardLayout";
import GameAPI from "./services/api";
import "./components/GameStyles.css";

const DEFAULT_BOARD = [0, 2, 5, 5, 1, 2, 11, 5, 1, 6, 6, 6, 2, 11, 4, 6, 3, 11, 4, 0, 3, 5, 4, 0, 0];

function Pill({ label, value, tone = "sage" }) {
    const tones = {
        sage: "bg-sage-100 border-sage-200 text-forest-900",
        honey: "bg-honey-100 border-honey-400 text-forest-900",
    };
    return (
        <div className={`flex flex-col items-center px-4 py-1.5 rounded-2xl border ${tones[tone]}`}>
            <span className="text-xs text-moss-700">{label}</span>
            <span className="font-semibold">{value}</span>
        </div>
    );
}

function KnottingUnknottingGame() {
    // Game state
    const [gameId, setGameId] = useState(null);
    const [rows, setRows] = useState(5);
    const [cols, setCols] = useState(5);
    const [board, setBoard] = useState(DEFAULT_BOARD);
    const [firstMove, setFirstMove] = useState(0);
    const [currMove, setCurrMove] = useState(0);
    const [remainingTerms, setRemainingTerms] = useState(board.filter(item => item === 11).length);
    const [pendingMove, setPendingMove] = useState(null);
    const [boardBeforeMove, setBoardBeforeMove] = useState(null);

    // UI state
    const [loadBoard, setLoadBoard] = useState(false);
    const [gameBegan, setGameBegan] = useState(false);
    const [gameOver, setGameOver] = useState(false);
    const [winner, setWinner] = useState(null);
    const [classification, setClassification] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState("");

    const flattenBoard = (board2D) => board2D.flat();

    const wrappedSetter = (_board, _rows, _cols) => {
        setBoard(_board);
        setRows(_rows);
        setCols(_cols);
        setLoadBoard(false);
    };

    const startGame = async () => {
        setLoading(true);
        setError(null);
        try {
            const backendBoard = board.map(tile => tile === 11 ? -1 : tile);
            const board2D = [];
            for (let i = 0; i < rows; i++) {
                board2D.push(backendBoard.slice(i * cols, (i + 1) * cols));
            }
            const startingPlayer = firstMove === 0 ? "unknotter" : "knotter";
            const response = await GameAPI.createGame(board2D, startingPlayer);
            setGameId(response.game_id);
            setGameBegan(true);
            setMessage("Game started!");
        } catch (err) {
            setError(`Failed to start game: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const doOnSubmitClick = async () => {
        if (!gameId || !pendingMove) {
            setError("No move to submit. Please select a crossing first.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const status = await GameAPI.getGameStatus(gameId);
            const newBoard = flattenBoard(status.board).map(tile => tile === -1 ? 11 : tile);
            setBoard(newBoard);
            setRemainingTerms(status.unresolved_count);
            setCurrMove((currMove + 1) % 2);
            setPendingMove(null);
            setBoardBeforeMove(null);
            if (status.game_over && status.unresolved_count === 0) {
                await classifyAndDetermineWinner();
            } else {
                setMessage(`Move accepted. Next player: ${status.current_player}`);
            }
        } catch (err) {
            setError(`Failed to get game status: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const undoMove = async () => {
        if (!boardBeforeMove || !pendingMove) return;
        setLoading(true);
        setError(null);
        try {
            await GameAPI.undoMove(gameId, pendingMove.row, pendingMove.col);
            setBoard(boardBeforeMove);
            setBoardBeforeMove(null);
            setPendingMove(null);
            setMessage("");
        } catch (err) {
            setError(`Failed to undo: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const classifyAndDetermineWinner = async () => {
        if (!gameId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await GameAPI.classifyBoard(gameId);
            setClassification(result.classification);
            setWinner(result.winner);
            setGameOver(true);
            const winnerName = result.winner === "knotter" ? "Knotter" : "Unknotter";
            const knotType = result.classification.is_unknot ? "an unknot" : "a knot";
            setMessage(`Game Over! The result is ${knotType}. ${winnerName} wins!`);
        } catch (err) {
            setError(`Failed to classify board: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const resetGame = async () => {
        if (gameId) {
            try { await GameAPI.deleteGame(gameId); }
            catch (err) { console.error("Failed to delete game:", err); }
        }
        setGameId(null);
        setGameBegan(false);
        setGameOver(false);
        setWinner(null);
        setClassification(null);
        setError(null);
        setMessage("");
        setPendingMove(null);
        setBoardBeforeMove(null);
        setRows(5);
        setCols(5);
        setBoard(DEFAULT_BOARD);
        setRemainingTerms(3);
    };

    useEffect(() => {
        setRemainingTerms(board.filter(item => item === 11).length);
    }, [board]);

    const turnName = currMove === 0 ? "Unknotter" : "Knotter";

    const alerts = (
        <>
            {error && (
                <div className="game-alert game-alert-error !w-full" role="alert">
                    <strong>Error: </strong><span>{error}</span>
                </div>
            )}
            {message && !error && <div className="game-alert game-alert-info !w-full">{message}</div>}
        </>
    );

    const panel = (
        <>
            {alerts}

            {/* Phase 1: setup */}
            {!gameBegan && (
                <Panel title="New game">
                    <Field label="Who moves first?">
                        <Segmented
                            label="First move"
                            value={firstMove}
                            onChange={(v) => { setFirstMove(v); setCurrMove(v); }}
                            options={[{ value: 0, label: "Unknotter" }, { value: 1, label: "Knotter" }]}
                        />
                    </Field>
                    <button onClick={startGame} disabled={loading}
                            className="game-btn-primary game-btn-green game-btn-large w-full">
                        {loading ? "Starting..." : "Start game"}
                    </button>
                    <button onClick={() => setLoadBoard(true)} className="btn w-full">
                        Load custom board
                    </button>
                </Panel>
            )}

            {/* Phase 2: playing */}
            {gameBegan && !gameOver && (
                <Panel title="Your move">
                    <div className="grid grid-cols-2 gap-3">
                        <Pill label="Current move" value={turnName} tone={currMove === 0 ? "sage" : "honey"} />
                        <Pill label="Crossings left" value={remainingTerms} />
                    </div>
                    <p className="text-sm text-moss-700">
                        {pendingMove
                            ? "Move selected. Press Submit move to confirm."
                            : "Pick a highlighted cell on the board to resolve its crossing."}
                    </p>
                    <button onClick={doOnSubmitClick} disabled={loading || !pendingMove}
                            className="game-btn-primary game-btn-blue w-full">
                        {loading ? "Processing..." : "Submit move"}
                    </button>
                    <button onClick={undoMove} disabled={loading || !pendingMove}
                            className="game-btn-primary game-btn-red w-full">
                        Undo
                    </button>
                </Panel>
            )}

            {/* Phase 3: finished */}
            {gameOver && (
                <Panel title="Game over">
                    <div className="game-over-panel !w-full !p-4">
                        <p>Winner</p>
                        <h2 className="!mb-1">{winner === "knotter" ? "Knotter" : "Unknotter"}</h2>
                        <p className="font-semibold">Result: {classification?.is_unknot ? "Unknot" : "Knot"}</p>
                        {classification && (
                            <p className="text-sm text-moss-700">
                                {classification.reason} &middot; {classification.num_crossings} crossings
                            </p>
                        )}
                    </div>
                    <button onClick={resetGame} className="game-btn-primary game-btn-blue game-btn-large w-full">
                        Play again
                    </button>
                </Panel>
            )}
        </>
    );

    return (
        <>
            <BoardLayout
                title="Knotting–Unknotting Game"
                subtitle="Take turns resolving crossings. Knotter wants a knot; Unknotter wants the unknot."
                board={
                    <GameGrid
                        rows={rows}
                        cols={cols}
                        board={[...board]}
                        canMove={gameBegan && !gameOver}
                        setter={wrappedSetter}
                        gameId={gameId}
                        pendingMove={pendingMove}
                        setPendingMove={setPendingMove}
                        setBoardBeforeMove={setBoardBeforeMove}
                    />
                }
                panel={panel}
            />

            {loadBoard && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-forest-900/50 p-4"
                     onClick={() => setLoadBoard(false)}>
                    <div role="dialog" aria-modal="true" aria-label="Load a custom board"
                         className="bg-cream-50 rounded-2xl border border-sage-200 shadow-xl p-6 w-full max-w-xl flex flex-col items-center gap-3"
                         onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-xl font-semibold self-start">Load a custom board</h2>
                        <p className="text-sm text-moss-700 self-start">
                            Paste rows of tile numbers, like [[0, 2, 1], [2, 11, 1], ...]. Use -1 or 11 for unresolved crossings.
                        </p>
                        <KnotInput setter={wrappedSetter} />
                        <button className="btn" onClick={() => setLoadBoard(false)}>Cancel</button>
                    </div>
                </div>
            )}
        </>
    );
}

export default KnottingUnknottingGame;
