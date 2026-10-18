import { API_ROUTES } from "@nexa-chess/types";
import type {
  RevisionNextResponse,
  RevisionRecommendRequest,
  RevisionRecommendResponse,
  RevisionReportResponse,
  RevisionReviewRequest,
  RevisionReviewResponse,
  RevisionSessionResponse,
  RevisionSkipRequest,
  RevisionSummaryResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getRevisionSummary() {
  return apiFetch<RevisionSummaryResponse>(API_ROUTES.revision.summaryMine);
}

export function getRevisionSession() {
  return apiFetch<RevisionSessionResponse>(API_ROUTES.revision.sessionMine);
}

/** The open item, or a fresh attempt at the head of the queue (null when nothing is due). */
export function nextRevisionItem() {
  return apiFetch<RevisionNextResponse>(API_ROUTES.revision.next, { method: "POST" });
}

export function reviewRevisionItem(body: RevisionReviewRequest) {
  return apiFetch<RevisionReviewResponse>(API_ROUTES.revision.review, { body, method: "POST" });
}

export function skipRevisionItem(body: RevisionSkipRequest) {
  return apiFetch<RevisionSummaryResponse>(API_ROUTES.revision.skip, { body, method: "POST" });
}

/** `studentId` null = the signed-in student's own report. */
export function getRevisionReport(studentId: string | null) {
  return apiFetch<RevisionReportResponse>(
    studentId ? API_ROUTES.revision.student(studentId) : API_ROUTES.revision.reportMine
  );
}

export function recommendRevision(studentId: string, body: RevisionRecommendRequest) {
  return apiFetch<RevisionRecommendResponse>(API_ROUTES.revision.recommend(studentId), { body, method: "POST" });
}

export function removeRevisionRecommendation(studentId: string, itemId: string) {
  return apiFetch<{ removed: true }>(API_ROUTES.revision.recommendation(studentId, itemId), { method: "DELETE" });
}
