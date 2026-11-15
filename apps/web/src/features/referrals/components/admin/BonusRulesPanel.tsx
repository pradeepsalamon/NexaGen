"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PencilLine, Plus, Trash2, Trophy } from "lucide-react";
import {
  formatReferralPoints,
  REFERRAL_BONUS_AUDIENCE_LABELS,
  REFERRAL_BONUS_AUDIENCES,
  toMajorUnits,
  type ReferralBonusRuleItem,
  type ReferralStageItem
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { referralAdminApi } from "../../api/referralAdminApi";
import { useReferralAdminMutation, useReferralBonusRules, useReferralSettings, useReferralStages } from "../../hooks/useReferralAdmin";
import { money, parseMajorAmount, parseWhole } from "../../lib/referralFormat";

/** Milestone bonuses: every N of a referrer's referrals reaching a stage pays extra. */
export function BonusRulesPanel() {
  const { data: rules, isLoading } = useReferralBonusRules();
  const { data: stages = [] } = useReferralStages();
  const currency = useReferralSettings().data?.currency ?? "INR";
  const [editing, setEditing] = useState<ReferralBonusRuleItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<ReferralBonusRuleItem | null>(null);
  const remove = useReferralAdminMutation(referralAdminApi.deleteBonusRule, { failure: "Could not delete the bonus", success: "Bonus removed" });
  const amount = (rule: ReferralBonusRuleItem) =>
    rule.audience === "STUDENTS" ? formatReferralPoints(rule.amount) : money(rule.amount, rule.currency);

  return (
    <SectionCard
      actions={
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          New bonus
        </Button>
      }
      description="Extra rewards on top of the stage values: every N referrals that reach a stage. Students get points; coaches and sales staff get money."
      title="Milestone bonuses"
    >
      {isLoading ? (
        <Skeleton className="h-40 rounded-app" />
      ) : rules?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bonus</TableHead>
              <TableHead>When</TableHead>
              <TableHead>For</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead pin="end">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>
                  <p className="flex items-center gap-2 font-bold text-app-text">
                    {rule.name}
                    {rule.isActive ? null : <Badge variant="secondary">Off</Badge>}
                  </p>
                  <p className="text-xs text-app-muted">{rule.rewardCount} paid so far</p>
                </TableCell>
                <TableCell className="text-sm">
                  Every {rule.everyCount} reaching <span className="font-bold">{rule.stageName}</span>
                </TableCell>
                <TableCell className="text-sm">{REFERRAL_BONUS_AUDIENCE_LABELS[rule.audience]}</TableCell>
                <TableCell>
                  <Badge variant={rule.autoApprove ? "success" : "warning"}>{rule.autoApprove ? "Automatic" : "Admin approves"}</Badge>
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">{amount(rule)}</TableCell>
                <TableCell pin="end">
                  <RowActions
                    actions={[
                      { icon: PencilLine, label: "Edit bonus", onSelect: () => setEditing(rule) },
                      { icon: Trash2, label: "Delete bonus", onSelect: () => setDeleting(rule), tone: "danger" }
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          description="For example: 500 bonus points to a student for every 3 referrals who are onboarded."
          icon={Trophy}
          title="No bonuses yet"
          variant="inline"
        />
      )}

      {editing ? (
        <BonusDialog currency={currency} onClose={() => setEditing(null)} rule={editing === "new" ? null : editing} stages={stages} />
      ) : null}

      <ConfirmationModal
        confirmLabel="Delete bonus"
        isConfirming={remove.isPending}
        isOpen={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        title="Delete this bonus?"
      >
        {deleting?.rewardCount
          ? "It has already paid out, so it is switched off instead of deleted. Earned rewards are kept."
          : "Nothing has been paid from it."}
      </ConfirmationModal>
    </SectionCard>
  );
}

const bonusFormSchema = z.object({
  amount: z.string().min(1, "Enter an amount."),
  audience: z.enum(REFERRAL_BONUS_AUDIENCES),
  autoApprove: z.boolean(),
  description: z.string().max(500),
  everyCount: z.string().refine((value) => (parseWhole(value) ?? 0) >= 2, "A milestone is at least 2 referrals."),
  isActive: z.boolean(),
  name: z.string().trim().min(1, "Name is required.").max(120),
  stageId: z.string().min(1, "Pick a stage.")
});
type BonusForm = z.infer<typeof bonusFormSchema>;

function BonusDialog({
  currency,
  onClose,
  rule,
  stages
}: {
  rule: ReferralBonusRuleItem | null;
  stages: ReferralStageItem[];
  currency: string;
  onClose: () => void;
}) {
  const defaultStage = stages.find((stage) => stage.trigger === "CONVERTED") ?? stages[0];
  const form = useForm<BonusForm>({
    defaultValues: {
      amount: rule ? (rule.audience === "STUDENTS" ? String(rule.amount) : String(toMajorUnits(rule.amount, rule.currency))) : "",
      audience: rule?.audience ?? "STUDENTS",
      autoApprove: rule?.autoApprove ?? true,
      description: rule?.description ?? "",
      everyCount: String(rule?.everyCount ?? 3),
      isActive: rule?.isActive ?? true,
      name: rule?.name ?? "",
      stageId: rule?.stageId ?? defaultStage?.id ?? ""
    },
    resolver: zodResolver(bonusFormSchema)
  });
  const { errors } = form.formState;
  const isPoints = form.watch("audience") === "STUDENTS";

  const save = useReferralAdminMutation(
    async (values: BonusForm) => {
      const amount = values.audience === "STUDENTS" ? parseWhole(values.amount) : parseMajorAmount(values.amount, currency);
      if (amount === null) throw new Error(values.audience === "STUDENTS" ? "Enter a whole number of points." : "Enter an amount above zero.");
      const body = {
        amount,
        audience: values.audience,
        autoApprove: values.autoApprove,
        description: values.description.trim() || null,
        everyCount: parseWhole(values.everyCount) ?? 2,
        isActive: values.isActive,
        name: values.name,
        stageId: values.stageId
      };
      return rule ? referralAdminApi.updateBonusRule(rule.id, body) : referralAdminApi.createBonusRule(body);
    },
    { failure: "Could not save the bonus", success: rule ? "Bonus updated" : "Bonus created" }
  );

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit bonus" : "New milestone bonus"}</DialogTitle>
          <DialogDescription>Changes apply to bonuses earned from now on.</DialogDescription>
        </DialogHeader>
        <form
          className="grid max-h-[65dvh] gap-4 overflow-y-auto pr-1"
          id="bonus-form"
          onSubmit={form.handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <FormField error={errors.name?.message} id="bonus-name" label="Name" required>
            <Input id="bonus-name" placeholder="Super referrer" {...form.register("name")} />
          </FormField>
          <FormField error={errors.description?.message} hint="Referrers see this." id="bonus-description" label="Description">
            <Textarea id="bonus-description" rows={2} {...form.register("description")} />
          </FormField>
          <FormField error={errors.audience?.message} id="bonus-audience" label="Who earns it">
            <Select
              id="bonus-audience"
              options={REFERRAL_BONUS_AUDIENCES.map((value) => ({ label: REFERRAL_BONUS_AUDIENCE_LABELS[value], value }))}
              {...form.register("audience")}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField error={errors.everyCount?.message} id="bonus-every" label="Every how many referrals">
              <Input id="bonus-every" inputMode="numeric" {...form.register("everyCount")} />
            </FormField>
            <FormField error={errors.stageId?.message} id="bonus-stage" label="That reach">
              <Select
                id="bonus-stage"
                options={stages.filter((stage) => stage.trigger !== "LOST").map((stage) => ({ label: stage.name, value: stage.id }))}
                {...form.register("stageId")}
              />
            </FormField>
          </div>
          <FormField error={errors.amount?.message} id="bonus-amount" label={isPoints ? "Points" : `Amount (${currency})`} required>
            <Input className="w-40" id="bonus-amount" inputMode={isPoints ? "numeric" : "decimal"} {...form.register("amount")} />
          </FormField>
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="bonus-auto">
            <span>
              Credit automatically
              <span className="block text-xs text-app-muted">Off: each bonus waits for an admin to approve it.</span>
            </span>
            <Switch
              checked={form.watch("autoApprove")}
              id="bonus-auto"
              onCheckedChange={(checked) => form.setValue("autoApprove", checked, { shouldDirty: true })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="bonus-active">
            Bonus is on
            <Switch
              checked={form.watch("isActive")}
              id="bonus-active"
              onCheckedChange={(checked) => form.setValue("isActive", checked, { shouldDirty: true })}
            />
          </label>
        </form>
        <DialogFooter>
          <Button onClick={onClose} variant="neutral">
            Cancel
          </Button>
          <Button form="bonus-form" isLoading={save.isPending} type="submit">
            {rule ? "Save bonus" : "Create bonus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
