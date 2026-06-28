import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-app border border-app-border bg-app-surface text-app-text shadow-card",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
