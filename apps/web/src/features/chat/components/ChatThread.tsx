"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessageDto } from "@nexa-chess/types";
import { AlertCircle, ArrowLeft, Loader2, RotateCw, SendHorizontal, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/providers/ToastProvider";
import { listMessages } from "../api/chatApi";
import { useConversation, useLatestMessages, useMarkConversationRead, useSendMessage } from "../hooks/useChat";
import { CHAT_TYPE_LABELS, chatDayLabel, newChatClientId } from "../lib/chatFormat";
import { ChatMembersDialog } from "./ChatMembersDialog";
import { ConversationAvatar } from "./ConversationList";

type Pending = { body: string; clientId: string; failed: boolean };

type Props = {
  conversationId: string;
  onBack: () => void;
  /** Pre-fills the composer once (e.g. a question carried over from the help centre). */
  initialDraft?: string;
};

export function ChatThread({ conversationId, onBack, initialDraft }: Props) {
  const toast = useToast();
  const timeZone = useUserTimeZone();
  const meId = useAuthStore((s) => s.user?.id);
  const conversation = useConversation(conversationId);
  const latest = useLatestMessages(conversationId);
  const send = useSendMessage(conversationId);
  const markRead = useMarkConversationRead();

  const [knownMessages, setKnownMessages] = useState<Map<string, ChatMessageDto>>(new Map());
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const initialDraftRef = useRef(initialDraft);
  const [membersOpen, setMembersOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // A different thread starts clean.
  useEffect(() => {
    setKnownMessages(new Map());
    setOlderCursor(undefined);
    setPending([]);
    setDraft(initialDraftRef.current ?? "");
    initialDraftRef.current = undefined;
    stickToBottom.current = true;
  }, [conversationId]);

  // Retain messages across polling updates so older messages are not discarded.
  useEffect(() => {
    if (!latest.data?.messages?.length) return;
    setKnownMessages((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const m of latest.data.messages) {
        if (!next.has(m.id)) {
          next.set(m.id, m);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [latest.data?.messages]);

  const messages = useMemo(() => {
    return [...knownMessages.values()].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    );
  }, [knownMessages]);

  // An optimistic bubble disappears once the stored copy (same clientId) shows up.
  const deliveredClientIds = useMemo(
    () => new Set(messages.map((m) => m.clientId).filter((id): id is string => !!id)),
    [messages],
  );
  const shownPending = pending.filter((p) => !deliveredClientIds.has(p.clientId));

  const cursor = olderCursor === undefined ? (latest.data?.nextBefore ?? null) : olderCursor;

  const loadOlder = useCallback(async () => {
    if (!cursor) return;
    const el = scrollRef.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    setLoadingOlder(true);
    stickToBottom.current = false;
    try {
      const page = await listMessages(conversationId, cursor);
      setOlderCursor(page.nextBefore);
      setKnownMessages((prev) => {
        const next = new Map(prev);
        for (const m of page.messages) next.set(m.id, m);
        return next;
      });
      // Keep the reader's place instead of jumping to the new top.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - fromBottom;
      });
    } catch {
      toast.error({ title: "Could not load older messages" });
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, cursor, toast]);

  // Follow new messages only while the reader is already at the bottom.
  const newestId = messages[messages.length - 1]?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [newestId, shownPending.length]);

  // Mark read whenever a new message lands in an open, visible thread.
  const unreadCount = conversation.data?.unreadCount ?? 0;
  const lastMarked = useRef<string | null>(null);
  const { mutate: markReadMutate } = markRead;
  useEffect(() => {
    if (!newestId || lastMarked.current === `${conversationId}:${newestId}`) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    lastMarked.current = `${conversationId}:${newestId}`;
    markReadMutate(conversationId);
  }, [conversationId, newestId, unreadCount, markReadMutate]);

  const submit = (body: string, clientId = newChatClientId()) => {
    const text = body.trim();
    if (!text) return;
    stickToBottom.current = true;
    setPending((prev) => [...prev.filter((p) => p.clientId !== clientId), { body: text, clientId, failed: false }]);
    send.mutate(
      { body: text, clientId },
      {
        onError: () => {
          setPending((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, failed: true } : p)));
          toast.error({
            title: "Failed to send message",
            message: "Check your connection and tap retry."
          });
        },
        onSuccess: () => setPending((prev) => prev.filter((p) => p.clientId !== clientId)),
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
      setDraft("");
    }
  };

  if (conversation.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <WidgetError message="This conversation could not be opened." onRetry={() => void conversation.refetch()} />
      </div>
    );
  }

  const detail = conversation.data;
  const canSend = detail?.canSend ?? false;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-app-border px-3 py-2.5">
        <SimpleTooltip label="Back to conversations">
          <Button aria-label="Back to conversations" className="md:hidden" onClick={onBack} size="icon" variant="ghost">
            <ArrowLeft className="size-5" />
          </Button>
        </SimpleTooltip>
        {detail ? <ConversationAvatar conversation={detail} /> : <Skeleton className="size-10 rounded-full" />}
        <div className="min-w-0 flex-1">
          {detail ? (
            <>
              <h2 className="truncate text-sm font-bold text-app-text">{detail.title}</h2>
              <p className="flex items-center gap-2 text-xs text-app-muted">
                <Badge className="px-1.5 py-0 text-[10px]" variant="secondary">
                  {CHAT_TYPE_LABELS[detail.type]}
                </Badge>
                {detail.type === "DIRECT"
                  ? detail.counterpart?.role.replace("_", " ").toLowerCase()
                  : `${detail.memberCount} member${detail.memberCount === 1 ? "" : "s"}`}
              </p>
            </>
          ) : (
            <Skeleton className="h-4 w-40" />
          )}
        </div>
        {detail && detail.type !== "DIRECT" && (
          <SimpleTooltip label="Members">
            <Button aria-label="Members" onClick={() => setMembersOpen(true)} size="icon" variant="ghost">
              <Users className="size-5" />
            </Button>
          </SimpleTooltip>
        )}
      </header>

      <div
        className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-app-background/40 px-3 py-4 sm:px-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {cursor && (
          <div className="flex justify-center pb-2">
            <Button disabled={loadingOlder} onClick={() => void loadOlder()} size="sm" variant="outline">
              {loadingOlder && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Load earlier messages
            </Button>
          </div>
        )}
        {latest.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton className={cn("h-10 w-2/3 rounded-app", i % 2 && "ml-auto")} key={i} />
            ))}
          </div>
        )}
        {!latest.isLoading && messages.length === 0 && shownPending.length === 0 && (
          <p className="py-10 text-center text-sm text-app-muted">No messages yet. Say hello!</p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const day = chatDayLabel(m.createdAt, timeZone);
          const showDay = !prev || chatDayLabel(prev.createdAt, timeZone) !== day;
          const mine = !!meId && m.sender?.id === meId;
          const showName = !mine && detail?.type !== "DIRECT" && (showDay || prev?.sender?.id !== m.sender?.id);
          return (
            <Fragment key={m.id}>
              {showDay && (
                <div className="flex justify-center py-2">
                  <span className="rounded-full bg-app-soft px-3 py-0.5 text-[11px] font-semibold text-app-muted">{day}</span>
                </div>
              )}
              <Bubble
                body={m.body}
                mine={mine}
                name={showName ? (m.sender?.name ?? "Former member") : null}
                time={formatTime(m.createdAt, timeZone)}
              />
            </Fragment>
          );
        })}
        {shownPending.map((p) => (
          <Bubble
            body={p.body}
            key={p.clientId}
            mine
            name={null}
            status={
              p.failed ? (
                <button
                  className="inline-flex items-center gap-1 font-semibold text-app-danger-ink hover:underline"
                  onClick={() => submit(p.body, p.clientId)}
                  type="button"
                >
                  <AlertCircle className="size-3" /> Not sent · Retry <RotateCw className="size-3" />
                </button>
              ) : (
                "Sending…"
              )
            }
          />
        ))}
      </div>

      <div className="border-t border-app-border p-3">
        {detail && !canSend ? (
          <p className="rounded-control bg-app-soft px-3 py-2 text-center text-sm text-app-muted">
            You can read this conversation but can no longer send messages in it.
          </p>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
              setDraft("");
            }}
          >
            <Textarea
              aria-label="Message"
              className="max-h-40 min-h-[44px] flex-1 resize-none"
              disabled={!detail}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Write a message…"
              rows={1}
              value={draft}
            />
            <SimpleTooltip label="Send (Enter)">
              <Button aria-label="Send message" className="rounded-full" disabled={!draft.trim() || !detail} size="icon" type="submit">
                <SendHorizontal className="size-5" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          </form>
        )}
      </div>

      {detail && detail.type !== "DIRECT" && (
        <ChatMembersDialog conversation={detail} onOpenChange={setMembersOpen} open={membersOpen} />
      )}
    </div>
  );
}

function Bubble({
  body,
  mine,
  name,
  status,
  time,
}: {
  body: string;
  mine: boolean;
  name: string | null;
  status?: ReactNode;
  time?: string;
}) {
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start", name && "pt-2")}>
      {name && <span className="mb-0.5 px-1 text-[11px] font-semibold text-app-muted">{name}</span>}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-app px-3 py-2 text-sm sm:max-w-[70%]",
          mine ? "rounded-br-md bg-primary text-white" : "rounded-bl-md border border-app-border bg-app-surface text-app-text",
        )}
      >
        {body}
      </div>
      <span className="mt-0.5 px-1 text-[10px] text-app-muted">{status ?? time}</span>
    </div>
  );
}
