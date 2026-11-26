import { API_ROUTES, type WeakSpotProfileResponse } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// Weak spots (docs/WEAK_SPOTS.md). Phase A: the student's coach and admins.

export const getWeakSpots = (studentId: string) => apiFetch<WeakSpotProfileResponse>(API_ROUTES.playReview.weakSpots(studentId));
