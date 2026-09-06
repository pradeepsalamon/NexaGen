"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  clearJoinedSession,
  getTabClientId,
  hasJoinedSession,
  markJoinedSession,
} from "../lib/joinedSession";

interface ClassroomSessionContextValue {
  /** Stable per-tab id, used as the LiveKit clientId suffix and the heartbeat clientId. */
  clientId: string;
  /** Whether this tab already passed PreJoin for this room (sessionStorage-backed). */
  hasJoined: boolean;
  /** Marks PreJoin as passed for this room in this tab. */
  markJoined: () => void;
  /** Clears the "joined" flag — call when the room ends or this tab leaves intentionally. */
  clearJoined: () => void;
}

const ClassroomSessionContext = createContext<ClassroomSessionContextValue | null>(null);

export function useClassroomSession() {
  const ctx = useContext(ClassroomSessionContext);
  if (!ctx) {
    throw new Error("useClassroomSession must be used within a <ClassroomSessionManager>");
  }
  return ctx;
}

const DUPLICATE_TAB_TOAST_ID = "duplicate-tab-warning";

/**
 * Owns per-tab session identity for one live-class room (design doc §4.3):
 * the stable `clientId` and the `joinedSession` PreJoin flag, previously read
 * and written independently from `useLiveClass.ts`, `MeetingRoom.tsx`, and the
 * room page. Also raises a product-layer duplicate-tab warning via
 * `BroadcastChannel` — the LiveKit-identity collision itself is already
 * handled at the transport layer by the `clientId` suffix (§2.8), so this is
 * purely a "heads up, you have this open elsewhere" nudge, not a safety net.
 */
export function ClassroomSessionManager({
  roomId,
  children,
}: {
  roomId: string;
  children: ReactNode;
}) {
  const clientId = useMemo(() => getTabClientId(), []);
  const [hasJoined, setHasJoined] = useState(false);

  // Rehydrate from sessionStorage in an effect (not lazy init) to avoid an
  // SSR/client hydration mismatch — same reasoning as the old page.tsx effect
  // this replaces.
  useEffect(() => {
    if (hasJoinedSession(roomId)) setHasJoined(true);
  }, [roomId]);

  const markJoined = useCallback(() => {
    markJoinedSession(roomId);
    setHasJoined(true);
  }, [roomId]);

  const clearJoined = useCallback(() => {
    clearJoinedSession(roomId);
    setHasJoined(false);
  }, [roomId]);

  const warnedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !roomId) return;
    warnedRef.current = false;

    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(`nexa:live-class-tabs:${roomId}`);
    } catch {
      // BroadcastChannel unsupported (rare) — no duplicate-tab detection, non-fatal.
      return;
    }

    channel.onmessage = (event: MessageEvent<{ tabId?: string; ack?: boolean }>) => {
      const otherTabId = event.data?.tabId;
      if (!otherTabId || otherTabId === clientId) return;
      if (!warnedRef.current) {
        warnedRef.current = true;
        toast.warning("This class is already open in another tab.", {
          id: DUPLICATE_TAB_TOAST_ID,
          duration: 6000,
        });
      }
      // Echo once so a tab that was already open before this one mounted also
      // finds out — `ack` guards against an infinite reply loop.
      if (!event.data.ack) {
        channel.postMessage({ tabId: clientId, ack: true });
      }
    };

    channel.postMessage({ tabId: clientId });

    return () => channel.close();
  }, [roomId, clientId]);

  return (
    <ClassroomSessionContext.Provider value={{ clientId, hasJoined, markJoined, clearJoined }}>
      {children}
    </ClassroomSessionContext.Provider>
  );
}
