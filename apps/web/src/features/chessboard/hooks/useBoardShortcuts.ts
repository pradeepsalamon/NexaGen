import { useEffect } from "react";
import { useBoardStore } from "../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";

const ARROW_ACTIONS = {
  ArrowRight: "redo",
  ArrowLeft: "undo",
  ArrowUp: "jumpToStart",
  ArrowDown: "jumpToEnd"
} as const;

export function useBoardShortcuts() {
  const {
    undo, redo, jumpToStart, jumpToEnd, setOrientation, orientation,
    isEditingPosition, setEditingPosition
  } = useBoardStore(
    useShallow((s) => ({
      undo: s.undo,
      redo: s.redo,
      jumpToStart: s.jumpToStart,
      jumpToEnd: s.jumpToEnd,
      setOrientation: s.setOrientation,
      orientation: s.orientation,
      isEditingPosition: s.isEditingPosition,
      setEditingPosition: s.setEditingPosition,
    })),
  );
  const { showCoordinates, updatePreference } = useChessAppearance();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      if (e.key in ARROW_ACTIONS && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        // Arrows inside an open dialog or an arrow-driven widget (tabs, sliders, menus) belong to it.
        const target = e.target instanceof Element ? e.target : null;
        if (e.defaultPrevented || target?.closest('[role="dialog"],[role="tablist"],[role="slider"],[role="menu"],[role="listbox"]')) {
          return;
        }
        e.preventDefault();
        const action = ARROW_ACTIONS[e.key as keyof typeof ARROW_ACTIONS];
        ({ undo, redo, jumpToStart, jumpToEnd })[action]();
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
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, jumpToStart, jumpToEnd, setOrientation, orientation, showCoordinates, updatePreference, isEditingPosition, setEditingPosition]);
}
