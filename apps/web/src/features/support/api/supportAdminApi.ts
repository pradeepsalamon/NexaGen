import { API_ROUTES } from "@nexa-chess/types";
import type {
  SupportMessageItem,
  SupportMessagePage,
  SupportNoteRequest,
  SupportPerson,
  SupportReplyRequest,
  SupportSavedReplyItem,
  SupportSavedReplyRequest,
  SupportTicketCounts,
  SupportTicketDetail,
  SupportTicketListQuery,
  SupportTicketListResponse,
  SupportUnansweredListQuery,
  SupportUnansweredQuestionListResponse,
  UpdateSupportTicketRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

/** The list filters the API takes (`supportTicketListQuerySchema`); empty values are left out. */
export function supportListQueryString(params: SupportTicketListQuery): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "ALL") continue;
    if (key === "page" && Number(value) <= 1) continue;
    sp.set(key, String(value));
  }
  const query = sp.toString();
  return query ? `?${query}` : "";
}

export function getSupportTickets(params: SupportTicketListQuery): Promise<SupportTicketListResponse> {
  return apiFetch<SupportTicketListResponse>(API_ROUTES.adminSupport.tickets + supportListQueryString(params));
}

export function getSupportCounts(): Promise<SupportTicketCounts> {
  return apiFetch<SupportTicketCounts>(API_ROUTES.adminSupport.counts);
}

export function getSupportAgents(): Promise<SupportPerson[]> {
  return apiFetch<SupportPerson[]>(API_ROUTES.adminSupport.agents);
}

export function getSupportTicket(id: string): Promise<SupportTicketDetail> {
  return apiFetch<SupportTicketDetail>(API_ROUTES.adminSupport.ticket(id));
}

export function getSupportMessages(id: string, cursor?: string): Promise<SupportMessagePage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch<SupportMessagePage>(API_ROUTES.adminSupport.messages(id) + query);
}

export function updateSupportTicket(id: string, body: UpdateSupportTicketRequest): Promise<SupportTicketDetail> {
  return apiFetch<SupportTicketDetail>(API_ROUTES.adminSupport.ticket(id), { body, method: "PATCH" });
}

export function replyToSupportTicket(id: string, body: SupportReplyRequest): Promise<SupportMessageItem> {
  return apiFetch<SupportMessageItem>(API_ROUTES.adminSupport.reply(id), { body, method: "POST" });
}

export function addSupportNote(id: string, body: SupportNoteRequest): Promise<SupportTicketDetail> {
  return apiFetch<SupportTicketDetail>(API_ROUTES.adminSupport.notes(id), { body, method: "POST" });
}

export function takeOverSupportTicket(id: string): Promise<SupportTicketDetail> {
  return apiFetch<SupportTicketDetail>(API_ROUTES.adminSupport.takeOver(id), { method: "POST" });
}

export function returnSupportTicketToBot(id: string): Promise<SupportTicketDetail> {
  return apiFetch<SupportTicketDetail>(API_ROUTES.adminSupport.returnToBot(id), { method: "POST" });
}

export function getSupportSavedReplies(): Promise<SupportSavedReplyItem[]> {
  return apiFetch<SupportSavedReplyItem[]>(API_ROUTES.adminSupport.savedReplies);
}

export function createSupportSavedReply(body: SupportSavedReplyRequest): Promise<SupportSavedReplyItem> {
  return apiFetch<SupportSavedReplyItem>(API_ROUTES.adminSupport.savedReplies, { body, method: "POST" });
}

export function updateSupportSavedReply(id: string, body: SupportSavedReplyRequest): Promise<SupportSavedReplyItem> {
  return apiFetch<SupportSavedReplyItem>(API_ROUTES.adminSupport.savedReply(id), { body, method: "PUT" });
}

export function deleteSupportSavedReply(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(API_ROUTES.adminSupport.savedReply(id), { method: "DELETE" });
}

export function getSupportUnanswered(params: SupportUnansweredListQuery): Promise<SupportUnansweredQuestionListResponse> {
  return apiFetch<SupportUnansweredQuestionListResponse>(API_ROUTES.adminSupport.unanswered + supportListQueryString(params));
}

export function dismissSupportUnanswered(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(API_ROUTES.adminSupport.dismissUnanswered(id), { method: "POST" });
}
