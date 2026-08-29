"use client";

import { useEffect, useRef } from "react";
import type { BoardSyncActions } from "@/features/chessboard/hooks/useBoardSync";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useLiveClassState } from "../providers/LiveClassProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";

/**
 * Bridges the LiveClassProvider's `boardControlStudentId` with the chessboard
 * store's permission system, and force-syncs full state when the board is first
 * opened. Driven by the single sync engine in <LiveBoardSyncBridge>.
 */
export function useLiveBoardSyncBridge(actions: BoardSyncActions) {
  const { boardControlStudentId, isChessboardOpen } = useLiveClassState();
  const { setPermissionMode, permissionMode, selectedStudentId } = useBoardStore();
  const { broadcastState, broadcastPermissions } = actions;
  const hasInitialized = useRef(false);
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  // boardControlStudentId → board store permission mode (coach only).
  useEffect(() => {
    if (!isCoach) return;
    if (boardControlStudentId) {
      setPermissionMode("SELECTED_STUDENT", boardControlStudentId);
    } else {
      setPermissionMode("COACH_ONLY");
    }
  }, [boardControlStudentId, setPermissionMode, isCoach]);

  // Broadcast permission changes to all participants.
  useEffect(() => {
    if (!isChessboardOpen || !isCoach) return;
    broadcastPermissions();
  }, [permissionMode, selectedStudentId, isChessboardOpen, broadcastPermissions, isCoach]);

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
