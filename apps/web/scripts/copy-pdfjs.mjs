// Copies pdf.js' prebuilt browser files into public/vendor/pdfjs (gitignored),
// run before `next dev` / `next build`.
//
// pdf.js is deliberately NOT bundled: its .mjs files are themselves webpack
// output, and Next's webpack rewrites their internal `__webpack_require__`
// references ("Object.defineProperty called on non-object" at runtime). The PDF
// diagram import loads these files with a webpackIgnore'd import() instead.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("pdfjs-dist/package.json"));
const out = join(dirname(fileURLToPath(import.meta.url)), "../public/vendor/pdfjs");
mkdirSync(out, { recursive: true });
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
  copyFileSync(join(pkgDir, "legacy/build", file), join(out, file));
}
console.log(`pdf.js ${require("pdfjs-dist/package.json").version} → public/vendor/pdfjs`);
