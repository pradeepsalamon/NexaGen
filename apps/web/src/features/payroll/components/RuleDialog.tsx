"use client";

import { useState } from "react";
import {
  PAYROLL_RULE_TYPE_LABELS,
  type CancelledByActor,
  type PayrollRuleEffect,
  type PayrollRuleType
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
import { Textarea } from "@/components/ui/Textarea";
import { useCreatePayrollRule } from "../hooks/usePayrollApi";
import { DateStringPicker } from "@/components/ui/DatePicker";
import { Switch } from "@/components/ui/Switch";

const RULE_TYPES = Object.keys(PAYROLL_RULE_TYPE_LABELS) as PayrollRuleType[];

const CANCELLED_BY_OPTIONS: { label: string; value: CancelledByActor | "" }[] = [
  { label: "Any", value: "" },
  { label: "Coach", value: "COACH" },
  { label: "Student", value: "STUDENT" },
  { label: "Admin", value: "ADMIN" },
  { label: "Platform", value: "PLATFORM" }
];

/** Creates a cancellation/attendance/bonus/deduction rule (§7/§26). */
export function RuleDialog({ onClose }: { onClose: () => void }) {
  const create = useCreatePayrollRule();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ruleType, setRuleType] = useState<PayrollRuleType>("CANCELLATION");
  const [cancelledBy, setCancelledBy] = useState<CancelledByActor | "">("");
  const [noticeHoursLessThan, setNoticeHoursLessThan] = useState("");
  const [noticeHoursAtLeast, setNoticeHoursAtLeast] = useState("");
  const [minTeachingHours, setMinTeachingHours] = useState("");
  const [effectKind, setEffectKind] = useState<PayrollRuleEffect["kind"]>("PAYOUT_PERCENT");
  const [percent, setPercent] = useState("");
  const [flatAmountMajor, setFlatAmountMajor] = useState("");
  const [priority, setPriority] = useState("0");
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [enabled, setEnabled] = useState(true);

  const canSubmit =
    name.trim().length > 0 &&
    (effectKind === "PAYOUT_PERCENT" ? percent.length > 0 : flatAmountMajor.length > 0);

  const handleSubmit = () => {
    create.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        ruleType,
        condition: {
          cancelledBy: cancelledBy || undefined,
          noticeHoursLessThan: noticeHoursLessThan ? Number(noticeHoursLessThan) : undefined,
          noticeHoursAtLeast: noticeHoursAtLeast ? Number(noticeHoursAtLeast) : undefined,
          minTeachingHours: minTeachingHours ? Number(minTeachingHours) : undefined
        },
        effect:
          effectKind === "PAYOUT_PERCENT"
            ? { kind: "PAYOUT_PERCENT", percent: Number(percent) }
            : { kind: "FLAT_AMOUNT", amountMinor: Math.round(Number(flatAmountMajor) * 100) },
        priority: Number(priority) || 0,
        enabled,
        effectiveFrom: new Date(effectiveFrom).toISOString()
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create payroll rule</DialogTitle>
          <DialogDescription>
            Applied by the calculation engine on top of a coach&apos;s base rate.
            Higher priority wins when more than one rule matches.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Student late cancellation"
              value={name}
            />
          </div>

          <div>
            <Label htmlFor="rule-description">Description (optional)</Label>
            <Textarea
              id="rule-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </div>

          <div>
            <Label htmlFor="rule-type">Rule type</Label>
            <Select
              id="rule-type"
              onChange={(event) => setRuleType(event.target.value as PayrollRuleType)}
              options={RULE_TYPES.map((type) => ({ label: PAYROLL_RULE_TYPE_LABELS[type], value: type }))}
              value={ruleType}
            />
          </div>

          {ruleType === "CANCELLATION" ? (
            <div className="space-y-3 rounded-control border border-app-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">
                Condition
              </p>
              <div>
                <Label htmlFor="rule-cancelled-by">Cancelled by</Label>
                <Select
                  id="rule-cancelled-by"
                  onChange={(event) => setCancelledBy(event.target.value as CancelledByActor | "")}
                  options={CANCELLED_BY_OPTIONS}
                  value={cancelledBy}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="rule-notice-lt">Notice hours less than</Label>
                  <Input
                    id="rule-notice-lt"
                    min={0}
                    onChange={(event) => setNoticeHoursLessThan(event.target.value)}
                    type="number"
                    value={noticeHoursLessThan}
                  />
                </div>
                <div>
                  <Label htmlFor="rule-notice-gte">Notice hours at least</Label>
                  <Input
                    id="rule-notice-gte"
                    min={0}
                    onChange={(event) => setNoticeHoursAtLeast(event.target.value)}
                    type="number"
                    value={noticeHoursAtLeast}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {ruleType === "BONUS" || ruleType === "ATTENDANCE" ? (
            <div className="space-y-3 rounded-control border border-app-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">
                Condition
              </p>
              <div>
                <Label htmlFor="rule-min-hours">Minimum teaching hours</Label>
                <Input
                  id="rule-min-hours"
                  min={0}
                  onChange={(event) => setMinTeachingHours(event.target.value)}
                  type="number"
                  value={minTeachingHours}
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-3 rounded-control border border-app-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">Effect</p>
            <Select
              id="rule-effect-kind"
              onChange={(event) => setEffectKind(event.target.value as PayrollRuleEffect["kind"])}
              options={[
                { label: "Percent of the class's value", value: "PAYOUT_PERCENT" },
                { label: "Flat amount", value: "FLAT_AMOUNT" }
              ]}
              value={effectKind}
            />
            {effectKind === "PAYOUT_PERCENT" ? (
              <div>
                <Label htmlFor="rule-percent">Percent (0–100)</Label>
                <Input
                  id="rule-percent"
                  max={100}
                  min={0}
                  onChange={(event) => setPercent(event.target.value)}
                  type="number"
                  value={percent}
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="rule-flat-amount">Amount</Label>
                <Input
                  id="rule-flat-amount"
                  min={0}
                  onChange={(event) => setFlatAmountMajor(event.target.value)}
                  step="0.01"
                  type="number"
                  value={flatAmountMajor}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                onChange={(event) => setPriority(event.target.value)}
                type="number"
                value={priority}
              />
            </div>
            <div>
              <Label htmlFor="rule-effective-from">Effective from</Label>
              <DateStringPicker
                id="rule-effective-from"
                onChange={(value) => setEffectiveFrom(value)}
                
                value={effectiveFrom}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={(checked) => setEnabled(checked === true)} />
            Enabled
          </label>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={!canSubmit} isLoading={create.isPending} onClick={handleSubmit} type="button">
            Create rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
