// Copies pdf.js' prebuilt browser files into public/vendor/pdfjs (gitignored),
// run before `next dev` / `next build`.
//
// pdf.js is deliberately NOT bundled: its .mjs files are themselves webpack
// output, and Next's webpack rewrites their internal `__webpack_require__`
// references ("Object.defineProperty called on non-object" at runtime). The PDF
// diagram import loads these files with a webpackIgnore'd import() instead.
import { copyFileSync, cpSync, mkdirSync } from "node:fs";
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
// The image decoders (`wasmUrl` in lib/pdf.ts) and their licences. Without them
// a JPEG2000 scan renders blank.
cpSync(join(pkgDir, "wasm"), join(out, "wasm"), { recursive: true });
console.log(`pdf.js ${require("pdfjs-dist/package.json").version} → public/vendor/pdfjs`);

// Tesseract for reading captions on pages with no text layer (lib/ocr.ts). Same
// reason: its worker and wasm load by URL, and nothing leaves the browser.
const ocrOut = join(dirname(out), "tesseract");
const tesseract = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(require.resolve("tesseract.js-core/package.json"));
const lang = dirname(require.resolve("@tesseract.js-data/eng/package.json"));
mkdirSync(join(ocrOut, "core"), { recursive: true });
mkdirSync(join(ocrOut, "lang"), { recursive: true });
for (const file of ["tesseract.esm.min.js", "worker.min.js"]) {
  copyFileSync(join(tesseract, "dist", file), join(ocrOut, file));
}
for (const variant of ["tesseract-core-lstm", "tesseract-core-simd-lstm", "tesseract-core-relaxedsimd-lstm"]) {
  copyFileSync(join(core, `${variant}.wasm.js`), join(ocrOut, "core", `${variant}.wasm.js`));
}
copyFileSync(join(lang, "4.0.0_best_int", "eng.traineddata.gz"), join(ocrOut, "lang", "eng.traineddata.gz"));
console.log(`tesseract.js ${require("tesseract.js/package.json").version} → public/vendor/tesseract`);
