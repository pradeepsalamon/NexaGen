"use client";

import { memo, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Copy, Reply } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { toast } from "sonner";
import { useLiveClassChat, type ChatMessageData } from "../../../providers/ChatProvider";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useReducedMotion } from "../../../lib/meetingUi";
import { ParticipantAvatar } from "../ParticipantAvatar";

function renderTextWithLinks(text: string) {
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
}

export const ChatMessage = memo(function ChatMessage({
  msg,
  showHeader,
}: {
  msg: ChatMessageData;
  showHeader: boolean;
}) {
  const tz = useUserTimeZone();
  const time = useMemo(
    () =>
      formatDate(msg.timestamp.toISOString(), tz, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [msg.timestamp, tz],
  );

  const { setDraft } = useLiveClassChat();
  const reducedMotion = useReducedMotion();

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
      // Keyed off a data attribute, not the placeholder — that now changes
      // with the active thread.
      document.querySelector<HTMLTextAreaElement>("textarea[data-chat-composer]")?.focus();
    }, 10);
  }, [msg.message, msg.senderName, setDraft]);

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
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
              className="size-8 text-[10px] shadow-card ring-1 ring-app-border"
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
              "px-3.5 py-2.5 text-sm leading-relaxed [word-break:break-word] shadow-card transition duration-200",
              msg.isOwn
                ? "bg-primary text-white rounded-app rounded-tr-sm"
                : "bg-app-surface border border-app-border text-app-text rounded-app rounded-tl-sm dark:bg-app-soft/50",
            )}
          >
            {msg.message.split("\n").map((line, lineIndex) => {
              const isQuote = line.trim().startsWith(">");
              const textContent = isQuote ? line.trim().substring(1).trim() : line;

              return (
                <div
                  key={lineIndex}
                  className={cn(
                    isQuote &&
                      "my-1 border-l-2 border-current pl-2.5 opacity-75 text-[13px] italic bg-app-soft py-1 rounded-r-control",
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
              "flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/bubble:opacity-100",
              msg.isOwn ? "pr-2" : "pl-2",
            )}
          >
            <SimpleTooltip label="Reply">
              <button
                className="rounded-control p-1.5 text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
                type="button"
                onClick={handleReply}
                aria-label="Reply to message"
              >
                <Reply className="size-3.5" />
              </button>
            </SimpleTooltip>
            <SimpleTooltip label="Copy">
              <button
                className="rounded-control p-1.5 text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
                type="button"
                onClick={handleCopy}
                aria-label="Copy message"
              >
                <Copy className="size-3.5" />
              </button>
            </SimpleTooltip>
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
