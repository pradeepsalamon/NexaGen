import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import type {
  AnnouncementListResponse,
  CreateAnnouncementRequest,
  MessageDeliveryListResponse,
  MessageDeliveryQuery,
  MessagingEvent,
  SystemMessageKey,
  TestMessagingRuleRequest,
  TestSystemMessageRequest,
  UpdateMessagingRuleRequest,
  UpdateSystemMessageRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  getMessageDeliveries,
  getMessagingRules,
  getSystemMessages,
  retryMessageDelivery,
  testMessagingRule,
  testSystemMessage,
  updateMessagingRule,
  updateSystemMessage
} from "../api/messagingApi";

export function useMessagingRules() {
  return useQuery({
    queryKey: queryKeys.messaging.rules,
    queryFn: getMessagingRules
  });
}

export function useUpdateMessagingRule() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      event,
      data
    }: {
      event: MessagingEvent;
      data: UpdateMessagingRuleRequest;
    }) => updateMessagingRule(event, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messaging.rules });
      toast.success({ title: "Rule saved" });
    }
  });
}

/** A test send is an outbound message — never undoable, so it is not wrapped. */
export function useTestMessagingRule() {
  return useMutation({
    mutationFn: ({
      event,
      data
    }: {
      event: MessagingEvent;
      data: TestMessagingRuleRequest;
    }) => testMessagingRule(event, data)
  });
}

export function useSystemMessages() {
  return useQuery({
    queryKey: queryKeys.messaging.systemMessages,
    queryFn: getSystemMessages
  });
}

export function useUpdateSystemMessage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ data, key }: { data: UpdateSystemMessageRequest; key: SystemMessageKey }) =>
      updateSystemMessage(key, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messaging.systemMessages });
      toast.success({ title: "Message saved" });
    }
  });
}

/** A test send is an outbound message — never undoable, so it is not wrapped. */
export function useTestSystemMessage() {
  return useMutation({
    mutationFn: ({ data, key }: { data: TestSystemMessageRequest; key: SystemMessageKey }) =>
      testSystemMessage(key, data)
  });
}

/** Keyset-paged, newest first; the list grows as the user scrolls (`InfiniteScrollTrigger`). */
export function useMessageDeliveries(params: Omit<Partial<MessageDeliveryQuery>, "cursor"> = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.messaging.deliveries(params),
    queryFn: ({ pageParam }) => getMessageDeliveries({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: MessageDeliveryListResponse) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData
  });
}

/** Re-queues a failed message; the cron picks it up on its next sweep. */
export function useRetryMessageDelivery() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => retryMessageDelivery(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messaging.all });
      toast.success({ title: "Queued for another try" });
    }
  });
}

/** Keyset-paged, newest first; the list grows as the user scrolls (`InfiniteScrollTrigger`). */
export function useAnnouncements() {
  return useInfiniteQuery({
    queryKey: queryKeys.messaging.announcements,
    queryFn: ({ pageParam }) => getAnnouncements(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: AnnouncementListResponse) => last.nextCursor ?? undefined
  });
}

/**
 * Publishing sends real messages, so this is deliberately not an undoable
 * mutation: nothing can recall a WhatsApp message once it has left
 * (see lib/undo/README.md — outbound sends are a policy exclusion).
 */
export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAnnouncementRequest) => createAnnouncement(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messaging.all });
    }
  });
}

/**
 * Deferred (no restore endpoint): the caller hides the row via onSchedule, and
 * the delete is only sent once the undo window passes.
 */
export function useDeleteAnnouncement(options: {
  onSchedule?: (id: string) => void;
  onCancel?: (id: string) => void;
} = {}) {
  return useUndoableMutation<string, unknown>({
    strategy: "defer",
    mutationFn: (id) => deleteAnnouncement(id),
    undo: async () => {},
    toast: () => ({ title: "Announcement removed from the dashboard feed" }),
    invalidates: [queryKeys.messaging.announcements],
    onSchedule: options.onSchedule,
    onCancel: options.onCancel
  });
}
