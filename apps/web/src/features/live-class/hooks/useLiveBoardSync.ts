"use client";

import { useEffect, useRef } from "react";
import type { BoardSyncActions } from "@/features/chessboard/hooks/useBoardSync";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useLiveClassState } from "../providers/LiveClassProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";

/**
 * Bridges the LiveClassProvider's `boardControlStudentIds` with the chessboard
 * store's permission system, and force-syncs full state when the board is first
 * opened. Driven by the single sync engine in <LiveBoardSyncBridge>.
 */
function permissionSignature(mode: string, ids: string[]) {
  return `${mode}|${[...ids].sort().join(",")}`;
}

export function useLiveBoardSyncBridge(actions: BoardSyncActions) {
  const { boardControlStudentIds, isChessboardOpen } = useLiveClassState();
  const { setPermissionMode, permissionMode, selectedStudentIds } = useBoardStore();
  const { broadcastState, broadcastPermissions } = actions;
  const hasInitialized = useRef(false);
  const lastBroadcastSig = useRef<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  // boardControlStudentIds → board store permission mode (coach only). Guarded
  // against no-op writes so an echoed permission sync doesn't churn the store.
  useEffect(() => {
    if (!isCoach) return;
    const desiredMode = boardControlStudentIds.length > 0 ? "SELECTED_STUDENT" : "COACH_ONLY";
    const sameIds =
      selectedStudentIds.length === boardControlStudentIds.length &&
      boardControlStudentIds.every((id) => selectedStudentIds.includes(id));
    if (permissionMode === desiredMode && sameIds) return;
    setPermissionMode(desiredMode, boardControlStudentIds);
  }, [boardControlStudentIds, selectedStudentIds, permissionMode, setPermissionMode, isCoach]);

  // Broadcast permission changes to all participants — only when the value
  // actually changed. `syncFromRemote` reassigns `selectedStudentIds` on every
  // incoming UPDATE_PERMISSIONS, so without this guard the meeting window and
  // the coach's board pop-out bounce the same permission set back and forth
  // forever (the grant/revoke button visibly flickering).
  useEffect(() => {
    if (!isChessboardOpen || !isCoach) return;
    const sig = permissionSignature(permissionMode, selectedStudentIds);
    if (sig === lastBroadcastSig.current) return;
    lastBroadcastSig.current = sig;
    broadcastPermissions();
  }, [permissionMode, selectedStudentIds, isChessboardOpen, broadcastPermissions, isCoach]);

  // Force-sync full state to everyone when the board first opens.
  useEffect(() => {
    if (isChessboardOpen && !hasInitialized.current) {
      hasInitialized.current = true;
      if (isCoach) {
        const timer = setTimeout(() => broadcastState("FORCE_SYNC"), 300);
        return () => clearTimeout(timer);
      }
    }
    if (!isChessboardOpen) {
      hasInitialized.current = false;
    }
  }, [isChessboardOpen, isCoach, broadcastState]);
}
