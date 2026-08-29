"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useLiveClassChat } from "../../providers/ChatProvider";
import { ChatMessage } from "./chat/ChatMessage";
import { ChatEmptyState } from "./chat/ChatEmptyState";
import { ChatComposer } from "./chat/ChatComposer";

export function MeetingChat() {
  const { send, chatMessages, isSending, draft, setDraft } = useLiveClassChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    setIsScrolledUp(!isNearBottom);
  }, []);

  useEffect(() => {
    if (!isScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isScrolledUp]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsScrolledUp(false);
  }, []);

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

  const messages = chatMessages;

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-app-border/40 px-4 bg-app-surface/60 backdrop-blur-md">
        <div className="flex-1 min-w-0 mr-2">
          <span className="text-xs font-bold text-app-text uppercase tracking-wider opacity-80">
            {messages.length} messages
          </span>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto overscroll-contain px-4 py-4 custom-scrollbar bg-gradient-to-b from-transparent to-app-surface/20"
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
            <div ref={messagesEndRef} className="h-2" />
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
              className="sticky bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-primary/95 text-white px-4 py-2 shadow-xl shadow-primary/20 text-xs font-semibold hover:bg-primary transition-colors z-20 backdrop-blur-md"
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
        isSending={isSending}
        onDraftChange={setDraft}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
