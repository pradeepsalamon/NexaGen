"use client";

import { RotateCcw, Settings } from "lucide-react";
import { useId, useState } from "react";
import { useTheme } from "../providers/ThemeProvider";
import { Button } from "./ui/Button";

const colorFields = [
  { key: "primary", label: "Primary Color" },
  { key: "secondary", label: "Secondary Color" },
  { key: "accent", label: "Accent Color" }
] as const;

export function ThemeSettings() {
  const panelId = useId();
  const { colors, resetColors, setColor } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative z-20">
      <Button
        aria-controls={panelId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        variant="secondary"
      >
        <Settings aria-hidden="true" className="mr-2 size-4" strokeWidth={2.5} />
        Theme Settings
      </Button>
      {isOpen ? (
        <section
          className="absolute right-0 top-[calc(100%+10px)] grid w-[min(320px,calc(100vw-32px))] animate-slide-up gap-4 rounded-app border border-app-border bg-app-surface p-4 shadow-soft max-sm:left-0 max-sm:right-auto"
          id={panelId}
        >
          <div>
            <h2 className="mb-1 text-base font-extrabold text-app-text">
              Theme Settings
            </h2>
            <p className="m-0 text-sm leading-5 text-app-muted">
              Customize the global brand colors for this workspace.
            </p>
          </div>
          <div className="grid gap-3">
            {colorFields.map((field) => (
              <label
                className="flex items-center justify-between text-sm font-bold text-app-text"
                key={field.key}
              >
                <span>{field.label}</span>
                <input
                  aria-label={field.label}
                  className="h-9 w-12 cursor-pointer border-0 bg-transparent p-0"
                  onChange={(event) => setColor(field.key, event.target.value)}
                  type="color"
                  value={colors[field.key]}
                />
              </label>
            ))}
          </div>
          <Button onClick={resetColors} variant="ghost">
            <RotateCcw
              aria-hidden="true"
              className="mr-2 size-4"
              strokeWidth={2.5}
            />
            Reset Colors
          </Button>
        </section>
      ) : null}
    </div>
  );
}
