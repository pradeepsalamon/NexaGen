import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { ListParams } from "@/lib/pagination";
import { getBatchClasses, getBatchClassDetails } from "../api/adminBatchClassesApi";

export function useAdminBatchClassesQuery(params: ListParams = {}) {
  return useQuery({
    queryKey: [...queryKeys.admin.base, "batch-classes", params],
    queryFn: () => getBatchClasses(params),
    placeholderData: keepPreviousData
  });
}

export function useAdminBatchClassDetailsQuery(classId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: [...queryKeys.admin.base, "batch-class", classId],
    queryFn: () => getBatchClassDetails(classId),
    enabled
  });
}
