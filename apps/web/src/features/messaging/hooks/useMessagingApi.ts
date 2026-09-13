import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateAnnouncementRequest,
  MessageDeliveryQuery,
  MessagingEvent,
  TestMessagingRuleRequest,
  UpdateMessagingRuleRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  getMessageDeliveries,
  getMessagingRules,
  retryMessageDelivery,
  testMessagingRule,
  updateMessagingRule
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

export function useMessageDeliveries(params: Partial<MessageDeliveryQuery> = {}) {
  return useQuery({
    queryKey: queryKeys.messaging.deliveries(params),
    queryFn: () => getMessageDeliveries(params)
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

export function useAnnouncements() {
  return useQuery({
    queryKey: queryKeys.messaging.announcements,
    queryFn: getAnnouncements
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

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.messaging.announcements
      });
      toast.success({ title: "Announcement removed from the dashboard feed" });
    }
  });
}
