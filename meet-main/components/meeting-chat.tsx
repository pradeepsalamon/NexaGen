"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageSquareText, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MeetingChatProps = {
  open: boolean;
  roomId: string;
  userName: string;
  onClose: () => void;
};

type ChatMessage = {
  id: string;
  sender: string;
  body: string;
  timestamp: number;
};

const CHAT_POLL_INTERVAL_MS = 5000;

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

export function MeetingChat({
  open,
  roomId,
  userName,
  onClose,
}: MeetingChatProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const isChatOpenRef = useRef(open);
  const loadMessagesRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    isChatOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    let isMounted = true;

    async function loadMessages() {
      if (!isChatOpenRef.current) {
        return;
      }

      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      try {
        const response = await fetch(
          `/api/meeting-chat?roomId=${encodeURIComponent(roomId)}`,
          {
            cache: "no-store",
          },
        );
        const data = (await response.json()) as {
          messages?: ChatMessage[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load chat messages.");
        }

        if (isMounted) {
          setMessages(data.messages ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load chat messages.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingMessages(false);
        }
      }
    }

    loadMessagesRef.current = loadMessages;

    if (isChatOpenRef.current) {
      void loadMessages();
    }
    const intervalId = setInterval(() => {
      void loadMessages();
    }, CHAT_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      loadMessagesRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadMessagesRef.current?.();
  }, [open]);

  useEffect(() => {
    const container = messagesRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages]);

  const hasMessages = messages.length > 0;
  const panelClasses =
    "flex h-full min-h-[24rem] flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-card/85 shadow-xl shadow-black/10 backdrop-blur";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextMessage = draft.trim();

    if (!nextMessage || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/meeting-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId,
          sender: userName,
          message: nextMessage,
        }),
      });

      const data = (await response.json()) as {
        message?: ChatMessage;
        error?: string;
      };

      if (!response.ok || !data.message) {
        throw new Error(data.error ?? "Failed to send chat message.");
      }

      setMessages((current) => {
        if (current.some((message) => message.id === data.message?.id)) {
          return current;
        }

        return [...current, data.message];
      });
      setDraft("");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send chat message.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <aside
        className={cn(
          panelClasses,
          open ? "hidden xl:flex" : "hidden",
        )}
      >
        <ChatPanelContent
          roomId={roomId}
          draft={draft}
          isSending={isSending}
          isLoadingMessages={isLoadingMessages}
          hasMessages={hasMessages}
          messagesRef={messagesRef}
          messages={messages}
          error={error}
          currentUser={userName}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
          onClose={onClose}
          showCloseButton={false}
        />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/78 p-4 backdrop-blur-sm xl:hidden">
          <div className={cn(panelClasses, "mx-auto h-full max-w-md")}>
            <ChatPanelContent
              roomId={roomId}
              draft={draft}
              isSending={isSending}
              isLoadingMessages={isLoadingMessages}
              hasMessages={hasMessages}
              messagesRef={messagesRef}
              messages={messages}
              error={error}
              currentUser={userName}
              onDraftChange={setDraft}
              onSubmit={handleSubmit}
              onClose={onClose}
              showCloseButton
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function ChatPanelContent({
  roomId,
  draft,
  isSending,
  isLoadingMessages,
  hasMessages,
  messagesRef,
  messages,
  error,
  currentUser,
  onDraftChange,
  onSubmit,
  onClose,
  showCloseButton,
}: {
  roomId: string;
  draft: string;
  isSending: boolean;
  isLoadingMessages: boolean;
  hasMessages: boolean;
  messagesRef: React.RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  error: string | null;
  currentUser: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onClose: () => void;
  showCloseButton: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <MessageSquareText className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">Room chat</p>
            <h2 className="text-base font-semibold tracking-tight">{roomId}</h2>
          </div>
        </div>

        {showCloseButton ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={onClose}
            aria-label="Close chat"
          >
            <X className="size-5" />
          </Button>
        ) : null}
      </div>

      <div ref={messagesRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isLoadingMessages && !hasMessages ? (
          <div className="flex h-full min-h-[16rem] items-center justify-center">
            <LoaderCircle className="size-8 animate-spin text-primary" />
          </div>
        ) : hasMessages ? (
          messages.map((message) => {
            const isOwnMessage =
              message.sender.trim().toLowerCase() ===
              currentUser.trim().toLowerCase();

            return (
              <article
                key={message.id}
                className={cn(
                  "max-w-[88%] rounded-[1.4rem] border px-4 py-3 shadow-sm",
                  isOwnMessage
                    ? "ml-auto border-primary/20 bg-primary/10 text-foreground"
                    : "border-border/70 bg-background/80 text-foreground",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{message.sender}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {message.body}
                </p>
              </article>
            );
          })
        ) : (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border/70 bg-background/45 px-6 text-center">
            <MessageSquareText className="size-8 text-primary" />
            <p className="mt-4 text-base font-semibold">Start the conversation</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Messages stay inside this room while this app server is running.
            </p>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-border/70 p-4">
        <label htmlFor="meeting-chat-input" className="sr-only">
          Type a chat message
        </label>
        <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-3 shadow-inner shadow-slate-950/5">
          <textarea
            id="meeting-chat-input"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Type a message and press send..."
            rows={3}
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const form = event.currentTarget.form;
                form?.requestSubmit();
              }
            }}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-h-5 text-xs text-muted-foreground">
              {error ?? "Enter to send, Shift + Enter for a new line."}
            </div>
            <Button
              type="submit"
              className="rounded-xl px-4"
              disabled={!draft.trim() || isSending}
            >
              {isSending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
