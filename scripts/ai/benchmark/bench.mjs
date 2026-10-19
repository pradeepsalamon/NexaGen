#!/usr/bin/env node
// Phase 3a capacity benchmark scorer (docs/ai/architecture/INFRASTRUCTURE_DECISION.md §4).
// Normally started by run-capacity-benchmark.sh, which owns the Ollama container.
//
//   node scripts/ai/benchmark/bench.mjs --self-test
//   node scripts/ai/benchmark/bench.mjs --host http://127.0.0.1:11435 --model qwen2.5:3b \
//        [--bundles 10] [--out DIR] [--rss-file FILE] [--abort-file FILE] \
//        [--stockfish "docker exec -i nexa_api stockfish"] [--stockfish-nodes 1500000]
//
// Exit codes: 0 pass, 2 fail, 3 aborted (live class detected), 1 error.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { makeBundles } from "./bundles.mjs";
import { factRecall, referenceSummary, summaryJsonSchema, validateSummary } from "./validate.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]);
    return acc;
  }, []),
);

const PASS = { p95SummaryMs: 10 * 60 * 1000, peakRssBytes: 4.5 * 1024 ** 3, schemaValidFirstTry: 0.95, groundingLeaks: 0 };

const SYSTEM_PROMPT = `You write after-class summaries for a chess academy.
You get one class as JSON evidence items with ids E1, E2, ... Students are pseudonyms S1, S2, ...
Rules:
- Use only facts in the evidence. Every observation cites the evidence ids it relies on.
- A variation's "san" must be moves copied exactly, in order, from the game in "fromEvidence" (a CHAPTER_PGN item).
- The coach view may name students by pseudonym. The student view must never contain S1, S2, ... and speaks to the whole class.
- Suggestions are ideas for the coach, not assignments.
Reply with JSON only, matching the schema.`;

function userPrompt(bundle) {
  return `Evidence:\n<evidence>\n${JSON.stringify(bundle.evidence)}\n</evidence>\nWrite the summary.`;
}

function repairPrompt(bundle, problems) {
  return `${userPrompt(bundle)}\n\nYour previous answer was rejected:\n- ${problems.join("\n- ")}\nFix these problems and reply with the full JSON again.`;
}

// Streams the answer: with stream:false Ollama sends no headers until it is
// done, and Node's fetch gives up after 5 min without headers. The 15-min cap
// is class_summary.v1's timeoutMs (PHASE3_SPEC.md §5).
async function generate(host, model, prompt, numThread) {
  const started = performance.now();
  const response = await fetch(`${host}/api/generate`, {
    body: JSON.stringify({
      format: summaryJsonSchema,
      keep_alive: "10m",
      model,
      options: { num_ctx: 8192, temperature: 0.2, ...(numThread ? { num_thread: numThread } : {}) },
      prompt,
      stream: true,
      system: SYSTEM_PROMPT,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`ollama ${response.status}: ${await response.text()}`);
  let text = "";
  let final = {};
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const part = JSON.parse(line);
      if (part.error) throw new Error(`ollama: ${part.error}`);
      text += part.response ?? "";
      if (part.done) final = part;
    }
  }
  const ns = (v) => (v ?? 0) / 1e9;
  return {
    evalCount: final.eval_count ?? 0,
    genTokPerSec: final.eval_count ? final.eval_count / ns(final.eval_duration) : 0,
    loadSec: ns(final.load_duration),
    promptCount: final.prompt_eval_count ?? 0,
    promptTokPerSec: final.prompt_eval_count ? final.prompt_eval_count / ns(final.prompt_eval_duration) : 0,
    text,
    wallMs: performance.now() - started,
  };
}

// One fixed-node Stockfish search over UCI; returns wall ms. Fixed nodes keep
// the work identical, so slowdown under load is just the ratio.
function stockfishProbe(command, nodes) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    let searching = false;
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (!searching && out.includes("readyok")) {
        searching = true;
        child.stdin.write(`position startpos moves e2e4 e7e5 g1f3 b8c6\ngo nodes ${nodes}\n`);
      }
      if (searching && /bestmove/.test(out)) {
        const ms = performance.now() - started;
        child.stdin.end("quit\n");
        resolve(ms);
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!/bestmove/.test(out)) reject(new Error(`stockfish exited ${code} without bestmove`));
    });
    child.stdin.write("uci\nsetoption name Threads value 1\nsetoption name Hash value 16\nisready\n");
  });
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
};

function parseBytes(text) {
  const m = /([\d.]+)\s*([KMGT]?i?B)/.exec(text);
  if (!m) return 0;
  const unit = { B: 1, GB: 1e9, GiB: 1024 ** 3, KB: 1e3, KiB: 1024, MB: 1e6, MiB: 1024 ** 2, TB: 1e12, TiB: 1024 ** 4 }[m[2]] ?? 1;
  return Number(m[1]) * unit;
}

function peakRss(file) {
  if (!file || !existsSync(file)) return null;
  const values = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => parseBytes(line.split("/")[0]));
  return values.length ? Math.max(...values) : null;
}

const aborted = () => args["abort-file"] && existsSync(args["abort-file"]);

function selfTest() {
  const bundles = makeBundles(10);
  let failures = 0;
  const expect = (label, ok) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) failures += 1;
  };
  for (const bundle of bundles) {
    const good = validateSummary(referenceSummary(bundle), bundle);
    expect(`${bundle.bundleId}: reference summary is valid and grounded`, good.schemaValid && good.violations.length === 0);
  }
  const b = bundles[0];
  const bad = referenceSummary(b);
  bad.coach.lessonOverview[0].evidence = ["E999"];
  bad.coach.variations[0].san = "1. d4 d5";
  bad.student.recap[0].text = "S2 did great";
  bad.coach.teachingObservations[0].text = "see pz_9_9";
  const result = validateSummary(bad, b);
  expect("unknown evidence ref is caught", result.violations.some((v) => v.includes("E999")));
  expect("variation not in the game is caught", result.violations.some((v) => v.includes("is not in")));
  expect("S# in the student view is caught", result.violations.some((v) => v.includes("pseudonym")));
  expect("unknown puzzle id is caught", result.violations.some((v) => v.includes("pz_9_9")));
  expect("broken JSON is schema-invalid", !validateSummary("{not json", b).schemaValid);
  expect("missing section is schema-invalid", !validateSummary({ coach: bad.coach }, b).schemaValid);
  expect("fact recall of the reference is 1", factRecall(referenceSummary(b), b) === 1);
  const sizes = bundles.map((x) => userPrompt(x).length);
  console.log(`  prompt sizes: ${Math.min(...sizes)}–${Math.max(...sizes)} chars (~${Math.round(Math.max(...sizes) / 3.5)} tokens max)`);
  console.log(failures ? `${failures} self-test check(s) failed` : "self-test passed");
  process.exit(failures ? 1 : 0);
}

async function main() {
  if (args["self-test"]) return selfTest();

  const host = args.host ?? "http://127.0.0.1:11435";
  const model = args.model;
  if (!model) throw new Error("--model required");
  const count = Number(args.bundles ?? 10);
  const out = args.out ?? join(process.cwd(), `ai-bench-${Date.now()}`);
  const numThread = args["num-thread"] ? Number(args["num-thread"]) : undefined;
  const sfCommand = args.stockfish === true ? undefined : args.stockfish;
  const sfNodes = Number(args["stockfish-nodes"] ?? 1_500_000);
  mkdirSync(out, { recursive: true });

  const stockfish = { baselineMs: [], underLoadMs: [] };
  if (sfCommand) {
    console.log("Stockfish baseline (model idle)…");
    for (let i = 0; i < 3; i += 1) stockfish.baselineMs.push(await stockfishProbe(sfCommand, sfNodes));
    console.log(`  median ${Math.round(median(stockfish.baselineMs))} ms`);
  }

  const bundles = makeBundles(count);
  const runs = [];
  for (const bundle of bundles) {
    if (aborted()) break;
    console.log(`${bundle.bundleId}: generating…`);
    const firstCall = generate(host, model, userPrompt(bundle), numThread);
    // Probe Stockfish while the first bundle generates (after the model load).
    if (sfCommand && runs.length === 0) {
      await new Promise((r) => setTimeout(r, 15_000));
      for (let i = 0; i < 3; i += 1) stockfish.underLoadMs.push(await stockfishProbe(sfCommand, sfNodes));
    }
    let first;
    try {
      first = await firstCall;
    } catch (error) {
      console.log(`  FAILED: ${error.message}`);
      runs.push({ attempts: 1, bundleId: bundle.bundleId, calls: [], factRecall: 0, finalStatus: "FAILED", firstSchemaValid: false, firstViolations: [], groundingLeak: false, schemaErrors: [error.message], totalMs: 15 * 60 * 1000 });
      continue;
    }
    const firstCheck = validateSummary(first.text, bundle);
    const run = {
      attempts: 1,
      bundleId: bundle.bundleId,
      calls: [{ ...first, text: undefined }],
      finalStatus: "READY",
      firstSchemaValid: firstCheck.schemaValid,
      firstViolations: firstCheck.violations,
      schemaErrors: firstCheck.schemaErrors,
      totalMs: first.wallMs,
    };
    let finalCheck = firstCheck;
    let finalText = first.text;
    if (!firstCheck.schemaValid || firstCheck.violations.length > 0) {
      const repaired = await generate(host, model, repairPrompt(bundle, [...firstCheck.schemaErrors, ...firstCheck.violations]), numThread);
      run.attempts = 2;
      run.calls.push({ ...repaired, text: undefined });
      run.totalMs += repaired.wallMs;
      finalCheck = validateSummary(repaired.text, bundle);
      finalText = repaired.text;
    }
    if (!finalCheck.schemaValid || finalCheck.violations.length > 0) run.finalStatus = "FAILED";
    // A leak is a READY summary that still violates grounding: must be 0 by construction.
    run.groundingLeak = run.finalStatus === "READY" && finalCheck.violations.length > 0;
    run.factRecall = finalCheck.schemaValid ? factRecall(finalCheck.summary, bundle) : 0;
    writeFileSync(join(out, `${bundle.bundleId}.json`), finalText ?? "");
    runs.push(run);
    console.log(
      `  ${run.finalStatus} in ${(run.totalMs / 1000).toFixed(1)} s, attempts ${run.attempts}, ` +
        `prompt ${first.promptTokPerSec.toFixed(1)} tok/s, gen ${first.genTokPerSec.toFixed(1)} tok/s`,
    );
  }

  const wasAborted = aborted();
  const totals = runs.map((r) => r.totalMs);
  const calls = runs.flatMap((r) => r.calls);
  const rss = peakRss(args["rss-file"]);
  const metrics = {
    bundles: runs.length,
    factRecallMean: runs.length ? runs.reduce((s, r) => s + r.factRecall, 0) / runs.length : 0,
    failed: runs.filter((r) => r.finalStatus === "FAILED").length,
    genTokPerSecMedian: calls.length ? median(calls.map((c) => c.genTokPerSec)) : 0,
    groundingLeaks: runs.filter((r) => r.groundingLeak).length,
    groundingViolationsFirstTry: runs.reduce((s, r) => s + r.firstViolations.length, 0),
    p95SummaryMs: totals.length ? p95(totals) : null,
    peakRssBytes: rss,
    promptTokPerSecMedian: calls.length ? median(calls.map((c) => c.promptTokPerSec)) : 0,
    schemaValidFirstTry: runs.length ? runs.filter((r) => r.firstSchemaValid).length / runs.length : 0,
    stockfishSlowdown: stockfish.underLoadMs.length ? median(stockfish.underLoadMs) / median(stockfish.baselineMs) : null,
  };
  const checks = {
    groundingLeaks: metrics.groundingLeaks <= PASS.groundingLeaks,
    p95Summary: metrics.p95SummaryMs !== null && metrics.p95SummaryMs <= PASS.p95SummaryMs,
    peakRss: metrics.peakRssBytes !== null && metrics.peakRssBytes <= PASS.peakRssBytes,
    schemaValidFirstTry: metrics.schemaValidFirstTry >= PASS.schemaValidFirstTry,
  };
  const passed = !wasAborted && runs.length === count && Object.values(checks).every(Boolean);
  const report = { aborted: wasAborted, checks, host, metrics, model, passed, runs, stockfish, when: new Date().toISOString() };
  writeFileSync(join(out, "results.json"), JSON.stringify(report, null, 2));

  const gb = (b) => (b === null ? "n/a" : `${(b / 1024 ** 3).toFixed(2)} GiB`);
  const md = [
    `# Capacity benchmark: ${model}`,
    "",
    `${report.when}${wasAborted ? " — **ABORTED: a live class started**" : ""}. Verdict: **${passed ? "PASS" : "FAIL"}**.`,
    "",
    "| Criterion | Target | Measured | |",
    "|---|---|---|---|",
    `| Summary p95 (incl. repair retry) | ≤ 10 min | ${metrics.p95SummaryMs === null ? "n/a" : `${(metrics.p95SummaryMs / 60000).toFixed(2)} min`} | ${checks.p95Summary ? "ok" : "FAIL"} |`,
    `| Peak RSS | ≤ 4.5 GiB | ${gb(metrics.peakRssBytes)} | ${checks.peakRss ? "ok" : "FAIL"} |`,
    `| Schema-valid before retry | ≥ 95% | ${(metrics.schemaValidFirstTry * 100).toFixed(0)}% | ${checks.schemaValidFirstTry ? "ok" : "FAIL"} |`,
    `| Grounding violations after validation | 0 | ${metrics.groundingLeaks} | ${checks.groundingLeaks ? "ok" : "FAIL"} |`,
    "",
    "| Also measured | Value |",
    "|---|---|",
    `| Bundles completed | ${runs.length} / ${count} (${metrics.failed} FAILED after retry) |`,
    `| Grounding violations before retry | ${metrics.groundingViolationsFirstTry} |`,
    `| Prompt tokens/s (median) | ${metrics.promptTokPerSecMedian.toFixed(1)} |`,
    `| Generation tokens/s (median) | ${metrics.genTokPerSecMedian.toFixed(1)} |`,
    `| Fact recall (keyword proxy until the Phase 3 golden set exists) | ${(metrics.factRecallMean * 100).toFixed(0)}% |`,
    `| Stockfish slowdown during generation | ${metrics.stockfishSlowdown === null ? "not measured" : `${metrics.stockfishSlowdown.toFixed(2)}×`} |`,
    "",
  ].join("\n");
  writeFileSync(join(out, "report.md"), md);
  console.log(`\n${md}\nResults: ${out}`);
  process.exit(wasAborted ? 3 : passed ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
