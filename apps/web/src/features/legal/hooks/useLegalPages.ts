"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LegalPageKind } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { getAdminLegalPages, getPublicLegalPage, updateAdminLegalPage } from "../api/legalApi";

/** The academy's own wording for one page, on its own address only. */
export const usePublicLegalPage = (kind: LegalPageKind, enabled: boolean) =>
  useQuery({
    enabled,
    queryFn: () => getPublicLegalPage(kind),
    queryKey: queryKeys.branding.legalPage(kind),
    staleTime: 5 * 60_000
  });

export const useAdminLegalPages = () => useQuery({ queryFn: getAdminLegalPages, queryKey: queryKeys.branding.legalPages });

export function useUpdateLegalPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ body, kind }: { body: string; kind: LegalPageKind }) => updateAdminLegalPage(kind, { body }),
    onError: (error: Error) => toast.error({ message: error.message, title: "Page not saved" }),
    onSuccess: (data, { body, kind }) => {
      queryClient.setQueryData(queryKeys.branding.legalPages, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.branding.legalPage(kind) });
      toast.success({ title: body.trim() === "" ? "Back to the built-in text" : "Page saved" });
    }
  });
}
