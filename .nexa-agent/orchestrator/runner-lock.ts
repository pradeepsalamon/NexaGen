/**
 * One task at a time, enforced.
 *
 * Tasks commit directly to dev_vps now, so concurrency is not a performance
 * question -- it is a correctness one. Two tasks running at once would
 * interleave commits on a single branch, and `commitLeftovers` (the safety net
 * that rescues work an agent forgot to commit) would happily sweep the other
 * task's uncommitted files into the wrong commit. There is no way to untangle
 * that afterwards.
 *
 * The lock is a file rather than an in-process mutex because the runners are
 * separate detached processes. It records the pid so a lock left behind by a
 * killed process can be identified and cleared instead of wedging the queue
 * forever.
 */
import * as fs from "fs";
import * as path from "path";
import { AGENT_DIR, ensureDir, nowIso, readJson, writeJson } from "./paths";

const LOCK_FILE = path.join(AGENT_DIR, "state", "runner.lock");

export interface RunnerLock {
  task_id: string;
  pid: number;
  acquired_at: string;
}

function processAlive(pid: number): boolean {
  try {
    // Signal 0 checks for existence without actually signalling.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The lock as it stands, after clearing one whose process is gone. */
export function currentLock(): RunnerLock | null {
  if (!fs.existsSync(LOCK_FILE)) return null;
  let lock: RunnerLock;
  try {
    lock = readJson<RunnerLock>(LOCK_FILE);
  } catch {
    fs.rmSync(LOCK_FILE, { force: true });
    return null;
  }
  if (!processAlive(lock.pid)) {
    // The holder died -- a crash, a reboot, a kill. Releasing here is what
    // stops one dead process from stalling every queued task.
    fs.rmSync(LOCK_FILE, { force: true });
    return null;
  }
  return lock;
}

export class LockedError extends Error {
  constructor(public readonly lock: RunnerLock) {
    super(`task ${lock.task_id} is already running (pid ${lock.pid})`);
  }
}

/**
 * Take the lock, or throw with who holds it.
 *
 * `wx` makes the create-if-absent atomic at the filesystem level, so two
 * runners starting in the same millisecond cannot both believe they won.
 */
export function acquireLock(taskId: string): RunnerLock {
  ensureDir(path.dirname(LOCK_FILE));
  const existing = currentLock();
  if (existing) {
    if (existing.task_id === taskId) return existing;
    throw new LockedError(existing);
  }

  const lock: RunnerLock = { task_id: taskId, pid: process.pid, acquired_at: nowIso() };
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2), { encoding: "utf8", flag: "wx" });
  } catch {
    const winner = currentLock();
    if (winner && winner.task_id !== taskId) throw new LockedError(winner);
    writeJson(LOCK_FILE, lock);
  }
  return lock;
}

/** Release only our own lock -- never someone else's. */
export function releaseLock(taskId: string): void {
  const lock = currentLock();
  if (lock && lock.task_id === taskId && lock.pid === process.pid) {
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

/** Force-release, for a human digging out of a wedged state. */
export function breakLock(): RunnerLock | null {
  const lock = currentLock();
  fs.rmSync(LOCK_FILE, { force: true });
  return lock;
}
