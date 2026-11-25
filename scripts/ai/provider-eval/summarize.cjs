// Reads docs/ai/provider-eval/runs/** and writes docs/ai/provider-eval/summary.json
// plus markdown tables on stdout (used in docs/ai/PROVIDER_EVAL.md).
// Usage: node scripts/ai/provider-eval/summarize.cjs
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const RUNS = path.join(ROOT, "docs/ai/provider-eval/runs");

/** Tokens of one record, from the raw answers. Thinking the provider bills but doesn't itemise (Gemini) is total − prompt − answer. */
function usageOf(calls) {
  const u = { calls: 0, completion: 0, prompt: 0, reasoning: 0, total: 0 };
  for (const c of calls) {
    const x = c.response?.usage;
    if (!x) continue;
    const prompt = x.prompt_tokens ?? 0;
    const completion = x.completion_tokens ?? 0;
    const total = x.total_tokens ?? prompt + completion;
    const listed = x.completion_tokens_details?.reasoning_tokens ?? 0;
    u.calls += 1;
    u.prompt += prompt;
    u.total += total;
    // Hidden thinking is counted as answer tokens, so prompt + answer = total.
    u.completion += completion + Math.max(0, total - prompt - completion);
    u.reasoning += listed || Math.max(0, total - prompt - completion);
  }
  return u;
}

const models = fs.readdirSync(RUNS).filter((d) => d !== "capacity" && fs.statSync(path.join(RUNS, d)).isDirectory());
const rows = [];
/** Earlier failed tries of a unit that was run again (kept as <unit>.failN.json). */
const earlierFailures = [];
for (const m of models) {
  for (const f of fs.readdirSync(path.join(RUNS, m)).filter((f) => f.includes(".fail")))
    earlierFailures.push({ ...JSON.parse(fs.readFileSync(path.join(RUNS, m, f), "utf8")), file: f });
  for (const f of fs.readdirSync(path.join(RUNS, m)).filter((f) => f.endsWith(".json") && !f.includes(".fail"))) {
    const r = JSON.parse(fs.readFileSync(path.join(RUNS, m, f), "utf8"));
    const attempts = r.calls.flatMap((c) => c.attempts ?? []);
    rows.push({
      checks: r.checks ?? null,
      item: r.item,
      model: r.model,
      ms: r.ms,
      // Time spent answering, without waits for rate limits.
      modelMs: r.calls.reduce((s, c) => s + (c.response?.ms ?? 0), 0),
      ok: r.ok,
      rateLimited: attempts.filter((a) => a.status === 429).length,
      serverErrors: attempts.filter((a) => a.status >= 500).length,
      task: r.task,
      usage: usageOf(r.calls)
    });
  }
}

const by = (xs, key) => xs.reduce((m, x) => m.set(key(x), [...(m.get(key(x)) ?? []), x]), new Map());
const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

const summary = [];
for (const [task, taskRows] of by(rows, (r) => r.task)) {
  for (const [model, mr] of by(taskRows, (r) => r.model)) {
    const ok = mr.filter((r) => r.ok);
    summary.push({
      callsPerUnit: avg(ok.map((r) => r.usage.calls)) || null,
      completionPerUnit: avg(ok.map((r) => r.usage.completion)),
      failed: mr.length - ok.length,
      failedTries: mr.length - ok.length + earlierFailures.filter((e) => e.model === model && e.task === task).length,
      model,
      ok: ok.length,
      promptPerUnit: avg(ok.map((r) => r.usage.prompt)),
      rateLimited: mr.reduce((s, r) => s + r.rateLimited, 0),
      reasoningPerUnit: avg(ok.map((r) => r.usage.reasoning)),
      secondsPerUnit: Math.round(avg(ok.map((r) => r.modelMs)) / 100) / 10,
      serverErrors: mr.reduce((s, r) => s + r.serverErrors, 0),
      task,
      totalPerUnit: avg(ok.map((r) => r.usage.total)),
      units: mr.length
    });
  }
}
summary.sort((a, b) => a.task.localeCompare(b.task) || a.model.localeCompare(b.model));
fs.writeFileSync(path.join(ROOT, "docs/ai/provider-eval/summary.json"), JSON.stringify({ rows, summary }, null, 2) + "\n");

for (const [task, list] of by(summary, (s) => s.task)) {
  console.log(`\n### ${task}\n`);
  console.log("| Model | OK | Failed tries | Calls/unit | Prompt | Answer | (thinking) | Total tokens/unit | s/unit | 429s | 5xx |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const s of list)
    console.log(
      `| ${s.model} | ${s.ok}/${s.units} | ${s.failedTries} | ${s.callsPerUnit ?? "–"} | ${s.promptPerUnit} | ${s.completionPerUnit} | ${s.reasoningPerUnit} | ${s.totalPerUnit} | ${s.secondsPerUnit} | ${s.rateLimited} | ${s.serverErrors} |`
    );
}

console.log("\n### Automatic checks\n");
for (const r of rows.sort((a, b) => a.task.localeCompare(b.task) || a.item.localeCompare(b.item) || a.model.localeCompare(b.model)))
  if (r.checks) console.log(`- ${r.task}/${r.item} ${r.model}: ${JSON.stringify(r.checks)}`);
  else if (!r.ok) console.log(`- ${r.task}/${r.item} ${r.model}: FAILED`);
