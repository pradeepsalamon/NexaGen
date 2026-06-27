import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-app border border-app-border bg-app-surface shadow-card ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
