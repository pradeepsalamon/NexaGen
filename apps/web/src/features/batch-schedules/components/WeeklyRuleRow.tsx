"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TimePicker } from "@/components/ui/TimePicker";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { DAY_LABELS } from "../lib/scheduleFormat";

export type RuleDraft = {
  key: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  coachId: string;
};

type Props = {
  rule: RuleDraft;
  coaches: { id: string; name: string }[];
  onChange: (patch: Partial<RuleDraft>) => void;
  onRemove: () => void;
  canRemove: boolean;
};

export function WeeklyRuleRow({ rule, coaches, onChange, onRemove, canRemove }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-control border border-app-border bg-app-background p-3 sm:grid-cols-[1.2fr_1fr_1fr_1.6fr_auto] sm:items-end">
      <label className="grid gap-1 text-xs font-bold text-app-muted">
        Day
        <Select
          aria-label="Day of week"
          value={String(rule.dayOfWeek)}
          onChange={(e) => onChange({ dayOfWeek: Number(e.target.value) })}
          options={DAY_LABELS.map((label, index) => ({ label, value: String(index) }))}
        />
      </label>
      <label className="grid gap-1 text-xs font-bold text-app-muted">
        Start
        <TimePicker
          aria-label="Start time"
          value={rule.startTime}
          onChange={(startTime) => onChange({ startTime })}
        />
      </label>
      <label className="grid gap-1 text-xs font-bold text-app-muted">
        End
        <TimePicker
          aria-label="End time"
          value={rule.endTime}
          onChange={(endTime) => onChange({ endTime })}
        />
      </label>
      <label className="grid gap-1 text-xs font-bold text-app-muted">
        Coach
        <Select
          aria-label="Coach"
          value={rule.coachId}
          onChange={(e) => onChange({ coachId: e.target.value })}
          placeholder="Select coach"
          options={coaches.map((c) => ({ label: c.name, value: c.id }))}
        />
      </label>
      <div className="flex sm:justify-center sm:pb-0.5">
        <SimpleTooltip label="Remove this weekly class">
          <Button
            aria-label="Remove weekly class"
            variant="outline"
            size="icon"
            className="size-8 rounded-full border-app-danger p-0 text-app-danger transition-colors hover:bg-app-danger hover:text-white disabled:opacity-40"
            disabled={!canRemove}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
      </div>
    </div>
  );
}
