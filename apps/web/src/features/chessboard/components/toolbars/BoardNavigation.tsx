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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";

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
    <TooltipProvider>
      <div className="flex items-center justify-center gap-2 mt-4 text-app-muted">
        
        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton icon={<SkipBack className="size-4" />} onClick={jumpToStart} disabled={!canUndo} />
          </TooltipTrigger>
          <TooltipContent>Jump to Start (↓)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton icon={<ChevronLeft className="size-[18px]" />} onClick={undo} disabled={!canUndo} />
          </TooltipTrigger>
          <TooltipContent>Previous Move (←)</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton 
              icon={<PenTool className="size-4" />} 
              onClick={() => setIsDrawingMode(!isDrawingMode)} 
              isActive={isDrawingMode} 
            />
          </TooltipTrigger>
          <TooltipContent>Toggle 1-Click Drawing Mode</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton 
              icon={<RotateCw className="size-4" />} 
              onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')} 
            />
          </TooltipTrigger>
          <TooltipContent>Flip Board</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton icon={<X className="size-4" />} onClick={reset} disabled={!canModify} />
          </TooltipTrigger>
          <TooltipContent>Reset Board</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton icon={<ChevronRight className="size-[18px]" />} onClick={redo} disabled={!canRedo} />
          </TooltipTrigger>
          <TooltipContent>Next Move (→)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton icon={<SkipForward className="size-4" />} onClick={jumpToEnd} disabled={!canRedo} />
          </TooltipTrigger>
          <TooltipContent>Jump to End (↑)</TooltipContent>
        </Tooltip>

      </div>
    </TooltipProvider>
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
