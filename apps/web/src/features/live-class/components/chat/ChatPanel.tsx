"use client";

import { useRef, useEffect, useState, useMemo, memo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquareText, Send, X, MoreHorizontal, Copy, Reply, Search, ExternalLink, Paperclip, Smile } from "lucide-react";
import { useChat } from "@livekit/components-react";
import { cn } from "@/lib/utils";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { ParticipantAvatar } from "../meeting/ParticipantAvatar";

// ─── Chat Message ────────────────────────────────────────

interface ChatMessageData {
  id: number;
  senderName: string;
  message: string;
  isOwn: boolean;
  timestamp: Date;
}

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
    [msg.timestamp]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "group flex gap-2.5 w-full relative",
        showHeader ? "mt-4 first:mt-0" : "mt-1",
        msg.isOwn ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar column */}
      <div className="w-8 shrink-0 flex justify-center">
        {showHeader && !msg.isOwn && (
          <ParticipantAvatar name={msg.senderName} size="sm" className="size-8 text-[10px] shadow-sm ring-1 ring-black/5 dark:ring-white/10" />
        )}
      </div>

      {/* Content */}
      <div className={cn("min-w-0 flex flex-col max-w-[75%]", msg.isOwn ? "items-end" : "items-start")}>
        {showHeader && !msg.isOwn && (
          <div className="mb-1 flex items-baseline gap-2 pl-1">
            <span className="text-xs font-semibold text-app-text/90">
              {msg.senderName}
            </span>
          </div>
        )}
        
        <div className={cn(
          "relative group/bubble flex items-center gap-2",
          msg.isOwn ? "flex-row-reverse" : "flex-row"
        )}>
          {/* Message Bubble */}
          <div className={cn(
            "px-3.5 py-2.5 text-sm leading-relaxed [word-break:break-word] shadow-sm transition-all duration-200",
            msg.isOwn 
              ? "bg-primary text-white rounded-2xl rounded-tr-sm" 
              : "bg-app-surface border border-app-border text-app-text rounded-2xl rounded-tl-sm dark:bg-app-soft/50"
          )}>
            {msg.message.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
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
            })}
          </div>

          {/* Hover Actions */}
          <div className={cn(
            "opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-center gap-1",
            msg.isOwn ? "pr-2" : "pl-2"
          )}>
            <button className="p-1.5 text-app-muted hover:text-app-text hover:bg-app-soft rounded-md transition-colors" title="Reply">
              <Reply className="size-3.5" />
            </button>
            <button className="p-1.5 text-app-muted hover:text-app-text hover:bg-app-soft rounded-md transition-colors" title="Copy">
              <Copy className="size-3.5" />
            </button>
            <button className="p-1.5 text-app-muted hover:text-app-text hover:bg-app-soft rounded-md transition-colors" title="More">
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Timestamp */}
        <div className={cn(
          "mt-1 flex items-center gap-1.5 text-[10px] font-medium text-app-muted/60",
          msg.isOwn ? "pr-1" : "pl-1"
        )}>
          <span>{time}</span>
          {msg.isOwn && (
            <span className="text-primary/70">✓✓</span>
          )}
        </div>
      </div>
    </motion.div>
  );
});

// ─── Empty State ─────────────────────────────────────────

function ChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center pb-12">
      <div className="mb-6 relative">
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
        <div className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 shadow-sm backdrop-blur-xl">
          <MessageSquareText className="size-10 text-primary" strokeWidth={1.5} />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-app-text mb-2 tracking-tight">Welcome to Room Chat</h3>
      <p className="text-sm text-app-muted leading-relaxed max-w-[240px]">
        Share ideas, ask questions, or help your classmates. Start the conversation!
      </p>
    </div>
  );
}

// ─── Chat Panel ──────────────────────────────────────────

export function ChatPanel() {
  const { activeSidebar, setActiveSidebar } = useLiveClassState();
  const { send, chatMessages, isSending } = useChat();
  const [draft, setDraft] = useState("");
  
  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll logic
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsScrolledUp(!isNearBottom);
  }, []);

  useEffect(() => {
    if (!isScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isScrolledUp]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsScrolledUp(false);
  };

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
    [draft, isSending, send]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as React.FormEvent);
      }
    },
    [handleSubmit]
  );

  // Handle fake file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      alert("File sharing is disabled for this room.");
      e.target.value = "";
    }
  };

  // Normalize messages and filter by search
  const messages: ChatMessageData[] = useMemo(
    () => {
      let filtered = chatMessages;
      if (isSearching && searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = chatMessages.filter(msg => 
          msg.message?.toLowerCase().includes(query) || 
          msg.from?.name?.toLowerCase().includes(query)
        );
      }
      
      return filtered.map((msg, index) => ({
        id: index,
        senderName: msg.from?.name || msg.from?.identity || "Unknown",
        message: msg.message ?? "",
        isOwn: !!msg.from?.isLocal,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      }));
    },
    [chatMessages, isSearching, searchQuery]
  );

  return (
    <AnimatePresence>
      {activeSidebar === "chat" && (
        <motion.aside
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex h-full w-[380px] flex-col border-l border-white/5 bg-app-background/95 backdrop-blur-3xl shadow-[-8px_0_32px_rgba(0,0,0,0.05)] z-40 max-w-full absolute right-0 top-0 bottom-0 sm:relative"
        >
          {/* Premium Header */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-app-border/60 px-5 bg-app-surface/40 backdrop-blur-md">
            <div className="flex flex-col justify-center flex-1 min-w-0 mr-2">
              <div className="flex items-center gap-2">
                {isSearching ? (
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search messages..."
                    className="w-full bg-transparent text-sm font-medium text-app-text outline-none placeholder:text-app-muted"
                  />
                ) : (
                  <h2 className="text-sm font-bold text-app-text tracking-tight">Room Chat</h2>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button 
                onClick={() => {
                  setIsSearching(!isSearching);
                  setSearchQuery("");
                }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-app-soft",
                  isSearching ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-app-muted hover:text-app-text"
                )} 
                title="Search messages"
              >
                <Search className="size-4" />
              </button>
              <button 
                onClick={() => alert("Pop-out chat is not enabled for this session.")}
                className="flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-soft hover:text-app-text" 
                title="Pop out chat"
              >
                <ExternalLink className="size-4" />
              </button>
              <div className="w-px h-4 bg-app-border mx-1" />
              <button
                type="button"
                onClick={() => setActiveSidebar(null)}
                className="flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="relative flex-1 overflow-y-auto overscroll-contain px-4 py-4 custom-scrollbar"
          >
            {messages.length === 0 ? (
              isSearching ? (
                <div className="flex h-full items-center justify-center text-sm text-app-muted">No messages found.</div>
              ) : (
                <ChatEmptyState />
              )
            ) : (
              <div className="flex flex-col pb-4">
                {/* Date Separator Placeholder */}
                {!isSearching && (
                  <div className="flex items-center justify-center my-4">
                    <div className="h-px flex-1 bg-app-border/50" />
                    <span className="px-3 text-[10px] font-semibold text-app-muted uppercase tracking-wider">Today</span>
                    <div className="h-px flex-1 bg-app-border/50" />
                  </div>
                )}

                {messages.map((msg, index) => {
                  const prev = index > 0 ? messages[index - 1] : null;
                  const showHeader =
                    isSearching ||
                    !prev || 
                    prev.senderName !== msg.senderName ||
                    prev.isOwn !== msg.isOwn;

                  return (
                    <ChatMessage
                      key={msg.id}
                      msg={msg}
                      showHeader={showHeader}
                    />
                  );
                })}
                <div ref={messagesEndRef} className="h-1" />
              </div>
            )}

            {/* Scroll to bottom button */}
            <AnimatePresence>
              {isScrolledUp && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  onClick={scrollToBottom}
                  className="sticky bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-app-surface border border-app-border px-3 py-1.5 shadow-lg text-xs font-medium text-app-text hover:bg-app-soft transition-colors z-10"
                >
                  ↓ New Messages
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Premium Composer */}
          <div className="shrink-0 border-t border-app-border/60 bg-app-surface/80 backdrop-blur-xl p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
            <form
              onSubmit={handleSubmit}
              className={cn(
                "flex items-end gap-2 rounded-2xl border bg-app-background px-3 py-2.5 transition-all duration-200 shadow-sm",
                draft.trim() || isSending ? "border-primary/30 ring-2 ring-primary/10 shadow-primary/5" : "border-app-border focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10"
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 p-1.5 text-app-muted hover:text-app-text transition-colors rounded-lg hover:bg-app-soft mb-0.5" 
                title="Attach file"
              >
                <Paperclip className="size-5" />
              </button>
              
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="max-h-[120px] min-h-[24px] w-full resize-none bg-transparent px-1 py-1.5 text-[15px] leading-relaxed text-app-text outline-none placeholder:text-app-muted custom-scrollbar"
                rows={1}
              />
              
              <button 
                type="button" 
                onClick={() => {
                  setDraft(prev => prev + "😀");
                  textareaRef.current?.focus();
                }}
                className="shrink-0 p-1.5 text-app-muted hover:text-app-text transition-colors rounded-lg hover:bg-app-soft mb-0.5" 
                title="Add emoji"
              >
                <Smile className="size-5" />
              </button>

              <button
                type="submit"
                disabled={!draft.trim() || isSending}
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 mb-0.5",
                  draft.trim()
                    ? "bg-primary text-white shadow-md shadow-primary/20 hover:bg-primary/90 hover:scale-105 active:scale-95"
                    : "bg-app-soft text-app-muted cursor-not-allowed"
                )}
              >
                <Send className="size-4" />
              </button>
            </form>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
