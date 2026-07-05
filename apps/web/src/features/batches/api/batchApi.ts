import type {
  BatchAssignableUsersResponse,
  BatchListResponse,
  BatchResponse,
  CreateBatchRequest,
  TrashActionResponse,
  UpdateBatchRequest
} from "@nexa-gen/types";
import { API_ROUTES } from "@nexa-gen/types";
import { apiFetch } from "../../../lib/api";

export function listBatches() {
  return apiFetch<BatchListResponse>(API_ROUTES.batches.list);
}

export function getAssignableBatchUsers() {
  return apiFetch<BatchAssignableUsersResponse>(API_ROUTES.batches.assignableUsers);
}

export function createBatch(payload: CreateBatchRequest) {
  return apiFetch<BatchResponse>(API_ROUTES.batches.create, {
    body: payload,
    method: "POST"
  });
}

export function updateBatch(batchId: string, payload: UpdateBatchRequest) {
  return apiFetch<BatchResponse>(API_ROUTES.batches.update(batchId), {
    body: payload,
    method: "PATCH"
  });
}

export function archiveBatch(batchId: string) {
  return apiFetch<BatchResponse>(API_ROUTES.batches.archive(batchId), {
    method: "PATCH"
  });
}

export function restoreBatch(batchId: string) {
  return apiFetch<BatchResponse>(API_ROUTES.batches.restore(batchId), {
    method: "PATCH"
  });
}

export function deleteBatch(batchId: string) {
  return apiFetch<TrashActionResponse>(API_ROUTES.batches.delete(batchId), {
    method: "DELETE"
  });
}
