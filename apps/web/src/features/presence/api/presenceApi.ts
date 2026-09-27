import { API_ROUTES, type PresenceHeartbeatResponse } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export const sendPresenceHeartbeat = () =>
  apiFetch<PresenceHeartbeatResponse>(API_ROUTES.presence.heartbeat, { method: "POST" });
