"use client";

import { Globe, KeyRound, ShieldCheck, Shuffle, type LucideIcon } from "lucide-react";
import {
  DEMO_CLASS_ACCESS_MODE_DESCRIPTIONS,
  DEMO_CLASS_ACCESS_MODE_LABELS,
  type DemoClassAccessMode
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

const MODE_ICONS: Record<DemoClassAccessMode, LucideIcon> = {
  PUBLIC: Globe,
  PASSCODE: KeyRound,
  INVITE_ONLY: ShieldCheck
};

const MODES: DemoClassAccessMode[] = ["PUBLIC", "PASSCODE", "INVITE_ONLY"];

// No 0/O/1/I so a passcode read aloud or over WhatsApp can't be mistyped.
const PASSCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateDemoPasscode(length = 6): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSCODE_ALPHABET[b % PASSCODE_ALPHABET.length]).join("");
}

interface DemoAccessFieldsProps {
  accessMode: DemoClassAccessMode;
  passcode: string;
  onAccessModeChange: (mode: DemoClassAccessMode) => void;
  onPasscodeChange: (passcode: string) => void;
  passcodeError?: string;
  disabled?: boolean;
}

export function DemoAccessFields({
  accessMode,
  passcode,
  onAccessModeChange,
  onPasscodeChange,
  passcodeError,
  disabled
}: DemoAccessFieldsProps) {
  return (
    <fieldset className="grid gap-3" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-app-text">Who can join</legend>
      <div role="radiogroup" aria-label="Who can join" className="grid gap-2 sm:grid-cols-3">
        {MODES.map((mode) => {
          const Icon = MODE_ICONS[mode];
          const selected = accessMode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                onAccessModeChange(mode);
                if (mode === "PASSCODE" && !passcode) onPasscodeChange(generateDemoPasscode());
              }}
              className={cn(
                "grid gap-1 rounded-control border p-3 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-app-border bg-app-surface hover:border-primary/50"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-bold text-app-text">
                <Icon aria-hidden="true" className={cn("size-4", selected ? "text-primary-ink" : "text-app-muted")} />
                {DEMO_CLASS_ACCESS_MODE_LABELS[mode]}
              </span>
              <span className="text-xs text-app-muted">{DEMO_CLASS_ACCESS_MODE_DESCRIPTIONS[mode]}</span>
            </button>
          );
        })}
      </div>

      {accessMode === "PASSCODE" && (
        <div className="grid gap-1">
          <label htmlFor="demo-passcode" className="text-sm font-medium text-app-text">
            Passcode
          </label>
          <div className="flex gap-2">
            <Input
              id="demo-passcode"
              value={passcode}
              onChange={(e) => onPasscodeChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              maxLength={12}
              placeholder="e.g. KNIGHT7"
              className="font-mono tracking-widest"
              autoComplete="off"
            />
            <SimpleTooltip label="Generate a new passcode">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Generate a new passcode"
                onClick={() => onPasscodeChange(generateDemoPasscode())}
              >
                <Shuffle aria-hidden="true" className="size-4" />
              </Button>
            </SimpleTooltip>
          </div>
          {passcodeError ? (
            <p className="text-xs text-app-danger-ink">{passcodeError}</p>
          ) : (
            <p className="text-xs text-app-muted">4–12 letters or numbers. Not case-sensitive for guests.</p>
          )}
        </div>
      )}
    </fieldset>
  );
}
