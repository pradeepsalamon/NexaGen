import { API_ROUTES } from "@nexa-gen/types";
import type { PendingCoachesResponse, UpdateCoachStatusRequest } from "@nexa-gen/types";
import { apiFetch } from "@/lib/api";

export async function getPendingCoaches(): Promise<PendingCoachesResponse> {
  return apiFetch<PendingCoachesResponse>(API_ROUTES.admin.pendingCoaches);
}

export async function updateCoachStatus({ id, ...body }: { id: string } & UpdateCoachStatusRequest): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(API_ROUTES.admin.updateCoachStatus(id), {
    body,
    method: "PATCH"
  });
}
