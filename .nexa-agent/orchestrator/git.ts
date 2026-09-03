/**
 * Git discipline (spec section 6). The orchestrator owns every git operation;
 * agents only commit on the task branch. Nothing here pushes, merges to a
 * protected branch, or touches anything but DEV_ROOT.
 */
import { execFileSync } from "child_process";
import { BASE_BRANCH, DEV_ROOT } from "./paths";

export class GitError extends Error {}

function git(args: string[], opts: { maxBuffer?: number; quiet?: boolean } = {}): string {
  try {
    return execFileSync("git", ["-C", DEV_ROOT, ...args], {
      encoding: "utf8",
      maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
      stdio: opts.quiet ? ["ignore", "pipe", "ignore"] : undefined,
    }).trim();
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new GitError(`git ${args.join(" ")} failed: ${e.stderr || e.message}`);
  }
}

export const currentBranch = (): string => git(["branch", "--show-current"]);
export const headSha = (ref = "HEAD"): string => git(["rev-parse", ref]);

export function branchExists(branch: string): boolean {
  try {
    git(["rev-parse", "--verify", `refs/heads/${branch}`], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Untracked files are ignored (.nexa-agent/ volatile dirs are gitignored), and
 * so is the orchestrator's own tracked source -- editing the orchestrator while
 * a task runs must not block dispatch or leak into a task branch.
 */
export function isDirty(): boolean {
  return git([
    "status", "--porcelain", "--untracked-files=no", "--", ".", ":(exclude).nexa-agent/**",
  ]).length > 0;
}

export function assertClean(context: string): void {
  if (isDirty()) {
    throw new GitError(
      `${context}: working tree has uncommitted changes. ` +
        `Every agent must commit its own work before returning control.\n${git(["status", "--short"])}`,
    );
  }
}

/**
 * Create the task branch off the base branch. Base is dev_vps by decision --
 * main and dev are never touched by the autonomous loop.
 */
export function createTaskBranch(branch: string, base = BASE_BRANCH): string {
  if (branchExists(branch)) throw new GitError(`branch ${branch} already exists`);
  assertClean("cannot create task branch");
  git(["checkout", base]);
  const baseSha = headSha();
  git(["checkout", "-b", branch, base]);
  return baseSha;
}

export function checkoutBranch(branch: string): void {
  if (currentBranch() === branch) return;
  assertClean(`cannot checkout ${branch}`);
  git(["checkout", branch]);
}

/**
 * Cumulative diff for the whole task: base..branch. This is the real diff the
 * tester and bug-fixer read -- never a description of the change.
 */
export function cumulativeDiff(baseSha: string, branch: string): string {
  return git(["diff", `${baseSha}..${branch}`]);
}

export function diffStat(baseSha: string, branch: string): string {
  return git(["diff", "--stat", `${baseSha}..${branch}`]);
}

/** Per-file stats, for the UI's collapsible diff viewer (no raw text dump). */
export function changedFiles(
  baseSha: string,
  branch: string,
): Array<{ file: string; added: number; removed: number }> {
  const out = git(["diff", "--numstat", `${baseSha}..${branch}`]);
  if (!out) return [];
  return out.split("\n").map((line) => {
    const [added, removed, file] = line.split("\t");
    return {
      file,
      added: added === "-" ? 0 : Number(added),
      removed: removed === "-" ? 0 : Number(removed),
    };
  });
}

export function fileDiff(baseSha: string, branch: string, file: string): string {
  return git(["diff", `${baseSha}..${branch}`, "--", file]);
}

/** Commits on the branch since base, newest first. */
export function commitsSince(baseSha: string, branch: string): Array<{ sha: string; subject: string }> {
  const out = git(["log", "--format=%H%x09%s", `${baseSha}..${branch}`]);
  if (!out) return [];
  return out.split("\n").map((line) => {
    const [sha, subject] = line.split("\t");
    return { sha, subject };
  });
}

export function commitExists(sha: string): boolean {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Safety net only. Agents are contractually required to commit their own work;
 * this exists so a well-behaved-but-forgetful agent cannot strand changes for
 * the next agent in the chain.
 *
 * `.nexa-agent/` is excluded explicitly. The orchestrator's own source is
 * tracked and lives inside the repo the agents commit to, so an unscoped
 * `git add -A` would sweep concurrent edits to the orchestrator into a task
 * branch. The orchestrator must never commit itself as part of a task.
 */
export function commitLeftovers(message: string): string | null {
  if (!isDirty()) return null;
  git(["add", "-A", "--", ".", ":(exclude).nexa-agent/**"]);
  // Re-check: if the only dirt was under .nexa-agent/, there is nothing to commit.
  if (git(["diff", "--cached", "--name-only"]).length === 0) return null;
  git(["commit", "-m", message]);
  return headSha();
}

/** Merge the approved task branch back into dev_vps. Never pushes. */
export function mergeToBase(branch: string, base = BASE_BRANCH): string {
  assertClean("cannot merge");
  git(["checkout", base]);
  git(["merge", "--no-ff", branch, "-m", `Merge ${branch} into ${base} (human approved)`]);
  return headSha();
}
