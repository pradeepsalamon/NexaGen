import { API_ROUTES, type AdConsentRequest } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export async function sendAdConsent(body: AdConsentRequest): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(API_ROUTES.leads.adConsent, { body, method: "POST", silent: true });
}
