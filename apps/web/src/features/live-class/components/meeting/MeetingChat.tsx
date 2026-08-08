"use client";

import { useRef, useEffect, useState, useMemo, memo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquareText,
  Send,
  Smile,
  Copy,
  Reply,
  ChevronDown
} from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import { toast } from "sonner";
import { useLiveClassChat, type ChatMessageData } from "../../providers/ChatProvider";
import { cn } from "@/lib/utils";
import { ParticipantAvatar } from "./ParticipantAvatar";

// ─── Chat Message ────────────────────────────────────────────

const ChatMessage = memo(function ChatMessage({
  msg,
  showHeader,
}: {
  msg: ChatMessageData;
  showHeader: boolean;
}) {
  const time = useMemo(
    () =>
      msg.timestamp.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [msg.timestamp],
  );

  const { setDraft } = useLiveClassChat();

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.message);
    toast.success("Message copied!");
  }, [msg.message]);

  const handleReply = useCallback(() => {
    setDraft((prev: string) => {
      const cleanMessage = msg.message
        .split("\n")
        .filter((line) => !line.trim().startsWith(">"))
        .join("\n")
        .trim();

      const quotedMessage = cleanMessage
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");

      const prefix = prev ? prev + "\n" : "";
      return prefix + `${quotedMessage}\n@${msg.senderName} `;
    });
    setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Message room..."]')?.focus();
    }, 10);
  }, [msg.message, msg.senderName, setDraft]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "group flex gap-2.5 w-full relative",
        showHeader ? "mt-4 first:mt-0" : "mt-1",
        msg.isOwn ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar column */}
      {!msg.isOwn && (
        <div className="w-8 shrink-0 flex justify-center">
          {showHeader && (
            <ParticipantAvatar
              name={msg.senderName}
              size="sm"
              className="size-8 text-[10px] shadow-sm ring-1 ring-black/5 dark:ring-white/10"
            />
          )}
        </div>
      )}

      {/* Content */}
      <div className={cn("min-w-0 flex flex-col max-w-[75%]", msg.isOwn ? "items-end" : "items-start")}>
        {showHeader && !msg.isOwn && (
          <div className="mb-1 flex items-baseline gap-1.5 pl-1">
            <span className="text-xs font-semibold text-app-text/90">
              {msg.senderName}
            </span>
            {msg.senderRole && msg.senderRole.toUpperCase() === "COACH" && (
              <span className="text-[10px] font-normal text-app-muted">
                (Coach)
              </span>
            )}
          </div>
        )}

        <div
          className={cn(
            "relative group/bubble flex items-center gap-2",
            msg.isOwn ? "flex-row-reverse" : "flex-row",
          )}
        >
          {/* Message Bubble */}
          <div
            className={cn(
              "px-3.5 py-2.5 text-sm leading-relaxed [word-break:break-word] shadow-sm transition-all duration-200",
              msg.isOwn
                ? "bg-primary text-white rounded-2xl rounded-tr-sm"
                : "bg-app-surface border border-app-border text-app-text rounded-2xl rounded-tl-sm dark:bg-app-soft/50",
            )}
          >
            {msg.message.split("\n").map((line, lineIndex) => {
              const isQuote = line.trim().startsWith(">");
              const textContent = isQuote ? line.trim().substring(1).trim() : line;
              
              // Only render link parsing for normal lines (simplifies the logic)
              const renderTextWithLinks = (text: string) => {
                return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
                  if (part.match(/(https?:\/\/[^\s]+)/g)) {
                    return (
                      <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:opacity-80 transition-opacity break-all"
                      >
                        {part}
                      </a>
                    );
                  }
                  return part;
                });
              };

              return (
                <div
                  key={lineIndex}
                  className={cn(
                    isQuote && "my-1 border-l-2 border-current pl-2.5 opacity-75 text-[13px] italic bg-black/5 dark:bg-white/5 py-1 rounded-r-md",
                  )}
                >
                  {renderTextWithLinks(textContent)}
                </div>
              );
            })}
          </div>

          {/* Hover Actions */}
          <div
            className={cn(
              "opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-center gap-1",
              msg.isOwn ? "pr-2" : "pl-2",
            )}
          >
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-1.5 text-app-muted hover:text-app-text hover:bg-app-soft rounded-md transition-colors"
                    type="button"
                    onClick={handleReply}
                  >
                    <Reply className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Reply</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-1.5 text-app-muted hover:text-app-text hover:bg-app-soft rounded-md transition-colors"
                    type="button"
                    onClick={handleCopy}
                  >
                    <Copy className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Timestamp */}
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 text-[10px] font-medium text-app-muted/60",
            msg.isOwn ? "pr-1" : "pl-1",
          )}
        >
          <span>{time}</span>
        </div>
      </div>
    </motion.div>
  );
});

// ─── Empty State ─────────────────────────────────────────────

function ChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center pb-12">
      <div className="mb-6 relative">
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
        <div className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 shadow-sm backdrop-blur-xl">
          <MessageSquareText className="size-10 text-primary" strokeWidth={1.5} />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-app-text mb-2 tracking-tight">
        Welcome to Room Chat
      </h3>
      <p className="text-sm text-app-muted leading-relaxed max-w-[240px]">
        Share ideas, ask questions, or help your classmates. Start the conversation!
      </p>
    </div>
  );
}

// ─── Chat Panel Content ──────────────────────────────────────

export function MeetingChat() {
  const { send, chatMessages, isSending, draft, setDraft } = useLiveClassChat();


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll logic
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // Auto-resize textarea
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    adjustTextarea();
  }, [draft, adjustTextarea]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!draft.trim() || isSending) return;
      try {
        await send(draft);
        setDraft("");
        scrollToBottom();
      } catch (err) {
        console.error("Failed to send message", err);
      }
    },
    [draft, isSending, send, scrollToBottom, setDraft],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as React.FormEvent);
      }
    },
    [handleSubmit],
  );



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
      <div className="shrink-0 border-t border-app-border/40 bg-app-surface/90 backdrop-blur-xl p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <form
          onSubmit={handleSubmit}
          className={cn(
            "flex items-end gap-2 rounded-full border bg-app-background px-3 py-1.5 transition-all duration-200 shadow-sm",
            draft.trim() || isSending
              ? "border-primary/40 ring-2 ring-primary/5 shadow-primary/5"
              : "border-app-border/60 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/5 hover:border-app-border",
          )}
        >


          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message room..."
            className="max-h-[120px] min-h-[20px] w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-app-text outline-none placeholder:text-app-muted/70 custom-scrollbar font-medium"
            rows={1}
          />

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="shrink-0 p-1 text-app-muted hover:text-primary transition-colors rounded-lg hover:bg-primary/10 group relative"
                title="Add emoji"
              >
                <Smile className="size-5 transition-transform group-hover:scale-110" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="p-0 border-none shadow-xl w-auto">
              <EmojiPicker
                onEmojiClick={(emojiData) => {
                  setDraft(draft + emojiData.emoji);
                  textareaRef.current?.focus();
                }}
                theme={Theme.AUTO}
                lazyLoadEmojis={true}
              />
            </PopoverContent>
          </Popover>

          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full transition-all duration-300",
              draft.trim()
                ? "bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary/90 hover:scale-105 active:scale-95"
                : "bg-app-border/40 text-app-muted/50 cursor-not-allowed",
            )}
          >
            <Send className="size-3.5 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
