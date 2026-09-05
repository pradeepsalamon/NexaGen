"use client";

import React, { createContext, useContext, useMemo, useState, useEffect, useCallback, type ReactNode } from "react";
import { useChat } from "@livekit/components-react";
import type { ChatMessage } from "@livekit/components-core";
import { toast } from "sonner";
import { useLiveClassState } from "./LiveClassProvider";
import { useConnectionStateManager } from "./ConnectionStateManager";
import { useAuthStore } from "@/stores/authStore";

export interface ChatMessageData {
  id: number;
  clientMessageId: string | null;
  senderId: string | null;
  senderName: string;
  senderRole: string | null;
  message: string;
  isOwn: boolean;
  timestamp: Date;
}

interface ChatContextValue {
  chatMessages: ChatMessageData[];
  isSending: boolean;
  send: (msg: string) => Promise<ChatMessage>;
  unreadCount: number;
  draft: string;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  resetUnreadCount: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children, classId }: { children: ReactNode; classId: string }) {
  const { send: livekitSend, chatMessages: rawChatMessages } = useChat();
  const [isSending, setIsSending] = useState(false);
  const { activeSidebar } = useLiveClassState();
  const [unreadCount, setUnreadCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [lastMessageCount, setLastMessageCount] = useState(0); // We will manage this manually now
  const [dbHistory, setDbHistory] = useState<ChatMessageData[]>([]);
  const { reconnectEpoch } = useConnectionStateManager();

  // Fetch history on mount, and again after a Reconnecting -> Connected
  // transition (design doc §2.7/§4.3): a LiveKit data-channel chat message
  // missed during the drop never arrives any other way, unlike the board's
  // REQUEST_SYNC pattern, so this re-fetch is what catches it up.
  useEffect(() => {
    if (!classId) return;
    let isMounted = true;
    import("../api/live-class").then(({ getChatHistory }) => {
      getChatHistory(classId)
        .then((history) => {
          if (!isMounted) return;
          const mappedHistory: ChatMessageData[] = history.map((msg: any) => ({
            id: msg.id,
            clientMessageId: msg.clientMessageId ?? null,
            senderId: msg.senderId ?? null,
            senderName: msg.senderName,
            senderRole: msg.senderRole,
            message: msg.message,
            // `isOwn` is resolved in the `chatMessages` memo below by comparing
            // `senderId` against the current user id (AUDIT H23).
            isOwn: false,
            timestamp: new Date(msg.createdAt),
          }));
          setDbHistory(mappedHistory);
        })
        .catch(console.error);
    });
    return () => { isMounted = false; };
  }, [classId, reconnectEpoch]);

  const user = useAuthStore((state) => state.user);
  const userId = user?.id ?? null;
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";

  // Normalize LiveKit messages. Memoised on `rawChatMessages` so the reference
  // is stable across unrelated re-renders — otherwise the `chatMessages` memo
  // and the unread-count effect below re-run on every render (AUDIT M25).
  const livekitMessages: ChatMessageData[] = useMemo(() => {
    return rawChatMessages.map((msg, index) => {
      let role = null;
      if (msg.from?.metadata) {
        try {
          role = JSON.parse(msg.from.metadata).role || null;
        } catch {
          // ignore
        }
      }
      const isLocal = !!msg.from?.isLocal;
      return {
        id: index,
        clientMessageId: msg.id ?? null,
        senderId: isLocal ? userId : null,
        senderName: msg.from?.name || (isLocal ? localName : msg.from?.identity) || "Unknown",
        senderRole: role,
        message: msg.message ?? "",
        isOwn: isLocal,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      };
    });
  }, [rawChatMessages, userId, localName]);

  // Merge and deduplicate messages (DB history + livekit)
  const chatMessages = React.useMemo(() => {
    // Resolve `isOwn` for persisted history now that we know the current user
    // (AUDIT H23 — it was hardcoded `false`, so your own past messages rendered
    // as someone else's after a refresh).
    const resolvedHistory = dbHistory.map((msg) => ({
      ...msg,
      isOwn: msg.senderId != null && msg.senderId === userId,
    }));
    const all = [...resolvedHistory, ...livekitMessages];

    // Dedupe a message that arrived both from DB history and live LiveKit.
    // Prefer the stable `clientMessageId` (AUDIT M24 — the old senderName+text+
    // ±2s heuristic dropped a legitimately repeated short message); fall back to
    // the heuristic only when an id is missing (older rows).
    const unique = all.filter((msg, index, self) => {
      const firstIdx = self.findIndex((t) =>
        msg.clientMessageId && t.clientMessageId
          ? t.clientMessageId === msg.clientMessageId
          : t.senderName === msg.senderName &&
            t.message === msg.message &&
            !t.clientMessageId &&
            !msg.clientMessageId &&
            Math.abs(t.timestamp.getTime() - msg.timestamp.getTime()) < 2000
      );
      return index === firstIdx;
    });

    return unique.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [dbHistory, livekitMessages, userId]);

  // Track unread messages
  useEffect(() => {
    if (activeSidebar === "chat") {
      setUnreadCount(0);
      setLastMessageCount(chatMessages.length);
    } else if (rawChatMessages.length > lastMessageCount) {
      const newMessages = rawChatMessages.slice(lastMessageCount);
      // Only count messages that are not our own
      const incomingNewMessages = newMessages.filter(msg => !msg.from?.isLocal);
      
      if (incomingNewMessages.length > 0) {
        setUnreadCount((prev) => prev + incomingNewMessages.length);
      }
      setLastMessageCount(chatMessages.length);
    }
  }, [chatMessages, activeSidebar, lastMessageCount]);

  const resetUnreadCount = () => setUnreadCount(0);

  const send = useCallback(async (msg: string) => {
    if (isSending) return undefined as any;
    setIsSending(true);
    try {
      // 1. Send via LiveKit for instant broadcast
      const result = await livekitSend(msg);
      // 2. Persist to DB with LiveKit's message id so history dedupe is exact
      //    (AUDIT M24); retry once, then surface the failure instead of silently
      //    losing the message on the next reload (AUDIT M26).
      if (classId) {
        const clientMessageId = result?.id;
        import("../api/live-class").then(({ saveChatMessage }) => {
          saveChatMessage(classId, msg, clientMessageId)
            .catch(() => saveChatMessage(classId, msg, clientMessageId))
            .catch((err) => {
              console.error("Failed to persist chat message", err);
              toast.error("Message sent but not saved — it may not appear after a reload.");
            });
        });
      }
      return result;
    } catch (err) {
      console.error("LiveKit send failed:", err);
      toast.error("Failed to send message. Please try again.");
      throw err;
    } finally {
      setIsSending(false);
    }
  }, [livekitSend, classId, isSending]);

  return (
    <ChatContext.Provider
      value={{
        chatMessages,
        isSending,
        send,
        unreadCount,
        draft,
        setDraft,
        resetUnreadCount,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useLiveClassChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useLiveClassChat must be used within a ChatProvider");
  }
  return context;
}
