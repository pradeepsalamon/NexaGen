import { API_ROUTES } from "@nexa-gen/types";
import type {
  CoachDashboardResponse,
  CoachBatchesResponse,
  CoachClassListResponse,
  CoachClassResponse,
  CoachStudentsResponse,
  CreateClassRequest,
  UpdateClassRequest
} from "@nexa-gen/types";
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

export async function getUpcomingClasses(): Promise<CoachClassListResponse> {
  return apiFetch(API_ROUTES.coach.upcomingClasses);
}

export async function getClassHistory(): Promise<CoachClassListResponse> {
  return apiFetch(API_ROUTES.coach.classHistory);
}

export async function createClass(data: CreateClassRequest): Promise<CoachClassResponse> {
  return apiFetch(API_ROUTES.coach.createClass, {
    method: "POST",
    body: data
  });
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
