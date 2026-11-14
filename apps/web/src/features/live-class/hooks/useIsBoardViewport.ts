"use client";

import { useEffect, useState } from "react";

const BOARD_VIEWPORT_QUERY = "(min-width: 768px) and (min-height: 560px)";

/**
 * md and up with enough height for the single-page layout (phone landscape is not).
 *
 * Read on the first render: every caller is inside the room, which only exists
 * in the browser once a token has arrived (never in server HTML, so there is
 * nothing to mismatch). Starting at `false` made a desktop mount the whole
 * phone layout first and throw it away one effect later.
 */
export function useIsBoardViewport(): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(BOARD_VIEWPORT_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(BOARD_VIEWPORT_QUERY);
    const apply = () => setMatches(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  return matches;
}
