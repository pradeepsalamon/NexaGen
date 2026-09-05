/**
 * Task state persistence. state/tasks/<id>/state.json is the single source of
 * truth -- the orchestrator must be able to die mid-task and resume from it.
 */
import * as fs from "fs";
import { BASE_BRANCH, STATE_DIR, ensureDir, nowIso, readJson, statePath, taskDir, writeJson } from "./paths";
import type { AgentName, PhasePlanEntry, RoleName, StepRecord, TaskState } from "./types";
import { loadAgents, loadRoles } from "./paths";
import * as git from "./git";

/** A named chain from roles.json, or an explicit "role,role" list -- the same
 *  syntax the CLI's --chain flag and a declared PhasePlanEntry.chain accept. */
export function resolveChain(value: string): RoleName[] {
  const roles = loadRoles();
  if (roles.chains[value]) return roles.chains[value];
  return value.split(",").map((r) => r.trim()) as RoleName[];
}

/** Slug a human prompt into a stable, filesystem-safe task id. */
export function makeTaskId(summary: string, when = new Date()): string {
  const date = when.toISOString().slice(0, 10);
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 4)
    .join("-")
    .slice(0, 30) || "task";
  let id = `task_${date}_${slug}`;
  if (taskExists(id) || git.branchExists(`agent/${id}`)) {
    const timeSuffix = when.toISOString().slice(11, 19).replace(/:/g, "");
    id = `task_${date}_${slug}_${timeSuffix}`;
    if (taskExists(id) || git.branchExists(`agent/${id}`)) {
      id = `${id}_${Math.random().toString(36).slice(2, 6)}`;
    }
  }
  return id;
}

export function taskExists(id: string): boolean {
  return fs.existsSync(statePath(id));
}

export function readState(id: string): TaskState {
  if (!taskExists(id)) throw new Error(`unknown task: ${id}`);
  return readJson<TaskState>(statePath(id));
}

export function writeState(state: TaskState): void {
  state.updated_at = nowIso();
  writeJson(statePath(state.task_id), state);
}

export function listTasks(): TaskState[] {
  if (!fs.existsSync(STATE_DIR)) return [];
  return fs
    .readdirSync(STATE_DIR)
    .filter((id) => fs.existsSync(statePath(id)))
    .map((id) => readState(id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export interface CreateTaskInput {
  summary: string;
  /** Explicit role list, or a named chain from roles.json. */
  chain: RoleName[];
  /** Per-task agent overrides, e.g. { "backend-dev": "antigravity" }. */
  agentOverrides?: Partial<Record<RoleName, AgentName>>;
  /** Per-task model overrides, e.g. { "backend-dev": "gemini-3.8-flash-low" }. */
  modelOverrides?: Partial<Record<RoleName, string>>;
  relevantPaths?: string[];
  taskId?: string;
  /** Set when this task is a phase of a larger feature. See TaskState.epic_id. */
  epicId?: string | null;
  /** 1-based position within the epic. Defaults to 1 (a standalone task, or the first phase). */
  phaseNumber?: number;
  /** Phases still to come after this one. See TaskState.next_phases. */
  nextPhases?: PhasePlanEntry[] | null;
}

/**
 * Create a task: resolve role -> agent NOW and freeze it, cut the branch off
 * dev_vps, and write initial state.
 */
export function createTask(input: CreateTaskInput): TaskState {
  const roles = loadRoles();
  const agents = loadAgents();
  const id = input.taskId ?? makeTaskId(input.summary);
  if (taskExists(id)) throw new Error(`task ${id} already exists`);
  if (input.chain.length === 0) throw new Error("chain must contain at least one role");

  for (const role of input.chain) {
    if (!roles.roles[role]) throw new Error(`unknown role: ${role}`);
  }

  // Freeze role -> agent and model so a mid-flight task cannot silently switch.
  const roleAgents: Record<string, AgentName> = {};
  const roleModels: Record<string, string> = {};
  const allRoles = new Set<RoleName>([...input.chain, roles.fix_loop.fixer_role, roles.fix_loop.verifier_role]);
  for (const role of allRoles) {
    const override = input.agentOverrides?.[role];
    const agent = override ?? roles.roles[role].default_agent;
    roleAgents[role] = agent;

    // Precedence: what this task asked for, then what the Team tab pinned for
    // this role, then the agent's own default. An empty string means "let the
    // CLI pick", which is not the same as pinning a model.
    const modelOverride = input.modelOverrides?.[role];
    const roleModel = roles.roles[role].default_model;
    const agentCfg = agents[agent];
    roleModels[role] = modelOverride || roleModel || agentCfg?.default_model || "";
  }

  // No task branch: work lands directly on dev_vps. base_sha is therefore the
  // only record of where this task's changes begin.
  const branch = BASE_BRANCH;
  const baseSha = git.startOnBase(BASE_BRANCH);

  const state: TaskState = {
    task_id: id,
    created_at: nowIso(),
    updated_at: nowIso(),
    status: "PENDING",
    feature_summary: input.summary,
    relevant_paths: input.relevantPaths ?? [],
    branch,
    base_branch: BASE_BRANCH,
    base_sha: baseSha,
    chain: input.chain,
    role_agents: roleAgents,
    role_models: roleModels,
    step_index: 0,
    attempt: 1,
    max_attempts: roles.fix_loop.max_attempts,
    sessions_used: {},
    steps: [],
    failure_reason: null,
    approved_by: null,
    approved_at: null,
    epic_id: input.epicId ?? null,
    phase_number: input.phaseNumber ?? 1,
    next_phases: input.nextPhases ?? null,
  };

  ensureDir(taskDir(id));
  writeState(state);
  return state;
}

export const sessionKey = (role: RoleName, attempt: number) => `${role}:${attempt}`;

export function sessionsUsed(state: TaskState, role: RoleName, attempt: number): number {
  return state.sessions_used[sessionKey(role, attempt)] ?? 0;
}

export function bumpSession(state: TaskState, role: RoleName, attempt: number): number {
  const key = sessionKey(role, attempt);
  const next = (state.sessions_used[key] ?? 0) + 1;
  state.sessions_used[key] = next;
  return next;
}

export function appendStep(state: TaskState, step: StepRecord): void {
  state.steps.push(step);
}

/** Most recent completed step, used to build the next packet's prior_report. */
export function lastStep(state: TaskState): StepRecord | null {
  return state.steps.length ? state.steps[state.steps.length - 1] : null;
}

export function lastStepForRole(state: TaskState, role: RoleName): StepRecord | null {
  for (let i = state.steps.length - 1; i >= 0; i -= 1) {
    if (state.steps[i].role === role) return state.steps[i];
  }
  return null;
}
