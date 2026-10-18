import { API_ROUTES, type StudentDashboardResponse } from "@nexa-chess/types";
import { apiFetch } from "../../../lib/api";

export async function getStudentDashboard(): Promise<StudentDashboardResponse> {
  return apiFetch<StudentDashboardResponse>(API_ROUTES.student.dashboard);
}
