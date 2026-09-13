import { API_ROUTES } from "@nexa-chess/types";
import type {
  AnnouncementListResponse,
  CreateAnnouncementRequest,
  CreateAnnouncementResponse,
  MessageDeliveryItem,
  MessageDeliveryListResponse,
  MessageDeliveryQuery,
  MessagingEvent,
  MessagingRuleItem,
  MessagingRuleListResponse,
  TestMessagingRuleRequest,
  TestMessagingRuleResponse,
  UpdateMessagingRuleRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getMessagingRules(): Promise<MessagingRuleListResponse> {
  return apiFetch(API_ROUTES.messaging.rules);
}

export function updateMessagingRule(
  event: MessagingEvent,
  data: UpdateMessagingRuleRequest
): Promise<MessagingRuleItem> {
  return apiFetch(API_ROUTES.messaging.rule(event), { method: "PUT", body: data });
}

export function testMessagingRule(
  event: MessagingEvent,
  data: TestMessagingRuleRequest
): Promise<TestMessagingRuleResponse> {
  return apiFetch(API_ROUTES.messaging.testRule(event), { method: "POST", body: data });
}

export function getMessageDeliveries(
  params: Partial<MessageDeliveryQuery> = {}
): Promise<MessageDeliveryListResponse> {
  const search = new URLSearchParams();
  if (params.event) search.set("event", params.event);
  if (params.status) search.set("status", params.status);
  if (params.channel) search.set("channel", params.channel);
  if (params.limit) search.set("limit", String(params.limit));

  const query = search.toString();
  return apiFetch(
    query ? `${API_ROUTES.messaging.deliveries}?${query}` : API_ROUTES.messaging.deliveries
  );
}

export function retryMessageDelivery(id: string): Promise<MessageDeliveryItem> {
  return apiFetch(API_ROUTES.messaging.retryDelivery(id), { method: "POST" });
}

export function getAnnouncements(): Promise<AnnouncementListResponse> {
  return apiFetch(API_ROUTES.announcements.list);
}

export function createAnnouncement(
  data: CreateAnnouncementRequest
): Promise<CreateAnnouncementResponse> {
  return apiFetch(API_ROUTES.announcements.create, { method: "POST", body: data });
}

export function deleteAnnouncement(id: string): Promise<{ success: boolean }> {
  return apiFetch(API_ROUTES.announcements.delete(id), { method: "DELETE" });
}
