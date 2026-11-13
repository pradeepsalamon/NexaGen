import { API_ROUTES } from "@nexa-chess/types";
import type { EmailPreferencesDto, EmailUnsubscribeRequest } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getEmailPreferences() {
  return apiFetch<EmailPreferencesDto>(API_ROUTES.emailPreferences.mine);
}

export function updateEmailPreferences(notificationEmails: boolean) {
  return apiFetch<EmailPreferencesDto>(API_ROUTES.emailPreferences.mine, {
    body: { notificationEmails },
    method: "PUT"
  });
}

/** The link in an email: no session needed, and the page shows its own error. */
export function setEmailPreferencesByLink(body: EmailUnsubscribeRequest) {
  return apiFetch<EmailPreferencesDto>(API_ROUTES.emailPreferences.unsubscribe, {
    body,
    method: "POST",
    silent: true
  });
}
