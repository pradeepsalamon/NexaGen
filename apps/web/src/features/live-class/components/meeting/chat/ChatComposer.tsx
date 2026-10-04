"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { Send, Smile } from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { useTheme } from "@/providers/ThemeProvider";
import { cn } from "@/lib/utils";

interface ChatComposerProps {
  draft: string;
  /** True when the class policy has switched chat off for this user. */
  disabled?: boolean;
  isSending: boolean;
  placeholder?: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}

export const ChatComposer = memo(function ChatComposer({
  draft,
  disabled = false,
  isSending,
  placeholder = "Message room...",
  onDraftChange,
  onSubmit,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { mode } = useTheme();

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
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit();
    },
    [onSubmit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [disabled, onSubmit],
  );

  return (
    <div className="shrink-0 border-t border-app-border/40 bg-app-surface/90 backdrop-blur-xl p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
      <form
        onSubmit={handleSubmit}
        className={cn(
          "flex items-end gap-2 rounded-full border bg-app-background px-3 py-1.5 transition duration-200 shadow-card",
          draft.trim() || isSending
            ? "border-primary/40 ring-2 ring-primary/5 shadow-primary/5"
            : "border-app-border/60 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/5 hover:border-app-border",
        )}
      >
        <textarea
          ref={textareaRef}
          data-chat-composer=""
          value={draft}
          disabled={disabled}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="max-h-[120px] min-h-[20px] w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-app-text outline-none placeholder:text-app-muted/70 custom-scrollbar font-medium disabled:cursor-not-allowed"
          rows={1}
        />

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Add emoji"
              className="shrink-0 p-1 text-app-muted hover:text-primary-ink transition-colors rounded-control hover:bg-primary/10 group relative"
              title="Add emoji"
            >
              <Smile className="size-5 transition-transform group-hover:scale-110" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="p-0 border-none shadow-lift w-auto">
            <EmojiPicker
              onEmojiClick={(emojiData) => {
                onDraftChange(draft + emojiData.emoji);
                textareaRef.current?.focus();
              }}
              theme={mode === "dark" ? Theme.DARK : Theme.LIGHT}
              lazyLoadEmojis={true}
            />
          </PopoverContent>
        </Popover>

        <button
          type="submit"
          disabled={disabled || !draft.trim() || isSending}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full transition duration-300",
            draft.trim()
              ? "bg-primary text-white shadow-lift shadow-primary/30 hover:bg-primary/90 hover:scale-105 active:scale-95"
              : "bg-app-border/40 text-app-muted/50 cursor-not-allowed",
          )}
        >
          <Send className="size-3.5 ml-0.5" />
        </button>
      </form>
    </div>
  );
});
