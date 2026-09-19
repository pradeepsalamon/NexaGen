import type { ChessAppearance } from "@nexa-chess/types";
import { Checkbox } from "@/components/ui/Checkbox";
import { Label } from "@/components/ui/Label";

interface SoundSettingsFormProps {
  draft: ChessAppearance;
  onChange: (patch: Partial<ChessAppearance>) => void;
}

export function SoundSettingsForm({ draft, onChange }: SoundSettingsFormProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Checkbox
        id="sound-enabled"
        label="Play move sounds"
        checked={draft.soundEnabled}
        onCheckedChange={(c) => onChange({ soundEnabled: c === true })}
      />
      <div className="flex items-center gap-2 sm:max-w-[220px] sm:flex-1">
        <Label htmlFor="sound-volume" className="sr-only">
          Volume
        </Label>
        <input
          id="sound-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={draft.soundVolume}
          disabled={!draft.soundEnabled}
          onChange={(e) => onChange({ soundVolume: Number(e.target.value) })}
          className="w-full accent-primary disabled:opacity-50"
        />
        <span className="w-10 shrink-0 text-right text-xs text-app-muted">
          {Math.round(draft.soundVolume * 100)}%
        </span>
      </div>
    </div>
  );
}
