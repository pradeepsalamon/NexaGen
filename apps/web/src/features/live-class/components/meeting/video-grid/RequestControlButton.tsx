"use client";

import { Crown, Hand } from "lucide-react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useBoardSync } from "@/features/chessboard/hooks/useBoardSync";

export function RequestControlButton() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { permissionMode, selectedStudentId } = useBoardStore();
  const { requestControl } = useBoardSync();

  if (isCoach) return null;

  const hasControl = Boolean(
    user?.id &&
      (permissionMode === "EVERYONE" ||
        (permissionMode === "SELECTED_STUDENT" && selectedStudentId === user.id))
  );

  if (hasControl) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-black/80 px-3 py-1.5 text-xs font-semibold text-emerald-400 shadow-md backdrop-blur-md">
        <Crown className="size-3.5 text-emerald-400" />
        You have control
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={requestControl}
      className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-black/80 px-3 py-1.5 text-xs font-semibold text-amber-400 shadow-md backdrop-blur-md transition-all hover:bg-black/90 hover:border-amber-400 hover:text-amber-300 hover:scale-105 active:scale-95"
    >
      <Hand className="size-3.5 text-amber-400" />
      Request Control
    </button>
  );
}
