"use client";

import { useEffect, useRef } from "react";
import { hadRecentSubmitIntent, revealFormErrors } from "@/lib/forms";

function errorKey(errors: unknown): string {
  if (!errors) return "";
  if (typeof errors === "string") return errors;
  if (typeof errors === "object") {
    const parts = Object.values(errors as Record<string, unknown>).filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
    if (parts.length > 0) return parts.join("|");
    const message = (errors as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

/**
 * For a form that keeps its own error state (UI_RULES § "Form errors"): when that state gains
 * a problem right after the user tried to submit (a Submit click, Enter, or a form submit, and
 * no typing since), focuses the first invalid field and raises the one toast naming it. Errors
 * that change while the user is typing never toast. `errors` is the error state as kept: a
 * message, `{ field, message }`, or a record of messages. `immediate` is for a problem found
 * the moment a file is picked (too large, unreadable): it toasts without waiting for a submit.
 */
export function useRevealFormErrors(errors: unknown, { immediate = false }: { immediate?: boolean } = {}) {
  const key = errorKey(errors);
  const previous = useRef("");
  useEffect(() => {
    if (key && key !== previous.current && (immediate || hadRecentSubmitIntent())) revealFormErrors();
    previous.current = key;
  }, [immediate, key]);
}
