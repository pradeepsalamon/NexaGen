import {
  API_ROUTES,
  type LiveClassMonitoring,
  type LiveReliabilityOverview,
  type ReliabilityMetrics,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getLiveClassMonitoring(classId: string): Promise<LiveClassMonitoring> {
  return apiFetch<LiveClassMonitoring>(API_ROUTES.attendance.classLive(classId));
}

export function getLiveReliabilityOverview(): Promise<LiveReliabilityOverview> {
  return apiFetch<LiveReliabilityOverview>(API_ROUTES.attendance.adminLiveReliability);
}

export function getReliabilityMetrics(days = 30): Promise<ReliabilityMetrics> {
  return apiFetch<ReliabilityMetrics>(
    `${API_ROUTES.attendance.adminReliabilityMetrics}?days=${days}`
  );
}
