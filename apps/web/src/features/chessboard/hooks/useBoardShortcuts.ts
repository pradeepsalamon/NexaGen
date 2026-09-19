import { useEffect } from "react";
import { useBoardStore } from "../context/BoardProvider";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";

export function useBoardShortcuts() {
  const {
    undo, redo, setOrientation, orientation,
    isEditingPosition, setEditingPosition
  } = useBoardStore();
  const { showCoordinates, updatePreference } = useChessAppearance();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        }
      } else {
        switch (e.key.toLowerCase()) {
          case 'f':
            setOrientation(orientation === 'white' ? 'black' : 'white');
            break;
          case 'c':
            updatePreference({ showCoordinates: !showCoordinates });
            break;
          case 'escape':
            if (isEditingPosition) {
              setEditingPosition(false);
            }
            break;
          // Arrow keys can be used for history navigation in the future
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, setOrientation, orientation, showCoordinates, updatePreference, isEditingPosition, setEditingPosition]);
}
