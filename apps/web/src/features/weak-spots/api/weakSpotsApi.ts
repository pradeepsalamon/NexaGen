import {
  API_ROUTES,
  type ReadWeakSpotTipRequest,
  type TacticMotif,
  type WeakSpotHomeworkRequest,
  type WeakSpotHomeworkResponse,
  type WeakSpotProfileResponse,
  type WeakSpotTipsResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// Weak spots (docs/WEAK_SPOTS.md): the staff view, the student's own card,
// the academy's tip reading list and Make homework.

export const getWeakSpots = (studentId: string) => apiFetch<WeakSpotProfileResponse>(API_ROUTES.playReview.weakSpots(studentId));

export const getMyWeakSpots = () => apiFetch<WeakSpotProfileResponse>(API_ROUTES.playReview.weakSpotsMine);

export const makeWeakSpotHomework = (studentId: string, body: WeakSpotHomeworkRequest) =>
  apiFetch<WeakSpotHomeworkResponse>(API_ROUTES.playReview.weakSpotHomework(studentId), { body, method: "POST" });

export const getWeakSpotTips = () => apiFetch<WeakSpotTipsResponse>(API_ROUTES.playReview.weakSpotTips);

export const readWeakSpotTip = (motif: TacticMotif, body: ReadWeakSpotTipRequest) =>
  apiFetch<WeakSpotTipsResponse>(API_ROUTES.playReview.weakSpotTip(motif), { body, method: "PUT" });

export const unreadWeakSpotTip = (motif: TacticMotif) =>
  apiFetch<WeakSpotTipsResponse>(API_ROUTES.playReview.weakSpotTip(motif), { method: "DELETE" });
