"use client";

/**
 * The supervisor chat -- the primary surface of the control UI.
 *
 * This deliberately replaced the task list as the home screen. The task list is
 * still there under /tasks, but it is a view, not an input. The only input that
 * should create work is a conversation, because the supervisor is the thing
 * that can tell a question from a work request. Typing into a bare "new task"
 * box is how a plain "hi" once became a git branch and a merge.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUp, Bot, MessagesSquare, Plus, Terminal, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
  actions?: string[];
  task_ids?: string[];
  error?: string | null;
}

interface ThreadSummary {
  thread_id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

const STORAGE_KEY = "nexa-agent-thread";

/**
 * Minimal markdown: the supervisor writes bold, inline code, fenced blocks and
 * dashed lists, and nothing else worth pulling a parser in for.
 */
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-app-bg/70 px-1 py-0.5 font-mono text-[0.8em] text-app-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-app-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <pre
          key={`code-${i}`}
          className="my-2 overflow-x-auto rounded-lg border border-app-border bg-app-bg p-3 font-mono text-xs leading-relaxed"
        >
          {code.join("\n")}
        </pre>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      blocks.push(
        <div key={`li-${i}`} className="flex gap-2 py-0.5 pl-1">
          <span className="text-app-text-muted">•</span>
          <span>{renderInline(line.replace(/^\s*[-*]\s+/, ""), `li-${i}`)}</span>
        </div>,
      );
      continue;
    }

    if (line.trim() === "") {
      blocks.push(<div key={`sp-${i}`} className="h-2" />);
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="py-0.5">
        {renderInline(line, `p-${i}`)}
      </p>,
    );
  }

  return <div className="text-sm leading-relaxed">{blocks}</div>;
}

export default function ChatPage() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showThreads, setShowThreads] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/${id}`);
    if (!res.ok) {
      localStorage.removeItem(STORAGE_KEY);
      setThreadId(null);
      return;
    }
    const data = await res.json();
    setThreadId(data.thread_id);
    setMessages(data.messages ?? []);
  }, []);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/chat");
    if (res.ok) setThreads(await res.json());
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) void loadThread(saved);
    void loadThreads();
  }, [loadThread, loadThreads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;

    setInput("");
    setError(null);
    // Optimistic: the reply can take a minute, and an empty screen in the
    // meantime reads as "it didn't send".
    setMessages((prev) => [...prev, { role: "user", content: text, at: new Date().toISOString() }]);
    setPending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, thread_id: threadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);

      setThreadId(data.thread_id);
      localStorage.setItem(STORAGE_KEY, data.thread_id);
      setMessages((prev) => [...prev, data.reply]);
      void loadThreads();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  function startNew() {
    localStorage.removeItem(STORAGE_KEY);
    setThreadId(null);
    setMessages([]);
    setShowThreads(false);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Supervisor</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous conversations"
            onClick={() => {
              setShowThreads((v) => !v);
              void loadThreads();
            }}
            className="rounded-full border border-app-border p-2 text-app-text-muted transition-colors hover:bg-app-surface-hover hover:text-app-text"
          >
            <MessagesSquare className="size-4" />
          </button>
          <button
            type="button"
            aria-label="New conversation"
            onClick={startNew}
            className="rounded-full border border-app-border p-2 text-app-text-muted transition-colors hover:bg-app-surface-hover hover:text-app-text"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {showThreads && (
        <div className="mb-3 overflow-hidden rounded-xl border border-app-border bg-app-surface">
          {threads.length === 0 && <p className="p-3 text-sm text-app-text-muted">No conversations yet.</p>}
          {threads.map((t) => (
            <button
              key={t.thread_id}
              type="button"
              onClick={() => {
                localStorage.setItem(STORAGE_KEY, t.thread_id);
                void loadThread(t.thread_id);
                setShowThreads(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 border-b border-app-border p-3 text-left last:border-b-0 transition-colors hover:bg-app-surface-hover",
                t.thread_id === threadId && "bg-app-surface-hover",
              )}
            >
              <span className="truncate text-sm">{t.title}</span>
              <span className="shrink-0 text-xs text-app-text-muted">{t.message_count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 pb-2">
        {messages.length === 0 && !pending && (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <Bot className="size-10 text-app-primary" />
            <p className="text-sm text-app-text-muted">
              Ask what is running, or describe what you want built.
              <br />
              I will propose a plan before anything is started.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={`${m.at}-${i}`} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full",
                m.role === "user" ? "bg-app-surface-hover" : "bg-app-primary/15",
              )}
            >
              {m.role === "user" ? (
                <User className="size-4 text-app-text-muted" />
              ) : (
                <Bot className="size-4 text-app-primary" />
              )}
            </div>

            <div
              className={cn(
                "max-w-[85%] rounded-2xl border px-3 py-2",
                m.role === "user"
                  ? "border-app-primary/20 bg-app-primary/10"
                  : m.error
                    ? "border-app-error/30 bg-app-error/5"
                    : "border-app-border bg-app-surface",
              )}
            >
              {m.error && (
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-app-error">
                  <AlertTriangle className="size-3.5" />
                  turn interrupted
                </div>
              )}

              <Markdown text={m.content} />

              {/* What it actually ran, not what it said it ran. */}
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-app-border pt-2">
                  {m.actions.map((a, j) => (
                    <div key={j} className="flex items-start gap-1.5 text-[11px] text-app-text-muted">
                      <Terminal className="mt-0.5 size-3 shrink-0" />
                      <code className="break-all font-mono">{a}</code>
                    </div>
                  ))}
                </div>
              )}

              {m.task_ids && m.task_ids.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.task_ids.map((id) => (
                    <Link
                      key={id}
                      href={`/task/${id}`}
                      className="rounded-full border border-app-primary/30 bg-app-primary/10 px-2 py-0.5 text-[11px] text-app-primary transition-colors hover:bg-app-primary/20"
                    >
                      {id.replace(/^task_\d{4}-\d{2}-\d{2}_/, "")}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-app-primary/15">
              <Bot className="size-4 animate-pulse text-app-primary" />
            </div>
            <div className="rounded-2xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text-muted">
              Thinking — it may be reading the repo or checking task state.
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-app-error/30 bg-app-error/5 p-2 text-xs text-app-error">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-20 z-10 flex items-end gap-2 rounded-2xl border border-app-border bg-app-surface p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Ask, or describe what to build…"
          disabled={pending}
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-app-text-muted disabled:opacity-50"
        />
        <button
          type="button"
          aria-label="Send"
          onClick={() => void send()}
          disabled={pending || !input.trim()}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-app-primary text-white transition-opacity disabled:opacity-30"
        >
          <ArrowUp className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
