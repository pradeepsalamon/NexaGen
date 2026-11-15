import {
  API_ROUTES,
  type CoachTeachingResponse,
  type CorrectAttendanceRequest,
  type CorrectAttendanceResponse,
  type LiveClassMonitoring,
  type LiveReliabilityOverview,
  type ReliabilityMetrics,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getLiveClassMonitoring(classId: string): Promise<LiveClassMonitoring> {
  return apiFetch<LiveClassMonitoring>(API_ROUTES.attendance.classLive(classId));
}

export function correctStudentAttendance(
  classId: string,
  studentId: string,
  body: CorrectAttendanceRequest,
): Promise<CorrectAttendanceResponse> {
  return apiFetch<CorrectAttendanceResponse>(API_ROUTES.attendance.correctStudent(classId, studentId), {
    method: "PATCH",
    body,
  });
}

export function getLiveReliabilityOverview(): Promise<LiveReliabilityOverview> {
  return apiFetch<LiveReliabilityOverview>(API_ROUTES.attendance.adminLiveReliability);
}

export function getReliabilityMetrics(days = 30): Promise<ReliabilityMetrics> {
  return apiFetch<ReliabilityMetrics>(
    `${API_ROUTES.attendance.adminReliabilityMetrics}?days=${days}`
  );
}

/** The signed-in coach's own teaching stats and recent classes. */
export function getMyTeaching(): Promise<CoachTeachingResponse> {
  return apiFetch<CoachTeachingResponse>(API_ROUTES.attendance.coach);
}
