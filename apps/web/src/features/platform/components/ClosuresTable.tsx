"use client";

import { useState } from "react";
import { Download, RotateCcw, ShieldX, Undo2, XCircle, CheckCircle2 } from "lucide-react";
import {
  closureNameMatches,
  TENANT_CLOSURE_STATUS_LABELS,
  type TenantClosureStatus,
  type TenantClosureSummary
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { saveBlob } from "@/lib/saveBlob";
import { useToast } from "@/providers/ToastProvider";
import { downloadAcademyExport } from "../api/platformApi";
import {
  useApproveClosure,
  useCancelClosurePurge,
  useDeclineClosure,
  useReopenClosedAcademy
} from "../hooks/usePlatformApi";
import { ReasonDialog } from "./ReasonDialog";

const STATUS_VARIANT: Record<TenantClosureStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "info"> = {
  CANCELLED: "secondary",
  CLOSED: "secondary",
  DECLINED: "secondary",
  PURGED: "destructive",
  PURGE_SCHEDULED: "warning",
  PURGING: "warning",
  REOPENED: "success",
  REQUESTED: "info",
  WITHDRAWN: "secondary"
};

type Action = { kind: "approve" | "decline" | "cancel" | "reopen"; closure: TenantClosureSummary };

/** Download an academy's data as a file (also used on the academy page). */
export function useAcademyExportDownload() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const download = async (tenantId: string, slug: string) => {
    setBusy(tenantId);
    try {
      saveBlob(await downloadAcademyExport(tenantId), `academy-${slug}-export.ndjson.gz`);
    } catch (error) {
      toast.error({ message: error instanceof Error ? error.message : undefined, title: "Download failed" });
    } finally {
      setBusy(null);
    }
  };
  return { busy, download };
}

/**
 * Closure requests and their outcomes, with the operator's actions
 * (docs/ACADEMY_CLOSURE.md). Every action is written to the platform audit log.
 * undo: intentionally excluded — each decision has its own reverse action here
 * (cancel the deletion, reopen) and an audit row; a toast undo would bypass both.
 */
export function ClosuresTable({ closures, showAcademy = true }: { closures: TenantClosureSummary[]; showAcademy?: boolean }) {
  const timeZone = useUserTimeZone();
  const [action, setAction] = useState<Action | null>(null);
  const { busy, download } = useAcademyExportDownload();
  const decline = useDeclineClosure();
  const cancel = useCancelClosurePurge();
  const reopen = useReopenClosedAcademy();

  if (closures.length === 0) {
    return <EmptyState description="No academy has asked to close." title="No closure requests" />;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            {showAcademy ? <TableHead>Academy</TableHead> : null}
            <TableHead>Data</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Asked</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead pin="end">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {closures.map((closure) => (
            <TableRow key={closure.id}>
              {showAcademy ? (
                <TableCell>
                  <div className="font-medium text-app-text">{closure.tenantName}</div>
                  <div className="text-xs text-app-muted">{closure.tenantSlug}</div>
                </TableCell>
              ) : null}
              <TableCell>{closure.choice === "DELETE_DATA" ? "Delete" : "Keep"}</TableCell>
              <TableCell>
                <div className="grid gap-1">
                  <Badge variant={STATUS_VARIANT[closure.status]}>{TENANT_CLOSURE_STATUS_LABELS[closure.status]}</Badge>
                  {closure.purgeAfter && closure.status === "PURGE_SCHEDULED" ? (
                    <span className="text-xs text-app-muted">Deletes after {formatDateTime(closure.purgeAfter, timeZone)}</span>
                  ) : null}
                  {closure.purgeReport ? (
                    <span className="text-xs text-app-muted">
                      {closure.purgeReport.deletedRows} rows deleted, {closure.purgeReport.anonymisedUsers} people anonymised,{" "}
                      {Object.values(closure.purgeReport.keptRows).reduce((sum, count) => sum + count, 0)} rows kept
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <div>{formatDateTime(closure.requestedAt, timeZone)}</div>
                <div className="text-xs text-app-muted">{closure.requestedByName ?? "Recorded by the platform"}</div>
              </TableCell>
              <TableCell className="max-w-xs">
                <p className="line-clamp-3 text-sm">{closure.reason ?? "—"}</p>
                {closure.decisionNote ? <p className="text-xs text-app-muted">Note: {closure.decisionNote}</p> : null}
              </TableCell>
              <TableCell pin="end">
                <RowActions
                  actions={[
                    ...(closure.status === "REQUESTED"
                      ? [
                          { ariaLabel: `Approve closing ${closure.tenantName}`, icon: CheckCircle2, label: "Approve", onSelect: () => setAction({ closure, kind: "approve" as const }), tone: "danger" as const },
                          { ariaLabel: `Decline closing ${closure.tenantName}`, icon: XCircle, label: "Decline", onSelect: () => setAction({ closure, kind: "decline" as const }) }
                        ]
                      : []),
                    ...(closure.status === "PURGE_SCHEDULED"
                      ? [{ ariaLabel: `Cancel deleting ${closure.tenantName}`, icon: Undo2, label: "Cancel deletion", onSelect: () => setAction({ closure, kind: "cancel" as const }), tone: "warning" as const }]
                      : []),
                    ...(closure.status === "CLOSED" || closure.status === "CANCELLED"
                      ? [{ ariaLabel: `Reopen ${closure.tenantName}`, icon: RotateCcw, label: "Reopen academy", onSelect: () => setAction({ closure, kind: "reopen" as const }) }]
                      : []),
                    ...(closure.status !== "PURGED" && closure.status !== "PURGING"
                      ? [{ ariaLabel: `Download ${closure.tenantName}'s data`, disabled: busy === closure.tenantId, icon: Download, label: "Download data", onSelect: () => void download(closure.tenantId, closure.tenantSlug) }]
                      : [])
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {action?.kind === "approve" ? <ApproveDialog closure={action.closure} onClose={() => setAction(null)} /> : null}
      {action?.kind === "decline" ? (
        <ReasonDialog
          confirmLabel="Decline"
          description={`${action.closure.tenantName} carries on as before. The super admin who asked gets your note by email.`}
          isPending={decline.isPending}
          label="Note for the academy"
          onClose={() => setAction(null)}
          onConfirm={(note) => decline.mutateAsync({ body: { note }, id: action.closure.id })}
          title={`Decline closing ${action.closure.tenantName}?`}
        />
      ) : null}
      {action?.kind === "cancel" ? (
        <ReasonDialog
          confirmLabel="Cancel the deletion"
          description={`${action.closure.tenantName} stays closed, with its data kept. You can reopen it afterwards.`}
          isPending={cancel.isPending}
          onClose={() => setAction(null)}
          onConfirm={(note) => cancel.mutateAsync({ body: { note }, id: action.closure.id })}
          title={`Stop deleting ${action.closure.tenantName}?`}
        />
      ) : null}
      {action?.kind === "reopen" ? (
        <ReasonDialog
          confirmLabel="Reopen"
          description={`${action.closure.tenantName}'s addresses work again and its people can sign in. Check its subscription afterwards.`}
          isPending={reopen.isPending}
          onClose={() => setAction(null)}
          onConfirm={(note) => reopen.mutateAsync({ body: { note }, id: action.closure.id })}
          title={`Reopen ${action.closure.tenantName}?`}
        />
      ) : null}
    </>
  );
}

function ApproveDialog({ closure, onClose }: { closure: TenantClosureSummary; onClose: () => void }) {
  const approve = useApproveClosure();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const deleting = closure.choice === "DELETE_DATA";
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <ShieldX aria-hidden className="size-5 text-app-danger-ink" strokeWidth={2.5} />
              Close {closure.tenantName}?
            </span>
          </DialogTitle>
          <DialogDescription>
            {deleting
              ? "The academy closes now: its addresses stop working and everyone is signed out. Its data is deleted after the undo window, except invoices, payments and payroll records, which the law requires us to keep. Download its data first if anyone may need it."
              : "The academy closes now: its addresses stop working and everyone is signed out. Its data is kept, and you can reopen it later."}
          </DialogDescription>
        </DialogHeader>
        <FormField hint="Type the academy's name exactly to confirm." id="closure-confirm-name" label="Academy name" required>
          <Input autoComplete="off" id="closure-confirm-name" onChange={(event) => setName(event.target.value)} value={name} />
        </FormField>
        <FormField hint="Emailed to the super admin who asked, and saved in the audit log." id="closure-note" label="Note (optional)">
          <Textarea id="closure-note" maxLength={2000} onChange={(event) => setNote(event.target.value)} rows={3} value={note} />
        </FormField>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button
            disabled={!closureNameMatches(name, closure.tenantName)}
            isLoading={approve.isPending}
            onClick={() => {
              approve
                .mutateAsync({ body: { confirmName: name, note: note.trim() || undefined }, id: closure.id })
                .then(onClose, () => undefined);
            }}
            type="button"
            variant="destructive"
          >
            {deleting ? "Close and schedule deletion" : "Close the academy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
