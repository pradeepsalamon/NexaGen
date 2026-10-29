import { cn } from "@/lib/utils";

/**
 * The one text-field look, shared by Input, Select, Combobox, Textarea and the
 * date/time picker triggers: the navy/gold redesign's field (tinted fill, the
 * 12px control radius, gold border and ring on focus). Shape and height stay
 * with each component.
 */
export function fieldClasses({ hasError = false, within = false }: { hasError?: boolean; within?: boolean } = {}) {
  return cn(
    "rounded-control border bg-nx-field text-sm text-nx-ink transition-[border-color,box-shadow] placeholder:text-nx-muted hover:border-nx-line-strong disabled:cursor-not-allowed disabled:opacity-60",
    within
      ? "focus-within:border-nx-gold-ink focus-within:shadow-nx-focus"
      : "focus:border-nx-gold-ink focus:shadow-nx-focus focus:outline-none",
    hasError ? "border-app-danger hover:border-app-danger" : "border-nx-field-line"
  );
}
