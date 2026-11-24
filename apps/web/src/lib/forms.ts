import { showToast } from "@/providers/ToastProvider";

export function getFieldError(
  touched: boolean,
  value: string,
  message: string
) {
  return touched && value.trim().length === 0 ? message : undefined;
}

export function getEmailError(touched: boolean, value: string) {
  if (!touched) {
    return undefined;
  }

  if (value.trim().length === 0) {
    return "Enter your email";
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? undefined
    : "Enter a valid email";
}

const FORM_TOAST_ID = "form-invalid";
const FALLBACK_PROBLEM = "Check the highlighted field";

/**
 * The one toast a blocked submit raises (UI_RULES § "Form errors", owner 2026-11-24): the first
 * problem as the title, and how many other fields need a look. The same id replaces the previous
 * one, so pressing Submit again never stacks toasts.
 */
export function toastFormProblem(firstMessage: string | undefined, otherCount = 0) {
  showToast({
    id: FORM_TOAST_ID,
    message:
      otherCount > 0 ? `${otherCount} more field${otherCount === 1 ? " needs" : "s need"} a look too.` : undefined,
    title: firstMessage?.trim() || FALLBACK_PROBLEM,
    type: "error"
  });
}

/** The message of a field's hidden error text (FieldError), found through its `aria-describedby`. */
function errorTextFor(element: Element): string | undefined {
  const ids = element.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  for (const id of ids) {
    const node = element.ownerDocument.getElementById(id);
    if (node?.hasAttribute("data-field-error") && node.textContent?.trim()) return node.textContent.trim();
  }
  return undefined;
}

/**
 * After a blocked submit in a form that keeps its own error state: once React has drawn the
 * errors, focuses the first field marked invalid (`aria-invalid="true"`) and raises the toast
 * naming its problem. `scope` defaults to the form or dialog holding the focused control (the
 * Submit button that was just pressed), else the page.
 */
export function revealFormErrors(scope?: HTMLElement | null) {
  const root =
    scope ??
    (typeof document !== "undefined"
      ? document.activeElement?.closest<HTMLElement>('form, [role="dialog"], [role="alertdialog"]') ?? document.body
      : null);
  if (!root) return;
  requestAnimationFrame(() => {
    const invalid = Array.from(root.querySelectorAll<HTMLElement>('[aria-invalid="true"]'));
    const first = invalid[0];
    if (first) {
      first.focus();
      toastFormProblem(errorTextFor(first), invalid.length - 1);
      return;
    }
    // A problem with no single control (a selection that is too large): its text is enough.
    const message = root.querySelector("[data-field-error]")?.textContent?.trim();
    if (message) toastFormProblem(message);
  });
}

// When the user last tried to submit: a form submit, a click on a plain action button, or Enter
// in a single-line field. Typing (any other key, or an input event) clears it, so an error that
// changes while someone types never toasts (useRevealFormErrors).
let submitIntentAt = 0;
let intentTracking = false;

function isSubmitLikeButton(element: Element): boolean {
  if (element instanceof HTMLInputElement) return element.type === "submit";
  if (!(element instanceof HTMLButtonElement) || element.disabled) return false;
  if (element.type === "submit") return true;
  // Toggles, menus, tabs and pickers change the form, they don't submit it.
  return !(
    element.hasAttribute("role") ||
    element.hasAttribute("aria-pressed") ||
    element.hasAttribute("aria-expanded") ||
    element.hasAttribute("aria-haspopup")
  );
}

function trackSubmitIntent() {
  if (intentTracking || typeof document === "undefined") return;
  intentTracking = true;
  const mark = () => {
    submitIntentAt = Date.now();
  };
  document.addEventListener("submit", mark, true);
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target.closest("button, input[type=submit]") : null;
      if (target && isSubmitLikeButton(target)) mark();
    },
    true
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement) mark();
      else if (!["Shift", "Control", "Alt", "Meta", "Tab", "Enter"].includes(event.key)) submitIntentAt = 0;
    },
    true
  );
  document.addEventListener("input", () => {
    submitIntentAt = 0;
  }, true);
}

if (typeof document !== "undefined") trackSubmitIntent();

/** True when the user tried to submit in the last 15 s and hasn't typed since (an API error may take a while). */
export function hadRecentSubmitIntent() {
  return submitIntentAt > 0 && Date.now() - submitIntentAt < 15_000;
}

/** Older name of `revealFormErrors` for a `<form>`: kept so every blocked submit goes through it. */
export function focusFirstInvalid(form: HTMLFormElement | null | undefined) {
  if (!form) return;
  revealFormErrors(form);
}

type ErrorTree = { message?: unknown; [key: string]: unknown };

function collectMessages(node: unknown, out: string[], seen: Set<unknown>) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  const message = (node as ErrorTree).message;
  if (typeof message === "string" && message) {
    out.push(message);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "ref" || key === "type" || key === "types") continue;
    collectMessages(value, out, seen);
  }
}

/**
 * react-hook-form's invalid handler: `form.handleSubmit(onValid, onInvalidSubmit)`. The form
 * focuses its first invalid field itself (`shouldFocusError`); this raises the toast naming the
 * first problem (the order the fields were registered, i.e. as they appear).
 */
export function onInvalidSubmit(errors: object) {
  const messages: string[] = [];
  collectMessages(errors, messages, new Set());
  toastFormProblem(messages[0], Math.max(0, messages.length - 1));
}

/**
 * A new password, by the API's own rule (`passwordSchema` in `@nexa-chess/types`: 8+ characters,
 * at least one letter and one number). Messages are short and human; the server's wording
 * never reaches a field.
 */
export function getNewPasswordError(touched: boolean, value: string) {
  if (!touched) return undefined;
  if (value.length === 0) return "Enter a password";
  if (value.length < 8) return "Use at least 8 characters";
  if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(value)) return "Use at least one letter and one number";
  return undefined;
}

export function getConfirmPasswordError(touched: boolean, value: string, password: string) {
  if (!touched) return undefined;
  if (value.length === 0) return "Confirm your password";
  return value === password ? undefined : "Passwords don't match";
}
