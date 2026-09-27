"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useChat, useDataChannel, useParticipants } from "@livekit/components-react";
import type { ChatMessage } from "@livekit/components-core";
import { toast } from "sonner";
import {
  decodeDirectChat,
  encodeDirectChat,
  privateChatRecipientAllowed,
  LIVE_CLASS_DIRECT_CHAT_TOPIC,
  type DirectChatMessage,
} from "@nexa-chess/types";
import { useLiveClassState } from "./LiveClassProvider";
import { useConnectionStateManager } from "./ConnectionStateManager";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { isHumanParticipant } from "../lib/participants";

/**
 * `"room"` is the everyone-can-see thread; any other value is the **user id**
 * of the one person on the other side of a private thread.
 */
export const ROOM_THREAD = "room";
export type ChatThreadId = typeof ROOM_THREAD | (string & {});

export interface ChatMessageData {
  id: string;
  clientMessageId: string | null;
  senderId: string | null;
  senderName: string;
  senderRole: string | null;
  /** null for a room-wide message; a user id for a private one. */
  recipientId: string | null;
  message: string;
  isOwn: boolean;
  timestamp: Date;
}

export interface ChatThread {
  id: ChatThreadId;
  label: string;
  isPrivate: boolean;
  unreadCount: number;
}

interface ChatContextValue {
  /** Every message this user is entitled to see, room and private alike. */
  chatMessages: ChatMessageData[];
  /** Just the messages in `activeThread`. */
  threadMessages: ChatMessageData[];
  threads: ChatThread[];
  activeThread: ChatThreadId;
  setActiveThread: (thread: ChatThreadId) => void;
  /** Open (or create) a private thread with one participant. */
  openPrivateThread: (userId: string) => void;
  /** Whether this user may start a private thread with `userId` at all. */
  canMessagePrivately: (userId: string) => boolean;
  /** False when the class policy has switched private messaging off. */
  privateChatEnabled: boolean;
  /** False when the class policy has switched student chat off entirely. */
  chatEnabled: boolean;
  isSending: boolean;
  /** Sends into `activeThread`. */
  send: (msg: string) => Promise<ChatMessage | void>;
  unreadCount: number;
  draft: string;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  resetUnreadCount: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

/** LiveKit identity is `<userId>` or `<userId>_<clientId>`; cuids carry no `_`. */
function userIdFromIdentity(identity: string | undefined): string | null {
  if (!identity) return null;
  return identity.split("_")[0] || null;
}

function roleFromMetadata(metadata: string | undefined): string | null {
  if (!metadata) return null;
  try {
    return (JSON.parse(metadata) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

/** The thread a message belongs to, from the perspective of `selfId`. */
function threadOf(msg: ChatMessageData, selfId: string | null): ChatThreadId {
  if (!msg.recipientId) return ROOM_THREAD;
  return msg.recipientId === selfId ? msg.senderId ?? ROOM_THREAD : msg.recipientId;
}

export function ChatProvider({ children, classId }: { children: ReactNode; classId: string }) {
  const { send: livekitSend, chatMessages: rawChatMessages } = useChat();
  const [isSending, setIsSending] = useState(false);
  const { activeSidebar, classroomChatOpen, settings } = useLiveClassState();
  const [draft, setDraft] = useState("");
  const [dbHistory, setDbHistory] = useState<ChatMessageData[]>([]);
  const [directMessages, setDirectMessages] = useState<ChatMessageData[]>([]);
  const [activeThread, setActiveThreadState] = useState<ChatThreadId>(ROOM_THREAD);
  const { reconnectEpoch } = useConnectionStateManager();
  const participants = useParticipants();

  const user = useAuthStore((state) => state.user);
  const userId = user?.id ?? null;
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const isStaff = user?.role === "COACH" || isStaffRole(user?.role);

  const chatEnabled = isStaff || settings?.student.chat !== "DISABLED";
  const privateChatEnabled = chatEnabled && settings?.student.privateChat !== "DISABLED";

  // Fetch history on mount, and again after a Reconnecting -> Connected
  // transition (design doc §2.7/§4.3): a LiveKit data-channel chat message
  // missed during the drop never arrives any other way, unlike the board's
  // REQUEST_SYNC pattern, so this re-fetch is what catches it up. It returns
  // room messages plus only the private threads this user is party to.
  useEffect(() => {
    if (!classId) return;
    let isMounted = true;
    import("../api/live-class").then(({ getChatHistory }) => {
      getChatHistory(classId)
        .then((history) => {
          if (!isMounted) return;
          setDbHistory(
            history.map((msg) => ({
              id: `db-${msg.id}`,
              clientMessageId: msg.clientMessageId ?? null,
              senderId: msg.senderId ?? null,
              senderName: msg.senderName,
              senderRole: msg.senderRole,
              recipientId: msg.recipientId ?? null,
              message: msg.message,
              // `isOwn` is resolved in the `chatMessages` memo below by comparing
              // `senderId` against the current user id (AUDIT H23).
              isOwn: false,
              timestamp: new Date(msg.createdAt),
            })),
          );
        })
        .catch(console.error);
    });
    return () => {
      isMounted = false;
    };
  }, [classId, reconnectEpoch]);

  // ── Private messages ────────────────────────────────────────────────
  // These ride their own topic addressed to a single identity rather than
  // `useChat`, which is a room-wide broadcast. Delivery is one-to-one at the
  // SFU, so a third participant never receives the packet at all.

  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  /** Every live identity belonging to one user (a person may have two tabs). */
  const identitiesForUser = useCallback((targetUserId: string) => {
    return participantsRef.current
      .filter((p) => isHumanParticipant(p) && userIdFromIdentity(p.identity) === targetUserId)
      .map((p) => p.identity);
  }, []);

  const roleForUser = useCallback((targetUserId: string): string | null => {
    const match = participantsRef.current.find(
      (p) => userIdFromIdentity(p.identity) === targetUserId,
    );
    return roleFromMetadata(match?.metadata);
  }, []);

  const nameForUser = useCallback(
    (targetUserId: string): string | null => {
      const match = participants.find((p) => userIdFromIdentity(p.identity) === targetUserId);
      return match?.name || null;
    },
    [participants],
  );

  const canMessagePrivately = useCallback(
    (targetUserId: string) => {
      if (!privateChatEnabled || !userId || targetUserId === userId) return false;
      return privateChatRecipientAllowed(user?.role ?? null, roleForUser(targetUserId));
    },
    [privateChatEnabled, roleForUser, user?.role, userId],
  );

  const dmSendRef = useRef<
    ((payload: Uint8Array, opts: { reliable?: boolean; destinationIdentities?: string[] }) => Promise<void>) | null
  >(null);

  const onDirectMessage = useCallback(
    (msg: { payload: Uint8Array; from?: { identity?: string; name?: string; metadata?: string } }) => {
      const decoded = decodeDirectChat(msg.payload);
      const fromIdentity = msg.from?.identity;
      if (!decoded || !fromIdentity || !userId) return;
      if (decoded.toUserId !== userId) return;

      // The sender is whoever the LiveKit envelope says it is, never what the
      // payload claims — otherwise anyone could post as the coach.
      const senderUserId = userIdFromIdentity(fromIdentity);
      if (!senderUserId || senderUserId !== decoded.fromUserId) return;

      // Receiver-side half of the student <-> coach rule. The API rejects the
      // write, but the packet itself never passes through the API, so this is
      // what stops a hand-rolled student-to-student DM from rendering.
      const senderRole = roleFromMetadata(msg.from?.metadata);
      if (!privateChatRecipientAllowed(senderRole, user?.role ?? null)) return;
      if (!privateChatEnabled) return;

      setDirectMessages((prev) => {
        if (decoded.clientMessageId && prev.some((m) => m.clientMessageId === decoded.clientMessageId)) {
          return prev;
        }
        return [
          ...prev,
          {
            id: `dm-${fromIdentity}-${decoded.clientMessageId || decoded.at}`,
            clientMessageId: decoded.clientMessageId || null,
            senderId: senderUserId,
            senderName: msg.from?.name || "Coach",
            senderRole,
            recipientId: userId,
            message: decoded.message,
            isOwn: false,
            timestamp: new Date(decoded.at),
          },
        ];
      });
    },
    [privateChatEnabled, user?.role, userId],
  );

  const { send: dmSend } = useDataChannel(LIVE_CLASS_DIRECT_CHAT_TOPIC, onDirectMessage);
  useEffect(() => {
    dmSendRef.current = dmSend;
  }, [dmSend]);

  // Normalize LiveKit messages. Memoised on `rawChatMessages` so the reference
  // is stable across unrelated re-renders — otherwise the `chatMessages` memo
  // and the unread-count effect below re-run on every render (AUDIT M25).
  const livekitMessages: ChatMessageData[] = useMemo(() => {
    return rawChatMessages.map((msg, index) => {
      const isLocal = !!msg.from?.isLocal;
      return {
        id: `lk-${msg.id ?? index}`,
        clientMessageId: msg.id ?? null,
        senderId: isLocal ? userId : userIdFromIdentity(msg.from?.identity),
        senderName: msg.from?.name || (isLocal ? localName : msg.from?.identity) || "Unknown",
        senderRole: roleFromMetadata(msg.from?.metadata),
        recipientId: null,
        message: msg.message ?? "",
        isOwn: isLocal,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      };
    });
  }, [rawChatMessages, userId, localName]);

  // Merge and deduplicate messages (DB history + livekit + private)
  const chatMessages = React.useMemo(() => {
    // Resolve `isOwn` for persisted history now that we know the current user
    // (AUDIT H23 — it was hardcoded `false`, so your own past messages rendered
    // as someone else's after a refresh).
    const resolvedHistory = dbHistory.map((msg) => ({
      ...msg,
      isOwn: msg.senderId != null && msg.senderId === userId,
    }));
    const all = [...resolvedHistory, ...livekitMessages, ...directMessages];

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
            Math.abs(t.timestamp.getTime() - msg.timestamp.getTime()) < 2000,
      );
      return index === firstIdx;
    });

    return unique.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [dbHistory, livekitMessages, directMessages, userId]);

  const threadMessages = useMemo(
    () => chatMessages.filter((msg) => threadOf(msg, userId) === activeThread),
    [chatMessages, activeThread, userId],
  );

  // ── Unread tracking, per thread ─────────────────────────────────────
  // A message counts as read once its thread is the open one *and* the chat
  // panel is on screen; anything else accrues, so a private message that
  // arrives while the room thread is open still shows a badge.
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const chatVisible = activeSidebar === "chat" || classroomChatOpen;

  useEffect(() => {
    if (!chatVisible) return;
    setSeenIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const msg of chatMessages) {
        if (threadOf(msg, userId) !== activeThread) continue;
        if (!next.has(msg.id)) {
          next.add(msg.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [chatVisible, chatMessages, activeThread, userId]);

  const unreadByThread = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const msg of chatMessages) {
      if (msg.isOwn || seenIds.has(msg.id)) continue;
      const thread = threadOf(msg, userId);
      counts[thread] = (counts[thread] ?? 0) + 1;
    }
    return counts;
  }, [chatMessages, seenIds, userId]);

  const unreadCount = useMemo(
    () => Object.values(unreadByThread).reduce((sum, n) => sum + n, 0),
    [unreadByThread],
  );

  // Anything already on screen when the user first opens chat is not "new".
  const primedRef = useRef(false);
  useEffect(() => {
    if (primedRef.current || dbHistory.length === 0) return;
    primedRef.current = true;
    setSeenIds((prev) => {
      const next = new Set(prev);
      dbHistory.forEach((msg) => next.add(msg.id));
      return next;
    });
  }, [dbHistory]);

  const threads = useMemo<ChatThread[]>(() => {
    const list: ChatThread[] = [
      {
        id: ROOM_THREAD,
        label: "Everyone",
        isPrivate: false,
        unreadCount: unreadByThread[ROOM_THREAD] ?? 0,
      },
    ];

    const privateIds = new Set<string>();
    for (const msg of chatMessages) {
      const thread = threadOf(msg, userId);
      if (thread !== ROOM_THREAD) privateIds.add(thread);
    }
    // A thread the user opened but has not written in yet still needs a tab.
    if (activeThread !== ROOM_THREAD) privateIds.add(activeThread);

    for (const id of privateIds) {
      const fromMessages = chatMessages.find(
        (m) => m.senderId === id && m.recipientId != null,
      )?.senderName;
      list.push({
        id,
        label: nameForUser(id) || fromMessages || "Private",
        isPrivate: true,
        unreadCount: unreadByThread[id] ?? 0,
      });
    }

    return list;
  }, [chatMessages, unreadByThread, userId, activeThread, nameForUser]);

  const setActiveThread = useCallback((thread: ChatThreadId) => {
    setActiveThreadState(thread);
    setDraft("");
  }, []);

  const openPrivateThread = useCallback(
    (targetUserId: string) => {
      if (!canMessagePrivately(targetUserId)) return;
      setActiveThread(targetUserId);
    },
    [canMessagePrivately, setActiveThread],
  );

  const resetUnreadCount = useCallback(() => {
    setSeenIds(new Set(chatMessages.map((m) => m.id)));
  }, [chatMessages]);

  const sendPrivate = useCallback(
    async (msg: string, recipientUserId: string) => {
      const destinationIdentities = identitiesForUser(recipientUserId);
      const clientMessageId = `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const at = Date.now();

      if (destinationIdentities.length === 0) {
        toast.error("That person has left the class.");
        return;
      }
      if (!userId) return;

      const packet: DirectChatMessage = {
        type: "DM",
        toUserId: recipientUserId,
        fromUserId: userId,
        message: msg,
        at,
        clientMessageId,
      };

      await dmSendRef.current?.(encodeDirectChat(packet), {
        reliable: true,
        destinationIdentities,
      });

      // Echo locally — the sender is not a destination of their own packet.
      setDirectMessages((prev) => [
        ...prev,
        {
          id: `dm-self-${clientMessageId}`,
          clientMessageId,
          senderId: userId,
          senderName: localName,
          senderRole: user?.role ?? null,
          recipientId: recipientUserId,
          message: msg,
          isOwn: true,
          timestamp: new Date(at),
        },
      ]);

      const { saveChatMessage } = await import("../api/live-class");
      saveChatMessage(classId, msg, clientMessageId, recipientUserId)
        .catch(() => saveChatMessage(classId, msg, clientMessageId, recipientUserId))
        .catch((err) => {
          console.error("Failed to persist private message", err);
          toast.error("Message sent but not saved — it may not appear after a reload.");
        });
    },
    [classId, identitiesForUser, localName, user?.role, userId],
  );

  const send = useCallback(
    async (msg: string) => {
      if (isSending) return;
      if (!chatEnabled) {
        toast.error("Chat is turned off for this class.");
        return;
      }
      setIsSending(true);
      try {
        if (activeThread !== ROOM_THREAD) {
          if (!canMessagePrivately(activeThread)) {
            toast.error("Private messages are only allowed between you and the coach.");
            return;
          }
          await sendPrivate(msg, activeThread);
          return;
        }

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
    },
    [
      activeThread,
      canMessagePrivately,
      chatEnabled,
      classId,
      isSending,
      livekitSend,
      sendPrivate,
    ],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      activeThread,
      canMessagePrivately,
      chatEnabled,
      chatMessages,
      draft,
      isSending,
      openPrivateThread,
      privateChatEnabled,
      resetUnreadCount,
      send,
      setActiveThread,
      setDraft,
      threadMessages,
      threads,
      unreadCount,
    }),
    [
      activeThread,
      canMessagePrivately,
      chatEnabled,
      chatMessages,
      draft,
      isSending,
      openPrivateThread,
      privateChatEnabled,
      resetUnreadCount,
      send,
      setActiveThread,
      threadMessages,
      threads,
      unreadCount,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useLiveClassChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useLiveClassChat must be used within a ChatProvider");
  }
  return context;
}
