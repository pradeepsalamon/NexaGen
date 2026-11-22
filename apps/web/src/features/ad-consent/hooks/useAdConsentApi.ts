import { useMutation } from "@tanstack/react-query";
import type { AdConsentRequest } from "@nexa-chess/types";
import { sendAdConsent } from "../api/adConsentApi";

/** Records the banner's answer on the visit; a failure never blocks the page (the cookie still holds it). */
export function useAdConsentMutation() {
  return useMutation({ mutationFn: (body: AdConsentRequest) => sendAdConsent(body) });
}
