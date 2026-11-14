import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/Button";

export function PromotionDialog() {
  const { pendingPromotion, setPendingPromotion, makeMove, turn } = useBoardStore(
    useShallow((s) => ({
      pendingPromotion: s.pendingPromotion,
      setPendingPromotion: s.setPendingPromotion,
      makeMove: s.makeMove,
      turn: s.turn,
    })),
  );

  if (!pendingPromotion) return null;

  const pieces = ['q', 'r', 'b', 'n'] as const;
  
  const handleSelect = (promotion: 'q' | 'r' | 'b' | 'n') => {
    if (pendingPromotion) {
      makeMove(pendingPromotion.from, pendingPromotion.to, promotion);
      setPendingPromotion(null);
    }
  };

  // ChessgroundBoard resets the dragged pawn when pendingPromotion clears.
  const handleCancel = () => {
    setPendingPromotion(null);
  };

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-app-background border border-app-border p-6 rounded-control shadow-soft animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-semibold mb-4 text-center">Promote to</h3>
        <div className="flex gap-4 mb-6">
          {pieces.map(p => (
            <button
              key={p}
              onClick={() => handleSelect(p)}
              className="w-16 h-16 bg-app-soft hover:bg-primary/10 rounded-control border border-app-border flex items-center justify-center text-4xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {/* Very simple placeholder. We can map to actual SVGs if we had them. */}
              {turn === 'white' ? p.toUpperCase() : p}
            </button>
          ))}
        </div>
        <Button fullWidth onClick={handleCancel} size="sm" type="button" variant="outline">
          Cancel
        </Button>
      </div>
    </div>
  );
}
