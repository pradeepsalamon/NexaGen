"use client";

import { useMemo, useState } from "react";
import {
  isTrackReference,
  ParticipantTile,
  type TrackReferenceOrPlaceholder,
  useTracks,
} from "@livekit/components-react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Track } from "livekit-client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function getTrackKey(trackRef: TrackReferenceOrPlaceholder) {
  return [
    trackRef.participant.identity,
    trackRef.source,
    isTrackReference(trackRef) ? trackRef.publication.trackSid : "placeholder",
  ].join(":");
}

export function VideoGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    {
      onlySubscribed: false,
    },
  );
  const [fullscreenTrackKey, setFullscreenTrackKey] = useState<string | null>(null);

  const fullscreenTrack = useMemo(
    () =>
      fullscreenTrackKey
        ? tracks.find((trackRef) => getTrackKey(trackRef) === fullscreenTrackKey) ?? null
        : null,
    [fullscreenTrackKey, tracks],
  );

  return (
    <>
      <section className="flex flex-1 rounded-[2rem] border border-border/70 bg-card/60 p-3 shadow-inner shadow-slate-950/5 backdrop-blur">
        <div className="grid h-full min-h-[55vh] w-full grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
          {tracks.map((trackRef) => {
            const trackKey = getTrackKey(trackRef);
            const label =
              trackRef.source === Track.Source.ScreenShare ? "View screen full screen" : "View member full screen";

            return (
              <article
                key={trackKey}
                className="group relative aspect-video min-h-[15rem] overflow-hidden rounded-[1.5rem] border border-border/60 bg-slate-950/80 shadow-lg shadow-slate-950/20"
              >
                <ParticipantTile
                  trackRef={trackRef}
                  className="h-full w-full overflow-hidden rounded-[1.5rem]"
                />

                <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="pointer-events-auto size-10 rounded-full border-white/25 bg-slate-950/70 text-white opacity-100 backdrop-blur sm:opacity-0 sm:transition sm:group-hover:opacity-100"
                    onClick={() => setFullscreenTrackKey(trackKey)}
                    aria-label={label}
                  >
                    <Maximize2 className="size-4" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {fullscreenTrack ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/92 p-4 backdrop-blur-md">
          <div className="relative flex h-full w-full max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                onClick={() => setFullscreenTrackKey(null)}
              >
                <Minimize2 className="size-4" />
                Exit full screen
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={() => setFullscreenTrackKey(null)}
                aria-label="Close full screen view"
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/40">
              <ParticipantTile
                trackRef={fullscreenTrack}
                className={cn(
                  "h-full w-full overflow-hidden rounded-[2rem]",
                  fullscreenTrack.source === Track.Source.ScreenShare
                    ? "[&_.lk-video-container_video]:object-contain"
                    : "[&_.lk-video-container_video]:object-cover",
                )}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
