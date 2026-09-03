"use client";

import { useMemo, useState } from "react";
import {
  resolveLiveClassSettings,
  type LiveClassPreset,
  type LiveClassSettings,
  type LiveClassSettingsOverride,
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
}

export function ClassSettingsPanel({
  system,
  batchOverride,
  value,
  onChange,
  presets = [],
  disabled = false,
  showAdvanced = true,
}: ClassSettingsPanelProps) {
  const [appliedPresetId, setAppliedPresetId] = useState("");

  const inheritedFrom = useMemo(
    () => resolveLiveClassSettings({ system, batch: batchOverride }),
    [system, batchOverride],
  );
  const resolved = useMemo(
    () => resolveLiveClassSettings({ system, batch: batchOverride, class: value }),
    [system, batchOverride, value],
  );

  const applyPreset = (id: string) => {
    setAppliedPresetId(id);
    if (!id) {
      onChange({});
      return;
    }
    const preset = presets.find((p) => p.id === id);
    if (preset) onChange(structuredClone(preset.settings));
  };

  return (
    <div className="space-y-4">
      {presets.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-app-muted">
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
      />

      {!isEmptyOverride(value) || presets.length > 0 ? (
        <ConfigurationSummary resolved={resolved} />
      ) : null}
    </div>
  );
}
