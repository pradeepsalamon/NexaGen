"use client";

import { useEffect, useRef, useState } from "react";
import {
  COACH_COMPENSATION_MODEL_LABELS,
  COACH_ENGAGEMENT_TYPE_LABELS,
  formatMoney,
  toMinorUnits,
  type CoachCompensationModel,
  type CoachEngagementType,
  type CompensationCalculationType
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import {
  useCloseCompensationRate,
  useCompensationProfile,
  useAddCompensationRate,
  useUpdateCompensationProfile
} from "../hooks/usePayrollApi";
import { DateStringPicker } from "@/components/ui/DatePicker";
import {
  INITIAL_TIER_ROWS,
  TierRatesEditor,
  formatTierSummary,
  isValidTierConfig,
  toTierConfig
} from "./TierRatesEditor";

const ENGAGEMENT_TYPES = Object.keys(COACH_ENGAGEMENT_TYPE_LABELS) as CoachEngagementType[];
const COMPENSATION_MODELS = Object.keys(COACH_COMPENSATION_MODEL_LABELS) as CoachCompensationModel[];

const CALCULATION_TYPE_LABELS: Record<CompensationCalculationType, string> = {
  HOURLY_RATE: "Hourly rate",
  PER_CLASS_RATE: "Per-class rate",
  MONTHLY_SALARY: "Monthly salary",
  TIER: "Tiered hourly",
  PERCENTAGE: "Percentage"
};
const CALCULATION_TYPES = Object.keys(CALCULATION_TYPE_LABELS) as CompensationCalculationType[];

export function CompensationProfileDialog({
  coachId,
  onClose
}: {
  coachId: string;
  onClose: () => void;
}) {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useCompensationProfile(coachId);
  const updateProfile = useUpdateCompensationProfile();
  const addRate = useAddCompensationRate();
  const closeRate = useCloseCompensationRate();

  const profile = data?.profile;

  const [engagementType, setEngagementType] = useState<CoachEngagementType>("EMPLOYEE");
  const [defaultCompensationModel, setDefaultCompensationModel] =
    useState<CoachCompensationModel>("HOURLY");
  const [currency, setCurrency] = useState("INR");
  const [notes, setNotes] = useState("");

  // Filled on the first load only: adding a rate refetches the profile, and
  // that must not wipe profile edits not yet saved.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!profile || hydrated.current) return;
    hydrated.current = true;
    setEngagementType(profile.engagementType);
    setDefaultCompensationModel(profile.defaultCompensationModel);
    setCurrency(profile.currency);
    setNotes(profile.notes ?? "");
  }, [profile]);

  const [calculationType, setCalculationType] = useState<CompensationCalculationType>("HOURLY_RATE");
  const [rateMajor, setRateMajor] = useState("");
  const [percent, setPercent] = useState("");
  const [tierRows, setTierRows] = useState(INITIAL_TIER_ROWS);
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));

  const rateMinor = toMinorUnits(Number(rateMajor) || 0, currency);
  const tierConfig = toTierConfig(tierRows, currency);
  const isTier = calculationType === "TIER";
  const canAddRate =
    effectiveFrom.length > 0 &&
    (isTier
      ? isValidTierConfig(tierConfig)
      : calculationType === "PERCENTAGE"
        ? Number(percent) > 0
        : rateMinor > 0);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{profile?.coachName ?? "Coach"} — compensation</DialogTitle>
          <DialogDescription>
            A rate change never rewrites an already-calculated period — it closes the
            previous rate and starts a new one from the date you choose.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !profile ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="engagement-type">Engagement type</Label>
                <Select
                  id="engagement-type"
                  onChange={(event) => setEngagementType(event.target.value as CoachEngagementType)}
                  options={ENGAGEMENT_TYPES.map((type) => ({
                    label: COACH_ENGAGEMENT_TYPE_LABELS[type],
                    value: type
                  }))}
                  value={engagementType}
                />
              </div>
              <div>
                <Label htmlFor="compensation-model">Compensation model</Label>
                <Select
                  id="compensation-model"
                  onChange={(event) =>
                    setDefaultCompensationModel(event.target.value as CoachCompensationModel)
                  }
                  options={COMPENSATION_MODELS.map((model) => ({
                    label: COACH_COMPENSATION_MODEL_LABELS[model],
                    value: model
                  }))}
                  value={defaultCompensationModel}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  maxLength={3}
                  onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                  value={currency}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="profile-notes">Notes</Label>
              <Textarea
                id="profile-notes"
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                value={notes}
              />
            </div>

            <Button
              isLoading={updateProfile.isPending}
              onClick={() =>
                updateProfile.mutate({
                  coachId,
                  body: {
                    engagementType,
                    defaultCompensationModel,
                    currency,
                    notes: notes.trim() || undefined
                  }
                })
              }
              size="sm"
            >
              Save profile
            </Button>

            <div className="border-t border-app-border pt-4">
              <h4 className="mb-2 text-xs font-bold text-app-muted">
                Effective-dated rates
              </h4>

              {profile.rates.length === 0 ? (
                <p className="mb-3 text-sm text-app-muted">No rates configured yet.</p>
              ) : (
                <ul className="mb-3 space-y-1.5">
                  {profile.rates.map((rate) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-app-border px-3 py-2 text-sm"
                      key={rate.id}
                    >
                      <span className="text-app-text">
                        {CALCULATION_TYPE_LABELS[rate.calculationType]}
                        {rate.rateMinor !== null ? ` — ${formatMoney(rate.rateMinor, currency)}` : ""}
                        {rate.percentageBps !== null ? ` — ${rate.percentageBps / 100}%` : ""}
                        {rate.tierConfig ? ` — ${formatTierSummary(rate.tierConfig, currency)}` : ""}
                      </span>
                      <span className="text-xs text-app-muted">
                        {formatFullDate(rate.effectiveFrom, timeZone)} –{" "}
                        {rate.effectiveTo ? formatFullDate(rate.effectiveTo, timeZone) : "ongoing"}
                      </span>
                      {!rate.effectiveTo ? (
                        <Button
                          isLoading={closeRate.isPending}
                          onClick={() =>
                            closeRate.mutate({
                              id: rate.id,
                              coachId,
                              body: { effectiveTo: new Date().toISOString() }
                            })
                          }
                          size="sm"
                          variant="ghost"
                        >
                          End rate
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className={isTier ? "col-span-2 sm:col-span-4" : "col-span-2 sm:col-span-1"}>
                  <Label htmlFor="rate-calc-type">Type</Label>
                  <Select
                    id="rate-calc-type"
                    onChange={(event) =>
                      setCalculationType(event.target.value as CompensationCalculationType)
                    }
                    options={CALCULATION_TYPES.map((type) => ({
                      label: CALCULATION_TYPE_LABELS[type],
                      value: type
                    }))}
                    value={calculationType}
                  />
                </div>

                {calculationType === "PERCENTAGE" ? (
                  <div>
                    <Label htmlFor="rate-percent">Percent</Label>
                    <Input
                      id="rate-percent"
                      inputMode="decimal"
                      onChange={(event) => setPercent(event.target.value)}
                      step="0.01"
                      type="number"
                      value={percent}
                    />
                  </div>
                ) : !isTier ? (
                  <div>
                    <Label htmlFor="rate-amount">Amount ({currency})</Label>
                    <Input
                      id="rate-amount"
                      inputMode="decimal"
                      onChange={(event) => setRateMajor(event.target.value)}
                      step="0.01"
                      type="number"
                      value={rateMajor}
                    />
                  </div>
                ) : (
                  <div className="col-span-2 sm:col-span-4">
                    <TierRatesEditor currency={currency} onChange={setTierRows} rows={tierRows} />
                    {profile.defaultCompensationModel !== "TIERED" ? (
                      <p className="mt-2 text-xs text-app-muted">
                        Payroll only uses this rate once the saved compensation model is{" "}
                        {COACH_COMPENSATION_MODEL_LABELS.TIERED}.
                      </p>
                    ) : null}
                  </div>
                )}

                <div>
                  <Label htmlFor="rate-effective-from">Effective from</Label>
                  <DateStringPicker
                    id="rate-effective-from"
                    onChange={(value) => setEffectiveFrom(value)}
                    
                    value={effectiveFrom}
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    disabled={!canAddRate}
                    isLoading={addRate.isPending}
                    onClick={() =>
                      addRate.mutate({
                        coachId,
                        body: {
                          compensationModel: defaultCompensationModel,
                          calculationType,
                          rateMinor: calculationType === "PERCENTAGE" || isTier ? undefined : rateMinor,
                          percentageBps:
                            calculationType === "PERCENTAGE"
                              ? Math.round(Number(percent) * 100)
                              : undefined,
                          tierConfig: isTier ? tierConfig : undefined,
                          effectiveFrom: new Date(effectiveFrom).toISOString()
                        }
                      }, {
                        onSuccess: () => {
                          setRateMajor("");
                          setPercent("");
                          setTierRows(INITIAL_TIER_ROWS);
                        }
                      })
                    }
                    size="sm"
                    variant="outline"
                  >
                    Add rate
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
