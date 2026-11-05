"use client";

import { Archive, Copy, Pencil, Plus, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { formatMoney, PLAN_FEATURE_KEYS, PLAN_LIMIT_KEYS, PLAN_LIMITS, type PlatformPlanSummary } from "@nexa-chess/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";
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
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import {
  useApplyPlatformPlanToExisting,
  useDuplicatePlatformPlan,
  usePlatformPlans,
  useRetirePlatformPlan
} from "../hooks/usePlatformApi";
import { PlanEditorDialog } from "./PlanEditorDialog";

const limitText = (value: number | null) => (value === null ? "∞" : String(value));

function DuplicateDialog({ onClose, plan }: { onClose: () => void; plan: PlatformPlanSummary }) {
  const duplicate = useDuplicatePlatformPlan();
  const [code, setCode] = useState(`${plan.code}_COPY`);
  const [name, setName] = useState(`${plan.name} (copy)`);
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate {plan.name}</DialogTitle>
          <DialogDescription>The copy starts hidden, with the same features, limits and prices.</DialogDescription>
        </DialogHeader>
        <FormField hint="A–Z, 0–9 and _." id="duplicate-code" label="Code" required>
          <Input id="duplicate-code" onChange={(event) => setCode(event.target.value.toUpperCase())} value={code} />
        </FormField>
        <FormField id="duplicate-name" label="Name" required>
          <Input id="duplicate-name" onChange={(event) => setName(event.target.value)} value={name} />
        </FormField>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button
            disabled={!code.trim() || !name.trim()}
            isLoading={duplicate.isPending}
            onClick={() => {
              duplicate.mutateAsync({ body: { code: code.trim(), name: name.trim() }, id: plan.id }).then(onClose, () => undefined);
            }}
            type="button"
          >
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlansTab() {
  const plans = usePlatformPlans();
  const retire = useRetirePlatformPlan();
  const apply = useApplyPlatformPlanToExisting();
  const [editing, setEditing] = useState<PlatformPlanSummary | "new" | null>(null);
  const [duplicating, setDuplicating] = useState<PlatformPlanSummary | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "apply" | "retire"; plan: PlatformPlanSummary } | null>(null);

  if (plans.isError) return <WidgetError message="Could not load plans." onRetry={() => void plans.refetch()} />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-app-muted">
          Editing a plan makes a new version. Academies stay on their version until you apply it to them.
        </p>
        <Button className="ml-auto" onClick={() => setEditing("new")} type="button">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          New plan
        </Button>
      </div>

      {plans.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-panel border border-app-border bg-app-surface shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Price / month</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead className="text-right">Features</TableHead>
                <TableHead>Lapse</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(plans.data?.plans ?? []).map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-app-text">{plan.name}</span>
                      <Badge variant="outline">v{plan.version}</Badge>
                      {!plan.isActive ? <Badge variant="secondary">Retired</Badge> : null}
                      {plan.isActive && !plan.isPublic ? <Badge variant="info">Hidden</Badge> : null}
                    </div>
                    <p className="text-xs text-app-muted">
                      {plan.code}
                      {plan.trialDays > 0 ? ` · ${plan.trialDays}-day trial` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {plan.priceMonthlyMinor === null ? "Contact us" : formatMoney(plan.priceMonthlyMinor, plan.currency)}
                  </TableCell>
                  <TableCell className="text-xs text-app-muted">
                    {PLAN_LIMIT_KEYS.map((key) => `${PLAN_LIMITS[key].label} ${limitText(plan.limits[key])}`).join(" · ")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {plan.features.length}/{PLAN_FEATURE_KEYS.length}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-app-muted">
                    {plan.lapse.pastDueDays}d due · {plan.lapse.graceDays}d grace
                  </TableCell>
                  <TableCell>
                    <RowActions
                      actions={[
                        { ariaLabel: `Edit ${plan.name}`, icon: Pencil, label: "Edit", onSelect: () => setEditing(plan) },
                        {
                          ariaLabel: `Duplicate ${plan.name}`,
                          icon: Copy,
                          label: "Duplicate",
                          onSelect: () => setDuplicating(plan)
                        },
                        {
                          ariaLabel: `Apply ${plan.name} v${plan.version} to existing academies`,
                          icon: RefreshCcw,
                          label: "Apply to existing academies",
                          onSelect: () => setConfirm({ kind: "apply", plan })
                        },
                        {
                          ariaLabel: `Retire ${plan.name}`,
                          disabled: !plan.isActive,
                          icon: Archive,
                          label: "Retire",
                          onSelect: () => setConfirm({ kind: "retire", plan }),
                          tone: "danger"
                        }
                      ]}
                      inline={2}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing ? <PlanEditorDialog onClose={() => setEditing(null)} plan={editing === "new" ? null : editing} /> : null}
      {duplicating ? <DuplicateDialog onClose={() => setDuplicating(null)} plan={duplicating} /> : null}

      <AlertDialog onOpenChange={(open) => !open && setConfirm(null)} open={confirm !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "retire" ? `Retire ${confirm.plan.name}?` : `Move academies to ${confirm?.plan.name} v${confirm?.plan.version}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "retire"
                ? "No new academy can choose it. Academies already on it keep it until you move them."
                : "Every academy on an older version of this plan gets its current features, limits and lapse rules now."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === "retire") retire.mutate(confirm.plan.id);
                else apply.mutate(confirm.plan.id);
              }}
            >
              {confirm?.kind === "retire" ? "Retire plan" : "Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
