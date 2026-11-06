import { type LucideIcon, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  /** `inline` drops the dashed frame for use inside a card that already has one. */
  variant?: "page" | "inline";
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  variant = "page"
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center animate-fade-in",
        variant === "page"
          ? "min-h-[300px] rounded-app border border-dashed border-app-line-strong bg-app-surface p-8"
          : "px-4 py-10"
      )}
    >
      <EmptyStateIcon icon={Icon} size={variant === "page" ? "lg" : "md"} />
      <h3 className="mt-5 text-base font-semibold text-app-text">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-app-muted">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} variant="neutral" className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * The empty-state icon circle on its own, for the few places that need a
 * custom layout around it (a card with a link button, a room panel). Same look
 * as `EmptyState`, so every "nothing here" reads the same.
 */
export function EmptyStateIcon({
  className,
  icon: Icon,
  size = "md"
}: {
  className?: string;
  icon: LucideIcon;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink ring-8 ring-primary-soft/40 animate-pop-in",
        { lg: "size-16", md: "size-14", sm: "size-12" }[size],
        className
      )}
    >
      <Icon className={{ lg: "size-8", md: "size-7", sm: "size-6" }[size]} strokeWidth={1.75} />
    </div>
  );
}
