import { API_ROUTES, type LiveClassMonitoring } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getLiveClassMonitoring(classId: string): Promise<LiveClassMonitoring> {
  return apiFetch<LiveClassMonitoring>(API_ROUTES.attendance.classLive(classId));
}
