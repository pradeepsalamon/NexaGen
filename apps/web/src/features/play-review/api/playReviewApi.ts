import {
  API_ROUTES,
  type AiPlayReviewSettings,
  type AiReviewConsentState,
  type PlayFeedResponse,
  type PlayItemDetailResponse,
  type PlayReviewRollup,
  type PlaySource,
  type SetAiReviewConsentRequest,
  type UpdateAiPlayReviewSettingsRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// AI play review (docs/AI_PLAY_REVIEW.md). `studentId` null = the signed-in student.

export function getPlayFeed(studentId: string | null, query: { cursor?: string; source?: PlaySource }) {
  const path = studentId ? API_ROUTES.playReview.feed(studentId) : API_ROUTES.playReview.feedMine;
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.source) params.set("source", query.source);
  const qs = params.toString();
  return apiFetch<PlayFeedResponse>(qs ? `${path}?${qs}` : path);
}

export function getPlayItem(studentId: string | null, source: PlaySource, sourceId: string) {
  return apiFetch<PlayItemDetailResponse>(
    studentId ? API_ROUTES.playReview.item(studentId, source, sourceId) : API_ROUTES.playReview.itemMine(source, sourceId)
  );
}

export function getPlayRollup(studentId: string | null) {
  return apiFetch<PlayReviewRollup>(studentId ? API_ROUTES.playReview.rollup(studentId) : API_ROUTES.playReview.rollupMine);
}

export function getAiReviewConsent(studentId: string | null) {
  return apiFetch<AiReviewConsentState>(studentId ? API_ROUTES.playReview.consent(studentId) : API_ROUTES.playReview.consentMine);
}

export function setAiReviewConsent(studentId: string | null, body: SetAiReviewConsentRequest) {
  return apiFetch<AiReviewConsentState>(
    studentId ? API_ROUTES.playReview.consent(studentId) : API_ROUTES.playReview.consentMine,
    { body, method: "PUT" }
  );
}

export function getAiPlayReviewSettings() {
  return apiFetch<AiPlayReviewSettings>(API_ROUTES.playReview.settings);
}

export function updateAiPlayReviewSettings(body: UpdateAiPlayReviewSettingsRequest) {
  return apiFetch<AiPlayReviewSettings>(API_ROUTES.playReview.settings, { body, method: "PATCH" });
}
