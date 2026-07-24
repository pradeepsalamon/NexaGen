import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useBoardStore } from "../../context/BoardProvider";
import { useAuthStore } from "@/stores/authStore";

export function DrawingToolbar() {
  const { activeBrush, setActiveBrush, clearAnnotations } = useBoardStore();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH";

  // Only show drawing tools if coach or if everyone can draw (this can be expanded)
  if (!isCoach) return null; 

  const brushes = [
    { id: 'green', color: 'bg-[#15781B]', label: 'Green' },
    { id: 'red', color: 'bg-[#882020]', label: 'Red' },
    { id: 'blue', color: 'bg-[#003088]', label: 'Blue' },
    { id: 'yellow', color: 'bg-[#e68f00]', label: 'Yellow' }
  ];

  return (
    <div className="flex flex-col gap-2 p-2 bg-background/80 border border-white/10 rounded-lg shadow-lg backdrop-blur-md">
      {brushes.map(b => (
        <button
          key={b.id}
          onClick={() => setActiveBrush(b.id)}
          title={b.label}
          className={`w-8 h-8 rounded-full ${b.color} transition-all duration-200 border-2 ${activeBrush === b.id ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'border-transparent hover:scale-105'}`}
        />
      ))}
      <div className="w-8 h-px bg-white/10 my-1 mx-auto" />
      
      {/* We don't have native annotation undo/redo implemented yet in store, so we mock them */}
      <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full text-muted-foreground hover:text-foreground" title="Clear All Annotations" onClick={clearAnnotations}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
