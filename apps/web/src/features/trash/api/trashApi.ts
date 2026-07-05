import type {
  EmptyTrashResponse,
  TrashActionResponse,
  TrashBulkActionRequest,
  TrashEntity,
  TrashListRequest,
  TrashListResponse
} from "@nexa-gen/types";
import { API_ROUTES } from "@nexa-gen/types";
import { apiFetch } from "@/lib/api";

export function listTrash(params: TrashListRequest) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === "ALL") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return apiFetch<TrashListResponse>(`${API_ROUTES.trash.list}${query ? `?${query}` : ""}`);
}

export function restoreTrashItem(entity: TrashEntity, id: string) {
  return apiFetch<TrashActionResponse>(API_ROUTES.trash.restoreItem(entity, id), {
    method: "POST"
  });
}

export function deleteTrashItemPermanently(entity: TrashEntity, id: string) {
  return apiFetch<TrashActionResponse>(API_ROUTES.trash.deleteItem(entity, id), {
    method: "DELETE"
  });
}

export function bulkRestoreTrashItems(payload: TrashBulkActionRequest) {
  return apiFetch<TrashActionResponse>(API_ROUTES.trash.restoreBulk, {
    body: payload,
    method: "POST"
  });
}

export function bulkDeleteTrashItemsPermanently(
  payload: TrashBulkActionRequest
) {
  return apiFetch<TrashActionResponse>(API_ROUTES.trash.list, {
    body: payload,
    method: "DELETE"
  });
}

export function emptyTrash() {
  return apiFetch<EmptyTrashResponse>(API_ROUTES.trash.empty, {
    method: "DELETE"
  });
}
