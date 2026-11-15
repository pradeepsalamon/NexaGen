import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one board frame (live-class spec component 11, used for every board):
 * a surface square with a 6px pad, 12px outer and 8px inner radius and the
 * card shadow. The caller sizes it — this never centres or measures — and
 * the board fills the inner square.
 */
export function BoardFrame({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("relative rounded-app border border-app-border bg-app-surface p-1.5 shadow-card", className)}
      style={style}
      data-board-frame
    >
      <div className="relative size-full overflow-hidden rounded-control">{children}</div>
    </div>
  );
}
