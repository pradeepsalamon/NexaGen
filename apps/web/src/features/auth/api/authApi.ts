import type {
  AuthResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LogoutResponse,
  MessageResponse,
  RefreshSessionResponse,
  RegisterRequest,
  RegisterCoachRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  VerifyEmailRequest
} from "@nexa-chess/types";
import { API_ROUTES } from "@nexa-chess/types";
import { apiFetch } from "../../../lib/api";

export function register(payload: RegisterRequest) {
  return apiFetch<AuthResponse>(API_ROUTES.auth.register, {
    body: payload,
    method: "POST"
  });
}

export function registerCoach(payload: RegisterCoachRequest) {
  return apiFetch<AuthResponse>(API_ROUTES.auth.registerCoach, {
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

export function verifyEmail(payload: VerifyEmailRequest) {
  return apiFetch<MessageResponse>(API_ROUTES.auth.verifyEmail, {
    body: payload,
    method: "POST"
  });
}

export function resendVerification() {
  return apiFetch<MessageResponse>(API_ROUTES.auth.resendVerification, {
    method: "POST"
  });
}
