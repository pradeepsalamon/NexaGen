import { ApiError, errorStatus } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { showToast } from "@/providers/ToastProvider";

/**
 * Every error is a toast (docs/UI_RULES.md § "Errors", owner 2026-11-26). The
 * query client calls this for every failed query and mutation, so no screen
 * has to remember. Not toasted here:
 *  - a network failure (no response): the connection banner already says so;
 *  - a 401: the session refresh / sign-in redirect handles it;
 *  - a 402: the academy's plan lacks the feature; the screen shows the upgrade prompt;
 *  - a `silent` request (background polling) and anything with `meta.silentError`.
 * The toast's id is its message, so a component that raises its own toast for
 * the same error replaces this one (with its better title) instead of stacking,
 * and the same failure on several queries shows once.
 */
export function reportErrorToast(error: unknown, kind: "load" | "action", meta?: Record<string, unknown>): void {
  if (meta?.silentError === true) return;
  if (error instanceof ApiError && error.silent) return;
  const status = errorStatus(error);
  if (error instanceof ApiError && status === undefined) return;
  if (status === 401 || status === 402) return;
  showToast({
    message: getErrorMessage(error),
    title: kind === "load" ? "Couldn't load part of this page" : "That didn't work",
    type: "error"
  });
}
