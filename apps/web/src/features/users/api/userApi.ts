import type {
  CreateUserRequest,
  TrashActionResponse,
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
