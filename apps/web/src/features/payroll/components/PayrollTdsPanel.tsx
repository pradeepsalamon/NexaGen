"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { formatBpsPercent, formatMoney, toMajorUnits, toMinorUnits, type PayrollSettingsItem } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { WidgetError } from "@/components/ui/WidgetError";
import { usePayrollSettings, useUpdatePayrollSettings } from "../hooks/usePayrollApi";

const CURRENCY = "INR";
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const numberText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max, message);

const formSchema = z.object({
  financialYearStartMonth: z.string(),
  ratePercent: numberText(100, "Enter a rate from 0 to 100."),
  tdsEnabled: z.boolean(),
  threshold: numberText(20_000_000, "Enter an amount of 0 or more.")
});
type FormValues = z.infer<typeof formSchema>;

const toForm = (settings: PayrollSettingsItem): FormValues => ({
  financialYearStartMonth: String(settings.financialYearStartMonth),
  ratePercent: String(settings.tdsRateBps / 100),
  tdsEnabled: settings.tdsEnabled,
  threshold: String(toMajorUnits(settings.tdsThresholdMinor, CURRENCY))
});

function TdsForm({ settings }: { settings: PayrollSettingsItem }) {
  const save = useUpdatePayrollSettings();
  const form = useForm<FormValues>({ defaultValues: toForm(settings), resolver: zodResolver(formSchema) });
  const { errors, isDirty } = form.formState;
  const enabled = form.watch("tdsEnabled");
  const rateBps = Math.round(Number(form.watch("ratePercent")) * 100) || 0;
  const thresholdMinor = toMinorUnits(Number(form.watch("threshold")) || 0, CURRENCY);

  const submit = form.handleSubmit(async (values) => {
    const result = await save.mutateAsync({
      financialYearStartMonth: Number(values.financialYearStartMonth),
      tdsEnabled: values.tdsEnabled,
      tdsRateBps: Math.round(Number(values.ratePercent) * 100),
      tdsThresholdMinor: toMinorUnits(Number(values.threshold), CURRENCY)
    });
    form.reset(toForm(result.settings));
  });

  return (
    <form className="grid gap-4" noValidate onSubmit={(event) => void submit(event).catch(() => undefined)}>
      <SectionCard
        description="Tax deducted at source from a coach's pay. It shows as its own deduction line on every payslip."
        title="TDS"
      >
        <div className="grid gap-4">
          <Controller
            control={form.control}
            name="tdsEnabled"
            render={({ field }) => (
              <Switch checked={field.value} id="tds-enabled" label="Deduct TDS from coach pay" onCheckedChange={field.onChange} />
            )}
          />
          <div className="grid items-start gap-4 sm:grid-cols-3">
            <FormField
              error={errors.ratePercent?.message}
              hint="A coach can have their own rate, set under Compensation."
              id="tds-rate"
              label="Rate (%)"
            >
              <Input disabled={!enabled} id="tds-rate" inputMode="decimal" {...form.register("ratePercent")} />
            </FormField>
            <FormField
              error={errors.threshold?.message}
              hint="0 = deduct from the first payment."
              id="tds-threshold"
              label={`Yearly threshold (${CURRENCY})`}
            >
              <Input disabled={!enabled} id="tds-threshold" inputMode="decimal" {...form.register("threshold")} />
            </FormField>
            <FormField id="tds-year-start" label="Financial year starts in">
              <Select
                disabled={!enabled}
                id="tds-year-start"
                options={MONTHS.map((label, index) => ({ label, value: String(index + 1) }))}
                {...form.register("financialYearStartMonth")}
              />
            </FormField>
          </div>

          {enabled ? (
            <Alert title="How it is worked out" variant="info">
              {thresholdMinor > 0 ? (
                <>
                  Nothing is deducted until a coach&apos;s pay in the financial year goes above{" "}
                  {formatMoney(thresholdMinor, CURRENCY)}. From that payslip on, {formatBpsPercent(rateBps)} applies to
                  everything paid that year, so the first payslip past the threshold also carries the TDS on the earlier
                  ones.
                </>
              ) : (
                <>{formatBpsPercent(rateBps)} is deducted from every payslip.</>
              )}{" "}
              It is taken from what the payslip pays after rule deductions and adjustments. A change here applies to
              periods you calculate or recalculate afterwards; approved and finalized payslips keep the terms they had.
            </Alert>
          ) : null}
        </div>
      </SectionCard>
      <div>
        <Button disabled={!isDirty} isLoading={save.isPending} type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}

/** Admin → Finance → Coach Payroll → TDS: the academy's rate and yearly threshold. */
export function PayrollTdsPanel() {
  const query = usePayrollSettings();

  if (query.isError) return <WidgetError message="Couldn't load the TDS settings." onRetry={() => void query.refetch()} />;
  if (!query.data) return <Skeleton className="h-64 w-full" />;
  return <TdsForm key={query.data.settings.updatedAt ?? "new"} settings={query.data.settings} />;
}
