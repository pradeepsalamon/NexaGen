/**
 * Shared helpers for the route handlers.
 *
 * Every route runs in the Node runtime and calls the orchestrator directly --
 * there is no separate API process any more. That is why the handlers are thin:
 * all the real logic already lives in ../../../../../orchestrator.
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import * as path from "path";
import { AGENT_DIR } from "@orchestrator/paths";

export const runtime = "nodejs";

export function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

/**
 * Run a task in a detached worker.
 *
 * A task run takes minutes; holding the HTTP request open for it would tie the
 * response to the browser staying connected. The worker outlives this process.
 */
export function startTaskAsync(taskId: string, resume = false): void {
  const args = [
    "--project",
    path.join(AGENT_DIR, "tsconfig.json"),
    path.join(AGENT_DIR, "orchestrator", "worker.ts"),
    taskId,
  ];
  if (resume) args.push("--resume");

  const child = spawn(path.join(AGENT_DIR, "..", "node_modules", ".bin", "ts-node"), args, {
    cwd: AGENT_DIR,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
