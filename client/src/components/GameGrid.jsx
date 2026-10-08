import '../App.css'
import React, { useEffect, useState } from "react";
import './GameStyles.css';

function GameGrid({ board, rows, cols, canMove, pendingMove, setPendingMove }) {
  // State
  const cells = board
  const [currCell, setCurrCell] = useState(-1)
  const [showSelection, setShowSelection] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
  if (canMove) {
    setError(null)
  }
}, [canMove])

  // Create list of images
  const bgImages = Array.from({ length: 10 }, (_, i) => `/images/T_${i + 1}.PNG`)
  bgImages.push("/images/T_11.jpg")
  const moves = Array.from({ length: 2 }, (_, i) => `/images/T_${9 + i}.PNG`)

  // Handle cell click
  const handleCellClick = (index) => {
    if (!canMove) {
      setError("Game has not started");
      return;
    }

    if (pendingMove !== null) {
      setError("You already have a pending move. Submit it before making another move.");
      return;
    }

    if (cells[index] !== 11) {
      setError("Can only modify unresolved crossings");
      return;
    }

    setCurrCell(index);
    setShowSelection(true);
    setError(null);
  };

  // Selection is local. The parent commits it only when Submit Move is pressed.
  const handleTileSelect = (tileValue) => {
    if (!canMove || currCell === -1 || pendingMove) return;
    setPendingMove({
      row: Math.floor(currCell / cols),
      col: currCell % cols,
      tileValue,
    });
    setCurrCell(-1);
    setShowSelection(false);
    setError(null);
  };

  const displayCells = cells.map((tile, index) =>
    pendingMove && index === pendingMove.row * cols + pendingMove.col
      ? pendingMove.tileValue : tile
  );

  // Display grid
  return (
    <div className="grid-wrapper text-black flex flex-col mb-4">
      {/* Error display */}
      {error && (
        <div className="game-alert game-alert-error">
          {error}
        </div>
      )}

      {/* Grid */}
      <div className="grid" 
           role="grid" 
           aria-label={`${rows} by ${cols} grid`}
           style={{
            'gridTemplateColumns': `repeat(${cols}, 4rem)`,
            'gridTemplateRows': `repeat(${rows}, 4rem)`,
            'gap': 0,
           }}
      >
        {displayCells.map((cell, i) => {
          const bgStyle = cell === 0
            ? {}
            : {
              backgroundImage: `url(${bgImages[cell - 1]})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            };
          
          // Unresolved crossing (11 maps to -1 in backend)
          if (cells[i] === 11) {
            const isPendingCell = pendingMove !== null && (pendingMove.row * cols + pendingMove.col) === i;
            const isBlocked = pendingMove !== null && !isPendingCell;
            return (
                <div 
                    key={i} 
                    className={`game-playable-cell ${isBlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isPendingCell ? 'game-playable-cell-selected' : ''}`}
                    role="gridcell"
                    style={bgStyle}
                    onClick={() => !isBlocked && handleCellClick(i)}
                    title={isBlocked ? "Submit or undo your current move first" : "Click to resolve this crossing"}
                />
            )
          }
          
          // Other tiles (non-playable)
          return (
            <div 
              key={i} 
              className='game-nonplayable-cell' 
              role="gridcell"
              style={bgStyle}
          /> 
          )
        })}
      </div>

      {/* Tile selection panel */}
      {showSelection && 
        <div style={{marginTop: '16px'}}>
          <p style={{textAlign: 'center', marginBottom: '8px', fontWeight: '600', fontSize: '1.125rem'}}>
            Select a resolution for the crossing:
          </p>
          <div className="tile-selection-panel">
            <div className="tile-selection-grid">
              {Array.from({ length: 2 }).map((_, i) => {
                const bgStyle = {
                    backgroundImage: `url(${moves[i]})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  };
                
                return (
                  <div 
                    key={i} 
                    className="cell tile-option" 
                    role="gridcell"
                    style={bgStyle}
                    onClick={() => handleTileSelect(i + 9)}
                    title={i === 0 ? "Tile 9" : "Tile 10"}
                /> 
                )
              })}
            </div>
          </div>
            <button 
              onClick={() => {
                setShowSelection(false);
                setCurrCell(-1);
              }}
              className="game-btn-primary game-btn-gray"
              style={{marginTop: '16px', marginLeft: 'auto', marginRight: 'auto', display: 'block'}}
            >
              Cancel
            </button>
        </div>
      }
      
      {/* Spacer when selection panel is hidden */}
      {!showSelection && 
        <div className='h-[200px]'></div>
      }
    </div>
  )
}

export default GameGrid;
