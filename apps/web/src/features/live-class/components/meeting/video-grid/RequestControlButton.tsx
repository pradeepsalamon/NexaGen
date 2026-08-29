"use client";

import { Crown, Hand, Compass, RefreshCw } from "lucide-react";
import { useLocalParticipant } from "@livekit/components-react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useBoardSync } from "@/features/chessboard/hooks/useBoardSync";

/**
 * Student-only cluster shown on the shared board: request/hold control, and
 * detach to explore a line privately then resync to the coach.
 */
export function RequestControlButton() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { localParticipant } = useLocalParticipant();
  const { permissionMode, selectedStudentId, isDetached, detachBoard } = useBoardStore();
  const { requestControl, requestResync } = useBoardSync();

  if (isCoach) return null;

  const identity = localParticipant?.identity;
  const hasControl = Boolean(
    identity &&
      (permissionMode === "EVERYONE" ||
        (permissionMode === "SELECTED_STUDENT" && selectedStudentId === identity)),
  );

  return (
    <div className="flex items-center gap-2">
      {isDetached ? (
        <button
          type="button"
          onClick={requestResync}
          className="flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-black/80 px-3 py-1.5 text-xs font-semibold text-sky-300 shadow-md backdrop-blur-md transition-all hover:border-sky-400 hover:text-sky-200 hover:scale-105 active:scale-95"
        >
          <RefreshCw className="size-3.5" />
          Resync to coach
        </button>
      ) : (
        <>
          {hasControl ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-black/80 px-3 py-1.5 text-xs font-semibold text-emerald-400 shadow-md backdrop-blur-md">
              <Crown className="size-3.5 text-emerald-400" />
              You have control
            </span>
          ) : (
            <button
              type="button"
              onClick={requestControl}
              className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-black/80 px-3 py-1.5 text-xs font-semibold text-amber-400 shadow-md backdrop-blur-md transition-all hover:bg-black/90 hover:border-amber-400 hover:text-amber-300 hover:scale-105 active:scale-95"
            >
              <Hand className="size-3.5 text-amber-400" />
              Request Control
            </button>
          )}
          <button
            type="button"
            onClick={detachBoard}
            title="Explore this position privately without affecting the class board"
            className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/80 px-3 py-1.5 text-xs font-semibold text-white/80 shadow-md backdrop-blur-md transition-all hover:border-white/40 hover:text-white hover:scale-105 active:scale-95"
          >
            <Compass className="size-3.5" />
            Explore on my own
          </button>
        </>
      )}
    </div>
  );
}
