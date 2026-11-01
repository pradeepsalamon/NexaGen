"use client";

import { useEffect, useState } from "react";

export interface ChartColors {
  primary: string;
  secondary: string;
  accent: string;
  warm: string;
  danger: string;
  muted: string;
  border: string;
  surface: string;
  text: string;
  /** Ordered categorical palette derived from the theme tokens. */
  categorical: string[];
}

function read(): ChartColors {
  const fallback: ChartColors = {
    primary: "#2f5fd0",
    secondary: "#e9be72",
    accent: "#15803d",
    warm: "#2f5fd0",
    danger: "#dc2626",
    muted: "#475569",
    border: "#e2e8f0",
    surface: "#ffffff",
    text: "#111827",
    categorical: []
  };
  if (typeof window === "undefined") {
    fallback.categorical = [
      fallback.primary,
      fallback.secondary,
      fallback.accent,
      fallback.warm,
      "#7c5cd6",
      "#12b5a5"
    ];
    return fallback;
  }
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb;
  const colors: ChartColors = {
    primary: v("--color-primary", fallback.primary),
    secondary: v("--color-accent", fallback.secondary),
    accent: v("--color-success", fallback.accent),
    warm: v("--color-warm", fallback.warm),
    danger: v("--color-danger", fallback.danger),
    muted: v("--color-text-muted", fallback.muted),
    border: v("--color-border", fallback.border),
    surface: v("--color-surface", fallback.surface),
    text: v("--color-text", fallback.text),
    categorical: []
  };
  colors.categorical = [
    colors.primary,
    colors.secondary,
    colors.accent,
    colors.warm,
    "#7c5cd6",
    "#12b5a5",
    "#f2749b",
    "#8a94a6"
  ];
  return colors;
}

/** Resolves the theme's CSS-variable palette to concrete colors for recharts,
 *  re-reading whenever the theme toggles or the OS scheme changes. */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(read);

  useEffect(() => {
    const refresh = () => setColors(read());
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"]
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", refresh);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", refresh);
    };
  }, []);

  return colors;
}
