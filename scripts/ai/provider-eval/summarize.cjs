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

// ── Free daily capacity at medium volume ────────────────────
//
// Medium volume (owner, 2026-11-25): 20 classes a day, 150 students, 3 games
// and 10 puzzles a student a week, 30 WhatsApp questions a day, one monthly
// note a student. Units a day; "peak" is the busiest day (month-end notes and
// feedback all on one day).
const VOLUME = {
  "chess-facts": { day: 30, note: "upper bound: every WhatsApp question" },
  "coach-feedback": { day: 5, peak: 150, note: "one a student a month" },
  "game-review": { day: 64, note: "150 × 3 games / 7" },
  "progress-note": { day: 5, peak: 150, note: "one a student a month" },
  "puzzle-hint": { day: 214, note: "150 × 10 / 7, one hint per puzzle tried (uncached)" },
  recap: { day: 20, note: "20 classes; tokens × 2 for a real 20-minute class" },
  "recap-tamil": { day: 20, note: "only if every class also gets a Tamil recap; tokens × 2" },
  "support-pick": { day: 30 },
  "translate-ta": { day: 64, note: "every game review also in Tamil" }
};
// A real 20-minute class has about twice the words of the test transcripts.
const RECAP_SCALE = 2;

// Free limits as measured (docs/ai/PROVIDER_EVAL.md §2). rpd/tpd per model, per day; null = none seen.
const LIMITS = {
  "gemini/gemini-3.1-flash-lite": { rpd: 500, rpm: 15, tpd: null },
  "gemini/gemini-3.5-flash": { rpd: 20, rpm: 5, tpd: null },
  "gemini/gemini-3.8-flash": { rpd: 20, rpm: 5, tpd: null },
  "groq/openai/gpt-oss-120b": { rpd: 1000, rpm: 30, tpd: 200000, tpm: 8000 },
  "groq/openai/gpt-oss-20b": { rpd: 1000, rpm: 30, tpd: 200000, tpm: 8000 },
  "groq/qwen/qwen3.8-27b": { rpd: 1000, rpm: 30, tpd: 200000, tpm: 8000 },
  // 50 free requests a day for the whole account, shared by every free model.
  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free": { rpd: 50, rpm: 20, shared: true, tpd: null },
  "openrouter/nvidia/nemotron-3.5-super-vl:free": { rpd: 50, rpm: 20, shared: true, tpd: null }
};

const cap = [];
for (const s of summary) {
  const lim = LIMITS[s.model];
  const vol = VOLUME[s.task];
  if (!lim || !vol || !s.ok) continue;
  const scale = s.task.startsWith("recap") ? RECAP_SCALE : 1;
  const calls = (s.callsPerUnit ?? 1) * (s.task.startsWith("recap") ? RECAP_SCALE : 1);
  const tokens = s.totalPerUnit * scale;
  const byRequests = Math.floor(lim.rpd / calls);
  const byTokens = lim.tpd ? Math.floor(lim.tpd / tokens) : Infinity;
  const perDay = Math.min(byRequests, byTokens);
  cap.push({ calls, model: s.model, need: vol.day, peak: vol.peak ?? vol.day, perDay, task: s.task, tokens, use: Math.round((100 * vol.day) / perDay) });
}
fs.writeFileSync(path.join(ROOT, "docs/ai/provider-eval/capacity.json"), JSON.stringify({ LIMITS, RECAP_SCALE, VOLUME, cap }, null, 2) + "\n");

console.log("\n### Free units a day per feature (each feature alone)\n");
const capModels = [...new Set(cap.map((c) => c.model))].sort();
console.log(`| Feature (need/day) | ${capModels.map((m) => m.split("/").slice(1).join("/")).join(" | ")} |`);
console.log(`|---|${capModels.map(() => "---").join("|")}|`);
for (const task of Object.keys(VOLUME)) {
  const cells = capModels.map((m) => {
    const c = cap.find((x) => x.model === m && x.task === task);
    return c ? `${c.perDay}${c.perDay < c.need ? " ✗" : c.perDay < c.peak ? " (peak ✗)" : ""}` : "–";
  });
  console.log(`| ${task} (${VOLUME[task].day}${VOLUME[task].peak ? `, peak ${VOLUME[task].peak}` : ""}) | ${cells.join(" | ")} |`);
}

console.log("\n### All features together on one model, an average day\n");
console.log("| Model | Requests/day needed | Limit | Tokens/day needed | Limit | Fits? |");
console.log("|---|---|---|---|---|---|");
for (const m of capModels) {
  const rows = cap.filter((c) => c.model === m);
  if (rows.length < Object.keys(VOLUME).length - 1) continue;
  const reqs = rows.filter((c) => c.task !== "recap-tamil").reduce((a, c) => a + c.need * c.calls, 0);
  const toks = rows.filter((c) => c.task !== "recap-tamil").reduce((a, c) => a + c.need * c.tokens, 0);
  const lim = LIMITS[m];
  const fits = reqs <= lim.rpd && (!lim.tpd || toks <= lim.tpd);
  console.log(`| ${m} | ${reqs} | ${lim.rpd}${lim.shared ? " (shared)" : ""} | ${toks.toLocaleString("en-US")} | ${lim.tpd ? lim.tpd.toLocaleString("en-US") : "not seen"} | ${fits ? "yes" : "no"} |`);
}
