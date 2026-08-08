import { useEffect, useRef } from "react";
import { useBoardStore } from "../../context/BoardProvider";

export function MoveHistory() {
  const { moveHistory, historyIndex } = useBoardStore();
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
    <div className="flex flex-col h-full bg-background border border-gray-200 dark:border-white/10 rounded-md overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b border-gray-200 dark:border-white/10 text-sm font-semibold flex justify-between items-center">
        <span>Moves</span>
      </div>
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-1 text-sm font-mono"
      >
        {rows.length === 0 && (
          <div className="text-muted-foreground text-center p-4 text-xs">
            No moves yet
          </div>
        )}
        {rows.map((row) => (
          <div key={row.moveNumber} className="flex hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1 rounded transition-colors">
            <span className="w-8 text-muted-foreground">{row.moveNumber}.</span>
            
            <span className={`flex-1 cursor-pointer hover:text-primary transition-colors ${historyIndex === row.whiteIndex ? 'text-primary font-bold' : ''}`}>
              {row.white.san}
            </span>
            
            <span className={`flex-1 cursor-pointer hover:text-primary transition-colors ${row.black ? (historyIndex === row.blackIndex ? 'text-primary font-bold' : '') : ''}`}>
              {row.black ? row.black.san : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
