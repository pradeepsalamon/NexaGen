import { API_ROUTES } from "@nexa-chess/types";
import type {
  CoachDashboardResponse,
  CoachBatchesResponse,
  CoachClassListResponse,
  CoachClassResponse,
  CoachStudentsResponse,
  UpdateClassRequest
} from "@nexa-chess/types";
import { apiFetch } from "../../../lib/api";

export async function getCoachDashboard(): Promise<CoachDashboardResponse> {
  return apiFetch(API_ROUTES.coach.dashboard);
}

export async function getCoachBatches(): Promise<CoachBatchesResponse> {
  return apiFetch(API_ROUTES.coach.batches);
}

export async function getCoachClasses(): Promise<CoachClassListResponse> {
  return apiFetch(API_ROUTES.coach.classes);
}

/** Soonest first; `limit` caps the list (the dashboard asks for 3). */
export async function getUpcomingClasses(limit?: number): Promise<CoachClassListResponse> {
  return apiFetch(API_ROUTES.coach.upcomingClasses, limit ? { params: { limit } } : {});
}

/** Every class overlapping `[from, to)` (ISO instants), any status — the schedule calendar. */
export async function getCalendarClasses(from: string, to: string): Promise<CoachClassListResponse> {
  return apiFetch(API_ROUTES.coach.calendarClasses, { params: { from, to } });
}

export async function getClassHistory(): Promise<CoachClassListResponse> {
  return apiFetch(API_ROUTES.coach.classHistory);
}

export async function getClassById(id: string): Promise<CoachClassResponse> {
  return apiFetch(API_ROUTES.coach.getClass(id));
}

export async function updateClass(id: string, data: UpdateClassRequest): Promise<CoachClassResponse> {
  return apiFetch(API_ROUTES.coach.updateClass(id), {
    method: "PATCH",
    body: data
  });
}

export async function cancelClass(id: string): Promise<CoachClassResponse> {
  return apiFetch(API_ROUTES.coach.cancelClass(id), {
    method: "PATCH"
  });
}

export async function getCoachStudents(): Promise<CoachStudentsResponse> {
  return apiFetch(API_ROUTES.coach.students);
}
