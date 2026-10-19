import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { SimpleTooltip } from "@/components/ui/Tooltip";

export function DrawingToolbar() {
  const { activeBrush, setActiveBrush, clearAnnotations } = useBoardStore(
    useShallow((s) => ({
      activeBrush: s.activeBrush,
      setActiveBrush: s.setActiveBrush,
      clearAnnotations: s.clearAnnotations,
    })),
  );
  const user = useAuthStore((state) => state.user);
  // Coaches and staff, matching ChessClock, SidebarTabs and MoveHistory.
  if (user?.role !== "COACH" && !isStaffRole(user?.role)) return null;

  const colors = [
    { id: 'green', hex: '#15781B', label: 'Green' },
    { id: 'red', hex: '#882020', label: 'Red (hold Ctrl)' },
    { id: 'blue', hex: '#003088', label: 'Blue (hold Alt)' },
    { id: 'yellow', hex: '#e68f00', label: 'Yellow (hold Shift)' }
  ];

  const handleClear = () => {
    // The board store subscription in `useBoardSync` broadcasts on any
    // annotation change, so an explicit broadcast here would send it twice
    // (AUDIT M29).
    clearAnnotations();
  };

  return (
    <div className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-2 py-1 shadow-card">
      <div className="flex items-center gap-1">
        {colors.map(color => (
          <SimpleTooltip key={color.id} label={color.label} side="top">
              <Button 
                aria-label={`${color.label.split(" ")[0]} brush`}
                aria-pressed={activeBrush === color.id}
                variant="ghost" 
                size="icon"
                onClick={() => setActiveBrush(color.id)}
                className={`w-8 h-8 rounded-full border-2 transition ${
                  activeBrush === color.id 
                    ? 'border-primary scale-110 shadow-card' 
                    : 'border-transparent hover:scale-105'
                }`}
              >
                <div 
                  className="w-4 h-4 rounded-full shadow-inner" 
                  style={{ backgroundColor: color.hex }}
                />
              </Button>
          </SimpleTooltip>
        ))}
        
        <div className="mx-1 h-5 w-px bg-app-border" />
        
        <SimpleTooltip label="Clear all annotations (or left-click the board)" side="top">
            <Button aria-label="Clear annotations" variant="ghost" size="icon" className="w-8 h-8 rounded-full text-app-muted hover:bg-app-danger/10 hover:text-app-danger-ink" onClick={handleClear}>
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
        </SimpleTooltip>
      </div>
    </div>);
}
