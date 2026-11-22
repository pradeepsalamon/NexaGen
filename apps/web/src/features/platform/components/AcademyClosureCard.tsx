"use client";

import { useState } from "react";
import { Download, ShieldX } from "lucide-react";
import {
  closureNameMatches,
  TENANT_CLOSURE_CHOICE_LABELS,
  type PlatformTenantDetail,
  type TenantClosureChoice
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { WidgetError } from "@/components/ui/WidgetError";
import { useClosures, useCloseAcademy } from "../hooks/usePlatformApi";
import { ClosuresTable, useAcademyExportDownload } from "./ClosuresTable";

/**
 * One academy's closures, its data download, and closing it on a request the
 * academy made by email or phone (docs/ACADEMY_CLOSURE.md).
 */
export function AcademyClosureCard({ tenant }: { tenant: PlatformTenantDetail }) {
  const closures = useClosures({ tenantId: tenant.id });
  const { busy, download } = useAcademyExportDownload();
  const [closing, setClosing] = useState(false);
  const open = closures.data?.closures.some((closure) => ["REQUESTED", "PURGE_SCHEDULED", "PURGING"].includes(closure.status));

  return (
    <SectionCard
      actions={
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy === tenant.id} isLoading={busy === tenant.id} onClick={() => void download(tenant.id, tenant.slug)} variant="outline">
            <Download aria-hidden className="size-4" strokeWidth={2.5} />
            Download data
          </Button>
          <Button disabled={open || tenant.status === "DEACTIVATED"} onClick={() => setClosing(true)} variant="destructive">
            <ShieldX aria-hidden className="size-4" strokeWidth={2.5} />
            Close academy
          </Button>
        </div>
      }
      description="Only when the academy asks. It chooses to keep its data or to delete it; invoices, payments and payroll records are always kept."
      title="Closing the academy"
    >
      <div className="p-4">
        {closures.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : closures.isError ? (
          <WidgetError message="Couldn't load closure requests." onRetry={() => void closures.refetch()} />
        ) : (
          <ClosuresTable closures={closures.data?.closures ?? []} showAcademy={false} />
        )}
      </div>
      {closing ? <CloseDialog onClose={() => setClosing(false)} tenant={tenant} /> : null}
    </SectionCard>
  );
}

function CloseDialog({ onClose, tenant }: { onClose: () => void; tenant: PlatformTenantDetail }) {
  const close = useCloseAcademy(tenant.id);
  const [choice, setChoice] = useState<TenantClosureChoice>("KEEP_DATA");
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  return (
    <Dialog onOpenChange={(value) => !value && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close {tenant.name}</DialogTitle>
          <DialogDescription>
            For a request the academy made by email or phone. The academy closes now: its addresses stop working and everyone is
            signed out.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2" role="group" aria-label="What happens to the academy's data">
          {(["KEEP_DATA", "DELETE_DATA"] as const).map((option) => (
            <ChoiceTile key={option} onClick={() => setChoice(option)} selected={choice === option}>
              <span className="text-sm font-medium text-app-text">{TENANT_CLOSURE_CHOICE_LABELS[option]}</span>
            </ChoiceTile>
          ))}
        </div>
        <FormField hint="Saved in the audit log." id="close-reason" label="How and when the academy asked" required>
          <Textarea id="close-reason" maxLength={2000} onChange={(event) => setReason(event.target.value)} rows={3} value={reason} />
        </FormField>
        <FormField hint="Type the academy's name exactly to confirm." id="close-confirm-name" label="Academy name" required>
          <Input autoComplete="off" id="close-confirm-name" onChange={(event) => setName(event.target.value)} value={name} />
        </FormField>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button
            disabled={!closureNameMatches(name, tenant.name) || reason.trim().length < 3}
            isLoading={close.isPending}
            onClick={() => {
              close.mutateAsync({ choice, confirmName: name, reason: reason.trim() }).then(onClose, () => undefined);
            }}
            type="button"
            variant="destructive"
          >
            {choice === "DELETE_DATA" ? "Close and schedule deletion" : "Close the academy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
