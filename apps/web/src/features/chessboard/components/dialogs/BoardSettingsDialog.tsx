import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { useBoardStore } from "../../context/BoardProvider";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";

interface BoardSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BoardSettingsDialog({ open, onOpenChange }: BoardSettingsDialogProps) {
  const { boardTheme, pieceTheme, showCoordinates, setTheme, setShowCoordinates } = useBoardStore();

  const boardOptions = [
    { label: "Blue", value: "blue" },
    { label: "Brown", value: "brown" },
    { label: "Green", value: "green" },
    { label: "Wood", value: "wood" },
    { label: "Tournament", value: "tournament" }
  ];

  const pieceOptions = [
    { label: "cburnett", value: "cburnett" },
    { label: "Alpha", value: "alpha" },
    { label: "Neo", value: "neo" },
    { label: "Merida", value: "merida" },
    { label: "Lichess", value: "lichess" }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Board Settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="boardTheme" className="text-right">Board</Label>
            <div className="col-span-3">
              <Select 
                id="boardTheme"
                value={boardTheme} 
                onChange={(e) => setTheme(e.target.value, pieceTheme)}
                options={boardOptions}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="pieceTheme" className="text-right">Pieces</Label>
            <div className="col-span-3">
              <Select 
                id="pieceTheme"
                value={pieceTheme} 
                onChange={(e) => setTheme(boardTheme, e.target.value)}
                options={pieceOptions}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="coordinates" className="text-right">Coordinates</Label>
            <div className="col-span-3 flex items-center space-x-2">
              <Checkbox 
                id="coordinates" 
                checked={showCoordinates} 
                onCheckedChange={(c) => setShowCoordinates(c === true)} 
              />
              <Label htmlFor="coordinates" className="font-normal cursor-pointer">
                Show board coordinates
              </Label>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
