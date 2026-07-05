import type {
  EmptyTrashResponse,
  TrashActionResponse,
  TrashBulkActionRequest,
  TrashEntity,
  TrashListRequest,
  TrashListResponse
} from "@nexa-gen/types";
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
  return apiFetch<TrashListResponse>(`/admin/trash${query ? `?${query}` : ""}`);
}

export function restoreTrashItem(entity: TrashEntity, id: string) {
  return apiFetch<TrashActionResponse>(`/admin/trash/${entity}/${id}/restore`, {
    method: "POST"
  });
}

export function deleteTrashItemPermanently(entity: TrashEntity, id: string) {
  return apiFetch<TrashActionResponse>(`/admin/trash/${entity}/${id}`, {
    method: "DELETE"
  });
}

export function bulkRestoreTrashItems(payload: TrashBulkActionRequest) {
  return apiFetch<TrashActionResponse>("/admin/trash/restore", {
    body: payload,
    method: "POST"
  });
}

export function bulkDeleteTrashItemsPermanently(
  payload: TrashBulkActionRequest
) {
  return apiFetch<TrashActionResponse>("/admin/trash", {
    body: payload,
    method: "DELETE"
  });
}

export function emptyTrash() {
  return apiFetch<EmptyTrashResponse>("/admin/trash/empty", {
    method: "DELETE"
  });
}
