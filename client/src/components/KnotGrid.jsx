import '../App.css'
import React, { useEffect } from "react";
import { useState } from 'react';
import KnotInput from './KnotInput';

// TODO: Add import and export buttons
function KnotGrid({ rows, cols, resetSignal, assembleSignal, 
                    setCols, setRows, importSignal, exportSignal }) {
  // State
  const [cells, setCells] = useState(Array.from({ length: rows * cols }, () => 0))
  const [currCell, setCurrCell] = useState(-1)
  const [showSelection, setShowSelection] = useState(false)

  /////////////////////////////////////////////////////////////////////////////
  // Effects and grid changing

  // Keeps the grid data the same while updating size
  const updateOnColChange = () => {
    const oldcols = cells.length / rows
    const tmp = Array.from({ length: rows * cols }, () => 0)
    if (oldcols < cols) {
      for (var i = 0; i < rows; i++) {
        for (var j = 0; j < oldcols; j++) {
          tmp[cols * i + j] = cells[oldcols * i + j]
        }
      }
    } else {
      for (var i = 0; i < rows; i++) {
        for (var j = 0; j < cols; j++) {
          tmp[cols * i + j] = cells[oldcols * i + j]
        }
      }
    }
    setCells(tmp)
  }

  const updateOnRowChange = () => {
    const oldrows = cells.length / cols
    if (oldrows < rows) {
      const tmp = [...cells]
      for (var i = 0; i < (rows - oldrows) * cols; i++) {
        tmp.push(0)
      }
      setCells(tmp)
    } else {
      const tmp = Array.from({ length: rows * cols }, () => 0)
      for (var i = 0; i < rows; i++) {
        for (var j = 0; j < cols; j++) {
          tmp[cols * i + j] = cells[cols * i + j]
        }
      }
      setCells(tmp)
    }
  }

  // Update grid if rows change
  useEffect(() => {
    updateOnRowChange()
    setShowSelection(false)
    setCurrCell(-1)
  }, [rows])

  // Update grid if cols change
  useEffect(() => {
    updateOnColChange()
    setShowSelection(false)
    setCurrCell(-1)
  }, [cols])

  // Reset if resetSignal is updated
  useEffect(() => {
    setCells(Array.from({ length: rows * cols }, () => 0))
    setShowSelection(false)
    setCurrCell(-1)
  }, [resetSignal])

  // Hide selection if assembleSignal is updated
  useEffect(() => {
    setShowSelection(false)
    setCurrCell(-1)
  }, [assembleSignal])

  // Passed to KnotInput to set cell data
  const wrappedSetter = (_cells, _rows, _cols) => {
    setRows(_rows)
    setCols(_cols)
    setCells(_cells)
  }

  const getStringRep = () => {
    let res = "["
    for (let i = 0; i < rows; i++) {
      res += "["
      for (let j = 0; j < cols - 1; j++) {
        res += cells[i * cols + j] + ", "
      }
      res += cells[i * cols + cols - 1] + "]"
      res += i === rows - 1 ? "" : "\n" 
    }
    res += "]"
    return res
  }

  /////////////////////////////////////////////////////////////////////////////

  // Create list of images
  const bgImages = Array.from({ length: 10 }, (_, i) => `/images/T_${i + 1}.PNG`)
  bgImages.push("/images/T_11.jpg")
  const gap = assembleSignal === 0 ? "0.5rem" : "0rem";

  // Display grid
  return (
    <div className="grid-wrapper board-fit text-forest-900 flex flex-col mb-4" style={{ '--cols': cols, '--gap': gap }}>
      {importSignal && 
      <div className="flex flex-col mb-4 items-center w-full">
        <KnotInput setter={wrappedSetter} />
      </div>}
      {exportSignal && 
      <div className="flex flex-col mb-4 items-center w-full">
        <textarea id="input-box" rows={8} cols={60} value={getStringRep()}
                readOnly aria-label="Exported board mosaic data"
                className="w-full max-w-full min-w-0 border border-sage-400 rounded-lg bg-cream-50 p-3 caret-transparent"
        >
        </textarea>  
      </div>}
      <div className="grid"
           role="grid" 
           aria-label={`${rows} by ${cols} grid`}
           style={{
            'gridTemplateColumns': `repeat(${cols}, var(--cell))`,
            'gridTemplateRows': `repeat(${rows}, var(--cell))`,
            'gap': `${gap}`,
           }}
      >
        {cells.map((_, i) => {
          const bgStyle = cells[i] === 0
            ? {}
            : {
              backgroundImage: `url(${bgImages[cells[i] - 1]})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            };
          
          return (
            <div 
              key={i} 
              className="cell" 
              role="gridcell"
              style={bgStyle}
              onClick={() => {
                setCurrCell(i);
                setShowSelection(!showSelection && (assembleSignal === 0));
              }}
              onDoubleClick={() => {
                setCurrCell(i);

                // Update cells
                if (assembleSignal === 0) {
                  const newCells = [...cells];
                  newCells[currCell] = 0;
                  setCells(newCells);
                }
              }}
          /> 
          )
        })}
      </div>
      {showSelection && 
        <div onClick={() => {setShowSelection(false)}} className='mt-4'>
          <p>Select a tile:</p>
          <div className="grid p-4 border rounded-lg bg-sage-100"
               role="grid"
               style={{
                 '--cell': 'min(4rem, calc((100cqw - 2rem - 2px) / 5))',
                 'gridTemplateColumns': `repeat(5, var(--cell))`,
                 'gridTemplateRows': `repeat(3, var(--cell))`
              }}
            >
              {Array.from({ length: 11 }).map((_, i) => { /* TODO: ADD HANDLING FOR T_11 */
                const bgStyle = i === 10
                  ? {
                    gridColumn: "3",
                    gridRow: "3",
                  }
                  : {
                    backgroundImage: `url(${bgImages[i]})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  };
                
                return (
                  <div 
                    key={i} 
                    className="cell" 
                    role="gridcell"
                    style={bgStyle}
                    onClick={() => {
                      // Update cells
                      const newCells = [...cells];
                      newCells[currCell] = i + 1;
                      setCells(newCells);

                      // Hide selection pannel
                      setCurrCell(-1);
                      setShowSelection(false);
                    }}
                /> 
                )
              })}
            </div>
        </div>}
        {!showSelection && 
        <div className='h-[266px]'></div>}
    </div>
  )
}

export default KnotGrid
