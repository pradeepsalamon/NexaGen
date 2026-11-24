"use client";

import { useEffect, useState } from "react";
import { Swords } from "lucide-react";
import type { BatchBattleSettings } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useUpdateBatchBattleSettings } from "../hooks/useSoloRush";

export type BattlesEnabledValue = "" | "on" | "off";

export const BATTLES_ENABLED_OPTIONS: { label: string; value: BattlesEnabledValue }[] = [
  { label: "Automatic (group batches take part)", value: "" },
  { label: "Takes part", value: "on" },
  { label: "Doesn't take part", value: "off" }
];

export function toBattlesEnabledValue(value: boolean | null): BattlesEnabledValue {
  return value === null ? "" : value ? "on" : "off";
}

export function fromBattlesEnabledValue(value: string): boolean | null {
  return value === "" ? null : value === "on";
}

/**
 * A batch's Batch Battles settings (docs/PUZZLE_RUSH_SOLO.md § "Batch
 * Battles"): whether it competes, and whether other batches see its top
 * player's name. Opened by a coach from their batch card.
 */
export function BatchBattleSettingsDialog({
  batchName,
  onClose,
  settings
}: {
  batchName: string;
  onClose: () => void;
  settings: BatchBattleSettings | null;
}) {
  const save = useUpdateBatchBattleSettings();
  const [enabled, setEnabled] = useState<BattlesEnabledValue>("");
  const [showNames, setShowNames] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEnabled(toBattlesEnabledValue(settings.battlesEnabled));
    setShowNames(settings.battlesShowNames);
  }, [settings]);

  async function onSave() {
    if (!settings) return;
    try {
      await save.mutateAsync({
        batchId: settings.batchId,
        body: { battlesEnabled: fromBattlesEnabledValue(enabled), battlesShowNames: showNames }
      });
      onClose();
    } catch {
      // The hook's toast says why; the dialog stays open to try again.
    }
  }

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open={settings !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Swords aria-hidden="true" className="size-5 text-accent-ink" strokeWidth={2.5} />
            Batch Battles
          </DialogTitle>
          <DialogDescription>
            {batchName} on the academy&apos;s Storm and Racer batch board. Batches are ranked by their players&apos;
            average best score.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField
            hint="One-to-one and buddy batches stay out unless you turn them on."
            id="battlesEnabled"
            label="Takes part"
          >
            <Select
              id="battlesEnabled"
              onChange={(event) => setEnabled(event.target.value as BattlesEnabledValue)}
              options={BATTLES_ENABLED_OPTIONS}
              value={enabled}
            />
          </FormField>
          <FormField
            hint="Students are minors: off by default, other batches see scores without names."
            id="battlesShowNames"
            label="Top player's name"
          >
            <Switch
              checked={showNames}
              id="battlesShowNames"
              label={showNames ? "Shown to other batches" : "Hidden from other batches"}
              onCheckedChange={setShowNames}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={() => void onSave()} type="button">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
