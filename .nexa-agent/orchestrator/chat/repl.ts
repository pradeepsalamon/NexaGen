/**
 * Terminal chat with the supervisor.
 *
 *   npm run agent -- chat                 continue the most recent conversation
 *   npm run agent -- chat --new           start a fresh one
 *   npm run agent -- chat --thread <id>   resume a specific one
 *   npm run agent -- chat --once "..."    one message, print the reply, exit
 *
 * This exists so the chat layer is usable before the web UI is, and so it stays
 * testable without a browser.
 */
import * as readline from "readline";
import type { AgentName } from "../types";
import { listThreads, readThread } from "./thread";
import type { SendOptions } from "./supervisor";
import { sendMessage } from "./supervisor";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const OFF = "\x1b[0m";

function renderReply(content: string, actions: string[] | undefined, error: string | null | undefined): void {
  console.log(`\n${error ? RED : CYAN}${BOLD}supervisor${OFF}`);
  console.log(content);
  if (actions?.length) {
    console.log(`${DIM}  ran: ${actions.join("  |  ")}${OFF}`);
  }
  console.log();
}

/** One message, no REPL. Used by scripts and by `--once`. */
export function chatOnce(threadId: string | null, message: string, opts: SendOptions = {}): void {
  const { thread, reply } = sendMessage(threadId, message, opts);
  renderReply(reply.content, reply.actions, reply.error);
  console.log(`${DIM}thread ${thread.thread_id}  (${thread.agent}${thread.model ? `/${thread.model}` : ""})${OFF}`);
}

export interface ChatOptions {
  threadId?: string;
  fresh?: boolean;
  once?: string;
  /** Hand this conversation to a different CLI. */
  agent?: AgentName;
  model?: string;
}

export function chat(opts: ChatOptions = {}): void {
  let threadId: string | null = null;

  if (opts.threadId) {
    threadId = readThread(opts.threadId).thread_id;
  } else if (!opts.fresh) {
    threadId = listThreads()[0]?.thread_id ?? null;
  }

  const switchTo: SendOptions = { agent: opts.agent, model: opts.model };
  if (opts.once) return chatOnce(threadId, opts.once, switchTo);

  if (threadId) {
    const thread = readThread(threadId);
    console.log(`${DIM}resuming ${thread.thread_id} - ${thread.messages.length} messages${OFF}`);
    // Enough tail to remember where the conversation was, not the whole history.
    for (const m of thread.messages.slice(-4)) {
      const who = m.role === "user" ? "you" : "supervisor";
      console.log(`${DIM}${who}: ${m.content.split("\n")[0].slice(0, 100)}${OFF}`);
    }
  } else {
    console.log(`${DIM}new conversation${OFF}`);
  }
  console.log(`${DIM}Ctrl-D or "exit" to leave. Your conversation is saved.${OFF}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (): void => {
    rl.setPrompt(`${BOLD}you${OFF} > `);
    rl.prompt();
  };

  ask();
  rl.on("line", (line) => {
    const text = line.trim();
    if (!text) {
      ask();
      return;
    }
    if (text === "exit" || text === "quit") return rl.close();

    process.stdout.write(`${DIM}thinking...${OFF}\r`);
    try {
      const { thread, reply } = sendMessage(threadId, text, threadId ? {} : switchTo);
      threadId = thread.thread_id;
      process.stdout.write(" ".repeat(20) + "\r");
      renderReply(reply.content, reply.actions, reply.error);
    } catch (err) {
      process.stdout.write(" ".repeat(20) + "\r");
      console.error(`${RED}${(err as Error).message}${OFF}\n`);
    }
    ask();
  });

  rl.on("close", () => {
    if (threadId) console.log(`\n${DIM}saved as ${threadId}${OFF}`);
    process.exit(0);
  });
}

export function listChats(): void {
  const threads = listThreads();
  if (!threads.length) return console.log("no conversations yet");
  for (const t of threads) {
    const who = `${t.agent}${t.model ? `/${t.model}` : ""}`;
    console.log(`${t.thread_id}  ${String(t.messages.length).padStart(3)} msgs  ${who.padEnd(28)} ${t.title}`);
  }
}
