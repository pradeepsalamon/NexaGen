import { TEXT_SCALE_FACTORS, type FontId, type Typography } from "@nexa-chess/types";

// Read by the pre-paint script in app/layout.tsx — keep the shape in step.
const CACHE_KEY = "nexa-typography";

export function fontFamilyOf(id: FontId) {
  return `var(--font-${id}), ui-sans-serif, system-ui, sans-serif`;
}

/** Repoints the app-wide heading/body fonts and text size, and caches them for the next first paint. */
export function applyTypography(config: Typography) {
  const scale = TEXT_SCALE_FACTORS[config.textScale];
  const root = document.documentElement;
  root.style.setProperty("--font-heading", `var(--font-${config.headingFont})`);
  root.style.setProperty("--font-body", `var(--font-${config.bodyFont})`);
  root.style.setProperty("--text-scale", String(scale));
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ body: config.bodyFont, heading: config.headingFont, scale })
    );
  } catch {
    /* storage unavailable */
  }
}
