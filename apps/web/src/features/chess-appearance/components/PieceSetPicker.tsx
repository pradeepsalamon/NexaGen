import type { BoardThemeId, PieceSetId, PieceSetMeta } from "@nexa-chess/types";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
import { ThemePreviewBoard } from "./ThemePreviewBoard";

interface PieceSetPickerProps {
  pieceSets: PieceSetMeta[];
  /** The currently-selected board theme, so previews show "this set on your board." */
  boardThemeId: BoardThemeId;
  selectedId: PieceSetId;
  onSelect: (id: PieceSetId) => void;
}

export function PieceSetPicker({ pieceSets, boardThemeId, selectedId, onSelect }: PieceSetPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {pieceSets.map((set) => {
        const isSelected = set.id === selectedId;
        return (
          <ChoiceTile
            key={set.id}
            selected={isSelected}
            onClick={() => onSelect(set.id)}
            className="flex flex-col gap-2"
          >
            <ThemePreviewBoard boardThemeId={boardThemeId} pieceSetId={set.id} />
            <div>
              <p className="text-sm font-semibold text-app-text">{set.name}</p>
              <p className="text-xs text-app-muted">{set.description}</p>
            </div>
          </ChoiceTile>
        );
      })}
    </div>
  );
}
