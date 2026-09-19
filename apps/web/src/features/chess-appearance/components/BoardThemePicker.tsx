import type { BoardThemeId, BoardThemeMeta, PieceSetId } from "@nexa-chess/types";
import { cn } from "@/lib/utils";
import { ThemePreviewBoard } from "./ThemePreviewBoard";

interface BoardThemePickerProps {
  themes: BoardThemeMeta[];
  /** The currently-selected piece set, so previews show "your pieces on this board." */
  pieceSetId: PieceSetId;
  selectedId: BoardThemeId;
  onSelect: (id: BoardThemeId) => void;
}

export function BoardThemePicker({ themes, pieceSetId, selectedId, onSelect }: BoardThemePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {themes.map((theme) => {
        const isSelected = theme.id === selectedId;
        return (
          <button
            key={theme.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(theme.id)}
            className={cn(
              "flex flex-col gap-2 rounded-app border-2 p-2.5 text-left transition",
              isSelected
                ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
                : "border-app-border hover:border-[color-mix(in_srgb,var(--color-primary)_35%,var(--color-border))]",
            )}
          >
            <ThemePreviewBoard boardThemeId={theme.id} pieceSetId={pieceSetId} />
            <div>
              <p className="text-sm font-semibold text-app-text">{theme.name}</p>
              <p className="text-xs text-app-muted">{theme.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
