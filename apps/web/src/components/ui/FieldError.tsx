"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** The id a field's error message gets: point the control's `aria-describedby` at it. */
export function fieldErrorId(fieldId: string) {
  return `${fieldId}-error`;
}

/**
 * A field's validation message: a danger icon and short text, absolutely placed just under
 * the field so showing or clearing it never changes the form's height (docs/UI_RULES.md
 * § "Form errors"). The parent must be `relative` (FormField is); the form's field gap must
 * be at least `gap-4` (16 px) so one line never touches the next label.
 *
 * Screen readers hear it once, when it first appears (`role="alert"` on mount); a message
 * that changes while you type is not re-announced. Renders nothing without a message.
 */
export function FieldError({
  className,
  id,
  message
}: {
  className?: string;
  /** The field's id: the message gets `fieldErrorId(id)`. */
  id: string;
  message?: string | null;
}) {
  const shown = Boolean(message);
  const [announce, setAnnounce] = useState(true);
  const first = useRef<string | null>(null);

  useEffect(() => {
    if (!shown) {
      first.current = null;
      setAnnounce(true);
      return;
    }
    if (first.current === null) first.current = message ?? "";
    else if (first.current !== message) setAnnounce(false);
  }, [message, shown]);

  if (!message) return null;

  return (
    <p
      className={cn(
        "pointer-events-none absolute inset-x-0 top-full z-[1] m-0 mt-px flex items-start gap-1 text-xs font-medium leading-4 text-app-danger-ink",
        className
      )}
      id={fieldErrorId(id)}
      role={announce ? "alert" : undefined}
    >
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={2.5} />
      <span className="line-clamp-2 min-w-0">{message}</span>
    </p>
  );
}
