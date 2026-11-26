import { API_ROUTES } from "@nexa-chess/types";
import type { AddDemoInviteesRequest, AddDemoInviteesResponse, CreateDemoScheduleRequest, DemoScheduleResponse, ListDemoSchedulesResponse, PendingCoachesResponse, PendingStudentsResponse, UpdateCoachStatusRequest, UpdateDemoScheduleRequest, UpdateStudentStatusRequest, CreateDemoClassRequest, UpdateDemoClassRequest, DemoClass, ListDemoClassesResponse, DemoClassDetailsResponse } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";
import { toQueryString, type ListParams } from "@/lib/pagination";

export async function getPendingCoaches(): Promise<PendingCoachesResponse> {
  return apiFetch<PendingCoachesResponse>(API_ROUTES.admin.pendingCoaches);
}

export async function updateCoachStatus({ id, ...body }: { id: string } & UpdateCoachStatusRequest): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(API_ROUTES.admin.updateCoachStatus(id), {
    body,
    method: "PATCH"
  });
}

export async function getPendingStudents(): Promise<PendingStudentsResponse> {
  return apiFetch<PendingStudentsResponse>(API_ROUTES.admin.pendingStudents);
}

export async function updateStudentStatus({ id, ...body }: { id: string } & UpdateStudentStatusRequest): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(API_ROUTES.admin.updateStudentStatus(id), {
    body,
    method: "PATCH"
  });
}

export async function getDemoClasses(params: ListParams = {}): Promise<ListDemoClassesResponse> {
  return apiFetch<ListDemoClassesResponse>(API_ROUTES.admin.demoClasses + toQueryString(params));
}

/**
 * Every demo class overlapping [from, to), all pages (100 at a time): the
 * Upcoming classes page shows a window, never a silently capped first page.
 */
export async function getDemoClassesInWindow(window: { from: string; to: string }): Promise<DemoClass[]> {
  const classes: DemoClass[] = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      from: window.from,
      page: String(page),
      pageSize: "100",
      order: "asc",
      sort: "startsAt",
      to: window.to
    });
    const res = await apiFetch<ListDemoClassesResponse>(`${API_ROUTES.admin.demoClasses}?${query.toString()}`);
    classes.push(...res.classes);
    if (page >= (res.pagination?.totalPages ?? 1) || res.classes.length === 0) break;
  }
  return classes;
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

export async function addDemoInvitees(id: string, body: AddDemoInviteesRequest): Promise<AddDemoInviteesResponse> {
  return apiFetch<AddDemoInviteesResponse>(API_ROUTES.admin.demoClassInvitees(id), {
    body,
    method: "POST"
  });
}

export async function removeDemoInvitee(id: string, registrationId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(API_ROUTES.admin.removeDemoClassInvitee(id, registrationId), {
    method: "DELETE"
  });
}

export async function getDemoSchedules(): Promise<ListDemoSchedulesResponse> {
  return apiFetch<ListDemoSchedulesResponse>(API_ROUTES.admin.demoSchedules);
}

export async function createDemoSchedule(body: CreateDemoScheduleRequest): Promise<DemoScheduleResponse> {
  return apiFetch<DemoScheduleResponse>(API_ROUTES.admin.demoSchedules, { body, method: "POST" });
}

export async function updateDemoSchedule(id: string, body: UpdateDemoScheduleRequest): Promise<DemoScheduleResponse> {
  return apiFetch<DemoScheduleResponse>(API_ROUTES.admin.demoSchedule(id), { body, method: "PATCH" });
}

export async function deleteDemoSchedule(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(API_ROUTES.admin.demoSchedule(id), { method: "DELETE" });
}
