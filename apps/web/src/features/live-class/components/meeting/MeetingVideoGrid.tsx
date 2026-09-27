"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useTracks } from "@livekit/components-react";
import { Crown, Maximize2 } from "lucide-react";
import { Track } from "livekit-client";
import { EmptyMeetingState } from "./EmptyMeetingState";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { isHumanParticipant } from "../../lib/participants";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { ChessgroundBoard } from "@/features/chessboard/components/board/ChessgroundBoard";
import {
  computeGridLayout,
  getTrackKey,
  lastRowIndent,
  useElementSize,
  useSortedTracks
} from "./video-grid/videoGrid.utils";
import { RequestControlButton } from "./video-grid/RequestControlButton";
import { VideoTile } from "./video-grid/VideoTile";
import { CompactVideoTile } from "./video-grid/CompactVideoTile";
import { FocusOverlay } from "./video-grid/FocusOverlay";
import { BoardStage } from "./video-grid/BoardStage";
import { FlipBoardButton } from "./video-grid/FlipBoardButton";
import { PuzzleGridTile } from "./video-grid/PuzzleGridTile";

/** Matches the `gap-3` on the grid; the layout maths needs it as a number. */
const GRID_GAP = 12;
const SCROLLBAR_GUTTER = 16;

export function MeetingVideoGrid({
  compact = false,
  hideBoard = false,
}: {
  compact?: boolean;
  /** The single-page layout already shows the board beside the video. */
  hideBoard?: boolean;
}) {
  const { pinnedParticipantSid, setPinnedParticipantSid, isChessboardOpen, activePuzzle } =
    useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const showBoardTile = isChessboardOpen && !isCoach && !hideBoard;
  // A freshly shared board opens across the whole stage; the student can drop
  // back to the grid, and the next share opens it big again.
  const [boardStage, setBoardStage] = useState(true);
  useEffect(() => {
    if (showBoardTile) setBoardStage(true);
  }, [showBoardTile]);

  const { height, width, ref: containerRef } = useElementSize<HTMLDivElement>();

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  ).filter((t) => isHumanParticipant(t.participant));

  const sortedTracks = useSortedTracks(tracks);

  const fullscreenTrack = useMemo(
    () =>
      pinnedParticipantSid
        ? tracks.find((trackRef) => getTrackKey(trackRef) === pinnedParticipantSid) ?? null
        : null,
    [pinnedParticipantSid, tracks],
  );

  const boardTileShown = showBoardTile && !compact;
  // A shared puzzle sits first in the grid, like the shared board, so students
  // find it without opening a panel.
  const puzzleTileShown = !!activePuzzle && !compact;
  const leadingTiles = (puzzleTileShown ? 1 : 0) + (boardTileShown ? 1 : 0);
  const totalItems = sortedTracks.length + leadingTiles;

  // Sized from the real container rather than a breakpoint table, so every
  // participant count lays out correctly on every screen.
  const layout = useMemo(
    // The scroller reserves a stable scrollbar gutter inside the measured box.
    () => computeGridLayout(totalItems, Math.max(0, width - SCROLLBAR_GUTTER), height, GRID_GAP),
    [totalItems, width, height],
  );
  // The grid runs on half-width tracks with every tile spanning two, so a
  // partial last row can be centred by a half-column (see lastRowIndent).
  const halfTrackWidth = Math.max(0, (layout.tileWidth - GRID_GAP) / 2);
  const lastRowStartIndex = layout.cols * (layout.rows - 1);
  const indent = lastRowIndent(totalItems, layout.cols);

  // Until the container reports a real size (first paint, or a measurement that
  // failed), fall back to a plain responsive grid — tiles still get their size
  // from `aspect-video`, so the stage is never blank.
  const measured = width > 0 && height > 0 && halfTrackWidth > 0;

  const gridStyle: CSSProperties = measured
    ? {
        gridTemplateColumns: `repeat(${layout.cols * 2}, ${halfTrackWidth}px)`,
        justifyContent: "center",
      }
    : {
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
        width: "100%",
        maxWidth: "72rem",
      };

  const tileStyle = (index: number): CSSProperties =>
    measured
      ? {
          gridColumn:
            indent > 0 && index === lastRowStartIndex
              ? `${indent + 1} / span 2`
              : "span 2",
        }
      : {};

  const participantFocus = (
    <AnimatePresence>
      {fullscreenTrack && (
        <FocusOverlay trackRef={fullscreenTrack} onClose={() => setPinnedParticipantSid(null)} />
      )}
    </AnimatePresence>
  );

  if (boardTileShown && boardStage) {
    return (
      <>
        <BoardStage onShowGrid={() => setBoardStage(false)} />
        {participantFocus}
      </>
    );
  }

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
      {/* The measured element must not scroll — see useElementSize. The inner
          div is the scroller; min-h-full keeps the grid centred without
          clipping its top when the tiles do overflow. */}
      <div
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden px-3 pt-3 pb-28 sm:px-4 sm:pt-4 sm:pb-32"
        ref={containerRef}
      >
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="flex min-h-full items-center justify-center">
            <LayoutGroup>
              <div className="grid gap-3" style={gridStyle}>
              <AnimatePresence mode="popLayout">
                {puzzleTileShown && activePuzzle && (
                  <PuzzleGridTile key="puzzle-tile" puzzle={activePuzzle} style={tileStyle(0)} />
                )}
                {boardTileShown && (
                  <>
                    <motion.div
                      key="inline-chessboard"
                      layout
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                      className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-app border border-app-border bg-app-surface transition-shadow duration-200"
                      style={{ containerType: "size", ...tileStyle(puzzleTileShown ? 1 : 0) }}
                    >
                      <div
                        className="relative"
                        style={{
                          width: "min(100cqw, 100cqh)",
                          height: "min(100cqw, 100cqh)",
                        }}
                      >
                        <ChessgroundBoard />
                      </div>

                      {/* Bottom-left name pill & request control button. The clock
                          is intentionally not shown on this small tile — it lives
                          in the full-screen board view. */}
                      <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center gap-1.5">
                        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-2 py-1 shadow-card backdrop-blur-md">
                          <Crown className="size-3 text-amber-400" />
                          <span className="text-[11px] font-semibold text-white/90">Shared Board</span>
                        </div>
                        <RequestControlButton />
                      </div>

                      {/* Top-right pin/fullscreen button — visible on hover */}
                      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-end gap-1.5 p-2">
                        <FlipBoardButton className="pointer-events-auto" />
                        <button
                          type="button"
                          className="pointer-events-auto flex size-7 items-center justify-center rounded-full border border-app-border bg-app-surface/80 text-app-text opacity-0 backdrop-blur-sm transition-all duration-150 hover:bg-app-surface hover:scale-105 group-hover:opacity-100 shadow-card"
                          onClick={() => setBoardStage(true)}
                          aria-label="View board full screen"
                        >
                          <Maximize2 className="size-3.5" />
                        </button>
                      </div>
                    </motion.div>

                  </>
                )}
                {sortedTracks.map((trackRef, trackIndex) => (
                  <VideoTile
                    key={getTrackKey(trackRef)}
                    trackRef={trackRef}
                    onPin={setPinnedParticipantSid}
                    style={tileStyle(trackIndex + leadingTiles)}
                  />
                ))}
              </AnimatePresence>
              </div>
            </LayoutGroup>
          </div>
        </div>
      </div>

      {participantFocus}
    </>
  );
}
