/**
 * Where the coach is in the puzzle library — the folder last opened in "Ask"
 * and the puzzle last shared or loaded — so Ask reopens there and "Load next"
 * continues from it. Per browser, like the share options.
 */
const CURSOR_KEY = "nexa-live-puzzle-cursor";

export type PuzzleCursor = { folderId: string | null; puzzleId: string | null };

const EMPTY: PuzzleCursor = { folderId: null, puzzleId: null };

export function loadPuzzleCursor(): PuzzleCursor {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(CURSOR_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<PuzzleCursor>) } : EMPTY;
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
