import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChatMessageDto,
  ChatMessagesResponse,
  CreateChatGroupRequest,
  SendChatMessageRequest,
  UpdateChatGroupMembersRequest,
} from "@nexa-chess/types";
import type { NavBadge } from "@/components/layout/navItems";
import { queryKeys } from "@/lib/queryKeys";
import {
  createChatGroup,
  getChatContacts,
  getChatUnread,
  getConversation,
  listConversations,
  listMessages,
  markConversationRead,
  sendMessage,
  startDirectChat,
  updateChatGroupMembers,
} from "../api/chatApi";

// There is no websocket outside a live class, so chat is polled. The open
// thread polls fastest; the list and the sidebar badge slower; all of them
// stop while the tab is hidden (TanStack's default refetchIntervalInBackground).
export const CHAT_THREAD_POLL_MS = 4_000;
export const CHAT_LIST_POLL_MS = 15_000;
export const CHAT_UNREAD_POLL_MS = 30_000;

export function useConversations() {
  return useQuery({
    queryFn: listConversations,
    queryKey: queryKeys.chat.conversations,
    refetchInterval: CHAT_LIST_POLL_MS,
  });
}

export function useChatUnread(enabled = true) {
  return useQuery({
    enabled,
    queryFn: getChatUnread,
    queryKey: queryKeys.chat.unread,
    refetchInterval: CHAT_UNREAD_POLL_MS,
    staleTime: 10_000,
  });
}

export function useChatContacts(enabled: boolean, q?: string) {
  return useQuery({
    enabled,
    queryFn: () => getChatContacts(q),
    queryKey: [...queryKeys.chat.contacts, q ?? ""],
    staleTime: 60_000,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryFn: () => getConversation(id as string),
    queryKey: queryKeys.chat.conversation(id ?? ""),
  });
}

/** The newest page of a thread, polled while it is open. */
export function useLatestMessages(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryFn: () => listMessages(id as string),
    queryKey: queryKeys.chat.messages(id ?? ""),
    refetchInterval: CHAT_THREAD_POLL_MS,
  });
}

export function useSendMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SendChatMessageRequest) => sendMessage(id, body),
    onSuccess: (message: ChatMessageDto) => {
      qc.setQueryData<ChatMessagesResponse>(queryKeys.chat.messages(id), (prev) =>
        prev && !prev.messages.some((m) => m.id === message.id)
          ? { ...prev, messages: [...prev.messages, message] }
          : prev,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.chat.conversations });
    },
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markConversationRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.chat.conversations });
      void qc.invalidateQueries({ queryKey: queryKeys.chat.unread });
    },
  });
}

export function useStartDirectChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => startDirectChat(userId),
    onSuccess: (detail) => {
      qc.setQueryData(queryKeys.chat.conversation(detail.id), detail);
      void qc.invalidateQueries({ queryKey: queryKeys.chat.conversations });
    },
  });
}

export function useCreateChatGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateChatGroupRequest) => createChatGroup(body),
    onSuccess: (detail) => {
      qc.setQueryData(queryKeys.chat.conversation(detail.id), detail);
      void qc.invalidateQueries({ queryKey: queryKeys.chat.conversations });
    },
  });
}

export function useUpdateChatGroupMembers(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateChatGroupMembersRequest) => updateChatGroupMembers(id, body),
    onSuccess: (detail) => {
      qc.setQueryData(queryKeys.chat.conversation(id), detail);
      void qc.invalidateQueries({ queryKey: queryKeys.chat.conversations });
    },
  });
}

/** Sidebar chip for the Messages link: the unread count, or nothing. */
export function useChatNavBadge(enabled = true): NavBadge | undefined {
  const { data } = useChatUnread(enabled);
  const unread = data?.unread ?? 0;
  return useMemo<NavBadge | undefined>(
    () => (unread > 0 ? { label: unread > 99 ? "99+" : String(unread), tone: "danger" } : undefined),
    [unread],
  );
}
