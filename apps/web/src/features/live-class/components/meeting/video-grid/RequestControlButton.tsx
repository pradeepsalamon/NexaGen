"use client";

import { Crown, Hand, RefreshCw } from "lucide-react";
import { useLocalParticipant } from "@livekit/components-react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useBoardSync } from "@/features/chessboard/hooks/useBoardSync";
import { controlSideForIdentity } from "@/features/chessboard/lib/boardSyncRules";

/**
 * Student-only cluster shown on the shared board: request/hold board control.
 * `surface` when it sits on a theme surface rather than over video.
 */
export function RequestControlButton({ surface = false }: { surface?: boolean }) {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { localParticipant } = useLocalParticipant();
  const permissionMode = useBoardStore((s) => s.permissionMode);
  const selectedStudentIds = useBoardStore((s) => s.selectedStudentIds);
  const selectedStudentSides = useBoardStore((s) => s.selectedStudentSides);
  const isDetached = useBoardStore((s) => s.isDetached);
  const { requestControl, requestResync } = useBoardSync();

  if (isCoach) return null;

  const controlSide = controlSideForIdentity({
    identity: localParticipant?.identity,
    permissionMode,
    selectedStudentIds,
    selectedStudentSides,
  });
  const controlLabel =
    controlSide === "white"
      ? "You control White"
      : controlSide === "black"
        ? "You control Black"
        : "You have control";

  const pill =
    "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold shadow-card backdrop-blur-md transition active:scale-95";
  const tone = surface
    ? {
        resync: "border-primary/40 bg-primary/10 text-primary-ink hover:border-primary",
        control: "border-success/40 bg-success/10 text-success-ink",
        request: "border-warning/40 bg-warning/10 text-warning-ink hover:border-warning",
      }
    : {
        resync: "border-primary/40 bg-black/80 text-white hover:border-primary",
        control: "border-success/40 bg-black/80 text-success",
        request: "border-warning/40 bg-black/80 text-warning hover:border-warning",
      };

  return (
    <div className="flex items-center gap-1.5">
      {isDetached ? (
        <button
          type="button"
          onClick={requestResync}
          className={`${pill} ${tone.resync}`}
        >
          <RefreshCw className="size-3" />
          Resync
        </button>
      ) : controlSide ? (
        <span className={`${pill} ${tone.control}`}>
          <Crown className="size-3" />
          {controlLabel}
        </span>
      ) : (
        <button
          type="button"
          onClick={requestControl}
          className={`${pill} ${tone.request}`}
        >
          <Hand className="size-3" />
          Request control
        </button>
      )}
    </div>
  );
}
