import { API_BASE_URL, apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type AppendTranscriptRequest,
  type AppendTranscriptResponse,
  type LiveClassTranscriptResponse,
  type TranscriptConsentResponse,
} from "@nexa-chess/types";

/** Background write: the caller retries, so it never raises the network toast. */
export const appendTranscript = (classId: string, body: AppendTranscriptRequest) =>
  apiFetch<AppendTranscriptResponse>(API_ROUTES.liveClass.transcript(classId), { body, method: "POST", silent: true });

/** Fire-and-forget write that survives the page unloading (axios cannot keepalive). */
export const appendTranscriptOnUnload = (classId: string, body: AppendTranscriptRequest) => {
  void fetch(`${API_BASE_URL}${API_ROUTES.liveClass.transcript(classId)}`, {
    body: JSON.stringify(body),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
};

export const getTranscriptPage = (classId: string, cursor?: string) =>
  apiFetch<LiveClassTranscriptResponse>(API_ROUTES.liveClass.transcript(classId), { params: { cursor } });

export const getTranscriptConsent = () =>
  apiFetch<TranscriptConsentResponse>(API_ROUTES.liveClass.transcriptConsent());

export const setTranscriptConsent = (consent: boolean) =>
  apiFetch<TranscriptConsentResponse>(API_ROUTES.liveClass.transcriptConsent(), { body: { consent }, method: "PUT" });
