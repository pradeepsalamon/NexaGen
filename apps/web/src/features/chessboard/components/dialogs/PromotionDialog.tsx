import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { PromotionPicker } from "./PromotionPicker";

/** The board store's promotion prompt, drawn with the shared `PromotionPicker`. */
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

  return (
    <PromotionPicker
      color={turn === "black" ? "black" : "white"}
      onSelect={(piece) => {
        makeMove(pendingPromotion.from, pendingPromotion.to, piece);
        setPendingPromotion(null);
      }}
      // ChessgroundBoard resets the dragged pawn when pendingPromotion clears.
      onCancel={() => setPendingPromotion(null)}
    />
  );
}
