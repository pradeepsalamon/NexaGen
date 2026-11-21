import { API_ROUTES, type DailyPuzzlePictureResponse } from "@nexa-chess/types";
import { getWebEnv } from "@nexa-chess/config/web";
import { renderBoardPicture } from "@/features/chess-appearance/lib/boardPicture";

// Puzzle of the Day's board picture for WhatsApp (docs/PUZZLE_OF_THE_DAY.md
// step 3). Public: Meta fetches it when it delivers the message. The signed,
// expiring token in the path is the credential; the API checks it and gives the
// position only (no solution, no student data).
export const runtime = "nodejs";

const TIMEOUT_MS = 4000;

/** The API as the web server reaches it: the internal service in compose, else the public URL. */
function apiBaseUrl(): string {
  const internal = process.env.API_INTERNAL_URL?.replace(/\/+$/, "");
  if (internal) return internal;
  return getWebEnv({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL }).NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const clean = token.replace(/\.png$/, "");
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(clean)) return new Response("Not found", { status: 404 });

  let position: DailyPuzzlePictureResponse;
  try {
    const res = await fetch(`${apiBaseUrl()}${API_ROUTES.dailyPuzzle.picture(clean)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return new Response("Not found", { status: res.status === 404 ? 404 : 502 });
    position = (await res.json()) as DailyPuzzlePictureResponse;
  } catch {
    return new Response("Unavailable", { status: 502 });
  }

  const image = await renderBoardPicture(position);
  // The same picture for every number of the day: let Meta and proxies keep it.
  image.headers.set("Cache-Control", "public, max-age=86400, immutable");
  return image;
}
