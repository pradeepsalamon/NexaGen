import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  RotateCw, 
  X,
  SkipBack,
  SkipForward
} from "lucide-react";
import { useBoardStore } from "../../context/BoardProvider";

export function BoardNavigation() {
  const { orientation, setOrientation, reset, undo, redo, permissionMode } = useBoardStore();
  const canModify = permissionMode !== "VIEW_ONLY"; // Or check if coach, etc.

  return (
    <div className="flex items-center justify-center gap-2 mt-4 text-gray-600">
      <NavIconButton icon={<ChevronLeft size={18} />} onClick={undo} disabled={!canModify} />
      <NavIconButton icon={<SkipBack size={16} />} disabled />
      <NavIconButton icon={<ChevronsLeft size={18} />} disabled />
      
      <NavIconButton 
        icon={<RotateCw size={16} />} 
        onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')} 
      />
      
      <NavIconButton icon={<X size={16} />} onClick={reset} disabled={!canModify} />
      
      <NavIconButton icon={<ChevronsRight size={18} />} disabled />
      <NavIconButton icon={<SkipForward size={16} />} disabled />
      <NavIconButton icon={<ChevronRight size={18} />} onClick={redo} disabled={!canModify} />
    </div>
  );
}

function NavIconButton({ icon, onClick, disabled }: { icon: React.ReactNode, onClick?: () => void, disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center bg-white shadow-sm transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 active:bg-gray-100'}
      `}
    >
      {icon}
    </button>
  );
}
