/**
 * Task state machine + handoff dispatch.
 *
 * Phase 2 scope: single-role dispatch. `dispatchStep` runs exactly one agent,
 * records the step, and persists state. The auto-handoff chain (Phase 3) is
 * built on top of this and is marked below.
 *
 * Every dispatch is a FRESH CLI session. Nothing is resumed, ever -- the packet
 * is the agent's entire input.
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { AGENT_DIR, LOG_DIR, ensureDir, loadAgents, loadRoles, nowIso, readJson } from "./paths";
import type { AgentResult, RoleName, StepRecord, TaskState } from "./types";
import * as git from "./git";
import {
  appendStep,
  bumpSession,
  createTask,
  lastStep,
  lastStepForRole,
  readState,
  resolveChain,
  sessionsUsed,
  writeState,
} from "./state";
import { buildPacket, sessionFor, writeHandoff, writePacket } from "./task-packet";
import { MAX_SESSIONS_PER_STEP, evaluateBudget, maxBudgetUsd } from "./context-budget";
import { describeWait, isDue, quotaWaitFor } from "./quota";

export class DispatchError extends Error {}

/** Fixed retry delay after a discarded safety-net commit -- see nextAction(). */
const COMMIT_FAILURE_RETRY_MS = 2 * 60_000;

/** Exit codes the wrappers use, from agents/_lib. */
const EXIT_GUARD_ABORT = 90;
const EXIT_INVALID_RESULT = 91;

function classifyExit(code: number | null): StepRecord["outcome"] {
  if (code === 0) return "ok";
  if (code === EXIT_GUARD_ABORT) return "guard_abort";
  if (code === EXIT_INVALID_RESULT) return "invalid_result";
  if (code === 124 || code === 137) return "timeout";
  return "cli_error";
}

function readUsage(taskId: string, agent: string, role: string, attempt: number, session: number) {
  const file = path.join(LOG_DIR, agent, `${taskId}_${role}_a${attempt}_s${session}.usage.json`);
  try {
    return fs.existsSync(file) ? readJson<Record<string, unknown>>(file) : null;
  } catch {
    return null;
  }
}

/**
 * Did the CLI die on something external rather than finish?
 *
 * Claude reports this as `is_error: true` with `terminal_reason: "api_error"`
 * and the human-readable cause in `result` (e.g. "You've hit your session limit
 * - resets 9:30am"). Observed live: a 14-turn session was severed mid-task, yet
 * exited 0 with a valid result file. Only this flag distinguishes it from a
 * genuine completion.
 */
function isTruncated(usage: Record<string, unknown> | null): boolean {
  return Boolean(usage && usage.is_error === true);
}

/** Why it died, for the human reading `show`. */
export function truncationReason(usage: Record<string, unknown> | null): string | null {
  if (!isTruncated(usage)) return null;
  const text = typeof usage?.error_text === "string" ? usage.error_text.trim() : "";
  const reason = typeof usage?.terminal_reason === "string" ? usage.terminal_reason : "unknown";
  return text ? `${reason}: ${text}` : reason;
}

/** Transient causes are worth resuming; anything else needs a human. */
const TRANSIENT_TERMINAL_REASONS = new Set(["api_error", "rate_limit", "overloaded"]);

export function isTransient(usage: Record<string, unknown> | null): boolean {
  if (!isTruncated(usage)) return false;
  const reason = typeof usage?.terminal_reason === "string" ? usage.terminal_reason : "";
  return TRANSIENT_TERMINAL_REASONS.has(reason);
}

function readResult(file: string): AgentResult | null {
  try {
    return fs.existsSync(file) ? readJson<AgentResult>(file) : null;
  } catch {
    return null;
  }
}

/**
 * Run exactly one role-step: fresh session, packet in, validated result out.
 * Mutates and persists `state`, and writes the handoff record.
 */
export function dispatchStep(
  state: TaskState,
  role: RoleName,
  opts: { handoffSummary?: string } = {},
): StepRecord {
  const roles = loadRoles();
  const agents = loadAgents();

  if (!roles.roles[role]) throw new DispatchError(`unknown role: ${role}`);
  const agentName = state.role_agents[role];
  if (!agentName) throw new DispatchError(`no agent frozen for role ${role} on task ${state.task_id}`);
  const agent = agents[agentName];
  if (!agent) throw new DispatchError(`unknown agent: ${agentName}`);

  // The agent contract requires the previous one to have committed its work.
  git.checkoutBranch(state.branch);
  git.assertClean(`before dispatching ${role}`);

  const session = sessionFor(state, role);
  bumpSession(state, role, state.attempt);

  const packet = buildPacket({ state, role, session, handoffSummary: opts.handoffSummary });
  const packetPath = writePacket(packet);

  const runner = path.join(AGENT_DIR, agent.runner);
  if (!fs.existsSync(runner)) throw new DispatchError(`runner not found: ${runner}`);

  const startedAt = nowIso();
  const shaBefore = git.headSha();

  ensureDir(path.join(LOG_DIR, agentName));
  const runLog = path.join(LOG_DIR, agentName, `${state.task_id}_${role}_a${state.attempt}_s${session}.run.log`);

  const proc = spawnSync(runner, [packetPath], {
    encoding: "utf8",
    cwd: AGENT_DIR,
    maxBuffer: 64 * 1024 * 1024,
    timeout: (agent.timeout_seconds + 180) * 1000,
    env: {
      ...process.env,
      // Derived from the token budget so the CLI has a hard stop of its own,
      // independent of whether the agent honours the prompt-level instruction.
      NEXA_MAX_BUDGET_USD: maxBudgetUsd(agent).toFixed(2),
    },
  });
  fs.writeFileSync(runLog, `--- stdout ---\n${proc.stdout ?? ""}\n--- stderr ---\n${proc.stderr ?? ""}\n`, "utf8");

  const exitCode = proc.status;
  const result = readResult(packet.result_path);

  const usage = readUsage(state.task_id, agentName, role, state.attempt, session);

  let outcome = classifyExit(exitCode);
  if (outcome === "ok" && result?.status === "blocked") outcome = "blocked";
  // A CLI that reported is_error was CUT OFF -- account usage limit, API 5xx.
  // It may still have written a well-formed result file before dying, and that
  // file will validate and exit 0. Trusting it would present a truncated run as
  // finished work awaiting merge. The CLI's own error flag wins.
  if (isTruncated(usage)) outcome = "agent_error";

  // Safety net: an agent that did the work but forgot to commit must not strand
  // changes for the next one. This runs for EVERY role, committing or not: a
  // non-committing role (tester-e2e, reviewer) that touches a tracked file --
  // e.g. its packet asks it to tick a status table in a design doc -- otherwise
  // leaves the tree dirty, and the very next step's git.assertClean() throws a
  // DispatchError that used to kill the whole runner daemon ("runner died: ...
  // working tree has uncommitted changes"). Committing-or-discarding here means
  // the tree is always clean for the next dispatch, whatever the agent did.
  const mustCommit = roles.roles[role].must_commit;
  let commitSha = result?.commit_sha ?? null;
  let commitFailure: string | null = null;
  if (git.isDirty()) {
    try {
      const rescued = git.commitLeftovers(
        mustCommit
          ? `chore(${role}): commit uncommitted work from ${agentName} [${state.task_id} a${state.attempt} s${session}]`
          : `docs(${role}): ${agentName} leftover edits [${state.task_id} a${state.attempt} s${session}]`,
      );
      if (rescued && mustCommit) commitSha = rescued;
    } catch (err) {
      // The leftover work fails its own pre-commit checks (e.g. a budget
      // cutoff mid-edit left the build broken -- see context-budget.ts).
      // Committing it would poison every later step's git.assertClean(), and
      // letting this throw propagate used to crash the whole runner daemon:
      // the task was found stuck at RUNNING forever with zero steps recorded,
      // because the crash happened before the step below could even be built.
      // Discard back to a clean base instead, so the retry below has
      // something to actually retry. A non-committing role was never expected
      // to land a commit, so a failed rescue of its stray edits is not a step
      // failure -- just discard and carry on.
      if (mustCommit) commitFailure = err instanceof Error ? err.message : String(err);
      git.discardLeftovers();
    }
  }
  if (commitSha && !git.commitExists(commitSha)) commitSha = null;
  if (!commitSha) {
    const head = git.headSha();
    if (head !== shaBefore) commitSha = head;
  }

  // A discarded safety-net commit means nothing landed for this step, whatever
  // the CLI itself reported -- it must not be presented as "ok" or trusted for
  // a checkpoint continuation.
  if (commitFailure) outcome = "commit_failed";

  const step: StepRecord = {
    index: state.steps.length,
    role,
    agent: agentName,
    attempt: state.attempt,
    session,
    started_at: startedAt,
    ended_at: nowIso(),
    outcome,
    exit_code: exitCode,
    packet_path: packetPath,
    result_path: packet.result_path,
    commit_sha: commitSha,
    commits: git.commitShasBetween(shaBefore),
    files_changed: result?.files_changed ?? [],
    diff_summary: result?.diff_summary ?? null,
    notes: commitFailure
      ? `Safety-net commit failed and leftover work was discarded: ${commitFailure}`
      : result?.notes ?? null,
    test_pass: result?.test_report ? result.test_report.pass : null,
    failure_count: result?.test_report ? result.test_report.failures.length : null,
    handoff_summary: result?.handoff_summary ?? null,
    usage,
  };

  // Schedule the retry as soon as the quota error is seen, so the decision is
  // recorded next to the evidence rather than recomputed later from prose.
  if (step.outcome === "agent_error" && isTransient(step.usage)) {
    const wait = quotaWaitFor(typeof step.usage?.error_text === "string" ? step.usage.error_text : null);
    state.retry_at = wait.retryAt;
    state.retry_basis = wait.basis;
  } else if (step.outcome === "commit_failed") {
    // Not a quota problem -- a fresh session just needs to redo the step from
    // a clean base. Short fixed delay rather than an immediate re-dispatch, so
    // a persistently broken packet does not spin the daemon in a tight loop.
    state.retry_at = new Date(Date.now() + COMMIT_FAILURE_RETRY_MS).toISOString();
    state.retry_basis = "leftover work failed its own pre-commit checks; short fixed retry, not a quota wait";
  } else if (step.outcome === "ok") {
    state.retry_at = null;
    state.retry_basis = null;
  }

  // A step may propose the epic's next phase(s). Keep only the latest
  // declaration -- normally just the final role in the chain sets this, but if
  // an earlier one did too, the most recent view of the plan wins.
  if (result?.next_phases?.length) {
    state.next_phases = result.next_phases;
  }

  appendStep(state, step);
  writeState(state);
  writeHandoff(state, packet, step, result);

  return step;
}

/** Phase 2 entry point: run the next role in the chain, one step only. */
export function dispatchNext(taskId: string): StepRecord {
  const state = readState(taskId);
  if (state.step_index >= state.chain.length) {
    throw new DispatchError(`task ${taskId} has no remaining steps in its chain`);
  }
  const role = state.chain[state.step_index];

  state.status = role === "tester-e2e" ? "TESTING" : "RUNNING";
  writeState(state);

  const step = dispatchStep(state, role);

  state.step_index += 1;
  writeState(state);
  return step;
}

// ---------------------------------------------------------------------------
// Phase 3: the auto-handoff chain.
//
//   PENDING -> RUNNING(dev steps) -> TESTING
//            -> PASS_AWAITING_APPROVAL
//            -> FIXING -> TESTING (loop, max_attempts)
//            -> FAILED
//
// The next action is DERIVED from state, never held in memory, so the
// orchestrator can be killed at any point and resume from state.json alone.
// ---------------------------------------------------------------------------

export type NextAction =
  | { kind: "dispatch"; role: RoleName; bumpAttempt: boolean }
  /** Stop the run loop and stay put: recoverable, waiting on a human resume. */
  | { kind: "halt"; status: TaskState["status"]; reason: string | null }
  | { kind: "terminal"; status: TaskState["status"]; reason: string | null };

const TERMINAL: ReadonlySet<TaskState["status"]> = new Set([
  "PASS_AWAITING_APPROVAL",
  "FAILED",
  "MERGED",
  "REVERTED",
  "REJECTED",
]);

export const isTerminal = (state: TaskState): boolean => TERMINAL.has(state.status);

/** Pure function of state -- this is what makes the machine resumable. */
export function nextAction(state: TaskState): NextAction {
  const roles = loadRoles();
  const { fixer_role: fixer, verifier_role: verifier } = roles.fix_loop;

  if (isTerminal(state)) {
    return { kind: "terminal", status: state.status, reason: state.failure_reason };
  }

  const last = lastStep(state);

  // A session severed by an account usage limit or an API error is NOT bad work
  // -- it is unfinished work. It keeps its attempt and resumes the same
  // role-step, carrying whatever it managed to commit, once a human says go.
  if (last && last.outcome === "agent_error") {
    const why = truncationReason(last.usage) ?? "the agent CLI reported an error";
    const recoverable =
      isTransient(last.usage) && sessionsUsed(state, last.role, state.attempt) < MAX_SESSIONS_PER_STEP;

    if (recoverable) {
      // An explicit human resume overrides the timer.
      if (state.resume_requested) {
        return { kind: "dispatch", role: last.role, bumpAttempt: false };
      }
      // Quota is a clock problem, not a work problem: wait it out rather than
      // burning retries against a limit that has not lifted.
      if (isDue(state.retry_at)) {
        return { kind: "dispatch", role: last.role, bumpAttempt: false };
      }
      return {
        kind: "halt",
        status: "BLOCKED_RETRY",
        reason:
          `step ${last.index} (${last.role}/${last.agent}) ran out of quota -- ${why}. ` +
          `Work so far is committed on ${state.branch}. ` +
          `Retrying automatically ${describeWait(state.retry_at!)} (${state.retry_basis ?? "scheduled"}).`,
      };
    }
    if (state.resume_requested) {
      return { kind: "dispatch", role: last.role, bumpAttempt: false };
    }
    return {
      kind: "terminal",
      status: "FAILED",
      reason: `step ${last.index} (${last.role}/${last.agent}) ended with an unrecoverable agent error -- ${why}`,
    };
  }

  // The safety-net commit itself failed (leftover work didn't pass its own
  // pre-commit checks) and was discarded back to a clean base -- see
  // dispatchStep. Nothing landed on the branch, so this is a code-defect
  // retry, not a quota wait: redo the same role-step in a fresh session after
  // a short fixed delay, capped like any other checkpoint restart so a
  // packet that is broken on every attempt still surfaces to a human instead
  // of looping forever.
  if (last && last.outcome === "commit_failed") {
    if (sessionsUsed(state, last.role, state.attempt) >= MAX_SESSIONS_PER_STEP) {
      return {
        kind: "terminal",
        status: "FAILED",
        reason:
          `step ${last.index} (${last.role}/${last.agent}) left broken, uncommittable work ` +
          `${MAX_SESSIONS_PER_STEP} sessions in a row -- ${last.notes ?? "see step notes"}`,
      };
    }
    if (state.resume_requested || isDue(state.retry_at)) {
      return { kind: "dispatch", role: last.role, bumpAttempt: false };
    }
    return {
      kind: "halt",
      status: "BLOCKED_RETRY",
      reason:
        `step ${last.index} (${last.role}/${last.agent})'s leftover work failed its own pre-commit ` +
        `checks and was discarded -- ${last.notes ?? ""}. ` +
        `Retrying automatically ${describeWait(state.retry_at!)}.`,
    };
  }

  // A step that failed on infrastructure (timeout, guard abort, bad result) or
  // an agent that reported itself blocked stops the chain: a human should look.
  if (last && last.outcome !== "ok") {
    return {
      kind: "terminal",
      status: "FAILED",
      reason: `step ${last.index} (${last.role}/${last.agent}) ended with outcome "${last.outcome}" (exit ${last.exit_code})`,
    };
  }

  // A step that checkpointed on context budget continues in a fresh session of
  // the SAME role-step -- not a new attempt, and not the next role.
  if (last) {
    const agent = loadAgents()[last.agent];
    const verdict = evaluateBudget(last, agent, sessionsUsed(state, last.role, state.attempt));
    if (verdict.continueInNewSession) {
      return { kind: "dispatch", role: last.role, bumpAttempt: false };
    }
    if (verdict.exhaustedSessions) {
      return {
        kind: "terminal",
        status: "FAILED",
        reason: `${last.role} ${verdict.reason}; branch ${state.branch} left intact for inspection`,
      };
    }
  }

  // Work through the declared chain first.
  if (state.step_index < state.chain.length) {
    return { kind: "dispatch", role: state.chain[state.step_index], bumpAttempt: false };
  }

  // Chain exhausted. The verdict now rests on the tester, if the chain had one.
  const tester = lastStepForRole(state, verifier);
  if (!tester) {
    return { kind: "terminal", status: "PASS_AWAITING_APPROVAL", reason: null };
  }
  if (tester.test_pass === true) {
    return { kind: "terminal", status: "PASS_AWAITING_APPROVAL", reason: null };
  }

  // Tester failed. If a fixer just ran, re-verify; otherwise start a fix cycle.
  if (last && last.role === fixer) {
    return { kind: "dispatch", role: verifier, bumpAttempt: false };
  }
  if (state.attempt >= state.max_attempts) {
    return {
      kind: "terminal",
      status: "FAILED",
      reason: `max attempts (${state.max_attempts}) exhausted; ${tester.failure_count ?? "unknown"} defect(s) still open. Branch ${state.branch} left intact for inspection.`,
    };
  }
  return { kind: "dispatch", role: fixer, bumpAttempt: true };
}

/**
 * A severed session leaves no handoff summary -- it never got the chance to
 * write one. Rebuild a minimal baton from what it did manage to record, so the
 * continuation session knows it is resuming rather than starting over. The full
 * git diff of the partial work reaches it through the packet regardless.
 */
export function synthesizeHandoff(step: StepRecord): string {
  if (step.outcome !== "agent_error") return "";
  const why = truncationReason(step.usage) ?? "the CLI reported an error";
  const lines = [
    `The previous session of this same role-step was CUT SHORT (${why}).`,
    "It did not finish, and it did not get to write a handoff summary.",
    "",
    "What it recorded before it was severed:",
  ];
  lines.push(step.diff_summary ? `- summary: ${step.diff_summary}` : "- summary: (none recorded)");
  lines.push(
    step.files_changed.length
      ? `- files touched: ${step.files_changed.join(", ")}`
      : "- files touched: (none recorded)",
  );
  lines.push(step.commit_sha ? `- committed as: ${step.commit_sha}` : "- committed: nothing");
  if (step.notes) lines.push(`- notes: ${step.notes}`);
  lines.push(
    "",
    "Treat the diff below as work in progress that YOU wrote. Verify it is",
    "complete and correct before building on it, then finish the remaining work.",
  );
  return lines.join("\n");
}

/** Perform exactly one transition. Returns the state after it. */
export function advanceOnce(taskId: string): { state: TaskState; action: NextAction; step: StepRecord | null } {
  const state = readState(taskId);
  const action = nextAction(state);

  if (action.kind === "terminal" || action.kind === "halt") {
    if (state.status !== action.status || state.failure_reason !== action.reason) {
      state.status = action.status;
      state.failure_reason = action.reason;
      writeState(state);
    }
    return { state, action, step: null };
  }

  // A resume is one-shot: consume it here so a stale flag cannot re-dispatch.
  if (state.resume_requested) state.resume_requested = false;
  if (action.bumpAttempt) state.attempt += 1;
  state.status = action.role === loadRoles().fix_loop.verifier_role ? "TESTING" : action.bumpAttempt ? "FIXING" : "RUNNING";
  writeState(state);

  const inChain = state.step_index < state.chain.length && state.chain[state.step_index] === action.role;

  // A continuation session receives the previous session's handoff summary in
  // place of prior_report, plus the git diff so far (built into the packet).
  const previous = lastStep(state);
  const carry =
    previous && previous.role === action.role
      ? previous.handoff_summary || synthesizeHandoff(previous)
      : undefined;

  const step = dispatchStep(state, action.role, { handoffSummary: carry || undefined });

  // Only advance the chain when the role-step actually finished. A step that
  // checkpointed on budget, or was severed mid-run, stays put so the next
  // dispatch continues the same role rather than handing incomplete work on.
  const agent = loadAgents()[step.agent];
  const verdict = evaluateBudget(step, agent, sessionsUsed(state, step.role, state.attempt));
  const finished = step.outcome !== "agent_error" && !verdict.continueInNewSession;
  if (inChain && finished) state.step_index += 1;
  writeState(state);

  return { state, action, step };
}

export interface RunOptions {
  /** Hard ceiling on dispatches, so a bug cannot spin forever. */
  maxSteps?: number;
  /** Re-dispatch a role-step that a usage limit or API error cut short. */
  resume?: boolean;
  onStep?: (step: StepRecord, state: TaskState) => void;
}

/**
 * Drive a task to a terminal state, handing off between agents with no human
 * in the loop. The human only appears at PASS_AWAITING_APPROVAL.
 */
export function runTask(taskId: string, opts: RunOptions = {}): TaskState {
  const maxSteps = opts.maxSteps ?? 20;
  let state = readState(taskId);

  if (opts.resume) {
    if (state.status !== "BLOCKED_RETRY") {
      throw new DispatchError(`task ${taskId} is ${state.status}, not BLOCKED_RETRY -- nothing to resume`);
    }
    state.resume_requested = true;
    state.failure_reason = null;
    writeState(state);
  }

  for (let i = 0; i < maxSteps; i += 1) {
    const result = advanceOnce(taskId);
    state = result.state;
    if (result.step && opts.onStep) opts.onStep(result.step, state);
    if (result.action.kind === "terminal" || result.action.kind === "halt") return state;
  }

  state = readState(taskId);
  state.status = "FAILED";
  state.failure_reason = `orchestrator step ceiling (${maxSteps}) hit without reaching a terminal state`;
  writeState(state);
  return state;
}

// --- human approval gate ----------------------------------------------------

/**
 * The commits this task -- and only this task -- created.
 *
 * Falls back to base_sha..branch for tasks recorded before per-step shas were
 * tracked; those ran on their own branch, where the range genuinely was the
 * task's own work.
 */
export function taskCommitShas(state: TaskState): string[] {
  const fromSteps = state.steps.flatMap((s) => s.commits ?? []);
  if (fromSteps.length) return [...new Set(fromSteps)];
  if (state.branch !== state.base_branch) {
    return git.commitsSince(state.base_sha, state.branch).map((c) => c.sha);
  }
  return [];
}

export interface ApproveResult {
  state: TaskState;
  /**
   * Set when this task had a declared next_phases plan: the id of the new
   * PENDING task created for phase[0]. The caller (CLI / control UI) is
   * responsible for enqueueing it -- creation and execution stay decoupled
   * here the same way `create` and `start` always have.
   */
  nextPhaseTaskId: string | null;
}

/**
 * Accept a task's work.
 *
 * There is nothing to merge -- the commits are already on dev_vps. What this
 * records is that a human looked at them and is keeping them, which is the
 * whole point of the gate. Nothing is ever pushed.
 *
 * If the task declared a next_phases plan (see PhasePlanEntry), approving it
 * also creates the next phase as a new task so a multi-phase feature does not
 * need a human to hand-type each follow-up task -- but the gate itself is
 * untouched: that new task still stops at its own PASS_AWAITING_APPROVAL.
 */
export function approveTask(taskId: string, approver: string): ApproveResult {
  const state = readState(taskId);
  if (state.status !== "PASS_AWAITING_APPROVAL") {
    throw new DispatchError(`task ${taskId} is ${state.status}, not PASS_AWAITING_APPROVAL`);
  }
  // A task from before work moved onto dev_vps still has its commits on its own
  // branch, so accepting it has to actually merge them -- otherwise "approved"
  // would leave the code stranded where nothing reads it.
  let merged: string | null = null;
  if (state.branch !== state.base_branch && git.branchExists(state.branch)) {
    merged = git.mergeToBase(state.branch, state.base_branch);
  }

  state.status = "MERGED";
  state.approved_by = approver;
  state.approved_at = nowIso();
  state.failure_reason = null;
  writeState(state);

  console.error(
    merged
      ? `merged legacy branch ${state.branch} into ${state.base_branch} as ${merged.slice(0, 8)} (not pushed)`
      : `accepted ${taskCommitShas(state).length} commit(s) on ${state.branch} (not pushed)`,
  );

  let nextPhaseTaskId: string | null = null;
  const plan = state.next_phases;
  if (plan && plan.length) {
    const [phase, ...rest] = plan;
    const epicId = state.epic_id ?? state.task_id;
    const child = createTask({
      summary: phase.summary,
      chain: resolveChain(phase.chain),
      relevantPaths: phase.relevant_paths ?? state.relevant_paths,
      epicId,
      phaseNumber: (state.phase_number ?? 1) + 1,
      nextPhases: rest.length ? rest : null,
    });
    nextPhaseTaskId = child.task_id;
    console.error(
      `epic ${epicId}: phase ${child.phase_number} created as ${child.task_id} ` +
        `(${rest.length} phase(s) queued after it)`,
    );
  }

  return { state, nextPhaseTaskId };
}

/**
 * Undo a task's commits on dev_vps.
 *
 * This is the escape hatch that abandoning a branch used to provide. It reverts
 * rather than resets, so anything committed after the task survives, and it is
 * all-or-nothing: a conflict aborts cleanly rather than leaving the tree half
 * undone.
 */
export function revertTask(taskId: string, by: string): TaskState {
  const state = readState(taskId);
  const shas = taskCommitShas(state);
  if (!shas.length) throw new DispatchError(`task ${taskId} has no commits to revert`);

  const { reverted, conflicted } = git.revertCommits(shas);
  if (conflicted) {
    throw new DispatchError(
      `revert of ${conflicted.slice(0, 8)} conflicts with later work -- nothing was changed. ` +
        `Undo it by hand, or ask a bug-fixer task to remove the behaviour instead.`,
    );
  }

  state.status = "REVERTED";
  state.approved_by = by;
  state.approved_at = nowIso();
  state.failure_reason = `${reverted.length} commit(s) reverted by ${by}`;
  writeState(state);
  return state;
}

/**
 * Send a passing task back for more work. The tester's verdict is invalidated
 * so the derived next action becomes a fix cycle.
 */
export function rejectTask(taskId: string, reason: string): TaskState {
  const state = readState(taskId);
  if (state.status !== "PASS_AWAITING_APPROVAL") {
    throw new DispatchError(`task ${taskId} is ${state.status}, not PASS_AWAITING_APPROVAL`);
  }
  const roles = loadRoles();
  const tester = lastStepForRole(state, roles.fix_loop.verifier_role);
  if (tester) {
    tester.test_pass = false;
    tester.failure_count = (tester.failure_count ?? 0) + 1;
    tester.notes = `${tester.notes ?? ""}\n\nHUMAN REJECTION: ${reason}`.trim();
  }
  state.status = "FIXING";
  state.failure_reason = null;
  writeState(state);
  return state;
}

