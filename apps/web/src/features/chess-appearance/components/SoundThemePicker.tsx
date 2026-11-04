"use client";

import { useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import type { SoundThemeId, SoundThemeMeta } from "@nexa-chess/types";
import { choiceTileClass } from "@/components/ui/ChoiceTile";
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
          <div
            key={theme.id}
            className={choiceTileClass(isSelected, "flex items-center gap-3")}
          >
            <SimpleTooltip label={isPlaying ? "Stop preview" : "Preview this sound"}>
              <button
                type="button"
                aria-label={isPlaying ? `Stop previewing ${theme.name}` : `Preview ${theme.name} sound`}
                onClick={() => handlePreview(theme.id)}
                className="flex size-9 shrink-0 items-center justify-center rounded-control border border-app-line-strong bg-app-surface text-app-text transition-colors hover:border-primary/50 hover:text-primary-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
              >
                {isPlaying ? (
                  <Square className="size-3.5" strokeWidth={2.5} />
                ) : (
                  <Play className="size-3.5" strokeWidth={2.5} />
                )}
              </button>
            </SimpleTooltip>
            <button
              type="button"
              aria-label={`Select ${theme.name} sound theme`}
              aria-pressed={isSelected}
              onClick={() => onSelect(theme.id)}
              className="min-w-0 flex-1 rounded-control text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
            >
              <p className="truncate text-sm font-semibold text-app-text">{theme.name}</p>
              <p className="truncate text-xs text-app-muted">{theme.description}</p>
            </button>
          </div>
        );
      })}
    </div>
  );
}
