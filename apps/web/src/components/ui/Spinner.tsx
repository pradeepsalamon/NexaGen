import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The app's one loading spinner: an arc turning on a faint track, in the
 * current text colour. Size it like an icon (`size-4` in a button, `size-8` for
 * a section, `size-10` for a page). Pass `aria-label` when it is the only
 * sign that something is loading; otherwise it is hidden from screen readers.
 */
export function Spinner({ className, ...props }: SVGProps<SVGSVGElement>) {
  const labelled = Boolean(props["aria-label"]);
  return (
    <svg
      aria-hidden={labelled ? undefined : true}
      className={cn("size-4 shrink-0 animate-spin [animation-duration:0.8s]", className)}
      fill="none"
      role={labelled ? "status" : undefined}
      viewBox="0 0 24 24"
      {...props}
    >
      <circle cx="12" cy="12" opacity="0.2" r="9.5" stroke="currentColor" strokeWidth="3" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}
