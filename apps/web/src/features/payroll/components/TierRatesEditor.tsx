"use client";

import { Plus, X } from "lucide-react";
import {
  compensationTierConfigSchema,
  formatMoney,
  toMinorUnits,
  type CompensationTierConfig
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SimpleTooltip } from "@/components/ui/Tooltip";

export type TierRow = { key: number; uptoHours: string; rate: string };

export const INITIAL_TIER_ROWS: TierRow[] = [
  { key: 0, uptoHours: "", rate: "" },
  { key: 1, uptoHours: "", rate: "" }
];

export function toTierConfig(rows: TierRow[], currency: string): CompensationTierConfig {
  return rows.map((row, index) => ({
    ...(index < rows.length - 1 ? { uptoHours: Number(row.uptoHours) } : {}),
    rateMinor: toMinorUnits(Number(row.rate) || 0, currency)
  }));
}

export function isValidTierConfig(config: CompensationTierConfig): boolean {
  return (
    config.length > 0 &&
    config.every((tier) => tier.rateMinor > 0) &&
    compensationTierConfigSchema.safeParse(config).success
  );
}

export function formatTierSummary(config: CompensationTierConfig, currency: string): string {
  return config
    .map(
      (tier) =>
        `${tier.uptoHours === undefined ? "above" : `up to ${tier.uptoHours} h`}: ${formatMoney(tier.rateMinor, currency)}/h`
    )
    .join(" · ");
}

export function TierRatesEditor({
  currency,
  onChange,
  rows
}: {
  currency: string;
  onChange: (rows: TierRow[]) => void;
  rows: TierRow[];
}) {
  const update = (key: number, patch: Partial<TierRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addBand = () => {
    const key = Math.max(...rows.map((row) => row.key)) + 1;
    // The new band goes before the last one, which stays open-ended.
    onChange([...rows.slice(0, -1), { key, uptoHours: "", rate: "" }, ...rows.slice(-1)]);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-app-muted">
        Hours are counted per pay period. Each rate applies only to the hours inside its band.
      </p>
      {rows.map((row, index) => {
        const isLast = index === rows.length - 1;
        return (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-2" key={row.key}>
            <div>
              <Label htmlFor={`tier-upto-${row.key}`}>Up to (hours)</Label>
              {isLast ? (
                <p className="flex h-10 items-center text-sm text-app-muted" id={`tier-upto-${row.key}`}>
                  All remaining
                </p>
              ) : (
                <Input
                  id={`tier-upto-${row.key}`}
                  inputMode="decimal"
                  onChange={(event) => update(row.key, { uptoHours: event.target.value })}
                  step="0.5"
                  type="number"
                  value={row.uptoHours}
                />
              )}
            </div>
            <div>
              <Label htmlFor={`tier-rate-${row.key}`}>Per hour ({currency})</Label>
              <Input
                id={`tier-rate-${row.key}`}
                inputMode="decimal"
                onChange={(event) => update(row.key, { rate: event.target.value })}
                step="0.01"
                type="number"
                value={row.rate}
              />
            </div>
            {rows.length > 1 ? (
              <SimpleTooltip label="Remove band">
                <Button
                  aria-label={`Remove band ${index + 1}`}
                  className="mb-1 size-8"
                  onClick={() => onChange(rows.filter((other) => other.key !== row.key))}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-4" strokeWidth={2.5} />
                </Button>
              </SimpleTooltip>
            ) : null}
          </div>
        );
      })}
      <Button onClick={addBand} size="sm" type="button" variant="outline">
        <Plus className="mr-1.5 size-4" strokeWidth={2.5} />
        Add band
      </Button>
    </div>
  );
}
