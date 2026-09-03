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
import { appendStep, bumpSession, lastStep, lastStepForRole, readState, sessionsUsed, writeState } from "./state";
import { buildPacket, sessionFor, writeHandoff, writePacket } from "./task-packet";
import { evaluateBudget, maxBudgetUsd } from "./context-budget";

export class DispatchError extends Error {}

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

  let outcome = classifyExit(exitCode);
  if (outcome === "ok" && result?.status === "blocked") outcome = "blocked";

  // Safety net: an agent that did the work but forgot to commit must not strand
  // changes for the next one. Roles that shouldn't commit are left untouched.
  let commitSha = result?.commit_sha ?? null;
  if (roles.roles[role].must_commit && git.isDirty()) {
    const rescued = git.commitLeftovers(
      `chore(${role}): commit uncommitted work from ${agentName} [${state.task_id} a${state.attempt} s${session}]`,
    );
    if (rescued) commitSha = rescued;
  }
  if (commitSha && !git.commitExists(commitSha)) commitSha = null;
  if (!commitSha) {
    const head = git.headSha();
    if (head !== shaBefore) commitSha = head;
  }

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
    files_changed: result?.files_changed ?? [],
    diff_summary: result?.diff_summary ?? null,
    notes: result?.notes ?? null,
    test_pass: result?.test_report ? result.test_report.pass : null,
    failure_count: result?.test_report ? result.test_report.failures.length : null,
    handoff_summary: result?.handoff_summary ?? null,
    usage: readUsage(state.task_id, agentName, role, state.attempt, session),
  };

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
  | { kind: "terminal"; status: TaskState["status"]; reason: string | null };

const TERMINAL: ReadonlySet<TaskState["status"]> = new Set([
  "PASS_AWAITING_APPROVAL",
  "FAILED",
  "MERGED",
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

  // A step that failed on infrastructure (timeout, guard abort, bad result) or
  // an agent that reported itself blocked stops the chain: a human should look.
  const last = lastStep(state);
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

/** Perform exactly one transition. Returns the state after it. */
export function advanceOnce(taskId: string): { state: TaskState; action: NextAction; step: StepRecord | null } {
  const state = readState(taskId);
  const action = nextAction(state);

  if (action.kind === "terminal") {
    if (state.status !== action.status) {
      state.status = action.status;
      state.failure_reason = action.reason;
      writeState(state);
    }
    return { state, action, step: null };
  }

  if (action.bumpAttempt) state.attempt += 1;
  state.status = action.role === loadRoles().fix_loop.verifier_role ? "TESTING" : action.bumpAttempt ? "FIXING" : "RUNNING";
  writeState(state);

  const inChain = state.step_index < state.chain.length && state.chain[state.step_index] === action.role;

  // A continuation session receives the previous session's handoff summary in
  // place of prior_report, plus the git diff so far (built into the packet).
  const previous = lastStep(state);
  const carry =
    previous && previous.role === action.role && previous.handoff_summary
      ? previous.handoff_summary
      : undefined;

  const step = dispatchStep(state, action.role, { handoffSummary: carry });

  // Only advance the chain when the role-step actually finished. A checkpointed
  // step stays put so the next dispatch continues the same role.
  const agent = loadAgents()[step.agent];
  const verdict = evaluateBudget(step, agent, sessionsUsed(state, step.role, state.attempt));
  if (inChain && !verdict.continueInNewSession) state.step_index += 1;
  writeState(state);

  return { state, action, step };
}

export interface RunOptions {
  /** Hard ceiling on dispatches, so a bug cannot spin forever. */
  maxSteps?: number;
  onStep?: (step: StepRecord, state: TaskState) => void;
}

/**
 * Drive a task to a terminal state, handing off between agents with no human
 * in the loop. The human only appears at PASS_AWAITING_APPROVAL.
 */
export function runTask(taskId: string, opts: RunOptions = {}): TaskState {
  const maxSteps = opts.maxSteps ?? 20;
  let state = readState(taskId);

  for (let i = 0; i < maxSteps; i += 1) {
    const result = advanceOnce(taskId);
    state = result.state;
    if (result.step && opts.onStep) opts.onStep(result.step, state);
    if (result.action.kind === "terminal") return state;
  }

  state = readState(taskId);
  state.status = "FAILED";
  state.failure_reason = `orchestrator step ceiling (${maxSteps}) hit without reaching a terminal state`;
  writeState(state);
  return state;
}

// --- human approval gate ----------------------------------------------------

/** Merge an approved task branch into dev_vps. Agents never do this. */
export function approveTask(taskId: string, approver: string): TaskState {
  const state = readState(taskId);
  if (state.status !== "PASS_AWAITING_APPROVAL") {
    throw new DispatchError(`task ${taskId} is ${state.status}, not PASS_AWAITING_APPROVAL`);
  }
  const mergeSha = git.mergeToBase(state.branch, state.base_branch);
  state.status = "MERGED";
  state.approved_by = approver;
  state.approved_at = nowIso();
  state.failure_reason = null;
  writeState(state);
  console.error(`merged ${state.branch} into ${state.base_branch} as ${mergeSha.slice(0, 8)} (not pushed)`);
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

