import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RetentionCategory, UpdateRetentionPolicyRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { listRetentionPolicies, previewRetention, updateRetentionPolicy } from "../api/retentionApi";

export function useRetentionPolicies() {
  return useQuery({ queryFn: listRetentionPolicies, queryKey: queryKeys.retention.policies });
}

/** What a draft window would delete. Off while the draft is invalid. */
export function useRetentionPreview(category: RetentionCategory | null, days: number | null) {
  return useQuery({
    enabled: !!category && days !== null,
    queryFn: () => previewRetention(category as RetentionCategory, days as number),
    queryKey: queryKeys.retention.preview(category ?? "", days ?? 0),
    staleTime: 30_000
  });
}

// undo: intentionally excluded — a settings Save, confirmed up front with a
// preview; nothing is deleted before the nightly sweep, so editing it back
// before then is the correction (lib/undo/README.md).
export function useUpdateRetentionPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, category }: { body: UpdateRetentionPolicyRequest; category: RetentionCategory }) =>
      updateRetentionPolicy(category, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.retention.all })
  });
}
