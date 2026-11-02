"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Gift, PencilLine, Plus, Trash2 } from "lucide-react";
import {
  formatReferralReward,
  referralRewardRuleProblem,
  REFERRER_ROLE_LABELS,
  REFERRER_ROLES,
  toMajorUnits,
  type ReferralRewardRuleItem,
  type ReferralStageItem,
  type ReferrerRole
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
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
import { useReferralAdminMutation, useReferralRules, useReferralSettings, useReferralStages } from "../../hooks/useReferralAdmin";
import { money, parseMajorAmount } from "../../lib/referralFormat";

export function RewardRulesPanel() {
  const { data: rules, isLoading } = useReferralRules();
  const { data: stages = [] } = useReferralStages();
  const currency = useReferralSettings().data?.currency ?? "INR";
  const [editing, setEditing] = useState<ReferralRewardRuleItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<ReferralRewardRuleItem | null>(null);
  const remove = useReferralAdminMutation(referralAdminApi.deleteRule, { failure: "Could not delete the rule", success: "Rule removed" });

  return (
    <SectionCard
      actions={
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          New rule
        </Button>
      }
      description="What referrers — and the new members they bring — get. Pay money, points, or (new members only) a discount on fees. Each rule pays once per referral (or per milestone), and a referral that skips ahead still earns the stages before."
      title="Reward rules"
    >
      {isLoading ? (
        <Skeleton className="h-40 rounded-app" />
      ) : rules?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
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
                  {rule.kind === "MILESTONE" ? `Every ${rule.milestoneCount} reaching ` : "Each reaching "}
                  <span className="font-bold">{rule.stageName}</span>
                </TableCell>
                <TableCell className="text-sm">
                  <Badge variant={rule.beneficiary === "REFERRED" ? "accent" : "secondary"}>
                    {rule.beneficiary === "REFERRED" ? "New member" : "Referrer"}
                  </Badge>
                  <span className="mt-1 block text-xs text-app-muted">
                    {rule.roles.length
                      ? `${rule.beneficiary === "REFERRED" ? "Referred by " : ""}${rule.roles.map((role) => REFERRER_ROLE_LABELS[role]).join(", ")}`
                      : "Any referrer"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={rule.autoApprove ? "success" : "warning"}>{rule.autoApprove ? "Automatic" : "Admin approves"}</Badge>
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">
                  {formatReferralReward(rule.amountMinor, rule.unit, rule.currency)}
                  {rule.unit === "DISCOUNT_PERCENT" && (rule.maxDiscountMinor || rule.discountValidDays) ? (
                    <span className="block text-xs font-normal text-app-muted">
                      {[
                        rule.maxDiscountMinor ? `up to ${money(rule.maxDiscountMinor, rule.currency)}` : null,
                        rule.discountValidDays ? `valid ${rule.discountValidDays} days` : null
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell pin="end">
                  <RowActions
                    actions={[
                      { icon: PencilLine, label: "Edit rule", onSelect: () => setEditing(rule) },
                      { icon: Trash2, label: "Delete rule", onSelect: () => setDeleting(rule), tone: "danger" }
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          description="For example: ₹500 to the referrer for each referral that is onboarded, and 10% off the first fee for the new member."
          icon={Gift}
          title="No reward rules yet"
          variant="inline"
        />
      )}

      {editing ? (
        <RuleDialog currency={currency} onClose={() => setEditing(null)} rule={editing === "new" ? null : editing} stages={stages} />
      ) : null}

      <ConfirmationModal
        confirmLabel="Delete rule"
        isConfirming={remove.isPending}
        isOpen={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        title="Delete this rule?"
      >
        {deleting?.rewardCount
          ? "It has already paid rewards, so it is switched off instead of deleted. Earned rewards are kept."
          : "No rewards have been paid from it."}
      </ConfirmationModal>
    </SectionCard>
  );
}

const ruleFormSchema = z
  .object({
    amount: z.string().min(1, "Enter an amount."),
    autoApprove: z.boolean(),
    beneficiary: z.enum(["REFERRER", "REFERRED"]),
    description: z.string().max(500),
    discountValidDays: z.string(),
    maxDiscount: z.string(),
    isActive: z.boolean(),
    kind: z.enum(["PER_REFERRAL", "MILESTONE"]),
    milestoneCount: z.string(),
    name: z.string().trim().min(1, "Name is required.").max(120),
    roles: z.array(z.enum(REFERRER_ROLES)),
    stageId: z.string().min(1, "Pick a stage."),
    unit: z.enum(["CASH", "POINTS", "DISCOUNT_PERCENT"])
  })
  .superRefine((form, ctx) => {
    const problem = referralRewardRuleProblem({
      amountMinor: form.unit === "DISCOUNT_PERCENT" ? Number(form.amount) : 1,
      beneficiary: form.beneficiary,
      kind: form.kind,
      milestoneCount: Number(form.milestoneCount),
      unit: form.unit
    });
    if (problem) {
      const path = problem.path === "amountMinor" ? "amount" : problem.path;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem.message, path: [path] });
    }
  });
type RuleForm = z.infer<typeof ruleFormSchema>;

function RuleDialog({
  currency,
  onClose,
  rule,
  stages
}: {
  rule: ReferralRewardRuleItem | null;
  stages: ReferralStageItem[];
  currency: string;
  onClose: () => void;
}) {
  const defaultStage = stages.find((stage) => stage.trigger === "CONVERTED") ?? stages[0];
  const form = useForm<RuleForm>({
    defaultValues: {
      amount: rule ? (rule.unit === "CASH" ? String(toMajorUnits(rule.amountMinor, rule.currency)) : String(rule.amountMinor)) : "",
      autoApprove: rule?.autoApprove ?? false,
      beneficiary: rule?.beneficiary ?? "REFERRER",
      description: rule?.description ?? "",
      discountValidDays: rule?.discountValidDays ? String(rule.discountValidDays) : "",
      maxDiscount: rule?.maxDiscountMinor ? String(toMajorUnits(rule.maxDiscountMinor, rule.currency)) : "",
      isActive: rule?.isActive ?? true,
      kind: rule?.kind ?? "PER_REFERRAL",
      milestoneCount: rule?.milestoneCount ? String(rule.milestoneCount) : "5",
      name: rule?.name ?? "",
      roles: rule?.roles ?? [],
      stageId: rule?.stageId ?? defaultStage?.id ?? "",
      unit: rule?.unit ?? "CASH"
    },
    resolver: zodResolver(ruleFormSchema)
  });
  const { errors } = form.formState;
  const kind = form.watch("kind");
  const roles = form.watch("roles");
  const unit = form.watch("unit");
  const beneficiary = form.watch("beneficiary");

  const save = useReferralAdminMutation(
    async (values: RuleForm) => {
      const whole = Number(values.amount.trim());
      const amountMinor =
        values.unit === "CASH" ? parseMajorAmount(values.amount, currency) : Number.isInteger(whole) && whole > 0 ? whole : null;
      if (amountMinor === null) throw new Error(values.unit === "CASH" ? "Enter an amount above zero." : "Enter a whole number above zero.");
      const isDiscount = values.unit === "DISCOUNT_PERCENT";
      const maxDiscountMinor = isDiscount && values.maxDiscount.trim() ? parseMajorAmount(values.maxDiscount, currency) : null;
      const days = Number(values.discountValidDays.trim());
      const body = {
        amountMinor,
        autoApprove: values.autoApprove,
        beneficiary: values.beneficiary,
        description: values.description.trim() || null,
        discountValidDays: isDiscount && Number.isInteger(days) && days > 0 ? days : null,
        maxDiscountMinor,
        unit: values.unit,
        isActive: values.isActive,
        kind: values.kind,
        milestoneCount: values.kind === "MILESTONE" ? Number(values.milestoneCount) : null,
        name: values.name,
        roles: values.roles,
        stageId: values.stageId
      };
      return rule ? referralAdminApi.updateRule(rule.id, body) : referralAdminApi.createRule(body);
    },
    { failure: "Could not save the rule", success: rule ? "Rule updated" : "Rule created" }
  );

  const toggleRole = (role: ReferrerRole, checked: boolean) =>
    form.setValue("roles", checked ? [...roles, role] : roles.filter((r) => r !== role), { shouldDirty: true });

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit reward rule" : "New reward rule"}</DialogTitle>
          <DialogDescription>Changes apply to rewards earned from now on.</DialogDescription>
        </DialogHeader>
        <form
          className="grid max-h-[65dvh] gap-4 overflow-y-auto pr-1"
          id="rule-form"
          onSubmit={form.handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <FormField error={errors.name?.message} id="rule-name" label="Name" required>
            <Input id="rule-name" placeholder="Onboarding bonus" {...form.register("name")} />
          </FormField>
          <FormField error={errors.description?.message} hint="Referrers see this." id="rule-description" label="Description">
            <Textarea id="rule-description" rows={2} {...form.register("description")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField error={errors.beneficiary?.message} id="rule-beneficiary" label="Who gets it">
              <Select
                id="rule-beneficiary"
                options={[
                  { label: "The referrer", value: "REFERRER" },
                  { label: "The new member (referred)", value: "REFERRED" }
                ]}
                {...form.register("beneficiary", {
                  onChange: (event: { target: { value: string } }) => {
                    if (event.target.value === "REFERRED") form.setValue("kind", "PER_REFERRAL");
                    else if (form.getValues("unit") === "DISCOUNT_PERCENT") form.setValue("unit", "CASH");
                  }
                })}
              />
            </FormField>
            <FormField error={errors.unit?.message} id="rule-unit" label="Reward">
              <Select
                id="rule-unit"
                options={[
                  { label: "Money", value: "CASH" },
                  { label: "Points", value: "POINTS" },
                  { disabled: beneficiary !== "REFERRED", label: "Discount on fees (new member)", value: "DISCOUNT_PERCENT" }
                ]}
                {...form.register("unit")}
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField error={errors.kind?.message} id="rule-kind" label="Pays">
              <Select
                id="rule-kind"
                options={[
                  { label: "For each referral", value: "PER_REFERRAL" },
                  { disabled: beneficiary === "REFERRED", label: "Every N referrals", value: "MILESTONE" }
                ]}
                {...form.register("kind")}
              />
            </FormField>
            <FormField error={errors.stageId?.message} id="rule-stage" label="When a referral reaches">
              <Select
                id="rule-stage"
                options={stages.filter((stage) => stage.trigger !== "LOST").map((stage) => ({ label: stage.name, value: stage.id }))}
                {...form.register("stageId")}
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              error={errors.amount?.message}
              id="rule-amount"
              label={unit === "POINTS" ? "Points" : unit === "DISCOUNT_PERCENT" ? "Discount (%)" : `Amount (${currency})`}
              required
            >
              <Input id="rule-amount" inputMode={unit === "CASH" ? "decimal" : "numeric"} {...form.register("amount")} />
            </FormField>
            {kind === "MILESTONE" ? (
              <FormField error={errors.milestoneCount?.message} id="rule-milestone" label="Every how many referrals">
                <Input id="rule-milestone" inputMode="numeric" {...form.register("milestoneCount")} />
              </FormField>
            ) : null}
          </div>
          {unit === "DISCOUNT_PERCENT" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField hint="Optional cap on the discount" id="rule-max-discount" label={`At most (${currency})`}>
                <Input id="rule-max-discount" inputMode="decimal" {...form.register("maxDiscount")} />
              </FormField>
              <FormField hint="Blank = never expires" id="rule-valid-days" label="Code valid for (days)">
                <Input id="rule-valid-days" inputMode="numeric" {...form.register("discountValidDays")} />
              </FormField>
            </div>
          ) : null}
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold text-app-text">
              {beneficiary === "REFERRED" ? "When referred by" : "Who earns it"}
            </legend>
            <p className="text-xs text-app-muted">
              {beneficiary === "REFERRED"
                ? "The role of the person who shared the link. Leave all unticked for any referrer."
                : "Leave all unticked for everyone."}
            </p>
            <div className="flex flex-wrap gap-4">
              {REFERRER_ROLES.map((role) => (
                <label className="flex items-center gap-2 text-sm text-app-text" htmlFor={`rule-role-${role}`} key={role}>
                  <Checkbox
                    checked={roles.includes(role)}
                    id={`rule-role-${role}`}
                    onCheckedChange={(checked) => toggleRole(role, checked === true)}
                  />
                  {REFERRER_ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="rule-auto">
            <span>
              Credit automatically
              <span className="block text-xs text-app-muted">Off: each reward waits for an admin to approve it.</span>
            </span>
            <Switch
              checked={form.watch("autoApprove")}
              id="rule-auto"
              onCheckedChange={(checked) => form.setValue("autoApprove", checked, { shouldDirty: true })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="rule-active">
            Rule is on
            <Switch
              checked={form.watch("isActive")}
              id="rule-active"
              onCheckedChange={(checked) => form.setValue("isActive", checked, { shouldDirty: true })}
            />
          </label>
        </form>
        <DialogFooter>
          <Button onClick={onClose} variant="neutral">
            Cancel
          </Button>
          <Button form="rule-form" isLoading={save.isPending} type="submit">
            {rule ? "Save rule" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
