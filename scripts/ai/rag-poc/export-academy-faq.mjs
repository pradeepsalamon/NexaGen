#!/usr/bin/env node
// Writes the academy's public FAQ (apps/web/src/features/academy/content.ts)
// as Markdown for the RAG proof of concept's `poc_academy_faq` collection
// (docs/ai/architecture/RAG_POC.md §1). The output is committed.
//
//   node scripts/ai/rag-poc/export-academy-faq.mjs          regenerate
//   node scripts/ai/rag-poc/export-academy-faq.mjs --check  fail if stale

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = join(root, "apps/web/src/features/academy/content.ts");
const target = join(root, "services/ai-runtime/eval/rag_poc/corpus/academy_faq.md");
// The repo's own TypeScript (CI without `npm ci` provides it through NODE_PATH).
const ts = createRequire(import.meta.url)("typescript");

// content.ts has no imports, so a plain transpile + sandboxed run is enough.
const { outputText } = ts.transpileModule(readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});
const module = { exports: {} };
vm.runInNewContext(outputText, { exports: module.exports, module });
const content = module.exports;

const lines = [
  `# ${content.ACADEMY_NAME}: frequently asked questions`,
  "",
  `Generated from apps/web/src/features/academy/content.ts by scripts/ai/rag-poc/export-academy-faq.mjs. Do not edit.`,
  "",
  content.ACADEMY_DESCRIPTION,
  ""
];
for (const { question, answer } of content.ACADEMY_FAQ) lines.push(`## ${question}`, "", answer, "");
lines.push("## Programs", "");
for (const program of content.ACADEMY_PROGRAMS) {
  lines.push(`### ${program.level}`, "", `${program.summary} Topics: ${program.topics.join(", ")}.`, "");
}
lines.push("## Class formats", "");
for (const format of content.ACADEMY_CLASS_FORMATS) lines.push(`### ${format.name}`, "", format.description, "");
const markdown = `${lines.join("\n").trimEnd()}\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {
    // missing counts as stale
  }
  if (current !== markdown) {
    console.error(`${target} is stale: run node scripts/ai/rag-poc/export-academy-faq.mjs and commit.`);
    process.exit(1);
  }
  console.log("Academy FAQ export is up to date.");
} else {
  writeFileSync(target, markdown);
  console.log(`Wrote ${target}`);
}
