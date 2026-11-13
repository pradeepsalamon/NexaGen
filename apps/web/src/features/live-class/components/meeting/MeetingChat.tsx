"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Lock } from "lucide-react";
import { ROOM_THREAD, useChatDraft, useLiveClassChat } from "../../providers/ChatProvider";
import { ChatMessage } from "./chat/ChatMessage";
import { ChatEmptyState } from "./chat/ChatEmptyState";
import { ChatComposer } from "./chat/ChatComposer";
import { ChatThreadBar } from "./chat/ChatThreadBar";
import { PanelHeader } from "./PanelHeader";

export function MeetingChat() {
  const {
    activeThread,
    chatEnabled,
    isSending,
    send,
    setDraft,
    threadMessages,
    threads,
  } = useLiveClassChat();
  const draft = useChatDraft();

  const isPrivate = activeThread !== ROOM_THREAD;
  const threadLabel = threads.find((t) => t.id === activeThread)?.label ?? "Everyone";

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    setIsScrolledUp(!isNearBottom);
  }, []);

  // Scroll the message list only — scrollIntoView also scrolls every
  // ancestor, which jolted the whole classroom on each new message.
  const scrollListToEnd = useCallback(() => {
    const el = scrollContainerRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!isScrolledUp) scrollListToEnd();
  }, [threadMessages, isScrolledUp, scrollListToEnd]);

  const scrollToBottom = useCallback(() => {
    scrollListToEnd();
    setIsScrolledUp(false);
  }, [scrollListToEnd]);

  const handleSubmit = useCallback(async () => {
    if (!draft.trim() || isSending) return;
    try {
      await send(draft);
      setDraft("");
      scrollToBottom();
    } catch (err) {
      console.error("Failed to send message", err);
    }
  }, [draft, isSending, send, scrollToBottom, setDraft]);

  const messages = threadMessages;

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Chat" count={messages.length} />

      <ChatThreadBar />

      {isPrivate && (
        <div className="flex shrink-0 items-center gap-2 border-b border-app-border bg-info-soft px-4 py-2 text-xs font-medium text-info-ink" role="note">
          <Lock aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2} />
          <span className="min-w-0">Private: only you and {threadLabel} can see these messages.</span>
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="custom-scrollbar relative flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {messages.length === 0 ? (
          <ChatEmptyState />
        ) : (
          <div className="flex flex-col pb-4">
            <div className="my-3 flex items-center justify-center" role="separator" aria-label="Today">
              <div className="h-px flex-1 bg-app-border" />
              <span className="px-3 text-xs font-medium text-app-muted">Today</span>
              <div className="h-px flex-1 bg-app-border" />
            </div>

            {messages.map((msg, index) => {
              const prev = index > 0 ? messages[index - 1] : null;
              const showHeader =
                !prev || prev.senderName !== msg.senderName || prev.isOwn !== msg.isOwn;

              return <ChatMessage key={msg.id} msg={msg} showHeader={showHeader} />;
            })}
            <div className="h-2" />
          </div>
        )}

        {/* Scroll to bottom floating button */}
        <AnimatePresence>
          {isScrolledUp && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={scrollToBottom}
              className="sticky bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-xs font-semibold text-on-primary shadow-lift transition-colors hover:bg-primary-hover"
              type="button"
            >
              <ChevronDown className="size-4" />
              New messages
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Composer */}
      <ChatComposer
        draft={draft}
        disabled={!chatEnabled}
        isSending={isSending}
        placeholder={
          chatEnabled
            ? isPrivate
              ? `Message ${threadLabel} privately…`
              : "Message everyone…"
            : "Chat is turned off for this class"
        }
        onDraftChange={setDraft}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
