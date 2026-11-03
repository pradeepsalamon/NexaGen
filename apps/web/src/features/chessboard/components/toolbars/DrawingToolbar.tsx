import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useBoardStore } from "../../context/BoardProvider";
import { ARROW_BRUSH_COLORS } from "../../lib/drawBrushes";
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
    { id: 'green', hex: ARROW_BRUSH_COLORS.green, label: 'Green' },
    { id: 'red', hex: ARROW_BRUSH_COLORS.red, label: 'Red (hold Ctrl)' },
    { id: 'blue', hex: ARROW_BRUSH_COLORS.blue, label: 'Blue (hold Alt)' },
    { id: 'yellow', hex: ARROW_BRUSH_COLORS.yellow, label: 'Yellow (hold Shift)' }
  ];

  const handleClear = () => {
    // The board store subscription in `useBoardSync` broadcasts on any
    // annotation change, so an explicit broadcast here would send it twice
    // (AUDIT M29).
    clearAnnotations();
  };

  return (
    <div className="flex items-center gap-2 rounded-control border border-app-border bg-app-surface px-2 py-1 shadow-card">
      <div className="flex items-center gap-1">
        {colors.map(color => (
          <SimpleTooltip key={color.id} label={color.label} side="top">
              <Button 
                aria-label={`${color.label.split(" ")[0]} brush`}
                aria-pressed={activeBrush === color.id}
                variant="neutral"
                size="icon"
                onClick={() => setActiveBrush(color.id)}
                className={`size-8 border-2 ${
                  activeBrush === color.id
                    ? "border-primary bg-primary/10"
                    : "border-transparent bg-transparent"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="size-4 rounded-full ring-1 ring-app-border"
                  style={{ backgroundColor: color.hex }}
                />
              </Button>
          </SimpleTooltip>
        ))}
        
        <div className="mx-1 h-5 w-px bg-app-border" />
        
        <SimpleTooltip label="Clear all annotations (or left-click the board)" side="top">
            <Button aria-label="Clear annotations" variant="neutral" size="icon" className="size-8 border-transparent bg-transparent text-app-muted hover:text-app-danger-ink" onClick={handleClear}>
              <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
        </SimpleTooltip>
      </div>
    </div>);
}
