"use client";

import { useMemo, useState } from "react";
import type { ChatConversationSummary } from "@nexa-chess/types";
import { Search, Users, UsersRound } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { cn } from "@/lib/utils";
import { chatListStamp, initialsOf } from "../lib/chatFormat";

type Props = {
  conversations: ChatConversationSummary[] | undefined;
  isLoading: boolean;
  onSelect: (id: string) => void;
  selectedId: string | null;
};

export function ConversationList({ conversations, isLoading, onSelect, selectedId }: Props) {
  const timeZone = useUserTimeZone();
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = conversations ?? [];
    return needle ? list.filter((c) => c.title.toLowerCase().includes(needle)) : list;
  }, [conversations, q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-app-border p-3">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
          <Input
            aria-label="Search conversations"
            className="pl-9"
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations"
            value={q}
          />
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Conversations">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <li className="flex items-center gap-3 px-3 py-3" key={i}>
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </li>
          ))}
        {!isLoading && visible.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-app-muted">
            {q ? "No conversation matches that." : "No conversations yet."}
          </li>
        )}
        {visible.map((c) => {
          const active = c.id === selectedId;
          const unread = c.unreadCount > 0;
          return (
            <li key={c.id}>
              <button
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 border-l-4 px-3 py-3 text-left transition-colors hover:bg-app-soft",
                  active ? "border-primary bg-app-soft" : "border-transparent",
                )}
                onClick={() => onSelect(c.id)}
                type="button"
              >
                <ConversationAvatar conversation={c} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm text-app-text", unread ? "font-bold" : "font-semibold")}>
                      {c.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-app-muted">{chatListStamp(c.lastMessageAt, timeZone)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-xs", unread ? "text-app-text" : "text-app-muted")}>
                      {c.lastMessage
                        ? `${c.type !== "DIRECT" && c.lastMessage.senderName ? `${c.lastMessage.senderName}: ` : ""}${c.lastMessage.body}`
                        : "No messages yet"}
                    </span>
                    {unread && (
                      <span
                        aria-label={`${c.unreadCount} unread`}
                        className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-on-primary"
                      >
                        {c.unreadCount > 99 ? "99+" : c.unreadCount}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ConversationAvatar({ conversation }: { conversation: ChatConversationSummary }) {
  const Icon = conversation.type === "BATCH" ? UsersRound : conversation.type === "GROUP" ? Users : null;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
        conversation.type === "DIRECT" ? "bg-primary text-on-primary" : "bg-app-soft text-primary-ink",
      )}
    >
      {Icon ? <Icon className="size-5" /> : initialsOf(conversation.title)}
    </span>
  );
}
