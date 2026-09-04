/**
 * The single serial runner.
 *
 * Everything commits to dev_vps now, so exactly one task may be in flight at a
 * time. Rather than making every caller remember that, all execution goes
 * through here: `enqueue` marks a task QUEUED, and the runner picks tasks up one
 * at a time, holding the lock for the whole of each.
 *
 * It also owns the clock. A task blocked on an agent's quota carries a
 * `retry_at`; the runner simply skips it until that time passes and then picks
 * it up like any other. There is no separate timer process to keep alive, and
 * nothing is lost if the machine restarts -- the times live in state.json.
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { AGENT_DIR, BASE_BRANCH, ensureDir } from "./paths";
import { listTasks, readState, writeState } from "./state";
import { isTerminal, runTask } from "./orchestrator";
import { LockedError, acquireLock, currentLock, markRunnerAlive, releaseLock, runnerPid } from "./runner-lock";
import { describeWait, isDue } from "./quota";
import { nowIso } from "./paths";
import type { TaskState } from "./types";

/**
 * Statuses the runner will pick up.
 *
 * PENDING is deliberately NOT here. A created-but-never-started task is a draft;
 * including it meant `create` alone was enough to make the runner execute it,
 * which is exactly the "typing something creates work" failure this system
 * already fixed once at the chat layer. Running requires an explicit `start`,
 * which is what moves PENDING to QUEUED.
 */
const RESUMABLE: ReadonlySet<TaskState["status"]> = new Set([
  "RUNNING",
  "TESTING",
  "FIXING",
  "QUEUED",
  "BLOCKED_RETRY",
]);

/**
 * Tasks created before work moved onto dev_vps carry their own `agent/<id>`
 * branch. Running one would check that branch out, silently moving HEAD off
 * dev_vps -- and everything committed since would vanish from the working tree
 * until someone noticed. They are left alone; finish them by hand, or create a
 * fresh task.
 */
function isLegacyBranchTask(state: TaskState): boolean {
  return state.branch !== BASE_BRANCH;
}

export interface QueueEntry {
  task_id: string;
  status: TaskState["status"];
  summary: string;
  queued_at: string | null;
  retry_at?: string | null;
  waiting: string | null;
}

/** Mark a task as wanting to run. The runner picks it up when the lock frees. */
export function enqueue(taskId: string): TaskState {
  const state = readState(taskId);
  if (isTerminal(state) && state.status !== "BLOCKED_RETRY") {
    throw new Error(`task ${taskId} is ${state.status} and will not be re-run`);
  }
  if (isLegacyBranchTask(state)) {
    throw new Error(
      `task ${taskId} predates the move to committing on ${BASE_BRANCH}: it lives on ${state.branch}. ` +
        `Running it would move HEAD off ${BASE_BRANCH}. Finish or revert it by hand, or create a new task.`,
    );
  }
  if (state.status === "PENDING") {
    state.status = "QUEUED";
    state.queued_at = nowIso();
    writeState(state);
  } else if (!state.queued_at) {
    state.queued_at = nowIso();
    writeState(state);
  }
  return state;
}

/** What is waiting, in the order it will run. */
export function queue(now = new Date()): QueueEntry[] {
  return listTasks()
    .filter((t) => RESUMABLE.has(t.status) && !isLegacyBranchTask(t))
    .sort((a, b) => (a.queued_at ?? a.created_at).localeCompare(b.queued_at ?? b.created_at))
    .map((t) => ({
      task_id: t.task_id,
      status: t.status,
      summary: t.feature_summary.slice(0, 80),
      queued_at: t.queued_at ?? null,
      retry_at: t.retry_at ?? null,
      waiting:
        t.status === "BLOCKED_RETRY" && t.retry_at && !isDue(t.retry_at, now)
          ? `quota resets ${describeWait(t.retry_at, now)}`
          : null,
    }));
}

/**
 * The next task eligible to run right now.
 *
 * A BLOCKED_RETRY task whose retry time has not arrived is skipped rather than
 * blocking the queue -- otherwise one agent's exhausted quota would stall work
 * that a different agent could be getting on with.
 */
export function nextRunnable(now = new Date()): string | null {
  for (const entry of queue(now)) {
    if (entry.status === "BLOCKED_RETRY" && !isDue(entry.retry_at, now)) continue;
    return entry.task_id;
  }
  return null;
}

/**
 * Make sure something is draining the queue.
 *
 * Idempotent: if a runner already holds the lock, this does nothing. Both the
 * CLI and the HTTP API call it after enqueuing, so neither has to know whether
 * a runner happens to be alive.
 */
export function ensureRunnerRunning(): { started: boolean; pid?: number; holding?: string } {
  const alive = runnerPid();
  if (alive) {
    const held = currentLock();
    return { started: false, pid: alive, holding: held?.task_id ?? "idle, watching the queue" };
  }

  ensureDir(path.join(AGENT_DIR, "logs"));
  const out = fs.openSync(path.join(AGENT_DIR, "logs", "runner.log"), "a");
  const child = spawn(
    path.join(AGENT_DIR, "..", "node_modules", ".bin", "ts-node"),
    ["--project", path.join(AGENT_DIR, "tsconfig.json"), path.join(AGENT_DIR, "orchestrator", "runner-cli.ts")],
    { cwd: AGENT_DIR, detached: true, stdio: ["ignore", out, out] },
  );
  child.unref();
  return { started: true, pid: child.pid };
}

export interface RunnerOptions {
  /** Keep going after the queue empties, waiting for new work and timers. */
  daemon?: boolean;
  /** How often to look again when idle. */
  pollSeconds?: number;
  onEvent?: (message: string) => void;
}

function runOne(taskId: string, log: (m: string) => void): void {
  const before = readState(taskId);
  if (isLegacyBranchTask(before)) {
    log(`skipping ${taskId}: it is on legacy branch ${before.branch}, not ${BASE_BRANCH}`);
    return;
  }
  // A BLOCKED_RETRY task reaching its retry time IS the resume -- the human
  // does not have to ask again for something the runner scheduled itself.
  const resume = before.status === "BLOCKED_RETRY";

  try {
    acquireLock(taskId);
  } catch (err) {
    if (err instanceof LockedError) {
      log(`skipping ${taskId}: ${err.message}`);
      return;
    }
    throw err;
  }

  try {
    log(`running ${taskId}${resume ? " (resuming after quota wait)" : ""}`);
    const final = runTask(taskId, {
      resume,
      onStep: (step) =>
        log(
          `  [${step.index}] ${step.role}/${step.agent} a${step.attempt}/s${step.session} -> ${step.outcome}`,
        ),
    });
    log(`${taskId} stopped at ${final.status}${final.failure_reason ? `: ${final.failure_reason}` : ""}`);
  } finally {
    releaseLock(taskId);
  }
}

/**
 * Drain the queue, one task at a time.
 *
 * In daemon mode this never returns: it is the process you leave running, and
 * it is what makes "queue it and go to bed" work -- including waking up when a
 * quota window reopens.
 */
export async function runQueue(opts: RunnerOptions = {}): Promise<void> {
  const log = opts.onEvent ?? ((m: string) => console.error(m));
  const pollMs = (opts.pollSeconds ?? 60) * 1000;
  if (opts.daemon) markRunnerAlive();

  for (;;) {
    const held = currentLock();
    if (held) {
      if (!opts.daemon) {
        log(`another runner holds the lock (${held.task_id}, pid ${held.pid}); nothing to do`);
        return;
      }
    } else {
      const taskId = nextRunnable();
      if (taskId) {
        runOne(taskId, log);
        continue;
      }
      if (!opts.daemon) {
        const waiting = queue().filter((q) => q.waiting);
        if (waiting.length) {
          log(`nothing runnable now; ${waiting.length} task(s) waiting on quota:`);
          for (const w of waiting) log(`  ${w.task_id} — ${w.waiting}`);
        } else {
          log("queue is empty");
        }
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
