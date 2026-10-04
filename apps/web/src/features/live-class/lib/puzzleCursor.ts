/**
 * Where the coach is in the puzzle library — the folder last opened in "Ask",
 * the puzzle last shared (Ask next / previous step from it) and the puzzle last
 * loaded onto the board (Load next steps from it). Ask and Load are tracked
 * independently. Per browser, like the share options.
 */
const CURSOR_KEY = "nexa-live-puzzle-cursor";

export type PuzzleCursor = { folderId: string | null; askedId: string | null; loadedId: string | null };

const EMPTY: PuzzleCursor = { folderId: null, askedId: null, loadedId: null };

export function loadPuzzleCursor(): PuzzleCursor {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(CURSOR_KEY);
    if (!raw) return EMPTY;
    // Older cursors kept one `puzzleId` for both.
    const { puzzleId, ...rest } = JSON.parse(raw) as Partial<PuzzleCursor> & { puzzleId?: string | null };
    return { ...EMPTY, askedId: puzzleId ?? null, loadedId: puzzleId ?? null, ...rest };
  } catch {
    return EMPTY;
  }
}

export function savePuzzleCursor(patch: Partial<PuzzleCursor>) {
  try {
    window.localStorage.setItem(CURSOR_KEY, JSON.stringify({ ...loadPuzzleCursor(), ...patch }));
  } catch {
    // Storage blocked — the position just isn't remembered.
  }
}
