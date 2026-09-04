/**
 * Drives one conversational turn of the supervisor agent.
 *
 * The CLI invocation lives in agents/supervisor/run.sh; this module owns the
 * thread transcript, normalises three different reply envelopes into one shape,
 * captures the session id so the next turn continues, and turns a severed
 * session into a message the human can act on rather than a stack trace.
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AGENT_DIR, LOG_DIR, ensureDir, nowIso } from "../paths";
import type { AgentName } from "../types";
import type { ChatMessage, ChatThread } from "./thread";
import { appendMessage, createThread, readThread, writeThread } from "./thread";

const RUNNER = path.join(AGENT_DIR, "agents", "supervisor", "run.sh");

export class SupervisorError extends Error {}

/** One turn's reply, normalised across the three CLIs. */
interface NormalisedTurn {
  text: string;
  isError: boolean;
  terminalReason: string | null;
  costUsd: number | null;
}

/**
 * Each CLI reports a finished turn differently, and none of them are close:
 * Claude returns one JSON object with `result`, antigravity returns
 * `{conversation_id, status, response}`, and opencode streams JSONL where the
 * answer is assembled from text parts. Normalising here keeps that knowledge in
 * one place instead of leaking into the transcript, the API and the UI.
 */
function normaliseTurn(agent: AgentName, raw: string): NormalisedTurn {
  if (!raw.trim()) {
    return { text: "", isError: true, terminalReason: "empty output", costUsd: null };
  }

  if (agent === "claude") {
    try {
      const d = JSON.parse(raw) as Record<string, unknown>;
      return {
        text: typeof d.result === "string" ? d.result.trim() : "",
        isError: d.is_error === true,
        terminalReason: typeof d.terminal_reason === "string" ? d.terminal_reason : null,
        costUsd: typeof d.total_cost_usd === "number" ? d.total_cost_usd : null,
      };
    } catch {
      return { text: "", isError: true, terminalReason: "unparseable output", costUsd: null };
    }
  }

  if (agent === "antigravity") {
    try {
      const d = JSON.parse(raw) as Record<string, unknown>;
      return {
        text: typeof d.response === "string" ? d.response.trim() : "",
        isError: d.status !== "SUCCESS",
        terminalReason: typeof d.status === "string" ? d.status : null,
        costUsd: null,
      };
    } catch {
      return { text: "", isError: true, terminalReason: "unparseable output", costUsd: null };
    }
  }

  // opencode: JSONL events. The assistant's prose arrives as text parts; take
  // the last contiguous run of them, which is the final answer rather than the
  // narration it produced while working.
  const chunks: string[] = [];
  let errored = false;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "error") errored = true;
    const part = event.part as { type?: string; text?: string } | undefined;
    if (part?.type === "text" && typeof part.text === "string") chunks.push(part.text);
  }
  return {
    text: chunks.join("").trim(),
    isError: errored,
    terminalReason: errored ? "opencode reported an error event" : null,
    costUsd: null,
  };
}

/**
 * Which commands the supervisor actually ran this turn.
 *
 * The transcript must record what it *did*, not only what it said -- "I've
 * started that for you" is worth nothing if nothing was started. Claude's JSON
 * envelope carries only the final prose, so its tool calls come from Claude
 * Code's own session transcript; opencode stamps tool events into its JSONL
 * directly. Reading the prose for command-shaped text would just be trusting
 * the narration again.
 */
function extractActions(agent: AgentName, sessionId: string | null, since: number, raw: string): string[] {
  if (agent === "opencode") {
    const actions: string[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as { type?: string; part?: { tool?: string; state?: { input?: { command?: string } } } };
        if (event.type !== "tool_use") continue;
        const command = event.part?.state?.input?.command;
        actions.push(command ? command.split("\n")[0].slice(0, 160) : (event.part?.tool ?? "tool"));
      } catch {
        continue;
      }
    }
    return actions;
  }

  // antigravity's print output does not enumerate tool calls at all.
  if (agent !== "claude" || !sessionId) return [];

  const dir = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(dir)) return [];

  const transcript = fs
    .readdirSync(dir)
    .map((project) => path.join(dir, project, `${sessionId}.jsonl`))
    .find((file) => fs.existsSync(file));
  if (!transcript) return [];

  const actions: string[] = [];
  for (const line of fs.readFileSync(transcript, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let entry: { timestamp?: string; message?: { content?: unknown } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    // Only this turn's calls: the session file accumulates the whole conversation.
    if (entry.timestamp && Date.parse(entry.timestamp) < since) continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as { type?: string; name?: string; input?: { command?: string } };
      if (b.type !== "tool_use") continue;
      const command = b.input?.command;
      actions.push(command ? command.split("\n")[0].slice(0, 160) : (b.name ?? "tool"));
    }
  }
  return actions;
}

/** Task ids the turn mentioned, so the UI can link them. */
function extractTaskIds(text: string): string[] {
  return [...new Set([...text.matchAll(/task_[\w-]+/g)].map((m) => m[0]))];
}

/**
 * A recap handed to a newly-appointed supervisor.
 *
 * CLI sessions are not portable between agents, so switching mid-conversation
 * would otherwise drop the new one into the middle of a discussion it has never
 * seen. Replaying a trimmed transcript is cheap and keeps the handover legible.
 */
function handoverRecap(thread: ChatThread, from: AgentName, to: AgentName): string {
  const recent = thread.messages.slice(-8);
  if (!recent.length) return "";

  const lines = [
    `[You are taking over this conversation from ${from}. You are now the supervisor (${to}).`,
    "You have no memory of what was said, so here is the recent transcript. Continue from it;",
    "do not greet the human as if this were a new conversation.]",
    "",
  ];
  for (const m of recent) {
    lines.push(`${m.role === "user" ? "HUMAN" : "PREVIOUS SUPERVISOR"}: ${m.content.slice(0, 900)}`);
    lines.push("");
  }
  lines.push("[End of transcript. The human's new message follows.]", "");
  return lines.join("\n");
}

export interface SendOptions {
  /** Switch the thread to a different CLI, starting a fresh session on it. */
  agent?: AgentName;
  /** Switch the model. Same CLI keeps its session; a different one does not. */
  model?: string | null;
}

export interface TurnResult {
  thread: ChatThread;
  reply: ChatMessage;
}

/**
 * Send one message and get the supervisor's reply.
 *
 * Blocking on purpose: a chat turn is seconds to a couple of minutes, and the
 * supervisor is instructed to use `start` (which detaches) rather than `run`
 * for anything long. If it ever does block for the full timeout, that is a bug
 * in its prompt, not something to paper over with a background queue.
 */
export function sendMessage(threadId: string | null, text: string, opts: SendOptions = {}): TurnResult {
  if (!text.trim()) throw new SupervisorError("empty message");

  const thread = threadId ? readThread(threadId) : createThread();

  // Changing CLI invalidates the session -- ids are not portable between them.
  let recap = "";
  if (opts.agent && opts.agent !== thread.agent) {
    recap = handoverRecap(thread, thread.agent, opts.agent);
    thread.agent = opts.agent;
    thread.session_id = null;
  }
  if (opts.model !== undefined && opts.model !== thread.model) {
    thread.model = opts.model;
  }

  appendMessage(thread, { role: "user", content: text, at: nowIso() });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexa-chat-"));
  const messageFile = path.join(tmpDir, "message.txt");
  const rawFile = path.join(tmpDir, "raw.json");
  fs.writeFileSync(messageFile, recap + text, "utf8");

  ensureDir(path.join(LOG_DIR, "supervisor"));

  const turnStartedAt = Date.now();
  const proc = spawnSync(
    RUNNER,
    [thread.agent, thread.model || "-", thread.session_id || "-", messageFile, rawFile],
    { encoding: "utf8", cwd: AGENT_DIR, maxBuffer: 64 * 1024 * 1024, timeout: 420_000 },
  );

  // The runner's last stdout line hands back the session to continue from.
  const sessionLine = (proc.stdout ?? "").trim().split("\n").reverse().find((l) => l.startsWith("SESSION="));
  const capturedSession = sessionLine ? sessionLine.slice("SESSION=".length).trim() : "";
  if (capturedSession) thread.session_id = capturedSession;

  const raw = fs.existsSync(rawFile) ? fs.readFileSync(rawFile, "utf8") : "";
  fs.rmSync(tmpDir, { force: true, recursive: true });

  const turn = normaliseTurn(thread.agent, raw);

  // A severed turn is worth saying out loud. The alternative -- an empty bubble
  // or a raw non-zero exit -- leaves the human with no idea whether their
  // request landed.
  let error: string | null = null;
  if (turn.isError || proc.status !== 0) {
    error =
      turn.text ||
      `${thread.agent} exited ${proc.status}${turn.terminalReason ? ` (${turn.terminalReason})` : ""}`;
  }

  const content =
    turn.text ||
    (error
      ? `I couldn't complete that turn: ${error}\n\nNothing was changed. Say it again once that clears and I'll pick up where we left off — the conversation is saved.`
      : "(no reply)");

  const reply: ChatMessage = {
    role: "assistant",
    content,
    at: nowIso(),
    agent: thread.agent,
    model: thread.model,
    actions: extractActions(thread.agent, thread.session_id, turnStartedAt, raw),
    task_ids: extractTaskIds(content),
    cost_usd: turn.costUsd,
    error,
  };

  appendMessage(thread, reply);
  writeThread(thread);
  return { thread, reply };
}
