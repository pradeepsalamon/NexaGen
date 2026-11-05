"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  createPlatformPlanRequestSchema,
  DEFAULT_LAPSE_POLICY,
  GRACE_ALLOWANCE_KEYS,
  GRACE_ALLOWANCES,
  PLAN_FEATURE_KEYS,
  PLAN_FEATURES,
  PLAN_LIMIT_KEYS,
  PLAN_LIMITS,
  toMinorUnits,
  type GraceAllowance,
  type PlanFeatureCategory,
  type PlanFeatureKey,
  type PlanLimits,
  type PlatformPlanSummary
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
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
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { useCreatePlatformPlan, usePlatformContentPacks, useUpdatePlatformPlan } from "../hooks/usePlatformApi";

const optionalWhole = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d+$/.test(value), "A whole number, or blank.");
const optionalMoney = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value), "An amount like 4999, or blank.");
const days = z.string().trim().regex(/^\d{1,3}$/, "0–365 days.");

const formSchema = z.object({
  code: z.string().trim(),
  contentPackIds: z.array(z.string()),
  currency: z.string().trim().length(3, "A 3-letter code."),
  description: z.string().trim().max(500),
  features: z.array(z.string()),
  graceAllows: z.array(z.string()),
  graceDays: days,
  isActive: z.boolean(),
  isPublic: z.boolean(),
  limits: z.object(Object.fromEntries(PLAN_LIMIT_KEYS.map((key) => [key, optionalWhole])) as Record<keyof PlanLimits, typeof optionalWhole>),
  name: z.string().trim().min(1, "Enter a name.").max(80),
  pastDueDays: days,
  priceMonthly: optionalMoney,
  priceYearly: optionalMoney,
  sortOrder: z.string().trim().regex(/^-?\d+$/, "A whole number."),
  trialDays: days
});
type FormValues = z.infer<typeof formSchema>;

const CATEGORIES: PlanFeatureCategory[] = ["Teaching", "Learning", "Growth", "Operations"];

const toMajor = (minor: number | null, currency: string) =>
  minor === null ? "" : String(minor / (toMinorUnits(1, currency) || 1));

function defaults(plan: PlatformPlanSummary | null): FormValues {
  const currency = plan?.currency ?? "INR";
  const lapse = plan?.lapse ?? DEFAULT_LAPSE_POLICY;
  return {
    code: plan?.code ?? "",
    contentPackIds: plan?.contentPackIds ?? [],
    currency,
    description: plan?.description ?? "",
    features: plan?.features ?? [],
    graceAllows: lapse.graceAllows,
    graceDays: String(lapse.graceDays),
    isActive: plan?.isActive ?? true,
    isPublic: plan?.isPublic ?? false,
    limits: Object.fromEntries(
      PLAN_LIMIT_KEYS.map((key) => [key, plan?.limits[key] === null || !plan ? "" : String(plan.limits[key])])
    ) as FormValues["limits"],
    name: plan?.name ?? "",
    pastDueDays: String(lapse.pastDueDays),
    priceMonthly: toMajor(plan?.priceMonthlyMinor ?? null, currency),
    priceYearly: toMajor(plan?.priceYearlyMinor ?? null, currency),
    sortOrder: String(plan?.sortOrder ?? 100),
    trialDays: String(plan?.trialDays ?? 0)
  };
}

/**
 * Create a plan, or edit one. An edit makes a new version: academies already
 * on the plan keep theirs until "Apply to existing" (§G).
 */
export function PlanEditorDialog({ onClose, plan }: { onClose: () => void; plan: PlatformPlanSummary | null }) {
  const create = useCreatePlatformPlan();
  const update = useUpdatePlatformPlan();
  const form = useForm<FormValues>({ defaultValues: defaults(plan), resolver: zodResolver(formSchema) });
  const { errors } = form.formState;
  const features = form.watch("features");
  const graceAllows = form.watch("graceAllows");
  const isPublic = form.watch("isPublic");
  const isActive = form.watch("isActive");

  const packs = usePlatformContentPacks().data?.packs ?? [];
  const contentPackIds = form.watch("contentPackIds");

  const toggle = (field: "contentPackIds" | "features" | "graceAllows", key: string, on: boolean) => {
    const current = form.getValues(field);
    form.setValue(field, on ? [...new Set([...current, key])] : current.filter((value) => value !== key), {
      shouldDirty: true
    });
  };

  const submit = form.handleSubmit(async (values) => {
    const currency = values.currency.toUpperCase();
    const money = (value: string) => (value === "" ? null : toMinorUnits(Number(value), currency));
    const body = {
      contentPackIds: values.contentPackIds,
      currency,
      description: values.description || null,
      features: values.features as PlanFeatureKey[],
      isPublic: values.isPublic,
      lapse: {
        graceAllows: values.graceAllows as GraceAllowance[],
        graceDays: Number(values.graceDays),
        pastDueDays: Number(values.pastDueDays)
      },
      limits: Object.fromEntries(
        PLAN_LIMIT_KEYS.map((key) => [key, values.limits[key] === "" ? null : Number(values.limits[key])])
      ) as PlanLimits,
      name: values.name,
      priceMonthlyMinor: money(values.priceMonthly),
      priceYearlyMinor: money(values.priceYearly),
      sortOrder: Number(values.sortOrder),
      trialDays: Number(values.trialDays)
    };
    if (plan) {
      await update.mutateAsync({ body: { ...body, isActive: values.isActive }, id: plan.id });
    } else {
      const code = createPlatformPlanRequestSchema.shape.code.safeParse(values.code);
      if (!code.success) {
        form.setError("code", { message: code.error.issues[0]?.message ?? "Use A–Z, 0–9 and _." });
        return;
      }
      await create.mutateAsync({ ...body, code: code.data });
    }
    onClose();
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : "New plan"}</DialogTitle>
          <DialogDescription>
            {plan
              ? `Saving makes version ${plan.version + 1}. Academies on version ${plan.version} keep it until you apply the change to them.`
              : "Not public until you switch it on: a hidden plan is for deals you assign by hand."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" id="plan-editor" noValidate onSubmit={(event) => void submit(event).catch(() => undefined)}>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField error={errors.name?.message} id="plan-name" label="Name" required>
              <Input id="plan-name" {...form.register("name")} />
            </FormField>
            {plan ? (
              <FormField hint="Codes never change." id="plan-code" label="Code">
                <Input disabled id="plan-code" value={plan.code} />
              </FormField>
            ) : (
              <FormField error={errors.code?.message} hint="A–Z, 0–9 and _, e.g. GROWTH_PLUS." id="plan-code" label="Code" required>
                <Input id="plan-code" {...form.register("code")} />
              </FormField>
            )}
          </div>
          <FormField error={errors.description?.message} id="plan-description" label="Description">
            <Textarea id="plan-description" rows={2} {...form.register("description")} />
          </FormField>

          <fieldset className="grid items-start gap-4 sm:grid-cols-4">
            <legend className="mb-2 text-sm font-semibold text-app-text">Price</legend>
            <FormField error={errors.currency?.message} id="plan-currency" label="Currency">
              <Input id="plan-currency" maxLength={3} {...form.register("currency")} />
            </FormField>
            <FormField error={errors.priceMonthly?.message} hint="Blank = contact us" id="plan-monthly" label="Per month">
              <Input id="plan-monthly" inputMode="decimal" {...form.register("priceMonthly")} />
            </FormField>
            <FormField error={errors.priceYearly?.message} hint="Blank = no yearly price" id="plan-yearly" label="Per year">
              <Input id="plan-yearly" inputMode="decimal" {...form.register("priceYearly")} />
            </FormField>
            <FormField error={errors.trialDays?.message} id="plan-trial" label="Trial days">
              <Input id="plan-trial" inputMode="numeric" {...form.register("trialDays")} />
            </FormField>
          </fieldset>

          <fieldset className="grid items-start gap-4 sm:grid-cols-4">
            <legend className="mb-2 text-sm font-semibold text-app-text">Limits (blank = unlimited)</legend>
            {PLAN_LIMIT_KEYS.map((key) => (
              <FormField error={errors.limits?.[key]?.message} id={`plan-limit-${key}`} key={key} label={PLAN_LIMITS[key].label}>
                <Input id={`plan-limit-${key}`} inputMode="numeric" {...form.register(`limits.${key}`)} />
              </FormField>
            ))}
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-semibold text-app-text">Features</legend>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              {CATEGORIES.map((category) => (
                <div className="grid content-start gap-2" key={category}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">{category}</p>
                  {PLAN_FEATURE_KEYS.filter((key) => PLAN_FEATURES[key].category === category).map((key) => (
                    <Checkbox
                      checked={features.includes(key)}
                      id={`plan-feature-${key}`}
                      key={key}
                      label={PLAN_FEATURES[key].label}
                      onCheckedChange={(checked) => toggle("features", key, checked === true)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </fieldset>

          {packs.length > 0 ? (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-semibold text-app-text">Content packs</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {packs.map((pack) => (
                  <Checkbox
                    checked={contentPackIds.includes(pack.id)}
                    id={`plan-pack-${pack.id}`}
                    key={pack.id}
                    label={pack.isPublished ? pack.name : `${pack.name} (draft)`}
                    onCheckedChange={(checked) => toggle("contentPackIds", pack.id, checked === true)}
                  />
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset className="grid gap-4">
            <legend className="mb-2 text-sm font-semibold text-app-text">When a payment is missed</legend>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <FormField
                error={errors.pastDueDays?.message}
                hint="Full access, with a banner and reminders."
                id="plan-past-due"
                label="Past-due days"
              >
                <Input id="plan-past-due" inputMode="numeric" {...form.register("pastDueDays")} />
              </FormField>
              <FormField
                error={errors.graceDays?.message}
                hint="Read-only except what is ticked below; then locked."
                id="plan-grace"
                label="Grace days"
              >
                <Input id="plan-grace" inputMode="numeric" {...form.register("graceDays")} />
              </FormField>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {GRACE_ALLOWANCE_KEYS.map((key) => (
                <Checkbox
                  checked={graceAllows.includes(key)}
                  id={`plan-grace-${key}`}
                  key={key}
                  label={`In grace: ${GRACE_ALLOWANCES[key].label.toLowerCase()}`}
                  onCheckedChange={(checked) => toggle("graceAllows", key, checked === true)}
                />
              ))}
            </div>
          </fieldset>

          <div className="grid items-start gap-4 sm:grid-cols-3">
            <FormField error={errors.sortOrder?.message} hint="Lower shows first." id="plan-sort" label="Order">
              <Input id="plan-sort" inputMode="numeric" {...form.register("sortOrder")} />
            </FormField>
            <Switch
              checked={isPublic}
              id="plan-public"
              label="Shown on the public plans page"
              onCheckedChange={(checked) => form.setValue("isPublic", checked, { shouldDirty: true })}
            />
            {plan ? (
              <Switch
                checked={isActive}
                id="plan-active"
                label="Can be chosen for academies"
                onCheckedChange={(checked) => form.setValue("isActive", checked, { shouldDirty: true })}
              />
            ) : null}
          </div>
        </form>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button form="plan-editor" isLoading={create.isPending || update.isPending} type="submit">
            {plan ? "Save new version" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
