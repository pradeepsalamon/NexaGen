/** Single source of truth for filesystem layout and config loading. */
import * as fs from "fs";
import * as path from "path";
import type { AgentConfig, AgentName, RolesFile } from "./types";

export const DEV_ROOT = "/opt/nexa-chess/NexaGen-dev";
export const PROD_ROOT = "/opt/nexa-chess/NexaGen";
export const DB_NAME = "vps_dev";
export const BASE_BRANCH = "dev_vps";

export const AGENT_DIR = path.join(DEV_ROOT, ".nexa-agent");
export const CONFIG_DIR = path.join(AGENT_DIR, "config");
export const STATE_DIR = path.join(AGENT_DIR, "state", "tasks");
export const HANDOFF_DIR = path.join(AGENT_DIR, "reports", "handoffs");
export const LOG_DIR = path.join(AGENT_DIR, "logs");
export const RESULT_SCHEMA = path.join(AGENT_DIR, "orchestrator", "result-schema.json");

export const taskDir = (id: string) => path.join(STATE_DIR, id);
export const statePath = (id: string) => path.join(taskDir(id), "state.json");
export const handoffDir = (id: string) => path.join(HANDOFF_DIR, id);

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Atomic write: temp file + rename, so a crash mid-write cannot corrupt state. */
export function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function loadAgents(): Record<AgentName, AgentConfig> {
  const raw = readJson<Record<string, unknown>>(path.join(CONFIG_DIR, "agents.json"));
  const out: Record<string, AgentConfig> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) continue; // _note / _corrections are documentation
    out[key] = value as AgentConfig;
  }
  return out as Record<AgentName, AgentConfig>;
}

export function loadRoles(): RolesFile {
  return readJson<RolesFile>(path.join(CONFIG_DIR, "roles.json"));
}

export function nowIso(): string {
  return new Date().toISOString();
}
