#!/usr/bin/env node
// Writes the AI runtime contract (Zod, packages/types/src/ai-runtime-contract.ts)
// to services/ai-runtime/contract/v1/ as JSON Schema (Draft 2020-12), plus the
// task policy and a manifest. Build packages/types first.
//
//   node scripts/ai/export-contract.mjs          regenerate the committed files
//   node scripts/ai/export-contract.mjs --check  fail if they are stale (CI)
//
// See docs/ai/architecture/PHASE1_SPEC.md §3.5.

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "services/ai-runtime/contract/v1");
const require = createRequire(join(root, "packages/types/package.json"));

const types = require(join(root, "packages/types/dist/index.js"));
const { z } = require("zod");
const zodVersion = require("zod/package.json").version;

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

const stringify = (value) => `${JSON.stringify(sortKeys(value), null, 2)}\n`;

function render() {
  const files = {};
  for (const [name, { schema }] of Object.entries(types.AI_CONTRACT_SCHEMAS)) {
    // Always the input side. Contract schemas have no transforms, so input and
    // output differ only in that "output" closes every z.object — and responses
    // must stay open (a minor version may add a field). Strict objects stay
    // closed either way.
    const json = z.toJSONSchema(schema, { io: "input", target: "draft-2020-12", unrepresentable: "throw" });
    files[`${name}.schema.json`] = stringify({ ...json, $id: `nexa-ai-runtime/v1/${name}`, title: name });
  }
  files["task-policy.json"] = stringify({
    contractVersion: types.AI_CONTRACT_VERSION,
    tasks: Object.values(types.AI_TASKS).map((task) => ({
      dataClasses: [...task.dataClasses],
      routes: [...task.routes],
      scope: task.scope,
      task: task.task
    }))
  });
  const hashes = Object.fromEntries(
    Object.entries(files).map(([file, text]) => [file, createHash("sha256").update(text).digest("hex")])
  );
  files["manifest.json"] = stringify({
    contractVersion: types.AI_CONTRACT_VERSION,
    errorCodes: types.aiErrorCode.options,
    files: hashes,
    zodVersion
  });
  return files;
}

function write(dir, files) {
  mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
}

const listed = (dir) => {
  try {
    return readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
  } catch {
    return [];
  }
};

const files = render();

if (!process.argv.includes("--check")) {
  for (const stale of listed(outDir)) {
    if (!(stale in files)) rmSync(join(outDir, stale));
  }
  write(outDir, files);
  console.log(`Wrote ${Object.keys(files).length} files to ${outDir}`);
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), "ai-contract-"));
try {
  write(tmp, files);
  const expected = listed(tmp);
  const actual = listed(outDir);
  const problems = [];
  for (const file of expected) {
    if (!actual.includes(file)) problems.push(`missing: ${file}`);
    else if (readFileSync(join(outDir, file), "utf8") !== files[file]) problems.push(`stale: ${file}`);
  }
  for (const file of actual) if (!expected.includes(file)) problems.push(`extra: ${file}`);
  if (problems.length) {
    console.error("AI contract drift (run `node scripts/ai/export-contract.mjs` and commit):");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log("AI contract is up to date.");
} finally {
  rmSync(tmp, { force: true, recursive: true });
}
