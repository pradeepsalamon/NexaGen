import type { ChessAppearance } from "@nexa-chess/types";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";

const ORIENTATION_OPTIONS = [
  { label: "White at bottom", value: "white" },
  { label: "Black at bottom", value: "black" },
  { label: "Auto (current player)", value: "auto" },
];

interface AppearanceTogglesFormProps {
  draft: ChessAppearance;
  onChange: (patch: Partial<ChessAppearance>) => void;
}

export function AppearanceTogglesForm({ draft, onChange }: AppearanceTogglesFormProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="board-orientation">Board orientation</Label>
        <Select
          id="board-orientation"
          value={draft.boardOrientation}
          onChange={(e) => onChange({ boardOrientation: e.target.value as ChessAppearance["boardOrientation"] })}
          options={ORIENTATION_OPTIONS}
        />
      </div>

      <div className="flex flex-col justify-end gap-2.5">
        <Switch
          id="show-coordinates"
          label="Show coordinates"
          checked={draft.showCoordinates}
          onCheckedChange={(c) => onChange({ showCoordinates: c === true })}
        />
        <Switch
          id="animation-enabled"
          label="Piece movement animation"
          checked={draft.animationEnabled}
          onCheckedChange={(c) => onChange({ animationEnabled: c === true })}
        />
        <Switch
          id="legal-moves-enabled"
          label="Show legal moves"
          checked={draft.legalMovesEnabled}
          onCheckedChange={(c) => onChange({ legalMovesEnabled: c === true })}
        />
        <Switch
          id="highlight-enabled"
          label="Show last move + selection highlight"
          checked={draft.highlightEnabled}
          onCheckedChange={(c) => onChange({ highlightEnabled: c === true })}
        />
        <Switch
          id="check-indicator-enabled"
          label="Show check indicator"
          checked={draft.checkIndicatorEnabled}
          onCheckedChange={(c) => onChange({ checkIndicatorEnabled: c === true })}
        />
      </div>
    </div>
  );
}
