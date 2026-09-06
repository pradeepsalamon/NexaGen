"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LIVE_CLASS_SETTINGS,
  liveClassSettingsSchema,
  resolveLiveClassSettings,
  type CreateLiveClassPresetRequest,
  type LiveClassPreset,
  type LiveClassPresetScope,
  type LiveClassSettings,
  type UpdateLiveClassPresetRequest,
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { LiveClassSettingsForm } from "./LiveClassSettingsForm";
import { createLiveClassPreset, deleteLiveClassPreset, updateLiveClassPreset } from "./api";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { queryKeys } from "@/lib/queryKeys";

function toUpdatePayload(preset: LiveClassPreset): UpdateLiveClassPresetRequest {
  return {
    name: preset.name,
    description: preset.description ?? undefined,
    scope: preset.scope,
    settings: preset.settings,
    isDefault: preset.isDefault
  };
}

interface PresetFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing preset, or null to create a new one. */
  preset?: LiveClassPreset | null;
  /** Scope for a newly-created preset (ignored when editing). "ORG" is admin-only. */
  scope?: LiveClassPresetScope;
}

export function PresetFormModal({
  open,
  onOpenChange,
  preset,
  scope = "PERSONAL",
}: PresetFormModalProps) {
  const effectiveScope: LiveClassPresetScope = preset ? preset.scope : scope;
  const isOrg = effectiveScope === "ORG";

  const { run: runCreate, isPending: isCreating } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: async (body: CreateLiveClassPresetRequest) => {
      const result = await createLiveClassPreset(body);
      onOpenChange(false);
      return result;
    },
    undo: (_vars, result) => deleteLiveClassPreset(result.id),
    toast: (vars) => ({ title: `"${vars.name}" created` }),
    invalidates: [queryKeys.liveClassPresets.all]
  });

  const { run: runUpdate, isPending: isUpdating } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: async (vars: { id: string; body: UpdateLiveClassPresetRequest; previous: LiveClassPreset }) => {
      const result = await updateLiveClassPreset(vars.id, vars.body);
      onOpenChange(false);
      return result;
    },
    undo: (vars) => updateLiveClassPreset(vars.id, toUpdatePayload(vars.previous)),
    toast: () => ({ title: "Preset updated" }),
    invalidates: [queryKeys.liveClassPresets.all]
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [settings, setSettings] = useState<LiveClassSettings>(DEFAULT_LIVE_CLASS_SETTINGS);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNameError(null);
    if (preset) {
      setName(preset.name);
      setDescription(preset.description ?? "");
      setSettings(resolveLiveClassSettings({ system: {}, class: preset.settings }));
    } else {
      setName("");
      setDescription("");
      setSettings(structuredClone(DEFAULT_LIVE_CLASS_SETTINGS));
    }
  }, [open, preset]);

  const isPending = isCreating || isUpdating;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Give the preset a name.");
      return;
    }
    const body = {
      name: trimmed,
      description: description.trim() || undefined,
      scope: effectiveScope,
      settings,
    };
    if (preset) runUpdate({ id: preset.id, body, previous: preset });
    else runCreate(body);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {preset
              ? `Edit ${isOrg ? "organisation " : ""}preset`
              : `New ${isOrg ? "organisation" : "live class"} preset`}
          </DialogTitle>
          <DialogDescription>
            {isOrg
              ? "Shared with every coach in the organisation. Changing it later never affects classes already configured with it."
              : "A reusable set of class settings you can apply when starting a class. Changing a preset later never affects classes you already configured with it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <FormField id="preset-name" label="Preset name">
            <Input
              id="preset-name"
              value={name}
              maxLength={80}
              placeholder="e.g. Kids Class, Exam Mode, Analysis Session"
              hasError={!!nameError}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
            />
            {nameError && <p className="text-xs font-medium text-app-danger">{nameError}</p>}
          </FormField>

          <FormField id="preset-description" label="Description (optional)">
            <Textarea
              id="preset-description"
              value={description}
              maxLength={500}
              placeholder="What this preset is for"
              className="min-h-16"
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>

          <LiveClassSettingsForm
            override={settings}
            onOverrideChange={(next) => setSettings(liveClassSettingsSchema.parse(next))}
            resolved={settings}
            inheritedFrom={DEFAULT_LIVE_CLASS_SETTINGS}
            scope="system"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending ? "Saving…" : preset ? "Save preset" : "Create preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
