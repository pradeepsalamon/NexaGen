"use client";

import { Button } from "@/components/ui/Button";

import { useMemo, useRef, useState, type RefObject } from "react";
import { motion } from "framer-motion";
import {
  isTrackReference,
  ParticipantTile,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Crown, LayoutGrid, Minus, Puzzle as PuzzleIcon, Video } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { ChessgroundBoard } from "@/features/chessboard/components/board/ChessgroundBoard";
import { ChessClock } from "@/features/chessboard/components/panels/ChessClock";
import { useSpotlightTrack } from "../../../hooks/useSpotlightTrack";
import { isHumanParticipant } from "../../../lib/participants";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { ParticipantAvatar } from "../ParticipantAvatar";
import { FlipBoardButton } from "./FlipBoardButton";
import { RequestControlButton } from "./RequestControlButton";
import { getRole } from "./videoGrid.utils";

/**
 * Opt-in full-screen board for a student on a phone (the grid tile's expand
 * button); the coach's camera floats in a draggable popup.
 */
export function BoardStage({ onShowGrid }: { onShowGrid: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { activePuzzle, setPuzzleSolverOpen } = useLiveClassState(
    "activePuzzle",
    "setPuzzleSolverOpen",
  );

  return (
    <div
      ref={stageRef}
      className="relative flex min-h-0 w-full flex-1 flex-col gap-2 px-2 pt-2 pb-28 sm:px-4 sm:pt-3 sm:pb-24"
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-app-text sm:flex">
          <Crown className="size-4 text-accent-ink" />
          Shared Board
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:justify-center">
          <ChessClock layout="horizontal" />
          <RequestControlButton surface />
          {activePuzzle ? (
            <Button size="sm" className="shrink-0" onClick={() => setPuzzleSolverOpen(true)}>
              <PuzzleIcon aria-hidden="true" className="size-4" strokeWidth={2} />
              Solve puzzle
            </Button>
          ) : null}
        </div>
        <FlipBoardButton className="size-8 shrink-0" />
        <SimpleTooltip label="Back to video grid">
          <button
            type="button"
            aria-label="Back to video grid"
            onClick={onShowGrid}
            className="flex size-8 shrink-0 items-center justify-center rounded-control border border-app-border bg-app-surface/80 text-app-text shadow-card transition hover:bg-app-surface"
          >
            <LayoutGrid className="size-3.5" strokeWidth={2.5} />
          </button>
        </SimpleTooltip>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center"
        style={{ containerType: "size" }}
      >
        <div className="relative" style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}>
          <ChessgroundBoard />
        </div>
      </div>

      <CoachVideoPopup constraintsRef={stageRef} />
    </div>
  );
}

function CoachVideoPopup({ constraintsRef }: { constraintsRef: RefObject<HTMLDivElement | null> }) {
  const [minimized, setMinimized] = useState(false);
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  }).filter((t) => isHumanParticipant(t.participant));
  const spotlight = useSpotlightTrack(null);
  const trackRef = useMemo(
    () => tracks.find((t) => getRole(t.participant)?.toUpperCase() === "COACH") ?? spotlight,
    [tracks, spotlight],
  );

  if (!trackRef) return null;
  const participant = trackRef.participant;
  const name = participant.name || participant.identity;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="absolute right-3 top-12 z-10 flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface px-3 py-1.5 text-xs font-semibold text-app-text shadow-card"
      >
        <Video className="size-3.5" strokeWidth={2.5} />
        Show {name}
      </button>
    );
  }

  return (
    <motion.div
      drag
      dragConstraints={constraintsRef}
      dragElastic={0.05}
      dragMomentum={false}
      className="absolute right-3 top-12 z-10 aspect-video w-36 cursor-grab touch-none overflow-hidden rounded-control border border-app-border bg-app-surface shadow-card active:cursor-grabbing sm:w-56"
    >
      {hasVideo ? (
        <ParticipantTile
          trackRef={trackRef}
          className="pointer-events-none h-full w-full [&_.lk-participant-metadata]:hidden [&_.lk-video-container_video]:object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-app-soft">
          <ParticipantAvatar name={name} size="sm" />
        </div>
      )}
      <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
        <span className="truncate rounded-chip bg-scrim/80 px-1.5 py-0.5 text-xs font-medium text-on-scrim">
          {name}
        </span>
        <button
          type="button"
          aria-label="Hide video"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMinimized(true)}
          className="flex size-6 shrink-0 items-center justify-center rounded-chip bg-scrim/80 text-on-scrim"
        >
          <Minus className="size-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </motion.div>
  );
}
