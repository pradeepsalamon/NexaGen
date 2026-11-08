#!/usr/bin/env node
/**
 * Builds the dark-theme twin of every empty-state illustration.
 *
 * The SVGs are served as <img>, so they can't read the app's theme tokens.
 * `EmptyStateIllustration` shows `empty-<name>.svg` in light and
 * `empty-<name>-dark.svg` in dark. The light file is the only source: edit it,
 * then run `node apps/web/scripts/nexachess-dark-variants.mjs` (or `--check`
 * to fail when a twin is stale). Never hand-edit a `-dark.svg`.
 *
 * Mapping: paper and ink swap, dim blues brighten, ground shadows deepen.
 * Per-file fix-ups keep large dark fills dark and headers blue.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../public/nexachess-assets/empty-states");

const SWAP = {
  "#0B1F3B": "#DBEAFE", // navy ink -> pale ink
  "#132D50": "#0B1F3B",
  "#1E40AF": "#3B82F6", // dim blue -> bright blue
  "#DBEAFE": "#1E40AF", // pale details -> mid blue
  "#F4F7FC": "#132D50", // paper -> navy card
  "#FFFFFF": "#132D50"
};

/** Applied after the swap, as exact [from, to] substitutions. */
const FIXUPS = {
  activity: [
    ['<path d="M120 86L196 124L120 162L44 124L120 86Z" fill="#DBEAFE"', '<path d="M120 86L196 124L120 162L44 124L120 86Z" fill="#0B1F3B"'],
    ['<path d="M120 96L158 115L120 134L82 115L120 96Z" fill="#0B1F3B"', '<path d="M120 96L158 115L120 134L82 115L120 96Z" fill="#132D50"']
  ],
  attendance: [['V66H44V54Z" fill="#DBEAFE"', 'V66H44V54Z" fill="#2563EB"']],
  puzzles: [
    ['<rect x="44" y="44" width="112" height="112" rx="14" fill="#DBEAFE"', '<rect x="44" y="44" width="112" height="112" rx="14" fill="#0B1F3B"'],
    ['width="44" height="44" rx="4" fill="#0B1F3B"', 'width="44" height="44" rx="4" fill="#132D50"', "all"]
  ],
  schedule: [
    // Header: blue, not pale. Rook: keep it blue to the base. Pedestal: visible on the card.
    ['<stop offset="0%" stop-color="#DBEAFE" />\n      <stop offset="100%" stop-color="#3B82F6" />', '<stop offset="0%" stop-color="#1E40AF" />\n      <stop offset="100%" stop-color="#2563EB" />'],
    ['<stop offset="0%" stop-color="#2563EB" />\n      <stop offset="55%" stop-color="#3B82F6" />\n      <stop offset="100%" stop-color="#DBEAFE" />', '<stop offset="0%" stop-color="#3B82F6" />\n      <stop offset="55%" stop-color="#2563EB" />\n      <stop offset="100%" stop-color="#1E40AF" />'],
    ['flood-color="#DBEAFE" flood-opacity="0.12"', 'flood-color="#000000" flood-opacity="0.4"'],
    ['V151H141V145Z" fill="#0B1F3B"', 'V151H141V145Z" fill="#1E40AF"']
  ],
  "search-results": [['fill="#132D50" fill-opacity="0.65"', 'fill="#132D50" fill-opacity="0.8"']],
  students: [['rx="3" fill="#0B1F3B"', 'rx="3" fill="#3B82F6"', "all"]]
};

export function toDark(name, svg) {
  let out = svg
    .split("\n")
    .map((line) =>
      line.includes('opacity="0.07"')
        ? line.replace('fill="#0B1F3B" opacity="0.07"', 'fill="#000000" opacity="0.3"')
        : line.replace(/#[0-9A-F]{6}/g, (hex) => SWAP[hex] ?? hex)
    )
    .join("\n");
  for (const [from, to, all] of FIXUPS[name] ?? []) {
    if (!out.includes(from)) throw new Error(`empty-${name}: fix-up no longer matches: ${from}`);
    out = all ? out.split(from).join(to) : out.replace(from, to);
  }
  return out;
}

const check = process.argv.includes("--check");
let stale = 0;
for (const file of readdirSync(DIR).sort()) {
  const match = /^empty-(.+)\.svg$/.exec(file);
  if (!match || file.endsWith("-dark.svg")) continue;
  const name = match[1];
  const target = join(DIR, `empty-${name}-dark.svg`);
  const next = toDark(name, readFileSync(join(DIR, file), "utf8"));
  let current = null;
  try {
    current = readFileSync(target, "utf8");
  } catch {
    // missing twin
  }
  if (current === next) continue;
  if (check) {
    console.error(`stale: empty-${name}-dark.svg`);
    stale++;
  } else {
    writeFileSync(target, next);
    console.log(`wrote empty-${name}-dark.svg`);
  }
}
if (stale) process.exit(1);
