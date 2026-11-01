import { API_ROUTES } from "@nexa-chess/types";
import type {
  BulkLibraryActivityRequest,
  BulkLibraryActivityResponse,
  CreateLibraryActivityRequest,
  LibraryActivityResponse,
  LibraryListQuery,
  LibraryListResponse,
  UpdateLibraryActivityRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

function toQuery(query: LibraryListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const getLibrary = (query: LibraryListQuery) =>
  apiFetch<LibraryListResponse>(`${API_ROUTES.puzzles.library}${toQuery(query)}`);

export const getActivity = (id: string) => apiFetch<LibraryActivityResponse>(API_ROUTES.puzzles.activity(id));

export const createActivity = (body: CreateLibraryActivityRequest) =>
  apiFetch<LibraryActivityResponse>(API_ROUTES.puzzles.activities, { body, method: "POST" });

export const updateActivity = (id: string, body: UpdateLibraryActivityRequest) =>
  apiFetch<LibraryActivityResponse>(API_ROUTES.puzzles.activity(id), { body, method: "PATCH" });

export const deleteActivity = (id: string) =>
  apiFetch<{ success: true }>(API_ROUTES.puzzles.activity(id), { method: "DELETE" });

export const setActivityPublished = (id: string, published: boolean) =>
  apiFetch<LibraryActivityResponse>(API_ROUTES.puzzles.activityPublish(id), { method: published ? "POST" : "DELETE" });

export const setActivityArchived = (id: string, archived: boolean) =>
  apiFetch<LibraryActivityResponse>(API_ROUTES.puzzles.activityArchive(id), { method: archived ? "POST" : "DELETE" });

export const duplicateActivity = (id: string) =>
  apiFetch<LibraryActivityResponse>(API_ROUTES.puzzles.activityDuplicate(id), { method: "POST" });

export const bulkActivities = (body: BulkLibraryActivityRequest) =>
  apiFetch<BulkLibraryActivityResponse>(API_ROUTES.puzzles.activityBulk, { body, method: "POST" });

export function uploadActivityImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<{ url: string }>(API_ROUTES.puzzles.activityImage, {
    body: formData,
    // Overrides the client's JSON default, which would make axios serialize the FormData.
    headers: { "Content-Type": "multipart/form-data" },
    method: "POST"
  });
}
