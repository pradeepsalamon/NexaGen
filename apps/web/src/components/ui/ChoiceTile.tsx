import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Selectable card styling (Design System v2): one-pixel border, blue border
 * plus soft blue fill and an inset ring when chosen. For wrappers that can't
 * be a button (a `<label>` around a radio, a row holding a second control).
 */
export function choiceTileClass(selected: boolean, className?: string) {
  return cn(
    "rounded-app border p-2.5 text-left transition-colors",
    selected
      ? "border-primary bg-primary-soft ring-1 ring-inset ring-primary"
      : "border-app-border bg-app-surface hover:border-primary/40 hover:bg-app-soft",
    className,
  );
}

/** "Pick one of these" card: a button with `aria-pressed`, styled by `choiceTileClass`. */
export const ChoiceTile = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }
>(function ChoiceTile({ selected, className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={choiceTileClass(
        selected,
        cn(
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
          className,
        ),
      )}
      {...props}
    />
  );
});
