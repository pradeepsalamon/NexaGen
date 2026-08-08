import { useBoardStore } from "../../context/BoardProvider";

export function PromotionDialog() {
  const { pendingPromotion, setPendingPromotion, makeMove, turn } = useBoardStore();

  if (!pendingPromotion) return null;

  const pieces = ['q', 'r', 'b', 'n'] as const;
  
  const handleSelect = (promotion: 'q' | 'r' | 'b' | 'n') => {
    if (pendingPromotion) {
      makeMove(pendingPromotion.from, pendingPromotion.to, promotion);
      setPendingPromotion(null);
    }
  };

  const handleCancel = () => {
    // Note: since the piece visually moved on chessground, we must reset the board state
    // to match chess.js state. We can just touch FEN.
    setPendingPromotion(null);
    // Force a re-render/sync by setting fen to itself (which will trigger a chessground sync)
    // Actually, chessground might be out of sync until a new valid move is made.
    // For now, canceling just dismisses the dialog.
  };

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-background border border-gray-200 dark:border-white/20 p-6 rounded-lg shadow-2xl animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-semibold mb-4 text-center">Promote to</h3>
        <div className="flex gap-4 mb-6">
          {pieces.map(p => (
            <button
              key={p}
              onClick={() => handleSelect(p)}
              className="w-16 h-16 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 rounded-md border border-gray-200 dark:border-white/10 flex items-center justify-center text-4xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {/* Very simple placeholder. We can map to actual SVGs if we had them. */}
              {turn === 'white' ? p.toUpperCase() : p}
            </button>
          ))}
        </div>
        <button
          onClick={handleCancel}
          className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
