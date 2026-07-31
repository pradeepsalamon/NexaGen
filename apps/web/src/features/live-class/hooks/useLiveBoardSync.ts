"use client";

import { useEffect, useRef } from "react";
import { useBoardSync } from "@/features/chessboard/hooks/useBoardSync";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useLiveClassState } from "../providers/LiveClassProvider";

/**
 * Bridges the LiveClassProvider's `boardControlStudentId` with the
 * chessboard store's permission system, and triggers sync broadcasts
 * when the chessboard is first opened.
 *
 * Must be used inside both <BoardProvider> and <LiveClassProvider>.
 */
export function useLiveBoardSync() {
  const { boardControlStudentId, isChessboardOpen } = useLiveClassState();
  const { setPermissionMode } = useBoardStore();
  const { broadcastState, broadcastPermissions } = useBoardSync();
  const hasInitialized = useRef(false);

  // Sync boardControlStudentId → board store permission mode
  useEffect(() => {
    if (boardControlStudentId) {
      setPermissionMode("SELECTED_STUDENT", boardControlStudentId);
    } else {
      setPermissionMode("COACH_ONLY");
    }
  }, [boardControlStudentId, setPermissionMode]);

  // When the permission mode changes, broadcast to all participants
  useEffect(() => {
    if (!isChessboardOpen) return;
    broadcastPermissions();
  }, [boardControlStudentId, isChessboardOpen, broadcastPermissions]);

  // When the board is first opened, force-sync full state to all
  useEffect(() => {
    if (isChessboardOpen && !hasInitialized.current) {
      hasInitialized.current = true;
      // Small delay to ensure data channel is ready
      const timer = setTimeout(() => {
        broadcastState("FORCE_SYNC");
      }, 300);
      return () => clearTimeout(timer);
    }
    if (!isChessboardOpen) {
      hasInitialized.current = false;
    }
  }, [isChessboardOpen, broadcastState]);

  return { broadcastState, broadcastPermissions };
}
