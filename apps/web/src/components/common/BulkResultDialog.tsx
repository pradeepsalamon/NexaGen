"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";

export type BulkResult = {
  /** "Archive", "Delete" … */
  action: string;
  failed: { label: string; reason: string }[];
  succeeded: number;
};

/** Summary after a bulk action: how many worked, and which ones did not and why. */
export function BulkResultDialog({
  onClose,
  result
}: {
  onClose: () => void;
  result: BulkResult | null;
}) {
  const failedCount = result?.failed.length ?? 0;

  return (
    <AlertDialog
      open={!!result}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent className="justify-items-center text-center">
        {result ? (
          <>
            <span
              className={
                failedCount
                  ? "flex size-10 items-center justify-center rounded-full bg-warning-soft text-warning-ink"
                  : "flex size-10 items-center justify-center rounded-full bg-success-soft text-success-ink"
              }
            >
              {failedCount ? (
                <CircleAlert aria-hidden="true" className="size-6" strokeWidth={2.25} />
              ) : (
                <CheckCircle2 aria-hidden="true" className="size-6" strokeWidth={2.25} />
              )}
            </span>
            <div className="space-y-2">
              <AlertDialogTitle>{result.action} finished</AlertDialogTitle>
              <AlertDialogDescription>
                {result.succeeded} succeeded{failedCount ? `, ${failedCount} skipped` : ""}.
              </AlertDialogDescription>
            </div>
            <div className="grid w-full grid-cols-2 gap-2.5">
              <div className="rounded-[14px] border border-success/30 bg-success/[0.07] p-3">
                <p className="text-2xl font-bold text-success-ink">{result.succeeded}</p>
                <p className="text-xs font-semibold text-success-ink">Succeeded</p>
              </div>
              <div className="rounded-control bg-warning-soft p-3">
                <p className="text-2xl font-bold text-warning-ink">{failedCount}</p>
                <p className="text-xs font-semibold text-warning-ink">Skipped</p>
              </div>
            </div>
            {failedCount ? (
              <ul className="max-h-40 w-full space-y-1.5 overflow-y-auto text-left text-sm">
                {result.failed.map((item) => (
                  <li className="rounded-control bg-app-soft px-3 py-2" key={item.label}>
                    <span className="font-semibold text-app-text">{item.label}</span>
                    <span className="block text-xs text-app-muted">{item.reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <AlertDialogAction asChild>
              <Button>Done</Button>
            </AlertDialogAction>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
