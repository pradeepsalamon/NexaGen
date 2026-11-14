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
        "flex flex-col items-center justify-center text-center animate-in fade-in",
        variant === "page"
          ? "min-h-[300px] rounded-app border-2 border-dashed border-app-border bg-app-surface/50 p-8"
          : "px-4 py-10"
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-app-soft">
        <Icon aria-hidden="true" className="size-6 text-app-muted" strokeWidth={2.25} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-app-text">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-app-muted max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} variant="outline" className="mt-6">
          {action.label}
        </Button>
      )}
    </div>
  );
}
