import { API_ROUTES } from "@nexa-chess/types";
import type {
  LiveClassMonitorResponse,
  SpectateLiveClassRequest,
  SpectateLiveClassResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function listLiveClasses() {
  return apiFetch<LiveClassMonitorResponse>(API_ROUTES.adminLiveClasses.list);
}

export function spectateLiveClass(classId: string, body: SpectateLiveClassRequest = {}) {
  return apiFetch<SpectateLiveClassResponse>(API_ROUTES.adminLiveClasses.spectate(classId), {
    method: "POST",
    body
  });
}
