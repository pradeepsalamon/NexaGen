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
  const [error, setError] = useState<string | null>(null);
  const save = useReferralAdminMutation(referralAdminApi.updateSettings, {
    failure: "Could not save settings",
    success: "Referral settings saved"
  });

  useEffect(() => {
    if (!data) return;
    setForm(data);
    setMinWithdrawal(String(toMajorUnits(data.minWithdrawalMinor, data.currency)));
  }, [data]);

  if (isLoading || !form) return <Skeleton className="h-96 rounded-app" />;

  const update = (patch: Partial<ReferralSettingsItem>) => setForm({ ...form, ...patch });

  const submit = () => {
    const min = Number(minWithdrawal);
    if (!Number.isFinite(min) || min < 0) return setError("Enter a minimum withdrawal of 0 or more.");
    if (!Number.isInteger(form.attributionDays) || form.attributionDays < 1 || form.attributionDays > 365) {
      return setError("Attribution must be 1 to 365 days.");
    }
    setError(null);
    save.mutate({
      attributionDays: form.attributionDays,
      enabled: form.enabled,
      minWithdrawalMinor: toMinorUnits(min, form.currency),
      paymentUseRoles: form.paymentUseRoles,
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

      <SectionCard description="What referrers can do with their credits." title="Using credits">
        <div className="grid gap-5">
          <FormField hint="Paid out by an admin, outside the app." id="ref-withdraw" label="Can withdraw as money">
            <RoleChecks id="ref-withdraw" onChange={(withdrawalRoles) => update({ withdrawalRoles })} value={form.withdrawalRoles} />
          </FormField>
          <FormField id="ref-min" label={`Minimum withdrawal (${form.currency})`}>
            <Input className="w-40" id="ref-min" inputMode="decimal" onChange={(event) => setMinWithdrawal(event.target.value)} value={minWithdrawal} />
          </FormField>
          <FormField
            hint="Credits become a one-time discount code that only that account can use at checkout."
            id="ref-pay"
            label="Can pay fees with credits"
          >
            <RoleChecks id="ref-pay" onChange={(paymentUseRoles) => update({ paymentUseRoles })} value={form.paymentUseRoles} />
          </FormField>
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
