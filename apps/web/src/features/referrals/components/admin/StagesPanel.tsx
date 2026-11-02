"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, PencilLine, Plus, Trash2, Zap } from "lucide-react";
import {
  createReferralStageRequestSchema,
  REFERRAL_STAGE_TONES,
  REFERRAL_STAGE_TRIGGER_LABELS,
  type ReferralStageItem,
  type ReferralStageTone
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Alert } from "@/components/ui/Alert";
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
import { useReferralAdminMutation, useReferralStages } from "../../hooks/useReferralAdmin";
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
      description="Automatic stages move on their own (visit, demo booking, attendance) and can be renamed but not deleted. Automatic moves only go forward in this order; admins can move a referral anywhere."
      title="Pipeline stages"
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
                  </div>
                </div>
                <RowActions actions={actions} />
              </li>
            );
          })}
        </ol>
      )}

      {editing ? <StageDialog onClose={() => setEditing(null)} stage={editing === "new" ? null : editing} /> : null}

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

function StageDialog({ onClose, stage }: { stage: ReferralStageItem | null; onClose: () => void }) {
  const [name, setName] = useState(stage?.name ?? "");
  const [description, setDescription] = useState(stage?.description ?? "");
  const [tone, setTone] = useState<ReferralStageTone>(stage?.tone ?? "info");
  const [error, setError] = useState<string | null>(null);
  const save = useReferralAdminMutation(
    (body: { name: string; description: string | null; tone: ReferralStageTone }) =>
      stage ? referralAdminApi.updateStage(stage.id, body) : referralAdminApi.createStage(body),
    { failure: "Could not save the stage", success: stage ? "Stage updated" : "Stage added" }
  );

  const submit = async () => {
    const parsed = createReferralStageRequestSchema.safeParse({ description: description || null, name, tone });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form.");
    setError(null);
    await save.mutateAsync({ description: parsed.data.description ?? null, name: parsed.data.name, tone: parsed.data.tone });
    onClose();
  };

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{stage ? "Edit stage" : "Add a stage"}</DialogTitle>
          <DialogDescription>
            {stage && stage.trigger !== "MANUAL"
              ? `Automatic: ${REFERRAL_STAGE_TRIGGER_LABELS[stage.trigger].toLowerCase()}.`
              : "A new stage is added at the end; move it into place afterwards. Admins move referrals into it."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField id="stage-name" label="Name" required>
            <Input id="stage-name" maxLength={60} onChange={(event) => setName(event.target.value)} value={name} />
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
          {error ? <Alert variant="error">{error}</Alert> : null}
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
