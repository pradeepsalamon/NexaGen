#!/usr/bin/env node
// Phase 3a capacity benchmark scorer (docs/ai/architecture/INFRASTRUCTURE_DECISION.md §4).
// Normally started by run-capacity-benchmark.sh, which owns the Ollama container.
//
//   node scripts/ai/benchmark/bench.mjs --self-test
//   node scripts/ai/benchmark/bench.mjs --host http://127.0.0.1:11435 --model qwen2.5:3b \
//        [--bundles 10] [--out DIR] [--rss-file FILE] [--abort-file FILE] \
//        [--stockfish "docker exec -i nexa_api stockfish"] [--stockfish-nodes 1500000] [--no-think]
//
// --no-think sends Ollama `think: false` (for thinking models such as qwen3).
//
// Exit codes: 0 pass, 2 fail, 3 aborted (live class detected), 1 error.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { makeBundles } from "./bundles.mjs";
import {
  buildSummaryLines,
  checkClassSummaryOutput,
  factRecall,
  formatSummaryLine,
  generateGroundedClassSummary,
  referenceOutput,
  summaryJsonSchema,
} from "./validate.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]);
    return acc;
  }, []),
);

// The first four are INFRASTRUCTURE_DECISION.md §4; usableAfterRetry is the
// fifth (§4.3), with "usable" pre-registered in class-summary.ts.
const PASS = { groundingLeaks: 0, p95SummaryMs: 10 * 60 * 1000, peakRssBytes: 4.5 * 1024 ** 3, schemaValidFirstTry: 0.95, usableAfterRetry: 0.9 };

const SYSTEM_PROMPT = `You write after-class summaries for a chess academy.
You get one class as JSON evidence items with ids E1, E2, ... Students are pseudonyms S1, S2, ...
Games are listed separately as lines L1, L2, ... with numbered moves.
Rules:
- Use only facts in the evidence. Every observation cites the evidence ids it relies on.
- Never write a move, square, engine score or result that is not in the evidence or a line.
- A variation does not contain moves: give the line id, the first and last move number (at most 6 moves) and a comment. The moves are added from the game for you.
- The coach view may name students by pseudonym. The student view must never contain S1, S2, ... and speaks to the whole class.
- Suggestions are ideas for the coach, not assignments.
- Keep it short: observation text under 400 characters, a concept name is a few words.
Reply with JSON only, matching the schema.`;

// Game items appear once, as lines; their PGN/moves are not repeated in the evidence JSON.
function evidenceForPrompt(bundle, lines) {
  const lineByEvidence = new Map(lines.map((l) => [l.fromEvidence, l.id]));
  return bundle.evidence.map(({ moves: _moves, pgn: _pgn, ...item }) =>
    lineByEvidence.has(item.id) ? { ...item, line: lineByEvidence.get(item.id) } : item,
  );
}

function userPrompt(bundle, lines) {
  const lineText = lines.length
    ? lines.map((l) => `${l.id} (${l.fromEvidence}, ${l.title}): ${formatSummaryLine(l)}`).join("\n")
    : "(no games in this class)";
  return `Evidence:\n<evidence>\n${JSON.stringify(evidenceForPrompt(bundle, lines))}\n</evidence>\nLines:\n<lines>\n${lineText}\n</lines>\nWrite the summary.`;
}

function repairPrompt(bundle, lines, problems) {
  return `${userPrompt(bundle, lines)}\n\nYour previous answer was rejected:\n- ${problems.join("\n- ")}\nFix these problems and reply with the full JSON again.`;
}

// Streams the answer: with stream:false Ollama sends no headers until it is
// done, and Node's fetch gives up after 5 min without headers. The 15-min cap
// is class_summary.v1's timeoutMs (PHASE3_SPEC.md §5).
async function generate(host, model, prompt, numThread, think) {
  const started = performance.now();
  const response = await fetch(`${host}/api/generate`, {
    body: JSON.stringify({
      format: summaryJsonSchema,
      keep_alive: "10m",
      model,
      options: { num_ctx: 8192, seed: 42, temperature: 0.2, ...(numThread ? { num_thread: numThread } : {}) },
      prompt,
      stream: true,
      system: SYSTEM_PROMPT,
      ...(think === undefined ? {} : { think }),
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

async function selfTest() {
  const bundles = makeBundles(10);
  let failures = 0;
  const expect = (label, ok) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) failures += 1;
  };
  for (const bundle of bundles) {
    const check = checkClassSummaryOutput(referenceOutput(bundle), bundle);
    expect(`${bundle.bundleId}: reference answer is valid and grounded`, check.ok && check.violations.length === 0);
  }
  const b = bundles[0];
  const lines = buildSummaryLines(b);
  expect("two code-built lines per bundle", lines.length === 2 && lines[0].fromEvidence === b.pgnRef);
  const bad = referenceOutput(b);
  bad.coach.lessonOverview[0].evidence = ["E999"];
  bad.coach.variations[0].line = "L9";
  bad.student.recap[0].text = "S2 did great after Qh5";
  bad.coach.teachingObservations[0].text = "see pz_9_9";
  const check = checkClassSummaryOutput(bad, b);
  const reasons = check.ok ? check.violations.map((v) => v.reason).join(" | ") : "";
  expect("unknown evidence ref is caught", reasons.includes("E999"));
  expect("unknown line is caught", reasons.includes("unknown line L9"));
  expect("S# in the student view is caught", reasons.includes("S#"));
  expect("a move not in the evidence is caught", reasons.includes('"Qh5"'));
  expect("unknown puzzle id is caught", reasons.includes("pz_9_9"));
  expect("broken JSON is schema-invalid", !checkClassSummaryOutput("{not json", b).ok);
  expect("a model-written san is schema-invalid", !checkClassSummaryOutput({ ...bad, coach: { ...bad.coach, variations: [{ san: "1. e4" }] } }, b).ok);
  const retried = await generateGroundedClassSummary({
    bundle: b,
    generate: async ({ attempt }) => JSON.stringify(attempt === 1 ? bad : referenceOutput(b)),
  });
  expect("a rejected first answer is retried once and the repair accepted", retried.status === "READY" && retried.attempts === 2);
  expect("variation moves come from the game", retried.summary?.coach.variations[0].san === formatSummaryLine(lines[0], 1, 2));
  expect("fact recall of the reference is 1", factRecall(referenceOutput(b), b) === 1);
  const sizes = bundles.map((x) => userPrompt(x, buildSummaryLines(x)).length);
  console.log(`  prompt sizes: ${Math.min(...sizes)}–${Math.max(...sizes)} chars (~${Math.round(Math.max(...sizes) / 3.5)} tokens max)`);
  console.log(failures ? `${failures} self-test check(s) failed` : "self-test passed");
  process.exit(failures ? 1 : 0);
}

const uniquePaths = (violations) => new Set(violations.map((v) => v.path)).size;

async function main() {
  if (args["self-test"]) return selfTest();

  const host = args.host ?? "http://127.0.0.1:11435";
  const model = args.model;
  if (!model) throw new Error("--model required");
  const count = Number(args.bundles ?? 10);
  const out = args.out ?? join(process.cwd(), `ai-bench-${Date.now()}`);
  const numThread = args["num-thread"] ? Number(args["num-thread"]) : undefined;
  const think = args["no-think"] ? false : undefined;
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
    const calls = [];
    const texts = [];
    const result = await generateGroundedClassSummary({
      // A class going live stops the container; don't spend the repair call on a dead model.
      beforeRetry: () => !aborted(),
      bundle,
      generate: async ({ attempt, lines, problems }) => {
        const prompt = attempt === 1 ? userPrompt(bundle, lines) : repairPrompt(bundle, lines, problems);
        const pending = generate(host, model, prompt, numThread, think);
        // Probe Stockfish while the first bundle generates (after the model load).
        if (sfCommand && runs.length === 0 && attempt === 1) {
          await new Promise((r) => setTimeout(r, 15_000));
          for (let i = 0; i < 3; i += 1) stockfish.underLoadMs.push(await stockfishProbe(sfCommand, sfNodes));
        }
        const call = await pending;
        calls.push({ ...call, text: undefined });
        texts.push(call.text);
        return call.text;
      },
    });
    const run = {
      attempts: result.attempts,
      bundleId: bundle.bundleId,
      calls,
      factRecall: result.summary ? factRecall(result.summary, bundle) : 0,
      failureCode: result.failureCode ?? null,
      finalStatus: result.status === "READY" ? "READY" : result.status,
      firstClaims: result.firstAttempt?.claimCount ?? 0,
      firstSchemaErrors: result.firstAttempt?.schemaErrors ?? [],
      firstSchemaValid: result.firstAttempt?.schemaValid ?? false,
      firstUnsupportedClaims: uniquePaths(result.firstAttempt?.violations ?? []),
      firstViolations: result.firstAttempt?.violations ?? [],
      finalClaims: result.finalAttempt?.claimCount ?? 0,
      finalUnsupportedClaims: uniquePaths(result.finalAttempt?.violations ?? []),
      finalViolations: result.finalAttempt?.violations ?? [],
      // A leak is a READY summary that still has an unsupported item: must be 0 by construction.
      groundingLeak: result.status === "READY" && result.residualViolations > 0,
      removedPaths: result.removedPaths,
      runtimeError: result.runtimeError ?? null,
      totalMs: calls.reduce((sum, c) => sum + c.wallMs, 0) || 15 * 60 * 1000,
      usability: result.usability ?? null,
    };
    writeFileSync(join(out, `${bundle.bundleId}.json`), JSON.stringify({ rawAnswers: texts, summary: result.summary ?? null }, null, 2));
    runs.push(run);
    const first = calls[0];
    console.log(
      `  ${run.finalStatus}${run.failureCode ? ` (${run.failureCode})` : ""} in ${(run.totalMs / 1000).toFixed(1)} s, attempts ${run.attempts}, ` +
        `unsupported ${run.firstUnsupportedClaims}/${run.firstClaims} first, removed ${run.removedPaths.length}` +
        (first ? `, prompt ${first.promptTokPerSec.toFixed(1)} tok/s, gen ${first.genTokPerSec.toFixed(1)} tok/s` : ""),
    );
  }

  const wasAborted = aborted();
  const totals = runs.map((r) => r.totalMs);
  const calls = runs.flatMap((r) => r.calls);
  const rss = peakRss(args["rss-file"]);
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const firstValid = runs.filter((r) => r.firstSchemaValid);
  const retried = runs.filter((r) => r.attempts === 2);
  const finalValid = runs.filter((r) => r.finalClaims > 0);
  const metrics = {
    bundles: runs.length,
    deferred: runs.filter((r) => r.finalStatus === "DEFERRED").length,
    factRecallMean: runs.length ? sum(runs.map((r) => r.factRecall)) / runs.length : 0,
    failed: runs.filter((r) => r.finalStatus === "FAILED").length,
    // Unsupported items / items, over schema-valid answers (before removal).
    fabricatedClaimRateFinal: finalValid.length ? sum(finalValid.map((r) => r.finalUnsupportedClaims)) / sum(finalValid.map((r) => r.finalClaims)) : null,
    fabricatedClaimRateFirst: firstValid.length ? sum(firstValid.map((r) => r.firstUnsupportedClaims)) / sum(firstValid.map((r) => r.firstClaims)) : null,
    genTokPerSecMedian: calls.length ? median(calls.map((c) => c.genTokPerSec)) : 0,
    groundingLeaks: runs.filter((r) => r.groundingLeak).length,
    groundingViolationsFirstTry: sum(runs.map((r) => r.firstViolations.length)),
    p50SummaryMs: totals.length ? median(totals) : null,
    p95SummaryMs: totals.length ? p95(totals) : null,
    peakRssBytes: rss,
    promptTokPerSecMedian: calls.length ? median(calls.map((c) => c.promptTokPerSec)) : 0,
    removedClaims: sum(runs.map((r) => r.removedPaths.length)),
    retryRate: runs.length ? retried.length / runs.length : 0,
    schemaValidFirstTry: runs.length ? firstValid.length / runs.length : 0,
    stockfishSlowdown: stockfish.underLoadMs.length ? median(stockfish.underLoadMs) / median(stockfish.baselineMs) : null,
    usableAfterRetry: count ? runs.filter((r) => r.finalStatus === "READY").length / count : 0,
  };
  const checks = {
    groundingLeaks: metrics.groundingLeaks <= PASS.groundingLeaks,
    p95Summary: metrics.p95SummaryMs !== null && metrics.p95SummaryMs <= PASS.p95SummaryMs,
    peakRss: metrics.peakRssBytes !== null && metrics.peakRssBytes <= PASS.peakRssBytes,
    schemaValidFirstTry: metrics.schemaValidFirstTry >= PASS.schemaValidFirstTry,
    usableAfterRetry: metrics.usableAfterRetry >= PASS.usableAfterRetry,
  };
  const passed = !wasAborted && runs.length === count && Object.values(checks).every(Boolean);
  const report = { aborted: wasAborted, checks, host, metrics, model, passed, runs, stockfish, think: think ?? null, when: new Date().toISOString() };
  writeFileSync(join(out, "results.json"), JSON.stringify(report, null, 2));

  const gb = (b) => (b === null ? "n/a" : `${(b / 1024 ** 3).toFixed(2)} GiB`);
  const pct = (x) => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
  const min = (ms) => (ms === null ? "n/a" : `${(ms / 60000).toFixed(2)} min`);
  const md = [
    `# Capacity benchmark: ${model}${think === false ? " (think: false)" : ""}`,
    "",
    `${report.when}${wasAborted ? " — **ABORTED: a live class started**" : ""}. Verdict: **${passed ? "PASS" : "FAIL"}**.`,
    "",
    "| Criterion | Target | Measured | |",
    "|---|---|---|---|",
    `| Summary p95 (incl. repair retry) | ≤ 10 min | ${min(metrics.p95SummaryMs)} | ${checks.p95Summary ? "ok" : "FAIL"} |`,
    `| Peak RSS | ≤ 4.5 GiB | ${gb(metrics.peakRssBytes)} | ${checks.peakRss ? "ok" : "FAIL"} |`,
    `| Schema-valid before retry | ≥ 95% | ${pct(metrics.schemaValidFirstTry)} | ${checks.schemaValidFirstTry ? "ok" : "FAIL"} |`,
    `| Unsupported items in a READY summary | 0 | ${metrics.groundingLeaks} | ${checks.groundingLeaks ? "ok" : "FAIL"} |`,
    `| Usable after one retry (§4.3) | ≥ 90% | ${pct(metrics.usableAfterRetry)} | ${checks.usableAfterRetry ? "ok" : "FAIL"} |`,
    "",
    "| Also measured | Value |",
    "|---|---|",
    `| Bundles completed | ${runs.length} / ${count} (${metrics.failed} FAILED, ${metrics.deferred} DEFERRED) |`,
    `| Retry rate | ${pct(metrics.retryRate)} |`,
    `| Unsupported-claim rate, first answer / after retry (before removal) | ${pct(metrics.fabricatedClaimRateFirst)} / ${pct(metrics.fabricatedClaimRateFinal)} |`,
    `| Items removed as unsupported | ${metrics.removedClaims} |`,
    `| Grounding violations before retry | ${metrics.groundingViolationsFirstTry} |`,
    `| Summary p50 | ${min(metrics.p50SummaryMs)} |`,
    `| Prompt tokens/s (median) | ${metrics.promptTokPerSecMedian.toFixed(1)} |`,
    `| Generation tokens/s (median) | ${metrics.genTokPerSecMedian.toFixed(1)} |`,
    `| Fact recall (keyword proxy until the Phase 3 golden set exists) | ${pct(metrics.factRecallMean)} |`,
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
