/**
 * Supervisor conversation threads.
 *
 * The model's own memory of the conversation lives in the Claude Code session
 * that `session_id` names -- each turn resumes it, so we never replay history
 * into the prompt. What is stored here is the transcript the UI renders and the
 * audit trail of what the supervisor actually did on the human's behalf.
 *
 * This is deliberately the opposite of the worker-agent contract: workers get a
 * fresh session every single time and never remember anything, because their
 * input must be reproducible. A conversation is the one place continuity is the
 * point.
 */
import * as fs from "fs";
import * as path from "path";
import { CHAT_DIR, ensureDir, nowIso, readJson, writeJson } from "../paths";
import type { AgentName } from "../types";
import { loadSupervisorConfig } from "./config";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
  /** Orchestrator commands the supervisor ran during this turn, for the timeline. */
  actions?: string[];
  /** Tasks this turn created or touched, so the UI can link them. */
  task_ids?: string[];
  cost_usd?: number | null;
  /** Set when the turn itself failed (usage limit, CLI error). */
  error?: string | null;
  /** Which CLI produced this reply -- a thread can change hands mid-conversation. */
  agent?: AgentName;
  model?: string | null;
}

export interface ChatThread {
  thread_id: string;
  created_at: string;
  updated_at: string;
  title: string;
  /** Which CLI is answering. Switching it starts a new session on this thread. */
  agent: AgentName;
  /** Model for that CLI; null means the CLI's own default. */
  model: string | null;
  /**
   * The CLI session backing this thread. Claude lets us choose the id up front;
   * antigravity and opencode mint their own, so this stays null until the first
   * turn comes back and we capture it.
   */
  session_id: string | null;
  messages: ChatMessage[];
}

const threadPath = (id: string): string => path.join(CHAT_DIR, `${id}.json`);

/** Short, sortable, human-recognisable in a directory listing. */
function makeThreadId(when = new Date()): string {
  const stamp = when.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
  return `chat_${stamp}`;
}

export function createThread(title = "New conversation"): ChatThread {
  ensureDir(CHAT_DIR);
  let id = makeThreadId();
  for (let n = 2; fs.existsSync(threadPath(id)); n += 1) id = `${makeThreadId()}_${n}`;

  const cfg = loadSupervisorConfig();
  const thread: ChatThread = {
    thread_id: id,
    created_at: nowIso(),
    updated_at: nowIso(),
    title,
    agent: cfg.agent,
    model: cfg.model,
    // Minted by the CLI on the first turn and captured by the runner.
    session_id: null,
    messages: [],
  };
  writeJson(threadPath(id), thread);
  return thread;
}

/** Remove a conversation for good. The CLI-side session is left to expire. */
export function deleteThread(id: string): void {
  if (fs.existsSync(threadPath(id))) fs.unlinkSync(threadPath(id));
}

export function threadExists(id: string): boolean {
  return fs.existsSync(threadPath(id));
}

export function readThread(id: string): ChatThread {
  const thread = readJson<ChatThread>(threadPath(id));
  // Threads written before the supervisor became switchable have no agent or
  // model. They were all Claude, and their session id is still valid for it.
  if (!thread.agent) thread.agent = "claude";
  if (thread.model === undefined) thread.model = null;
  if (thread.session_id === undefined) thread.session_id = null;
  return thread;
}

export function writeThread(thread: ChatThread): void {
  thread.updated_at = nowIso();
  writeJson(threadPath(thread.thread_id), thread);
}

export function appendMessage(thread: ChatThread, message: ChatMessage): ChatThread {
  thread.messages.push(message);
  // The first thing the human said is a better title than a timestamp.
  if (thread.messages.length === 1 && message.role === "user") {
    thread.title = message.content.split("\n")[0].slice(0, 60).trim() || thread.title;
  }
  writeThread(thread);
  return thread;
}

/** Newest first. */
export function listThreads(): ChatThread[] {
  if (!fs.existsSync(CHAT_DIR)) return [];
  return fs
    .readdirSync(CHAT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return readJson<ChatThread>(path.join(CHAT_DIR, f));
      } catch {
        return null;
      }
    })
    .filter((t): t is ChatThread => t !== null)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/** Resolve "the conversation we were just having". */
export function latestThread(): ChatThread | null {
  return listThreads()[0] ?? null;
}
