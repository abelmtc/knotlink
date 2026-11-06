import React, { useState } from 'react';
import './index.css';
import KnotGrid from './components/KnotGrid';
import BoardLayout, { Panel, Field, Segmented } from './components/BoardLayout';

const sizes = Array.from({ length: 25 }, (_, i) => i + 1);

function SizeSelect({ id, value, onChange }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className='select w-full'>
      {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

function MosaicMaker() {
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [resetSignal, setResetSignal] = useState(0);
  const [assembleSignal, setAssembleSignal] = useState(0);
  const [importSignal, setImportSignal] = useState(false);
  const [exportSignal, setExportSignal] = useState(false);

  const panel = (
    <>
      <Panel title='Board'>
        <div className='grid grid-cols-2 gap-3'>
          <Field label='Rows' htmlFor='rows'><SizeSelect id='rows' value={rows} onChange={setRows} /></Field>
          <Field label='Columns' htmlFor='cols'><SizeSelect id='cols' value={cols} onChange={setCols} /></Field>
        </div>
        <Field label='Mode'>
          <Segmented
            label='Mode'
            value={assembleSignal}
            onChange={setAssembleSignal}
            options={[{ value: 0, label: 'Edit' }, { value: 1, label: 'Assemble' }]}
          />
        </Field>
        <p className='text-sm text-moss-700'>
          Click a cell to choose its tile. Double-click to clear it.
        </p>
      </Panel>

      <Panel title='Share'>
        <div className='flex gap-2'>
          <button className='btn flex-1' onClick={() => { setImportSignal(!importSignal); setExportSignal(false); }}>
            Import
          </button>
          <button className='btn flex-1' onClick={() => { setExportSignal(!exportSignal); setImportSignal(false); }}>
            Export
          </button>
        </div>
        <button className='btn btn-danger w-full' onClick={() => setResetSignal((resetSignal + 1) % 2)}>
          Clear board
        </button>
      </Panel>
    </>
  );

  return (
    <BoardLayout
      title='Mosaic Maker'
      subtitle='Build a knot mosaic tile by tile, up to 25 × 25.'
      board={
        <KnotGrid rows={rows} cols={cols} resetSignal={resetSignal} assembleSignal={assembleSignal}
                  setCols={setCols} setRows={setRows} importSignal={importSignal} exportSignal={exportSignal} />
      }
      panel={panel}
    />
  );
}

export default MosaicMaker;
