import { API_ROUTES } from "@nexa-chess/types";
import type { PendingCoachesResponse, UpdateCoachStatusRequest, CreateDemoClassRequest, UpdateDemoClassRequest, DemoClass, ListDemoClassesResponse, DemoClassDetailsResponse } from "@nexa-chess/types";
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

export async function getDemoClasses(): Promise<ListDemoClassesResponse> {
  return apiFetch<ListDemoClassesResponse>(API_ROUTES.admin.demoClasses);
}

export async function createDemoClass(data: CreateDemoClassRequest): Promise<DemoClass> {
  const res = await apiFetch<{ class: DemoClass }>(API_ROUTES.admin.demoClasses, {
    body: JSON.stringify(data),
    method: "POST"
  });
  return res.class;
}

export async function updateDemoClass(id: string, data: UpdateDemoClassRequest): Promise<DemoClass> {
  const res = await apiFetch<{ class: DemoClass }>(API_ROUTES.admin.updateDemoClass(id), {
    body: JSON.stringify(data),
    method: "PATCH"
  });
  return res.class;
}

export async function cancelDemoClass(id: string): Promise<DemoClass> {
  const res = await apiFetch<{ class: DemoClass }>(API_ROUTES.admin.cancelDemoClass(id), {
    method: "PATCH"
  });
  return res.class;
}

export async function restoreDemoClass(id: string): Promise<DemoClass> {
  const res = await apiFetch<{ class: DemoClass }>(API_ROUTES.admin.restoreDemoClass(id), {
    method: "PATCH"
  });
  return res.class;
}

export async function getDemoClassDetails(id: string): Promise<DemoClassDetailsResponse> {
  return await apiFetch<DemoClassDetailsResponse>(API_ROUTES.admin.demoClassDetails(id));
}
