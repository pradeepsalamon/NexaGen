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
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary-soft text-primary-ink ring-8 ring-primary-soft/40 animate-pop-in",
          variant === "page" ? "size-16" : "size-14"
        )}
      >
        <Icon aria-hidden="true" className={variant === "page" ? "size-8" : "size-7"} strokeWidth={1.75} />
      </div>
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
