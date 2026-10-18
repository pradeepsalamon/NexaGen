import { useMutation } from "@tanstack/react-query";
import type { CreateLeadRequest } from "@nexa-chess/types";
import { createLead, trackVisit } from "../api/leadPublicApi";

export function useCreateLeadMutation() {
  return useMutation({
    mutationFn: (body: CreateLeadRequest) => createLead(body)
  });
}

export function useTrackVisitMutation() {
  return useMutation({
    mutationFn: () => trackVisit({ url: window.location.href, referrer: document.referrer })
  });
}
