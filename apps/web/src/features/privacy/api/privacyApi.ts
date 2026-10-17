import {
  API_ROUTES,
  type AccountDeletionRequestListResponse,
  type AccountDeletionRequestResponse,
  type CreateAccountDeletionRequest,
  type MyAccountDeletionResponse,
  type PersonalDataExport,
  type RejectAccountDeletionRequest,
  type ResolveAccountDeletionRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getMyDataExport(): Promise<PersonalDataExport> {
  return apiFetch<PersonalDataExport>(API_ROUTES.privacy.dataExport);
}

export function getMyDeletionRequest(): Promise<MyAccountDeletionResponse> {
  return apiFetch<MyAccountDeletionResponse>(API_ROUTES.privacy.deletionRequest);
}

export function requestAccountDeletion(body: CreateAccountDeletionRequest): Promise<AccountDeletionRequestResponse> {
  return apiFetch<AccountDeletionRequestResponse>(API_ROUTES.privacy.deletionRequest, { body, method: "POST" });
}

export function withdrawAccountDeletion(): Promise<MyAccountDeletionResponse> {
  return apiFetch<MyAccountDeletionResponse>(API_ROUTES.privacy.withdrawDeletionRequest, { method: "POST" });
}

export function listDeletionRequests(): Promise<AccountDeletionRequestListResponse> {
  return apiFetch<AccountDeletionRequestListResponse>(API_ROUTES.adminPrivacy.deletionRequests);
}

export function completeDeletionRequest(id: string, body: ResolveAccountDeletionRequest) {
  return apiFetch<AccountDeletionRequestResponse>(API_ROUTES.adminPrivacy.completeDeletionRequest(id), {
    body,
    method: "POST"
  });
}

export function rejectDeletionRequest(id: string, body: RejectAccountDeletionRequest) {
  return apiFetch<AccountDeletionRequestResponse>(API_ROUTES.adminPrivacy.rejectDeletionRequest(id), {
    body,
    method: "POST"
  });
}
