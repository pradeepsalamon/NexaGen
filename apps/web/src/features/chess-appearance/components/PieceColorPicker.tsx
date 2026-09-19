import type { ChessAppearance } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { pieceSetSupportsCustomColors } from "../lib/recolorPieces";

const DEFAULT_WHITE = "#ffffff";
const DEFAULT_BLACK = "#000000";

interface PieceColorPickerProps {
  draft: ChessAppearance;
  onChange: (patch: Partial<ChessAppearance>) => void;
}

/**
 * Recolors just the piece body fill — outlines/accent details stay put (see
 * `lib/recolorPieces.ts`) — so any two colors stay legible against each other.
 * Only available for piece sets whose SVGs actually support it (a plain body
 * fill, not a gradient/multi-tone illustration) — see
 * `RECOLOR_SUPPORTED_PIECE_SETS`.
 */
export function PieceColorPicker({ draft, onChange }: PieceColorPickerProps) {
  if (!pieceSetSupportsCustomColors(draft.pieceSetId)) {
    return (
      <p className="text-xs text-app-muted">
        Custom piece colors aren&apos;t available for this piece set — its art doesn&apos;t use a
        single recolorable body fill. Try Classic, Modern or Bold.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ColorField
        id="piece-color-white"
        label="White pieces"
        value={draft.pieceColorWhite}
        fallback={DEFAULT_WHITE}
        onChange={(pieceColorWhite) => onChange({ pieceColorWhite })}
        onReset={() => onChange({ pieceColorWhite: null })}
      />
      <ColorField
        id="piece-color-black"
        label="Black pieces"
        value={draft.pieceColorBlack}
        fallback={DEFAULT_BLACK}
        onChange={(pieceColorBlack) => onChange({ pieceColorBlack })}
        onReset={() => onChange({ pieceColorBlack: null })}
      />
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  fallback,
  onChange,
  onReset,
}: {
  id: string;
  label: string;
  value: string | null;
  fallback: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          aria-label={label}
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-control border border-app-border bg-app-surface p-1"
        />
        <span className="font-mono text-xs text-app-muted">{(value ?? fallback).toUpperCase()}</span>
        {value && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            className="ml-auto h-7 px-2 text-xs"
          >
            Use set default
          </Button>
        )}
      </div>
    </div>
  );
}
