import React from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  RotateCw, 
  X,
  SkipBack,
  SkipForward
} from "lucide-react";
import { useBoardStore } from "../../context/BoardProvider";
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
    moveHistory 
  } = useBoardStore();
  
  const canModify = permissionMode !== "VIEW_ONLY"; 
  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < moveHistory.length - 1;

  return (
    <TooltipProvider>
      <div className="flex items-center justify-center gap-2 mt-4 text-gray-600">
        
        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton icon={<SkipBack size={16} />} onClick={jumpToStart} disabled={!canUndo} />
          </TooltipTrigger>
          <TooltipContent>Jump to Start</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton icon={<ChevronLeft size={18} />} onClick={undo} disabled={!canUndo} />
          </TooltipTrigger>
          <TooltipContent>Previous Move</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton 
              icon={<RotateCw size={16} />} 
              onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')} 
            />
          </TooltipTrigger>
          <TooltipContent>Flip Board</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton icon={<X size={16} />} onClick={reset} disabled={!canModify} />
          </TooltipTrigger>
          <TooltipContent>Reset Board</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton icon={<ChevronRight size={18} />} onClick={redo} disabled={!canRedo} />
          </TooltipTrigger>
          <TooltipContent>Next Move</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <NavIconButton icon={<SkipForward size={16} />} onClick={jumpToEnd} disabled={!canRedo} />
          </TooltipTrigger>
          <TooltipContent>Jump to End</TooltipContent>
        </Tooltip>

      </div>
    </TooltipProvider>
  );
}

const NavIconButton = React.forwardRef<HTMLButtonElement, { icon: React.ReactNode, onClick?: () => void, disabled?: boolean }>(
  ({ icon, onClick, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center bg-white shadow-sm transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 active:bg-gray-100'}
        `}
        {...props}
      >
        {icon}
      </button>
    );
  }
);
NavIconButton.displayName = "NavIconButton";
