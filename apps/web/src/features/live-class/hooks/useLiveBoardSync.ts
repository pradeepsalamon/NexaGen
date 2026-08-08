"use client";

import { useEffect, useRef } from "react";
import { useBoardSync } from "@/features/chessboard/hooks/useBoardSync";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useLiveClassState } from "../providers/LiveClassProvider";

import { useAuthStore } from "@/stores/authStore";

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
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";

  // Sync boardControlStudentId → board store permission mode
  useEffect(() => {
    if (!isCoach) return; // Only coach sets permissions from LiveClassState
    if (boardControlStudentId) {
      setPermissionMode("SELECTED_STUDENT", boardControlStudentId);
    } else {
      setPermissionMode("COACH_ONLY");
    }
  }, [boardControlStudentId, setPermissionMode, isCoach]);

  // When the permission mode changes, broadcast to all participants
  useEffect(() => {
    if (!isChessboardOpen || !isCoach) return;
    broadcastPermissions();
  }, [boardControlStudentId, isChessboardOpen, broadcastPermissions, isCoach]);

  // When the board is first opened, force-sync full state to all
  useEffect(() => {
    if (isChessboardOpen && !hasInitialized.current) {
      hasInitialized.current = true;
      if (isCoach) {
        // Small delay to ensure data channel is ready
        const timer = setTimeout(() => {
          broadcastState("FORCE_SYNC");
        }, 300);
        return () => clearTimeout(timer);
      }
    }
    if (!isChessboardOpen) {
      hasInitialized.current = false;
    }
  }, [isChessboardOpen, broadcastState]);

  return { broadcastState, broadcastPermissions };
}
