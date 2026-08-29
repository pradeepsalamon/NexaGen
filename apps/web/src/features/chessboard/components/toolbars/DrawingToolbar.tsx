import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useBoardStore } from "../../context/BoardProvider";
import { useAuthStore } from "@/stores/authStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";

export function DrawingToolbar() {
  const { activeBrush, setActiveBrush, clearAnnotations } = useBoardStore();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH";

  // Only show drawing tools if coach or if everyone can draw (this can be expanded)
  if (!isCoach) return null; 

  const colors = [
    { id: 'green', hex: '#15781B', label: 'Green' },
    { id: 'red', hex: '#882020', label: 'Red' },
    { id: 'blue', hex: '#003088', label: 'Blue' },
    { id: 'yellow', hex: '#e68f00', label: 'Yellow' }
  ];

  const handleClear = () => {
    // The board store subscription in `useBoardSync` broadcasts on any
    // annotation change, so an explicit broadcast here would send it twice
    // (AUDIT M29).
    clearAnnotations();
  };

  return (
    <div className="flex flex-col gap-2 p-2 bg-white dark:bg-slate-900 shadow-sm border border-gray-200 dark:border-slate-800 rounded-lg">
      <div className="flex flex-col gap-1">
        {colors.map(color => (
          <Tooltip key={color.id}>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setActiveBrush(color.id)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  activeBrush === color.id 
                    ? 'border-blue-500 scale-110 shadow-sm' 
                    : 'border-transparent hover:scale-105'
                }`}
              >
                <div 
                  className="w-4 h-4 rounded-full shadow-inner" 
                  style={{ backgroundColor: color.hex }}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {color.label}
            </TooltipContent>
          </Tooltip>
        ))}
        
        <div className="w-full h-px bg-gray-200 dark:bg-slate-800 my-1" />
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30" onClick={handleClear}>
              <Trash2 size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            Clear all annotations
          </TooltipContent>
        </Tooltip>
      </div>
    </div>);
}
