import type {
  AuthResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LogoutResponse,
  MessageResponse,
  RefreshSessionResponse,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest
} from "@nexa-gen/types";
import { API_ROUTES } from "@nexa-gen/types";
import { apiFetch } from "../../../lib/api";

export function register(payload: RegisterRequest) {
  return apiFetch<AuthResponse>(API_ROUTES.auth.register, {
    body: payload,
    method: "POST"
  });
}

export function login(payload: LoginRequest) {
  return apiFetch<AuthResponse>(API_ROUTES.auth.login, {
    body: payload,
    method: "POST"
  });
}

export function refreshSession() {
  return apiFetch<RefreshSessionResponse>(API_ROUTES.auth.refresh, {
    method: "POST"
  });
}

export function logout() {
  return apiFetch<LogoutResponse>(API_ROUTES.auth.logout, {
    method: "POST"
  });
}

export function getCurrentUser() {
  return apiFetch<AuthResponse>(API_ROUTES.auth.me);
}

export function updateProfile(payload: UpdateProfileRequest) {
  return apiFetch<AuthResponse>(API_ROUTES.auth.profile, {
    body: payload,
    method: "PATCH"
  });
}

export function forgotPassword(payload: ForgotPasswordRequest) {
  return apiFetch<ForgotPasswordResponse>(API_ROUTES.auth.forgotPassword, {
    body: payload,
    method: "POST"
  });
}

export function resetPassword(payload: ResetPasswordRequest) {
  return apiFetch<MessageResponse>(API_ROUTES.auth.resetPassword, {
    body: payload,
    method: "POST"
  });
}
