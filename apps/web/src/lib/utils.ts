import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The custom radius and animation tokens (tailwind.config.ts), so a caller's `rounded-*` / `animate-*`
// replaces a component's instead of racing it in the CSS.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      animate: [
        "drawer-in",
        "drawer-out",
        "fade-in",
        "overlay-in",
        "overlay-out",
        "slide-up",
        "stage-in",
        "tab-in-left",
        "tab-in-right",
        "tab-panel-in"
      ],
      radius: ["app", "control", "panel"]
    }
  }
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sentence-case label for an API enum value: "NOT_HELD" → "Not held". */
export function enumLabel(value: string): string {
  const words = value.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
