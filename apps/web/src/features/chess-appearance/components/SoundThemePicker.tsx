"use client";

import { useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import type { SoundThemeId, SoundThemeMeta } from "@nexa-chess/types";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { getSoundUrl } from "@/features/chessboard/audio/sounds";

interface SoundThemePickerProps {
  soundThemes: SoundThemeMeta[];
  selectedId: SoundThemeId;
  onSelect: (id: SoundThemeId) => void;
}

export function SoundThemePicker({ soundThemes, selectedId, onSelect }: SoundThemePickerProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = (id: string) => {
    audioRef.current?.pause();
    if (playingId === id) {
      setPlayingId(null);
      return;
    }
    const audio = new Audio(getSoundUrl(id, "move"));
    audio.volume = 0.8;
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(id);
    void audio.play().catch(() => setPlayingId(null));
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {soundThemes.map((theme) => {
        const isSelected = theme.id === selectedId;
        const isPlaying = playingId === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(theme.id)}
            className={cn(
              "flex items-center gap-3 rounded-app border-2 p-2.5 text-left transition",
              isSelected
                ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
                : "border-app-border hover:border-[color-mix(in_srgb,var(--color-primary)_35%,var(--color-border))]",
            )}
          >
            <SimpleTooltip label={isPlaying ? "Stop preview" : "Preview this sound"}>
              <span
                role="button"
                tabIndex={0}
                aria-label={isPlaying ? `Stop previewing ${theme.name}` : `Preview ${theme.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreview(theme.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePreview(theme.id);
                  }
                }}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-text transition hover:border-primary/50 hover:text-primary-ink"
              >
                {isPlaying ? (
                  <Square className="size-3.5" strokeWidth={2.5} />
                ) : (
                  <Play className="size-3.5" strokeWidth={2.5} />
                )}
              </span>
            </SimpleTooltip>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-app-text">{theme.name}</p>
              <p className="truncate text-xs text-app-muted">{theme.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
