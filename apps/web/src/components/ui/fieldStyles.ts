import { cn } from "@/lib/utils";

/**
 * The one text-field look, shared by Input, Select, Combobox, Textarea and the
 * date/time picker triggers: Design System v2's TextField (raised fill,
 * `line-strong` border, blue border and halo on focus). Shape and height stay
 * with each component.
 */
export function fieldClasses({ hasError = false, within = false }: { hasError?: boolean; within?: boolean } = {}) {
  return cn(
    "rounded-control border bg-app-surface text-sm text-app-text transition-[border-color,box-shadow] placeholder:text-app-subtle disabled:cursor-not-allowed disabled:bg-app-soft disabled:text-app-subtle",
    within ? "focus-within:shadow-focus" : "focus:shadow-focus focus:outline-none",
    hasError ? "border-app-danger" : "border-app-line-strong",
    hasError
      ? within
        ? "focus-within:border-app-danger"
        : "focus:border-app-danger"
      : within
        ? "focus-within:border-primary"
        : "focus:border-primary"
  );
}
