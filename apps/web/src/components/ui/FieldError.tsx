"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** The id a field's error message gets: point the control's `aria-describedby` at it. */
export function fieldErrorId(fieldId: string) {
  return `${fieldId}-error`;
}

/**
 * A field's validation message (docs/UI_RULES.md § "Form errors", owner 2026-11-24): never
 * drawn on the page. The field itself turns red (`aria-invalid` / `hasError`), a blocked
 * submit raises one toast naming the first problem and focuses that field (`revealFormErrors`,
 * `onInvalidSubmit` in lib/forms), and this text stays in the DOM for screen readers: the
 * control's `aria-describedby` points at it, and the toast reads it from here.
 *
 * `visible` is only for a message the user must keep reading while acting on it (a sign-in
 * lockout's wait time): then it is drawn just under the field, absolutely placed so it never
 * changes the form's height (the parent must be `relative`; FormField is), and announced once.
 * Renders nothing without a message.
 */
export function FieldError({
  className,
  id,
  message,
  standalone = false,
  visible = false
}: {
  className?: string;
  /** The field's id: the message gets `fieldErrorId(id)`. */
  id: string;
  message?: string | null;
  /**
   * For a field without a `relative` wrapper: renders a zero-height anchor (always, with or
   * without a message, so any gap it takes in a grid or stack is fixed) and the message hangs
   * from it. `className` then goes on the anchor (e.g. its grid placement).
   */
  standalone?: boolean;
  /** Draw it under the field (a lockout's wait time); otherwise screen-reader text only. */
  visible?: boolean;
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

  if (standalone) {
    return (
      <div className={cn("relative h-0", className)}>
        <FieldError id={id} message={message} visible={visible} />
      </div>
    );
  }

  if (!message) return null;

  if (!visible) {
    return (
      <span className="sr-only" data-field-error="" id={fieldErrorId(id)}>
        {message}
      </span>
    );
  }

  return (
    <p
      className={cn(
        "pointer-events-none absolute inset-x-0 top-full z-[1] m-0 mt-px flex items-start gap-1 text-xs font-medium leading-4 text-app-danger-ink",
        className
      )}
      data-field-error=""
      id={fieldErrorId(id)}
      role={announce ? "alert" : undefined}
    >
      <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={2.5} />
      <span className="line-clamp-2 min-w-0">{message}</span>
    </p>
  );
}
