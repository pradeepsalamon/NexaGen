import type {
  BatchAssignableUsersResponse,
  BatchListResponse,
  BatchResponse,
  CreateBatchRequest,
  UpdateBatchRequest
} from "@nexa-gen/types";
import { apiFetch } from "../../../lib/api";

export function listBatches() {
  return apiFetch<BatchListResponse>("/batches");
}

export function getAssignableBatchUsers() {
  return apiFetch<BatchAssignableUsersResponse>("/batches/assignable-users");
}

export function createBatch(payload: CreateBatchRequest) {
  return apiFetch<BatchResponse>("/batches", {
    body: payload,
    method: "POST"
  });
}

export function updateBatch(batchId: string, payload: UpdateBatchRequest) {
  return apiFetch<BatchResponse>(`/batches/${batchId}`, {
    body: payload,
    method: "PATCH"
  });
}

export function archiveBatch(batchId: string) {
  return apiFetch<BatchResponse>(`/batches/${batchId}/archive`, {
    method: "PATCH"
  });
}

export function restoreBatch(batchId: string) {
  return apiFetch<BatchResponse>(`/batches/${batchId}/restore`, {
    method: "PATCH"
  });
}
