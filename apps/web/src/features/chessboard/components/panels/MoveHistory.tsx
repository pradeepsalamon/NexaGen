import { useEffect, useRef } from "react";
import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";

export function MoveHistory() {
  const { moveHistory, historyIndex, jumpToPly } = useBoardStore(
    useShallow((s) => ({
      moveHistory: s.moveHistory,
      historyIndex: s.historyIndex,
      jumpToPly: s.jumpToPly,
    })),
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moveHistory]);

  const rows = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    rows.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      whiteIndex: i,
      black: i + 1 < moveHistory.length ? moveHistory[i + 1] : null,
      blackIndex: i + 1
    });
  }

  return (
    <div className="flex flex-col h-full bg-app-background border border-app-border rounded-control overflow-hidden">
      <div className="bg-app-soft px-4 py-2 border-b border-app-border text-sm font-semibold flex justify-between items-center">
        <span>Moves</span>
      </div>
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-1 text-sm font-mono"
      >
        {rows.length === 0 && (
          <div className="text-app-muted text-center p-4 text-xs">
            No moves yet
          </div>
        )}
        {rows.map((row) => (
          <div key={row.moveNumber} className="flex hover:bg-app-soft px-2 py-1 rounded transition-colors">
            <span className="w-8 text-app-muted">{row.moveNumber}.</span>
            
            <span
              role="button"
              tabIndex={0}
              onClick={() => jumpToPly(row.whiteIndex)}
              className={`flex-1 cursor-pointer hover:text-primary-ink transition-colors ${historyIndex === row.whiteIndex ? 'text-primary-ink font-bold' : ''}`}
            >
              {row.white.san}
            </span>
            
            {row.black && (
              <span
                role="button"
                tabIndex={0}
                onClick={() => jumpToPly(row.blackIndex)}
                className={`flex-1 cursor-pointer hover:text-primary-ink transition-colors ${historyIndex === row.blackIndex ? 'text-primary-ink font-bold' : ''}`}
              >
                {row.black.san}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
