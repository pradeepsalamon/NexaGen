"use client";

import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import type { MeetingRoom as MeetingRoomComponent } from "./MeetingRoom";

const loadMeetingRoom = () => import("./MeetingRoom").then((m) => ({ default: m.MeetingRoom }));
const LazyRoom = lazy(loadMeetingRoom);

/**
 * Starts downloading the room's code. Call it as soon as joining looks likely
 * (the pre-join card or the demo form is on screen), so the room is ready by
 * the time the person presses Join.
 */
export function preloadMeetingRoom() {
  void loadMeetingRoom().catch(() => {
    // Offline or a stale deploy: rendering the room retries and reports it.
  });
}

/**
 * The meeting room, downloaded separately from the page that leads to it. The
 * pre-join, waiting, "not started" and summary screens then load without the
 * room's code (LiveKit, the board, every in-room tool) — most of the page's weight.
 */
export function MeetingRoom({
  fallback,
  ...props
}: ComponentProps<typeof MeetingRoomComponent> & { fallback: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <LazyRoom {...props} />
    </Suspense>
  );
}
