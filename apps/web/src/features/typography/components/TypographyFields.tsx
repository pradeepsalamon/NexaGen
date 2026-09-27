"use client";

import { Check } from "lucide-react";
import {
  FONT_CATALOG,
  TEXT_SCALE_FACTORS,
  TEXT_SCALE_LABELS,
  textScaleSchema,
  type FontId,
  type Typography
} from "@nexa-chess/types";
import { cn } from "@/lib/utils";
import { fontFamilyOf } from "../lib/applyTypography";

function FontPicker({
  disabled,
  label,
  onSelect,
  selected
}: {
  disabled?: boolean;
  label: string;
  onSelect: (id: FontId) => void;
  selected: FontId;
}) {
  return (
    <fieldset className="space-y-2.5" disabled={disabled}>
      <legend className="text-sm font-bold text-app-text">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={label}>
        {FONT_CATALOG.map((font) => {
          const active = font.id === selected;
          return (
            <button
              aria-checked={active}
              className={cn(
                "relative flex items-center gap-3 rounded-control border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "border-primary bg-primary/5 shadow-card"
                  : "border-app-border bg-app-surface hover:border-primary/40 hover:bg-app-soft"
              )}
              key={font.id}
              onClick={() => onSelect(font.id)}
              role="radio"
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-control text-xl",
                  active ? "bg-primary text-white" : "bg-app-soft text-app-text"
                )}
                style={{ fontFamily: fontFamilyOf(font.id) }}
              >
                Aa
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-base font-semibold text-app-text"
                  style={{ fontFamily: fontFamilyOf(font.id) }}
                >
                  {font.name}
                </span>
                <span className="block text-xs leading-snug text-app-muted">{font.description}</span>
              </span>
              {active ? (
                <Check aria-hidden="true" className="size-4 shrink-0 text-primary-ink" strokeWidth={2.75} />
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Heading font, body font and text size, with a live preview of the combination. */
export function TypographyFields({
  disabled,
  onChange,
  value
}: {
  disabled?: boolean;
  onChange: (patch: Partial<Typography>) => void;
  value: Typography;
}) {
  const scale = TEXT_SCALE_FACTORS[value.textScale];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <FontPicker
          disabled={disabled}
          label="Headings & numbers"
          onSelect={(headingFont) => onChange({ headingFont })}
          selected={value.headingFont}
        />
        <FontPicker
          disabled={disabled}
          label="Body text"
          onSelect={(bodyFont) => onChange({ bodyFont })}
          selected={value.bodyFont}
        />
        <fieldset className="space-y-2.5" disabled={disabled}>
          <legend className="text-sm font-bold text-app-text">Text size</legend>
          <div
            aria-label="Text size"
            className="inline-flex flex-wrap gap-1 rounded-full border border-app-border bg-app-soft p-1"
            role="radiogroup"
          >
            {textScaleSchema.options.map((size) => {
              const active = size === value.textScale;
              return (
                <button
                  aria-checked={active}
                  className={cn(
                    "min-h-9 rounded-full px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:cursor-not-allowed disabled:opacity-60",
                    active
                      ? "bg-secondary text-black shadow-card"
                      : "text-app-muted hover:bg-app-surface hover:text-app-text"
                  )}
                  key={size}
                  onClick={() => onChange({ textScale: size })}
                  role="radio"
                  type="button"
                >
                  {TEXT_SCALE_LABELS[size]}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-app-muted">Preview</p>
        {/* Sized relative to the live root scale so the preview shows the chosen size, not the current one. */}
        <div
          className="space-y-3 rounded-app border border-app-border bg-app-surface p-5 shadow-card"
          style={{ fontSize: `calc(${scale}rem / var(--text-scale))` }}
        >
          <p
            className="text-[1.5em] font-bold leading-tight text-app-text"
            style={{ fontFamily: fontFamilyOf(value.headingFont) }}
          >
            Student Dashboard
          </p>
          <p className="text-[0.95em] leading-relaxed text-app-muted" style={{ fontFamily: fontFamilyOf(value.bodyFont) }}>
            Your next class starts in 20 minutes. Review the Sicilian Defence puzzles before you join.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Rating", "1,482"],
              ["Attendance", "92%"]
            ].map(([label, stat]) => (
              <div className="rounded-control bg-app-soft p-3" key={label}>
                <p className="text-[0.75em] text-app-muted" style={{ fontFamily: fontFamilyOf(value.bodyFont) }}>
                  {label}
                </p>
                <p
                  className="text-[1.35em] font-bold text-primary-ink"
                  style={{ fontFamily: fontFamilyOf(value.headingFont) }}
                >
                  {stat}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
