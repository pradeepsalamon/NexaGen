import { API_ROUTES, liveBoardStateSchema, type LiveBoardState } from "@nexa-chess/types";
import { getWebEnv } from "@nexa-chess/config/web";

/** Egress waits on the page; a slow API must not hold the recording back. */
const TIMEOUT_MS = 2500;

/**
 * The API as the web *server* reaches it. In compose that is the internal
 * service name (`API_INTERNAL_URL=http://api:3001`): the egress container's
 * Chrome loads this page from `http://web:3000` and may not be able to reach
 * the public API hostname at all. Falls back to the public URL (local dev).
 */
function apiBaseUrl(): string {
  const internal = process.env.API_INTERNAL_URL?.replace(/\/+$/, "");
  if (internal) return internal;
  return getWebEnv({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL }).NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
}

/**
 * The class's saved board for the recording template, authenticated with the
 * LiveKit token egress handed the page. Server-side, so the token goes
 * web → api on the internal network and never into a browser request.
 * Any failure is null: the recording then starts from the start position and
 * live packets correct it, exactly as before this existed.
 */
export async function loadRecorderBoard(classId: string, livekitToken: string | null): Promise<LiveBoardState | null> {
  if (!livekitToken) return null;
  try {
    const res = await fetch(`${apiBaseUrl()}${API_ROUTES.liveClass.recorderBoardState(encodeURIComponent(classId))}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${livekitToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`Recorder board read for class ${classId} answered ${res.status}; starting from the start position.`);
      return null;
    }
    const parsed = liveBoardStateSchema.safeParse(((await res.json()) as { state?: unknown }).state);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn(
      `Recorder board read for class ${classId} failed (${error instanceof Error ? error.name : "error"}); starting from the start position.`
    );
    return null;
  }
}
