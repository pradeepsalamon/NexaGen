import { API_ROUTES } from "@nexa-chess/types";
import type {
  CoachRatingsResponse,
  FeedbackFormDto,
  FeedbackFormListResponse,
  FeedbackResponseListQuery,
  FeedbackResponseListResponse,
  MyCoachFeedbackResponse,
  PendingFeedbackQuery,
  PendingFeedbackResponse,
  SkipFeedbackRequest,
  SubmitFeedbackRequest,
  UpsertFeedbackFormRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

function toQuery(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

// ── Student ──

export function getPendingFeedback(query: PendingFeedbackQuery = {}) {
  return apiFetch<PendingFeedbackResponse>(
    API_ROUTES.feedback.pending + toQuery({ classId: query.classId, placement: query.placement })
  );
}

export function submitFeedback(body: SubmitFeedbackRequest) {
  return apiFetch<{ success: true }>(API_ROUTES.feedback.submit, { body, method: "POST" });
}

export function skipFeedback(body: SkipFeedbackRequest) {
  return apiFetch<{ success: true }>(API_ROUTES.feedback.skip, { body, method: "POST" });
}

// ── Coach ──

export function getMyFeedback() {
  return apiFetch<MyCoachFeedbackResponse>(API_ROUTES.feedback.mine);
}

// ── Admin ──

export function listFeedbackForms() {
  return apiFetch<FeedbackFormListResponse>(API_ROUTES.adminFeedback.forms);
}

export function createFeedbackForm(body: UpsertFeedbackFormRequest) {
  return apiFetch<{ form: FeedbackFormDto }>(API_ROUTES.adminFeedback.forms, { body, method: "POST" });
}

export function updateFeedbackForm(id: string, body: UpsertFeedbackFormRequest) {
  return apiFetch<{ form: FeedbackFormDto }>(API_ROUTES.adminFeedback.form(id), { body, method: "PUT" });
}

export function deleteFeedbackForm(id: string) {
  return apiFetch<{ success: true }>(API_ROUTES.adminFeedback.form(id), { method: "DELETE" });
}

export function listFeedbackResponses(query: FeedbackResponseListQuery = {}) {
  return apiFetch<FeedbackResponseListResponse>(
    API_ROUTES.adminFeedback.responses +
      toQuery({
        coachId: query.coachId,
        formId: query.formId,
        page: query.page,
        pageSize: query.pageSize
      })
  );
}

export function getCoachRatings() {
  return apiFetch<CoachRatingsResponse>(API_ROUTES.adminFeedback.coachRatings);
}
