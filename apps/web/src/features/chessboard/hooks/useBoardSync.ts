import { useEffect, useCallback, useRef } from "react";
import { useDataChannel, useLocalParticipant, useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { useBoardStore } from "../context/BoardProvider";
import { useBoardStore as usePersistedStore } from "../store/boardStore";
import { BoardSyncMessage } from "../types/sync";
import { useAuthStore } from "@/stores/authStore";
import { useOptionalLiveClassState } from "@/features/live-class/providers/LiveClassProvider";
import { toast } from "sonner";

const BOARD_SYNC_TOPIC = "board_sync";

export function useBoardSync() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";
  const { localParticipant } = useLocalParticipant();
  const liveClassState = useOptionalLiveClassState();
  
  const { 
    fen, pgn, orientation, arrows, squareStyles, permissionMode, selectedStudentId,
    syncFromRemote
  } = useBoardStore();

  const lastMoveType = usePersistedStore((state) => state.lastMoveType);

  const sendRef = useRef<any>(null);

  const connectionState = useConnectionState();

  // Helper to send messages
  const broadcastMsg = useCallback((msg: BoardSyncMessage) => {
    if (!localParticipant || !sendRef.current || connectionState !== ConnectionState.Connected) return;
    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(msg));
      sendRef.current(payload, { reliable: true });
    } catch (e) {
      console.error("Failed to broadcast board sync message", e);
    }
  }, [localParticipant, connectionState]);

  // High level actions for UI components to call
  const broadcastState = useCallback((type: BoardSyncMessage["type"] = "MOVE") => {
    broadcastMsg({
      type,
      payload: { fen, pgn, orientation, moveType: type === "MOVE" ? lastMoveType : undefined }
    });
  }, [broadcastMsg, fen, pgn, orientation, lastMoveType]);

  const broadcastAnnotations = useCallback(() => {
    broadcastMsg({
      type: "UPDATE_ANNOTATIONS",
      payload: { arrows, squares: squareStyles }
    });
  }, [broadcastMsg, arrows, squareStyles]);

  const broadcastPermissions = useCallback(() => {
    broadcastMsg({
      type: "UPDATE_PERMISSIONS",
      payload: { mode: permissionMode, selectedStudentId }
    });
  }, [broadcastMsg, permissionMode, selectedStudentId]);

  const requestControl = useCallback(() => {
    if (!user) return;
    const name = `${user.firstName} ${user.lastName || ""}`.trim();
    broadcastMsg({
      type: "REQUEST_CONTROL",
      payload: { studentId: user.id, studentName: name }
    });
    toast.success("Requested board control from coach");
  }, [broadcastMsg, user]);

  const isRemoteUpdateRef = useRef(false);
  const isMountedRef = useRef(false);

  const handleIncomingSync = useCallback((msg: BoardSyncMessage) => {
    switch (msg.type) {
      case "MOVE":
      case "UNDO":
      case "REDO":
      case "RESET":
      case "FORCE_SYNC":
        if (msg.payload && msg.payload.fen) {
          isRemoteUpdateRef.current = true;
          syncFromRemote({
            fen: msg.payload.fen,
            pgn: msg.payload.pgn || "",
            ...(msg.payload.orientation ? { orientation: msg.payload.orientation } : {})
          });
        }
        break;
      case "UPDATE_ANNOTATIONS":
        if (msg.payload) {
          isRemoteUpdateRef.current = true;
          syncFromRemote({
            arrows: msg.payload.arrows || [],
            squareStyles: msg.payload.squares || {}
          });
        }
        break;
      case "UPDATE_PERMISSIONS":
        if (msg.payload && msg.payload.mode) {
          isRemoteUpdateRef.current = true;
          syncFromRemote({
            permissionMode: msg.payload.mode,
            selectedStudentId: msg.payload.selectedStudentId
          });
          if (liveClassState?.setBoardControlStudent) {
            liveClassState.setBoardControlStudent(msg.payload.selectedStudentId || null);
          }
        }
        break;
      case "REQUEST_SYNC":
        // A late joiner requested a sync. If we are the coach, send full state.
        if (isCoach) {
          broadcastState("FORCE_SYNC");
        }
        break;
      case "REQUEST_CONTROL":
        if (isCoach && msg.payload?.studentId) {
          const studentId = msg.payload.studentId;
          const studentName = msg.payload.studentName || "A student";
          toast(`${studentName} requested board control`, {
            id: `req-board-control-${studentId}`,
            action: {
              label: "Grant Control",
              onClick: () => {
                if (liveClassState?.setBoardControlStudent) {
                  liveClassState.setBoardControlStudent(studentId);
                  toast.success(`Granted board control to ${studentName}`, {
                    id: `grant-board-control-${studentId}`,
                  });
                }
              }
            },
            duration: 10000,
          });
        }
        break;
    }
  }, [isCoach, syncFromRemote, broadcastState, liveClassState]);

  // Automatically broadcast FEN/PGN changes to all participants unless it came from a remote update
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }

    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    // Only send if we actually have a connection
    broadcastState("MOVE");
  }, [fen, pgn, orientation, broadcastState]);

  // Automatically broadcast drawings/annotations when they change locally
  useEffect(() => {
    if (!isMountedRef.current) return;
    if (isRemoteUpdateRef.current) return;
    broadcastAnnotations();
  }, [arrows, squareStyles, broadcastAnnotations]);

  const onMessageReceived = useCallback((msg: any) => {
    try {
      const decoder = new TextDecoder();
      const messageStr = decoder.decode(msg.payload);
      const data = JSON.parse(messageStr) as BoardSyncMessage;
      
      handleIncomingSync(data);
    } catch (e) {
      console.error("Failed to parse board sync message", e);
    }
  }, [handleIncomingSync]);

  // Setup receiving messages
  const { send } = useDataChannel(BOARD_SYNC_TOPIC, onMessageReceived);
  
  // Keep send function reference updated
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // On mount, if student, request current state from coach
  useEffect(() => {
    if (!isCoach) {
      broadcastMsg({ type: "REQUEST_SYNC" } as BoardSyncMessage);
    }
  }, [isCoach, broadcastMsg]);

  return {
    broadcastState,
    broadcastAnnotations,
    broadcastPermissions,
    requestControl
  };
}
