import { API_ROUTES } from "@nexa-chess/types";
import type {
  ChatContactsResponse,
  ChatConversationDetail,
  ChatConversationListResponse,
  ChatMessageDto,
  ChatMessagesResponse,
  ChatUnreadResponse,
  CreateChatGroupRequest,
  SendChatMessageRequest,
  UpdateChatGroupMembersRequest,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function listConversations() {
  // Polled: a dropped connection should not toast every 15 seconds.
  return apiFetch<ChatConversationListResponse>(API_ROUTES.chat.conversations, { silent: true });
}

export function getChatUnread() {
  return apiFetch<ChatUnreadResponse>(API_ROUTES.chat.unread, { silent: true });
}

export function getChatContacts(q?: string) {
  return apiFetch<ChatContactsResponse>(API_ROUTES.chat.contacts, { params: q ? { q } : undefined });
}

export function getConversation(id: string) {
  return apiFetch<ChatConversationDetail>(API_ROUTES.chat.conversation(id));
}

export function listMessages(id: string, before?: string) {
  return apiFetch<ChatMessagesResponse>(API_ROUTES.chat.messages(id), {
    params: before ? { before } : undefined,
    silent: true,
  });
}

export function sendMessage(id: string, body: SendChatMessageRequest) {
  return apiFetch<ChatMessageDto>(API_ROUTES.chat.messages(id), { body, method: "POST" });
}

export function markConversationRead(id: string) {
  return apiFetch<{ ok: true }>(API_ROUTES.chat.markRead(id), { method: "POST", silent: true });
}

export function startDirectChat(userId: string) {
  return apiFetch<ChatConversationDetail>(API_ROUTES.chat.startDirect, { body: { userId }, method: "POST" });
}

export function createChatGroup(body: CreateChatGroupRequest) {
  return apiFetch<ChatConversationDetail>(API_ROUTES.chat.createGroup, { body, method: "POST" });
}

export function updateChatGroupMembers(id: string, body: UpdateChatGroupMembersRequest) {
  return apiFetch<ChatConversationDetail>(API_ROUTES.chat.members(id), { body, method: "PATCH" });
}
