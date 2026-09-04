/**
 * Shared helpers for the route handlers.
 *
 * Every route runs in the Node runtime and calls the orchestrator directly --
 * there is no separate API process. That is why the handlers are thin: the real
 * logic lives in the orchestrator modules they import.
 */
import { NextResponse } from "next/server";
import { ensureRunnerRunning, enqueue } from "@orchestrator/runner";

export const runtime = "nodejs";

export function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

/**
 * Put a task in the queue and make sure a runner is draining it.
 *
 * Deliberately NOT "spawn a worker for this task". Everything commits straight
 * to dev_vps, so exactly one task may run at a time; starting a second process
 * would interleave commits on a single branch with no way to untangle them
 * afterwards. The runner serialises that.
 */
export function queueTask(taskId: string): { position: number; runner: string } {
  enqueue(taskId);
  const spawned = ensureRunnerRunning();
  return {
    position: 0,
    runner: spawned.started ? `runner started (pid ${spawned.pid})` : `busy with ${spawned.holding}`,
  };
}
