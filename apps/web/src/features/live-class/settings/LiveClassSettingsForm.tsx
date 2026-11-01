"use client";

import { AlertTriangle, Lock, LockOpen, RotateCcw } from "lucide-react";
import {
  LIVE_SETTING_EXCEPTION_FIELDS,
  LOCKABLE_LIVE_SETTINGS,
  getLiveClassSettingsWarnings,
  type LiveClassLockSource,
  type LiveClassSettings,
  type LiveClassSettingsOverride,
  type LiveSettingExceptionField,
  type LockableLiveSetting,
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
  /**
   * `"auto"` puts label and control side by side from `sm` up — right for a
   * full-width page. `"stacked"` never does, for narrow containers like the
   * in-meeting sidebar, where the viewport-based `sm:` breakpoint says
   * "wide" while the panel is only ~360px and the row overflows.
   */
  layout?: "auto" | "stacked";
  /**
   * Fields locked by a layer above this one (academy, or batch for a class).
   * They render read-only with a "Locked by …" badge; the API refuses changes.
   */
  lockSources?: Partial<Record<LockableLiveSetting, LiveClassLockSource>>;
  /** Locked fields an admin approved a different value for, on this class. */
  lockExceptions?: readonly LockableLiveSetting[];
  /** When set, a locked field offers "Ask an admin" (a coach, before the class). */
  onRequestException?: (field: LiveSettingExceptionField) => void;
  /**
   * Admin editors (scope "system" / "batch"): this layer's own lock list. With
   * `onLocksChange`, each lockable field gets a lock toggle.
   */
  locks?: readonly LockableLiveSetting[];
  onLocksChange?: (next: LockableLiveSetting[]) => void;
}

const NO_EXCEPTIONS: readonly LockableLiveSetting[] = [];

const canBeExcepted = (path: string): path is LiveSettingExceptionField =>
  (LIVE_SETTING_EXCEPTION_FIELDS as readonly string[]).includes(path);

const isLockable = (path: string): path is LockableLiveSetting =>
  (LOCKABLE_LIVE_SETTINGS as readonly string[]).includes(path);

const GROUP_ORDER: SettingsGroup[] = ["media", "participants", "classroom"];

/**
 * Waiting room and student auto-join can't both be ENABLED (the server rejects
 * the combination). Each maps to the other so a change can clear its partner —
 * unless the partner is locked above, in which case the conflicting value is
 * simply not offered.
 */
const MUTUALLY_EXCLUSIVE_ENABLED: Record<string, LockableLiveSetting> = {
  "autoJoin.student": "waitingRoom",
  waitingRoom: "autoJoin.student",
};

export function LiveClassSettingsForm({
  override,
  onOverrideChange,
  resolved,
  inheritedFrom,
  batchOverride,
  disabled = false,
  showAdvanced = true,
  scope = "class",
  layout = "auto",
  lockSources = {},
  lockExceptions = NO_EXCEPTIONS,
  onRequestException,
  locks = [],
  onLocksChange,
}: LiveClassSettingsFormProps) {
  const stacked = layout === "stacked";
  const warnings = getLiveClassSettingsWarnings(resolved);

  const fields = SETTINGS_FIELDS.filter((f) => showAdvanced || !f.advanced);

  const toggleLock = (path: LockableLiveSetting) => {
    if (!onLocksChange) return;
    const next = locks.includes(path) ? locks.filter((p) => p !== path) : [...locks, path];
    onLocksChange(LOCKABLE_LIVE_SETTINGS.filter((p) => next.includes(p)));
  };

  // ENABLED is not offered when the exclusive partner is locked above at ENABLED.
  const optionsFor = (path: string, options: { label: string; value: string }[]) => {
    const partner = MUTUALLY_EXCLUSIVE_ENABLED[path];
    if (!partner || !lockSources[partner] || getAtPath(resolved, partner) !== "ENABLED") return options;
    return options.map((option) => (option.value === "ENABLED" ? { ...option, disabled: true } : option));
  };

  const handleChange = (path: string, value: string) => {
    // If the chosen value equals what would be inherited anyway, drop the key so
    // the field keeps showing "inherited" rather than a redundant "custom".
    const applyOne = (base: LiveClassSettingsOverride, p: string, v: string) =>
      scope !== "system" && v === getAtPath(inheritedFrom, p) ? unsetAtPath(base, p) : setAtPath(base, p, v);

    let next = applyOne(override, path, value);

    // Waiting room and student auto-join are mutually exclusive (the server
    // rejects the combination via `validateLiveClassSettings`) — clear the
    // other field in the same change so the user never hits that 400. Never
    // write to a field locked above: the API would refuse the whole save (and
    // the conflicting option isn't offered then anyway).
    const partner = MUTUALLY_EXCLUSIVE_ENABLED[path];
    if (partner && value === "ENABLED" && !lockSources[partner] && getAtPath(resolved, partner) === "ENABLED") {
      next = applyOne(next, partner, "DISABLED");
    }

    onOverrideChange(next);
  };

  return (
    <div className="space-y-4">
      {GROUP_ORDER.map((group) => {
        const groupFields = fields.filter((f) => f.group === group);
        if (groupFields.length === 0) return null;
        return (
          <fieldset
            key={group}
            className={cn(
              "min-w-0 rounded-app border border-app-border bg-app-surface",
              stacked ? "p-3" : "p-4",
            )}
          >
            <legend className="px-1 text-xs font-bold text-app-muted">
              {GROUP_LABELS[group]}
            </legend>
            <div className="mt-2 divide-y divide-app-border">
              {groupFields.map((field) => {
                const lockedAbove = isLockable(field.path) ? lockSources[field.path] : undefined;
                const overridden = !lockedAbove && isOverridden(override, field.path);
                const effective = getAtPath(resolved, field.path);
                const inheritedIsBatch =
                  !!batchOverride && getAtPath(batchOverride, field.path) !== undefined;
                const canToggleLock =
                  !!onLocksChange && !lockedAbove && isLockable(field.path) && !disabled;
                const lockedHere = isLockable(field.path) && locks.includes(field.path);
                const excepted = isLockable(field.path) && lockExceptions.includes(field.path);

                return (
                  <div
                    key={field.path}
                    className={cn(
                      "flex min-w-0 flex-col gap-2 py-3",
                      !stacked && "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-app-text">{field.label}</span>
                        {lockedAbove ? (
                          <Badge variant="outline" className="gap-1 py-0.5 text-[10px] font-semibold">
                            <Lock className="size-3" strokeWidth={2.5} />
                            {lockedAbove === "ACADEMY" ? "Locked by academy" : "Locked by batch"}
                          </Badge>
                        ) : lockedHere ? (
                          <Badge variant="default" className="gap-1 py-0.5 text-[10px]">
                            <Lock className="size-3" strokeWidth={2.5} />
                            {scope === "system" ? "Locked for all classes" : "Locked for this batch"}
                          </Badge>
                        ) : null}
                        {lockedAbove && excepted ? (
                          <Badge variant="default" className="py-0.5 text-[10px]">
                            Admin allowed this for this class
                          </Badge>
                        ) : null}
                        {scope !== "system" &&
                          !lockedAbove &&
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
                      {lockedAbove && !excepted && onRequestException && canBeExcepted(field.path) && (
                        <button
                          type="button"
                          className="mt-1 text-xs font-semibold text-primary-ink underline-offset-2 hover:underline"
                          onClick={() => onRequestException(field.path as LiveSettingExceptionField)}
                        >
                          Ask an admin to change this for this class
                        </button>
                      )}
                    </div>

                    <div
                      className={cn(
                        "flex min-w-0 items-center gap-2",
                        !stacked && "sm:w-64 sm:shrink-0",
                      )}
                    >
                      <Select
                        className="min-h-10 min-w-0 text-sm"
                        aria-label={field.label}
                        disabled={disabled || !!lockedAbove}
                        value={effective ?? field.options[0]?.value}
                        options={optionsFor(field.path, field.options)}
                        onChange={(e) => handleChange(field.path, e.target.value)}
                      />
                      {canToggleLock && (
                        <SimpleTooltip
                          label={
                            lockedHere
                              ? "Unlock: coaches may change this for their classes"
                              : "Lock: coaches can't change this for their classes"
                          }
                        >
                          <button
                            type="button"
                            aria-label={lockedHere ? `Unlock ${field.label}` : `Lock ${field.label}`}
                            aria-pressed={lockedHere}
                            className={cn(
                              "grid size-8 shrink-0 place-items-center rounded-full border transition-colors",
                              lockedHere
                                ? "border-primary bg-primary/10 text-primary-ink"
                                : "border-app-border text-app-muted hover:bg-app-soft hover:text-app-text",
                            )}
                            onClick={() => toggleLock(field.path as LockableLiveSetting)}
                          >
                            {lockedHere ? (
                              <Lock className="size-4" strokeWidth={2.5} />
                            ) : (
                              <LockOpen className="size-4" strokeWidth={2.5} />
                            )}
                          </button>
                        </SimpleTooltip>
                      )}
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
                            onClick={() => {
                              // Through handleChange, so restoring an inherited
                              // ENABLED still clears its mutually exclusive partner.
                              const inherited = getAtPath(inheritedFrom, field.path);
                              if (typeof inherited === "string") handleChange(field.path, inherited);
                              else onOverrideChange(unsetAtPath(override, field.path));
                            }}
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
            "flex gap-2.5 rounded-control border border-secondary/40 bg-secondary/10 p-3 text-xs text-secondary-ink",
            "",
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
