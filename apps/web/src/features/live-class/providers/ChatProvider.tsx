"use client";

import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useChat } from "@livekit/components-react";
import type { ChatMessage } from "@livekit/components-core";
import { useLiveClassState } from "./LiveClassProvider";

export interface ChatMessageData {
  id: number;
  senderName: string;
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
  setDraft: (draft: string) => void;
  resetUnreadCount: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { send, chatMessages: rawChatMessages, isSending } = useChat();
  const { activeSidebar } = useLiveClassState();
  const [unreadCount, setUnreadCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [lastMessageCount, setLastMessageCount] = useState(rawChatMessages.length);

  // Normalize messages
  const chatMessages: ChatMessageData[] = rawChatMessages.map((msg, index) => ({
    id: index,
    senderName: msg.from?.name || msg.from?.identity || "Unknown",
    message: msg.message ?? "",
    isOwn: !!msg.from?.isLocal,
    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
  }));

  // Track unread messages
  useEffect(() => {
    if (activeSidebar === "chat") {
      setUnreadCount(0);
      setLastMessageCount(rawChatMessages.length);
    } else if (rawChatMessages.length > lastMessageCount) {
      const newMessages = rawChatMessages.slice(lastMessageCount);
      // Only count messages that are not our own
      const incomingNewMessages = newMessages.filter(msg => !msg.from?.isLocal);
      
      if (incomingNewMessages.length > 0) {
        setUnreadCount((prev) => prev + incomingNewMessages.length);
      }
      setLastMessageCount(rawChatMessages.length);
    }
  }, [rawChatMessages, activeSidebar, lastMessageCount]);

  const resetUnreadCount = () => setUnreadCount(0);

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
