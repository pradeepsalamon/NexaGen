/**
 * Shared contract for the orchestrator. Mirrors orchestrator/result-schema.json
 * (the agent-facing contract) and config/roles.json (the role contract).
 */

/** Task lifecycle. The state machine in orchestrator.ts owns transitions. */
export type TaskStatus =
  | "PENDING"
  | "RUNNING"
  | "TESTING"
  | "FIXING"
  | "PASS_AWAITING_APPROVAL"
  | "FAILED"
  | "MERGED"
  | "REJECTED";

export type RoleName =
  | "backend-dev"
  | "frontend-dev"
  | "tester-e2e"
  | "bug-fixer"
  | "reviewer";

export type AgentName = "claude" | "antigravity" | "opencode";

/** One agent invocation. Appended to state.steps, never mutated afterwards. */
export interface StepRecord {
  index: number;
  role: RoleName;
  agent: AgentName;
  /** Fix-loop attempt this step belongs to. */
  attempt: number;
  /** Session within this role-step; >1 means a context-budget checkpoint restart. */
  session: number;
  started_at: string;
  ended_at: string | null;
  /** ok = agent returned a valid result. The result's own status may still be "blocked". */
  outcome: "ok" | "blocked" | "invalid_result" | "timeout" | "guard_abort" | "cli_error";
  exit_code: number | null;
  packet_path: string;
  result_path: string;
  commit_sha: string | null;
  files_changed: string[];
  diff_summary: string | null;
  notes: string | null;
  /** Present only for tester-e2e. */
  test_pass: boolean | null;
  failure_count: number | null;
  /** Set when the session checkpointed for context budget. */
  handoff_summary: string | null;
  usage: Record<string, unknown> | null;
}

/**
 * The resumable record for one task: state/tasks/<id>/state.json.
 * The orchestrator must be able to restart mid-task and recover from this alone.
 */
export interface TaskState {
  task_id: string;
  created_at: string;
  updated_at: string;
  status: TaskStatus;

  feature_summary: string;
  relevant_paths: string[];

  branch: string;
  base_branch: string;
  /** Commit on base_branch the task branched from; anchors the cumulative diff. */
  base_sha: string;

  /** Ordered roles for this task, resolved from roles.json chains at creation. */
  chain: RoleName[];
  /** Role -> agent, frozen at creation so a mid-flight task cannot switch agents. */
  role_agents: Record<string, AgentName>;
  /** Role -> submodel, e.g. gemini-3.8-flash-low, sonnet, etc. */
  role_models?: Record<string, string>;

  /** Index into `chain` of the step to run next. */
  step_index: number;
  /** Fix-loop attempts consumed. Starts at 1. */
  attempt: number;
  max_attempts: number;
  /** Keyed "<role>:<attempt>" -> sessions used, separate from attempt (spec section 7). */
  sessions_used: Record<string, number>;

  steps: StepRecord[];
  /** Human-readable reason for FAILED / REJECTED. */
  failure_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

/** The packet handed to an agent. Its entire input -- no chat history, ever. */
export interface TaskPacket {
  task_id: string;
  role: RoleName;
  attempt: number;
  session: number;
  feature_summary: string;
  branch: string;
  repo_path: string;
  model?: string;
  relevant_paths: string[];
  prior_diff: string;
  prior_report: string;
  handoff_summary: string;
  constraints: string[];
  result_path: string;
  /** Present only for agents with a configured context window. */
  context_budget?: {
    window_tokens: number | null;
    budget_tokens: number | null;
    budget_pct: number | null;
    session: number;
    max_sessions: number;
    measured: boolean;
  };
}

/** An agent's result file, after validate-result.sh has accepted it. */
export interface AgentResult {
  status: "done" | "blocked";
  diff_summary: string;
  files_changed: string[];
  commit_sha: string | null;
  notes: string;
  handoff_summary?: string | null;
  test_report?: {
    pass: boolean;
    failures: Array<{
      title: string;
      detail: string;
      severity?: "critical" | "major" | "minor";
      files?: string[];
    }>;
  } | null;
}

export interface AgentConfig {
  cli: string;
  runner: string;
  invoke: string;
  session_mode: string;
  supports_token_accounting: boolean;
  context_window_tokens: number | null;
  context_budget_pct: number | null;
  max_budget_usd?: number;
  timeout_seconds: number;
  enforces_json_schema: boolean;
  model?: string;
  permission_flag?: string;
}

export interface RoleConfig {
  default_agent: AgentName;
  description: string;
  must_commit: boolean;
  requires_test_report?: boolean;
  read_only_source?: boolean;
}

export interface RolesFile {
  roles: Record<string, RoleConfig>;
  chains: Record<string, RoleName[]>;
  fix_loop: {
    fixer_role: RoleName;
    verifier_role: RoleName;
    max_attempts: number;
  };
}
