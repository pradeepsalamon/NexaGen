/**
 * Candidate colour sets for the final UI palette decision (2026-11-06).
 *
 * Each set gives the four colours the owner compared (sidebar, primary, accent,
 * background). `buildCss()` turns them into the same CSS variables
 * `apps/web/src/styles/globals.css` defines, for light and dark, so the real
 * pages can be painted with them without touching app code.
 *
 * `current` has no override: it is the live theme, captured as the baseline.
 * Success / warning / danger / info are left alone in every set on purpose,
 * so only the brand colours differ between screenshots.
 */

export const PALETTES = [
  {
    id: "0-current",
    name: "Current: Navy + Royal Blue",
    source: "live theme",
    swatches: { sidebar: "#0F1E3A", primary: "#2F5FD0", accent: "#E9BE72", background: "#F8FAFC" },
    current: true,
  },
  {
    id: "0b-current-black",
    name: "Current colours, black dark",
    source: "live theme + black dark body",
    swatches: { sidebar: "#0F1E3A", primary: "#2F5FD0", accent: "#E9BE72", background: "#F8FAFC" },
  },
  {
    id: "1-royal-emerald",
    name: "Royal Emerald",
    source: "ChatGPT 01",
    swatches: { sidebar: "#102C26", primary: "#174C3C", accent: "#D5B46A", background: "#F5F2E9" },
  },
  {
    id: "2-midnight-royal",
    name: "Midnight Royal",
    source: "ChatGPT 02",
    swatches: { sidebar: "#111827", primary: "#243B64", accent: "#8BA7D8", background: "#F8FAFC" },
  },
  {
    id: "3-obsidian-gold",
    name: "Obsidian & Gold",
    source: "ChatGPT 03",
    swatches: { sidebar: "#171717", primary: "#292929", accent: "#C6A15B", background: "#F3F0E9" },
    // A charcoal button disappears on a near-black page; dark mode uses warm white.
    dark: { primary: "#EDE9E0" },
  },
  {
    id: "4-sandstone-terracotta",
    name: "Sandstone & Terracotta",
    source: "ChatGPT 08",
    swatches: { sidebar: "#29231F", primary: "#9B5039", accent: "#C47C5B", background: "#FAF6F0" },
    light: { accentSoft: "#E5D1B9" },
  },
  {
    id: "5-navy-gold-cta",
    name: "Navy + Gold buttons",
    source: "Claude B",
    swatches: { sidebar: "#0F1E3A", primary: "#E3B25B", accent: "#E3B25B", background: "#F8FAFC" },
    // Gold needs dark text; coloured text (links) uses the B "link" blue.
    light: { primaryInk: "#3A5A8C", onPrimary: "#3B2A0B" },
    dark: { primary: "#E3B25B", primaryInk: "#9DB5DB", onPrimary: "#3B2A0B" },
  },
  {
    id: "6-navy-indigo",
    name: "Navy + Indigo",
    source: "Claude C",
    swatches: { sidebar: "#111936", primary: "#4F46E5", accent: "#E9BE72", background: "#F8FAFC" },
  },
  {
    id: "7-navy-teal",
    name: "Navy + Board Teal",
    source: "Claude D",
    swatches: { sidebar: "#0F1E3A", primary: "#0F766E", accent: "#E9BE72", background: "#F8FAFC" },
  },
  {
    id: "8-graphite-violet",
    name: "Graphite + Violet",
    source: "new",
    swatches: { sidebar: "#18181B", primary: "#6D5BD0", accent: "#C9A86A", background: "#FAFAFA" },
  },
  {
    id: "9-ocean-blurple",
    name: "Deep Ocean + Blurple",
    source: "new",
    swatches: { sidebar: "#0A2540", primary: "#635BFF", accent: "#F5B83D", background: "#F6F9FC" },
  },
  {
    id: "10-ink-electric-blue",
    name: "Ink + Electric Blue",
    source: "new",
    swatches: { sidebar: "#0B0B0F", primary: "#2563EB", accent: "#E9BE72", background: "#FFFFFF" },
  },
  {
    id: "11-charcoal-emerald",
    name: "Charcoal + Emerald",
    source: "new",
    swatches: { sidebar: "#111315", primary: "#047857", accent: "#D4AF37", background: "#F7F7F5" },
  },
  {
    id: "12-burgundy-rose-gold",
    name: "Burgundy & Rose Gold",
    source: "new (title from ChatGPT 06)",
    swatches: { sidebar: "#2A0F17", primary: "#7A1F3D", accent: "#C99A86", background: "#FBF7F5" },
  },
  {
    id: "13-slate-cyan",
    name: "Slate + Cyan",
    source: "new",
    swatches: { sidebar: "#0F172A", primary: "#0E7490", accent: "#E9BE72", background: "#F8FAFC" },
  },
];

// ── colour maths ────────────────────────────────────────────────
const WHITE = "#FFFFFF";
const BLACK = "#000000";

function toRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function toHex(rgb) {
  return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}
/** t = 0 → a, t = 1 → b */
export function mix(a, b, t) {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
}
function readableOn(bg, dark) {
  return contrast(WHITE, bg) >= contrast(dark, bg) ? WHITE : dark;
}
const triplet = (hex) => toRgb(hex).join(" ");

// ── token derivation ───────────────────────────────────────────
export function lightTokens(p) {
  const { sidebar, primary, accent, background } = p.swatches;
  const o = p.light ?? {};
  const text = mix(sidebar, BLACK, 0.15);
  const t = {
    background,
    surface: mix(background, WHITE, 0.75),
    surfaceSoft: mix(background, sidebar, 0.04),
    border: mix(background, sidebar, 0.12),
    lineStrong: mix(background, sidebar, 0.5),
    text,
    textMuted: mix(text, background, 0.3),
    textSubtle: mix(text, background, 0.42),
    brand900: mix(sidebar, BLACK, 0.3),
    brand800: sidebar,
    brand700: mix(sidebar, WHITE, 0.12),
    onBrand: WHITE,
    onBrandMuted: mix(WHITE, sidebar, 0.35),
    primary,
    primaryHover: mix(primary, BLACK, 0.15),
    primaryDark: mix(primary, BLACK, 0.3),
    primarySoft: mix(primary, WHITE, 0.9),
    onPrimary: o.onPrimary ?? readableOn(primary, mix(sidebar, BLACK, 0.4)),
    primaryInk: o.primaryInk ?? (contrast(primary, WHITE) >= 4.5 ? mix(primary, BLACK, 0.2) : mix(primary, BLACK, 0.5)),
    accent,
    accentHover: mix(accent, BLACK, 0.1),
    accentSoft: o.accentSoft ?? mix(accent, WHITE, 0.8),
    onAccent: mix(accent, BLACK, 0.75),
    accentInk: mix(accent, BLACK, 0.5),
  };
  return { ...t, ...o };
}

export function darkTokens(p) {
  const { sidebar, primary, accent, background } = p.swatches;
  const o = p.dark ?? {};
  // Dark body is neutral black for every set (owner, 2026-11-06); only the
  // sidebar/header keep the set's own dark tint.
  const bg = "#0A0A0A";
  const text = "#F5F5F5";
  const darkPrimary = o.primary ?? (luminance(primary) < 0.3 ? mix(primary, WHITE, 0.45) : primary);
  const t = {
    background: bg,
    surface: "#141414",
    surfaceSoft: "#0F0F0F",
    border: "#262626",
    lineStrong: "#525252",
    text,
    textMuted: "#A3A3A3",
    textSubtle: "#8A8A8A",
    brand900: mix(sidebar, BLACK, 0.5),
    brand800: mix(sidebar, WHITE, 0.05),
    brand700: mix(sidebar, WHITE, 0.13),
    onBrand: text,
    onBrandMuted: mix(text, sidebar, 0.35),
    primary: darkPrimary,
    primaryHover: mix(darkPrimary, WHITE, 0.15),
    primaryDark: mix(darkPrimary, BLACK, 0.1),
    primarySoft: mix(darkPrimary, bg, 0.78),
    onPrimary: o.onPrimary ?? readableOn(darkPrimary, mix(sidebar, BLACK, 0.4)),
    primaryInk: o.primaryInk ?? mix(darkPrimary, WHITE, 0.45),
    accent,
    accentHover: mix(accent, WHITE, 0.2),
    accentSoft: mix(accent, bg, 0.8),
    onAccent: mix(accent, BLACK, 0.75),
    accentInk: mix(accent, WHITE, 0.3),
  };
  return { ...t, ...o, primary: darkPrimary };
}

function vars(t, { chrome }) {
  const lines = [];
  if (chrome) {
    lines.push(
      `--rgb-background:${triplet(t.background)}`,
      `--rgb-surface:${triplet(t.surface)}`,
      `--rgb-surface-soft:${triplet(t.surfaceSoft)}`,
      `--rgb-surface-hover:${triplet(t.surfaceSoft)}`,
      `--rgb-border:${triplet(t.border)}`,
      `--rgb-line-strong:${triplet(t.lineStrong)}`,
      `--rgb-text:${triplet(t.text)}`,
      `--rgb-text-muted:${triplet(t.textMuted)}`,
      `--rgb-text-subtle:${triplet(t.textSubtle)}`,
      `--rgb-brand-900:${triplet(t.brand900)}`,
      `--rgb-brand-800:${triplet(t.brand800)}`,
      `--rgb-brand-700:${triplet(t.brand700)}`,
      `--rgb-on-brand:${triplet(t.onBrand)}`,
      `--rgb-on-brand-muted:${triplet(t.onBrandMuted)}`,
    );
  }
  lines.push(
    `--rgb-primary:${triplet(t.primary)}`,
    `--rgb-primary-hover:${triplet(t.primaryHover)}`,
    `--rgb-primary-dark:${triplet(t.primaryDark)}`,
    `--rgb-primary-soft:${triplet(t.primarySoft)}`,
    `--rgb-on-primary:${triplet(t.onPrimary)}`,
    `--color-primary-ink:${t.primaryInk}`,
    `--rgb-accent:${triplet(t.accent)}`,
    `--rgb-accent-hover:${triplet(t.accentHover)}`,
    `--rgb-accent-soft:${triplet(t.accentSoft)}`,
    `--rgb-on-accent:${triplet(t.onAccent)}`,
    `--color-accent-ink:${t.accentInk}`,
  );
  return lines.map((l) => `  ${l} !important;`).join("\n");
}

/** CSS that repaints the app with palette `p`; empty for the current theme. */
export function buildCss(p) {
  if (p.current) return "";
  const L = lightTokens(p);
  const D = darkTokens(p);
  const shadow = p.swatches.sidebar;
  return `
html:root {
${vars(L, { chrome: true })}
  --shadow-card: 0 1px 2px ${shadow}0F, 0 1px 3px ${shadow}14 !important;
  --shadow-lift: 0 4px 12px ${shadow}14, 0 2px 4px ${shadow}0F !important;
  --shadow-soft: 0 16px 40px -4px ${shadow}29, 0 4px 12px ${shadow}14 !important;
}
html:root[data-theme="dark"] {
${vars(D, { chrome: true })}
}
/* Navy chrome reads the dark primary/accent in both themes, as in globals.css. */
html:root .surface-brand, html:root[data-theme="dark"] .surface-brand {
${vars(D, { chrome: false })}
}
`;
}

/** Contrast figures shown in the gallery (WCAG AA body text needs 4.5). */
export function contrastReport(p) {
  const L = p.current
    ? { primary: "#2F5FD0", onPrimary: "#FFFFFF", primaryInk: "#1E3F94", surface: "#FFFFFF", accent: "#E9BE72", onAccent: "#3B2A0B" }
    : lightTokens(p);
  return {
    button: contrast(L.primary, L.onPrimary).toFixed(1),
    link: contrast(L.primaryInk, L.surface).toFixed(1),
    gold: contrast(L.accent, L.onAccent).toFixed(1),
  };
}
