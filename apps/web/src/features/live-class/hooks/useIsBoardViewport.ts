"use client";

import { useEffect, useState } from "react";

/** md and up with enough height for the single-page layout (phone landscape is not). False until measured. */
export function useIsBoardViewport(): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px) and (min-height: 560px)");
    const apply = () => setMatches(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  return matches;
}
