import type {
  AuthResponse,
  EmailVerificationStatusResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  MessageResponse,
  MfaDisableRequest,
  MfaEnableRequest,
  MfaEnableResponse,
  MfaSetupResponse,
  MfaStatusResponse,
  MfaVerifyRequest,
  RefreshSessionResponse,
  RegisterRequest,
  RegisterCoachRequest,
  RegisterCoachResponse,
  RegisterResponse,
  ResetPasswordRequest,
  UpdateProfileRequest,
  VerifyEmailRequest
} from "@nexa-chess/types";
import { API_ROUTES } from "@nexa-chess/types";
import { apiFetch } from "../../../lib/api";

export function register(payload: RegisterRequest) {
  return apiFetch<RegisterResponse>(API_ROUTES.auth.register, {
    body: payload,
    method: "POST"
  });
}

export function registerCoach(payload: RegisterCoachRequest) {
  return apiFetch<RegisterCoachResponse>(API_ROUTES.auth.registerCoach, {
    body: payload,
    method: "POST"
  });
}

export function login(payload: LoginRequest) {
  return apiFetch<LoginResponse>(API_ROUTES.auth.login, {
    body: payload,
    method: "POST"
  });
}

export function verifyMfa(payload: MfaVerifyRequest) {
  return apiFetch<AuthResponse>(API_ROUTES.auth.mfaVerify, {
    body: payload,
    method: "POST"
  });
}

export function getMfaStatus() {
  return apiFetch<MfaStatusResponse>(API_ROUTES.auth.mfa);
}

/** Pass the login challenge token when enrolling mid-login; omit it from settings. */
export function startMfaSetup(challengeToken?: string) {
  return apiFetch<MfaSetupResponse>(API_ROUTES.auth.mfaSetup, {
    body: { challengeToken },
    method: "POST"
  });
}

export function enableMfa(payload: MfaEnableRequest) {
  return apiFetch<MfaEnableResponse>(API_ROUTES.auth.mfaEnable, {
    body: payload,
    method: "POST"
  });
}

export function disableMfa(payload: MfaDisableRequest) {
  return apiFetch<{ signedOut: boolean }>(API_ROUTES.auth.mfaDisable, {
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

export function getEmailVerificationStatus() {
  return apiFetch<EmailVerificationStatusResponse>(API_ROUTES.auth.emailVerificationStatus, { silent: true });
}

export function resendVerification() {
  return apiFetch<MessageResponse>(API_ROUTES.auth.resendVerification, {
    method: "POST"
  });
}
