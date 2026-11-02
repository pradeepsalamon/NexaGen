"use client";

import { useEffect, useState } from "react";
import {
  REFERRER_ROLE_LABELS,
  REFERRER_ROLES,
  toMajorUnits,
  toMinorUnits,
  type ReferralSettingsItem,
  type ReferrerRole
} from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { TextEditor } from "@/components/ui/TextEditor";
import { referralAdminApi } from "../../api/referralAdminApi";
import { useReferralAdminMutation, useReferralSettings } from "../../hooks/useReferralAdmin";

function RoleChecks({
  disabledRoles = [],
  id,
  onChange,
  value
}: {
  id: string;
  value: ReferrerRole[];
  onChange: (roles: ReferrerRole[]) => void;
  disabledRoles?: ReferrerRole[];
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {REFERRER_ROLES.map((role) => (
        <label className="flex items-center gap-2 text-sm text-app-text" htmlFor={`${id}-${role}`} key={role}>
          <Checkbox
            checked={disabledRoles.includes(role) || value.includes(role)}
            disabled={disabledRoles.includes(role)}
            id={`${id}-${role}`}
            onCheckedChange={(checked) => onChange(checked === true ? [...value, role] : value.filter((r) => r !== role))}
          />
          {REFERRER_ROLE_LABELS[role]}
        </label>
      ))}
    </div>
  );
}

export function ReferralSettingsPanel() {
  const { data, isLoading } = useReferralSettings();
  const [form, setForm] = useState<ReferralSettingsItem | null>(null);
  const [minWithdrawal, setMinWithdrawal] = useState("");
  const [pointValue, setPointValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useReferralAdminMutation(referralAdminApi.updateSettings, {
    failure: "Could not save settings",
    success: "Referral settings saved"
  });

  useEffect(() => {
    if (!data) return;
    setForm(data);
    setMinWithdrawal(String(toMajorUnits(data.minWithdrawalMinor, data.currency)));
    setPointValue(String(toMajorUnits(data.conversionValueMinor, data.currency)));
  }, [data]);

  if (isLoading || !form) return <Skeleton className="h-96 rounded-app" />;

  const update = (patch: Partial<ReferralSettingsItem>) => setForm({ ...form, ...patch });

  const submit = () => {
    const min = Number(minWithdrawal);
    if (!Number.isFinite(min) || min < 0) return setError("Enter a minimum withdrawal of 0 or more.");
    if (!Number.isInteger(form.attributionDays) || form.attributionDays < 1 || form.attributionDays > 365) {
      return setError("Attribution must be 1 to 365 days.");
    }
    const value = Number(pointValue);
    if (!Number.isFinite(value) || value <= 0) return setError("Points must be worth more than zero.");
    const wholes = [form.conversionPoints, form.minConversionPoints, form.minTransferPoints];
    if (wholes.some((n) => !Number.isInteger(n) || n < 1)) return setError("Point amounts must be whole numbers of 1 or more.");
    if (!Number.isInteger(form.maxTransferPointsPerDay) || form.maxTransferPointsPerDay < 0) {
      return setError("The daily send limit must be 0 (no limit) or more.");
    }
    setError(null);
    save.mutate({
      attributionDays: form.attributionDays,
      conversionPoints: form.conversionPoints,
      conversionValueMinor: toMinorUnits(value, form.currency),
      enabled: form.enabled,
      maxTransferPointsPerDay: form.maxTransferPointsPerDay,
      minConversionPoints: form.minConversionPoints,
      minTransferPoints: form.minTransferPoints,
      minWithdrawalMinor: toMinorUnits(min, form.currency),
      paymentUseRoles: form.paymentUseRoles,
      pointsConversionEnabled: form.pointsConversionEnabled,
      pointsConversionRoles: form.pointsConversionRoles,
      pointsPaymentEnabled: form.pointsPaymentEnabled,
      pointsTransferEnabled: form.pointsTransferEnabled,
      pointsTransferRoles: form.pointsTransferRoles,
      programTerms: form.programTerms?.trim() || null,
      referrerRoles: form.referrerRoles.filter((role) => role !== "SALES"),
      withdrawalRoles: form.withdrawalRoles
    });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <SectionCard description="Who can refer, and for how long a link keeps counting." title="Programme">
        <div className="grid gap-5">
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="ref-enabled">
            <span>
              Referral programme is on
              <span className="block text-xs text-app-muted">Off: links stop counting and boards show a notice. Earned credits stay.</span>
            </span>
            <Switch checked={form.enabled} id="ref-enabled" onCheckedChange={(enabled) => update({ enabled })} />
          </label>
          <FormField hint="Sales accounts always have a link." id="ref-roles" label="Who gets a referral link">
            <RoleChecks
              disabledRoles={["SALES"]}
              id="ref-roles"
              onChange={(referrerRoles) => update({ referrerRoles })}
              value={form.referrerRoles}
            />
          </FormField>
          <FormField
            hint="After someone opens a link, a demo they book within this many days counts for the referrer."
            id="ref-days"
            label="Attribution window (days)"
          >
            <Input
              className="w-32"
              id="ref-days"
              inputMode="numeric"
              onChange={(event) => update({ attributionDays: Number(event.target.value) || 0 })}
              value={String(form.attributionDays)}
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard description="Money in the wallet belongs to that member alone — it can never be sent to anyone." title="Using money">
        <div className="grid gap-5">
          <FormField hint="Paid out by an admin, outside the app." id="ref-withdraw" label="Can withdraw as money">
            <RoleChecks id="ref-withdraw" onChange={(withdrawalRoles) => update({ withdrawalRoles })} value={form.withdrawalRoles} />
          </FormField>
          <FormField id="ref-min" label={`Minimum withdrawal (${form.currency})`}>
            <Input className="w-40" id="ref-min" inputMode="decimal" onChange={(event) => setMinWithdrawal(event.target.value)} value={minWithdrawal} />
          </FormField>
          <FormField
            hint="Money (and points, if allowed below) becomes a one-time discount code only that account can use at checkout."
            id="ref-pay"
            label="Can pay fees from their wallet"
          >
            <RoleChecks id="ref-pay" onChange={(paymentUseRoles) => update({ paymentUseRoles })} value={form.paymentUseRoles} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard
        description="Points can be shared between members and turned into money — one way only, never money back into points."
        title="Points"
      >
        <div className="grid gap-5">
          <div className="grid gap-2">
            <p className="text-sm font-semibold text-app-text">Conversion rate</p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-app-text">
              <Input
                aria-label="Points"
                className="w-28"
                inputMode="numeric"
                onChange={(event) => update({ conversionPoints: Number(event.target.value) || 0 })}
                value={String(form.conversionPoints)}
              />
              <span>points =</span>
              <Input
                aria-label={`Value in ${form.currency}`}
                className="w-28"
                inputMode="decimal"
                onChange={(event) => setPointValue(event.target.value)}
                value={pointValue}
              />
              <span>{form.currency}</span>
            </div>
            <p className="text-xs text-app-muted">
              Used for converting and for paying fees with points. A change applies from now on; past conversions keep their rate.
            </p>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="ref-convert">
            <span>
              Members can convert points to money
              <span className="block text-xs text-app-muted">One way. The money can then be withdrawn or used for fees.</span>
            </span>
            <Switch
              checked={form.pointsConversionEnabled}
              id="ref-convert"
              onCheckedChange={(pointsConversionEnabled) => update({ pointsConversionEnabled })}
            />
          </label>
          {form.pointsConversionEnabled ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="ref-convert-roles" label="Who can convert">
                <RoleChecks
                  id="ref-convert-roles"
                  onChange={(pointsConversionRoles) => update({ pointsConversionRoles })}
                  value={form.pointsConversionRoles}
                />
              </FormField>
              <FormField id="ref-convert-min" label="Minimum points per conversion">
                <Input
                  className="w-32"
                  id="ref-convert-min"
                  inputMode="numeric"
                  onChange={(event) => update({ minConversionPoints: Number(event.target.value) || 0 })}
                  value={String(form.minConversionPoints)}
                />
              </FormField>
            </div>
          ) : null}
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="ref-transfer">
            <span>
              Members can send points to each other
              <span className="block text-xs text-app-muted">By the email the other member signs in with.</span>
            </span>
            <Switch
              checked={form.pointsTransferEnabled}
              id="ref-transfer"
              onCheckedChange={(pointsTransferEnabled) => update({ pointsTransferEnabled })}
            />
          </label>
          {form.pointsTransferEnabled ? (
            <div className="grid gap-4">
              <FormField hint="Both the sender and the receiver must have one of these roles." id="ref-transfer-roles" label="Who can send and receive">
                <RoleChecks
                  id="ref-transfer-roles"
                  onChange={(pointsTransferRoles) => update({ pointsTransferRoles })}
                  value={form.pointsTransferRoles}
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="ref-transfer-min" label="Smallest send (points)">
                  <Input
                    className="w-32"
                    id="ref-transfer-min"
                    inputMode="numeric"
                    onChange={(event) => update({ minTransferPoints: Number(event.target.value) || 0 })}
                    value={String(form.minTransferPoints)}
                  />
                </FormField>
                <FormField hint="Per member, over any 24 hours. 0 = no limit." id="ref-transfer-max" label="Daily send limit (points)">
                  <Input
                    className="w-32"
                    id="ref-transfer-max"
                    inputMode="numeric"
                    onChange={(event) => update({ maxTransferPointsPerDay: Number(event.target.value) || 0 })}
                    value={String(form.maxTransferPointsPerDay)}
                  />
                </FormField>
              </div>
            </div>
          ) : null}
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="ref-points-pay">
            <span>
              Points can pay fees
              <span className="block text-xs text-app-muted">At the conversion rate, for the roles allowed to pay fees above.</span>
            </span>
            <Switch
              checked={form.pointsPaymentEnabled}
              id="ref-points-pay"
              onCheckedChange={(pointsPaymentEnabled) => update({ pointsPaymentEnabled })}
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard description="Shown to referrers under “How it works”." title="Programme terms">
        <TextEditor
          id="ref-terms"
          onChange={(programTerms) => update({ programTerms })}
          previewable
          rows={6}
          value={form.programTerms ?? ""}
        />
      </SectionCard>

      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="flex justify-end">
        <Button isLoading={save.isPending} onClick={submit}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
