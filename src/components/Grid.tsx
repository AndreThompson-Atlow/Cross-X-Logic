import React from 'react';
import { GridPuzzle } from '../lib/engine';

export type SelectionState = { type: 'row' | 'col', index: number } | { type: 'cell', r: number, c: number } | null;

interface GridProps {
  puzzle: GridPuzzle;
  discoveredCells: boolean[][];
  revealedCypher: Record<string, number>;
  selection: SelectionState;
  onSelect: (selection: SelectionState) => void;
}

export const Grid: React.FC<GridProps> = ({ puzzle, discoveredCells, revealedCypher, selection, onSelect }) => {
  const { size, operators } = puzzle;

  return (
    <div className="p-4 md:p-8 border border-border bg-bg/50 backdrop-blur-sm self-center max-w-full overflow-x-auto select-none">
      <div 
        className="grid gap-2 md:gap-4 items-center justify-items-center"
        style={{ 
          gridTemplateColumns: `auto repeat(${size * 2 - 1}, minmax(max-content, auto))`,
          gridTemplateRows: `auto repeat(${size * 2 - 1}, minmax(max-content, auto))`
        }}
      >
        {/* Top-left empty corner */}
        <div />

        {/* Column Headers */}
        {Array.from({ length: size * 2 - 1 }).map((_, c) => {
          if (c % 2 !== 0) return <div key={`col-hdr-empty-${c}`} />;
          const colIdx = c / 2;
          const isSelected = selection?.type === 'col' && selection.index === colIdx;
          return (
            <button
              key={`col-hdr-${colIdx}`}
              onClick={() => onSelect({ type: 'col', index: colIdx })}
              className={`w-10 sm:w-12 md:w-14 lg:w-16 h-8 flex items-center justify-center font-mono text-xs sm:text-sm font-bold border transition-colors cursor-pointer
                ${isSelected ? 'bg-accent text-bg border-accent' : 'bg-transparent text-text-dim border-transparent hover:border-text-dim/50'}
              `}
            >
              C{colIdx + 1}
            </button>
          );
        })}

        {/* Grid Cells */}
        {Array.from({ length: size * 2 - 1 }).map((_, r) => {
          
          const isRowColHdr = r % 2 === 0;
          const rowIdx = r / 2;
          const isRowSelected = selection?.type === 'row' && selection.index === rowIdx;

          return (
            <React.Fragment key={`row-wrap-${r}`}>
              {/* Row Header */}
              {isRowColHdr ? (
                <button
                  onClick={() => onSelect({ type: 'row', index: rowIdx })}
                  className={`h-10 sm:h-12 md:h-14 lg:h-16 w-8 sm:w-12 flex items-center justify-center font-mono text-xs sm:text-sm font-bold border transition-colors cursor-pointer
                    ${isRowSelected ? 'bg-accent text-bg border-accent' : 'bg-transparent text-text-dim border-transparent hover:border-text-dim/50'}
                  `}
                >
                  R{rowIdx + 1}
                </button>
              ) : <div />}

              {/* Row Content */}
              {Array.from({ length: size * 2 - 1 }).map((_, c) => {
                const isLetterCell = r % 2 === 0 && c % 2 === 0;
                const isRowOpCell = r % 2 === 0 && c % 2 === 1;
                const isColOpCell = r % 2 === 1 && c % 2 === 0;

                if (isLetterCell) {
                  const rIdx = r / 2;
                  const cIdx = c / 2;
                  const isDiscovered = discoveredCells[rIdx][cIdx];
                  const actualLetter = puzzle.letters[rIdx][cIdx];
                  const val = isDiscovered && actualLetter in revealedCypher ? revealedCypher[actualLetter] : null;
                  
                  const isCellSelected = selection?.type === 'cell' && selection.r === rIdx && selection.c === cIdx;
                  const isPartOfSelectionRow = selection?.type === 'row' && selection.index === rIdx;
                  const isPartOfSelectionCol = selection?.type === 'col' && selection.index === cIdx;
                  const isHighlighted = isCellSelected || isPartOfSelectionRow || isPartOfSelectionCol;

                  return (
                    <button
                      key={`cell-${r}-${c}`}
                      onClick={() => {
                        if (selection?.type === 'cell' && selection.r === rIdx && selection.c === cIdx) {
                          onSelect({ type: 'row', index: rIdx });
                        } else if (selection?.type === 'row' && selection.index === rIdx) {
                          onSelect({ type: 'col', index: cIdx });
                        } else if (selection?.type === 'col' && selection.index === cIdx) {
                          onSelect({ type: 'cell', r: rIdx, c: cIdx });
                        } else {
                          onSelect({ type: 'cell', r: rIdx, c: cIdx });
                        }
                      }}
                      className={`relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 flex items-center justify-center text-center text-lg sm:text-xl md:text-2xl font-bold font-mono border-2 transition-all outline-none cursor-pointer
                        ${isDiscovered ? 'text-text' : 'text-transparent'}
                        ${isCellSelected ? 'border-accent bg-accent/20 ring-2 ring-accent ring-offset-2 ring-offset-bg' : 
                          isHighlighted ? 'border-accent/50 bg-accent/10' : 
                          isDiscovered ? 'border-white/20 bg-white/5' : 'border-border bg-black/20 hover:border-text-dim/50'}
                      `}
                    >
                      {isDiscovered ? actualLetter : ''}
                      
                      {isDiscovered && val !== null && (
                        <div className="absolute -bottom-1 -right-1 bg-accent text-bg font-mono text-[10px] font-bold px-1 rounded border border-bg z-10 shadow">
                          {val}
                        </div>
                      )}
                    </button>
                  );
                }

                if (isRowOpCell) {
                  const op = operators.rows[r / 2][(c - 1) / 2];
                  return (
                    <div key={`op-${r}-${c}`} className="flex items-center justify-center p-0">
                      <span className={`text-xl md:text-2xl font-bold ${['=', '<', '>'].includes(op) ? 'text-accent' : 'text-text-dim'} font-mono opacity-80`}>
                        {op}
                      </span>
                    </div>
                  );
                }

                if (isColOpCell) {
                  const op = operators.cols[c / 2][(r - 1) / 2];
                  return (
                    <div key={`op-${r}-${c}`} className="flex items-center justify-center p-0">
                      <span className={`text-xl md:text-2xl font-bold ${['=', '<', '>'].includes(op) ? 'text-accent' : 'text-text-dim'} font-mono opacity-80`}>
                        {op}
                      </span>
                    </div>
                  );
                }

                return <div key={`empty-${r}-${c}`} className="w-1 h-1" />;
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
