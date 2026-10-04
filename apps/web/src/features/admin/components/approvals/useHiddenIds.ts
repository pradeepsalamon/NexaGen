import { useState } from "react";

// Hides rows while a deferred approve/decline toast is pending.
export function useHiddenIds() {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string, hidden: boolean) =>
    setHiddenIds((current) => {
      const next = new Set(current);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });
  return { hiddenIds, toggle };
}
