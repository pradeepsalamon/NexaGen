import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The custom radius tokens, so a caller's `rounded-*` replaces a component's instead of racing it in the CSS.
const twMerge = extendTailwindMerge({ extend: { theme: { radius: ["app", "control", "panel"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sentence-case label for an API enum value: "NOT_HELD" → "Not held". */
export function enumLabel(value: string): string {
  const words = value.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
