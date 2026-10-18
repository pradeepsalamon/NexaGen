import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type ApplicationCardProps = {
  details: ReactNode[];
  footnote: string;
  name: string;
  onApprove: () => void;
  onDecline: () => void;
};

export function ApplicationCard({ details, footnote, name, onApprove, onDecline }: ApplicationCardProps) {
  const visible = details.filter(Boolean);
  return (
    <div className="flex flex-col gap-4 rounded-panel border border-app-border bg-app-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-app-text">{name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-app-muted">
          {visible.map((detail, index) => (
            <span className="flex min-w-0 items-center gap-4 break-all" key={index}>
              {index > 0 ? <span aria-hidden="true">•</span> : null}
              {detail}
            </span>
          ))}
        </div>
        <div className="mt-2 text-xs text-app-muted opacity-75">{footnote}</div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          className="border-app-danger/30 text-app-danger-ink hover:bg-app-danger/10 hover:text-app-danger-ink"
          onClick={onDecline}
          variant="outline"
        >
          <X className="mr-2 size-4" />
          Decline
        </Button>
        <Button onClick={onApprove}>
          <Check className="mr-2 size-4" />
          Approve
        </Button>
      </div>
    </div>
  );
}

export function ApplicationListSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4">
      <div className="h-24 w-full rounded-panel border border-app-border bg-app-surface" />
      <div className="h-24 w-full rounded-panel border border-app-border bg-app-surface" />
    </div>
  );
}
