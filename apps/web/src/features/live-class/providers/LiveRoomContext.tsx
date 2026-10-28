"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useParams } from "next/navigation";

type LiveRoomContextValue = {
  classId: string;
  /** Set only for a demo guest (no session): the credential from `GuestJoinDemoResponse.guestToken`. */
  guestToken: string | null;
};

const LiveRoomContext = createContext<LiveRoomContextValue | null>(null);

/**
 * Which class this room is, for everything inside `MeetingRoom`. The room is
 * mounted at `/live-class/[roomId]` for users and at `/demo/[classId]` (id or
 * schedule slug) for demo guests, so in-room components must not read the id
 * from the URL — on the demo page `roomId` is undefined.
 */
export function LiveRoomProvider({
  classId,
  guestToken = null,
  children
}: {
  classId: string;
  guestToken?: string | null;
  children: ReactNode;
}) {
  return <LiveRoomContext.Provider value={{ classId, guestToken }}>{children}</LiveRoomContext.Provider>;
}

/** The room's class id; falls back to the `/live-class/[roomId]` param outside `MeetingRoom` (the board tab). */
export function useRoomClassId(): string {
  const room = useContext(LiveRoomContext);
  const params = useParams();
  return room?.classId ?? (params?.roomId as string | undefined) ?? "";
}

/**
 * The class id for routes only a signed-in member may call, `""` for a demo
 * guest — every `enabled: !!classId` query and `if (!classId) return` action
 * then stays off instead of answering a guest with 401s (each one a refresh
 * call against the auth throttle). Guest-aware code uses `useRoomClassId`.
 */
export function useMemberClassId(): string {
  const classId = useRoomClassId();
  return useDemoGuestToken() ? "" : classId;
}

/** Non-null only for a demo guest — a visitor with no user account in this room. */
export function useDemoGuestToken(): string | null {
  return useContext(LiveRoomContext)?.guestToken ?? null;
}
