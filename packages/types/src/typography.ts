import { z } from "zod";

// ──────────────────────────────────────────────
// Catalog — every font is an OFL-licensed Google Font, self-hosted by
// next/font. `id` doubles as the CSS variable suffix (`--font-<id>`), so the
// web app's font loader and this list must stay in step.
// ──────────────────────────────────────────────

export const fontIdSchema = z.enum([
  "outfit",
  "nunito-sans",
  "jost",
  "lato",
  "plus-jakarta-sans",
  "inter",
  "lexend",
  "atkinson-hyperlegible"
]);
export type FontId = z.infer<typeof fontIdSchema>;

export interface FontMeta {
  id: FontId;
  name: string;
  description: string;
}

export const FONT_CATALOG: FontMeta[] = [
  { id: "outfit", name: "Outfit", description: "Clean geometric — the Nexa heading default." },
  { id: "nunito-sans", name: "Nunito Sans", description: "Soft and very readable — the Nexa body default." },
  { id: "jost", name: "Jost", description: "Classic geometric with sharper letterforms." },
  { id: "lato", name: "Lato", description: "Neutral and familiar." },
  { id: "plus-jakarta-sans", name: "Plus Jakarta Sans", description: "Modern and crisp." },
  { id: "inter", name: "Inter", description: "Compact interface font." },
  { id: "lexend", name: "Lexend", description: "Wider spacing designed for easier reading." },
  {
    id: "atkinson-hyperlegible",
    name: "Atkinson Hyperlegible",
    description: "Made for low vision — every letter is distinct."
  }
];

export const textScaleSchema = z.enum(["sm", "md", "lg", "xl"]);
export type TextScale = z.infer<typeof textScaleSchema>;

/** Multiplier on the root font size; every rem-based size in the app follows it. */
export const TEXT_SCALE_FACTORS: Record<TextScale, number> = {
  sm: 0.9375,
  md: 1,
  lg: 1.125,
  xl: 1.25
};

export const TEXT_SCALE_LABELS: Record<TextScale, string> = {
  sm: "Small",
  md: "Default",
  lg: "Large",
  xl: "Extra large"
};

// ──────────────────────────────────────────────
// Config + partial override
// ──────────────────────────────────────────────

/** Fully-resolved typography. `typographySchema.parse({})` is the system default. */
export const typographySchema = z
  .object({
    headingFont: fontIdSchema.default("outfit"),
    bodyFont: fontIdSchema.default("nunito-sans"),
    textScale: textScaleSchema.default("md")
  })
  .prefault({});
export type Typography = z.infer<typeof typographySchema>;

export const DEFAULT_TYPOGRAPHY: Typography = typographySchema.parse({});

/** Stored on `TypographySettings` (admin) / `UserTypographyPreference` (user); absent keys inherit. */
export const typographyOverrideSchema = z.object({
  headingFont: fontIdSchema.optional(),
  bodyFont: fontIdSchema.optional(),
  textScale: textScaleSchema.optional()
});
export type TypographyOverride = z.infer<typeof typographyOverrideSchema>;

// ──────────────────────────────────────────────
// Resolution — same shape as resolveChessAppearance:
// system default → admin default → user preference, last non-empty wins,
// and `locked` skips the user layer.
// ──────────────────────────────────────────────

export type TypographySource = "user" | "admin-default" | "system-default";

function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

function parseOverride(value: unknown): TypographyOverride | null {
  if (value === null || value === undefined) return null;
  const parsed = typographyOverrideSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Patch an existing partial override without dropping keys the patch leaves out. */
export function mergeTypographyOverrides(
  base: TypographyOverride | null | undefined,
  patch: TypographyOverride | null | undefined
): TypographyOverride {
  if (!patch) return base ?? {};
  return { ...(base ?? {}), ...pruneUndefined(patch) };
}

export function resolveTypography(layers: {
  admin?: unknown;
  user?: unknown;
  locked?: boolean;
}): TypographyResponse {
  const adminOverride = parseOverride(layers.admin);
  const userOverride = layers.locked ? null : parseOverride(layers.user);

  let config: Typography = DEFAULT_TYPOGRAPHY;
  let source: TypographySource = "system-default";

  if (adminOverride && Object.keys(adminOverride).length > 0) {
    config = { ...config, ...pruneUndefined(adminOverride) };
    source = "admin-default";
  }
  if (userOverride && Object.keys(userOverride).length > 0) {
    config = { ...config, ...pruneUndefined(userOverride) };
    source = "user";
  }

  return { config: typographySchema.parse(config), source, locked: !!layers.locked };
}

// ──────────────────────────────────────────────
// API contract
// ──────────────────────────────────────────────

export type TypographyResponse = {
  config: Typography;
  source: TypographySource;
  /** Admin has locked typography — nobody may set a personal override. */
  locked: boolean;
};

export const updateTypographyRequestSchema = z.object({
  settings: typographyOverrideSchema
});
export type UpdateTypographyRequest = z.infer<typeof updateTypographyRequestSchema>;

export type TypographyAdminResponse = {
  id: string;
  settings: TypographyOverride;
  resolved: Typography;
  locked: boolean;
  updatedAt: string;
};

export const updateTypographyAdminRequestSchema = z.object({
  settings: typographyOverrideSchema,
  locked: z.boolean().optional()
});
export type UpdateTypographyAdminRequest = z.infer<typeof updateTypographyAdminRequestSchema>;
