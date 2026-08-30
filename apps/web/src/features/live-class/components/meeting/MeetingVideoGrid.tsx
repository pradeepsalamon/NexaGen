"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useTracks } from "@livekit/components-react";
import { Crown, Maximize2 } from "lucide-react";
import { Track } from "livekit-client";
import { EmptyMeetingState } from "./EmptyMeetingState";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { ChessgroundBoard } from "@/features/chessboard/components/board/ChessgroundBoard";
import { getGridClasses, getTrackKey, useSortedTracks } from "./video-grid/videoGrid.utils";
import { RequestControlButton } from "./video-grid/RequestControlButton";
import { VideoTile } from "./video-grid/VideoTile";
import { CompactVideoTile } from "./video-grid/CompactVideoTile";
import { FocusOverlay } from "./video-grid/FocusOverlay";
import { BoardFocusOverlay } from "./video-grid/BoardFocusOverlay";

export function MeetingVideoGrid({ compact = false }: { compact?: boolean }) {
  const { pinnedParticipantSid, setPinnedParticipantSid, isChessboardOpen } = useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const showBoardTile = isChessboardOpen && !isCoach;
  const [isBoardFullscreen, setIsBoardFullscreen] = useState(false);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  ).filter((t) => !t.participant.identity.endsWith("_board"));

  const sortedTracks = useSortedTracks(tracks);

  const fullscreenTrack = useMemo(
    () =>
      pinnedParticipantSid
        ? tracks.find((trackRef) => getTrackKey(trackRef) === pinnedParticipantSid) ?? null
        : null,
    [pinnedParticipantSid, tracks],
  );

  const totalItems = sortedTracks.length + (showBoardTile && !compact ? 1 : 0);

  const gridClasses = useMemo(() => getGridClasses(totalItems), [totalItems]);

  if (totalItems === 0 && !compact) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmptyMeetingState />
      </div>
    );
  }

  // ─── Compact Filmstrip Mode ──────────────────────────────────
  if (compact) {
    if (sortedTracks.length === 0) return null;

    return (
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto custom-scrollbar">
        <LayoutGroup>
          <AnimatePresence mode="popLayout">
            {sortedTracks.map((trackRef) => (
              <CompactVideoTile key={getTrackKey(trackRef)} trackRef={trackRef} />
            ))}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-full w-full flex-col p-3 pb-20 sm:p-4 sm:pb-24">
        <LayoutGroup>
          <div
            className={cn(
              "grid w-full gap-2.5 auto-rows-fr sm:gap-3 my-auto",
              gridClasses,
              totalItems <= 2 && "mx-auto max-w-5xl",
              totalItems <= 4 && totalItems > 2 && "mx-auto max-w-6xl",
            )}
          >
            <AnimatePresence mode="popLayout">
              {showBoardTile && (
                <>
                  <motion.div
                    key="inline-chessboard"
                    layout
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                    className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-app-border bg-app-surface transition-shadow duration-200"
                  >
                    {/* Only render ChessgroundBoard when NOT in fullscreen to avoid dual-instance conflicts */}
                    {!isBoardFullscreen && (
                      <div className="absolute inset-y-0 aspect-square" style={{ left: "50%", transform: "translateX(-50%)" }}>
                        <ChessgroundBoard />
                      </div>
                    )}
                    {isBoardFullscreen && (
                      <div className="flex flex-col items-center justify-center gap-2 text-app-muted">
                        <Maximize2 className="size-6" />
                        <span className="text-xs font-medium">Viewing full screen</span>
                      </div>
                    )}

                    {/* Bottom-left name pill & request control button. The clock
                        is intentionally not shown on this small tile — it lives
                        in the full-screen board view. */}
                    <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center gap-1.5">
                      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-2 py-1 shadow-sm backdrop-blur-md">
                        <Crown className="size-3 text-amber-400" />
                        <span className="text-[11px] font-semibold text-white/90">Shared Board</span>
                      </div>
                      <RequestControlButton />
                    </div>

                    {/* Top-right pin/fullscreen button — visible on hover */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-end p-2">
                      <button
                        type="button"
                        className="pointer-events-auto flex size-7 items-center justify-center rounded-full border border-app-border bg-app-surface/80 text-app-text opacity-0 backdrop-blur-sm transition-all duration-150 hover:bg-app-surface hover:scale-105 group-hover:opacity-100 shadow-sm"
                        onClick={() => setIsBoardFullscreen(true)}
                        aria-label="View board full screen"
                      >
                        <Maximize2 className="size-3.5" />
                      </button>
                    </div>
                  </motion.div>

                  {/* Fullscreen overlay — single ChessgroundBoard instance */}
                  {isBoardFullscreen && (
                    <BoardFocusOverlay onClose={() => setIsBoardFullscreen(false)} />
                  )}
                </>
              )}
              {sortedTracks.map((trackRef) => (
                <VideoTile
                  key={getTrackKey(trackRef)}
                  trackRef={trackRef}
                  onPin={setPinnedParticipantSid}
                />
              ))}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      </div>

      {/* Fullscreen / Focus overlay for participant */}
      <AnimatePresence>
        {fullscreenTrack && (
          <FocusOverlay
            trackRef={fullscreenTrack}
            onClose={() => setPinnedParticipantSid(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
