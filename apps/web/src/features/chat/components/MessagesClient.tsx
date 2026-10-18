"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageCirclePlus, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { WidgetError } from "@/components/ui/WidgetError";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useConversations } from "../hooks/useChat";
import { ChatThread } from "./ChatThread";
import { ConversationList } from "./ConversationList";
import { NewChatDialog } from "./NewChatDialog";

/**
 * Two panes on md+, one at a time on phones. The open thread lives in `?c=`
 * so a refresh, a shared link or the back button keeps it.
 */
export function MessagesClient() {
  const role = useAuthStore((s) => s.user?.role);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("c");
  const conversations = useConversations();
  const [newOpen, setNewOpen] = useState(false);

  const select = useCallback(
    (id: string | null) => {
      router.replace(id ? `${pathname}?c=${encodeURIComponent(id)}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  return (
    <Card className="flex h-[calc(100dvh-112px)] min-h-[480px] overflow-hidden p-0">
      <aside
        className={cn(
          "flex w-full min-w-0 flex-col border-app-border md:w-80 md:shrink-0 md:border-r lg:w-96",
          selectedId && "hidden md:flex",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-app-border px-4 py-3">
          <h1 className="flex items-center gap-2 text-lg font-bold text-app-text">
            <MessagesSquare aria-hidden className="size-5 text-primary-ink" />
            Messages
          </h1>
          {role !== undefined && (
            <Button onClick={() => setNewOpen(true)} size="sm">
              <MessageCirclePlus aria-hidden className="mr-1.5 size-4" />
              New
            </Button>
          )}
        </div>
        {conversations.isError ? (
          <div className="p-3">
            <WidgetError message="Conversations could not be loaded." onRetry={() => void conversations.refetch()} />
          </div>
        ) : (
          <ConversationList
            conversations={conversations.data?.conversations}
            isLoading={conversations.isLoading}
            onSelect={select}
            selectedId={selectedId}
          />
        )}
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col", selectedId ? "flex" : "hidden md:flex")}>
        {selectedId ? (
          <ChatThread conversationId={selectedId} key={selectedId} onBack={() => select(null)} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-app-soft">
              <MessagesSquare aria-hidden className="size-6 text-app-muted" />
            </span>
            <p className="text-sm font-semibold text-app-text">Pick a conversation</p>
            <p className="max-w-xs text-sm text-app-muted">
              Your batch chats appear here automatically. Start a new one with the New button.
            </p>
          </div>
        )}
      </section>

      <NewChatDialog
        canCreateGroup={role === "COACH"}
        onOpenChange={setNewOpen}
        onOpened={select}
        open={newOpen}
      />
    </Card>
  );
}
