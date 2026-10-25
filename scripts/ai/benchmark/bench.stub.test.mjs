// End-to-end check of bench.mjs against a stub Ollama (no model, no Docker):
//   node --test scripts/ai/benchmark/bench.stub.test.mjs
// Scripted answers per bundle exercise the retry, removal and failure paths,
// and the report's five criteria.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { makeBundles } from "./bundles.mjs";
import { referenceOutput } from "./validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const bundles = makeBundles(5);

const withFabricatedMove = (b) => {
  const out = referenceOutput(b);
  out.coach.teachingObservations.push({ evidence: [b.pgnRef], text: "Black should have played Qh5 instead." });
  return out;
};

const withNamedRecap = (b) => {
  const out = referenceOutput(b);
  out.student.recap = [{ evidence: ["E1"], text: "S3 repeated the line until it stuck." }];
  return out;
};

// bundle index → answers for attempt 1 and 2 (an Error answers with HTTP 500).
const SCRIPT = [
  [withFabricatedMove(bundles[0]), referenceOutput(bundles[0])], // repaired on retry → READY
  [withFabricatedMove(bundles[1]), withFabricatedMove(bundles[1])], // removed after retry → READY
  ["{not json", "{still not json"], // FAILED (SCHEMA)
  [new Error("boom")], // FAILED (RUNTIME), no retry
  [withFabricatedMove(bundles[4]), withNamedRecap(bundles[4])], // the repair is worse → keeps the first answer → READY
];

function startStub() {
  const seen = new Map();
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { prompt } = JSON.parse(body);
      const index = Number(/Batch lesson (\d+)/.exec(prompt)[1]) - 1;
      const attempt = (seen.get(index) ?? 0) + 1;
      seen.set(index, attempt);
      const answer = SCRIPT[index][attempt - 1];
      if (answer instanceof Error) {
        res.writeHead(500).end(answer.message);
        return;
      }
      const text = typeof answer === "string" ? answer : JSON.stringify(answer);
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.write(`${JSON.stringify({ response: text.slice(0, 10) })}\n`);
      res.end(
        `${JSON.stringify({ done: true, eval_count: 100, eval_duration: 1e9, load_duration: 0, prompt_eval_count: 500, prompt_eval_duration: 1e9, response: text.slice(10) })}\n`,
      );
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ seen, server })));
}

test("bench.mjs scores retries, removals and failures from a stub model", async () => {
  const { seen, server } = await startStub();
  const out = mkdtempSync(join(tmpdir(), "bench-stub-"));
  try {
    const { port } = server.address();
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [join(here, "bench.mjs"), "--host", `http://127.0.0.1:${port}`, "--model", "stub", "--bundles", "5", "--out", out], {
        stdio: ["ignore", "ignore", "inherit"],
      });
      child.on("exit", resolve);
    });
    const report = JSON.parse(readFileSync(join(out, "results.json"), "utf8"));
    const status = report.runs.map((r) => [r.finalStatus, r.failureCode, r.attempts, r.removedPaths.length]);

    assert.equal(code, 2, "fails overall: 60% usable < 90%");
    assert.deepEqual(status, [
      ["READY", null, 2, 0],
      ["READY", null, 2, 1],
      ["FAILED", "SCHEMA", 2, 0],
      ["FAILED", "RUNTIME", 1, 0],
      ["READY", null, 2, 1],
    ]);
    assert.deepEqual([...seen.values()], [2, 2, 2, 1, 2]);
    assert.equal(report.runs[4].selectedAttempt, 1);
    assert.equal(report.metrics.usableAfterRetry, 0.6);
    assert.equal(report.metrics.retryRate, 0.8);
    assert.equal(report.metrics.selectedFirstAfterRetry, 1);
    assert.equal(report.metrics.privacyViolationsFinal, 1);
    assert.equal(report.metrics.privacyResidualReady, 0);
    assert.equal(report.metrics.groundingLeaks, 0);
    assert.equal(report.checks.usableAfterRetry, false);
    const kept = JSON.parse(readFileSync(join(out, "bench-2.json"), "utf8")).summary;
    assert.ok(!JSON.stringify(kept).includes("Qh5"), "the unsupported claim is not in the coach's summary");
    assert.match(kept.coach.variations[0].san, /^1\. e4 e5 2\. Nf3/, "moves are rendered from the game");
    assert.match(readFileSync(join(out, "report.md"), "utf8"), /Usable after one retry \(§4\.3\) \| ≥ 90% \| 60% \| FAIL/);
  } finally {
    server.close();
    rmSync(out, { force: true, recursive: true });
  }
});
