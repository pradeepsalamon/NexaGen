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
import { apiFetch } from "../../../lib/api";

export function register(payload: RegisterRequest) {
  return apiFetch<AuthResponse>("/auth/register", {
    body: payload,
    method: "POST"
  });
}

export function login(payload: LoginRequest) {
  return apiFetch<AuthResponse>("/auth/login", {
    body: payload,
    method: "POST"
  });
}

export function refreshSession() {
  return apiFetch<RefreshSessionResponse>("/auth/refresh", {
    method: "POST"
  });
}

export function logout() {
  return apiFetch<LogoutResponse>("/auth/logout", {
    method: "POST"
  });
}

export function getCurrentUser() {
  return apiFetch<AuthResponse>("/auth/me");
}

export function updateProfile(payload: UpdateProfileRequest) {
  return apiFetch<AuthResponse>("/auth/profile", {
    body: payload,
    method: "PATCH"
  });
}

export function forgotPassword(payload: ForgotPasswordRequest) {
  return apiFetch<ForgotPasswordResponse>("/auth/forgot-password", {
    body: payload,
    method: "POST"
  });
}

export function resetPassword(payload: ResetPasswordRequest) {
  return apiFetch<MessageResponse>("/auth/reset-password", {
    body: payload,
    method: "POST"
  });
}
