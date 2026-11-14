#!/usr/bin/env node
// Vendors the app's Google Fonts into the repo so `next build` never talks to
// Google. Run it only to add/refresh a font:
//
//   node apps/web/scripts/vendor-google-fonts.mjs
//
// It asks Google for the same CSS `next/font/google` used to request (Chrome
// UA → woff2, variable fonts over their full `wght` axis), keeps the `latin` +
// `latin-ext` blocks, downloads their files into `src/assets/fonts/<id>/` and
// writes the `fonts.generated.ts` modules listed in GROUPS: one `next/font/local` loader per font
// per subset, each carrying Google's `unicode-range`. Commit both.
//
// Why: next/font/google downloads at build time, and on 2026-10-16 Google
// served the CI runner a font URL with no file extension, which crashes
// next/font's loader ("Cannot read properties of null (reading '1')").
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_DIR = path.join(WEB_ROOT, "src/assets/fonts");
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36";
const SUBSETS = ["latin", "latin-ext"];

// `id` is the FontId (`--font-<id>`, FONT_CATALOG in @nexa-chess/types).
// `weights: null` = variable font over its whole weight axis.
const FONTS = [
  { family: "Outfit", id: "outfit", weights: null, wght: "100..900" },
  { family: "Nunito Sans", id: "nunito-sans", weights: null, wght: "200..1000" },
  { family: "Jost", id: "jost", weights: null, wght: "100..900" },
  { family: "Lato", id: "lato", weights: ["400", "700", "900"] },
  { family: "Plus Jakarta Sans", id: "plus-jakarta-sans", weights: null, wght: "200..800" },
  { family: "Inter", id: "inter", weights: null, wght: "100..900" },
  { family: "Lexend", id: "lexend", weights: null, wght: "100..900" },
  { family: "Atkinson Hyperlegible", id: "atkinson-hyperlegible", weights: ["400", "700"] },
  { family: "Playfair Display", id: "playfair", weights: ["600", "700"] }
];

// Which loaders exist, per generated module (a route only loads the fonts of
// the modules it imports). `preload` puts the latin file in a <link rel=preload>.
const GROUPS = {
  APP: { file: "src/app/fonts.generated.ts", fonts: [
    { id: "outfit", preload: true },
    { id: "nunito-sans", preload: true },
    { id: "jost" },
    { id: "lato" },
    { id: "plus-jakarta-sans" },
    { id: "inter" },
    { id: "lexend" },
    { id: "atkinson-hyperlegible" }
  ] },
  ACADEMY: { file: "src/app/academy/fonts.generated.ts", fonts: [{ id: "inter", preload: true }, { id: "playfair" }] }
};

function cssUrl(font) {
  const family = font.family.replace(/ /g, "+");
  const axis = font.weights ? font.weights.join(";") : font.wght;
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${axis}&display=swap`;
}

async function fetchOk(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

/** `/* latin *\/ @font-face { … }` blocks → { subset, weight, src, unicodeRange }. */
function parseFaces(css) {
  const faces = [];
  for (const match of css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)) {
    const [, subset, body] = match;
    const prop = (name) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
    const src = body.match(/url\(([^)]+)\)\s*format\('woff2'\)/)?.[1];
    if (prop("font-style") !== "normal") continue;
    if (!src) throw new Error(`No woff2 url in the ${subset} block`);
    faces.push({ src, subset, unicodeRange: prop("unicode-range"), weight: prop("font-weight") });
  }
  return faces;
}

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const pascal = (s) => camel(s).replace(/^./, (c) => c.toUpperCase());

async function vendorFont(font) {
  const faces = parseFaces(await (await fetchOk(cssUrl(font))).text()).filter((f) => SUBSETS.includes(f.subset));
  const dir = path.join(ASSET_DIR, font.id);
  await rm(dir, { force: true, recursive: true });
  await mkdir(dir, { recursive: true });

  const bySubset = {};
  for (const face of faces) {
    const file = `${face.subset}-${face.weight.replace(" ", "-")}.woff2`;
    await writeFile(path.join(dir, file), Buffer.from(await (await fetchOk(face.src)).arrayBuffer()));
    const entry = (bySubset[face.subset] ??= { files: [], unicodeRange: face.unicodeRange });
    if (entry.unicodeRange !== face.unicodeRange) throw new Error(`${font.family} ${face.subset}: weights disagree on unicode-range`);
    entry.files.push({ file: path.join(dir, file), weight: face.weight });
  }
  for (const subset of SUBSETS) {
    if (!bySubset[subset]) throw new Error(`${font.family} has no ${subset} subset`);
  }
  console.log(`${font.family}: ${faces.length} files`);
  return bySubset;
}

function loader(name, subset, entry, { from, last, preload }) {
  const src = entry.files
    .map((f) => `    { path: "${path.relative(from, f.file)}", style: "normal", weight: "${f.weight}" }`)
    .join(",\n");
  return [
    `const ${name} = localFont({`,
    // Only the face listed last keeps next's metric-matched fallback; the
    // ranges don't overlap, so the order of the others is irrelevant.
    ...(last ? [] : ["  adjustFontFallback: false,"]),
    `  declarations: [{ prop: "unicode-range", value: "${entry.unicodeRange}" }],`,
    `  display: "swap",`,
    `  preload: ${preload && subset === "latin"},`,
    `  src: [\n${src}\n  ]`,
    `});`
  ].join("\n");
}

async function main() {
  const vendored = {};
  for (const font of FONTS) vendored[font.id] = await vendorFont(font);

  const used = new Set(Object.values(GROUPS).flatMap((g) => g.fonts.map((f) => f.id)));
  for (const dir of await readdir(ASSET_DIR)) {
    if (!used.has(dir)) await rm(path.join(ASSET_DIR, dir), { force: true, recursive: true });
  }

  for (const [group, { file, fonts }] of Object.entries(GROUPS)) {
    const outFile = path.join(WEB_ROOT, file);
    const from = path.dirname(outFile);
    const blocks = [];
    const rows = [];
    for (const { id, preload = false } of fonts) {
      // latin-ext first, latin last (it holds the fallback face).
      const order = ["latin-ext", "latin"];
      const names = order.map((subset) => `${camel(id)}${pascal(subset)}`);
      order.forEach((subset, i) =>
        blocks.push(loader(names[i], subset, vendored[id][subset], { from, last: i === order.length - 1, preload }))
      );
      rows.push(`  "${id}": [${names.join(", ")}]`);
    }
    const out = [
      "// GENERATED by apps/web/scripts/vendor-google-fonts.mjs — do not edit by hand.",
      "// Self-hosted Google Fonts (OFL), latin + latin-ext, one loader per font per subset.",
      'import localFont from "next/font/local";',
      "",
      blocks.join("\n\n"),
      "",
      `export const ${group}_FONT_FACES = {\n${rows.join(",\n")}\n};`,
      ""
    ].join("\n");
    await writeFile(outFile, out);
    console.log(`Wrote ${file}`);
  }
}

await main();
