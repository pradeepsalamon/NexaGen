import type { ReactNode } from "react";
import { type LucideIcon, Inbox } from "lucide-react";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-app border border-dashed border-app-border bg-app-surface/50 p-8 text-center animate-in fade-in">
      <div className="flex size-14 items-center justify-center rounded-full bg-app-soft">
        <Icon className="size-6 text-app-muted" />
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
