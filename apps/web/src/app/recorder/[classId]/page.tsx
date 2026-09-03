import type { Metadata } from "next";
import { RecorderClient } from "@/features/recorder/components/RecorderClient";
import "./recorder.css";

/**
 * The egress recording template.
 *
 * LiveKit's headless Chrome loads this as `?url=<ws>&token=<jwt>&layout=<name>`
 * and films whatever it paints. It is deliberately outside the app's auth and
 * provider stack: egress carries no session cookie, and `middleware.ts` only
 * gates /admin, /coach and /student. Authorisation is the LiveKit token itself,
 * which egress mints per-egress, scoped to one room, hidden and subscribe-only.
 *
 * Without this template `startRoomCompositeEgress` falls back to LiveKit's
 * built-in grid, which renders only published video tracks — so a recorded
 * lesson contained webcam tiles and no chessboard at all, because the board is
 * app state synced over data packets rather than a video track.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Nothing here can be prerendered: everything comes from the query string.
export const dynamic = "force-dynamic";

export default function RecorderPage({ params }: { params: { classId: string } }) {
  return <RecorderClient classId={params.classId} />;
}
