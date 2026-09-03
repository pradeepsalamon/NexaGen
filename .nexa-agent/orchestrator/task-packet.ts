/**
 * Builds the structured input for each fresh session (spec section 5).
 *
 * A packet is entirely self-contained: no agent ever sees prior chat, only this.
 * The previous agent's work reaches the next one as a real `git diff`, never as
 * a description of the change.
 */
import * as path from "path";
import { DEV_ROOT, ensureDir, handoffDir, taskDir, writeJson } from "./paths";
import type { RoleName, StepRecord, TaskPacket, TaskState } from "./types";
import * as git from "./git";
import { lastStepForRole, sessionsUsed } from "./state";
import { readJson } from "./paths";
import type { AgentResult } from "./types";
import * as fs from "fs";
import { budgetInfoFor } from "./context-budget";
import { loadAgents } from "./paths";

/** Diffs above this are truncated head+tail so a huge change cannot blow the context window. */
const MAX_DIFF_CHARS = 180_000;

function truncateDiff(diff: string, stat: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  const head = diff.slice(0, Math.floor(MAX_DIFF_CHARS * 0.7));
  const tail = diff.slice(-Math.floor(MAX_DIFF_CHARS * 0.2));
  return [
    head,
    "\n\n...[DIFF TRUNCATED BY ORCHESTRATOR]...",
    `Full diff is ${diff.length} characters. Summary of all changed files:`,
    stat,
    "Re-read any file directly in the repository if you need its full contents.",
    "...[RESUMING AT END OF DIFF]...\n\n",
    tail,
  ].join("\n");
}

const BASE_CONSTRAINTS = [
  "read .nexa-agent/config/SAFETY.md before making any change",
  "the only workspace is /opt/nexa-chess/NexaGen-dev and the only database is vps_dev",
  "never push, never merge, never deploy",
  "output a structured result JSON matching orchestrator/result-schema.json",
];

function constraintsFor(role: RoleName, branch: string): string[] {
  const commitRule =
    role === "tester-e2e" || role === "reviewer"
      ? "do not modify application source and do not commit; set commit_sha to null"
      : `commit your changes to branch ${branch} when done; do not push or merge`;

  const roleRule: Record<string, string[]> = {
    "tester-e2e": [
      "test independently; assume the implementation is wrong until the code proves otherwise",
      "never report pass unless you actually ran the checks and saw them succeed",
      "test_report is required and must not be null",
    ],
    "bug-fixer": [
      "fix every meaningful defect in the report above, not just the first one",
      "do not refactor beyond what the defects require",
    ],
    reviewer: ["report findings; do not fix them"],
  };

  return [...BASE_CONSTRAINTS.slice(0, 3), commitRule, ...(roleRule[role] ?? []), BASE_CONSTRAINTS[3]];
}

/** Render a tester's failures into the prose the fixer actually reads. */
function renderTestReport(result: AgentResult): string {
  const report = result.test_report;
  if (!report) return result.notes ?? "";
  const lines = [`TESTER VERDICT: ${report.pass ? "PASS" : "FAIL"}`, ""];
  if (report.failures.length) {
    lines.push(`${report.failures.length} defect(s) reported:`, "");
    report.failures.forEach((failure, i) => {
      lines.push(`### ${i + 1}. ${failure.title}${failure.severity ? ` [${failure.severity}]` : ""}`);
      lines.push(failure.detail);
      if (failure.files?.length) lines.push(`Files: ${failure.files.join(", ")}`);
      lines.push("");
    });
  }
  if (result.notes) lines.push("Tester notes:", result.notes);
  return lines.join("\n");
}

function readResultSafe(file: string): AgentResult | null {
  try {
    return fs.existsSync(file) ? readJson<AgentResult>(file) : null;
  } catch {
    return null;
  }
}

/**
 * The report the next agent should see. A fixer gets the tester's defect list;
 * anyone else gets the previous step's summary and notes.
 */
function buildPriorReport(state: TaskState, role: RoleName): string {
  if (role === "bug-fixer") {
    const tester = lastStepForRole(state, "tester-e2e");
    if (!tester) return "";
    const result = readResultSafe(tester.result_path);
    return result ? renderTestReport(result) : (tester.notes ?? "");
  }

  const previous = state.steps[state.steps.length - 1];
  if (!previous) return "";
  const parts = [`Previous step: ${previous.role} (agent: ${previous.agent}, outcome: ${previous.outcome}).`];
  if (previous.diff_summary) parts.push("", "What it did:", previous.diff_summary);
  if (previous.notes) parts.push("", "Notes it left for you:", previous.notes);
  return parts.join("\n");
}

export interface BuildPacketOptions {
  state: TaskState;
  role: RoleName;
  session: number;
  /** Carried over when a session checkpointed on context budget. */
  handoffSummary?: string;
}

export function buildPacket({ state, role, session, handoffSummary }: BuildPacketOptions): TaskPacket {
  const diff = git.cumulativeDiff(state.base_sha, state.branch);
  const stat = git.diffStat(state.base_sha, state.branch);
  const agent = loadAgents()[state.role_agents[role]];
  const budget = agent ? budgetInfoFor(agent, session) : null;

  return {
    task_id: state.task_id,
    role,
    attempt: state.attempt,
    session,
    feature_summary: state.feature_summary,
    branch: state.branch,
    repo_path: DEV_ROOT,
    relevant_paths: state.relevant_paths,
    prior_diff: truncateDiff(diff, stat),
    prior_report: buildPriorReport(state, role),
    handoff_summary: handoffSummary ?? "",
    constraints: constraintsFor(role, state.branch),
    model: state.role_models?.[role],
    result_path: path.join(taskDir(state.task_id), `result_${role}_a${state.attempt}_s${session}.json`),
    ...(budget?.budget_tokens ? { context_budget: budget } : {}),
  };
}

/** Persist the packet the agent will consume. */
export function writePacket(packet: TaskPacket): string {
  const file = path.join(
    taskDir(packet.task_id),
    `packet_${packet.role}_a${packet.attempt}_s${packet.session}.json`,
  );
  writeJson(file, packet);
  return file;
}

/**
 * Every transition writes a handoff record before dispatching the next agent,
 * so the UI and a human can replay exactly what each agent was told and returned.
 */
export function writeHandoff(
  state: TaskState,
  packet: TaskPacket,
  step: StepRecord | null,
  result: AgentResult | null,
): string {
  const dir = handoffDir(state.task_id);
  ensureDir(dir);
  const n = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length + 1;
  const file = path.join(dir, `${n}.json`);
  writeJson(file, {
    n,
    recorded_at: new Date().toISOString(),
    task_id: state.task_id,
    task_status: state.status,
    role: packet.role,
    agent: state.role_agents[packet.role],
    attempt: packet.attempt,
    session: packet.session,
    /** Exactly what the agent was told. */
    packet_given: packet,
    /** Exactly what it returned. */
    result_returned: result,
    step,
  });
  return file;
}

export function sessionFor(state: TaskState, role: RoleName): number {
  return sessionsUsed(state, role, state.attempt) + 1;
}
