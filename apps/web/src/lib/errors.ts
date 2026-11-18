import { ApiError } from "@/lib/api";

const GENERIC = "Something went wrong. Please try again.";
const SERVER_FAULT = "Something went wrong on our side. Please try again in a moment.";

/** Text that reads like a stack, an exception class or a database/driver message, never meant for people. */
const TECHNICAL =
  /\b(?:[A-Z][a-z]+)+Exception\b|\bat \S+ \(|prisma|\bP\d{4}\b|ECONN|ETIMEDOUT|ENOTFOUND|undefined|null|NaN|\bstack\b|Unexpected token|is not a function|Cannot read propert|Internal server error|Request failed with status code|Network Error|^\w+ must be (?:a|an) /i;

/**
 * The message to show a person for a failed action (a toast, or a notice that must stay).
 * API errors keep the server's own wording when it is written for people (4xx); a server
 * fault (5xx) or anything technical becomes a plain sentence; a JavaScript runtime error
 * (TypeError, …) never shows its text.
 */
export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status !== undefined && error.status >= 500) return SERVER_FAULT;
    return readable(error.message) ?? GENERIC;
  }
  if (error instanceof Error) {
    // Only a plain Error our own code threw carries a sentence meant for the user.
    if (error.name !== "Error") return GENERIC;
    return readable(error.message) ?? GENERIC;
  }
  return GENERIC;
}

function readable(message: string | undefined) {
  const text = message?.trim();
  if (!text || text.length > 300 || TECHNICAL.test(text)) return undefined;
  return text;
}
