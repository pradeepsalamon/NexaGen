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

/** Raw `git status --porcelain` lines (tracked changes only), for reporting. */
export function statusPorcelain(): string[] {
  const out = git(["status", "--porcelain", "--untracked-files=no"]);
  return out ? out.split("\n") : [];
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
 * Put the repo on the working branch and return the sha the task starts from.
 *
 * Tasks commit DIRECTLY to dev_vps -- there is no per-task branch. That makes
 * the recorded base sha the only thing anchoring "what this task changed", and
 * it makes serialisation mandatory rather than merely tidy: two tasks committing
 * to one branch at once would interleave their commits and `commitLeftovers`
 * would sweep the other's work into the wrong task. The runner lock in
 * state.ts is what guarantees only one is ever in flight.
 *
 * main and dev are never touched by the autonomous loop.
 */
export function startOnBase(base = BASE_BRANCH): string {
  if (currentBranch() !== base) {
    assertClean(`cannot switch to ${base}`);
    git(["checkout", base]);
  }
  return headSha();
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
export function cumulativeDiff(baseSha: string, branch = "HEAD"): string {
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
/** Shas created between two points, oldest first. */
export function commitShasBetween(from: string, to = "HEAD"): string[] {
  if (from === to) return [];
  const out = git(["rev-list", "--reverse", `${from}..${to}`]);
  return out ? out.split("\n").filter(Boolean) : [];
}

/** Subjects for specific shas, in the order given. */
export function describeCommits(shas: string[]): Array<{ sha: string; subject: string }> {
  return shas.map((sha) => ({
    sha,
    subject: git(["log", "-1", "--format=%s", sha], { quiet: true }),
  }));
}

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

/**
 * Discard leftover work `commitLeftovers` could not commit (its own pre-commit
 * checks rejected it -- typically a budget cutoff mid-edit, see
 * context-budget.ts). Committing broken code would poison the next dispatch's
 * `assertClean()` forever, so this reverts back to HEAD instead.
 *
 * Scoped identically to `isDirty`/`commitLeftovers` -- `.nexa-agent/**` is
 * never touched, so this can never wipe out concurrent orchestrator
 * development sitting untracked/uncommitted in the same working tree.
 */
export function discardLeftovers(): void {
  git(["reset", "--", ".", ":(exclude).nexa-agent/**"]);
  git(["checkout", "--", ".", ":(exclude).nexa-agent/**"]);
  git(["clean", "-fd", "--", ".", ":(exclude).nexa-agent/**"]);
}

/**
 * Branches whose remote is wired to a production deployment.
 *
 * Pushing `main` fires .github/workflows/deploy-production.yml, which SSHes to
 * this VPS, rebuilds the production containers and runs `prisma migrate deploy`
 * against the production database. A push to main is therefore a production
 * deployment, and is gated separately from an ordinary push.
 */
const DEPLOY_ON_PUSH = new Set(["main"]);

export const deploysOnPush = (branch: string): boolean => DEPLOY_ON_PUSH.has(branch);

export interface PushResult {
  branch: string;
  remote: string;
  commits: number;
  deployed: boolean;
  output: string;
}

/**
 * Push a branch to origin.
 *
 * Outward-facing and effectively irreversible -- once commits are on the remote
 * they may already be fetched, and for `main` a deployment is under way before
 * anyone can reconsider. `allowProductionDeploy` has to be passed explicitly for
 * such a branch, so nobody arrives at a deploy by way of a generic "push".
 */
export function pushBranch(
  branch: string,
  opts: { remote?: string; allowProductionDeploy?: boolean } = {},
): PushResult {
  const remote = opts.remote ?? "origin";
  if (!branchExists(branch)) throw new GitError(`branch ${branch} does not exist`);

  if (deploysOnPush(branch) && !opts.allowProductionDeploy) {
    throw new GitError(
      `pushing ${branch} triggers deploy-production.yml: it rebuilds the production ` +
        `containers and runs prisma migrate deploy against the PRODUCTION database. ` +
        `That is a deployment, not a push. Re-run with the production-deploy acknowledgement ` +
        `if that is genuinely what is intended.`,
    );
  }

  let ahead = 0;
  try {
    ahead = git(["rev-list", "--count", `${remote}/${branch}..${branch}`], { quiet: true })
      ? Number(git(["rev-list", "--count", `${remote}/${branch}..${branch}`], { quiet: true }))
      : 0;
  } catch {
    // No upstream yet -- everything on the branch is new to the remote.
    ahead = Number(git(["rev-list", "--count", branch]));
  }

  const output = git(["push", remote, branch]);
  return { branch, remote, commits: ahead, deployed: deploysOnPush(branch), output };
}

/** Merge one local branch into another. Never pushes; the caller decides that. */
export function mergeBranches(from: string, into: string): { sha: string; alreadyUpToDate: boolean } {
  if (!branchExists(from)) throw new GitError(`branch ${from} does not exist`);
  if (!branchExists(into)) throw new GitError(`branch ${into} does not exist`);
  assertClean(`cannot merge ${from} into ${into}`);

  const before = headSha(into);
  git(["checkout", into]);
  const out = git(["merge", "--no-ff", from, "-m", `Merge ${from} into ${into} (human approved)`]);
  const after = headSha();
  return { sha: after, alreadyUpToDate: before === after || /Already up to date/i.test(out) };
}

/**
 * Merge a legacy task branch into the base.
 *
 * Only for tasks created before work moved onto dev_vps directly. Those have
 * real commits sitting on their own branch, and accepting one has to actually
 * bring the work in -- otherwise "approved" would mean the code stays stranded
 * where nobody sees it. Never pushes.
 */
export function mergeToBase(branch: string, base = BASE_BRANCH): string {
  assertClean("cannot merge");
  const wasOn = currentBranch();
  if (wasOn !== base) git(["checkout", base]);
  git(["merge", "--no-ff", branch, "-m", `Merge ${branch} into ${base} (human approved)`]);
  return headSha();
}

/**
 * Undo a task's commits.
 *
 * With work landing straight on dev_vps, this replaces "abandon the branch" as
 * the escape hatch, so it has to be safe by construction. It reverts each
 * commit individually, newest first, rather than resetting: a reset would also
 * discard anything committed after the task, and the history of what was tried
 * is worth keeping. If any single revert conflicts the whole thing is aborted
 * and nothing is left half-undone.
 */
export function revertCommits(shas: string[]): { reverted: string[]; conflicted: string | null } {
  assertClean("cannot revert");
  const reverted: string[] = [];
  for (const sha of [...shas].reverse()) {
    try {
      git(["revert", "--no-edit", "--no-commit", sha]);
      git(["commit", "-m", `Revert ${sha.slice(0, 8)} (task rejected)`]);
      reverted.push(sha);
    } catch {
      git(["revert", "--abort"], { quiet: true });
      // Undo the reverts already made, so the tree is exactly as it was.
      for (const done of reverted) git(["reset", "--hard", `${done}~0`], { quiet: true });
      return { reverted: [], conflicted: sha };
    }
  }
  return { reverted, conflicted: null };
}
