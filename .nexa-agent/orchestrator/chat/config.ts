/**
 * Read/write access to the two configuration files the Team tab edits:
 * `config/supervisor.json` (who you are talking to) and `config/roles.json`
 * (who does the work).
 *
 * Writes are surgical on purpose. These files carry `_comment` keys and
 * explanatory notes that are the only record of why some of this is shaped the
 * way it is; a naive round-trip that rewrote the whole object would erase them.
 * Only the fields the UI actually owns are touched.
 */
import * as path from "path";
import { CONFIG_DIR, loadAgents, loadRoles, readJson, writeJson } from "../paths";
import type { AgentName, RoleName } from "../types";

const SUPERVISOR_FILE = path.join(CONFIG_DIR, "supervisor.json");
const ROLES_FILE = path.join(CONFIG_DIR, "roles.json");

export interface SupervisorConfig {
  agent: AgentName;
  model: string | null;
  max_budget_usd: number;
  timeout_seconds: number;
}

type RawSupervisor = Record<string, unknown>;

export function loadSupervisorConfig(): SupervisorConfig {
  const raw = readJson<RawSupervisor>(SUPERVISOR_FILE);
  return {
    agent: (raw.agent as AgentName) ?? "claude",
    model: (raw.model as string | null) ?? null,
    max_budget_usd: typeof raw.max_budget_usd === "number" ? raw.max_budget_usd : 3,
    timeout_seconds: typeof raw.timeout_seconds === "number" ? raw.timeout_seconds : 300,
  };
}

export class ConfigError extends Error {}

/** Reject anything not actually installed, rather than failing at dispatch. */
function assertAgent(agent: string): AgentName {
  const agents = loadAgents();
  if (!agents[agent as AgentName]) {
    throw new ConfigError(`unknown agent "${agent}" (have: ${Object.keys(agents).join(", ")})`);
  }
  return agent as AgentName;
}

/**
 * A model must be one the agent actually lists. An unknown string would be
 * passed straight to the CLI as --model and fail deep inside a run, minutes
 * later, where the cause is far from obvious.
 */
function assertModel(agent: AgentName, model: string | null): string | null {
  if (!model) return null;
  const cfg = loadAgents()[agent];
  const known = (cfg.models ?? []).map((m) => m.id);
  if (known.length && !known.includes(model)) {
    throw new ConfigError(`agent "${agent}" has no model "${model}" (have: ${known.join(", ")})`);
  }
  return model;
}

export function saveSupervisorConfig(patch: Partial<SupervisorConfig>): SupervisorConfig {
  const raw = readJson<RawSupervisor>(SUPERVISOR_FILE);

  if (patch.agent !== undefined) raw.agent = assertAgent(patch.agent);
  if (patch.model !== undefined) {
    raw.model = assertModel((patch.agent ?? raw.agent) as AgentName, patch.model);
  }
  if (patch.max_budget_usd !== undefined) raw.max_budget_usd = patch.max_budget_usd;
  if (patch.timeout_seconds !== undefined) raw.timeout_seconds = patch.timeout_seconds;

  writeJson(SUPERVISOR_FILE, raw);
  return loadSupervisorConfig();
}

export interface RoleAssignment {
  role: RoleName;
  agent: AgentName;
  model: string | null;
}

/** Persist which agent (and model) fills each role. */
export function saveRoleAssignments(assignments: RoleAssignment[]): void {
  const raw = readJson<Record<string, unknown>>(ROLES_FILE);
  const roles = raw.roles as Record<string, Record<string, unknown>>;

  for (const { role, agent, model } of assignments) {
    if (!roles[role]) throw new ConfigError(`unknown role "${role}"`);
    const resolved = assertAgent(agent);
    roles[role].default_agent = resolved;
    const checked = assertModel(resolved, model);
    if (checked) {
      roles[role].default_model = checked;
    } else {
      delete roles[role].default_model;
    }
  }

  writeJson(ROLES_FILE, raw);
}

/** Everything the Team tab needs to render itself, in one call. */
export function describeTeam() {
  const roles = loadRoles();
  const agents = loadAgents();
  const supervisor = loadSupervisorConfig();

  return {
    supervisor,
    agents: Object.entries(agents).map(([name, cfg]) => ({
      name,
      cli: cfg.cli,
      default_model: cfg.default_model ?? null,
      models: cfg.models ?? [],
      // Only Claude offers a real tool allowlist; the others get plan mode,
      // which is the closest read-only equivalent each has.
      supervisor_capable: true,
    })),
    roles: Object.entries(roles.roles).map(([name, cfg]) => ({
      name,
      description: cfg.description,
      agent: cfg.default_agent,
      model: cfg.default_model ?? null,
      must_commit: cfg.must_commit,
    })),
    chains: roles.chains,
  };
}
