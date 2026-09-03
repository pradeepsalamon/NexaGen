/**
 * Drives one conversational turn of the supervisor agent.
 *
 * The heavy lifting is in agents/supervisor/run.sh; this module owns the thread
 * transcript, extracts what the supervisor actually *did* during the turn, and
 * turns a severed session into a message the human can act on rather than a
 * stack trace.
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AGENT_DIR, LOG_DIR, ensureDir, nowIso } from "../paths";
import type { ChatMessage, ChatThread } from "./thread";
import { appendMessage, createThread, readThread } from "./thread";

const RUNNER = path.join(AGENT_DIR, "agents", "supervisor", "run.sh");

export class SupervisorError extends Error {}

interface RawTurn {
  result?: string;
  is_error?: boolean;
  terminal_reason?: string;
  total_cost_usd?: number;
  num_turns?: number;
  session_id?: string;
}

/**
 * Which commands the supervisor actually ran this turn.
 *
 * The transcript must record what it *did*, not only what it said -- "I've
 * started that for you" is worth nothing if nothing was started. `--output-format
 * json` returns only the final prose, so the tool calls come from Claude Code's
 * own session transcript, which is the record of what really executed. Reading
 * the prose for command-shaped text would just be trusting the narration again.
 */
function extractActions(sessionId: string, since: number): string[] {
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
  return [...new Set([...text.matchAll(/task_\d{4}-\d{2}-\d{2}_[a-z0-9-]+/g)].map((m) => m[0]))];
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
export function sendMessage(threadId: string | null, text: string): TurnResult {
  if (!text.trim()) throw new SupervisorError("empty message");

  const isNew = !threadId;
  const thread = isNew ? createThread() : readThread(threadId as string);

  appendMessage(thread, { role: "user", content: text, at: nowIso() });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexa-chat-"));
  const messageFile = path.join(tmpDir, "message.txt");
  const rawFile = path.join(tmpDir, "raw.json");
  fs.writeFileSync(messageFile, text, "utf8");

  ensureDir(path.join(LOG_DIR, "supervisor"));

  const turnStartedAt = Date.now();
  const args = [thread.session_id, messageFile, rawFile];
  // The first turn creates the session; every later one resumes it.
  if (isNew || thread.messages.length <= 1) args.push("--new");

  const proc = spawnSync(RUNNER, args, {
    encoding: "utf8",
    cwd: AGENT_DIR,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 360_000,
  });

  let raw: RawTurn = {};
  try {
    if (fs.existsSync(rawFile)) raw = JSON.parse(fs.readFileSync(rawFile, "utf8")) as RawTurn;
  } catch {
    /* handled below by the empty-reply path */
  }
  fs.rmSync(tmpDir, { force: true, recursive: true });

  const replyText = (raw.result ?? "").trim();

  // A severed turn is worth saying out loud. The alternative -- an empty bubble
  // or a raw non-zero exit -- leaves the human with no idea whether their
  // request landed.
  let error: string | null = null;
  if (raw.is_error || proc.status !== 0) {
    error = replyText || `supervisor CLI exited ${proc.status}${raw.terminal_reason ? ` (${raw.terminal_reason})` : ""}`;
  }

  const content =
    replyText ||
    (error
      ? `I couldn't complete that turn: ${error}\n\nNothing was changed. Say it again once that clears and I'll pick up where we left off — I still have the conversation.`
      : "(no reply)");

  const reply: ChatMessage = {
    role: "assistant",
    content,
    at: nowIso(),
    actions: extractActions(thread.session_id, turnStartedAt),
    task_ids: extractTaskIds(content),
    cost_usd: typeof raw.total_cost_usd === "number" ? raw.total_cost_usd : null,
    error,
  };

  appendMessage(thread, reply);
  return { thread, reply };
}
