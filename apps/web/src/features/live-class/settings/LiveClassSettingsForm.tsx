"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import {
  getLiveClassSettingsWarnings,
  type LiveClassSettings,
  type LiveClassSettingsOverride,
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import {
  GROUP_LABELS,
  SETTINGS_FIELDS,
  type SettingsGroup,
  getAtPath,
  isOverridden,
  setAtPath,
  unsetAtPath,
} from "./fields";

interface LiveClassSettingsFormProps {
  override: LiveClassSettingsOverride;
  onOverrideChange: (next: LiveClassSettingsOverride) => void;
  /** Resolved settings with the current override applied — drives effective values + warnings. */
  resolved: LiveClassSettings;
  /** The layer directly beneath the override (system, or system+batch merged). */
  inheritedFrom: LiveClassSettings;
  /** Which keys the batch layer set — controls whether an inherited badge reads "batch" or "default". */
  batchOverride?: LiveClassSettingsOverride | null;
  disabled?: boolean;
  /** Render coach + coach-auto-join rows. */
  showAdvanced?: boolean;
  /** "class" tweaks a class; "batch" edits batch defaults; "system" edits the global policy. */
  scope?: "class" | "batch" | "system";
}

const GROUP_ORDER: SettingsGroup[] = ["media", "participants", "classroom"];

export function LiveClassSettingsForm({
  override,
  onOverrideChange,
  resolved,
  inheritedFrom,
  batchOverride,
  disabled = false,
  showAdvanced = true,
  scope = "class",
}: LiveClassSettingsFormProps) {
  const warnings = getLiveClassSettingsWarnings(resolved);

  const fields = SETTINGS_FIELDS.filter((f) => showAdvanced || !f.advanced);

  const handleChange = (path: string, value: string) => {
    // If the chosen value equals what would be inherited anyway, drop the key so
    // the field keeps showing "inherited" rather than a redundant "custom".
    if (scope !== "system" && value === getAtPath(inheritedFrom, path)) {
      onOverrideChange(unsetAtPath(override, path));
    } else {
      onOverrideChange(setAtPath(override, path, value));
    }
  };

  return (
    <div className="space-y-4">
      {GROUP_ORDER.map((group) => {
        const groupFields = fields.filter((f) => f.group === group);
        if (groupFields.length === 0) return null;
        return (
          <fieldset
            key={group}
            className="rounded-app border border-app-border bg-app-surface p-4"
          >
            <legend className="px-1 text-xs font-bold uppercase tracking-wider text-app-muted">
              {GROUP_LABELS[group]}
            </legend>
            <div className="mt-2 divide-y divide-app-border">
              {groupFields.map((field) => {
                const overridden = isOverridden(override, field.path);
                const effective = getAtPath(resolved, field.path);
                const inheritedIsBatch =
                  !!batchOverride && getAtPath(batchOverride, field.path) !== undefined;

                return (
                  <div
                    key={field.path}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-app-text">{field.label}</span>
                        {scope !== "system" &&
                          (overridden ? (
                            <Badge variant="default" className="py-0.5 text-[10px]">
                              {scope === "batch" ? "Batch default" : "Custom for this class"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="py-0.5 text-[10px] font-semibold">
                              {inheritedIsBatch ? "Inherited from batch" : "System default"}
                            </Badge>
                          ))}
                      </div>
                      {field.help && (
                        <p className="mt-0.5 text-xs text-app-muted">{field.help}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 sm:w-64 sm:shrink-0">
                      <Select
                        className="min-h-10 text-sm"
                        aria-label={field.label}
                        disabled={disabled}
                        value={effective ?? field.options[0]?.value}
                        options={field.options}
                        onChange={(e) => handleChange(field.path, e.target.value)}
                      />
                      {scope !== "system" && overridden && !disabled && (
                        <SimpleTooltip
                          label={scope === "batch" ? "Clear batch default" : "Reset to inherited"}
                        >
                          <button
                            type="button"
                            aria-label={
                              scope === "batch" ? "Clear batch default" : "Reset to inherited"
                            }
                            className="grid size-8 shrink-0 place-items-center rounded-full border border-app-border text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
                            onClick={() => onOverrideChange(unsetAtPath(override, field.path))}
                          >
                            <RotateCcw className="size-4" strokeWidth={2.5} />
                          </button>
                        </SimpleTooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {warnings.length > 0 && (
        <div
          className={cn(
            "flex gap-2.5 rounded-control border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900",
            "dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-200",
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
