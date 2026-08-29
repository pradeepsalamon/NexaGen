"use client";

import {
  ParticipantTile,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Minimize2, Pin } from "lucide-react";
import { Track } from "livekit-client";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

export function FocusOverlay({
  trackRef,
  onClose,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  onClose: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const name =
    trackRef.participant.name ||
    (trackRef.participant.isLocal ? localName : trackRef.participant.identity) ||
    "Unknown";
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-background/95 p-4 backdrop-blur-md">
      <div className="relative flex h-full w-full max-w-7xl flex-col gap-3">
        {/* Header bar */}
        <div className="flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-app-muted">
            <Pin className="size-4" />
            <span className="font-medium">
              {isScreenShare ? `${name}'s screen` : name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface/50 px-4 py-2 text-sm font-medium text-app-text transition-colors hover:bg-app-surface"
              onClick={onClose}
            >
              <Minimize2 className="size-4" />
              Exit full screen
            </button>
          </div>
        </div>

        {/* Video container */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-app-border bg-black shadow-2xl">
          <ParticipantTile
            trackRef={trackRef}
            className={cn(
              "h-full w-full overflow-hidden rounded-2xl [&_.lk-participant-metadata]:hidden",
              isScreenShare
                ? "[&_.lk-video-container_video]:object-contain"
                : "[&_.lk-video-container_video]:object-cover",
            )}
          />
        </div>
      </div>
    </div>
  );
}
