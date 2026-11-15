"use client";

import { startTransition, useEffect, useState } from "react";

export interface ChartColors {
  primary: string;
  secondary: string;
  accent: string;
  danger: string;
  muted: string;
  border: string;
  surface: string;
  text: string;
  /** Ordered categorical palette derived from the theme tokens. */
  categorical: string[];
}

function read(): ChartColors {
  // Before the browser can resolve them, charts paint straight from the CSS variables.
  const styles = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  const v = (name: string) => styles?.getPropertyValue(name).trim() || `var(${name})`;
  const colors = {
    primary: v("--color-primary"),
    secondary: v("--color-accent"),
    accent: v("--color-success"),
    danger: v("--color-danger"),
    muted: v("--color-text-muted"),
    border: v("--color-border"),
    surface: v("--color-surface"),
    text: v("--color-text")
  };
  return {
    ...colors,
    categorical: [
      colors.primary,
      colors.secondary,
      colors.accent,
      v("--color-chart-1"),
      v("--color-chart-2"),
      v("--color-chart-3"),
      v("--color-chart-4")
    ]
  };
}

/** Resolves the theme's CSS-variable palette to concrete colors for recharts,
 *  re-reading whenever the theme toggles or the OS scheme changes. */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(read);

  useEffect(() => {
    const refresh = () => setColors(read());
    refresh();
    // Re-read after the new theme has painted: reading styles inside the
    // mutation callback forced a whole-page style pass before that paint.
    let frame = 0;
    const refreshLater = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => window.setTimeout(() => startTransition(refresh), 0));
    };
    const observer = new MutationObserver(refreshLater);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"]
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", refreshLater);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener("change", refreshLater);
    };
  }, []);

  return colors;
}
