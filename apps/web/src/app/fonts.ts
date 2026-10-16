import { APP_FONT_FACES } from "./fonts.generated";

// Fonts are self-hosted (`next/font/local`, files in src/assets/fonts) so the
// build never fetches from Google. Each font is one loader per subset, each
// with Google's `unicode-range`; `--font-<id>` lists them, latin last because
// it carries next's metric-matched fallback face. Only the two defaults
// preload — the rest download the first time a user's resolved typography
// actually references them. To add or refresh a font, edit and re-run
// `apps/web/scripts/vendor-google-fonts.mjs`; the id must match FONT_CATALOG
// (@nexa-chess/types), since it is the CSS variable suffix.

type FontFaces = Record<string, readonly { style: { fontFamily: string } }[]>;

/** `selector{--font-<id>:<every subset face, latin last>;…}`. */
export function declareFontVariables(selector: string, faces: FontFaces) {
  const declarations = Object.entries(faces)
    .map(([id, loaders]) => `--font-${id}:${loaders.map((loader) => loader.style.fontFamily).join(",")};`)
    .join("");
  return `${selector}{${declarations}}`;
}

/** Rendered in a <style> in the root layout, so every `--font-<id>` is defined app-wide. */
export const fontVariablesCss = declareFontVariables(":root", APP_FONT_FACES);
