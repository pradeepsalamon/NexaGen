import type { BoardThemeId, BoardThemeMeta, PieceSetId } from "@nexa-chess/types";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
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
          <ChoiceTile
            key={theme.id}
            selected={isSelected}
            onClick={() => onSelect(theme.id)}
            className="flex flex-col gap-2"
          >
            <ThemePreviewBoard boardThemeId={theme.id} pieceSetId={pieceSetId} />
            <div>
              <p className="text-sm font-semibold text-app-text">{theme.name}</p>
              <p className="text-xs text-app-muted">{theme.description}</p>
            </div>
          </ChoiceTile>
        );
      })}
    </div>
  );
}
