"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { Send, Smile } from "lucide-react";
import dynamic from "next/dynamic";
import type { Theme } from "emoji-picker-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { useTheme } from "@/providers/ThemeProvider";
import { cn } from "@/lib/utils";

// Large bundle (emoji data); only fetched the first time the popover opens.
const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  loading: () => <div className="h-[450px] w-[350px] rounded-panel bg-app-surface" />,
  ssr: false
});

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
    <div className="shrink-0 border-t border-app-border bg-app-surface p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
      <form
        onSubmit={handleSubmit}
        className={cn(
          "flex items-end gap-1.5 rounded-control border bg-app-surface py-1 pl-3 pr-1 transition-colors",
          "border-app-line-strong focus-within:border-primary focus-within:shadow-focus",
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
          aria-label="Message"
          className="custom-scrollbar max-h-[7.5rem] min-h-9 w-full resize-none bg-transparent py-2 text-sm leading-5 text-app-text outline-none placeholder:text-app-muted disabled:cursor-not-allowed"
          rows={1}
        />

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Add emoji"
              className="flex size-9 shrink-0 items-center justify-center rounded-control text-app-muted transition-colors hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus"
              title="Add emoji"
            >
              <Smile aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="p-0 border-none shadow-lift w-auto">
            <EmojiPicker
              onEmojiClick={(emojiData) => {
                onDraftChange(draft + emojiData.emoji);
                textareaRef.current?.focus();
              }}
              theme={(mode === "dark" ? "dark" : "light") as Theme}
              lazyLoadEmojis={true}
            />
          </PopoverContent>
        </Popover>

        <button
          type="submit"
          disabled={disabled || !draft.trim() || isSending}
          aria-label="Send message"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-control transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus",
            draft.trim()
              ? "bg-primary text-on-primary hover:bg-primary-hover"
              : "cursor-not-allowed bg-app-soft text-app-subtle",
          )}
        >
          <Send aria-hidden="true" className="size-4" strokeWidth={2} />
        </button>
      </form>
    </div>
  );
});
