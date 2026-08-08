"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useChat } from "@livekit/components-react";
import type { ChatMessage } from "@livekit/components-core";
import { useLiveClassState } from "./LiveClassProvider";
import { useAuthStore } from "@/stores/authStore";

export interface ChatMessageData {
  id: number;
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
  const { send: livekitSend, chatMessages: rawChatMessages, isSending } = useChat();
  const { activeSidebar } = useLiveClassState();
  const [unreadCount, setUnreadCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [lastMessageCount, setLastMessageCount] = useState(0); // We will manage this manually now
  const [dbHistory, setDbHistory] = useState<ChatMessageData[]>([]);

  // Fetch history on mount
  useEffect(() => {
    if (!classId) return;
    let isMounted = true;
    import("../api/live-class").then(({ getChatHistory }) => {
      getChatHistory(classId)
        .then((history) => {
          if (!isMounted) return;
          const mappedHistory: ChatMessageData[] = history.map((msg: any) => ({
            id: msg.id,
            senderName: msg.senderName,
            senderRole: msg.senderRole,
            message: msg.message,
            isOwn: false, // We'll assume history is not "own" for now, or match senderName
            timestamp: new Date(msg.createdAt),
          }));
          setDbHistory(mappedHistory);
        })
        .catch(console.error);
    });
    return () => { isMounted = false; };
  }, [classId]);

  const user = useAuthStore((state) => state.user);

  // Normalize LiveKit messages
  const livekitMessages: ChatMessageData[] = rawChatMessages.map((msg, index) => {
    let role = null;
    if (msg.from?.metadata) {
      try {
        role = JSON.parse(msg.from.metadata).role || null;
      } catch {
        // ignore
      }
    }
    const isLocal = !!msg.from?.isLocal;
    const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
    return {
      id: index,
      senderName: msg.from?.name || (isLocal ? localName : msg.from?.identity) || "Unknown",
      senderRole: role,
      message: msg.message ?? "",
      isOwn: isLocal,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    };
  });



  // Merge and deduplicate messages (DB history + livekit)
  const chatMessages = React.useMemo(() => {
    const all = [...dbHistory, ...livekitMessages];
    
    // Deduplicate by senderName + exact message + rough timestamp (within 2 seconds)
    // to avoid showing messages that we fetched from history but also received via LiveKit
    const unique = all.filter((msg, index, self) => 
      index === self.findIndex((t) => (
        t.senderName === msg.senderName && 
        t.message === msg.message &&
        Math.abs(t.timestamp.getTime() - msg.timestamp.getTime()) < 2000
      ))
    );
    
    return unique.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [dbHistory, livekitMessages]);

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
    // 1. Send via LiveKit for instant broadcast
    const result = await livekitSend(msg);
    // 2. Persist to DB async
    if (classId) {
      import("../api/live-class").then(({ saveChatMessage }) => {
        saveChatMessage(classId, msg).catch(console.error);
      });
    }
    return result;
  }, [livekitSend, classId]);

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
