import { z } from "zod";

// ──────────────────────────────────────────────
// Academy branding (docs/SAAS_MULTI_TENANCY.md §F; Phase 5)
// ──────────────────────────────────────────────

/** Uploadable brand images. Public by nature (they render on the login page). */
export const BRAND_ASSET_KINDS = ["logoLight", "logoDark", "favicon", "loginImage"] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];
export const brandAssetKindSchema = z.enum(BRAND_ASSET_KINDS);

/** PNG, JPEG or WebP only (owner decision N-9: no SVG). */
export const BRAND_ASSET_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const BRAND_ASSET_MAX_BYTES: Record<BrandAssetKind, number> = {
  favicon: 256 * 1024,
  loginImage: 2 * 1024 * 1024,
  logoDark: 1024 * 1024,
  logoLight: 1024 * 1024
};

export const BRAND_THEMES = ["light", "dark", "system"] as const;
export type BrandTheme = (typeof BRAND_THEMES)[number];

/** For hints and colour pickers (web code may not hold hex literals). */
export const HEX_COLOUR_EXAMPLE = "#2F5FD0";
export const HEX_COLOUR_PICKER_FALLBACK = "#000000";

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #2F5FD0.")
  .transform((value) => value.toUpperCase());
const optionalText = (max: number) => z.string().trim().max(max).nullable();

/** What an academy's admins may set (plan feature `brandIdentity`). */
export const updateTenantBrandingRequestSchema = z
  .object({
    accentColor: hexColor.nullable(),
    contactEmail: z.string().trim().toLowerCase().email().max(254).nullable(),
    contactPhone: optionalText(30),
    defaultTheme: z.enum(BRAND_THEMES),
    displayName: z.string().trim().min(2).max(80).nullable(),
    emailSenderName: optionalText(80),
    primaryColor: hexColor.nullable(),
    replyToEmail: z.string().trim().toLowerCase().email().max(254).nullable(),
    seoDescription: optionalText(160),
    seoTitle: optionalText(70),
    tagline: optionalText(160)
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to change." });
export type UpdateTenantBrandingRequest = z.infer<typeof updateTenantBrandingRequestSchema>;

export type TenantBrandingSettings = {
  accentColor: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultTheme: BrandTheme;
  displayName: string | null;
  emailSenderName: string | null;
  faviconUrl: string | null;
  loginImageUrl: string | null;
  logoDarkUrl: string | null;
  logoLightUrl: string | null;
  primaryColor: string | null;
  replyToEmail: string | null;
  seoDescription: string | null;
  seoTitle: string | null;
  tagline: string | null;
  updatedAt: string | null;
};

/** `GET /admin/branding`: the academy's settings and which parts its plan unlocks. */
export type TenantBrandingResponse = {
  branding: TenantBrandingSettings;
  /** The academy's own name (the default display name). */
  tenantName: string;
  canEdit: boolean;
  /** The plan has `whiteLabel`; `hidePoweredBy` then applies. */
  whiteLabel: boolean;
  hidePoweredBy: boolean;
};

export const updateWhiteLabelRequestSchema = z.object({ hidePoweredBy: z.boolean() });
export type UpdateWhiteLabelRequest = z.infer<typeof updateWhiteLabelRequestSchema>;

/** `GET /admin/branding/domains`: the academy's addresses and the DNS target for a new one. */
export type TenantDomainsResponse = {
  domains: Array<{ hostname: string; kind: "SUBDOMAIN" | "CUSTOM"; status: "PENDING" | "ACTIVE" | "REMOVED"; isPrimary: boolean }>;
  /** Point a CNAME (or A record) for the academy's own domain here. */
  dnsTarget: string;
};

/** `POST /platform/tenants/:id/domains/:domainId/check`. */
export type PlatformDomainCheckResponse = {
  ok: boolean;
  result: string;
};

/** Light and dark `--rgb-*` triplets ("r g b") derived from one brand colour. */
export type BrandPalette = {
  light: Record<string, string>;
  dark: Record<string, string>;
};

/**
 * `GET /tenant/public-config` (public, by host): what any page on the
 * academy's address needs before sign-in. Never carries contact details the
 * academy hasn't set, and never anything private.
 */
export type TenantPublicConfig = {
  tenantId: string | null;
  /** Nexa's own academy: its marketing site and wording stay as they are. */
  isPlatformHome: boolean;
  name: string;
  tagline: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  loginImageUrl: string | null;
  defaultTheme: BrandTheme;
  contactEmail: string | null;
  contactPhone: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  /** CSS variable overrides, already contrast-checked; null = the default theme. */
  palette: BrandPalette | null;
  /** False on white-label plans: no "Powered by NexaChess". */
  poweredBy: boolean;
};

// ── Colour maths (shared so the API rejects what the web would render badly) ──

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
}

function channel(value: number) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: [number, number, number] = [255, 255, 255];
/** The dark theme's surface (`--rgb-surface` under `[data-theme="dark"]`). */
const DARK_SURFACE: [number, number, number] = [17, 26, 46];

/**
 * WCAG AA (§F): the primary colour carries white button text (4.5:1); the
 * accent marks UI on the light surface (3:1). Returns why a colour is refused,
 * or null when it passes.
 */
export function brandColorIssue(kind: "accent" | "primary", hex: string): string | null {
  const rgb = hexToRgb(hex);
  const ratio = contrastRatio(rgb, WHITE);
  if (kind === "primary" && ratio < 4.5) {
    return `White text on ${hex} has a contrast of ${ratio.toFixed(2)}:1; it needs at least 4.5:1. Pick a darker colour.`;
  }
  if (kind === "accent" && ratio < 1.5) {
    return `${hex} is too close to white to show on light pages (${ratio.toFixed(2)}:1). Pick a stronger colour.`;
  }
  return null;
}

const mix = (rgb: [number, number, number], target: [number, number, number], amount: number) =>
  rgb.map((value, index) => Math.round(value + (target[index] - value) * amount)) as [number, number, number];
const triplet = (rgb: [number, number, number]) => rgb.join(" ");
const hex = (rgb: [number, number, number]) => `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** Lightens a colour until it reads on the dark surface (4.5:1), for the dark theme. */
function forDark(rgb: [number, number, number]): [number, number, number] {
  let current = rgb;
  for (let step = 0; step < 20 && contrastRatio(current, DARK_SURFACE) < 4.5; step += 1) {
    current = mix(current, WHITE, 0.15);
  }
  return current;
}

/** The theme variables one brand colour replaces (see `apps/web/src/styles/globals.css`). */
export function deriveBrandPalette(primary: string | null, accent: string | null): BrandPalette | null {
  if (!primary && !accent) return null;
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  const BLACK: [number, number, number] = [0, 0, 0];
  if (primary) {
    const p = hexToRgb(primary);
    light["--rgb-primary"] = triplet(p);
    light["--rgb-primary-hover"] = triplet(mix(p, BLACK, 0.15));
    light["--rgb-primary-dark"] = triplet(mix(p, BLACK, 0.3));
    light["--rgb-primary-soft"] = triplet(mix(p, WHITE, 0.92));
    light["--color-primary-ink"] = hex(mix(p, BLACK, 0.3));
    const d = forDark(p);
    dark["--rgb-primary"] = triplet(d);
    dark["--rgb-primary-hover"] = triplet(mix(d, WHITE, 0.15));
    dark["--rgb-primary-dark"] = triplet(mix(d, BLACK, 0.15));
    dark["--rgb-primary-soft"] = triplet(mix(p, DARK_SURFACE, 0.75));
    dark["--color-primary-ink"] = hex(mix(d, WHITE, 0.4));
  }
  if (accent) {
    const a = hexToRgb(accent);
    light["--rgb-accent"] = triplet(a);
    light["--rgb-accent-hover"] = triplet(mix(a, BLACK, 0.1));
    light["--rgb-accent-soft"] = triplet(mix(a, WHITE, 0.85));
    const d = forDark(a);
    dark["--rgb-accent"] = triplet(d);
    dark["--rgb-accent-hover"] = triplet(mix(d, WHITE, 0.15));
    dark["--rgb-accent-soft"] = triplet(mix(a, DARK_SURFACE, 0.75));
  }
  return { dark, light };
}

/** CSS for the palette, injected server-side in the root layout. Values are generated, never user text. */
export function brandPaletteCss(palette: BrandPalette): string {
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .filter(([name, value]) => /^--[a-z-]+$/.test(name) && /^[#0-9A-Fa-f ]+$/.test(value))
      .map(([name, value]) => `${name}:${value};`)
      .join("");
  // One step more specific than globals.css (`:root[data-theme=…]`, `.surface-brand`), so order never matters.
  return (
    `html:root,html:root[data-theme="light"]{${block(palette.light)}}` +
    `html:root[data-theme="dark"],html .surface-brand{${block(palette.dark)}}`
  );
}

// ── Per-academy WhatsApp (§F "WhatsApp"; Phase 5d) ──

/** An academy connects its own WhatsApp Business number; without one, WhatsApp is off for it. */
export const updateWhatsAppSettingsRequestSchema = z.object({
  /** Blank keeps the stored token. Never sent back. */
  accessToken: z.string().trim().max(1000).optional(),
  enabled: z.boolean(),
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, "The phone number ID from Meta (digits only).")
});
export type UpdateWhatsAppSettingsRequest = z.infer<typeof updateWhatsAppSettingsRequestSchema>;

export type WhatsAppSettingsResponse = {
  /** Nexa's own academy uses the server's configured number; nothing to set here. */
  usesPlatformNumber: boolean;
  configured: boolean;
  enabled: boolean;
  phoneNumberId: string | null;
  hasAccessToken: boolean;
  updatedAt: string | null;
};
