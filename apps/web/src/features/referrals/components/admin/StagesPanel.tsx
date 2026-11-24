"use client";

import { useRevealFormErrors } from "@/hooks/useRevealFormErrors";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ArrowDown, ArrowUp, PencilLine, Plus, Trash2, Zap } from "lucide-react";
import {
  createReferralStageRequestSchema,
  formatReferralPoints,
  REFERRAL_STAGE_TONES,
  REFERRAL_STAGE_TRIGGER_LABELS,
  toMajorUnits,
  toMinorUnits,
  type CreateReferralStageRequest,
  type ReferralStageItem,
  type ReferralStageTone
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { enumLabel } from "@/lib/utils";
import { referralAdminApi } from "../../api/referralAdminApi";
import { useReferralAdminMutation, useReferralSettings, useReferralStages } from "../../hooks/useReferralAdmin";
import { money } from "../../lib/referralFormat";
import { StageBadge } from "../StageBadge";

const TONE_LABELS: Record<ReferralStageTone, string> = {
  accent: "Gold",
  default: "Blue",
  destructive: "Red",
  info: "Light blue",
  secondary: "Grey",
  success: "Green",
  warning: "Amber"
};

/** The admin-editable pipeline: rename, recolour, reorder, add and remove stages. */
export function StagesPanel() {
  const { data: stages, isLoading } = useReferralStages();
  const currency = useReferralSettings().data?.currency ?? "INR";
  const [editing, setEditing] = useState<ReferralStageItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<ReferralStageItem | null>(null);
  const reorder = useReferralAdminMutation(referralAdminApi.reorderStages, { failure: "Could not reorder", success: "Order saved" });
  const remove = useReferralAdminMutation(referralAdminApi.deleteStage, { failure: "Could not delete the stage", success: "Stage deleted" });

  const move = (index: number, delta: -1 | 1) => {
    if (!stages) return;
    const ids = stages.map((stage) => stage.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    reorder.mutate(ids);
  };

  return (
    <SectionCard
      actions={
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Add stage
        </Button>
      }
      description="Each stage sets what one referral reaching it earns: points for a student referrer, money for a coach or sales referrer, and welcome points for the new member. A referral that skips ahead still earns the stages before. Automatic stages move on their own and can be renamed but not deleted."
      title="Pipeline stages and rewards"
    >
      {isLoading || !stages ? (
        <Skeleton className="h-48 rounded-app" />
      ) : (
        <ol className="grid gap-2">
          {stages.map((stage, index) => {
            const actions: RowAction[] = [
              { disabled: index === 0 || reorder.isPending, icon: ArrowUp, label: "Move up", onSelect: () => move(index, -1) },
              {
                disabled: index === stages.length - 1 || reorder.isPending,
                icon: ArrowDown,
                label: "Move down",
                onSelect: () => move(index, 1)
              },
              { icon: PencilLine, label: "Edit stage", onSelect: () => setEditing(stage) }
            ];
            if (stage.trigger === "MANUAL") {
              actions.push({ icon: Trash2, label: "Delete stage", onSelect: () => setDeleting(stage), tone: "danger" });
            }
            return (
              <li
                className="flex flex-col gap-3 rounded-control border border-app-border bg-app-surface p-3 sm:flex-row sm:items-center sm:justify-between"
                key={stage.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 w-6 shrink-0 text-right text-sm font-bold tabular-nums text-app-muted">{index + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StageBadge name={stage.name} tone={stage.tone} />
                      <span className="text-xs text-app-muted">{stage.referralCount} in stage</span>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-xs text-app-muted">
                      {stage.trigger === "MANUAL" ? null : <Zap aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
                      {REFERRAL_STAGE_TRIGGER_LABELS[stage.trigger]}
                      {stage.description ? ` · ${stage.description}` : ""}
                    </p>
                    <StageValueChips currency={currency} stage={stage} />
                  </div>
                </div>
                <RowActions actions={actions} />
              </li>
            );
          })}
        </ol>
      )}

      {editing ? <StageDialog currency={currency} onClose={() => setEditing(null)} stage={editing === "new" ? null : editing} /> : null}

      <ConfirmationModal
        confirmLabel="Delete stage"
        isConfirming={remove.isPending}
        isOpen={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        title={`Delete "${deleting?.name ?? ""}"?`}
      >
        {deleting?.referralCount
          ? `Its ${deleting.referralCount} referral(s) move to the stage before it. Their history keeps a note.`
          : "No referrals are in this stage."}
      </ConfirmationModal>
    </SectionCard>
  );
}

function StageValueChips({ currency, stage }: { stage: ReferralStageItem; currency: string }) {
  // Review R5: opening a link is free for anyone, so this stage never pays a referrer.
  if (stage.trigger === "LINK_VISITED") return <p className="mt-1 text-xs text-app-muted">Never pays a referrer</p>;
  const chips = [
    stage.studentPoints ? `Student ${formatReferralPoints(stage.studentPoints)}` : null,
    stage.coachCashMinor ? `Coach ${money(stage.coachCashMinor, currency)}` : null,
    stage.salesCashMinor ? `Sales ${money(stage.salesCashMinor, currency)}` : null,
    stage.newMemberPoints ? `New member ${formatReferralPoints(stage.newMemberPoints)}` : null
  ].filter((chip): chip is string => chip !== null);
  if (chips.length === 0) return <p className="mt-1 text-xs text-app-muted">No reward at this stage</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Badge key={chip} variant="accent">
          {chip}
        </Badge>
      ))}
    </div>
  );
}

/** "500" → 500 (points), "" → 0; null if not a whole number of 0 or more. */
function parseCount(input: string): number | null {
  const trimmed = input.replace(/,/g, "").trim();
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/** "250" or "" in major units → minor units (0 when blank); null if unusable. */
function parseMoney(input: string, currency: string): number | null {
  if (input.trim() === "") return 0;
  const value = Number(input.replace(/,/g, "").trim());
  return Number.isFinite(value) && value >= 0 ? toMinorUnits(value, currency) : null;
}

function StageDialog({ currency, onClose, stage }: { stage: ReferralStageItem | null; currency: string; onClose: () => void }) {
  const [name, setName] = useState(stage?.name ?? "");
  const [description, setDescription] = useState(stage?.description ?? "");
  const [tone, setTone] = useState<ReferralStageTone>(stage?.tone ?? "info");
  const [studentPoints, setStudentPoints] = useState(stage?.studentPoints ? String(stage.studentPoints) : "");
  const [newMemberPoints, setNewMemberPoints] = useState(stage?.newMemberPoints ? String(stage.newMemberPoints) : "");
  const [coachCash, setCoachCash] = useState(stage?.coachCashMinor ? String(toMajorUnits(stage.coachCashMinor, currency)) : "");
  const [salesCash, setSalesCash] = useState(stage?.salesCashMinor ? String(toMajorUnits(stage.salesCashMinor, currency)) : "");
  // A message goes under the field it is about (UI_RULES § "Form errors").
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  useRevealFormErrors(error);
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);
  const save = useReferralAdminMutation(
    (body: CreateReferralStageRequest) => (stage ? referralAdminApi.updateStage(stage.id, body) : referralAdminApi.createStage(body)),
    { failure: "Could not save the stage", success: stage ? "Stage updated" : "Stage added" }
  );
  const isLost = stage?.trigger === "LOST";
  // Review R5: anyone can open a link or book a demo, so the first never pays a
  // referrer and the second always waits for an admin (the API enforces both).
  const isVisited = stage?.trigger === "LINK_VISITED";
  const isDemoBooked = stage?.trigger === "DEMO_BOOKED";

  const submit = async () => {
    const values = {
      coachCashMinor: parseMoney(coachCash, currency),
      newMemberPoints: parseCount(newMemberPoints),
      salesCashMinor: parseMoney(salesCash, currency),
      studentPoints: parseCount(studentPoints)
    };
    if (values.studentPoints === null) return setError({ field: "student", message: "Use a whole number, 0 or more" });
    if (values.newMemberPoints === null) return setError({ field: "newMember", message: "Use a whole number, 0 or more" });
    if (values.coachCashMinor === null) return setError({ field: "coach", message: "Use an amount of 0 or more" });
    if (values.salesCashMinor === null) return setError({ field: "sales", message: "Use an amount of 0 or more" });
    const parsed = createReferralStageRequestSchema.safeParse({ description: description || null, name, tone, ...values });
    if (!parsed.success) return setError({ field: "name", message: parsed.error.issues[0]?.message ?? "Check the name" });
    setError(null);
    await save.mutateAsync({ ...parsed.data, description: parsed.data.description ?? null });
    onClose();
  };

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{stage ? "Edit stage" : "Add a stage"}</DialogTitle>
          <DialogDescription>
            {stage && stage.trigger !== "MANUAL"
              ? `Automatic: ${REFERRAL_STAGE_TRIGGER_LABELS[stage.trigger].toLowerCase()}.`
              : "A new stage is added at the end; move it into place afterwards. Admins move referrals into it."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65dvh] gap-4 dialog-scroll-body">
          <FormField error={errorFor("name")} id="stage-name" label="Name" required>
            <Input hasError={Boolean(errorFor("name"))} id="stage-name" maxLength={60} onChange={(event) => setName(event.target.value)} value={name} />
          </FormField>
          <FormField id="stage-description" label="Description">
            <Textarea id="stage-description" maxLength={300} onChange={(event) => setDescription(event.target.value)} rows={2} value={description} />
          </FormField>
          <FormField id="stage-tone" label="Colour">
            <div className="flex items-center gap-3">
              <Select
                className="w-44"
                id="stage-tone"
                onChange={(event) => setTone(event.target.value as ReferralStageTone)}
                options={REFERRAL_STAGE_TONES.map((value) => ({ label: TONE_LABELS[value] ?? enumLabel(value), value }))}
                value={tone}
              />
              <StageBadge name={name || "Preview"} tone={tone} />
            </div>
          </FormField>
          <fieldset className="grid gap-3 rounded-control border border-app-border p-3">
            <legend className="px-1 text-sm font-semibold text-app-text">Reward per referral reaching this stage</legend>
            {isVisited ? (
              <p className="text-xs text-app-muted">
                None. Anyone can open a referral link, so this stage never pays a referrer; rewards start from the next stage.
              </p>
            ) : isLost ? (
              <p className="text-xs text-app-muted">Usually nothing: these referrals decided not to join.</p>
            ) : (
              <p className="text-xs text-app-muted">
                Blank = nothing. Applies to referrals reaching the stage from now on.
                {isDemoBooked ? " Referrer rewards here always wait for an admin to approve them, even with automatic approval on." : ""}
              </p>
            )}
            <div className={cn("grid gap-x-3 gap-y-4 sm:grid-cols-2", isVisited && "hidden")}>
              <FormField error={errorFor("student")} hint="Spent in the rewards store" id="stage-student" label="Student referrer (points)">
                <Input hasError={Boolean(errorFor("student"))} id="stage-student" inputMode="numeric" onChange={(event) => setStudentPoints(event.target.value)} value={studentPoints} />
              </FormField>
              <FormField error={errorFor("newMember")} hint="Once their account is linked" id="stage-new-member" label="New member (points)">
                <Input hasError={Boolean(errorFor("newMember"))} id="stage-new-member" inputMode="numeric" onChange={(event) => setNewMemberPoints(event.target.value)} value={newMemberPoints} />
              </FormField>
              <FormField error={errorFor("coach")} hint="Withdrawable" id="stage-coach" label={`Coach referrer (${currency})`}>
                <Input hasError={Boolean(errorFor("coach"))} id="stage-coach" inputMode="decimal" onChange={(event) => setCoachCash(event.target.value)} value={coachCash} />
              </FormField>
              <FormField error={errorFor("sales")} hint="Withdrawable" id="stage-sales" label={`Sales referrer (${currency})`}>
                <Input hasError={Boolean(errorFor("sales"))} id="stage-sales" inputMode="decimal" onChange={(event) => setSalesCash(event.target.value)} value={salesCash} />
              </FormField>
            </div>
          </fieldset>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="neutral">
            Cancel
          </Button>
          <Button isLoading={save.isPending} onClick={() => void submit().catch(() => undefined)}>
            {stage ? "Save stage" : "Add stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
