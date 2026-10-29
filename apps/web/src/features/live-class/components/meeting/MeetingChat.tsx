"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Lock } from "lucide-react";
import { ROOM_THREAD, useLiveClassChat } from "../../providers/ChatProvider";
import { ChatMessage } from "./chat/ChatMessage";
import { ChatEmptyState } from "./chat/ChatEmptyState";
import { ChatComposer } from "./chat/ChatComposer";
import { ChatThreadBar } from "./chat/ChatThreadBar";
import { PanelHeader } from "./PanelHeader";

export function MeetingChat() {
  const {
    activeThread,
    chatEnabled,
    draft,
    isSending,
    send,
    setDraft,
    threadMessages,
    threads,
  } = useLiveClassChat();

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
        <div className="flex shrink-0 items-center gap-2 border-b border-app-border/40 bg-secondary/10 px-4 py-2 text-[11px] font-semibold text-app-text">
          <Lock className="size-3.5 shrink-0 text-app-text/70" />
          <span className="min-w-0 truncate">
            Private — only you and {threadLabel} can see this.
          </span>
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
            <div className="flex items-center justify-center my-4 opacity-70">
              <div className="h-px flex-1 bg-app-border/50" />
              <span className="px-3 text-[10px] font-bold text-app-muted uppercase tracking-wider">
                Today
              </span>
              <div className="h-px flex-1 bg-app-border/50" />
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
              initial={{ opacity: 0, y: 15, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.9 }}
              onClick={scrollToBottom}
              className="sticky bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-primary/95 text-on-primary px-4 py-2 shadow-lift shadow-primary/20 text-xs font-semibold hover:bg-primary transition-colors z-20 backdrop-blur-md"
              type="button"
            >
              <ChevronDown className="size-4" />
              New Messages
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
              ? `Message ${threadLabel} privately...`
              : "Message room..."
            : "Chat is turned off for this class"
        }
        onDraftChange={setDraft}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
