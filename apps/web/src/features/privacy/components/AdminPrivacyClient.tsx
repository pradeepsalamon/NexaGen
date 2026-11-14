"use client";

import { useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import { ACCOUNT_DELETION_STATUS_LABELS, type AccountDeletionRequestItem } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatRelativeDay } from "@/lib/datetime";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { completeDeletionRequest, rejectDeletionRequest } from "../api/privacyApi";
import { PRIVACY_INVALIDATES, useDeletionRequests } from "../hooks/usePrivacyApi";

type Decision = { request: AccountDeletionRequestItem; complete: boolean };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  COACH: "Coach",
  STUDENT: "Student",
  SUPER_ADMIN: "Super admin"
};

export function AdminPrivacyClient() {
  const tz = useUserTimeZone();
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const { data, isLoading } = useDeletionRequests();

  // Held for the undo window before it's sent; a completed deletion can still
  // be reversed afterwards from Trash for 30 days.
  const { run: decide } = useUndoableMutation({
    strategy: "defer",
    mutationFn: ({ request, complete, note }: Decision & { note: string }) =>
      complete
        ? completeDeletionRequest(request.id, { note: note || undefined })
        : rejectDeletionRequest(request.id, { note }),
    undo: async () => {},
    toast: ({ request, complete }) => ({
      title: `${complete ? "Deleting" : "Declining"} ${request.userName}'s account request`
    }),
    invalidates: PRIVACY_INVALIDATES
  });

  const requests = data?.requests ?? [];
  const noteRequired = deciding ? !deciding.complete : false;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Privacy requests</h1>
        <p className="mt-1 text-app-muted">
          Account deletion requests. Completing one soft-deletes the account (restorable from Trash for
          30 days); invoices and payroll are always kept.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-app" />
          <Skeleton className="h-24 w-full rounded-app" />
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <EmptyState variant="inline"
            description="When someone asks for their account to be deleted, it appears here."
            icon={Inbox}
            title="No deletion requests"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between" key={r.id}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-app-text">{r.userName}</span>
                  <Badge variant="outline">{ROLE_LABELS[r.userRole] ?? r.userRole}</Badge>
                  <Badge variant={r.status === "PENDING" ? "warning" : "secondary"}>
                    {ACCOUNT_DELETION_STATUS_LABELS[r.status]}
                  </Badge>
                </div>
                <p className="break-all text-sm text-app-muted">
                  {r.userEmail} · asked {formatRelativeDay(r.createdAt, tz).toLowerCase()}
                </p>
                {r.reason ? <p className="text-sm text-app-text">“{r.reason}”</p> : null}
                {r.reviewNote ? (
                  <p className="text-sm text-app-muted">
                    {r.reviewedByName ?? "Admin"}: {r.reviewNote}
                  </p>
                ) : null}
              </div>
              {r.status === "PENDING" ? (
                <div className="flex shrink-0 gap-2">
                  <SimpleTooltip label="Delete the account">
                    <Button
                      aria-label="Delete the account"
                      className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
                      onClick={() => {
                        setNote("");
                        setDeciding({ complete: true, request: r });
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                  <SimpleTooltip label="Decline">
                    <Button
                      aria-label="Decline the request"
                      className="size-8 rounded-full border border-app-border bg-app-soft p-0 text-app-text shadow-none transition-colors hover:bg-app-border"
                      onClick={() => {
                        setNote("");
                        setDeciding({ complete: false, request: r });
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <Dialog onOpenChange={(open) => !open && setDeciding(null)} open={!!deciding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deciding?.complete ? `Delete ${deciding.request.userName}'s account?` : "Decline this request?"}
            </DialogTitle>
            <DialogDescription>
              {deciding?.complete
                ? "They are signed out everywhere and emailed. You can restore the account from Trash within 30 days."
                : "They keep their account and are emailed your reason."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label={noteRequired ? "Reason (required)" : "Note (optional)"}
            className="mt-4"
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder={noteRequired ? "Why it can't be done yet (sent to them)" : "Note (optional, sent to them)"}
            rows={3}
            value={note}
          />
          <DialogFooter className="mt-6">
            <Button onClick={() => setDeciding(null)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={noteRequired && !note.trim()}
              onClick={() => {
                if (!deciding) return;
                decide({ ...deciding, note: note.trim() });
                setDeciding(null);
              }}
              type="button"
              variant={deciding?.complete ? "destructive" : "primary"}
            >
              {deciding?.complete ? "Delete account" : "Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
