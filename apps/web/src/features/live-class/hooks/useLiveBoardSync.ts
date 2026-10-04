"use client";

import { useEffect, useRef } from "react";
import type { BoardSyncActions } from "@/features/chessboard/hooks/useBoardSync";
import type { BoardControlSide } from "@/features/chessboard/types/sync";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useLiveClassState } from "../providers/LiveClassProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";

/**
 * Bridges the LiveClassProvider's `boardControlStudentIds` with the chessboard
 * store's permission system, and force-syncs full state when the board is first
 * opened. Driven by the single sync engine in <LiveBoardSyncBridge>.
 */
function permissionSignature(
  mode: string,
  ids: string[],
  sides: Record<string, BoardControlSide>,
) {
  const grants = ids.map((id) => `${id}:${sides[id] ?? "both"}`).sort();
  return `${mode}|${grants.join(",")}`;
}

export function useLiveBoardSyncBridge(actions: BoardSyncActions) {
  const { boardControlStudents, boardControlStudentIds, isChessboardOpen, settings } = useLiveClassState(
    "boardControlStudents",
    "boardControlStudentIds",
    "isChessboardOpen",
    "settings",
  );
  const setPermissionMode = useBoardStore((s) => s.setPermissionMode);
  const permissionMode = useBoardStore((s) => s.permissionMode);
  const selectedStudentIds = useBoardStore((s) => s.selectedStudentIds);
  const selectedStudentSides = useBoardStore((s) => s.selectedStudentSides);
  const { broadcastState, broadcastPermissions } = actions;
  const hasInitialized = useRef(false);
  const lastBroadcastSig = useRef<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  // boardControlStudentIds → board store permission mode (coach only). Guarded
  // against no-op writes so an echoed permission sync doesn't churn the store.
  // With no explicit grants the mode follows the pre-class policy: a class
  // configured for INTERACTIVE board opens with EVERYONE able to move.
  const policyBoardMode = settings?.student.board === "INTERACTIVE" ? "EVERYONE" : "COACH_ONLY";
  useEffect(() => {
    if (!isCoach) return;
    const desiredMode =
      boardControlStudentIds.length > 0 ? "SELECTED_STUDENT" : policyBoardMode;
    const current = permissionSignature(permissionMode, selectedStudentIds, selectedStudentSides);
    const desired = permissionSignature(desiredMode, boardControlStudentIds, boardControlStudents);
    if (current === desired) return;
    setPermissionMode(desiredMode, boardControlStudentIds, boardControlStudents);
  }, [
    boardControlStudents,
    boardControlStudentIds,
    selectedStudentIds,
    selectedStudentSides,
    permissionMode,
    setPermissionMode,
    isCoach,
    policyBoardMode,
  ]);

  // Broadcast permission changes to all participants — only when the value
  // actually changed. `syncFromRemote` reassigns `selectedStudentIds` on every
  // incoming UPDATE_PERMISSIONS, so without this guard the meeting window and
  // the coach's board pop-out bounce the same permission set back and forth
  // forever (the grant/revoke button visibly flickering).
  useEffect(() => {
    if (!isChessboardOpen || !isCoach) return;
    const sig = permissionSignature(permissionMode, selectedStudentIds, selectedStudentSides);
    if (sig === lastBroadcastSig.current) return;
    lastBroadcastSig.current = sig;
    broadcastPermissions();
  }, [
    permissionMode,
    selectedStudentIds,
    selectedStudentSides,
    isChessboardOpen,
    broadcastPermissions,
    isCoach,
  ]);

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
