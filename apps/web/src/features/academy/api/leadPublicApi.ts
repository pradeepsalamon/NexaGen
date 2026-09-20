import { API_ROUTES } from "@nexa-chess/types";
import type { CreateLeadRequest, CreateLeadResponse, TrackVisitRequest } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export async function createLead(body: CreateLeadRequest): Promise<CreateLeadResponse> {
  return apiFetch<CreateLeadResponse>(API_ROUTES.leads.create, {
    body,
    method: "POST"
  });
}

export async function trackVisit(body: TrackVisitRequest): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(API_ROUTES.leads.tracking, {
    body,
    method: "POST"
  });
}
