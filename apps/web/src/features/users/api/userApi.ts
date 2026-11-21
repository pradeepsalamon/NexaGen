import type {
  CreateUserRequest,
  ResendInviteResponse,
  RosterImportRequest,
  RosterImportResponse,
  TrashActionResponse,
  UpdateExtraRolesRequest,
  UpdateExtraRolesResponse,
  UpdateUserRequest,
  UserListResponse,
  UserResponse
} from "@nexa-chess/types";
import { API_ROUTES } from "@nexa-chess/types";
import { apiFetch } from "../../../lib/api";
import { toQueryString, type ListParams } from "@/lib/pagination";

export function listUsers(params: ListParams = {}) {
  return apiFetch<UserListResponse>(API_ROUTES.users.list + toQueryString(params));
}

export function getUser(userId: string) {
  return apiFetch<UserResponse>(API_ROUTES.users.get(userId));
}

export function createUser(payload: CreateUserRequest) {
  return apiFetch<UserResponse>(API_ROUTES.users.create, {
    body: payload,
    method: "POST"
  });
}

export function updateUser(userId: string, payload: UpdateUserRequest) {
  return apiFetch<UserResponse>(API_ROUTES.users.update(userId), {
    body: payload,
    method: "PATCH"
  });
}

export function archiveUser(userId: string) {
  return apiFetch<UserResponse>(API_ROUTES.users.archive(userId), {
    method: "PATCH"
  });
}

export function restoreUser(userId: string) {
  return apiFetch<UserResponse>(API_ROUTES.users.restore(userId), {
    method: "PATCH"
  });
}

export function deleteUser(userId: string) {
  return apiFetch<TrashActionResponse>(API_ROUTES.users.delete(userId), {
    method: "DELETE"
  });
}

/** "Can also teach" (super admin only, docs/MULTI_ROLE_ACCOUNTS.md). */
export function setExtraRoles(userId: string, payload: UpdateExtraRolesRequest) {
  return apiFetch<UpdateExtraRolesResponse>(API_ROUTES.users.extraRoles(userId), {
    body: payload,
    method: "PUT"
  });
}

/** Roster import (docs/ROSTER_IMPORT.md): checks every row, creates nothing. */
export function previewRosterImport(payload: RosterImportRequest) {
  return apiFetch<RosterImportResponse>(API_ROUTES.users.importPreview, { body: payload, method: "POST" });
}

export function importRoster(payload: RosterImportRequest) {
  return apiFetch<RosterImportResponse>(API_ROUTES.users.import, { body: payload, method: "POST" });
}

/** A fresh set-your-password link for an account that has never signed in. */
export function resendAccountInvite(userId: string) {
  return apiFetch<ResendInviteResponse>(API_ROUTES.users.invite(userId), { method: "POST" });
}
