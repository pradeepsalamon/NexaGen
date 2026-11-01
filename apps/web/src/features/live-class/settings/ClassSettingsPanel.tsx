"use client";

import { useMemo, useState } from "react";
import {
  liveClassLockSources,
  resolveLiveClassSettings,
  withoutLockedFields,
  type LiveClassPreset,
  type LiveClassSettings,
  type LiveClassSettingsOverride,
  type LiveSettingExceptionField,
  type LockableLiveSetting,
} from "@nexa-chess/types";
import { Select } from "@/components/ui/Select";
import { ConfigurationSummary } from "./ConfigurationSummary";
import { LiveClassSettingsForm } from "./LiveClassSettingsForm";
import { isEmptyOverride } from "./fields";

interface ClassSettingsPanelProps {
  /** Layer 1 resolved system defaults. */
  system: LiveClassSettings;
  /** Layer 3 batch override, for inheritance labelling. */
  batchOverride?: LiveClassSettingsOverride | null;
  /** Layer 2 class override — controlled. */
  value: LiveClassSettingsOverride;
  onChange: (next: LiveClassSettingsOverride) => void;
  presets?: LiveClassPreset[];
  disabled?: boolean;
  showAdvanced?: boolean;
  /** Academy and batch locks: those fields render read-only. */
  systemLocks?: LockableLiveSetting[];
  batchLocks?: LockableLiveSetting[];
  /** Locked fields an admin approved a different value for, on this class. */
  lockExceptions?: LockableLiveSetting[];
  onRequestException?: (field: LiveSettingExceptionField) => void;
}

const NO_LOCKS: LockableLiveSetting[] = [];

export function ClassSettingsPanel({
  system,
  batchOverride,
  value,
  onChange,
  presets = [],
  disabled = false,
  showAdvanced = true,
  systemLocks = NO_LOCKS,
  batchLocks = NO_LOCKS,
  lockExceptions = NO_LOCKS,
  onRequestException,
}: ClassSettingsPanelProps) {
  const [appliedPresetId, setAppliedPresetId] = useState("");

  const inheritedFrom = useMemo(
    () => resolveLiveClassSettings({ system, batch: batchOverride, systemLocks, batchLocks }),
    [system, batchOverride, systemLocks, batchLocks],
  );
  const resolved = useMemo(
    () =>
      resolveLiveClassSettings({
        system,
        batch: batchOverride,
        class: value,
        systemLocks,
        batchLocks,
        classExceptions: lockExceptions,
      }),
    [system, batchOverride, value, systemLocks, batchLocks, lockExceptions],
  );
  const lockSources = useMemo(
    () => liveClassLockSources({ systemLocks, batchLocks }),
    [systemLocks, batchLocks],
  );

  const applyPreset = (id: string) => {
    setAppliedPresetId(id);
    if (!id) {
      onChange({});
      return;
    }
    const preset = presets.find((p) => p.id === id);
    // A preset's locked fields don't apply (the API drops them too).
    if (preset) onChange(withoutLockedFields(structuredClone(preset.settings), [...systemLocks, ...batchLocks]) ?? {});
  };

  return (
    <div className="space-y-4">
      {presets.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-app-muted">
            Start from a preset
          </label>
          <Select
            aria-label="Apply a preset"
            disabled={disabled}
            value={appliedPresetId}
            onChange={(e) => applyPreset(e.target.value)}
            placeholder="No preset — inherit batch / system defaults"
            options={presets.map((p) => ({
              value: p.id,
              label: p.isSystem ? `${p.name} (system)` : p.name,
            }))}
          />
          <p className="text-[11px] text-app-muted">
            Applying a preset copies its values here. You can still adjust individual settings, and
            later changes to the preset won&apos;t affect this class.
          </p>
        </div>
      )}

      <LiveClassSettingsForm
        override={value}
        onOverrideChange={onChange}
        resolved={resolved}
        inheritedFrom={inheritedFrom}
        batchOverride={batchOverride}
        disabled={disabled}
        showAdvanced={showAdvanced}
        scope="class"
        lockSources={lockSources}
        lockExceptions={lockExceptions}
        onRequestException={onRequestException}
      />

      {!isEmptyOverride(value) || presets.length > 0 ? (
        <ConfigurationSummary resolved={resolved} />
      ) : null}
    </div>
  );
}
