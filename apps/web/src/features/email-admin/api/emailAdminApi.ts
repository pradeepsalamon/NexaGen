import { API_ROUTES } from "@nexa-chess/types";
import type {
  DirectEmailDto,
  DirectEmailListResponse,
  EmailAdminOverviewResponse,
  EmailVerificationPolicy,
  SendDirectEmailRequest,
  UnverifiedAccountListResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";
import { toQueryString, type ListParams } from "@/lib/pagination";

export function getEmailOverview() {
  return apiFetch<EmailAdminOverviewResponse>(API_ROUTES.adminEmail.overview);
}

export function setEmailVerificationPolicy(policy: EmailVerificationPolicy) {
  return apiFetch<{ policy: EmailVerificationPolicy }>(API_ROUTES.adminEmail.policy, {
    body: { policy },
    method: "PUT"
  });
}

export function listUnverifiedAccounts(params: ListParams) {
  return apiFetch<UnverifiedAccountListResponse>(API_ROUTES.adminEmail.unverified + toQueryString(params));
}

export function verifyAllAccounts() {
  return apiFetch<{ count: number }>(API_ROUTES.adminEmail.verifyAll, { method: "POST" });
}

export function setEmailVerified(userId: string, verified: boolean) {
  return apiFetch<{ isEmailVerified: boolean }>(API_ROUTES.adminEmail.verification(userId), {
    body: { verified },
    method: "PUT"
  });
}

export function sendVerificationLink(userId: string) {
  return apiFetch<{ ok: true }>(API_ROUTES.adminEmail.verificationLink(userId), { method: "POST" });
}

export function sendDirectEmail(userId: string, payload: SendDirectEmailRequest) {
  return apiFetch<DirectEmailDto>(API_ROUTES.adminEmail.send(userId), { body: payload, method: "POST" });
}

export function listSentEmails(params: ListParams) {
  return apiFetch<DirectEmailListResponse>(API_ROUTES.adminEmail.sent + toQueryString(params));
}
