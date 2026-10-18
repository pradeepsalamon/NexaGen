import { z } from "zod";

// Persistent chat outside live classes. Three kinds of thread:
//  - BATCH: one per batch; readable by its current roster (students + coaches).
//  - DIRECT: two people. A student may only ever message a coach of one of
//    their batches (or staff) — there is no student <-> student direct message.
//  - GROUP: a coach-made group of students from that coach's own batches.
// The API enforces every rule; the UI only mirrors them.

export const CHAT_MESSAGE_MAX_LENGTH = 4000;
export const CHAT_GROUP_NAME_MAX_LENGTH = 80;
export const CHAT_GROUP_MAX_MEMBERS = 100;
export const CHAT_MESSAGES_PAGE_SIZE = 50;

export type ChatConversationType = "DIRECT" | "BATCH" | "GROUP";
export type ChatRole = "SUPER_ADMIN" | "ADMIN" | "COACH" | "STUDENT";

const isStaff = (role: ChatRole) => role === "ADMIN" || role === "SUPER_ADMIN";

/**
 * Whether `from` may open / write a direct thread with `to`. The single rule
 * the API, the contact picker and the tests share.
 *  - student <-> student: never;
 *  - coach <-> student: only while they share a batch (`shareBatch`);
 *  - staff <-> anyone: allowed (admin support);
 *  - coach <-> coach: not offered.
 */
export function directChatAllowed(from: ChatRole, to: ChatRole, shareBatch: boolean): boolean {
  if (from === "STUDENT" && to === "STUDENT") return false;
  if (isStaff(from) || isStaff(to)) return true;
  if ((from === "COACH" && to === "STUDENT") || (from === "STUDENT" && to === "COACH")) return shareBatch;
  return false;
}

/** "<a>:<b>" with the ids sorted, so a pair maps to exactly one thread. */
export function directConversationKey(userA: string, userB: string): string {
  return userA < userB ? `${userA}:${userB}` : `${userB}:${userA}`;
}

export const sendChatMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message first.")
    .max(CHAT_MESSAGE_MAX_LENGTH, `Messages are limited to ${CHAT_MESSAGE_MAX_LENGTH} characters.`),
  /** Client-generated id; resending with the same one never duplicates. */
  clientId: z.string().min(8).max(64),
});
export type SendChatMessageRequest = z.infer<typeof sendChatMessageSchema>;

export const startDirectChatSchema = z.object({ userId: z.string().min(1).max(64) });
export type StartDirectChatRequest = z.infer<typeof startDirectChatSchema>;

export const createChatGroupSchema = z.object({
  name: z.string().trim().min(1, "Give the group a name.").max(CHAT_GROUP_NAME_MAX_LENGTH),
  memberIds: z.array(z.string().min(1).max(64)).min(1, "Add at least one student.").max(CHAT_GROUP_MAX_MEMBERS),
});
export type CreateChatGroupRequest = z.infer<typeof createChatGroupSchema>;

export const updateChatGroupMembersSchema = z
  .object({
    add: z.array(z.string().min(1).max(64)).max(CHAT_GROUP_MAX_MEMBERS).default([]),
    remove: z.array(z.string().min(1).max(64)).max(CHAT_GROUP_MAX_MEMBERS).default([]),
  })
  .refine((v) => v.add.length + v.remove.length > 0, { message: "Nothing to change." });
export type UpdateChatGroupMembersRequest = z.infer<typeof updateChatGroupMembersSchema>;

export const chatMessagesQuerySchema = z.object({
  /** ISO timestamp + id of the oldest message already loaded (keyset). */
  before: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(CHAT_MESSAGES_PAGE_SIZE),
});
export type ChatMessagesQuery = z.infer<typeof chatMessagesQuerySchema>;

export const chatContactsQuerySchema = z.object({ q: z.string().trim().max(100).optional() });

export interface ChatUserSummary {
  id: string;
  name: string;
  role: ChatRole;
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  body: string;
  clientId: string | null;
  /** null once the sender's account is gone. */
  sender: ChatUserSummary | null;
  /** ISO-8601 UTC. */
  createdAt: string;
}

export interface ChatConversationSummary {
  id: string;
  type: ChatConversationType;
  /** Batch name, group name, or the other person's name. */
  title: string;
  /** DIRECT: the other participant. */
  counterpart: ChatUserSummary | null;
  batchId: string | null;
  memberCount: number;
  unreadCount: number;
  lastMessage: { body: string; senderName: string | null; createdAt: string } | null;
  /** ISO; null when nothing was ever said. */
  lastMessageAt: string | null;
  /** False when the caller can read but no longer write (e.g. left the batch). */
  canSend: boolean;
}

export interface ChatConversationListResponse {
  conversations: ChatConversationSummary[];
}

export interface ChatConversationDetail extends ChatConversationSummary {
  members: (ChatUserSummary & { owner: boolean })[];
  /** GROUP: the caller may add / remove members. */
  canManageMembers: boolean;
}

export interface ChatMessagesResponse {
  /** Oldest first. */
  messages: ChatMessageDto[];
  /** Pass as `before` for the previous page; null at the start of the thread. */
  nextBefore: string | null;
}

export interface ChatUnreadResponse {
  unread: number;
}

export interface ChatContact extends ChatUserSummary {
  /** Batches the caller shares with them (context in the picker). */
  batchNames: string[];
}

export interface ChatContactsResponse {
  contacts: ChatContact[];
  /** Students the caller may put in a GROUP (coach: own batches; staff: none listed). */
  groupCandidates: ChatContact[];
}
