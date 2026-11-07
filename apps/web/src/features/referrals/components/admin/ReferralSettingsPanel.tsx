"use client";

import { useEffect, useState } from "react";
import {
  REFERRAL_PAYOUT_ROLES,
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
    if (!Number.isInteger(form.maxRedemptionsPer30Days) || form.maxRedemptionsPer30Days < 0 || form.maxRedemptionsPer30Days > 1000) {
      return setError("The redemption limit must be 0 (no limit) to 1000.");
    }
    setError(null);
    save.mutate({
      attributionDays: form.attributionDays,
      autoApproveCash: form.autoApproveCash,
      autoApprovePoints: form.autoApprovePoints,
      enabled: form.enabled,
      maxRedemptionsPer30Days: form.maxRedemptionsPer30Days,
      minWithdrawalMinor: toMinorUnits(min, form.currency),
      programTerms: form.programTerms?.trim() || null,
      redemptionsEnabled: form.redemptionsEnabled,
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
              <span className="block text-xs text-app-muted">Off: links stop counting and boards show a notice. Earned points and money stay.</span>
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

      <SectionCard
        description="What each stage pays is set on the Stages tab; milestone bonuses on the Bonuses tab (each bonus has its own approval switch)."
        title="Approving stage rewards"
      >
        <div className="grid gap-5">
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="ref-auto-points">
            <span>
              Credit points automatically
              <span className="block text-xs text-app-muted">Students&rsquo; and new members&rsquo; points. Off: each waits in the Rewards tab.</span>
            </span>
            <Switch checked={form.autoApprovePoints} id="ref-auto-points" onCheckedChange={(autoApprovePoints) => update({ autoApprovePoints })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="ref-auto-cash">
            <span>
              Credit money automatically
              <span className="block text-xs text-app-muted">Coaches&rsquo; and sales staff&rsquo;s money. Off: an admin approves each reward first.</span>
            </span>
            <Switch checked={form.autoApproveCash} id="ref-auto-cash" onCheckedChange={(autoApproveCash) => update({ autoApproveCash })} />
          </label>
        </div>
      </SectionCard>

      <SectionCard
        description="Students spend points on the vouchers in the Vouchers tab. Points can't be sent to anyone or turned into money."
        title="Rewards store"
      >
        <div className="grid gap-5">
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="ref-store">
            <span>
              Students can redeem points
              <span className="block text-xs text-app-muted">Off: the store closes. Points and issued codes stay.</span>
            </span>
            <Switch checked={form.redemptionsEnabled} id="ref-store" onCheckedChange={(redemptionsEnabled) => update({ redemptionsEnabled })} />
          </label>
          <FormField
            hint="Per student, over any 30 days, counting waiting and fulfilled redemptions. 0 = no limit."
            id="ref-redeem-limit"
            label="Redemptions per student per 30 days"
          >
            <Input
              className="w-32"
              id="ref-redeem-limit"
              inputMode="numeric"
              onChange={(event) => update({ maxRedemptionsPer30Days: Number(event.target.value) || 0 })}
              value={String(form.maxRedemptionsPer30Days)}
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard description="Money is earned by coaches and sales staff only, and belongs to them alone — it can never be sent to anyone." title="Payouts">
        <div className="grid gap-5">
          <FormField hint="Paid out by an admin, outside the app." id="ref-withdraw" label="Can withdraw money">
            <div className="flex flex-wrap gap-4">
              {REFERRAL_PAYOUT_ROLES.map((role) => (
                <label className="flex items-center gap-2 text-sm text-app-text" htmlFor={`ref-withdraw-${role}`} key={role}>
                  <Checkbox
                    checked={form.withdrawalRoles.includes(role)}
                    id={`ref-withdraw-${role}`}
                    onCheckedChange={(checked) =>
                      update({
                        withdrawalRoles: checked === true ? [...form.withdrawalRoles, role] : form.withdrawalRoles.filter((r) => r !== role)
                      })
                    }
                  />
                  {REFERRER_ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </FormField>
          <FormField id="ref-min" label={`Minimum withdrawal (${form.currency})`}>
            <Input className="w-40" id="ref-min" inputMode="decimal" onChange={(event) => setMinWithdrawal(event.target.value)} value={minWithdrawal} />
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
