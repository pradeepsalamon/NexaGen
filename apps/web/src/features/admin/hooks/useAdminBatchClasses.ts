import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getBatchClasses, getBatchClassDetails } from "../api/adminBatchClassesApi";

export function useAdminBatchClassesQuery() {
  return useQuery({
    queryKey: [...queryKeys.admin.base, "batch-classes"],
    queryFn: getBatchClasses
  });
}

export function useAdminBatchClassDetailsQuery(classId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: [...queryKeys.admin.base, "batch-class", classId],
    queryFn: () => getBatchClassDetails(classId),
    enabled
  });
}
