import type { BoardThemeId, PieceSetId, PieceSetMeta } from "@nexa-chess/types";
import { cn } from "@/lib/utils";
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
          <button
            key={set.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(set.id)}
            className={cn(
              "flex flex-col gap-2 rounded-app border-2 p-2.5 text-left transition",
              isSelected
                ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
                : "border-app-border hover:border-[color-mix(in_srgb,var(--color-primary)_35%,var(--color-border))]",
            )}
          >
            <ThemePreviewBoard boardThemeId={boardThemeId} pieceSetId={set.id} />
            <div>
              <p className="text-sm font-semibold text-app-text">{set.name}</p>
              <p className="text-xs text-app-muted">{set.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
