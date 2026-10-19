import React from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  RotateCw, 
  X,
  SkipBack,
  SkipForward,
  PenTool
} from "lucide-react";
import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { SimpleTooltip } from "@/components/ui/Tooltip";

export function BoardNavigation() {
  const { 
    orientation, 
    setOrientation, 
    reset, 
    undo, 
    redo, 
    jumpToStart, 
    jumpToEnd, 
    permissionMode,
    historyIndex,
    moveHistory,
    isDrawingMode,
    setIsDrawingMode
  } = useBoardStore(
    useShallow((s) => ({
      orientation: s.orientation,
      setOrientation: s.setOrientation,
      reset: s.reset,
      undo: s.undo,
      redo: s.redo,
      jumpToStart: s.jumpToStart,
      jumpToEnd: s.jumpToEnd,
      permissionMode: s.permissionMode,
      historyIndex: s.historyIndex,
      moveHistory: s.moveHistory,
      isDrawingMode: s.isDrawingMode,
      setIsDrawingMode: s.setIsDrawingMode,
    })),
  );
  
  const canModify = permissionMode !== "VIEW_ONLY"; 
  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < moveHistory.length - 1;

  return (
    <div className="flex items-center justify-center gap-2 mt-4 text-app-muted">
      <SimpleTooltip label="Jump to start (↑)">
        <NavIconButton aria-label="Jump to start" icon={<SkipBack className="size-4" />} onClick={jumpToStart} disabled={!canUndo} />
      </SimpleTooltip>
      <SimpleTooltip label="Previous move (←)">
        <NavIconButton aria-label="Previous move" icon={<ChevronLeft className="size-[18px]" />} onClick={undo} disabled={!canUndo} />
      </SimpleTooltip>
      <SimpleTooltip label="Toggle 1-click drawing mode">
        <NavIconButton aria-label="Toggle drawing mode" icon={<PenTool className="size-4" />} onClick={() => setIsDrawingMode(!isDrawingMode)} isActive={isDrawingMode} />
      </SimpleTooltip>
      <SimpleTooltip label="Flip board">
        <NavIconButton aria-label="Flip board" icon={<RotateCw className="size-4" />} onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')} />
      </SimpleTooltip>
      <SimpleTooltip label="Reset board">
        <NavIconButton aria-label="Reset board" icon={<X className="size-4" />} onClick={reset} disabled={!canModify} />
      </SimpleTooltip>
      <SimpleTooltip label="Next move (→)">
        <NavIconButton aria-label="Next move" icon={<ChevronRight className="size-[18px]" />} onClick={redo} disabled={!canRedo} />
      </SimpleTooltip>
      <SimpleTooltip label="Jump to end (↓)">
        <NavIconButton aria-label="Jump to end" icon={<SkipForward className="size-4" />} onClick={jumpToEnd} disabled={!canRedo} />
      </SimpleTooltip>
    </div>
  );
}

export const NavIconButton = React.forwardRef<HTMLButtonElement, { icon: React.ReactNode, onClick?: () => void, disabled?: boolean, isActive?: boolean, "aria-label"?: string }>(
  ({ icon, onClick, disabled, isActive, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-8 h-8 rounded-full border flex items-center justify-center shadow-card transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed border-app-border bg-app-surface' : 
            isActive 
              ? 'border-primary bg-primary/10 text-primary-ink' 
              : 'border-app-border bg-app-surface hover:bg-app-soft active:bg-app-soft'}
        `}
        {...props}
      >
        {icon}
      </button>
    );
  }
);
NavIconButton.displayName = "NavIconButton";
