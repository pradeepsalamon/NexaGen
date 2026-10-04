"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { pingHeartbeat } from "../api/live-class";
import { useClassroomSession } from "./ClassroomSessionManager";

const HEARTBEAT_INTERVAL_MS = 15_000;

export type PresenceState = "connected" | "connecting" | "reconnecting" | "disconnected";

function toPresenceState(state: ConnectionState): PresenceState {
  switch (state) {
    case ConnectionState.Connected:
      return "connected";
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return "reconnecting";
    case ConnectionState.Connecting:
      return "connecting";
    default:
      return "disconnected";
  }
}

interface ConnectionStateContextValue {
  connectionState: ConnectionState;
  presenceState: PresenceState;
  lastHeartbeatAckAt: Date | null;
  /**
   * Bumped exactly once per Reconnecting/SignalReconnecting -> Connected
   * transition. The board sync bridge (REQUEST_SYNC) and ChatProvider (chat
   * history re-fetch) key off this instead of each re-deriving the same
   * transition independently (design doc §4.3).
   */
  reconnectEpoch: number;
}

const ConnectionStateContext = createContext<ConnectionStateContextValue | null>(null);

export function useConnectionStateManager() {
  const ctx = useContext(ConnectionStateContext);
  if (!ctx) {
    throw new Error("useConnectionStateManager must be used within a <ConnectionStateManager>");
  }
  return ctx;
}

export function useOptionalConnectionStateManager() {
  return useContext(ConnectionStateContext);
}

/**
 * Single owner of "what is this participant's connection/presence state right
 * now" (design doc §2.9/§4.3) — wraps `useConnectionState()`, pings the
 * Phase 1 heartbeat endpoint (`POST /live-class/:id/heartbeat`) on an
 * interval while connected, and exposes one `presenceState` plus a
 * reconnect-transition counter for consumers that previously each called
 * `useConnectionState()` on their own (`useMeetingTimer`, `MeetingStatus`'s
 * badges). Must be rendered inside `<LiveKitRoom>` and inside
 * `<ClassroomSessionManager>` (for the tab `clientId`).
 */
export function ConnectionStateManager({
  classId,
  children,
}: {
  classId: string;
  children: ReactNode;
}) {
  const connectionState = useConnectionState();
  const { clientId } = useClassroomSession();
  const [lastHeartbeatAckAt, setLastHeartbeatAckAt] = useState<Date | null>(null);
  const [reconnectEpoch, setReconnectEpoch] = useState(0);
  const wasRecoveringRef = useRef(false);

  useEffect(() => {
    const recovering =
      connectionState === ConnectionState.Reconnecting ||
      connectionState === ConnectionState.SignalReconnecting;
    if (recovering) {
      wasRecoveringRef.current = true;
    } else if (connectionState === ConnectionState.Connected && wasRecoveringRef.current) {
      wasRecoveringRef.current = false;
      setReconnectEpoch((n) => n + 1);
    }
  }, [connectionState]);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    let cancelled = false;

    const ping = () => {
      pingHeartbeat(classId, clientId)
        .then(() => {
          if (!cancelled) setLastHeartbeatAckAt(new Date());
        })
        .catch(() => {
          // Best-effort presence signal (design doc §4.1) — a failed ping just
          // leaves lastHeartbeatAckAt stale; the server-side grace-period sweep
          // is the fallback, not a client-side retry.
        });
    };

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connectionState, classId, clientId]);

  const value = useMemo(
    () => ({
      connectionState,
      presenceState: toPresenceState(connectionState),
      lastHeartbeatAckAt,
      reconnectEpoch,
    }),
    [connectionState, lastHeartbeatAckAt, reconnectEpoch],
  );

  return (
    <ConnectionStateContext.Provider value={value}>{children}</ConnectionStateContext.Provider>
  );
}
