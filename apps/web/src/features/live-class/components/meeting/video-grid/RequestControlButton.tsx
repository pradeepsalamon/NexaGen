"use client";

import { Crown, Hand, RefreshCw } from "lucide-react";
import { useLocalParticipant } from "@livekit/components-react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useBoardSync } from "@/features/chessboard/hooks/useBoardSync";
import { controlSideForIdentity } from "@/features/chessboard/lib/boardSyncRules";

/**
 * Student-only cluster shown on the shared board: request/hold board control.
 */
export function RequestControlButton() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { localParticipant } = useLocalParticipant();
  const { permissionMode, selectedStudentIds, selectedStudentSides, isDetached } =
    useBoardStore();
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
    "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold shadow-md backdrop-blur-md transition-all active:scale-95";

  return (
    <div className="flex items-center gap-1.5">
      {isDetached ? (
        <button
          type="button"
          onClick={requestResync}
          className={`${pill} border-sky-500/40 bg-black/80 text-sky-300 hover:border-sky-400 hover:text-sky-200`}
        >
          <RefreshCw className="size-3" />
          Resync
        </button>
      ) : controlSide ? (
        <span className={`${pill} border-emerald-500/40 bg-black/80 text-emerald-400`}>
          <Crown className="size-3 text-emerald-400" />
          {controlLabel}
        </span>
      ) : (
        <button
          type="button"
          onClick={requestControl}
          className={`${pill} border-amber-500/40 bg-black/80 text-amber-400 hover:border-amber-400 hover:text-amber-300`}
        >
          <Hand className="size-3 text-amber-400" />
          Request control
        </button>
      )}
    </div>
  );
}
